# Track AC: Outcome Measurement & Scoring

Close the feedback loop between work and learning. Today, HyperIdle tracks whether work ran (session outcome: completed/crashed) but not whether it achieved its goal. Bets have hypotheses and done conditions as unstructured text — but no structured outcome measurement, no verification gates, and no feedback from outcomes back into knowledge or agent configuration. This track makes measurement a signal that flows through the system — enabling bets, agents, and knowledge to learn from results.

**Inspiration:** Anthropic's Outcomes feature (separate-context evaluator with rubrics), the CLEAR framework (5-dimension enterprise scoring), Paperclip's false-success problem (agents self-certifying "done"), and the Agent Learning Flywheel (Execute → Coach → Distill → Improve).

**Refinement:** This track introduces "Outcome" and "Rubric" as new primitives. Run `/pipeline:refine` per workpackage at pipeline time.

**Constraint:** Measurement is progressive — workpackages add optional scoring that enhances but never blocks the existing bet/task/session lifecycle. A bet can still ship without a score; the score adds signal, not a gate (unless the team opts into verification gates via AC5). `npm run verify` must pass after each workpackage merges.

See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

---

### AC1 — Structured Outcome Fields

**Workpackage.** As a founder reviewing completed work, I want bets, tasks, and sessions to carry structured outcome data — not just "completed" but whether the hypothesis held, whether the done condition was met, and what was learned — so that I can query portfolio health and the system can learn from results.

**Why this matters.** Today, the founder knows a bet shipped but not whether the hypothesis was right. A task is "done" but nobody recorded whether the done condition was actually met or the agent gave up and moved on. Session outcome is a three-value enum (completed/crashed/stopped) that says nothing about quality. Without structured outcomes, the factory can't answer "are we getting better at predicting what works?" — the most important question for a learning organization. The cost of NOT building this: every retro starts from scratch, no aggregate metrics are possible, and the system's learning loops (Y2 consolidation, Y7 cost intelligence) have no outcome signal to learn from.

**What exists today.** Bets have `hypothesis` (text) and `doneCondition` (text) but no structured verdict. Tasks have a state machine (proposed→done) but no outcome beyond state. Sessions have `outcome` (completed/crashed/stopped) and `notes` (freeform). The post-bet-retro routine creates prose review items, not structured outcome data.

**What's genuinely missing.** Structured outcome verdicts on bets (did the hypothesis hold?), tasks (was the done condition met?), and sessions (how effective was this session?). These are the foundational fields that every other AC workpackage builds on.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- A founder can record whether a bet's hypothesis was validated, refuted, partially confirmed, or inconclusive — as a structured field, not just prose in a thread.
- A task carries a structured outcome indicating whether its done condition was met, met with rework, partially met, or not met — set during review, not automatically.
- Sessions carry an effectiveness score (0-1) reflecting whether the session advanced its task goal — set by the review process or an evaluator agent.
- All outcome fields default to "not evaluated" — they are progressive enhancement that doesn't block existing workflows.
- Outcome data is visible where work is reviewed: bet detail, task detail, Work portfolio.
- Outcome data is queryable — the founder can filter the portfolio by verdict to see which bets validated vs which didn't.

**Validation scenarios.**
- Given a bet that ships, when the founder records the outcome as "hypothesis validated" with a summary, then the verdict is visible on the bet detail and the portfolio.
- Given 10 completed bets with structured verdicts, when the portfolio is filtered by "refuted," then only the refuted bets appear.
- Given a task reviewed with outcome "met with rework," then the task detail reflects this and it contributes to the team's rework rate.
- Given a session where no effectiveness score was set, then the field is null and does not affect aggregations.

**Plan calls.** Standard architecture pass — schema migrations, API extensions, UI for verdict input and display. The concept pass should define "Outcome" as a primitive and lock the verdict vocabularies.

**Contracts / constraints.**
- Outcome fields are kernel-layer data (structural, stable).
- Verdicts are set by humans or evaluator agents — never by the state machine automatically.
- The "not evaluated" default means existing data is unaffected by migration.

**Out of scope.**
- Automatic outcome evaluation (AC3).
- Multi-dimensional rubrics (AC4).
- Verification gates (AC5).

**Effort.** M (~6h)

---

### AC2 — Bet Hypothesis Validation Flow

