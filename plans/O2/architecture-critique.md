# O2 Architecture Critique

**Reviewer:** Phase 2 architecture-critique (producer/evaluator separation)
**Plan:** `plans/O2/architecture.md`
**Spec:** `plans/work-packages/TRACK-O.md` lines 51-101
**Authoritative doc:** `plans/kernel-seperation/architecture.md`

---

## Verdict: PASS (average 8.1 / 10)

The plan is thorough, codebase-grounded, and well-ordered. It advances to the builder with findings noted below.

---

## Dimension Scores

### 1. AC Coverage — 9/10

Every acceptance criterion from TRACK-O.md O2 has a corresponding task:

| AC | Task(s) |
|---|---|
| Extension tables (knowledge_strategy_fabric, task_strategy_fabric) | Task 1 (schema) |
| Kernel table stripping (5 tables, specific columns) | Task 1 (schema) |
| Index drops + recreation on extension tables | Task 1 (schema) |
| @lore on routines governance columns | Task 1 (schema) |
| Knowledge route URL rewrite (10 handlers) | Task 4 |
| Event emissions (knowledge_created, knowledge_accessed, knowledge_archived, knowledge_updated) | Task 4 |
| List route LEFT JOIN with @lore boundary note | Task 4 |
| Old URL shape returns 404 | Task 4 (section 5.4) |
| routeToFounder/routeItem removal from conversations | Task 5 |
| Session end inline review/cost cap removal | Task 6, Task 2 |
| Handoff kernel protocol stays, strategy extracted | Task 3 |
| All queries referencing removed columns updated | Tasks 2-7, Task 10 |
| Grep validation (zero strategy calls in routes) | Task 9 |
| db:generate + db:migrate succeeds | Task 1, Task 9 |
| bun run check + test passes | Task 9 |
| bun dev works | Task 9 |

**Deduction (-1):** The AC says "Session end: inline review creation and cost cap checks removed." The plan addresses session-lifecycle cost writes (Task 2) but does not explicitly call out removing inline review creation from session-end routes. Section 6.2 only addresses `sessions-routes.ts` schema field removal. The `sessions-routes.ts` PATCH handler does not appear to have inline review creation (it just emits `session_ended`), but the AC language implies there should be an audit of all session-end paths for inline strategy calls. The plan's self-critique (section 11) does not flag this gap. The builder should verify that no session-end route performs inline review creation.

### 2. Ordering — 9/10

The dependency graph in section 12 is correct:
- Task 1 (schema) gates everything else -- you cannot fix route type errors until columns are stripped.
- Tasks 2-7 are independent (different files) but 2-3 before 4-7 is a sound recommendation (route files may import from session-lifecycle).
- Task 8 (tests) depends on all code changes.
- Task 10 (frontend) depends on all code changes.
- Task 9 (verification) is the final gate.

The recommended execution order (1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 10 -> 9) is sound.

**Deduction (-1):** Task 8 and Task 10 are listed as depending on Tasks 2-7 completing, but realistically a builder could interleave test updates with code changes to validate each task incrementally. The plan does not suggest per-task typecheck validation between Tasks 2-7, which would catch issues earlier. The plan says "Run bun run check -- fewer type errors now" after Task 2 and "expect type errors in downstream packages" after Task 1, which is good incremental guidance.

### 3. Specificity — 9/10

The plan is exceptionally specific. It names:
- Exact file paths for every change
- Line numbers for existing code (e.g., "conversations.ts:8-9", "knowledge.ts:194-197", "session-lifecycle.ts line 88-90")
- Column names with SQL column names (camelCase for TypeScript, snake_case for migration)
- Complete TypeScript code for extension table definitions
- Complete SQL migration structure
- Detailed route-by-route change descriptions
- Import-by-import removal lists

**Deduction (-1):** The migration file is named `0015_kernel_strategy_separation.sql` but the latest migration in the codebase is `0014_item_artifact_metadata.sql`. This is correct sequencing. However, the plan does not verify whether Drizzle auto-generates migration numbers or uses the filename directly. Minor gap but the builder can resolve at implementation time.

### 4. Risk Identification — 8/10

Section 9 identifies 6 risks with resolution strategies:
- SQLite DROP COLUMN index restriction (9.1) -- correctly identified with migration ordering
- Drizzle generate drift (9.2) -- pragmatic approach
- Session cost data loss (9.3) -- accepted, documented
- Observability traceId (9.4) -- zero-user safety acknowledged
- Handoff SessionContext.traceId (9.5) -- Drizzle type fix specified
- Knowledge status simplification (9.6) -- zero-data migration noted

