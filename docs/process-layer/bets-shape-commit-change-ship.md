## 5. Bets: Shape, Commit, Change, Ship

### 5.0 Bet origination — two entry points

A bet can originate in two ways:

**Form-first (hand-typed):** The founder opens the bet authoring surface directly (New Bet in the Portfolio), writes the goal and description, and saves a `draft` bet.

**Conversation-first (AK4):** The founder describes an idea in the Assistant thread. The Assistant can produce a draft bet — a goal and a concept body — directly from the conversation, surfaced as a `BetCard` in the thread. The founder reviews the draft, edits it in the normal bet authoring surface (WorkBet), and commits when satisfied.

In both cases the bet enters the lifecycle at `draft` and proceeds identically from there. The Assistant **never commits a bet autonomously** — commit is always a human action (`POST /bets/:id/commit`). A draft created by the Assistant is just as editable, discardable, or reviewable as one typed by hand.

**Conversational iteration (AK4):** The founder can continue talking in the same thread to refine the draft — narrow the scope, adjust the appetite language, rewrite the done condition. The Assistant updates the *same* draft in place (one living draft per conversational thread, edited via `edit_bet`). Prior cards remain in the thread history. A second `create_bet` call in the same conversation would orphan the first draft as a stale history entry; the newest draft is always the live target.

**Authority boundary:** The Assistant can only author or update a `draft` bet. Once the founder commits it (`draft → active`), the conversational path stops targeting that bet — re-iteration in the thread would begin a new draft. The Assistant has no commit, ship, or kill tool. This is the User Sovereignty line: the AI recommends and drafts; the human decides the irreversible.

**Tool surface (AC3b):** The conversational tool-use loop injects a registry of exactly `[create_bet, edit_bet]` — provably no `create_team`, `add_agent`, `create_routine`, `submit_review`, `handoff_to`, commit, or kill tool. The model cannot redirect the team (server-resolved and hard-injected) or target a different bet (server-bound to the current draft).

### 5.1 Shape

Shaping happens before commitment. A Product Manager (sometimes with the assistant for portfolio-level bets) writes a pitch — problem, appetite, sketches, rabbit-hole notes, no-gos. The pitch lands on the Work view as a `shaped` card. Pitches accumulate on the canvas during the cycle; only the founder can move them into the betting zone.

Shaping is *not* decomposition. The pitch describes what success looks like, not what tasks will produce it. Decomposition happens *after* commitment.

**Promoting a knowledge item into a bet.** Captured knowledge (L2 product items, practice findings) can seed a bet directly without retyping. From any knowledge item's overflow menu (`···`), choose **Promote to bet**. The item's body becomes the bet's description, pre-loaded into the normal bet authoring surface (AG3 full-page editor). Single-team setups promote in one click. Multi-team setups route through the bet create page (`/work/bet/new?fromKnowledge=`) where you pick a team before creating.

The source knowledge item is **not mutated or archived** — it survives promotion unchanged. The new bet is created in `draft` status; the founder reviews, refines, and commits manually (User Sovereignty: promotion never auto-commits). The bet records a **provenance link** (`source_knowledge_item_id`) back to the item, so the origin is always recoverable. The link is one-directional and forward: it captures "this bet was seeded from that item" — it is distinct from the reverse link (`scopeKind="bet"`) which means "this knowledge item was produced under that bet."

Provenance constraint: a knowledge item cited as provenance cannot be hard-deleted while the link exists (`onDelete: restrict`). Soft-archiving the item is always available.

The provenance link appears in the bet detail header as "From knowledge: &lt;title&gt;" with a link back to the source item.

### 5.2 Commit

The founder commits a bet from the bet detail view. At that moment:

1. The bet moves from `draft` to `active`.
2. The Kernel emits `work_decompose_requested` and asks the active Strategy which agent decomposes the bet and whether it provides a pre-computed task breakdown. With the current Minimal and Fabric Strategies the Kernel runs a PM agent turn that reads the bet's goal and done condition and produces a task breakdown.
3. The bet's task section shows "Planning the work" while decomposition runs. Tasks appear as soon as the PM agent finishes.

Commit is a **human verdict that obliges the system to start work**. It is the handoff from shaping to doing. After commit, every active bet has either a task breakdown or an explicit, visible reason why one couldn't be produced — there is no "work will start eventually" limbo.

The `done_condition` guides what the PM agent produces. It is revisable during the bet (see §5.4) but must be set before committing.

### 5.3 Decompose (v1: PM agent; destination: decentralized by the team)

