# L15 — Brief

**Story.** Strip drag-to-move from the Team Board's Kanban (tasks are agent-team-owned; humans don't move them). Each task gains an affordance to either:

1. **Request a state change** — selecting a request POSTS a message to the task's attached thread (host_kind = "task"). The agent decides whether to honour. Humans request, never command.
2. **Open the task's attached thread** (re-uses the L1 Thread primitive with `host_kind: 'task'`).

Drag survives ONLY between Shaped → Committed columns on the Canvas (Shape Up shaping is a human-owned move). Everywhere else drag is gone.

**Source.** `docs/work-packages/TRACK-L.md` § L15 (lines 511–540).

---

## Phase 0 — Probes (autonomous resolution)

### Probe 1 — What is the user task?

A founder watching the Team Board notices an agent's task is in the wrong state ("`in_progress` for two days, surely blocked?", or "I marked this as `hold` last week — why is it back in `accepted`?"). The founder wants to either:
- **Nudge the agent** ("can you mark this blocked / pause / pick this up next") — without grabbing the wheel.
- **Open a chat** with the owning agent to clarify intent or surface context the agent doesn't have.

**Resolution.** The primary task is *requesting a transition*. Opening a thread is the secondary, "not enough words" escape hatch. Both must be one click from the card.

### Probe 2 — What state-change requests are valid?

The 8-state lifecycle is `proposed → accepted → hold → in_progress → blocked → review → done → killed`. Per the spec: "humans request, never command." The transitions a human would meaningfully *request* are not the full state machine — they are the human-language verbs that describe an intent:

| Verb (UI label) | Intended target state | Why a human would request it |
|---|---|---|
| `Request: pause` | `hold` | Stop work; not killed, just paused. |
| `Request: resume` | `in_progress` | Pick this up. |
| `Request: mark blocked` | `blocked` | Surface a blocker the agent missed. |
| `Request: ready for review` | `review` | "I'd like to see this before you call it done." |
| `Request: kill` | `killed` | Stop and don't resume. Destructive. |

