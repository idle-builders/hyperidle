# Bets: Shape, Commit, Change, Ship

The bet lifecycle, the assistant's drafting authority, the promote-from-knowledge edge, and decomposition — as built, plus the labelled destination. Bet primitive shape lives in [the-five-primitives.md](./the-five-primitives.md).

## 1. Lifecycle

`BET_STATUSES = draft | active | completed | killed` (`packages/shared/src/types.ts:92`). Transitions: `draft → active` on commit (`POST /bets/:id/commit`, `packages/server/src/routes/bets.ts:735`); `active → completed | killed`; `completed` and `killed` are terminal (`packages/server/src/services/bet-state-machine.ts:39-40`).

There are no `shaped`, `committed`, `review`, or `shipped` statuses and no human ship gate — U1 simplified the old nine-status set to these four (`bet-state-machine.ts:33-35`).

## 2. Origination — two entry points

**Form-first (hand-typed):** the founder opens New Bet, writes goal and description, saves a `draft` bet.

**Conversation-first (AK4):** the founder describes an idea in the assistant thread. The assistant produces a draft bet — goal plus concept body — surfaced as a `BetCard` in the thread. The founder edits it in the normal bet authoring surface (`WorkBet`) and commits when satisfied.

Both paths enter the lifecycle at `draft` and proceed identically. The assistant **never commits a bet** — commit is always a human action. A draft the assistant created is as editable, discardable, or reviewable as a hand-typed one.

**Conversational iteration:** continued talk in the same thread refines the *same* draft in place — one living draft per conversational thread, edited via `edit_bet`. Prior cards remain in thread history; the newest draft is always the live target. A second `create_bet` in the same conversation orphans the first draft as a stale history entry.

**Authority boundary:** the assistant can only author or update a `draft` bet. Once committed (`draft → active`), the conversational path stops targeting that bet — further iteration in the thread begins a new draft. The assistant has no commit or kill tool. The AI recommends and drafts; the human decides the irreversible.

**Tool surface (AC3b):** the conversational tool-use loop injects a registry of exactly `[create_bet, edit_bet]` (`packages/server/src/tools/assistant-draft-registry.ts`) — provably no `create_team`, `add_agent`, `create_routine`, `submit_review`, `handoff_to`, commit, or kill tool. `teamId` is server-resolved and hard-injected (the model cannot redirect the team); `edit_bet`'s `betId` is server-bound to the current draft (the model cannot target a different bet).

## 3. Shape

Shaping happens before commitment and is *not* decomposition. The draft describes what success looks like — goal, done condition, appetite — not what tasks will produce it. Decomposition happens after commit.

### 3.1 Promote a knowledge item into a bet (AK5)

Captured knowledge can seed a bet directly without retyping. From a knowledge item's overflow menu (`···`), **Promote to bet**: the item's body becomes the bet's description, pre-loaded into the bet authoring surface. Single-team setups promote in one click; multi-team setups route through `/work/bet/new?fromKnowledge=` to pick a team first.

- The source item is **not mutated or archived** — it survives promotion unchanged.
- The bet is created in `draft`; the founder reviews, refines, and commits manually. Promotion never auto-commits.
- The bet records a **provenance link** `source_knowledge_item_id` (`packages/db/src/schema.ts:194`). This is the forward edge — "this bet was seeded from that item" — distinct from the reverse edge (`scopeKind="bet"`), which means "this knowledge item was produced under that bet."
- A knowledge item cited as provenance cannot be hard-deleted while the link exists (`onDelete: restrict`); soft-archiving is always available.
- The bet detail header shows "From knowledge: &lt;title&gt;" linking back to the source item (`packages/web/src/pages/WorkBet.tsx:1063`).

## 4. Commit

The founder commits from the bet detail view. At that moment:

1. The bet moves `draft → active`.
2. The Kernel emits `work_decompose_requested` and asks the active Strategy which agent decomposes the bet and whether it provides a pre-computed task breakdown.
3. The bet's task section shows "Planning the work" while decomposition runs; tasks appear as soon as it finishes.

Commit is a **human verdict that obliges the system to start work**. After commit, every active bet has either a task breakdown or an explicit, visible reason why one couldn't be produced — no "work will start eventually" limbo.

The `done_condition` (`schema.ts:140`) guides what decomposition produces. It is revisable during the bet (§6) but must be set before committing.

## 5. Decompose (v1: centralized PM turn)

**As-built:** on `draft → active` the Kernel emits `work_decompose_requested` and calls the active Strategy's `decomposeBet` port method (AK8, `packages/shared/src/strategy-port.ts:254`), which returns the decomposer agent id and an optional task list. Minimal and Fabric Strategies return `tasks: []`, so the Kernel runs a PM agent turn — a task-free session where the agent reads the bet's goal and done condition and returns a structured task breakdown (`packages/server/src/services/bet-decomposition.ts:272-308`). The Kernel inserts the tasks; **owner assignment routes through the Strategy's `selectAgent` port** (AK7, `strategy-port.ts:360`): the Kernel enumerates eligible team candidates and the Strategy picks the owner for each task. Each task is immediately accepted, triggering the task → session dispatch path (see [tasks-and-sessions.md](./tasks-and-sessions.md)). No human approves the initial breakdown; the founder sees it on the bet surface after the fact.

