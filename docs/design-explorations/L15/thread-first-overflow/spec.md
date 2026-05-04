# L15 — Variant B: Thread-first with overflow menu

> The card learns ONE primary affordance — a thread chip carrying an unread/total count that opens the attached thread. State-change requests are demoted to a quiet `…` overflow trigger. Thesis: the most common founder act is "go look", not "request a state change."

## Signature

A single **thread chip** at the bottom-right of the card — a 24px-tall pill reading `▢ 3` (no unread) or `● 3` (with unread, dot-coloured `--primary`) that opens the attached thread when clicked. To its left, a tiny `…` button (16×16) that opens an overflow menu with the request-state-change verbs. The thread chip dominates; the request affordance is intentionally quiet — power-density rethink. The card silhouette grows by ~16px (the chip row), nothing else.

## User story

A founder skims the Team Board. `JWT refresh logic` shows `● 2` — there are unresolved messages in the agent's thread. He clicks the chip; the page transitions to the thread (existing L1 surface). He reads the agent's question, posts a clarifying reply, hits back. Unread becomes `▢ 0`. Total minute: 90 seconds, mostly reading.

For a different task, `Implement login endpoint`, the agent has been silent for two days. The founder hovers, clicks the `…` button, picks `Pause` from the menu, the request lands as a thread message. Total: 3 seconds.

The asymmetry is the point: thread-open is loud; state-change-request is quiet but always one click away.

## Component composition

| Component | Tier | Slot / props | Composes |
|---|---|---|---|
| `TaskCard` (extended) | 2 (existing — slot added) | `{ ...existing, threadCount: number, threadUnread: number, requestable: VerbList, onOpenThread, onRequest }`. The new footer slot renders a thread chip + an overflow trigger. | `Tag` (count chip), DaisyUI `dropdown` for overflow |
| `Kanban` (modified) | 3 (existing) | `onMoveTask` removed; DnD scaffolding removed. | TaskCard, EmptyState |
| `ThreadShell` | 3 (existing) | Mounted via `/work/teams/:teamId/tasks/:taskId/thread` route on chip click. | Existing L1 family |
| `RequestOverflowMenu` (NOT a new component — DaisyUI `dropdown` markup) | — | A 200px menu of verb rows. Click a verb → IMMEDIATELY post (no inline note). The "I want to add context" path is to open the thread instead. | DaisyUI `dropdown-content`, DaisyUI `menu` |

**Net component change.** **Zero.** TaskCard slot, Kanban code deletion, route to existing ThreadShell, DaisyUI menu markup.

## The big design call: separating the two intents

Variant A bundles state-requests and thread-open in one footer at equal weight. Variant B says: **these are different intents at different frequencies**.

- "Open the thread" is the **read-loop** intent. Founder is monitoring. Happens often. Should be one click, prominent, with the unread signal that pulls the eye.
- "Request a state change" is the **write-loop** intent. Founder is intervening. Happens rarely. Should be deliberate, not noisy.

Putting them at equal weight (variant A) makes the founder *choose* every time. Putting thread-open dominant (variant B) lets the founder *flow* through monitoring and only break flow when she actually needs to intervene.

This is the Linear `S5` principle: opinionated beats flexible. The card has an opinion about which act is the default.

## Information hierarchy (the new card layout)

```
┌────────────────────────────────────────────┐
│ JWT refresh logic                          │  ← title (existing)
│ [Auth]  [BEHIND]                           │  ← betTag + StatusChip (existing)
│ Dev Agent 1                                │  ← owner (existing)
│ COST              $6.50                    │  ← optional cost (existing)
│                            …    ● 2 thread │  ← NEW — overflow + thread chip
└────────────────────────────────────────────┘
```

The new row sits flush at the card's bottom edge, no divider above. Why no divider:
- The thread chip is a **read-out** (count + unread), visually a `Tag` — same family as `betTag`. Putting a divider above it would imply it's an action band, which it isn't (the chip is a *link*, not a button).
- The `…` button is muted — `text-lo`, no background. It only activates on card hover.

### The thread chip rendering

```
▢ 3       — no unread; surface-ghost background, text-lo number
● 2       — unread present; primary-tint background, primary dot, text-hi number
0         — no thread (no chip rendered; only `…` shows)
```

The chip is the primary action. Tabular nums (AQ-006). Click anywhere on the chip → thread route.

### The overflow menu rendering (200px wide, anchored to `…`)

```
┌──────────────────────────────────┐
│ REQUEST FROM DEV AGENT 1         │  ← mono caps label, --text-lo
├──────────────────────────────────┤
│  Mark blocked                    │  ← btn-ghost, full-width
│  Pause                           │
│  Ready for review                │
│  Kill                            │  ← --danger text on kill
├──────────────────────────────────┤
│ For richer context, open thread.  │  ← --text-lo, italic
└──────────────────────────────────┘
```

