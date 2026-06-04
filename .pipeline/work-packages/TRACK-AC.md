# Track AC: Outcome Measurement & Scoring

Close the feedback loop between work and learning. Today, HyperIdle tracks whether work ran (session outcome: completed/crashed) but not whether it achieved its goal. Bets have hypotheses and done conditions as unstructured text — but no structured outcome measurement, no verification gates, and no feedback from outcomes back into knowledge or agent configuration. This track makes measurement a first-class primitive that attaches to bets, tasks, sessions, and knowledge — enabling the system to learn from its own results.

**Inspiration:** Anthropic's Outcomes feature (separate-context evaluator with rubrics), the CLEAR framework (5-dimension enterprise scoring), Paperclip's false-success problem (agents self-certifying "done"), and the Agent Learning Flywheel (Execute → Coach → Distill → Improve).

**Concept:** This track introduces "Outcome" and "Rubric" as new primitives. Run `/concept` per workpackage at pipeline time.

**Constraint:** Measurement is progressive — workpackages add optional scoring that enhances but never blocks the existing bet/task/session lifecycle. A bet can still ship without a score; the score adds signal, not a gate (unless the team opts into verification gates via AC5). `npm run verify` must pass after each workpackage merges.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### AC1 — Structured Outcome Fields

**Workpackage.** As a founder reviewing completed work, I want bets, tasks, and sessions to carry structured outcome data — not just "completed" but whether the hypothesis held, whether the done condition was met, and what was learned — so that I can query portfolio health and the system can learn from results.

**Depends on.** None. The bet, task, and session schemas exist with text-only outcome fields.

**Complexity.** M

**Acceptance criteria.**
- Bets gain three new columns: `outcome_verdict` (enum: `hypothesis_validated | hypothesis_refuted | hypothesis_partial | inconclusive | not_evaluated`), `outcome_summary` (text — one paragraph of what actually happened vs. what was expected), and `outcome_learnings` (text — what was surprising or what should change).
- Tasks gain an `outcome` column (enum: `met_criteria | met_with_rework | partially_met | not_met | not_evaluated`) capturing whether the done condition was satisfied.
- Sessions gain an `effectiveness` column (numeric 0.0–1.0, nullable) — a score reflecting whether the session advanced its task goal, set by the review process or an evaluator agent.
- The bet detail page shows the outcome verdict, summary, and learnings in a structured "Outcome" section (not buried in a thread).
- The Work portfolio page shows an "Outcome" column with color-coded verdict badges per bet.
- All outcome fields default to `not_evaluated` — they are progressive enhancement, not a required gate.

**Validation scenarios.**
- Given a bet that ships, when the founder sets the outcome verdict to `hypothesis_validated` with a summary, then the bet detail page shows the verdict badge and summary in the Outcome section.
- Given 10 completed bets (6 validated, 2 refuted, 2 not_evaluated), when the Work portfolio page loads, then each bet shows its verdict badge and the portfolio summary shows "60% validated."
- Given a task marked `done` with outcome `met_with_rework`, when the task detail is viewed, then the outcome shows "Met with rework" indicating the task needed iteration.
- Given a session with effectiveness 0.8, when the agent profile page (AB1) aggregates session performance, then this score contributes to the agent's average effectiveness.

**Plan calls.** Standard architecture pass — schema migrations, API extensions, UI components for verdict display and input. Skip /design for the bet detail section (structured display, existing patterns). /design may be needed for the portfolio verdict column.

**Contracts / constraints.**
- Outcome fields are kernel-layer data (structural, stable) — they represent what happened, not computed scores.
- The `not_evaluated` default means existing bets/tasks/sessions are unaffected by the migration.
- Outcome verdicts are set by humans or evaluator agents — never by the bet/task state machine automatically.
- The effectiveness score on sessions is optional — null means no evaluation was performed.

**Out of scope.**
- Automatic outcome evaluation (AC3 covers evaluator agents).
- Rubric-based scoring (AC4 covers multi-dimensional rubrics).
- Verification gates (AC5 covers mandatory validation before "done").

**Effort.** M (~6h)

---

### AC2 — Bet Hypothesis Validation Flow

**Workpackage.** As a founder who shaped a bet with a hypothesis, I want a structured flow that guides me through evaluating whether the hypothesis held — comparing what we expected against what happened, recording the verdict, and extracting learnings — so that the retro process produces queryable data, not just prose in a thread.

