# AC1 Concept: Structured Outcome Fields

## Required reading for downstream agents

- `docs/process-layer/the-five-primitives.md` -- existing Bet, Task, Session shapes
- `docs/process-layer/bets-shape-commit-change-ship.md` -- bet lifecycle and retros
- `docs/process-layer/tasks-and-sessions.md` -- task state machine, session lifecycle
- `docs/process-layer/lifecycle-propagation.md` -- propagation rules (outcome is NOT a propagation trigger)
- `docs/process-layer/canonical-shapes.md` -- Money, TokenUsage, RevisionLogEntry
- `docs/process-layer/retros-and-reviews-learning-flows-back-up.md` -- existing retro process (prose, not structured)
- `docs/human-interface-layer/verdict-actions.md` -- EXISTING "verdict" as thread message type (vocabulary collision)
- `packages/shared/src/events.ts` -- existing `SessionOutcome` type (`completed | crashed | stopped`)
- `packages/shared/src/thread.ts` -- existing `verdict` message type and `VerdictDecision` union
- `packages/db/src/schema.ts` -- existing `sessions.outcome`, `bets.hypothesis`, `bets.doneCondition`, `tasks.doneCondition`

---

## Phase 0 -- Identify the nouns

| Noun | Working definition | Classification |
|---|---|---|
| **Outcome** | A structured evaluation record attached to a bet, task, or session, recording whether the entity achieved its stated goal. | New primitive |
| **Bet verdict** | The specific enum value recording whether a bet's hypothesis was validated, refuted, partially confirmed, or inconclusive. | Part of Outcome (not standalone) |
| **Task verdict** | The specific enum value recording whether a task's done condition was met, met-with-rework, partially-met, or not-met. | Part of Outcome (not standalone) |
| **Session effectiveness** | A 0-1 numeric score recording how much a session advanced its task's goal. | Part of Outcome (not standalone) |
| **Bet** | Existing primitive. Time-boxed committed unit of work with hypothesis and done condition. | Stable -- used as-is |
| **Task** | Existing primitive. Unit of work with state machine, done condition, owner. | Stable -- used as-is |
| **Session** | Existing primitive. Single agent run on a task with existing `outcome` field. | Stable -- the existing `outcome` field is unaffected |

Only **Outcome** enters the full probe. The three sub-concepts (bet verdict, task verdict, session effectiveness) are properties of Outcome, not independent primitives.

---

## Phase 1 -- Probe the essence

### Probe 1: Identity -- What IS an Outcome?

**My read:** An Outcome is NOT a standalone entity with its own ID. It is a set of structured fields embedded directly on the host entity (bet, task, or session). This is analogous to how `costActual` is a Money field on bets -- it is a property of the bet, not an entity joined to it.

The alternative -- a separate `outcomes` table with FK to the host entity -- would be over-engineering. Each entity has at most one outcome. The cardinality is 1:1 or 0:1. A separate table adds a join, an ID, and a lifecycle for no gain. The pattern matches `bets.hypothesis` and `bets.doneCondition` -- both are inline fields, not separate entities.

**Decision:** Outcome is an **inline field group**, not a separate entity. No `outcomes` table. New columns are added directly to the `bets`, `tasks`, and `sessions` tables.

### Probe 2: Essential properties -- What must every Outcome have?

**My read:** The Outcome field group varies by host entity:

**Bet outcome:**
- `outcomeVerdict`: enum -- the structured hypothesis evaluation
- `outcomeSummary`: text -- human/agent-written explanation of what happened
- `outcomeRecordedAt`: timestamp -- when the verdict was recorded
- `outcomeRecordedBy`: user ID -- who recorded it (human or evaluator agent)

**Task outcome:**
- `outcomeVerdict`: enum -- whether the done condition was met
- `outcomeRecordedAt`: timestamp
- `outcomeRecordedBy`: user ID

**Session effectiveness:**
- `effectivenessScore`: real (0-1) -- how much the session advanced the task goal
- `effectivenessRecordedAt`: timestamp
- `effectivenessRecordedBy`: user ID

