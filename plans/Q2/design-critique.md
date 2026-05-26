# Q2 Design Critique: Human-authored knowledge at any scope

DESIGN-CRITIQUE: variant=dialog-form-approved score=8/10  rounds=1  axes: H:8 S:8 T:8 C:8 Co:9 St:8 A:8 AS:9 PP:7

**Evaluator:** Reviewer (Phase 2)
**Date:** 2026-05-26
**Input:** `plans/Q2/design/approved.md`, `plans/Q2/design/dialog-form/spec.md`, `plans/Q2/design/comparison.md`, `plans/Q2/design/synthesis.md`

---

## Variant Selection Evaluation

The designer explored two variants (Dialog Form vs Inline Expand), scored them 7.5 vs 6.5, and selected Dialog Form with the compact scope-row layout from Inline Expand. The selection reasoning is sound:

1. **Coherence argument is correct.** The codebase confirms two existing non-dismissible dialogs (ConsequencePreviewDialog, AppetiteDialog) in WorkBet.tsx using the same `<dialog>` + `showModal()` + cancel-event-prevention pattern. The design correctly inherits this proven pattern.
2. **Consistency argument is correct.** A single dialog component used from three trigger points (KnowledgeList, WorkBet, TaskSheet) versus three layout variations in the inline approach. One component to maintain versus three.
3. **Accessibility argument is correct.** Native `<dialog>` with `showModal()` provides focus trap and Escape handling. The inline variant would require manual focus management with no native trap.
4. **Scope-row synthesis is well-reasoned.** Moving scope below body (title first, body second, scope third) matches the information hierarchy for capture: content is primary, metadata is tertiary.

No re-litigation needed. The variant selection is justified and the critique scores align with my independent assessment.

---

## Dimension Scores

### 1. Visual Hierarchy — 8/10

**Strengths:** Clear three-level hierarchy (title primary, body secondary, scope tertiary). Title auto-focused on open, matching the capture-first task flow. The dialog header "New knowledge item" uses the established uppercase mono heading pattern (`text-sm font-heading font-semibold uppercase tracking-wider` per ConsequencePreviewDialog).

**One concern:** The approved design places the scope row below body (per synthesis), but the variant A spec places scope above title. The approved.md wireframe (section 4) shows scope between body and buttons, which matches the synthesis decision. This is correct but the variant A spec is stale. The builder should follow approved.md, not the variant spec.

### 2. Spacing & Density — 8/10

**Strengths:** Dialog width `min-w-[400px] max-w-[560px]` matches the ConsequencePreviewDialog's `min-w-[320px] max-w-[480px]` range pattern (wider because more content). Body textarea `min-h-[160px]` is appropriate for markdown capture.

**No density token consumption specified.** The design does not call out density token usage for the dialog's internal spacing. ConsequencePreviewDialog uses `p-4 flex flex-col gap-3` (literal values, not density tokens). Since dialogs are overlay surfaces (not list rows or cards), using literal padding is consistent with the existing pattern. However, the design should explicitly note this as a deliberate choice, not an omission.

### 3. Typography — 8/10

**Strengths:** Title input uses `input input-bordered w-full` (standard DaisyUI). Body textarea specifies `text-base` (16px) which prevents iOS Safari zoom on mobile (AQ-005). Placeholder text is realistic and task-appropriate ("What did you learn?", "Describe it in markdown...").

**Title max 200 characters is specified** — validated at the API level (Zod), not just client-side. Good.

### 4. Color Usage — 8/10

**Strengths:** Error display uses `text-error` (DaisyUI semantic class mapped to `--danger`). "Private" badge uses the existing `Tag` component (density-static, inherits token colors). No hardcoded colors specified anywhere. All classes are DaisyUI utilities or semantic token references.

**No color-as-sole-signal concerns.** The "Private" Tag badge communicates visibility through text + shape (badge), not color alone.

### 5. Component Coherence & Consistency — 9/10

**Strengths:**
- Zero new design-system components. Both dialogs are page-level co-located components using DaisyUI primitives and existing Tier 1 components (Tag, StatusChip).
- Trigger buttons use `btn btn-xs btn-ghost` consistently across all three entry points.
- Dialog pattern mirrors ConsequencePreviewDialog exactly: native `<dialog>`, non-dismissible, `showModal()`, cancel-event blocking, reason field required for destructive/scope-change actions.
- ScopeChangeDialog requires a reason field, matching ConsequencePreviewDialog's "reason before action" pattern for consequential operations.
- Progressive disclosure on scope_id (factory shows nothing, product shows dropdown, practice shows text input) is clean and avoids the 7-field-always-visible problem.

**Minor note:** The design specifies new components live at `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx`. A `knowledge/` subdirectory already exists at this path (containing KnowledgeBody.tsx and its stories). Good co-location choice.

### 6. States & Feedback — 8/10

**Strengths:** Five states explicitly defined (Empty, Filling, Submitting, Error, Success). Submitting state disables all fields and shows spinner — matches ConsequencePreviewDialog. Error uses `role="alert"` for screen readers. Success feedback is the item appearing in the list (no toast, consistent with existing patterns).

**Cmd/Ctrl+Enter shortcut specified** for submit from any field — matches the existing Composer pattern.

### 7. Accessibility — 8/10

**Strengths:**
- Native `<dialog>` with `aria-modal="true"` and `aria-label`.
- Non-dismissible (Escape blocked) prevents accidental content loss.
- Focus on open to title input; focus on close returns to trigger button.
- Tab order specified: Title > Body > Scope kind > Scope ID > Cancel > Create.
- Error message with `role="alert"`.
- Mobile textarea uses `text-base` (16px) for iOS zoom prevention.

