// Mirrors public/tracker.json to GitHub Issues so the task tracker is public on GitHub.
// Requires the GitHub CLI (`gh auth login`). Run from the repository root:
//   node scripts/sync-tracker-issues.mjs            # create or update issues
//   node scripts/sync-tracker-issues.mjs --dry-run  # print the plan only
// Idempotent: issues are matched by their "[SRL-0N]" title prefix.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dryRun = process.argv.includes('--dry-run');
const tracker = JSON.parse(readFileSync('public/tracker.json', 'utf8'));

function gh(args, input) {
  const result = spawnSync('gh', args, { encoding: 'utf8', input });
  if (result.status !== 0) throw new Error(`gh ${args.join(' ')} failed:\n${result.stderr}`);
  return result.stdout.trim();
}

const labels = [
  ['tracker', '0e8a16', 'Task from public/tracker.json'],
  ['status:done', '1d76db', 'Acceptance criteria met'],
  ['status:in_progress', 'fbca04', 'Work under way'],
  ['status:todo', 'cfd3d7', 'Not started'],
];
if (!dryRun)
  for (const [name, color, description] of labels) {
    spawnSync(
      'gh',
      ['label', 'create', name, '--color', color, '--description', description, '--force'],
      { stdio: 'ignore' },
    );
  }

const existing = dryRun
  ? []
  : JSON.parse(
      gh(['issue', 'list', '--state', 'all', '--limit', '200', '--json', 'number,title,state']),
    );

for (const task of tracker.tasks) {
  const title = `[${task.id}] ${task.title}`;
  const body = [
    `**Responsible role:** ${task.agent}`,
    '',
    '### Acceptance criteria',
    ...task.acceptance.map(a => `- [${task.status === 'done' ? 'x' : ' '}] ${a}`),
    ...(task.evidence?.length ? ['', '### Evidence', ...task.evidence.map(e => `- ${e}`)] : []),
    '',
    `_Source of truth: \`public/tracker.json\` (updated ${tracker.updated}). Work history: \`docs/agent-work-log.md\`._`,
  ].join('\n');
  const issue = existing.find(i => i.title.startsWith(`[${task.id}]`));
  const statusLabel = `status:${task.status}`;
  if (dryRun) {
    console.log(`${issue ? 'update' : 'create'} ${title} (${task.status})`);
    continue;
  }
  let number = issue?.number;
  if (!number) {
    const url = gh(
      [
        'issue',
        'create',
        '--title',
        title,
        '--body-file',
        '-',
        '--label',
        'tracker',
        '--label',
        statusLabel,
      ],
      body,
    );
    number = Number(url.split('/').pop());
    console.log(`created #${number} ${title}`);
  } else {
    gh(
      [
        'issue',
        'edit',
        String(number),
        '--title',
        title,
        '--body-file',
        '-',
        '--add-label',
        `tracker,${statusLabel}`,
        ...labels
          .filter(([n]) => n.startsWith('status:') && n !== statusLabel)
          .flatMap(([n]) => ['--remove-label', n]),
      ],
      body,
    );
    console.log(`updated #${number} ${title}`);
  }
  const state = issue?.state ?? 'OPEN';
  if (task.status === 'done' && state === 'OPEN')
    gh([
      'issue',
      'close',
      String(number),
      '--reason',
      'completed',
      '--comment',
      'Acceptance criteria met; see docs/agent-work-log.md.',
    ]);
  if (task.status !== 'done' && state === 'CLOSED') gh(['issue', 'reopen', String(number)]);
}
