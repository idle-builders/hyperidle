# Synthesis — AG3

**Strongest (only) base:** Full-page parity. The founder's requirement is identity with the knowledge writing experience; the highest-fidelity, lowest-risk way to achieve identity is to mount the bet pitch in the exact `KnowledgeCreate` chassis. There is no design tension to resolve between competing shapes — the target shape already ships.

## Rejected directions (the would-be variants — recorded so /architecture and /write-code don't re-litigate)

1. **Keep the modal, just make it bigger.** Rejected: the founder named the modal itself as "the wrong editor." A taller dialog is still a box squeezed into an overlay; it fails the "feels like writing a document" goal and breaks browser-back. The whole point is to leave the modal.

2. **Commitments inline above the editor (a header strip of team + appetite, then the writing below).** Rejected: crowds the writing surface — the spec's explicit "without interrupting or crowding the writing." Pushing commitments to a peripheral aside is precisely the Knowledge pattern and keeps the writing column the hero.

3. **Two-step wizard (step 1: commitments; step 2: write).** Rejected: ceremony. Bets are written, not configured; a wizard teaches "fill the form first," the opposite of "shape a document." Knowledge has no wizard and neither should bets.

4. **Commitments-after-write modal (write full-page, then a confirm dialog collects team/appetite on Create).** Rejected: re-introduces the modal we just removed and splits a single act into two. Commitments belong visible-while-writing in the aside.

5. **Server-side draft-on-open** (create a `draft` bet row when the page opens, autosave into it like edit). Rejected: directly violates the AC "abandoning creation mid-write does not leave a half-created bet behind." Holding state client-side until an explicit Create is the correct, simpler model — and matches Knowledge.

6. **Make the title an editable input (like Knowledge).** Rejected: the established bet contract derives the title from the pitch (`deriveTitleFromPitch`). A typed title would create two sources of truth for the bet name. The header shows a live derived **preview**, not an editable field. This is the one intentional shape difference from Knowledge.

## Pulled-in elements

None to pull — single variant. The appetite control shape is borrowed from the existing `AppetiteDialog` (`WorkBet.tsx`), not invented.
