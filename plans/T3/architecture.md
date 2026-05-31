# T3 Architecture Plan -- Bet Pitch WYSIWYG Editing

## 1. Scope Summary

Replace the read-only `BetPitch` component in `WorkBet.tsx` with an editable BodyEditor for mutable bet statuses (`draft`, `active`). Replace the plain textarea in `BetCreateDialog.tsx` with BodyEditor. Wire auto-save to the existing `PATCH /api/bets/:id` endpoint. Add saving indicator. Preserve read-only block rendering with block actions in immutable statuses (`completed`, `killed`).

**No API changes.** The PATCH endpoint already handles `{ field: "description", value, reason }` with status-based mutability enforcement.

**No schema changes.** The `bets` table already has the `description` column (renamed from `pitch` in U1).

**No new components.** BodyEditor exists (T1). The auto-save hook exists (T2). The saving indicator is inline JSX (same pattern as KnowledgeDetail).

---

## 2. Critical Discovery: pitch/description Field Name Mismatch

The `BetDetail` type (`packages/web/src/types/bet.ts:33`) declares `pitch: string`. The server API returns `description: string` (U1 rename). The `useBet` hook casts the API response directly as `BetDetail` with no field mapping. This means `bet.pitch` reads `undefined` from the API response in production -- the fixture uses `pitch` so tests pass, but production breaks.

**T3 must fix this** because auto-save sends `{ field: "description", value, reason }` to the PATCH endpoint, and the BodyEditor needs to read the initial content from the correct field. Two options:

| Option | Change | Cost |
|---|---|---|
| A. Rename BetDetail.pitch to BetDetail.description | Update type + all consumers (WorkBet BetPitch, fixtures, tests) | ~15 references, clean alignment with API |
| B. Map description->pitch in useBet | Add `pitch: data.description` in the hook | 1 line, but preserves a confusing name divergence |

**Decision: Option A.** Rename `BetDetail.pitch` to `BetDetail.description` throughout. This aligns the frontend type with the API contract, eliminates the latent production bug, and uses the canonical field name. The PATCH endpoint uses `field: "description"` -- using the same name everywhere prevents confusion.

The concept doc and workpackage spec both use `pitch` but the actual codebase has already migrated to `description` (U1). T3 completes the rename on the frontend type.

---

## 3. API Contract (existing -- no changes)

### PATCH /api/bets/:id

**File:** `packages/server/src/routes/bets.ts:603-635`

**Request body for description field** (Zod: `updateBetDescriptionSchema`, lines 88-92):
```typescript
{
  field: "description",  // literal
  value: string,         // min 1 char
  reason: string,        // audit trail
}
```

**Response 200:** The updated bet row.

**Response 400:** `{ error: "Field 'description' is not mutable in status '${status}'", code: "VALIDATION_ERROR" }` when status is `completed` or `killed`.

**Response 404:** Bet not found.

**No optimistic locking (no version column on bets).** Unlike knowledge items, bets do not have a `version` column. The PATCH endpoint does not return 409 conflict. This means T3's auto-save is simpler than T2's -- no conflict handling needed.

### Bet status mutability

**Mutable statuses:** `draft`, `active` (from `DESCRIPTION_MUTABLE_IN_STATUSES` in bets.ts line 110)

**Immutable statuses:** `completed`, `killed`

---

## 4. useAutoSave Adaptation for Bets

The existing `useAutoSave` hook (T2) sends `{ body, version, updatedBy }` -- shaped for the knowledge PATCH endpoint. The bet PATCH endpoint expects `{ field: "description", value, reason }` -- a different payload shape.

**Two options:**

| Option | Change | Cost |
|---|---|---|
| A. Generalize useAutoSave to accept a payload builder function | Adds a `buildPayload` parameter | Increases hook complexity, breaks existing T2 callers |
| B. Create a separate `useBetAutoSave` hook or inline the auto-save logic | New hook or inline debounce+PATCH | Small code duplication but clear separation |
| C. Create a thin `useBetDescriptionSave` wrapper that calls apiFetch directly with bet-shaped payload | New hook with debounce, same status machine as useAutoSave minus version/conflict | Clearest, no coupling to knowledge-specific hook |

**Decision: Option C.** Create `useBetDescriptionSave` -- a purpose-built hook for bet description auto-save. Rationale:

