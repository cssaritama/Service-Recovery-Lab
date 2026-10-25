import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database } from './sqlite-adapter.mjs';
import { handleApi } from '../lib/recovery/api.ts';
import {
  executiveReport,
  RECOVERY_TIME_OBJECTIVE_MS,
  EVIDENCE_THRESHOLD,
} from '../lib/recovery/report.ts';

const incident = (kind, status, ms, alertMs = 300) => ({
  id: crypto.randomUUID(),
  kind,
  status,
  openedAt: 1000,
  alertedAt: 1000 + alertMs,
  completedAt: 1000 + ms,
  configRevision: 1,
  steps: [],
});
const state = (history, current = null, metrics = {}) => ({
  history,
  incident: current,
  reservations: [
    { id: 'r1', probe: false },
    { id: 'p1', probe: true },
  ],
  metrics: {
    customerGood: 9,
    customerBad: 1,
    probeGood: 0,
    probeBad: 0,
    rejected: 0,
    recoveries: 0,
    ...metrics,
  },
});

test('headline measures: objective attainment, autonomy rate and customer impact', () => {
  const r = executiveReport(
    state([
      incident('catalog_unavailable', 'recovered', 1200),
      incident('adapter_paused', 'recovered', 2000),
      incident('unknown_dependency', 'escalated', 500),
      incident('unknown_dependency', 'cancelled', 900),
    ]),
  );
  assert.equal(r.headline.incidents, 4);
  assert.equal(r.headline.autonomousRecoveries, 2);
  assert.equal(r.headline.escalatedToHumans, 1);
  assert.equal(r.headline.operatorRestores, 1);
  assert.equal(
    r.headline.autonomyRate,
    2 / 3,
    'operator restores are excluded from the autonomy rate',
  );
  assert.equal(r.headline.objectiveAttainment, 1);
  assert.equal(r.headline.medianTimeToVerifiedRecoveryMs, 1600);
  assert.equal(r.headline.medianTimeToDetectMs, 300);
  assert.equal(r.customerImpact.journeySuccessRate, 0.9);
  assert.equal(r.customerImpact.reservationsPreserved, 1);
  assert.equal(r.dataClassification, 'synthetic');
});

test('autonomy is recommended only with enough verified evidence within the objective', () => {
  const enough = Array.from({ length: EVIDENCE_THRESHOLD }, () =>
    incident('catalog_unavailable', 'recovered', 1500),
  );
  const c = executiveReport(state(enough)).faultClasses[0];
  assert.equal(c.recommendation, 'expand_autonomy');
  const few = executiveReport(state(enough.slice(1))).faultClasses[0];
  assert.equal(few.recommendation, 'gather_evidence');
  const slow = executiveReport(
    state([
      ...enough.slice(1),
      incident('catalog_unavailable', 'recovered', RECOVERY_TIME_OBJECTIVE_MS + 1),
    ]),
  );
  assert.equal(slow.faultClasses[0].recommendation, 'keep_human_review');
  assert.equal(slow.headline.objectiveAttainment, 2 / 3);
  const escalated = executiveReport(
    state([...enough.slice(1), incident('catalog_unavailable', 'escalated', 400)]),
  );
  assert.equal(escalated.faultClasses[0].recommendation, 'keep_human_review');
});

test('an escalation stays an escalation even after an operator restores the service', () => {
  const escalatedThenRestored = {
    ...incident('unknown_dependency', 'cancelled', 900),
    steps: [
      {
        at: 1,
        phase: 'Escalate',
        tool: 'request_operator_review',
        outcome: 'no_mutation',
        detail: '',
      },
    ],
  };
  const r = executiveReport(
    state([incident('catalog_unavailable', 'recovered', 1200), escalatedThenRestored]),
  );
  assert.equal(r.headline.escalatedToHumans, 1);
  assert.equal(r.headline.operatorRestores, 1);
  assert.equal(r.headline.autonomyRate, 0.5);
});

test('unknown failures stay human-owned; open incidents and empty workspaces are handled', () => {
  const r = executiveReport(
    state(
      [incident('unknown_dependency', 'escalated', 400)],
      incident('adapter_paused', 'alerted', 0),
    ),
  );
  assert.equal(r.headline.incidents, 1, 'an open incident is not reported yet');
  assert.equal(r.faultClasses[0].recommendation, 'human_owned');
  assert.match(r.decisions[0], /operators/);
  const empty = executiveReport(state([]));
  assert.equal(empty.headline.autonomyRate, null);
  assert.deepEqual(empty.decisions, ['Run a recovery drill to generate the first evidence.']);
});

test('GET /api/report reflects a real verified recovery and requires a session', async t => {
  const storage = database(),
    pending = [];
  t.after(() => storage.close());
  const env = { DB: storage.db },
    ctx = { waitUntil: p => pending.push(p) };
  const call = (path, cookie, body) =>
    handleApi(
      new Request(`http://localhost${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'content-type': 'application/json',
          cookie,
          'idempotency-key': crypto.randomUUID(),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env,
      ctx,
    );
  assert.equal((await call('/api/report', '')).status, 401);
  const cookie = (await call('/api/session', '', {})).headers.get('set-cookie').split(';')[0];
  await call('/api/reservations', cookie, { slotId: 'morning' });
  await call('/api/drills', cookie, { kind: 'catalog_unavailable' });
  for (let n = 0; n < 3; n++) await call('/api/probe', cookie, {});
  while (pending.length) await Promise.all(pending.splice(0));
  const report = await (await call('/api/report', cookie)).json();
  assert.equal(report.headline.autonomousRecoveries, 1);
  assert.equal(report.headline.objectiveAttainment, 1);
  assert.equal(report.faultClasses[0].recommendation, 'gather_evidence');
  assert.equal(report.customerImpact.reservationsPreserved, 1);
});
