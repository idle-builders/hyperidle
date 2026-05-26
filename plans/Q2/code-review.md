# Q2 Code Review: Human-authored knowledge at any scope

**Reviewer:** Phase 4 Code Review (carries Phase 2 design + architecture context)
**Branch:** `feat/Q2-human-authored-knowledge` (`origin/main..HEAD`)
**Date:** 2026-05-26

---

## Verdict: NOT DONE

Two blocking findings prevent merge. Both are client-server payload mismatches that will cause 400 errors in production (hidden by E2E mocks).

---

## Acceptance Criteria Audit

| AC | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| AC-1 | scope_kind column on kernel knowledgeItems table | PASS | Migration 0017 adds scope_kind (NOT NULL, default 'factory') + scope_id (nullable) + ki_scope_idx index. Both SQLite and PG schemas updated. Vitest verifies PRAGMA assertions. |
| AC-2 | ScopeKind type in packages/shared | PASS | SCOPE_KINDS const (7 values) + ScopeKind type exported from @hyperidle/shared. Test verifies length=7 and all values present. |
| AC-3 | "New item" from Knowledge view | PASS | "+ New" button in KnowledgeList header. Clicking opens KnowledgeCreateDialog. Default scope factory. E2E tests confirm. |
| AC-4 | Creation flow fields and validation | **FAIL** | Dialog has scope picker, title, body, but does NOT send `updatedBy` to the server. Server Zod schema requires `updatedBy: z.string()`. Real POST will return 400. See BLOCK-1. |
| AC-5 | Contextual creation from bet detail | PASS (UI) / **FAIL** (API) | "Add knowledge" button on WorkBet page opens dialog with scope=bet locked. Same `updatedBy` missing from payload (BLOCK-1). |
| AC-6 | User-scoped visibility | PASS | GET / filters `scope_kind != 'user' OR updatedBy = userId`. GET /:id returns 404 (not 403). Integration tests cover both authors and non-authors. |
| AC-7 | Scope mutable with version tracking | **FAIL** | ScopeChangeDialog does NOT send `updatedBy` in PATCH payload. Server requires it. Real PATCH will return 400. See BLOCK-2. |
| AC-8 | Same schema for all scopes | PASS | Integration test creates items at all 7 scope kinds, reads them back, asserts identical field set. |
| AC-9 | Fabric layer assignment | PASS | upsertFabricLayer called on creation and scope change. factory->L4, product->L2, practice->L3, task->L1, bet/team/user->null. Integration tests verify fabric rows. |
| AC-10 | Vitest tests | PASS | 900+ lines of integration tests. Scope validation, closed enum, version conflict, edit log, fabric layer. |
| AC-11 | Playwright E2E tests | PASS (mocked) / **SOFT FAIL** | 14 E2E tests pass but all use mocked API responses. The missing `updatedBy` field is invisible to E2E because mocks bypass server validation. |
| AC-12 | bun run verify green | PASS | Builder reports 7/7 tools pass. |

**Summary:** AC-4, AC-5, AC-7 are functionally broken against the real server. AC-11 passes only because mocks hide the defect.

---

## Blocking Findings

### BLOCK-1: KnowledgeCreateDialog omits `updatedBy` in POST payload

**File:** `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx:101-106`
**Contract violated:** Architecture plan section 3.1 — `createKnowledgeSchema` requires `updatedBy: z.string()`.

The dialog builds the POST payload as:
```typescript
const payload: Record<string, unknown> = {
    title: trimmedTitle,
    body: trimmedBody,
    format: "markdown",
    scopeKind: effectiveScopeKind,
};
```

`updatedBy` is absent. The server's Zod validation will reject this with 400. The dialog does not import or call `useCurrentUser()` to obtain the user ID.

**Fix:** Import `useCurrentUser` and add `updatedBy: user?.id ?? "unknown"` to the payload. Alternatively, the server could derive `updatedBy` from `c.get("userId")` when omitted, but that changes the API contract.

### BLOCK-2: ScopeChangeDialog omits `updatedBy` in PATCH payload

**File:** `packages/web/src/pages/knowledge/ScopeChangeDialog.tsx:96-99`
**Contract violated:** Architecture plan section 3.3 — `changeScopeSchema` requires `updatedBy: z.string()`.

The dialog builds the PATCH payload as:
```typescript
const payload: Record<string, unknown> = {
    scopeKind,
    reason: trimmedReason,
    version: currentVersion,
};
```

`updatedBy` is absent. Same root cause as BLOCK-1.

