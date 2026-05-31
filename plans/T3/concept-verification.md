# T3 Concept Verification

**Concept doc:** `plans/human-authoring/editing-experience-concept.md` (Status: Locked)

T3 introduces no new primitives. It extends the BodyEditor (T1) and auto-save pattern (T2) to the bet pitch surface. All nouns and contracts are already covered by the locked concept doc:

1. **BodyEditor** -- defined in concept doc section "The Editor Component" and section "Editing Surfaces / Tier 1 / 3. Bet Pitch". T3 is the explicit deliverable for this surface.

2. **Auto-save pattern** -- defined in concept doc section "Persistence Changes / Bets: Wire up frontend editing". The contract is `PATCH /api/bets/:id` with `{ field: "description", value, reason }`. (Note: the concept doc says `field: "pitch"` but U1 renamed pitch to description; the server schema and PATCH route already use `description`.)

3. **Status-based mutability** -- concept doc says "Only editable in mutable statuses (shaped, committed, in_progress, paused, behind, blocked, review)". U1 simplified the status enum to 4 values: `draft`, `active`, `completed`, `killed`. The mutable set is `draft` and `active` (matching `DESCRIPTION_MUTABLE_IN_STATUSES` in `packages/server/src/routes/bets.ts`). The immutable set is `completed` and `killed`.

4. **deriveBlocks() read path** -- concept doc section "Relationship: TipTap / deriveBlocks()" confirms read path is untouched. T3 preserves the existing `BetPitch` component for read-only rendering in immutable statuses.

5. **Bet Create dialog** -- concept doc section "Editing Surfaces / Tier 1 / 4. Bet Create" targets replacing the textarea with BodyEditor. T3 delivers this.

**Vocabulary alignment after U1 rename:**
- Concept doc uses `pitch` / `field: "pitch"` -- the server now uses `description` / `field: "description"`
- Concept doc references 7 old statuses -- now simplified to 4 (`draft`, `active`, `completed`, `killed`)
- Frontend `BetDetail.pitch` type still says `pitch` but the API returns `description` -- pre-existing mismatch, documented in architecture

No concept gaps. T3 is a direct application of locked concepts to a new surface.