Auto-derived rules (UI hides what doesn't apply):
- Already at target → action hidden (don't show "Pause" on a task already on hold).
- `Request: kill` always available except when already `done` or `killed`.
- `Request: ready for review` shown only on `in_progress`.
- `Request: resume` shown only on `hold` / `blocked`.
- `Request: pause` shown only on `accepted` / `in_progress`.
- `Request: mark blocked` shown only on `accepted` / `in_progress` / `review`.

The full list of *intent verbs* is **5**. The displayed list per card is **2–3** typical, **5** worst case (long-tail in_progress card with many open paths).

**Resolution.** The verb set is finite and small (5 total). Variants explore *how the menu surfaces*, not *what verbs exist*.

### Probe 3 — What's the smallest UI surface?

The Team Board Kanban shows tasks as `TaskCard`s in 4 columns (`Planned`, `Blocked`, `In Progress`, `Done`). Cards are dense (≈6 per column visible). Each card currently shows: title, betTag, StatusChip, owner, optional cost. Adding the affordance must NOT:
- Push the visible card count below 4.
- Force the card to grow vertically when idle (cost would be high — 4 columns × 6 cards × N px).
- Add chrome that competes with the card's primary signals (title, status).

The affordance is a **trigger** + a **disclosed verb list**. The variants explore where the trigger lives and how the disclosed list renders.

### Probe 4 — How does "request" actually shape the message?

Per spec: "Selecting a request posts a message to the task's thread — the agent decides whether to honour it; humans request, never command."

The posted message is a **plain text message** in the L1 thread, NOT a state mutation, NOT a verdict, NOT a questionnaire (those are agent-→-human shapes). The message body shape is a **designer call**.

**Designer decision.** The message is a short, structured plain message with a deterministic format:

```
@founder requested: pause this task
context: <optional one-line note from the human, may be blank>
```

Why plain (not a new message type):
- L1's `MESSAGE_TYPES` is a closed enum: `plain | review | questionnaire | verdict`. The spec says "post a message" — plain is the only fit without re-opening L1.
- The agent reads the message in its loop and decides whether to act. No new dispatch contract.
- No verdict/answer surface needed (the agent doesn't ack with a verdict — it acts on the underlying task or replies in the thread).

Variants may choose whether the human is *required* to attach a context note. Default: the field is offered, can be blank, the post still goes through.

### Probe 5 — Volume / scaling concern (founder direction from L18)

"Volume is a designer call." A mature factory could have 30+ active tasks across multiple teams; each card in view is a potential thread. The variants must not assume "click this and a modal eats your screen" — that's a desktop-blocker if the user is requesting changes to multiple tasks during a daily check-in.

**Resolution.** Variants explore three answers:
- A: lightweight in-place menu (no surface bigger than the card).
- B: peek-on-hover with full submenu via card click (drawer over the column).
- C: row-click promotes to a dock (RHS panel) — the thread inhabits the same surface real-estate the page already uses.

### Probe 6 — Re-use the Thread primitive (L1) for the attached thread

Confirmed. `host_kind: "task"` is already in `HOST_KINDS` (packages/shared/src/thread.ts). `ThreadShell` + `ThreadHostBanner` already render any host. No new component is needed for the thread surface itself — variants only differ in *how the user enters that surface from the card*.

### Probe 7 — Drag removal scope

Concrete:
- `Kanban.tsx` — remove `useDraggable` from `DraggableTaskCard`, remove `DndContext`, remove `DragOverlay`, remove the drop-zone `useDroppable`. The `KanbanDropZone` becomes a plain layout div. The whole `STATE_TO_COLUMN`/`COLUMN_TO_STATE` machinery for *moves* dies; the read direction (mapping a TaskState to a column for grouping) survives.
- `WorkTeam.tsx` — `handleMoveTask` deleted; `Kanban` no longer takes an `onMoveTask` prop.
- `Canvas.tsx` — UNCHANGED. Drag survives there.

This is the architect's playground. Design only specifies that the affordance must work without DnD scaffolding.

---

## Phase 0 — Resolved constraints

1. The verb list is closed at **5** (`pause`, `resume`, `mark blocked`, `ready for review`, `kill`). Filtering by current state may show 0 verbs (rare — `done`/`killed` cards) or up to 5 (impossible in practice — at most 3 are valid simultaneously).
2. The posted message is **plain**. No new `MESSAGE_TYPES` enum entry. No new dispatch path.
3. The thread surface is the **existing** `ThreadShell`. Variants differ in HOW the user opens it, not in what the thread looks like.
4. Drag dies on the Kanban, lives on the Canvas (Shape Up shaping). Non-negotiable per spec.
5. The card height MUST stay roughly the same when idle. New chrome must be either a single small element or it must collapse below the card's resting state.
6. **Volume is a designer call.** Variants explore three different answers to "what happens when you have 30 tasks and want to act on six of them in a minute."
7. **No emojis.** Per L1 / L11 / general AESTHETICS rules.

---

## Variant constraints (extending the design skill defaults)

This is an **extension** of an existing primitive (`TaskCard`), not a new primitive. Variants explore the *application* of the affordance — where the trigger lives, how the verb list renders, how thread entry feels.

```
Variant A — "Inline action row" (Minimal scaffold)
  Constraint: smallest possible surface — the affordance lives ON the card
              and never opens anything bigger than the card. Reuses existing
              DaisyUI dropdown + btn-ghost; adds zero new components.
  Thesis: density wins. The card learns one new chrome row at the bottom;
          the verb list is a popover the same width as the card. Thread
          opens by clicking the card title (already a click target).

Variant B — "Per-card overflow + thread peek" (Power-density rethink)
  Constraint: optimise for the most common power-user move — opening the
              attached thread (the agent is acting weirdly and you want to
              see why). Make thread-open the dominant action. Push state
              requests behind a single overflow trigger so they don't
              compete with the read-the-thread primary path.
  Thesis: thread-first. The card's primary new affordance is a single
          unread-indicator + thread-count chip that opens the thread.
          State-change requests live behind a `…` button — quieter,
          slower, intentional.

Variant C — "Right-rail task drawer" (Reference-borrowed — Linear's issue side-panel)
  Constraint: borrow Linear's "click row → side panel" grammar. The card
              click promotes the task to a right-side dock that fills the
              Rail's territory; the dock contains the thread (top) + the
              request-state-change verbs (bottom action footer). The Kanban
              keeps the user's spatial context; the dock is the act-surface.
  Thesis: don't fight the page layout. The Rail-shaped slot is where
          thread + actions go, mirroring the Conversations review pane's
          existing geometry. One trigger (card click), one destination
          (the dock). Zero new triggers on the card itself.
```

These three differ on:
- **Hierarchy.** A: state requests primary, thread secondary. B: thread primary, state requests secondary. C: equal weight inside a dock; the card has no primary action of its own.
- **Density.** A: very high (everything stays in the column). B: high (one chip, one button — quieter card). C: medium primary (the dock takes ~360px), high secondary (the column is unchanged).
- **Action surface location.** A: in-line dropdown over the card. B: in-line `…` menu + thread sheet/route. C: dock on the right.
- **Volume strategy.** A: pop and dismiss, never leaves the column. B: thread is the volume answer (open one thread, do everything from there). C: dock is one open-at-a-time slot (clicking a second card replaces).
- **Composition.** A: TaskCard + DaisyUI dropdown. B: TaskCard + DaisyUI dropdown + a route to the existing ThreadShell. C: TaskCard + new shell-level `TaskDrawer` region that wraps `ThreadShell`.

3+ axes of separation per pair. Anti-convergence cleared.

---

## Validation criteria for the chosen design

The approved design must:

1. Specify the request-message body format (no ambiguity for the architect).
2. Define which of the 5 verbs render under each `TaskState`.
3. Define the thread-open route/component contract (does it lift to its own page? a sheet? a dock?).
4. Define what happens to in-flight Kanban interactions (focus, scroll, escape).
5. Define the empty/loading/error/populated/overflow states for the new affordance.
6. Pass `/design-critique` ≥ 7.
7. Add zero new Tier 2 components OR justify any new component against the budget.
