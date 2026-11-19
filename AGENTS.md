# Service Recovery Lab — Autonomous Agent & Operations Standard

Welcome to **Service Recovery Lab** (`Service Recovery Lab`), the full-stack autonomous reservation service and resilient operational recovery platform within Systems Studio (Tier 2).

This file is the single authoritative source of truth for all autonomous coding agents, LLMs, and engineers operating in this repository.

---

## 1. Front-Page Context Firewall

To maintain context hygiene and prevent hallucination, agents MUST observe the following firewall boundaries:

| Action | Permitted Boundaries | Forbidden Boundaries |
| :--- | :--- | :--- |
| **Where to Read on Startup** (Max 4 files) | 1. `AGENTS.md` (this file)<br>2. `README.md`<br>3. `docs/product-spec.md`<br>4. `package.json` | Do **NOT** read entire dependency trees or non-essential documents upfront. |
| **Where to Write** | `app/`, `config/`, `db/`, `docs/`, `lib/`, `tests/`, `worker/`, `scripts/` | Do **NOT** write operational logs or cross-portfolio items locally; route portfolio-wide tasks to `systems-studio-portfolio-ops/MASTER_BACKLOG.md`. |
| **Where NOT to Read** | Active source code and configuration files | Strictly NEVER inspect or parse files in `archive/`, `past_version/`, `node_modules/`, `.next/`, or `.wrangler/`. |

---

## 2. Proactive Strategic Co-Pilot Protocol & SVED 6-Validator Engine

Every agent turn operating on non-trivial architecture or operational decisions MUST execute the Proactive Co-Pilot workflow:
1. **ITR Scoring (Impact / Toxicity / Reversibility):** Calculate risk metrics before generating irreversible code changes.
2. **SVED 6-Validator Engine:**
   - *Schema Compatibility:* Verify database schemas (D1/SQLite) and API payloads match Drizzle/TypeScript definitions.
   - *Security / Secrets:* Zero API keys, Cloudflare secrets, or credentials committed.
   - *Type Safety & Linting:* Adhere to strict TypeScript compilation (`npm test` / `tsc`).
   - *Regression Guard:* Ensure unit and integration tests pass cleanly.
   - *Dimensional Invariance:* Booking timestamps, currency cents, and latency measurements must remain dimensionally consistent.
   - *Provenance Integrity:* Zero AI foot-printing or unverified attribution comments.
3. Present execution proposals using the canonical header:
   `[PROACTIVE EXECUTION QUEUE — AWAITING YOUR "YES"]`

---

## 3. Four-Layer Agentic Architecture (Grigorev + gstack Standard)

1. **Layer 1 — Entry Point & Routing:** Guided by `AGENTS.md` and context firewalls.
2. **Layer 2 — Empirical Domain Skills:** Bounded incident recovery, trace-correlated telemetry, fault injection, and idempotent repair.
3. **Layer 3 — 3-Role Fresh-Session Cycle:**
   - *Product Manager (PM):* Defines SLA, fault models, and user recovery journeys.
   - *Software Craftsman (Engineer):* Implements Cloudflare Worker API, React UI, and deterministic repair policies.
   - *Fresh-Session QA (Auditor):* Injects edge-case faults and verifies live API recovery in isolated sessions.
4. **Layer 4 — Scoped Tool Boundaries:** Bounded responder permissions; no model-generated arbitrary shell execution in production.

---

## 4. Systems Studio Universal Rules (#10–#13)

- **Rule #10 (Backlog Auto-Registration):** Any new cross-portfolio feature, risk, or bug discovered must be formally logged in `systems-studio-portfolio-ops/MASTER_BACKLOG.md`.
- **Rule #11 (CI Workflow Parity):** Local test runs (`npm test`) must match continuous integration pipelines exactly.
- **Rule #12 (Dimensional Invariance, Anti-Tautology & Statistical Rigor):** Latency metrics, recovery windows, and SLA thresholds must use genuine physical measurements. Never rely on tautological mock assertions.
- **Rule #13 (Automated Code-Rule Checker & Root Test Isolation):** Test runners MUST isolate test directories and explicitly ignore `archive/`, `past_version/`, `node_modules/`, and `.wrangler/`.

---

## 5. Domain Invariants & Working Rules

- **Preserve the invariants:** Session isolation, cookie authorisation, idempotency, bounded recovery, and telemetry redaction.
- **Respect the responder's limits:** It may repair only the two supported workspace-scoped configuration faults. Never weaken validation, grant access, change customer records or execute model-generated code.
- **Scope:** Controlled laboratory with synthetic data, not a production backup or ransomware-assurance product. No external targets, personal data, or real purchases.

---

## 6. C-Suite Communication & Spanish-Friendly Pronunciation Standard

When providing executive debriefs or technical term coaching:
- Chat responses to the principal investigator are conducted in professional Spanish.
- Repository documentation and code artifacts remain in clean American English.
- English term pronunciation pills MUST use **intuitive Spanish-friendly phonetic respelling** (e.g., *SER-vis rih-KAH-veh-ree LAB*). Strictly avoid International Phonetic Alphabet (IPA) symbols like `/ˈsɜːrvɪs/`.
