# X3 Approved Design — Agent Configuration in Settings

## Chosen variant: Inline Table

Reuses the OrgChart table pattern (table rows + inline expand for editing) and Profile save pattern (dirty-tracking + toast). See `inline-table/screenshot.png` for the visual reference.

---

## Component mapping

All DaisyUI primitives. Zero new custom components. Zero component-budget impact.

| Element | DaisyUI / HTML | Props/Classes |
|---|---|---|
| Section container | `<section>` | `flex flex-col gap-3` |
| Section heading | `<h2>` | `text-[15px] font-semibold text-[var(--text-primary)]` |
| Agent table | `<table>` | `table table-xs w-full` |
| Table header cells | `<th>` | `text-[var(--text-tertiary)]` (auto-styled by DaisyUI table-xs) |
| Role badge in table | `<span>` | `badge badge-sm badge-ghost font-mono` |
| Harness/tier text | `<td>` | `text-sm font-mono text-[var(--text-secondary)]` |
| Sessions count | `<td>` | `text-sm font-mono text-[var(--text-secondary)]` centered |
| Edit button | `<button>` | `btn btn-ghost btn-xs` |
| Delete button | `<button>` | `btn btn-ghost btn-xs text-error` |
| Edit form container | `<div>` inside `<td colspan="6">` | `flex flex-col gap-[12px] p-3 border border-[var(--border-subtle)] rounded-[var(--r-subtle)]` |
| Form field | `<div>` | `form-control flex-1 min-w-[120px]` |
| Form label | `<label>` > `<span>` | `label` > `label-text text-[var(--text-secondary)]` |
| Name input | `<input>` | `input input-sm input-bordered w-full text-[var(--text-primary)]` |
| Role select | `<select>` | `select select-sm select-bordered` |
| Harness type select | `<select>` | `select select-sm select-bordered` |
| Model tier select | `<select>` | `select select-sm select-bordered` |
| Max sessions input | `<input type="number">` | `input input-xs input-bordered w-16` |
| Soul prompt textarea | `<textarea>` | `textarea textarea-sm textarea-bordered w-full font-mono` rows={8} |
| Cancel button | `<button>` | `btn btn-ghost btn-sm` |
| Save button | `<button>` | `btn btn-primary btn-sm` |
| Save spinner | `<span>` | `loading loading-spinner loading-xs` (inside Save button) |
| Add agent button | `<button>` | `btn btn-ghost btn-sm self-start` text="+ Add Agent" |

---

## Table columns

| Column | Content | Width hint |
|---|---|---|
| Name | Agent name, plain text | flex-grow |
| Role | `badge badge-sm badge-ghost font-mono` with role string | auto |
| Harness | Monospace text. "Any" when null. | auto |
| Model Tier | Text. "Default" when null. | auto |
| Sessions | Centered number | 60px |
| Actions | Edit + Delete buttons | auto |

---

## All states with copy

### Loading
```
<div class="skeleton h-8 w-full" />
<div class="skeleton h-8 w-full" />
```

### Error
```
Failed to load agents. Please try again.
```
Class: `text-sm text-error`

### Empty
```
No agents configured.
```
Class: `text-sm text-[var(--text-tertiary)]`

### Populated (primary state)
Table with all AI agents (`kind = "ai"`). Human users are not shown. Each row displays the agent's current configuration.

### Edit mode
Clicking "Edit" on a row:
1. The clicked row gets a subtle highlight: `bg-[rgba(44,36,26,0.02)]`
2. The Edit button text changes to "Editing" with `font-semibold text-[var(--accent-primary)]`
3. A new `<tr>` appears below with a single `<td colspan="6">` containing the edit form
4. Focus moves to the Name input

Closing the edit form (Cancel or Save):
1. Form row removed
2. Row highlight removed
3. Focus returns to the Edit button on the row

### Add mode
Clicking "+ Add Agent":
1. An add form appears below the table (same container style as edit form)
2. Focus moves to the Name input
3. Role select defaults to "builder"
4. On role change, if soul prompt is empty or unchanged from a previous template, fetch and pre-fill the template

### Save in-flight
Save button: `btn btn-primary btn-sm disabled` with `loading loading-spinner loading-xs` prepended to the text.

### Delete confirmation
1. First click: Delete button text changes to "Confirm?" and stays red
2. Second click: Sends DELETE request, removes row on success, shows toast "Agent deleted"
3. If no second click within 3 seconds, reverts to "Delete"

---

## Behavior

### Keyboard
- Tab navigates through table rows and action buttons
- Enter on Edit opens the edit form
- Enter on Save submits
- Escape closes edit/add form without saving (if form is focused)
- Standard form-field keyboard behavior within the edit form

### Focus management
- Edit form open: focus Name input
- Add form open: focus Name input
- Form close: focus returns to triggering button (Edit or Add)

### Transitions
- No animation on form expansion/collapse (instant, matches OrgChart)
- Save feedback: toast via `showToast`

### Template pre-fill behavior
When role changes in the add form:
1. Fetch `GET /api/soul-prompt-templates/:role`
2. If textarea is empty OR equals a previously-fetched template: replace with new template
3. If user has manually edited: do NOT overwrite. Show below the textarea: `text-xs text-[var(--text-tertiary)]` with "Role template available" and a "Use template" `btn btn-ghost btn-xs` that replaces the textarea content

### Soul prompt textarea
- Font: `font-mono text-sm` (13px monospace)
- Minimum rows: 8
- Resizable vertically
- Placeholder: `Enter the agent's system prompt (markdown). Use {{product}} and {{community}} for template variables.`

---

## Mobile adaptation (viewport <= 768px)
The table gets horizontal scroll via `overflow-x-auto` on a wrapper div. No layout change. This is acceptable for a low-frequency admin page.

---

## Rejected list (do NOT re-litigate in /architecture or /write-code)

1. Modal editor
2. Two-column list/detail split
3. Accordion per agent
4. Dedicated page / new route
5. Click-to-edit table cells
6. Rich markdown editor for soul prompt
7. Drag-to-reorder agents
8. Search/filter for agents
9. Inline validation on soul prompt (token counting in the browser)
10. Agent creation wizard (out of scope per spec)

---

## Open questions for architect

1. **Template storage**: Where do role-keyed soul prompt templates live at runtime? Options: `factorySettings` rows, a new table, or in-memory constants.
2. **Template fetch endpoint**: Dedicated endpoint `GET /api/soul-prompt-templates/:role` vs embedded in settings response.
3. **Agent CRUD API shape**: Extend existing `PATCH /api/users/:id` or add new agent-specific endpoints?
4. **Soul prompt size limit**: Suggested 50,000 character cap at API boundary.
5. **Delete semantics**: Hard delete or soft delete (status = "retired")? My read: soft delete — agents may have sessions, tasks, and messages referencing them.
