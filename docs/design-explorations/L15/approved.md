# L15 — Approved Design

**Status.** Locked. Input contract for `/architecture L15`. The architect does
NOT re-decide visual hierarchy, component vocabulary, or interaction grammar
— they decide types, schemas, endpoints, and ordered tasks. Use § 11
(rejection list) to refuse re-litigation.

**Sources.** Story spec: `docs/work-packages/TRACK-L.md` § L15 (lines 511–540).
Variants: `quiet-menu/`, `inspector-drawer/`, `linear-palette/`. Comparison +
scores: `comparison.md` (A 7.6 / B 6.7 / C 6.4). Synthesis:
`synthesis.md` (composite score estimate 8.3 / 10).

---

## 1. Chosen base + pulls

**Base.** Variant A (`quiet-menu`). The TaskCard stays visually identical at
rest. A `···` button reveals on hover/focus and opens a per-card menu of
canonical request verbs + universal items.

**Pull-in 1 (from B).** **Card body is the menu trigger.** Clicking anywhere
on the card body (not just the `···`) opens the menu. The `···` is the
visible affordance and the keyboard focus target; the card body is the
mouse/touch hot path. Resolves the asymmetry between desktop and touch
behaviour that pure-A had.

**Pull-in 2 (from B).** **`Reply in thread…` is a first-class menu item.**
Free-form replies are not buried in the thread surface — they're one menu
click away. Selecting opens a Composer modal (DaisyUI) with a single-line
input.

**Pull-in 3 (from C).** **Per-item secondary text** ("→ agent decides").
Replaces the one-time disclosure banner with a per-verb teaching line that
appears every time the menu is open. Teaches the human-requests / agent-decides
contract permanently and contextually.

**Pull-in 4 (from C).** **"Request X with reason" via Cmd/Alt+click or
Cmd+Enter.** Default action sends the verb without a reason. Holding Cmd or
Alt while clicking, or pressing Cmd+Enter on a focused menu item, opens the
same Composer modal as P-2 with a `Why? (optional)` field. Default = fast;
modifier = with-reason.

**Pull-in 5 (from C).** **`Cancel pending request` verb** appears in the menu
when the task has a request in flight. Resolves the send-but-cannot-unsend
asymmetry.

---

## 2. Components

### 2.1 What's added (component budget delta)

**Component budget delta: +0.** All affordances compose from existing
primitives + DaisyUI.

### 2.2 Existing components reused

| Slot | Component | Notes |
|---|---|---|
| Card frame | `TaskCard` (Tier 2, exists) | Adds an absolute-positioned `···` button at top-right; gains `aria-haspopup`, `aria-expanded`. Card body becomes a pressable region. Drag wrapper is removed. |
| Trigger | DaisyUI `btn btn-ghost btn-xs` | Three-dot glyph; `aria-label="Task actions"`. Visible on card hover or card focus-within at opacity 0.6; opacity 1 on direct hover/focus or when menu is open. |
| Menu | DaisyUI `dropdown` + `menu` | Anchored bottom-end of trigger. `role="menu"`. |
| Menu item | DaisyUI `menu` `<li><button>` items | Two-line layout: primary verb + muted secondary contract hint. |
| Composer modal | DaisyUI `modal` + `Composer` (Tier 2, exists) | Opens for "Reply in thread…" and for "Request X with reason." Single-line input variant. |
| Pending indicator | StatusChip (Tier 1, exists) | New variant `request-pending` rendering `↪ PENDING` in mono caps with `--surface-ghost` background, dashed `--border-default` border. Replaces cost slot when present. Click opens the thread. |
| Toast | DaisyUI `toast` + `alert` | "Request sent — agent will respond." 3s auto-dismiss. |

### 2.3 Components removed from the surface

- `useDraggable` wrapper around TaskCard inside Kanban (was: every TaskCard;
  is: none on Team Board). The DragOverlay rendering of an active TaskCard
  inside the Kanban DndContext is removed.
- `useDroppable` zones in Kanban columns. Columns are no longer drop targets.
- The `onMoveTask` prop on `Kanban`, the `COLUMN_TO_STATE` export, and the
  `resolveKanbanDrop` helper. (Architect call on whether to delete or keep
  the latter as a private util — the public `Kanban` API loses the move
  surface either way.)
