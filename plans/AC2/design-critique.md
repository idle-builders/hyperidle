# AC2 Design Critique -- Bet Hypothesis Validation Flow

DESIGN-CRITIQUE: variant=approved score=7/10  rounds=1  axes: H:8 S:7 T:7 C:8 Co:8 St:7 A:7 AS:8 PP:6

## Summary

The approved design merges the right elements: Variant B's two-column comparison layout (the cognitive core of the feature) with Variant A's system consistency (AC1 section header, DaisyUI primitives, "Outcome" naming). The synthesis decision is sound. The two-column side-by-side layout directly serves the spec requirement of "seeing what was predicted side-by-side with what happened." The rejection of the "Retro" header rename is correct -- it preserves the founder's mental model from AC1.

The design is production-ready with the findings below addressed.

---

## Dimension Scores

### 1. Visual Hierarchy -- 8/10
The reading order is clear: "Predicted" label anchors the left column (the immutable past), "What happened" anchors the right column (the evaluation). The verdict select is positioned first in the right column, establishing the structured judgment before the prose. The populated state's verdict badge + metadata + summary + learnings sub-section has a natural top-to-bottom flow.

The left column's italic hypothesis text at 13px with primary color gives it appropriate visual weight as the reference anchor without competing with the right column's interactive elements.

### 2. Spacing and Density -- 7/10
The design specifies `grid grid-cols-[1fr_1fr] gap-[18px]` which uses the Hearth 6px grid value (18px = `--space-6`). Form field gaps use `mb-[12px]` (on-grid), `mb-[6px]` for label-to-field gaps (on-grid), `mb-[9px]` for section header margin (on-grid). Action buttons use `gap-[9px]` (on-grid). All spacing values are on-grid.

**WARNING**: The `mt-[12px]` on the "Learnings" sub-section label in the populated state and the `mt-[9px]` on the reality summary text are specified inline. These are on-grid values but should be verified during implementation to match the overall section rhythm.

### 3. Typography -- 7/10
The design uses only the established Hearth type scale:
- Section header: 13px font-[600] uppercase tracking-[0.06em] -- matches AQ-013 quiet section headers. Uses `--tracking-caps-sm` (0.06em), consistent with the existing "Tasks", "Artifacts", "Discussion" headers on WorkBet.tsx.
- Column labels ("Predicted", "What happened"): 12px font-[500] uppercase tracking-[0.06em] -- consistent with meta-strip and sub-section labels.
- Hypothesis text: 13px italic -- on-scale, distinctive treatment for the immutable snapshot.
- Form labels: 12px font-[500] text-secondary -- on-scale, matches AC1 form labels.
- Body text: 13px text-secondary leading-[1.7] -- on-scale, leading matches `--leading-relaxed`.

**WARNING**: The approved design specifies `leading-[1.7]` directly. This is the correct value but should use `--leading-relaxed` token where possible for maintainability.

### 4. Color Usage -- 8/10
All colors reference semantic tokens: `--text-primary`, `--text-secondary`, `--text-tertiary`, `--accent-primary`, `--status-error`, `--surface-container`, `--border-default`, `--border-subtle`. No hardcoded hex values. No decorative color. The verdict badge uses the neutral treatment (surface-container bg, text-secondary text) consistent with AC1 -- verdict meaning is conveyed through text content, not color. This follows AQ-004 (status through content, not structure).

The "Draft with AI" error message uses `text-[var(--status-error)]` correctly -- error is communicated through both color and text content.

### 5. Component Coherence and Consistency -- 8/10
The design explicitly states "New components: 0" and "Modified components: 0". All UI composes from existing DaisyUI primitives (select, textarea, btn, badge pills) and CSS grid layout. The form field styling matches AC1 exactly. The section header pattern is identical to the existing "Tasks", "Artifacts", "Discussion" headers.

The two-column grid is the only novel structural pattern, and it is implemented with standard CSS grid rather than a custom component. This is the correct approach per the component budget constraint.

