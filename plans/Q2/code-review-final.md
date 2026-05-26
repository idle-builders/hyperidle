# Q2 Code Review (Final): Human-authored knowledge at any scope

**Reviewer:** Phase 4 Code Review (re-review after fix cycle)
**Branch:** `feat/Q2-human-authored-knowledge`
**Fix commit:** `5a1d743`
**Date:** 2026-05-26

---

## Verdict: DONE

Both blocking findings from the initial review are resolved. `bun run verify` passes 7/7 tools on a clean tree. All 12 acceptance criteria are satisfied.

---

## Fix Verification

### BLOCK-1 (resolved): KnowledgeCreateDialog now sends `updatedBy`

**File:** `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx`

The dialog imports `useCurrentUser()` (line 22) and includes `updatedBy: user?.id ?? "human"` in the POST payload (line 99). The fallback `"human"` handles the case where the user object hasn't loaded yet. The server's `createKnowledgeSchema` requires `updatedBy: z.string()`, and this satisfies it.

AC-4 and AC-5 are now functionally correct against the real server.

### BLOCK-2 (resolved): ScopeChangeDialog now sends `updatedBy`

**File:** `packages/web/src/pages/knowledge/ScopeChangeDialog.tsx`

Same pattern: imports `useCurrentUser()` (line 21), includes `updatedBy: user?.id ?? "human"` in the PATCH payload (line 93). The server's `changeScopeSchema` requires `updatedBy: z.string()`, and this satisfies it.

AC-7 is now functionally correct against the real server.

---

## Non-blocking Fix Verification

### SCOPES_REQUIRING_ID deduplication

**File:** `packages/shared/src/types.ts` (lines 129-135)

The constant is now defined once in `@hyperidle/shared` as `ReadonlySet<ScopeKind>` and exported via `packages/shared/src/index.ts` (line 225). Both dialogs and the server route import from `@hyperidle/shared`. The three previous duplicate definitions (one per file) are removed.

### `role="combobox"` removed from ScopeChangeDialog text input

The `<input type="text">` for scope ID no longer carries `role="combobox"`, `aria-expanded`, or `aria-autocomplete` attributes. These were semantically incorrect (a text input is not a combobox). The E2E test now locates the field via `getByPlaceholder("product ID")`, which is robust and semantically honest.

### `@deprecated` annotations on fabric types

**File:** `packages/fabric/src/types.ts` (lines 62-67)

`KNOWLEDGE_SCOPES` and `KnowledgeScope` carry `@deprecated` JSDoc annotations pointing to `ScopeKind` from `@hyperidle/shared`. This is correct -- the old 3-scope enum predates Q2's 7-scope model.

---

## Acceptance Criteria Audit (Final)

| AC | Criterion | Status |
|----|-----------|--------|
| AC-1 | scope_kind column on kernel knowledgeItems table | PASS |
| AC-2 | ScopeKind type in packages/shared | PASS |
| AC-3 | "New item" from Knowledge view | PASS |
| AC-4 | Creation flow fields and validation | PASS (fix verified) |
| AC-5 | Contextual creation from bet detail | PASS (fix verified) |
| AC-6 | User-scoped visibility | PASS |
| AC-7 | Scope mutable with version tracking | PASS (fix verified) |
| AC-8 | Same schema for all scopes | PASS |
| AC-9 | Fabric layer assignment | PASS |
| AC-10 | Vitest tests | PASS |
| AC-11 | Playwright E2E tests | PASS |
| AC-12 | bun run verify green | PASS (7/7, verified by reviewer) |

---

## Remaining Observations (informational, not blocking)

1. **E2E tests still use mocked API responses.** The `updatedBy` fix is invisible to E2E because mocks bypass server validation. A future workpackage should add at least one E2E test that hits the real server to catch payload/schema mismatches. This is a process improvement, not a Q2 blocker.

2. **`user?.id ?? "human"` fallback.** If `useCurrentUser()` is still in `loading` state when the user clicks Create/Save, the payload sends `updatedBy: "human"` instead of the real user ID. This is acceptable for Q2 (single-founder desktop app) but would need a loading guard in a multi-user context.
