# R7 Architecture Plan — Knowledge & Bet Cycles

## 1. Summary

R7 verifies and fixes the end-to-end integration of two subsystems:

1. **Knowledge capture cycle:** agent calls `write_memory` or `promote_knowledge` tool -> item persisted to DB -> visible in KnowledgeList API/UI -> materialized into the next session workspace.
2. **Bet lifecycle:** bet transitions draft -> active -> completed via API calls and lifecycle propagation, with shipped bets reflected correctly in WorkPortfolio with accurate ship rate.

This is an integration-verification workpackage. The subsystems exist individually; R7 proves they compose correctly end-to-end.

---

## 2. Data Flow Analysis

### 2.1 Knowledge Capture Cycle

```
Agent tool call (write_memory)
  -> packages/server/src/skill-tools/write-memory.ts handler()
  -> calls fabric create() from packages/fabric/src/knowledge-repository.ts
  -> inserts into knowledgeItems (kernel) + knowledgeStrategyFabric (extension)
  -> GET /api/knowledge (packages/server/src/routes/knowledge.ts) returns item
  -> KnowledgeList (packages/web/src/pages/KnowledgeList.tsx) renders in tab
```

```
Session N+1 provisions
  -> packages/server/src/services/session-provisioning.ts Phase 6
  -> calls materialize() from packages/fabric/src/materialization.ts
  -> materialize fetches via list(db, {layer, scopeId}) from knowledge-repository.ts
  -> writes items to workspace filesystem
  -> agent sees them in context
```

### 2.2 Bet Lifecycle

```
Create bet (POST /api/bets) -> status="draft"
  -> Commit (POST /api/bets/:id/commit) -> status="active"
  -> Agent completes tasks -> lifecycle propagation fires
  -> All tasks terminal -> transitionBetToCompletedAsync -> status="completed"
  -> GET /api/teams returns shipRate = completed / (completed + active)
  -> WorkPortfolio renders ship rate from useTeams() hook
```

---

## 3. Critical Findings — Status Mismatch

### 3.1 write_memory uses fabric KNOWLEDGE_STATUSES vs route uses simplified statuses

**The problem:** Two different status vocabularies coexist.

| Context | Statuses | Source |
|---------|----------|--------|
| `write_memory` tool (fabric create) | `captured, provisional, validated, active, stale, archived, needs_human` | `packages/fabric/src/types.ts` KNOWLEDGE_STATUSES |
| Knowledge route POST/PATCH | `draft, active, archived` | `packages/server/src/routes/knowledge.ts` line 53 |
| KnowledgeList triage filter | `status === "draft"` | `packages/web/src/pages/KnowledgeList.tsx` line 243 |
| write_memory default status | `"active"` | `packages/server/src/skill-tools/write-memory.ts` line 77 |

**Impact on AC-1 ("KnowledgeList triage tab shows draft items created by agents"):**
- `write_memory` defaults to `"active"` which means items appear in the CURATED tab, not triage.
- The fabric KNOWLEDGE_STATUSES includes `"captured"` but NOT `"draft"`.
- The route's simplified set includes `"draft"` but NOT `"captured"`.

**Fix required:** The `write_memory` tool must write items with the kernel-compatible status `"draft"` so they appear in triage. Since `write_memory` calls `fabric.create()` which writes `status` directly to the `knowledgeItems.status` column, and the column is just a text field with no DB-level constraint, writing `"draft"` will work even though the fabric type system doesn't list it. However, the zod validation on the input schema (`z.enum(KNOWLEDGE_STATUSES)`) blocks `"draft"` from being passed as input.

**Resolution:** Change the default status in `write_memory.ts` from `"active"` to `"draft"`. The status field is optional in the input schema, so the default is what agents get. This aligns agent-created items with the triage workflow.

### 3.2 promote_knowledge vs route status vocabulary

