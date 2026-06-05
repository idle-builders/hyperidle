# AB3 Design Critique

DESIGN-CRITIQUE: variant=approved score=8/10  rounds=1  axes: H:8 S:8 T:8 C:7 Co:7 St:8 A:7 AS:9 PP:7

**Verdict:** PASS. Average 7.67, above the 7.0 threshold. One round sufficient -- no structural issues requiring iteration. Findings below are for the builder to address during implementation, not blockers for advancing to architecture.

---

## AC Coverage Audit

| AC | Covered? | Notes |
|----|----------|-------|
| AC-1: Default agents with descriptions | YES | Section 1 roster cards with `findRoleCatalogEntry(role)?.description` fallback to raw role string. |
| AC-2: Soul edit with guided flow | YES | Section 3.2 guidance text + soul textarea pre-fill + template button. |
| AC-3: Category-aware editing | YES, with caveat | Strategy note, disabled config fields, personal fully editable. Caveat: Tag amber variant does not exist (see CRITICAL-1). |
| AC-4: Harness and model tier adjustable | YES | Section 3.3 configuration toggle with three fields. |
| AC-5: Add custom agent (10% flow) | YES | Section 4 create dialog with name input, role select, template auto-load. |
| AC-6: First-time hint | YES | Section 2 with `review-agents` hint ID, green-tinted banner, "Got it" dismiss. |

---

## CRITICAL

### CRITICAL-1: Tag component spec does not match reality

The design specifies `Tag` with `xs` size and `amber variant` for strategy agents (Section 1: "Category Tag ... Tag component, xs size. Strategy: amber variant"). The actual `Tag` component (`packages/design-system/src/Tag.tsx`) has:
- No `size` prop at all (only `label: string` and `kind?: TagKind`)
- No amber variant. `TagKind` is `"pattern" | "decision" | "failure"` only.
- Without a `kind`, it renders a neutral gray chip.

The architecture plan correctly identified this and resolved it: use neutral Tags for both strategy and personal, differentiate by text content only. The design document itself was not updated to reflect this resolution.

**Impact:** A builder reading the design literally will attempt to use non-existent Tag props, causing type errors and confusion. The visual distinction between strategy and personal agents is reduced to text-only ("Strategy" vs "Personal"), which is weaker than the design intended.

**Recommendation:** The builder should follow the architecture plan's reconciliation (neutral Tags, text differentiation), not the design's amber/xs specification. This is the correct trade-off -- extending TagKind for a single use case is not justified for V1.

### CRITICAL-2: Avatar size mismatch

The design specifies 24px avatars, but Avatar "sm" is 28px (`h-[28px] w-[28px]`). There is no 24px size. The architecture plan acknowledges this and says "use size='sm' (28px)."

**Impact:** Minor visual difference (4px). The builder must use `size="sm"` (28px), not attempt to create a 24px variant.

---

## WARNING

### WARNING-1: Hint banner deviates from existing hint pattern

The design specifies a green-tinted hint banner with "a 6px green dot before the text" following the AQ-016 action-block pattern. The existing hint in WorkTeam (`hintCreateBet`, line 262-279) uses a plain `bg-[var(--surface-container)]` card with no green dot and no green tint. The two hint styles within the same page would be visually inconsistent.

**Recommendation:** Either update the existing `hintCreateBet` to match the new green-tinted style, or use the existing style for the new hint. Consistency within the page matters more than the AQ-016 reference.

### WARNING-2: Missing focus-visible styling on roster cards

