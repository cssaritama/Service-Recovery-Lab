// Executive resilience report: turns incident evidence into the measures and decisions a
// leadership team needs — objective attainment, customer impact, and where AI autonomy is earned.
import type { Fault, Incident, State } from './domain.ts';

/** Recovery time objective for the reservation journey: 15 minutes, a common business default. */
export const RECOVERY_TIME_OBJECTIVE_MS = 15 * 60 * 1000;
/** Minimum verified incidents of one class before the evidence can support expanding autonomy. */
export const EVIDENCE_THRESHOLD = 3;

export type Recommendation =
  | 'expand_autonomy'
  | 'keep_human_review'
  | 'human_owned'
  | 'gather_evidence';

export interface FaultClassReport {
  fault: Fault;
  label: string;
  incidents: number;
  autonomousRecoveries: number;
  escalations: number;
  operatorRestores: number;
  medianRecoveryMs: number | null;
  withinObjective: number;
  recommendation: Recommendation;
  rationale: string;
}

export interface ExecutiveReport {
  format: 'service-recovery-executive-report/v1';
  generatedAt: string;
  dataClassification: 'synthetic';
  objective: { journey: string; recoveryTimeObjectiveMs: number };
  headline: {
    incidents: number;
    autonomousRecoveries: number;
    escalatedToHumans: number;
    operatorRestores: number;
    autonomyRate: number | null;
    objectiveAttainment: number | null;
    medianTimeToDetectMs: number | null;
    medianTimeToVerifiedRecoveryMs: number | null;
    worstTimeToVerifiedRecoveryMs: number | null;
  };
  customerImpact: {
    journeySuccessRate: number | null;
    failedCustomerAttempts: number;
    successfulCustomerAttempts: number;
    reservationsPreserved: number;
  };
  faultClasses: FaultClassReport[];
  decisions: string[];
  caveats: string[];
}

const LABELS: Record<Fault, string> = {
  catalog_unavailable: 'Catalog reference unavailable',
  adapter_paused: 'Reservation adapter paused',
  unknown_dependency: 'Unrecognised dependency failure',
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};
const ratio = (part: number, whole: number) => (whole ? part / whole : null);
const closed = (i: Incident) => ['recovered', 'escalated', 'cancelled'].includes(i.status);
const recoveryMs = (i: Incident) => (i.completedAt ?? i.openedAt) - i.openedAt;
/** Escalated by the agent, even if an operator restored the service afterwards. */
const wasEscalated = (i: Incident) =>
  i.status === 'escalated' || i.steps.some(step => step.phase === 'Escalate');

function classify(fault: Fault, list: Incident[], objectiveMs: number): FaultClassReport {
  const recovered = list.filter(i => i.status === 'recovered');
  const escalated = list.filter(wasEscalated);
  const restored = list.filter(i => i.status === 'cancelled');
  const within = recovered.filter(i => recoveryMs(i) <= objectiveMs).length;
  let recommendation: Recommendation;
  let rationale: string;
  if (fault === 'unknown_dependency') {
    recommendation = 'human_owned';
    rationale =
      'No approved repair exists. Keep this class with operators; a recurring pattern is a candidate for a new, reviewed runbook.';
  } else if (list.length < EVIDENCE_THRESHOLD) {
    recommendation = 'gather_evidence';
    rationale = `${list.length} of ${EVIDENCE_THRESHOLD} incidents needed before the evidence can support a decision.`;
  } else if (
    escalated.length === 0 &&
    recovered.length === list.length - restored.length &&
    within === recovered.length
  ) {
    recommendation = 'expand_autonomy';
    rationale = `Every agent-handled incident was verified and recovered within the objective (${within}/${recovered.length}).`;
  } else {
    recommendation = 'keep_human_review';
    rationale = `${escalated.length} escalation(s) or objective misses. Keep a human in the loop until the pattern is understood.`;
  }
  return {
    fault,
    label: LABELS[fault],
    incidents: list.length,
    autonomousRecoveries: recovered.length,
    escalations: escalated.length,
    operatorRestores: restored.length,
    medianRecoveryMs: median(recovered.map(recoveryMs)),
    withinObjective: within,
    recommendation,
    rationale,
  };
}

/** Builds the executive report for one workspace from its stored incident evidence. */
export function executiveReport(
  s: Pick<State, 'incident' | 'history' | 'metrics' | 'reservations'>,
  now = Date.now(),
  objectiveMs = RECOVERY_TIME_OBJECTIVE_MS,
): ExecutiveReport {
  const incidents = [...s.history, ...(s.incident ? [s.incident] : [])].filter(closed);
  const recovered = incidents.filter(i => i.status === 'recovered');
  const escalated = incidents.filter(wasEscalated);
  const restored = incidents.filter(i => i.status === 'cancelled');
  const agentHandled = recovered.length + escalated.length;
  const detection = incidents.filter(i => i.alertedAt).map(i => i.alertedAt! - i.openedAt);
  const recoveries = recovered.map(recoveryMs);
  const within = recoveries.filter(ms => ms <= objectiveMs).length;
  const customerAttempts = s.metrics.customerGood + s.metrics.customerBad;
  const faultClasses = (Object.keys(LABELS) as Fault[])
    .map(fault =>
      classify(
        fault,
        incidents.filter(i => i.kind === fault),
        objectiveMs,
      ),
    )
    .filter(c => c.incidents > 0);

  const decisions: string[] = [];
  for (const c of faultClasses) {
    if (c.recommendation === 'expand_autonomy')
      decisions.push(`Approve autonomous recovery for “${c.label}”: the evidence meets the bar.`);
    if (c.recommendation === 'keep_human_review')
      decisions.push(
        `Keep human review for “${c.label}” and investigate the escalations before widening autonomy.`,
      );
    if (c.recommendation === 'human_owned')
      decisions.push(`Keep “${c.label}” with operators; fund a reviewed runbook if it recurs.`);
    if (c.recommendation === 'gather_evidence')
      decisions.push(
        `No decision yet on “${c.label}”: run more drills to reach the evidence threshold.`,
      );
  }
  if (!incidents.length) decisions.push('Run a recovery drill to generate the first evidence.');

  return {
    format: 'service-recovery-executive-report/v1',
    generatedAt: new Date(now).toISOString(),
    dataClassification: 'synthetic',
    objective: { journey: 'Customer reservation', recoveryTimeObjectiveMs: objectiveMs },
    headline: {
      incidents: incidents.length,
      autonomousRecoveries: recovered.length,
      escalatedToHumans: escalated.length,
      operatorRestores: restored.length,
      autonomyRate: ratio(recovered.length, agentHandled),
      objectiveAttainment: ratio(within, recovered.length),
      medianTimeToDetectMs: median(detection),
      medianTimeToVerifiedRecoveryMs: median(recoveries),
      worstTimeToVerifiedRecoveryMs: recoveries.length ? Math.max(...recoveries) : null,
    },
    customerImpact: {
      journeySuccessRate: ratio(s.metrics.customerGood, customerAttempts),
      failedCustomerAttempts: s.metrics.customerBad,
      successfulCustomerAttempts: s.metrics.customerGood,
      reservationsPreserved: s.reservations.filter(r => !r.probe).length,
    },
    faultClasses,
    decisions,
    caveats: [
      'Controlled laboratory with synthetic data; figures describe this workspace only.',
      'Autonomy rate = agent recoveries ÷ agent-handled incidents. An escalation counts against autonomy even if an operator later restores service; operator restores are never counted as AI success.',
      `A fault class needs at least ${EVIDENCE_THRESHOLD} incidents before the report recommends expanding autonomy.`,
    ],
  };
}
