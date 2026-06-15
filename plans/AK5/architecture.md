# AK5 — Architecture: Promote a knowledge item into a bet

## Spec interrogation (before drafting)

- *"Pre-filled with that item's content"* — bet `description` (block-derived markdown, AG3) seeded from `knowledge_items.body`. Title is **derived** from the body (`deriveTitleFromPitch`), not copied from the item title — bets have no title column; the body's first line is the title. The item's title is preserved in the provenance link, not stuffed into the body.
- *"Provenance recoverable"* — must survive and be queryable from the bet. Cheapest recoverable form: a nullable FK column on `bets`. No separate entity needed (1 bet → ≤1 source; born with the bet).
- *"Lands in the normal authoring surface"* — client navigates to `/work/bet/:betId` (existing `WorkBet`, AG3). No new page.
- **Promotion = creation, not mutation of the source.** The source knowledge item is untouched. This rules out doing it as a `promote_knowledge` status transition (that tool moves the item's own status — wrong primitive).
- **Where does the action live — kernel or strategy?** Kernel. This is bet creation + knowledge *editing/reading* (both kernel per `kernel-strategy-split.md` §1). No Strategy port involved.

## Decision: extend `POST /api/bets` additively (not a new endpoint)

Two options weighed:

| Option | New surface | Coupling | Cost |
|---|---|---|---|
| **A. Extend `POST /api/bets` with optional `sourceKnowledgeItemId`** | none | bets route reads `knowledge_items` to copy body when only the id is given | low — one optional field + one lookup |
| B. New `POST /api/knowledge/:id/promote` | new route | knowledge route writes a `bets` row (knowledge layer reaching into bets) | medium — second create path for bets, must duplicate `revisionLog` seeding, `createBetSchema` validation, team resolution |

**Chosen: A.** Option B forks a second bet-creation path (the spec's own constraint warns against forked routes elsewhere in this track, and "reuse the existing bet authoring surface"). Reusing `POST /bets` keeps one bet-creation contract, one `revisionLog` seed, one validation path. The client may send the body it already has (knowledge item is already fetched in `KnowledgeDetail`), so the server lookup is a defensive fallback, not the hot path.

### Contract change (additive, backward-compatible)

`createBetSchema` (`packages/server/src/routes/bets.ts:48`) gains:
```ts
sourceKnowledgeItemId: z.string().optional(),
```
Still `.strict()` (no other new fields). Existing callers (hand-typed bets, `create_bet` tool) omit it → unchanged behaviour.

Handler additions (`router.post("/", …)` ~line 565):
1. If `sourceKnowledgeItemId` present, validate the item exists:
   ```ts
   const [src] = await db.select({ id: knowledgeItems.id })
     .from(knowledgeItems).where(eq(knowledgeItems.id, body.sourceKnowledgeItemId)).limit(1);
   if (!src) return c.json({ error: `Knowledge item '${…}' not found`, code: "VALIDATION_ERROR" }, 400);
   ```
   Guards a dangling provenance FK (the column is a real FK with `onDelete: "restrict"`).
2. `db.insert(bets).values({ …, sourceKnowledgeItemId: body.sourceKnowledgeItemId ?? null })`.
3. revisionLog seed gains a provenance note when set: an extra entry `{ field: "source_knowledge_item", new_value: <id>, reason: "Promoted from knowledge item" }` so the audit trail records the origin even if the column were ever migrated away.

`description` is still required by the schema → the client supplies the body. Server does **not** auto-copy body in v1 (client always has it); the existence check is the only server-side knowledge read. (If a future agent-side caller wants id-only promotion, add a `body ??= src.body` fallback then — flagged, not built.)

## Data model — provenance link

**One nullable self-package FK column on `bets`.** No new table.

`packages/db/src/schema.ts`, `bets` table:
```ts
/**
 * AK5: provenance — the knowledge item this bet was promoted from.
 * null = hand-typed / assistant-drafted bet (no source). Forward, recoverable,
 * one-way link. NOT the reverse of knowledge.scopeKind="bet" (that means
 * "knowledge produced under this bet"). RESTRICT: a source item cannot be
 * hard-deleted while a bet cites it as provenance — provenance must outlive
 * convenience deletes (same rationale as knowledge_edit_log I3 HIGH-2).
 */
sourceKnowledgeItemId: text("source_knowledge_item_id")
  .references(() => knowledgeItems.id, { onDelete: "restrict" }),
```
- Index optional — provenance is read per-bet (already on PK lookup), not range-queried. No `bets_source_ki_idx` unless a "bets from this item" view lands later. Skip it (YAGNI).
- Forward-only migration: `packages/db/drizzle/0035_AK5_bet_provenance.sql` (next after `0034`), generated via `npm run db:generate`. SQLite + Postgres both: `ALTER TABLE bets ADD COLUMN source_knowledge_item_id text REFERENCES knowledge_items(id)`. Existing rows get NULL — backward-safe.

### Wire shape — `GET /bets/:id`

`betDetailResponseSchema` (`packages/server/src/schemas/bet.schema.ts:71`) gains:
```ts
sourceKnowledge: z.object({ id: z.string(), title: z.string() }).nullable(),
```
The route enriches: when `bets.sourceKnowledgeItemId` is set, join/lookup the item's `title` so the UI renders "From knowledge: <title>" without a second client fetch. Null when absent. (Enriched object, not raw id — same enrichment convention the schema's `@lore api-typesafety` already documents.)

`POST /bets` 201 response: include `sourceKnowledgeItemId` in the returned row (it already spreads `...created`, so the new column flows through automatically — verify the response validator allows it; extend `createBetResponse` shape if one exists).

## Web wiring

### Affordance — `packages/web/src/pages/KnowledgeDetail.tsx`
- `KnowledgeOverflowMenu` items array gains a `promote-bet` `MenuItem` (label "Promote to bet", `disabled` when `item.status === "archived"`, `data-testid="knowledge-promote-bet"`), positioned before `change-scope`.
- New handler `handlePromoteToBet` in `KnowledgeDetailView`, mirroring `handleArchive`'s in-flight/error structure:
  ```ts
  const res = await apiFetch("/api/bets", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamId: <resolved>, description: savedContent, sourceKnowledgeItemId: effectiveKnowledgeId }) });
  if (res.ok) { const { id } = await res.json(); navigate(`/work/bet/${id}`); }
  else { setPromoteError(...) }  // reuse archiveError banner pattern
  ```
- **Team resolution on the client:** `createBetSchema` requires `teamId`. Use `useTeams()` (already used in `WorkBetCreate`): single-team → auto-resolve `teams[0].id`; multi-team → the founder picks the team **in the bet editor after landing** is NOT possible (teamId is required at create). Resolution: if exactly one team, send it; if multiple, the promote action opens the existing **team `Select`** inline (a tiny one-field confirm, reusing the AG5 `Select` primitive) OR defaults and lets edit later. **Chosen:** single-team auto-resolves (the common factory case); multi-team falls back to navigating to `/work/bet/new?fromKnowledge=:id` which pre-fills `WorkBetCreate` body + team picker (reuses the AG3 create surface, which already has the team `Select`). This keeps promotion zero-friction for solo founders and reuses the existing create page for the multi-team commitment step. See task 6.
- `body` source: `savedContent` (the live edited body in `KnowledgeDetailView` state) is the truth; falls back to `item.content`.

### `WorkBetCreate` pre-fill path (multi-team / fallback) — `packages/web/src/pages/WorkBetCreate.tsx`
- Read `?fromKnowledge=:id` (or router state). When present: fetch the item (`useKnowledgeItem`), seed `body` initial state with its `body`, and carry `sourceKnowledgeItemId` into the POST payload (`handleCreate`). The team `Select` and appetite aside are already present — the founder sets the team, then Create. Existing navigation to `/work/bet/:id` already happens on success.

### Provenance display — `packages/web/src/pages/WorkBet.tsx` (+ `useBet` hook + `betDetailResponseSchema`)
- `useBet`/`BetDetail` type gains `sourceKnowledge: { id; title } | null`.
- In `WorkBet` header meta row (near status/team), render when non-null:
  ```tsx
  {bet.sourceKnowledge && (
    <RRLink to={`/knowledge/${bet.sourceKnowledge.id}`}
      data-testid="bet-provenance-link"
      className="text-[13px] text-[var(--accent-primary)] hover:underline">
      From knowledge: {bet.sourceKnowledge.title}
    </RRLink>)}
  ```
  No icon, no card (design approved.md).

## Ordered tasks (with file paths)

1. **Schema + migration.** Add `sourceKnowledgeItemId` FK to `bets` in `packages/db/src/schema.ts`; `npm run db:generate` → `packages/db/drizzle/0035_AK5_bet_provenance.sql`; `npm run db:migrate`. *(red: an integration test asserting the column exists + FK restrict.)*
2. **`createBetSchema` + POST handler.** Extend schema with optional `sourceKnowledgeItemId`; add existence check + insert + revisionLog provenance entry in `packages/server/src/routes/bets.ts`. *(red: POST /bets with valid sourceKnowledgeItemId → 201 row carries it; with bogus id → 400; omitted → unchanged.)*
3. **`GET /bets/:id` enrichment.** Join source item title; add `sourceKnowledge` to `betDetailResponseSchema` (`packages/server/src/schemas/bet.schema.ts`) and the route enrichment in `bets.ts`. *(red: GET on a promoted bet returns `sourceKnowledge:{id,title}`; on a hand-typed bet returns null.)*
4. **`useBet` type.** Add `sourceKnowledge` to the bet detail type in `packages/web/src/hooks/useBet.ts`.
5. **Provenance line in `WorkBet`.** Render the backlink in the header meta row. *(component test: renders link when present, absent otherwise.)*
6. **Promote affordance in `KnowledgeDetail`.** Menu item + `handlePromoteToBet` + team resolution (single-team direct POST; multi-team → `WorkBetCreate?fromKnowledge=`) + error banner. *(component test: menu item present/disabled-when-archived; click → POST shape; error path.)*
7. **`WorkBetCreate` pre-fill.** Honour `?fromKnowledge=:id`: seed body, carry `sourceKnowledgeItemId` in payload (`packages/web/src/pages/WorkBetCreate.tsx`).
8. **Stories.** Update `WorkBet.stories.tsx` (with/without provenance), `KnowledgeDetail.stories.tsx` (menu includes promote). Re-bless snapshot net (`npm run ds:bless`) only after reading the diff.
9. **Integration AC proof.** `packages/server/src/routes/__tests__/bets.AK5-promote.integration.test.ts`: promote → `draft` bet exists with item body + recoverable `sourceKnowledgeItemId`; GET enriches; source item unchanged (AC1–AC3, validation scenario).
10. **Verify.** `npm run check && npm run lint && npm run test:all`.

## Out of scope (confirmed)
- Bidirectional sync (edits don't propagate either way).
- Agent-initiated auto-promotion (no `promote_to_bet` harness tool in v1; the POST contract already supports a future one).
- "Bets from this knowledge item" reverse listing view (no index, no read endpoint).
- AK3 decomposition — the promoted bet commits through the normal lifecycle; decomposition fires on commit as it does for any bet.

## Risks / notes
- ⚠️ Multi-team promotion routes through `WorkBetCreate` rather than a one-click create — accepted: it reuses the only surface that already collects the required `teamId`, avoiding a bespoke team-picker dialog. Single-team (factory default) is one click.
- `onDelete: "restrict"` on the FK means archiving (soft) is unaffected, but a future hard-delete of a cited knowledge item must archive/repoint first — documented as `@lore` on the column.
- The response validator (`packages/server/src/middleware/response-validator.ts`) may need the POST /bets response schema extended to allow the new field — check during task 2.