---

## Positive Lens Findings

### Architecture

**Kernel/strategy separation: CORRECT.** scope_kind lives on the kernel table. scopeToLayer lives in fabric. The inline fabric assignment in the route handler is documented as a pragmatic boundary compromise with `@lore` annotations. This matches the architecture plan section 4.2-4.3.

**API contract: MOSTLY CORRECT.** POST /api/knowledge accepts scopeKind/scopeId. PATCH /:id/scope has optimistic locking (version check), edit log, and fabric layer reassignment. GET / and GET /:id filter user-scoped items. All match the plan except the client-side `updatedBy` omission.

**Data model: CORRECT.** Schema matches plan field-by-field. Both SQLite and PG schemas have identical columns. Composite index present. Default 'factory' preserves existing rows.

**Teams endpoint:** `createTeamsRoutes` is co-located in `knowledge.ts` rather than a separate `teams.ts` file as the plan suggests (section 3.6). Acceptable pragmatic choice — avoids a new route file for 15 lines. However, the response shape differs from the plan: returns `{ id, productId, capacity, activeBets, formedAt, dissolvedAt }` instead of `{ id, productId, productName }` (no JOIN to products). The scope picker in the UI is free-text anyway, so this is non-blocking.

**Split handler upgrade:** The split handler at line 686-706 correctly inherits scopeKind/scopeId from the parent item and calls upsertFabricLayer. This is defensive and correct — not in the plan but a sensible extension.

### Design

**Dialog pattern: CORRECT.** Both dialogs follow the ConsequencePreviewDialog pattern — native `<dialog>`, `showModal()` with JSDOM guard, React state sync via useEffect.

**Mobile sizing: CORRECT.** Both dialogs use `min-w-[320px] max-w-[480px] w-full` per the approved design. Inputs use `text-base` to prevent iOS Safari zoom.

**Progressive disclosure: CORRECT.** Scope ID field appears only when `SCOPES_REQUIRING_ID.has(scopeKind)` is true. Hidden for factory and user scopes.

**Private badge: CORRECT.** Rendered as a sibling outside KnowledgeRow with `data-testid="private-badge"` and `aria-label="Private — only visible to you"`. Placed correctly to avoid Playwright strict-mode collision with item titles containing "private".

**Locked scope: CORRECT.** When `lockedScopeKind` is set, scope renders as a read-only Tag (not a select). The combobox is hidden.

**Stories: PRESENT.** Both KnowledgeCreateDialog and ScopeChangeDialog have `.stories.tsx` files with Default, Locked/Closed variants.

### Security

**Closed enum validation: CORRECT.** `z.enum(SCOPE_KINDS)` at the API boundary rejects invalid scope kinds with 400.

**User-scoped visibility: CORRECT.** 404 (not 403) for unauthorized access. Filter logic: `WHERE scope_kind != 'user' OR updated_by = :userId`.

**Optimistic locking: CORRECT.** Version check on PATCH /:id/scope returns 409 on mismatch.

**Input validation: ADEQUATE.** Title max 500 chars on client (maxLength attribute). No server-side title length limit in Zod schema (plan says max 200 — minor deviation). Body has no length limit (existing pattern).

**scope_id existence validation: NOT PRESENT.** Documented as a follow-up in architecture plan section 8. Acceptable for v1.

---

## Negative Lens Findings

### Adversarial

**WARN-1: No `updatedBy` server-side fallback.** When the dialogs are fixed to send `updatedBy`, the value will come from `useCurrentUser()`. But the server also has `c.get("userId")` from auth middleware. The server should derive `updatedBy` from the auth context when omitted, rather than trusting the client-supplied value. A caller can currently spoof `updatedBy` to any string. This is the existing pattern across all knowledge endpoints, so not a Q2 regression, but worth noting.

**WARN-2: Race condition on scope change visibility.** When scope changes from user to non-user, the item immediately becomes visible to all users. But the GET / response is served from a fresh query — no cache invalidation needed. The upsertFabricLayer call is synchronous (SQLite). No race condition in the current single-process architecture.

**WARN-3: Protected test O2-schema-migration.test.ts modified.** The assertion that `scope_id` was absent (O2 stripped it) is now flipped to assert it IS present (Q2 re-adds it). This is a legitimate change — the old assertion was about the O2 migration removing strategy-layer scope_id; Q2 adds a kernel-level scope_id. The test comment explains the reasoning. The other O2 test changes add `scopeKind: "factory"` to POST payloads, which is correct since scopeKind is now required.

