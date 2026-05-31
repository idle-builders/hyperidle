# U10 Design Critique -- Hearth Aesthetic Rules

DESIGN-CRITIQUE: variant=approved score=8/10 rounds=1 axes: H:9 S:7 T:8 C:9 Co:8 St:N/A A:N/A AS:9 PP:8

**Date:** 2026-05-31
**Reviewer:** Phase 2 design critique
**Source:** `plans/U10/design/approved.md` evaluated against `packages/design-system/03-hearth.html`

**Note:** This is not a typical visual-component critique. U10's design output is an aesthetic specification document -- rules, docs, and lint config that encode the Hearth vision. Scoring dimensions are adapted: Hierarchy becomes conceptual clarity of principles, Spacing becomes spacing system correctness, etc. States and Accessibility are N/A (no visual artifact produced).

---

## CRITICAL

### 1. Checkbox radius (6px) in 03-hearth.html is off the approved 4-value radius scale

**[approved.md Section 3, "Generous rounding"]** The approved design declares the radius scale is "deliberately sparse: none (0), subtle (10px), default (16px), pill (9999px). There is no 4px or 8px step." However, the founding reference at `03-hearth.html:647` uses `border-radius: 6px` on the checkbox-box element. The approved design must either:

- (a) Acknowledge that sub-component chrome (checkboxes, radio buttons) may use off-scale values as implementation exceptions not subject to lint, or
- (b) Mandate that checkbox radius snaps to 10px (the nearest on-scale value).

Without this, the first agent building a checkbox component will face a contradiction between the Hearth reference and the Hearth radius lint rule.

### 2. Hearth reference uses off-grid padding values (10px, 7px) for buttons and inputs

**[approved.md Section 2, AQ-001]** The design declares the spacing grid as `{3, 6, 9, 12, 18, 24, 36, 48}` with no exceptions. But the Hearth reference uses:
- `padding: 10px var(--ds-space-6)` for buttons (`03-hearth.html:426`)
- `padding: 7px var(--ds-space-4)` for small buttons (`03-hearth.html:486`)
- `padding: 10px var(--ds-space-4)` for inputs (`03-hearth.html:509,552`)

10px and 7px are both off the 6px grid. The design must either:

- (a) Expand the grid to include these (breaking the 3px-multiple philosophy), or
- (b) Document that button/input vertical padding is exempt from the grid rule because it is tuned to optical line-height alignment (Carbon and Material both have "internal component padding is not grid-constrained"), or
- (c) Change the reference button padding to 9px / 6px (nearest grid values).

This is critical because the lint rule will flag every button and input as off-grid.

---

## WARNING

### 3. 10px and 9px font sizes in Hearth reference are not on the approved type scale

**[approved.md Section 2, AQ-004]** The allowlist is `{11, 12, 13, 14, 15, 16, 17, 18, 20, 24, 30}`. The Hearth reference uses `10px` for badge-agent labels, avatar-sm initials, and swatch labels (`03-hearth.html:249,309,718,759`), and `9px` for count badges (`03-hearth.html:1157,1334`). The approved design should either add 10px to the allowlist (with a note about micro-typography) or explicitly state these are demo-only sizes not carried into production.

### 4. Letter-spacing values in Hearth reference diverge from approved design

**[approved.md Section 10]** The design inherits `--tracking-caps: 0.02em` from tokens.css. But the Hearth reference uses `0.08em` for section titles and `0.06em` for sub-titles and sidebar labels (`03-hearth.html:156,166,410,1020`). This is a 3-4x difference. The 0.08em tracking on uppercase section titles is part of the Hearth visual signature. The design should note whether the reference's wider tracking values are intentional overrides for the showcase page only, or whether they should influence `--tracking-caps`.

### 5. `gap: 2px` and `gap: 4px` in reference are off the 6px grid and not documented

**[approved.md Section 2, AQ-001]** At `03-hearth.html:622` (`.toggle-text { gap: 2px }`) and `03-hearth.html:681` (`.badge { gap: 4px }`), the reference uses sub-grid values. The old Lucid rules had a 2px sub-grid allowance for chips; the approved design removes it. But the reference itself uses 2px and 4px. This needs reconciliation.

### 6. AQ-004 font-weight allowlist contradicts AESTHETICS.md update

**[approved.md Section 2 "Rules that STAY" AQ-004]** The AQ-004 description still says "no font-weight outside `{400,500,600}`." This contradicts the AESTHETICS.md update that adds 700 for page titles and brand headings. AQ-004 must expand to `{400, 500, 600, 700}`.

---

## SUGGESTION

### 7. Verify OKLCH hue range for AQ-018

**[approved.md Section 2, AQ-018]** The proposed OKLCH hue range of 40-80 for warm neutrals should be validated against actual Hearth token hex values before encoding into the rule.

### 8. "Card" material name may confuse with Card component

**[approved.md Section 10]** The material name "Card" maps to `surface-elevated`, which is used for panels and non-card surfaces too. Documentation should clarify the distinction.

### 9. Expressive easing not covered by motion lint

**[approved.md Section 2, AQ-013]** The `cubic-bezier(0.34, 1.56, 0.64, 1)` for spring-like micro-interactions is mentioned but the motion lint rule needs to admit this second curve. Since no motion ESLint rule currently exists (AQ-013 is agent-rule enforcement only), this is low priority but should be noted for future rule authoring.

---

## What's Working Well

- **Faithful translation of the Hearth vision.** All four principles, the material palette, and every visual decision trace back to the founding 03-hearth.html.
- **The `rounded-2xl` reversal is well-handled.** The most controversial change is documented with clear rationale and the AI-aesthetic catalog is properly updated.
- **The AESTHETICS.md changelog approach preserves research value** while making Hearth overrides explicit.
- **The rejected directions section is decisive** -- 8 alternatives documented with clear rationale, preventing re-litigation.

---

## Verdict

Score 8/10. The design is strong and faithfully captures the Hearth aesthetic vision. The two CRITICAL findings (off-grid padding values and off-scale checkbox radius in the founding reference) are real contradictions that the builder will hit. The designer must resolve them before implementation by either adding documented exceptions or snapping the reference values. These are specification-level contradictions, not design quality issues -- the design itself is thorough and well-reasoned.

**Recommendation:** Pass with conditions. Address CRITICALs #1 and #2 by adding a note about "component-internal padding exemptions" to AQ-001 (the same pattern Carbon uses). Address WARNING #6 by updating AQ-004's weight list. The remaining warnings and suggestions can be addressed during implementation without a design revision.
