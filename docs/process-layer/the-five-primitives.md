## 3. The Five Primitives

The process layer rests on five primitives. Everything else in this doc is mechanics on top of these.

**Producer rule for Artifacts.** Tasks are the unique producers of Artifacts (the cross-domain primitive defined in `HUMAN_INTERFACE_LAYER.md` §4.5 — *every output an artifact*). Bets, Products, Portfolios, Teams, and Routines do **not** produce Artifacts; Bet/Product/Portfolio surfaces aggregate Artifacts from their Tasks for display. A Routine that runs work produces its Artifacts via the Task it spawns. Sessions contribute the `cost_from_session` field on the Artifact but do not own it (the producing Task does).

### 3.1 Bet

A shaped, committed, time-boxed unit of work owned by a team. Has an explicit done condition. Lives on the Work view before commitment, becomes an active record after.

```
Bet {
  id
  product            # which product this bet belongs to
  team               # the persistent team for that product
  pitch              # the original shaped pitch (markdown + sketches)
  cost_appetite      # Money — cap on total spend for this bet (see §10)
  token_appetite?    # optional TokenUsage — cap on token spend, broken down by tier
  done_condition     # explicit, set at commit, revisable with audit
  hypothesis         # what we believe will be true after this
  status         # current progress: figuring it out / making it happen
  tasks              # list of Task IDs (decentralized, decomposition is dynamic)
  routines_active?   # any recurring routines spawned by this bet
  status             # shaped | committed | in_progress | shipped | killed
  artifacts          # AGGREGATED Artifact references (read-only; the Bet does not own
                     # Artifacts — they root on Tasks per the Artifact primitive,
                     # `HUMAN_INTERFACE_LAYER.md` §4.5. The Bet view aggregates
                     # Artifacts from its Tasks for display.)
  thread             # the bet-level conversation thread (optional)
  revision_log       # every change to done_condition or hypothesis, with reasoning
  created_at
  shipped_at?
}
```

A bet is *not* a workflow. It does not encode a sequence of steps. It encodes a *commitment* and the *minimum structure to keep the team honest about it*.

**No duration budget axis on a bet.** The appetite is a Money cap (and optionally a TokenUsage cap), never a wall-clock-time cap. `created_at` and `shipped_at` are recorded for telemetry and retros; their delta is informational only. See §10 for the full Appetite/Budget/Cost spec, including the rationale for why duration is not a budget axis and the anti-pattern rule that rejects any future "duration cap" proposal. The `Money` and `TokenUsage` shapes are defined in `docs/process-layer/canonical-shapes.md`.

### 3.2 Task

A unit of work picked up by an agent. First-class object with state, owner, dependencies, done condition, cost cap, **Artifact references** (Tasks are the unique producers of Artifacts — see Artifact primitive in `HUMAN_INTERFACE_LAYER.md` §4.5), and one or more agent sessions attached.

```
Task {
  id
  bet                # parent bet
  product
  team
  owner              # the agent currently responsible (can change via handoff)
  title
  description        # what success looks like
  done_condition     # task-level, explicit
  state              # proposed | accepted | hold | in_progress | blocked | review | done | killed
  dependencies       # list of Task IDs that must reach `done` first
  sessions           # list of Session IDs — see §3.3
  thread?            # optional discussion thread (only if there's something to talk about)
  artifacts          # list of Artifact IDs the Task has produced. Tasks are the
                     # unique producers of Artifacts (Artifact primitive,
                     # `HUMAN_INTERFACE_LAYER.md` §4.5). Underlying file/diff
                     # storage is a detail of the Artifact, not of the Task.
  cost_cap           # Money — max spend on this task (see canonical-shapes.md)
  cost_actual        # Money — running total of session costs rolled up
  token_cap?         # optional TokenUsage — cap on tokens, broken down by tier
  tokens_actual      # TokenUsage — running total, broken down by tier
  durability?        # null | "checkpoint" | "temporal" | ... — opt-in per task
  risk_tier          # low | medium | high — controls review behavior on completion
  attention_score    # numeric, used for prioritization
  created_at
  updated_at
}
```

A task has no duration cap. `created_at` / `updated_at` are informational; the budget axes are Money and TokenUsage only.

