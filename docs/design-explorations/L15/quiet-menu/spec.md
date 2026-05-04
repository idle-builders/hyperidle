# L15 — Variant A: `quiet-menu`

**Constraint.** Smallest possible component count; reuse only DaisyUI dropdown
+ existing primitives. Zero new shapes.

**Signature.** A quiet `···` button appears at the top-right corner of every
TaskCard on hover or focus. Click opens a dropdown menu with the canonical
request verbs and an "Open thread" item. Done.

---

## 1. User story

A founder hovers a stuck task on the Team Board, clicks `···`, picks "Request
unblock", and sees a toast confirming the request was sent to the agent.

## 2. Components

| Slot | Component | Notes |
|---|---|---|
| Card frame | `TaskCard` (Tier 2, exists) | Adds an absolute-positioned `···` button at top-right; otherwise unchanged |
| Trigger | DaisyUI `btn btn-ghost btn-xs` | Three-dot glyph; `aria-label="Task actions"` |
| Menu | DaisyUI `dropdown` + `menu` | Anchored bottom-end of trigger |
| Menu item icons | None | AQ-113 — icons only when they communicate faster than text |
| Pending indicator | StatusChip (Tier 1, exists) | New chip variant `request-pending` with monochrome `↪` glyph |
| Toast | DaisyUI `toast` + `alert` | "Request sent — agent will respond" |

**Component budget delta: +0.** No new Tier-2 / Tier-3 components.

## 3. Information hierarchy

The TaskCard remains visually identical at rest. The `···` trigger:
1. Is **visually absent** at rest (`opacity: 0`)
2. Fades to `opacity: 0.6` on card hover or card focus-within
3. Goes to `opacity: 1` on direct hover/focus of itself
4. Carries `aria-haspopup="menu"` and `aria-expanded` correctly

Menu hierarchy (top → bottom, max width 240px):
1. **Section label** `mono-sm`: `REQUEST STATE CHANGE`
2. `Request unblock` — visible only when state is `blocked`
3. `Request stop` — visible when state is `in_progress` or `accepted`
4. `Request hold` — visible when state is `in_progress`
5. `Request mark done` — visible when state is `in_progress` or `review`
6. `Hand back to me` — visible when state is `accepted`, `in_progress`, or `blocked`
7. **Divider**
8. `Open thread` — always visible, hot-keyed `Enter`
9. `Snooze 24h` — always visible

Conditional items: the menu only shows verbs that map to a legal next state
for the current state. (Dead options would teach the user nothing — better to
hide them.)

## 4. States

### TaskCard
- **Default.** Identical to today's TaskCard. No new chrome.
- **Hover.** `···` fades to opacity 0.6 over `var(--motion-fast)` (80ms).
- **Selected (menu open).** `···` opacity 1; card border is `--border-emphasis`.
- **Request pending.** A monochrome `↪` chip replaces the cost slot when a
  request is in flight (between user click and agent acknowledgment). On
  click, the chip opens the thread.
- **Drag attempted.** Card does NOT move. No special cursor, no shake — the
  card is not draggable so there's no event to react to. Reading: "this just
  doesn't drag," not "drag failed."

### Menu
- **Empty (first use).** Above the verb list, a one-line italic disclosure:
  `Agents read these as suggestions, not commands.`
  Dismissed permanently after the first interaction (localStorage flag).
- **Sent.** Menu closes. Toast appears: `Request sent — agent will respond.`
  3s auto-dismiss.
- **Error.** Toast shows `Request failed — try again` with a retry button.
- **Loading.** Menu item disables and shows a spinner inline (DaisyUI
  `loading-spinner loading-xs`) for ≤ 1s before close.

## 5. Behavior

### Mouse
- Hover card → `···` fades in
- Click `···` → menu opens
- Click outside / Esc → menu closes
- Click menu item → request fires, menu closes, toast appears

### Keyboard
- Tab to TaskCard → card receives focus → `···` becomes visible
- Press `Enter` or `Space` on focused card → opens the menu (NOT opens the
  thread — opens the menu, because the menu is the universal entry)
- `Open thread` is the first item below the divider so `Enter` then `↓ ↓ ↓ Enter`
  reaches it; OR `O` (oh) shortcut inside the menu jumps directly to it
- Arrow keys navigate menu items
- `Esc` closes menu, returns focus to card
- Letter shortcuts inside the menu: each menu item carries an underlined
  initial — typing the letter activates that item (DaisyUI native menu
  behaviour)

### Touch
- Tap the card → opens the menu directly (no `···` indirection on touch)
- Long-press preserves text selection if any (not used here)
- The 44px touch-target rule is satisfied by the card body itself

### Drag
- `useDraggable` is **removed** from the wrapper. Pointer events on the card
  do not fire `dragstart`. Browsers will not show a drag cursor because the
  card is not declared draggable.
- Canvas BetCard drag (Shaped → Committed) lives in a separate `DndContext`
  and is unaffected.

### Motion
- `···` fade-in: `--motion-fast` (80ms), opacity only
- Menu open: DaisyUI default (~150ms), respects `prefers-reduced-motion`
- Toast: DaisyUI default

## 6. Mobile adaptation

On mobile (viewport ≤ 1024px):
- The `···` button becomes always-visible (no hover state on touch)
- Card-body tap also opens the menu
- Menu opens as a bottom-sheet (DaisyUI `modal-bottom`) instead of a popover
- Menu items get `min-height: 44px` (AQ-015)

## 7. Trade-offs

**Bad at:**
- **Discoverability.** The `···` is intentionally invisible until hover. New
  users may not realise tasks are interactive at all. The first-use disclosure
  inside the menu mitigates but does not eliminate this.
- **Verb depth.** A flat menu forces verbs to be terse. There's no room for
  "request unblock because…" with a reason field. If reason matters, the user
  has to open the thread and type it manually.
- **Cognitive load on conditional menus.** Verbs change per task state. Users
  may expect a stable verb set and find the variability surprising at first.
- **Two surfaces for the same intent.** "Open thread" is reachable both via
  the menu and (in the future) by clicking the pending indicator. We must be
  consistent — clicking the card body should ALSO open the thread on touch
  but open the menu on desktop. This is asymmetric and worth calling out.

**Good at:**
- Component budget — zero growth
- Density — the card stays identical at rest
- Implementation cost — low; mostly composition
- Keyboard accessibility — every action has a key path

## 8. Signature

The card stays a card. The `···` is the entire affordance. Quiet by default;
loud when summoned.