**No inline note input.** Pick a verb → menu closes → message posts immediately. The reasoning:
- The request is a low-context act. The verb itself communicates the intent.
- If the founder needs to add context, she should be in the thread, not in a 240px popover. The footnote at the bottom of the menu actively redirects her there.
- This shaves seconds off the common path and removes a decision (is this enough context?) at the friction point.

The verb list filters by current state per the brief (Probe 2 table). If no verbs apply (`done`/`killed`), the `…` button is hidden — only the thread chip remains.

## All states

### Empty (column has no tasks)
Unchanged. Existing `EmptyState`.

### Loading
The new footer row renders skeleton: `[skeleton 16px] [skeleton 60px]` right-aligned. Card stays the same height.

### Error (request post failed)
The overflow menu reopens with the picked verb pre-selected and a small `--danger` strip below: `Couldn't post — try again`. Click retries.

### Populated — typical
As above.

### Populated — terminal task (`done` / `killed`)
`…` hidden. Chip-only row: `▢ 3 thread` or, if no thread, the entire footer row is omitted (card height shrinks by ~16px). The thread is always reachable from the task detail page (a separate path); the card doesn't need to expose it on terminal cards.

### Populated — orphan task (no thread, in-flight task)
`…` shown (verbs apply). No thread chip. Footer: `…`-right-aligned only. First request creates the thread implicitly (server-side: posting a message to a non-existent thread for a `host_kind: "task"` host with that `host_id` creates it).

### Populated — unread present
Chip shows the dot + primary tint. Hovering the chip surfaces a one-line tooltip: `2 unread messages from Dev Agent 1`.

### Overflow — high unread count
Chip shows `99+` past 99 to keep the chip width stable (max ~36px wide).

### Overflow — many cards with unread
The Kanban shows them all. There is no roll-up at the column level (this is a deliberate non-feature — column counts already exist as the row-count badge in the column header). Each card carries its own unread signal; the eye scans for the dot.

### Promoted — thread open
Clicking the chip routes to `/work/teams/:teamId/tasks/:taskId/thread`. The thread is the existing `ThreadShell`. Back navigation returns to the same scroll position on the Kanban (browser nav stack). Thread chip's `unread` count zeroes on next mount of the Kanban (read-state is server-side per L1).

## Behavior

### Hover
- Card: existing surface lift. Unchanged.
- Thread chip: brighter background (`--surface-4` over `--surface-3`). Cursor `pointer`.
- `…` button: appears at full opacity on card hover (it lives at 40% opacity at rest — quiet but present). On mouse leave from card, fades back over `--motion-fast`.
- Overflow menu open: `…` stays at full opacity even when not hovered.

### Focus
- Tab order: card body (focusable wrapper for accessibility) → `…` button → thread chip → next card.
- Inside an open overflow menu: verb rows top-to-bottom.
- `:focus-visible` ring: standard `--primary` outline.
- **Focus return.** Closing the overflow menu returns focus to the `…` button. After a successful post, the menu closes AND the chip's count animates from `n` → `n+1` to confirm the message landed.

### Keyboard
- `Esc` while overflow menu open: close.
- Arrow up/down in the menu: navigate verbs (DaisyUI `menu` natural).
- `Enter` / `Space` on a verb: post + close.
- No verb shortcuts on the page level (founder filter).
- `Cmd/Ctrl + Click` on the chip: open thread in new tab (browser-native — for power users who want to keep the Kanban visible).

### Click → request commit
1. User clicks a verb. The menu closes immediately.
2. The chip increments and shows a brief 80ms pulse (`opacity 1 → 0.7 → 1`).
3. On error: menu reopens with the verb pre-selected and the inline error.

The `…` button's quiet styling means accidental clicks are rare; the menu is dismissable on outside-click. There is no confirmation step for any verb — including `Kill` — because `Kill` is a *request*, not a mutation. The agent will see "founder requested: kill this task" and decide. If the founder fat-fingers it, she opens the thread and posts a "ignore the kill request — false alarm" plain message. The undo path is the thread itself.

### Click → thread open
1. User clicks the chip (or anywhere on the chip's row that isn't the `…`).
2. Page transitions over `--motion-medium` to the thread surface (route push).
3. Browser back returns. The Kanban's scroll position restores via React Router's default scroll restoration.

### Drag is dead
Same as variant A — DnD scaffolding removed from Kanban. Cursor `default` on cards.

### Transitions
- `…` opacity rest → hover: `--motion-fast`.
- Overflow menu open: 80ms `--motion-fast` opacity + `translateY(-4px)`.
- Chip count increment pulse: 80ms `--motion-fast` opacity.
- Page transition to thread route: `--motion-medium` opacity crossfade.
- All honour `prefers-reduced-motion`.

