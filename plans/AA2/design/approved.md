# AA2 Approved Design — Routine Management

DESIGN-CLASS: routine  ref=BetCreateDialog,KnowledgeCreateDialog,WorkRoutine  pattern=none

---

## 1. Overview

Three UI surfaces, all extending existing patterns:

1. **RoutineCreateDialog** -- native `<dialog>` for creating a new routine (from WorkTeam page)
2. **WorkRoutine detail page extensions** -- edit fields, Delete button, confirmation dialog (extending existing AA1 page)
3. **Schedule picker** -- preset-based cron selector composed from DaisyUI select elements (inside the create dialog and detail page)

No new design-system components. Zero component budget impact.

---

## 2. RoutineCreateDialog

### Pattern

Follows `BetCreateDialog.tsx` and `KnowledgeCreateDialog.tsx` exactly:
- Native `<dialog>` element with `aria-modal="true"`
- `min-w-[320px] max-w-[480px] w-full`
- `p-4 flex flex-col gap-3` inner layout (matches BetCreateDialog: `p-4` = 16px is existing dialog pattern, not card padding)
- Section heading: `text-sm font-heading font-semibold uppercase tracking-wider` -- "New routine"
- Cancel (btn-ghost btn-sm) and Create (btn-primary btn-sm) pill buttons, `min-h-[44px]` for AQ-015 touch targets
- Form state reset on open, error display via `role="alert"` paragraph

### Fields (in order)

1. **Name** (required)
   - `<label>` with `<input>` element
   - DaisyUI `input input-bordered input-sm text-base w-full`
   - Placeholder: "e.g. Daily digest"
   - Label: `text-xs text-[var(--text-tertiary)]` -- "Name (required)"

2. **Description** (optional)
   - `<label>` with `<textarea>` element
   - DaisyUI `textarea textarea-bordered text-base w-full`
   - 3 rows default, no auto-resize
   - Placeholder: "What does this routine do?"
   - Label: "Description"
   - Note: NOT using BodyEditor here. Routine descriptions are short plaintext, not rich content. A textarea is sufficient and avoids ProseMirror overhead for a 1-2 sentence field.

3. **Team** (required, conditional visibility)
   - Same pattern as BetCreateDialog team select
   - Hidden when only one team exists (auto-resolved)
   - DaisyUI `select select-bordered select-sm text-base w-full`
   - Label: "Team (required)"

4. **Assigned agent** (required)
   - DaisyUI `select select-bordered select-sm text-base w-full`
   - Options populated from team roster (agents only, filtered by `role !== 'human'`)
   - Label: "Agent (required)"
   - Default: first agent in the team roster

5. **Schedule** (required)
   - See section 4 below for the schedule picker design
   - Label: "Schedule (required)"

6. **Cost cap per run** (optional)
   - `<label>` with `<input type="number">`
   - DaisyUI `input input-bordered input-sm text-base w-full`
   - Placeholder: "No limit"
   - Label: "Cost cap per run (USD, optional)"
   - Suffix: displays "$" prefix inline (same pattern as budget fields in bets)
   - When empty: no cap enforced. When filled: stored as minor units (cents).

### States

- **Empty (initial):** All fields at defaults. Create button disabled.
- **Valid:** Name non-empty, agent selected, schedule selected. Create button enabled.
- **Submitting:** All fields disabled. Create button shows "..." text. Cancel disabled.
- **Error:** Red `text-xs text-error` paragraph with `role="alert"` below fields, above buttons.
- **Success:** Dialog closes, `onCreated()` callback fires, parent refreshes routine list.

### Submit payload

```typescript
POST /api/routines
{
  name: string,           // required, trimmed
  description: string,    // optional
  teamId: string,         // required
  ownerAgentId: string,   // required
  triggerType: "calendar", // always "calendar" for AA2 (event triggers out of scope)
  triggerConfig: string,  // JSON: { cron: "<cron expression>" }
  costCapPerRunMinor: number | null,  // optional, in USD cents
}
```

### Trigger point

A "New routine" button on the WorkTeam page, in the routines section header. Placement: inline with the "Routines" section heading, right-aligned.

```tsx
<div className="flex items-center justify-between">
  <h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
    Routines
  </h2>
  <button
    type="button"
    className="btn btn-ghost btn-sm min-h-[44px]"
    onClick={() => setCreateDialogOpen(true)}
    data-testid="routine-create-btn"
  >
    + New routine
  </button>
</div>
```

---

## 3. WorkRoutine detail page extensions

### 3a. Edit capability

Editing happens inline on the existing WorkRoutine detail page, not in a separate dialog. This follows the principle of progressive disclosure: the detail page already shows all the fields; editing them in place avoids a round-trip to a modal that shows the same information.

**Editable fields:** name, description, schedule, cost cap per run.

**Interaction:** Each editable field shows a pencil icon (text-tertiary, 12px) on hover. Clicking enters edit mode: the field becomes an input/select, with Save/Cancel buttons. One field at a time (no multi-field edit mode).

