# AE2 Design Comparison

## Side-by-side evaluation

| Dimension | A: Inline Chips | B: Stepped Cards | C: Conversational |
|---|---|---|---|
| **Signature** | One continuous form, function chips inline | Two-step wizard, cards show agent mapping | Opinionated presets with sensible default |
| **Component count** | 0 new | 0 new | 0 new |
| **Density** | Maximum -- everything on one scroll | Medium -- spread across 2 steps | High -- defaults hide complexity |
| **Primary action surface** | Toggle chips in form | Toggle cards on dedicated step | Radio preset pills |
| **State strategy** | One state (form) | Two states (step 1 -> step 2) | One state + custom expansion |
| **Motion budget** | Minimal (chip toggle 120ms) | Step transition 240ms + card hover lift | Preset toggle 120ms + custom expand 240ms |
| **Best at** | Speed for users who know what they want | Comprehension of function-to-agent mapping | Speed for the 80% case (software teams) |
| **Worst at** | Explaining what each function creates | Speed -- two steps for setup | Fine-grained control upfront |

## Scoring (in-session critique, 9 dimensions)

| Dimension | A | B | C | Notes |
|---|---|---|---|---|
| **Hierarchy** | 7 | 8 | 7 | B elevates the key decision; A/C bury it among fields |
| **Spacing** | 8 | 7 | 8 | A/C fit on one scroll (natural); B forces two steps |
| **Typography** | 7 | 8 | 7 | B has richer type hierarchy (card titles + descriptions) |
| **Color** | 7 | 7 | 7 | All use forest green for selected state; no difference |
| **Coherence** | 8 | 6 | 8 | B introduces a wizard pattern not used elsewhere in the app. A/C extend the existing form pattern. |
| **States** | 7 | 8 | 8 | B has explicit step states. C has the custom-expand transition. A is simplest. |
| **Accessibility** | 8 | 7 | 8 | A/C are standard form controls. B's card grid needs careful aria-pressed + grid role. |
| **Anti-slop** | 8 | 6 | 9 | B's cards risk AI-aesthetic (card grid with descriptions). C is most opinionated. A is clean. |
| **Premium polish** | 6 | 7 | 8 | C's preset names and default selection feel most considered. B's cards have visual weight. A is utilitarian. |
| **TOTAL** | **66/90** | **64/90** | **70/90** | |

## Analysis

**Variant C scores highest** primarily because:
1. **Opinionated default** -- pre-selecting "Software" means most users skip the decision entirely. This aligns with Hearth Principle S5 ("Opinionated Beats Flexible").
2. **Progressive disclosure** -- individual function toggles are hidden behind "Custom" for the 20% who need them.
3. **Anti-slop** -- no card grid (AQ-108 risk), no description-heavy UI. Clean, minimal.
4. **Coherence** -- extends the existing single-scroll form pattern rather than introducing a wizard.

**Variant B's weakness** is coherence. No other surface in HyperIdle uses a stepped wizard. The pattern would be orphaned. The card grid also risks AQ-108 (3-column identical card grid). While it is 2x4, the visual impression is "grid of identical cards."

**Variant A's weakness** is that 8 individual chips without descriptions leave the user guessing. "Operations" -- what does that create? The user has to select, read the roster preview, and mentally map. Compared to C's named presets ("Software + Design"), A requires more cognitive work.

## Recommendation

**Variant C (Conversational)** with one element borrowed from A: when "Custom" is selected, show individual function chips (from A) instead of inventing a new UI for the custom picker. The result:

- Default: 4-5 named presets as radio pills, "Software" pre-selected
- Power user: "Custom" reveals individual function chips (Variant A's toggle chips)
- Post-setup: Assistant overlay auto-opens with personalized welcome
- One scroll, one form, no wizard steps

This gives the fastest path for most users (just fill name + key + accept default -> go) while preserving full control for power users.
