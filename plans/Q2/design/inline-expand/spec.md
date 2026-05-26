# Variant B: Inline Expand

**Constraint:** Challenge the dialog pattern. Optimise for capture speed by keeping the creation form inline on the page -- no modal overlay, no context switch. The form expands in place and collapses after save.

**Thesis:** For a "write it down now" task, the fastest path is an inline form that expands where the user already is. No dialog chrome, no overlay. The list stays visible. This matches how Linear handles inline issue creation (type directly in the list) but with HyperIdle's form density.

## User task

Founder clicks "New" on the Knowledge list. A form section expands above the Triage/Curated tabs (or below the header). Founder types title + body, optionally adjusts scope, and hits Create. The form collapses and the new item appears in the list.

## Component composition

### 1. Inline creation section (KnowledgeList)

The "New" button is in the same position as Variant A. But instead of opening a dialog, clicking it expands a section between the header and the tab row:

```
┌─────────────────────────────────────────────────┐
│ KNOWLEDGE BASE        [+ New]          practice  │
│                                                   │
│ ┌── New item ──────────────────────────────────┐ │
│ │ [Title                                     ] │ │
│ │ [Body (markdown)                           ] │ │
│ │ [                                          ] │ │
│ │                                              │ │
│ │ Scope: factory ▾  [scope_id]   [Create]      │ │
│ └──────────────────────────────────────────────┘ │
│                                                   │
│ [Triage] [Curated]                               │
│ ... items ...                                     │
```

**Differences from Variant A:**
- No dialog overlay -- the form is an inline `<section>` with `bg-[var(--surface-2)]` and `rounded-[var(--r2)]` border
- Title is auto-focused on expand
- Scope picker is compact: a single line with scope_kind dropdown + scope_id (same progressive disclosure as Variant A but laid out horizontally)
- Create button is inline on the scope row (right-aligned)
- No Cancel button -- clicking "New" again (now labeled "Cancel") or pressing Escape collapses the form and discards content
- Collapse animation: `--motion-medium` (150ms) height transition via `max-height` trick (animate opacity + transform only per AQ-014; height handled via conditional render, not CSS transition)

**Form layout (compact):**
```
Row 1: Title input (full width)
Row 2: Body textarea (full width, min-h-[120px])
Row 3: [scope_kind ▾] [scope_id ▾]  ................  [Create]
```

### 2. Contextual creation (WorkBet, TaskSheet)

Same inline-expand pattern but simpler: no scope picker visible (scope is pre-filled and shown as a read-only Tag). The form is just Title + Body + Create.

**WorkBet:** Expand section appears before the HostThreadSection ("Discussion"). The trigger is "Add knowledge" `btn btn-xs btn-ghost`.

**TaskSheet:** The inline form appears inside the scrollable body, between the thread and the REQUEST section. Space is tighter here -- body textarea min-height reduced to 80px.

### 3. Scope change (KnowledgeDetail)

Same approach as Variant A -- a small dialog is appropriate here because scope change is infrequent and requires a reason field. Inline expansion on the detail page would displace existing content awkwardly. This is the one place the dialog pattern is kept.

### 4. User-scoped item visibility

Same as Variant A: "Private" Tag badge on user-scoped items in KnowledgeRow.

## Information hierarchy

1. **Primary:** Title input (first field, auto-focused, full width)
2. **Secondary:** Body textarea (most vertical space)
3. **Tertiary:** Scope + Create action (bottom row, compact, usually defaulted)

## States

### Collapsed (default)
- "New" button visible in header
- No form section rendered

### Expanded (creating)
- "New" button label changes to "Cancel" (or shows as "x" icon)
- Form section rendered with `bg-[var(--surface-2)]`
- Title auto-focused

### Filling
- Title and body have content
- Create button enabled (text: "Create")

### Submitting
- Create button shows spinner, disabled
- Fields disabled
- Cancel hidden

### Success
- Form collapses (no transition -- instant unmount)
- New item appears at top of Triage list (it starts as "draft")
- Title and body cleared (fresh for next creation if they immediately re-expand)

### Error
- Inline error below the form body (`role="alert"`)
- Fields re-enabled

## Behavior

- **Focus:** On expand, title input receives focus. On collapse (cancel), focus returns to the "New" button.
- **Tab order:** Title -> Body -> Scope kind -> Scope ID (if visible) -> Create
- **Keyboard:** Cmd/Ctrl+Enter submits from Title or Body. Escape collapses the form.
- **Motion:** Expand is instant render (no animation for the section itself -- the section simply mounts). This avoids animating height (AQ-014 forbids layout property transitions).

## Mobile adaptation

On mobile, the inline form takes full width. The scope row stacks vertically (scope_kind dropdown on one line, scope_id on the next, Create button full-width below). Body textarea gets `text-base` (16px).

## Signature

Inline creation -- the form lives on the page, not in a floating overlay. The user's eye stays on the list. Scope selection is a compact bottom row, not a prominent top field. The whole flow is: click New, type, Create. Two clicks, no dialog lifecycle.

## Trade-offs

- **Good at:** Fastest capture path (no dialog open/close), keeps list context visible, scope selection is unobtrusive
- **Bad at:** Takes vertical space on the list page (pushes items down), form is more cramped than a dialog (especially on mobile where the TaskSheet is already tight), harder to implement focus management (no native dialog trap)
- **Risk:** The inline form in TaskSheet may feel too cramped -- the sheet is already narrow (max-w-[640px]) and packed. The creation form competes for vertical space with the thread and request sections.
