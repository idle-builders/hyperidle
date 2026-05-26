DESIGN-CLASS: routine  ref=KnowledgeCreateDialog  pattern=KnowledgeCreateDialog.tsx

# Q3 Design Brief — Human-Created Bets

## User task

A founder wants to shape a new bet idea directly from the Work Canvas without round-tripping through a PM agent. They write a pitch in markdown, pick a product, optionally set a cost appetite, and submit. The bet appears in the Shaped column immediately.

## Resolved probes

1. **Entry point:** `+` button in the Shaped column header of Canvas. Opens a native `<dialog>` modal (same pattern as KnowledgeCreateDialog).

2. **Card type:** BetCard on Canvas (existing behavior). PitchCard is not used -- it requires `hypothesis` and `proposer` which the bets table doesn't carry.

3. **Title handling:** No separate title field. The pitch textarea is the source. `deriveTitleFromPitch()` extracts title from first non-empty line server-side. A live preview of the derived title appears above the textarea so the user sees what will become the card title.

4. **Money input:** Inline compound of DaisyUI `<input type="number">` + `<select>` for currency. Not a new design-system component. Composed directly in the dialog.

5. **teamId:** Server resolves from productId. The form sends only productId; POST /api/bets derives teamId. (Architecture must make teamId optional in createBetSchema.)

6. **Optimistic update:** Yes. Bet appears in Shaped column at 40% opacity while POST is in-flight. On success: replace with full BetCard. On failure: remove + show inline error.

## Component inventory (existing, no new primitives)

- `<dialog>` (native HTML, same as KnowledgeCreateDialog)
- DaisyUI: `input`, `textarea`, `select`, `btn`
- Design system: `BetCard`, `Tag`
- Shell: `Canvas` (gains `onNewPitch` callback prop)

## Rejected directions

- **Slide-over panel:** Over-heavy for a 4-field form. Slide-overs are for detail views, not creation. KnowledgeCreateDialog proved the modal pattern works for creation.
- **Inline form in column:** Would displace existing BetCards, fighting with dnd-kit drop zones. Column is for cards, not forms.
- **PitchSelector integration:** The IA doc mentions a PitchSelector overlay with "New Pitch." But PitchSelector is for browsing existing pitches, not creating new ones. Mixing creation into a selection UI conflates two distinct user intents.
- **Separate title field:** The server already derives title from pitch. A separate field creates drift risk (user writes one title, pitch starts with a different heading). One source of truth is better.
- **Full-page creation route:** Overkill. This is a 4-field form, not a multi-step wizard. Modal dialog is proportional to the task.
- **MoneyInput design-system component:** Only one confirmed use case (Q3). Extract if a second consumer appears. Until then, inline composition avoids premature abstraction.
