# L15 — Brief

## The user task

A founder is on the Team Board. The Kanban shows tasks across four columns (Planned / Blocked / In Progress / Done). Tasks are agent-team-owned: the founder cannot move them. But the founder still has two legitimate task-level operations:

1. **Request a state change.** "I want this in review now." or "Stop — this is blocked." The agent decides whether to honor it.
2. **Open the task's thread.** Talk to the agent working on the task — unblock, clarify, kill.

Drag-to-move is being removed from the Kanban (agent ownership). Drag survives only on the Canvas (Shape Up: Shaped → Committed is human-owned).

## Constraints locked upstream

- L1 Thread primitive shipped. `POST /api/threads` creates a thread atomically with first message; `POST /api/threads/:id/messages` adds to an existing one. host_kind=`task` is allowed.
- L18 (full thread surfaces on bet/task/knowledge/artifact) is PENDING. L15 must not block on L18 — the affordance opens or seeds the thread; the rendered thread surface arrives in L18.
- TaskCard is a Tier-2 design-system primitive. Changes likely take an optional slot (e.g. `actions` already exists at line 26 of `TaskCard.tsx`) rather than embedding Kanban-specific UI inside the primitive.
- Canvas drag (Shaped → Committed) is untouched.
- Touch targets ≥ 44 CSS px on mobile (AQ-015).
- No emojis (AQ-105).
- Density tokens (AQ-002) — not hardcoded `p-[Npx]`.

## What gets surfaced

For each TaskCard in the Kanban, the user must be able to:

- Trigger one of four state requests (request "Planned", "In Progress", "Blocked", "Done"). State terms match the column labels — that is the founder's mental model on the board.
- Open the task's thread. If the thread does not yet exist, opening it seeds it.

## Anti-patterns to avoid

- A persistent visible row of action buttons inside every TaskCard. The Kanban is dense; adding 4-5 chips to every card poisons the column readability.
- Reopening drag-to-move semantics under a different name (e.g. "drag with confirmation"). The whole point is to break the move/command grammar — humans request via a thread, agents decide.
- Committing the user's request silently. The thread message must be visible — the audit trail IS the request.
- A modal that takes over the screen. The user is scanning the board; a modal disrupts that.

## Decision tree probes

- **Most common state.** Populated. The Kanban is rarely empty in practice — at the team level, work is always in flight.
- **Primitive vs extension.** Extension. TaskCard exists; we extend it via the `actions` slot (or a sibling overlay) for the Kanban context. We do NOT invent a new card.
- **What gets overflowed.** The card stays at its current density. The action surface is hidden in the default view (hover or explicit affordance) — it does not steal vertical space.
- **What composes from existing components.** TaskCard, DaisyUI dropdown / menu, an EmptyState fallback (if thread is empty), Composer (when thread opens).

## Variants to explore

- **A — Per-card overflow menu (kebab).** A 24×24 kebab button appears in the top-right of TaskCard on hover or focus. Click opens a DaisyUI menu: "Request state change ▸" (submenu of the four states except current), "Open thread". Density-respecting; hidden in default view; familiar grammar (Linear, GitHub Projects).
- **B — Inline action chips revealed on hover/focus.** On hover/focus, the bottom of the card morphs into a row of chips: "→ Planned", "→ Blocked", "→ In Progress", "→ Done", and "Thread". Direct manipulation — one click = one request. No menu drilling. More vertical bleed when active.
- **C — Card-click opens a sheet.** Clicking the card body opens a right-edge sheet with task detail + the four state-request buttons + the embedded thread (or a stub when thread is empty). Discoverable, deep, but moves the user off the board for every interaction.

## Time-box

Single approved variant in one iteration. No infinite Phase 4 loop.