**Deduction (-2):**

1. **Missing risk: dispatcher dead cases.** The observability dispatcher (`dispatcher.ts`) still has `case "response_recorded"`, `case "bet_committed"` in its switch statement from pre-O1 cleanup. These are dead string literal cases that no longer match any `DomainEvent["type"]`. The plan's section 6.9 addresses only the `traceId` column removal but not whether these dead cases need cleanup. If the exhaustiveness `default: never` check is active, adding new kernel events (like `knowledge_created`) to the switch may require removing these dead cases first. The builder will hit this at compile time.

2. **Missing risk: `knowledgeItems.status` default change.** The current code defaults new knowledge items to `status: "captured"` (knowledge.ts line 300) and split items to `status: "captured"` (line 532). The flag handler sets `status: "provisional"` (line 642). After O2, the kernel status vocabulary is `draft | active | archived`. The plan correctly says to set `status: "draft"` on create and flag, but does not call out that the split handler also hardcodes `"captured"` -- it only mentions "remove `layer`, `scopeId` from new item inserts" in Task 4 step 13. The builder needs to also change the split handler's `status: "captured"` to `status: "draft"`.

### 5. Scope Discipline — 8/10

The plan explicitly addresses scope boundaries:
- Section 1.5: skill-tool imports stay until O3 (not routes, so out of O2 grep AC scope)
- Section 6.8: handoff-protocol service-to-service coupling is O3 scope
- Section 7.1: artifact cost types in shared are gradual deprecation, not O2 frontend work
- Section 11: self-critique discusses "essential rework" vs "scope creep" for bets.ts/rail.ts/artifacts.ts

**Deduction (-2):**

1. **Task 10 (frontend fixes) is scope creep -- but necessary.** The plan acknowledges this in its self-critique and justifies it: `bun run check` must pass monorepo-wide, so frontend references to stripped columns must be fixed. This is correct. However, the AC says nothing about frontend changes, and the authoritative architecture doc assigns frontend updates to O3 Task 7 ("UI import updates"). The plan should have been clearer about whether this overlaps with O3's scope or whether O3 Task 7 is about different frontend changes (strategy type imports from `@hyperidle/fabric`). Reading the O3 AC: "Components referencing removed columns (session costs, `items.costEstimate`, artifact costs) updated" -- this IS O3 scope. The plan's Task 10 would do this work before O3 exists.

   **Resolution:** This is a pragmatic necessity. The builder cannot ship O2 with broken `bun run check`. The plan should note that Task 10 partially pre-empts O3 Task 7, and O3's scope should be adjusted to avoid double-work. This is a finding, not a blocker.

2. **The `formatArtifactCost` function in shared.** Section 7.1 says "keep the types in shared for now" and "set artifact cost to null in the route response." This is pragmatic, but the builder should know that `formatArtifactCost` is still imported and called in `artifacts.ts` -- the function call needs to be removed or the input nullified, not just the response.

### 6. Architecture Alignment — 9/10

The plan aligns with the authoritative architecture doc (`plans/kernel-seperation/architecture.md`):

- Extension table schemas match exactly (section 2 vs architecture.md section 1)
- Column stripping lists match (section 1.1 vs architecture.md "Strip kernel tables" table)
- Knowledge route URL shapes match (section 5.1 vs architecture.md section 3)
- Route purity pattern matches: "routes emit facts; strategy subscribes"
- Skill-tool imports correctly deferred to O3 (matches architecture.md Task 5 -> 6 ordering)
- Observability stays in kernel (matches architecture.md section 4)

**Deduction (-1):** The architecture doc says extension tables go "under a `// --- Strategy: Fabric ---` section" in schema.ts. The plan repeats this in section 2.1. Good alignment. One minor gap: the architecture doc specifies `knowledgeStrategyFabric` has `status: text("status").notNull()` for the 7-state status, but the plan's `createKnowledgeSchema` removes `status` entirely from the kernel create endpoint (section 5.2 step 5: "Remove `status`"). The architecture doc says kernel `knowledgeItems.status` is simplified to 3-state -- the kernel route should still accept a status field for the 3-state transitions. The plan says "kernel defaults to 'draft'" on create, which means status is not user-settable at create time. This is a design decision, not a misalignment, but it is a restriction not in the architecture doc. Acceptable.

### 7. Testability — 7/10

Section 8 maps tests to ACs:

| AC | Test |
|---|---|
| Migration runs | `O2-migration.test.ts` |
| POST /api/knowledge -> 201 + knowledge_created | `knowledge.O2.test.ts` |
| GET /api/knowledge/:id -> knowledge_accessed | `knowledge.O2.test.ts` |
| Old URL -> 404 | `knowledge.O2.test.ts` |
| Grep: zero strategy calls | Validation script (Task 9) |
| Extension tables correct FK | Schema test |

