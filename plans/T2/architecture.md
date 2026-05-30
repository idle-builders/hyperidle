# T2 Architecture Plan -- Knowledge WYSIWYG Editing

## 1. Scope Summary

Replace the textarea + preview editing UI in `KnowledgeDetail` and `KnowledgeCreateDialog` with the BodyEditor component (T1). Wire auto-save to the existing `PATCH /api/knowledge/:id` endpoint with optimistic locking. Add saving indicator and conflict banner. Preserve factory-scope read-only behavior and the `deriveBlocks() -> <Block />` read path.

**No API changes.** The PATCH endpoint already supports everything T2 needs (body, version, updatedBy fields with optimistic locking returning 409 on conflict).

**No schema changes.** The `knowledge_items` table already has the `version` column.

**No new components.** BodyEditor exists. The conflict banner is inline JSX. The auto-save logic is a hook.

---

## 2. API Contract (existing -- no changes)

### PATCH /api/knowledge/:id

**File:** `packages/server/src/routes/knowledge.ts:491-578`

**Request body** (Zod: `updateKnowledgeSchema`, lines 76-84):
```typescript
{
  version: number;       // required -- optimistic lock
  updatedBy: string;     // required -- who is saving
  body?: string;         // the markdown content
  title?: string;        // optional, not used by T2
  topic?: string;        // optional, not used by T2
  format?: string;       // optional, not used by T2
  status?: string;       // optional, not used by T2
}
```

**Response 200:** The updated knowledge item (full row from `knowledge_items`).

**Response 409:**
```typescript
{
  error: "Version conflict: expected N, current is M",
  code: "CONFLICT",
  details: { currentVersion: number }
}
```

**Response 404:** Item not found.

**Behavior:**
1. Fetches existing item (line 496-499)
2. Compares `body.version` against `existing.version` (line 510-517)
3. Returns 409 with `details.currentVersion` if mismatch
4. Logs changes to `knowledgeEditLog` for each changed field (lines 522-543)
5. Bumps version: `existing.version + 1` (line 548)
6. Returns updated item

### GET /api/knowledge/:id

**File:** `packages/server/src/routes/knowledge.ts:273-322`

Returns the full knowledge item. T2 needs this to load item data (replacing fixture lookup).

---

## 3. Types and Interfaces

### 3.1 useAutoSave hook

**New file:** `packages/web/src/hooks/useAutoSave.ts`

```typescript
export type AutoSaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export interface ConflictInfo {
  currentVersion: number;
}

export interface UseAutoSaveOptions {
  /** The API endpoint URL (e.g. `/api/knowledge/${id}`) */
  endpoint: string;
  /** Current version number for optimistic locking */
  version: number;
  /** User id for the updatedBy field */
  updatedBy: string;
  /** Debounce delay in ms. Default: 1500 */
  debounceMs?: number;
  /** Called when save succeeds with the new version number */
  onSaved?: (newVersion: number) => void;
  /** Called on 409 conflict */
  onConflict?: (info: ConflictInfo) => void;
}

export interface UseAutoSaveResult {
  /** Current save status */
  status: AutoSaveStatus;
  /** Schedule a save with the given content. Debounced internally. */
  save: (content: string) => void;
  /** Reset the status to idle (e.g. when dismissing error state) */
  reset: () => void;
}
```

The hook:
- Manages a debounce timer (1500ms default)
- Sends `PATCH endpoint` with `{ body: content, version, updatedBy }`
- On 200: calls `onSaved(newVersion)`, sets status to "saved", clears to "idle" after 3s
- On 409: calls `onConflict({ currentVersion })`, sets status to "conflict"
- On other errors: sets status to "error"
- Cleans up timer on unmount
- Does NOT retry -- the next user edit triggers a new save cycle

### 3.2 Knowledge item type (for API response)

