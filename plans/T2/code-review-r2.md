# T2 Code Review Round 2 -- Knowledge WYSIWYG Editing

**Reviewer:** Phase 4 re-review (same reviewer as R1)
**Scope:** Verify builder fixes for F-ARCH-1 (stale savedContent), F-ARCH-2 (missing E2E tests), F-ARCH-3 (unsafe as casts), plus check for broken existing E2E tests.
**Commits reviewed:** `1b559682` (fix: stale savedContent + E2E tests), `9ac511b8` (fix: fabric/types subpath import)

---

## F-ARCH-1 (CRITICAL): Stale `savedContent` in `onSaved` callback

**Status: FIXED.**

The builder chose option (b) from the R1 review: track latest content in a `useRef<string>`.

**Changes:**
- `KnowledgeDetail.tsx:318` adds `const latestContentRef = useRef<string>("")`
- `KnowledgeDetail.tsx:352` in `startEdit()`: initializes `latestContentRef.current = savedContent`
- `KnowledgeDetail.tsx:371` in `handleContentChange()`: updates `latestContentRef.current = markdown` on every onChange call
- `KnowledgeDetail.tsx:330` in `onSaved`: changed from `setSavedContent(editContent)` to `setSavedContent(latestContentRef.current)`

**Trace verification:** The data flow is now correct. `handleContentChange` always updates the ref before the dirty-check guard (line 371 before line 372), so even if `triggerSave` is skipped for the initial mount content, the ref still holds the latest value. When `onSaved` fires after a successful PATCH, `latestContentRef.current` holds the content that was last typed, which is either the same as or newer than what was saved. The "newer" case is benign -- the pending debounce will save it next, and the user sees what they typed rather than stale data.

**Regression test at line 202-238 of `KnowledgeDetail.edit.test.tsx`:** Correctly exercises the bug path. Types new content, waits for auto-save to complete ("Saved" indicator), clicks Done, asserts read view shows the new content and not the original fixture text. This test would have failed against the original code. It passes with the fix.

**Verdict: Satisfactory fix.**

---

## F-ARCH-2 (MAJOR): Missing E2E tests

**Status: PARTIALLY FIXED. New tests exist but have a structural weakness and one likely-failing test.**

The builder created `packages/web/e2e/knowledge-edit.spec.ts` with 4 test groups covering 7 individual tests.

### Scenario 1 (AC-1: Edit flow) -- 4 tests

Tests verify: Edit button visible, clicking Edit shows edit panel and Done button, save indicator is reachable, clicking Done exits edit mode. All use API route mocking via `page.route()`. These tests are structurally sound. They verify the shell behavior (panel show/hide, button presence) rather than TipTap typing, which is the correct approach for E2E given TipTap's contenteditable complexity. The lore comment at lines 14-28 documents this limitation.

### Scenario 2 (AC-2: Create dialog) -- 1 test

Tests the create flow: opens dialog, fills title and body via placeholder selectors, clicks Create, asserts dialog closes. This test fills a `<textarea>` placeholder ("Describe it in markdown...") which only works because `KnowledgeCreateDialog` still uses a plain textarea in the form. Wait -- the architecture plan says Task 4 replaced the textarea with BodyEditor. Let me verify.

**Check:** KnowledgeCreateDialog still uses BodyEditor per the T2 changes, but the mock in this E2E test fills `dialog.getByPlaceholder("Describe it in markdown...")`. BodyEditor renders a TipTap contenteditable, not a textarea with a placeholder attribute. This test will FAIL because `getByPlaceholder` finds `<textarea placeholder="...">` or `<input placeholder="...">`, not TipTap's placeholder extension.

**Finding F-E2E-1 (MAJOR):** `knowledge-edit.spec.ts` Scenario 2 test at line 189 uses `getByPlaceholder("Describe it in markdown...")` to fill the body. KnowledgeCreateDialog now uses `<BodyEditor>` which renders a TipTap contenteditable, not a form element with a placeholder attribute. This test will fail at runtime. The test needs to either fill the contenteditable directly or verify only that the dialog opens and the Create button is present (as Scenario 1 does for the edit panel).

### Scenario 3 (AC-3: Factory read-only) -- 2 tests