**Workpackage.** As a founder who shaped a bet with a hypothesis, I want a structured flow that guides me through evaluating whether the hypothesis held — comparing what I expected against what happened, recording the verdict, and extracting learnings — so that retros produce queryable data, not just prose in a thread.

**Why this matters.** The retro process today produces a thread with prose observations. That prose is valuable for the humans who read it, but invisible to the system — it can't be queried, aggregated, or promoted through the knowledge pipeline. If 5 of 10 bets had their hypotheses refuted, the founder should see that pattern at portfolio level and ask "why are our predictions so wrong?" Without structured validation, the founder reviews each bet in isolation and the meta-pattern is lost. The cost of NOT building this: retros remain a manual ceremony that feeds human memory but not organizational learning.

**What exists today.** Post-bet-retro routine fires on bet completion and creates review items (prose). Bets have `hypothesis` and `doneCondition` fields (text). The knowledge pipeline can store and promote any knowledge kind.

**What's genuinely missing.** A guided flow that turns the retro from prose into structured data — a verdict on the hypothesis, a summary of what happened, and learnings captured as knowledge items that flow through the existing pipeline.

**Depends on.**
- AC1 — Structured Outcome Fields. AC1 adds the verdict fields; AC2 builds the flow that populates them.

**Complexity.** M

**Acceptance criteria.**
- When a bet ships, the founder is guided through evaluating the hypothesis: seeing what was predicted side-by-side with what happened, recording a verdict, and capturing learnings.
- The validation is optional — unvalidated bets show a persistent "not evaluated" indicator so the founder sees the gap.
- Completing the validation creates a structured retro knowledge item (kind: "retro") that enters the existing knowledge pipeline — queryable, promotable, and linkable to the bet.
- A founder can optionally use AI-assisted drafting: a facilitator agent suggests a verdict, summary, and learnings based on the bet's session data, which the founder reviews and edits before confirming.
- Retro knowledge items from validated bets are eligible for promotion — if the same learning appears across multiple bets, it can become a team or factory principle.

**Validation scenarios.**
- Given a bet with hypothesis "chunked uploads reduce failure rate by 50%," when the founder completes the validation with "validated," then the bet shows a validated badge and a retro knowledge item is created.
- Given a completed bet where the founder skips validation, then it persistently shows "not evaluated."
- Given a founder clicks "Draft with AI," then the suggestion appears pre-filled for review and editing.
- Given a retro learning that appears in 3 bets across 2 teams, then it's eligible for promotion to L3 through the existing pipeline.

**Plan calls.** /design needed — the validation flow is a new interaction pattern. Architecture pass should design: the retro knowledge item schema, the AI drafting prompt, and how retros integrate with the promotion pipeline.

**Contracts / constraints.**
- Validation does not block bet completion — it's post-ship reflection.
- Retro knowledge items use the existing pipeline — no separate system.
- The original hypothesis text is immutable in the retro — no post-hoc rationalization.
- AI-assisted drafting is cost-capped.

**Out of scope.**
- Automatic hypothesis validation (human judgment required for bets).
- Quantitative metric collection (AC4).
- Portfolio-level analysis (AC7).

**Effort.** M (~6h)

---

### AC3 — Outcome Grading (Evaluator Agent Pattern)

