# 0005 — OpenTelemetry as the telemetry and evidence standard

**Status:** Accepted · **Date:** 2026-10-25

## Context
Incident evidence must be:
- correlated (one request across signals);
- portable to whatever observability platform an organisation runs;
- free of personal data.

## Decision
Each journey attempt produces a span, a log record and a metric data point with a trace exemplar, all sharing one trace ID. They are encoded as OTLP/JSON. Signals are stored per workspace, downloadable from `/api/telemetry/otlp` and optionally pushed live to any OTLP/HTTP collector. Grafana LGTM is bundled for local use.

## Alternatives considered
- **OpenTelemetry JS SDK.** Its exporters target Node.js and do not run on Workers.
- **Vendor-specific SDKs.** These create lock-in.
- **Logs only.** Signals cannot be correlated to one request.

## Consequences
The evidence is vendor-neutral and machine-readable. The hand-written encoder is small and fully tested, and it would move to the SDK if Workers support matures.
