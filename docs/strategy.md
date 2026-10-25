# Strategy, value and roadmap

## The strategic problem

Digital revenue depends on a handful of critical customer journeys: book, pay, apply, check out. Most organisations still measure their infrastructure instead of those journeys. They cannot say, with evidence, how quickly a journey recovers after a failure or who restored it.

Two shifts make this an executive issue rather than an engineering one:

- **Regulation is moving from "have a plan" to "prove it works."** In the EU, the Digital Operational Resilience Act ([DORA, Regulation (EU) 2022/2554](https://eur-lex.europa.eu/eli/reg/2022/2554/oj)) has applied to financial entities since 17 January 2025. It requires ICT incident management and digital operational resilience testing. Comparable expectations are emerging in other sectors and jurisdictions.
- **AI agents are entering operations.** Boards need a defensible answer to *"what is the agent allowed to do, and how do we know it did the right thing?"* before they allow autonomy in production.

Service Recovery Lab is a reference implementation of the operating model those shifts require:

1. Measure the customer journey.
2. Automate recovery within explicit bounds.
3. Verify the outcome against the journey itself.
4. Keep the evidence.

It is a working laboratory, not a compliance product.

## Who it serves

| Stakeholder | Question | What the system provides |
|---|---|---|
| Board, CEO, CRO | Are we resilient, and can we show it? | Evidence of fault → detection → repair → verification for each incident |
| CDAO, CIO, CTO | Where can AI act safely in operations? | A pattern for bounded autonomy: allowlist, second opinion, human escalation, audit trail |
| Head of SRE or operations | Are we paging on what matters? | A journey-level indicator and alert that ignore user errors and infrastructure noise |
| Risk, audit, compliance | Can this be reviewed independently? | Exportable JSON and OpenTelemetry evidence, redacted by design |
| Engineering | Can we reproduce it? | One-command start, 35 automated tests plus 4 browser journeys, CI/CD with rollback |

## Value hypotheses and how they would be measured

These are hypotheses for a pilot. The laboratory demonstrates the mechanism, not the business result.

| Hypothesis | Indicator | Measured by |
|---|---|---|
| Journey-level alerting detects customer-impacting failures that health checks miss | Share of incidents first detected by the journey alert | Alert source per incident |
| Bounded automation shortens time to verified recovery for known fault classes | Time from fault to **verified** recovery, not to "fixed" | Incident timeline (`openedAt` → verification step) |
| Verification prevents false recoveries | Incidents marked recovered that later fail verification (target: zero) | Verification record per incident |
| Escalation keeps humans in control of the unknown | Share of unknown faults escalated rather than auto-repaired (target: 100%) | Escalation steps |
| Evidence reduces post-incident effort | Time to produce an incident record for review | Evidence export |

## Roadmap

| Horizon | Capability | Why it matters |
|---|---|---|
| **Now** | Reservation laboratory with three fault classes, a bounded agent with an AI second opinion, OpenTelemetry evidence, CI/CD and rollback | Demonstrates the full loop end to end, reproducibly |
| **Next** | *Bring your own journey:* point the probe and the responder at any HTTP journey, with the allowlist defined as policy-as-code | Turns the laboratory into a reusable tool for any team |
| **Next** | Paging and chat integrations (PagerDuty, Slack, Microsoft Teams) for alerts and escalations | Meets operators where they already work |
| **Later** | Journey SLOs and error budgets across services, rolled up into an executive resilience scorecard | Gives leadership one view of customer-facing resilience |
| **Later** | Evidence packages mapped to resilience-testing and incident-reporting obligations | Shortens audit and regulatory reporting cycles |

## Principal risks and mitigations

| Risk | Mitigation in the design |
|---|---|
| An agent applies the wrong fix | Two allowlisted repairs only; revision-checked writes; the model can confirm but never widen authority |
| A "recovered" status is false | Positive and negative probes plus persistence checks are required |
| Telemetry leaks sensitive data | No personal data collected; payloads, cookies and tokens excluded and tested |
| Cost runs away on a public demo | Free tiers; workspace, drill, probe and telemetry caps |
| Vendor lock-in | OTLP for telemetry; SQL migrations; the domain logic is framework-free TypeScript |
