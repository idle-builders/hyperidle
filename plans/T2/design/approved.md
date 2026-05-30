# T2 Design Brief -- Knowledge WYSIWYG Editing

**Classification:** Routine UI (1 variant)
**Reason:** Wiring an existing component (BodyEditor from T1) into existing surfaces. No new primitives, no novel interaction patterns.

---

## 1. KnowledgeDetail: Edit-Mode Transition

### Current state (what exists today)

`KnowledgeDetail.tsx` has an explicit "Edit" button (line 298) that toggles between:
- **Read mode:** `KnowledgeBody` renders `deriveBlocks() -> <Block />` (line 386-391)
- **Edit mode:** Side-by-side textarea + `KnowledgeBody` preview (lines 364-384), with Save/Cancel buttons (lines 377-381)

The Save button calls `saveEdit()` (line 266) which only updates React state -- it never calls the API. This is the bug the concept doc identifies.

### Target state (T2)

**Keep the explicit Edit button.** The concept doc says "no explicit Edit button needed" but T2's scope is "integrate BodyEditor" not "redesign the page interaction model." The existing Edit button is discoverable and the test suite depends on it (`KnowledgeDetail.edit.test.tsx` asserts `screen.getByRole("button", { name: /edit/i })`). Removing the button and implementing click-to-edit inline would expand scope significantly (focus management, click-outside detection, mode ambiguity for assistive tech). That is a valid future improvement but not T2.

**The edit-mode transition:**

1. User clicks "Edit" button (unchanged trigger).
2. **The textarea + preview split is replaced by a single `<BodyEditor />` instance.** No side-by-side. The editor IS the editing surface. It fills the same space the `KnowledgeBody` read view occupied.
3. The editor loads the current `savedContent` as `initialContent`.
4. As the user types, `onChange` fires with serialized markdown. A debounced auto-save sends `PATCH /api/knowledge/:id` with `{ body, version, updatedBy }`.
5. **Save/Cancel buttons are removed.** Auto-save replaces explicit save. A "Done" button (or the user clicking elsewhere) exits edit mode.
6. On exit: the editor unmounts, `KnowledgeBody` re-renders with the saved content via `deriveBlocks() -> <Block />`.

**Why keep "Edit" + "Done" instead of click-to-edit:**
- Factory-scope items must NOT be editable. The Edit button is hidden for factory items (`!(isFactory || editing)` at line 297). Click-to-edit would require a different guard mechanism.
- The existing test assertions on `screen.getByRole("button", { name: /edit/i })` stay green with minimal change.
- Screen readers get clear mode signaling: "Edit" button communicates intent, editor region communicates active editing.

### Visual layout in edit mode

```
+--------------------------------------------------------------+
| Title                                         [Done]         |
+--------------------------------------------------------------+
| metadata bar (unchanged)                                     |
+--------------------------------------------------------------+
| BodyEditor (full width, no sidebar split)                    |
| +----------------------------------------------------------+ |
| | Start writing...  (placeholder when empty)               | |
| |                                                          | |
| | ## Heading                                               | |
| | Formatted text with **bold** rendering                   | |
| |                                                          | |
| +----------------------------------------------------------+ |
| Saving...  |  Saved 3s ago                                   |
+--------------------------------------------------------------+
| Discussion (HostThreadSection -- unchanged)                  |
+--------------------------------------------------------------+
| Related sidebar (unchanged, still in grid-cols layout)       |
+--------------------------------------------------------------+
```

The editor gets `minHeight="200px"` to avoid the content area collapsing when body is short.

---

## 2. Auto-Save Indicator

### Placement

Below the BodyEditor, left-aligned, same row as the editing area. Not a toast (too noisy for auto-save). Not in the header (too far from the content the user is editing).

### States

| State | Text | Color | Trigger |
|---|---|---|---|
| Idle | (hidden) | -- | No changes pending, no recent save |
| Dirty | (hidden) | -- | User has typed but debounce has not fired yet |
| Saving | "Saving..." | `var(--text-lo)` | Debounce fired, PATCH request in flight |
| Saved | "Saved" | `var(--text-lo)` | PATCH returned 200. Fades out after 3 seconds |
| Error | "Save failed" | `var(--danger)` | PATCH returned non-409 error (network, 500) |
| Conflict | (handled by banner, not indicator) | -- | PATCH returned 409 |

The indicator is a `<span>` with `text-xs text-[var(--text-lo)]`. No icon. The "Saved" state uses `opacity` transition (AQ-013: `var(--motion-medium)`) to fade out.

### Implementation shape

This is a `useAutoSave` hook, not a component. The hook returns `{ saveStatus, triggerSave }` and the consuming component renders the status text inline. The hook encapsulates debounce, fetch, version tracking, and status transitions.

---

## 3. Conflict Banner

### When it appears

The PATCH endpoint returns 409 when `body.version !== existing.version`. This means another session saved the item between when this session loaded it and when it tried to save.

### Design

An inline `role="alert"` banner between the metadata bar and the editor. Same pattern as the existing `factory-amendable-banner` (line 286-292 in KnowledgeDetail.tsx).

```
+--------------------------------------------------------------+
| [!] Version conflict -- someone else saved this item.        |
|     Reload to see their changes, or continue editing.        |
|                                              [Reload]        |
+--------------------------------------------------------------+
```

