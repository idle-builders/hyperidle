# L15 — Design exploration

## Phase 0a — Classification
**routine-low-conf** → 2 variants.

The work is "small affordance on an existing primitive (TaskCard) reusing existing menu pattern (BlockActionsPopover)". The novelty is *which* affordance shape best balances always-discoverable vs doesn't-bloat-the-card. Drag is being removed; users WILL look for "what do I do now?" — the affordance must answer that within 3 seconds (PRINCIPLES §1).

L1/L2/L3 primitives are not introduced; this is a Tier-2 surface change on TaskCard's `actions` slot.

---

## Variant A — Trailing kebab (overflow menu) opens BlockActionsPopover-style menu

**Shape.** A `⋯` (three-dot) button is the rightmost element of TaskCard's bottom-right corner — sits in the existing `actions` slot. Always visible (Linear-style restraint: muted at rest, full on hover/focus). Pressing it opens a 200px right-anchored popover (`role=menu`) with two items:

1. **Request state change…** — opens an inline submenu (or inline composer) with chips for the legal next states from the current `task.state` (e.g. from `in_progress`: `blocked`, `done`, `hold`, `kill`; from `accepted`: `in_progress`, `blocked`, `kill`). Selecting a chip drops a structured `plain` message into the task's thread: `"Requesting state change to {state}. Reason: {optional}"` with the state as a typed inline `ref`.
2. **Open thread** — navigates to `/conversations/<task-thread-id>` (or creates the thread on first open). Lifts the task's attached thread.

**Pros.**
- Discoverable: kebab menu is a universal pattern; users find it immediately.
- Card stays compact: one icon, no text, fits the muted-chrome aesthetic (PRINCIPLES S1).
- Reuses BlockActionsPopover as the menu primitive — zero new components.
- Keyboard-accessible by default (Tab to kebab, Enter, arrow keys, Esc).
- Touch target ≥ 44px on mobile (the kebab button is sized to the row).
- Two-step disclosure (kebab → menu → state-chip submenu) keeps Variant A from showing 5 chips at rest. PRINCIPLES D3 (progressive disclosure).

**Cons.**
- Two clicks to request a state change (kebab → state-chip). One extra interaction beyond Variant B.
- Submenu inside a popover is a slightly heavier interaction model than a flat menu.
- Kebab is *generic* — doesn't signal "this is where you talk to the agent". Discoverability of the *thread* affordance specifically is OK but not great.

**Sketch.**
```
┌────────────────────────────────────────┐
│ Implement login endpoint               │
│ [Auth]  [in_progress]                  │
│ Dev Agent 1                            │
│ Cost: $4.20                       [⋯]  │
└────────────────────────────────────────┘
                                         ▼
                         ┌──────────────────────────┐
                         │ Request state change…  ▸ │
                         │ Open thread              │
                         └──────────────────────────┘
                                         (state submenu on hover/right-arrow)
                                         ┌─────────────────┐
                                         │ → Blocked       │
                                         │ → Done          │
                                         │ → Hold          │
                                         │ → Kill          │
                                         └─────────────────┘
```

---

## Variant B — Speech-bubble icon (one-click thread) + secondary "Request" inside thread composer

**Shape.** A single trailing icon (speech bubble, e.g. `MessageSquare` from lucide) in the `actions` slot. Always visible at muted chrome opacity. One click navigates to `/conversations/<task-thread-id>` — the thread's detail surface — where the composer offers a `[Request state change ▾]` chip-button alongside the textarea. The chip-button opens the state picker INSIDE the composer, not on the card.

**Pros.**
- One click to open the thread (the primary affordance per HIL §4.5: threads are where humans and agents talk; the request is a *kind* of message inside that conversation).
- The card stays radically minimal — one icon, one shape, one verb.
- Aligns with the "humans request, agents decide" framing: you go *to the conversation*, you don't issue a side-channel command. The state-change request is recognisably a message in a thread, not a tool action.
- Discoverability of the thread is perfect (one icon, one click). The state-change discoverability rides on the composer surface, which is where you'd write the message anyway.

**Cons.**
- Pushes the state-change UI into the conversation/thread surface, which is **L8/L9/L18 territory** — that composer surface still needs a `[Request state change ▾]` chip wired in. Higher cross-story coupling.
- A user who *only wants to request a state change without reading the thread* now has a 2-screen flow (card → thread → composer chip → submit). Variant A keeps this on the card.
- The thread route may not exist yet for tasks in a way that surfaces a composer (mock data path; L18 deepens the surface). Variant B shifts work to a surface that's still partly mocked.