The thread on a task is optional. Most tasks don't need one. Threads (chat threads) exist *when there's something to discuss* — a question, a handoff conversation, a clarification, a review. The thread is *attached to* the task, not the same as it. This separates the conversation about the work from the state of the work.

### 3.3 Session

A single agent's run on a task. A task can have many sessions over its lifetime — one agent does an hour of work, hands back, another agent picks it up later, the original agent comes back, etc.

```
Session {
  id
  task               # parent task
  agent              # which agent identity
  started_at
  ended_at?
  state              # active | paused | done | crashed
  sandbox_snapshot # pointer to the workspace state at session start
  events             # event stream for this session (for durability replay if enabled)
  cost               # Money — what this session spent (see canonical-shapes.md)
  tokens             # TokenUsage — prompt/completion split per tier used in this session
  outcome            # made_progress | blocked | completed | handoff | escalated
  notes              # what the agent did, in its own words, written into its memory
}
```

Sessions are how we get **resumability without locking the model into a single long-running process**. A task can be picked up across days. The agent's memory persists between sessions through L2 (its private memory) and the practice (L3). The session is the contract between the task and the durability layer: if a task is `durability: temporal`, then each session is a Temporal workflow execution; if it's null, sessions are just bounded runs with no replay guarantee.

`started_at` and `ended_at` exist for telemetry and retros; their delta is informational. The session's budget posture is Money + TokenUsage only — see §10.

### 3.4 Team

A small group of agents bound to a **product**, not to a single bet. Teams persist for the life of the product. They pick up successive bets, accumulate muscle memory, and dissolve only when the product itself is killed.

```
Team {
  id
  product
  members            # list of agent identities
  lead               # the agent that escalations route to first (typically the Product Manager)
  capacity           # max parallel bets, max parallel tasks per member, daily_cost_cap (Money), optional daily_token_cap (TokenUsage)
  active_bets        # list of currently active bets — usually one, sometimes more
  bets_shipped       # history
  formed_at
  dissolved_at?
}
```

This is the most important deviation from how most agent frameworks think about teams. Frameworks like CrewAI form a Crew per task. We form a Team per product, and the team picks up tasks-via-bets over its lifetime. The reason: **teams that ship together accumulate context**. The brand-voice agent on the Ambrovia team has read every Ambrovia copy artifact for six months. That context is the entire reason it's better than a fresh agent. Dissolving it after one bet throws all of that away.

A team can have agents from multiple practices. The Ambrovia team might include a Product Manager, a Writer, a Copy Reviewer, a Frontend Builder, a Backend Builder, a Growth Analyst — each rooted in their own practice (L3), but operating together as the Ambrovia team. They share the bet, they share file leases on artifacts, they coordinate via threads.

### 3.5 Routine

A recurring trigger attached to a named agent, with persistent state across runs. Calendar-shaped, event-shaped, or heartbeat-shaped.

```
Routine {
  id
  owner              # the named agent that owns this routine
  trigger            # cron expression | event pattern | heartbeat interval
  skill              # the skill to invoke
  done_condition     # what counts as a successful run
  state_key          # how the routine remembers what it did last time
  delegation_allowed # bool — can a teammate with the right skill pick it up if owner is overloaded?
  human_review       # bool — does each run produce a review thread, or is it autonomous?
  autonomy_level     # L1-L4, same scale as skills
  active             # bool
  created_at
  last_run_at?
  next_run_at?
  history            # link to past runs
}
```

The owner is a named agent with persistent state. The Growth Practice Facilitator owns "weekly metrics review." That doesn't mean the GPF runs it every time — it means the GPF holds the *thread of memory* across runs. If the GPF is overloaded and `delegation_allowed: true`, a teammate with the metrics-review skill can pick it up and write back into the GPF's memory state. The muscle memory ("the Growth PF owns metrics") is preserved; the execution can flex.

### 3.6 Why these five and not more

We deliberately don't have:

- **Workflow** — there are no DAGs. Sequences emerge from task dependencies.
- **Plan** — plans are just the current state of a bet's task list. They change.
- **Crew/Squad** — collapsed into Team.
- **Job** — collapsed into Routine.
- **Run** — collapsed into Session.

If something doesn't fit one of these five primitives, the right move is usually to *not build it*, not to add a sixth primitive.

---
