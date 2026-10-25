import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results', { recursive: true });
for (const args of [
  ['node_modules/typescript/bin/tsc', '--noEmit'],
  [
    '--test',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=junit',
    '--test-reporter-destination=test-results/unit-integration.xml',
    'tests/domain.test.mjs',
    'tests/advisers.test.mjs',
    'tests/integration.test.mjs',
  ],
  ['node_modules/vinext/dist/cli.js', 'build'],
  ['node_modules/@playwright/test/cli.js', 'test'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