The `promote_knowledge` tool transitions between fabric statuses (captured -> provisional -> validated -> active). The AC says "Curated tab shows promoted items." The curated tab filters `status === "active"`. So `promote_knowledge` transitioning to `"active"` correctly puts items in curated.

But `promote_knowledge` expects items to start at `"captured"` — not `"draft"`. If we fix write_memory to default to `"draft"`, then promote_knowledge cannot transition from `"draft"` because `ALLOWED_TRANSITIONS` has no `"draft"` key.

**Resolution:** Add `draft: ["active"]` to ALLOWED_TRANSITIONS in promote_knowledge.ts. This allows a direct promotion from the route's "draft" status to "active" (curated). The existing `captured -> provisional -> validated -> active` chain remains for items that go through the full fabric pipeline.

### 3.3 scopeKind not set by write_memory

The `write_memory` tool uses `fabric.create()` which does NOT set `knowledgeItems.scopeKind`. The schema default is `"factory"`. This means all agent-created items are factory-scoped.

**AC says:** "Knowledge items from agents default to product scope."

**Fix required:** Pass `scopeKind: "product"` and `scopeId: productId` when creating items via write_memory. The tool context has `taskId` — we can look up the task's `teamId` and use that. Or better: add a `productId` field to ToolContext (it already flows through session provisioning as `params.productId`).

Wait — looking at ToolContext:
```typescript
interface ToolContext {
  db, eventBus, agentId, sessionId, taskId, workspacePath, watcher
}
```

ToolContext does NOT have `productId`. But the session-provisioning passes it. The tool context is built in Phase 8 of `provisionSession`. We need to either:
- Add `productId` (teamId) to ToolContext, or
- Look up the task's teamId at write_memory call time.

Looking at the task schema: `tasks.teamId` references `teams.id`. So we can look up the teamId from the task.

**But** — `fabric.create()` stores scopeId in `knowledgeStrategyFabric`, not in `knowledgeItems.scopeKind`. The kernel route POST handler sets `knowledgeItems.scopeKind` directly. So `write_memory` needs to ALSO set `knowledgeItems.scopeKind = "product"` and `knowledgeItems.scopeId = teamId`.

However, `fabric.create()` only inserts these fields into the kernel table:
```
id, topic, title, body, format, status, version, updatedBy, createdAt, updatedAt
```

It does NOT insert `scopeKind` or `scopeId` into the kernel table. The schema default handles scopeKind -> "factory".

**Resolution:** Modify `fabric.create()` (or `write_memory` directly) to set `scopeKind` and `scopeId` on the kernel table. The cleanest approach: `write_memory` should bypass `fabric.create()` and directly insert into the kernel table + call `upsertFabricLayer()` (as the route handler does), OR extend `fabric.create()` input to accept `scopeKind`/`scopeId` for the kernel table.

Given the spec says "No changes to the knowledge materialization algorithm", the simplest fix is to extend `CreateKnowledgeItemInput` to accept optional `scopeKind`/`scopeId` that get written to the kernel table, and have `write_memory` pass them.

---

## 4. Materialization Verification (Phase 6)

### 4.1 How materialization selects items

`materialize()` calls:
- `fetchAllForLayer(db, "L4")` — factory-scope items
- `fetchAllForLayer(db, "L2", config.productId)` — product-scope items
- `fetchAllForLayer(db, "L3", community)` — practice-scope items

`fetchAllForLayer` calls `list(db, {layer, scopeId})` which JOINs `knowledgeStrategyFabric` filtering on `fabric.layer = layer AND fabric.scopeId = scopeId`.

### 4.2 Does write_memory output materialize in the next session?

Currently: `write_memory` creates items with `fabric.layer` set (from input), `fabric.scopeId` set (from input, or null). If the agent writes with `layer: "L2"` and provides a scopeId matching the product, the item WILL be fetched by `fetchAllForLayer(db, "L2", productId)`.

