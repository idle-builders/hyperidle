# L15 — Approved Design (input contract for /architecture)

**Story:** Strip drag/drop from the Team Board kanban. Each TaskCard gains an affordance to (a) request a state change, OR (b) open the task's attached thread. Selecting a request posts a `plain` message to the task's thread. Tasks are agent-team-owned: humans request, agents decide.

**Chosen variant:** A — Minimal Menu, with the "agent decides whether to honor" social-contract footer pulled in from B and the unified-gesture insight (state-target + free note in one menu) pulled in from C.

**Rejected:** B (modal + dual buttons), C (chip-as-trigger + inline expansion), separated icons, keyboard verb shortcuts, optimistic state mutation, emoji-as-request. See `synthesis.md` for rationale.

---

## 1. The affordance — what it is and where it sits

A single 16px square trigger lives inside the TaskCard `actions` slot, positioned at top-right of the card via `position: absolute; top: var(--density-card-pad); right: var(--density-card-pad)`. Visual: three 3px circular dots in a horizontal row, color `var(--text-lo)`, hover `var(--text-hi)` over `var(--surface-5)`.

- The trigger is `<button class="btn btn-ghost btn-xs btn-square">` (DaisyUI primitive used directly per `frontend.md`).
- `aria-label="Request a change to this task"`.
- `aria-haspopup="menu"`.
- `aria-expanded` toggles with menu state.
- Click handler MUST `event.stopPropagation()` so the card's `onClick` (route to task detail) doesn't fire.
- Hit area extends to ≥ 44px on viewport ≤ 1024px via `position: relative; inset: -10px` on a wrapping span (visible icon stays 16px — density preserved per AQ-015).

**Drag/drop removal:** `Kanban.tsx` `useDraggable`/`useDroppable`/`DndContext`/`KeyboardSensor`/`PointerSensor` go away entirely. `WorkTeam.tsx`'s `handleMoveTask` callback (lines 116-120) is removed. `KanbanProps.onMoveTask` is removed; `Kanban` becomes read-only. Drag survives ONLY in Canvas between Shaped → Committed columns (untouched by this story).

---

## 2. Menu surface — composition and contents

The trigger opens a DaisyUI `dropdown` menu, positioned below-right of the trigger. `min-width: 220px`. Surface `var(--surface-2)`. Border `1px solid var(--border-default)`. Radius `var(--r2)`. Shadow `var(--float)`. Padding `4px`. Fade-and-pop in over `var(--motion-medium)` with `cubic-bezier(0.2, 0, 0, 1)`. Honors `prefers-reduced-motion`.

Menu contents top → bottom:

1. **Section label `REQUEST`** (uppercase mono, 10px, +0.05em tracking, `var(--text-lo)`, padding `6px 8px 2px`). Hidden if no requestable targets.
2. **One row per valid target verb.** Each row: `<button role="menuitem" class="menu-item">` with two spans: left `var(--ui)` 13px verb, right `var(--mono)` 10px hint `→ {state}`. Padding `6px 8px`. Radius `var(--r1)`. Hover/focus background `var(--primary-dim)`.
   - "Abandon" row gets `color: var(--danger)` to mark it as the destructive option.
3. **Divider** (`1px solid var(--border-subtle)`, `4px 0` margin).
4. **Note input.** A `<input type="text">` (NOT textarea — single-line is the intentional shape; multi-turn uses Open Thread). 16px font (AQ-005). Placeholder `Note for the agent (optional)`. `aria-label="Note for the agent"`. Focus ring 1px `var(--primary)` outline-offset -1px.
5. **Divider.**
6. **`Open thread` row.** Same row geometry as state targets, but right-side hint shows `⏎` (this is the default action — pressing Enter with focus elsewhere in the menu OR clicking this row opens the thread). Opens task's thread in the Rail (existing surface).
7. **Footer line** (mono, 10px, `var(--text-lo)`, padding `4px 8px 2px`): `Agent decides whether to honor the request.` Non-interactive. THIS IS LOAD-BEARING — it is the visible social contract that prevents the menu from reading as a command.

---

## 3. State gating — which target verbs appear

The menu shows only state requests that are meaningful from the current task state. The verb labels are user-facing; the underlying `TaskState` value is the architect's contract.

| Current TaskState | Requestable target verbs (in order) |
|---|---|
| `proposed` | _none_ — menu shows only Note input + Open thread |
| `accepted` | Start (→ `in_progress`), Block (→ `blocked`), Abandon (→ `killed`) |
| `hold` | Resume (→ `in_progress`), Abandon (→ `killed`) |
| `in_progress` | Block (→ `blocked`), Review (→ `review`), Done (→ `done`), Abandon (→ `killed`) |
| `blocked` | Resume (→ `in_progress`), Abandon (→ `killed`) |
| `review` | Done (→ `done`), Block (→ `blocked`), Abandon (→ `killed`) |
| `done` | Abandon (→ `killed`) |
| `killed` | _none_ — menu shows only Note input + Open thread (read-only-feeling but valid) |

