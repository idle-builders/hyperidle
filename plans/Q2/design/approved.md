# Q2 Approved Design: Human-authored knowledge at any scope

**Variant:** A (Dialog Form) with B's compact scope row

---

## 1. Creation trigger: KnowledgeList header

Add a `btn btn-xs btn-ghost` labeled "+ New" in the header row of KnowledgeList, between the title and the scope indicator badge.

```
┌─────────────────────────────────────────────────────┐
│ KNOWLEDGE BASE        [+ New]            practice    │
│ [Triage] [Curated]                                   │
│ [relevance] [recency] [frequency]                    │
│ ...items...                                          │
```

Clicking "+ New" opens the KnowledgeCreateDialog with `scopeKind: "factory"` pre-filled.

---

## 2. Creation trigger: WorkBet

Add a `btn btn-xs btn-ghost` labeled "Add knowledge" on the bet detail page. Placement: in the bet actions area, after the existing action buttons (Pause/Resume/Kill/Adjust/Unblock) and before the cost section. It is a peer of the existing bet actions, not nested inside them.

```
[Pause] [Adjust appetite] [Unblock] [Kill bet]   [Add knowledge]
```

Clicking opens KnowledgeCreateDialog with `scopeKind: "bet"`, `scopeId: bet.id` pre-filled. Scope fields are read-only (shown as Tags, not selects).

---

## 3. Creation trigger: TaskSheet

Add a `btn btn-xs btn-ghost` labeled "Add knowledge" inside the TaskSheet scrollable body, between the ArtifactSection and the Discussion (HostThreadSection). It sits on its own line.

```
┌─ Task ──────────────────────────── ✕ ┐
│ Task title                            │
│ owner · bet-tag · cost                │
│                                       │
│ [artifact section]                    │
│                                       │
│ [Add knowledge]                       │
│                                       │
│ Discussion                 Open thread│
│ [HostThreadSection]                   │
│                                       │
│ REQUEST                               │
│ ...                                   │
```

Clicking opens KnowledgeCreateDialog with `scopeKind: "task"`, `scopeId: task.id` pre-filled. Scope fields are read-only.

---

## 4. KnowledgeCreateDialog

A native `<dialog>` following the ConsequencePreviewDialog pattern.

### Layout

```
┌─ New knowledge item ─────────────────────────────────┐
│                                                        │
│  Title    [                                      ]     │
│                                                        │
│  Body     [                                      ]     │
│           [           markdown textarea           ]     │
│           [                                      ]     │
│           [                                      ]     │
│                                                        │
│  Scope    [factory ▾]  [scope_id ▾]                    │
│                                                        │
│                              [Cancel]  [Create]        │
└────────────────────────────────────────────────────────┘
```

### Props

```typescript
interface KnowledgeCreateDialogProps {
  open: boolean;
  /** Pre-filled scope. When contextual, both fields are set and read-only. */
  defaultScopeKind: ScopeKind;
  defaultScopeId: string | null;
  /** When true, scope fields are read-only (contextual creation). */
  scopeLocked: boolean;
  onConfirm: (data: { title: string; body: string; scopeKind: ScopeKind; scopeId: string | null }) => Promise<void>;
  onCancel: () => void;
}
```

### Fields

1. **Title** (`<input type="text" class="input input-bordered w-full">`): Required. Placeholder: "What did you learn?" Auto-focused on dialog open. Max 200 characters.
2. **Body** (`<textarea class="textarea textarea-bordered w-full min-h-[160px] text-base">`): Required. Placeholder: "Describe it in markdown..." Format is always markdown (no format picker -- the concept doc says format is 'markdown' or 'toon' but human-authored items are always markdown).
3. **Scope kind** (`<select class="select select-bordered select-sm">`): The 7 scope kinds. When `scopeLocked: true`, render as a `Tag` instead of a select (read-only).
4. **Scope ID** (`<select class="select select-bordered select-sm">` or hidden): Progressive disclosure:
   - `factory`: scope_id is null. No scope_id field rendered.
   - `product`: dropdown of products (fetched from `/api/products`).
   - `practice`: text input for practice ID (free-form string).
   - `team`: dropdown of teams (fetched from `/api/teams`).
   - `bet`: dropdown of bets (or read-only Tag when locked).
   - `task`: dropdown of tasks (or read-only Tag when locked).
   - `user`: auto-filled with current user ID. Hidden from user (or shown as read-only "You").
   When `scopeLocked: true`, render as a `Tag` showing the entity name.

### Dialog behavior

- **Width:** `min-w-[400px] max-w-[560px]`
- **Non-dismissible:** Escape and backdrop click blocked (same as ConsequencePreviewDialog). Cancel button is the only dismiss path.
- **Focus on open:** Title input receives focus.
- **Focus on close:** Returns to the trigger button.
- **Cmd/Ctrl+Enter:** Submits from any field.
- **Create disabled until:** title is non-empty AND body is non-empty AND (scope_kind is factory OR scope_id is non-empty).

### States

| State | Title | Body | Scope | Cancel | Create |
|---|---|---|---|---|---|
| Empty | focused, empty | empty | pre-filled | enabled | disabled |
| Filling | has text | has text | selected | enabled | enabled |
| Submitting | disabled | disabled | disabled | disabled | spinner |
| Error | enabled | enabled | enabled | enabled | enabled, error message below |
| Success | -- dialog closes -- | | | | |

### Error display

