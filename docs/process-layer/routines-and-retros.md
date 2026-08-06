# Routines and Retros

<!-- @source framework/db/src/schema.ts -->
<!-- @source layers/core-api/routine/src/routine-scheduler.ts -->

Routines attach recurring work to a team: "retro every time a bet closes," "monthly portfolio review," "daily knowledge sweep." They live in the `routines` table (`framework/db/src/schema.ts`) and fire from the in-process scheduler (`layers/core-api/routine/src/routine-scheduler.ts`). Retros are not a separate mechanism — **every retro is a built-in routine**, seeded per team from the same specs as everything else; the builtin defaults and their handlers live with the scheduler in `layers/core-api/routine/src/routine-scheduler.ts`.

For the Routine primitive's place among the five, see [The five primitives](./the-five-primitives.md).

## 1. Trigger shapes

The scheduler handles four `triggerType` values (`routine-scheduler.ts`):

- **Calendar** — cron expressions, parsed by the in-house matcher (`parseCron` / `nextCronMatch`). Note the matcher uses AND semantics when both day-of-month and day-of-week are restricted — deliberately non-POSIX, load-bearing for the first-Monday portfolio retro cron (`0 10 1-7 * MON`).
- **Event** — fires when a matching event type is emitted, e.g. `bet_state_changed` triggers the post-bet retro.
- **Heartbeat** / **continuous** — low-frequency interval loops; the scheduler treats the two values identically.

## 2. Ownership, memory, delegation

Every routine has a NOT-NULL owner agent and a NOT-NULL team (`schema.ts`) — routines are always team-scoped. The owner holds the routine's thread of memory via `stateKey` (`schema.ts`): what it noticed last run, what it's watching.

`delegationAllowed` (default false, `schema.ts`) governs whether a run can flex to another agent: when the owner is at its WIP limit, the scheduler looks for a delegate with the routine's skill (`routine-scheduler.ts`); if delegation is off or no delegate exists, the run is deferred. All builtins seed `delegationAllowed: false`.

## 3. Silent runs

A routine can run memory-only: `routines.silent` (`schema.ts`, policy in `layers/core-api/notifications/src/silence-policy.ts`) suppresses thread/item output so an agent stays current on context without producing anything for a human to look at. The knowledge-decay builtin runs silent — a daily sweep would otherwise flood the surface. Knowledge-promotion deliberately does **not** run silent: promotions emit `knowledge_updated` events that triage consumers need.

## 4. Human review is per-run and opt-in

Review is the `humanReview` boolean on the routine (`schema.ts`): when true, each run produces a review item alongside its session (`routine-scheduler.ts`). There is no autonomy ladder on routines — trust gating lives elsewhere, see [Review primitive](../human-interface-layer/review-primitive.md).

Creating a routine is ungated: agents create routines directly via the `create_routine` tool (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts`) and `POST /routines` activates immediately. No approval step — consistent with ETHOS §2 (trust agents; security is earned, never preemptive).

Routines surface in the **Work view** (`layers/core-ui/src/pages/WorkRoutine.tsx`), with lifecycle `state` active | paused | error and soft-delete via `deletedAt` (`schema.ts`).

## 5. The four builtins

Seeded per team through `provisionTeamRoutines` (idempotent `onConflictDoNothing`; owners resolved from the team's roster by role, AF17), against the builtin defaults. IDs carry the reserved `builtin:` prefix — load-bearing for the manual-trigger API.

| Routine | Owner role | Trigger | humanReview | silent | Done condition |
|---|---|---|---|---|---|
| `builtin:post-bet-retro` | product_manager | event `bet_state_changed` | **yes** | no | Review item comparing hypothesis vs reality written |
| `builtin:portfolio-retro` | assistant | cron `0 10 1-7 * MON` (first Monday, 10:00 UTC) | **yes** | no | Cross-product portfolio review item written |
| `builtin:knowledge-decay` | facilitator | cron `0 2 * * *` (daily 02:00 UTC) | no | **yes** | Stale knowledge items transitioned |
| `builtin:knowledge-promotion` | facilitator | cron `0 3 * * *` (daily 03:00 UTC, offset from decay) | no | no | Provisional items meeting repetition threshold promoted |

## 6. Retros: learning flows back up

Every closed bet produces learning. The process layer's job is to capture it and route it to the right place.

### 6.1 Bet retro — every completion or kill

When a bet reaches `completed` or `killed` (lifecycle owned by [Bets](./bets-shape-commit-change-ship.md)), `builtin:post-bet-retro` fires on the `bet_state_changed` event. The Product Manager compares hypothesis against reality: did it hold, what surprised us, what patterns should the practice know, what rules should change, what artifacts are reusable. The run is `humanReview: true` — the retro lands as a review item for the founder's verdict. Because the routine is provisioned automatically for every team, retros cannot be skipped; they are the bottom-up signal path. Without them the team learns in its own memory but the practice and the founder don't, and the next bet repeats the same mistakes.

### 6.2 Portfolio retro — monthly

`builtin:portfolio-retro`, assistant-owned, fires on the first Monday of each month and writes a cross-product review item: cross-product patterns, recurring obstacles, and capacity observations.

### 6.3 Practice contribution loop — continuous, agent-driven

The biggest learning channel isn't retros — it's the continuous contribution every agent makes to its practice. There is no meeting: agents capture findings into their practice as they work, each landing as a provisional knowledge item. `builtin:knowledge-promotion` (facilitator-owned, daily) promotes the provisional items that meet the repetition threshold into practice knowledge (L3); `builtin:knowledge-decay` retires what has gone stale. Layer taxonomy: [The five layers](../knowledge-architecture/the-five-layers.md).

The loop closes through context assembly: the next task session's sandbox is assembled fresh from the canonical `knowledge_items` store, so anything the practice decided is simply *there* — `context/product/` and `context/practices/` — with no broadcast notification needed. See [knowledge movement](../knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md). Every team member is also a practice member, so the team stays current on its practice by construction.

Item lifecycle (captured → active) and the promotion pipeline are owned by [Facilitators](../knowledge-architecture/facilitators.md).

### 6.4 Human curation — weekly, async

Humans prune and shape what the practices produce through the Knowledge view — the recurring counterweight to AI-only drift. Agents contribute and discuss; humans prune and shape. Surface: [Knowledge view](../information-architecture/knowledge-view.md).
