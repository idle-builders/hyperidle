# T3 Code Review -- Bet Pitch WYSIWYG Editing

**Verdict: NOT DONE**

Two issues block: a failing test (W-2 label regression in BetCreateDialog) and the E2E fixture field-name mismatch (`pitch:` not renamed to `description:` in 20+ E2E files). All six ACs are functionally implemented -- these are completeness gaps in the test and migration scope.

---

## AC Completeness

| AC | Status | Evidence |
|---|---|---|
| AC-1: BodyEditor for mutable statuses | PASS | `WorkBet.tsx:993-1001` conditionally renders BodyEditor for draft/active via `canEditDescription`. Tests: `WorkBet.description.test.tsx` cases "shows BodyEditor for a draft bet", "shows BodyEditor for an active bet". |
| AC-2: Read-only blocks for immutable statuses | PASS | `WorkBet.tsx:1012-1025` renders BetPitch for completed/killed. Tests: "shows BetPitch for a completed bet", "shows BetPitch for a killed bet". |
| AC-3: BetCreateDialog uses BodyEditor | PASS | `BetCreateDialog.tsx:167` renders BodyEditor with `editable={!submitting}`. Tests: `BetCreateDialog.test.tsx` T3 AC-3 describe block (4 tests). |
| AC-4: Auto-save via PATCH with correct payload | PASS | `useBetDescriptionSave.ts:85-92` sends `{ field: "description", value, reason: "Edited by user" }`. Tests: `useBetDescriptionSave.test.ts` "sends correct payload" test verifies exact shape. |
| AC-5: Saving indicator | PASS | `WorkBet.tsx:1002-1010` renders status-driven indicator with `aria-live="polite"`. Tests: "shows Saving...", "shows Saved", "saving indicator is NOT present for immutable". |
| AC-6: Block actions in read-only mode | PASS | Immutable bets render BetPitch with `onOpenBlockActions` and `messagesByBlockId`. Tests: "completed bet renders blocks with data-block-id", "killed bet renders read-only BetPitch with blocks". |

---

## Findings

### CRITICAL

**C-1: Failing test -- BetCreateDialog "uses label elements" (W-2 regression).**
`packages/web/src/__tests__/BetCreateDialog.test.tsx:176-180` asserts `labels.length > 0`. The test fails because T3 replaced the description `<label>` with `<div>` in BetCreateDialog (matching the KnowledgeCreateDialog pattern for ProseMirror contenteditable). The existing test was not updated or removed. The lore comment at `BetCreateDialog.tsx:160-162` explains the rationale correctly, but the test contradicts it. Fix: update the test to account for the label removal. When single-team mode is used (no team `<label>` visible), labels.length is 0.

**C-2: E2E fixtures use `pitch:` instead of `description:` -- 20+ files not migrated.**
The architecture plan section 5.6 says: "Grep for `pitch` across the entire `packages/web/` to catch any other references." The `packages/web/e2e/` directory contains at least 19 E2E spec files with `pitch:` in API mock fixtures (e.g., `L16-bet-pitch.spec.ts:34`, `bet-thread.spec.ts:27`, `L14-bet-actions.spec.ts:31`). The server API returns `description` (U1 rename), and the frontend `BetDetail` type now expects `description`. These E2E mock fixtures return `pitch:` which means `bet.description` will be `undefined` when the mocked response is cast to `BetDetail` in the `useBet` hook. The E2E tests will either fail or exercise the wrong code path.

Files affected: `L16-bet-pitch.spec.ts`, `bet-thread.spec.ts`, `lifecycle-propagation.spec.ts`, `L17-cost-tokens.spec.ts`, `L12-artifact-surfaces.spec.ts`, `L14-bet-actions.spec.ts`, `L15-task-request.spec.ts`, `synthesis.spec.ts`, `block-anchor-comment.spec.ts`, `Q3-bet-creation.spec.ts`, `accessibility.spec.ts`, `L9-single-detail.spec.ts`, `L21-coc-overlay.spec.ts`, `knowledge-q2-create.spec.ts`, `touch-targets.spec.ts`, `bet-artifact-thread-summary.spec.ts`, `work-bet-session.spec.ts`, `accessibility-K8.spec.ts`, `task-thread.spec.ts`.

Also: `L16-bet-pitch.spec.ts:29` uses `status: "shaped"` which is the old status enum value (should be `draft`). Several other E2E files use `status: "shaped"` as well.

### WARNING

**W-1: `flushSync` in `useBetDescriptionSave` is unnecessary and deviates from the T2 pattern.**
`packages/web/src/hooks/useBetDescriptionSave.ts:19,83` imports and uses `flushSync(() => setStatus("saving"))`. The analogous `useAutoSave` hook (T2) does `setStatus("saving")` without `flushSync` in the same setTimeout pattern. `flushSync` forces synchronous re-rendering, bypasses React's batching optimization, and is documented as a last resort. In this context, `setStatus("saving")` inside a setTimeout callback will trigger a render in the next microtask anyway -- the `apiFetch` call is async, so the "saving" status will be visible to the user before the response arrives regardless. Remove `flushSync` and its import; use plain `setStatus("saving")` to match the T2 pattern.

