# 0002 — Bounded agent autonomy with an advisory language model

**Status:** Accepted · **Date:** 2026-10-25

## Context
Automated remediation reduces recovery time, but an agent with open-ended authority is a new operational risk. A language model adds judgement, but it is non-deterministic.

## Decision
- **Allowlist.** The on-call agent may apply only two repairs (`restore_catalog`, `resume_adapter`), scoped to one workspace.
- **Policy first.** A deterministic policy makes the diagnosis.
- **Model as second opinion.** A language model (Workers AI in the cloud, Ollama locally) receives three booleans and may only confirm the policy. Disagreement, malformed output or a timeout escalates to a human.
- **Safe writes.** Writes are compare-and-swap on the configuration revision, and each incident is claimed by a single run.

## Alternatives considered
- **The model decides and acts.** Its behaviour cannot be reproduced or bounded.
- **No automation.** This is safe, but it gives up the recovery-time benefit and the learning opportunity.
- **The model may propose new actions for approval.** This is valuable later, but it widens the attack surface. It is out of scope.

## Consequences
The agent's authority is explainable in one sentence and testable. Adding a repair is an explicit, reviewable change to the allowlist, not an emergent behaviour.
