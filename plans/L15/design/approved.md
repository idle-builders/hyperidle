# L15 — Approved Design

> Input contract for `/architecture` and downstream `/write-code`. The architect does NOT re-decide visual hierarchy, component vocabulary, or interaction grammar. Implementation reads this verbatim.

## 1. The shape

Tasks are agent-team-owned. Drag is gone. Each TaskCard carries:

1. **A kebab icon button** (top-right of the card head) — opens a dropdown menu with: `Open thread` (always first), state-change requests in state-aware order, and `Kill task` (danger) under a divider.
2. **A thread dot** (6 px disc beside the card title) — neutral grey when the task has a thread with all-read messages; primary-tint when unread; absent when no thread exists yet.
3. **Conditional body-click on unread.** When (and only when) `unread > 0`, the card's title row becomes a click target opening the task's thread directly. All other times the card body is non-interactive. This avoids the borders-as-hierarchy problem of an always-on bottom strip while still giving the high-frequency "read unread" path a one-click route.

Drag is a complete no-op on TaskCards. Cursor stays `default` over the card body when there's nothing to read; cursor becomes `pointer` only over the title row when unread > 0, and over the kebab.

## 2. Component composition

| Slot | Component | Notes |
|---|---|---|
| Card chrome | `TaskCard` (extended) | Adds two new optional props (see §6). The existing `actions` slot now houses the kebab button. |
| Kebab + dropdown | DaisyUI `dropdown` + `menu` (`btn btn-ghost btn-xs`) | No new component — uses DaisyUI primitives directly. |
| Status indicators | `StatusChip`, `Tag`, `KeyValue` | Unchanged. |
| Thread dot | Inline `<span>` (6 px disc) inside TaskCard's title row | Not a new component — primitive shape, density-static, follows the same "badge-as-callout" rule as StatusChip. |
| Empty column | `EmptyState` | Unchanged primitive; only the description copy swaps (see §7). |
| Toast | DaisyUI `toast` + `alert alert-info alert-sm` | Used for "Request posted to thread". |

**Component budget unchanged.** Still 19 custom components. No new primitive added.

## 3. Information hierarchy (per card)

1. Title (`var(--density-text)`, weight 500) + thread dot (when applicable)
2. Kebab (top-right; recedes — `var(--text-mid)` until hover/focus)
3. Tag (bet) + StatusChip (lifecycle) — same row
4. Owner (12 px, `var(--text-hi)`)
5. Cost (`KeyValue`)

The kebab is the only interactive element in steady state. Title row becomes interactive only when unread > 0.

## 4. Action set

### 4.1 What the kebab menu offers

The menu is the union of "Open thread" + a state-aware ordered list of state-change requests + danger items.

```
[ Open thread ]                 [<n> UNREAD]   ← row 1 (always, primary-tint when unread)
─────────────────────────────────────────────
REQUEST STATE CHANGE
[ <verb 1, primary for current state> ]    [target state]
[ <verb 2> ]                                [target state]
[ <verb 3> ]                                [target state]
[ <verb n> ]                                [target state]
─────────────────────────────────────────────
[ Kill task ]                   [KILLED]    ← danger tint
```

