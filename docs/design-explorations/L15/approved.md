# L15 — Approved Design

**Status:** Approved. Locks the visual contract for L15. `/architecture` does NOT re-decide the user-visible shape, the component vocabulary, or the interaction grammar — only the wire shape, file paths, and ordered tasks.

**Chosen variant:** **A — Per-card overflow menu (kebab)**, plus chip-style verb copy from Variant B and danger styling on the Blocked path from Variant C.

**Rationale (2 sentences).** A's kebab respects the density principle that defines this product, costs zero new components, and uses an interaction grammar (kebab → menu → submenu) the founder already knows from Linear / GitHub Projects / VS Code; it routes "Open thread" cleanly to L18 without pre-empting that story's surface decisions. The two clicks for a state request reinforce the L15 thesis — humans **request**, they do not command — exactly as the founder direction requires.

---

## 1. Story

> As a founder on the Team Board, I want a quiet, two-operation handle on every task — request a state change, or open the task's thread — so I can interact at the task level without violating agent ownership.

## 2. User flow

```
[Team Board with Kanban]
    |
    | hover or focus a TaskCard
    v
[Card · kebab fades in (top-right, 24×24)]
    |
    | click kebab (or Enter on focused kebab)
    v
[Menu open · 2 items]
    ├── "Request state change ▸"  →  [submenu of 4 states (current disabled, Blocked in --danger)]
    |       click → POST message to task thread → toast: "Requested → Blocked. Posted to thread." → menu closes
    └── "Open thread"              →  Route to task thread surface (L18) · seeds the thread on first open
```

## 3. Component composition

**Existing components used (no new design-system primitives):**

| Surface | Component | Source |
|---|---|---|
| Card body (unchanged) | `TaskCard` (Tier 2) | `packages/design-system/src/TaskCard.tsx` |
| Status display | `StatusChip` (Tier 1) | already on TaskCard |
| Bet tag | `Tag` (Tier 1) | already on TaskCard |
| Cost row | `KeyValue` (Tier 1) | already on TaskCard |
| Kebab button | DaisyUI `btn btn-ghost btn-xs` (or a plain `button` with token-driven styles) | DaisyUI directly |
| Menu surface | DaisyUI `dropdown` + `menu` | DaisyUI directly |
| Submenu | DaisyUI `dropdown` (nested) — `menu menu-sub` | DaisyUI directly |
| Keyboard hint | DaisyUI `kbd` | DaisyUI directly |
| Toast | App-level toast container | TBD by architect — see open question 4 |

**TaskCard prop change (single addition):**

```ts
// in packages/design-system/src/TaskCard.tsx
export interface TaskCardProps {
  // ... existing props
  /**
   * Optional overflow affordance rendered absolute-positioned in the top-right
   * of the card. Reveals on `:hover` / `:focus-within` of the card. The Kanban
   * fills this with the kebab menu; other consumers (e.g. ThreadAttachment
   * cards in L18 lists) leave it undefined.
   */
  overflowMenu?: ReactNode;
}
```

The Kanban consumer (`packages/web/src/shell/Kanban.tsx`) is the ONLY consumer that fills `overflowMenu` for L15. The kebab + menu surface is rendered there, not inside TaskCard. TaskCard merely positions whatever `overflowMenu` it receives.

**Component budget impact:** 0 new components. `overflowMenu` is an additive optional prop on an existing primitive.

## 4. Information hierarchy (TaskCard, unchanged + the kebab)

1. Title — `text-[length:var(--density-text)]`, `font-medium`, `text-hi`, truncate, padding-right reserved for the kebab.
2. Bet tag · StatusChip
3. Owner — `text-[12px]`, `text-hi`
4. Cost — `KeyValue`
5. **Kebab** — absolutely positioned top-right. Outside the card's main content flow.

The card's vertical rhythm is unchanged from today.

## 5. All states with copy

### Card states

| State | Visual |
|---|---|
| Idle (no hover, no focus) | Card today. Kebab opacity 0; not in tab order. **Wait — kebab MUST be in tab order or kbd users can't reach it.** Resolution: kebab opacity 0 but `pointer-events: none` only; tabindex is normal. On `:focus`, kebab opacity → 1 from focus state. |
| Hovered | Kebab opacity 1. Card surface lifts to `--surface-5`. |
| Focus-within (kbd-tabbed to kebab) | Kebab opacity 1, focus ring visible. |
| Menu-open | Kebab stays opaque (kebab carries `aria-expanded="true"` while menu is open). |
| Blocked (state) | Card border `--danger` (existing behavior, unchanged). |