The server returns the raw `knowledge_items` row. The `KnowledgeList` page already defines this shape as `ApiKnowledgeItem`. T2 needs the same type in KnowledgeDetail. Rather than importing from KnowledgeList (page-level coupling), define a shared type in the hooks layer.

**New file:** `packages/web/src/hooks/useKnowledgeItem.ts`

```typescript
export interface KnowledgeItemData {
  id: string;
  title: string;
  body: string;
  format: string;
  status: string;
  version: number;
  updatedBy: string;
  scopeKind: string;
  scopeId: string | null;
  topic: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useKnowledgeItem(id: string | undefined): FetchState<KnowledgeItemData>
```

This wraps `useFetch<KnowledgeItemData>(`/api/knowledge/${id}`)`. Simple delegation -- exists to give KnowledgeDetail a typed way to fetch a single item.

---

## 4. File-by-File Changes

### 4.1 NEW: `packages/web/src/hooks/useAutoSave.ts`

Custom hook encapsulating the auto-save pattern.

**Responsibilities:**
- Debounce timer management (setTimeout/clearTimeout)
- PATCH request via `apiFetch`
- Status state machine: idle -> saving -> saved -> idle (or error/conflict)
- Version tracking (calls `onSaved` with new version so the parent can update)
- Cleanup on unmount

**Implementation notes:**
- Uses `useRef` for the timer to avoid stale closures
- Uses `useCallback` for the `save` function to maintain stable reference
- The "saved" -> "idle" transition uses a 3-second timeout
- Does NOT use `useFetch` -- this is a mutation, not a query

### 4.2 NEW: `packages/web/src/hooks/useKnowledgeItem.ts`

Thin wrapper around `useFetch` for `GET /api/knowledge/:id`.

Returns `FetchState<KnowledgeItemData>` (same shape as existing `useFetch`).

### 4.3 MODIFY: `packages/web/src/pages/KnowledgeDetail.tsx`

This is the largest change. The file currently uses fixture data and local-only editing. T2 replaces both.

**Changes by section:**

#### a. Data source: fixture -> API

**Current (lines 163-168, 194-204):** `findDetail(knowledgeId)` looks up fixture data and `LEGACY_DETAILS`.

**Target:** Use `useKnowledgeItem(effectiveKnowledgeId)` to fetch from API. Fall back to fixture data when API returns null (preserves existing tests that rely on fixture items k1, k2, k11, k12).

The fallback strategy:
```
const { data: apiItem, isLoading } = useKnowledgeItem(effectiveKnowledgeId);
const fixtureItem = findDetail(knowledgeId);
const item = apiItem ? fromApiItem(apiItem) : (fixtureItem ?? FALLBACK_DETAIL);
```

This lets the existing protected tests pass (they render fixture items like k1, k2) while real items load from the API.

#### b. Edit mode: textarea -> BodyEditor

**Remove (lines 364-384):** The entire `editing ? (...)` branch containing:
- The 2-column grid with textarea and KnowledgeBody preview
- The Save/Cancel buttons

**Replace with:**
```tsx
{editing ? (
  <div data-testid="knowledge-edit-panel" className="flex flex-col gap-2">
    <BodyEditor
      initialContent={editContent}
      onChange={handleContentChange}
      placeholder="Start writing..."
      autoFocus
      minHeight="200px"
      variant="full"
    />
    <div className="flex items-center gap-2">
      <span
        className="text-xs text-[var(--text-lo)]"
        aria-live="polite"
        data-testid="save-indicator"
      >
        {saveStatus === "saving" && "Saving..."}
        {saveStatus === "saved" && "Saved"}
        {saveStatus === "error" && (
          <span className="text-[var(--danger)]">Save failed</span>
        )}
      </span>
    </div>
  </div>
) : (
  <KnowledgeBody ... />  // unchanged
)}
```

#### c. Edit button -> Edit + Done

**Current (line 297-300):** "Edit" button calls `startEdit()`.

**Target:** Show "Edit" button in read mode (unchanged), show "Done" button in edit mode.

