import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { database } from './sqlite-adapter.mjs';
import { handleApi } from '../lib/recovery/api.ts';
import { toOtlp, parseHeaders, exportAttempt } from '../lib/recovery/otel.ts';

const trace = {
  traceId: 'a'.repeat(32),
  spanId: 'b'.repeat(16),
  at: 1_800_000_000_000,
  durationMs: 2.5,
  span: 'reservation.journey',
  status: 503,
  log: {
    event: 'reservation.completed',
    component: 'reservation-service',
    outcome: 'catalog_unavailable',
  },
  metric: {
    name: 'reservation_journey_total',
    value: 1,
    journey: 'synthetic_probe',
    outcome: 'unavailable',
  },
};

test('OTLP encoding: span, log and metric exemplar share the same trace and span IDs', () => {
  const otlp = toOtlp({ id: 'ws-1', traces: [trace] }, [trace], 'development');
  const span = otlp.traces.resourceSpans[0].scopeSpans[0].spans[0];
  const log = otlp.logs.resourceLogs[0].scopeLogs[0].logRecords[0];
  const metric = otlp.metrics.resourceMetrics[0].scopeMetrics[0].metrics[0];
  const point = metric.sum.dataPoints[0];
  assert.match(span.traceId, /^[0-9a-f]{32}$/);
  assert.match(span.spanId, /^[0-9a-f]{16}$/);
  assert.equal(log.traceId, span.traceId);
  assert.equal(log.spanId, span.spanId);
  assert.equal(point.exemplars[0].traceId, span.traceId);
  assert.equal(span.kind, 2);
  assert.deepEqual(span.status, { code: 2, message: 'catalog_unavailable' });
  assert.equal(log.severityText, 'ERROR');
  assert.equal(span.endTimeUnixNano, '1800000000000000000');
  assert.equal(BigInt(span.endTimeUnixNano) - BigInt(span.startTimeUnixNano), 2_500_000n);
  assert.equal(metric.name, 'reservation_journey_total');
  assert.equal(metric.sum.isMonotonic, true);
  const service = otlp.traces.resourceSpans[0].resource.attributes.find(
    a => a.key === 'service.name',
  );
  assert.equal(service.value.stringValue, 'service-recovery-lab');
});

test('OTLP header list parsing follows the OTEL_EXPORTER_OTLP_HEADERS convention', () => {
  assert.deepEqual(parseHeaders('Authorization=Basic%20abc,x-scope=lab'), {
    Authorization: 'Basic abc',
    'x-scope': 'lab',
  });
  assert.deepEqual(parseHeaders(''), {});
});

test('export is skipped without an endpoint and never throws when the collector is down', async () => {
  let calls = 0;
  await exportAttempt({}, { id: 'ws', traces: [trace] }, trace, async () => calls++);
  assert.equal(calls, 0);
  await exportAttempt(
    { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector.invalid' },
    { id: 'ws', traces: [trace] },
    trace,
    async () => {
      throw new Error('down');
    },
  );
});

test('each booking is pushed to an OTLP/HTTP collector as traces, logs and metrics without payloads', async t => {
  const received = [];
  const collector = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
    res.writeHead(200).end('{}');
  });
  await new Promise(r => collector.listen(0, '127.0.0.1', r));
  const storage = database(),
    pending = [];
  t.after(async () => {
    storage.close();
    await new Promise(r => collector.close(r));
  });
  const env = {
    DB: storage.db,
    OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${collector.address().port}/`,
    OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=Bearer%20lab-token',
  };
  const ctx = { waitUntil: p => pending.push(p) };
  const call = (path, cookie, body) =>
    handleApi(
      new Request(`http://localhost${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'content-type': 'application/json',
          cookie,
          'idempotency-key': crypto.randomUUID(),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env,
      ctx,
    );
  const cookie = (await call('/api/session', '', {})).headers.get('set-cookie').split(';')[0];
  const booking = await call('/api/reservations', cookie, {
    slotId: 'morning',
    privateNote: 'DO_NOT_EXPORT',
  });
  const { traceId } = await booking.json();
  await Promise.all(pending.splice(0));
  assert.deepEqual(received.map(r => r.path).sort(), ['/v1/logs', '/v1/metrics', '/v1/traces']);
  assert.ok(received.every(r => r.auth === 'Bearer lab-token'));
  const spans = received.find(r => r.path === '/v1/traces').body.resourceSpans[0].scopeSpans[0]
    .spans;
  assert.equal(spans[0].traceId, traceId);
  const sent = JSON.stringify(received.map(r => r.body));
  assert.ok(!sent.includes('DO_NOT_EXPORT'));
  assert.ok(!sent.includes(cookie.split('=')[1]));

  const download = await call('/api/telemetry/otlp', cookie);
  assert.equal(download.status, 200);
  const otlp = await download.json();
  assert.equal(otlp.format, 'otlp-json');
  assert.equal(otlp.traces.resourceSpans[0].scopeSpans[0].spans[0].traceId, traceId);
  assert.equal((await call('/api/telemetry/otlp', '')).status, 401);
});
