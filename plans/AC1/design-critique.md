# AC1 Design Critique -- Structured Outcome Fields

DESIGN-CRITIQUE: variant=approved score=8/10  rounds=1  axes: H:8 S:9 T:8 C:9 Co:9 St:8 A:7 AS:9 PP:8

## Evaluation method

No mockup HTML exists for this workpackage -- the design is a text specification in `plans/AC1/design/approved.md`. Evaluation is against the spec text, cross-referenced against existing page code (WorkBet.tsx, WorkTask.tsx, WorkPortfolio.tsx, BetCard.tsx) and Hearth design tokens (DESIGN.md, AESTHETICS.md, tokens.css, PRINCIPLES.md, aesthetic-quality.md rules).

---

## Dimension Scores

### 1. Visual Hierarchy (8/10)

The design establishes a clear reading order: bet outcome is a dedicated section with a section header following the established pattern (13px semibold uppercase tracking text-tertiary, border-b). The verdict badge is the primary signal, the metadata line is secondary, the summary text is tertiary. Task outcome badges in list rows are positioned before state badges -- correct hierarchy (outcome is the judgment, state is the current phase).

Portfolio verdict filter pills follow the existing team pill pattern -- they sit in the header row among peers, not competing with the bet grid content below.

Session effectiveness is appropriately muted (12px font-mono tabular-nums text-tertiary) -- it is a supporting data point, not a primary signal.

**Finding:** The "Not evaluated" text at 13px text-tertiary is well-chosen. The brief correctly identifies this as the most common state and avoids drawing attention to absence.

### 2. Spacing & Density (9/10)

All spacing values in the spec align with the Hearth 6px grid. Card padding 18px, section gaps 24px, badge padding px-[9px] py-[3px] -- all on-grid. The spec explicitly references existing DaisyUI select/textarea components which inherit established padding. No off-grid values detected.

The inline edit form follows the existing ConsequencePreviewDialog pattern (textarea textarea-bordered text-base resize-none h-20, Cancel btn-xs btn-ghost, Save btn-xs btn-primary). Density is appropriate for the context -- editing an outcome is a focused 2-field interaction, not a dense data-entry form.

### 3. Typography (8/10)

Font sizes from the spec: 13px (section header, "Not evaluated"), 12px (verdict badge, metadata line, session score, filter pills), 14px (summary text), 11px (meta-strip label). All on the Hearth type scale (9/10/11/12/13/14/15/16/17/18/20/24/30). Font weights: 500 (badge, meta-strip value, filter pill), 600 (section header). All on the weight scale (400/500/600/700). Monospace correctly reserved for the effectiveness score number.

**Finding:** The spec correctly specifies tabular-nums on the effectiveness score. This matches AQ-006 (tabular numerals on numeric cells).

### 4. Color Usage (9/10)

The design makes an explicit, well-reasoned decision: verdict badges use the DEFAULT (neutral) badge style (`bg-[var(--surface-container)] text-[var(--text-secondary)]`), NOT color-coded by verdict value. This is a strong design choice that avoids false status signaling -- "refuted" is a valid learning, not an error. All colors trace to semantic tokens. No hardcoded hex values. No decorative color.

Filter pill active state uses the existing team pill pattern (accent-primary border + tinted bg). Inactive uses border-default + transparent bg. Both use semantic tokens.

### 5. Component Coherence & Consistency (9/10)

The design explicitly composes from existing patterns rather than inventing new ones. Every UI element references a specific existing pattern:
- Section header: same as "Tasks", "Artifacts", "Discussion"
- Action button: same as "Add knowledge" (btn-xs btn-ghost)
- Verdict badge: same structural treatment as status badges
- Filter pills: same as team pills
- Meta-strip cell: same pattern as Owner/Status/Started/Cost/Sessions
- Inline form: same textarea/select/button pattern as ConsequencePreviewDialog

No new components required. BetCard gains one optional prop. Zero reimplementation of existing primitives.

### 6. States & Feedback (8/10)

Five states are specified for the bet outcome section: empty/not evaluated, populated, editing, saving, error. All transitions are specified (120ms opacity for inline form, disabled+ellipsis for saving button, text-error below save button for errors). Focus management is specified (focus moves to select on "Record outcome" click, returns to button on cancel/save).

**WARNING:** The spec does not explicitly mention the "loading" state for when the POST/PATCH is pending and the data is being refreshed after save. The "Saving" state covers the mutation itself, but there may be a brief moment between save success and data refresh where the section shows stale data. The pattern from ConsequencePreviewDialog (close dialog + refresh) handles this implicitly, but the design does not call it out.

The task meta-strip outcome cell and session effectiveness score are read-only in AC1 -- no editing states needed. The "populated vs null" distinction is clearly specified for both.

### 7. Accessibility (7/10)

