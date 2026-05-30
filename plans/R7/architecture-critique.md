# R7 Architecture Critique

## Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| 1. Correctness | 8 | Correctly identifies the status vocabulary mismatch, scopeKind gap, and materialization path. One critical type-system conflict unaddressed (see F1). |
| 2. Completeness | 7 | All 5 ACs are traced and covered. Missing details on promote_knowledge type reconciliation. |
| 3. Feasibility | 6 | Task 2 as described is not implementable without additional type changes (see F1). Task 3 scope is underestimated. |
| 4. Risk identification | 7 | Good coverage of backward-compat and concurrency concerns. Misses the type-level impossibility of adding "draft" to a Record<KnowledgeStatus,...>. |
| 5. Specificity | 9 | Exact file paths, line numbers verified correct. Function signatures match reality. |
| 6. Ordering | 9 | Dependencies are correctly sequenced. Parallel tasks are genuinely independent. |
| 7. Testability | 8 | Each task has a clear verification path. Test descriptions are concrete. |
| 8. Simplicity | 7 | Minimal change set for the fixes. ToolContext extension is justified over per-call lookup. One concern about dual-table scope writes (see F3). |
| 9. Alignment | 8 | Respects kernel/strategy separation. No materialization algorithm changes. Layer architecture preserved. |

**Composite: 7.7 / 10 — PASS (above threshold of 7)**

---

## Findings

### F1 (Blocking) — Task 2 has a type-level impossibility

**Plan section:** Task 2, Section 3.2

**Problem:** The plan says "Add `draft: ["active"]` to `ALLOWED_TRANSITIONS` in promote-knowledge.ts (after line 33)." However, `ALLOWED_TRANSITIONS` is typed as `Record<KnowledgeStatus, readonly KnowledgeStatus[]>` where `KnowledgeStatus = "captured" | "provisional" | "validated" | "active" | "stale" | "archived" | "needs_human"`. The string `"draft"` is not a member of `KnowledgeStatus`. This would be a TypeScript compilation error.

Additionally, the `isKnowledgeStatus()` guard at line 68 checks `KNOWLEDGE_STATUSES.includes(row.status)`. An item with `status === "draft"` will fail this guard and return `INVALID_STATE` before the transition logic is even reached.

**Resolution required:** The plan must specify how to handle the status vocabulary split. Options:
1. Widen `KnowledgeStatus` in `packages/fabric/src/types.ts` to include `"draft"` (cascade risk to all consumers of the type).
2. Change `promote_knowledge` to handle "draft" as a special case BEFORE the `isKnowledgeStatus` guard — essentially treating "draft" as a route-layer concept that needs explicit bridging.
3. Have `promote_knowledge` use its own union type that includes both vocabularies.

The plan must pick one and specify the exact change.

### F2 (Non-blocking) — kernel table scopeKind write path needs explicit specification

**Plan section:** Task 3

**Problem:** The plan correctly identifies that `fabric.create()` does NOT write `scopeKind`/`scopeId` to the kernel `knowledgeItems` table (confirmed: lines 127-138 of knowledge-repository.ts only insert `id, topic, title, body, format, status, version, updatedBy, createdAt, updatedAt`). The plan proposes extending `CreateKnowledgeItemInput` with optional `scopeKind`/`scopeId`.

However, `CreateKnowledgeItemInput` already HAS `scopeId` (line 27) — but that `scopeId` is written to the **fabric extension table** (line 145: `scopeId: input.scopeId ?? null`), not the kernel table. Adding a second `scopeKind` field would create ambiguity: does `scopeId` in the input go to the fabric table, the kernel table, or both?

**Recommendation:** The plan should specify: (a) `scopeKind` is new and goes to the kernel INSERT, (b) the existing `scopeId` in `CreateKnowledgeItemInput` continues going to the fabric table, and (c) the kernel `scopeId` column should be set to the same value. This means the kernel INSERT at line 127 needs BOTH `scopeKind` and `scopeId` added. Be explicit about which `scopeId` goes where and whether they are the same value.

### F3 (Non-blocking) — write_memory should also pass scopeId to the fabric extension table

**Plan section:** Task 3, Section 4.2

**Problem:** Currently `write_memory` does not pass `scopeId` in its call to `createKnowledgeItem()`. The plan says to add `scopeKind: "product"` and `scopeId: ctx.teamId` to the kernel table. But for materialization to work, the fabric extension table's `scopeId` ALSO needs to match `config.productId` in the `fetchAllForLayer(db, "L2", config.productId)` call. The plan's data flow in Section 4.2 confirms this: "If the agent writes with `layer: "L2"` and provides a scopeId matching the product, the item WILL be fetched."

Currently `write_memory` passes no `scopeId` in its input to `createKnowledgeItem`, so the fabric extension row gets `scopeId: null`. Even after Task 3's fix sets the kernel table's `scopeId`, materialization filters on the FABRIC table's `scopeId` (via `list()` which filters on `knowledgeStrategyFabric.scopeId`). The kernel `scopeId` is irrelevant to materialization.

**Resolution:** Task 3 must also ensure `write_memory` passes `scopeId: ctx.teamId` (or equivalent) in the `createKnowledgeItem` input so it flows to the fabric extension table. This is likely what the plan intends but the implementation detail in the Files Changed table only mentions "pass scopeKind/scopeId" without specifying both the kernel and fabric paths explicitly.

### F4 (Non-blocking) — Plan references wrong file name for teams routes

**Plan section:** Section 5.3

**Problem:** The plan references `packages/server/src/routes/teams-routes.ts` (line 106). The actual file path is `packages/server/src/routes/teams-routes.ts` — confirmed to exist. However, the plan also references `packages/server/src/routes/bets-routes.ts` (Section 5.4) which does not exist — the actual file is `packages/server/src/routes/bets.ts`.

**Impact:** Low — the builder would find the correct file. But the plan claims precision.

### F5 (Non-blocking) — Missing layer auto-fill logic in write_memory

**Plan section:** Task 3, Section 4.2

**Problem:** The plan proposes adding `teamId` to ToolContext so write_memory can set `scopeKind: "product"` and `scopeId: ctx.teamId`. But it does not address what `layer` the agent passes. The `write_memory` input schema requires `layer` from the agent. If the agent passes `layer: "L0"` or `layer: "L1"`, the item will NOT materialize in the next session — even with correct scopeId on the fabric table.

The plan acknowledges this in Section 4.2 ("If the agent writes to L0 or L1, the item won't materialize") and calls it "by design." This is reasonable but should be noted: the AC "Knowledge items captured in session N are materialized into session N+1" does not qualify "only if the agent chooses the correct layer." The test in Task 4 should explicitly test the agent writing to L2 (the correct layer for product-scope items), and the plan should note that the agent's tool description or system prompt must guide it to use L2 for product knowledge.

---

## Summary

The plan is thorough, well-researched, and demonstrates deep understanding of the kernel/strategy separation. The data flow analysis is accurate. Critical findings F1 and F3 must be addressed before implementation — F1 because the proposed code will not compile, F3 because materialization will silently fail without the fabric-table scopeId fix.

The composite score of 7.7 passes the threshold. The blocking finding (F1) must be resolved by the builder during implementation but does not require a full re-plan — it is a localized type-system issue with clear resolution paths.
