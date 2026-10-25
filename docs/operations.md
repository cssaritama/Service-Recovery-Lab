# Operations: observability, alerting, on-call agent and rollback

## Service level indicator

**SLI — visitor booking success:** successful bookings divided by valid booking attempts, with synthetic probes excluded. It is shown as *Visitor booking success* in the UI.

Validation rejections (4xx) are excluded from both numerator and denominator because they are not service failures. `/api/health` is intentionally **not** an SLI. It reports process health only and stays green during journey failures, which demonstrates why health checks are insufficient.

## Telemetry

Every call to `/api/reservations` or `/api/probe` produces three signals that share one `traceId`:

| Signal | Shape | Example |
|---|---|---|
| Span | `span: reservation.journey`, `spanId`, `durationMs`, `status` | `status: 503, durationMs: 2.4` |
| Structured log | `event: reservation.completed`, `component: reservation-service`, `outcome` | `outcome: catalog_unavailable` |
| Metric | `reservation_journey_total`, `value: 1`, labels `journey` (`visitor_booking` / `synthetic_probe`) and `outcome` (`success` / `unavailable` / `rejected`) | — |

How the signals flow:

- **Collected and stored** per workspace in the database (the last 120), with aggregate counters in `metrics`.
- **Viewable** in the UI under *Journey telemetry*. The trace table links to a detail view showing the span, log and metric for one trace ID. The same data is included in the evidence export.
- **Also emitted** as one-line JSON to stdout (`console.log`) with `trace_id`. In the cloud these appear in **Cloudflare Workers Logs** (observability is enabled in the generated Worker config). Filter by `trace_id` in the dashboard. Errors emit `api.error` with `trace_id` and a code, never a stack trace or payload.
- **Returned to the client** in the `x-trace-id` header and the JSON body, so a user-reported problem can be traced.
- **OpenTelemetry.** `lib/recovery/otel.ts` encodes the same signals as OTLP/JSON:
  - a `SERVER` span with status;
  - a log record with severity, `traceId` and `spanId`;
  - a monotonic `reservation_journey_total` sum, whose data point carries a trace exemplar.

  `GET /api/telemetry/otlp` downloads them (the *OpenTelemetry (OTLP)* link in the telemetry view). With `OTEL_EXPORTER_OTLP_ENDPOINT` set, each attempt is also pushed live to `/v1/traces`, `/v1/logs` and `/v1/metrics`, with optional `OTEL_EXPORTER_OTLP_HEADERS`. Export is best-effort and never affects the request.

### Viewing telemetry in Grafana (local)

```bash
docker compose -f compose.yaml -f compose.observability.yaml up --build
```

This adds `grafana/otel-lgtm` (OpenTelemetry collector, Tempo, Loki, Prometheus and Grafana).

1. Book and run a drill at <http://localhost:3000>.
2. Open Grafana at <http://localhost:3001> → *Explore*.
3. Find the data:
   - **Tempo:** search `service.name = service-recovery-lab` for spans.
   - **Loki:** `{service_name="service-recovery-lab"}` for logs.
   - **Prometheus:** `reservation_journey_total` for the metric.
4. A span's trace ID matches the one shown in the app.

**Redaction rules:** telemetry never contains request bodies, cookies, session tokens, token hashes or raw exceptions. This is asserted by an integration test.

## Alert: `ReservationJourneyUnavailable`

| Field | Value |
|---|---|
| Condition | Three **consecutive** reservation attempts (visitor or probe) return HTTP 5xx in a workspace with an open incident |
| Excluded | 4xx validation errors; any success resets the streak |
| Severity | Page. Customers cannot complete the critical journey. |
| Action | Incident → `alerted`, the triggering trace ID is recorded, the on-call responder is invoked |
| Implementation | `recordAttempt()` in [`lib/recovery/domain.ts`](../lib/recovery/domain.ts) |

**Trigger it on purpose:** in the UI, choose a scenario and click *Run guided recovery drill* (or *Inject fault only*, then book three times). From the command line, use `scripts/smoke.mjs`, which does exactly this.

