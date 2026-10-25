import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createState,
  reserve,
  startDrill,
  recordAttempt,
  manualRestore,
  availability,
} from '../lib/recovery/domain.ts';
import { diagnose } from '../lib/recovery/agent.ts';
test('reservations consume exactly one slot and retries preserve identity', () => {
  const s = createState();
  const first = reserve(s, { slotId: 'morning' }, 'request_0001');
  assert.equal(first.status, 201);
  assert.equal(availability(s)[0].remaining, 2);
  const repeat = reserve(s, { slotId: 'morning' }, 'request_0001');
  assert.equal(repeat.status, 200);
  assert.equal(repeat.reservation.id, first.reservation.id);
  assert.equal(s.reservations.length, 1);
  assert.equal(reserve(s, { slotId: 'midday' }, 'request_0001').status, 409);
});
test('capacity cannot be exceeded', () => {
  const s = createState();
  for (let n = 0; n < 3; n++)
    assert.equal(reserve(s, { slotId: 'morning' }, `request_${n}`).status, 201);
  assert.equal(reserve(s, { slotId: 'morning' }, 'request_4').code, 'slot_full');
});
test('malformed inputs fail without mutation', () => {
  const s = createState();
  for (const body of [null, {}, [], { slotId: 'unknown' }, { slotId: 42 }])
    assert.equal(reserve(s, body, 'request_1234').status, 422);
  assert.equal(reserve(s, { slotId: 'morning' }, 'short').status, 422);
  assert.equal(s.reservations.length, 0);
});
test('supported fault diagnoses are explicit and existing bookings survive', () => {
  for (const [fault, action] of [
    ['catalog_unavailable', 'restore_catalog'],
    ['adapter_paused', 'resume_adapter'],
  ]) {
    const s = createState();
    reserve(s, { slotId: 'morning' }, 'existing_001');
    assert.equal(startDrill(s, fault).status, 201);
    assert.equal(diagnose(s), action);
    assert.equal(reserve(s, { slotId: 'morning' }, 'new_one_001').status, 503);
    assert.equal(s.reservations.length, 1);
  }
});
test('unknown failures escalate and active incidents cannot be overwritten', () => {
  const s = createState();
  startDrill(s, 'unknown_dependency');
  assert.equal(diagnose(s), 'escalate');
  assert.equal(startDrill(s, 'adapter_paused').status, 409);
  assert.equal(startDrill(s, 'execute_shell').status, 422);
});
test('alert requires three consecutive server failures, not validation failures', () => {
  const s = createState();
  startDrill(s, 'adapter_paused');
  for (let n = 0; n < 4; n++)
    recordAttempt(s, { status: 422, code: 'invalid_slot' }, false, `invalid${n}`, 1);
  assert.equal(s.incident.status, 'detecting');
  for (let n = 0; n < 2; n++)
    recordAttempt(s, { status: 503, code: 'adapter_paused' }, true, `failed${n}`, 1);
  assert.equal(s.incident.status, 'detecting');
  recordAttempt(s, { status: 503, code: 'adapter_paused' }, true, 'trigger-trace', 1);
  assert.equal(s.incident.status, 'alerted');
  assert.equal(s.incident.traceId, 'trigger-trace');
});
test('successful attempts reset the failure streak; telemetry is bounded', () => {
  const s = createState();
  for (let n = 0; n < 140; n++)
    recordAttempt(s, { status: 503, code: 'unavailable' }, true, `trace${n}`, 1);
  assert.equal(s.traces.length, 120);
  recordAttempt(s, { status: 201, code: 'confirmed' }, false, 'success', 1);
  assert.equal(s.failureStreak, 0);
  assert.equal(s.metrics.probeBad, 140);
  assert.equal(s.metrics.customerGood, 1);
});
test('manual restore is never counted as agent recovery', () => {
  const s = createState();
  reserve(s, { slotId: 'morning' }, 'book_001');
  startDrill(s, 'unknown_dependency');
  manualRestore(s);
  assert.equal(s.incident.status, 'cancelled');
  assert.equal(s.metrics.recoveries, 0);
  assert.equal(s.reservations.length, 1);
});
test('probe inventory is separate and bounded', () => {
  const s = createState();
  for (let n = 0; n < 80; n++)
    assert.equal(reserve(s, { slotId: 'probe' }, `probe_${n}xx`, true).status, 201);
  assert.equal(reserve(s, { slotId: 'probe' }, 'probe_last', true).status, 429);
  assert.equal(availability(s)[0].remaining, 3);
});