### Menu states

| State | Items | Notes |
|---|---|---|
| Closed | — | DaisyUI default. |
| Open (no submenu) | `Request state change ▸` · `Open thread` `[T]` | First item focused on open. |
| Submenu open | `Planned [P]` · `Blocked [B]` (in `--danger`) · `In Progress (current)` (disabled) · `Done [D]` | Current state always disabled; "(current)" suffix. Blocked colored with `--danger` text. |
| Posting | Selected item flashes `--primary-dim` for 80 ms; then menu closes. | Optimistic close — toast confirms or errors. |
| Error | Menu re-opens after toast dismiss; selected item retains focus. | Allow retry. |
| Thread missing | "Open thread" is always enabled. First click triggers `POST /api/threads` (host_kind=task, host_id=task.id) with no initial message OR a minimal greeting (architect call). | The user lands in the new thread surface. |

### Toast copy

| Action | Toast text |
|---|---|
| State request posted | `Requested → Blocked. Posted to thread.` (substituting the requested state) |
| State request failed | `Couldn't post request. Retry.` (danger variant) |
| Thread opened (no toast) | (silent — page transition is the feedback) |

### Empty board

If the column is empty, the existing `EmptyState` pattern from `Kanban.tsx` continues to apply. Unchanged by L15.

## 6. Behavior

**Pointer.**
- Hover card → kebab fades in (`opacity` 0→1, `--motion-fast`).
- Click kebab → menu opens (`--motion-medium`).
- Click "Request state change" → submenu opens to the right of the parent menu.
- Click a state in the submenu → `POST /api/threads/:id/messages` with structured body (architect picks shape) → menu closes → toast.
- Click "Open thread" → route to thread surface (architect picks route).
- Click outside menu → close.

**Keyboard.**
- Tab order on a card: card body (if onClick wired) → kebab. (No additional tab stops.)
- `Enter` on focused kebab → menu opens, focus moves to first menu item.
- `↑ / ↓` → move through items.
- `→` on "Request state change ▸" → submenu opens, focus moves to first sub-item.
- `←` in submenu → close submenu, return focus to "Request state change".
- `Enter` on a sub-item → post the request.
- `ESC` → close menu, return focus to kebab.
- **Within the open submenu only:** `P / B / I / D` → jump-select the matching state. (Local shortcut — does not affect global keymap. Disabled state is skipped.)
- **Within the open menu only:** `T` → "Open thread".

**Focus management.**
- Focus trap inside the menu while open (DaisyUI dropdown handles this; verify in implementation).
- On close, focus returns to the kebab.

**Drag.**
- The Kanban dnd-kit context (`<DndContext>`, `useDraggable`, `useDroppable`) is REMOVED for tasks. The current `DraggableTaskCard` wrapper is replaced with a plain `TaskCard` render. `KanbanColumnState`, `STATE_TO_COLUMN`, `COLUMN_TO_STATE`, and `resolveKanbanDrop` are deleted (or scoped to canvas only — architect decides). The `onMoveTask` prop on `Kanban` is REMOVED.
- Canvas's Shaped → Committed drag is UNTOUCHED (`packages/web/src/shell/Canvas.tsx`).

**Optimistic UI.**
- The task card does NOT change column when a state request is posted. The card stays in its current column. The thread receives the request message; the agent decides; only when the agent updates state (via L17/agent-side path) does the card move. This enforces "humans request, agents decide" at the visual level.

## 7. Motion

| Element | Property | Token | Easing |
|---|---|---|---|
| Kebab fade-in/out | `opacity` | `--motion-fast` (80 ms) | `--motion-ease` |
| Card hover surface | `background` | `--motion-fast` | `--motion-ease` |
| Menu open/close | DaisyUI default, override to | `--motion-medium` (150 ms) | `--motion-ease` |
| Submenu open/close | same | `--motion-medium` | `--motion-ease` |
| Selected-item flash | `background` (primary-dim) | `--motion-fast` | `--motion-ease` |
| Toast slide-in | `transform` + `opacity` | `--motion-medium` | `--motion-ease` |