**Deduction (-3):**

1. **No test for extension table creation.** The plan mentions "Extension tables created with correct FK -- Schema test" in section 8.2 but does not specify what this test looks like. Does it verify table existence after migration? FK cascade behavior? Index presence? A builder needs more specificity.

2. **No test for route purity (conversations).** The plan's tests focus on knowledge routes. There is no integration test specified for `POST /api/conversations/items` after removing `routeToFounder`/`routeItem`. The grep check (Task 9) catches the import removal at a static level, but a behavioral test confirming that item creation still works (201 + event emitted) without strategy routing is missing from the test plan.

3. **No test for session route changes.** Sessions lose 3 fields from the create schema and 2 from the update schema. No test is specified to verify that POST /api/sessions still works with the reduced schema, or that sending the removed fields returns 400 (or is ignored).

4. **No test for bets.ts/rail.ts/artifacts.ts changes.** These files undergo significant changes (section 8.1 mentions `bets.session-enrichment.test.ts` and cost-cap tests) but the plan only says "update" without specifying what the updated assertions look like.

### 8. Completeness — 8/10

The plan covers the path from "start" to "AC verified" with 10 tasks plus a verification task. The dependency graph is explicit. The self-critique section caught a missing Task 10 (frontend fixes).

**Deduction (-2):**

1. **Missing step: update `packages/db/src/index.ts` exports.** Section 2.4 mentions this, and Task 1 step 6 covers it, but the plan does not specify which existing exports to remove (the inferred types like `KnowledgeItem` will change shape since columns are removed, but the type names stay). This is implicit but should be explicit for the builder -- no exports are removed, but the new table exports must be added.

2. **Missing step: knowledge route `GET /search` update.** The plan's section 5.1 URL shape table shows `GET /search` as "Keep -- remove layer-specific filtering." But the current search handler (knowledge.ts lines 145-178) queries `knowledgeItems.body`, `knowledgeItems.title`, `knowledgeItems.topic` -- all kernel columns that survive. The search route does NOT reference any stripped columns directly. However, if the search route should also return enrichment data via LEFT JOIN (consistent with the list route), this is not specified. The plan implicitly says search is untouched aside from removing layer filtering, but search never had layer filtering. This is a no-op that should be made explicit.

3. **Missing step: `emitKnowledgeEvent` helper update.** The existing helper (knowledge.ts lines 95-107) emits `knowledge_updated` for all events. After O2, the routes should emit `knowledge_created`, `knowledge_accessed`, `knowledge_archived` as separate event types. Task 4 step 16 says "Update `emitKnowledgeEvent` helper to emit proper typed events" but does not specify whether the helper should be kept (now handling multiple event types) or replaced with per-route inline emissions. The code in section 5.3 shows inline `eventBus.emit(...)` calls, suggesting the helper is replaced. This should be explicit.

### 9. Codebase Accuracy — 8/10

The plan's claims about existing code are verified against the actual codebase:

**Verified correct:**
- `knowledgeItems` has all 9 columns claimed to be stripped (layer, scopeId, kind, attentionScore, relevanceScore, citationCount, lastCitedAt, confidence, meta) -- confirmed at schema.ts lines 330-350
- `tasks` has durability (125), riskTier (126), attentionScore (127), crossTeam (128) -- confirmed
- `sessions` has all 8 columns (cost, costMinor, costCurrency, tokensJson, tokensInput, tokensOutput, traceId, harnessUrl) -- confirmed at schema.ts lines 160-182
- `items` has attentionScore (277), reversibility (284), sandboxResult (286), costEstimate (280) -- confirmed
- `artifacts` has costMoneyMicros (528), costTokensInput (529), costTokensOutput (530), costSettledAt (531) -- confirmed
- `conversations.ts` imports routeToFounder (line 8) and routeItem (line 9) -- confirmed
- `knowledge.ts` imports createRelevanceService (line 15) -- confirmed
- `knowledge.ts` calls computeSignals (lines 194-197) and recomputeScores (lines 274-275) -- confirmed
- `sessions-routes.ts` has harnessUrl, tokensInput, tokensOutput in schemas -- confirmed (lines 19-21, 29-30)
- `session-lifecycle.ts` writes costMinor, costCurrency, traceId on insert (lines 88-90) -- confirmed
- `session-lifecycle.ts` writes costMinor, costCurrency on end (lines 158-159, 219-220) -- confirmed
- `dispatcher.ts` has `createDbTraceIdResolver` reading sessions.traceId (line 151) -- confirmed
- `bets.ts` selects durability, riskTier, attentionScore, crossTeam (lines 222-225) -- confirmed
- `bets.ts` has session enrichment subqueries (lines 237-254) -- confirmed
- `rail.ts` references sessions.costMinor and sessions.cost (line 77) -- confirmed
- `rail.ts` references sessions.tokensJson (line 92) -- confirmed
- `artifacts.ts` has cost columns in ArtifactRow interface -- confirmed
- `tasks.ts` has `traceId: session.traceId ?? ""` (line 176) -- confirmed