**But** — the `write_memory` tool's layer comes from the agent's input. The input schema accepts `z.enum(KNOWLEDGE_LAYERS)` — ["L0", "L1", "L2", "L3", "L4"]. The agent chooses the layer. If the agent writes to "L0" or "L1", the item won't materialize (materialize only fetches L2, L3, L4).

For AC-2 ("Knowledge items captured in session N are materialized into session N+1"), we need to verify:
1. Items written with appropriate layers (L2-L4) and scopeId DO materialize.
2. The agent must pass the correct scopeId. Currently, the agent doesn't receive scopeId in its context (it's not in ToolContext).

**Fix for materialization:** Add `teamId` (the productId equivalent) to ToolContext so agents can pass it as scopeId when writing L2 items. OR: the tool itself auto-fills scopeId from the task's teamId when writing to L2.

### 4.3 Materialization status filter

Looking at `list()` in knowledge-repository.ts — it does NOT filter by status. All items with matching layer/scopeId are returned regardless of status. So even "draft" items will materialize. This is correct behavior — materialization should include all relevant knowledge regardless of curation status.

---

## 5. Bet Lifecycle Verification

### 5.1 State machine

From `packages/server/src/services/bet-state-machine.ts`:
```
VALID_TRANSITIONS = {
  draft: ["active", "killed"],
  active: ["completed", "killed"],
  completed: [],
  killed: [],
}
```

The AC says "shaped -> committed -> in_progress -> shipped". These are OLD status names (U1 simplified them):
- shaped -> draft
- committed/in_progress -> active
- shipped -> completed

So the actual lifecycle being tested is: `draft -> active -> completed`.

### 5.2 Lifecycle propagation chain

From `packages/fabric/src/services/lifecycle-propagation.ts`:

1. Session ends (outcome="completed") -> task transitions `in_progress -> review`
2. Task reaches terminal state (done/killed) -> if ALL tasks on a bet are terminal, bet transitions `active -> completed`

The bet -> completed transition:
- Sets `status = "completed"`, `completedAt = now()`
- Emits `bet_state_changed` event with `toState: "completed"`

### 5.3 Ship rate in WorkPortfolio

From `packages/server/src/routes/teams-routes.ts` (line 106):
```typescript
const shipRate = total === 0 ? "—" : `${Math.round((completedCount / total) * 100)}%`;
```
Where `total = completedCount + activeBetCount`.

This reads from the `bets` table directly, filtering by `teamId` and status. When a bet transitions to "completed", the next GET /api/teams will include it in `completedCount`, updating the ship rate.

### 5.4 Gaps in bet lifecycle

The transition from `draft -> active` is triggered by `POST /api/bets/:id/commit`. Let me verify this endpoint exists.

Looking at the bets route imports: `transitionBet` is imported. There should be a `/commit` endpoint. The WorkPortfolio Canvas uses `apiFetch('/api/bets/${betId}/commit', { method: 'POST' })`.

---

## 6. Implementation Tasks

### Task 1: Fix write_memory default status (critical for AC-1)

**File:** `packages/server/src/skill-tools/write-memory.ts`
**Change:** Line 77: `status: status ?? "active"` -> `status: status ?? "draft"`

**Rationale:** Agent-created knowledge items should appear in triage (draft) by default, not curated (active). The AC explicitly states "KnowledgeList triage tab shows draft items created by agents."

### Task 2: Add "draft" to promote_knowledge ALLOWED_TRANSITIONS (critical for curation flow)

**File:** `packages/server/src/skill-tools/promote-knowledge.ts`
**Change:** Add `draft: ["active"]` to `ALLOWED_TRANSITIONS` record (after line 33).

**Rationale:** Items created with status "draft" need a path to "active" (curated). The simplest valid transition is draft -> active.

### Task 3: Add teamId to ToolContext and auto-fill scopeKind/scopeId in write_memory

