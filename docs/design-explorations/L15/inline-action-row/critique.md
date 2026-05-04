# Design Critique: L15 Variant A — Inline action row

**Score: 7.7/10** (H:8 S:8 T:8 C:9 Co:9 St:7 A:7 AS:8 PP:6) — sum 70/90

## Per-dimension scores

| # | Dimension | Score | One-line read |
|---|---|---|---|
| 1 | Visual hierarchy (H) | 8 | Title remains the heaviest element; the new footer is recessed by a 1px subtle divider so the eye hits content first, action second. The popover correctly dominates when active without colonising adjacent cards. |
| 2 | Spacing & density (S) | 8 | Card body still uses `--density-card-pad` + `--density-card-gap`. Footer's 4px vertical pad is sub-grid (chip-internal scale per AESTHETICS.md spacing rule) — explicitly justified in the spec. Popover internal pad on the 4/8 ladder. |
| 3 | Typography (T) | 8 | Two families (Geist + Geist Mono) used as designed. Footer uses 12px UI weight 500. Popover labels mono caps 11px with the +0.05em tracking (well within `--tracking-caps`). Cost value tabular-nums. |
| 4 | Color usage (C) | 9 | Pure semantic tokens. The selected verb (`Pause`) uses `color-mix(in oklab, var(--primary) 14%, transparent)` — same recipe used elsewhere. `Kill` is the only `--danger` text — color reserved for risk. |
| 5 | Coherence & consistency (Co) | 9 | Extends `TaskCard` via a slot; reuses DaisyUI `dropdown` + `Tag` for the count chip; **net zero new components**. The popover's commit grammar (Cancel + Send) mirrors L1's verdict popover — power users transfer learning. |
| 6 | States & feedback (St) | 7 | Spec covers empty / loading / error / populated / terminal / orphan / overflow / promoted. Mockup embodies populated + terminal. The increment-on-send animation is described but not embodied; that's the only positive feedback for the user, so the implementation needs to deliver it crisply. |
| 7 | Accessibility (A) | 7 | `aria-label`, `aria-expanded`, `role="dialog"` on the popover. Focus-return contract specified. Footer link colors at hover (`text-mid → text-hi`) — need to verify both `--text-mid` over `--surface-4`/`--surface-5` and `--text-hi` over the same clear ≥ 4.5:1. `Kill`'s red-on-card-bg may also need a contrast check at the verb row (it's a button, not a label). |
| 8 | Anti-slop (AS) | 8 | No purple gradient, no `rounded-2xl`, no `p-8`+ padding, no glass, no decorative emoji, no marketing copy, no centered hero. The `▾` chevron is a typographic glyph. The popover doesn't try to be cute — it's a working dropdown. Closed radius scale (`--r1` / `--r2` / `--r-pill`). The mockup-note panel at the bottom is a debug artifact and would NOT ship — flagged below. |
| 9 | Premium polish (PP) | 6 | Tabular nums on the cost value (good) and on the count chip (good). The footer increment animation is the keystone polish detail; without it the only feedback that the message landed is the count delta, which is a quiet polish cue that has to land cleanly. The popover's appearance-on-open is `--motion-fast` opacity + 4px translate (consistent with L1 popover grammar). Touch target ≥ 44px on mobile via the bottom-sheet conversion (spec). Spec mentions `prefers-reduced-motion` but the mockup uses transitions on `background` (color), which IS allowed but borderline (animate-only-transform-and-opacity rule). Verify in implementation. |

---

## CRITICAL

(none — the design clears the ≥ 7 gate.)

---

## WARNING

- **Footer hit target ambiguity.** The two action buttons (`Request ▾` and `Thread (N)`) are 12px text in a 28px-tall row. On desktop this is fine, but at touch breakpoints the hit area must be padded to ≥ 44px (AQ-015). The spec mentions touch targets only via "the bottom-sheet conversion" — which addresses the popover, not the trigger itself. Mitigation: at viewport ≤ 1024px, the action footer's vertical pad expands from `4px` to `var(--density-pad-y)` so the buttons clear 44px.

- **Popover overflow at the page edge.** The popover is `position: absolute; left: 0` from the trigger — for a card in the rightmost column near the page edge, the 240px popover may clip out of viewport. Need a `placement="auto"` rule (mirrors DaisyUI `dropdown-end`/`dropdown-bottom-end` behavior). Architect picks the boundary detection.

- **`Kill` button contrast on `--surface-2`.** Verify `--danger` (#f87171 dark, #a91515 light) over `--surface-2` (#1e1e22 dark) clears 4.5:1. Light mode is the riskier check.

- **Mockup-note debug panel.** The grey box at the bottom of the screenshot ("State shown.") is a mockup-only annotation. The spec doesn't include it in the ship list, but I'm calling it out so reviewers don't mistake it for production chrome.

---

## SUGGESTION

- **Increment-pulse motion is the load-bearing feedback signal.** Consider strengthening to a 150ms count chip "+1" overlay (small `+1` badge that fades in over the count, then fades out as the count itself transitions). The spec says "80ms opacity crossfade" — that's invisible on most monitors. The whole UX hinges on the user knowing the message landed; the polish here matters disproportionately.

- **Verb selection state is ambiguous.** The selected `Pause` row uses `color-mix(in oklab, var(--primary) 14%, transparent)` — the same tint used for hover. Selected and hover should be visually distinct. Suggestion: selected = `--primary-dim` (0.08), hover = `--surface-ghost` (0.05) — the current selection effect reads as hover.

- **`Open thread` (orphan state) and `Thread (N)` (populated) are different copy treatments.** The first is plain text + glyph, the second is text + chip. Consider unifying as `Thread (—)` / `Thread (3)` so the visual shape is invariant — the count slot is always present, just empty when there's no thread. Reduces cognitive variance.

- **The two action buttons are styled identically (both `btn-ghost`).** This treats request and thread-open as equal-weight, which is variant A's explicit thesis. But the variant-A signature is "everything stays inline at equal weight" — fine, but verify with founder that this asymmetry-rejection is desired (variant B argues thread-open is the dominant path).

- **The `Request ▾`'s chevron glyph rendering.** At 9px, the `▾` is borderline legible on sub-pixel-imprecise displays. Consider scaling to 10px or using an inline SVG chevron (lucide `chevron-down`).

---

## What's working well

- **Net-zero new component count.** The variant ships entirely as a slot extension on `TaskCard` + DaisyUI `dropdown` markup + `Tag` + a route to the existing `ThreadShell`. The component-budget pressure stays at zero — and that is the variant's whole point. This is what the brief asked for.

- **The interaction grammar mirrors L1's verdict popover.** Pick → confirm popover with optional note → `Cancel`/`Send`. Power users who learned L1's verdict bar already know this UI. The spec calls this out and sticks to it.

- **The terminal-state collapse (Done card).** Hiding `Request ▾` on `done`/`killed` cards while keeping `Open thread` reachable is the right call. Audit access stays. Founders aren't asked to make pointless requests.

- **Drag death is visually communicated.** Cursor `default` on cards (was `grab`) is the most-visible removal signal. The spec gets this right at the card level even though the drag-removal is an architect's mechanical task.

- **Density wins.** With the popover open and content visible across all 4 columns, the page still reads as the same Team Board — not a redesigned page. Founders' spatial memory survives the L15 ship.

---

## Score recap

**70/90 = 7.7 average.**

Above the ≥ 7 gate. Variant advances to Phase 3 (comparison) without regeneration.

The critique pass against the locked design (Phase 5) will re-score after synthesis.