**Depends on.**
- AC1 — Structured Outcome Fields. AC1 adds the outcome verdict, summary, and learnings columns; AC2 builds the UX flow that populates them.

**Complexity.** M

**Acceptance criteria.**
- When a bet transitions to `completed`, a "Validate Hypothesis" prompt appears in the bet detail page, guiding the founder through three steps: (1) Review — shows the original hypothesis and done condition side-by-side with the actual results (session summaries, task outcomes, artifacts produced); (2) Verdict — select an outcome verdict with a required one-paragraph summary; (3) Learnings — capture what was surprising, what should change, and what patterns emerged.
- The validation flow is optional — the bet ships whether or not the founder completes it. But an unvalidated bet shows a "Not evaluated" badge that persists.
- Completing the validation flow creates a structured retro knowledge item (kind: "retro", scope: team) with: the hypothesis, the verdict, the summary, and the learnings — queryable and promotable through the existing knowledge pipeline.
- The retro knowledge item links back to the bet via scope_id, enabling "show me all retros for this team" queries.
- An AI-assisted option: the founder can click "Draft with AI" to have a facilitator agent generate a suggested verdict, summary, and learnings based on the bet's session data and task outcomes. The founder reviews and edits before confirming.

**Validation scenarios.**
- Given a bet with hypothesis "chunked uploads reduce failure rate by 50%," when the founder completes the validation flow with verdict `hypothesis_validated`, then the bet shows a green "Validated" badge and a retro knowledge item is created with the full assessment.
- Given a completed bet where the founder skips validation, when the portfolio page loads, then the bet shows a gray "Not evaluated" badge.
- Given a founder clicks "Draft with AI," when the facilitator generates a suggested verdict, then the suggestion appears pre-filled in the form for the founder to review and edit.
- Given a retro knowledge item from a validated bet, when a facilitator scans L2 knowledge, then the retro item is eligible for promotion to L3 if patterns recur across teams.

**Plan calls.** /design needed — the three-step validation flow is a new interaction pattern. Architecture pass should design: the validation form state management, the retro knowledge item schema (kind: "retro" with structured meta fields), the AI-assisted drafting prompt, and how retro items integrate with the promotion pipeline.

**Contracts / constraints.**
- The validation flow does not block bet completion — it is post-ship reflection, not a gate.
- Retro knowledge items are standard knowledge items with kind="retro" — they use the existing knowledge pipeline, not a separate system.
- The "Draft with AI" call uses the team's Product Manager agent identity and is cost-capped.
- The original hypothesis text is immutable in the retro — it records what was predicted, not a post-hoc rationalization.

**Out of scope.**
- Automatic hypothesis validation (human judgment is required for bet-level verdicts).
- Quantitative metric collection (AC4 covers rubric-based measurement).
- Portfolio-level learning analysis (AC7 covers aggregate metrics).

**Effort.** M (~6h)

---

### AC3 — Outcome Grading (Evaluator Agent Pattern)

