import { serviceFault, step, uuid, type State } from './domain.ts';
import { Repository } from './repository.ts';
export type Probe = (negative: boolean) => Promise<{ status: number; reservationId?: string }>;
export type Advisor = (observation: {
  catalogAvailable: boolean;
  adapterReady: boolean;
  unknownDependency: boolean;
}) => Promise<string>;
export function diagnose(s: State): 'restore_catalog' | 'resume_adapter' | 'escalate' {
  const fault = serviceFault(s);
  return fault === 'catalog_unavailable'
    ? 'restore_catalog'
    : fault === 'adapter_paused'
      ? 'resume_adapter'
      : 'escalate';
}
export async function respond(repo: Repository, id: string, probe: Probe, advisor?: Advisor) {
  const runId = uuid();
  const claim = await repo.mutate(id, s => {
    const i = s.incident;
    if (i?.status !== 'alerted') return null;
    i.status = 'diagnosing';
    i.runId = runId;
    step(
      i,
      'Observe',
      'read_service_state',
      'complete',
      'Read configuration and the three-attempt user-impact alert. No customer payloads are sent to reasoning.',
    );
    return { incidentId: i.id, revision: s.config.revision };
  });
  if (!claim.result) return;
  const observed = claim.state;
  let decision: string = diagnose(observed),
    reasoner = 'bounded-policy';
  if (advisor) {
    reasoner = 'model-advised';
    try {
      const proposed = await advisor({
        catalogAvailable: observed.config.catalog === 'catalog-v1',
        adapterReady: observed.config.adapter === 'ready',
        unknownDependency: observed.config.unknownFault,
      });
      if (proposed !== decision) decision = 'escalate';
    } catch {
      decision = 'escalate';
    }
  }
  const repaired = await repo.mutate(id, s => {
    const i = s.incident;
    if (!i || i.id !== claim.result!.incidentId || i.runId !== runId || i.status !== 'diagnosing')
      return false;
    step(
      i,
      'Diagnose',
      'select_allowlisted_repair',
      decision,
      `Reasoner: ${reasoner}. The repair must agree with observed state and cannot change reservations.`,
    );
    if (
      s.config.revision !== claim.result!.revision ||
      diagnose(s) !== decision ||
      decision === 'escalate'
    ) {
      i.status = 'escalated';
      i.completedAt = Date.now();
      step(
        i,
        'Escalate',
        'request_operator_review',
        'no_mutation',
        'Unsupported, changed or inconclusive state. Automatic repair withheld.',
      );
      return false;
    }
    if (decision === 'restore_catalog') s.config.catalog = 'catalog-v1';
    else s.config.adapter = 'ready';
    s.config.revision++;
    i.status = 'verifying';
    step(
      i,
      'Repair',
      decision,
      'applied',
      'Restored the known-good configuration using a revision-checked database update.',
    );
    return true;
  });
  if (!repaired.result) return;
  let positive: { status: number; reservationId?: string } = { status: 599 },
    negative: { status: number; reservationId?: string } = { status: 599 };
  try {
    positive = await probe(false);
    negative = await probe(true);
  } catch {
    /* Verification failure escalates below. */
  }
  await repo.mutate(id, s => {
    const i = s.incident;
    if (!i || i.id !== claim.result!.incidentId || i.runId !== runId || i.status !== 'verifying')
      return;
    const persisted = s.reservations.some(r => r.id === positive.reservationId && r.probe);
    const pass =
      positive.status === 201 && negative.status === 422 && persisted && !serviceFault(s);
    i.verification = { positive: positive.status, negative: negative.status, persisted };
    i.status = pass ? 'recovered' : 'escalated';
    i.completedAt = Date.now();
    if (pass) s.metrics.recoveries++;
    step(
      i,
      'Verify',
      'exercise_reservation_api',
      pass ? 'passed' : 'failed',
      `Positive probe HTTP ${positive.status}; invalid-input probe HTTP ${negative.status}; durable probe reservation ${persisted ? 'confirmed' : 'absent'}.`,
    );
    if (!pass)
      step(
        i,
        'Escalate',
        'request_operator_review',
        'verification_failed',
        'The repair did not establish recovery. No recovered status is claimed.',
      );
  });
}
