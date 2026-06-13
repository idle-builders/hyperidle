# AG2 Variant Comparison & Decision

The contested axis is **the create affordance across the 0→1 boundary** and whether the header frame is *literally invariant* (A) or *gains a primary button when bets first exist* (B). Filter honesty/docking is identical in both.

| Dimension | A — Persistent Frame | B — Single Create Locus |
|---|---|---|
| AC-1 (empty: purpose + prominent create) | Met (header btn + EmptyState CTA) | Met (EmptyState CTA, larger/sole) |
| AC-4 (same place, no reassembly) | **Strongest** — header never changes | Weaker — New-bet button appears at 0→1 |
| Create-affordance clarity at zero | Two buttons in viewport (risk of noise) | **One** — unambiguous |
| Coherence (rubric) | 9 | 8 |
| Persistent muscle-memory for primary action | **Yes** — button always in same spot | No — button absent at zero |

## Decision: **Variant A, with B's discipline folded in.**

AC-4 is the load-bearing, most-scrutinized criterion ("reads as the same place… controls appear as they become meaningful rather than the layout reassembling itself"). Variant A's invariant header frame is the literal embodiment of "same place": the title and the "New bet" primary action are structurally fixed at 0/1/50 bets; only the filter zone gains children, and a *filter* appearing is precisely a "control becoming meaningful." B's appearing header button is a real layout change at the single transition the AC watches hardest, so it loses on the criterion that matters most.

**Fold in B's discipline to kill A's one weakness (double create at zero):** keep the header "New bet" button present at zero, but make the EmptyState's action a **secondary/ghost** "Create your first bet" that scrolls focus to / triggers the same dialog — OR, simpler and chosen: at zero bets the EmptyState owns the **only `btn-primary`**, and the header button renders as the same control but is the structural anchor (one primary tone per viewport enforced by making the EmptyState CTA primary and the header button present-but-not-competing). Final resolution below.

### Final resolved spec (settles the redundancy)
- Header "New bet" button is **present at every state including zero** (this is what makes the frame invariant and satisfies AC-4 most strongly).
- At zero bets, the EmptyState still renders its own create CTA, because the centered EmptyState is where the eye lands and a screen whose only create button is tucked top-right reads as empty/abandoned. To avoid two identical primaries competing: the **EmptyState CTA is the visual hero** (primary, in the optical center) and the **header button is the persistent anchor** (also primary tone — they are the *same action*, not competing actions, so identical styling is correct, not noise). Two instances of one action at the one moment the user has nothing else to look at is acceptable and is the pattern Linear/Notion use on empty boards.
- Once ≥1 bet exists, only the header button remains (EmptyState gone). The button has not moved.

This is Variant A. Carry it to `approved-candidate.md`.