State-aware ordering (the verb at the top is the most likely action for the card's current TaskState):

| TaskState | Verb 1 | Verb 2 | Verb 3 | Verb 4 | Verb 5 |
|---|---|---|---|---|---|
| `proposed` / `accepted` (Planned) | Pause | Mark blocked | Resume (disabled — already moving once accepted) | Push to review | Mark done |
| `in_progress` | Pause | Mark blocked | Push to review | Mark done | (Resume disabled) |
| `review` | Mark done | Pause | Mark blocked | (Push to review disabled) | Resume |
| `blocked` | Resume | Push to review | Mark done | Pause (disabled) | Mark blocked (disabled) |
| `done` | Reopen | (others disabled) | | | |

Disabled verbs render greyed (`var(--text-lo)`, `aria-disabled="true"`, `cursor: not-allowed`) and carry a right-side hint "Already <state>" or "Not applicable". The full set is always visible — no hidden items — so a founder always knows where each verb lives.

### 4.2 Wire copy — exact request-message text

When the founder picks a request verb, the UI posts a `plain` message into the task's thread (`host_kind=task`, `host_id=task.id`) with this text (verbatim, no trailing punctuation variations):

| Verb | Message text |
|---|---|
| Pause | `Requesting: pause this task.` |
| Mark blocked | `Requesting: mark this task as blocked.` |
| Resume | `Requesting: resume this task.` |
| Push to review | `Requesting: push this task to review.` |
| Mark done | `Requesting: mark this task as done.` |
| Reopen | `Requesting: reopen this task.` |
| Kill task | `Requesting: kill this task.` |

Author of the message: the current user (founder). Sender id resolves through the existing thread message API. The toast that fires after successful post reads:

```
Request posted to thread
```

Mono 11 px, `var(--text-lo)`, dismisses after `--motion-slow` × 16 (4 s).

### 4.3 Open thread

`Open thread` row in the menu navigates to the task's thread. Implementation routes through whatever the L18 thread-detail surface is (the Submenu thread-tab is the expected target — but L15 does NOT lock that down; L18 owns the detail surface).

The same navigation fires on title-row click when `unread > 0`.

## 5. States

| State | Card render | Menu render |
|---|---|---|
| Empty column | `EmptyState` with description `"Tasks land here when the team commits to them."` (description swap from `"Drag tasks here…"`) | n/a |
| Loading | Existing `Skeleton` row pattern; kebab placeholder absent (AQ-113 — no placeholder icons). | n/a |
| Populated, no thread | Title row, no thread dot, kebab visible. | `Open thread` row present; on activation, creates the thread server-side then navigates. |
| Populated, thread, all read | Title row + grey thread dot, kebab visible. | `Open thread` row, no count. |
| Populated, unread | Title row interactive (cursor: pointer); primary-tint thread dot; kebab visible. Hover on title row tints the title text from `--text-hi` to `--primary` over `--motion-fast`. | `Open thread` row gets primary-tint background; right column shows `<n> UNREAD`. |
| Request in flight (between human pick and server ack) | Selected menu item shows `loading-xs` spinner inline; menu stays open; kebab disabled. | The chosen item displays the spinner. |
| Request succeeded | Menu closes; toast fires `Request posted to thread`; thread message count +1; card StatusChip does NOT change. |  |
| Agent honoured the request (server emits TaskStateChangedEvent) | StatusChip updates via the existing event subscription (out of L15 scope — L15 must not optimistically move the card). |  |
| Agent rejected the request | No card-level visual; the agent's reply lands in the thread. The thread dot becomes primary-tint (unread). |  |
| Drag attempt | Card does not move; no drop zone visual; cursor unchanged. Dragging the title text triggers the browser's text-selection (default behaviour) — explicitly intended, drag-as-text-selection is harmless and proves the card is not an interactive drag handle. | n/a |

## 6. TaskCard prop additions

The implementation contract (architecture will refine):

```ts
interface TaskCardProps {
  // existing
  title: string;
  owner: string;
  state: TaskState;
  cost?: string;
  betTag?: string;
  actions?: ReactNode;       // existing slot — used for the kebab
  onClick?: () => void;       // existing — kept

  // L15 additions
  threadUnreadCount?: number; // 0 or undefined → no unread; > 0 → primary-tint dot + body-click
  threadExists?: boolean;     // true → grey dot when threadUnreadCount === 0 ; false → no dot
  onOpenThread?: () => void;  // fired on Open thread menu item AND on title-row click when unread > 0
  onRequestStateChange?: (verb: TaskRequestVerb) => void; // fired on every request menu item
}

type TaskRequestVerb =
  | "pause" | "mark_blocked" | "resume" | "push_to_review"
  | "mark_done" | "reopen" | "kill";
```

The existing `onClick` prop stays as-is (covers the deprecated whole-card click that test fixtures may still reference) but in production it is wired to a no-op when `threadUnreadCount === 0` — the body-click is opt-in via `onOpenThread` + the unread guard.

## 7. Behaviour

### Drag removal — file-level changes (architecture will sequence)

`packages/web/src/shell/Kanban.tsx` deletes:
- `useDraggable`, `useDroppable`, `KeyboardSensor`, `PointerSensor`, `useSensors`, `closestCenter`, `DndContext`, `DragOverlay` imports from `@dnd-kit/core`.
- `DraggableTaskCard` and `KanbanDropZone` wrapper components.
- `resolveKanbanDrop` helper.
- `COLUMN_TO_STATE` map (forward map `STATE_TO_COLUMN` is kept — it still computes which column a task lives in).
- `onMoveTask` from `KanbanProps`.

`packages/web/src/pages/WorkTeam.tsx` deletes:
- `handleMoveTask` (lines 116–120).
- The `COLUMN_TO_STATE` import.
- `onMoveTask` prop on the Kanban call.

`packages/web/src/shell/Canvas.tsx` is **unchanged** — drag survives only there (Shaped → Committed).

### Keyboard / a11y

- `Tab` order on a card with kebab only: `kebab`. (One stop per card, no body stop.)
- `Tab` order on a card with kebab + unread title row: `title row` (anchor-style focus ring), `kebab`. Two stops.
- `Enter` / `Space` on title row (when unread): opens thread.
- `Enter` / `Space` on kebab: toggles menu.
- `Arrow Down/Up` inside menu: moves focus between items (DaisyUI menu default).
- `Enter` on a menu item: activates it; if non-disabled state-change verb, posts the message; menu closes.
- `Esc` inside menu: closes; focus returns to kebab.
- All interactive elements have a 2 px `--primary` focus ring at 2 px offset (DaisyUI focus-visible token).
- Menu items use `role="menuitem"`; the menu uses `role="menu"`. The kebab uses `aria-haspopup="menu"` and `aria-expanded`.

### Motion

- Menu open/close: `opacity` 0 → 1 / 1 → 0 over `--motion-fast` (80 ms). No transforms, no slides.
- Thread dot unread → read: `background-color` transition over `--motion-medium` (150 ms).
- Title-row hover tint (when unread): `color` transition over `--motion-fast`.
- All durations honour `prefers-reduced-motion: reduce` (handled by tokens.css; no per-component override).

## 8. Density behaviour

- TaskCard's existing density tokens (`--density-card-pad`, `--density-card-gap`) are unchanged. The kebab is **density-static** — 28 px square at all desktop densities. This matches the K11 audit treatment of "list-row icon-only buttons stay literal" (see `packages/design-system/research/density-audit.md` §3.1.4 — same rule that applies to NavItem icons).
- Menu items: 14 px text / 8 px vertical pad (32 px row) at default; 16 px text / 12 px vertical pad (40 px row) at comfortable.
- Thread dot: 6 px at every density (badge-as-callout, density-static).

## 9. Mobile / touch

- At viewport ≤ 1024 px the kebab grows to 44 × 44 px (AQ-015 floor). The menu opens as a centred bottom sheet using DaisyUI's `modal modal-bottom` rather than the desktop popover, so menu rows expand to ≥ 44 px row height with full-width touch targets.
- The conditional title-row click target is naturally ≥ 44 px tall at compact density once the title's line-box is computed (the title is `var(--density-text)` = 14 px at compact × 1.5 line-height = 21 px, padded by the surrounding card pad — minimum 44 px requires a touch-padding pseudo-element OR a guarantee that the title row's hit area extends through the card-pad. The implementation must add `touch-action: manipulation` and an `::before` 44 px hit-target overlay only when unread > 0 to satisfy AQ-015 without shifting the card visually.
- The mobile three-tab layout: Kanban under the **Work** tab. Bottom sheet covers the screen until dismissed via swipe-down or tap-outside or ESC.

## 10. Drag-no-op visual cue

**Deliberate absence.** The card looks like a static card. There is:

- No grab cursor (cursor stays `default` over body, becomes `pointer` only over title-row-when-unread and over the kebab).
- No `draggable` attribute on the DOM. (Browsers will not initiate HTML5 drag.)
- No drop zone hover styles (the `bg-accent/10` overlay for `isOver` is removed alongside the DnD removal).
- No "drag here" empty-state copy.

Rationale: a faded "drag is disabled" cue would be the wrong message — drag is *not part of the grammar at all*. The card is simply a viewer/dispatcher for the kebab + (conditional) thread link. A founder who drags reflexively gets text-selection on the title (browser default) and the card doesn't move. The next thing they'll do is read the kebab menu and learn the new grammar.

## 11. Open questions for /architecture

1. **Where does the thread route live?** L18 owns the thread-detail surface; L15 only triggers navigation to it. The architecture should specify whether `onOpenThread` resolves to a route push (`navigate(/threads/<id>)`) or a Submenu state change. Either is fine for L15 as long as the call site is one function call.
2. **Server endpoint for "post a request message".** The thread primitive (L1) already has `POST /api/threads/:thread_id/messages` for `plain` messages. The architecture should confirm L15 reuses this — no new endpoint should be necessary.
3. **Bootstrap of the task's thread on first request.** A task may not have a thread yet. When `onRequestStateChange` fires on a task with no thread, the server must lazily create the thread (`host_kind=task`, `host_id=task.id`) and then post the message. This is a server contract, not a UI decision. The architecture must specify whether the client calls `POST /api/threads` first or whether the message-post endpoint creates-on-write.
4. **Idempotency.** The `client_key` on a thread message is the L1 idempotency key. The implementation must generate one per request click so a double-click doesn't post two messages.
5. **Disabled-verb policy.** The matrix in §4.1 is the design-side rule. The architecture should encode it in a single helper (e.g. `getRequestableVerbs(state: TaskState)`) so server and tests share one truth.
6. **Optimistic UI policy.** The card's StatusChip MUST NOT move when the founder picks a verb. Confirm the architecture forbids any optimistic update for state changes — only the server-emitted `TaskStateChangedEvent` moves the chip.

## 12. Rejected list (non-negotiable)

These are not options for `/architecture` or `/write-code` to revisit:

1. Card-body-as-link for every card (Variant B's grammar).
2. Always-visible verb row (Variant C's grammar).
3. Drag with confirmation modal.
4. `cursor: not-allowed` on the card body.
5. Optimistic state change on click.
6. Two-step confirmation on `Kill task`.
7. Bulk select / multi-card actions.
8. Drag survives any kanban column.
9. Adding a new component primitive for the menu (use DaisyUI dropdown).
10. Hidden-only kebab (e.g. visible only on hover) — kebab is always visible at full opacity. Hover-reveal hurts touch and screen-reader users.
11. Distinct icon set for each request verb. Verbs are text-only in the menu (verb + right-aligned target). No decorative icons (AQ-113).
12. A new component for the thread dot. It is a `<span>` with two utility classes; codifying it as a component would burn a slot from the 19-component budget for nothing.

## Final critique score

**8/10.** The synthesis preserves Variant A's density and component-economy strengths and fixes its lone weakness (first-time discoverability) by lifting two surgical insights from B (conditional body-click on unread) and C (state-aware menu ordering + primary-tint on the high-frequency action). No new component is added; the component budget remains at 19. AI-aesthetic risk is low — single-grammar surface, monochrome status, primary used only as a thread-unread signal, danger only on `Kill task`.