### Simplification

**SIMP-1: Duplicated SCOPES_REQUIRING_ID / SCOPE_KINDS_REQUIRING_ID.** Three copies of the same set:
- `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx:25` — `SCOPES_REQUIRING_ID`
- `packages/web/src/pages/knowledge/ScopeChangeDialog.tsx:24` — `SCOPES_REQUIRING_ID`
- `packages/server/src/routes/knowledge.ts:57` — `SCOPE_KINDS_REQUIRING_ID`

All define `["product", "practice", "team", "bet", "task"]`. This should be a single const in `@hyperidle/shared` alongside `SCOPE_KINDS`. Non-blocking but increases drift risk.

**SIMP-2: `role="combobox"` on a text input in ScopeChangeDialog:163-168.** The comment explains this is for Playwright locator compatibility, but it's semantically wrong — `<input type="text">` is a textbox, not a combobox. The test should use `getByPlaceholder` or `getByLabel` instead of `getByRole("combobox").nth(1)`. Non-blocking.

### Slop

**SLOP-1: `as ScopeKind` casts on select onChange.** Two instances (KnowledgeCreateDialog:187, ScopeChangeDialog:144). The `<select>` element's options are rendered from `SCOPE_KINDS`, so the cast is safe at runtime, but it bypasses the type checker. A type guard function would be cleaner. Non-blocking.

**SLOP-2: `as never` casts for Hono validated body.** Six instances in knowledge.ts. These are a pre-existing pattern in the codebase (every route with `validateBody` uses this). Not a Q2 regression.

**SLOP-3: `fetchRevision` cache-buster pattern.** KnowledgeList:230 appends `?_r=N` to force useFetch to re-run. The `@lore` comment explains the workaround. Acceptable given useFetch has no `refresh()` method, but the pattern is fragile.

**SLOP-4: KnowledgeDetail not migrated to API fetch.** Architecture plan T21 says "Migrate KnowledgeDetail from fixtures to API fetch." The detail page still uses `findDetail()` from fixtures + LEGACY_DETAILS. The ScopeChangeDialog passes `routeKnowledgeId` to work around FALLBACK_DETAIL.id being "unknown". This means scope changes work but the detail page shows stale fixture data for non-legacy items. Non-blocking for Q2 scope (the plan notes this as a risk in section 12.1).

**SLOP-5: TaskSheet T19 not implemented.** Architecture plan T19 says "Add knowledge button to TaskSheet." This was not implemented. The diff does not touch TaskSheet. If this was descoped, it should be documented. Non-blocking for the main AC list (none of the 13 ACs reference TaskSheet directly — AC-5 only mentions bet detail).

---

## Builder Warning Check (from Phase 2 Critique)

| Warning | Addressed? |
|---------|-----------|
| Mobile dialog sizing (max-w-full max-h-[90vh]) | Partially. Uses min-w-[320px] max-w-[480px] w-full. No max-h constraint. Acceptable — dialog content is short. |
| Scope_id dropdown loading state | Addressed via free-text input instead of dropdown. @lore comment in ScopeChangeDialog:14-16 documents the decision. |
| User scope validation (no scope_id from user) | CORRECT. User scope auto-fills scopeId from userId on the server (knowledge.ts:347). Client doesn't send scopeId for user scope. |
| Protected tests not broken | CORRECT. O2-schema-migration.test.ts assertion updated with comment explaining the O2→Q2 transition. Other protected tests get scopeKind: "factory" added to payloads. |
| Fabric strategy fields on scope change | CORRECT. upsertFabricLayer handles both existing and new fabric rows. Layer is updated; other fabric fields (kind, attentionScore, etc.) are preserved because the update only sets `layer`. |
| User impersonation in integration tests | CORRECT. Tests use seedFounder() to set different user IDs and rebuild the app to simulate different users. |

---

## Required Fixes (for builder)

1. **BLOCK-1:** In `KnowledgeCreateDialog.tsx`, add `updatedBy` to the POST payload. Import `useCurrentUser` and include `updatedBy: user?.id ?? "unknown"` in the payload object.

2. **BLOCK-2:** In `ScopeChangeDialog.tsx`, add `updatedBy` to the PATCH payload. Import `useCurrentUser` and include `updatedBy: user?.id ?? "unknown"` in the payload object.

3. After fixing, add at least one integration test (or update existing E2E) that hits the real server from the dialog flow, or add a Vitest that verifies the payload shape includes `updatedBy`.
