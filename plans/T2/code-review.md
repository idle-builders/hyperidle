# T2 Code Review -- Knowledge WYSIWYG Editing

**Reviewer:** Phase 4 code review (same reviewer as Phase 2 design/architecture critique)
**Branch diff:** 9 files changed (5 new, 4 modified), +2169 / -83 lines (code only, excluding plan artifacts)

---

## Positive Lenses

### 1. Architecture

**Layer integrity: PASS.** All changes stay within `packages/web`. No server modifications. BodyEditor consumed from `@hyperidle/design-system` via the package import. `useAutoSave` calls `apiFetch` which calls `fetch` -- clean Human Interface -> Meta Layer boundary via HTTP. No layer violations.

**API contract fidelity: PASS.** The PATCH payload in `useAutoSave.ts:63` sends `{ body: content, version, updatedBy }` which matches `updateKnowledgeSchema` (server lines 76-84) exactly. The 409 response parsing at line 126 reads `data.details?.currentVersion` which matches the server's `details: { currentVersion: existing.version }` at server line 514. The 200 response parsing reads `data.version` which is present in the full item returned by the handler.

**Data model accuracy: PASS.** `KnowledgeItemData` interface fields match the `knowledge_items` table columns. The dual data source pattern (API item -> fixture fallback) preserves backward compatibility with existing tests.

**Plan compliance: MOSTLY COMPLETE.** All 7 architecture tasks are implemented. Tasks 1-5 are done. Task 6 (E2E tests) is missing -- see AC completeness below. Task 7 (verify) is not evaluable from the diff alone.

**F1 (phantom test files) addressed:** The builder correctly identified that the phantom test files from the architecture plan (block-popover, thread, anchored-messages) do not exist and did not attempt to modify them. Correct behavior.

**F2 (dependency text) addressed:** Task 4 (KnowledgeCreateDialog) was implemented independently of Tasks 1 and 2, following the dependency graph rather than the incorrect text. Correct.

**F3 (dirty-check) addressed:** `handleContentChange` at KnowledgeDetail.tsx:332-334 implements the dirty guard: `if (markdown === editContent) return`. This prevents spurious saves on BodyEditor mount. Correct.

#### Findings

- **(CRITICAL) F-ARCH-1: `onSaved` callback captures stale `editContent` ref.** KnowledgeDetail.tsx:293-296. The `onSaved` callback is `(newVersion) => { setVersion(newVersion); setSavedContent(editContent); }`. This closure captures `editContent` at the time `useAutoSave` was called. `editContent` is set once in `startEdit()` and never updated during editing. When the auto-save succeeds, `setSavedContent(editContent)` sets `savedContent` to the content at edit-start, not the content that was actually saved. Result: after the user clicks "Done", the read view (`KnowledgeBody`) renders the edit-start content, discarding all auto-saved changes visually until a page reload. **The builder flagged this issue.** Plan contract: architecture.md Section 4.3d specifies `setSavedContent(/* latest markdown */)` -- the implementation violates this by using the stale `editContent` value instead of the latest markdown. Fix: either pass the saved content through the `onSaved` callback (change hook API to `onSaved(newVersion, savedContent)`) or track the latest content in a ref.

- **(MAJOR) F-ARCH-2: No E2E tests.** Architecture plan Task 6 specifies 4 Playwright E2E scenarios. No E2E test file was created. The architecture plan lists this as a required task, and CLAUDE.md mandates "Playwright E2E tests for all user-facing features." This is a gap in the plan's task list.

- **(MINOR) F-ARCH-3: Two `as` casts on API data.** KnowledgeDetail.tsx:228 `apiItem.status as KnowledgeStatus` and line 232 `apiItem.scopeKind as ScopeKind`. These are unsafe casts -- if the API returns a status string not in the `KnowledgeStatus` union, the cast silently passes. The TypeScript rules say "No unsafe `as` casts." However, the API response is typed as `KnowledgeItemData` where `status` and `scopeKind` are `string`, and the consuming code needs narrower types. Mitigation: add runtime guards or use `as` with a validator. These are pre-existing pattern casts (the `ScopeKind` cast existed before T2), so severity is minor.

### 2. Design

