// OpenTelemetry (OTLP/JSON) encoding of the reservation-journey signals.
// Spec: https://opentelemetry.io/docs/specs/otlp/ — field names follow the protobuf JSON mapping.
import type { State, Trace } from './domain.ts';

type AnyValue = { stringValue: string } | { intValue: string } | { boolValue: boolean };
type Attribute = { key: string; value: AnyValue };

const SERVICE = 'service-recovery-lab';
const SCOPE = { name: 'service-recovery-lab.reservation-journey', version: '1.0.0' };
const SPAN_KIND_SERVER = 2;
const STATUS_OK = 1;
const STATUS_ERROR = 2;
const SEVERITY = { INFO: 9, WARN: 13, ERROR: 17 } as const;
const AGGREGATION_DELTA = 1;

const attr = (key: string, value: string | number | boolean): Attribute => ({
  key,
  value:
    typeof value === 'number'
      ? { intValue: String(Math.trunc(value)) }
      : typeof value === 'boolean'
        ? { boolValue: value }
        : { stringValue: value },
});
const nanos = (ms: number) => (BigInt(Math.round(ms * 1000)) * BigInt(1000)).toString();

function resource(workspaceId: string, stage: string) {
  return {
    attributes: [
      attr('service.name', SERVICE),
      attr('deployment.environment.name', stage),
      // Workspace IDs are random identifiers of synthetic lab sessions, never personal data.
      attr('srl.workspace.id', workspaceId),
    ],
  };
}

function journeyAttributes(t: Trace): Attribute[] {
  return [
    attr('srl.journey', t.metric.journey),
    attr('srl.outcome', t.metric.outcome),
    attr('http.response.status_code', t.status),
  ];
}

/** Encodes retained journey traces as OTLP traces, logs and metrics that share trace IDs. */
export function toOtlp(state: Pick<State, 'id' | 'traces'>, traces: Trace[], stage = 'local') {
  const res = resource(state.id, stage);
  const spans = traces.map(t => ({
    traceId: t.traceId,
    spanId: t.spanId,
    name: t.span,
    kind: SPAN_KIND_SERVER,
    startTimeUnixNano: nanos(t.at - t.durationMs),
    endTimeUnixNano: nanos(t.at),
    attributes: journeyAttributes(t),
    status: t.status >= 500 ? { code: STATUS_ERROR, message: t.log.outcome } : { code: STATUS_OK },
  }));
  const logRecords = traces.map(t => ({
    timeUnixNano: nanos(t.at),
    observedTimeUnixNano: nanos(t.at),
    severityNumber:
      t.status >= 500 ? SEVERITY.ERROR : t.status >= 400 ? SEVERITY.WARN : SEVERITY.INFO,
    severityText: t.status >= 500 ? 'ERROR' : t.status >= 400 ? 'WARN' : 'INFO',
    body: { stringValue: t.log.event },
    attributes: [
      attr('event.name', t.log.event),
      attr('component', t.log.component),
      attr('srl.outcome.code', t.log.outcome),
      ...journeyAttributes(t),
    ],
    traceId: t.traceId,
    spanId: t.spanId,
  }));
  const dataPoints = traces.map(t => ({
    startTimeUnixNano: nanos(t.at - t.durationMs),
    timeUnixNano: nanos(t.at),
    asInt: String(t.metric.value),
    attributes: [attr('journey', t.metric.journey), attr('outcome', t.metric.outcome)],
    exemplars: [
      {
        timeUnixNano: nanos(t.at),
        asInt: String(t.metric.value),
        traceId: t.traceId,
        spanId: t.spanId,
      },
    ],
  }));
  return {
    traces: { resourceSpans: [{ resource: res, scopeSpans: [{ scope: SCOPE, spans }] }] },
    logs: { resourceLogs: [{ resource: res, scopeLogs: [{ scope: SCOPE, logRecords }] }] },
    metrics: {
      resourceMetrics: [
        {
          resource: res,
          scopeMetrics: [
            {
              scope: SCOPE,
              metrics: [
                {
                  name: 'reservation_journey_total',
                  description: 'Reservation journey attempts by journey and outcome',
                  unit: '{attempt}',
                  sum: { aggregationTemporality: AGGREGATION_DELTA, isMonotonic: true, dataPoints },
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

export interface OtlpSettings {
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
  DEPLOYMENT_STAGE?: string;
}

/** Parses the standard `key=value,key2=value2` header list (values may be URL-encoded). */
export function parseHeaders(raw = ''): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const index = pair.indexOf('=');
    if (index > 0)
      headers[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
  }
  return headers;
}

/**
 * Pushes one journey attempt to an OTLP/HTTP collector (for example Grafana, Honeycomb or an
 * OpenTelemetry Collector). Export is best-effort: failures never affect the customer request.
 */
export async function exportAttempt(
  settings: OtlpSettings,
  state: Pick<State, 'id' | 'traces'>,
  trace: Trace,
  fetcher: typeof fetch = fetch,
) {
  const endpoint = settings.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/+$/, '');
  if (!endpoint) return;
  const payload = toOtlp(state, [trace], settings.DEPLOYMENT_STAGE || 'local');
  const headers = {
    'content-type': 'application/json',
    ...parseHeaders(settings.OTEL_EXPORTER_OTLP_HEADERS),
  };
  await Promise.allSettled(
    (['traces', 'logs', 'metrics'] as const).map(signal =>
      fetcher(`${endpoint}/v1/${signal}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload[signal]),
        signal: AbortSignal.timeout(5000),
      }),
    ),
  );
}