**Sketch.**
```
┌────────────────────────────────────────┐
│ Implement login endpoint               │
│ [Auth]  [in_progress]                  │
│ Dev Agent 1                            │
│ Cost: $4.20                       [💬] │  ← speech-bubble icon
└────────────────────────────────────────┘
                                         (click → /conversations/task-tXX)
                                         ┌──────────────────────────────────┐
                                         │ Thread on "Implement login…"    │
                                         │ ─────────────────────────────── │
                                         │  [history…]                      │
                                         │ ─────────────────────────────── │
                                         │ [Request state ▾] [______] Send │
                                         └──────────────────────────────────┘
```

---

## In-session critique — 9-dimension rubric

Scoring each variant 1–10 across (the rubric the previous /design-critique skill owned):

| # | Dimension | A | B |
|---|-----------|---|---|
| 1 | Clarity (PRINCIPLES §1 — 3-sec scan) | 8 — kebab is universal, both menu items label clearly | 6 — speech-bubble icon could be misread as "comments" not "actions"; state-change discoverability deferred to composer |
| 2 | Hierarchy (§2 — chrome recedes) | 8 — kebab muted at rest, surfaces on hover/focus | 9 — single icon, single shape, max restraint |
| 3 | Restraint (§3) | 8 — one icon, two-item menu, three-item submenu | 9 — one icon, period |
| 4 | Content first (§4) | 8 — affordance docks at the corner, doesn't compete with title | 9 — even smaller chrome footprint |
| 5 | Consistency (§5 — predictable) | 9 — kebab is the universal "more actions" pattern; matches BlockActionsPopover convention already in the DS | 6 — speech-bubble for "thread + state-change" is a novel mapping; users expect chat icon = open chat, not "and also change state" |
| 6 | Feedback (§6) | 8 — popover open animation, focus rings, hover states all inherited from BlockActionsPopover | 7 — navigation is one click; the state-change feedback happens after the user has navigated away |
| 7 | Accessibility (§7) | 9 — keyboard-first, role=menu/menuitem, ARIA correct via reused primitive, touch ≥44 | 8 — single button is trivially accessible; state-change accessibility lives in composer (out of scope) |
| 8 | Coupling (Boil-the-Lake / cross-story risk) | 9 — entire feature lands in WorkTeam/Kanban; reuses one DS primitive; zero L8/L18 dependency | 5 — depends on a thread-detail composer surface that L18 owns and is not yet built; risks "request state change" silently being unavailable on the surface most users land on |
| 9 | Reversibility (can we change later?) | 9 — kebab + popover is the conservative Linear/Notion choice; can swap to icon-only or richer affordances later | 7 — committing to "everything happens in the thread" is a stronger architectural bet that's harder to walk back |

**Round 1 means.** A = 8.4 ≈ **8/10**. B = 7.2 ≈ **7/10**.

A clears the ≥7 bar. B clears too — but A wins on the dimension that matters most for this story: **a user dragging a task today will see no UI feedback after L15 lands. The kebab makes the alternative immediately discoverable on the same surface they were trying to interact with.** B requires them to know that "tasks have threads now and that's where you change state" — a learning step the spec does not budget for.

**Confusion check.**

### CONFUSION: state-chip submenu vs flat menu
Uncertain about: should the state-chip submenu be a nested popover (Variant A as drawn) or should the menu flatten to `Request: Blocked / Request: Done / Request: Hold / Request: Kill / —— / Open thread` (six items, no nesting)?
Options:
A) Nested submenu — keeps the menu short (2 items at rest); requires submenu hover/right-arrow to expand. Higher interaction depth, lower visual noise.
B) Flat 6-item menu — one click to any state-change. No submenu component needed. Slightly noisier menu, but every legal state visible at once.
Proceeding with **(B) flat menu** because: (1) BlockActionsPopover doesn't currently support nested submenus and adding nesting expands the DS surface; (2) the legal-next-state set is small (3–4 states from any current state); (3) Linear-style restraint says "show what you have, don't hide it behind an extra interaction"; (4) one-click-to-action beats two-click for the primary verb.

This pushes Variant A's interaction depth from 2 clicks to 1 click, narrowing B's only structural advantage. Re-score Clarity and Restraint:

**Round 2 (with flat menu).**
| # | Dimension | A (flat) | B |
|---|-----------|----------|---|
| 1 | Clarity | 9 — every legal action visible | 6 |
| 3 | Restraint | 7 — 5 menu items not 2 (slight regression) | 9 |
| 6 | Feedback | 9 — one click → message posts → toast → menu closes | 7 |

**Round 2 means.** A = 8.4 ≈ **8/10** (Restraint regression offset by Clarity + Feedback gain). Two rounds. A wins.

`DESIGN-CRITIQUE: A score=8 rounds=2`

---

## Approved design (Variant A, flat menu)

**Component:** `TaskActionsMenu` (new web-package component, NOT a design-system primitive — lives in `packages/web/src/shell/` because it composes Kanban context + thread navigation + thread API call). Wraps `BlockActionsPopover` from the DS to render the menu shell. **No new DS component is added** — the 19-component budget is preserved; we're composing existing primitives at the page layer.

