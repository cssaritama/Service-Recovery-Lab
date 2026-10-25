# 0003 — Verification against the live journey defines recovery

**Status:** Accepted · **Date:** 2026-10-25

## Context
"The configuration was restored" is often reported as "the service recovered". A fix that disables validation would also make bookings succeed.

## Decision
An incident is *recovered* only when all of the following hold:
- a positive probe booking returns HTTP 201 and is persisted;
- a negative probe with invalid input is still rejected with HTTP 422;
- no fault remains.

Probes use a reserved slot and never consume customer capacity. A failed verification escalates. A manual restore is recorded as *cancelled*, never as an agent recovery.

## Alternatives considered
- **Configuration check only.** It does not prove the journey works.
- **Positive probe only.** It does not detect a fix that weakens validation.

## Consequences
Recovery metrics cannot flatter the automation, and every recovery claim has evidence attached.