Keyboard navigation is specified: Tab navigates through buttons, Escape cancels the inline form, Enter on Save submits, Enter/Space toggles filter pills. Focus management is specified for open/close transitions.

**WARNING W-1:** The spec does not mention `aria-label` or `role` attributes for the verdict badge pill. Status badges in the existing codebase use `data-status` attributes but badges are typically `<span>` elements. Since the badge is purely informational (not interactive), an `aria-label` may not be strictly required, but the semantic meaning ("Outcome verdict: Validated") should be conveyed. The builder should add appropriate `aria-label` to the verdict badge.

**WARNING W-2:** The inline edit form should have `role="form"` or be wrapped in a `<form>` element to communicate its purpose to screen readers. The spec does not mention this. The ConsequencePreviewDialog uses a `<dialog>` element which has implicit form semantics, but the inline form has no such container.

**WARNING W-3:** Portfolio verdict filter pills should communicate their multi-select nature. The spec says they use `aria-pressed` (implied by "standard button keyboard interaction"), which is correct for toggle buttons. The builder should ensure `aria-pressed` is set per the team pill pattern.

### 8. Anti-Slop Check (9/10)

The design passes the anti-slop check decisively:
- No modals for simple interactions (inline form instead)
- No color-coded badges (explicit rejection of the "red for refuted" temptation)
- No new pages or panels
- No stat card for outcome (rejected as inappropriate for categorical data)
- No hero sections, no gradients, no oversized padding
- Neutral badge style uses surface-container bg -- the "default" variant from AESTHETICS.md AQ-011
- No decorative elements

The rejection list (Section 8) locks out 8 specific anti-patterns. This is thoughtful design constraint, not AI-generated permissiveness.

### 9. Premium Polish (8/10)

- Tabular numerals on session effectiveness score: specified
- Uppercase section headers with wide tracking: follows existing pattern
- Motion timing uses var(--motion-fast) for inline form transition: specified
- Filter pill transitions use var(--motion-default): specified
- Touch targets: filter pills and action buttons use existing DaisyUI components which meet 44px touch target requirements
- Mobile adaptation addressed in Section 6: full-width rendering, natural wrapping

**SUGGESTION:** The spec could specify the exact transition property for the inline form. "120ms opacity transition" is clear, but `transition: opacity var(--motion-fast) var(--motion-ease)` would be more precise and use the Hearth motion ease token explicitly.

---

## CRITICAL

(None)

## WARNING

- **W-1** [approved.md, Section 1.1] Verdict badge accessibility: the badge should carry `aria-label="Outcome: Validated"` (or equivalent) so screen readers convey the semantic meaning, not just the text content. The text "Validated" alone lacks context.
- **W-2** [approved.md, Section 1.1] Inline edit form: the editing state should be wrapped in a `<form>` element with appropriate `aria-label="Record bet outcome"` for screen reader orientation.
- **W-3** [approved.md, Section 1.1] Loading state gap: the design specifies "Saving" (mutation in-flight) but not the brief refresh period after save succeeds. The builder should show the populated state immediately on save success (optimistic update) or keep the "Saving" state until refresh completes.

## SUGGESTION

- **S-1** [approved.md, Section 5] Escape behavior: the spec says "Escape cancels and collapses the form." The builder should ensure Escape does NOT propagate to parent elements (e.g., if a keyboard shortcut listener is mounted on the page).
- **S-2** [approved.md, Section 3.1] Portfolio verdict filter ordering: the pills are listed as "Validated, Refuted, Partial, Inconclusive, Not evaluated." Consider ordering by frequency of use or by the enum order to maintain consistency with the BetOutcomeVerdict type definition.
- **S-3** [approved.md, Section 2.2] Session effectiveness score display: "0.85" as a bare number may be unclear without context. The builder should consider whether a label prefix or tooltip ("Effectiveness: 0.85") would help, especially for first-time users. However, this is a minor polish concern and the bare number is consistent with the "supporting data point" visual weight decision.

## What's Working Well

- **Neutral badge decision.** The deliberate choice to avoid color-coding verdicts is the single best design decision in AC1. It prevents the portfolio from looking like a red/green Christmas tree of judgments and keeps verdicts as neutral learning signals rather than success/failure indicators. This respects Hearth Principle 2 (status through content) and AESTHETICS.md AQ-004 (status through content, not structure).
- **Zero new components.** The design demonstrates genuine composition discipline -- every UI element maps to an existing pattern. This keeps the component budget at 19 and avoids the component-per-feature inflation that plagues AI-generated interfaces.

---

## Verdict

Score 8/10 -- the design advances. It is well-composed, restrained, and makes strong opinionated decisions (neutral badges, inline editing, no new components). The three warnings (W-1, W-2, W-3) are accessibility and state management details that the builder can address during implementation without design changes. No structural rework needed.
