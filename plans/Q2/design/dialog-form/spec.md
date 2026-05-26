# Variant A: Dialog Form

**Constraint:** Stay close to existing dialog patterns (ConsequencePreviewDialog, AppetiteDialog in WorkBet). Reuse DaisyUI dialog + form primitives. Minimal new surface area.

**Thesis:** A modal dialog is the established pattern for founder actions in HyperIdle (pause/kill/appetite). A creation dialog keeps the user in context (the list page stays visible behind the modal overlay) and has a clear open/close lifecycle.

## User task

Founder captures a knowledge item by clicking "New item" from Knowledge view (or "Add knowledge" from bet/task detail), filling a short form in a dialog, and saving.

## Component composition

### 1. Knowledge creation trigger (KnowledgeList header)

The KnowledgeList page header currently has "Knowledge Base" title + scope indicator badge. Add a `btn btn-xs btn-ghost` labeled "+ New" to the right of the title. Placement: between the title and the scope badge.

```
┌─────────────────────────────────────────────────┐
│ KNOWLEDGE BASE        [+ New]          practice  │
│ [Triage] [Curated]                               │
```

### 2. Contextual trigger (WorkBet)

Below the HostThreadSection heading "Discussion" and above the thread, add a text link: "Add knowledge" (`btn btn-xs btn-ghost`). Same visual weight as the "Open thread" link in TaskSheet.

### 3. Contextual trigger (TaskSheet)

Inside the scrollable body, after the inline thread section and before the REQUEST section, add "Add knowledge" (`btn btn-xs btn-ghost`).

### 4. KnowledgeCreateDialog

A native `<dialog>` (same pattern as ConsequencePreviewDialog) with:

**Layout:**
```
┌─ New knowledge item ────────────────────────────────┐
│                                                       │
│  Scope    [factory        ▾]   [scope_id field]      │
│                                                       │
│  Title    [                                    ]      │
│                                                       │
│  Body     [                                    ]      │
│           [                                    ]      │
│           [           markdown textarea        ]      │
│           [                                    ]      │
│                                                       │
│                            [Cancel]  [Create]         │
└───────────────────────────────────────────────────────┘
```

**Fields:**
- **Scope kind** (`<select>`): factory | product | practice | team | bet | task | user. Pre-filled from context (factory from Knowledge view, bet from bet detail, task from task sheet, user when explicitly chosen).
- **Scope ID** (`<select>` or `<input>`): shown only when scope_kind is not factory. Pre-filled when contextual (bet ID, task ID). When scope_kind is product, shows a dropdown of products. When scope_kind is team, shows a dropdown of teams. When scope_kind is user, auto-filled with current user ID (hidden/read-only). When scope_kind is practice, shows a text input for practice community ID.
- **Title** (`<input>`): required. Standard text input.
- **Body** (`<textarea>`): required. Markdown body. Minimum height 160px. No live preview (saves dialog real estate; preview is available after creation on the detail page).

**Dialog constraints:**
- `min-w-[400px] max-w-[560px]` -- narrower than a page, wider than the action dialogs
- Non-dismissible (Escape blocked, same as ConsequencePreviewDialog) -- prevents accidental loss of typed content
- Cancel button discards draft with no confirmation (the content is short enough to retype)
- Create button disabled until title and body are non-empty

### 5. Scope change action (KnowledgeDetail)

On the KnowledgeDetail metadata bar, add a "Change scope" `btn btn-xs btn-ghost` next to the existing Tag/StatusChip row. Clicking opens a small dialog:

```
┌─ Change scope ──────────────────────┐
│                                       │
│  Current: factory                     │
│  New scope  [product       ▾]        │
│  Scope ID   [product-abc   ▾]        │
│                                       │
│  Reason     [                    ]    │
│             (required)                │
│                                       │
│              [Cancel]  [Save]         │
└───────────────────────────────────────┘
```

Reason field is required (same pattern as ConsequencePreviewDialog) because scope changes affect visibility and are tracked in version history. The user must articulate why they are re-scoping.

### 6. User-scoped item visibility in KnowledgeList

Items with `scope_kind: "user"` show a `Tag` labeled "Private" to the right of the title in each KnowledgeRow. The server filters user-scoped items to only return them for the owning user. No special tab or filter is needed -- they appear inline in the Triage/Curated views with the "Private" badge.

## Information hierarchy

1. **Primary:** Title field (largest input, immediate focus on dialog open)
2. **Secondary:** Body field (most space, the actual content)
3. **Tertiary:** Scope selection (usually pre-filled, rarely changed)

## States

### Empty (dialog just opened)
- Title: empty, focused
- Body: empty
- Scope: pre-filled from context
- Create button: disabled

### Filling
- Title: has text
- Body: has text
- Scope: selected
- Create button: enabled

### Submitting
- All fields disabled
- Create button shows loading spinner (same as ConsequencePreviewDialog)
- Cancel button disabled

### Error
- Inline error message below the form (`role="alert"`, red text)
- Fields re-enabled
- Create button re-enabled

### Success
- Dialog closes
- KnowledgeList refetches (or the caller's page refreshes)
- No toast (consistent with existing patterns -- the new item appearing in the list IS the feedback)

## Behavior

- **Focus:** On open, focus moves to the Title input
- **Tab order:** Scope kind -> Scope ID (if visible) -> Title -> Body -> Cancel -> Create
- **Keyboard:** Cmd/Ctrl+Enter submits from any field (same as Composer)
- **Escape:** Blocked (non-dismissible, prevents content loss)
- **Motion:** Dialog uses standard `showModal()` -- no custom animation

## Mobile adaptation

On mobile (viewport <= 768px), the dialog renders as a near-full-screen overlay (`max-w-full max-h-[90vh]`). Same field layout, stacked vertically. Body textarea gets `text-base` (16px) to prevent iOS zoom.

## Signature

A creation dialog that mirrors the system's existing action-dialog pattern (ConsequencePreviewDialog) but for constructive actions. The scope picker is a progressive-disclosure select (scope_kind drives scope_id visibility). The form is deliberately minimal -- title, body, scope -- because knowledge items are small and the detail page provides richer editing.

## Trade-offs

- **Good at:** Familiar pattern, low implementation cost, clear lifecycle (open/close), works from any trigger point
- **Bad at:** No live markdown preview in the creation dialog (available after save on detail page), dialog interrupts visual context more than inline expansion would
- **Risk:** If founders frequently create items, the dialog open/close cycle adds friction vs. inline creation. But the brief says creation is low-volume (a few per day).