1. The bet PATCH has a fundamentally different payload shape (`field`/`value`/`reason` vs `body`/`version`/`updatedBy`).
2. Bets have no version column, so conflict handling is irrelevant.
3. The hook is small (~60 lines) -- the duplication cost is lower than the complexity of generalizing useAutoSave.
4. If a future workpackage needs a general-purpose auto-save, the two hooks can be refactored into a shared base. But premature abstraction now adds coupling for one consumer.

### useBetDescriptionSave Interface

```typescript
// packages/web/src/hooks/useBetDescriptionSave.ts

export type BetSaveStatus = "idle" | "saving" | "saved" | "error";

export interface UseBetDescriptionSaveOptions {
  betId: string;
  debounceMs?: number;    // default 1500
  onSaved?: () => void;   // called on successful save
}

export interface UseBetDescriptionSaveResult {
  status: BetSaveStatus;
  save: (content: string) => void;
}
```

**Behavior:**
- Debounces save calls (1500ms default)
- Sends `PATCH /api/bets/${betId}` with `{ field: "description", value: content, reason: "Edited by user" }`
- Status machine: `idle -> saving -> saved -> idle` (3s auto-clear of "saved")
- On non-200: sets status to `error`
- On 400 (status not mutable): sets status to `error` (the UI should prevent this by checking status before showing the editor, but defense in depth)
- Cleans up timers on unmount
- No conflict handling (bets have no version column)

---

## 5. File-by-File Changes

### 5.1 MODIFY: `packages/web/src/types/bet.ts`

Rename `pitch: string` to `description: string`. Update the doc comment.

```typescript
/** Markdown description body (renamed from 'pitch' in L16, aligned with API in T3). */
description: string;
```

### 5.2 NEW: `packages/web/src/hooks/useBetDescriptionSave.ts`

Purpose-built auto-save hook for bet description PATCH. See section 4 for interface.

### 5.3 MODIFY: `packages/web/src/pages/WorkBet.tsx`

This is the primary change. Four modifications:

#### a. Status-based editability

Add a computed flag:
```typescript
const BET_DESCRIPTION_MUTABLE_STATUSES = new Set<BetStatus>(["draft", "active"]);

// Inside component:
const canEditDescription = bet ? BET_DESCRIPTION_MUTABLE_STATUSES.has(bet.status) : false;
```

#### b. Replace BetPitch with conditional BodyEditor / BetPitch

The current `BetPitch` component renders `deriveBlocks -> <Block />` for read-only display. T3 adds an edit mode:

- **Mutable statuses (draft, active):** Render `<BodyEditor>` with auto-save. Show saving indicator. The BodyEditor replaces both the BetPitch read view and provides editing -- same "click to type" pattern as KnowledgeDetail.
- **Immutable statuses (completed, killed):** Render the existing `<BetPitch>` component unchanged (blocks with block actions popover, anchored messages, etc.).

The edit mode for bet description does NOT need an explicit Edit/Done toggle like KnowledgeDetail. The concept doc says "click-to-type anywhere" -- the BodyEditor is always shown in mutable statuses. The switch between BodyEditor and BetPitch is driven purely by bet status.

However, block actions (Discuss, popover) are read-mode concerns. They render on `<Block>` components in the `<BetPitch>` adapter. When the BodyEditor is active, TipTap owns the document and there are no `<Block>` components to attach actions to. This is the correct behavior per the concept doc: "Block actions: Not needed -- you ARE the editor."

**State additions in WorkBet:**
```typescript
const [editContent] = useState<string>(bet?.description ?? "");
const latestContentRef = useRef<string>("");

const { status: saveStatus, save: triggerSave } = useBetDescriptionSave({
  betId: bet?.id ?? "",
  onSaved: () => fetched.refresh(),
});

function handleDescriptionChange(markdown: string): void {
  latestContentRef.current = markdown;
  if (markdown === editContent) return; // dirty check (T2 F3 pattern)
  triggerSave(markdown);
}
```