```tsx
{!(isFactory || editing) && (
  <button type="button" className="btn btn-xs btn-ghost" onClick={startEdit}>
    Edit
  </button>
)}
{editing && (
  <button type="button" className="btn btn-xs btn-ghost" onClick={exitEdit}>
    Done
  </button>
)}
```

#### d. Auto-save wiring

**New state/hooks in KnowledgeDetailView:**
```typescript
const [version, setVersion] = useState<number>(item.version ?? 1);
const [conflictVersion, setConflictVersion] = useState<number | null>(null);

const { status: saveStatus, save: triggerSave, reset: resetSave } = useAutoSave({
  endpoint: `/api/knowledge/${effectiveKnowledgeId}`,
  version,
  updatedBy: user?.id ?? "human",
  onSaved: (newVersion) => {
    setVersion(newVersion);
    setSavedContent(/* latest markdown */);
  },
  onConflict: ({ currentVersion }) => setConflictVersion(currentVersion),
});

function handleContentChange(markdown: string): void {
  setDraft(markdown);
  triggerSave(markdown);
}
```

#### e. Conflict banner

**New JSX between metadata bar and the grid layout (after line 343):**
```tsx
{conflictVersion !== null && (
  <div
    role="alert"
    className="flex items-center justify-between gap-2 px-3 py-2 text-xs
               bg-[var(--surface-4)] border border-[var(--border-subtle)]
               rounded-[var(--r2)]"
    data-testid="conflict-banner"
  >
    <span className="text-[var(--text-mid)]">
      Version conflict -- someone else saved this item. Reload to see their changes.
    </span>
    <button
      type="button"
      className="btn btn-xs btn-ghost"
      onClick={() => window.location.reload()}
    >
      Reload
    </button>
  </div>
)}
```

#### f. Remove functions

- **Remove `saveEdit()` (line 266-269):** Replaced by auto-save.
- **Remove `cancelEdit()` (line 263-265):** Replaced by `exitEdit()` which just sets `editing = false` (content was already auto-saved).
- **Simplify `startEdit()` (line 256-259):** Keep, but it now also records the current content for the BodyEditor's `initialContent` (which is consumed once on mount per T1 lore).

#### g. State cleanup

- Remove `draft` state -- the BodyEditor manages its own document. The hook's `save` function receives the markdown directly.
- Keep `savedContent` state -- needed for the read-mode `KnowledgeBody` to render after exiting edit mode.
- Add `editContent` state -- captures the content at edit-start time, passed as `initialContent` to BodyEditor. Set in `startEdit()`, consumed by BodyEditor on mount.

### 4.4 MODIFY: `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx`

**Change (lines 157-163):** Replace `<textarea>` with `<BodyEditor />`.

```tsx
{/* Body field */}
<label className="flex flex-col gap-1">
  <span className="text-xs text-[var(--text-lo)]">
    Body <span aria-hidden>(required)</span>
  </span>
  <BodyEditor
    initialContent=""
    onChange={(md) => setBody(md)}
    placeholder="Start writing..."
    variant="full"
    minHeight="128px"
    editable={!submitting}
  />
</label>
```

**Import added:** `import { BodyEditor } from "@hyperidle/design-system";`

**No other changes.** The `body` state, `handleSubmit`, and `canCreate` logic all stay the same -- they work with the markdown string that `onChange` provides.

### 4.5 MODIFY: `packages/web/src/hooks/useCurrentUser.ts` (no change)

Already exists and returns `{ user }`. KnowledgeDetail already has access to this via `useCurrentUser` (it is not imported today but needs to be added for `updatedBy`).

---

## 5. State Machine

### KnowledgeDetail edit lifecycle