Inline error message below the form, before the button row: `<p role="alert" class="text-xs text-error">Could not create item. Try again.</p>`

---

## 5. ScopeChangeDialog (KnowledgeDetail)

A small dialog on the KnowledgeDetail metadata bar for changing an item's scope.

### Trigger

Add a `btn btn-xs btn-ghost` labeled "Change scope" to the metadata bar in KnowledgeDetail, after the existing Tag/StatusChip elements.

```
[decision]  [active]  [L0]  confidence 92%  by Architect Agent  1d ago  [Change scope]
```

### Layout

```
┌─ Change scope ───────────────────────────┐
│                                            │
│  Current: [factory] (read-only Tag)        │
│                                            │
│  New scope   [product       ▾]             │
│  Scope ID    [product-abc   ▾]             │
│                                            │
│  Reason      [                        ]    │
│              (required)                    │
│                                            │
│                    [Cancel]  [Save]         │
└────────────────────────────────────────────┘
```

### Props

```typescript
interface ScopeChangeDialogProps {
  open: boolean;
  currentScopeKind: ScopeKind;
  currentScopeId: string | null;
  onConfirm: (data: { scopeKind: ScopeKind; scopeId: string | null; reason: string }) => Promise<void>;
  onCancel: () => void;
}
```

### Fields

1. **Current scope** (read-only Tag): Shows current scope_kind. If scope_id is set, shows the entity name.
2. **New scope kind** (`<select>`): Same 7-option select as creation dialog.
3. **New scope ID** (`<select>` or `<input>`): Same progressive disclosure as creation dialog.
4. **Reason** (`<textarea class="textarea textarea-bordered text-base resize-none h-16">`): Required. Placeholder: "Why are you changing the scope?"

### Behavior

- Non-dismissible (same pattern).
- Save disabled until: new scope differs from current AND reason is non-empty.
- On save: PATCH endpoint updates scope_kind + scope_id, logs edit in knowledgeEditLog, bumps version.
- Success: dialog closes, detail page refetches.

---

## 6. User-scoped item visibility

### KnowledgeList rendering

Items with `scope_kind: "user"` render with a `Tag label="Private"` badge after the title in each KnowledgeRow.

```
[brief]  [captured]  "My notes on auth approach"  [Private]  2h ago
```

### Server-side filtering

The GET /api/knowledge endpoint filters user-scoped items: only items where `scope_kind: "user"` AND `updated_by` matches the current user ID are returned. Non-user-scoped items are returned to all users. This is implemented as a WHERE clause, not client-side filtering.

### Scope change from user to another scope

When a user changes scope from "user" to any other scope_kind, the item becomes visible to all users. The ScopeChangeDialog's reason field captures why the promotion happened. The "Private" Tag disappears from the list rendering.

---

## 7. Rejected directions (do not re-litigate)

1. **Inline-expand creation form.** New interaction grammar, three layout variations, manual focus management. Not worth the complexity.
2. **Full-page creation route.** Overkill for 3 fields.
3. **Toast on creation.** No toast infrastructure exists.
4. **Live markdown preview in dialog.** Capture, not editing. Preview available on detail page.
5. **Title-only quick create.** Prevents orphan items.
6. **Scope as a Submenu filter.** The Submenu already has filter chips for scope (practice/product/factory). Q2 extends the scope enum but does not change the Submenu filter mechanism -- that is a separate concern.
7. **Floating action button (FAB).** Not in the design system vocabulary. HyperIdle uses text buttons.

---

## 8. Open questions for architecture

1. **Products/teams/bets/tasks dropdown data:** The scope_id selector needs entity lists. Which endpoints provide these? Are there existing list endpoints that return `{id, name}` pairs?
2. **Auth context for user-scoped filtering:** The knowledge routes currently have no auth context (accessor defaults to "human/browser"). Q2 needs at minimum a user ID to filter user-scoped items. How is the current user ID passed to the API?
3. **Event emission:** Should scope change emit a `knowledge_updated` event with action "scope_changed"? (Probable yes, for fabric to reassign layer.)
4. **Scope_id on strategy fabric:** The `knowledgeStrategyFabric` table already has `scopeId`. When scope_kind + scope_id are added to the kernel table, does `scopeId` on the strategy table become redundant? Should it be kept for backward compat or dropped?

---

## 9. Component mapping summary

| Surface | Component | Type | New? |
|---|---|---|---|
| KnowledgeList header | `btn btn-xs btn-ghost` | DaisyUI primitive | Wiring only |
| WorkBet action area | `btn btn-xs btn-ghost` | DaisyUI primitive | Wiring only |
| TaskSheet body | `btn btn-xs btn-ghost` | DaisyUI primitive | Wiring only |
| Creation dialog | `KnowledgeCreateDialog` | Page-level (`pages/knowledge/`) | New (co-located) |
| Scope change dialog | `ScopeChangeDialog` | Page-level (`pages/knowledge/`) | New (co-located) |
| Private badge | `Tag label="Private"` | Design-system Tier 1 | Existing |
| Scope display (locked) | `Tag label={scopeKind}` | Design-system Tier 1 | Existing |
| Form elements | input, textarea, select, btn | DaisyUI primitives | Existing |

**Component budget impact: 0 new design-system components.** Both dialogs are page-level co-located components (like ConsequencePreviewDialog, AppetiteDialog, BetActionsBar in WorkBet.tsx). They use DaisyUI primitives and existing design-system components (Tag, StatusChip).