**JSX replacement (around line 952-957):**
```tsx
{canEditDescription ? (
  <div className="flex flex-col gap-2" data-testid="bet-description-editor">
    <BodyEditor
      initialContent={bet.description}
      onChange={handleDescriptionChange}
      placeholder="Describe this bet..."
      variant="full"
      minHeight="200px"
    />
    <span
      className="text-xs text-[var(--text-lo)]"
      aria-live="polite"
      data-testid="bet-save-indicator"
    >
      {saveStatus === "saving" && "Saving..."}
      {saveStatus === "saved" && "Saved"}
      {saveStatus === "error" && (
        <span className="text-[var(--danger)]">Save failed</span>
      )}
    </span>
  </div>
) : (
  <BetPitch
    pitch={bet.description}
    betId={bet.id}
    onOpenBlockActions={(blockId) => setOpenBlockId(blockId)}
    messagesByBlockId={messagesByBlockId}
  />
)}
```

#### c. BetPitch prop rename

The `BetPitch` internal component's `pitch` prop should be renamed to `description` for consistency. Update the interface and all usages within WorkBet.tsx.

#### d. Block actions scope

The `BlockActionsPopover` and `openBlockId` state only apply when `BetPitch` is rendered (immutable statuses). When the BodyEditor is active, no block popover logic is needed. The existing guard `openBlockId !== null` already handles this -- no block actions are triggered during editing.

### 5.4 MODIFY: `packages/web/src/pages/work/BetCreateDialog.tsx`

Replace the description `<textarea>` with `<BodyEditor>`.

```tsx
{/* Description editor */}
<label className="flex flex-col gap-1">
  <span className="text-xs text-[var(--text-lo)]">
    Description <span aria-hidden>(required)</span>
  </span>
  <BodyEditor
    initialContent=""
    onChange={(md) => setDescription(md)}
    placeholder="Describe the bet..."
    variant="full"
    minHeight="160px"
    editable={!submitting}
  />
</label>
```

**Import addition:** `import { BodyEditor } from "@hyperidle/design-system";`

No other changes needed. The `description` state, `handleSubmit`, `canCreate`, and `derivedTitle` logic all consume the markdown string from `onChange` -- same interface as the textarea.

### 5.5 MODIFY: `packages/web/src/pages/__fixtures__/work-bet-fixtures.ts`

Rename all `pitch:` properties to `description:` to match the updated `BetDetail` type.

### 5.6 MODIFY: All test files referencing `bet.pitch` or `pitch:`

Update fixture references and assertions from `pitch` to `description`:
- `packages/web/src/__tests__/WorkBet.test.tsx`
- `packages/web/src/__tests__/WorkBet.detail.test.tsx`
- `packages/web/src/__tests__/WorkBet.pitch.test.tsx`
- `packages/web/src/__tests__/WorkBet.session.test.tsx`
- `packages/web/src/__tests__/WorkBet.task-sheet.test.tsx`
- `packages/web/src/__tests__/WorkBet.j8.test.tsx`
- `packages/web/src/__tests__/BetCreateDialog.test.tsx`

Grep for `pitch` across the entire `packages/web/` to catch any other references.

---

## 6. State Machine

### Bet description edit lifecycle

```
Page loads
    |
    v
[check bet.status]
    |
    +-- completed/killed --> render BetPitch (read-only blocks + block actions)
    |
    +-- draft/active --> render BodyEditor (WYSIWYG editing)
                              |
                         onChange fires
                              |
                         dirty check
                              |
                     (content unchanged) --> skip
                              |
                     (content changed) --> debounce 1500ms
                                                |
                                          PATCH /api/bets/:id
                                          { field: "description",
                                            value: markdown,
                                            reason: "Edited by user" }
                                                |
                                           +----+----+
                                           |         |
                                        200 OK    error
                                           |         |
                                     "saved"     "error"
                                     (3s fade)   (shown)
                                           |
                                        "idle"
```

No Edit/Done toggle needed. The BodyEditor is always mounted for mutable bets.

---

## 7. Test Strategy

### 7.1 New unit tests

#### `packages/web/src/hooks/__tests__/useBetDescriptionSave.test.ts`

| Test | What it verifies |
|---|---|
| debounces save calls | Multiple rapid calls result in one PATCH after debounce period |
| sends correct payload | PATCH body is `{ field: "description", value, reason: "Edited by user" }` |
| sends PATCH to correct URL | URL is `/api/bets/${betId}` |
| transitions idle -> saving -> saved -> idle | Status sequence on successful save |
| calls onSaved callback on success | Callback invoked |
| handles error response | Sets status to "error" on non-200 |
| cleans up timer on unmount | No state updates after unmount |
| no conflict handling | No 409 status path (bets have no version) |

