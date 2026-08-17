# policy — destroyer verdict

## Should this service exist?

**KILL THE SERVICE (as a named thing). Route survivors into `work`.**

"Policy" the noun is dead on arrival under ETHOS.md — but the code behind it is not a policy
engine. What actually lives here is three unrelated things wearing one name:

1. **Task handoff** (`buildHandoff`) — an agent handing a task to a human, an agent, or a role.
   This is the flat-team collaboration act itself. Core value. It is work-domain code: every
   write is a task/item/thread mutation.
2. **Lifecycle cascade** (session ended → task review → bet completed → founder ship-confirmation
   thread). This is the time-boxed-bets loop. Core value. Also pure work-domain code.
3. **Trust routing + approval rate** (`item_created` → push/queue/auto_resolve by verdict
   history). Despite the smell of the words "policy engine", this is NOT a preemptive gate:
   nothing is blocked, the item exists either way — it routes *attention* (notify now / hold for
   digest / auto-approve), and the trust signal is earned from real verdict history, which is
   exactly ethos §2's "review fades as trust is earned". The approval rate is also user-visible
   on the Agent Profile page. Core value, wrong service name.

What is NOT core value — and it is the only thing `policy` actually *owns* — is the
**propagation_log durability apparatus**: a table, a write-only audit trail, a 30-second retry
heartbeat, a 3-attempt CAS-guarded exhaustion path with notifications, a retention reaper
predicate, and two domain events. I verified end to end: **zero production reads of the log's
`applied`/`skipped`/`failed` rows exist anywhere** (only the retry drain reads `pending_retry`),
and the `propagation_applied`/`propagation_failed` events have **zero consumers** — the WS hub
dropped them with the comment "zero real frontend consumers (verified)"
(`layers/core-api/src/ws-connection-hub.ts:47`) and the observability dispatcher explicitly
ignores them (`layers/core-api/src/observability/dispatcher.ts:425`). This is reliability
machinery built preemptively for a failure (a local DB write failing transiently, three times)
that nothing in the repo shows has ever happened. Delete it.

After that deletion `policy` owns **no table**. A service that owns nothing and reaches every
byte of data through ~30 mirrored port methods (`PolicyDeps`) exists only because it is a sibling
to `work` — the entire Mechanism-C ceremony is the cost of the service boundary, not of the
features. Fold the three survivors into `work` (which already owns tasks/bets/items, the things
they all mutate), keep one boot registration, and retire the `policy` noun. If the founder keeps
the package for ownership-model reasons, everything below still applies unchanged — the kill is
the propagation apparatus either way.

## If written today, from scratch

Three functions, living in `work`:

