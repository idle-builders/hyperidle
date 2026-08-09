# Bets: Shape, Commit, Change, Ship

The bet lifecycle, the assistant's drafting authority, and the promote-from-knowledge edge. Bet primitive shape lives in [the-five-primitives.md](./the-five-primitives.md).

## 1. Lifecycle

`BET_STATUSES = draft | active | completed | killed` (`framework/domain-model/src/types.ts`). Transitions: `draft → active` on commit (`POST /bets/:id/commit`, `layers/core-api/src/routes/bets.ts`); `active → completed | killed`; `completed` and `killed` are terminal (`layers/core-api/work/src/bet-state-machine.ts`).

There are no `shaped`, `committed`, `review`, or `shipped` statuses and no human ship gate — U1 simplified the old nine-status set to these four (`bet-state-machine.ts`).

## 2. Origination — two entry points

**Form-first (hand-typed):** the founder opens New Bet, writes goal and description, saves a `draft` bet.

**Conversation-first (AK4):** the founder describes an idea in the assistant thread and the assistant, holding `create_bet`/`edit_bet` as ordinary `["assistant"]`-role-scoped tools (the same full tool surface as every other agent kind, AU27), can draft a bet in the thread. **Currently non-functional:** `create_bet` requires a resolvable `teams.id`, which the assistant's calling thread cannot supply — re-providing that capability is a later WP. Until then, bets originate form-first.

Both paths enter the lifecycle at `draft` and proceed identically. The assistant **never commits a bet** — commit is always a human action. A draft the assistant created is as editable, discardable, or reviewable as a hand-typed one.

**Authority boundary:** the assistant can only author or update a `draft` bet, never commit or kill one. The AI recommends and drafts; the human decides the irreversible.

## 3. Shape

Shaping happens before commitment. The draft describes what success looks like — goal, done condition, appetite — not what tasks will produce it.

### 3.1 Promote a knowledge item into a bet (AK5)

Captured knowledge can seed a bet directly without retyping. From a knowledge item's overflow menu (`···`), **Promote to bet**: the item's body becomes the bet's description, pre-loaded into the bet authoring surface. Single-team setups promote in one click; multi-team setups route through `/work/bet/new?fromKnowledge=` to pick a team first.

- The source item is **not mutated or archived** — it survives promotion unchanged.
- The bet is created in `draft`; the founder reviews, refines, and commits manually. Promotion never auto-commits.
- The bet records a **provenance link** `source_knowledge_item_id` (`framework/db/src/schema.ts`). This is the forward edge — "this bet was seeded from that item" — distinct from the reverse edge (`scopeKind="bet"`), which means "this knowledge item was produced under that bet."
- A knowledge item cited as provenance cannot be hard-deleted while the link exists (`onDelete: restrict`); soft-archiving is always available.
- The bet detail header shows "From knowledge: &lt;title&gt;" linking back to the source item (`layers/core-ui/src/pages/WorkBet.tsx`).

## 4. Commit

The founder opens the bet's overflow menu (···) and chooses **Activate bet**. At that moment the bet moves `draft → active`. The task section shows "No tasks yet" — tasks are added by agents on the team as they pick up work. If the team is already at capacity, activation is rejected with an inline error explaining why.

The `done_condition` (`schema.ts`) guides what the team works toward. It is revisable during the bet (§5) but must be set before committing.

**Replanning is normal:** as work progresses, new tasks are added and stale ones retired as `killed` (`framework/domain-model/src/types.ts`). The plan is the current state of the task list, not a separate document.

## 5. Change (bets are allowed to evolve)

The single most important property of a bet is that it's allowed to change. Pretending bets never need replanning is dishonest, and "kill it and shape a new one" purism punishes learning. The discipline is the **audit trail**: every change is logged and visible. The point is not to prevent change; it's to keep change honest.

**As-built:** `done_condition`, `hypothesis`, and `appetite` are mutable on an `active` bet via `updateBetField` (`bet-state-machine.ts`). Every change appends `{field, old, new, reason, actor}` to the bet's `revision_log` (`schema.ts`). A `done_condition` change additionally emits a `done_condition_change` review item after the fact. Kill is a direct status transition to `killed`.

**Not built (recorded gap):** pre-approval review gates — PM-drafted revision threads the founder approves before a done-condition/hypothesis/appetite change applies, a drafted-kill flow with founder approval, and kill retros written into the practice. Changes today apply immediately with revision logging.

## 6. Ship

A bet is done when its **done condition is met** — not when all tasks are done. The two coincide most of the time, but when they diverge the done condition wins; teams that ship by completing the task list rather than meeting the condition are gaming themselves.

**As-built:** the bet moves `active → completed` directly (`completedAt` stamped, `bet-state-machine.ts`). Tasks have their own lifecycle including a `review` state — see [tasks-and-sessions.md](./tasks-and-sessions.md); review surfaces live in [review-primitive.md](../human-interface-layer/review-primitive.md).

**Not built (recorded gap):** a bet-level ship review — a final review thread summarizing what was done, learned, and shipped, gating `completed` on founder approval — does not exist. Retros are builtin routines, not a ship gate — see [routines-and-retros.md](./routines-and-retros.md).