## On-call agent runbook

The responder runs automatically after the alert (`ctx.waitUntil`). Its timeline appears in *Recovery timeline*.

| Phase | Tool | What happens | Failure mode |
|---|---|---|---|
| Observe | `read_service_state` | Claims the incident with a unique run ID; reads configuration and the alert | A second invocation finds the incident already claimed and exits |
| Diagnose | `select_allowlisted_repair` | Maps observed state to `restore_catalog`, `resume_adapter` or `escalate` | Unknown state → escalate |
| Repair | `restore_catalog` / `resume_adapter` | Revision-checked update of the configuration only | Revision changed (for example by the operator) → escalate, no write |
| Verify | `exercise_reservation_api` | Positive probe through the real API → 201 persisted; negative probe → 422 | Any mismatch → escalate. *Recovered* is never claimed. |

### When the agent escalates
1. Read the timeline: the `Escalate` step states why (unsupported state, changed state or failed verification).
2. Open *Journey telemetry* and inspect the failing trace IDs.
3. Fix the cause. In the lab, click **Restore manually**, which restores the known-good configuration.
4. The incident closes as **cancelled**, which keeps operator actions distinct from autonomous recoveries in the evidence and the metrics.

### Model adviser (Workers AI or Ollama)

The agent can ask a language model for a **second opinion** before repairing. Which adviser runs:

| Where | Adviser | How it is enabled |
|---|---|---|
| Cloud (`development`, `production`) | Cloudflare **Workers AI**, `@cf/meta/llama-3.3-70b-instruct-fp8-fast` by default, in JSON mode (free daily allocation) | Automatic: `scripts/cloud-prepare.mjs` adds the `AI` binding. Set the repository variable `ENABLE_WORKERS_AI=false` to turn it off, or `WORKERS_AI_MODEL` to choose another model. |
| Local or Docker | **Ollama** | Set `OLLAMA_URL` (and optionally `OLLAMA_MODEL`, default `qwen2.5:0.5b`) |
| Neither configured | None: the deterministic policy decides alone | — |

How the second opinion works:
- The model receives **only three booleans**: catalog available, adapter ready, unknown dependency. It never sees customer data.
- Its free-form answer is reduced to exactly one allowlisted action (`lib/recovery/advisers.ts`). Anything else counts as *no valid answer*.
- If the answer matches the policy diagnosis, the repair proceeds. If it differs, is malformed or exceeds the timeout (15 s for Workers AI, 20 s for Ollama), the agent **escalates** to the operator.
- The *Diagnose* step in the timeline records the model and its proposal. Example: `Reasoner: model-advised (Workers AI @cf/meta/llama-3.3-70b-instruct-fp8-fast proposed restore_catalog; policy selected restore_catalog)`.

The model can never widen the agent's authority.

## Rollback

Use rollback when a deployment passes CI but misbehaves in an environment.

1. Find the last good version:
   ```bash
   npx wrangler deployments list --name <worker-name>
   ```
   Or open Cloudflare dashboard → Workers → your worker → Deployments.
2. GitHub → **Actions → Roll back a deployment → Run workflow**. Choose `development` or `production` and paste the version ID (a 36-character UUID).
3. The workflow validates the ID, runs `wrangler rollback`, then runs the smoke test against `DEPLOYMENT_URL`. A failed smoke test fails the run.

Database migrations are additive. A Worker rollback does not drop data.

## Capacity and abuse limits (public demo)

| Limit | Value | Response |
|---|---|---|
| Workspaces | 1,000 concurrent, 24 h expiry | 429 `demo_workspace_limit` |
| Drills per workspace | 12 | 429 `drill_budget_exhausted` |
| Probe bookings per workspace | 80 | 429 `probe_budget_exhausted` |
| Request body | 4 KB | 413 |
| Workspace document | 240 KB | 429 |
| Telemetry kept | Last 120 traces | Oldest are dropped |