- The move-task handler at `WorkTeam.tsx:116-120`.

### 2.4 Components untouched

- `Canvas` and `BetCard` keep their drag context exactly as today (Shaped →
  Committed remains the one valid human-owned move).

---

## 3. Information hierarchy

### 3.1 TaskCard at rest

Identical to today's TaskCard. No new chrome. The `···` button is
`opacity: 0` at rest.

### 3.2 TaskCard on hover or focus-within

`···` fades to `opacity: 0.6` over `--motion-fast` (80ms). Otherwise the card
is unchanged.

### 3.3 TaskCard with menu open

- `···` → `opacity: 1`, background `--surface-6`
- Card → `outline: 1px solid var(--border-emphasis)` (offset -1px),
  `background: var(--surface-5)`

### 3.4 TaskCard with request pending

- Cost slot replaced with the `request-pending` StatusChip variant
- Hovering or focusing the chip exposes a `title` attribute reading
  `Requested: <verb> · <relative time>`
- Clicking the chip opens the thread (does NOT open the menu)

### 3.5 Menu hierarchy (top → bottom, max width 280px)

1. **Section label** `mono-sm`: `REQUEST STATE CHANGE`
2. **State-conditional verbs** (each is a button with primary + secondary
   line):
   - For state `accepted`: `Hand back to me` · `→ moves ownership to you`
   - For state `in_progress`: `Request stop` · `→ asks the agent to abandon — agent decides`,
     `Request hold` · `→ asks the agent to pause — agent decides`,
     `Request mark done` · `→ asks the agent to wrap — agent decides`,
     `Hand back to me` · `→ moves ownership to you — agent confirms`
   - For state `blocked`: `Request unblock` · `→ asks the agent to retry — agent decides`,
     `Hand back to me` · `→ moves ownership to you`,
     `Request stop` · `→ asks the agent to abandon — agent decides`
   - For state `review`: `Request mark done` · `→ accepts the work as-is — agent decides`,
     `Request changes` · `→ rejects with comment — agent decides`
   - For states `proposed` / `hold` / `done` / `killed`: no state-change
     verbs (the section label is also hidden when no verbs would render)
3. **Pending row** (only when a request is in flight):
   `Cancel pending request` · `→ withdraws the request`
4. **Divider** (only between sections that both render content)
5. **Universal section label** `mono-sm`: `THREAD`
6. `Open thread` · `→ jump to the conversation` · shortcut `O · ↵`
7. `Reply in thread…` · `→ send a free-form message` · shortcut `R`
8. **Divider**
9. **Universal section label** `mono-sm`: `OTHER`
10. `Snooze 24h` · `→ hide from board until tomorrow` · shortcut `Z`
11. `Copy task link` · shortcut `⌘L`

**Verb format rule.** Every state-change verb is written `Request <verb>`
or `<imperative phrase>` that does not bind the agent. **Never**
`Stop`, `Unblock`, `Mark done`, `Block`. The contract is in the verb.

---

## 4. States

