# Routines and Retros

<!-- @source packages/db/src/schema.ts -->
<!-- @source packages/server/src/app-runtime/services/routine-scheduler.ts -->
<!-- @source packages/server/src/app-runtime/services/builtin-routines.ts -->
<!-- @source packages/server/src/app-runtime/services/practice-meeting.ts -->

Routines attach recurring work to a team: "weekly practice meeting," "retro every time a bet closes," "monthly portfolio review." They live in the `routines` table (`packages/db/src/schema.ts:294`) and fire from the in-process scheduler (`packages/server/src/app-runtime/services/routine-scheduler.ts`). Retros are not a separate mechanism — **every retro is a built-in routine**, seeded per team from the same specs as everything else (`packages/server/src/app-runtime/services/builtin-routines.ts`).

For the Routine primitive's place among the five, see [The five primitives](./the-five-primitives.md).

## 1. Trigger shapes

The scheduler handles four `triggerType` values (`routine-scheduler.ts:313`, `:547`):

- **Calendar** — cron expressions, parsed by the in-house matcher (`parseCron` / `nextCronMatch`). Note the matcher uses AND semantics when both day-of-month and day-of-week are restricted — deliberately non-POSIX, load-bearing for the first-Monday portfolio retro cron (`0 10 1-7 * MON`).
- **Event** — fires when a matching event type is emitted, e.g. `bet_state_changed` triggers the post-bet retro.
- **Heartbeat** / **continuous** — low-frequency interval loops; the scheduler treats the two values identically.

Cost-burn checking is **not** a routine: `builtin:cost-sentinel` was removed and the sentinel is plain application code (AD8c, `packages/server/src/app-runtime/services/cost-sentinel.ts`) — see [WIP and cost limits](./wip-and-cost-limits.md).

## 2. Ownership, memory, delegation

Every routine has a NOT-NULL owner agent and a NOT-NULL team (`schema.ts:302`, `:313`) — routines are always team-scoped. The owner holds the routine's thread of memory via `stateKey` (`schema.ts:320`): what it noticed last run, what it's watching.

`delegationAllowed` (default false, `schema.ts:326`) governs whether a run can flex to another agent: when the owner is at its WIP limit, the scheduler looks for a delegate with the routine's skill (`routine-scheduler.ts:416`); if delegation is off or no delegate exists, the run is deferred. All builtins seed `delegationAllowed: false`.

## 3. Silent runs

A routine can run memory-only: `routines.silent` (`schema.ts:334`, policy in `packages/server/src/app-runtime/services/silence-policy.ts`) suppresses thread/item output so an agent stays current on context without producing anything for a human to look at. The knowledge-decay builtin runs silent — a daily sweep would otherwise flood the surface. Knowledge-promotion deliberately does **not** run silent: promotions emit `knowledge_updated` events that triage and git-export consumers need.

## 4. Human review is per-run and opt-in

Review is the `humanReview` boolean on the routine (`schema.ts:332`): when true, each run produces a review item alongside its session (`routine-scheduler.ts:452`). There is no autonomy ladder on routines — trust gating lives elsewhere, see [Review primitive](../human-interface-layer/review-primitive.md).

Creating a routine is ungated: agents create routines directly via the `create_routine` tool (`packages/server/src/tools/create-routine.ts`) and `POST /routines` activates immediately. No approval step — consistent with ETHOS §2 (trust agents; security is earned, never preemptive).

Routines surface in the **Work view** (`packages/web/src/pages/WorkRoutine.tsx`), with lifecycle `state` active | paused | error and soft-delete via `deletedAt` (`schema.ts`).

## 5. Per-routine cost caps

Each routine can carry `costCapPerRunMinor` (AA2) and `costCapMonthlyMinor` (AA3) (`schema.ts:358`, `:360`). The scheduler refuses to fire when the monthly cap is reached (`routine-scheduler.ts:394-407`). Cap grammar and the money-not-duration doctrine are owned by [WIP and cost limits](./wip-and-cost-limits.md).