- **Background:** `var(--surface-4)` (neutral, not danger -- this is informational, not destructive)
- **Border:** `border-[var(--border-subtle)]`
- **Text:** `text-xs text-[var(--text-mid)]`
- **Reload button:** `btn btn-xs btn-ghost` -- triggers `window.location.reload()` (simple and correct for the single-user desktop context; no SPA refetch needed)
- **No auto-dismiss.** The banner stays until the user acts.

### What "Reload" does

Full page reload. The user loses unsaved edits in the editor. This is acceptable because:
1. HyperIdle is a single-user desktop app -- conflicts are rare (agent wrote while human was editing).
2. The conflict means the server already has a newer version. The user's edits are against stale content.
3. A merge UI would be overengineered for v1.

### data-testid

`conflict-banner` -- for the Playwright test that simulates a 409 response.

---

## 4. KnowledgeCreateDialog Integration

### Current state

`KnowledgeCreateDialog.tsx:157-163` has a plain `<textarea>` with placeholder "Describe it in markdown...".

### Target state

Replace the `<textarea>` with `<BodyEditor />`:

```tsx
<BodyEditor
  initialContent=""
  onChange={(md) => setBody(md)}
  placeholder="Start writing..."
  variant="full"
  minHeight="128px"
  autoFocus={false}
/>
```

**Adjustments:**
- The `<label>` wrapping the textarea stays. The BodyEditor sits where the textarea was.
- `minHeight="128px"` matches the current `h-32` on the textarea (32 * 4px = 128px).
- The `disabled={submitting}` prop on the textarea maps to `editable={!submitting}` on BodyEditor.
- The `canCreate` check (`body.trim().length > 0`) stays unchanged -- `body` state is updated via `onChange`.

### Dialog sizing

The dialog is `min-w-[320px] max-w-[480px]`. The BodyEditor inside it will respect this width. No width changes needed.

---

## 5. Edge Cases

### Empty body

- **Read mode:** `KnowledgeBody` already handles empty bodies: `(no content yet)` text (KnowledgeBody.tsx:109).
- **Edit mode:** BodyEditor shows the placeholder text ("Start writing..." or configurable). Already handled by T1's placeholder extension.

### Very long content

- **Read mode:** Unchanged -- blocks render sequentially, page scrolls naturally.
- **Edit mode:** TipTap handles long documents well (ProseMirror is designed for this). The `minHeight` sets a floor, not a ceiling -- the editor grows with content. No max-height or scrolling constraint. The page itself scrolls.

### Factory-scope items (read-only)

- The "Edit" button is already hidden for factory-scope items (line 297: `!(isFactory || editing)`).
- The `amendableBanner` already shows for factory items with `needs_human` status (line 286-292).
- No BodyEditor is ever mounted for factory items. The read-only path is unchanged.
- **No change needed** -- the existing guard at line 297 handles this.

### Network errors during auto-save

- If PATCH fails with a non-409 error (network, 500), the save indicator shows "Save failed" in `var(--danger)`.
- The user's edits are preserved in the editor (TipTap state). The auto-save will retry on the next change.
- No retry loop -- the user types again, the debounce fires again, and the save retries naturally.

### Navigating away with unsaved changes

- Out of scope for T2. The concept doc does not specify beforeunload guards and the current implementation has no such guard. A future workpackage could add `onbeforeunload` or React Router blocker.

---

## 6. "Did We Consider" Check

| Consideration | Decision | Rationale |
|---|---|---|
| Click-to-edit instead of Edit button? | No -- keep Edit button | Scope control, factory guard, test compatibility, a11y clarity |
| Floating toolbar vs fixed toolbar? | Floating (from T1) | BodyEditor already implements floating toolbar. No change needed. |
| Markdown source toggle? | No -- out of scope for T2 | Concept doc recommends it but it is an enhancement, not a T2 AC |
| Save/Cancel vs auto-save? | Auto-save only | Concept doc is clear: "Remove the explicit Save/Cancel buttons" (line 337) |
| Confirmation before discard? | No | Current implementation has no beforeunload. Defer to future WP. |
| Conflict resolution merge UI? | No -- reload only | Single-user desktop app, conflicts are agent-vs-human, overengineered for v1 |
| Read-mode BodyEditor (editable=false)? | No | Read mode uses deriveBlocks -> Block, not BodyEditor. Concept doc is explicit about this separation (lines 304-322). |
| Auto-focus in edit mode? | Yes | `autoFocus={true}` on the BodyEditor when entering edit mode. The user clicked Edit -- they want to type. |

---

## 7. Component Budget Impact

**No new custom components.** T2 uses:
- `BodyEditor` (already exists, built in T1, the 20th custom component)
- `Block`, `StatusChip`, `Tag`, `BlockActionsPopover` (existing, unchanged)
- DaisyUI primitives: `btn`, `alert` (existing usage patterns)

The `useAutoSave` hook is a hook, not a component. The conflict banner is inline JSX, not a reusable component (it is specific to the optimistic-locking pattern on knowledge items -- if T3/bets need it too, extract then).

---

## 8. Accessibility

- Edit mode is entered via a button press (keyboard accessible).
- The "Done" button exits edit mode (keyboard accessible).
- The conflict banner has `role="alert"` so screen readers announce it immediately.
- The save indicator is a live region (`aria-live="polite"`) so screen readers announce save status without interrupting the user.
- The BodyEditor itself handles keyboard accessibility (TipTap/ProseMirror has built-in keyboard support for all editing operations).