| State | Trigger | Description |
|---|---|---|
| **Default** | Default | Card identical to today. `···` invisible. |
| **Hover** | Mouse on card | `···` fades to opacity 0.6 over 80ms. |
| **Focus** | Keyboard tab to card | `···` opacity 0.6 + card outline 1px `--primary`. |
| **Open** | Click card body OR click `···` OR `Enter` on focused card | Menu opens; card outline `--border-emphasis`; `···` opacity 1. |
| **Loading menu item** | Verb selected, request in flight | Item disables, inline `loading-spinner loading-xs`, max 1s before menu closes. |
| **Sent (atomic)** | Verb fires successfully | Menu closes; toast `Request sent — agent will respond.`; pending chip appears on card replacing cost. |
| **Sent (with reason)** | Cmd-clicked verb / `Cmd+Enter` in modal | Composer modal opens → user types → Cmd+Enter sends → modal + menu close → toast + pending chip. |
| **Reply sent** | "Reply in thread…" composer submits | Modal closes; toast `Reply posted.`; no pending chip (replies aren't requests). |
| **Error** | Send fails | Toast `Request failed — try again.` with a `RETRY` action button (DaisyUI `alert-error`). Menu reopens with the same item highlighted on retry click. |
| **Pending visible** | Task has a request in flight | Cost slot replaced with `↪ PENDING` chip. Click chip → opens thread. Menu shows `Cancel pending request` item. |
| **Cancel pending** | User selects `Cancel pending request` | Menu closes; toast `Request cancelled.`; pending chip removed; cost slot returns. |
| **Drag attempted** | User mouse-drags card | Card does NOT move. Cursor stays default. No animation, no tooltip. |

---

## 5. Behavior

### 5.1 Mouse

| Action | Effect |
|---|---|
| Hover card | `···` fades in |
| Click card body | Menu opens |
| Click `···` | Menu opens |
| Click outside menu | Menu closes |
| Click menu item | Verb fires, menu closes, toast appears |
| Cmd-click (or Alt-click) menu verb item | Opens Composer modal pre-populated with the verb |
| Click pending chip | Opens thread (does NOT open menu) |

### 5.2 Keyboard

| Key | Effect |
|---|---|
| Tab | Move focus across cards in DOM order |
| `Enter` / `Space` on focused card | Open menu |
| `↑` / `↓` in menu | Move highlighted item |
| Letter (`S`, `H`, `D`, `B`, `O`, `R`, `Z`) | Activate matching menu item |
| `Enter` on menu item | Fire verb (atomic) |
| `Cmd+Enter` on menu item | Open Composer modal for that verb |
| `Esc` | Close menu (or modal); return focus to card |
| `Cmd+Enter` in Composer modal | Send |

### 5.3 Touch

| Action | Effect |
|---|---|
| Tap card | Menu opens (as bottom-sheet via DaisyUI `modal-bottom`) |
| Tap menu item | Verb fires |
| Tap menu backdrop | Closes |
| Long-press | No action (reserved for future text-selection if any) |

### 5.4 Drag

- TaskCard wrapper has **no** `useDraggable`. Pointer events do not start a
  drag. The browser does not show a drag cursor because `draggable` is not
  declared.
- Kanban columns have **no** `useDroppable`. They are not drop targets.
- The Kanban-level DndContext is **removed** entirely. (No DndContext = no
  drag overlay, no sensors, no key handlers contending with menu shortcuts.)
- `Canvas` keeps its own DndContext + BetCard `useDraggable` for Shaped →
  Committed. Untouched.

### 5.5 Motion

- `···` fade-in / out: `--motion-fast` (80ms), opacity only
- Menu open: DaisyUI default (~150ms), respects `prefers-reduced-motion`
- Toast: DaisyUI default
- Composer modal: DaisyUI default

---

## 6. Mobile adaptation

On viewport ≤ 1024px (auto-density `comfortable` per AQ-016):
- The `···` button becomes always-visible (no hover state on touch)
- Tap the card body opens the menu directly
- Menu opens as a bottom-sheet (DaisyUI `modal-bottom`)
- Menu items get `min-height: 44px` (AQ-015)
- Composer modal uses the same bottom-sheet treatment with the input
  pinned above the on-screen keyboard
- Pending chip stays in the cost slot; touch target is the chip (≥ 44px
  via padding)

The three-tab mobile shell (Conversations / Work / Knowledge) is unchanged
— the affordance lives entirely within the Work tab's Team Board.

---

## 7. Drag-removal verification

**Cards inside Kanban columns:**
- HTML attribute `draggable` is NOT set
- No `dragstart` / `dragover` / `drop` listeners exist on the card or
  column
- @dnd-kit `DndContext`, `useDraggable`, `useDroppable`, `DragOverlay`
  imports are removed from `Kanban.tsx`
- Pulling on a card with the mouse produces zero visual feedback —
  identical to dragging on a static `<div>`. This is intentional. **No
  `not-allowed` cursor. No shake. No toast saying "tasks aren't
  draggable."**

**Cards inside Canvas (Shaped → Committed):**
- `Canvas.tsx` keeps its own `DndContext` + `useDraggable` on `BetCard`
  + `useDroppable` on the two columns. Untouched.

---

## 8. Copy register

The verb language reflects agent autonomy. Every state-change verb starts
with `Request` or `Hand back to me`. The secondary line on each item ends
with `agent decides` or `agent confirms`. The toast confirms the request
was sent, not the action was taken.

| Surface | Copy |
|---|---|
| Section label | `REQUEST STATE CHANGE` |
| Verb (atomic) | `Request stop` · `→ asks the agent to abandon — agent decides` |
| Verb (handover) | `Hand back to me` · `→ moves ownership to you — agent confirms` |
| Universal | `Open thread` · `→ jump to the conversation` |
| Universal | `Reply in thread…` · `→ send a free-form message` |
| Pending item | `Cancel pending request` · `→ withdraws the request` |
| Toast (sent) | `Request sent — agent will respond.` |
| Toast (cancelled) | `Request cancelled.` |
| Toast (reply posted) | `Reply posted.` |
| Toast (error) | `Request failed — try again.` (with `RETRY` action) |
| Pending chip text | `↪ PENDING` (mono caps) |
| Pending chip title | `Requested: <verb> · <relative time>` |
| Composer placeholder (reason) | `Why? (optional — the agent reads this before deciding)` |
| Composer placeholder (reply) | `Reply in thread…` |

**No emoji anywhere.** (Story constraint.) The `↪` glyph in the pending
chip is a Unicode arrow, not an emoji — Lucid theme tokens render it in
mono.

---

## 9. Component mapping for `/architecture`

The architect plans against these surfaces:

1. **`packages/web/src/shell/Kanban.tsx`** — strips drag mechanics:
   - Remove `DndContext`, `useDraggable`, `useDroppable`, `DragOverlay`,
     sensor imports.
   - Remove `KanbanDropZone`, `DraggableTaskCard`, `resolveKanbanDrop`
     (or move the latter to dead-code if other callers exist).
   - Remove the `onMoveTask` prop, the `COLUMN_TO_STATE` export.
   - Replace `DraggableTaskCard` usage with bare `<TaskCard>` plus the
     new menu trigger composition.
   - Add a callback prop set: `onRequestStateChange(taskId, verb,
     reason?)`, `onCancelPendingRequest(taskId)`, `onOpenThread(taskId)`,
     `onReplyInThread(taskId, body)`, `onSnooze(taskId, hours)`,
     `onCopyLink(taskId)`. Architect picks the consolidation shape.
2. **`packages/web/src/pages/WorkTeam.tsx`** — deletes `handleMoveTask`,
   wires the new callbacks (mock implementations for the page; real
   implementations in the architecture pass).
3. **`packages/design-system/src/TaskCard.tsx`** + the matching
   `TaskCard.html`:
   - Add the `···` trigger absolutely-positioned at top-right.
   - Add the `request-pending` slot replacing the cost slot.
   - Make the entire card body a click trigger that surfaces a callback
     (e.g., `onRequestActions`) so the page wires it to the menu.
4. **`packages/design-system/src/StatusChip.tsx`** + the matching
   `StatusChip.html`:
   - Add `request-pending` variant rendering `↪ PENDING` with
     `--surface-ghost` background and dashed `--border-default` border.
5. **A new `TaskActionsMenu` block (Tier 2)** — see § 9.1 for the budget
   call.
6. **`Composer` (Tier 2, exists)** — reused inside a DaisyUI modal for
   "Reply in thread…" and "Request X with reason" flows.
7. **No new Tier-3 region.** No Inspector, no palette.

### 9.1 Component-budget call: `TaskActionsMenu`

The menu is structurally specific (state-conditional verb list +
secondary contract hint per item + pending-section + universal section).
Two options for the architect:

- **Option α — Compose inline.** The page assembles the menu items as
  raw DaisyUI menu markup. No new component. Pro: zero budget cost. Con:
  the menu is non-trivial (state-conditional rendering, two-line items,
  pending section, shortcuts) and would be re-implemented if reused.
- **Option β — Promote to Tier 2 `TaskActionsMenu`.** A small block
  component encapsulating the verb mapping, the two-line item, and the
  shortcuts. Pro: composable; mockable in stories; one place to update
  verbs as the architect defines the canonical set. Con: +1 Tier-2
  component (out of the 6 currently in the budget — but L15's brief
  invites the budget conversation).

**Designer recommendation:** Option β. The menu is reused in tests, in
storybook, and in any future "request actions" surface (e.g., the
thread surface might surface the same menu inline). One component, well
defined, beats inline composition that drifts.

---

## 10. Open questions for the architect

(These are decisions outside the visual contract.)

1. **Request message kind.** Is firing a verb a new `MessageKind`
   (`state_change_request`) with `{verb, optionalReason}` payload, or
   is it an existing kind with structured data? The design assumes the
   thread receives a structured, agent-parseable message — not free
   prose.
2. **Pending state derivation.** Read-model (project from open request
   messages) or write-model (typed `pending_request` field on the
   task)? Affects the cost-slot replacement logic and the cancel flow.
3. **Cancel-request semantics.** New message in the thread, or
   soft-delete of the original? Affects the agent's view of history.
4. **Atomic verb identifiers.** Canonical set:
   `request_stop`, `request_hold`, `request_unblock`, `request_mark_done`,
   `request_changes`, `hand_back`, `cancel_request`, `snooze_24h`,
   `copy_link`, `open_thread`, `reply`. The architect locks the
   identifiers and writes them into `packages/shared/src/`.
5. **Snooze semantics.** Hide from board for 24h, OR hide from
   notifications? Designer leans hides-from-board.
6. **Server endpoints.** `POST /api/tasks/:id/request` with
   `{verb, reason?}` body, returning the created message? Architect
   call.
7. **Shortcut letter conflicts.** `S` for "Request stop" overlaps with
   `S` for "Snooze 24h" in some tasks (where both verbs exist). The
   architect must pick a non-conflicting letter set OR the design
   degrades gracefully (first-wins). Designer leans first-wins, with
   `Z` always being snooze.
8. **Mobile bottom-sheet implementation.** DaisyUI `modal-bottom` is
   the chosen primitive — confirm it composes with focus-trap and the
   on-screen keyboard.

---

## 11. Rejection list (binding)

`/architecture`, `/architecture-critique`, and `/write-code` use this list
to refuse re-litigation:

- **R-1.** Inline-drawer / inspector pattern (Variant B's signature). Out.
- **R-2.** Command palette (Variant C's signature). Out.
- **R-3.** Filter input on the menu. Out — the verb list is short.
- **R-4.** `K` chip on focused card. Out — chrome forever.
- **R-5.** `not-allowed` cursor or shake animation on drag attempt. Out.
- **R-6.** Onboarding hint banner. Out — per-item secondary text covers it.
- **R-7.** Always-visible verb-chip row on the card. Out — violates
  density-at-rest.
- **R-8.** "Are you sure?" confirmation dialog on top of verb selection.
  Out — the verb selection IS the confirmation.
- **R-9.** Multi-task batch-request UI. Out of scope.
- **R-10.** Touching Canvas Shaped → Committed drag. Out — drag survives
  there.
- **R-11.** Visual feedback when the user attempts to drag a card. Out
  — the card simply does not drag.
- **R-12.** A new Tier-3 region (Inspector / Submenu-at-row-scale /
  Palette-shell). Out — the affordance composes from existing components.
- **R-13.** Imperative-mood verbs ("Stop", "Unblock"). Out — the verb
  language IS the human-requests / agent-decides contract.
- **R-14.** Auto-promotion of states. Out — humans request, agents act,
  the state machine moves on agent action only.

---

## 12. Validation checklist

The chosen design must pass:

- [ ] `/design-critique` re-run on this `approved.md` ≥ 7
- [ ] Component budget delta ≤ +1 Tier 2 (per § 9.1, Option β is +1; Option α
      is 0). Either is allowed.
- [ ] No AI-aesthetic tells per AQ-101..AQ-113
- [ ] Mobile bottom-sheet meets AQ-015 (44px targets) and AQ-005 (16px
      input on iOS)
- [ ] Drag is verifiably absent from TaskCard (Playwright: drag a card →
      DOM unchanged, no state mutation)
- [ ] Canvas Shaped → Committed drag still works (Playwright: drag a
      shaped bet → it appears in committed column)
- [ ] Verb language never imperative (linter rule or test that scans
      menu items)
- [ ] Toast appears on every request fire / cancel / error with the
      correct text