```
                   +----------+
       click Edit  |          |
     +------------>|  editing |
     |             |          |
     |             +----+-----+
     |                  |
     |          onChange fires
     |                  |
     |             +----v-----+
     |             |          |  after 1500ms
     |             | debounce +--------+
     |             |          |        |
     |             +----------+        |
     |                                 |
     |                          +------v------+
     |                          |             |
     |                          |   PATCH     |
     |                          |   in flight |
     |                          |             |
     |                          +------+------+
     |                                 |
     |                    +------------+------------+
     |                    |            |            |
     |              200 OK        409 conflict   error
     |                    |            |            |
     |              +-----v-----+ +---v------+ +--v------+
     |              | saved     | | conflict | | error   |
     |              | (3s fade) | | banner   | | shown   |
     |              +-----------+ +----------+ +---------+
     |
+----+-----+
|          |
|   read   |<-------- click Done (exits editing, BodyEditor unmounts,
|   mode   |          KnowledgeBody re-renders from savedContent)
|          |
+----------+
```

### Version tracking

```
1. Page loads: version = item.version from API (or fixture default 1)
2. Auto-save PATCH sends current version
3. On 200: server returns item with version+1, hook calls onSaved(newVersion)
4. Parent updates version state to newVersion
5. Next auto-save sends the updated version
6. On 409: hook calls onConflict({ currentVersion }), banner shows
```

---

## 6. Test Strategy

### 6.1 Unit tests

#### `packages/web/src/hooks/__tests__/useAutoSave.test.ts`

| Test | What it verifies |
|---|---|
| debounces save calls | Multiple rapid calls result in one PATCH after debounce period |
| sends correct payload | PATCH body includes `{ body, version, updatedBy }` |
| transitions to "saving" then "saved" | Status sequence on successful save |
| transitions to "saved" then "idle" after 3s | Auto-clear of saved status |
| calls onSaved with new version | Version from response.version is passed through |
| handles 409 conflict | Sets status to "conflict", calls onConflict with currentVersion |
| handles network error | Sets status to "error" |
| cleans up timer on unmount | No state updates after unmount |
| resets status via reset() | Manual status reset works |

#### `packages/web/src/hooks/__tests__/useKnowledgeItem.test.ts`

| Test | What it verifies |
|---|---|
| fetches from /api/knowledge/:id | Correct URL construction |
| returns item data on success | Data shape matches KnowledgeItemData |
| returns error on 404 | Error state propagated |
| returns null data when id is undefined | No fetch triggered |

### 6.2 Existing tests -- impact analysis

**Files that WILL need updates:**

| Test file | Why | Change needed |
|---|---|---|
| `KnowledgeDetail.edit.test.tsx` | Asserts textarea, Save, Cancel buttons | Rewrite: assert BodyEditor presence, Done button, no textarea |
| `KnowledgeDetail.factory.test.tsx` | Asserts Edit button hidden for factory | No change needed -- guard logic unchanged |
| `KnowledgeDetail.L23.test.tsx` | Asserts KnowledgeBody rendering | No change needed -- read path unchanged |
| `KnowledgeDetail.test.tsx` | Asserts basic page rendering | May need update if fixture fallback changes |
| `KnowledgeDetail.block-popover.test.tsx` | Asserts block popover behavior | No change needed -- block actions are read-mode |
| `KnowledgeDetail.thread.test.tsx` | Asserts thread section | No change needed |
| `KnowledgeDetail.anchored-messages.test.tsx` | Asserts anchored messages | No change needed |
| `KnowledgeDetail.metadata.test.tsx` | Asserts metadata bar | No change needed |
| `KnowledgeDetail.related.test.tsx` | Asserts related sidebar | No change needed |

**Key test migration for `KnowledgeDetail.edit.test.tsx`:**
- "shows the Edit button" -- unchanged
- "enters edit mode when Edit button is clicked" -- assert `data-testid="knowledge-edit-panel"` but NOT `knowledge-edit-textarea` (textarea is gone)
- "textarea shows current content" -- replaced by asserting BodyEditor is rendered with content
- "renders markdown preview alongside textarea" -- removed (no split view)
- "Cancel reverts unsaved changes" -- replaced by "Done exits edit mode" (auto-save means no cancel)
- "Save persists the edit" -- replaced by auto-save tests

