# L11 — Comparison of three variants

Side-by-side. Critique scores from `*/critique.md`.

---

## Comparison table

| Dimension | A — Thread-flow | B — Message-card | C — Anchored-strip |
|---|---|---|---|
| **Signature (one tell)** | Rich messages share row chrome with plain messages — no surface lift, no card, just "more slots." The action row sits directly under the artifact. | Rich messages get their own bordered card with `--surface-2` lift; action footer is locked to the card's bottom edge with a 1px divider above it. | Left gutter rule unifies artifact + action strip; the strip is sticky-within-message so it's always visible when the artifact is on screen. |
| **Component count added** | **0** new components. Reuses `CommentRow` with optional rich slots. | **1** new component (`RichMessageCard`, Tier 2). Used in 2 contexts (review + questionnaire). | **2** new components (`AnchorFrame`, `AnchoredActionStrip`). `AnchoredActionStrip` reused in 3 contexts (review, questionnaire, future per-block discussion); `AnchorFrame` is a layout wrapper. |
| **Component count deleted** | `ReviewHeader.tsx` (and its 7 keyboard shortcuts). | `ReviewHeader.tsx`. The existing `ReviewVerdictBar` becomes a property of the new card. | `ReviewHeader.tsx`. The existing `ReviewVerdictBar` is *retired* — its 5-button shape is absorbed into `AnchoredActionStrip`. |
| **Density** | High — same row padding as plain messages; reasoning always inline (uses vertical space proportional to its length). | Highest on the artifact — reasoning collapsed by default frees vertical space for the artifact body. | Medium-high — reasoning sits below the artifact as a blockquote (always shown). Anchor frame adds modest internal padding. |
| **Primary action surface** | Flex-wrap row of buttons under the artifact, inside the row's body column. | Footer-locked at the bottom of the card, separated by a 1px divider. | Sticky horizontal strip anchored to the artifact's lower edge inside the anchor frame. |
| **Top-header strategy** | **Eliminated.** `ThreadHostBanner` carries host context + back-chevron. | **Eliminated.** Same. | **Reduced to a thin one-line header** above the host banner (`< back · host · sender@time`). |
| **Resolved-state strategy** | Action row replaced by inline `RESOLVED · APPROVED · A. Founder · 2 min ago` mono strip; original message stays expanded. | Card collapses to a single-line summary with a `Re-expand ▸` chevron at the right. | Action strip replaced **in the same slot** by a verdict strip (`status-chip done` + actor + time + note); artifact + reasoning stay expanded. |
| **Reasoning visibility** | Always inline above the artifact. | Collapsed by default behind a `> N reasons` toggle. | Always inline below the artifact as a `<blockquote>`. |
| **Surface treatment** | Identical to plain rows. | Distinct: `--surface-2` card on `--surface-1` stream, `--r2` corners, optional `--danger` left-border when blocking. | Identical row chrome; the anchor frame adds 1px subtle outline + 2px gutter rule on the artifact-action unit. |
| **Multi-rich-message handling** | Each rich message renders its own action row independently — N rich messages = N action rows. | Each rich message is its own card; cards stack with the stream's natural row gap. | Each anchor frame has its own sticky scope — sticky-within-message, not document-level. |
| **Long-artifact behaviour** | No sticky behaviour. User scrolls to the bottom of the artifact to find buttons. | ArtifactView's max-height caps the card; once capped, artifact scrolls internally and footer is one scroll-back away. | Action strip is `position: sticky; bottom: 0` inside the anchor frame; always visible while the artifact is in view. |
| **Best at** | Coherence (zero new components). Concept fit (most literal reading of "inline"). Mobile by default. | Visual hierarchy (eye finds the decision instantly). State coverage (most thoroughly designed). | Artifact-action unification (gutter rule). Action surface findability for long artifacts (sticky). Familiar grammar for users coming from GitHub. |
| **Worst at** | Visual hierarchy on multi-message threads (rich rows look like plain rows + action buttons). Action surface unfindable when artifact has overflow scroll. | Component-budget cost (one new Tier 2). The 1px box-shadow on the card needs to be dropped (anti-slop fix). Reasoning collapsed-by-default forces a click for novel reviews. | Component-budget cost (two new shapes). Top header preserved (soft on founder direction). Cross-browser sticky risk. New visual vocabulary (gutter rule) unique to L11. |
| **Critique score (V/S/T/C/Co/St/A/As/F)** | 5/8/7/8/9/7/7/9/8 = **68/90** (7.6 avg) | 9/8/8/8/6/9/7/8/7 = **70/90** (7.8 avg) | 8/7/8/8/6/8/7/7/6 = **65/90** (7.2 avg) |

---

## Screenshots

- A — Thread-flow: `thread-flow/screenshot.png`
- B — Message-card: `message-card/screenshot.png`
- C — Anchored-strip: `anchored-strip/screenshot.png`

(Open these to compare.)

---

## Where the spread paid off

The three axes that produced the most informative differentiation:

1. **Surface treatment.** A: identical to plain rows. B: distinct
   card with surface lift. C: gutter rule on a transparent frame.
   Each is a defensible answer to "what does inline mean?"
2. **Resolved-state strategy.** A: stays expanded with chip. B:
   collapses to one-line summary. C: action strip replaced in slot.
   These are three real choices, not three flavours of one.
3. **Long-artifact behaviour.** A: no sticky (live with the cost).
   B: card max-height + internal scroll (footer one scroll back).
   C: sticky-within-message strip (always visible).

These three axes are where any synthesis must take a position.

---

## Where they converge (and that's fine)

- All three **delete `ReviewHeader.tsx`**. The 7-shortcut keyboard
  listener and the verb-button toolbar are gone in every variant.
- All three **delete the ThreadActionBar abstraction** as a
  thread-level surface — the action surface is a property of the
  message in every variant.
- All three **dispatch via L7** on commit and **append a
  verdict-payload `CommentRow`** below the resolved message.
- All three **honour the founder filter** (no keyboard verb
  shortcuts, no emoji reactions, no optimistic-UI bragging).

Convergence here is correct — the story spec made these
non-negotiable. The variants explore *how* the inline rich message
renders, not whether.
