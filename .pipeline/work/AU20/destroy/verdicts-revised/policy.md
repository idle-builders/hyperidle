# policy — destroyer verdict (REVISED after founder rulings)

## What changed after the rulings

| Row | Old verdict | New verdict | Ruling | Why it moved |
|---|---|---|---|---|
| `computeApprovalRate` | KEEP | **FINISH** | A1 + Ruling 1 | The trust signal is now machinery for a feature being COMPLETED: its `auto_resolve` path is the dial that will auto-grant A1's one-time permission at earned trust. And it is unfinished for a shared backend — it aggregates ALL humans' verdicts into one per-agent rate (`approval-rate.ts:52-70` never looks at the verdict's sender), while Ruling 1 says approval rate is **per-human-per-agent**. Verdict messages carry `senderId`; the finish is attributing by approver. |
| `ApprovalRateResult` | KEEP | **FINISH** | A1 + Ruling 1 | Return shape of the finished function — grows approver attribution (per-human breakdown); `recentVerdicts` entries gain who decided. |
| `propagation_applied` event (blast radius of feature kill 1) | DELETE | **KEEP** | Ruling 2 | First wave killed it on "zero consumers (verified at ws-connection-hub.ts:47 + dispatcher.ts:425)". That reasoning is **void** — events are an extension surface, plugins may listen. And it is not a duplicate: `task_state_changed`/`bet_state_changed` announce the transition but carry no cause; `propagation_applied` announces *this transition was a cascade consequence* (source→target linkage). Emitted today at `lifecycle-propagation.ts:360-371,593-602`, independent of the log write — the emission survives the log kill untouched. |
| `propagation_failed` event (blast radius of feature kill 1) | DELETE | **KEEP** (emitter simplifies) | Ruling 2 | Same void reasoning. The fact "a cascade hop failed" still happens after the retry apparatus dies — the emitter moves from the 3-attempt exhaustion path to the first-failure catch, and the event on the bus **replaces** the internal `notifications.insert` as the extension point. `attempts` in the payload becomes meaningless → payload loses it (Ruling 2 does not protect a field nothing sets). |
| `registerPolicy` ship-confirmation addressee | KEEP (unflagged inside SIMPLIFY) | **SIMPLIFY, with named FINISH work** | Ruling 1 | `lifecycle-propagation.ts:516-519` resolves "the founder" as `getFirstUserByKind(db, "human")` — **the first human by insertion order**, fallback `"u-founder"`. On a shared backend serving a team that is the wrong human: the ship-confirmation thread for a completed bet must go to the bet's owner/team (`bet.teamId` is already on the row at line 168). First wave passed this without flagging it; it is a solo-backend premise baked into a kept path. |

**What did NOT change — re-reached, not carried over:**

- **The propagation_log kill stands in full** (founder affirmed it explicitly): table, `recordPropagationHop`, `reapTerminalPropagationLog`, the 30-second heartbeat, the retry drain, the 3-attempt CAS exhaustion path, the exhaustion `notifications.insert` (`lifecycle-propagation.ts:645` — sole use of the port), the failure-row insert at `policy-engine.ts:39`, and every external hop-writer. A ledger with zero production readers of its `applied`/`skipped`/`failed` rows is dead at any user count.
- **The `tasks.auditTrail` append kill stands, re-verified under Ruling 1.** "Who approved what is real information" — and that information lives in **verdict messages** (read by `computeApprovalRate`, rendered in threads) and in the **handoff message** `buildHandoff` posts to the thread. The `tasks.auditTrail` column duplicates both into a blob with zero production reads — re-confirmed by `rg -a`: every production hit (`tasks.ts:226`, `handoff-protocol.ts:151,306`, `lifecycle-propagation.ts:60`, `task-state-machine.ts:105`) is read-to-append; `applications/` has zero references. A shared backend does not rescue an unread duplicate of a record that already exists where humans look.
- **Escalation-branch collapse, `buildHandoff` uncurry, `PolicySessionContext` merge, `PolicyDeps` shrink, fold-into-`work` recommendation** — none rested on a voided premise; all stand.
- **New evidence found while re-checking (strengthens a KEEP):** the policy engine's `queue` action append of `policy_queued` to `items.auditTrail` (`policy-engine.ts:204-214`) **is read in production** — `work-service.ts:495` (`like(items.auditTrail, "%policy_queued%")`) feeds the daily digest (`notifications/src/daily-digest.ts:22`). The hold-for-digest leg of trust routing is load-bearing, not bookkeeping. (Contrast with `tasks.auditTrail`: same column name, one has a reader, one does not. The one with a reader lives.)

## Should this service exist?

**Still KILL THE SERVICE (as a named thing). Route survivors into `work`. The rulings strengthen this, not weaken it.**

Re-reached against the corrected premise — a shared backend, a team of humans, OIDC identity, an event stream plugins hang off:

1. A1 being FINISHED does not give `policy` an asset. The one-time-permission machinery — `proposedCalls` table, grant CAS-consumption, outcome recording — lives in `@hyperidle/review` (`framework/tool-protocol/src/tool.ts:202-207`, `layers/core-api/src/routes/reviews.ts`). Policy's contribution to the loop is the **attention router** (`item_created` → push/queue/auto_resolve) and the **trust signal** — both of which read work-owned items and write conversation-owned messages. Work-domain reactions, wrong roof.
2. After the propagation_log dies (affirmed), `policy` owns **no table**. A service owning nothing, reaching everything through ~30 mirrored `PolicyDeps` port methods, is Mechanism-C ceremony purchased by the boundary, not the features.
3. Shared backend makes the trust path MORE work-domain, not less: per-human-per-agent rates are joins over work items and conversation verdicts, exactly the data `work` and `conversation` own.

Fold `computeApprovalRate`, `buildHandoff`, and the `registerPolicy` reactions into `work`; retire the "policy" noun. If the founder keeps the package for ownership-model reasons, every row below applies unchanged.

## If written today, from scratch

Against a shared backend, used by a team, OIDC identity, plugins on the event stream — four functions, living in `work`:

- `computeApprovalRate(agentId)` → per-human-per-agent earned-trust rates (profile display, attention routing, A1 auto-grant dial). Attribution by verdict `senderId`.
- `handoffTask` (uncurried `buildHandoff`) — CAS claim, ownership transfer or review-item creation, handoff message in the thread as the human-visible record. No auditTrail appends, one item-creation path.
- `registerWorkReactions` — the three lifecycle subscribers (session→task→bet→ship-confirmation) + the `item_created` trust router. Fire-and-forget; a failed hop emits `propagation_failed` on the bus and stops. No timer, no log, no retry.
- Ship-confirmation addressed to the completed bet's team/owner, never "first human in the table".

No propagation_log. No reaper. If a hop fails, the task sits one state behind and a teammate moves it — `review ↔ in_progress` are legal both ways.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| FINISH | 1 |
| MERGE | 0 |
| SIMPLIFY | 2 |
| KEEP | 0 |

Surface: 5 methods → 3 methods (40% cut) — unchanged from first wave; what moved is one KEEP → FINISH. By mass the cut is unchanged: `lifecycle-propagation.ts` still loses the retry/log half (~350 of 823 lines), the 30-second timer door still dies, the owned table is still dropped. The two domain events previously in the blast radius now survive it.

Types: 7 declarations → DELETE 1, MERGE 1, SIMPLIFY 2, KEEP 2, FINISH 1.

## Feature-level kills (revised)

**1. Propagation durability apparatus — kill stands, blast radius corrected.**
Still dies: `propagation_log` table (schema + zod + migration), `recordPropagationHop`, `reapTerminalPropagationLog`, internal `retryFailedPropagations`, the 30-second heartbeat (`lifecycle-propagation.ts:806`), the `MAX_RETRY_ATTEMPTS` exhaustion path with its `propagation_exhausted` notification (sole `notifications.insert` caller, line 645), every `log()`/`LogSink` sink, the failure-row insert at `policy-engine.ts:39`, the cascade hop writes in `layers/core-api/work/src/bet-kill-cascade.ts`, the per-stopped-run hop in `layers/agent-orchestration/run-orchestration/src/request-run-stop-for-tasks.ts`, the `deps.policy.recordPropagationHop` port threaded into `POST /api/bets/:id/kill` (`layers/core-api/src/routes/bets.ts:700`), the `reapTerminalPropagationLog` line in the retention sweep (`service-bootstrap.ts:520`), and the machinery-only tests.
**No longer dies (Ruling 2):** `propagation_applied` / `propagation_failed` in `framework/domain-model/src/events.ts:454-475` and their dispatcher case arms. `propagation_applied` keeps its current emit sites (they never depended on the log). `propagation_failed`'s emitter moves to the first-failure catch and its payload drops `attempts`.
What breaks: a transiently failed hop is announced on the bus but not retried; no internal notification. Acceptable: failure mode is a local Postgres write erroring (never observed), manual repair is one legal click, and any team that wants a notification hangs a trigger on `propagation_failed` — that is what the event surface is for.

**2. `tasks.auditTrail` appends — kill stands, re-argued under Ruling 1.**
`buildHandoff`'s two appends (`handoff-protocol.ts:151,306`) and `transitionTask`'s per-hop append (`lifecycle-propagation.ts:60`) die. Zero production reads re-confirmed; the who-did-what record a team actually needs already exists where the team looks — the handoff message in the thread and the verdict messages `computeApprovalRate` reads. Killing the appends deletes the fragile in-tx re-read at `handoff-protocol.ts:310` for free. (Column drop remains `work`'s call.) The **`items`**.auditTrail `policy_queued` append is explicitly NOT part of this kill — it has a production reader (`work-service.ts:495` → daily digest).

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `computeApprovalRate` | UI:GET /api/agents/:id/profile (+ EVENT:item_created via policy-engine) | **FINISH** | A1 machinery being completed: its rate drives `auto_resolve` — the earned-trust auto-grant of the approval loop (`policy-engine.ts:142-154`, cold-start push under 10 verdicts, auto-resolve ≥0.9 on low risk). Unfinished per Ruling 1: aggregates all humans' verdicts into one rate, ignoring verdict `senderId`; a shared backend needs per-human-per-agent. Finish = attribute by approver; wire the same signal into `review`'s proposed-call grant path when A1's emit lands. |
| 2 | `buildHandoff` | UI:POST /api/tasks/:id/handoff + AGENT:handoff_to | SIMPLIFY | Unchanged — the handoff is the flat-team core act, and every shrink survives the rulings: (a) drop both `tasks.auditTrail` appends (zero readers re-verified; thread message is the record a team sees — Ruling 1 re-argued, kill stands); (b) collapse the toRole-miss escalation branch into the review-item branch (two near-identical blocks, one idea; `toHuman` already means an unaddressed shared-queue item any teammate claims — correct for a flat team, no single-user premise here); (c) uncurry the `buildHandoff(deps)` factory (exists for one call site, pushed the function over the lint complexity threshold per its own biome-ignore at line 125). |
| 3 | `recordPropagationHop` | SCHED:30s heartbeat + EVENT:session_ended/task_state_changed/bet_state_changed + UI:POST /api/bets/:id/kill (cascade port) | DELETE | Stands — founder affirmed: a write-only ledger is dead at any user count. Kill it and every caller (cascade hops, run-stop hops, LogSink sinks). Correction: the `propagation_applied`/`propagation_failed` EVENTS exit the blast radius (Ruling 2) — only the log rows, timer, and retry die. |
| 4 | `reapTerminalPropagationLog` | SCHED:retention-reaper (service-bootstrap.ts:520) | DELETE | Stands. A reaper for a log nobody reads is bloat squared; it never reaps `failed` rows anyway. Dies with the table. |
| 5 | `registerPolicy` | BOOTSTRAP (service-bootstrap.ts:476) | SIMPLIFY | The boot call survives and is now doing A1's delivery: the `item_created` router's three legs are each proven — push (bus notification, kind "attention"), queue (`policy_queued` → daily digest, READ at `work-service.ts:495`), auto_resolve (verdict message → the earned-trust auto-grant). Still loses the 30-second heartbeat, retry drain (`retryFailedPropagations` dies), log sinks, and the exhaustion-notification path; `propagation_failed` emission moves to the failure catch. **Named FINISH work (Ruling 1):** ship-confirmation addressee at `lifecycle-propagation.ts:516-519` — replace first-human-by-insertion (`getFirstUserByKind(db, "human")`, fallback `"u-founder"`) with the bet's team/owner; `bet.teamId` is already in hand at the call site. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ApprovalRateResult` | **FINISH** | Moves with row 1 (A1 + Ruling 1): grows per-approver attribution; `recentVerdicts` entries gain the deciding human. |
| `HandoffMetadata` | KEEP | The agent handoff wire format (`handoff_to` tool contract) — real protocol, real consumer. Unchanged. |
| `HandoffParams` | KEEP | Input of the kept handoff. Unchanged. |
| `HandoffResult` | SIMPLIFY | Stands: escalation merges into review-item → drop `"escalated"` from `status`, drop `escalationItemId`. Becomes `{ status: "success"; targetAgentId? }`. |
| `LogPropagationEntry` | DELETE | Stands: input type of `recordPropagationHop`, dies with it. |
| `PolicySessionContext` | MERGE | Stands: three fields, one consumer (`HandoffParams.sessionContext`) — inline, delete the export. |
| `PolicyDeps` | SIMPLIFY | Stands: drop `notifications` (sole caller was retry exhaustion — confirmed line 645, dead), drop the `?`-optional/`Required<Pick<…>>` re-narrowing dance, drop members no survivor calls after the kills. `users.getFirstUserByKind` gets REPLACED (not kept) by a team/owner resolution when the Ruling-1 addressee fix lands. If the fold-into-`work` lands, most of the ~30 mirrored methods evaporate because `work` calls itself directly. |

## Holes this leaves

- **A failed cascade hop is announced, not retried.** `propagation_failed` fires on the bus; nothing internal retries or notifies. Repair is one legal click by any teammate. The event is the hook for anyone who wants more.
- **No propagation forensics table.** "Why did this bet auto-complete?" is answerable from the live `propagation_applied` event (plugins/observability can persist it) but not from a core table. Nothing reads that table today, so nothing observable changes.
- **Role-miss handoffs produce a review item instead of an `escalation` item.** Same human surface, one fewer code path.
- **No handoff/transition entries in `tasks.auditTrail`.** The thread message remains the human-visible record; the column's fate is `work`'s.
- **Until the Ruling-1 addressee fix lands, ship-confirmation threads go to the first human by insertion order** — on a team backend that is a real mis-delivery, not cosmetics. It is named FINISH work, not optional polish.
- **Until the fold-into-`work` lands**, the package survives at 3 functions with "policy" actively misdescribing an attention router + a trust signal + a handoff.
