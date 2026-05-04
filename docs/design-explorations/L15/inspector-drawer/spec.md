# L15 — Variant B: `inspector-drawer`

**Constraint.** Optimise for the single most common power-user task: opening
the thread to read what's happening on a stuck task. Cut the explicit
state-request picker from the card surface; route it through an inline
inspector panel that expands below the selected card row.

**Signature.** Click any card → an inspector drawer slides open inline within
the column, between the card and the next one. The inspector contains the
last 2 thread messages (preview), a verb-chip row to request state changes,
and a "Reply in thread" affordance. Click the same card again, click another
card, or press Esc to close.

---

## 1. User story

A founder sees a blocked task. Clicks it. The card itself stays as the
visible label; an inspector drawer below shows the agent's last message ("I'm
blocked because the API key is missing"), and three verb chips: `Reply`,
`Request unblock`, `Hand back`. The founder clicks `Reply`, types one line,
and the drawer collapses with a `↪ pending` indicator on the original card.

## 2. Components

| Slot | Component | Notes |
|---|---|---|
| Card frame | `TaskCard` (Tier 2, exists) | Adds `aria-expanded`, `aria-controls` on click |
| Inspector wrapper | DaisyUI `card` body OR a new shell-tier `TaskInspector` block | The variant proposes `TaskInspector` as a Tier-3 region (Team Board only), since it's structural and column-aware |
| Last-message preview | `RichMessageCard` (Tier 2, exists) `compact` variant | Limit to 2 messages |
| Verb chips | DaisyUI `btn btn-xs btn-outline` row | Verb language: "Request stop" not "Stop" |
| Reply input | `Composer` (Tier 2, exists) | Single-line variant |
| Pending indicator | StatusChip variant `request-pending` | Replaces cost slot post-send |

**Component budget delta: +1 Tier-3 region (`TaskInspector`).**
**Justification:** Structural and column-aware (it lives inline within the
Kanban column), used in 2+ contexts (Team Board today, future per-row
inspectors elsewhere — Bet detail, Knowledge browser). The existing 8 Tier-3
regions in UI_DESIGN.md don't include a per-row inline inspector; adding it
here means we'd need to either retire one or re-cost the budget. **Open
question for the architect / synthesis: is `TaskInspector` a real component
or a layout pattern of `Submenu` reused at row scale?**

## 3. Information hierarchy

### TaskCard at rest
Identical to today's TaskCard.

### TaskCard selected
- Card frame gets a 2px left-border in `--primary` and `--surface-3` background
- A 1px `--border-default` connects the card's bottom edge to the drawer below
- The drawer expands height-only, `--motion-medium` (150ms)

### Inspector drawer hierarchy (top → bottom)
1. **Header strip** (one line): `Thread · 3 messages · 2h ago` ·
   `[Open full thread →]` link button. Font 11px mono caps.
2. **Last 2 messages preview** as compact `RichMessageCard` rows. If the
   most recent message is from the agent and contains a question, the chip
   `QUESTION` is highlighted. If both messages fit in 2 lines each, no
   truncation; otherwise truncate with `…` and a `(more)` toggle.
3. **Verb chip row** — horizontal flex wrap, `gap: 6px`:
   - For state `in_progress`: `Request stop`, `Request hold`, `Request mark done`
   - For state `blocked`: `Request unblock`, `Hand back to me`
   - For state `accepted`: `Hand back to me`
   - For state `review`: `Request mark done`, `Request changes`
   - The verbs map to canonical request types the architect will define
4. **Reply input** — single-line Composer. Placeholder: `Reply in thread…`
   Submit on Enter, Shift+Enter for newline, Cmd+Enter to send. Sends a
   plain-text message to the task's thread (no state-change semantics).

## 4. States

### Empty (no thread yet)
Drawer header reads `No thread yet`. Verb chip row is the same. Reply
composer placeholder: `Start a thread with the agent…`

### Loading (thread fetch in flight)
Skeleton (Tier 2, exists) renders 2 message-row placeholders.

### Populated
As described in §3.

### Error
Header replaced with red `Failed to load thread · Retry` link.

### After send (state-change verb chip)
- Verb chip pill flashes `--primary-dim` for 200ms then drawer closes
- Card collapses with a `↪ pending` indicator in the cost slot
- Toast `Request sent — agent will respond.`

### After send (free-form reply)
- Composer field clears, drawer reflows to show the new message at the top
  of the preview (optimistic), the older message slides down. Drawer stays
  open so the user can see the reply landed.
- No toast (the visible reflow is the feedback).

### Drawer width / column overflow
The drawer width matches the column width. If multiple cards in the same
column have inspectors expanded — they don't. Only one inspector can be open
at a time per Kanban surface. Selecting another card collapses the previous
drawer.

## 5. Behavior

### Mouse
- Click card → toggle drawer
- Click another card → close current drawer, open new one
- Click outside Kanban → close drawer
- Click `Open full thread →` → navigate to thread surface (L18)

### Keyboard
- Tab to card → focus card
- `Enter` or `Space` on card → toggle drawer
- When drawer is open, Tab into drawer (Shift+Tab from card)
- `Esc` from any drawer focus → close drawer, return focus to card
- `R` shortcut on focused card → open drawer + focus reply composer
- `T` shortcut on focused card → open drawer (no composer focus)

### Touch
- Tap card → drawer opens
- Tap card again → drawer closes
- All touch targets ≥ 44px

### Drag
- Identical to A: removed entirely from TaskCard. Canvas BetCard drag is
  separate and unaffected.

### Motion
- Drawer open/close: `--motion-medium` (150ms), `height` animated via
  `grid-template-rows` `0fr` → `1fr` (animatable property). Honor
  `prefers-reduced-motion`.
- Verb chip flash: `--motion-fast` (80ms) opacity-only

## 6. Mobile adaptation

On viewport ≤ 1024px:
- Tap card opens a **bottom sheet** (DaisyUI `modal-bottom`) instead of an
  inline drawer (kanban columns are too narrow on mobile)
- The bottom sheet content is identical to the drawer content
- Sheet height is `min(80vh, content)`, scrolls internally
- Tap backdrop or swipe down to close

## 7. Trade-offs

**Bad at:**
- **Component budget.** Proposes a +1 Tier-3 region (or stretches Submenu's
  contract). Highest budget cost of the three variants.
- **Layout reflow.** Expanding a card pushes its column siblings down. In a
  4-column kanban this can cause visual jank when columns become unbalanced.
  Mitigation: the drawer's max-height is 320px; longer threads scroll
  internally.
- **Discoverability of state-request verbs.** Verbs are revealed only after
  selection — slower for known users than A's hover-`···`. But this is the
  point: the hot path is "see what's happening", not "command the agent".
- **Mobile shape diverges.** Inline drawer on desktop becomes bottom sheet
  on mobile — two different mental models for the same affordance.

**Good at:**
- **Hot-path speed.** Click-to-open-context is one click (vs A's
  hover-then-click).
- **Information density.** The thread preview is the primary content — gives
  the founder context before they pick a verb.
- **Verb discovery.** All verbs are visible at once when the drawer is open,
  no "what's in the menu" guessing.
- **Reply path.** Free-form replies have a first-class composer, not a
  workaround.

## 8. Signature

The card stays a card. Selection turns the card into a header for an
inline-expanded thread preview that lives in the column itself. The thread
is closer than the menu.