**W-2: `useFetch.ts` changes are defensive patching for test infrastructure, not T3 scope.**
`packages/web/src/hooks/useFetch.ts` wraps `apiFetch(url)` in `Promise.resolve()` and changes `res.ok` to `res?.ok` with optional chaining. The lore comment says this handles test mocks that return `undefined`. This is a test infrastructure workaround leaking into production code. The correct fix is to ensure test mocks return proper `Response` objects (as `useBetDescriptionSave.test.ts` does correctly). This change masks bugs -- if `apiFetch` returns `undefined` in production, the user gets a generic "HTTP unknown" error instead of a useful stack trace.

**W-3: No T3-specific E2E tests.**
The architecture plan section 7.3 specifies three E2E tests: "Edit description on active bet, see saving indicator", "Completed bet shows read-only blocks, no editor", "Create bet with BodyEditor." No `bet-description-edit.spec.ts` file exists in `packages/web/e2e/`. The plan lists these as Task 6. The project rules require "Playwright E2E tests for all user-facing features."

**W-4: `KnowledgeCreateDialog.tsx` has a large diff (218 lines) in a T3 branch.**
`packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx` has significant changes that appear to be reformatting or restructuring. This file is part of T2 scope (knowledge editing), not T3. Changes to unrelated files in a feature branch increase merge risk and make review harder. If these are intentional (e.g., fixing a pattern the builder noticed), they should be in a separate commit.

### SUGGESTION

**S-1: `initialDescriptionRef` dirty-check stale after save.**
`WorkBet.tsx:669` sets `initialDescriptionRef.current = bet?.description ?? ""` during the initial render. After a successful save and `fetched.refresh()`, the bet re-fetches and `bet.description` updates. However, `initialDescriptionRef` is only set once (via the initial `useState`-like pattern). After the first save, subsequent saves will compare against the original description, not the last-saved content. This means the dirty check will never suppress saves after the first edit. This is functionally correct (extra saves are idempotent) but wastes network requests. Consider updating `initialDescriptionRef.current` in the `onSaved` callback.

**S-2: `BetPitch` prop `pitch` was renamed to `description` but the internal variable names still reference pitch in comments.**
`WorkBet.tsx:143-148` uses `description` in the prop type (correct), but the file-level comments at lines 5-6 still say "bet pitch renders via L2 Block primitive". This is cosmetic but could confuse future readers about which term is canonical.

**S-3: Architecture critique W-2 (dual-source mutable-status set) was not addressed.**
The critique flagged that `BET_DESCRIPTION_MUTABLE_STATUSES` in the frontend duplicates `DESCRIPTION_MUTABLE_IN_STATUSES` on the server. The plan recommends a lore comment referencing the server constant. The implementation at `WorkBet.tsx:67-70` does include a lore comment mentioning the server mirror -- this satisfies the critique's recommendation. (Marking as addressed.)

---

## Lens Notes

### Architecture
The implementation follows the plan faithfully. The hook interface matches section 4. The conditional rendering matches section 5.3b. The status machine matches section 6. The `pitch` to `description` rename is complete in types, fixtures, and production code (but not E2E fixtures -- see C-2). Layer integrity preserved -- all changes in `packages/web`.

### Design
The saving indicator uses `aria-live="polite"` for accessibility. Token usage is correct (`var(--text-lo)`, `var(--danger)`). The `data-testid` attributes match the plan. No hardcoded colors. The BodyEditor integration matches the KnowledgeDetail pattern.

### Security
No XSS risk from the BodyEditor -- TipTap sanitizes input and BodyEditor serializes to markdown before sending to the API. The server validates the PATCH body via Zod schema. The `betId` is URL-encoded in the PATCH URL (`betIdRef.current` is not URL-encoded in `useBetDescriptionSave.ts:85` but it comes from the route param which is already clean). No secrets exposed.

### Adversarial
The `flushSync` (W-1) could cause re-entrant rendering issues in edge cases. The `initialDescriptionRef` stale-after-save issue (S-1) wastes bandwidth but doesn't cause data loss. The unmount guard in `useBetDescriptionSave` is correctly implemented -- both timers cleaned up and `unmountedRef` prevents state updates after unmount.

### Simplification
The `flushSync` import and usage can be removed (W-1). The `useFetch.ts` `Promise.resolve()` wrapper should be reverted (W-2). The `KnowledgeCreateDialog` changes should be separated (W-4).

### AI Slop
No significant slop detected. Comments are substantive and reference workpackage IDs. Lore comments document real decisions. No `console.log`, no `any`, no `as` casts (except the pre-existing `as` casts in `sortTasks` and `useBet`). No dead code introduced. The test for "does NOT have a conflict status" (line 288-303 of the test file) is somewhat ceremonial -- it asserts `status !== "conflict"` which is trivially true since the type does not include it -- but the architecture plan requested this test and the overhead is negligible.