All fields nullable. Null means "not evaluated" -- the progressive enhancement default.

### Probe 3: Vocabulary collision -- CRITICAL

**Collision 1: "verdict" vs existing verdict message type.**

The term "verdict" is already load-bearing in HyperIdle. In `packages/shared/src/thread.ts`, `verdict` is a message type in the thread system. A `verdict` message is how a human records approve/reject/request-changes on a review item. The `VerdictDecision` type is `"approve" | "approve_with_comments" | "request_changes" | "reject"`. The `VerdictPayload` carries this decision.

AC1 uses "verdict" to mean something different: the structured evaluation of whether a hypothesis held or a done condition was met. These are conceptually adjacent but operationally distinct:

- **Thread verdict**: an action on a review item (approve/reject). Present tense. Part of the conversation flow.
- **AC1 verdict**: a retrospective evaluation of whether a prediction was right. Past tense. Part of the outcome record.

**Resolution:** Keep "verdict" for both contexts but with distinct qualified names. The thread system uses `VerdictDecision` (already named). AC1 uses `BetOutcomeVerdict` and `TaskOutcomeVerdict` as the type names. In the UI, the column/field label is "Outcome" not "Verdict" -- the enum values are the verdict vocabulary but the field name is "outcome."

**Collision 2: "outcome" vs existing `sessions.outcome` column.**

The `sessions` table already has an `outcome` column storing `SessionOutcome` = `"completed" | "crashed" | "stopped"`. This describes HOW the session ended (its disposition). AC1 adds `effectivenessScore` which describes HOW WELL the session performed. These are complementary, not conflicting.

**Resolution:** The existing `sessions.outcome` column is untouched. The new field is `effectiveness_score` -- a different name for a different concept. No rename, no collision. The existing `SessionOutcome` type continues to mean disposition (completed/crashed/stopped). The new field measures quality within that disposition.

**Collision 3: "outcome" vs `routine_runs.outcome`.**

The `routine_runs` table has an `outcome` column storing `"success" | "error"`. Same pattern as sessions: disposition, not evaluation. No collision with AC1 because AC1 does not touch routines.

### Probe 4: Authority -- Who sets Outcome fields?

**My read:** The spec is explicit: "Verdicts are set by humans or evaluator agents -- never by the state machine automatically." This means:

- Bet outcomes: set by the founder (human) during the post-bet retro, or by a facilitator agent (AC2 future). AC3 does NOT auto-evaluate bets.
- Task outcomes: set during the review process -- either by a human reviewer or by an evaluator agent (AC3 future). The task state machine does NOT set outcome on transition to `done`.
- Session effectiveness: set by the review process or an evaluator agent (AC3 future). NOT set by the session lifecycle (endSession does not populate this).

**Decision:** Outcome fields are written via explicit PATCH endpoints, never by the state machine or lifecycle propagation. The state machine transitions (proposed->done, active->completed) remain unchanged. Outcome recording is a separate act that happens AFTER or DURING the existing review flow.

### Probe 5: Lifecycle -- Do Outcomes have states?