**Workpackage.** As a system that learns from its work, I want an independent evaluator agent to grade task outcomes against their done conditions — in a separate context from the producing agent — so that outcome scores are unbiased and false-success (tasks marked "done" that didn't actually meet criteria) is caught.

**Why this matters.** Paperclip discovered this the hard way: agents mark tasks "done" while commenting "I can't do this" (Issue #1997). Without independent evaluation, the only quality gate is manual human review — which doesn't scale. An evaluator agent that never sees the producer's reasoning but only the artifacts and the done condition produces an unbiased quality signal. Anthropic's Outcomes feature validates this pattern in production (8.4% quality improvement, Harvey's 6x task completion rate). The cost of NOT building this: task outcomes are unreliable, rework goes undetected, and the session effectiveness scores (AC1) stay empty because nobody populates them.

**What exists today.** Session-review-creator fires on session_ended for medium/high-risk tasks and creates review items. But these are prose reviews, not structured evaluations against done conditions. No independent evaluation context exists. The X7 eval framework measures harness quality, not business outcomes.

**What's genuinely missing.** A separate-context evaluator that grades task artifacts against done conditions, producing structured verdicts and effectiveness scores.

**Depends on.**
- AC1 — Structured Outcome Fields. AC1 provides the fields the evaluator writes to.

**Complexity.** L

**Acceptance criteria.**
- When a task reaches review, an independent evaluator can grade it: seeing only the done condition, produced artifacts, and session notes — never the producing agent's reasoning or tool call history.
- The evaluator produces a structured verdict (did the done condition get met?) and an effectiveness score (how directly did the session advance the goal?).
- The evaluation is visible alongside human review — a human reviewer can override the evaluator's verdict. Human judgment is always authoritative.
- Evaluation is opt-in per team (disabled by default) and asynchronous (never blocks the task→review transition).
- False-success detection: if artifacts or session notes indicate failure while the task status suggests completion, the evaluator flags the discrepancy.
- Evaluation cost is tracked separately from the producing session's cost.

**Validation scenarios.**
- Given a task with done condition "API returns paginated results" and a session that produced an unpaginated endpoint, when the evaluator runs, then the verdict is "partially met" with justification.
- Given session notes saying "I was unable to complete this," when the evaluator runs, then it flags false-success.
- Given a human who disagrees with the evaluator, when they override the verdict, then the task shows the human verdict with an override note.
- Given evaluation disabled for a team, when a task reaches review, then no evaluator runs.

**Plan calls.** Concept work needed: "Evaluator Agent" as a specialized role with context isolation constraints. Architecture pass should design: the evaluator prompt, context isolation mechanism, cost tracking separation, and human-override data model.

**Contracts / constraints.**
- The evaluator runs in a completely separate context — no access to the producer's reasoning.
- Evaluation is asynchronous — does not block task transitions.
- Human overrides are always authoritative.
- Default: disabled. Teams opt in.

**Out of scope.**
- Bet-level evaluation (AC2 — human-driven).
- Multi-dimensional rubrics (AC4).
- Continuous evaluation during sessions.

**Effort.** L (~3d)

---

### AC4 — Multi-Dimensional Scoring Rubrics

**Workpackage.** As a team that works across different domains, I want configurable scoring rubrics with multiple dimensions — so that "quality" is measured along the axes that matter for each type of work, not reduced to a single pass/fail verdict.

**Why this matters.** A single "met/not met" verdict tells the team lead that a task passed or failed but not why. Was the code correct but poorly structured? Was the documentation accurate but unclear? Multi-dimensional scoring lets teams identify systematic weaknesses — "we consistently score low on test coverage" or "our documentation accuracy is excellent but clarity is poor." Without this, quality feedback is binary and improvement is guesswork. The cost of NOT building this: the evaluator (AC3) gives a thumbs up/down but the team can't learn which dimensions of quality to focus on.

**What exists today.** X7 eval framework has a 9-dimensional rubric model for evaluating agent harness quality. But that's for evaluating the harness, not business outcomes. No domain-specific rubrics exist for task evaluation.

**What's genuinely missing.** Configurable per-domain rubrics that the evaluator agent (AC3) uses, with per-dimension scores that aggregate into team-level quality insights.

**Depends on.**
- AC3 — Outcome Grading. AC3 establishes the evaluator; AC4 gives it configurable rubrics.

**Complexity.** L

**Acceptance criteria.**
- Teams can define scoring rubrics with named dimensions, each carrying a weight and a scoring guide.
- Different task types can use different rubrics — code tasks and documentation tasks aren't measured the same way.
- The evaluator scores each dimension independently with a justification, and a team lead can see where work scored well vs poorly.
- Default rubrics ship for common domains. Teams can customize.
- Rubric scores are queryable in aggregate — a team lead can identify which quality dimensions are consistently weak across many tasks.

**Validation scenarios.**
- Given a code task evaluated with a 5-dimension rubric, when evaluation completes, then each dimension has a score and justification, and the aggregate is a weighted average.
- Given a team with a custom rubric, when a matching task is evaluated, then the custom dimensions are used.
- Given 20 evaluated tasks, when a team lead views quality trends, then they can see which dimensions are consistently low.

**Plan calls.** /pipeline:design needed for rubric score display and rubric editor. Architecture pass should design: the rubric schema, how rubric assignment works (task type matching), and how X7's existing rubric model can be reused or adapted.

**Contracts / constraints.**
- Rubrics are strategy-layer configuration.
- Dimension weights must sum to 1.0.
- Default rubrics can be modified or deleted by teams.

**Out of scope.**
- Rubric versioning.
- Automated rubric generation.
- LLM judge calibration sets.

**Effort.** L (~5d)

---

### AC5 — Verification Gates

**Workpackage.** As a team that wants quality assurance, I want tasks to require independent verification before reaching "done" — so that agents cannot self-certify completion and the false-success problem is structurally prevented.

**Why this matters.** AC3 (evaluator) produces a quality signal. But without a gate, a team lead can ignore it — the task moves to "done" regardless of the evaluation result. For teams where quality is non-negotiable (e.g., customer-facing product, regulated domain), a structural gate that prevents unverified work from shipping is the difference between "we check quality sometimes" and "quality is enforced." The cost of NOT building this: quality evaluation is advisory and easily ignored under deadline pressure. But this is opt-in — teams that prefer speed over verification leave gates off.

**What exists today.** The task state machine has `review → done` as a direct transition. The evaluator (AC3) produces verdicts but doesn't block transitions. Human reviewers can manually approve tasks in threads.

**What's genuinely missing.** An optional gate that requires a passing verdict (evaluator or human) before the state machine allows the `done` transition.

**Depends on.**
- AC3 — Outcome Grading. AC3 provides the evaluator; AC5 adds the gate.

**Complexity.** M

**Acceptance criteria.**
- Teams can opt into verification gates — when enabled, tasks must receive a passing verdict before reaching "done."
- Failed verification returns the task to in-progress with feedback explaining what didn't meet criteria.
- A human team lead can always override a failed verdict — human judgment trumps the evaluator.
- When gates are disabled (the default), the existing workflow is unchanged — fully backward compatible.
- Override decisions are logged in the task's audit trail.

**Validation scenarios.**
- Given gates enabled, when a task gets a passing verdict, then it can transition to done.
- Given gates enabled, when a task gets a failing verdict, then it returns to in-progress with feedback.
- Given a human override on a failed verdict, then the task proceeds to done with an override note in the audit trail.
- Given gates disabled, then the existing review→done flow works unchanged.

**Plan calls.** Architecture pass should design: the conditional state machine modification, the gate configuration model (per-team), the feedback-to-thread mechanism, and the override audit trail.

**Contracts / constraints.**
- Gates are opt-in, disabled by default.
- Override authority is restricted to human team leads — agents cannot override.
- The state machine modification must not break existing queries or API consumers.

**Out of scope.**
- Multi-reviewer verification.
- Bet-level verification gates (AC2 is human-driven).
- Automated re-evaluation after rework.

**Effort.** M (~6h)

---

### AC6 — Outcome-Based Knowledge Learning

**Workpackage.** As a knowledge system that improves over time, I want outcome data to feed back into knowledge scoring — so that knowledge correlated with successful outcomes ranks higher, and patterns from failures are captured as anti-patterns.

**Why this matters.** Today, the relevance scoring engine has 6 weighted factors (tag match, role match, recency, confidence, layer proximity, attention) but none measure whether the knowledge actually helped. Two of the 8 attention signals are stubbed at zero (impact, usage) precisely because there's no outcome data to inform them. Without outcome feedback, a knowledge item that consistently appears in failed sessions ranks the same as one that consistently appears in successful sessions. The cost of NOT building this: knowledge relevance is based on metadata heuristics, never on real-world effectiveness. The knowledge that matters most can't be distinguished from the knowledge that's merely recent.

**What exists today.** Relevance scoring engine with 6 factors (none outcome-based). Attention scoring with 8 signals (2 stubbed: impact and usage). Citation tracking staged but not yet active (L22 deferred it). Access logs track reads but not outcomes.

**What's genuinely missing.** An outcome signal that connects session effectiveness (AC1) to the knowledge items that were materialized in that session, boosting relevance for knowledge that correlates with success.

**Depends on.**
- AC1 — Structured Outcome Fields. AC1 provides the session effectiveness scores that this workpackage consumes.

**Complexity.** L

**Acceptance criteria.**
- Knowledge items materialized in successful sessions (high effectiveness) gain a positive outcome signal that boosts their relevance in future materializations.
- Knowledge items materialized in unsuccessful sessions gain a negative signal — not reducing their score directly, but flagging them for facilitator review.
- When a bet's hypothesis is refuted, the relied-upon knowledge is flagged for review — extracting "why were we wrong?" as an anti-pattern.
- Outcome signals decay over time — old signals don't permanently lock relevance rankings.
- Knowledge items with no outcome data are unaffected — outcome scoring is additive to existing relevance.

**Validation scenarios.**
- Given a knowledge item materialized in 10 sessions (8 high-effectiveness, 2 low), then its relevance score reflects the positive outcome ratio.
- Given a refuted bet hypothesis, when the outcome learning routine runs, then the facilitator queue receives a review prompt for the relied-upon knowledge.
- Given an outcome signal from 100 days ago, then its weight is reduced by decay.
- Given a knowledge item with zero outcome data, then its relevance score is unchanged.

**Plan calls.** Architecture pass should design: the outcome signal data model, integration with relevance scoring (new weighted factor), the decay function, and the bet-level feedback mechanism.

**Contracts / constraints.**
- Outcome signals are strategy-layer data.
- Negative signals flag for review, never automatically reduce scores.
- Decay is configurable (default 90-day half-life).
- Outcome scoring is additive — a new factor, not a replacement.

**Out of scope.**
- Causal attribution (proving a specific item caused success/failure).
- Automatic knowledge deprecation based on outcomes.

**Effort.** L (~3d)

---

### AC7 — Portfolio Metrics & Learning Velocity

**Workpackage.** As a founder managing a portfolio of bets and teams, I want to see aggregate outcome metrics — hypothesis validation rate, cost efficiency, agent effectiveness — so that I can see whether the company is getting smarter and more efficient over time.

**Why this matters.** Individual bet outcomes (AC1, AC2) are valuable for the teams involved, but the founder needs the meta-view: is the company's prediction accuracy improving? Are tasks getting cheaper per successful outcome? Which agents consistently deliver? Without this, the founder reviews bets one at a time and can't see the forest for the trees. The "Learning Velocity" metric — the rate at which hypothesis validation improves — is the single most important signal for a learning organization. If it's flat, the system isn't compounding. The cost of NOT building this: the founder has no way to measure whether HyperIdle is actually making the company smarter, which undermines the entire value proposition.

**What exists today.** Individual bet/task/session outcome data (AC1). Cost tracking per bet/team (L17). Agent performance data in session history. But no aggregate view, no trends, no cross-bet analysis.

**What's genuinely missing.** An aggregate metrics view that derives portfolio-level insights from the outcome data produced by AC1 and AC2.

**Depends on.**
- AC1 — Structured Outcome Fields.
- AC2 — Bet Hypothesis Validation Flow.

**Complexity.** L

**Acceptance criteria.**
- A founder can see whether the company is getting smarter over time: hypothesis validation rate, cost efficiency per successful outcome, and agent effectiveness rankings.
- Metrics are viewable across time ranges to compare recent vs historical performance.
- A "Learning Velocity" signal shows whether hypothesis validation rate is trending up — the meta-metric that proves the system is learning.
- All metrics are derived from existing outcome data — no new data collection.
- The view is for humans only — agents don't see portfolio metrics unless explicitly materialized.

**Validation scenarios.**
- Given 20 evaluated bets (12 validated, 4 refuted, 4 partial), then the hypothesis validation rate shows 60% with the distribution visible.
- Given validation rate was 40% last quarter and 60% this quarter, then Learning Velocity shows a positive trend.
- Given cost data across 50 tasks, then cost efficiency shows average cost per successful outcome and whether it's improving.

**Plan calls.** /pipeline:design needed — metrics dashboard is a new page. Architecture pass should design: aggregate queries, time-range filtering, Learning Velocity computation.

**Contracts / constraints.**
- All metrics derived from existing data — no pre-aggregation.
- Performance acceptable for <10,000 bets.
- Learning Velocity is a simple slope calculation — no statistical modeling.

**Out of scope.**
- OKR management.
- Predictive analytics.
- Export/reporting.

**Effort.** L (~3d)
