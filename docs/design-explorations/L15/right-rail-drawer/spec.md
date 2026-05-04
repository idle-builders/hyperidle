# L15 — Variant C: Right-rail task drawer

> Borrowed grammar from Linear's issue side-panel. The card has zero new affordances. Clicking the card body (anywhere) promotes the task to a right-side dock that occupies the Rail's territory; the dock contains the attached thread (top, full-height) + a request-state-change action footer (bottom). One trigger, one destination.

## Signature

A persistent **`TaskDrawer`** region appears on the right edge of the page (same column geometry as the existing `Rail`) once a task card is clicked. Width: 360px on desktop. Inside, top-to-bottom: a thin `TaskHeader` (title + state chip + close `×`), the existing `ThreadShell` (the substance — fills the remaining height), and a sticky `RequestActionFooter` at the floor with the verb buttons inline. Click another card → drawer's contents swap (no animation needed; the drawer stays mounted). Click `×` → drawer slides out 360px to the right; the Kanban reflows to fill.

This is the Linear / Notion / Stripe Dashboard side-panel grammar — a familiar interaction model that costs the founder zero new things to learn.

## User story

A founder scanning the Team Board sees `Implement login endpoint` is `IN PROGRESS` for two days. He clicks the card. The right side of the page splits — `TaskDrawer` slides in. He reads the thread (the agent has been waiting on a clarification message it posted yesterday). He scrolls to the thread footer; the action footer at the bottom of the dock shows `[Mark blocked] [Pause] [Ready for review] [Kill]`. He clicks `Mark blocked`. A small inline confirm appears (`Send "mark blocked" request to Dev Agent 1?`). He clicks `Send`. The footer flashes `Saving…` for 80ms; the request lands as a thread message in the dock above. He moves to the next card — clicks it — drawer's contents swap.

Total time on the first task: ~25 seconds. He read context, made a request, watched it land. Total time on the next 3 cards: ~10 seconds each (just clicks).

## Component composition

| Component | Tier | Slot / props | Composes |
|---|---|---|---|
| `TaskCard` (unchanged in API; new behavior) | 2 (existing) | Card body click → `onOpenTask(taskId)` callback. No new visible affordance on the card. | (existing) |
| `Kanban` (modified) | 3 (existing) | `onMoveTask` removed; DnD scaffolding removed. New `onOpenTask` prop. The selected card gets a 1px `--primary` border on the left edge to mark "this is the one in the drawer". | TaskCard, EmptyState |
| `TaskDrawer` | 3 (NEW shell-level region) | `{ task, thread, messages, identities, onClose, onRequest, onAppendMessage, requestable }`. The composition root for the drawer: `TaskHeader` + `ThreadShell` + `RequestActionFooter`. | `TaskHeader` (sub-component), `ThreadShell` (existing), `RequestActionFooter` (sub-component) |
| `TaskHeader` (sub-of-Drawer) | — | `{ task, onClose }`. One-line strip: state `StatusChip` + title + close `×`. | `StatusChip`, DaisyUI close button |
| `RequestActionFooter` (sub-of-Drawer) | — | `{ requestable, onRequest, busy }`. Sticky-bottom strip: verb buttons inline, with a confirm overlay popping up over the buttons on click. | DaisyUI `btn` (ghost / danger), DaisyUI `popover` |

