# AF12 — Concept (read-only probe; no primitive reshaped)

Bet, Task, Session, Appetite, and the Propagation log are **existing, locked** primitives. This workpackage *completes* their lifecycle contract; it introduces no new noun and reshapes none. Per the pipeline brief, `/concept` runs here only to (a) lock the one genuinely-unsettled semantics question (AC3 kill-cascade) and (b) re-pin the appetite=money contract for downstream design/architecture.

## Required reading (downstream `/architecture` must read these)

- `docs/process-layer/lifecycle-propagation.md` — propagation rules, race handling, propagation_log retry contract.
- `docs/process-layer/bets-shape-commit-change-ship.md` §5.4 (Kill) — bet kill is a deliberate abandonment with reasoning + audit.
- `docs/process-layer/task-lifecycle.md` + `tasks-and-sessions.md` §6.1–6.2 — 8-state task machine; sessions are many-per-task, each bounded (start/end/outcome/cost).
- `docs/process-layer/wip-and-cost-limits.md` §10 + `docs/process-layer/canonical-shapes.md` "Money and TokenUsage shapes" — appetite is a **Money cap**, not a duration string.

## Decision 1 — Kill cascade semantics (AC3): CASCADE DOWNWARD.

**Locked answer: killing a bet cascades downward — in-progress tasks are killed, active sessions are stopped.**

Evidence chain (this is a *completion* of the locked contract, not a reshape):

1. `bets-shape-commit-change-ship.md` §5.4: "**Kill** — sometimes the right answer is to abandon the bet… on approval the bet moves to `killed`. The team writes a kill retro." Abandonment of the bet means the work under it stops; a killed bet with tasks still executing and burning money contradicts the appetite/abandonment intent.
2. `lifecycle-propagation.md` §"Race Condition Handling" already presumes downward effects exist: *"if the bet is manually killed while propagation tries to move it to `review`, the InvalidTransitionError is caught and logged as skipped… the human intent takes precedence."* The doc's race rules only make sense if a bet kill is authoritative over its tasks.
3. The shipped UI already **promises** the cascade: `ConsequencePreviewDialog` copy reads *"STOPS: All active tasks will be halted"* and *"SAVED: Team capacity is freed immediately"* (`packages/web/src/pages/WorkBet.tsx:405,413`). The gap (per the WP spec) is that the promise is false — kill only decrements team capacity (`bet-state-machine.ts:207-217`) and never touches tasks/sessions. AC3's requirement is *"either the downstream work actually stops or the confirmation copy accurately describes what happens — there is no false promise."* We make the promise true rather than weaken the copy: the docs already intend the cascade.