**Edit-mode transition: MATCH.** The approved design specifies: Edit button -> BodyEditor (full width, no sidebar split) -> Done button. The implementation matches exactly: `KnowledgeDetail.tsx:363-371` shows Edit/Done buttons, lines 457-479 show BodyEditor in the edit panel with no split view.

**Save indicator placement: MATCH.** Design specifies: below BodyEditor, left-aligned, `text-xs text-[var(--text-lo)]`. Implementation at lines 467-479 matches: `<span className="text-xs text-[var(--text-lo)]" aria-live="polite">`. Shows "Saving...", "Saved", and "Save failed" in `text-[var(--danger)]`. All per spec.

**Conflict banner: MATCH.** Design specifies: inline `role="alert"` between metadata bar and editor, with `bg-[var(--surface-4)]`, `border-[var(--border-subtle)]`, `rounded-[var(--r2)]`, `text-xs text-[var(--text-mid)]`, Reload button `btn btn-xs btn-ghost`. Implementation at lines 417-436 matches every token.

**KnowledgeCreateDialog: MATCH.** Design specifies: replace `<textarea>` with `<BodyEditor initialContent="" onChange={(md) => setBody(md)} variant="full" minHeight="128px">`, map `disabled` to `editable={!submitting}`. Implementation at KnowledgeCreateDialog.tsx:158-165 matches. Placeholder differs from design ("Describe it in markdown..." vs "Start writing...") -- the implementation preserves the existing textarea placeholder text, which is a reasonable choice.

**States coverage: ADEQUATE.** Default, editing, saving, saved, error, conflict states are all rendered. No disabled state on the editor itself in KnowledgeDetail (BodyEditor has no `editable` prop passed in edit mode -- always editable). This is correct per design.

**Tokens: PASS.** No hardcoded colors. All colors use semantic tokens (`--text-lo`, `--text-mid`, `--danger`, `--surface-4`, `--border-subtle`). Radii use `--r2`. Spacing uses Tailwind utilities (`gap-2`, `px-3`, `py-2`). No off-grid spacing detected.

**Accessibility: PASS.** Conflict banner has `role="alert"`. Save indicator has `aria-live="polite"`. Edit/Done buttons are `<button type="button">` (keyboard accessible). BodyEditor handles its own a11y (TipTap/ProseMirror built-in).

### 3. Security

**XSS: LOW RISK.** The `body` content flows through `apiFetch` -> `JSON.stringify` -> HTTP body. On the read side, content goes through `deriveBlocks() -> <Block />` which renders via React's JSX escaping. BodyEditor uses TipTap which sanitizes HTML internally. No `dangerouslySetInnerHTML` in the T2 diff.

**Injection: PASS.** The PATCH payload is JSON-serialized. The server validates via Zod (`updateKnowledgeSchema`). No SQL injection vector.

**Auth: PASS.** `apiFetch` injects the API key header. The server's auth middleware runs on PATCH routes. `updatedBy` uses `user?.id ?? "human"` -- the fallback "human" string is acceptable for the single-user desktop context but would be incorrect in multi-user deployment.

**SSRF: N/A.** No outbound URLs constructed from user input.

**Rate limiting: N/A.** Single-user desktop app. The 1500ms debounce provides natural rate limiting.

---

## Negative Lenses

### 4. Adversarial

**The Saboteur:**

- **(CRITICAL) Stale savedContent on exit (F-ARCH-1 above).** This is a data-display correctness bug, not just a cosmetic issue. After auto-save + Done, the page shows old content. The user believes their edits were lost. The DB has the correct data, but the UI lies. A user who re-enters edit mode will see `savedContent` (old), which becomes `editContent` (old), which BodyEditor loads as `initialContent` (old). The user's saved work appears gone. **This is the highest-priority fix.**

