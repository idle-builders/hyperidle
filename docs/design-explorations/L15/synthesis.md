# L15 — Synthesis

## Strongest base: Variant A — Minimal Menu

A wins because:

1. **Tightest fit to the founder filter.** HyperIdle is a power-user productivity tool. Density is principle #1. A is the only variant that adds zero card chrome until the user engages.
2. **Lowest component cost.** Reuses TaskCard `actions` slot + DaisyUI dropdown + DaisyUI input. Zero new shapes. Zero new mental models.
3. **Speed for the common path.** 2 clicks for a state request. The other variants are equal or worse.
4. **One surface.** Both "request state change" and "open thread" live in the same popover, signalling they're sibling actions on the same task.
5. **Highest critique score (tied with B at 8.4 — broken by component-budget cost and density alignment).**

## Pulled in from Variant B

1. **The "Agent decides whether to honor" footer line** — moved from B's modal into A's dropdown footer. Without this, A risks reading as a command. With it, the social contract is explicit.
2. **The textual generated message format** (`Please move "{title}" to {targetVerb} — {note}`). B's spec for this is more polished than A's; lift it.
3. **The "talk freely" path** — B's footer-link "Open task thread instead" inspires A's "Open thread" being treated as a peer of state requests, not a tertiary tucked-away option.

## Pulled in from Variant C

1. **The interaction grammar insight** — chips and free text are the same gesture. In A, the note input + state-targets coexist in one menu; clicking a target with a non-empty note posts BOTH (the note is appended to the request).
2. **Honest UI** — no optimistic state mutation (C's transcript shows "Sent" without changing the chip; A inherits this discipline explicitly).

## Rejected — and why

### Reject — Variant B (the modal entirely)
- The modal is a context switch the user pays for every interaction. Power-users will avoid it; the affordance becomes a backwater.
- Two visible card buttons ("Request" + "Thread") permanently increase card height. At 30 cards on screen, that's 600px of permanent chrome the user already mostly ignores.
- Modal motion (slide-up + backdrop) is heavier than needed for a single request.

### Reject — Variant C (chip-as-trigger and inline expansion)
- Chip-as-trigger is unfamiliar. Users expect a chip to communicate, not to act. A11y semantics fight this (chip + `role="button"` + `aria-pressed` is a bag of holes).
- One-card-expanded-at-a-time forces accordion logic on what is otherwise a simple grid; users lose their place when scanning.
- Per-card vertical growth breaks column scan rhythm; the kanban becomes lumpy.
- A thread strip embedded in a card is a duplicate of the Rail's job (the Rail is *the* notification + conversation surface — see `docs/HUMAN_INTERFACE_LAYER.md`). Doing it twice violates "one interaction grammar".

### Reject — separating the affordance into two icons
- Considered a "comment" icon + "request" icon pair. Rejected because both actions land in the same channel (the task thread). Two icons implies two channels, which is a lie.

### Reject — keyboard verb shortcuts (B/R/D/A on hover)
- Cited founder filter ("no keyboard-verb shortcuts" — TRACK-L scope rules).

### Reject — optimistic state mutation
- Cited founder filter and concept lock — humans request, agents decide. The chip MUST not change on click.

### Reject — emoji-as-request shorthand (e.g. tap a 🚧 to mean "I think this is blocked")
- Cited AQ-105 (no emoji as iconography) and the "no emojis" constraint in L15 acceptance.

## Open questions for the architect

1. **`refs` shape for state requests.** Options: `{ kind: "task", id, requestedState: TaskState }` (structured intent) vs the message text alone carrying the request as natural language. Recommend structured — agents can parse intent without LLM, and the UI can render the request differently in transcript views (e.g. a status-chip-shaped pill in the message). The architect should pick the type and add it to `MessageRefs` in `packages/shared/src/thread.ts`.
2. **Idempotency.** If the user double-clicks "Block", should two messages post? Recommend a 2s in-flight throttle on the trigger (no second submit until the first response lands).
3. **State gating source.** The valid-target list per current TaskState lives in `packages/shared`. Suggested: a pure helper `requestableStatesFor(current: TaskState): TaskState[]` co-located with the state machine, so designer-spec and runtime never drift.
4. **Thread auto-create.** If a task has no thread yet (host_kind='task' thread not yet materialized), does opening the menu auto-create it lazily, or eagerly at task creation? Recommend lazy, on first message — keeps the empty-thread fixture out of fixtures L18 has to manage.
5. **Mobile sheet vs popover.** On viewport ≤ 640px, render the menu as a bottom-sheet modal (touch-target friendly) rather than a popover (click-outside is fragile on mobile).
