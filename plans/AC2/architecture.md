# AC2 Architecture Plan -- Bet Hypothesis Validation Flow

## Required reading

- `plans/AC2/concept.md` -- locked concept (validation is a flow, not an entity; retro uses kind='reflection')
- `plans/AC2/design/approved.md` -- locked design (two-column layout, atomic two-write save)
- `plans/AC1/architecture.md` -- AC1 technical plan (bet outcome endpoint, schema)
- `packages/db/src/schema.ts` -- bets table (with AC1 outcome fields, hypothesis column), knowledgeItems, knowledgeStrategyFabric
- `packages/server/src/routes/bets.ts` -- POST /:id/outcome (AC1), GET /:id (bet detail)
- `packages/server/src/routes/knowledge.ts` -- POST / (knowledge creation), upsertFabricLayer
- `packages/fabric/src/types.ts` -- KnowledgeKind (includes 'reflection'), KnowledgeLayer
- `packages/web/src/pages/WorkBet.tsx` -- existing bet detail page with AC1 outcome section
- `packages/web/src/types/bet.ts` -- BetDetail type (missing hypothesis field)
- `packages/web/src/hooks/useBet.ts` -- thin fetch hook for bet detail

---

## Plan reconciliation (spec vs reality)

| Spec assumption | Reality | Resolution |
|---|---|---|
| `bets.hypothesis` column exists | Yes: `text("hypothesis")` at schema.ts:125, nullable | No change needed |
| `bets.outcomeVerdict` etc exist (AC1) | Yes: 4 outcome columns on bets table | No change needed |
| `BetDetail` type includes `hypothesis` | No: `packages/web/src/types/bet.ts` has no `hypothesis` field | Add `hypothesis?: string \| null` to BetDetail |
| GET /bets/:id returns hypothesis | Yes: via `...restBet` spread which includes all bet columns | No API change needed |
| POST /bets/:id/outcome exists | Yes: at bets.ts:750. Accepts `{ verdict, summary }` | AC2 extends the schema to accept `learnings` (optional new field for the knowledge item body) OR uses a separate endpoint |
| POST /api/knowledge creates an item | Yes: at knowledge.ts:352. Accepts `{ title, body, format, scopeKind, scopeId, updatedBy, topic?, status? }` | Usable as-is for retro knowledge item creation |
| `upsertFabricLayer` sets `kind` on fabric row | No: only sets `layer`. `kind` defaults to null | Extend or create a new function that also sets `kind='reflection'` |
| `KnowledgeKind` includes 'reflection' | Yes: at fabric/types.ts:57 | No change needed; use 'reflection', not a new 'retro' value |
| `SCOPE_TO_LAYER['bet']` returns null | Yes: at fabric/types.ts:31 | Retro knowledge items have no layer assignment. This is correct per concept doc |
| AI-assisted draft endpoint exists | No: no draft/suggest endpoint in the codebase | Must be created: POST /api/bets/:id/retro/draft |
| WorkBet.tsx shows hypothesis in outcome section | No: hypothesis is not displayed anywhere on the bet detail page | AC2 adds hypothesis display in the left column of the outcome section |

---

## Phase 0 -- Interrogation

**Q1: Single endpoint (POST /bets/:id/retro) or two client-side calls?**

My read: **Single endpoint.** The design doc flags this as an open question. Two client-side calls (outcome PATCH + knowledge POST) create a partial-failure mode that is ugly for the user ("Outcome saved but retro record failed"). A single endpoint that writes both within a transaction is cleaner. The endpoint subsumes the existing POST /:id/outcome behavior -- it does everything outcome does PLUS creates the knowledge item. The existing AC1 outcome endpoint is preserved (it still works for recording verdicts without the full retro flow).

**Q2: Does the AI draft endpoint need to call an actual LLM?**

