import {
  reserve,
  recordAttempt,
  startDrill,
  manualRestore,
  availability,
  serviceFault,
  traceId,
  uuid,
} from './domain.ts';
import { Repository, RepoError, hashToken, newToken, type Database } from './repository.ts';
import { respond } from './agent.ts';
import { selectAdvisor, type WorkersAI } from './advisers.ts';
import { exportAttempt, toOtlp } from './otel.ts';
export interface Environment {
  DB: Database;
  AI?: WorkersAI;
  WORKERS_AI_MODEL?: string;
  OLLAMA_URL?: string;
  OLLAMA_MODEL?: string;
  BUILD_REVISION?: string;
  DEPLOYMENT_STAGE?: string;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
}
export interface Context {
  waitUntil(promise: Promise<unknown>): void;
}
const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  });
async function parse(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new RepoError(415, 'json_required');
  if (Number(request.headers.get('content-length') || 0) > 4096)
    throw new RepoError(413, 'request_too_large');
  const text = await request.text();
  if (text.length > 4096) throw new RepoError(413, 'request_too_large');
  try {
    return JSON.parse(text);
  } catch {
    throw new RepoError(400, 'invalid_json');
  }
}
export async function handleApi(
  request: Request,
  env: Environment,
  ctx: Context,
): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname,
    tid = traceId();
  try {
    if (request.method !== 'GET' && request.method !== 'POST')
      return reply({ error: 'method_not_allowed' }, 405);
    if (request.method === 'GET' && path === '/api/health')
      return reply({
        status: 'ok',
        service: 'service-recovery-lab',
        revision: env.BUILD_REVISION || 'development',
        scope: 'process-health; not a reservation journey check',
      });
    if (request.method === 'POST') {
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return reply({ error: 'origin_not_allowed' }, 403);
      if (request.headers.get('sec-fetch-site') === 'cross-site')
        return reply({ error: 'origin_not_allowed' }, 403);
    }
    if (!env.DB) throw new RepoError(503, 'database_unavailable');
    const repo = new Repository(env.DB);
    const token = request.headers
      .get('cookie')
      ?.match(/(?:^|;\s*)srl_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    const current = token ? await repo.byToken(await hashToken(token)) : null;
    if (path === '/api/session' && request.method === 'POST') {
      await parse(request);
      if (current) return reply({ workspaceId: current.id });
      const raw = newToken();
      const s = await repo.create(await hashToken(raw));
      return reply({ workspaceId: s.id }, 201, {
        'set-cookie': `srl_session=${raw}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${url.protocol === 'https:' ? '; Secure' : ''}`,
      });
    }
    if (!current) return reply({ error: 'workspace_required' }, 401);
    if (request.method === 'GET' && (path === '/api/workspace' || path === '/api/evidence')) {
      const s = await repo.read(current.id);
      const snapshot = { ...s, slots: availability(s), serviceAvailable: !serviceFault(s) };
      return reply(
        path === '/api/evidence'
          ? {
              format: 'service-recovery-evidence/v1',
              exportedAt: new Date().toISOString(),
              dataClassification: 'synthetic',
              scope:
                'one authenticated workspace; controlled lab evidence, not production resilience',
              ...snapshot,
            }
          : snapshot,
        200,
        path === '/api/evidence'
          ? { 'content-disposition': 'attachment; filename="recovery-evidence.json"' }
          : {},
      );
    }
    if (request.method === 'GET' && path === '/api/telemetry/otlp') {
      const s = await repo.read(current.id);
      return reply(
        {
          format: 'otlp-json',
          note: 'POST each section to <collector>/v1/traces, /v1/logs and /v1/metrics',
          ...toOtlp(s, s.traces, env.DEPLOYMENT_STAGE || 'local'),
        },
        200,
        { 'content-disposition': 'attachment; filename="journey-telemetry.otlp.json"' },
      );
    }
    if (request.method !== 'POST') return reply({ error: 'not_found' }, 404);
    const body = await parse(request);
    if (path === '/api/drills') {
      const { result } = await repo.mutate(current.id, s => startDrill(s, body?.kind));
      return reply(result, result.status);
    }
    if (path === '/api/restore') {
      const { result } = await repo.mutate(current.id, manualRestore);
      return reply(result, result.status);
    }
    if (path === '/api/reservations' || path === '/api/probe') {
      const probe = path === '/api/probe',
        started = performance.now();
      const key = request.headers.get('idempotency-key') || '';
      const { result } = await repo.mutate(current.id, s =>
        reserve(s, probe ? { slotId: 'probe' } : body, key, probe),
      );
      const { state } = await repo.mutate(current.id, s =>
        recordAttempt(s, result, probe, tid, performance.now() - started),
      );
      const attempt = state.traces.at(-1);
      if (attempt?.traceId === tid && env.OTEL_EXPORTER_OTLP_ENDPOINT)
        ctx.waitUntil(exportAttempt(env, state, attempt).catch(() => {}));
      console.log(
        JSON.stringify({
          event: 'reservation.completed',
          trace_id: tid,
          status: result.status,
          outcome: result.code,
          journey: probe ? 'synthetic_probe' : 'visitor_booking',
        }),
      );
      if (state.incident?.status === 'alerted') {
        const advisor = selectAdvisor(env);
        ctx.waitUntil(
          respond(
            repo,
            current.id,
            async negative => {
              const verified = await handleApi(
                new Request(new URL(negative ? '/api/reservations' : '/api/probe', url), {
                  method: 'POST',
                  headers: {
                    cookie: request.headers.get('cookie') || '',
                    'content-type': 'application/json',
                    'idempotency-key': `agent_${uuid()}`,
                  },
                  body: JSON.stringify(negative ? { slotId: 'invalid-slot' } : {}),
                }),
                env,
                ctx,
              );
              const data = (await verified.json()) as { reservation?: { id: string } };
              return { status: verified.status, reservationId: data.reservation?.id };
            },
            advisor,
          ).catch(async () => {
            await repo
              .mutate(current.id, s => {
                if (
                  s.incident &&
                  ['alerted', 'diagnosing', 'verifying'].includes(s.incident.status)
                ) {
                  s.incident.status = 'escalated';
                  s.incident.completedAt = Date.now();
                  s.incident.steps.push({
                    at: Date.now(),
                    phase: 'Escalate',
                    tool: 'agent_error',
                    outcome: 'failed',
                    detail: 'Responder could not complete. Operator review required.',
                  });
                }
              })
              .catch(() => {});
          }),
        );
      }
      return reply({ ...result, traceId: tid }, result.status, { 'x-trace-id': tid });
    }
    return reply({ error: 'not_found' }, 404);
  } catch (error) {
    const known = error instanceof RepoError;
    console.error(
      JSON.stringify({
        event: 'api.error',
        trace_id: tid,
        code: known ? error.code : 'internal_error',
      }),
    );
    return reply(
      { error: known ? error.code : 'internal_error', traceId: tid },
      known ? error.status : 500,
      { 'x-trace-id': tid },
    );
  }
}