## 6. The five builtins

Seeded per team by `provisionTeamRoutines` (`builtin-routines.ts:260`, idempotent `onConflictDoNothing`; owners resolved from the team's roster by role, AF17). IDs carry the reserved `builtin:` prefix — load-bearing for the manual-trigger API.

| Routine | Owner role | Trigger | humanReview | silent | Done condition |
|---|---|---|---|---|---|
| `builtin:practice-meeting` | facilitator | cron `0 10 * * MON` (weekly Mon 10:00 UTC) | no | no | 3-turn practice meeting anchor created |
| `builtin:post-bet-retro` | product_manager | event `bet_state_changed` | **yes** | no | Review item comparing hypothesis vs reality written |
| `builtin:portfolio-retro` | assistant | cron `0 10 1-7 * MON` (first Monday, 10:00 UTC) | **yes** | no | Cross-product portfolio review item written |
| `builtin:knowledge-decay` | facilitator | cron `0 2 * * *` (daily 02:00 UTC) | no | **yes** | Stale knowledge items transitioned |
| `builtin:knowledge-promotion` | facilitator | cron `0 3 * * *` (daily 03:00 UTC, offset from decay) | no | no | Provisional items meeting repetition threshold promoted |

## 7. Retros: learning flows back up

Every closed bet produces learning. The process layer's job is to capture it and route it to the right place.

### 7.1 Bet retro — every completion or kill

When a bet reaches `completed` or `killed` (lifecycle owned by [Bets](./bets-shape-commit-change-ship.md)), `builtin:post-bet-retro` fires on the `bet_state_changed` event. The Product Manager compares hypothesis against reality: did it hold, what surprised us, what patterns should the practice know, what rules should change, what artifacts are reusable. The run is `humanReview: true` — the retro lands as a review item for the founder's verdict. Because the routine is provisioned automatically for every team, retros cannot be skipped; they are the bottom-up signal path. Without them the team learns in its own memory but the practice and the founder don't, and the next bet repeats the same mistakes.

### 7.2 Portfolio retro — monthly

`builtin:portfolio-retro`, assistant-owned, fires on the first Monday of each month and writes a cross-product review item: cross-product patterns, recurring obstacles, capacity observations, cost trends.

### 7.3 Practice contribution loop — continuous, agent-driven

The biggest learning channel isn't retros — it's the continuous contribution every agent makes to its practice. `builtin:practice-meeting` (facilitator-owned, weekly) runs the three-turn workflow implemented in `packages/server/src/app-runtime/services/practice-meeting.ts`:

1. **Turn 1 — Propose.** Every agent in the practice posts findings accumulated since the last session — each a candidate knowledge item.
2. **Turn 2 — React.** All agents comment on the full proposal set with their own context: "same thing showed up for us," "this contradicts last month," "this is product-specific."
3. **Turn 3 — Synthesize.** The facilitator decides which findings become practice knowledge (L3), which route to product knowledge (L2), which are noise, and writes the results to `knowledge_items`. Layer taxonomy: [The five layers](../knowledge-architecture/the-five-layers.md).

The loop closes through context assembly: the next task session's sandbox is assembled fresh from the canonical `knowledge_items` store, so anything the practice decided is simply *there* — `context/product/` and `context/practices/` — with no broadcast notification needed. See [knowledge movement](../knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md). Every team member is also a practice member, so the team stays current on its practice by construction.

Item lifecycle (captured → active) and the promotion pipeline are owned by [Facilitators](../knowledge-architecture/facilitators.md).

### 7.4 Human curation — weekly, async

Humans prune and shape what the practices produce through the Knowledge view — the recurring counterweight to AI-only drift. Agents contribute and discuss; humans prune and shape. Surface: [Knowledge view](../information-architecture/knowledge-view.md).
