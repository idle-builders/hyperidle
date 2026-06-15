DESIGN-CLASS: routine  ref=EmptyState+task-row-list(WorkBet.tsx §Tasks)  pattern=bet-tasks-empty

# AK3 Design Brief — Bet detail: honest task state

## User task
A founder who just committed a bet opens its detail surface to see what's happening. Decision they're making: *is work underway, or is something wrong that I must fix?* The current UI lies — it shows "Tasks will appear here once agents start work on this bet" forever, even when nothing will ever happen (no eligible agent). AK3 replaces that single false promise with state that tells the truth.

## Concept constraints (fixed input — plans/AK3/concept.md)
- **C1 Honesty (hard rule):** never show a permanent "tasks will appear" promise over a silently empty list. After commit, a bet shows either ≥1 task or a surfaced decomposition blocker.
- **C7 Blocker specificity:** the no-eligible-agent case shows an explicit reason ("This team has no agent that can take this work"), recoverable info — not a generic empty, not a false promise.
- **C8 Closure:** decomposition terminal outcomes are `{produced, blocked}`. The UI must distinguish exactly these (plus the transient "decomposing" while the PM turn runs).

## The real design problem
The tasks section is no longer two-state (`empty | populated`). It is **four-state**, keyed off the bet status + whether a decomposition outcome/blocker exists:

| # | State | When | Truth to convey |
|---|---|---|---|
| 1 | **Draft (pre-commit)** | bet.status = draft | "Commit this bet to start work." Honest: nothing should be here yet. |
| 2 | **Decomposing (transient)** | active, 0 tasks, no blocker, decomposition in flight | "Your team is planning the work…" — a *bounded* promise, not a permanent one. |
| 3 | **Blocked** | active, 0 tasks, a decomposition blocker exists | The explicit reason + a recovery affordance (e.g. add an agent to the team). |
| 4 | **Populated** | ≥1 task | The existing task-row list. Unchanged. |

The only genuinely new UI is distinguishing states 1/2/3 — all three reuse `EmptyState` with different copy/icon/action. State 4 is the existing list.

## Phase 0b — Reuse inventory (hard gate)
| Element needed | Component | New? |
|---|---|---|
| Section heading "Tasks" | existing `<section aria-label="Tasks">` markup in WorkBet.tsx | reuse |
| Empty / decomposing / blocked region | `EmptyState` (design-system) — `title`, `description`, optional `icon`, optional `action` slot | reuse (already used for `bet-tasks-empty`) |
| Recovery action (blocked) | `Button` variant="secondary" (or a link to team settings) in `EmptyState.action` | reuse |
| Task rows (populated) | existing task-row `<button>` list + `StatusChip` + `LiveDot` | reuse, unchanged |
| Decomposing live affordance | `LiveDot` (design-system) inside the EmptyState icon slot OR a quiet inline indicator | reuse |

**Zero new components.** Every state is `EmptyState` (states 1–3) or the existing list (state 4). The entire variant is *which copy + icon + action each state passes*, plus the read of a new `decompositionStatus` field on the bet.

## Probes (resolved in autonomous mode)
- *Most common real state?* → State 4 (populated) once the loop works; State 2 (decomposing) is the first thing the founder sees right after commit. Both must feel right. State 3 is the failure the founder must never miss.
- *Does the blocker need its own component (ErrorState)?* → No. `ErrorState` carries `role="alert"` + retry semantics for *API failures*. A no-eligible-agent blocker is not an API error; it's an honest product state with a recovery path. `EmptyState` with an action slot is the correct primitive — it already supports `icon` + `action`. Using `ErrorState` would mis-signal "the app broke."
- *Is "decomposing" a spinner?* → No full-bleed spinner. A quiet `LiveDot` + "planning the work" copy. Decomposition is seconds-to-minutes (a PM agent turn), not instant; an honest bounded message beats a spinner that implies sub-second.
