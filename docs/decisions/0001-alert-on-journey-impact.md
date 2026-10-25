# 0001 — Alert on customer-journey impact, not infrastructure metrics

**Status:** Accepted · **Date:** 2026-10-25

## Context
Process health checks and resource metrics can stay green while customers fail to complete a booking. Error counts that include invalid user input page people for problems that are not outages.

## Decision
The service-level indicator is *visitor booking success*. The alert fires after three consecutive server-side (5xx) booking attempts in a workspace. Validation errors (4xx) never count, and any success resets the streak. `/api/health` remains, but only as a process signal.

## Alternatives considered
- **CPU or latency thresholds.** These measure the infrastructure, not the customer.
- **Any error rate.** User mistakes create noise and alert fatigue.
- **Burn-rate alerting on an SLO.** This is the right model at scale, but it needs traffic volumes a laboratory does not have. It is on the roadmap.

## Consequences
The alert has a direct business meaning ("customers cannot book"). The threshold is deliberately small so that it can be demonstrated, and a production deployment would tune it against real traffic.
