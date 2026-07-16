# AU21 — Reduce agent-to-core coupling; formalize core-to-agent as EventBus-only

## Work package

**Work package.** As a maintainer continuing the simplification AU19 started, I want the 139 `agent-orchestration → core-api` DI edges AU19's mechanical audit found (49 justified / 52 questionable / 11 unjustified, per the independent adversarial challenge run against every one of them) reduced to only what's genuinely needed, and I want the *other* direction — `core-api → agent-orchestration` — kept exactly as clean as AU19 left it: exactly 8 against-grain edges in the whole system (5 correctly ruled permanent on same-transaction/synchronous-read grounds, 3 genuine EventBus inversions), with the EventBus as the only lever that direction is allowed to use. When this ships, every one of the 63 non-clean-justified `agent-orchestration → core-api` edges has a real disposition (fixed or re-justified with evidence that survives scrutiny), and the mechanical dependency-graph script reflects the new, reduced baseline.

**Why this matters.** The founder's own read of the AU19 graph named the actual asymmetry precisely: `core-api → agent-orchestration` stays disciplined because it has a structural forcing function (Mechanism C makes a direct import fail to compile; only the EventBus or a founder-argued permanent exception can cross that direction) — but `agent-orchestration → core-api` has no equivalent pressure. It's "legal" downward DI, so nothing stops any orchestration Service from wiring up to as many core-api Services as it wants, and nothing forces anyone to ask whether each wire is earning its keep. The AU19 adversarial audit already tested this directly rather than asserting it: of 112 individually-challenged capabilities, 11 were rated UNJUSTIFIED by an independent reviewer who read the real call site and found the stated justification false (duplicate reads, phantom edges, claimed freshness needs that don't hold up), and 52 more were QUESTIONABLE — genuine trade-offs the first pass couldn't cleanly resolve either way. This is the concrete, evidence-backed continuation of that finding, not a fresh worry.

**Type.** backend.

**What exists today.** `plans/AU19/as-is-dependency-graph.md` (the full corrected edge list, including the "Why 5 of 8 against-grain edges are permanent" reasoning table) and `plans/AU19/dependency-graph-data.json` (the machine-readable, mechanically-extracted version, 139 DI edges + 34 EventBus edges, zero unresolved) are both current and trustworthy as of AU19's close. The 112-capability adversarial challenge run (referenced in `as-is-dependency-graph.md`, full results in the workflow transcript) already individually re-verified every `agent-orchestration → core-api` capability against real code and produced a verdict — JUSTIFIED, QUESTIONABLE, or UNJUSTIFIED — with a written challenge and reasoning for each. One confirmed phantom edge (`session-requests → settings`, present in an earlier hand-derived catalog, absent from real code) was already caught and needs its removal confirmed in all downstream docs.

**What's genuinely missing.** For each of the 63 non-cleanly-justified edges (11 UNJUSTIFIED + 52 QUESTIONABLE): either a real fix (remove the edge — richer event payload at the point the triggering fact is first known, merge a duplicate call, delete a dead capability) or an explicit, evidence-backed re-justification that would survive the same adversarial test the first pass applied. Also missing: a standing practice (a checklist item, or a lint-adjacent check) that makes "does this edge need to exist, and does the target's data need to be read live vs. carried in the triggering event" a required question when a *new* orchestration→core-api edge is introduced — so this doesn't just get cleaned up once and re-accumulate.

**Depends on.**
- **AU19** — needs the real Service boundaries, the mechanical extraction script, and the 112-capability adversarial audit's findings this WP directly resolves.

**Complexity.** L

**Engineering tier.** production — matches the repo default forecast (HyperIdle: core platform shipped, actively developed); this WP tightens a live architectural boundary in a shipped system, not prototype exploration. `pipeline.config.yml` has no `engineering.tier` key yet (the tier field is unreleased in this repo), so this is the maintainer's explicit call for this WP rather than an inherited default — confirm/override before build if the tier feature lands with a different repo-wide default in the meantime.

**Pre-build gates.**
- **Refinement:** Not required — the disposition-per-edge process reuses AU19's own already-proven adversarial method; no new primitive needs settling.
- **Design:** Not required — backend refactor, no UI surface.

**Human review gates.** Yes — mandatory for every work package under the current plugin: the requirement gate (Phase 3) after `/refine-critique`, the concept gate (Phase 6, design + architecture) after the critiques, and the final review (Phase 10) before ship all still run. Forecast is low-friction: internal refactor, behavior changes only where fixing a genuine bug or removing genuinely-dead capability.

**Plan calls.** This WP's method is already proven — reuse the exact two-phase workflow AU19 used (explain each edge from real code, independently challenge it, default to skepticism) rather than inventing a new process; the 63-edge worklist already exists, so this WP starts from disposition, not discovery. Cross-reference AU20 explicitly where a finding is shared (`log_task`, the duplicate-read cases) rather than fixing the same thing twice under two different work packages.

**Contracts / constraints.**
- No product behavior change except where fixing a named, verified bug or removing a confirmed-dead/duplicate capability.
- The 5 permanent against-grain rulings and 3 EventBus inversions from AU19 stand as decided — this WP does not reopen them without new evidence of the same rigor that closed them.
- Every edge removal must have its genuine capability need served correctly some other way, verified by the test suite, not simply deleted and left broken.
- `core-api → agent-orchestration` stays EventBus-only (plus the 5 named, evidenced permanent exceptions) — no new direct DI edge in that direction without the same same-transaction/synchronous-read test AU19 established.

**Out of scope.**
- The per-method / per-Service exposed-API audit (AU20's job) — this WP is about the cross-Service *edges*, not a Service's internal method count.
- Reopening AU19's own 5 permanent-DI / 3 EventBus rulings — those are settled, evidence-backed decisions, not part of this WP's worklist.
- Any UI-facing change — pure backend edge reduction.

**Effort.** L (~4-6d) — smaller than AU20 (a fixed, already-enumerated 63-edge worklist versus AU20's 1194-export sweep) but still multi-day: each disposition needs a real code fix or a written re-justification that survives adversarial re-challenge.

## Acceptance criteria

- Every one of the 11 UNJUSTIFIED edges from the AU19 audit is resolved: removed (with its real capability served correctly some other way) or directly rebutted in writing with new evidence that overturns the original challenge.
- Every one of the 52 QUESTIONABLE edges gets a real, written disposition — not silently left open — either resolved the same way or re-classified JUSTIFIED with reasoning that would survive the same adversarial challenge applied the first time.
- The confirmed-phantom `session-requests → settings` edge is verified absent from every document and data artifact that might still reference it.
- `scripts/generate-dependency-graph.ts` is re-run at the end and its new edge count becomes the documented baseline in `plans/AU19/as-is-dependency-graph.md`, replacing the 139/8/34 figures with the post-reduction numbers.
- The 5 permanent against-grain DI ports and 3 EventBus inversions AU19 already ruled on are **not** silently reopened by this WP — this is about the *ordinary downward* `agent-orchestration → core-api` edges' proliferation, not re-litigating already-evidenced rulings.
- A concrete, documented practice exists (in `plans/AU19/architecture.md` or a successor doc) for evaluating a *new* orchestration→core-api edge going forward, so the reduction doesn't silently regrow.

## Validation scenarios

- Given an UNJUSTIFIED edge is removed, when `scripts/generate-dependency-graph.ts` is re-run, then it no longer appears in the edge list, and the capability it used to serve is confirmed still correctly available another way (test coverage proves this, not assertion).
- Given a QUESTIONABLE edge is re-justified rather than removed, when the same adversarial-challenge method is reapplied, then the new justification survives it (documented, not just asserted).
- Given the full existing test suite, when re-run after every fix in this WP, then it passes unchanged except for tests newly added to cover a fixed bug.
