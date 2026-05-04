# L15 — Brief

## User and decision

**User.** A founder (CEO/CPO) glancing at the Team Board kanban during the day. They see a task that looks stuck, mis-prioritised, or out of scope.

**Decision.** Right now they can drag the card to a new column. After L15 they cannot — tasks are agent-owned. Their decision is now: **"I want this task to change state OR I want to ask the agent why."** Both decisions land in the task's thread; the agent decides what to do with them.

## Brief lock-in (auto-mode designer-call answers)

| Probe | Resolution |
|---|---|
| What's the smallest UI surface? | The TaskCard. The Kanban shell shrinks (drop-zone visuals removed); the WorkTeam page handler is gutted. No new shells, sheets, or panels in this workpackage. The thread renders in the existing Submenu thread surface (L8 / L18 territory) — L15 just opens it. |
| Primary state? | Populated. A typical Team Board has 5-15 tasks across four columns. Empty/loading already covered by EmptyState. |
| New primitive or extension? | **Extension** of TaskCard. We add an `actions` slot (already present in props — see TaskCard.tsx:16) with a request affordance + thread-open affordance. No new Tier-1/2/3 component is added. |
| What gets overflowed? | Card width is `max-w-[320px]` — affordances must stay inside that box at compact density. The agent name (`owner`) is the longest typical string; affordances cannot push it to wrap. |
| Composition? | TaskCard (extended) + DaisyUI `dropdown` / `menu` / `btn-ghost` / `btn-xs`. Optional: a small icon button on the card edge. Threading uses the existing thread route from L18. |
| Drag-no-op cue? | Cursor stays `default` (not `grab`). No dashed drop zone, no drag overlay. Pointer-down on the card enters the click affordance only. The card body itself becomes a thread-open target — clicking the card opens the task's thread. |

## Non-negotiables

- Drag is a **complete no-op** on TaskCards in Kanban. The DnD context, sensors, `DraggableTaskCard`, `KanbanDropZone`, `STATE_TO_COLUMN` reverse-map, `COLUMN_TO_STATE`, `resolveKanbanDrop`, and `onMoveTask` prop go away inside `Kanban.tsx`. Canvas keeps drag (Shaped → Committed only).
- Each task gets ONE affordance to either request a state change OR open the thread. Founder direction: "There should still be a way for a user to request the item to change state or start a thread." Designer call: this can be one entry-point or two, but it must be obvious in 1.5 seconds.
- Selecting "request state change" posts a `plain` message into the task's thread (`host_kind=task`, `host_id=task.id`). The AGENT decides whether to honour the request. UI never optimistically moves the card.
- Lucid tokens only. No new colours, no new radii, no off-grid pad/gap. Touch targets ≥ 44px at ≤1024px viewport.
- Component budget intact: 19 custom components. No new shapes.

## TaskState matrix — what humans can request

`TaskState` union: `proposed | accepted | hold | in_progress | blocked | review | done | killed`.

Hidden in Kanban (`STATE_TO_COLUMN` returns null): `hold`, `killed`. The Kanban shows: `proposed`, `accepted`, `blocked`, `in_progress`, `review`, `done`.

Humans request — with thread message — any of:

| Request | Maps to TaskState | Wire copy (the message text) |
|---|---|---|
| Pause this task | `hold` | "Requesting: pause this task." |
| Mark blocked | `blocked` | "Requesting: mark this task as blocked." |
| Resume / unblock | (no specific state; agent decides) | "Requesting: resume this task." |
| Push to review | `review` | "Requesting: push this task to review." |
| Mark done | `done` | "Requesting: mark this task as done." |
| Kill this task | `killed` | "Requesting: kill this task." |
| Send a message | (free text in thread) | open thread, free composer |

States NOT requestable directly by humans: `proposed`, `accepted`, `in_progress` — those are agent lifecycle moves the agent owns. The Resume action covers "I want it moving again" without dictating which moving state.

## Variants to explore

Three independent shapes for the affordance set. Each variant must produce a working HTML mockup of the Team Board kanban (4 columns, 5-7 tasks) with the variant's affordance live on every card.

1. **Variant A — "Single menu, density-first"** — one icon-button kebab on each card opens a dropdown listing the requestable state changes + "Open thread" + "Send message". Smallest surface, smallest visual cost. Card body click does nothing (pure container). Tests density discipline.
2. **Variant B — "Body-as-thread, kebab-as-request"** — the card body itself is the thread-open target (whole card is a click target leading to the task thread). A small icon button on the right edge opens a request menu. Tests the body-click-opens-detail convention from Linear / Notion / Stripe Dashboard. Two affordances, two grammars, with the most-used grammar (open thread) being the largest target.
3. **Variant C — "Inline verb chip row"** — under the card's metadata row, a pinned row of inline buttons: `Thread` + `Pause` + `Block` + `Done` + a `…` for the rest (kill, review). Verbs are spelled out, not hidden. Tests legibility-over-density and matches the verdict-grammar pattern from review surfaces. Highest visual cost; lowest discovery cost.

Anti-convergence axes covered:
- Hierarchy (where the eye lands first): A=title, B=title-then-body-affordance, C=verb row
- Density: A tightest, C loosest
- Action surface: A hidden in menu, B body-click+menu, C all surface
- Composition: A=1 element, B=card-as-link + 1 element, C=row of N elements
- Discovery: A poor (kebab), B medium (body-click is conventional), C high (verbs spelled out)