The verdict badge in the populated state reuses the exact AC1 badge style: `inline-flex items-center text-[12px] font-[500] px-[9px] py-[3px] rounded-[var(--r-pill)] bg-[var(--surface-container)] text-[var(--text-secondary)] leading-[1.4]`. This is consistent.

### 6. States and Feedback -- 7/10
The design covers five distinct states:

1. **Not evaluated** (default) -- "Not evaluated" + "Record outcome" link. Unchanged from AC1.
2. **Editing** -- two-column layout with form fields.
3. **Populated** (view) -- two-column layout with verdict + summary + learnings.
4. **AI drafting in progress** -- dimmed fields (opacity-50), "Drafting..." button label.
5. **AI draft error** -- error text below button, fields remain usable.

**WARNING**: Missing explicit states:
- **Save error state**: Section 1.6 mentions "Outcome saved but retro record failed. Try again." but the design does not specify where this partial-failure error message renders or its visual treatment. The general error text placement (below learnings textarea, above buttons) is specified, but the partial-failure scenario has a different message format that needs explicit positioning.
- **Saving state**: The design specifies `Save: "Save" / "Saving..."` and `disabled={saving}` on Cancel. This is sufficient but there is no opacity dimming on the form during save (unlike the AI draft state which dims fields). This inconsistency is minor but noticeable.

Motion is specified: form expand/collapse uses `opacity 0<->1 over var(--motion-fast) (120ms)` matching AC1. AI draft field dimming uses opacity transition 120ms. No stagger. These all use on-scale motion tokens.

### 7. Accessibility -- 7/10
The design specifies:
- Tab order through right column: Draft with AI -> verdict select -> reality textarea -> learnings textarea -> Cancel -> Save. Left column (static text) is not focusable.
- Escape cancels and collapses the form.
- Focus management: "Record outcome" click moves focus to verdict select. Draft completion moves focus to verdict select. Cancel/Escape returns focus to the trigger button. Save success returns focus to "Edit".
- Standard button keyboard (Enter/Space) for interactive elements.

**WARNING**: Missing specifications:
- **aria-label on the editing form**: The design does not specify an `aria-label` on the form or fieldset for the two-column editing state. AC1's design has `aria-label="Record bet outcome"` on the form -- this should carry forward.
- **Left column aria treatment**: The hypothesis text in the left column should have an `aria-label` or be associated with the form via `aria-describedby` so screen readers understand the relationship between the prediction and the evaluation form.
- **"Draft with AI" button aria-busy**: During the drafting state, the button should have `aria-busy="true"` and the dimmed form fields should have `aria-disabled` to communicate the loading state to assistive technology.

### 8. Anti-Slop Check -- 8/10
The design passes the anti-slop checklist:
- No gradient backgrounds (AQ-102).
- No oversized padding (AQ-103). All padding within Hearth grid values.
- No hero sections (AQ-104).
- No emoji as iconography (AQ-105).
- No centered layouts on body content (AQ-106).
- No glass morphism (AQ-107).
- No 3-column identical card grid (AQ-108).
- No Lorem ipsum placeholder copy (AQ-109). Uses realistic copy ("Chunked uploads reduce failure rate by 50%").
- No marketing superlatives (AQ-110).
- No gradient-on-text (AQ-111).

The two-column layout is distinctive and purpose-built for the comparison task. It does not look like generic AI dashboard output. The decision to use "Record outcome" rather than a more verbose label is restrained.

### 9. Premium Polish -- 6/10
This is where the design has the most room for improvement.

**WARNING**: Several premium polish items are unspecified:
- **Hover states on "Draft with AI" button**: The design says `btn btn-xs btn-ghost` but does not specify whether the button has a hover treatment beyond DaisyUI defaults. Since ghost buttons can be subtle, this should be verified.
- **Focus ring specification**: The design mentions focus management (where focus moves) but does not specify the visual style of focus rings on form elements. The existing AC1 form relies on DaisyUI defaults, which should be sufficient, but this is worth verifying.
- **Metadata format in populated state**: The design says "Xd ago by @Name" but does not specify truncation behavior for long agent/user names or very old timestamps. At 400px column width, a long name + old timestamp could overflow.
- **Touch target verification**: The design mentions touch targets >= 44px but the select element and small ghost buttons at `btn-xs` size need verification. DaisyUI `btn-xs` has a min-height that may be below 44px. Section 8 (Mobile) asserts all targets are >= 44px but this needs implementation-time verification.
- **No `prefers-reduced-motion` specification**: The design specifies opacity transitions but does not mention how reduced-motion preference is honored. The motion is minimal (opacity only, no transforms) so this is low risk, but AQ-014 requires explicit handling.

