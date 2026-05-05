# L4 Plan — Architecture Critique

**Story.** TRACK-L L4 — Cost & Tokens (no Duration) appetite model. Spec-only. Type definitions land in L17.

**Reviewed artifacts.**
- `plans/L4/architecture.md`
- `docs/process-layer/the-five-primitives.md` (applied edits, especially §3.1, §3.2, §3.3, §3.4)
- `docs/process-layer/wip-and-cost-limits.md` (applied edits, §10 full rewrite)
- `docs/agent-layer/one-agent-one-team-sub-agents-are-internal.md` (applied edits, §5.1)
- `docs/agent-layer/model-routing-and-cost.md` (applied edits, §6.3)
- `docs/process-layer/canonical-shapes.md` (applied edits, Money + TokenUsage entry)

---

## Round 1 — Initial scores

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | Spec alignment | 9 | All six L4 ACs mapped: §10 rewrite, Money + TokenUsage typed, Rationale subsection, canonical-shapes.md entry, agent-layer updated, validation gate. Validation scenarios covered. |
| 2 | Layer integrity | 10 | Spec-only is honored. No premature TS code in `packages/*`. canonical-shapes.md uses TS-style signatures as documentation contracts (consistent with neighbouring entries). L17 explicitly delegated. |
| 3 | Contracts | 9 | Money + TokenUsage shapes well-defined. Currency closed enum. Precision (bigint) explicit. Tier signal explicit. Weakness: `scale` redundant with `currency` and the spec did not state a validation rule preventing inconsistent pairs. |
| 4 | Data model | 9 | bigint minor units defended explicitly vs strings/floats. JPY/USD scale handling explicit. Tier names sensible and inherited from model-routing-and-cost.md §6.1. Same scale-derivability nit as #3. |
| 5 | Naming | 9 | Money / TokenUsage / ModelTier / CurrencyCode unambiguous within the codebase (no collisions with Block, Thread, Bet, Task, Session, Team, Routine, Artifact). `scale` is slightly overloaded but defensible. |
| 6 | Depth (no-duration rationale) | 10 | Anti-pattern stated in §10.7, rationale in §10.6, plan §1.5, canonical-shapes.md echo. Three places of recording. A future agent cannot sneak duration back without violating an explicit, citable rule. |
| 7 | Failure-mode coverage | 6 | Currency mismatch and precision overflow handled. Cap breach fires `CostCapExceededError` (overloaded). **Gaps**: unknown tier from a harness not addressed; `(currency, scale)` mismatch not addressed; no statement on `cachedPrompt` synthesis; no statement on `byTier`-vs-total drift (implicit only). |
| 8 | Simplicity | 8 | Minimum viable. The `scale` field as separate-from-currency is a smell (could be derived) but defended explicitly. Otherwise no over-engineering. |
| 9 | Verifiability | 9 | L17 has a clear path. Each AC has an inspection method. Type signatures are concrete enough for L17 to build directly. |

**Round-1 average: 79 / 9 ≈ 8.78** — already above the 7.0 threshold but failure-mode coverage at 6 is the weak link and worth fixing before declaring pass.

## Round 1 — Findings

1. **Unknown-tier handling is silent.** If a future harness reports tokens under a tier name outside `reasoning | workhorse | fast`, the spec did not say what happens. Two equally bad answers exist (silent drop, runtime enum widening) and the spec must reject both explicitly.
2. **`(currency, scale)` validation rule absent.** The spec carries `scale` as a field but never states that `Money { currency: 'USD', scale: 0 }` is invalid. Without the rule, two writers can produce inconsistent rows and a reader cannot tell.
3. **`byTier` vs total drift only implicit.** The plan states totals are derived; the canonical-shapes.md entry should make this load-bearing (no aggregate field exists, so drift cannot happen).
4. **`cachedPrompt` synthesis policy absent.** The plan mentions "we don't synthesise it" but the canonical-shapes.md entry should make that a contract, not a comment.

## Round 1 — Decisions

1. Add an explicit "unknown tier" rule to canonical-shapes.md and to `docs/agent-layer/model-routing-and-cost.md` §6.3, and a parallel item in plan §1.6: Harness Adapter must coerce-and-flag (closest known tier + `ModelTierUnknownWarning` event), never silently drop, never widen enum at runtime.
2. Add an explicit `(currency, scale)` validation rule to canonical-shapes.md and to plan §1.6: valid pairs are closed (`USD/EUR/GBP -> 2`, `JPY -> 0`); mismatched values are rejected by L17 helpers; adding a currency requires same-change updates.
3. Promote the `byTier`-no-total invariant from plan-only to canonical-shapes.md and to plan §1.6: totals are derived in helpers, no aggregate field exists, drift is impossible.
4. Promote the `cachedPrompt` "report-only" rule from plan-only to plan §1.6, repeating the canonical-shapes.md comment: absence means "not reported," not "zero."

All four decisions land as edits to `docs/process-layer/canonical-shapes.md`, `docs/agent-layer/model-routing-and-cost.md`, and a `### 1.6 Failure modes addressed by the spec` subsection in `plans/L4/architecture.md`. The original §1.6 is renumbered to §1.7.

## Round 2 — Re-score

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | Spec alignment | 9 | Unchanged — no AC was failing. |
| 2 | Layer integrity | 10 | Unchanged. |
| 3 | Contracts | 10 | `(currency, scale)` constraint is now explicit; `cachedPrompt` semantics stated; unknown-tier behaviour stated. |
| 4 | Data model | 10 | Scale-derivability nit closed by validation rule. |
| 5 | Naming | 9 | Unchanged. |
| 6 | Depth (no-duration rationale) | 10 | Unchanged. |
| 7 | Failure-mode coverage | 9 | Currency mismatch, scale/currency mismatch, precision overflow, precision drift, unknown tier, cap breach, byTier-vs-total drift, cachedPrompt synthesis — all explicit. The remaining edge case (mixed-tier rollup arithmetic across `Partial<Record>` keys) is handled by L17 helpers and is not a spec-level concern. |
| 8 | Simplicity | 8 | The `scale`-as-field redundancy remains; the validation rule defends it but does not eliminate it. Defensible minor-units design. |
| 9 | Verifiability | 9 | Unchanged. |

**Round-2 average: 84 / 9 ≈ 9.33.** Stop iterating — well above threshold.

---

## Final verdict

**PASS.** Final average **9.33 / 10** after one iteration of fixes.

The plan and the applied concept-doc edits form a coherent, single-source-of-truth contract for HyperIdle's cost/budget grammar. The "no duration as budget axis" rule is recorded in three places (`docs/process-layer/wip-and-cost-limits.md` §10.6/§10.7, `docs/process-layer/canonical-shapes.md` Money/TokenUsage entry, plan §1.5) so a future agent cannot sneak it back without tripping an explicit anti-pattern citation. The Money/TokenUsage shapes are precise enough that L17 can implement them directly without ambiguity.

The single residual smell — `scale` as a field that's a function of `currency` — is defended by the rule "scale is a property of the value, not of the formatter" and the new validation invariant. The trade-off (self-describing rows at the cost of a small redundancy) is acceptable for a contract that crosses DB / API / harness boundaries.

L17 is unblocked.

## Files changed during the critique

- `docs/process-layer/canonical-shapes.md` — added `(currency, scale)` validation rule, unknown-tier coerce-and-flag rule.
- `docs/agent-layer/model-routing-and-cost.md` — added closed-enum statement and unknown-tier handling at §6.3.
- `plans/L4/architecture.md` — added §1.6 "Failure modes addressed by the spec"; renumbered original §1.6 to §1.7.
