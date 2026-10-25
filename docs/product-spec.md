# Product specification

Written before domain implementation on 2026-10-25. Status: accepted scope.

## Problem and intended user

A successful process-health check does not establish that a user can complete a reservation. Small software teams need a repeatable way to observe a broken business journey, diagnose a bounded fault, restore service, and preserve evidence of recovery. This application makes that sequence inspectable in one isolated laboratory.

The initial user is a developer, reviewer, or operations lead evaluating a reservation service. Each visitor receives an isolated persistent workspace. It contains a finite catalog of appointment slots, reservations, service configuration, telemetry, incident history, and responder decisions. The demo uses synthetic records only; no personal details are requested.

## Accepted scope and behavior

1. A visitor starts a workspace and sees available slots and service status. Workspace access uses a random, HttpOnly cookie; a workspace ID alone never authorizes access.
2. The visitor books a slot. Availability decreases atomically and a durable reservation appears. Duplicate requests using the same idempotency key create only one reservation. A reused key with a changed payload is rejected.
3. A controlled drill activates either an unavailable catalog reference or a paused reservation adapter for that workspace only. A separate unsupported fault demonstrates safe escalation. Public visitors cannot alter anyone else's workspace or global infrastructure.
4. The booking journey actually fails during a supported fault. A small bounded probe sequence confirms user-visible failure. Structured logs, spans, and a journey metric share a trace identifier; inputs and cookies are excluded.
5. A confirmed failure produces an alert. That alert invokes a responder that observes state, selects an allowlisted repair, applies it using a revision check, and verifies the live journey. Recovery never rewrites existing reservations or disables business validation.
6. Unsupported or inconclusive diagnoses are escalated. An old incident cannot overwrite a newer configuration. Duplicate agent invocations do not apply a repair twice.
7. A successful recovery requires an actual persisted probe reservation plus a negative validation check. Probe reservations are explicitly marked and consume a separate reserved probe slot, never customer inventory. Failed verification must not mark an incident recovered.
8. The evidence view shows the causal timeline, request-level telemetry, agent tool outcomes, recovery duration, and preserved business records. Export creates a JSON evidence package containing only that workspace's synthetic records and sanitized telemetry.
9. Data survives application restart. A workspace can be reset only by its owning session. Retention and workspace caps bound public-demo growth.
10. The public task tracker and documentation show the build process and actual verification status.

## Acceptance scenarios

Happy-path reservation; sold-out slot; invalid input; idempotent retry; key/payload conflict; concurrent reservation race; forged/absent cookie; cross-workspace isolation; restart persistence; catalog-fault recovery; paused-adapter recovery; unknown-fault escalation; stale repair rejection; concurrent responder invocation; telemetry correlation and absence of secret/payload values; responsive keyboard-operable interface; clean local startup; tests in one command; container start; deployment evidence; CI/CD and rollback configuration.

## Success and limits

Technical success means independently reproducible booking and recovery behavior with passing tests and inspectable evidence. This is not measured customer savings, adoption, broad cyber resilience, or a validated investment opportunity. Recovery objectives are lab observations, not production SLO claims. Market differentiation and willingness to pay remain unvalidated.

Configuration files are not evidence of successful cloud or CI runs.