Honors `prefers-reduced-motion: reduce`. No layout-property transitions (AQ-014).

## 8. Mobile adaptation

At viewport ≤ 1024 px (auto-density flips to `comfortable` per AQ-016):

- The kebab is **always visible** (touch has no hover). Its hit target is 44×44 (achieved by transparent padding around the 24×24 visual icon — tap target meets AQ-015).
- Tapping the kebab opens the menu as a bottom-anchored DaisyUI `dropdown` OR a small drawer. **Recommend:** keep the same dropdown — DaisyUI handles viewport-edge collision automatically.
- The submenu opens as a "second tap → replace" (the menu transitions to show the four state items in place, with a small `← Back` row at top). Reason: nested menus floating off the right edge of a phone screen don't fit. Architect confirms whether this branching is two separate menus or a single morphing one.
- "Open thread" routes to the Conversations tab in the three-tab mobile layout, scoped to the task's thread.

## 9. Accessibility

- All interactive elements ≥ 44×44 CSS px on touch viewports (AQ-015).
- ARIA: kebab `aria-haspopup="menu" aria-expanded={open}`; menu `role="menu"`; menu items `role="menuitem"`; submenu `role="menu"` with the trigger having `aria-haspopup="menu"`.
- Disabled current-state item: `aria-disabled="true"`, suffix " (current)" so screen readers explain why.
- Toast: `role="status"` (polite), or `role="alert"` for errors.
- Focus visible on every interactive element (Lucid focus ring).

## 10. Test scenarios (forwarded to `/write-tests`)

These are the acceptance-driving scenarios. Vitest + Playwright.

1. **Drag is a no-op.** A test simulating `mousedown → mousemove → mouseup` on a TaskCard does NOT change its state, does NOT trigger any move handler, and does NOT mutate the tasks array.
2. **Kebab reveal on hover.** Hovering a TaskCard sets the kebab's opacity to 1 (jsdom can read computed style; alternatively assert the `data-state` attribute the implementation toggles).
3. **Menu opens with Request + Open thread.** Click the kebab → assert the two menu items render with the right copy.
4. **Submenu opens with four states; current is disabled.** Click "Request state change" → assert four items, one disabled with "(current)".
5. **Selecting a state posts a message to the thread.** Mock `POST /api/threads/:id/messages` and assert the request body carries the structured state-request marker (architect locks shape).
6. **Open thread seeds an empty thread.** When the task has no thread, "Open thread" triggers `POST /api/threads` with `hostKind="task"` and routes to the thread surface.
7. **ESC closes the menu, returns focus to the kebab.**
8. **Keyboard shortcut P/B/I/D inside the open submenu.** With the submenu open, pressing `B` posts a "Request → Blocked" message.
9. **Canvas drag survives.** Shaped → Committed drag on Canvas continues to work (separate test file, regression guard).
10. **Playwright e2e:** load Team Board → attempt to drag a task → no movement → click kebab → "Request state change" → "Blocked" → toast appears → assert `POST /api/threads/:id/messages` fired.

## 11. Open questions for the architect

(Repeated from `synthesis.md` § Open questions for the architect — the architect closes each in the plan.)

1. Thread-message wire shape for a state request. Suggest structured: `{ kind: "state_request", from: "in_progress", to: "blocked" }` plus a human-readable rendering ("Requested → Blocked").
2. Endpoint pattern: thin server helper (`POST /api/tasks/:id/state-request`) or direct write to `POST /api/threads/:id/messages`.
3. "Open thread" target route (L18 hasn't picked one yet). Recommend a placeholder `/work/team/task/:id/thread` route or a panel.
4. Toast surface. Introduce app-level toast container if not present.
5. Mobile kebab visibility rule — reaffirm `[data-density="comfortable"]` as the trigger.

## 12. Visual reference

See `variant-a-kebab/screenshot.png` — the In-Progress column shows the menu + submenu open on "Implement login endpoint", with the toast confirming "Requested → Blocked. Posted to thread." The Blocked submenu item should additionally render in `--danger` text (per pulled-in element from Variant C — the mockup pre-dates that synthesis edit; the implementation must apply it).

## 13. Score

`/design-critique` expected score on the approved design: **≥ 8.6 / 10** (Variant A's score, with B's copy improvement and C's danger styling adding marginal lift to coherence and color dimensions).