**Net component change.** **+1 Tier 3 region (`TaskDrawer`).** Justification: it composes three sub-pieces (header + ThreadShell + action footer) into a single shell-level region with managed scroll, focus, and close behavior; it would be reused for any future "task detail" surface (per the InfoArch's task-attached views — the same drawer can host bet-task detail, knowledge-attached-task detail, etc.). Used in 1 context today (Team Board) but designed for 2+ (any task list view that needs a peek-detail; e.g., the future agent inbox in L20-territory).

`TaskHeader` and `RequestActionFooter` are NOT new shipped components — they are sub-components living inside `TaskDrawer.tsx`, not exported from the design system. Same pattern as `KanbanDropZone` inside `Kanban.tsx`.

## Information hierarchy (the new layout)

```
┌────────┬──────────┬───────────────────────┬──────────┐
│ IconR. │ Submenu  │   Kanban (reflowed)   │  Drawer  │
│  48    │   240    │    1fr                │   360    │
│        │          │                       │          │
│        │          │ ┌────┐ ┌────┐ ┌────┐  │ ┌──────┐ │
│        │          │ │Card│ │CARD│ │Card│  │ │Header│ │
│        │          │ └────┘ └────┘ └────┘  │ ├──────┤ │
│        │          │   |     ^             │ │      │ │
│        │          │   |     selected      │ │Thread│ │
│        │          │   |   (--primary L)   │ │Shell │ │
│        │          │                       │ │      │ │
│        │          │                       │ ├──────┤ │
│        │          │                       │ │ATCN  │ │
│        │          │                       │ └──────┘ │
└────────┴──────────┴───────────────────────┴──────────┘
```

When the drawer is open:
- **The Rail** (the notification surface) collapses from 360px to 56px (icon-only) automatically — they cannot both be open at full width on a 1280px viewport. The Rail's full-width state is preserved per-user; reopening the Rail closes the drawer.
- **The Kanban** keeps all 4 columns but each column narrows. On viewports < 1440px, the Kanban shifts to 3 columns (Done collapses into a Header pill that expands on click); on < 1280px, 2 columns. The drawer never overlays the Kanban.
- **The selected card** carries a 2px `--primary` left border so the founder knows which card is "loaded" in the drawer.

### Inside the drawer

```
┌──────────────────────────────────┐
│ ◐ IN PROGRESS                  × │  ← TaskHeader (state chip + close)
│ Implement login endpoint         │
├──────────────────────────────────┤
│                                  │
│  (ThreadShell — fills           │
│   the remaining height)         │
│                                  │
│  - HostBanner shows "TASK ·     │
│    Implement login endpoint"    │
│  - Stream of messages            │
│  - Composer pinned to floor     │
│                                  │
│                                  │
├──────────────────────────────────┤
│ REQUEST STATE CHANGE             │  ← mono caps label, --text-lo
│ [Mark blocked] [Pause]           │  ← verb buttons inline, flex-wrap
│ [Ready for review] [Kill]        │
└──────────────────────────────────┘
```

The `ThreadShell` IS the existing L1 component, mounted in-place. It already has its own composer at the bottom — that composer is for **plain replies**. The `RequestActionFooter` is a separate strip BELOW the ThreadShell's composer, visually distinct (different surface — `--surface-2` on top of the ThreadShell's `--surface-1`), separated by a 1px `--border-default`.

The two stacked footers (composer + action footer) is intentional:
- The composer lets the founder write free-form thread messages (questions, context, replies).
- The action footer lets the founder fire structured verb requests with one click.
- Both produce thread messages, but the request footer's messages have a deterministic structure the agent can parse cheaply.

### The verb confirm popover

```
        ┌─────────────────────────────┐
        │ Send "Mark blocked" to      │
        │ Dev Agent 1?                │
        │                             │
        │ Optional note:              │
        │ ┌───────────────────────┐   │
        │ │                       │   │
        │ └───────────────────────┘   │
        │              [Cancel] [Send]│
        └─────────────────────────────┘
            ↑ anchored above the verb
[Mark blocked] [Pause] [Ready for review] [Kill]  ← verb buttons
```

The popover renders ABOVE the clicked verb button (`position: absolute; bottom: calc(100% + 4px)`). It carries an optional note (matching variant A's offer-but-don't-require). `Esc` cancels. `Cmd/Ctrl + Enter` sends. `Cancel` closes; `Send` posts the message and closes.

This is the L1 verdict-bar grammar transposed onto request-state-change. Familiar shape, same focus management.

## All states

