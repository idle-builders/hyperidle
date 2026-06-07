# AC2 Design Synthesis

## Winner: Variant B (Retro Panel) as base, with elements from Variant A

Variant B scores higher overall (61 vs 58) and crucially wins on the dimension that matters most: cognitive task fit (8 vs 4). The spec says "seeing what was predicted side-by-side with what happened" -- this is B's signature. A vertical stack where the hypothesis scrolls off-screen fails this requirement.

However, B has two weaknesses that A handles better:

1. **Consistency with existing system** (B: 5 vs A: 8): The two-column layout is unique to this section. Pull from A: use the AC1 section header pattern and form field styling exactly. The structural novelty is the two-column grid -- everything inside the columns uses familiar patterns.

2. **The "Retro" rename**: After reflection, keep the section header as "Outcome" (not "Retro"). Reason: the section already exists as "Outcome" from AC1. Renaming it breaks the founder's mental model. The *flow* is a retro; the *section* is still where you record the outcome. The knowledge item created is the retro artifact -- the section header does not need to telegraph this. Pull from A: keep "Outcome" as the section header.

## Elements pulled from Variant A

- **Section header**: "Outcome" (not "Retro") -- preserves AC1 continuity
- **Not-evaluated state**: identical to AC1 -- "Not evaluated" + "Record outcome" button. No two-column layout in empty state.
- **Form field styling**: all DaisyUI primitives match AC1 exactly (select-sm, textarea-sm, btn-xs)
- **Mobile behavior**: stack to vertical with hypothesis on top, form below

## Elements from Variant B that define the approved design

- **Two-column layout in editing and populated states**: hypothesis pinned on left, evaluation form on right
- **Column labels**: "Predicted" (left), "What happened" (right) -- frames the comparison cognitively
- **AI draft button at top of right column**: positioned where the founder's eye lands after reading the hypothesis
- **Persistent hypothesis**: never scrolls out of view during form interaction

## Explicitly rejected

1. **Separate page for validation**: rejected in concept doc. One screen, one save.
2. **Multi-step wizard**: rejected. All fields visible at once.
3. **Modal dialog for validation**: rejected. Inline section on the bet detail page.
4. **Color-coded hypothesis/reality comparison**: rejected. No traffic-light green/red treatment. Neutral text throughout -- the verdict badge is the only status signal.
5. **Animation on AI draft text insertion**: rejected. Values appear instantly. Typing animations are theatrical and waste the founder's time.
6. **"Retro" section header**: rejected. Keep "Outcome" for AC1 continuity.
7. **Full-width form (Variant A's vertical stack)**: rejected. The side-by-side comparison IS the feature.
8. **Sticky left column**: not needed -- the 800px max-width content area means both columns are visible without scrolling in most cases. If the right column content is very long, the founder can scroll, but the hypothesis is always just a glance to the left.