The design specifies roster cards as clickable `<button>` elements but does not define their `focus-visible` state. The existing BetRow in WorkTeam has explicit focus styling: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]`. The roster cards should match this pattern.

### WARNING-3: Missing concurrent interaction guard

The design does not specify what happens when a user clicks one agent card while another agent's edit dialog is already open, or when a save is in progress. Should the dialog close and reopen? Should the click be ignored? The builder will need to decide.

### WARNING-4: Mobile viewport detection unspecified

Section 7 states "Configuration section starts expanded on mobile" and "Textarea 8 rows on mobile." The mechanism for detecting mobile vs desktop is not specified (CSS media query vs JS hook). The builder needs a concrete implementation approach.

### WARNING-5: Input/Select component ambiguity

Section 8 component mapping hedges: "Input or DaisyUI input", "Select or DaisyUI select." The design system catalog in DESIGN.md lists `Input` and `Select` as Tier 0 foundation primitives. The design should commit to using the design system components (if they exist with the needed props) or DaisyUI classes directly.

---

## SUGGESTION

### SUGGESTION-1: Add motion tokens for state transitions

The design specifies hover state (`rgba(44,36,26,0.02)` background tint) but does not specify transition duration or easing. Per AQ-013, all transitions should use `--motion-fast` (120ms) for hover and `--motion-default` (240ms) for dialog open/close. The template button disappearance and config toggle should also have explicit motion specs.

### SUGGESTION-2: Dialog aria attributes

The native `<dialog>` should have `aria-labelledby` pointing to the agent name heading and `aria-describedby` pointing to the guidance text. The strategy note should have `role="note"` or `role="status"` for screen readers.

### SUGGESTION-3: Template button edge case

The design says "If textarea already has content: button hidden." But what if the user clears the textarea after editing? Should the template button reappear? The builder should implement: template button visible when `soulPrompt.trim().length === 0 && hasTemplate`.

---

## What's Working Well

- **Soul-first pattern is correct for the 90% case.** The dialog opens with soul textarea front-center, configuration hidden behind a toggle. A team lead who just wants to personalize an agent's style never sees harness/model/sessions fields. This is the right hierarchy.

- **Edit-first, not create-first.** The roster cards with "Customize" affordance naturally guide users to edit existing agents rather than creating new ones. The "+ Add agent" button is below the roster, secondary. This matches the spec's 90/10 split perfectly.

- **Zero new custom components.** The design composes entirely from existing design system primitives (Avatar, Tag, Button) plus DaisyUI classes (dialog, textarea, input, select). Component budget stays at 19. This is disciplined.

- **Comprehensive state tables.** Section 5 enumerates states for roster, edit dialog, and add dialog. All four required states (empty, loading, error, populated) are covered plus domain-specific states (first visit, strategy agent, template available, saving).

- **Correct teamId handling.** Section 4 explicitly calls out passing `teamMembers.id` (not `team.id`) for the create flow. This catches a subtle FK relationship that would otherwise produce a runtime error.

---

## Dimension Breakdown

| # | Dimension | Score | Key Observation |
|---|-----------|-------|-----------------|
| 1 | Visual Hierarchy | 8 | Clear reading order in cards (name > description > category). Dialog prioritizes soul over config. |
| 2 | Spacing & Density | 8 | All values on Hearth 6px grid. Card padding 12px, section spacing 18px, gap 6px. |
| 3 | Typography | 8 | All sizes on scale (10, 12, 13, 17). Section headers follow AQ-013 (12px uppercase semibold tertiary). |
| 4 | Color Usage | 7 | Tokens used correctly. Strategy note uses derived amber tint. Tag amber variant gap reduces visual differentiation between categories. |
| 5 | Component Coherence | 7 | Good reuse of existing primitives. Tag spec mismatch is the main issue. Hint pattern diverges from existing usage. |
| 6 | States & Feedback | 8 | Comprehensive state coverage. Missing concurrent interaction guard. |
| 7 | Accessibility | 7 | Semantic `<button>` cards, native `<dialog>`. Missing explicit focus-visible on cards and dialog aria attributes. |
| 8 | Anti-Slop | 9 | No AI tells. Dense, purposeful, warm. Distinctively Hearth. |
| 9 | Premium Polish | 7 | Touch targets adequate. Mobile adaptation specified. Missing motion token specs for transitions. |