My read: **Yes, but with a stub for AC2.** The AC2 spec says "AI-assisted drafting" and "a facilitator agent suggests." The full implementation requires an LLM call that reads the bet's session data. However, the AC2 scope says "AI-assisted drafting is cost-capped" -- it is a bounded call. For AC2, the endpoint returns a structured suggestion. The actual LLM integration can be a simple prompt-based call or a stub that returns a placeholder. The important thing is: the endpoint exists, the frontend calls it, the response shape is defined. If the LLM is not available or the call fails, the frontend gracefully falls back to manual entry (per the design: "Could not generate draft. Fill in manually.").

**Q3: Where does the retro knowledge item body get its structured format?**

My read: The server endpoint composes the body from the request fields. The client sends `{ verdict, summary, learnings, hypothesis }` (hypothesis is read-only on the client, sent back for the snapshot). The server constructs the YAML frontmatter + markdown body. The client never constructs the knowledge item body directly -- that is server-side logic.

---

## Types and schemas

### 1. Frontend type update (`packages/web/src/types/bet.ts`)

Add to `BetDetail`:
```typescript
/** The bet hypothesis text. Null if no hypothesis was recorded. */
hypothesis?: string | null;
```

This field already comes from the API (via `...restBet` spread in GET /bets/:id) -- the frontend just needs to type it.

### 2. Retro endpoint request schema (`packages/server/src/routes/bets.ts`)

New Zod schema:
```typescript
const betRetroSchema = z.object({
  verdict: z.enum(BET_OUTCOME_VERDICTS as unknown as [string, ...string[]]),
  summary: z.string().max(2000),
  learnings: z.string().max(4000).optional(),
});
```

- `verdict`: required (same as AC1 betOutcomeSchema)
- `summary`: required (the "reality" textarea content -- this also becomes `outcomeSummary`)
- `learnings`: optional (the "learnings" textarea content -- may be empty)

### 3. Retro endpoint response shape

Returns the updated bet (same shape as GET /bets/:id response) plus the created/updated knowledge item id:
```typescript
{
  ...betDetailShape,
  retroKnowledgeItemId: string
}
```

### 4. AI draft request/response schemas

