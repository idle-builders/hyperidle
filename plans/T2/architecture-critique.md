# T2 Architecture Critique -- Knowledge WYSIWYG Editing

**Reviewer:** Phase 2 critique agent
**Artifact:** `plans/T2/architecture.md`

---

## 9-Dimension Architectural Rubric

### 1. Contract Fidelity (9/10)

The plan correctly identifies the existing API contracts and verifies them against the actual code.

**Verified line references against actual code:**
- `updateKnowledgeSchema` at lines 76-84: ACTUAL is lines 76-84. Correct.
- PATCH handler at lines 491-578: ACTUAL starts at line 491. Correct.
- Version comparison at line 510-517: ACTUAL is lines 510-517. Correct.
- Edit log at lines 522-543: ACTUAL is lines 525-543 (off by 3 lines due to diff counting). Close enough -- the range encompasses the logic correctly.
- Version bump at line 548: ACTUAL is line 548. Correct.
- GET handler at lines 273-322: ACTUAL is lines 273-322. Correct.

**API contract documentation is accurate.** The request body shape matches the Zod schema. The 200/409/404 response shapes match the handler code. The 409 response includes `details: { currentVersion }` which is confirmed at lines 513-514 in the actual handler.

Minor deduction: the plan says "Response 200: The updated knowledge item (full row from knowledge_items)" but does not specify the shape of the returned row. The builder will need to define `KnowledgeItemData` to match whatever `knowledgeItems` select returns. The plan does define `KnowledgeItemData` in Section 3.2, but the fields listed there should be cross-checked against the actual schema at build time -- the plan assumes the shape without verifying each column.

### 2. Data Model Accuracy (9/10)

The `KnowledgeItemData` interface (Section 3.2, lines 117-131) lists the expected fields from the API response. Spot-checking against the `knowledge_items` schema: the fields listed (id, title, body, format, status, version, updatedBy, scopeKind, scopeId, topic, createdAt, updatedAt) are all plausible columns for this table. The plan does not claim to add or modify any schema -- correct.

The `AutoSaveStatus` type union (`"idle" | "saving" | "saved" | "error" | "conflict"`) maps cleanly to the design's save indicator states. The state machine diagram (Section 5) is consistent with the type definition.

The plan correctly notes that `version` is a number (the schema has it as an integer column, the Zod schema validates `z.number()`). This is consistent.

### 3. Layer Integrity (10/10)

The plan respects the three-layer architecture:
- **Human Interface (web):** KnowledgeDetail.tsx, KnowledgeCreateDialog.tsx, new hooks
- **Design System:** BodyEditor consumed as a dependency, not modified
- **Meta Layer (server):** API endpoints used as-is, no modifications

No cross-layer violations. The web package imports from `@hyperidle/design-system` (BodyEditor) and uses the server API via `apiFetch`. The design-system package is not modified by T2. The server routes are not modified by T2. Clean layering.

### 4. API Surface (9/10)

**No new API endpoints.** The plan explicitly states "No API changes" (Section 1) and this is correct -- the PATCH endpoint already supports the body + version + updatedBy payload.

The `useAutoSave` hook API (Section 3.1) is well-designed:
- `endpoint`, `version`, `updatedBy` provide the necessary context
- `debounceMs` has a sensible default (1500ms matching the concept doc)
- `onSaved` callback enables version tracking in the parent
- `onConflict` callback enables conflict banner display
- The return value (`status`, `save`, `reset`) is minimal and complete

One observation: the `save` function takes `content: string` directly rather than reading from a ref. This is correct -- it ensures the debounced call uses the content at the time `save()` was called, not a stale ref value. Good design.

Minor concern: the `useAutoSave` hook takes `endpoint` as a plain string but the `version` and `updatedBy` are separate parameters. This means the hook builds the request body internally. An alternative would be a generic `buildPayload` callback, but that would be over-engineering for the current use case. The current API is appropriate.

### 5. Task Decomposition & Dependencies (8/10)