This is **not** a reshape: no new state, no new transition vocabulary. We are wiring an already-promised, already-implied downward edge through the existing transition functions. Kill of a bet → for each task on the bet whose state ∈ {proposed, accepted, hold, in_progress, blocked, review} (every non-terminal state) transition `task → killed`; for each session on those tasks with `state = 'active'`, stop it (`state → stopped`, `outcome = 'stopped'`, `endedAt` set). Tasks already `done`/`killed` are left untouched (`done → killed` is technically allowed by the task machine but a *done* task's output is preserved — see contract below).

**Cascade boundary (locked):**

- **Tasks:** kill only non-terminal tasks. Leave `done` tasks as `done` (their artifacts shipped; killing the bet doesn't unship them). Leave already-`killed` tasks as-is (idempotent).
- **Sessions:** stop only sessions with `state = 'active'`. `outcome = 'stopped'` (NOT `crashed`) — this is a human-initiated halt, matching the existing session-outcome semantics in `lifecycle-propagation.md` §"Session → Task" where `stopped` = "human-stopped, may resume." Here it will not resume (parent task is killed), but the outcome label is honest about *who* stopped it.
- **Artifacts:** preserved (dialog already says "CONTINUES: Existing artifacts are preserved"). No artifact deletion.
- **Out of scope (AF7 owns):** actually signalling a *live* harness process to abort. AF12's cascade is the **state-machine + DB** truth (task→killed, session→stopped). Whether a running agent process is also SIGKILLed is AF7's dispatch/runtime seam. So the dialog copy must be honest about *this* boundary too — see Decision 3.

## Decision 2 — Appetite is Money, not a duration string (AC2).

Locked by `canonical-shapes.md` "Money and TokenUsage shapes": appetite is a **Money cap** `{ minor: bigint, currency: CurrencyCode, scale }`, transported on the wire as `WireMoney = { minor: number, currency }`. There is **no** duration appetite axis (`wip-and-cost-limits.md` §10.7 rejects it).

The bug is purely a **frontend shape mismatch**, not a missing contract:
- Server `PATCH /bets/:id` already accepts `{ field: "cost_appetite", value: WireMoney|null, reason }` (`bets.ts:77-81`, handler `patchCostAppetite` `bets.ts:294-348`).
- Frontend `handleAppetiteConfirm` (`WorkBet.tsx:855-871`) sends `{ field: "cost_appetite", value: <STRING like "2 weeks">, reason }` because `AppetiteDialog` is a leftover duration picker (`APPETITE_OPTIONS = ["1 week","2 weeks","6 weeks"]`, `WorkBet.tsx:475`). Zod's `updateBetCostAppetiteSchema` rejects the string → **400**. That is the "Adjust appetite always fails with 400."

Fix is on the **frontend**: the dialog must emit `WireMoney`. Reuse `formatMoney` (`packages/shared/src/format/money.ts:14`) for display; the input collects a money value. No new money shape is invented (per WP constraint — AF10 owns the contract).

**Note for architecture:** `patchCostAppetite` only allows mutation in `status = 'active'` (`bets.ts:305`). AC2's scenario is an *active* bet adjusting appetite — consistent. The overflow menu currently shows "Adjust appetite" for `draft` too (`WorkBet.tsx:1033`), which would 400 on a draft. Architecture must decide: hide the control for draft, or allow draft appetite. Recommend hide-for-draft to match the server contract (appetite is negotiated once committed). This is a *completion* detail, not a concept change.

## Decision 3 — Propagation-log label honesty (AC6).

The `propagation_log` row's `targetTransition` field must label what actually happened. Existing bug-class: `propagateTaskToBet` logs `targetTransition: "${fromStatus} -> review"` (`lifecycle-propagation.ts:480`) but `transitionBetToCompletedAsync` actually moves the bet to **`completed`**, not `review` (U1 dropped the `review` bet state). The label lies. AC6 requires the new kill-cascade propagation rows to be labelled correctly (e.g. `bet -> killed`, task `in_progress -> killed`, session `active -> stopped`), and—since we're in this code—the existing mislabel should be corrected to `${fromStatus} -> completed`.

## Vocabulary (no aliases introduced; pinning the ones already in play)

| Term | Definition | Aliases not to use |
|---|---|---|
| **Appetite** | A bet's Money cost cap (`WireMoney` on the wire). | "duration", "timebox", "2 weeks" (duration strings are dead) |
| **Kill** | Deliberate, reason-required abandonment of a bet; cascades to non-terminal tasks and active sessions. | "cancel", "delete", "pause" (no pause state exists) |
| **Cascade** | The downward propagation of a bet kill to its tasks and sessions. | "halt-all" (UI copy), "abort" |
| **Stop (session)** | Human-initiated session end; `outcome = 'stopped'`. | "crash" (that's a runtime failure, different outcome) |
| **Transition (task)** | A guarded task state change; must be CAS-safe like bets. | "update state" (plain UPDATE — the current unguarded bug) |

## Contracts (for architecture to turn into types/guards)

- **Cascade cardinality.** One bet kill → 0..N task kills → 0..M session stops. All inside one logical operation; partial-failure must be observable via `propagation_log` (no silent drop — `lifecycle-propagation.md` §Retry).
- **Cascade idempotency.** Re-killing an already-killed bet is a no-op (bet machine already forbids `killed → killed`). Tasks already terminal are skipped. A session already `stopped`/ended is skipped.
- **Task transition CAS (hard rule).** Task transitions MUST be compare-and-set on `WHERE state = fromState`, mirroring `bet-state-machine.ts:183`. The current `transitionTask` (`task-state-machine.ts:72-79`) does an unguarded UPDATE → two concurrent transitions both "succeed" and double-emit `task_state_changed`. AC5. **Both** copies must get CAS: the kernel `task-state-machine.ts` AND the inlined fabric copy (`lifecycle-propagation.ts:90-138`, an intentional duplicate per the fabric→server import ban; its `@lore O3` says "any future changes to the kernel transitionTask must be mirrored here").
- **Sessions endpoint is read-only.** `GET /tasks/:id/sessions` returns sessions with `state`/`outcome` for viewing only. No dispatch, no creation (AF7 owns the ready→session seam). Active-session indicator = `state = 'active'`.
- **Money shape closure.** Appetite uses `WireMoney` from `@hyperidle/shared`. No new money type. No duration axis (`wip-and-cost-limits.md` §10.7).
- **Label honesty.** Every `propagation_log.targetTransition` string equals the actual `from -> to` applied. AC6.

## Rationale

The system's whole credibility rests on "humans validate, agents execute" + "nothing is silently dropped." A kill dialog that promises to halt tasks but doesn't is the exact false-promise the propagation doc's audit-trail discipline exists to prevent. The docs already imply the downward edge (race-handling rules, abandonment language, the dialog copy itself); AF12 just makes the promise true and wires the missing CAS so concurrent transitions can't corrupt state. Appetite-as-money is already locked by L4/L17 — the only sin is a leftover duration picker on the frontend that AF12 deletes.

**No `concept-missing` condition triggered.** No new or reshaped noun. Cascade-on-kill is the intended completion, evidenced by three independent doc/code signals. Proceeding to `/design` and `/architecture`.