Test 1 mocks API to return a factory-scoped item, asserts no Edit button. Test 2 uses fixture item k11 (factory-scope), asserts no Edit button. Both are correct. The regex `/^edit$/i` is appropriate to avoid matching "BodyEditor" or similar text.

### Scenario 4 (AC-4: Conflict banner) -- 1 test

Mocks GET to return 404 (falls back to fixture k1), mocks PATCH to return 409 with conflict payload. Enters edit mode, attempts to type into TipTap contenteditable, and asserts conflict banner appears. The test has a fallback (lines 290-301) that skips typing if TipTap's contenteditable is not found. If typing is skipped, no auto-save is triggered, and the conflict banner will never appear. **This test passes only if TipTap renders and the keyboard input triggers onChange.** The 8-second timeout (line 305) is generous but does not help if no PATCH is ever sent.

**Finding F-E2E-2 (MAJOR):** `knowledge-edit.spec.ts` Scenario 4 (line 249-308) has a silent fallback at lines 296-301 that skips typing if TipTap's contenteditable is not visible. If skipped, no auto-save fires, no PATCH is sent, and the conflict banner never appears. The test then waits 8 seconds and fails. The fallback comment says "the unit test fully covers the 409 path" but an E2E test that silently skips its critical interaction is not a real E2E test -- it is a false-pass risk. Either remove the fallback and let the test fail loudly if TipTap does not render, or restructure the test to trigger the save via a different mechanism (e.g., inject content via TipTap's API).

---

## F-ARCH-3: Unsafe `as` casts

**Status: FIXED.**

The builder replaced both unsafe `as` casts with runtime narrowing functions:

- `toKnowledgeStatus(raw: string): KnowledgeStatus` at line 168 -- checks `KNOWLEDGE_STATUSES.includes(raw)`, falls back to `"provisional"`.
- `toScopeKind(raw: string): ScopeKind` at line 177 -- checks `SCOPE_KINDS.includes(raw)`, falls back to `"factory"`.

Both use the canonical runtime arrays exported from their respective packages. The remaining `as KnowledgeStatus` and `as ScopeKind` inside these functions are safe because they follow a runtime `includes` check -- this is the standard TypeScript narrowing-through-validation pattern. The fallback values are safe defaults (most restrictive scope, neutral status).

The `PlainPayloadWithBlockId` cast at line 345 replaces the previous anonymous `as { blockId?: string }` with the canonical shared type. This is an improvement -- it documents the expected shape using the project's own type system.

**Verdict: Satisfactory fix.**

---

## Broken Existing E2E Tests

### `packages/web/e2e/l23-knowledge-body.spec.ts`

**6 tests affected, 4 will BREAK:**

| Test | Line | References removed UI? | Will break? |
|---|---|---|---|
| E1: body container exists and is not a `<pre>` | 17 | No (read mode only) | NO |
| E1: body container has data-knowledge-body attribute | 35 | No (read mode only) | NO |
| E1: multi-section body has h1 and h2 semantic headings | 45 | `knowledge-edit-textarea`, Save button | YES |
| E2: renders 3 paragraph Block shells for k1 content | 96 | `knowledge-edit-textarea`, Save button | YES |
| E2: body container has no card/border/shadow chrome | 121 | No (read mode only) | NO |
| E3: clicking Edit shows a preview pane (all 3 tests) | 136-176 | `knowledge-edit-preview` | YES (x3) |

**Total: 4 tests broken (E1 multi-section, E2 paragraph blocks, E3 all three).**

The E1 multi-section and E2 paragraph-blocks tests use the old edit flow to inject content (textarea fill + Save button click) then assert the read view. With T2, the textarea and Save button no longer exist. These tests need to be rewritten to either:
- (a) Use API route mocking to pre-populate the body content (preferred -- no editing required for read-mode assertions).
- (b) Use BodyEditor interaction (TipTap contenteditable) to inject content, then click Done.

The E3 tests assert `knowledge-edit-preview` which was a side-by-side preview pane in the textarea+preview editing split. T2 replaced this with BodyEditor (which is a WYSIWYG editor -- the editor IS the preview). These tests need to be rewritten or removed, since the concept of a separate "edit-mode preview" no longer exists in T2.

### `packages/web/e2e/knowledge-detail.spec.ts`

