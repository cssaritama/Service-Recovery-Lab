# Agent work log

This log records what each agent session actually did and verified. Entries are not rewritten after the fact. Corrections are added as new entries. Task IDs refer to [`public/tracker.json`](../public/tracker.json).

---

## 2026-10-24 → 2026-10-25 — Topic research and selection (Product agent, Codex)

The owner provided the course rubric and the public portfolio (`github.com/cssaritama`) and asked for a project distinct from existing portfolio work.

The agent researched and compared about fifteen candidate topics, including invoice exception resolution, heat-shelter access planning, AI-agent action control, IT-asset reuse, packaging data quality and public-procurement review. Several were rejected because established products already cover them or because data access was not realistic in the time available. The research notes stayed in the owner's planning workspace and are not part of this repository.

The owner delegated the final choice. The agent selected **business-service recovery with journey-level evidence** because it exercises every rubric area (alerting, on-call agent, CI/CD and rollback) as part of the product itself rather than as add-ons.

## 2026-10-25 — SRL-01 / SRL-02 (Product → Implementation agent, Codex)

The agent read the course rubric, created the frontend starter, and wrote `docs/product-spec.md` and the tracker acceptance criteria **before** domain implementation.

Read: `AGENTS.md`, `docs/product-spec.md`, `public/tracker.json`. SRL-01 was marked done and SRL-02 moved to in progress.

Environment notes:
- Dependency setup found Node.js 24 without npm on PATH; this was repaired.
- Docker was not available on the owner's machine.
- No application tests had run at this point.

## 2026-10-25 — SRL-02 → SRL-05 (Implementation and Verification agent, Codex)

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

## 2026-10-25 — Independent review, SRL-05 verification, SRL-06/07 documentation (Verification and Delivery agent, Claude)

A different agent and tool, with no access to the implementer's context, reviewed the repository from a clean checkout. It re-read `AGENTS.md`, `docs/product-spec.md` and `public/tracker.json` first.

**Verification commands and results** (Linux, Node 22, Chromium):

| Command | Result |
|---|---|
| `tsc --noEmit` | passed (after restoring `.openai/hosting.json`, see below) |
| `node --test tests/domain.test.mjs tests/integration.test.mjs` | **22/22 passed** |
| `vinext build` | passed |
| `playwright test` | 3/4 at first → **4/4 after fix** |
| `npm test` (one command) | exit 0 |
| `node scripts/local.mjs` + `BASE_URL=http://127.0.0.1:3000 node scripts/smoke.mjs` | health, booking, alert, verified recovery, existing reservation preserved |
| `eslint .` | 3 errors + 1 warning → clean |
| `docker compose up --build` | **not verified here**: the review environment blocks Docker Hub. It is left to the CI `container` job. |

**Defects found and fixed**

1. *Mobile navigation overflow.* The three nav buttons used `white-space: nowrap`. With wider system fonts, the page measured 399 px on a 390 px viewport (test *mobile layout…* failed). The buttons now share the row (`flex: 1 1 0; min-width: 0; white-space: normal`) in `app/globals.css`.
2. *Build configuration missing from the handoff.* `.openai/hosting.json` (the D1 binding declaration read by `vite.config.ts`) had been excluded from the archive. It was restored with `{"d1": "DB", "r2": null}`.
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
