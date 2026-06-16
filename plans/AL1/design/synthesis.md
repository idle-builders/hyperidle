# AL1 Review Experience — Synthesis (Phase 3)

## Strongest base: C — The Reasoning Ledger
C is the only variant whose **spine is the white space** the AL1 research says no shipped tool owns: the agent's structured **Rationale**, mapped to **Intent**, sorted by **confidence** so the reviewer's eye lands on uncertainty first, with the diff demoted to one-click drill-down. It is the embodiment of *"the prompt is the unit of review, not the diff"* + *"pull the human in only where it matters."* Highest critique average (8.6), most distinctive, most on-thesis.

## What to graft (the best of the other two)
The chosen design is **C as the spine + two grafts that C is weaker without:**

1. **From A — the "Needs you" triage panel + the pinned verdict bar.** C leads with reasoning, which is the *judge* step; but the IA's flow is Orient → **Triage** → Judge → Examine → Decide. A's "Needs you" panel (the derived set: gap + risk + blocking comments) is the cleanest *triage* step and the cleanest "approve responsibly in 5 seconds" affordance — it belongs *above* the ledger as the entry. A's **always-reachable verdict bar** (with `Blocking · N unresolved`) is a better *Decide* surface than a top-bar-only set of buttons, because the verdict must be reachable without scrolling the ledger. → C gets a needs-you triage band at the top of the spine and keeps the verdict reachable (sticky).
2. **From B — the anchored-comment gutter, as the in-evidence examine mechanism.** When a reviewer drills into a *code* decision in the ledger, the expanded evidence should be B's line-numbered gutter (comment dots, the `+` affordance, the selected-line ring) — so anchoring a comment to `:54` happens *in the evidence*, exactly where examine meets converse. C already drops the real `CodeRenderer` under a decision; the graft upgrades that to the gutter for code kinds.

The result is one surface with **two honest reading modes** (both required by the IA §F):
- **Fast read:** orient → read the "Needs you" band → approve/return via the always-present verdict bar, without opening the ledger.
- **Slow read:** work the confidence-sorted ledger → drill into any decision's evidence (gutter for code) → anchor comments → decide.

## Explicit rejection list (so /architecture + /write-code do not re-litigate)
- **Reject: leading with the diff.** No variant ships a diff-first spine. The artifact content is *evidence*, reached from a decision/intent/needs-attention item — never the lead. (Research #1; IA §F.)
- **Reject: B's three-pane workbench as the *primary* shape.** Its gutter is kept (graft 2); its always-three-columns layout is not — it re-centers the diff, costs the most, and breaks below ~1100px. (The Bench remains a valid *future* "deep mode" toggle, not the default.)
- **Reject: per-artifact verdicts.** One Verdict over the whole Subject; per-artifact state is *progress*, not a decision. (Concept hard-rule 1.)
- **Reject: replacing the 5 binding verdicts with non-binding actions** (the Snooze/Explain/Ask defect). Binding five only: Approve · Approve w/ comments · Request changes · Edit · Reject. Non-binding ops (comment, reply, snooze, escalate) live as secondary affordances, never in the primary verdict row. (Concept hard-rule 8.)
- **Reject: coordinate/offset anchors.** Anchors bind to block identity (`refund-webhook.ts:54` is a label for a block id, not a character offset). (Concept hard-rule 4.)
- **Reject: free-text Rationale.** The ledger row is structured (decision · discarded alternatives · confidence · intent trace · anchor), never a prose blob. (Concept hard-rule 3.)
- **Reject (founder filter, TRACK-L scope rules):** no keyboard-verb-shortcut bragging UI, no optimistic-UI flourishes, no drag-reorder, no emoji reactions, no search-modifier mini-language. Keyboard shortcuts exist but are quiet (kbd hints), not a feature surface.

## Open questions handed to /architecture (data shape, not visual)
- The production **Subject / Intent / Rationale** schemas (the story used local design types). Rationale entry = `{ id, decision, alternatives_discarded[], confidence, anchors[], intent_ref? }` per the primitive doc — confirm the wire shape + where `confidence` originates (agent-emitted).
- The **needs-attention** derivation (union of unaddressed intent gaps + risk/low-confidence flags + unresolved blocking comments) — server-derived or client-derived?
- Anchor resolution against block identity (`PlainPayloadWithBlockId`) for the gutter — the existing anchor infra (concept says inline anchored comments are not yet built; this is the AL2-and-beyond build).
- Route/destination: a `Review` destination reachable from the work item (task/bet) and from the reviewer's attention space (the queue is a secondary surface, designed lighter, not in this variant set).

**The founder picks the base direction next (Phase 4), informed by the independent `/design-critique` scores. Recommended: C + the two grafts.**
