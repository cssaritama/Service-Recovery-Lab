import vinext from 'vinext';
import { defineConfig } from 'vite';
import { configureToolEnvironment } from './scripts/tool-environment.mjs';

// Local D1 binding. Cloud environments receive real database IDs from
// scripts/cloud-prepare.mjs at deploy time.
const LOCAL_DATABASE_ID = '00000000-0000-4000-8000-000000000000';

export default defineConfig(async () => {
  configureToolEnvironment(process.cwd());
  // Wrangler reads its log and registry paths when the plugin is imported,
  // so the import happens after the environment is configured.
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        inspectorPort: false,
        config: {
          main: './worker/index.ts',
          compatibility_flags: ['nodejs_compat'],
          d1_databases: [
            {
              binding: 'DB',
              database_name: 'service-recovery-lab-local',
              database_id: LOCAL_DATABASE_ID,
            },
          ],
        },
      }),
    ],
  };
});
