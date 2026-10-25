export type Fault = 'catalog_unavailable' | 'adapter_paused' | 'unknown_dependency';
export type IncidentStatus =
  | 'detecting'
  | 'alerted'
  | 'diagnosing'
  | 'verifying'
  | 'recovered'
  | 'escalated'
  | 'cancelled';
export interface Slot {
  id: string;
  label: string;
  time: string;
  capacity: number;
}
export interface Reservation {
  id: string;
  slotId: string;
  key: string;
  createdAt: number;
  probe: boolean;
}
export interface Step {
  at: number;
  phase: string;
  tool: string;
  outcome: string;
  detail: string;
}
export interface Incident {
  id: string;
  kind: Fault;
  status: IncidentStatus;
  openedAt: number;
  alertedAt?: number;
  completedAt?: number;
  traceId?: string;
  configRevision: number;
  runId?: string;
  steps: Step[];
  verification?: { positive: number; negative: number; persisted: boolean };
}
export interface Trace {
  traceId: string;
  spanId: string;
  at: number;
  durationMs: number;
  span: string;
  status: number;
  log: { event: string; component: string; outcome: string };
  metric: { name: string; value: number; journey: string; outcome: string };
}
export interface State {
  schemaVersion: 1;
  id: string;
  createdAt: number;
  config: { catalog: string; adapter: 'ready' | 'paused'; unknownFault: boolean; revision: number };
  slots: Slot[];
  reservations: Reservation[];
  incident: Incident | null;
  history: Incident[];
  traces: Trace[];
  failureStreak: number;
  metrics: {
    customerGood: number;
    customerBad: number;
    probeGood: number;
    probeBad: number;
    rejected: number;
    recoveries: number;
  };
}
export interface Result {
  status: number;
  code: string;
  reservation?: Reservation;
  replay?: boolean;
}
export const uuid = () => crypto.randomUUID();
export const traceId = () => uuid().replaceAll('-', '');
export function createState(id = uuid(), now = Date.now()): State {
  return {
    schemaVersion: 1,
    id,
    createdAt: now,
    config: { catalog: 'catalog-v1', adapter: 'ready', unknownFault: false, revision: 0 },
    slots: [
      { id: 'morning', label: 'Morning consultation', time: '09:00–10:00', capacity: 3 },
      { id: 'midday', label: 'Midday consultation', time: '12:00–13:00', capacity: 2 },
      { id: 'afternoon', label: 'Afternoon consultation', time: '15:00–16:00', capacity: 3 },
    ],
    reservations: [],
    incident: null,
    history: [],
    traces: [],
    failureStreak: 0,
    metrics: {
      customerGood: 0,
      customerBad: 0,
      probeGood: 0,
      probeBad: 0,
      rejected: 0,
      recoveries: 0,
    },
  };
}
export function serviceFault(s: State): string | null {
  if (s.config.unknownFault) return 'unknown_dependency';
  if (s.config.catalog !== 'catalog-v1') return 'catalog_unavailable';
  if (s.config.adapter !== 'ready') return 'adapter_paused';
  return null;
}
export function reserve(
  s: State,
  body: unknown,
  key: string,
  probe = false,
  now = Date.now(),
): Result {
  if (!body || typeof body !== 'object' || !/^[a-zA-Z0-9_-]{8,80}$/.test(key))
    return { status: 422, code: 'invalid_request' };
  const slotId = (body as { slotId?: unknown }).slotId;
  if (
    typeof slotId !== 'string' ||
    (!probe && !s.slots.some(slot => slot.id === slotId)) ||
    (probe && slotId !== 'probe')
  )
    return { status: 422, code: 'invalid_slot' };
  const previous = s.reservations.find(r => r.key === key);
  if (previous) {
    if (previous.slotId !== slotId || previous.probe !== probe)
      return { status: 409, code: 'idempotency_conflict' };
    return { status: 200, code: 'reservation_confirmed', reservation: previous, replay: true };
  }
  const fault = serviceFault(s);
  if (fault) return { status: 503, code: fault };
  if (!probe) {
    const slot = s.slots.find(slot => slot.id === slotId)!;
    if (s.reservations.filter(r => !r.probe && r.slotId === slotId).length >= slot.capacity)
      return { status: 409, code: 'slot_full' };
  } else if (s.reservations.filter(r => r.probe).length >= 80) {
    return { status: 429, code: 'probe_budget_exhausted' };
  }
  const reservation = { id: uuid(), slotId, key, createdAt: now, probe };
  s.reservations.push(reservation);
  return { status: 201, code: 'reservation_confirmed', reservation };
}
export function recordAttempt(
  s: State,
  result: Result,
  probe: boolean,
  trace: string,
  durationMs: number,
  now = Date.now(),
) {
  const good = result.status < 300,
    bad = result.status >= 500;
  if (good) {
    if (probe) s.metrics.probeGood++;
    else s.metrics.customerGood++;
    s.failureStreak = 0;
  } else if (bad) {
    if (probe) s.metrics.probeBad++;
    else s.metrics.customerBad++;
    s.failureStreak++;
  } else s.metrics.rejected++;
  const outcome = good ? 'success' : bad ? 'unavailable' : 'rejected';
  s.traces.push({
    traceId: trace,
    spanId: uuid().replaceAll('-', '').slice(0, 16),
    at: now,
    durationMs: Math.max(0, Math.round(durationMs * 100) / 100),
    span: 'reservation.journey',
    status: result.status,
    log: { event: 'reservation.completed', component: 'reservation-service', outcome: result.code },
    metric: {
      name: 'reservation_journey_total',
      value: 1,
      journey: probe ? 'synthetic_probe' : 'visitor_booking',
      outcome,
    },
  });
  s.traces = s.traces.slice(-120);
  if (bad && s.failureStreak >= 3 && s.incident?.status === 'detecting') {
    s.incident.status = 'alerted';
    s.incident.alertedAt = now;
    s.incident.traceId = trace;
    step(
      s.incident,
      'Alert',
      'evaluate_user_impact',
      'triggered',
      'Three consecutive unavailable reservation attempts. Validation errors are excluded.',
      now,
    );
  }
}
export function step(
  i: Incident,
  phase: string,
  tool: string,
  outcome: string,
  detail: string,
  now = Date.now(),
) {
  i.steps.push({ at: now, phase, tool, outcome, detail });
}
export function startDrill(s: State, kind: unknown, now = Date.now()): Result {
  if (!['catalog_unavailable', 'adapter_paused', 'unknown_dependency'].includes(String(kind)))
    return { status: 422, code: 'unsupported_drill' };
  if (s.incident && !['recovered', 'cancelled'].includes(s.incident.status))
    return { status: 409, code: 'incident_in_progress' };
  if (s.history.length >= 12) return { status: 429, code: 'drill_budget_exhausted' };
  if (s.incident) s.history.push(s.incident);
  s.config = {
    catalog: kind === 'catalog_unavailable' ? 'catalog-missing' : 'catalog-v1',
    adapter: kind === 'adapter_paused' ? 'paused' : 'ready',
    unknownFault: kind === 'unknown_dependency',
    revision: s.config.revision + 1,
  };
  s.failureStreak = 0;
  s.incident = {
    id: uuid(),
    kind: kind as Fault,
    status: 'detecting',
    openedAt: now,
    configRevision: s.config.revision,
    steps: [],
  };
  step(
    s.incident,
    'Fault',
    'inject_workspace_fault',
    'applied',
    'A controlled fault affects this workspace only. Existing reservations are unchanged.',
    now,
  );
  return { status: 201, code: 'drill_started' };
}
export function manualRestore(s: State, now = Date.now()): Result {
  s.config = {
    catalog: 'catalog-v1',
    adapter: 'ready',
    unknownFault: false,
    revision: s.config.revision + 1,
  };
  s.failureStreak = 0;
  if (s.incident && !['recovered', 'cancelled'].includes(s.incident.status)) {
    s.incident.status = 'cancelled';
    s.incident.completedAt = now;
    step(
      s.incident,
      'Operator',
      'restore_known_good',
      'cancelled',
      'Workspace owner restored service; this is not an autonomous recovery.',
      now,
    );
  }
  return { status: 200, code: 'service_restored' };
}
export function availability(s: State) {
  return s.slots.map(slot => ({
    ...slot,
    remaining: slot.capacity - s.reservations.filter(r => !r.probe && r.slotId === slot.id).length,
  }));
}
