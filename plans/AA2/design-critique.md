# Design Critique: AA2 — Routine Management & Session Adaptation

DESIGN-CRITIQUE: variant=approved score=8/10  rounds=1  axes: H:8 S:8 T:9 C:8 Co:9 St:8 A:8 AS:9 PP:7

---

## Dimension Scores

### 1. Visual Hierarchy (8/10)

The design establishes clear reading order across all three surfaces. The RoutineCreateDialog follows BetCreateDialog's proven structure: heading at top, sequential form fields, action buttons at bottom. The WorkRoutine detail page uses section headings (uppercase, tertiary, semibold) that correctly recede below content. The action bar separates Delete from primary actions via flex spacer -- good spatial hierarchy for destructive vs. constructive actions.

Minor concern: the inline edit pencil icon (12px, tertiary) on hover may be too subtle for discoverability. Users unfamiliar with the edit affordance may not discover it. However, this matches the "progressive disclosure" rationale stated in the design, and the detail page already shows all values, so the edit affordance is secondary.

### 2. Spacing & Density (8/10)

All spacing values are on the Hearth 6px grid: `p-4` (16px) for dialog inner layout, `gap-3` (12px) between form fields, `gap-[9px]` for action bar buttons, `mt-[18px]` for action bar offset. Card sections use `p-[18px]` per the card padding standard.

**WARNING:** The design specifies `p-4 flex flex-col gap-3` for the dialog inner layout. `p-4` = 16px. BetCreateDialog also uses `p-4`. However, 16px is NOT on the Hearth 6px grid (`{3, 6, 9, 12, 18, 24, 36, 48}`). It sits between 12 and 18. This is an existing pattern inherited from BetCreateDialog, so it is a pre-existing deviation, not an AA2 regression. The design correctly follows the established dialog pattern. Flagging for awareness only -- fixing this would mean changing BetCreateDialog too, which is out of scope.

`gap-3` = 12px is on-grid. All other values check out.

### 3. Typography (9/10)

Type scale usage is correct throughout:
- Section headings: `text-sm` (13px), `font-heading font-semibold uppercase tracking-wider` -- matches AQ-013 section header pattern exactly.
- Labels: `text-xs` (12px), `text-[var(--text-tertiary)]` -- correct tertiary metadata treatment.
- Inputs: `text-base` (16px) -- correct for iOS Safari zoom mitigation (AQ-005).
- Error text: `text-xs text-error` -- appropriate scale for inline validation.
- Dialog heading: `text-sm font-heading font-semibold uppercase tracking-wider` -- matches Hearth heading signature.

No off-scale sizes. No incorrect weights. Monospace correctly absent (no data-display elements in the create dialog).

### 4. Color Usage (8/10)

All colors reference semantic tokens:
- `var(--text-tertiary)` for labels
- `var(--status-error)` for delete button and invalid cron preview
- `btn-primary` for primary actions (forest green via DaisyUI)
- `btn-ghost` for secondary actions

No hardcoded hex values. Status is communicated through content (text color on Delete button), not structure (AQ-004 compliance). The delete button uses `text-[var(--status-error)]` on `btn-ghost` rather than `btn-error` -- this is explicitly rationalized in the design and correct per AQ-004.

One area worth noting: the custom cron validation preview uses `text-[var(--status-error)]` for "Invalid cron expression" -- this communicates error through color + text content, satisfying the dual-signal requirement.

### 5. Component Coherence & Consistency (9/10)

The design explicitly maps every UI element to an existing component or DaisyUI primitive (Section 6). Zero new design-system components. This is the correct call -- RoutineCreateDialog is a domain dialog, not a reusable primitive.

Cross-component consistency is strong:
- Dialog pattern matches BetCreateDialog and KnowledgeCreateDialog exactly (native `<dialog>`, JSDOM guard, `showModal()`/`close()`, form reset on open).
- Section headings match WorkTeam and WorkRoutine existing patterns.
- KeyValue usage in the detail page matches the existing configuration section.
- Action bar layout extends the existing pattern (Pause/Resume, Trigger Now) with Delete added at right end.

The schedule picker is correctly inline (not a separate component), matching the design's "zero component budget impact" claim.

### 6. States & Feedback (8/10)

All states are thoroughly documented in Section 7:

**RoutineCreateDialog:** Empty, Partially filled, Valid, Submitting, Error, Success -- all 6 states defined with clear transitions and copy.

**Delete confirmation:** Idle, Confirming, Deleting, Success, Error -- 5 states covering the complete lifecycle.

**Schedule picker:** Preset selected, Custom selected, Custom valid, Custom invalid -- 4 states.

**Inline edit:** Display, Editing, Saving -- 3 states per field.

**Gap:** The design does not specify what happens if the PATCH for inline edit fails. Section 3a describes Display/Editing/Saving but no Error state for inline edit. The create dialog and delete flow both have error states, but inline edit is missing one. This is a minor gap -- the builder will likely add it, but the design should specify the error copy and behavior.