Implementation: This is a lightweight inline edit pattern, not a full form. Each field has three states:
- **Display:** shows the current value as text (existing KeyValue component)
- **Editing:** replaces the value with an input/select + Save (btn-primary btn-sm) / Cancel (btn-ghost btn-sm)
- **Saving:** input disabled, Save button shows "..."

The PATCH endpoint already accepts `name`, `description`, `triggerConfig`, and will be extended to accept `costCapPerRunMinor`.

### 3b. Delete action

A "Delete" button in the action bar (alongside existing Pause/Resume and Trigger Now). Uses `btn-ghost btn-sm` with `text-[var(--status-error)]` text color -- NOT a `btn-error` because AQ-004 says status through content, not structure.

**Confirmation:** Clicking Delete opens a small inline confirmation (not a dialog). Pattern:

```
[Delete] clicked ->
  replaces action bar with:
  "Delete this routine? History will be preserved."
  [Cancel] [Confirm delete]
```

- "Confirm delete" uses `text-[var(--status-error)]` text, btn-ghost btn-sm
- Cancel returns to normal action bar
- Confirm sends `DELETE /api/routines/:id` (soft delete via `deleted_at` timestamp)
- On success: navigates back to WorkTeam page

### 3c. Pause/Resume (existing, no changes)

Already implemented in AA1. The existing `handleTogglePause` function PATCHes `state: "paused"` or `state: "active"`. No design changes needed.

### 3d. Action bar layout (updated)

The existing action bar in the configuration section gains the Delete button:

```tsx
<div className="flex gap-[9px] mt-[18px]" data-testid="routine-actions">
  <button className="btn btn-ghost btn-sm" onClick={handleTogglePause}>
    {currentState === "active" ? "Pause" : "Resume"}
  </button>
  <button className="btn btn-primary btn-sm" onClick={handleTriggerNow}>
    Trigger Now
  </button>
  <div className="flex-1" /> {/* spacer */}
  <button className="btn btn-ghost btn-sm text-[var(--status-error)]" onClick={handleDelete}>
    Delete
  </button>
</div>
```

Delete is right-aligned (separated by flex spacer) to prevent accidental clicks near the primary actions.

---

## 4. Schedule picker

### Design decision: preset-based with optional custom

The schedule picker is NOT a full cron editor. It is a preset selector with an optional custom cron input. This matches the spec: "cron with human-friendly presets."

**Rationale:** Team leads are not sysadmins. A five-field cron editor is hostile UX. Presets cover 90% of use cases. The custom input handles the rest.

### Layout

Two elements stacked vertically:

1. **Preset select** -- DaisyUI `select select-bordered select-sm text-base w-full`
2. **Custom cron input** -- DaisyUI `input input-bordered input-sm text-base w-full`, shown only when "Custom..." preset is selected

### Presets

| Label | Cron expression |
|---|---|
| Every hour | `0 * * * *` |
| Every day at 9am | `0 9 * * *` |
| Every weekday at 9am | `0 9 * * 1-5` |
| Every Monday at 9am | `0 9 * * 1` |
| Every month (1st at 9am) | `0 9 1 * *` |
| Custom... | (shows cron input) |

### Custom cron input

- Placeholder: `0 9 * * 1-5`
- Below the input: a live preview label showing the humanized schedule (using the existing `humanizeSchedule` utility). If the cron cannot be parsed: "Invalid cron expression" in `text-[var(--status-error)]`.
- The preview uses `text-xs text-[var(--text-tertiary)]` and updates on every keystroke (debounced 300ms).

### Value flow

The schedule picker produces a cron expression string. The dialog stores it as `triggerConfig: JSON.stringify({ cron: selectedCron })`. The `triggerType` is always `"calendar"` for AA2 (event triggers are out of scope).

---

## 5. Rejected directions

1. **Full-page creation form.** Rejected. Routines have 4-6 fields. A full page for this is over-engineered. The dialog pattern (BetCreateDialog, KnowledgeCreateDialog) is established and appropriate.

2. **Separate edit dialog.** Rejected. The detail page already shows all routine fields. Opening a dialog that duplicates the same information is a round-trip for no benefit. Inline editing is more direct.

3. **Visual cron builder (drag-and-drop calendar).** Rejected. Over-engineering. A select with presets + a text input for custom cron covers the use case. The spec says "cron with human-friendly presets," not "visual cron calendar."

4. **Multi-step wizard for creation.** Rejected. The creation form has 4-6 fields. A wizard would add 3-4 page transitions for a 10-second form fill. Rejected per principle of restraint.

5. **Inline creation in the routine list (add-row pattern).** Rejected. Adding a row inline works for simple entities (tags, labels). Routines have a schedule picker and agent selector -- too much complexity for an inline row.

6. **Toast confirmation for delete.** Rejected. Delete is destructive and irreversible from the user's perspective (soft delete is an implementation detail). An inline confirmation is the right level of friction -- more than a toast, less than a modal.

7. **BodyEditor for description.** Rejected. Routine descriptions are 1-2 sentences of plaintext. ProseMirror overhead is unjustified. A plain `<textarea>` is sufficient.

