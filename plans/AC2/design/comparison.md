# AC2 Design Comparison

## Variant overview

| Dimension | Variant A -- Extended Inline | Variant B -- Retro Panel |
|---|---|---|
| **Signature** | Taller AC1 form with hypothesis above | Two-column hypothesis vs reality comparison |
| **Component count** | 0 new | 0 new (CSS grid layout only) |
| **Density** | Compact but tall (~400px form) | Wide but shorter per-column (~280px right column) |
| **Primary action surface** | Bottom of form (Cancel/Save) | Bottom of right column (Cancel/Save) |
| **State strategy** | Same three states as AC1 (view/editing/empty), plus AI draft states | Same three states plus AI draft states; two-column only in editing/populated |
| **Motion budget** | Identical to AC1 (opacity transition on form) | Identical motion tokens, slightly more layout to transition |
| **Section header** | "Outcome" (same as AC1) | "Retro" (renamed to signal reflective act) |
| **Hypothesis visibility** | Above the form, scrolls out of view as form grows | Pinned in left column, always visible alongside the form |
| **Side-by-side comparison** | No -- vertical stack only | Yes -- hypothesis left, evaluation right |
| **AI draft button position** | Below hypothesis, above form fields | Top of right column, above form fields |
| **Mobile behavior** | No change (already vertical) | Stacks to vertical (loses side-by-side) |
| **Best at** | Zero learning curve; smallest code delta; consistent with AC1 | Serves the cognitive task (compare prediction vs reality); persistent hypothesis reference |
| **Worst at** | Hypothesis scrolls off-screen; no visual comparison; form is very tall | Two-column layout is unique to this section; cramped in 800px container; more complex |

## Anti-convergence check

The variants differ on 5 of the 7 axes:
1. **Hierarchy**: A puts hypothesis above; B puts it beside
2. **Density**: A is narrow+tall; B is wide+short
3. **State strategy**: A uses uniform section; B introduces column structure per state
4. **Composition**: A is a linear form; B is a grid layout
5. **Copy register**: A keeps "Outcome"; B renames to "Retro"

Shared: same action surface position (bottom), same motion tokens. The variants are genuinely different approaches.

## Scoring (in-session self-critique)

| Dimension | A score | B score | Notes |
|---|---|---|---|
| Hierarchy (eye flow) | 5 | 7 | B makes the comparison the primary visual; A buries hypothesis at top |
| Density (info per screen) | 6 | 7 | B uses horizontal space better; A wastes horizontal space with narrow tall form |
| States (completeness) | 7 | 7 | Both handle all required states |
| Action clarity | 7 | 7 | Both have clear Save/Cancel; AI draft button same treatment |
| Component budget | 8 | 7 | A adds nothing; B adds a CSS grid pattern (not a component, but new structural pattern) |
| Consistency with system | 8 | 5 | A matches AC1 exactly; B introduces a novel layout |
| Cognitive task fit | 4 | 8 | B directly serves "compare predicted vs actual"; A requires scrolling |
| Mobile adaptation | 8 | 6 | A is already mobile-friendly; B loses its signature on mobile |
| Copy quality | 5 | 7 | B's "Retro" and "Predicted/What happened" labels frame the task better than A's "Outcome/Hypothesis" |
| **Total** | **58/90** | **61/90** | |
