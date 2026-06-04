# AB3 -- Agent Setup Wizard: Design Critique

DESIGN-CRITIQUE: variant=dialog-stepper score=7/10 rounds=1 axes: H:8 S:7 T:8 C:8 Co:7 St:6 A:6 AS:7 PP:7
DESIGN-CRITIQUE: variant=inline-accordion score=7/10 rounds=1 axes: H:7 S:8 T:7 C:8 Co:8 St:6 A:6 AS:8 PP:6

## Variant B: Dialog Stepper

### Scores

| Dimension | Score | Notes |
|---|---|---|
| Visual hierarchy | 8 | Clear reading order: title > stepper > body > footer. Review section uses the Hearth section-header pattern for labels (uppercase, 0.06em tracking). Good weight separation between labels and values. |
| Spacing & density | 7 | All values on the 6px grid: 24px body padding, 18px footer, 9px gaps, 12px card padding, 6px label-to-input. The 560px dialog width is not in the approved.md (which says 520px) -- minor inconsistency between mockup and spec. The 10px input padding uses the hearth-internal-padding exemption correctly. |
| Typography | 8 | All sizes on scale: 20px/600 title, 13px/500 labels, 12px/600 review labels, 12px hints, 15px body. Monospace used correctly for harness value. Line heights correct (1.55 body, 1.5 descriptions, 1.7 intro text). |
| Color | 8 | All colors from tokens: `--surface-elevated`, `--surface-container`, `--accent-primary`, `--text-primary/secondary/tertiary`, `--status-success`. Green tints use the canonical `rgba(22,118,79,0.0x)` values. No hardcoded hex for text or backgrounds. |
| Coherence | 7 | Follows BetCreateDialog native `<dialog>` pattern. Stepper dots add new visual vocabulary not present elsewhere in the system -- acceptable for a wizard but adds one unique pattern. Role cards match the card pattern from the codebase. Badge uses correct pill/12px/3px-9px format per AQ-011. |
| States | 6 | The mockup shows Step 4 (Review) only. The spec describes Steps 1-3 and success, but the mockup is interactive (can switch steps). Missing from both mockup and spec: disabled button state rendering, loading skeleton for template fetch, error state for failed API calls (network-level), focus states on role cards. The spec mentions loading/error but the mockup does not visualize them. |
| Accessibility | 6 | Mockup uses `<div>` for role cards and stepper steps -- no `role="radio"`, no `aria-pressed`, no `aria-current="step"`. Focus states defined in CSS (`:focus` with box-shadow ring) for inputs/selects but not for role cards or buttons. The stepper has no ARIA stepper semantics. The spec mentions native `<dialog>` focus trap (good) and keyboard nav (good) but the mockup does not demonstrate them. |
| Anti-slop | 7 | The stepper-dots pattern is the primary AI-aesthetic risk flagged in the comparison. However: the dots are compact (24px, no text labels in approved.md -- though the mockup HTML shows text labels), the review sidebar was cut, and the dialog is single-column. No purple/indigo, no oversized padding, no gradient, no hero section. One concern: the 4-step stepper with labels (Role/Identity/Harness/Review) visible in the mockup screenshot is the classic SaaS wizard pattern. The approved.md reduces to 3 steps with numbered dots only -- if the builder follows approved.md, this is mitigated. |
| Premium polish | 7 | Buttons have min-h-[44px] touch targets. Pill buttons. Focus rings on inputs. Review label tracking at 0.06em. Validation dot prefix. Warm shadow on dialog. Missing: no `prefers-reduced-motion` handling visible. No hover-lift on role cards (just border-color transition). |

**Average: 7.1 -- PASS (>=7)**

### CRITICAL

(None)

### WARNING

- [dialog-stepper/mockup.html] The mockup renders 4 stepper steps with text labels ("Role", "Identity", "Harness", "Review"), but approved.md specifies 3 steps with numbered dots only (no text labels). The builder must follow approved.md, not the original variant mockup. The mockup pre-dates the synthesis decision to merge harness + model tier into Step 3 and drop text labels.
- [dialog-stepper/spec.md:27] The spec describes a "Review sidebar (right side, 180px)" that was explicitly rejected in the synthesis. The variant spec is a historical artifact; approved.md is the locked contract. No confusion for the builder since approved.md supersedes.
- [approved.md] No mockup exists for the approved 3-step design. The only screenshots are for the pre-synthesis variants (4-step dialog, inline accordion). The builder will be implementing against text spec only, with no visual reference for the final shape. This increases implementation risk.

### SUGGESTION

- [approved.md:83] Role cards spec "1.5px transparent border" but the selected state changes to `--accent-primary` border. Consider adding `aria-pressed="true"` or `role="radio"` with `aria-checked` to the approved spec so the builder does not need to infer ARIA semantics.
- [approved.md:59] Footer buttons specify `btn-sm` with `min-h-[44px]`. The mockup HTML uses custom `.btn` class with `min-height: 44px` and `padding: 10px 18px`. The builder should use DaisyUI `btn btn-sm btn-primary` with the `min-h-[44px]` override, matching BetCreateDialog's approach exactly.
- [approved.md:157-165] Success state specifies "Assign to a bet" as a next-step link, but the user is already on the team page where bets are visible. Consider whether this link adds value vs. simply closing the dialog. The "View in settings" link navigates to `/conversations?settings=open` which is a different route pattern -- verify this matches the actual settings overlay trigger.