### 7.2 Modified tests

#### `packages/web/src/__tests__/WorkBet.pitch.test.tsx` (or renamed to `WorkBet.description.test.tsx`)

Existing tests assert the read-only BetPitch rendering. T3 adds tests for:

| Test | What it verifies |
|---|---|
| shows BodyEditor for draft bet | BodyEditor rendered, no BetPitch |
| shows BodyEditor for active bet | BodyEditor rendered, no BetPitch |
| shows BetPitch for completed bet | BetPitch rendered (read-only blocks), no BodyEditor |
| shows BetPitch for killed bet | BetPitch rendered, no BodyEditor |
| saving indicator appears during save | data-testid="bet-save-indicator" shows "Saving..." |
| saving indicator shows "Saved" after success | Status transitions correctly |
| block actions work in read-only mode | Completed bet shows block popover with Discuss |

#### `packages/web/src/__tests__/BetCreateDialog.test.tsx`

| Test | What it verifies |
|---|---|
| renders BodyEditor instead of textarea | BodyEditor present, no textarea |
| BodyEditor onChange updates description state | Title preview updates on editor change |
| BodyEditor disabled during submission | `editable={false}` passed when submitting |

**TipTap/JSDOM challenge:** Same mitigation as T2 -- mock `BodyEditor` in page-level tests. BodyEditor has its own test suite in the design-system package. The integration tests verify correct prop passing.

### 7.3 E2E tests (Playwright)

#### `packages/web/e2e/bet-description-edit.spec.ts`

| Test | What it verifies |
|---|---|
| Edit description on active bet, see saving indicator | Full auto-save flow |
| Completed bet shows read-only blocks, no editor | Status-based toggle |
| Create bet with BodyEditor | Dialog opens, type in editor, create succeeds |

---

## 8. Ordered Implementation Tasks

### Task 1: Rename BetDetail.pitch to BetDetail.description

**Files:**
- `packages/web/src/types/bet.ts` (rename field)
- `packages/web/src/pages/__fixtures__/work-bet-fixtures.ts` (rename all `pitch:` to `description:`)
- `packages/web/src/pages/WorkBet.tsx` (update BetPitch interface + usages)
- All test files referencing `pitch` in bet context

**Acceptance:** `npm run check` passes. All references to `bet.pitch` updated to `bet.description`. The latent API mismatch is resolved.

### Task 2: Create useBetDescriptionSave hook + tests

**Files:**
- `packages/web/src/hooks/useBetDescriptionSave.ts` (new)
- `packages/web/src/hooks/__tests__/useBetDescriptionSave.test.ts` (new)

**Acceptance:** Hook passes all unit tests. Debounce, status transitions, payload shape, cleanup all verified.

### Task 3: Modify WorkBet -- add BodyEditor for mutable statuses

**Files:**
- `packages/web/src/pages/WorkBet.tsx` (conditional editor/read-only rendering, auto-save wiring, saving indicator)
- `packages/web/src/__tests__/WorkBet.pitch.test.tsx` (add editor tests, update existing read-only tests)

**Changes:**
1. Import `BodyEditor` from `@hyperidle/design-system`
2. Import `useBetDescriptionSave` from hooks
3. Add `BET_DESCRIPTION_MUTABLE_STATUSES` set and `canEditDescription` computed flag
4. Replace the `<BetPitch>` call site with conditional: BodyEditor for mutable, BetPitch for immutable
5. Add saving indicator JSX below the BodyEditor
6. Wire `useBetDescriptionSave` to `handleDescriptionChange`
7. Add dirty check (T2 F3 pattern)

**Acceptance:** Draft and active bets show BodyEditor with auto-save. Completed and killed bets show read-only blocks with block actions. Saving indicator works. All tests pass.

### Task 4: Modify BetCreateDialog -- replace textarea with BodyEditor

**Files:**
- `packages/web/src/pages/work/BetCreateDialog.tsx` (replace textarea)
- `packages/web/src/__tests__/BetCreateDialog.test.tsx` (update assertions)