- `computeApprovalRate` — the earned-trust signal (profile display + attention routing).
- `handoffTask` (today's `buildHandoff`, uncurried) — CAS claim, ownership transfer or
  review-item creation, handoff message. No audit-trail appends, one item-creation path.
- `registerWorkReactions` (today's `registerPolicy`) — the three event subscribers,
  fire-and-forget, no timer, no log.

No propagation_log. No retry heartbeat. No `reap*`. If a cascade hop ever fails, the task sits
one state behind and a human moves it — `review ↔ in_progress` are legal moves both ways, the
same argument the founder already ruled for the AU26 J2 sibling-guard deletion.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 2 |
| MERGE | 0 |
| SIMPLIFY | 2 |
| KEEP | 1 |

Surface: 5 methods → 3 methods (40% cut). By mass the cut is larger: `lifecycle-propagation.ts`
loses the entire retry/log half (~350 of 823 lines), the 30-second timer door dies, and the
service's one owned table is dropped.

Types: 7 declarations → DELETE 1, MERGE 1, SIMPLIFY 2, KEEP 3.

## Feature-level kills

**1. Propagation durability + observability — kill the whole capability.**
Dies: `propagation_log` table (schema + zod + migration), `recordPropagationHop`,
`reapTerminalPropagationLog`, internal `retryFailedPropagations`, the 30-second heartbeat in
`registerLifecyclePropagation` (`lifecycle-propagation.ts:806`), the `MAX_RETRY_ATTEMPTS`
exhaustion path with its `propagation_exhausted` notification, every `log()`/`LogSink` sink in
the propagation functions, the `propagation_applied`/`propagation_failed` events in
`framework/domain-model/src/events.ts` plus their dead case arms in
`observability/dispatcher.ts`, the failure-row insert in `policy-engine.ts:39`, and the callers
outside the service: the cascade hop writes in `layers/core-api/work/src/bet-kill-cascade.ts`,
the per-stopped-run hop in
`layers/agent-orchestration/run-orchestration/src/request-run-stop-for-tasks.ts`, the
`deps.policy.recordPropagationHop` port threaded into `POST /api/bets/:id/kill`
(`layers/core-api/src/routes/bets.ts:700`), the `reapTerminalPropagationLog` line in the
retention sweep (`service-bootstrap.ts:520`), and the tests that exist only to exercise this
machinery (`lifecycle-propagation.integration.test.ts` retry suite,
`retention-reaper.integration.test.ts` propagation case, `AF12` hop assertions).
What breaks: a transiently failed cascade hop is silently lost instead of retried; no
notification after three failures. Acceptable: the failure mode is a local Postgres write
erroring, no evidence it has ever fired, and the manual repair is one click on a state the UI
already allows. Several skipped-row writes exist "for observability and test synchronization"
(`lifecycle-propagation.ts:459`) — tests driving production writes; both die together.

**2. tasks.auditTrail appends from this service — kill the writes.**
`buildHandoff` does a read-append-write of `tasks.auditTrail` twice per handoff (state
transition + handoff entry, `handoff-protocol.ts:151,306`) and `transitionTask` appends on every
cascade hop (`lifecycle-propagation.ts:60`). I found **zero production reads** of
`tasks.auditTrail` content anywhere in `layers`/`framework`/`applications` — every hit is a
write. This is the brief's named enterprise reflex: an audit trail nobody reads. Killing the
appends deletes the fragile in-tx re-read at `handoff-protocol.ts:310` (with its §A6 tx-only
@lore) for free. (The column itself is `work`'s to drop — flagged, out of this service's scope.)

## Full method audit

| # | Method | Reach | Verdict | Reason |
|---|---|---|---|---|
| 1 | `computeApprovalRate` | UI:GET /api/agents/:id/profile (+ EVENT:item_created via policy-engine) | KEEP | Core value: ethos §2's "review fades as trust is earned" — trust computed from real verdict history, rendered on AgentProfile.tsx and steering attention routing. Door named, user-visible. |
| 2 | `buildHandoff` | UI:POST /api/tasks/:id/handoff + AGENT:handoff_to | SIMPLIFY | The handoff itself is the flat-team core act — but shrink it: (a) drop both `tasks.auditTrail` appends (write-only audit, zero readers — kills the in-tx re-read too); (b) collapse the toRole-miss escalation branch into the toHuman review-item branch — two near-identical thread+item blocks are one idea, and `HandoffResult` loses `escalated`/`escalationItemId`; (c) uncurry the `buildHandoff(deps)` factory (it exists to feed one call site and pushed the function over the lint complexity threshold per its own biome-ignore). |
| 3 | `recordPropagationHop` | SCHED:30s heartbeat (lifecycle-propagation.ts:806) + EVENT:session_ended/task_state_changed/bet_state_changed + UI:POST /api/bets/:id/kill (cascade port) | DELETE | Writes a log with zero production readers; its events have zero consumers (verified at ws-connection-hub.ts:47 + dispatcher.ts:425). Reached from many doors, valuable to none — kill it and every caller (cascade hops, run-stop hops, all LogSink sinks). |
| 4 | `reapTerminalPropagationLog` | SCHED:retention-reaper (service-bootstrap.ts:520 — graph missed it, rg found it) | DELETE | Exists solely to garbage-collect the write-only rows of #3. A reaper for a log nobody reads is bloat squared; note it never reaps `failed` rows, so those accumulate forever anyway. Dies with the table. |
| 5 | `registerPolicy` | BOOTSTRAP (service-bootstrap.ts:476) | SIMPLIFY | The one boot call survives (three event subscribers ARE the bets loop: session→task→bet→ship-confirmation), but it loses the 30-second heartbeat, the retry drain (`retryFailedPropagations` is TEST-ONLY-importable internal → dies), all log sinks, and the exhaustion-notification path. Timer door: gone. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `ApprovalRateResult` | KEEP | Return shape of a kept function; flows to the agent-profile route response. |
| `HandoffMetadata` | KEEP | The agent handoff wire format (`handoff_to` tool contract) — real protocol, real consumer. |
| `HandoffParams` | KEEP | Input of the kept handoff; unchanged by the simplification. |
| `HandoffResult` | SIMPLIFY | Escalation branch merges into the review-item branch → drop `"escalated"` from `status` and drop `escalationItemId`. Becomes `{ status: "success"; targetAgentId? }`. |
| `LogPropagationEntry` | DELETE | Input type of `recordPropagationHop`; dies with it. |
| `PolicySessionContext` | MERGE | Three fields with exactly one consumer (`HandoffParams.sessionContext`) — inline into `HandoffParams`, delete the export. |
| `PolicyDeps` | SIMPLIFY | Drop `notifications` (only caller was retry exhaustion — dead), drop the four `?`-optional members plus the `Required<Pick<…>>`/`NonNullable<…>` re-narrowing dance in `HandoffDeps` (make handoff deps plainly required), drop `updateMessage`-adjacent members none of the survivors call after the kills. If the service folds into `work` as recommended, most of the remaining ~25 mirrored methods evaporate because `work` calls itself directly. |

## Holes this leaves

- **A failed cascade hop is lost, not retried.** If the DB errors mid-propagation, the task
  stays `in_progress` after its session ended (or the bet stays `active` after its last task
  closed) with no notification. Repair is manual and legal in the existing UI. No evidence this
  failure has ever occurred; the retry machinery was preemptive.
- **No propagation forensics.** "Why did this bet auto-complete?" can no longer be answered from
  a log row. Nothing and nobody reads that log today, so nothing observable changes.
- **Role-miss handoffs produce a review item instead of an `escalation` item.** The distinct
  `escalation` kind and result status disappear; the human sees a review item saying no agent
  with that role was available. Same human, same thread, one fewer code path.
- **No handoff/transition entries in `tasks.auditTrail`.** Nothing read them; the column keeps
  existing (work-owned) until `work`'s own audit decides its fate.
- **If the fold-into-`work` recommendation lands**, the `@hyperidle/policy` package, its barrel,
  and the Mechanism-C port ceremony go with it; `registerPolicy` becomes a `work` registration.
  Until then the package survives at 3 functions with the "policy" name actively misdescribing
  what it does.