**Files:**
- `packages/server/src/skill-tools/tool-registry.ts` — add `teamId: string` to `ToolContext`
- `packages/server/src/services/session-provisioning.ts` — pass `teamId` (from task lookup or params.productId) into toolContext
- `packages/fabric/src/knowledge-repository.ts` — extend `CreateKnowledgeItemInput` with optional `scopeKind?: string` and `scopeId?: string` (for kernel table)
- `packages/server/src/skill-tools/write-memory.ts` — pass `scopeKind: "product"`, `scopeId: ctx.teamId` to fabric create

**Rationale:** AC says "Knowledge items from agents default to product scope." The tool must set scopeKind/scopeId on the kernel table so the knowledge route's scope filter works correctly and the item shows as product-scoped.

**Implementation detail for fabric.create():** Add optional `scopeKind` and `scopeId` params that get written to the kernel INSERT. Fall back to the schema defaults when not provided (backward compat).

### Task 4: Verify materialization pulls agent-created items (AC-2)

**File:** `packages/fabric/src/__tests__/materialization.test.ts` (new test cases)
**Change:** Add integration test that:
1. Creates a knowledge item via `fabric.create()` with layer="L2", scopeId=productId
2. Calls `materialize()` with matching productId
3. Asserts the item appears in the workspace filesystem

This test verifies the existing materialization logic works with fabric-created items. No code change needed if the test passes — just verification.

### Task 5: Verify bet lifecycle end-to-end (AC-3, AC-4)

**File:** `packages/server/src/__tests__/R7-bet-lifecycle.test.ts` (new)
**Change:** Integration test that:
1. Creates a team + teamMembers + bet (status="draft") + task
2. Commits the bet (POST /api/bets/:id/commit) -> verify status="active"
3. Transitions task to "done" via lifecycle propagation
4. Asserts bet transitions to "completed"
5. Calls GET /api/teams and verifies shipRate includes the completed bet

### Task 6: Verify KnowledgeList triage/curated rendering (AC-1, AC-5)

**File:** `packages/web/src/__tests__/R7-knowledge-cycle.test.tsx` (new)
**Change:** Unit test that:
1. Mocks GET /api/knowledge response with draft and active items
2. Renders KnowledgeList
3. Asserts draft items appear in triage tab
4. Asserts active items appear in curated tab

This verifies the UI-side mapping works. The backend integration (write_memory -> API) is covered by Task 4's test.

### Task 7: End-to-end knowledge flow test (AC-1 + AC-2 combined)

**File:** `packages/server/src/__tests__/R7-knowledge-e2e.test.ts` (new)
**Change:** Integration test that:
1. Calls write_memory tool handler directly (with test DB)
2. Queries GET /api/knowledge and asserts item appears with status="draft"
3. Calls promote_knowledge tool to transition draft -> active
4. Queries GET /api/knowledge and asserts item now has status="active"
5. Calls materialize() and asserts the item appears in workspace (if layer/scopeId correct)

---

## 7. Task Ordering

```
Task 1 (write_memory default status)         ──┐
Task 2 (promote_knowledge transitions)        ──┼── parallel (independent fixes)
Task 3 (ToolContext teamId + scopeKind)       ──┘
                                                │
Task 4 (materialization verification test)    ──┤ depends on Task 3
Task 5 (bet lifecycle test)                   ──┤ independent
Task 6 (KnowledgeList rendering test)         ──┤ depends on Task 1
Task 7 (e2e knowledge flow test)              ──┘ depends on Tasks 1-3
```

---

