# Variant A — Stay close to the existing block-anchor pattern

Direction: take the `HostThreadSection` block-discuss flow and the `ReviewCodeDiff` gutter `+` affordance to their natural conclusion: hover the exact spot, click to open an inline composer at that spot, submit to render a threaded comment at the same spot.

---

## Create flow

1. **Hover target.**
   - **Code diff:** hover any diff line; the existing gutter `+` (`+ Add inline comment`) appears at the line-number seam. Click the `+` to start composing.
   - **Prose / block content:** hover a block; the `BlockHandle` (or block edge) shows the existing actions handle; one of the actions is “Comment on this block.” Click it to start composing.
   - **Regions / cells / steps:** analogous hover affordance on the relevant sub-element (a table row, a visual region, a workflow step).
2. **Inline composer opens pinned to the anchor.** The source line/paragraph/region stays visible; the composer is inserted directly underneath it, visually connected by a 1.5px vertical hairline in `--border-strong` that runs from the anchor point to the composer card.
3. **Prefill.** The composer placeholder reads `Comment on {spotLabel}…` (e.g., `Comment on promo-webhook.ts:118…`). No body text is pre-filled beyond the spot label chip.
4. **Submit.** `Cmd/Ctrl+Enter` or the pill `Send` button posts a `plain` Thread message carrying `blockId` + a ref `kind: "artifact"`, `label: spotLabel`.
5. **Cancel.** `Esc` or clicking outside the composer closes it without posting.

## Render

### At the anchor

- The first comment appears as a compact thread card directly under the anchored line/paragraph/region.
- Card: `--surface-elevated`, `--r-subtle`, 1.5px `--border-subtle`, `--shadow-subtle`, 12px padding.
- A tiny 6px forest dot on the left edge marks the anchor; next to it the spot label in 11px monospace (`--text-tertiary`).
- The first comment uses `CommentRow` with `showSenderHeader={true}` and `inlineAnchor` set to the `spotLabel`. Replies use `CommentRow` with `showSenderHeader={false}`, creating a vertically stacked inline thread.
- A hairline connector (4px left padding + 1.5px `--border-strong` vertical line) ties the thread card visually to the anchor row.
- Replies expand inline below the first comment; no separate panel.

### In the global conversation

- Anchored comments render exactly like any other `CommentRow`, but their `inlineAnchor` label becomes a clickable chip/badge: `on {spotLabel}`. Clicking it scrolls the examine pane (or the inline content area) to the anchor and briefly highlights the target line with `--accent-primary-dim`.
- The chip uses the same pill/chip styling as a block reference badge (border `--border-subtle`, bg `--surface-container`, 11px mono label).

## States

- **Creating:** composer visible, `Send` disabled until non-empty.
- **Posted:** composer collapses; thread card appears at anchor.
- **Orphan:** if the targeted block no longer resolves (content edited away), the inline card dims (opacity 0.6) and shows a small “source changed” chip in `--text-tertiary`. The global-thread chip uses a muted dot.
- **Resolved review:** anchored comments stay readable inline; the inline add affordance is hidden.

## Motion

- Composer expand: `height` + `opacity` over `--motion-default`.
- New thread card: `translateY(-6px) → 0` + `opacity` over `--motion-default`.
- Hover highlight on source line: background tint `color-mix(in oklab, var(--accent-primary) 6%, transparent)` over `--motion-fast`.

## Pros

- Direct, familiar (GitHub / Figma comments but block-anchored); precise feedback stays next to the thing being discussed.
- Reuses all existing Tier-2 primitives; low component count.
- Works inside the existing right-pane examine layout without adding new panes.

## Cons

- Long threads can push subsequent content far down the page.
- Many anchored comments on a dense canvas reduce the visible content.
- Selecting text inside the composer does not overlap cleanly with selecting content in the canvas.
