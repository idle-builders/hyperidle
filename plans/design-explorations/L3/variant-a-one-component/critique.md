# Design Critique — Variant A (one component, layout prop)

**Reviewed:** `mockup.html`, screenshot at `screenshot.png`.

## Score: 7.4 / 10

(H:8 S:8 T:8 C:8 Co:7 St:6 A:7 AS:9 PP:6)

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | Visual Hierarchy | 8 | Clean reading order in every layout. The kind-tag → producing-task → derived title → preview → footer flow works. The page header (single_full_preview) lays out a strong h2 derived title atop a quiet meta row. |
| 2 | Spacing & Density | 8 | All padding via `--density-card-pad` / `--density-pad-x`. Card gap consistent. Stack rows hit `--density-row-h`. |
| 3 | Typography | 8 | Geist body + Geist Mono for chrome. 11/13/14/15/20 px scale used. Three weights only (400/500/600). |
| 4 | Color Usage | 8 | Monochrome + danger only on diff `−` lines and ok on `+` lines (information, not decoration). Surface ladder used for elevation. |
| 5 | Coherence | 7 | The four layouts share the same vocabulary. The single_full_preview's two-column grid and the embed's transparent chrome are the most distinct, intentionally. |
| 6 | States | 6 | Mockup demonstrates populated + no-preview placeholder. Loading and error states are described in spec but NOT rendered in the mockup. |
| 7 | Accessibility | 7 | Tabindex on cards/rows; focus-visible outline. Touch targets at 44px (default density). Mockup-level concern: the embed `→` arrow has cursor:pointer but no `role="button"` or aria-label. |
| 8 | Anti-Slop | 9 | No purple gradients, no rounded-2xl, no oversized padding, no hero, no decorative icons, no glass, no marketing copy. Realistic content from §6 of HUMAN_INTERFACE_LAYER. Six artifact kinds in gallery; placeholder explicit. |
| 9 | Premium Polish | 6 | Tabular-nums on cost/timestamps. Letter-spacing on tags. But: relative-time `<time>` semantic not used; cost-pending uses `—` consistently; no hover-state demoed in screenshot. |

### CRITICAL

- **States demonstration missing.** The spec describes loading + error per layout but the mockup renders only populated + placeholder. The /design-critique workflow says "Score it against … states" and we have to take the spec at its word. Add at least one loading skeleton and one error state to the mockup before the variant is fully reviewable.

### WARNING

- **embed `→` arrow has no aria-label.** Add `aria-label="Open artifact"` and `role="button"`. Variant A's embed identity strip is the single most distinct affordance in the variant; missing semantics is a regression.
- **Relative time wrapped in plain `<span>`.** Should be `<time datetime="2026-04-28T13:31:00Z" title="…">2h ago</time>` for a11y + premium polish.
- **Footer "thread-count" rendering as separator-divided text** (`2h ago | 2 threads`) is functional but slightly less scannable than the variant-B approach (a discrete pill). Designer call.

### SUGGESTION

- **Single_full_preview's id slot floats hard right.** Consider moving the ID to a visually quieter position (left-aligned at the bottom of the meta row) so it doesn't draw the eye to the chrome's edge.
- **Decision card's claim copy at 14px medium body** competes with the 15px gallery title above it. Drop to 13px or change weight to 400.
- **The 88px gallery preview height** is right for code_diff and dashboard, slightly tall for decision (which has 2 short lines). Consider making the preview surface `min-height: 88px` rather than `height: 88px`.

### What's Working Well

- The deliberately tight component identity makes the four layouts read as one family. A user who learns gallery_card immediately predicts stack_item.
- The embed's "no chrome" rendering is the most architecturally correct of all three variants — it inherits the review-message chrome and contributes only what's needed.
- Six different artifact kinds in the gallery section disprove the AQ-108 "3-column identical card grid" tell — variance in preview content is high.
- The single_full_preview's discussion sidebar is a *placeholder column*, signalling integration with L1 without overcommitting on what the L1 thread looks like.
- Realistic, citable content — no lorem ipsum, all examples drawn from Ambrovia / Nimmly / HyperIdle from the §6 content register.

### Iteration plan (max 1 round)

The mockup-level CRITICAL is the only blocker. Loading and error states need to land in the mockup before this variant moves to comparison. Other items are SUGGESTION-grade.
