# Service Recovery Lab: agent context

Service Recovery Lab is a full-stack reservation service (React UI → Cloudflare Worker API → D1/SQLite). It demonstrates journey-level recovery: a controlled fault breaks bookings, a user-impact alert fires, a bounded on-call agent repairs the fault and verifies recovery through the live API, and every step is exported as trace-correlated evidence.

## Read first

| When you are… | Read |
|---|---|
| Understanding why the product exists | [Strategy, value and roadmap](docs/strategy.md) |
| Changing any behaviour | [Product specification](docs/product-spec.md) |
| Touching code structure, API or data | [Architecture](docs/architecture.md) · [Decision records](docs/decisions/README.md) |
| Picking up or handing off work | [Agent team and process](docs/agent-team.md) · [Work log](docs/agent-work-log.md) · [Tracker](public/tracker.json) |
| Writing or running tests | [Testing](docs/testing.md) |
| Working on alerts, telemetry, the responder or rollback | [Operations](docs/operations.md) |
| Working on CI/CD or cloud environments | [Deployment](docs/deployment.md) |
| Reviewing the project end to end | [Reviewer guide](docs/reviewer-guide.md) |

## Working rules

- **Work from the tracker.** Each task has observable acceptance criteria. Move a task to `done` only when every criterion is verified, and list the evidence in the task's `evidence` field.
- **Log real work.** Record what you read, changed and verified in `docs/agent-work-log.md`, including failures. Never fabricate collaborators, successful checks, deployments or commercial outcomes.
- **Preserve the invariants:** session isolation, cookie authorisation, idempotency, bounded recovery and telemetry redaction.
- **Respect the responder's limits.** It may repair only the two supported workspace-scoped configuration faults. Never weaken validation, grant access, change customer records or execute model-generated code.
- **Scope.** This is a controlled laboratory with synthetic data, not a production backup or ransomware-assurance product. No external targets, personal data or real purchases.
- **Before a change,** identify the task and expected outcome. **After a change,** run `npm test` (or the relevant stage) and record the result.
- **Language.** All product copy and documentation are in English.
- **Keep out of commits and archives:** secrets, `.env*`, dependency folders, runtime databases (`.wrangler/`), caches and build output.

## Commands

```bash
npm ci                 # install
npm run local          # build, migrate, serve http://127.0.0.1:3000
npm test               # typecheck → unit + integration → build → browser
npm run lint
docker compose up --build
BASE_URL=<url> node scripts/smoke.mjs
```
