# Reviewer guide: evaluation criteria and evidence

This guide maps every criterion of the [AI Dev Tools Zoomcamp final project](https://github.com/DataTalksClub/ai-dev-tools-zoomcamp/tree/main/project) to concrete files, commands and tests, so each claim can be checked in a few minutes.

| # | Criterion (max) | Evidence | How to verify |
|---|---|---|---|
| 1 | **Problem description** (2) | [README §1–3](../README.md#1-the-problem): problem, solution, expected behaviour, five-minute experiment | Read the README |
| 2 | **Product specification** (2) | [product-spec.md](product-spec.md) (written before domain code; 10 behaviours, 21 acceptance scenarios). Public tracker: [`public/tracker.json`](../public/tracker.json), rendered at `/tracker`, mirrored to GitHub Issues. Agent use of the tracker: [agent-work-log.md](agent-work-log.md). | Open `/tracker` in the app or the repository *Issues* tab; compare the task IDs cited in the work log |
| 3 | **Agent team specification** (2) | [agent-team.md](agent-team.md): roles, responsibilities, inputs and outputs, done criteria, hand-off diagram, human gates, plus the runtime responder | Read the doc |
| 4 | **Context management** (2) | [AGENTS.md](../AGENTS.md) describes the project and links to modular docs: spec, architecture, team and process, testing, operations, deployment | Follow the links from `AGENTS.md` |
| 5 | **Application** (2) | React UI → Worker API → D1 database. Data persists across reloads and restarts. | `npm ci && npm run local` → book → reload; or `docker compose up --build` |
| 6 | **Testing** (2) | 9 unit + 7 model-adviser + 4 OpenTelemetry + 13 integration (real SQLite and a real HTTP collector) + 4 Playwright browser tests | `npm test` (one command); see [testing.md](testing.md) |
| 7 | **Containerization** (2) | [Dockerfile](../Dockerfile) (multi-stage, non-root, health check) and [compose.yaml](../compose.yaml) (app + persistent database volume) | `docker compose up --build`; the CI `container` job runs it on every push |
| 8 | **Deployment** (2) | Cloudflare Workers + D1; public URL in the README; deployment runs in GitHub Actions | Open the *Live demo* URL; see the *Environments* section of the repository |
| 9 | **CI/CD** (3) | [ci.yml](../.github/workflows/ci.yml): tests on every PR. [deploy-development.yml](../.github/workflows/deploy-development.yml): automatic CD to dev. [deploy-production.yml](../.github/workflows/deploy-production.yml): **manual** production promotion. [rollback.yml](../.github/workflows/rollback.yml) | *Actions* tab |
| 10 | **Observability** (2) | One trace ID shared by span, structured log and metric. Exported as **OpenTelemetry OTLP** and viewable in **Grafana** (Tempo, Loki, Prometheus) via `compose.observability.yaml`, as well as in the in-app *Journey telemetry* view and Cloudflare Workers Logs. Payloads and credentials are excluded (tested). | `docker compose -f compose.yaml -f compose.observability.yaml up --build` → Grafana at :3001; UI → *Journey telemetry*; `tests/otel.test.mjs` |
| 11 | **Alerting on user impact** (1) | `ReservationJourneyUnavailable`: three consecutive 5xx booking attempts; 4xx excluded ([operations.md](operations.md#alert-reservationjourneyunavailable)) | Run a drill; unit test *alert requires three consecutive server failures…* |
| 12 | **On-call agent** (2) | [`lib/recovery/agent.ts`](../lib/recovery/agent.ts): wakes on the alert, diagnoses (with a Workers AI second opinion in the cloud), applies an allowlisted repair and verifies through the live API | Run the guided drill and watch the timeline reach *Recovery independently checked*; integration tests *alert invokes responder…* |

**Maximum: 24 points.** Scoring is the reviewers' decision. Peer review of three other projects is a separate course requirement.

## Fast path for reviewers (≈ 5 minutes)

```bash
git clone <this repository> && cd service-recovery-lab
docker compose up --build            # or: npm ci && npm run local
# open http://localhost:3000 → Reserve appointment → Run guided recovery drill
npm ci && npx playwright install chromium && npm test
```
