## Refine Critique: AU20 corrective v3

**Score:** 8.9/10  ·  **Rounds:** 1

### CRITICAL

None.

### WARNING

None.

### SUGGESTION

- [requirements historical sections] Add a short precedence marker before the retained v2 requirement text, or revise its closing “No spec/doc contradiction found” sentence. Section 0 correctly says corrective UI/test contradictions remain for design adjudication, but the historical closing sentence can be misread without the v2 context. This is non-blocking because §0 explicitly supersedes prior authorization and defines the corrective contract.

### What's working

- **Value (9.5/10):** names both fast-moving users and maintainers, and states the concrete value: AU20 simplification must preserve a working browser/desktop product, durable state, truthful service contracts, and trustworthy validation.
- **Success (9/10):** completion is falsifiable: fresh-checkout evidence regeneration, clean boot/awaited shutdown, canonical rendered journeys, isolated lanes, stable inventory, exact accounting, all nine review findings closed, and explicit external blockers only where genuinely unavoidable.
- **Scope (8.5/10):** corrective work is bounded to AU20 regressions, stale proof, and review defects; new features, redesign, framework replacement, speculative hardening, arbitrary count targets, AU22 complexity work, and opportunistic refactors are excluded. Exhaustive case accounting is tier-fit “boil the lake,” not product scope expansion.
- **Guide draft (9/10):** gives an actionable shipped workflow for each disposition and distinguishes production, test, harness, prerequisite, and external-environment corrections without prescribing implementation prematurely.
- **Noun clarity:** no new product noun. The six failure dispositions are audit vocabulary and are mutually distinct through required evidence and permitted correction.
- **Tier fit (8.5/10):** MVP remains anti-enterprise and avoids speculative hardening. Exhaustive validation is warranted because AU20 already changed 31 Services and current acceptance evidence is red/unreliable; it restores the existing product rather than adding audit ceremony to user workflows.
- The mandatory fresh review at `.worktrees/AU20-review/.pipeline/work/AU20/review.md` is incorporated exactly: five CRITICAL findings and four WARNING findings are enumerated, promoted into plan acceptance criteria, and repeated in validation scenarios.
- E2E/system recovery cannot be gamed by deletion, weakening, blanket rebaseline, timeout inflation, silent skip, or lane reassignment. Every failed, skipped, timed-out, or unrun case needs a stable ledger identity, one evidence-backed disposition, authoritative contract evidence, artifacts, corrective increment, and final proof.
- Intentional product moves do not excuse lost coverage: a newer canonical design contract and proof of the capability at its current location are required before moving an assertion.
- Required sequencing is explicit and binding: corrective design + architecture, independent critiques, concept gate, `/write-tests`, `/write-code`, default-reject `/review`, then bounded independently reviewed commits. Service changes remain separate per Service; cross-cutting harness/application work gets explicit separate increments.

**Verdict:** PASS — unlock corrective design and architecture after the mandatory requirement gate. Zero blockers.