**Challenge:** Testing BodyEditor in JSDOM. TipTap/ProseMirror requires DOM APIs that JSDOM does not fully support. The existing T1 tests likely handle this with mocking or a test utility. Check T1's test approach.

**Mitigation:** Mock `BodyEditor` in KnowledgeDetail tests. The BodyEditor itself is tested in the design-system package. The integration tests verify that the correct props are passed and that `onChange` updates state correctly.

### 6.3 Integration tests

#### `packages/server/src/__tests__/knowledge-patch.integration.test.ts`

Verify the PATCH endpoint contract (likely already exists from O2). If not:

| Test | What it verifies |
|---|---|
| PATCH with matching version succeeds | Returns 200, version bumped |
| PATCH with stale version returns 409 | Returns 409 with currentVersion in details |
| PATCH with body updates the body | Body field is updated in DB |
| PATCH logs to knowledgeEditLog | Edit log entry created |

### 6.4 E2E tests (Playwright)

#### `packages/web/e2e/knowledge-edit.spec.ts`

| Test | What it verifies |
|---|---|
| Click Edit, type, see auto-save indicator | Full edit flow with saving indicator |
| Create knowledge item with BodyEditor | Dialog opens, type in editor, create succeeds |
| Factory item has no Edit button | Factory guard preserved |
| Conflict banner appears on 409 | Simulate stale version, verify banner |

**Note:** E2E tests require a running server with a real database. The test must seed a knowledge item, navigate to it, edit, and verify the PATCH was called.

---

## 7. Ordered Implementation Tasks

### Task 1: Create useAutoSave hook + tests

**Files:**
- `packages/web/src/hooks/useAutoSave.ts` (new)
- `packages/web/src/hooks/__tests__/useAutoSave.test.ts` (new)

**Acceptance:** Hook passes all unit tests. Debounce, status transitions, version propagation, conflict handling, cleanup all verified.

### Task 2: Create useKnowledgeItem hook + tests

**Files:**
- `packages/web/src/hooks/useKnowledgeItem.ts` (new)
- `packages/web/src/hooks/__tests__/useKnowledgeItem.test.ts` (new)

**Acceptance:** Hook fetches from `/api/knowledge/:id` and returns typed data. Tests mock `apiFetch`.

### Task 3: Modify KnowledgeDetail -- replace textarea with BodyEditor

**Files:**
- `packages/web/src/pages/KnowledgeDetail.tsx` (modify)
- `packages/web/src/__tests__/KnowledgeDetail.edit.test.tsx` (rewrite)

**Changes:**
1. Import `BodyEditor` from `@hyperidle/design-system`
2. Import `useAutoSave` and `useKnowledgeItem` from hooks
3. Import `useCurrentUser` for `updatedBy`
4. Replace the editing branch (lines 364-384) with BodyEditor + save indicator
5. Replace Save/Cancel buttons with Done button
6. Wire `useAutoSave` to the onChange callback
7. Add conflict banner JSX
8. Add version state tracking
9. Remove `saveEdit()`, `cancelEdit()`, `draft` state
10. Keep `startEdit()` simplified (sets editing=true, captures editContent)
11. Add `exitEdit()` (sets editing=false)
12. Add fixture fallback logic for `useKnowledgeItem`

**Acceptance:** Edit mode uses BodyEditor. Auto-save fires on change. Conflict banner shows on 409. Factory items remain read-only. Read mode unchanged.

### Task 4: Modify KnowledgeCreateDialog -- replace textarea with BodyEditor

**Files:**
- `packages/web/src/pages/knowledge/KnowledgeCreateDialog.tsx` (modify)

