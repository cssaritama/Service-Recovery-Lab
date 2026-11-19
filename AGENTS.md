# Service Recovery Lab — working instructions

Service Recovery Lab is a full-stack reservation service with a bounded
operational recovery responder: a Cloudflare Worker API, a React UI and a D1
database. This file is the entry point for everyone who works in this
repository, people and coding agents alike.

## Start here

1. [README.md](README.md): what the project is and how to run it.
2. [Product specification](docs/product-spec.md): behaviors and acceptance
   scenarios. It is written before domain code changes.
3. `package.json`: the commands below.

Then follow links only as far as the task needs:

| Topic | Document |
| --- | --- |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| Team roles, hand-offs and human gates | [docs/agent-team.md](docs/agent-team.md) |
| Testing | [docs/testing.md](docs/testing.md) |
| Operations and the runtime responder | [docs/operations.md](docs/operations.md) |
| Deployment | [docs/deployment.md](docs/deployment.md) |
| Decisions | [docs/decisions/](docs/decisions/) |

Do not read `archive/`, `past_version/`, `node_modules/`, `.next/` or
`.wrangler/`.

## Where to write

Source and documentation live in `app/`, `config/`, `db/`, `docs/`, `lib/`,
`tests/`, `worker/` and `scripts/`. Do not commit operational logs.

## Rules

1. **Preserve the invariants:** session isolation, cookie authorization,
   idempotency, bounded recovery and telemetry redaction.
2. **Respect the responder's limits:** it may repair only the two supported
   workspace-scoped configuration faults. Never weaken validation, grant
   access, change customer records or execute model-generated code.
3. **Scope:** a controlled laboratory with synthetic data, not a production
   backup or ransomware-assurance product. No external targets, personal data
   or real purchases.
4. **Measurements are real:** latency, recovery windows and SLA thresholds come
   from genuine measurements, never from tautological mock assertions.
   Timestamps, currency cents and latencies keep consistent units.
5. **Tests are isolated:** test runners ignore `archive/`, `past_version/`,
   `node_modules/` and `.wrangler/`, and local runs match CI exactly.
6. **No secrets:** never commit API keys, Cloudflare secrets or credentials.

## Verify

```bash
npm test
npm run lint
npm run typecheck
```