---

## CRITICAL

(none)

## WARNING

- **[approved.md:1.6]** Partial-failure error state ("Outcome saved but retro record failed") lacks explicit visual specification. Where does this message render? Is it the same error text location below the learnings textarea? The message is longer than typical error text and describes a partial success -- it may need different treatment (e.g., a warning rather than an error color).
- **[approved.md:7]** Missing `aria-label` or `aria-describedby` on the editing form linking the hypothesis (left column) to the evaluation fields (right column). Screen reader users need to understand that the left column content is the reference for the right column inputs. Recommendation: add `aria-describedby="hypothesis-text"` on the right column form element, and `id="hypothesis-text"` on the hypothesis paragraph.
- **[approved.md:1.5]** AI drafting state does not specify `aria-busy` on the button or `aria-disabled` on the dimmed form fields. Assistive technology cannot distinguish between "fields are loading" and "fields are disabled."
- **[approved.md:9, rejection #9]** "No sticky/position:fixed left column. Both columns scroll naturally within the page." This is the correct call for 800px max-width, but the design does not specify minimum height for the left column or behavior when the hypothesis text is very short (1 line) vs very long (5+ lines). A 1-line hypothesis next to a 4-field form creates visual asymmetry. Consider specifying that the left column has a `min-h` equal to the right column's form height, or that vertical alignment is `items-start` (top-aligned, which is the CSS grid default).

## SUGGESTION

- **[approved.md:1.4]** The populated state shows "3d ago by @Founder" but the AC1 design shows "Recorded 3d ago by @Founder". The AC2 design drops the "Recorded" prefix in the populated state. This is actually an improvement (terser), but the inconsistency with the AC1 spec text could confuse the builder. Clarify that the metadata format is "Xd ago by @Name" (without "Recorded" prefix) and that this supersedes the AC1 format.
- **[approved.md:1.3]** The "Draft with AI" visibility condition ("Only shown when bet has session data") is good, but the design does not specify what "session data" means precisely. The architecture says "tasks with sessions" but does the presence of any session (even a crashed one with no output) count? Consider refining to "at least one session with outcome='completed'" so the AI has meaningful data to draft from.
- **[approved.md:10.4]** AI draft cost cap deferred to "existing session cost cap mechanism." This is adequate for design but the builder needs a concrete number or at least a reference to where the cap is configured. This is more of an architecture concern than design.

## What's Working Well

- **Synthesis quality**: The decision to merge Variant B's two-column layout with Variant A's system consistency is well-reasoned. The comparison of dimensions (58 vs 61 overall, 4 vs 8 on cognitive task fit) is honest about trade-offs.
- **Rejection list completeness**: 12 explicitly rejected alternatives with clear rationale. Rejections #6 (no "Retro" header), #7 (no vertical-stack-only), and #8 (no new components) are the three decisions most likely to be re-litigated by the builder -- having them locked prevents scope creep.
- **AC1 continuity**: The not-evaluated state is explicitly preserved unchanged. The verdict badge style is identical. The section header pattern is identical. A founder who used AC1 will recognize the section and find only additive new functionality.

---

## Verdict

Score 7/10. The design meets the threshold for advancement. The two-column layout correctly serves the core spec requirement. All spacing, typography, and color values are on the Hearth grid and token system. The warnings above are addressable during implementation without redesign -- they are specification gaps, not structural problems. The builder should address the ARIA gaps (W-2, W-3) and the partial-failure error state (W-1) during implementation.
