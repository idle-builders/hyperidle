# Design Critique: L14 — Bet-level Human Actions with Consequence Preview

DESIGN-CRITIQUE: variant=variant-a-inline-bar score=8/10  rounds=1  axes: H:8 S:8 T:8 C:8 Co:7 St:8 A:8 AS:8 PP:6

---

## Scope

This critique evaluates the approved design (Variant A + cost-context from Variant B) at `plans/L14/design/approved.md`, informed by both variant screenshots (`plans/L14/design/variant-a-inline-bar/screenshot.png`, `variant-b-dialog-driven/screenshot.png`) and the mockup HTML. The approved design was correctly chosen from two genuine variants that differ on 6 axes (anti-convergence satisfied).

---

## Dimension Scores

### 1. Visual Hierarchy — 8/10

The screenshot shows clear three-tier reading order:
- Tier 1: Title (bold, 15px, text-hi) — dominant
- Tier 2: Tag + StatusChip row — secondary, smaller and lower weight
- Tier 3: Action bar separated by `border-top: 1px solid var(--border-subtle)` — clearly tertiary

"Kill bet" is the only colored element in the action bar — red at rest. This correctly applies the monochrome-status philosophy: color = danger only. The divider line effectively communicates that actions are a different register from the bet's identity information.

**Minor**: The "Adjust appetite" label is the longest ghost button (14 chars). At viewport widths where the rail is expanded, this row may wrap, and the wrap breaks the reading order slightly. The design acknowledges this in the mobile section. No deduction — it's documented.

### 2. Spacing & Density — 8/10

From the mockup:
- Action bar: `gap: 8px` between buttons, `padding-top: 4px` above the divider — both on the 4px grid. Correct.
- Button padding: `padding: 4px 10px; height: 28px` — 4px is grid-aligned; 10px horizontal is acceptable (not off-grid; it rounds from the 8/12 cluster at this size).
- Dialog inner: `padding: 20px; gap: 16px` — 20px is on-grid (4px×5). Acceptable.
- Dialog footer: `padding: 12px 20px` — grid-aligned.
- Card uses `var(--density-card-pad)` and `var(--density-card-gap)` per the mockup CSS — density tokens consumed correctly.

**Finding**: The `gap: 8px` in the action bar is a literal value, not `var(--density-gap)`. Given the action bar is rendered into the BetCard's `actions` slot — which is a density-aware component (Appendix D.1) — this gap should use a density token. The K10 audit classifies `WorkBet` as density-aware for `--density-gap`. Using literal `gap: 8px` here will be flagged by `design/use-density-tokens` lint rule. **The builder must use `gap: var(--density-gap)` or `gap: var(--density-card-gap)` on the action bar wrapper.**

### 3. Typography — 8/10

From the approved design:
- Title: 15px, 500 weight — on the allowlist, correct weight
- Dialog title: 15px, 600 — correct
- Consequence labels: 11px, 500, mono, uppercase — correct
- Consequence body: 13px, text-mid — on allowlist, correct
- Textarea: 13px — correct for internal form field (not a mobile input in the primary desktop-first scope)
- Action buttons: 12px, 500 — on allowlist

**Finding (WARNING)**: The approved design does not explicitly specify `tabular-nums` on the KeyValue appetite value or cost-context number (`$12.40`). The cost-context block contains a currency value that will need `font-variant-numeric: tabular-nums` per AQ-006. The textarea at mobile viewports (≤768px) needs 16px per AQ-005. The mobile section defers this ("not implemented in v1"), which is acceptable if the builder adds `text-[16px] sm:text-[13px]` on the textarea — the approved design does not call this out explicitly. **Flag for the builder.**

### 4. Color Usage — 8/10

Color usage is highly disciplined:
- Ghost buttons: `var(--text-mid)` at rest → `var(--text-hi)` on hover — uses text tokens only
- Kill button: `var(--danger)` text only at rest, `rgba(248,113,113,0.1)` background on hover
- Consequence STOPS/CONTINUES label (kill): `var(--danger)` at 70% opacity — uses the semantic danger token
- Cost context block: `var(--surface-3)` background — uses surface token

The approved design's Kill dialog correctly colors only the STOPS and CONTINUES consequence labels in danger (not SAVED — SAVED is positive). This is nuanced and correct.

**Minor**: `rgba(248,113,113,0.12)` in the approved design for Kill confirm button is a hardcoded RGBA, not a semantic token. The design system does not have a named `--danger-fill` or similar token. The builder will need to use the literal value (acceptable, since no token exists) or define one. Flag as an architecture gap but not a design failing.

### 5. Component Coherence & Consistency — 7/10

The approved design correctly:
- Uses `BetCard.actions` prop slot (already exists at BetCard.tsx:33) — no new component
- Uses DaisyUI native `<dialog>` via `showModal()` — correct primitive, no re-implementation
- Matches the `btn btn-xs btn-ghost` pattern established across the design system
- Uses `KeyValue` for the "CURRENT — 2 weeks" appetite display in the appetite dialog