The 7-task breakdown is logical:
- Tasks 1-2 (hooks) are independent and can be built in parallel -- correct
- Task 3 (KnowledgeDetail) depends on both hooks -- correct
- Task 4 (KnowledgeCreateDialog) depends on Task 1 only for the import pattern, but actually only needs BodyEditor which already exists. The dependency arrow from Task 2 to Task 3 is correct (KnowledgeDetail needs useKnowledgeItem), but Task 4 has no dependency on either hook.

**Issue with the dependency graph:** The graph shows Tasks 1 and 2 both feeding into Task 3, and Task 4 sitting independently. But the textual description says "Tasks 3 and 4 are independent of each other but depend on Tasks 1 and 2." Task 4 does NOT depend on Tasks 1 or 2. Task 4 only needs BodyEditor (from T1). The dependency graph is correct in showing Task 4 as independent, but the text contradicts the graph. The builder should follow the graph.

**Task 5 (test fixes) as a separate task is questionable.** Task 3 already specifies rewriting `KnowledgeDetail.edit.test.tsx`. Task 5 says it is "already rewritten in Task 3" and handles "any other test files that break." This is a catch-all task that may have zero work. It could be folded into Task 3. However, having it as a checkpoint is not harmful.

### 6. Risk Assessment (8/10)

The risk register identifies five risks with appropriate mitigations:

1. **TipTap/JSDOM (High/Medium):** The mitigation (mock BodyEditor) is correct and practical. The lore in `use-body-editor.ts` confirms TipTap requires real DOM APIs.

2. **Fixture data (Medium/Low):** The dual data source (API + fixture fallback) is a pragmatic approach. The plan correctly identifies that existing tests depend on fixture data (k1, k2).

3. **Auto-save frequency (Low/Low):** 1500ms debounce is adequate. The dirty-check suggestion is a good enhancement idea.

4. **Conflict banner UX (Low/Low):** Correctly scoped to "reload only" per design.

5. **onChange-on-mount (Medium/Medium):** This is the most important risk. I verified the `use-body-editor.ts` code: it uses `onUpdate` (not `onCreate`), which in TipTap fires on document mutations, not on initial content loading. However, the TipTap documentation notes that `onUpdate` may fire during the initial render in some configurations. The plan's mitigation ("add a dirty flag: only save if content differs from `editContent`") is correct. The builder should implement this guard.

**Missing risk:** The plan does not address what happens if `useKnowledgeItem` returns an API response while the user is in the middle of editing (e.g., if the hook refetches). This could reset the `version` state or the `savedContent`. However, `useFetch` only fetches once (on mount or URL change), so this is a low risk. Still worth noting.

**Missing risk:** The plan does not mention the `useCurrentUser` hook's loading/error states. If the user identity is not yet loaded when auto-save fires, `updatedBy` would be `"human"` (the fallback). This is acceptable for v1 but could lead to incorrect attribution.

### 7. Test Coverage (8/10)

**Unit tests for useAutoSave (Section 6.1):** 9 test cases covering debounce, payload, status transitions, version propagation, conflict, error, cleanup, and reset. This is comprehensive. The test table maps well to the hook's state machine.

**Unit tests for useKnowledgeItem (Section 6.1):** 4 test cases covering happy path, error, and undefined ID. Adequate for a thin wrapper.

**Existing test impact analysis (Section 6.2):** The plan lists 9 test files and correctly identifies which need updates vs. which are unaffected.

**Issue:** The plan lists `KnowledgeDetail.block-popover.test.tsx`, `KnowledgeDetail.thread.test.tsx`, and `KnowledgeDetail.anchored-messages.test.tsx` in the impact analysis table, but these files do not exist in the codebase. I verified: only `.edit.test.tsx`, `.factory.test.tsx`, `.L23.test.tsx`, `.metadata.test.tsx`, `.related.test.tsx`, and `.test.tsx` exist. The plan references phantom test files. The builder will discover this, but it indicates the plan was written with assumed file names rather than verified ones. This is a scoring signal.