### 7. Accessibility (8/10)

Strong accessibility coverage:
- Native `<dialog>` with `aria-modal="true"` provides correct modal semantics.
- Focus management specified: dialog open focuses first field, close returns focus to trigger button, inline edit focuses the input, delete confirmation focuses Cancel (safe default).
- Keyboard navigation: Escape closes dialog (native), Enter submits, Tab cycles fields.
- Error messages use `role="alert"` for screen reader announcements.
- All buttons have `min-h-[44px]` for AQ-015 touch targets.
- Form fields use `<label>` elements.

**Minor gap:** The inline edit pencil icon's `aria-label` is not specified. When the pencil icon appears on hover, screen reader users navigating by keyboard would need to understand it is an "Edit" button. The design should specify `aria-label="Edit {field name}"`.

### 8. Anti-Slop Check (9/10)

No AI aesthetic tells detected:
- No purple/indigo gradients.
- No centered hero layout.
- No emoji icons.
- No oversized padding.
- No generic card grid.
- No glass morphism.
- No gradient-on-text.
- No marketing superlatives in copy.

The design is restrained and functional. The rejected directions (Section 5) show deliberate restraint: full-page form rejected, multi-step wizard rejected, visual cron builder rejected, toast confirmation rejected. Each rejection is well-rationalized.

The "New routine" button uses "+ New routine" text -- this is a concrete, functional label, not AI-generated filler. The schedule presets are real, actionable values, not Lorem ipsum.

### 9. Premium Polish (7/10)

**Present:**
- Touch targets >= 44px on all buttons (AQ-015).
- Mobile inputs at `text-base` (16px) for iOS Safari zoom (AQ-005).
- Dialog fills screen width on mobile via `min-w-[320px] w-full`.
- Tabular-nums not needed in the create dialog (no numeric display columns).
- Motion: native dialog animation, instant transitions for inline edit/delete confirmation (explicitly chosen, not overlooked).

**Missing:**
- The design does not specify debounce timing for the custom cron preview (Section 4 says "debounced 300ms" but does not specify the motion token). 300ms maps to `--motion-default` (240ms) + buffer. This is acceptable but could be cleaner.
- The inline edit pencil icon's hover transition is not specified. Should it use `--motion-fast` (120ms) for hover?
- No specification of focus ring styling on inline edit inputs. The design system's default focus ring (`outline-2 outline-[var(--accent-primary)]`) should apply, but it is not called out.

---

## Findings

### CRITICAL

None.

### WARNING

1. **[Section 3a] Inline edit missing error state.** The inline edit pattern defines Display/Editing/Saving but no Error state. If PATCH fails, what does the user see? The create dialog and delete flow both specify error handling, but inline edit does not. Recommendation: add an Error state row to Section 3a showing a red error message below the input, same pattern as the create dialog's `text-xs text-error` with `role="alert"`.

2. **[Section 3a] Pencil icon lacks aria-label spec.** The hover-revealed pencil icon needs `aria-label="Edit {field name}"` for keyboard/screen reader users. Without it, the edit affordance is invisible to assistive technology. This is an accessibility gap in the design spec, not a code issue (code can infer it, but the design should specify it).

### SUGGESTION

1. **[Section 4] Cron preview debounce alignment.** The 300ms debounce is reasonable but does not map cleanly to a Hearth motion token. Consider 240ms (`--motion-default`) or noting that debounce timing is a functional concern, not a motion concern, to avoid confusion.

2. **[Section 9, Open question 4] Stub task creation at routine creation time is the right call.** The design asks the architect about stub task timing. The architecture plan correctly answers "at routine creation time." No design action needed, but noting the question is resolved.

3. **[Section 3d] Action bar `min-h-[44px]` not specified for action bar buttons.** The create dialog buttons specify `min-h-[44px]`, but the action bar code example in Section 3d shows `btn btn-ghost btn-sm` and `btn btn-primary btn-sm` without explicit `min-h-[44px]`. The existing WorkRoutine page also lacks this. Recommend adding `min-h-[44px]` to all action bar buttons for AQ-015 compliance, though `btn-sm` may already satisfy the 44px minimum via DaisyUI defaults.

### What's Working Well

1. **Excellent pattern adherence.** The design follows BetCreateDialog and KnowledgeCreateDialog patterns exactly, including JSDOM guards, form state reset, and native dialog semantics. This consistency reduces cognitive load for both builders and users.

2. **Strong rejection rationale.** Section 5's seven rejected directions are concrete and principled. Each rejection cites a specific reason (restraint, established patterns, spec compliance). This protects against scope creep and gives the architect clear boundaries.

---

## Verdict

Score 8/10 -- advances to architecture. The design is well-grounded in existing patterns, covers all UI surfaces specified by the AA2 spec, and avoids anti-patterns. The two warnings (inline edit error state, pencil icon aria-label) are addressable by the builder without design changes. No structural issues.