### Empty (no card selected)
The drawer is **not mounted**. The page renders Kanban full-width (with the existing 4-column layout). `Rail` (right) is at its user-preferred width. Identical to today's Team Board minus drag.

### Loading (card just clicked, thread fetching)
Drawer mounts immediately. `TaskHeader` renders from the card data (already known client-side). `ThreadShell` renders its own loading state per L1 (banner skeleton + 3 SkeletonRows). `RequestActionFooter` renders verb buttons in disabled-ghost styling — the verb shape is communicated during load.

### Error (thread fetch failed)
`TaskHeader` renders. `ThreadShell` renders its own error state per L1 (banner skeleton + ErrorState). `RequestActionFooter` is hidden (can't request without seeing context).

### Populated — typical
As above. ThreadShell + RequestActionFooter both fully interactive.

### Populated — terminal task (`done` / `killed`)
`RequestActionFooter` shows a single mono caps line `Task is killed — no actions available` (or `done`). ThreadShell stays interactive (composer still works for retrospective notes).

### Populated — orphan task (no thread)
`ThreadShell` renders its empty state (`No messages yet · be the first to post`). `RequestActionFooter` fully interactive. The first request creates the thread implicitly.

### Drawer-open + another card clicked
Contents swap in-place. The `TaskHeader` and `ThreadShell` re-mount with the new task's data. The selected-card-border on the Kanban moves. No drawer animation; no slide-out then slide-in.

### Closing the drawer
Click `×` (or `Esc`). Drawer slides out 360px to the right over `--motion-medium`. The Kanban reflows to fill (re-expand to 4 columns from 3 / 2). The Rail returns to user-preferred width.

### Overflow — long thread
`ThreadShell` handles its own overflow per L1 (Show N earlier comments, etc.). The drawer is a fixed-height column; its scroll container is the ThreadShell's scroll container. The footer never scrolls — it's absolute-positioned at the drawer's bottom.

### Overflow — many verbs
Per the brief, max ≈ 3 verbs per state. The footer's `flex-wrap` handles 5 verbs gracefully on a 360px drawer (two rows of buttons).

### Overflow — viewport too narrow (< 768px)
Mobile rules apply (see Mobile adaptation).

## Behavior

### Hover
- Card: existing surface lift. Card cursor `pointer` (was `grab` — the visual signal that drag is dead and click-to-open is the new act).
- Selected card (in drawer): the `--primary` left border is the resting state; on hover, the body lifts but the border stays.
- Verb buttons in the footer: DaisyUI default hover (saturation lift on primary, background tint on ghost).
- Thread chip / unread signal: NOT in this variant — there is no per-card chip. The badge for "this card has unread messages" lives in the existing column header count (which is already shipped per the Kanban code).

> **Note on unread signals.** Variant C deliberately does NOT add a per-card unread chip. The thesis is "click to open" — and once the drawer is open, the unread state is visible via L1's existing read-state UI inside the ThreadShell. Power users who want to scan for unread can use the IconRail's notification badge (existing chrome from L1 / L18). This keeps the card silhouette unchanged.

### Focus
- Tab order: Kanban card 1 → card 2 → … → drawer (when open) → drawer's TaskHeader close button → ThreadShell focusable internals (per L1 spec) → RequestActionFooter verb buttons → next region.
- **Focus trap on drawer-open**: NOT applied. The drawer is a region, not a modal. Focus can leave the drawer freely. A user can have focus on a Kanban card while the drawer is open.
- **Focus return on drawer-close**: focus returns to the most-recently-clicked card (the one the drawer was holding).
- `:focus-visible` ring: standard `--primary` outline.

### Keyboard
- `Esc` while drawer is open AND focus is in the drawer: close drawer.
- `Esc` while a verb confirm popover is open: close popover; do not close drawer.
- `Cmd/Ctrl + K` (or whatever the existing Kanban shortcut is): unaffected.
- No verb shortcuts on the page level (founder filter).
- `Cmd/Ctrl + Enter` in the verb popover textarea: send. (Composer convention.)
- Tab from the last verb button in the footer wraps back to the TaskHeader close button (the drawer is a tab-cycle group, but not a focus trap — explicit Tab can leave via the close button).

### Click → request commit
1. User clicks a verb button. Confirm popover opens above the button.
2. User optionally types a note.
3. User clicks `Send`. Footer flashes `Saving…` (80ms minimum).
4. On server confirm: popover closes, thread message renders in the ThreadShell stream above (per L1's natural insert), focus returns to the verb button.
5. On error: popover stays open with `--danger` strip + retry.

### Click → drawer-open
1. User clicks card body. The `onOpenTask(taskId)` callback fires.
2. The page layout reflows: Kanban columns narrow (or fold to 3/2), Rail collapses if at full-width, drawer slides in 360px from the right edge over `--motion-medium`.
3. The selected card gets the `--primary` left border.
4. Focus moves to the TaskHeader close button (so `Esc` is one keystroke away).

### Click → drawer-swap
1. User clicks a different card. The drawer's contents re-mount (no slide). Selected-border updates.
2. Focus moves to the new TaskHeader close button.
3. The previous task's thread state (scroll position, drafts) is dropped — no per-task drawer memory in this variant. Power users wanting persistent state per task can promote to the full thread route via a small `Open in full page` link in the TaskHeader.

### Drag is dead
Same as variants A and B — DnD scaffolding removed from Kanban. Cursor `pointer` (signals "this is now a click target").

### Transitions
- Drawer slide in/out: `--motion-medium` (150ms) `transform: translateX(360px) → 0`. GPU-friendly.
- Kanban column reflow: same `--motion-medium`, `flex-basis` transition.
- Verb popover open: `--motion-fast` opacity + 4px translate.
- Selected-card border: `--motion-fast` opacity (no jump).
- Honour `prefers-reduced-motion`: drawer appears/disappears instantly.

## Mobile adaptation

At ≤ 768px:
- Card click promotes to a **full-screen sheet** (drawer becomes 100vw × 100vh). The Kanban is hidden behind the sheet.
- TaskHeader carries a `← Back` chevron in place of the `×`. Back returns to the Kanban.
- The Rail and IconRail are off-screen by default on mobile (per HIL §3.2). The drawer is the only chrome.
- Verb buttons in the footer wrap to a 2-column grid (touch-target friendly, ≥ 44px tall).
- Verb popover renders as a bottom sheet (matches variant A's mobile pattern).

## Component mapping

| Slot | Component used |
|---|---|
| Card | existing `TaskCard` (no slots added) |
| Selected-card border | inline `border-l-2 border-[var(--primary)]` on the card wrapper |
| Drawer container | NEW `TaskDrawer` (Tier 3) |
| TaskHeader | sub-component inside TaskDrawer; uses `StatusChip` + DaisyUI close button |
| Thread surface | existing `ThreadShell` (L1) |
| RequestActionFooter | sub-component inside TaskDrawer; DaisyUI `btn` |
| Verb confirm popover | DaisyUI `dropdown` or inline absolute positioning |

## Behavior contracts (architect-relevant invariants)

1. **The drawer is a single instance.** Clicking another card swaps contents; never opens a second drawer.
2. **The drawer width is `360px` on desktop**, matching the existing Rail. On viewports ≥ 1600px, the Rail and the drawer can both be at full 360px width simultaneously (no auto-collapse). Below 1600px, drawer-open auto-collapses the Rail to 56px.
3. **The Kanban reflow on drawer-open is purely CSS** (`grid-template-columns` change). No re-render, no remount.
4. **The verb list is derived from `task.state`** (same as variants A and B).
5. **The posted message is `plain`**. Body format with optional note, same as variant A:
   ```
   @<actor> requested: <verb-label>
   <optional one-line note>
   ```
6. **No state mutation.** Request posts to thread only.
7. **The drawer mounts the existing `ThreadShell`** with `host_kind: "task"` and the task's id. No new thread component.
8. **Drawer-state lives in the URL** as `?taskId=<id>` query string (so the drawer is shareable and back/forward-navigable). Closing strips the query string.
9. **Drag removed** from `Kanban.tsx`.

## Trade-offs (what this variant is bad at)

- **Layout cost.** The drawer takes 360px. On laptop screens (1280–1440px), the Kanban gets cramped. The 3-column-collapse helps, but power users running on a small MacBook Air will feel the squeeze.
- **One drawer at a time.** A founder wanting to compare two tasks side-by-side has to open them sequentially. (Variants A and B don't have this constraint because nothing big opens.)
- **A new Tier 3 component (`TaskDrawer`).** The component-budget is sacred. The justification (multi-context reuse) is plausible but speculative.
- **Discoverability of the verb actions.** Until the founder clicks a card, she doesn't see the request affordance at all. Variants A and B both surface the affordance on the card itself. C's "click to discover" is fine for power users but harsh for first-time users. Mitigation: a subtle `i` info hint on first viewing of the Kanban — but this leans on onboarding chrome we haven't built.
- **Conflict with the Rail.** When both are at full width, the page is a 4-column layout (IconRail + Submenu + Kanban + Rail) becoming a 5-column layout (+ Drawer). The auto-collapse of the Rail is a side-effect that may surprise users who keep the notification feed open.
- **Spatial inconsistency** between Kanban (cards in the middle) and the dock (action footer at the right edge). The user's eye has to travel further per request than in variants A/B.

## Anti-convergence audit (vs. A and B)

| Axis | This variant (C — drawer) | A (inline action row) | B (overflow + thread-first) |
|---|---|---|---|
| Hierarchy | Card has no primary affordance; card body click opens drawer; drawer has equal-weight thread + action footer. | Card has two equal affordances inline. | Card has one primary (thread chip), one quiet (`…`). |
| Density | Card unchanged; drawer takes 360px. | Card grows ~28px. | Card grows ~16px. |
| Action surface | Right-rail dock, fixed position. | Anchored popover ON the card. | Overflow menu on `…`. |
| Composition | TaskCard untouched + new TaskDrawer region wrapping ThreadShell. | TaskCard slot + DaisyUI dropdown. | TaskCard slot + DaisyUI dropdown + Tag extension. |
| State strategy | Single canonical layout (drawer always looks the same); selected-card-border in the Kanban is the cross-region link. | Each state has a distinct shape (popover open/closed). | Two distinct interaction modes (read = chip, write = `…`). |
| Volume strategy | One drawer at a time; click-swap is the volume answer. | Per-card popovers, no shared state. | Open the thread once, do everything from the thread. |
| Discovery | Card click is a discovery cost (zero on-card hints). | Two labelled affordances on every card. | One chip + one `…` on every card. |

C vs A differ on hierarchy / composition / action surface / discovery (4 axes).
C vs B differ on hierarchy / density / action surface / composition / discovery (5 axes).

Both pairs clear the 3-axis floor.

## Tokens & rules audit

- All paddings via density tokens.
- All colours semantic.
- Closed radius scale.
- Motion durations from the standard ladder; drawer slide uses `--motion-medium` (the disclosure register, per AESTHETICS.md).
- No emoji. The `×` close glyph is the standard typographic ×, not a codepoint emoji.
- No `rounded-2xl`/`rounded-3xl`.
- No oversized padding.
- No glass morphism on the drawer (it sits on `--surface-2`, no backdrop-blur).
- Touch targets via padded hit areas.
- Drawer respects `prefers-reduced-motion`.
- Tabular nums on counts (the column header counts in the Kanban).
- The drawer's `aria-label` is `Task detail panel`. Drawer-open announces via `aria-live="polite"`.
- The selected-card border is reinforced by `aria-selected="true"` on the card wrapper (the border is not the only signal).
