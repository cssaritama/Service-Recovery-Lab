# Deployment guide (Cloudflare free tier + GitHub Actions)

The pipeline deploys the same Worker to two environments:

| Environment | Trigger | Gate |
|---|---|---|
| `development` | Automatic, after the *Quality gate* workflow passes on a push to `main` | Tests (unit, integration, browser, container smoke) |
| `production` | **Manual:** *Actions → Promote production manually → Run workflow* | GitHub environment protection (required reviewer) and a full re-test |

Rollback for either environment: *Actions → Roll back a deployment* (see [operations.md](operations.md#rollback)).

Everything below uses free plans. Nothing requires a credit card.

## 1. Cloudflare account and databases (≈ 5 min)

1. Create a free account at <https://dash.cloudflare.com/sign-up>.
2. Note your **Account ID**: dashboard → *Workers & Pages* → right sidebar.
3. Create one D1 database per environment. You can do this in the dashboard (*Storage & Databases → D1 → Create*) or locally:
   ```bash
   npx wrangler login
   npx wrangler d1 create service-recovery-lab-dev-db
   npx wrangler d1 create service-recovery-lab-db
   ```
   Copy each `database_id` (UUID).
4. Create an **API token**: *My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"* template. Add the permissions **Account → D1 → Edit** and **Account → Workers AI → Read**, then copy the token.

## 2. GitHub environments (≈ 5 min)

Repository → *Settings → Environments*. Create two environments: `development` and `production`.

For **each** environment, add:

| Type | Name | Development value | Production value |
|---|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | API token from step 1.4 | Same token |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Account ID | Account ID |
| Variable | `CLOUDFLARE_D1_DATABASE_ID` | Dev database UUID | Prod database UUID |
| Variable | `CLOUDFLARE_WORKER_NAME` | `service-recovery-lab-dev` | `service-recovery-lab` |
| Variable | `DEPLOYMENT_URL` | `https://service-recovery-lab-dev.<subdomain>.workers.dev` | `https://service-recovery-lab.<subdomain>.workers.dev` |

Optional repository or environment variables:

| Name | Effect |
|---|---|
| `ENABLE_WORKERS_AI` | `false` deploys without the Workers AI adviser (it is on by default) |
| `WORKERS_AI_MODEL` | Another Workers AI text model ID |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Push telemetry live to an OTLP/HTTP backend, for example Grafana Cloud's free tier |
| Secret `OTEL_EXPORTER_OTLP_HEADERS` | Authentication headers for that backend, stored as a Worker secret |

Your `<subdomain>` is shown under *Workers & Pages → Overview* (it is your `*.workers.dev` subdomain).

Finally, under *Settings → Secrets and variables → Actions → Variables* (repository level), add `DEPLOY_ENABLED` = `true`. Until this variable exists, the development deployment is skipped instead of failing, so CI stays green before the cloud is configured.

On the **production** environment, enable **Required reviewers** and add yourself. This makes the production promotion an explicit human approval.

The worker name in `CLOUDFLARE_WORKER_NAME` must be lowercase letters, digits and hyphens, 3–63 characters (it is validated by `scripts/cloud-prepare.mjs`).

## 3. First deployment

1. Push to `main`. *Quality gate* runs. When it passes, *Deploy development* starts automatically: build → `cloud:prepare` → D1 migrations → `wrangler deploy` → smoke test against `DEPLOYMENT_URL`.
2. Open the development URL and run the five-minute experiment from the README.
3. Promote: *Actions → Promote production manually → Run workflow* → approve. It runs the full test suite, migrates the production database, deploys and smoke-tests.
4. Put the production URL in the README (*Live demo*) and in the repository *About* box.

## 4. Verify and capture evidence

```bash
BASE_URL=https://service-recovery-lab.<subdomain>.workers.dev node scripts/smoke.mjs
BASE_URL=https://service-recovery-lab.<subdomain>.workers.dev node scripts/capture-demo.mjs   # optional: refresh screenshots and video from the cloud
```

Links worth keeping for reviewers:
- The green workflow runs
- The `development` and `production` deployment entries in the repository sidebar
- Cloudflare *Workers Logs* filtered by a `trace_id`

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Set CLOUDFLARE_D1_DATABASE_ID for this environment.` | The variable is missing or is not a UUID in that GitHub environment |
| `Authentication error [code: 10000]` | The token lacks *Workers Scripts: Edit* or *D1: Edit* |
| Smoke test `Process health failed` | `DEPLOYMENT_URL` is wrong, or it is the first deploy and the `workers.dev` route is still propagating. Re-run the job after a minute. |
| Deploy development did not start | It only runs after *Quality gate* succeeds on a **push** to `main` (not on pull requests), and only when the repository variable `DEPLOY_ENABLED` is `true` |
