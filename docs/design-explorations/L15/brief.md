# L15 — Brief (interrogated)

## Story

Strip drag/drop from the Team Board kanban. Tasks are agent-team-owned; humans REQUEST, agents DECIDE. Each task card gains an affordance to (a) request a state change, OR (b) open the task's attached thread. Selecting a request posts a `plain` message to the task's thread.

## Decided assumptions (autonomous mode)

| Question | Decision |
|---|---|
| Who is using this? | A founder (CEO/CPO) on `/work/team`, scanning Kanban columns for tasks they want to push or unblock. |
| What decision are they making? | "I want this task to move to state X" or "I want to talk to the agent about this task". |
| Primary state? | Populated. The board is dense with tasks; the affordance must NOT add visual noise per row. |
| What are valid request targets? | A small, contextual subset based on current state. From the 8 TaskStates, the human-meaningful requests are: `in_progress` (start), `blocked` (I think this is stuck), `review` (please show me), `done` (I think this is done), `killed` (abandon). `proposed`/`accepted`/`hold` are agent-internal lifecycle stages — humans don't request those. |
| State-target gating | Don't show targets equal to current state. Don't show forward states from terminal states (e.g. `done` → `killed` is the only request available from `done`). The affordance ALWAYS shows "Open thread" + "Add note" — those are state-agnostic. |
| Combined or separate affordance? | The two actions (request state change, open thread) live in ONE menu surface — both are conversations with the agent. Separating them implies they're different tools; they aren't. |
| Optimistic UI? | NO. The UI must read as a request, never as a command. The card state does not change on click. A small confirmation appears (toast or inline mark) that the request was sent. |
| Form shape | Target state is a single click. An optional one-line note is appended ("blocked: still stuck on the auth callback"). Both flow as one `plain` message. |
| Thread open behaviour | Opens the task's thread in the Rail (the single notification + conversation surface) — NOT a modal. Continues the inline conversation grammar. |
| Drag survives where? | ONLY between Shaped and Committed columns on the Canvas (Shape Up shaping). Out of scope for the Team Board kanban. |

## Constraints respected by all three variants

- Component budget: must compose from the 19-component budget. No new component shapes.
- TaskCard `actions?: ReactNode` slot is the natural insertion point.
- All changes from the kanban side must read "I am asking" — never "I am commanding".
- Density first. The affordance must not push the existing card vertical rhythm out.
- DaisyUI primitives (btn, dropdown, menu, modal, textarea) are used directly.
- No emojis. No optimistic state mutation. No keyboard shortcuts (per founder filter).

## Three variant theses

| | Variant A — Minimal menu | Variant B — Structured form | Variant C — Inline thread peek |
|---|---|---|---|
| Constraint | Smallest surface — single icon button on the card opens a DaisyUI dropdown; each item is a one-click request. | A dedicated request modal with state + optional note, plus a "open thread" link as a sibling control. | The card EXPANDS in place, revealing a thin thread strip with composer + state-change chips above it. |
| Thesis | Fewest interactions, lowest visual weight, fits the dense kanban philosophy. | Structured form makes the human read what they're requesting and write a one-line reason — a deliberate request, not an accidental click. | One interaction grammar with the rest of the system: this is a thread conversation, surfaced where the work is. |
| Surface | Card → dropdown → click | Card → modal → submit | Card → expanded panel inline |
| Action surface lives | Card-internal, top-right icon | Card-internal, primary button at footer | Card footer, expands downward |
| Density | Highest — adds 16px icon | Mid — adds one button row | Lowest density when expanded; high when collapsed |
| Best at | Speed | Deliberation, audit trail | Continuity with thread grammar |
| Worst at | Discoverability of "open thread" | Click cost (modal overhead) | Per-card vertical real estate when expanded |

## Anti-convergence check

The three variants differ on at least 3 axes per pair:

- A vs B: surface (dropdown vs modal), composition (1 component vs 2), copy register (terse vs guided), action cost (1 click vs 3+).
- A vs C: hierarchy (icon-tucked vs panel-foregrounded), density (icon vs row), state strategy (one canonical layout vs collapsed/expanded shapes), motion (open dropdown vs expand).
- B vs C: surface (modal vs inline), motion (overlay vs grow), composition (modal+button vs inline panel), kinetic feel (interrupt vs reveal).

All three are exploring the same locked concept (request, never command; thread is the channel; tasks are agent-owned).