**Workpackage.** As a system that learns from its work, I want an independent evaluator agent to grade task and session outcomes against their done conditions — in a separate context from the producing agent — so that outcome scores are unbiased and the system can detect false-success (tasks marked "done" that didn't actually meet criteria).

**Depends on.**
- AC1 — Structured Outcome Fields. AC1 provides the fields (task outcome, session effectiveness) that the evaluator writes to.

**Complexity.** L

**Acceptance criteria.**
- When a task transitions to `review` state, an optional "outcome evaluation" routine runs: a fresh evaluator agent receives only the task's done condition, the produced artifacts/session notes, and a grading rubric — with no access to the producing agent's reasoning or session context.
- The evaluator produces a structured verdict: task outcome enum (`met_criteria | met_with_rework | partially_met | not_met`) and a brief justification (under 200 words).
- The evaluator also scores the session effectiveness (0.0–1.0) based on how directly the session advanced the task goal (high = focused progress, low = tangents or failures).
- The evaluation result is attached to the task and visible in the task detail view. The human reviewer sees the AI evaluation alongside the artifacts and can override the verdict.
- Evaluation is configurable per team: enabled/disabled via factory settings, with a default of disabled (opt-in). When enabled, evaluation runs automatically on task→review transitions.
- The evaluator detects false-success: if session notes say "I couldn't complete this" or "needs manual intervention" but the task was moved to review, the evaluator flags this as `not_met` with a clear explanation.
- Evaluation cost is tracked separately from the producing session's cost.

**Validation scenarios.**
- Given a task with done condition "API endpoint returns paginated results" and a session that produced an endpoint without pagination, when the evaluator runs, then the verdict is `partially_met` with justification "endpoint exists but pagination is not implemented."
- Given a session where the agent's notes say "I was unable to complete the file upload feature," when the evaluator runs, then the verdict is `not_met` and the false-success flag is raised.
- Given a human reviewer who disagrees with the evaluator's verdict, when they override it to `met_criteria`, then the task shows the human verdict with a note that it overrides the AI evaluation.
- Given evaluation disabled for a team, when a task transitions to review, then no evaluator runs and the task outcome field remains `not_evaluated`.

**Plan calls.** Concept work needed: "Evaluator Agent" as a specialized agent role with a specific constraint (no access to producer context). Architecture pass should design: the evaluator prompt template, the context isolation mechanism (how to strip producer reasoning from the evaluation input), the rubric format, the cost tracking separation, and the human-override data model.

**Contracts / constraints.**
- The evaluator runs in a completely separate session with its own context — it never sees the producing agent's reasoning chain, tool call history, or intermediate artifacts. Only final outputs and the done condition.
- Evaluation is asynchronous — it does not block the task→review transition.
- The evaluator uses a fixed rubric prompt, not the producing agent's soul prompt.
- Human overrides are always authoritative — the AI verdict is advisory.
- False-success detection uses keyword analysis + LLM judgment, not just pattern matching.

**Out of scope.**
- Bet-level evaluation (AC2 covers hypothesis validation with human judgment).
- Multi-dimensional rubric scoring (AC4 covers configurable rubrics).
- Continuous evaluation during sessions (this is post-session only).

**Effort.** L (~3d)

---

### AC4 — Multi-Dimensional Scoring Rubrics

**Workpackage.** As a team that works across different domains (dev, design, ops, knowledge work), I want configurable scoring rubrics with multiple dimensions — so that "quality" is measured along the axes that matter for each type of work, not reduced to a single pass/fail verdict.

**Depends on.**
- AC3 — Outcome Grading. AC3 establishes the evaluator agent pattern; AC4 adds configurable multi-dimensional rubrics that the evaluator uses.

**Complexity.** L

**Acceptance criteria.**
- Teams can define scoring rubrics with named dimensions, each carrying a weight and a scoring guide that instructs the evaluator how to assess that dimension.
- Different task types within a team can use different rubrics (e.g., code tasks scored on correctness/completeness/quality vs documentation tasks scored on accuracy/clarity/actionability).
- When the evaluator (AC3) grades a task, it scores each rubric dimension independently with a justification, then computes a weighted aggregate. A team lead can see where the task scored well vs poorly across dimensions.
- The system ships with default rubrics for common domains (development, knowledge work, operations). Teams can create custom rubrics and modify defaults.
- Rubric scores are queryable for aggregate analysis — a team lead can see which dimensions their team consistently scores low on across many tasks.
- Rubric dimension scores are stored in the strategy layer, not inline on tasks.

**Validation scenarios.**
- Given a code task evaluated with the Development rubric (5 dimensions), when the evaluation completes, then each dimension has a 0.0–1.0 score with justification, and the aggregate score is the weighted average.
- Given a team with a custom "Content Quality" rubric, when a documentation task is evaluated, then the custom rubric's dimensions are used instead of the default.
- Given 20 evaluated tasks for a team, when the team Work page is viewed, then the average per-dimension scores show the team's strengths and weaknesses across the rubric axes.
- Given a user creates a new rubric in Settings with 4 dimensions, when they save it and assign it to "design" tasks, then future design task evaluations use this rubric.

**Plan calls.** /design needed — the per-dimension score display (radar chart or bar chart) and the rubric editor in Settings are new UI surfaces. Architecture pass should design: the rubrics table schema, the dimension scoring prompt template, how rubric assignment works (task type matching), and the aggregate score computation.

**Contracts / constraints.**
- Rubrics are strategy-layer data — they configure how evaluation works, not what was produced.
- Dimension weights must sum to 1.0 within a rubric. The API validates this on create/update.
- Default rubrics are created during factory seeding — they can be modified or deleted by users.
- The scoring guide text for each dimension is included in the evaluator's prompt — it instructs the LLM how to assess that dimension.
- Aggregate scores use weighted arithmetic mean — no exotic aggregation.

**Out of scope.**
- Rubric versioning (a rubric is a configuration, not a versioned document).
- Cross-team rubric comparison.
- Automated rubric generation from task patterns.
- Calibration sets for LLM judge alignment (future workpackage).

**Effort.** L (~5d)

---

### AC5 — Verification Gates

**Workpackage.** As a team that wants quality assurance, I want tasks to require independent verification before they can reach "done" — so that agents cannot self-certify completion and the false-success problem (marking "done" without meeting criteria) is structurally prevented.

**Depends on.**
- AC3 — Outcome Grading. AC3 provides the evaluator agent that performs verification; AC5 adds the gate that requires passing verification before the state machine allows transition to "done."

**Complexity.** M

**Acceptance criteria.**
- A new task state `verified` is added between `review` and `done`: the valid transition becomes `review → verified → done`. The `review → done` direct path is removed when verification gates are enabled.
- Verification gates are configurable per team: when enabled, tasks in `review` state must receive a verification verdict of `met_criteria` (from the evaluator agent or a human reviewer) before transitioning to `verified`.
- If the verification verdict is `not_met` or `partially_met`, the task transitions back to `in_progress` with the evaluator's feedback attached as a message in the task's thread.
- A task can be manually overridden to `verified` by a human team lead, bypassing the evaluator verdict. Overrides are logged in the audit trail.
- When verification gates are disabled (default), the existing `review → done` path works unchanged — backward compatible.
- The task detail view shows the verification status: "Awaiting verification," "Verified by [evaluator/human]," or "Failed verification — returned to in-progress."

**Validation scenarios.**
- Given verification gates enabled for a team, when a task reaches `review` and the evaluator scores it `met_criteria`, then the task transitions to `verified` and then `done`.
- Given a task that the evaluator scores `not_met`, when the verdict is recorded, then the task transitions back to `in_progress` with the evaluator's feedback as a thread message.
- Given a human team lead who disagrees with a `not_met` verdict, when they click "Override to Verified," then the task transitions to `verified` with an override note in the audit trail.
- Given verification gates disabled for a team, when a task reaches `review`, then the existing `review → done` transition works without any evaluator step.

**Plan calls.** Architecture pass should design: the state machine modification (add `verified` state conditionally), the gate configuration model (per-team setting), the feedback-to-thread mechanism, and the override audit trail. Skip /design (uses existing task state badges and thread messages).

**Contracts / constraints.**
- The `verified` state is only active when verification gates are enabled — teams without gates never see this state.
- The task state machine modification must not break existing task queries or API consumers that expect the current state set.
- Override authority is restricted to human users with team lead role — agents cannot override verification.
- The evaluator feedback message uses the existing thread/message system — no new communication channel.

**Out of scope.**
- Multi-reviewer verification (only one verdict needed — evaluator or human).
- Verification for bets (bet-level validation is AC2, which is human-driven).
- Automated re-evaluation after rework (a new review transition triggers a fresh evaluation).

**Effort.** M (~6h)

---

### AC6 — Outcome-Based Knowledge Learning

**Workpackage.** As a knowledge system that improves over time, I want outcome data (task verdicts, session effectiveness, bet hypothesis results) to feed back into knowledge scoring — so that knowledge items that correlate with successful outcomes rank higher, and patterns from failures are captured as anti-patterns.

**Depends on.**
- AC1 — Structured Outcome Fields. AC1 provides the outcome data (task verdicts, session effectiveness, bet verdicts) that this workpackage consumes.

**Complexity.** L

**Acceptance criteria.**
- When a session ends with effectiveness > 0.7 and the session had materialized knowledge items, those items gain a positive "outcome signal" that boosts their relevance score in future materializations.
- When a session ends with effectiveness < 0.3, the materialized knowledge items gain a negative "outcome signal" — not reducing their score directly, but flagging them for facilitator review ("Was this knowledge misleading?").
- When a bet ships with `hypothesis_validated`, all L2 knowledge items created during that bet gain a confidence boost in the strategy fabric.
- When a bet ships with `hypothesis_refuted`, the facilitator queue receives a prompt to review what knowledge was relied upon — extracting "why was our hypothesis wrong?" as an anti-pattern knowledge item.
- The knowledge detail view shows an "Outcome Impact" section: how many successful vs unsuccessful sessions used this item.
- Outcome signals decay over time (half-life of 90 days) — old outcome data doesn't permanently lock relevance rankings.

**Validation scenarios.**
- Given a knowledge item "always chunk file uploads" materialized in 10 sessions (8 with effectiveness > 0.7, 2 with effectiveness < 0.3), when relevance scoring runs, then this item's score reflects the 80% positive outcome ratio.
- Given a bet with `hypothesis_refuted`, when the outcome learning routine runs, then the facilitator queue receives a review prompt linking to the bet's relied-upon knowledge items.
- Given an outcome signal from 100 days ago, when relevance scoring runs, then the signal's weight is reduced by approximately 50% (90-day half-life).
- Given a knowledge item with no outcome data, when relevance scoring runs, then the item's score is unaffected (outcome signals are additive, not required).

**Plan calls.** Architecture pass should design: the outcome signal data model (separate table linking knowledge_item_id to session effectiveness), the relevance scoring integration (how outcome signals compose with existing scoring factors), the decay function, and the bet-level feedback mechanism. Skip /design (the Outcome Impact section is a simple stat display).

**Contracts / constraints.**
- Outcome signals are strategy-layer data — they live in a new table or in the strategy fabric meta, not on the kernel knowledge_items table.
- Negative outcome signals never automatically reduce a knowledge item's score — they flag for review. Only human or facilitator action changes the item.
- The half-life decay is configurable via factory settings (default 90 days).
- Outcome-based scoring is additive to existing relevance scoring — it is a new weighted factor, not a replacement.

**Out of scope.**
- Causal attribution (proving that a specific knowledge item caused a session to succeed or fail).
- Automatic knowledge deprecation based on outcomes.
- Cross-factory outcome comparison.

**Effort.** L (~3d)

---

### AC7 — Portfolio Metrics & Measurement Dashboard

**Workpackage.** As a founder managing a portfolio of bets and teams, I want a measurement dashboard showing aggregate outcome metrics — hypothesis validation rate, cost efficiency trends, agent effectiveness rankings, and knowledge impact — so that I can see whether the company is getting smarter and more efficient over time.

**Depends on.**
- AC1 — Structured Outcome Fields. AC1 provides the per-bet and per-task outcome data that this dashboard aggregates.
- AC2 — Bet Hypothesis Validation Flow. AC2 ensures bets have structured verdicts to aggregate.

**Complexity.** L

**Acceptance criteria.**
- A founder can see whether the company is getting smarter over time by viewing aggregate metrics: hypothesis validation rate (what percentage of bets had their hypothesis confirmed?), cost efficiency (are tasks getting cheaper per successful outcome?), agent effectiveness (which agents deliver the best outcomes?), and knowledge impact (which knowledge items correlate with success?).
- Metrics are viewable across time ranges so the founder can compare recent performance against historical performance.
- A "Learning Velocity" signal shows whether the hypothesis validation rate is trending up over time — the meta-metric that proves the system is learning.
- Metrics are derived from outcome data (AC1, AC2) — no new data collection, no pre-aggregation.
- The metrics view is for humans only — agents don't see portfolio-level metrics unless explicitly materialized into their context.

**Validation scenarios.**
- Given 20 evaluated bets (12 validated, 4 refuted, 4 partial), when the Metrics page loads, then the Hypothesis Validation section shows "60% validated, 20% refuted, 20% partial."
- Given cost data for 50 tasks, when the Cost Efficiency section loads, then it shows average cost per successful task and the variance between actual and appetite costs.
- Given agent effectiveness scores across 100 sessions, when the Agent Effectiveness section loads, then agents are ranked by average effectiveness with per-agent breakdowns.
- Given the hypothesis validation rate was 40% in Q1 and 60% in Q2, when Learning Velocity is displayed, then it shows a positive trend line.

**Plan calls.** /design needed — the Metrics dashboard is a new page with charts and aggregate displays. Architecture pass should design: the aggregate queries (across bets, tasks, sessions), the time-range filtering, the Learning Velocity computation, and the chart component selection.

**Contracts / constraints.**
- All metrics are derived from existing data — no new data collection mechanisms.
- Queries scan the outcome columns added by AC1 and AC2 — performance must be acceptable for factories with <10,000 bets.
- The dashboard does not cache or pre-aggregate — it queries fresh on each page load.
- Learning Velocity is a simple slope calculation on the validation rate time series — no statistical modeling.

**Out of scope.**
- OKR management (defining and tracking explicit objectives and key results).
- Predictive analytics (forecasting future outcomes from past data).
- Export/reporting (PDF or CSV export of metrics).
- Real-time streaming metrics.

**Effort.** L (~3d)
