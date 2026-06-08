# Variant A -- Extended Inline Form

## Thesis

Stay as close to the AC1 pattern as possible. The existing inline outcome form gains two more fields (reality summary, learnings) and a side-display of the hypothesis. No structural rethink. The section header stays "Outcome" (not renamed to "Retro"). The validation flow is just a longer version of the AC1 editing form.

## Constraint

Smallest possible change to the existing UI. Reuse the AC1 section structure, the same form patterns (select, textarea, btn), the same section header style. A founder who has used AC1 feels zero surprise.

## User task (1 sentence)

The founder clicks "Record outcome" on a completed bet, sees the hypothesis text above the form, fills in verdict + reality summary + learnings in a vertical stack, optionally clicks "Draft with AI" to pre-fill, and saves.

## Component composition

All existing DaisyUI primitives. No new components.

- Section header: "Outcome" (13px semibold uppercase tracking, border-b border-subtle) -- identical to AC1
- Hypothesis display: a `KeyValue`-style block -- label "Hypothesis" (12px semibold text-secondary) + value (13px text-primary, italic) -- read-only, never editable
- Verdict select: `select select-sm` -- identical to AC1
- Reality summary textarea: `textarea textarea-sm` -- new field, same treatment as AC1 summary
- Learnings textarea: `textarea textarea-sm` -- new field
- "Draft with AI" button: `btn btn-xs btn-ghost` with loading state -- positioned below the hypothesis, above the form fields
- Cancel/Save buttons: identical to AC1

## Information hierarchy

1. **Hypothesis** (top) -- the original prediction, shown as a read-only block with "Hypothesis" label. This is the anchor the founder evaluates against.
2. **Verdict select** -- the structured evaluation (select dropdown)
3. **Reality summary** -- what actually happened (textarea)
4. **Learnings** -- reusable knowledge (textarea)
5. **Actions** -- Draft with AI, Cancel, Save (button row at bottom)

## Layout (editing state)

```
OUTCOME
-----------------------------------------
HYPOTHESIS
"Chunked uploads reduce failure rate by 50%"

                        [Draft with AI]

Verdict:   [select: Validated | Refuted | Partial | Inconclusive]

What happened?
[textarea, 3 rows]

What did you learn?
[textarea, 3 rows]

                        [Cancel]  [Save]
```

## Layout (populated/view state)

```
OUTCOME
-----------------------------------------
[Validated]   Recorded 3d ago by @Founder

HYPOTHESIS
"Chunked uploads reduce failure rate by 50%"

The chunked upload hypothesis held -- failure rate dropped
from 12% to 2.1% across 500 uploads in the test cohort.

LEARNINGS
Next time, run the A/B test for a full week before declaring
success -- the first-day numbers were misleadingly good.

                              [Edit outcome]
```

## All states

### Not evaluated (default)
Same as AC1: "Not evaluated" text + "Record outcome" link-button. Unchanged.

### Populated (validated)
Verdict badge (neutral pill) + "Recorded Xd ago by @Name" metadata line. Below that: hypothesis block (read-only italic), reality summary text, learnings text. "Edit outcome" link-button at bottom right.

### Editing (new/edit)
Hypothesis read-only block at top. "Draft with AI" ghost button below hypothesis. Verdict select, reality textarea, learnings textarea in a vertical stack. Cancel + Save buttons at bottom right.

### AI drafting in progress
"Draft with AI" button shows "Drafting..." and is disabled. The three form fields below are dimmed (opacity 0.5) with a subtle pulse animation. When the draft arrives, fields populate with the suggested values and full opacity returns. The founder can immediately edit.

### AI draft error
Small error text below the "Draft with AI" button: "Draft failed. Fill in manually." in text-xs text-error. The form remains fully usable.

### Saving
Save button shows "Saving..." and is disabled. Same pattern as AC1.

### Save error
Inline error text below Save button. Same pattern as AC1.

## Behavior

### Keyboard
- Tab: hypothesis block (not focusable, skip) -> Draft with AI button -> verdict select -> reality textarea -> learnings textarea -> Cancel -> Save
- Escape: cancels editing, returns to view state. Focus returns to "Record outcome" or "Edit outcome" button.
- Enter on Save: submits the form

### Focus management
- "Record outcome" click: focus moves to verdict select (first editable field)
- "Draft with AI" click: focus stays on the button during loading; after draft arrives, focus moves to verdict select (so founder reviews from top)
- "Cancel" or Escape: focus returns to the trigger button
- Successful save: focus returns to "Edit outcome" button

### Motion
- Form appearance: opacity 0->1 over var(--motion-fast) (120ms) -- same as AC1
- AI draft field population: no animation -- values simply appear (any animation on text insertion would be distracting)
- AI draft dimming: opacity transition on form fields, 120ms

### Mobile adaptation
Full-width, single column. All elements stack vertically. No changes needed -- the vertical stack layout is inherently responsive.

## Signature

This variant's tell: it looks exactly like AC1, just taller. The hypothesis sits as a quiet read-only block above the form. The "Draft with AI" button is an unobtrusive ghost button. A founder who used AC1 would immediately know how to use this.

## Trade-offs

**Good at:** Zero learning curve, zero new patterns, smallest code change, respects component budget.

**Bad at:** The hypothesis is visually undifferentiated from the form fields -- it does not stand out as "the thing you are evaluating against." The vertical stack gets tall (hypothesis + 3 form fields + buttons = ~400px of form), which means the founder scrolls within the section. The side-by-side comparison the spec calls for is absent -- hypothesis is above, not beside, the reality summary.