Request: no body (the endpoint reads the bet's data server-side).

Response:
```typescript
const retroDraftResponseSchema = z.object({
  verdict: z.enum(BET_OUTCOME_VERDICTS as unknown as [string, ...string[]]),
  summary: z.string(),
  learnings: z.string(),
});
```

---

## API endpoints

### POST /api/bets/:id/retro (new -- atomic retro)

**Purpose:** Record bet outcome AND create/update retro knowledge item in one transaction.

**Request body:**
```typescript
{
  verdict: BetOutcomeVerdict,      // required
  summary: string,                 // required, max 2000 chars (the "reality" text)
  learnings?: string               // optional, max 4000 chars
}
```

**Behavior:**
1. Load bet by id (404 if not found)
2. Validate bet status is `completed` or `killed` (400 if not)
3. Read `bets.hypothesis` for the snapshot
4. Begin transaction:
   a. Write outcome fields on bet (same as POST /:id/outcome): `outcomeVerdict`, `outcomeSummary` (= summary), `outcomeRecordedAt`, `outcomeRecordedBy`. If previous outcome existed, append to `revisionLog`.
   b. Compose retro knowledge item body (YAML frontmatter + markdown sections)
   c. Upsert retro knowledge item:
      - Query: `SELECT ki.id FROM knowledge_items ki INNER JOIN knowledge_strategy_fabric ksf ON ksf.knowledge_item_id = ki.id WHERE ki.scope_kind = 'bet' AND ki.scope_id = :betId AND ksf.kind = 'reflection' LIMIT 1`
      - If exists: UPDATE body, title, version++, updatedAt, updatedBy
      - If not exists: INSERT new knowledge_items row + INSERT fabric row with kind='reflection'
   d. Commit transaction
5. Return updated bet + retroKnowledgeItemId

**Response:** 200 with `{ ...bet, retroKnowledgeItemId }`. Same bet shape as GET /bets/:id (with atRisk normalized to boolean).

**Error responses:**
- 404: bet not found
- 400: bet not in completed/killed status
- 400: Zod validation failure

### POST /api/bets/:id/retro/draft (new -- AI draft)

**Purpose:** Generate a suggested verdict, summary, and learnings for the founder to review.

**Request body:** empty (or `{}`)

**Behavior:**
1. Load bet by id (404 if not found)
2. Validate bet status is `completed` or `killed` (400 if not)
3. Load the bet's tasks and their session data (task titles, states, outcome verdicts, session notes)
4. Compose a prompt with:
   - Hypothesis: `bets.hypothesis`
   - Task summaries: title + state + outcome verdict for each task
   - Done condition: `bets.doneCondition`
5. Call the LLM (single call, cost-capped) to generate verdict + summary + learnings
6. Return the suggestion

**Response:** 200 with `{ verdict, summary, learnings }`

**Stub implementation for AC2:** If no LLM provider is configured, or as a first-pass implementation, the endpoint can return a deterministic draft based on task data:
- verdict: derive from task outcome verdicts (if all "met" -> "validated", if any "not_met" -> "partial", etc.)
- summary: a template combining task titles and their outcomes
- learnings: a placeholder prompt ("Based on N tasks, M met their conditions...")

This stub is acceptable for AC2. The full LLM integration is straightforward to add later because the endpoint shape and frontend integration are already in place.

**Error responses:**
- 404: bet not found
- 400: bet not in completed/killed status
- 500: LLM call failed (frontend handles this gracefully)

### Existing endpoints -- no changes

- **POST /api/bets/:id/outcome**: preserved as-is (AC1). Founders who only want to record a verdict without the full retro flow can still use it. The existing outcome section on WorkBet.tsx now routes to the retro endpoint instead.
- **GET /api/bets/:id**: no changes needed. Already returns hypothesis and outcome fields.
- **POST /api/knowledge**: no changes needed. The retro endpoint creates the knowledge item server-side, not via this endpoint.

---

## Knowledge item body format

The server composes this body when creating/updating the retro knowledge item:

```markdown
---
betId: <bet-id>
hypothesis: <hypothesis text or "(no hypothesis recorded)">
verdict: <validated|refuted|partial|inconclusive>
validatedAt: <ISO 8601>
validatedBy: <user-id>
---

## Reality

<summary text from the request>

## Learnings

<learnings text from the request, or "(No learnings recorded)" if empty>
```

Knowledge item metadata:
- `id`: UUID
- `scopeKind`: 'bet'
- `scopeId`: betId
- `topic`: null (bet retros are scoped, not topicalized)
- `title`: "Retro: {bet title}" (derived via same `deriveTitle` function used in GET /bets/:id)
- `body`: the markdown above
- `format`: 'markdown'
- `status`: 'active' (per concept doc: founder-initiated creation constitutes triage)
- `version`: 1 (or incremented on update)
- `updatedBy`: userId from auth context

Knowledge strategy fabric row:
- `knowledgeItemId`: the knowledge item id
- `layer`: null (SCOPE_TO_LAYER['bet'] returns null)
- `kind`: 'reflection'

---

## Frontend changes

### WorkBet.tsx -- Enhanced Outcome Section

The existing AC1 outcome section (lines 1271-1402 of WorkBet.tsx) is replaced with the AC2 validation flow. The replacement:

**New state variables:**
```typescript
// AC2: form fields for the validation flow
const [retroSummaryForm, setRetroSummaryForm] = useState<string>("");
const [retroLearningsForm, setRetroLearningsForm] = useState<string>("");
const [retroDrafting, setRetroDrafting] = useState(false);
const [retroDraftError, setRetroDraftError] = useState<string | null>(null);
```

The existing `outcomeVerdictForm`, `outcomeSummaryForm`, `outcomeSaving`, `outcomeError`, `outcomeEditMode` state variables are reused. The `outcomeSummaryForm` state is repurposed as the "reality" textarea (it maps to the same `outcomeSummary` field).

**New handler: handleRetroDraft**
```typescript
async function handleRetroDraft(): Promise<void> {
  setRetroDrafting(true);
  setRetroDraftError(null);
  try {
    const res = await apiFetch(`/api/bets/${encodeURIComponent(bet.id)}/retro/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error("Draft failed");
    const draft = await res.json() as { verdict: string; summary: string; learnings: string };
    setOutcomeVerdictForm(draft.verdict as BetOutcomeVerdict);
    setOutcomeSummaryForm(draft.summary);
    setRetroLearningsForm(draft.learnings);
  } catch {
    setRetroDraftError("Could not generate draft. Fill in manually.");
  } finally {
    setRetroDrafting(false);
  }
}
```

**Modified handler: handleOutcomeSave**

Replace the existing POST to `/api/bets/:id/outcome` with POST to `/api/bets/:id/retro`:
```typescript
const res = await apiFetch(`/api/bets/${encodeURIComponent(bet.id)}/retro`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    verdict: outcomeVerdictForm,
    summary: outcomeSummaryForm || undefined,
    learnings: retroLearningsForm || undefined,
  }),
});
```

**Layout change: two-column grid**

The editing and populated states use `grid grid-cols-[1fr_1fr] gap-[18px]` with responsive `grid-cols-1` at < 640px. The left column shows the hypothesis; the right column shows the form or the populated content.

### BetDetail type (`packages/web/src/types/bet.ts`)

Add:
```typescript
hypothesis?: string | null;
```

### No other frontend file changes

- WorkPortfolio.tsx: unchanged (AC1 verdict filter already exists)
- WorkTask.tsx: unchanged (AC1 task outcome display already exists)
- BetCard: unchanged
- No new hooks needed (useBet already fetches all data)

---

## Acceptance criteria with verification

| # | Criterion | Verification method |
|---|---|---|
| AC2-1 | POST /api/bets/:id/retro writes bet outcome fields AND creates a retro knowledge item in one transaction | Integration test: POST retro with verdict+summary+learnings on a completed bet. Assert: bet.outcomeVerdict set, knowledge item created with scope_kind='bet', scope_id=betId, fabric kind='reflection'. |
| AC2-2 | The retro knowledge item body contains YAML frontmatter with betId, hypothesis snapshot, verdict, and markdown sections for Reality and Learnings | Integration test: POST retro, read created knowledge item body, parse YAML frontmatter, assert betId+hypothesis+verdict match. Assert body has ## Reality and ## Learnings sections. |
| AC2-3 | Re-validation updates the existing retro knowledge item (upsert), does not create a duplicate | Integration test: POST retro twice for the same bet. Assert only one knowledge item exists for that bet. Assert version incremented on second write. |
| AC2-4 | The hypothesis snapshot in the retro body is immutable -- taken from bets.hypothesis at creation time, not updated if hypothesis changes later | Integration test: POST retro. PATCH bet hypothesis to new value. GET knowledge item. Assert body frontmatter hypothesis matches the ORIGINAL value, not the updated one. |
| AC2-5 | POST /api/bets/:id/retro/draft returns a suggested verdict, summary, and learnings | Integration test: create a completed bet with tasks and sessions. POST retro/draft. Assert 200 with { verdict, summary, learnings } all non-empty strings. |
| AC2-6 | AI draft endpoint returns 400 for non-completed/killed bets | Integration test: POST retro/draft on an active bet. Assert 400. |
| AC2-7 | The WorkBet outcome section shows the hypothesis in a read-only left column during editing | Component/E2E test: render WorkBet for a completed bet with hypothesis. Click "Record outcome". Assert hypothesis text visible in the left column. Assert hypothesis is not editable (no input/textarea). |
| AC2-8 | The WorkBet outcome section shows a "Draft with AI" button that pre-fills form fields | Component/E2E test: click "Draft with AI". Mock the draft endpoint to return known values. Assert verdict select, summary textarea, and learnings textarea are populated with the mock values. |
| AC2-9 | Unvalidated bets show a persistent "Not evaluated" indicator | Already verified by AC1 tests. No new test needed. Verify AC1 tests still pass. |
| AC2-10 | The retro knowledge item uses kind='reflection' on the fabric row, NOT a new kind value | Integration test: POST retro. Query knowledgeStrategyFabric for the created item. Assert kind='reflection'. |
| AC2-11 | Completing validation creates a knowledge item with status='active' (not 'draft') | Integration test: POST retro. Query knowledge item. Assert status='active'. |
| AC2-12 | The populated outcome section shows hypothesis (left) and reality+learnings (right) in a two-column layout | Component/E2E test: render WorkBet for a bet with outcomeVerdict set. Assert two-column layout with hypothesis on left, verdict badge + summary + learnings on right. |
| AC2-13 | BetDetail type includes hypothesis field. npm run check passes | `npm run check` with zero errors. Import BetDetail in a test, assert hypothesis field accessible. |
| AC2-14 | Retro endpoint rejects non-completed/killed bets with 400 | Integration test: POST retro on an active bet. Assert 400 with descriptive error. |
| AC2-15 | Knowledge item title follows "Retro: {bet title}" format | Integration test: POST retro. Assert knowledge item title starts with "Retro: ". |

---

## Ordered task list

### Task 1: BetDetail type update (no dependencies)
**Files:** `packages/web/src/types/bet.ts`
**Action:** Add `hypothesis?: string | null` to BetDetail interface.
**Test:** `npm run check` passes. Verify field is accessible in types.

### Task 2: Retro endpoint -- POST /api/bets/:id/retro (depends on nothing new)
**Files:** `packages/server/src/routes/bets.ts`
**Action:**
1. Add `betRetroSchema` (Zod: verdict required, summary required max 2000, learnings optional max 4000)
2. Add `POST /:id/retro` route handler:
   - Validate bet exists + status completed/killed
   - Read bet.hypothesis for snapshot
   - Transaction:
     - Write outcome fields on bet (reuse AC1 revision log pattern)
     - Compose knowledge item body (YAML frontmatter + markdown)
     - Upsert knowledge item: find existing by scope_kind='bet' + scope_id=betId + fabric kind='reflection'; update if exists, create if not
     - Upsert fabric row with kind='reflection'
   - Return updated bet + retroKnowledgeItemId
3. Use `deriveTitle` (already exists in bets.ts) for knowledge item title
**Test:** Integration tests in `packages/server/src/__tests__/AC2-retro.test.ts`:
- POST retro on completed bet -> 200 + outcome fields set + knowledge item created with correct body
- POST retro on active bet -> 400
- POST retro twice -> only one knowledge item, version incremented
- POST retro without hypothesis -> body frontmatter has "(no hypothesis recorded)"
- POST retro with learnings empty -> body has "(No learnings recorded)" placeholder
- Assert fabric kind='reflection' and status='active'
- Assert knowledge item title = "Retro: {bet title}"
- Assert YAML frontmatter contains correct betId, hypothesis, verdict

### Task 3: AI draft endpoint -- POST /api/bets/:id/retro/draft (depends on nothing new)
**Files:** `packages/server/src/routes/bets.ts`
**Action:**
1. Add `POST /:id/retro/draft` route handler
2. Load bet, validate status
3. Load tasks with session data
4. Generate draft (stub: derive verdict from task outcomes, compose summary from task data)
5. Return `{ verdict, summary, learnings }`
**Test:** Integration tests in `packages/server/src/__tests__/AC2-retro-draft.test.ts`:
- POST draft on completed bet with tasks -> 200 + { verdict, summary, learnings } all present
- POST draft on active bet -> 400
- POST draft on bet with no tasks -> 200 + generic content (the stub should handle empty task lists)

### Task 4: WorkBet.tsx -- Enhanced outcome section (depends on Tasks 1, 2, 3)
**Files:** `packages/web/src/pages/WorkBet.tsx`
**Action:**
1. Add `retroLearningsForm`, `retroDrafting`, `retroDraftError` state
2. Add `handleRetroDraft` handler
3. Replace `handleOutcomeSave` to call POST /retro instead of POST /outcome
4. Replace the outcome section JSX:
   - Editing state: two-column grid. Left: "Predicted" label + hypothesis text. Right: Draft with AI button + verdict select + reality textarea + learnings textarea + Cancel/Save.
   - Populated state: two-column grid. Left: "Predicted" label + hypothesis. Right: verdict badge + metadata + summary + learnings.
   - Not-evaluated state: unchanged from AC1.
5. Add responsive breakpoint: `grid-cols-1` below 640px (use a media query or Tailwind `sm:grid-cols-2`)
6. Initialize form fields from existing bet data when entering edit mode (handle pre-populated case)
**Test:** Component test in `packages/web/src/pages/__tests__/WorkBet.retro.test.tsx`:
- Renders "Not evaluated" when outcomeVerdict is null (same as AC1)
- Shows hypothesis in left column when editing
- Shows "No hypothesis recorded" when hypothesis is null
- "Draft with AI" button triggers draft endpoint
- Draft error shows error message, form remains usable
- Save calls POST /retro with verdict + summary + learnings
- Populated state shows two-column layout with hypothesis, verdict, summary, learnings

### Task 5: Verify existing AC1 tests pass (depends on Task 4)
**Files:** existing test files
**Action:** Run existing AC1 outcome tests. The AC1 POST /bets/:id/outcome endpoint is preserved -- it still works. The WorkBet outcome section visual changes should not break AC1 tests unless they assert specific DOM structure.
**Test:** `npm run test` -- all existing tests green.

---

## Design-it-twice: Retro endpoint shape

### Option A: Single new endpoint POST /bets/:id/retro
- **Shape:** New route handler with its own schema. Transaction wraps bet outcome write + knowledge item upsert. Returns both.
- **Trade-off:** Adds a new endpoint alongside POST /bets/:id/outcome. Two endpoints that write outcome fields is a small duplication. But the retro endpoint is semantically different (it creates knowledge), so the separation is justified.
- **Why chosen:** Atomicity. The frontend makes one call. Partial-failure mode (outcome saved but knowledge failed) is eliminated.

### Option B: Frontend calls two endpoints (POST /outcome + POST /knowledge)
- **Shape:** No new server endpoint. Frontend calls AC1 outcome endpoint, then knowledge creation endpoint sequentially.
- **Trade-off:** No server changes. But: two sequential calls with a failure gap between them. The frontend needs retry/cleanup logic. The knowledge creation endpoint does not know about the bet context (it is generic). The YAML frontmatter composition would have to happen client-side, which is messy.
- **Why rejected:** Partial-failure mode is unacceptable UX. Server-side composition of the knowledge body keeps the structured format as a server contract, not client responsibility.

Decision: **Option A**.

---

## Design-it-twice: Retro knowledge item deduplication

### Option A: Query by scope + fabric kind
- **Shape:** `SELECT FROM knowledge_items ki JOIN knowledge_strategy_fabric ksf ON ... WHERE ki.scope_kind='bet' AND ki.scope_id=:betId AND ksf.kind='reflection'`
- **Trade-off:** Relies on the convention that at most one reflection exists per bet. No DB-level unique constraint. A bug could create duplicates.
- **Why chosen:** Matches the existing pattern (no unique indexes across two tables). Single-user system (founder only). The query is simple and reliable. Duplicates, if created by a bug, are harmless (the Knowledge view shows both, founder deletes one).

### Option B: Dedicated FK on bets table
- **Shape:** Add `retroKnowledgeItemId TEXT` column to bets table. FK to knowledge_items.id.
- **Trade-off:** Guarantees uniqueness (one column, one value). But: another migration, another column on bets (which already has 18 columns), couples the bet table to the knowledge system (layer boundary violation per the three-layer architecture).
- **Why rejected:** Layer boundary violation. The bet table is kernel; the knowledge item is strategy-adjacent. Adding an FK from bets to knowledge_items crosses the boundary. The scope query is sufficient.

Decision: **Option A**.

---

## Security and abuse cases

| Concern | Applicable? | Mitigation |
|---|---|---|
| Rate-limit on POST /retro | Yes | Existing rate-limit middleware applies to all API routes. No new action needed. |
| Rate-limit on POST /retro/draft | Yes, LLM call cost | Existing rate-limit middleware + the endpoint is cost-capped (single LLM call). Additional mitigation: the stub does not call LLM, so cost is zero in AC2. When LLM integration lands, add an explicit per-user per-bet cooldown (e.g., max 3 draft calls per bet per hour). |
| Input trust boundary (summary + learnings) | Yes -- free text from user | Zod `.max(2000)` on summary, `.max(4000)` on learnings. Standard XSS protection via React rendering (no dangerouslySetInnerHTML). No HTML rendering. The YAML frontmatter is server-composed (not from user input), so no YAML injection vector. |
| YAML injection in hypothesis snapshot | Yes -- hypothesis is user-authored text embedded in YAML frontmatter | The hypothesis text is embedded with proper YAML escaping (quoted string with backslash-escaped internal quotes). The server code must use a YAML library or manual escaping to prevent hypothesis text from breaking the frontmatter parser. |
| Secret handling | N/A for AC2 | LLM API keys are existing infrastructure. No new credentials. |
| Path traversal | N/A | No path inputs. |
| SSRF | N/A for AC2 | No outbound URLs (draft endpoint calls LLM via existing infrastructure, not via user-supplied URL). |
| Authorization | Partial | Existing auth middleware applies. AC2 does not add role-based restrictions. Fine for single-founder use case. |

---

## Protected tests

```
protectedTests: [
  "packages/server/src/__tests__/AC1-bet-outcome.test.ts"
]
```

The AC1 outcome test must continue to pass. The POST /bets/:id/outcome endpoint is preserved alongside the new POST /bets/:id/retro endpoint. The AC1 test assertions must not change.

---

## Migrations

No database schema changes. AC2 does not add columns to any table. The retro knowledge item uses the existing `knowledgeItems` and `knowledgeStrategyFabric` tables.

The `hypothesis` field already exists on the `bets` table. The `BetDetail` type adds it as an optional field -- this is additive, not a migration.

No existing symbols are renamed, removed, or moved. All changes are additive:
- New endpoint POST /bets/:id/retro
- New endpoint POST /bets/:id/retro/draft
- New optional field on BetDetail type (hypothesis)
- Enhanced UI in WorkBet.tsx outcome section (replaces the AC1 inline form with the two-column layout)

---

## Risks and ambiguities

1. **YAML frontmatter parsing reliability:** The retro knowledge item body uses YAML frontmatter. The knowledge system currently stores plain markdown in the `body` field. If any downstream consumer parses the body expecting pure markdown (no frontmatter), the YAML block could render as visible text. Mitigation: the block derivation pipeline (`deriveBlocks`) already handles frontmatter (markdown parsers typically strip YAML frontmatter between `---` delimiters). Verify this during implementation.

2. **AC1 outcome section tests may assert specific DOM structure:** The AC2 changes replace the AC1 outcome editing form with a two-column layout. Any AC1 component tests that assert on the exact DOM structure of the outcome section (e.g., finding a textarea by specific selector) may break. Mitigation: Task 5 explicitly verifies AC1 tests. If they break, update the tests to match the new structure while preserving the AC1 behavioral assertions.

3. **Draft endpoint stub vs real LLM:** The stub implementation is deterministic and does not call an LLM. When LLM integration is added (future work), the endpoint response time will increase significantly (seconds vs milliseconds). The frontend already handles this via the "Drafting..." loading state. No architectural change needed for the upgrade.

4. **Knowledge item body size:** The body includes hypothesis (potentially long), summary (max 2000), and learnings (max 4000). Total body size could be ~7000 chars. The `knowledge_items.body` column is `text` (unbounded in Postgres/SQLite). No size concern.

5. **Concurrent retro writes:** Two browser tabs could submit the retro for the same bet simultaneously. The upsert query within the transaction handles this: the second write updates the existing knowledge item (version increment). Last-write-wins. Acceptable for single-founder use case.