**Finding (CRITICAL)**: The approved design specifies `btn btn-xs btn-ghost` in the synthesis/approved.md, but the mockup HTML uses a hand-rolled `.btn` class with `height: 28px; font-size: 12px`. The `btn-xs` DaisyUI class produces `height: 1.5rem (24px); font-size: 0.75rem (12px)`. The mockup's `height: 28px` does not match DaisyUI `btn-xs`. This inconsistency between the design spec (DaisyUI btn-xs) and the mockup (hand-rolled 28px) must be resolved by the builder. The production TSX should use actual DaisyUI `btn btn-xs btn-ghost` classes, not a hand-rolled size. The mockup is an approximation; the DaisyUI primitive is authoritative.

**Finding (WARNING)**: The `border-top: 1px solid var(--border-subtle)` divider on the action bar is an inline style pattern not seen in the existing BetCard component. BetCard uses no internal borders. The design spec says "border-top for separation" — this is acceptable as an addition inside the `actions` slot render, but the builder should not add it inside the BetCard component itself; it should be part of the wrapper div rendered into the `actions` slot.

### 6. States & Feedback — 8/10

The approved design covers:
- Default (in_progress, behind, blocked): four buttons
- Paused: Resume replaces Pause
- Committed/review: Kill only
- Shaped: Adjust appetite + Kill
- Shipped/killed: null (no action bar, no divider)
- Loading (action submitting): spinner on confirm button, all dialog controls disabled, Cancel remains enabled
- Error (action failed): error message below reason textarea, styled `var(--danger)`, 12px, dialog stays open
- Success: dialog closes, local state updates via refresh

The Escape key prevention (`keydown` listener `preventDefault()` on Escape) and backdrop cancel prevention (`cancel` event `preventDefault()`) are correctly specified. This is the non-skippable requirement.

**Finding (WARNING)**: The approved design specifies `dialog.close()` on Cancel. The design also says "Resets all form fields." There is no explicit spec for what happens to the error state if the user cancels after an error. The builder should reset error state AND form fields on cancel. Add this to the contract.

**Finding (WARNING)**: The tab order in the dialog is specified as "Cancel → Confirm → (wraps) → first focusable input → Cancel." This is a non-standard tab order — normal tab order would be first input → Cancel → Confirm. Reversing Cancel/Confirm in the tab order means keyboard users arrive at Cancel first, then Confirm. This is intentional (cancel-first is safe for destructive dialogs) but the builder needs to implement this via `tabindex` or careful DOM ordering, not just CSS ordering. The approved design does not specify the mechanism. **The builder must use DOM ordering (Cancel button rendered before Confirm in source), which aligns with the `flex-direction: row; justify-content: flex-end` footer layout used in the mockup.**

### 7. Accessibility — 8/10

- `aria-labelledby` linking dialog title to the `<dialog>` element — specified in approved.md
- Native `showModal()` enforces browser-native focus trap — correct, no custom focus trap needed
- Focus rings: `outline: 1px solid var(--primary); outline-offset: 1px` — on approved design buttons
- Keyboard: Escape prevention is handled, Enter on textarea inserts newline (not submit) — correct
- Textarea is `required` semantically via the Confirm disabled-when-empty guard

**Finding (WARNING)**: The approved design does not specify `aria-required="true"` or `aria-describedby` for the error state on the textarea. When the error message appears below the textarea, it should be linked via `aria-describedby` so screen readers announce it. The builder must add this.

**Finding (WARNING)**: The Unblock action calls `focus()` on the Composer textarea after `scrollIntoView`. The 100ms delay is specified. The focus must land on a visible, labeled element. The builder must ensure the Composer textarea has an accessible label (existing `HostThreadSection` Composer may already have one — architect confirmed it exists at WorkBet.tsx:457-464).

### 8. Anti-Slop Check — 8/10

Screenshot evaluation (screenshot-detectable AI tells):
- No rounded-2xl (BetCard uses --r2 = 8px, dialog uses --r3 = 12px) — PASS
- No indigo/purple gradients — PASS
- No hero sections — PASS
- No glass morphism — PASS
- No shadow-lg on cards — PASS
- No gradient-on-text — PASS
- No full-bleed accent nav — PASS
- No over-iconification (zero icons on action buttons — text only) — PASS. This is a deliberate anti-slop choice.
- No emoji — PASS

The action bar pattern (border-top separator + ghost buttons + one danger button) is a pragmatic, productivity-tool pattern. It does not look like generic AI-generated UI.

