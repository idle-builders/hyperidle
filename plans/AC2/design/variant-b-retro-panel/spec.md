# Variant B -- Retro Panel with Side-by-Side Comparison

## Thesis

The validation flow is a distinct reflective act. It deserves a distinct visual treatment that makes the comparison between hypothesis and reality the primary reading experience. The section is renamed "Retro" (not "Outcome") to signal that this is more than recording a verdict -- it is structured reflection.

## Constraint

Optimize for the founder's actual cognitive task: comparing what was predicted against what happened, then extracting learnings. The layout should make the comparison effortless -- the hypothesis and reality should be visually adjacent, not stacked vertically with the hypothesis scrolled off-screen.

## User task (1 sentence)

The founder opens the Retro section on a completed bet, sees hypothesis on the left and the reality/verdict form on the right in a two-column layout, optionally clicks "Draft with AI" to get a suggested reality + learnings, and saves to produce both the outcome record and a knowledge item.

## Component composition

All existing DaisyUI primitives. No new components. One new structural pattern: a two-column layout within the section.

- Section header: "Retro" (13px semibold uppercase tracking, border-b border-subtle)
- Two-column container: CSS grid `grid-cols-2 gap-[18px]` -- left column is the hypothesis anchor, right column is the evaluation form
- Left column: hypothesis block (label + italic text, read-only) + a "what was predicted" framing label
- Right column: verdict select + reality textarea + learnings textarea + action buttons
- "Draft with AI" button: `btn btn-xs btn-ghost` positioned at the top of the right column, before the verdict select
- Cancel/Save buttons: bottom of right column
- On narrow viewports (< 640px): columns stack vertically, hypothesis on top

## Information hierarchy

1. **Section header "Retro"** -- signals this is a reflective section, not just a data field
2. **Hypothesis (left column)** -- the immutable prediction, presented as an anchored reference
3. **Verdict (right column, top)** -- the structured evaluation
4. **Reality summary (right column)** -- what happened, adjacent to the hypothesis
5. **Learnings (right column, below reality)** -- the extracted knowledge
6. **Actions** -- Draft with AI above the form; Cancel/Save at the bottom

## Layout (editing state)

```
RETRO
-----------------------------------------
 PREDICTED                   | WHAT HAPPENED
 "Chunked uploads reduce     | Verdict:  [Validated v]
  failure rate by 50%"       |
                             | [Draft with AI]
                             |
                             | Reality
                             | [textarea, 3 rows,
                             |  "What actually happened?"]
                             |
                             | Learnings
                             | [textarea, 3 rows,
                             |  "What would you do
                             |   differently?"]
                             |
                             |      [Cancel]  [Save]
```

The left column is pinned -- it does not scroll. The right column scrolls if content overflows. The vertical divider between columns is a 1px border-[var(--border-subtle)] line.

## Layout (populated/view state)

```
RETRO
-----------------------------------------
 PREDICTED                   | REALITY
 "Chunked uploads reduce     | [Validated]  3d ago by @Founder
  failure rate by 50%"       |
                             | The chunked upload hypothesis
                             | held -- failure rate dropped
                             | from 12% to 2.1%.
                             |
                             | LEARNINGS
                             | Next time, run the A/B test
                             | for a full week before
                             | declaring success.
                             |
                             |        [Edit]
```

## All states

### Not evaluated (default)
Section header "Retro" with a single-line prompt: "This bet has not been evaluated." + "Evaluate hypothesis" primary ghost button. No two-column layout yet -- the empty state is a single quiet line (matches the AC1 pattern of minimal empty states).

### Populated (evaluated)
Two-column layout. Left: "Predicted" label + hypothesis text. Right: verdict badge + "Xd ago by @Name" + reality summary + "Learnings" label + learnings text. "Edit" link-button at bottom right of the right column.

### Editing (new/edit)
Two-column layout. Left: "Predicted" label + hypothesis text (read-only, always visible). Right: form fields. "Draft with AI" ghost button at top of right column. Verdict select, reality textarea, learnings textarea, Cancel + Save.

### AI drafting in progress
"Draft with AI" button shows "Drafting..." (disabled). The right-column form fields show a skeleton-like pulse (opacity 0.4 with subtle breathing animation). When the draft arrives: verdict select is set, textareas populate, opacity returns to 1. The founder can immediately edit all pre-filled values.

### AI draft error
Red error text below the "Draft with AI" button: "Could not generate draft." The form remains fully usable -- the founder fills in manually.

### Saving
Save button shows "Saving..." (disabled). Same as AC1.

### Save error
Inline error text below Save. Same as AC1.

### No hypothesis recorded
If `bets.hypothesis` is null/empty (bet was shaped without a hypothesis): the left column shows "No hypothesis recorded" in text-tertiary italic. The right column still shows the form -- the founder can still record a verdict, reality, and learnings. The retro knowledge item body will have an empty hypothesis field.

## Behavior

### Keyboard
- Tab order: "Draft with AI" -> verdict select -> reality textarea -> learnings textarea -> Cancel -> Save
- The hypothesis column is not focusable (read-only text)
- Escape: cancels editing, returns to populated or empty state
- Enter on Save: submits

### Focus management
- "Evaluate hypothesis" click: two-column layout appears with opacity transition (120ms). Focus moves to verdict select.
- "Draft with AI" click: focus stays on button during loading. After draft: focus moves to verdict select.
- Cancel/Escape: layout transitions back to populated/empty state. Focus returns to trigger button.
- Successful save: focus returns to "Edit" button.

### Motion
- Section transition (empty -> editing): opacity 0->1 over var(--motion-fast) (120ms)
- Two-column layout appearance: no stagger, appears all at once
- AI draft population: instant (no typing animation -- that would be theatrical)
- Form field dim during AI draft: opacity transition 120ms

### Mobile adaptation (< 640px)
The two-column layout stacks vertically. Hypothesis block appears first (full-width), then the form fields below. The visual adjacency is lost on mobile, but the reading order is preserved: prediction first, evaluation second.

## Signature

This variant's tell: the two-column layout makes the comparison visible and persistent. The founder never has to scroll up to re-read the hypothesis while filling in reality -- it is pinned on the left. The "Retro" header signals this is a reflective act, not just a data entry form.

## Trade-offs

**Good at:** The side-by-side layout directly serves the cognitive task (compare predicted vs actual). The persistent hypothesis column means no scrolling to re-read the prediction. The "Retro" header sets the right mental frame. The section feels purposeful, not like an afterthought.

**Bad at:** More horizontal space required. On narrow desktops (800px max-width content area), the two columns may feel cramped. The structural difference from AC1 means the founder encounters a new layout pattern (not zero learning curve). The two-column layout inside a section is unique to this section -- no other section on WorkBet.tsx uses it.
