import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database } from './sqlite-adapter.mjs';
import { handleApi } from '../lib/recovery/api.ts';
import {
  modelText,
  parseAction,
  selectAdvisor,
  workersAiAdvisor,
  ollamaAdvisor,
} from '../lib/recovery/advisers.ts';

const observation = { catalogAvailable: false, adapterReady: true, unknownDependency: false };

test('adviser output is reduced to exactly one allowlisted action', () => {
  assert.equal(parseAction('{"action":"restore_catalog"}'), 'restore_catalog');
  assert.equal(parseAction('Sure! {"action": "resume_adapter"} is best.'), 'resume_adapter');
  assert.equal(parseAction('I would escalate this.'), 'escalate');
  for (const bad of [
    '',
    'rm -rf /',
    '{"action":"drop_table"}',
    'restore_catalog or escalate',
    null,
  ])
    assert.throws(() => parseAction(bad), /adviser_output_invalid/);
});

test('Workers AI adviser sends only the three booleans and parses the answer', async () => {
  const calls = [];
  const ai = {
    async run(model, input) {
      calls.push({ model, input });
      return { response: '{"action":"restore_catalog"}' };
    },
  };
  const advise = workersAiAdvisor(ai, '@cf/test/model');
  assert.equal(await advise(observation), 'restore_catalog');
  assert.equal(advise.label, 'Workers AI @cf/test/model');
  assert.equal(calls[0].model, '@cf/test/model');
  assert.deepEqual(JSON.parse(calls[0].input.messages[1].content), observation);
  assert.equal(calls[0].input.temperature, 0);
});

test('a slow or malformed model answer is rejected', async () => {
  const slow = workersAiAdvisor({ run: () => new Promise(() => {}) }, 'm', 20);
  await assert.rejects(slow(observation), /adviser_timeout/);
  const chatty = workersAiAdvisor(
    { run: async () => ({ response: 'run this shell script' }) },
    'm',
  );
  await assert.rejects(chatty(observation), /adviser_output_invalid/);
});

test('adviser selection: Workers AI, then Ollama, then deterministic policy only', () => {
  const ai = { run: async () => ({}) };
  assert.equal(
    selectAdvisor({ AI: ai, OLLAMA_URL: 'http://x' }).label,
    'Workers AI @cf/meta/llama-3.3-70b-instruct-fp8-fast',
  );
  assert.equal(selectAdvisor({ AI: ai, WORKERS_AI_MODEL: '@cf/x/y' }).label, 'Workers AI @cf/x/y');
  assert.equal(selectAdvisor({ OLLAMA_URL: 'http://x' }).label, 'Ollama qwen2.5:0.5b');
  assert.equal(selectAdvisor({}), undefined);
  assert.equal(ollamaAdvisor('http://x', 'llama3').label, 'Ollama llama3');
});

async function drill(ai, fault = 'catalog_unavailable') {
  const storage = database(),
    pending = [];
  const env = { DB: storage.db, AI: ai },
    ctx = { waitUntil: p => pending.push(p) };
  const call = (path, cookie, body = {}) =>
    handleApi(
      new Request(`http://localhost${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      }),
      env,
      ctx,
    );
  const cookie = (await call('/api/session', '')).headers.get('set-cookie').split(';')[0];
  await call('/api/reservations', cookie, { slotId: 'morning' });
  await call('/api/drills', cookie, { kind: fault });
  for (let n = 0; n < 3; n++) await call('/api/probe', cookie);
  while (pending.length) await Promise.all(pending.splice(0));
  const state = await (
    await handleApi(
      new Request('http://localhost/api/workspace', { headers: { cookie } }),
      env,
      ctx,
    )
  ).json();
  storage.close();
  return state;
}

test('alert → Workers AI agrees with the policy → verified recovery, reasoner recorded', async () => {
  const state = await drill({ run: async () => ({ response: '{"action":"restore_catalog"}' }) });
  assert.equal(state.incident.status, 'recovered');
  const diagnosis = state.incident.steps.find(s => s.phase === 'Diagnose');
  assert.match(
    diagnosis.detail,
    /Workers AI @cf\/meta\/llama-3\.3-70b-instruct-fp8-fast proposed restore_catalog; policy selected restore_catalog/,
  );
  assert.equal(state.reservations.filter(r => !r.probe).length, 1);
});

test('alert → Workers AI proposes a different repair → escalation, no change', async () => {
  const state = await drill({ run: async () => ({ response: '{"action":"resume_adapter"}' }) });
  assert.equal(state.incident.status, 'escalated');
  assert.equal(state.config.catalog, 'catalog-missing');
  assert.equal(state.metrics.recoveries, 0);
});

test('alert → Workers AI unavailable → escalation instead of guessing', async () => {
  const state = await drill({
    run: async () => {
      throw new Error('quota exceeded');
    },
  });
  assert.equal(state.incident.status, 'escalated');
  assert.match(
    state.incident.steps.find(s => s.phase === 'Diagnose').detail,
    /proposed no valid answer \(model_unavailable\)/,
  );
});

test('model answers are read from both Workers AI response shapes', async () => {
  assert.equal(modelText({ response: 'a' }), 'a');
  assert.equal(
    modelText({ choices: [{ message: { content: 'b', reasoning_content: 'c' } }] }),
    'b',
  );
  const advise = workersAiAdvisor(
    {
      run: async () => ({
        choices: [
          {
            message: {
              content: '{"action":"resume_adapter"}',
              reasoning_content: 'restore_catalog or escalate?',
            },
          },
        ],
      }),
    },
    'm',
  );
  assert.equal(await advise(observation), 'resume_adapter');
  const timed = workersAiAdvisor({ run: () => new Promise(() => {}) }, 'm', 20);
  await assert.rejects(timed(observation), /adviser_timeout/);
});

test('JSON mode is requested, reasoning is ignored, and unsupported JSON mode falls back', async () => {
  assert.equal(
    parseAction('<think>restore_catalog or escalate?</think>{"action":"escalate"}'),
    'escalate',
  );
  assert.equal(
    parseAction('Considering "action": "resume_adapter"... final: {"action":"restore_catalog"}'),
    'restore_catalog',
  );
  assert.equal(parseAction({ action: 'resume_adapter' }), 'resume_adapter');
  const inputs = [];
  const strict = workersAiAdvisor(
    {
      run: async (_, input) => {
        inputs.push(input);
        return { response: { action: 'restore_catalog' } };
      },
    },
    'm',
  );
  assert.equal(await strict(observation), 'restore_catalog');
  assert.equal(inputs[0].response_format.type, 'json_schema');
  assert.deepEqual(inputs[0].response_format.json_schema.properties.action.enum, [
    'restore_catalog',
    'resume_adapter',
    'escalate',
  ]);
  let calls = 0;
  const fallback = workersAiAdvisor(
    {
      run: async (_, input) => {
        calls++;
        if (input.response_format) throw new Error('JSON Mode not supported');
        return { response: '{"action":"resume_adapter"}' };
      },
    },
    'm',
  );
  assert.equal(await fallback(observation), 'resume_adapter');
  assert.equal(calls, 2);
});
