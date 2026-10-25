# Agent work log

This log records what each agent session actually did and verified. Entries are not rewritten after the fact. Corrections are added as new entries. Task IDs refer to [`public/tracker.json`](../public/tracker.json).

---

## 2026-10-24 → 2026-10-25 — Topic research and selection (Product agent, session A)

The owner provided the course rubric and the public portfolio (`github.com/cssaritama`) and asked for a project distinct from existing portfolio work.

The agent researched and compared about fifteen candidate topics, including invoice exception resolution, heat-shelter access planning, AI-agent action control, IT-asset reuse, packaging data quality and public-procurement review. Several were rejected because established products already cover them or because data access was not realistic in the time available. The research notes stayed in the owner's planning workspace and are not part of this repository.

The owner delegated the final choice. The agent selected **business-service recovery with journey-level evidence** because it exercises every rubric area (alerting, on-call agent, CI/CD and rollback) as part of the product itself rather than as add-ons.

## 2026-10-25 — SRL-01 / SRL-02 (Product → Implementation agent, session A)

The agent read the course rubric, created the frontend starter, and wrote `docs/product-spec.md` and the tracker acceptance criteria **before** domain implementation.

Read: `AGENTS.md`, `docs/product-spec.md`, `public/tracker.json`. SRL-01 was marked done and SRL-02 moved to in progress.

Environment notes:
- Dependency setup found Node.js 24 without npm on PATH; this was repaired.
- Docker was not available on the owner's machine.
- No application tests had run at this point.

## 2026-10-25 — SRL-02 → SRL-05 (Implementation and Verification agent, session A)

*This entry was reconstructed by the review session below from file timestamps and generated artifacts, because the implementation session ended before updating this log.*

- **Implemented:** domain rules (`lib/recovery/domain.ts`), repository with revision compare-and-swap (`repository.ts`), API (`api.ts`), on-call responder (`agent.ts`), the D1 migration, and the UI views: workspace, telemetry, evidence, `/guide` and `/tracker`.
- **Tests written:** 9 unit, 13 integration and 4 browser tests, plus the smoke, benchmark and demo-capture scripts.
- **Delivery files:** `Dockerfile`, `compose.yaml`, and the CI, development-deploy, production-promotion and rollback workflows.
- **Generated on the owner's Windows laptop:**
  - `evidence/performance.json` (09:18 UTC, 48/48 bookings)
  - `evidence/example-recovery.json` (status `recovered`, verification 201/422/persisted)
  - `evidence/browser-console.json` (zero page errors)
  - `evidence/local-demo.webm` and `docs/screenshots/*.png`
- The session ended before the README was rewritten, before the modular docs referenced by `AGENTS.md` existed, and before tracker statuses were updated.

## 2026-10-25 — Independent review, SRL-05 verification, SRL-06/07 documentation (Verification and Delivery agent, session B)

A different agent and tool, with no access to the implementer's context, reviewed the repository from a clean checkout. It re-read `AGENTS.md`, `docs/product-spec.md` and `public/tracker.json` first.

**Verification commands and results** (Linux, Node 22, Chromium):

| Command | Result |
|---|---|
| `tsc --noEmit` | passed (after restoring the hosting manifest, see below) |
| `node --test tests/domain.test.mjs tests/integration.test.mjs` | **22/22 passed** |
| `vinext build` | passed |
| `playwright test` | 3/4 at first → **4/4 after fix** |
| `npm test` (one command) | exit 0 |
| `node scripts/local.mjs` + `BASE_URL=http://127.0.0.1:3000 node scripts/smoke.mjs` | health, booking, alert, verified recovery, existing reservation preserved |
| `eslint .` | 3 errors + 1 warning → clean |
| `docker compose up --build` | **not verified here**: the review environment blocks Docker Hub. It is left to the CI `container` job. |

**Defects found and fixed**

1. *Mobile navigation overflow.* The three nav buttons used `white-space: nowrap`. With wider system fonts, the page measured 399 px on a 390 px viewport (test *mobile layout…* failed). The buttons now share the row (`flex: 1 1 0; min-width: 0; white-space: normal`) in `app/globals.css`.
2. *Build configuration missing from the handoff.* The hosting manifest (the D1 binding declaration read by `vite.config.ts`) had been excluded from the archive. It was restored.
3. *Lint.* Internal links were changed to `next/link`. The polling effect's intentional dependency list is now annotated.
4. *Documentation gaps.* The README was still the starter template, and `AGENTS.md` linked to four documents that did not exist.

