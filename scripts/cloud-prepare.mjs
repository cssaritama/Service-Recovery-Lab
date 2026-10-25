import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const stage = process.argv[2];
if (!['development', 'production'].includes(stage))
  throw new Error('Use development or production.');
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID,
  workerName = process.env.CLOUDFLARE_WORKER_NAME;
if (!databaseId || !/^[a-f0-9-]{36}$/i.test(databaseId))
  throw new Error('Set CLOUDFLARE_D1_DATABASE_ID for this environment.');
if (!workerName || !/^[a-z0-9][a-z0-9-]{2,62}$/.test(workerName))
  throw new Error('Set a valid CLOUDFLARE_WORKER_NAME for this environment.');
const config = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8'));
config.name = workerName;
delete config.topLevelName;
config.workers_dev = true;
config.d1_databases = [
  {
    binding: 'DB',
    database_name: workerName + '-db',
    database_id: databaseId,
    migrations_dir: resolve('drizzle'),
    migrations_table: 'srl_migrations',
  },
];
config.vars = { BUILD_REVISION: process.env.GITHUB_SHA || 'manual', DEPLOYMENT_STAGE: stage };
// Workers AI gives the on-call agent a language-model second opinion on the free daily
// allocation. Set ENABLE_WORKERS_AI=false to deploy with the deterministic policy only.
if (process.env.ENABLE_WORKERS_AI !== 'false') {
  config.ai = { binding: 'AI' };
  if (process.env.WORKERS_AI_MODEL) config.vars.WORKERS_AI_MODEL = process.env.WORKERS_AI_MODEL;
}
const path = `dist/server/wrangler.${stage}.json`;
writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
console.log(`Prepared ${path}. Credentials remain in environment variables.`);