## Mobile adaptation

- Card layout unchanged. Footer row unchanged.
- The `…` button stays visible at full opacity on mobile (no hover state on touch devices). Touch target ≥ 44px via padded hit area (the visible icon is 16×16, the touch zone is 32×32 with hidden padding).
- Thread chip same — touch target via padded hit area.
- Overflow menu renders as a bottom sheet (DaisyUI `drawer`/`modal-bottom`).
- Thread route is a full-screen page (matches the L1 mobile pattern).

## Component mapping (existing DS components used)

| Slot | Component used |
|---|---|
| Card body | existing `TaskCard` |
| Thread chip | `Tag` (Tier 1) — variant with optional dot prefix |
| Overflow trigger | DaisyUI `dropdown` + a 16×16 icon button |
| Overflow menu | DaisyUI `dropdown-content` + `menu` |
| Verb rows | DaisyUI `btn-ghost` full-width |
| Thread surface | existing `ThreadShell` (L1) |

The dot-prefix variant of `Tag` is a small extension — currently `Tag` accepts `label`. We extend with optional `kind: "default" | "unread"` that adds the leading dot. This is a Tier 1 extension, not a new component (the API is one prop).

## Behavior contracts (architect-relevant invariants)

1. **The verb list is derived from `task.state`** (same as variant A).
2. **The posted message is `plain`**. Body format:
   ```
   @<actor> requested: <verb-label>
   ```
   (No optional note in this variant — context goes in the thread.)
3. **No state mutation.** Request posts to thread only.
4. **Thread route**: `/work/teams/:teamId/tasks/:taskId/thread`.
5. **Read-state for `threadUnread`** is per-user, per-thread, server-side (existing L1 capability per `ThreadShell` design — read-state on mount).
6. **The thread chip is the primary card affordance**. The card title remains a click target (opens the task detail page, NOT the thread — task detail is L20-shaped territory). Card body click is a navigation, chip click is a different navigation.
7. **Drag removed** from `Kanban.tsx` per the spec.

## Trade-offs (what this variant is bad at)

- **The `…` is small.** Discoverability is lower than variant A's labelled `Request ▾`. New users may not realise they can request state changes from the card. Mitigation: tooltip on `…` reading `Request state change ⌘…`.
- **No inline note on the request.** Verb-only requests can be ambiguous (e.g., `Pause` — for how long? why?). The variant trades context for speed. Power users who want context use the thread.
- **The thread-open is a route hop.** Same cost as variant A — back-nav is the only return path. Variant C addresses this differently.
- **The unread signal can be noisy.** A thread with 12 unread agent posts from yesterday will pull the eye even if the founder has decided to ignore that task today. No "snooze unread" affordance — that's L1b/L18 territory.
- **No multi-select.** Same as variant A.
- **The asymmetry is opinionated.** A founder whose mental model is "I act, then I read" will find the demoted request affordance frustrating. Variant A serves that mental model better.

## Anti-convergence audit (vs. A and C)

| Axis | This variant (B — thread-first overflow) | A (inline action row) | C (right-rail drawer) |
|---|---|---|---|
| Hierarchy | Thread chip dominant; request demoted to `…`. | Equal weight, side by side. | Both inside dock; equal weight. |
| Density | Card grows ~16px; one row. | Card grows ~28px; one row + divider. | Card unchanged in column; ~360px dock takes layout. |
| Action surface location | Overflow menu on `…`; thread is route. | Anchored popover; thread is route. | Dock on the right rail. |
| Composition | TaskCard slot + DaisyUI dropdown + ThreadShell route. Tag extended with optional dot. | TaskCard slot + DaisyUI dropdown + ThreadShell route. | TaskCard slot + new `TaskDrawer` shell region wrapping ThreadShell. |
| Volume strategy | Read-loop is fast (chip click); write-loop is deliberate (`…` then verb). | Both loops are equally fast — both demand a click + a confirm. | One dock at a time; click another card to replace. |

B vs A differ on hierarchy / density / volume strategy / signature (4 axes).
B vs C differ on hierarchy / action surface / composition / volume strategy (4 axes).

Both pairs clear the 3-axis floor.

## Tokens & rules audit

- All paddings via density tokens. The thread chip's internal pad is `2px 8px` — sub-grid (chip-internal allowed per AESTHETICS.md spacing rule).
- All colours semantic.
- Closed radius scale: chip `--r-pill`, card `--r2`, menu `--r2`, buttons `--r1`.
- Motion durations from the `--motion-fast`/`--motion-medium` ladder.
- No emoji. `▢` (empty box) and `●` (filled circle) are typographic glyphs (not emoji codepoints).
- No `rounded-2xl`/`rounded-3xl`.
- No oversized padding.
- No marketing copy.
- Tabular nums on the count.
- Touch targets via padded hit areas on mobile.
