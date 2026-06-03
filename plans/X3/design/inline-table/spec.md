# Variant: Inline Table

## User story

A founder configures their AI agent team through an "Agents" section in Settings, editing agent properties inline without leaving the page.

## Component composition

All DaisyUI primitives — no new custom components.

- **Section container**: `<section>` with `flex flex-col gap-3` (same as Profile, OrgChart, Appearance, Backend sections)
- **Section heading**: `<h2>` with `text-[15px] font-semibold text-[var(--text-primary)]` (same as all other sections)
- **Agent table**: `table table-xs w-full` (same as OrgChart edge table)
- **Table columns**: Name | Role | Harness | Model Tier | Max Sessions | Actions
- **Row actions**: "Edit" `btn btn-ghost btn-xs` to expand, "Delete" `btn btn-ghost btn-xs text-error`
- **Inline edit form**: Expands as a `<tr>` below the selected agent row, with a bordered container (`border border-[var(--border-subtle)] rounded-[var(--r-subtle)]`), same pattern as OrgChart's inline add form
- **Edit form fields**: name input, role select, harness type select, model tier select, max concurrent sessions number input, soul prompt textarea (8 rows)
- **Form actions**: "Cancel" `btn btn-ghost btn-sm` + "Save" `btn btn-primary btn-sm` with dirty tracking
- **Add agent button**: `btn btn-ghost btn-sm self-start` with "+ Add Agent" text (same pattern as OrgChart's "+ Add Edge")
- **Add form**: Same inline expansion as edit form, with role select that triggers soul prompt template pre-fill

## Information hierarchy

1. **Agent name** — primary text, `text-sm` weight normal, left column
2. **Role** — `badge badge-sm badge-ghost font-mono` (same treatment as OrgChart mechanism column)
3. **Harness type** — `text-sm font-mono text-[var(--text-secondary)]`
4. **Model tier** — `text-sm text-[var(--text-secondary)]`
5. **Max sessions** — `text-sm font-mono text-[var(--text-secondary)]` right-aligned
6. **Actions** — rightmost column, ghost buttons

## States

### Empty (no agents)
```
No agents configured.
```
`text-sm text-[var(--text-tertiary)]` — same treatment as OrgChart's "No edges defined."

### Loading
Two `div.skeleton h-8 w-full` rows — same as Profile/OrgChart loading states.

### Error
```
Failed to load agents. Please try again.
```
`text-sm text-error` — same as OrgChart error state.

### Populated (primary)
Table with all AI agents. Each row shows: name, role badge, harness type (or "Any" if null), model tier (or "Default" if null), max sessions count, Edit/Delete buttons.

### Edit mode
Clicking "Edit" on a row inserts an edit form `<tr>` directly below. The form shows all editable fields. The soul prompt textarea dominates the form — it's the largest field at 8 rows minimum. Dirty tracking: Save button disabled until a field changes.

### Add mode
Clicking "+ Add Agent" inserts a creation form at the bottom (same container style as edit). Role select triggers soul prompt template pre-fill via a fetch to the API. Pre-filling the textarea happens client-side after the template is fetched.

### Save in-flight
Save button shows `loading loading-spinner loading-xs` and is disabled. Same pattern as Profile save.

### Delete confirmation
No modal. Clicking "Delete" shows an inline confirmation: the row's delete button text changes to "Confirm delete?" with a second click required. This avoids a modal for a low-frequency destructive action. (OrgChart uses immediate delete — agents are more valuable, so we add one-click confirmation.)

## Behavior

### Keyboard
- Tab through table rows, Edit/Delete buttons
- Enter on Edit button opens inline form; Enter on Save submits
- Escape closes edit/add form without saving
- Tab order within edit form: name, role, harness, model tier, max sessions, soul prompt, Cancel, Save

### Focus management
- Opening edit form focuses the name input
- Opening add form focuses the name input
- Closing form returns focus to the Edit button (edit) or Add button (add)

### Transitions
- Form expansion: no animation (matches OrgChart pattern — the form appears/disappears instantly as a conditional render)
- Save feedback: toast via `showToast` (same as Profile)

### Role change triggers template pre-fill
When the role `<select>` changes in the add form:
1. Fetch the soul prompt template for the selected role from `GET /api/soul-prompt-templates/:role`
2. If the soul prompt textarea is empty OR unchanged from a previous template pre-fill, replace it with the new template
3. If the user has manually edited the soul prompt, do NOT overwrite — show a small info text: "Template available. Paste?" with a button

### Soul prompt textarea
- `textarea textarea-bordered w-full` with `rows={8}` minimum
- Monospace font (`font-mono text-sm`) — soul prompts are markdown with template variables
- Placeholder: "Enter the agent's system prompt (markdown). Use {{product}} and {{community}} for template variables."

## Mobile adaptation
At viewport <= 768px, the table becomes too wide. Two options:
1. Horizontal scroll on the table (acceptable for a low-frequency admin page)
2. Switch to a stacked card layout

My read: horizontal scroll. This is an admin page accessed infrequently. The mobile experience is acceptable with scroll, and it avoids a second layout to maintain.

## Signature
The soul prompt textarea with monospace font and template variable hints, visible inline in the settings page without a modal or separate editor. Configuration feels direct, not hidden behind navigation.

## Trade-offs
- **Large form surface**: The soul prompt textarea makes the edit form tall. With 8+ agents, scrolling may be needed to reach agents below an open edit form.
- **No split view**: Unlike a dedicated agent management page with a list/detail split, everything is inline. This keeps the Settings contract (one scrollable page) but trades visual separation for simplicity.
- **No search/filter**: With 8-15 agents, linear scanning is fine. At 50+ agents this pattern would break.