**Trigger button:** a kebab `IconButton`-shaped element (we already use `⋯` glyph patterns elsewhere; if no shared `IconButton` exists, the trigger is a small `<button type="button">` styled per AQ-013 / density tokens, ≥44px touch target, focus ring per PRINCIPLES §7). This trigger is passed as `actions={…}` to `TaskCard`.

**Menu items (flat, ordered):**
1. Open thread &nbsp;&nbsp;&nbsp;&nbsp; (always present)
2. — divider —
3. Request: In Progress &nbsp;(disabled when current = in_progress)
4. Request: Blocked &nbsp;(disabled when current = blocked)
5. Request: Done &nbsp;(disabled when current = done)
6. Request: On Hold &nbsp;(disabled when current = hold)
7. Request: Kill &nbsp;(disabled when current = killed)

Disabled items render dimmed with `aria-disabled="true"` (BlockActionsPopover already supports `disabled`).

**Action mechanics.**
- "Open thread" → `useNavigate()` to `/conversations/<task-thread-id>`. The task-thread is found-or-created on click via the thread API (see Mode 3 plan). For L15's mock-data Team Board, the in-page demo wires this to a stub navigate; the real thread create lands in L18.
- "Request: <State>" → posts `POST /api/threads/<id>/messages` with `type: "plain"`, payload `{ text: "Requesting state change to <state>." }`. (L18 may extend this with a structured `ref`; L15 keeps payload conservative.) On success, the menu closes and a small inline acknowledgement chip ("Requested" with a 2s timeout) flashes in the actions slot. Failure renders an inline error toast.
- For L15's mock-data WorkTeam page (`INITIAL_TASKS` is local state, no real `task.id` in DB), the "Request" path is wired to a no-op stub with the same UX (request → toast → menu close). The Mode-3 plan calls out this seam explicitly: when L18 lands real task IDs, the stub becomes a real fetch with no UI change.

**Visual language.**
- Trigger: `text-[var(--text-lo)] hover:text-[var(--text-hi)]` (Linear-style muted chrome; PRINCIPLES S1).
- Menu surface: `bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--r2)] shadow-lg` — exactly BlockActionsPopover's tokens; AQ-008 / AQ-011 / AQ-012 compliant.
- No emoji icons (AQ-105). No purple/indigo (AQ-102). No `rounded-2xl` (AQ-101).
- Tabular nums not relevant here (no numeric KeyValue in the menu).
- Touch target ≥44px (AQ-015). Mobile font size on the trigger inherits ≥16px (AQ-005).
- Motion: BlockActionsPopover already uses `--motion-*` tokens (AQ-013).

**What the Canvas keeps.**
- Canvas drag (`packages/web/src/shell/Canvas.tsx`) **is untouched**. Its `useDraggable` / `useDroppable` and `onMoveBet(betId, "shaped" | "committed")` survive verbatim. The L15 spec is explicit: "Drag survives ONLY between Shaped → Committed columns on the Canvas (Shape Up shaping)." Canvas already implements exactly that surface; no changes required there.

**What the Kanban loses.**
- All `useDraggable`, `useDroppable`, `DndContext`, `DragOverlay`, sensors, `KanbanDropZone`, `DraggableTaskCard`, `handleDragStart`, `handleDragEnd`, `resolveKanbanDrop`, `COLUMN_TO_STATE`, `data-droppable-column`, `data-testid="draggable-task-…"`, the `onMoveTask` prop, and the `setActiveId` state.
- `STATE_TO_COLUMN` stays — it's the column-bucket projection, not drag.

**Rejected alternatives (explicit log).**
- Variant B (speech-bubble + composer chip) — pushes the state-change action into a surface (thread composer) that L18 owns. Higher cross-story coupling; users on Team Board can't request state-change without an extra screen. Rejected on dimension 8 (Coupling) and dimension 5 (Consistency).
- Inline always-visible state-chip row on every card (no menu) — explored in passing; rejected because it doubles the card's vertical footprint and violates Restraint (PRINCIPLES §3) and Card-budget. The card already carries title + tags + owner + cost; adding 5 chips pushes it past 5 visual rows.
- Right-click context menu only — fails AQ-015 (no touch equivalent) and AQ-007 / accessibility expectations.

**Acceptance from spec, mapped to UI.**
- "drag a task → no-op" → `KanbanDropZone` and `DraggableTaskCard` deleted; tasks render as static `TaskCard` with `actions={<TaskActionsMenu …/>}`. Pointer-down on the card does nothing.
- "request a state change → message in the task's thread" → Menu item "Request: <state>" → POST message → toast.
- "open a task's thread" → Menu item "Open thread" → useNavigate.
- Canvas drag survives → no Canvas edits.

DESIGN-CRITIQUE: A score=8 rounds=2