**Added:** `README.md` (rewritten), `docs/architecture.md`, `docs/agent-team.md`, `docs/testing.md`, `docs/operations.md`, `docs/deployment.md`, `docs/rubric-evidence.md`, `scripts/sync-tracker-issues.mjs`, `LICENSE`, `.nvmrc`, GitHub issue and PR templates.

**Tracker updates:**
- SRL-02, SRL-03, SRL-04 and SRL-05 → **done**. Each criterion is backed by a passing test or artifact listed in the task's `evidence` field.
- SRL-06 stays **in progress** until the first green CI run, including the container job.
- SRL-07 stays **in progress** until a public URL exists. That deployment needs the owner's Cloudflare account.

**Owner actions remaining:**
1. Push to GitHub and confirm the *Quality gate* run.
2. Run `node scripts/sync-tracker-issues.mjs`.
3. Configure the Cloudflare environments (`docs/deployment.md`) and add the live URL to the README.
4. Complete the three required peer reviews.

## 2026-10-25 — SRL-06 container failure and template cleanup (Verification and Delivery agent, session B)

**Trigger:** the first GitHub run of *Quality gate* (commit `2766dae`). The `verify` job passed (tests). The `container` job failed at `docker compose up --wait`.

**Root cause.** In the runtime stage, `WORKDIR /app` creates `/app` owned by root. `COPY --chown=node:node` changes only the copied contents, not `/app` itself. At startup the app runs as the `node` user and needs to create a directory in `/app`. That fails with `EACCES: permission denied, mkdir '/app/.sites-runtime/wrangler'`, so the container exits immediately.

**How it was reproduced:** in a locally built runtime image (Docker Hub is not reachable from the review environment). The image runs as `node` with a named volume, exactly like `compose.yaml`.

**Fix:** `chown node:node /app /app/data` in the `Dockerfile`.

**Verification:** without the fix the container exits with the error above. With it, the container is *healthy*, `scripts/smoke.mjs` passes (booking, alert, verified recovery, reservation preserved) and the data survives `docker restart`.

**Template cleanup.** The project had been scaffolded from a hosted-site starter. Its unused parts were removed after confirming that nothing imported them:
- 61 UI components, a sign-in helper, connector preview plumbing, a hosting manifest, a vendored Vite plugin, package-manager installer scripts, an example app and an unused `db/index.ts`.
- 20 unused dependencies (690 → 509 installed packages).

`vite.config.ts` and `worker/index.ts` now contain only the Cloudflare D1 binding and the API routing. This supersedes the earlier restoration of the hosting manifest, which is no longer needed.

**Deployment guard.** `deploy-development.yml` now runs only when the repository variable `DEPLOY_ENABLED` is `true`. Until the owner configures Cloudflare, CI stays green instead of failing on missing credentials.

**Checks after the changes:** `npm test` exit 0 (22/22 unit + integration, 4/4 browser), `tsc` clean, ESLint clean.

SRL-06 stays **in progress** until the container job is green on GitHub.

## 2026-10-25 — Owner-requested improvements: readability, AI adviser, OpenTelemetry, positioning (Delivery agent, session B)

**Owner request:**
- make the code read as maintained source;
- give the on-call agent a real language model in the public demo;
- strengthen observability with an industry standard;
- reposition the README for executive readers.

**Changes and verification:**

1. **Prettier** is the single code style, with `format:check` and `lint` enforced in CI. No behaviour change; the full suite passed.
2. **Workers AI adviser** (`lib/recovery/advisers.ts`). The cloud deployment binds `AI` and asks `@cf/meta/llama-3.1-8b-instruct` for a second opinion on three booleans. Outputs are parsed into one allowlisted action, and any disagreement, malformed output or timeout escalates. The timeline records the model and its proposal.
   - 7 tests in `tests/advisers.test.mjs`, end-to-end paths included.
   - `wrangler deploy --dry-run` confirmed the `env.AI` binding.
   - Not verified here: a live Workers AI call. It needs the owner's Cloudflare account.
3. **OpenTelemetry** (`lib/recovery/otel.ts`): OTLP/JSON spans, logs and metrics with exemplars, `/api/telemetry/otlp`, optional live export, and `compose.observability.yaml` with Grafana LGTM.
   - 4 tests in `tests/otel.test.mjs`, including a real HTTP collector.
   - Checked against workerd: 6 requests produced 6 traces, 6 logs and 6 metrics.
   - Not verified here: pulling `grafana/otel-lgtm`, because Docker Hub is blocked in this environment.
4. **README** rewritten around the executive questions, the operating principles and the human-led agent model. The course context moved to a reviewer section.

**Result:** `npm test` exit 0 (33/33 and 4/4), Prettier and ESLint clean.