- **(MINOR) Race condition: rapid Edit -> type -> Done.** If the user types, triggering a debounced save, then clicks "Done" before the debounce fires, the `useAutoSave` hook's timer fires after the BodyEditor unmounts. The `unmountedRef` guard in the hook prevents state updates, but the PATCH request is still pending (the timer fires, the PATCH is sent). Since `exitEdit` does not flush pending saves, the debounced save fires correctly -- the timer callback checks `unmountedRef` before `setStatus`, but the actual `executePatch` call happens before the unmount check at line 165-166. Wait -- re-reading: the debounce timer fires, but `unmountedRef` is checked at line 165 _inside_ the timer callback, before the PATCH is sent. If the user clicks Done and the component re-renders (but does not unmount -- `KnowledgeDetailView` stays mounted, only `BodyEditor` unmounts), then `unmountedRef` is still false, so the PATCH fires. This is actually correct behavior -- the save completes even after exiting edit mode. But the stale `setSavedContent(editContent)` in `onSaved` then sets the wrong content. So this race is a manifestation of F-ARCH-1.

- **(MINOR) `useAutoSave` does not flush on unmount.** If the component unmounts with a pending debounce timer, the timer is cleared (line 113-115) and the unsaved content is lost. For T2 this is acceptable (the architecture plan says "Does NOT retry") but is worth noting for future workpackages that may need a flush-on-unmount semantic.

**The New Hire:**

- The `DetailItem` interface with its `version?: string` (line 86) and `versionNum?: number` (line 88) is confusing. Why two version fields? Answer: `version` is the legacy string ("v1.2"), `versionNum` is the T2 numeric version for optimistic locking. This is documented in the Q2 comment on line 88 but would benefit from a more descriptive name like `optimisticVersion`.

**The Auditor:**

- The diff claims to remove `saveEdit()`, `cancelEdit()`, and `draft` state per the architecture plan Section 4.3f/g. Verified: `saveEdit` is gone (was line 266-269), `cancelEdit` is gone (was line 263-265), `draft` state is gone (replaced by `editContent`). All removed as claimed.

### 5. Simplification

- **(NIT) F-SIMP-1: Five separate `useEffect` blocks for ref sync.** `useAutoSave.ts` lines 89-107 has five individual `useEffect` hooks, each syncing a single ref (`versionRef`, `updatedByRef`, `endpointRef`, `onSavedRef`, `onConflictRef`). These could be a single `useEffect` with all five assignments and all five deps, or a `useLatest` utility. The current approach is explicit but verbose. Not blocking -- this is a style preference.

- **(NIT) F-SIMP-2: `handleSaveResponse` wrapped in `useCallback` with empty deps.** The function references only refs (no reactive deps), so the empty dependency array is correct. But the `useCallback` wrapper is unnecessary -- since the deps are empty, the function is stable across renders anyway, and it is only called inside another `useCallback`. This is a micro-optimization that adds no value.

- **(NIT) F-SIMP-3: `ConflictInfo` type is a single-field object.** `useAutoSave.ts:26-28` defines `ConflictInfo` with one field (`currentVersion: number`). This could be a plain number. However, the object shape leaves room for future fields (server error message, conflicting user name) and matches the architecture plan's type definition. Acceptable.

### 6. AI Slop

- **(NIT) F-SLOP-1: Verbose file-level JSDoc comments.** `useAutoSave.ts:1-18` has an 18-line block comment that duplicates the function's behavior (debounce, status machine, cleanup). The `@lore` entries in lines 12-17 are valuable; the rest is restating code. Similarly, `useKnowledgeItem.ts:1-9` has a 9-line comment for a 3-line function body. These are AI tells -- an AI writes explanation before it writes code.

- **(PASS) No other slop indicators detected.** No `=== true`, no redundant else-return, no "TODO: implement" on implemented code, no single-use helpers, no unnecessary async (the hook correctly uses sync `save` with internal async), no try-catch around non-throwing code.

---

## AC Completeness Audit

