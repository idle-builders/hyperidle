# AK5 — Concept: Promote a knowledge item into a bet

**Verdict: no new primitive.** AK5 introduces NO New/Reshaped noun. It adds (a) one **action** — "promote knowledge item → draft bet" — and (b) a **provenance link** (a directed reference) between two already-concept-locked primitives. No `/concept` STOP condition is hit.

## Existing nouns (unchanged)

- **Knowledge item** (`knowledge_items`) — title + block-derived markdown `body` + `format` + lifecycle `status` + `scopeKind`/`scopeId`. The promotion **source**. Read-only with respect to this WP; promoting does NOT mutate, archive, or re-status the source. (Out of scope: bidirectional sync.)
- **Bet** (`bets`) — `description` (block-derived markdown body, AG3) + commitments (`teamId`, `costAppetite`) + lifecycle `status` (`draft|active|completed|killed`). The promotion **target**, created in `status="draft"`. Bet authoring IS block editing (AG3) — the existing full-page surface (`WorkBetCreate.tsx` / `WorkBet.tsx` edit mode) and block pipeline are reused verbatim. No new content dialect.

## The two additions, and what they are NOT

### 1. The promote action
A verb, not a noun. Seeds a new **draft** bet's `description` from the source item's `body` and records the provenance link. It is NOT:
- a commit (the human commits — User Sovereignty; AK5 never auto-commits),
- a move/convert (the source knowledge item survives untouched),
- agent-initiated (out of scope: auto-promotion),
- a new editor (reuses AG3).

### 2. The provenance link
A **directed, recoverable reference from the bet back to its source knowledge item.** It is NOT:
- a sync channel (no propagation of edits either direction),
- a new join entity with its own lifecycle/identity (it is an attribute of the bet — see architecture; a free-standing `bet_knowledge_provenance` table would be a new noun we don't need, since the relation is 1 bet → ≤1 source item and is born-with-the-bet),
- the reverse of the existing `scopeKind="bet"` link. The reverse link (knowledge → bet, "Add knowledge" on `WorkBet`) means *"this knowledge belongs to / was produced under this bet."* AK5's forward link means *"this bet was seeded from this knowledge."* **Vocabulary collision avoided:** these are distinct relations with distinct directions and meanings; do not conflate or reuse the `scope` columns for provenance.

## Contracts to honour

- **AG3 (bet-as-block):** `description` is the block-backed body; render + edit go through the existing block pipeline. Reuse `WorkBetCreate` / `WorkBet` edit mode. No second editor, no new storage dialect for bet content.
- **`POST /api/bets`** (`packages/server/src/routes/bets.ts:565`) — `createBetSchema`: `{ teamId, description (min 1), costAppetite?, doneCondition?, hypothesis? }`, `.strict()`. Creates `status="draft"`, seeds `revisionLog`, returns 201 with the row. The promote path reuses this contract (extended additively — see architecture).
- **User Sovereignty (ETHOS):** promotion yields a `draft`; the human reviews/edits and commits. No irreversible action; no new gate bypass.
- **Harness vocabulary (AK1, landed):** N/A to this surface (no system-prompt/sandbox/context-assembly nouns appear in the promote path), but use final nouns if any incidental reference arises.
- **Lands in the normal authoring surface:** after promotion the founder is taken to the standard bet edit experience (`/work/bet/:betId`, AG3) to refine before committing — not a bespoke screen.

## Acceptance criteria → satisfiable

1. *Draft bet pre-filled with item content* → POST creates `draft` bet with `description = item.body`.
2. *Provenance recoverable* → bet stores `sourceKnowledgeItemId`; returned by `GET /bets/:id`.
3. *Lands in normal authoring surface* → navigate to `/work/bet/:betId` (AG3 edit mode) after create.

No blockers. No concept-missing condition.