The PM agent's context comes through the Strategy port (`assembleContext`). Under the Minimal Strategy the PM decomposes from the bet alone; under the Fabric it receives practice context. A richer Strategy may return a pre-computed task list from `decomposeBet.tasks` directly, skipping the PM turn.

**Terminal outcomes — a closed set:**

- **`done`** — ≥1 task produced and accepted; agents begin sessions.
- **`blocked`** — no breakdown, with a visible reason:
  - `no_eligible_agent` — no active AI agent on the team can own tasks. UI: "No one can take this work", with a link to add an agent.
  - `empty` / `failed` — the PM produced nothing or the turn failed. UI: "Couldn't plan the work", with a prompt to re-commit.

There is no third outcome. A permanent "Tasks will appear here once agents start work" promise over an empty list is forbidden.

**Crash safety:** a boot-time sweep resolves any decomposition orphaned mid-flight (`decompositionStatus='running'`) to `blocked/failed` (`bet-decomposition.ts:217-236`). The UI never shows a perpetual "Planning the work".

**Idempotency:** `draft → active` triggers decomposition at most once per bet — a CAS guard on `decompositionStatus` (NULL→`'running'`, `bet-decomposition.ts:317-327`) drops duplicate events.

**Replanning is normal:** as work progresses, new tasks are added as `proposed` and stale ones retired as `killed` (`packages/shared/src/types.ts:10-19`). The plan is the current state of the task list, not a separate document.

## 5a. Destination: practice-grounded, decentralized decomposition (not built)

The v1 centralized model is a deliberate stepping stone — the smallest real seam that makes commit load-bearing. The intended destination:

**Each agent decomposes their own stream.** On commit, every team member reads the bet's goal and done condition and independently proposes the tasks in their work stream, using their practice (L3) as the source of decomposition patterns — the practice layer is not just a wiki, it's what tells each discipline what tasks this kind of work typically involves (see [the-five-layers.md](../knowledge-architecture/the-five-layers.md)).

**The PM integrates**, never authors: identifies dependencies between members' tasks, spots gaps, spots overlap, confirms the integrated list reaches the done condition. If the PM must add tasks the team didn't propose, that's a signal the team's practice knowledge is missing something — the missing piece becomes a Practice item to capture.

**Why it matters:** centralized planning fails two ways — the planner doesn't know the discipline well enough to decompose accurately, or it over-decomposes into a bureaucratic list nobody can work from. Decentralized specialists plus an integrator matches how flat teams actually work.

**When a replanning shift surfaces to the founder** is the PM's judgement call — deliberately no numerical threshold (settled decision, recorded in [handoff-and-lifecycle-propagation.md](./handoff-and-lifecycle-propagation.md)). The mechanism (PM-drafted review threads for trajectory shifts) is unbuilt.

**Prerequisite:** L3 practice knowledge populated — a separate workpackage. When the decentralized model ships, `decompositionStatus` and the dispatch path survive; only the decomposition source changes.

## 6. Change (bets are allowed to evolve)

The single most important property of a bet is that it's allowed to change. Pretending bets never need replanning is dishonest, and "kill it and shape a new one" purism punishes learning. The discipline is the **audit trail**: every change is logged and visible. The point is not to prevent change; it's to keep change honest.

**As-built:** `done_condition`, `hypothesis`, and `appetite` are mutable on an `active` bet via `updateBetField` (`bet-state-machine.ts:251-295`). Every change appends `{field, old, new, reason, actor}` to the bet's `revision_log` (`schema.ts:145`). A `done_condition` change additionally emits a `done_condition_change` review item after the fact. Kill is a direct status transition to `killed`.

**Not built (recorded gap):** pre-approval review gates — PM-drafted revision threads the founder approves before a done-condition/hypothesis/appetite change applies, a drafted-kill flow with founder approval, and kill retros written into the practice. Changes today apply immediately with revision logging.

## 7. Ship

A bet is done when its **done condition is met** — not when all tasks are done. The two coincide most of the time, but when they diverge the done condition wins; teams that ship by completing the task list rather than meeting the condition are gaming themselves.

**As-built:** the bet moves `active → completed` directly (`completedAt` stamped, `bet-state-machine.ts:140`). Tasks have their own lifecycle including a `review` state — see [tasks-and-sessions.md](./tasks-and-sessions.md); review surfaces live in [review-primitive.md](../human-interface-layer/review-primitive.md).

**Not built (recorded gap):** a bet-level ship review — a final review thread summarizing what was done, learned, and shipped, gating `completed` on founder approval — does not exist. Retros are builtin routines, not a ship gate — see [routines-and-retros.md](./routines-and-retros.md).