| # | Acceptance Criterion | Status | Evidence |
|---|---|---|---|
| 1 | KnowledgeDetail uses BodyEditor instead of textarea + preview split | **COVERED** | KnowledgeDetail.tsx:459-466 renders `<BodyEditor>`. Edit test asserts `mock-body-editor` present, `knowledge-edit-textarea` absent. L23 test T9 asserts no `knowledge-edit-preview`. |
| 2 | KnowledgeCreateDialog uses BodyEditor instead of plain textarea | **COVERED** | KnowledgeCreateDialog.tsx:158-165 renders `<BodyEditor>`. KnowledgeCreateDialog.test.tsx asserts `mock-body-editor` present, no plain body textarea. |
| 3 | Knowledge body auto-saves via PATCH with version field | **COVERED (with bug)** | useAutoSave.ts sends PATCH with `{ body, version, updatedBy }`. KnowledgeDetail.tsx:289-298 wires the hook. Edit test "shows save indicator 'Saving...'" and "shows save indicator 'Saved'" verify the auto-save fires. useAutoSave.test.ts verifies debounce, payload, and version propagation. **Bug F-ARCH-1: savedContent gets stale value after save.** |
| 4 | On version conflict (409), inline conflict banner appears | **COVERED** | KnowledgeDetail.tsx:417-436 renders conflict banner when `conflictVersion !== null`. Edit test "shows conflict banner when PATCH returns 409" verifies. useAutoSave.test.ts "sets status to conflict on 409" verifies hook behavior. |
| 5 | Saving indicator ("Saving..." / "Saved") appears during and after auto-save | **COVERED** | KnowledgeDetail.tsx:468-479 renders save indicator. Edit tests verify "Saving..." and "Saved" text. useAutoSave.test.ts verifies status transitions including saved -> idle after 3s. |
| 6 | Factory-scoped items remain read-only (amendable banner preserved) | **COVERED** | KnowledgeDetail.tsx:261 checks `item.scope === "factory" || item.scopeKind === "factory"`. Edit test "factory items do NOT show an Edit button" verifies with k11. Factory test file (unmodified, 4 tests) continues to pass. |
| 7 | Read mode uses deriveBlocks() -> Block for thread anchoring | **COVERED** | KnowledgeDetail.tsx:482-488 renders `<KnowledgeBody>` in read mode (unchanged). Edit test "read mode uses KnowledgeBody (blocks, not editor)" verifies. L23 tests T8 (block shells present) and T10 (no `<pre>`) verify blocks rendering. |

**Test coverage summary:**
- useAutoSave: 11 unit tests (9 plan-specified + 2 extras: initial idle state, non-200/non-409 error)
- useKnowledgeItem: 5 unit tests (4 plan-specified + 1 extra: loading state)
- KnowledgeDetail edit mode: 9 integration tests covering all AC touchpoints
- KnowledgeCreateDialog: 2 tests (BodyEditor presence, disabled-during-submit)
- KnowledgeDetail.L23: 10 tests updated to reflect T2 behavior (no split preview)
- E2E: **0 tests (gap -- plan Task 6 specified 4 Playwright scenarios)**

---

## Verdict: NOT DONE

### Must-fix before merge

1. **F-ARCH-1 (CRITICAL): Fix stale `savedContent` in `onSaved` callback.** KnowledgeDetail.tsx:295 -- `setSavedContent(editContent)` uses the edit-start snapshot. After auto-save, `savedContent` should reflect the content that was actually saved, not the content at edit-start. The user will see stale content in read mode after exiting edit. Options:
   - (a) Extend the `useAutoSave` hook's `onSaved` callback signature to include the saved content: `onSaved: (newVersion: number, savedContent: string) => void`, then `setSavedContent(savedContent)` in the callback.
   - (b) Track the latest content in a `useRef<string>` in KnowledgeDetail that is updated in `handleContentChange`, then read the ref in `onSaved`.
   - (c) Store the pending content in the `useAutoSave` hook itself (it already has `content` in the `save` closure) and expose it through the return value or callback.

2. **F-ARCH-2 (MAJOR): Add E2E tests.** The architecture plan Task 6 specifies 4 Playwright scenarios: (1) edit flow with auto-save indicator, (2) create with BodyEditor, (3) factory guard, (4) conflict banner on 409. Project rules mandate E2E tests for all user-facing features.

### Should-fix (non-blocking)

3. **F-ARCH-3 (MINOR): Unsafe `as` casts.** KnowledgeDetail.tsx:228, 232. Add runtime guards or accept the risk with a `@lore` comment explaining why the cast is safe.

4. **F-SIMP-1 (NIT): Consolidate ref-sync effects.** useAutoSave.ts:89-107. Five `useEffect` hooks could be one. Not blocking.

5. **F-SLOP-1 (NIT): Trim verbose file-level comments.** Keep the `@lore` entries, remove the behavior summary that duplicates the code.