**As-built (v1):** When a bet is committed, the Kernel emits `work_decompose_requested` and calls the active Strategy's `decomposeBet` port method (AK8) — which returns the decomposer agent id and an optional task list. With the Minimal and Fabric Strategies, `decomposeBet` returns `tasks: []`, so the Kernel runs a PM agent turn: a task-free session where the agent reads the bet's goal and done condition and returns a structured task breakdown. The Kernel inserts these as tasks; **owner assignment routes through the active Strategy's `selectAgent` port method** (AK7): the Kernel enumerates eligible team candidates and asks the Strategy which agent takes each task. Each task is immediately accepted, which triggers the existing task → session dispatch path. No human approves the initial breakdown; the founder sees it on the bet surface after the fact.

The PM agent's context comes through the active Strategy port (`assembleContext`). Under the Minimal Strategy the PM decomposes from the bet alone (no additional knowledge). Under the Fabric it receives practice context that can sharpen the breakdown. A future richer Strategy may return a pre-computed task list from `decomposeBet.tasks` directly, skipping the PM turn entirely.

**Terminal outcomes (closed set):** decomposition always ends in one of two states:

- **`done`** — ≥1 task was produced and accepted; agents begin sessions.
- **`blocked`** — the PM couldn't produce a breakdown. Two reasons:
  - `no_eligible_agent` — the team has no active AI agent capable of owning tasks. The bet surface shows "No one can take this work" with a link to add an agent to the team.
  - `empty` / `failed` — the PM produced nothing or the turn failed. The bet surface shows "Couldn't plan the work" with a prompt to try committing again.

There is no third outcome. A bet that has been active for more than the decomposition window has either tasks or a visible blocker — the permanent "Tasks will appear here once agents start work" promise over an empty list is forbidden.

**Crash safety:** if the server process dies during decomposition, a boot-time sweep resolves any in-flight bet to `blocked/failed`. The UI never shows a perpetual "Planning the work" state.

**Idempotency:** the `draft→active` transition triggers decomposition at most once per bet. Duplicate events are dropped by a CAS guard on the `decompositionStatus` column.

**Destination (decentralized):** the v1 centralized model is a deliberate stepping stone. The goal described in `decomposition-practice-grounded-decentralized.md` — each team member decomposes their own stream using practice knowledge, the PM integrates — is still the intended destination. v1 ships the smallest real seam that makes commit load-bearing; the decentralized model requires practice knowledge (L3) to be populated, which is a separate workpackage. When the decentralized model ships, `decompositionStatus` and the dispatch path remain; only the decomposition source changes.

Replanning is normal: as work progresses, the PM proposes new tasks (`proposed`), retires stale ones (`killed`), and revises dependencies. The plan is the current state of the task list, not a separate document.

### 5.4 Change (bets are allowed to evolve)

The single most important property of a bet is that it's allowed to change. Pretending bets never need replanning is dishonest, and the Shape Up purist position ("kill it and shape a new one") punishes learning.

So bets can change, with discipline:

- **Done condition revision** — the team realizes the original done condition was wrong (premise broken, scope discovered larger, scope discovered smaller). The Product Manager drafts the revision and the *reasoning*, posts it as a review thread to the founder. Founder approves, comments, requests changes, or rejects (in which case the bet continues toward the original done condition or gets killed). Approved revisions are appended to `revision_log` with timestamp and reasoning.
- **Hypothesis revision** — same mechanism. Changing the hypothesis is changing what we believe will be true after this. Often a sign the bet should pivot.
- **Task graph changes** — internal to the team. The Product Manager handles these without human review unless they're large enough to bump the bet against its appetite.
- **Appetite revision** — extending or contracting the timebox. Always a human review item. Extending is a smell; killing is often the right answer instead.
- **Kill** — sometimes the right answer is to abandon the bet. The Product Manager drafts the kill with reasoning, posts to the founder, and on approval the bet moves to `killed`. The team writes a kill retro into the practice (failures teach more than successes).

The discipline is the *audit trail*. Every change is reviewed and logged. Changes are visible. The point is not to prevent change; it's to keep change honest.

### 5.5 Ship

A bet ships when its done condition is met *and* its high-risk artifacts have passed review.

1. Tasks transition through `in_progress` → `review` → `done`. Tasks tagged risk-tier ≥ medium produce a review thread when they hit `review` (per `HUMAN_INTERFACE_LAYER.md` §7 routing rules).
2. When all tasks are `done` and the Product Manager confirms the done condition is met, the bet transitions to `review`.
3. The bet itself produces a final review thread to the founder summarizing what was done, what was learned, and what artifacts shipped.
4. On founder approval, the bet moves to `shipped`. The team is between bets. The retro process begins (§11).

Shipping is not "all tasks done" — it's "the done condition is met." The two should be the same most of the time, but when they diverge the done condition wins. Teams that ship by completing the task list rather than meeting the condition are gaming themselves.

---