**3 tests affected, 1 will BREAK:**

| Test | Line | References removed UI? | Will break? |
|---|---|---|---|
| non-factory item supports edit round-trip | 8 | `knowledge-edit-textarea`, `knowledge-edit-preview`, Save, Cancel | YES |
| factory-scope item renders no Edit button | 32 | No (read mode only) | NO |
| factory-scope needs_human shows banner | 46 | No (read mode only) | NO |

**Total: 1 test broken (edit round-trip).**

The edit round-trip test asserts textarea, preview, Save, and Cancel -- all four are gone in T2. This test needs to be rewritten to use the BodyEditor/Done flow.

### Summary

**5 E2E tests across 2 files will fail** because T2 removed the textarea, preview pane, Save button, and Cancel button. T2 introduced these breakages. T2 must fix them.

**Finding F-E2E-3 (CRITICAL):** 5 existing E2E tests in `l23-knowledge-body.spec.ts` and `knowledge-detail.spec.ts` reference UI elements removed by T2 (`knowledge-edit-textarea`, `knowledge-edit-preview`, Save button, Cancel button). These tests will fail on this branch. The builder must update them before merge.

---

## AC Completeness Re-Audit

| # | Acceptance Criterion | R1 Status | R2 Status | Notes |
|---|---|---|---|---|
| 1 | KnowledgeDetail uses BodyEditor instead of textarea | COVERED | COVERED | Unchanged |
| 2 | KnowledgeCreateDialog uses BodyEditor | COVERED | COVERED | Unchanged |
| 3 | Auto-save via PATCH with version field | COVERED (bug) | COVERED (fixed) | F-ARCH-1 fixed |
| 4 | Conflict banner on 409 | COVERED | COVERED | Unchanged |
| 5 | Saving indicator | COVERED | COVERED | Unchanged |
| 6 | Factory-scoped read-only | COVERED | COVERED | Unchanged |
| 7 | Read mode uses deriveBlocks | COVERED | COVERED | Unchanged |
| -- | E2E tests (plan Task 6) | MISSING | PARTIALLY COVERED | Tests exist but F-E2E-1 and F-E2E-2 need fixes |
| -- | No regressions in existing tests | NOT CHECKED | FAILING | F-E2E-3: 5 existing E2E tests broken |

---

## Verdict: NOT DONE

### Must-fix before merge

1. **F-E2E-3 (CRITICAL): Update 5 broken existing E2E tests.** T2 removed the textarea, preview pane, Save, and Cancel buttons. The following tests reference those elements and will fail:
   - `l23-knowledge-body.spec.ts`: E1 "multi-section body has h1 and h2 semantic headings" (line 45)
   - `l23-knowledge-body.spec.ts`: E2 "renders 3 paragraph Block shells for k1 content" (line 96)
   - `l23-knowledge-body.spec.ts`: E3 all 3 tests (lines 136-176)
   - `knowledge-detail.spec.ts`: "non-factory item supports edit round-trip without URL change" (line 8)

   **Fix approach:** Tests that inject content via textarea+Save should switch to API route mocking to pre-populate body content. Tests that assert `knowledge-edit-preview` should either be removed (the concept no longer exists) or rewritten to assert BodyEditor presence instead. The edit round-trip test should assert the BodyEditor panel + Done button flow.

2. **F-E2E-1 (MAJOR): Fix create dialog E2E test.** `knowledge-edit.spec.ts` Scenario 2 uses `getByPlaceholder("Describe it in markdown...")` which targets a `<textarea>` element that was replaced by BodyEditor. This test will fail.

### Should-fix (non-blocking)

3. **F-E2E-2 (MAJOR): Fix silent fallback in conflict E2E test.** `knowledge-edit.spec.ts` Scenario 4 silently skips typing if TipTap contenteditable is not found, resulting in no PATCH being sent and the conflict banner never appearing. Remove the silent fallback or find an alternative way to trigger the save.

### Resolved from R1

- F-ARCH-1 (CRITICAL): Fixed correctly with `latestContentRef`. Regression test is sound.
- F-ARCH-3 (MINOR): Fixed with proper runtime narrowing functions.
- `PlainPayloadWithBlockId` cast: Improved from anonymous object type to canonical shared type.