Recommendation to architect: expose this as `requestableStatesFor(current: TaskState): readonly TaskState[]` in `packages/shared`. The verb-label-per-target mapping is a UI concern and lives in the design-system layer (e.g. on the menu component).

---

## 4. Behavior — interactions, transitions, focus

| Interaction | Result |
|---|---|
| Click trigger | Menu opens. Focus moves to the FIRST `menuitem` (or to the Note input if no targets). Trigger `aria-expanded="true"`. |
| Click target verb (no note) | POST request. Menu closes. Toast `Sent to @{owner}.` (auto-dismiss 2s). Trigger regains focus. Card chip does NOT change. |
| Type in Note + click target | POST request with note appended. Same close + toast. |
| Type in Note + Enter | POST plain note (no state target). Same close + toast. |
| Click "Open thread" or Enter on it | Dispatch `rail.open-thread` event with task's thread ID. Menu closes. Rail opens. Trigger regains focus. |
| Esc | Close menu. Trigger regains focus. Note text discarded. |
| Click outside | Close menu (note text discarded). Trigger does NOT regain focus (this matches DaisyUI dropdown idiom). |
| Arrow Up/Down inside menu | Native menu roving focus across `menuitem`s. The Note input is in the focus order between the divider rows. |
| Tab inside menu | Same as Arrow Down (menu items + input are linearly tabbable). |
| Click trigger on a different card while menu is open | Closes the current menu, opens the new one. |
| Network error on POST | Inline `alert alert-error alert-sm` strip appears at the TOP of the menu: `Couldn't reach the agent.` with a `Retry` text-button. Menu stays open. |
| In-flight POST | Trigger swaps to a 12px DaisyUI spinner; `aria-busy="true"`. Menu remains open but interaction is locked. |
| Double-click trigger | 2s in-flight throttle — second submit is a no-op until first response lands. |

**No optimistic UI.** The TaskCard's StatusChip never changes from a request click. The chip only changes when the agent (server) commits the actual state transition.

---

## 5. The message that gets posted

POST `POST /api/threads/{taskThreadId}/messages` (existing L1 endpoint). Body:

```ts
{
  type: "plain",
  text: <generated copy>,
  refs: [
    { kind: "task", id: <taskId> },
    // when a state target was selected:
    // (architect: confirm the field name and add to MessageRefs)
    { kind: "request_state_change", taskId: <taskId>, requestedState: <TaskState> }
  ]
}
```

Generated `text`:

| Path | Generated text |
|---|---|
| State target only | `Please move "{taskTitle}" to {targetVerb}.` |
| State target + note | `Please move "{taskTitle}" to {targetVerb} — {note}` |
| Note only (no target) | `Note: {note}` |

The architect: lock the `refs` shape during planning. The structured ref is preferred so agents can detect intent without LLM parsing and so the transcript view can render the request as a chip-shaped pill rather than as prose.

---

## 6. All states (designer copy)

| State | Copy / render |
|---|---|
| Empty (menu open, no targets) | Menu has no `REQUEST` section header; only the Note input + `Open thread` + footer line are rendered. |
| Loading (menu opening) | Trigger `aria-expanded="true"`; menu pop-in over `var(--motion-medium)`. |
| Loading (POST in flight) | Trigger spinner; menu locked; footer line dims to `var(--text-lo)` × 0.5 opacity. |
| Error | Inline `alert-error` strip at menu top: `Couldn't reach the agent.` `Retry` button. |
| Success | Toast (`var(--surface-2)` bg, `var(--ok-dot)` indicator, `var(--text-hi)` text): `Sent to @{owner}.` Auto-dismiss 2s. |
| Disabled (offline) | Trigger remains visible. Menu opens with state-target rows in `menu-disabled` state (`opacity 0.5; cursor: not-allowed`). Open Thread row stays active (Rail can render cached thread). |
| Killed task | Menu opens with no targets and a footer addendum: `This task is killed. Notes go to the archived thread.` |

---

## 7. Component mapping (summary)