**My read:** Outcomes do NOT have their own lifecycle. They have exactly two states: null (not evaluated) and populated (evaluated). There is no "draft outcome" or "pending outcome." Once set, an outcome can be overridden (new value replaces old), but there is no multi-step outcome workflow in AC1. (AC2 adds a guided validation flow, but that's a UI flow, not an outcome lifecycle.)

An override creates a revision log entry (same pattern as bet field revisions). The previous value is preserved in the audit trail.

**Decision:** No outcome state machine. Null -> populated is the only transition. Re-evaluation overwrites with audit.

---

## Phase 2 -- Rejection list

### What Outcome is NOT

1. **Outcome is not a standalone entity.** It is not an `outcomes` table with its own primary key, creation timestamp, and lifecycle. It is inline fields on existing entities. Why: 1:1 cardinality with the host entity; a separate table adds complexity (joins, IDs, lifecycle management) without benefit. The `taskStrategyFabric` extension table pattern exists for strategy-layer data, but outcome fields are kernel-layer (the spec says so explicitly), so they belong on the kernel tables.

2. **Outcome is not the same as session disposition.** The existing `sessions.outcome` (`completed | crashed | stopped`) describes what happened to the session process. The new `effectiveness_score` describes how well the work performed. A session can be `completed` (disposition) with effectiveness 0.2 (poor quality). These are orthogonal axes. We do NOT rename, repurpose, or extend the existing `outcome` column.

3. **Outcome is not a rubric.** AC4 introduces multi-dimensional scoring rubrics. AC1 is a single verdict or score per entity. A bet verdict is one enum value, not five dimensions with weights. Conflating AC1 with AC4 would over-scope this workpackage and couple it to the evaluator agent pattern (AC3).

4. **Outcome is not a gate.** Outcome fields do not block state transitions. A bet can ship without an outcome recorded. A task can move to `done` without an outcome. AC5 adds verification gates; AC1 is pure progressive enhancement. The "not evaluated" default is the proof: existing workflows are unaffected.

5. **Outcome is not a computed metric.** Outcomes are human/agent-entered evaluations, not derived from data. There is no algorithm that computes "hypothesis validated" from session logs. Even the effectiveness score is a judgment, not a formula. AC3 adds an evaluator agent that makes this judgment, but it's still a judgment, not a computation.

6. **Outcome is not a thread verdict.** The existing `verdict` message type in threads (approve/reject/request-changes) is a conversational action. Outcome verdicts are retrospective evaluations. A bet can receive a thread verdict ("approve" the shipping review item) and separately receive an outcome verdict ("hypothesis refuted"). These are independent.

---

## Phase 3 -- Vocabulary

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **outcome** | The structured evaluation record on a bet, task, or session. Field group, not entity. | result, evaluation, assessment, grade, score (generic) |
| **bet outcome verdict** | Enum value: `validated`, `refuted`, `partial`, `inconclusive`. | hypothesis result, hypothesis verdict (ambiguous with thread verdict), bet result |
| **task outcome verdict** | Enum value: `met`, `met_with_rework`, `partially_met`, `not_met`. | task result, task grade, completion status (confuses with state machine) |
| **effectiveness score** | Real 0-1 on sessions. How well the session advanced its task goal. | session score, quality score, performance score, session outcome (collides with existing field) |
| **not evaluated** | The null default state of all outcome fields. | pending, unknown, unset, TBD |
| **outcome summary** | Free-text explanation attached to a bet outcome. | notes (collides with session notes), rationale, explanation |

**Critical:** "verdict" as a standalone unqualified term in the codebase means a thread message type (approve/reject). In the context of AC1, always qualify: "bet outcome verdict" or "task outcome verdict." The type names use the qualified forms: `BetOutcomeVerdict`, `TaskOutcomeVerdict`.

---

## Phase 4 -- Contracts

### Cardinality contracts

- Each bet has at most one outcome (0:1). The outcome is inline fields on the bets row.
- Each task has at most one outcome (0:1). The outcome is inline fields on the tasks row.
- Each session has at most one effectiveness score (0:1). The score is an inline field on the sessions row.
- There is no many-outcomes-per-entity. Re-evaluation overwrites the previous value (with audit trail).

### Closure contracts

- `BetOutcomeVerdict` is a **closed enum**: `validated | refuted | partial | inconclusive`. Adding a fifth value requires a concept-doc update to this file first.
- `TaskOutcomeVerdict` is a **closed enum**: `met | met_with_rework | partially_met | not_met`. Adding a fifth value requires a concept-doc update to this file first.
- `effectiveness_score` is a **closed range**: real number in [0, 1] inclusive. The interpretation is open (what 0.5 means is context-dependent), but the range is fixed.

### Mutability contracts

- Outcome fields start as null (not evaluated). This is immutable at creation -- you cannot create a bet with an outcome pre-set.
- Once set, outcome fields can be overridden. Each override appends to the entity's audit trail / revision log.
- The `outcomeRecordedAt` and `outcomeRecordedBy` fields are updated on each write (they reflect the LATEST evaluation, not the first).
- Override authority: any user with write access to the entity (human or agent). AC3 adds evaluator agent writes; AC5 adds gate constraints. AC1 does not restrict who can set outcomes.

### Identity contracts

- Outcomes do not have their own identity. They are identified by their host entity's ID (bet ID, task ID, session ID).

### Hard rules

1. **Outcome never triggers state machine transitions.** Recording an outcome does not cause a bet to ship, a task to transition, or a session to end. The state machine and the outcome are independent axes. (AC5 may change this for tasks, but AC1 does not.)
2. **Null is the default, always.** Every existing row has null outcome after migration. No backfill. No computed defaults.
3. **The existing `sessions.outcome` column is untouched.** The new effectiveness score is a separate column. No rename, no type change, no semantic broadening of the existing field.
4. **Outcome fields are kernel-layer data.** They live on the kernel tables (bets, tasks, sessions), not on strategy extension tables (taskStrategyFabric, knowledgeStrategyFabric). The spec explicitly states this. Rationale: outcomes are structural facts about work (did the hypothesis hold?), not strategy signals (what risk tier is this task?).

---

## Phase 5 -- Rationale

The founder's question is: "Are we getting better at predicting what works?" Today, HyperIdle can tell you that a bet shipped and what it cost. It cannot tell you whether the hypothesis was right. The gap between "shipped" and "validated" is where organizational learning lives.

Outcomes must be inline fields rather than a separate entity because they are properties of the work itself -- a bet's hypothesis verdict is as fundamental to the bet as its status. The progressive enhancement default (null = not evaluated) ensures the existing workflow is unaffected. The closed enums (4 values each) are intentionally small -- they force a discrete judgment rather than allowing fuzzy write-anything-you-want prose. The prose goes in `outcomeSummary`, but the structured verdict is what makes the data queryable and aggregatable.

The vocabulary collision with thread verdicts is resolved by qualification (BetOutcomeVerdict vs VerdictDecision) rather than renaming either concept. Both uses of "verdict" are correct English -- one is a conversational action, the other is a retrospective evaluation. The codebase context (thread vs outcome) disambiguates.

---

## Phase 6 -- Self-critique

**Is the rejection list substantive?** Yes -- six distinct rejections, each with a clear reason. "Not a standalone entity," "not session disposition," "not a rubric," "not a gate," "not a computed metric," and "not a thread verdict" are all real temptations that would lead to different designs.

**Does the canonical term collide?** The `outcome` term does overlap with `sessions.outcome`. The resolution (separate column, different name for the new concept) is clean but requires discipline in naming. The column names must be `outcome_verdict` and `effectiveness_score`, not `outcome` (which is taken). Verified via grep: `sessions.outcome` exists at schema.ts:200.

**Are the contracts complete?** Cardinality (0:1 inline), closure (closed enums, closed range), mutability (null -> populated, overridable with audit), identity (host entity ID), and four hard rules. No hand-waving on any axis.

**Is the rationale concrete?** Yes -- it names the specific gap ("shipped" vs "validated") and the specific design tension (inline vs separate table, closed enum vs open text).

**Missing doc updates?** The canonical-shapes.md should gain the new enum definitions. The five-primitives.md should mention outcome fields on the Bet, Task, Session shapes. These updates are deferred to the architecture pass which will specify exact file changes.

---

## Canonical shape additions (for `docs/process-layer/canonical-shapes.md`)

```
## Outcome verdict enums (AC1)

// Closed. Adding a value requires updating plans/AC1/concept.md first.
type BetOutcomeVerdict = 'validated' | 'refuted' | 'partial' | 'inconclusive'

// Closed. Same constraint.
type TaskOutcomeVerdict = 'met' | 'met_with_rework' | 'partially_met' | 'not_met'

// Effectiveness score: real number in [0, 1] inclusive. Null = not evaluated.
// Interpretation is context-dependent; the range is fixed.
type EffectivenessScore = number // constrained to [0, 1]
```

These enums join `BetStatus`, `TaskState`, `SessionOutcome` as the closed vocabularies of the process layer.