**Integration tests (Section 6.3):** The plan correctly suggests verifying the PATCH endpoint contract. It hedges ("likely already exists from O2") which is appropriate -- the builder should check.

**E2E tests (Section 6.4):** 4 Playwright scenarios covering the edit flow, create dialog, factory guard, and conflict banner. This is adequate coverage. The note about requiring a running server with real database is important.

### 8. Completeness (9/10)

All 7 T2 acceptance criteria are covered by the plan:
1. KnowledgeDetail uses BodyEditor -- Task 3 (Section 4.3b)
2. KnowledgeCreateDialog uses BodyEditor -- Task 4 (Section 4.4)
3. Auto-save via PATCH with version -- Task 1 + Task 3 wiring (Sections 4.1, 4.3d)
4. Conflict banner on 409 -- Task 3 (Section 4.3e)
5. Saving indicator -- Task 3 (Section 4.3b)
6. Factory items read-only -- unchanged guard, verified (Section 4.3 notes line 297)
7. Read mode uses deriveBlocks -- unchanged, explicitly noted (Section 1)

No acceptance criteria are missing from the plan.

### 9. Self-Awareness (9/10)

The self-critique section (Section 10) identifies three potential issues:
1. `useKnowledgeItem` being potentially over-engineered (thin wrapper)
2. Conflict banner being potentially under-engineered (reload only)
3. Full-body saves being potentially inefficient for large documents

All three are honest assessments with reasonable counterarguments. The plan also notes test fragility (mocking BodyEditor vs. testing real rendering) with a valid mitigation (E2E covers real rendering).

---

## Findings Summary

### Must-fix (blocking)

None. No findings block advancement.

### Should-fix (important but non-blocking)

**F1. Phantom test files in impact analysis (Section 6.2).** The plan references `KnowledgeDetail.block-popover.test.tsx`, `KnowledgeDetail.thread.test.tsx`, and `KnowledgeDetail.anchored-messages.test.tsx` which do not exist. The builder should rely on the actual file listing, not the plan's table, for determining test impact. The plan's "No change needed" conclusions for those phantom files are vacuously true, so no downstream harm, but the builder should be aware.

**F2. Dependency graph text vs diagram inconsistency (Section 8).** Text says Task 4 depends on Tasks 1 and 2; the diagram correctly shows Task 4 as independent (feeding directly into Task 6). Builder should follow the diagram.

**F3. onChange-on-mount guard not specified as a task step.** The risk register identifies the onChange-on-mount issue and proposes a dirty flag, but this mitigation is not listed in any task's change steps. Task 3 should include "add dirty-check guard in handleContentChange to skip auto-save when content matches editContent." The builder might miss this if they only read the task list.

### Nice-to-have

**F4.** The `useKnowledgeItem` hook could be eliminated entirely by inlining `useFetch<KnowledgeItemData>('/api/knowledge/${id}')` in KnowledgeDetail. The plan acknowledges this (Section 10) and argues for consistency with other hooks. Either approach is acceptable.

**F5.** The plan could specify the behavior when "Done" is clicked during an in-flight save (the design critique also flagged this). Recommended behavior: let the save complete; exit edit mode immediately; the save callback updates version state even though the editor is unmounted. The hook's cleanup should handle the unmount-during-save case (the test "cleans up timer on unmount" covers the debounce timer but not an in-flight fetch).

---

## Aggregate Score: 8.7 / 10

**Verdict: PASS** (threshold >= 7)

The architecture plan is thorough, well-structured, and accurately models the existing codebase. The API contract documentation is verified against actual code. The hook interfaces are clean. The task decomposition is logical. The risk register identifies the right concerns. The three should-fix findings (phantom test files, dependency graph inconsistency, onChange guard not in task steps) are important for the builder to know but do not invalidate the plan.

The plan demonstrates strong self-awareness about its own limitations and makes appropriate scope decisions. It correctly avoids API and schema changes, keeping T2 purely a frontend integration task.