**Changes:**
1. Import `BodyEditor` from `@hyperidle/design-system`
2. Replace `<textarea>` with `<BodyEditor>` instance
3. Map `disabled={submitting}` to `editable={!submitting}`

**Acceptance:** Create dialog uses BodyEditor. Creating a bet with formatted content works.

### Task 5: Update remaining tests + verify

**Files:**
- Any test files still broken from Task 1-4 changes
- Run `npm run verify` (typecheck + lint + test)

**Acceptance:** Zero type errors, zero lint errors, all tests green.

### Task 6: E2E tests

**Files:**
- `packages/web/e2e/bet-description-edit.spec.ts` (new)

**Acceptance:** Playwright tests verify full edit flow, status-based toggle, and create dialog.

---

## 9. Dependency Graph

```
Task 1 (rename pitch->description) ──┐
                                      ├──> Task 3 (WorkBet BodyEditor) ──┐
Task 2 (useBetDescriptionSave)  ──────┘                                  │
                                                                         ├──> Task 5 (verify)
Task 4 (BetCreateDialog BodyEditor) ────────────────────────────────────-┘         │
                                                                                   v
                                                                            Task 6 (E2E)
```

Tasks 1 and 2 are independent and can be built in parallel.
Task 3 depends on Tasks 1 and 2.
Task 4 depends on Task 1 (for the type rename) but is independent of Tasks 2 and 3.
Task 5 depends on Tasks 3 and 4.
Task 6 depends on Task 5.

---

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| pitch->description rename cascades widely | Medium | Low | Grep thoroughly. The rename is mechanical. `npm run check` catches type errors. |
| TipTap DOM requirements break JSDOM tests | High | Medium | Mock BodyEditor in page-level tests (same mitigation as T2). E2E tests verify real rendering. |
| Auto-save fires on BodyEditor mount (T2 F3) | High | Low | Dirty check: skip save when content matches initialContent. Already solved in T2. |
| BetPitch loses block actions when BodyEditor is mounted | Low | None | By design. Block actions are read-mode concerns. When editing, the user IS the editor. Block anchored messages are not shown during editing -- they reappear when the bet transitions to an immutable status or the page reloads. |
| BodyEditor in dialog has different height behavior | Low | Low | `minHeight="160px"` constrains the editor. DaisyUI dialog handles overflow. |
| Bet description save fails silently on status change | Low | Medium | The server returns 400 when status is not mutable. The hook sets status to "error" and the indicator shows "Save failed". The user sees the feedback. |
| useBet hook does not re-fetch after auto-save | Medium | Medium | `onSaved` callback calls `fetched.refresh()` to re-fetch the bet. This ensures the BetCard title (derived from description) updates after save. |

---

## 11. Self-Critique

**Potential over-engineering:** Creating a separate `useBetDescriptionSave` hook when `useAutoSave` could be generalized. Counter: the payload shapes are genuinely different (knowledge: `body/version/updatedBy` vs bet: `field/value/reason`), and bets have no version/conflict handling. A generalized hook would need conditional logic for both shapes, adding complexity for exactly two consumers. If a third surface needs auto-save, generalize then.

**Potential under-engineering:** No Edit/Done toggle for bet description editing. The BodyEditor is always mounted for mutable bets. Counter: the concept doc explicitly says "click-to-type anywhere, no Edit button." The knowledge page needs Edit/Done because factory items are read-only within a mutable status. Bets have no equivalent concept -- all draft/active bets are editable. The always-on editor is the correct UX.

**Missing from spec:** AC-6 says "Block actions (Discuss, block popover) work in read-only mode when the pitch is not being actively edited." The architecture handles this: block actions render on `<BetPitch>` (which uses `<Block>` components with `onOpenActions`). When BodyEditor is active, there are no `<Block>` components, so no block actions. The AC language "when the pitch is not being actively edited" maps to immutable statuses where `<BetPitch>` renders. For mutable statuses, the pitch IS always being actively edited (BodyEditor is always mounted). Block actions are available only when the bet reaches a terminal status.

**Spec says "pitch" but codebase says "description":** The AC text uses "pitch" throughout. The U1 rename to "description" supersedes this. The architecture uses `description` consistently. The builder should follow the architecture, not the literal AC text.