**Verified incorrect / imprecise:**

**Deduction (-2):**

1. **Line number drift on knowledge.ts.** The plan claims `knowledge.ts:643` has `attentionScore: 100` in the flag handler. The actual location is line 643 `attentionScore: 100` -- this is correct. The plan claims `knowledge.ts:194-197` for `createRelevanceService(db).computeSignals(...)` -- the actual code at lines 193-197 creates the service and calls computeSignals. Close but the function creation is on line 194 and computeSignals on line 197. These are minor line number approximations, not incorrect.

2. **The plan claims conversations.ts line 60 has `items.attentionScore` in SQL join.** The actual code at line 60 uses `COALESCE(MAX(${items.attentionScore}), 0)` as part of the attention_score sort branch SQL select -- this is confirmed. The plan's description is correct.

3. **The plan says `sessions-routes.ts:19-21,29-30,84-86,121-122` for various schema/insert locations.** Spot-checking: line 19 is `harnessUrl` in createSessionSchema (confirmed), line 29 is `tokensInput` in updateSessionSchema (confirmed), line 84 is `harnessUrl: body.harnessUrl ?? null` in POST handler (confirmed), line 121 is `if (body.tokensInput !== undefined) updates.tokensInput = body.tokensInput` in PATCH handler (confirmed). All accurate.

4. **Missing from inventory: `knowledge.ts` line 300 hardcodes `status: "captured"`, line 532 hardcodes `status: "captured"`, line 642 hardcodes `status: "provisional"`.** These are 7-state values that must be changed to 3-state (`"draft"`) values. The plan's Task 4 steps 10 and 14 address POST create (`status: "draft"`) and flag (`status: "draft"`) but the split handler (step 13) only mentions "remove `layer`, `scopeId` from new item inserts" without mentioning the status value change from `"captured"` to `"draft"`.

---

## Summary of Findings for Builder

1. **Split handler status.** Task 4 step 13 (POST /:id/split) must also change `status: "captured"` to `status: "draft"` for new items created by the split operation. The plan omits this.

2. **Dispatcher dead cases.** The observability dispatcher has `case "response_recorded"`, `case "bet_committed"` as dead string cases that no longer match any DomainEvent type. If the builder adds `case "knowledge_created"` etc., these dead cases may interact with exhaustiveness checking. Plan to clean them up.

3. **Frontend Task 10 partially pre-empts O3 Task 7.** The builder should note this overlap for the O3 planning phase. The frontend changes in Task 10 are minimal (remove column references), while O3's frontend work is broader (strategy type import changes).

4. **`formatArtifactCost` removal.** The plan says keep artifact cost types in shared, but the `artifacts.ts` route calls `formatArtifactCost(...)` which references the removed columns. The builder must remove or nullify this call, not just the response field.

5. **Test gaps.** The builder should add behavioral tests for: (a) conversations POST /items works without strategy routing, (b) sessions POST works with reduced schema, (c) extension table FK cascade works. The plan's test section identifies files to update but lacks specificity on what new assertions look like.

6. **`emitKnowledgeEvent` helper.** The plan should be explicit: replace the single-purpose helper with per-route inline event emissions (as shown in section 5.3 code samples), since the helper currently only emits `knowledge_updated`.

7. **Search route is a no-op.** The `GET /search` route does not reference any stripped columns and does not have layer filtering. No changes needed -- the builder should not waste time auditing it.

---

## Scores Summary

| Dimension | Score |
|---|---|
| 1. AC Coverage | 9 |
| 2. Ordering | 9 |
| 3. Specificity | 9 |
| 4. Risk Identification | 8 |
| 5. Scope Discipline | 8 |
| 6. Architecture Alignment | 9 |
| 7. Testability | 7 |
| 8. Completeness | 8 |
| 9. Codebase Accuracy | 8 |
| **Average** | **8.3** |

**Verdict: PASS** -- average 8.3 >= 7.0 threshold. The plan is ready for the builder with the findings above as guidance.
