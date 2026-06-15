# AK4 — Design synthesis

**Strongest (only) base:** "Draft card in thread." Routine class; no sibling variants to pull from — the concept and the existing shipped pattern collapse the legal design space to this one shape.

**Pulled-in elements:** none (single variant).

**Explicitly rejected (do not re-litigate in `/architecture` or `/write-code`):**
1. In-overlay block editor — editing is click-through to WorkBet (AG3). No second editor.
2. Pre-creation proposal/approval modal — a draft is reversible; the gate is commit. Concept hard-rule #3.
3. Dedicated draft pane / split view in the overlay — keeps the single-timeline shape.
4. Full AG3 blocks rendered inline in the reply — the reply shows a glanceable `BetCard`; full blocks live in WorkBet.
5. Thread verdict (Approve/Reject) on the draft — WorkBet's commit button is the single human gate; no second commit path in v1.

**Why this is right (not just first idea):** the concept locked the rejections at the concept layer, so the design's job is purely *which existing components, arranged how*. The answer that costs zero new components, keeps the timeline clean, and routes editing to the one canonical authoring surface (AG3/WorkBet) is unambiguously the strongest. There was no convergence risk because the alternatives are concept violations, not design tweaks.