**One gap:** The design does not specify `aria-label` values for the scope_kind select and scope_id select/input. These should have labels like "Scope kind" and "Scope target". The builder should add these. Not critical because `<select>` elements with visible label text are accessible, but explicit labels are better.

### 8. Anti-Slop Check — 9/10

**Strengths:**
- No purple/indigo gradients, no oversized padding, no hero sections, no emoji icons, no glass morphism.
- Dialog uses standard DaisyUI chrome with solid surface tokens.
- Buttons are text buttons (`btn-ghost`), not icon-heavy or over-decorated.
- No decorative elements — every element serves the form function.
- "Private" Tag badge is functional (communicates visibility), not decorative.
- The "Rejected directions" section (section 7) explicitly blocks AI-aesthetic temptations: no FAB, no live preview, no toast infrastructure, no full-page form.

**Zero screenshot-detectable AI tells** in the wireframes.

### 9. Premium Polish — 7/10

**Strengths:** Realistic placeholders, consistent button sizing, non-dismissible pattern prevents data loss, Cmd/Ctrl+Enter power-user shortcut.

**Gaps:**
- No transition/animation specified for dialog open/close. ConsequencePreviewDialog uses `showModal()` which has no built-in animation. The design correctly inherits this (no custom animation), but this means dialog appearance is instant — functional but not polished. This is consistent, so not a defect, but limits the polish score.
- The mobile adaptation section in the variant A spec (`max-w-full max-h-[90vh]`) is not carried forward to approved.md. The builder needs guidance on mobile dialog sizing.
- No loading state specified for the scope_id dropdown fetches (products, teams, bets). When the user switches scope_kind from "factory" to "product", there's a fetch to `/api/products`. What shows during the fetch? A skeleton? An empty select? The design should specify this.

---

## Findings

### WARNING

1. **[approved.md:75-76] Mobile dialog sizing not specified in approved.md.** The variant A spec (dialog-form/spec.md line 133) specifies `max-w-full max-h-[90vh]` and `text-base` on textarea for mobile. Approved.md does not carry this forward. The builder must implement mobile sizing per the variant spec, but approved.md is the canonical reference. Risk: builder implements desktop-only dialog. Recommendation: the builder should follow the variant A spec for mobile adaptation (it is the winning variant, so its spec details are normative for unaddressed questions).

2. **[approved.md:101-108] Scope_id dropdown loading state not specified.** When scope_kind changes to product/team/bet, entity lists are fetched from the API. The design does not specify what renders during fetch (skeleton, spinner, disabled select, placeholder text). Recommendation: render a disabled `<select>` with placeholder "Loading..." during fetch, matching the submitting-state pattern of disabled controls.

3. **[approved.md:118] Create-disabled validation does not cover all scope_id cases.** The design says "Create disabled until: title is non-empty AND body is non-empty AND (scope_kind is factory OR scope_id is non-empty)." This misses `user` scope (scope_id is auto-filled with current user ID, hidden) — Create should be enabled when scope_kind is "user" even though no scope_id select is visible. The auto-fill needs to count. Recommendation: validation rule should be: `title non-empty AND body non-empty AND (scope_kind in [factory, user] OR scope_id non-empty)`.

### SUGGESTION

1. **[approved.md:100] Scope select should show "user" option with different label.** When the user selects scope_kind "user", scope_id is auto-filled and hidden. But the <select> option label is just "user" which is ambiguous. Consider "Private (me only)" as the option label for the user scope kind, reinforcing the visibility semantics. This pairs with the "Private" Tag badge in the list.

2. **[approved.md, section 5] ScopeChangeDialog: consider showing the layer implication.** When changing scope from factory (L4) to product (L2), the layer changes. The dialog shows "Current: factory" but does not show "Layer: L4 -> L2". Since layer assignment is fabric's job and the user does not control it, showing it could confuse. But it could also inform. This is a design judgment call — not a defect, but worth the builder knowing the trade-off. Recommendation: do not show layer change in Q2 (matches "layer is strategy, not user-facing" principle).

3. **[design: trigger placement in WorkBet] "Add knowledge" button placement could be refined.** The design places it "after the existing action buttons" in the bet actions area. ConsequencePreviewDialog and AppetiteDialog are triggered from within the BetActionsBar component. The "Add knowledge" button is a different category (constructive, not destructive/adjustive). Placing it as a peer of Pause/Kill/Adjust may visually equate creation with bet lifecycle actions. The architecture plan (section 5.5) says "after the BetActionsBar" which is better — separated from destructive actions. Recommendation: follow the architecture plan placement (after BetActionsBar, not inside it).

---

## What's Working Well

1. **Zero component budget impact.** Both new dialogs are page-level co-located components using existing DaisyUI primitives and Tier 1 components. This is the right call for a low-volume creation form that does not warrant a reusable Tier 2 component.

2. **Progressive disclosure on scope_id.** Factory shows no field, practice shows text input, product/team/bet show dropdowns, user auto-fills. This keeps the common case (factory scope) minimal while supporting all 7 scope kinds without overwhelming the form.

3. **Explicit rejected directions.** Section 7 of approved.md documents six rejected alternatives with clear reasoning. This prevents the builder from re-inventing them and prevents future agents from re-litigating decisions.

---

## Verdict

Score 8/10 — the design advances. The Dialog Form variant is the right choice. It inherits proven patterns, adds zero design-system debt, and handles the full scope-kind matrix through progressive disclosure. The three warnings are implementation-level details that the builder can resolve without design changes. No blocking issues.
