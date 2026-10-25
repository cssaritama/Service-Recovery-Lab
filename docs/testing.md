# Testing

## One command

```bash
npm ci
npx playwright install chromium     # first run only (CI uses --with-deps)
npm test
```

`npm test` ([`scripts/test.mjs`](../scripts/test.mjs)) runs four stages in order and exits non-zero on the first failure:

1. **Typecheck:** `tsc --noEmit`
2. **Unit, adviser, OpenTelemetry and integration:** Node.js built-in test runner (33 tests). Results go to stdout and to `test-results/unit-integration.xml` (JUnit).
3. **Production build:** `vinext build`
4. **Browser tests:** Playwright starts the production build on port 4317 against an isolated test database. Results go to `test-results/browser.xml` and `playwright-report/`.

Individual stages: `npm run typecheck`, `npm run test:core`, `npm run test:browser`.

## Test inventory

### Unit tests: `tests/domain.test.mjs` (9)
Pure domain rules, no I/O.

| Test | Guarantees |
|---|---|
| reservations consume exactly one slot and retries preserve identity | Idempotent replay returns the same reservation; same key with a different slot → 409 |
| capacity cannot be exceeded | Fourth booking of a 3-seat slot → `slot_full` |
| malformed inputs fail without mutation | `null`, `{}`, arrays, unknown or non-string slot, short keys → 422 and no record |
| supported fault diagnoses are explicit and existing bookings survive | Each fault maps to its repair; existing bookings remain |
| unknown failures escalate and active incidents cannot be overwritten | `unknown_dependency` → escalate; a second drill during an incident → 409; unsupported drill → 422 |
| alert requires three consecutive server failures, not validation failures | Four 422s do not alert; two 503s do not alert; the third 503 alerts and records the trace ID |
| successful attempts reset the failure streak; telemetry is bounded | Streak reset; at most 120 traces kept |
| manual restore is never counted as agent recovery | Status `cancelled`, recoveries = 0 |
| probe inventory is separate and bounded | Probes never reduce customer capacity; budget of 80 |

### Model-adviser tests: `tests/advisers.test.mjs` (7)

| Test | Guarantees |
|---|---|
| adviser output is reduced to exactly one allowlisted action | JSON, prose and ambiguous outputs; shell-like or unknown actions are rejected |
| Workers AI adviser sends only the three booleans and parses the answer | Prompt contents, model ID, temperature 0 |
| a slow or malformed model answer is rejected | Timeout and invalid output |
| adviser selection | Workers AI → Ollama → deterministic policy only |
| alert → Workers AI agrees → verified recovery, reasoner recorded | End-to-end through the API with a stub AI binding |
| alert → Workers AI proposes a different repair → escalation | No configuration change, recoveries = 0 |
| alert → Workers AI unavailable → escalation | Quota or outage never leads to guessing |

### OpenTelemetry tests: `tests/otel.test.mjs` (4)

| Test | Guarantees |
|---|---|
| span, log and metric exemplar share the same trace and span IDs | OTLP field formats (32- and 16-hex IDs, nanosecond strings, span kind, status, severity) |
| header list parsing | `OTEL_EXPORTER_OTLP_HEADERS` convention |
| export skipped without endpoint, never throws when the collector is down | Best-effort export |
| each booking is pushed to an OTLP/HTTP collector without payloads | A real HTTP collector receives `/v1/traces`, `/v1/logs` and `/v1/metrics` with auth headers; no payload or cookie leaks; `/api/telemetry/otlp` download requires a session |

### Integration tests: `tests/integration.test.mjs` (13)
These run the real API handler against a **real SQLite database** created from the production migration (`tests/sqlite-adapter.mjs`), plus one test over a real HTTP server.

| Test | Guarantees |
|---|---|
| session cookies protect isolated persistent workspaces | Separate data per cookie; a workspace ID in the URL grants nothing; absent or forged cookie → 401; cross-origin POST → 403 |
| concurrent API reservations never oversell or duplicate an idempotency key | 8 parallel bookings for 3 seats → exactly 3 succeed; 6 parallel requests with the same key → one record |
| alert invokes responder and verifies recovery (catalog, adapter) | Health stays 200 during the fault; 3 × 503 → alert → agent → verification `{201, 422, persisted}`; original booking kept; one repair step only |
| unknown failure escalates without repair; owner can restore | No mutation by the agent; manual restore → `cancelled` |
| telemetry correlates signals and excludes credentials and payload fields | The response trace ID equals the header and the stored trace; a planted secret, the cookie and `token_hash` never appear in the export |
| database survives closing and reopening with the same migration | Persistence across restart |
| invalid payloads and oversized bodies fail predictably | 422, 400 for malformed JSON, 413 over 4 KB |
| actual HTTP boundary supports cookies, booking and reload | Real `node:http` server round-trip |
| failed verification never reports recovered | Verification failure → escalated, recoveries = 0 |
| adviser disagreement cannot authorize a different repair | An LLM proposal that contradicts observed state → escalate, no change |
| stale agent action cannot overwrite an owner restore | Revision check protects operator actions |
| concurrent responder invocations claim a single repair | Exactly one repair step |

### Frontend / end-to-end tests: `tests/browser/journeys.spec.ts` (4)
Chromium against the production build.

| Test | Covers |
|---|---|
| a visitor books, refreshes, recovers and inspects correlated evidence | Full journey through the UI, persistence after reload, guided drill to *Recovery independently checked*, trace drill-down showing span, log and metric, evidence API, no page errors |
| unsupported faults require review and manual restore | Escalation path in the UI |
| two browser contexts cannot affect each other | A fault in one session; booking still succeeds in the other |
| mobile layout, keyboard entry and public project pages | 390 px with no horizontal scroll, skip link focus, `/tracker` (7 tasks), `/guide` |

### Deployment smoke test: `scripts/smoke.mjs`
Run by CI against the container and by every deployment and rollback workflow against the public URL:

```bash
BASE_URL=https://<your-worker>.workers.dev node scripts/smoke.mjs
```

It checks health, books, injects a fault, asserts three 503s, waits for the agent, and asserts `recovered` with the original booking intact.

## Latest recorded results

| Date | Environment | Result |
|---|---|---|
| 2026-10-25 | Owner's Windows 11 laptop, Node 24 (implementation session) | Production-build walkthrough (`scripts/capture-demo.mjs`) completed with a verified recovery and zero page errors. It produced the screenshots, video, `evidence/example-recovery.json`, `evidence/browser-console.json` and `evidence/performance.json`. |
| 2026-10-25 | Clean Linux checkout, Node 22, Chromium (independent verification session) | Typecheck passed · **22/22** unit + integration · build passed · **4/4** browser · smoke test passed against `npm run local` · ESLint clean |

After the agent and telemetry additions: **33/33** unit, adviser, OpenTelemetry and integration tests and **4/4** browser tests passed; Prettier and ESLint were clean. Live OTLP export was checked against the real runtime: the six requests of the smoke test produced six traces, six logs and six metrics at a local collector.

A second run on the same day covered the container. After the runtime-permission fix, the runtime image started as a non-root user with a persistent volume, became *healthy*, passed the smoke test and survived a restart.

The independent run found one real defect: horizontal overflow of the mobile navigation on narrow screens with wider system fonts. It was fixed in `app/globals.css`, and the mobile test now passes on both platforms. See [agent-work-log.md](agent-work-log.md).