The zero-icon approach on action buttons is notable and correct: icons on every button in a dense action bar is an AI-aesthetic tell (#15 over-iconification). Text-only ghost buttons are the right call.

### 9. Premium Polish — 6/10

**Present:**
- Motion timing correctly specified: `--motion-fast` (80ms) for hover, `--motion-slow` (250ms) for dialog open
- Correct easing: `var(--motion-ease)` (cubic-bezier(0.2,0,0,1)) in the mockup
- `prefers-reduced-motion` delegated to tokens.css (correct per AESTHETICS.md § Motion — tokens.css collapses durations to 1ms under the media query)
- Dialog open animation specified: `@starting-style` scale(0.97)→scale(1) + opacity 0→1
- Backdrop close animation: 150ms (`--motion-medium`) reverse

**Missing or unclear:**
- **AQ-006 tabular-nums**: cost-context currency value (`$12.40`) is not explicitly called out as needing `font-variant-numeric: tabular-nums`. The builder may omit this.
- **AQ-007 letter-spacing on uppercase labels**: The consequence section labels (STOPS / CONTINUES / SAVED) are specified as uppercase mono. The mockup CSS uses `letter-spacing: var(--tracking-caps)` — correct. The approved design text does not explicitly call this out as a requirement. Given the mockup does it correctly, this is a gap in the prose spec, not the implementation.
- **Hover state for Kill button**: the approved design specifies `background: rgba(248,113,113,0.12)` on hover — present. But the at-rest Kill button has `background: transparent` — on the screenshot it reads as a red text ghost button, which is correct per the design. However, at rest the Kill button has no background distinction from ghost buttons. The design relies purely on color (red text) to differentiate Kill from other ghost actions. This is by design but does not add a non-color signal at rest.
- **Focus ring on Kill button**: approved design specifies `outline: 1px solid var(--primary)` — a purple/blue focus ring on a red button. This is correct (focus ring uses primary, not danger) but may be surprising. No deduction — it's correct per the design system.

The dialog open animation using `@starting-style` is a CSS-native progressive enhancement. Builder should check browser support (available in Chrome 117+, Firefox 129+, Safari 17.5+ — all production-relevant). This is acceptable.

---

## Summary of Findings

### CRITICAL

- **[approved.md, Component mapping]** `btn btn-xs` DaisyUI produces 24px height; the mockup hand-rolls 28px. The builder must use actual DaisyUI `btn btn-xs btn-ghost` — not a custom height. The mockup is an approximation; DaisyUI is authoritative. Align all button sizing to the component system, not the mockup pixel values.

### WARNING

- **[approved.md, All states § Action bar]** The `gap: 8px` on the action bar wrapper must use `var(--density-card-gap)` or `var(--density-gap)` — not a literal value. WorkBet is density-aware (Appendix D.1); literal values will fail `design/use-density-tokens` lint.
- **[approved.md, All states § Error]** Specify `aria-describedby` wiring from textarea to error message element. Add to the implementation contract.
- **[approved.md, All states § Loading]** Specify that Cancel resets error state AND form field values (not just "Resets all form fields").
- **[approved.md, Behavior § Dialog]** The tab order Cancel → Confirm → first input → Cancel is correct for a destructive dialog. Implement via DOM ordering (Cancel before Confirm in source), not `tabindex` manipulation. Clarify this in the implementation notes.
- **[approved.md § Typography]** Textarea at mobile viewport (≤768px): add `font-size: 16px` at viewport ≤768px to prevent iOS Safari zoom (AQ-005). Currently deferred but should be an explicit builder note.
- **[approved.md § Consequence preview, cost block]** Cost-context currency value needs `font-variant-numeric: tabular-nums` (AQ-006). Add to the implementation contract.

### SUGGESTION

- The approved design says the action bar divider only renders when actions exist (no divider on shipped/killed). This is correct. The builder should confirm this is part of the `null` return path — not a conditional CSS hide.
- The appetite dialog shows "CURRENT — 2 weeks" as a `KeyValue` component. The actual `KeyValue` component's label must be `CURRENT` (uppercase mono) and value `2 weeks`. The builder should reuse the existing `KeyValue` component from the design system, not hand-roll this.

---

## What's Working Well

1. **Monochrome discipline is impeccable.** Red only on Kill bet — ghost buttons for everything else. No color leakage. The design correctly applies the project's monochrome-status philosophy at the action level, not just the status level.

2. **Zero component count is a real achievement.** Leveraging `BetCard.actions` slot + native `<dialog>` + DaisyUI primitives means the builder has no new abstractions to design, test, or maintain. This is the right call for a governance feature that should be invisible infrastructure.

---

## Score: 8/10 — Advances to architecture phase

The design meets the ≥7 threshold. The CRITICAL finding (btn-xs height mismatch between DaisyUI spec and mockup) and WARNING findings above are implementation-phase risks, not design flaws that require redesign. The approved direction is sound. The consequence preview is correctly non-skippable, the state table covers all 9 bet statuses, and the information hierarchy is appropriate for the bet detail page context.
