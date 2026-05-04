# Design Critique: L15 Variant B — Thread-first with overflow

**Score: 6.9/10** (H:8 S:9 T:7 C:8 Co:9 St:6 A:5 AS:6 PP:4) — sum 62/90

## Per-dimension scores

| # | Dimension | Score | One-line read |
|---|---|---|---|
| 1 | Visual hierarchy (H) | 8 | The thread-first thesis is visually delivered: the chip pulls the eye, the `…` recedes. Cards with unread (`●`) stand out from cards without (`▢`), as designed. The asymmetry is the variant's thesis and it lands. |
| 2 | Spacing & density (S) | 9 | The card grows by ~16px (one footer row), much less than variant A's ~28px. Six cards still fit per column without scrolling. The footer row padding stays on grid. |
| 3 | Typography (T) | 7 | Two families used as designed. The chip count is mono 11px tabular nums (good). However, the orphan-state chip uses 11px mono "Open thread" — a long mono string at small size is borderline; mono caps would read cleaner. |
| 4 | Color usage (C) | 8 | Pure semantic tokens. The `--primary` tint on the unread chip is the only chromatic accent — color reserved for "act now" (the unread message). Dot + tint together (not color alone). |
| 5 | Coherence & consistency (Co) | 9 | Net zero new components. The `Tag`-with-dot variant is a one-prop extension, not a new shape. Reuses the L1 ThreadShell route. The `…` is the standard overflow grammar. |
| 6 | States & feedback (St) | 6 | Spec covers the states well. Mockup embodies populated + unread + terminal + open-menu. **Missing in screenshot:** orphan state ("Open thread" text-only render is shown in the second card, but it's awkwardly small). The "no-action confirmation" path on `Kill` is a real concern for the design (see warnings). |
| 7 | Accessibility (A) | 5 | The `…` button at 16x16 with 40% opacity at rest is below the discoverability threshold and below WCAG target-size guidance even with the padded hit area. The opacity at rest (0.45) means low-vision users may miss it entirely. The chip's dot+count combo is fine for distinguishing unread/no-unread but the dot color (`--primary` on dark mode = #e0e7ff, near-white) has very low chroma — the unread chip's "primary tint" background is the more reliable signal, but its contrast against `--surface-4` needs verification. |
| 8 | Anti-slop (AS) | 6 | No major tells — no purple gradient, no `rounded-2xl`, no oversized padding. **However**, the `…` glyph (typographic ellipsis) is the standard overflow tell and its 40%-opacity-on-card-rest treatment is itself a tell that the design isn't sure what to do with the request affordance. The `▢` (empty box) glyph for "no unread thread" is unusual for a productivity UI and may read as a missing-character box on some font fallbacks. |
| 9 | Premium polish (PP) | 4 | Tabular nums on the count ✓. Touch targets via padded hit area is the right pattern but the spec's hit zones (32×32) STILL fail AQ-015 (≥ 44px on mobile). The unread dot's `box-shadow: 0 0 0 2px color-mix(--primary, 20%)` is a subtle ring that reinforces the dot — premium detail. The Kill-with-no-confirmation is a polish anti-pattern: even if Kill is "just a request", the lack of an undo + the fast-click affordance is a future "I fat-fingered Kill" support ticket waiting to happen. |

---

## CRITICAL

- **`Kill` posts on click with NO confirmation step.** The spec explicitly states "There is no confirmation step for any verb — including `Kill`". The reasoning ("the agent will see and decide; the human can post a follow-up") is technically correct but UX-wrong. The cost of one accidental click → instant message in the agent's thread is higher than the friction of "are you sure". The variant's signature speed comes at the price of a destructive-by-name action being one click away. For comparison, L1's Reject verdict required a note. Variant A's Kill requires `Send` confirmation. This variant alone removes that friction. Even if the friction "isn't necessary" (per the spec's reasoning), it's the kind of detail that separates a polished product from a sloppy one. **Fix:** preserve the no-context-no-prompt model for the four non-destructive verbs; add a one-step `Kill?` confirmation for `Kill`. The spec's "open the thread to undo" path is too slow to be the primary safety net.

---

## WARNING

- **`…` discoverability.** At 40% opacity at rest, on cards that are not hovered, the `…` is essentially invisible to first-time users. The variant relies entirely on hover-to-discover. On touch devices (where there is no hover), the spec says "stays visible at full opacity" — confirmed in spec — but the screenshot shows the rest opacity. New users on desktop without hover discovery will not realise they can request state changes from the card.

- **Touch targets at 32×32.** AQ-015 requires ≥ 44px touch targets at viewport ≤ 1024px. The spec describes a padded hit area but specifies 32×32 as the touch zone, which fails. This needs to be corrected to ≥ 44×44 on mobile.

- **`▢` and `●` glyph fallback risk.** These typographic glyphs may render as missing-character boxes on some browsers/fonts. Consider inline SVG shapes (matching ThreadHostBanner's PinIcon convention).

- **Two interaction grammars on one card.** Click-the-card-body does nothing (no on-card title click yet). Click-the-chip opens the thread. Click-the-`…` opens the menu. The card body itself is a dead zone — power users may try to click the card and get no feedback. Consider: card-body click could open the thread (mirrors variant C's grammar), and the chip becomes a redundant explicit affordance. But this risks the click-card-by-accident → thread-route problem.

---

## SUGGESTION

- **Strengthen the unread dot.** The dot (`width: 8px; height: 8px`) is small. Consider scaling to 10px or making the chip itself slightly larger when unread. The whole variant's thesis depends on the dot pulling the eye; it should pull harder.

- **Consider a subtle `Request` label tooltip on first-mount.** A first-time-user tooltip (one-time, dismissable) reading "Tip: click `…` to request a state change" would cure the `…` discoverability cost. Out of L15 scope, but worth flagging for L18b/L20 onboarding.

- **The chip's "Open thread" copy on the no-thread-yet card** could mirror the chip-shape (always render the count as `—` when there's no thread, drop the bare-text fallback): `[ ▢ — ]` instead of bare "Open thread" text. Visual invariance reduces cognitive load.

- **The footnote at the bottom of the overflow menu** ("For richer context, open thread.") is good UX but is currently 11px italic in `--text-lo` — borderline-readable. Consider 12px regular weight.

- **The unread-count tooltip (`2 unread messages from Dev Agent 1`) would be high-value polish.** Currently tooltip-only on chip hover. Consider extending to the row level for screen readers.

---

## What's working well

- **The thread-first thesis is visually delivered.** The chip dominates; the `…` recedes. Two cards in the screenshot show the unread state — they pull the eye even at low opacity. The variant's claim ("read-loop is fast, write-loop is deliberate") is embodied by the screenshot.

- **Card silhouette barely changed.** The 16px addition to the card height is the smallest possible footprint among the three variants. Founder spatial memory survives.

- **Net zero new components.** The Tag-with-dot is a one-prop API extension; everything else is DaisyUI markup or existing primitives.

- **Volume strategy is opinionated.** The variant explicitly says: open the thread once and do everything from there. This is the Linear `S5` principle (opinionated beats flexible) applied to L15.

- **Asymmetric attention.** This is the only variant that says "these two acts deserve different visual weight." That's a defensible founder-product opinion. Even if not chosen, the position-taking is more interesting than equal-weight defaults.

---

## Score recap

**62/90 = 6.9 average.**

**BELOW the ≥ 7 gate.** The design has strong bones but two structural issues (Kill-with-no-confirm + touch-target gap + discoverability of `…`) push it below the threshold.

The variant is recoverable with two corrections:
1. Add Kill confirmation. (+1 to St, +0.5 to AS) → expected ~+5/90.
2. Bump touch zones to 44×44. (+1 to A, +1 to PP) → expected ~+4/90.

After corrections, projected score: ~71/90 = 7.9 average.

Per the design skill phase 2 rule, scores 5-7 advance to comparison with noted findings. This variant advances; the synthesis decides whether to fold its insights (thread-first asymmetry, unread dot) into the chosen direction.