### What's Working Well

- The synthesis decision to merge harness + model tier into Step 3 and drop the review sidebar was the right call. It reduces a 4-step wizard for 4 fields down to a 3-step flow that respects the user's time.
- Token compliance is strong across both the mockup and spec. Every color, radius, spacing, and typography value traces back to a Hearth token. No hardcoded hex values for semantic content.

---

## Variant A: Inline Accordion

### Scores

| Dimension | Score | Notes |
|---|---|---|
| Visual hierarchy | 7 | Step numbers create clear progression. Completed steps collapse to summary lines -- effective progressive disclosure. The wizard border competes with the roster section visually -- two bordered regions in proximity. |
| Spacing & density | 8 | Matches the existing page density: 7px input padding, 12px step padding, 9px gaps. All on grid. The step body uses 45px left padding to align with content past the step number -- this is off-grid (not a multiple of 6) but it's internal alignment, not a layout spacing token. |
| Typography | 7 | All sizes on scale. The 11px tier card description is on the type scale but pushes toward the floor -- 12px would be more readable. Monospace used correctly for step summaries. |
| Color | 8 | Same token compliance as Variant B. Validation warning uses `--accent-secondary` correctly. Role card selection uses canonical green tint. |
| Coherence | 8 | Follows the SettingsAgents inline-expand pattern exactly. No new visual vocabulary introduced. Role cards, step numbers, and form fields all use existing patterns. This is the safer choice for coherence. |
| States | 6 | Same gap as Variant B: mockup shows one state (Step 2 active), spec describes others. No loading skeleton, no error state, no disabled button state visualized. The accordion does show completed-step summaries (good) and pending-step headers (good). |
| Accessibility | 6 | Step headers use `<div>` with `onClick` -- no `role="button"`, no keyboard handler, no `aria-expanded`. Role cards same issue as Variant B. The accordion pattern specifically needs `aria-expanded`, `aria-controls`, and `role="region"` per WAI-ARIA accordion pattern. |
| Anti-slop | 8 | No AI aesthetic tells. Dense, purposeful, no decoration. The inline pattern is unusual for wizard flows, which works in its favor -- it does not look like a generic SaaS wizard. The "+ Add agent" button is a text link, not a decorative CTA. |
| Premium polish | 6 | Buttons have 44px touch targets. Pill buttons. But: no hover-lift on role cards, no transition on step expand/collapse (spec says "steps snap"), the tier card grid is 3-column which risks the AQ-108 "3-column identical card grid" tell (mitigated by cards having different content). Missing warm shadow on the wizard container. |

**Average: 7.0 -- PASS (>=7)**

### CRITICAL

(None)

### WARNING

- [inline-accordion/mockup.html:129] Step body left padding is 45px (`padding: 12px 12px 18px 45px`). 45px is off the 6px grid. Should be 48px (`--space-16`) or 42px (7 * 6px, but this is not on the grid either). The closest on-grid value is 48px.
- [inline-accordion/spec.md] The variant uses 4 separate steps (Role, Identity, Harness, Model tier). The synthesis rejected 4 steps in favor of 3, and chose the dialog pattern. This variant was ultimately not selected.

### SUGGESTION

- [inline-accordion/mockup.html:234-262] The tier-grid uses `grid-template-columns: 1fr 1fr 1fr` which is the 3-column identical card grid flagged by AQ-108. Cards have different content (not identical children from `.map()` over identical data), so it technically passes, but it is close to the anti-pattern line.

### What's Working Well

- The inline pattern's density is excellent -- 7px input padding, 12px step padding, and compact role cards. This is the denser of the two variants and matches the SettingsAgents aesthetic perfectly.
- The accordion's progressive-disclosure model (completed steps collapse to summary lines) is genuinely useful UX -- the user sees a running preview of their configuration without a dedicated review step.

---

## Approved Design Assessment

The approved design (3-step dialog) is a well-reasoned synthesis. Key strengths:

1. **Merged harness + model tier into Step 3** -- avoids the ceremony of 4 steps for 4 fields.
2. **Dropped the review sidebar** -- correctly identified as decorative repetition.
3. **Dropped stepper text labels** -- compact dots only, reducing horizontal pressure.
4. **Chose dialog over inline** -- correct for a task involving multi-paragraph soul prompt editing.

Key risks for the builder:

1. **No approved mockup exists.** The approved.md describes a design that was never rendered as HTML. The builder must compose from the dialog-stepper mockup (4-step) while applying the synthesis changes (3-step, no text labels on dots, merged Step 3). This is a visual-fidelity risk.
2. **The approved.md specifies values that differ from the dialog-stepper mockup** (520px vs 560px width, 3 steps vs 4, no stepper labels vs labels present). The builder must treat approved.md as the contract and the mockup as illustrative only.
3. **Custom role handling is under-specified.** The approved.md says "Custom" is a UX concept and the architecture plan notes the builder needs a sub-select for the actual role (builder/growth/brand_voice). This detail is not in the approved design -- the role card just says "Custom" with no sub-select visible. The builder will need to infer this UI.

## Verdict

Both variants pass the 7.0 threshold. The synthesis correctly chose Variant B (Dialog Stepper) as the base with simplifications from Variant A. The approved design is the locked contract for implementation.

**Status: PASS -- design advances to architecture critique.**