**Changes:**
1. Import `BodyEditor` from `@hyperidle/design-system`
2. Replace `<textarea>` (lines 157-163) with `<BodyEditor />` instance
3. Map `disabled={submitting}` to `editable={!submitting}`
4. Keep all other logic unchanged

**Acceptance:** Create dialog uses BodyEditor instead of textarea. Creating a knowledge item with formatted content works.

### Task 5: Update existing tests

**Files:**
- `packages/web/src/__tests__/KnowledgeDetail.edit.test.tsx` (already rewritten in Task 3)
- Any other test files that break due to the changes

**Acceptance:** `npm run test` passes. All existing test assertions that are still valid continue to pass. Tests that asserted textarea/Save/Cancel are updated to assert BodyEditor/Done/auto-save.

### Task 6: E2E tests

**Files:**
- `packages/web/e2e/knowledge-edit.spec.ts` (new)

**Acceptance:** Playwright tests verify the full edit flow through the browser.

### Task 7: Verify

Run `npm run verify` (typecheck + lint + test). Fix any issues.

---

## 8. Dependency Graph

```
Task 1 (useAutoSave)  ──┐
                         ├──> Task 3 (KnowledgeDetail) ──> Task 5 (test fixes)
Task 2 (useKnowledgeItem)┘                                      │
                                                                 v
Task 4 (KnowledgeCreateDialog) ──────────────────────> Task 6 (E2E)
                                                                 │
                                                                 v
                                                          Task 7 (verify)
```

Tasks 1 and 2 are independent and can be built in parallel.
Tasks 3 and 4 are independent of each other but depend on Tasks 1 and 2.
Task 5 depends on Task 3.
Task 6 depends on Tasks 3, 4, and 5.
Task 7 depends on all previous tasks.

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| TipTap/ProseMirror DOM requirements break JSDOM tests | High | Medium | Mock BodyEditor in KnowledgeDetail tests. Test BodyEditor in design-system with proper DOM setup (T1 already solved this). |
| KnowledgeDetail fixture data complicates API integration | Medium | Low | Dual data source: try API first, fall back to fixture. Existing tests use fixtures; new tests use mocked API. Fixture cleanup is a separate future task. |
| Auto-save fires too often, causing API load | Low | Low | 1500ms debounce is generous. Single-user desktop app. If needed, increase debounce or add dirty-check (only save if content actually changed). |
| Conflict banner UX insufficient for merge scenarios | Low | Low | T2 scope is "reload" only. Merge UI is explicitly out of scope. |
| BodyEditor onChange fires on mount with initial content | Medium | Medium | Check T1 behavior. If it fires on mount, the auto-save hook should ignore the first call (content unchanged from initial). Add a dirty flag: only save if content differs from `editContent`. |

---

## 10. Self-Critique

**Potential over-engineering:** The `useKnowledgeItem` hook is thin -- it is just `useFetch<KnowledgeItemData>('/api/knowledge/${id}')`. Inlining this in KnowledgeDetail would save a file. Counter-argument: the typed interface `KnowledgeItemData` needs to live somewhere, and extracting the hook follows the existing pattern (`useHostThread`, `useBet`, etc.).

**Potential under-engineering:** The conflict banner only offers "Reload." A more sophisticated approach would refetch the server content and show a diff. But the concept doc and workpackage spec both say "inline conflict banner" without specifying merge behavior, and the single-user desktop context makes conflicts rare. Reload is sufficient for v1.

**Missing consideration:** The auto-save hook sends the entire body on every save. For large documents, sending a diff would be more efficient. But the PATCH endpoint expects the full body (line 80: `body: z.string().optional()`), and the documents are small (under 256KB per the block contracts). No optimization needed.

**Test fragility:** Mocking BodyEditor in KnowledgeDetail tests means those tests do not verify the actual editor renders. This is acceptable because (a) BodyEditor has its own test suite in the design-system, and (b) the integration is simple props-passing. The E2E tests in Task 6 verify the real rendering.