---

## 6. Component mapping

| UI element | Component | Source |
|---|---|---|
| Create dialog container | Native `<dialog>` | DaisyUI |
| Dialog heading | `text-sm font-heading font-semibold uppercase tracking-wider` | Hearth heading pattern |
| Name input | DaisyUI `input input-bordered input-sm` | Existing |
| Description textarea | DaisyUI `textarea textarea-bordered` | Existing |
| Team select | DaisyUI `select select-bordered select-sm` | Existing |
| Agent select | DaisyUI `select select-bordered select-sm` | Existing |
| Schedule preset select | DaisyUI `select select-bordered select-sm` | Existing |
| Custom cron input | DaisyUI `input input-bordered input-sm` | Existing |
| Cost cap input | DaisyUI `input input-bordered input-sm` | Existing |
| Cancel button | `btn btn-ghost btn-sm` pill | Existing |
| Create button | `btn btn-primary btn-sm` pill | Existing |
| Delete button | `btn btn-ghost btn-sm text-[var(--status-error)]` | Existing pattern |
| Status chip (detail page) | `StatusChip` | Design system |
| Config KV pairs (detail page) | `KeyValue` | Design system |
| Empty state | `EmptyState` | Design system |
| Error state | `ErrorState` | Design system |
| Loading skeleton | `SkeletonCard` | Design system |
| Inline edit Save/Cancel | `btn btn-primary btn-sm` / `btn btn-ghost btn-sm` | Existing |

---

## 7. All states

### RoutineCreateDialog states

| State | Description | Copy |
|---|---|---|
| Empty (initial) | Dialog opens with all fields at defaults | Create button disabled |
| Partially filled | Some fields filled, not all required | Create button disabled |
| Valid | All required fields filled | Create button enabled, forest green |
| Submitting | POST in flight | All fields disabled, Create shows "..." |
| Error | API returned error | Red error text below fields: "Failed to create routine: {message}" |
| Success | API returned 201 | Dialog closes, parent refreshes |

### Delete confirmation states

| State | Description | Copy |
|---|---|---|
| Idle | Delete button shown in action bar | "Delete" text in error color |
| Confirming | Inline confirmation replaces action bar | "Delete this routine? History will be preserved." |
| Deleting | DELETE in flight | Confirm button shows "...", Cancel disabled |
| Success | API returned 200 | Navigate to WorkTeam page |
| Error | API returned error | Toast with error message (existing toast system) |

### Schedule picker states

| State | Description | Copy |
|---|---|---|
| Preset selected | One of the 6 presets chosen | Select shows label, no custom input |
| Custom selected | "Custom..." preset chosen | Custom cron input appears below select |
| Custom valid | Cron expression parses successfully | Preview label shows humanized schedule |
| Custom invalid | Cron expression does not parse | Preview shows "Invalid cron expression" in error color |

---

## 8. Behavior and interaction

### Keyboard

- **Dialog:** Escape closes (native dialog behavior). Tab cycles through form fields. Enter on Create button submits.
- **Inline edit:** Escape cancels edit. Enter saves (for single-line inputs). Tab from input to Save button.
- **Delete confirmation:** Escape cancels. Enter on Confirm Delete executes.

### Focus management

- Dialog open: focus moves to first field (name input)
- Dialog close: focus returns to trigger button
- Inline edit: focus moves to the input
- Delete confirmation: focus moves to Cancel button (safe default)

### Motion

- Dialog open/close: native `<dialog>` animation (no custom motion)
- Inline edit transition: none (instant swap between display/edit states)
- Delete confirmation: none (instant swap)

### Mobile

- Dialog: fills screen width (existing responsive behavior from min-w-[320px] w-full)
- All inputs use `text-base` (16px) to prevent iOS Safari zoom
- Touch targets: all buttons have `min-h-[44px]` (AQ-015)
- Detail page: single column, no layout changes needed

---

## 9. Open questions for architect

1. **POST /api/routines endpoint:** Does it need to be a new route, or extend the existing `routines-routes.ts`? The existing file has no POST / (create) route -- only GET /, GET /:id, PATCH /:id, POST /:id/retire, POST /:id/trigger.

2. **Agent list source:** Where does the create dialog get the list of agents for the team? Options: (a) `GET /api/teams/:id` already returns roster members, (b) new endpoint `GET /api/agents?teamId=X`.

3. **Schema migration numbering:** AA1 used 0022 and 0023. AA2's migration should be 0024.

4. **Stub task for routine sessions:** The concept doc says routine sessions need a `taskId` for FK satisfaction. How is the stub task created? At routine creation time? At session start time?

5. **Soft delete filter:** After adding `deleted_at`, should `GET /api/routines` and `GET /api/teams/:id` routines filter out soft-deleted routines by default? (Yes, almost certainly -- but the architect should confirm.)

6. **RoutineRunOutcome extension:** AA2 adds `running` and `timeout` outcomes. The existing `RoutineRunOutcome` type in `packages/shared/src/routine.ts` is `"success" | "error" | "skipped"`. Architecture needs to extend this.