## 8. Files Changed (Summary)

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/server/src/skill-tools/write-memory.ts` | Fix | Default status "draft", pass scopeKind/scopeId |
| `packages/server/src/skill-tools/promote-knowledge.ts` | Fix | Add "draft" to allowed transitions |
| `packages/server/src/skill-tools/tool-registry.ts` | Extend | Add `teamId` to ToolContext interface |
| `packages/server/src/services/session-provisioning.ts` | Wire | Pass teamId into toolContext |
| `packages/fabric/src/knowledge-repository.ts` | Extend | Accept optional scopeKind/scopeId in create() |
| `packages/server/src/__tests__/R7-bet-lifecycle.test.ts` | New | Bet lifecycle integration test |
| `packages/server/src/__tests__/R7-knowledge-e2e.test.ts` | New | Knowledge cycle integration test |
| `packages/web/src/__tests__/R7-knowledge-cycle.test.tsx` | New | KnowledgeList tab rendering test |
| `packages/fabric/src/__tests__/materialization.test.ts` | Extend | Add materialization verification cases |

---

## 9. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Changing write_memory default breaks existing tests | Medium | Run existing write-memory.test.ts; update assertions that expect "active" to expect "draft" |
| Adding teamId to ToolContext breaks test helpers | Low | ToolContext is constructed in tests explicitly; add teamId to test helper factories |
| promote_knowledge adding "draft" introduces unwanted state paths | Low | "draft" only transitions to "active" — mirrors the existing curated workflow |
| Materialization doesn't filter by status | None | Confirmed: list() has no status filter. All items materialize regardless of draft/active. This is correct. |
| fabric.create() callers outside write_memory | Low | Only write_memory and the fabric test suite call create(). Adding optional params with defaults is backward-compatible. |

---

## 10. Acceptance Criteria Traceability

| AC | Verified By | Key Fix |
|----|-------------|---------|
| AC-1: write_memory/promote_knowledge create items visible in KnowledgeList | Task 7 (e2e test) | Tasks 1, 2, 3 (status + scope fixes) |
| AC-2: Knowledge from session N materializes in session N+1 | Task 4 (materialization test) | Task 3 (scopeKind/scopeId on kernel table) |
| AC-3: Bet transitions full lifecycle (shaped -> ... -> shipped) | Task 5 (bet lifecycle test) | No code fix needed — verify existing works |
| AC-4: Shipped bets in WorkPortfolio with correct ship rate | Task 5 (bet lifecycle test covers GET /api/teams) | No code fix needed |
| AC-5: KnowledgeList triage = draft, curated = active | Task 6 (rendering test) | Task 1 (write_memory default "draft") |

---

## 11. What Does NOT Need Changing

- **Materialization algorithm** — works as designed. Items with correct layer/scopeId in the fabric table will materialize. No changes needed.
- **Bet state machine** — transitions are correct. draft -> active -> completed is the valid path.
- **Lifecycle propagation** — session -> task -> bet chain is implemented and tested.
- **WorkPortfolio / teams-routes ship rate** — calculation is correct: `completed / (completed + active) * 100`.
- **KnowledgeList UI** — tab filtering logic is correct (draft=triage, active=curated). The fix is upstream (write_memory default status).

---

## 12. Self-Critique

**Over-engineering risk:** Task 3 adds `teamId` to ToolContext. An alternative is to look up teamId from taskId inside write_memory. Trade-off: ToolContext extension is cleaner (single lookup in provisioning vs per-tool-call lookup), and other tools may benefit from having teamId available. The per-call approach would add a DB query on every write_memory call. ToolContext extension is the right call.

**Scope creep risk:** The spec says "No changes to the knowledge materialization algorithm." Task 3 modifies `fabric.create()` input, which is upstream of materialization. But the materialization algorithm itself (rankAndBudget, layer selection, file writing) is untouched. Only the data that enters the system changes.

**Missing failure mode:** What if the agent doesn't specify a layer when calling write_memory? The layer field is required in the input schema (`z.enum(KNOWLEDGE_LAYERS)`), so it's always present. However, if the agent writes to L0 or L1, the item won't materialize in sessions (materialize only fetches L2-L4). This is by design — L0/L1 are personal/task-scoped knowledge, not session-level context.