| Surface | Component(s) used | New code? |
|---|---|---|
| Card-internal trigger | DaisyUI `btn btn-ghost btn-xs btn-square` | New element inside TaskCard `actions` slot |
| Popover | DaisyUI `dropdown` + `menu` | New composition (lives next to TaskCard or inside Kanban — architect's call) |
| Menu items | DaisyUI `menu` `<li><button>` | Standard pattern |
| Note input | DaisyUI `input` (16px font) | Standard pattern |
| Toast | DaisyUI `toast` + `alert` | Re-uses existing toast slot in AppShell |
| Inline error strip | DaisyUI `alert alert-error alert-sm` | Standard pattern |

**Component budget impact: zero.** No new entries in the 19-component budget.

---

## 8. Mobile adaptation (viewport ≤ 640px)

- Trigger: 16px visible icon, 44px hit area (extended via wrapper `inset: -14px`). AQ-015 honored.
- Menu: renders as a bottom-sheet `modal-bottom` (DaisyUI `modal` in bottom-attached mode), full-width minus 16px margin. Same content order. Each menu item is 44px tall (AQ-015 touch target). Note input 16px font (AQ-005).
- Card layout: single column. Trigger remains top-right.
- Toast: bottom-center, full-width minus 16px (mobile pattern).

Tab grammar from `docs/HUMAN_INTERFACE_LAYER.md` (Conversations / Work / Knowledge) is unchanged. The Team Board lives under Work tab.

---

## 9. Behavior contracts the architect must implement

1. **`Kanban` becomes read-only.** Drop `useDraggable`, `useDroppable`, `DndContext`, sensors. Drop `KanbanProps.onMoveTask`. Drop `resolveKanbanDrop` and its tests. `STATE_TO_COLUMN` stays (column rendering is unchanged).
2. **Re-export `requestableStatesFor(state)` from `@hyperidle/shared`.** Pure, exhaustively-typed against `TaskState`. Designer-side label mapping (`Start`/`Resume`/etc) lives in the design-system layer.
3. **`POST /api/threads/:id/messages`** already accepts `{ type, text, refs }` per L1. Architect confirms whether `refs` schema needs to be extended with a `request_state_change` discriminant; if so, that lands in `packages/shared/src/thread.ts`.
4. **Thread auto-creation.** If the task's `host_kind='task'` thread doesn't exist when the menu posts, server lazily materializes it. (Confirm with architect — could also be eager at task creation in L18 fixtures.)
5. **The "Open thread" handler** dispatches an event consumed by the Rail (`rail.open-thread` with a thread ID payload). The Rail surface is built; this handler hooks into the existing surface.
6. **Drag in Canvas (Shape Up Shaped → Committed)** stays. Out of scope. Story explicitly carves it out.

---

## 10. Acceptance criteria mapping (story → design)

| Story criterion | How this design satisfies it |
|---|---|
| Drag-to-move REMOVED on Team Board kanban | Section 1 — sensors/contexts/handler removed; `Kanban` becomes read-only |
| Affordance to request a state change | Section 2 — top-right trigger + state-target rows in menu |
| Affordance to open the task's attached thread | Section 2 — `Open thread` row in menu (default action; Enter activates it) |
| One affordance covers both (founder direction) | Section 2 — both live in the same menu |
| Selecting a request posts a `plain` message | Section 5 — `type: "plain"` to `POST /api/threads/:id/messages` |
| Agent decides whether to honor | Section 2 footer line + Section 4 "no optimistic UI" rule |
| Drag survives only Shaped → Committed on Canvas | Section 1 + Section 9.6 — Canvas untouched |
| No emojis | Trigger is three CSS dots, not an ellipsis emoji; no emoji anywhere in copy |

---

## 11. Verification — Playwright artifacts

A Playwright test should verify, against the Team Board page (`/work/team`):

1. Drag attempt on a task card is a no-op (`page.dragAndDrop` between columns leaves card in original column).
2. Click trigger on a task card → menu visible → assert `aria-expanded="true"`.
3. Click `Block` row → menu closes → no chip change → toast `Sent to @{owner}.` appears → POST captured to `/api/threads/{id}/messages` with body `{ type: "plain", text: /Please move .* to Block/, refs: [...] }`.
4. Click `Open thread` row → Rail opens with the task's thread.
5. Type note + click `Block` → POST text contains the note appended.
6. Esc closes menu, focus returns to trigger.

The mockup (`minimal-menu/mockup.html`) is the visual reference for `/visual-polish` parity checks during implementation.

---

## 12. Open questions surfaced for `/architecture`

(See also `synthesis.md` § Open questions.)

1. `MessageRefs` discriminant for `request_state_change` — name and shape.
2. Idempotency / in-flight throttle policy.
3. Lazy vs eager thread materialization for tasks.
4. Mobile sheet vs popover decision: design says sheet on ≤ 640px; architect needs to decide whether DaisyUI `modal-bottom` re-render path is acceptable from a focus-trap perspective.
5. The exact event/contract for "Open thread" → Rail (event name, payload shape, the Rail subscription).

---

This document is the **input contract** to `/architecture`. The architect should NOT re-decide visual hierarchy, component vocabulary, copy, gating rules, or the no-optimistic-UI rule.
