const base = process.env.BASE_URL;
if (!base) throw new Error('Set BASE_URL to the deployment being verified.');
const request = async (path, body, cookie) =>
  fetch(new URL(path, base), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      'idempotency-key': crypto.randomUUID(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
const health = await request('/api/health');
if (!health.ok) throw new Error('Process health failed');
const initial = await request('/api/session', {});
if (initial.status !== 201) throw new Error(`Workspace creation failed: ${initial.status}`);
const cookie = initial.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Session cookie absent');
const booked = await request('/api/reservations', { slotId: 'morning' }, cookie);
if (booked.status !== 201) throw new Error('Booking failed');
const saved = await booked.json();
const fault = await request('/api/drills', { kind: 'catalog_unavailable' }, cookie);
if (fault.status !== 201) throw new Error('Drill failed');
for (let n = 0; n < 3; n++)
  if ((await request('/api/probe', {}, cookie)).status !== 503)
    throw new Error('Fault did not affect journey');
let state;
for (let n = 0; n < 40; n++) {
  await new Promise(r => setTimeout(r, 500));
  const r = await request('/api/workspace', undefined, cookie);
  if (!r.ok) throw new Error('Workspace check failed');
  state = await r.json();
  if (['recovered', 'escalated'].includes(state.incident?.status)) break;
}
if (
  state?.incident?.status !== 'recovered' ||
  !state.reservations.some(r => r.id === saved.reservation.id)
)
  throw new Error('Recovery or record preservation failed');
console.log(
  JSON.stringify(
    {
      deployment: base,
      health: 'passed',
      booking: 'passed',
      alert: 'triggered',
      recovery: 'verified',
      existingReservation: 'preserved',
      verification: state.incident.verification,
    },
    null,
    2,
  ),
);
