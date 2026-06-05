# X8 Architecture: Eval Scenario Library (v4)

## Required reading

Before implementing, the builder must read:

- `plans/X8/concept.md` (concept note -- interactions, diversity principle, scenario design principles)
- `packages/eval/src/types.ts` (EvalScenario, ScoringRubric, JudgeContext, RunOptions)
- `packages/eval/src/seeding.ts` (seedTeam, seedAgent, seedFounder, seedBet, seedTask, seedKnowledge, seedFactorySettings, seedMinimalWorld)
- `packages/eval/src/scoring.ts` (scoreScenario engine)
- `packages/eval/src/runner.ts` (discoverScenarios, runEval, createEvalDb)
- `packages/eval/src/provision-harness.ts` (runEvalSession)
- `packages/eval/src/cli.ts` (CLI flags: --model, --quick, --scenario, --output)
- `packages/eval/src/scenarios/poc-session-notes.ts` (reference scenario pattern)
- `packages/server/src/skill-tools/*.ts` (all 15 tool handlers)
- `packages/server/src/skill-tools/tool-registry.ts` (ALL_TOOL_DEFINITIONS, toolsForRole, role filtering)
- `packages/server/src/services/session-provisioning.ts` (provisionSession 11-phase lifecycle)
- `packages/server/src/services/handoff-protocol.ts` (handoff transaction)
- `packages/fabric/src/materialization.ts` (materialize function)
- `packages/fabric/src/prompt-composition.ts` (composePrompt function)
- `packages/fabric/src/services/item-router.ts` (routeItem function)
- `packages/fabric/src/services/routine-scheduler.ts` (checkAndFireRoutine, delegation, routine sessions)
- `packages/fabric/src/services/builtin-routines.ts` (5 builtin routine handlers)
- `packages/fabric/src/services/practice-meeting.ts` (practice meeting 3-turn workflow)
- `packages/fabric/src/services/cost-cap.ts` (cost sentinel, checkCostCap, recordCostAndCheck)
- `packages/db/src/schema.ts` (all table definitions -- verify every rubric column exists)
- `docs/souls/product-manager.md`, `docs/souls/practice-facilitator.md`, `docs/souls/chief-of-staff.md`

---

## Plan reconciliation: spec vs codebase

| Spec assumption | Codebase reality | Resolution |
|---|---|---|
| "Scenarios grouped by feature" | `EvalScenario` has no `feature` field. Has `id`, `description`, `tags`. | Add `feature` field to `EvalScenario`. Add `--feature` CLI flag. See Section 1. |
| "Each uses X7's seeding library" | `seedTeam`, `seedAgent`, `seedFounder`, `seedBet`, `seedTask`, `seedKnowledge`, `seedFactorySettings`, `seedMinimalWorld` exist. `seedThread`, `seedMessage`, `seedItem`, `seedRoutine`, `seedUserSkill` do NOT exist. | Add new seed helpers. See Section 3. |
| "`npm run eval --feature <feature>` filters by feature" | CLI has `--model`, `--quick`, `--scenario`, `--output`. No `--feature`. | Add `--feature` flag. See Section 2. |
| "Per-feature rubric breakdowns in report" | `EvalReport` has flat `scenarios` array. No per-feature aggregation. | Add `featureBreakdown` to `EvalReport`. See Section 2. |
| "costEstimate on items" | `items.cost_estimate` column was **dropped** in O2 migration. The `create_item` Zod schema still accepts `costEstimate` but the DB insert silently ignores it (Drizzle drops unknown keys). | No rubric dimension should reference `items.costEstimate`. |
| "items.attentionScore for score_attention" | `items.attentionScore` column was **dropped** in O2 migration. `score_attention` on target="item" is a no-op (returns ok but writes nothing). | score_attention scenarios must target `knowledge_item` for observable writes. The item target path tests graceful no-op behavior. |
| "Routine sessions create sessions with cost column" | `createRoutineSession` in `routine-scheduler.ts:235` inserts `cost: 0` but `sessions` table has NO cost column (stripped in O2). Drizzle silently drops the field. | No rubric should check `sessions.cost`. Routine session existence checked via `sessions.id` and `sessions.state`. |
| "New interactions 20-24" | Knowledge writeback (file watcher), builtin routines (5 handlers in `builtin-routines.ts`), routine sessions (`createRoutineSession` in `routine-scheduler.ts`), skill autonomy (`userSkills` table + `autonomyLevel` on routines), delegation (`findDelegate` + `delegationAllowed` in `routine-scheduler.ts`). All code exists. | New seeding helpers + scenario files needed. See Sections 3 and 5.20-5.24. |

---

## 1. Framework extension: `feature` field on EvalScenario

### Change to `packages/eval/src/types.ts`

Add `feature` to `EvalScenario`:

```typescript
export interface EvalScenario {
  readonly id: string;
  readonly description: string;
  /** Interaction name this scenario tests. Used for --feature filtering and report grouping. */
  readonly feature: string;
  readonly tags: readonly string[];
  readonly seed: (ctx: SeedContext) => Promise<ScenarioSeedResult>;
  readonly trigger: (ctx: TriggerContext) => Promise<TriggerResult>;
  readonly rubric: ScoringRubric;
}
```

The existing POC scenario gets `feature: "write_session_notes"`.

### Feature breakdown in EvalReport

Add to `EvalReport`:

```typescript
export interface FeatureBreakdown {
  readonly feature: string;
  readonly scenarioCount: number;
  readonly averageScore: number;
  readonly scenarioIds: readonly string[];
}

export interface EvalReport {
  // ...existing fields...
  readonly featureBreakdown: readonly FeatureBreakdown[];
}
```

Computed in `runner.ts` after all scenarios complete: group `scenarioReports` by feature, average scores per group.

---

## 2. CLI extension: `--feature` flag

### Change to `packages/eval/src/cli.ts`

Add `--feature` / `-f` flag to `CliArgs`:

```typescript
interface CliArgs {
  model?: string;
  quick: boolean;
  scenario?: string;
  feature?: string;  // NEW
  output?: string;
  help: boolean;
}
```

### Change to `packages/eval/src/types.ts`

Add `feature` to `RunOptions`:

```typescript
export interface RunOptions {
  readonly model?: string;
  readonly quick: boolean;
  readonly filter?: string;
  readonly feature?: string;  // NEW
  readonly outputPath?: string;
}
```

### Change to `packages/eval/src/runner.ts`

After the `--scenario` filter, add feature filtering:

```typescript
if (options.feature) {
  scenarios = scenarios.filter((s) => s.feature === options.feature);
}
```

When `--feature` matches zero scenarios, print available features to stderr for discoverability:

```typescript
if (scenarios.length === 0 && options.feature) {
  const allScenarios = await discoverScenarios();
  const features = [...new Set(allScenarios.map(s => s.feature))].sort();
  process.stderr.write(`[eval] No scenarios for feature "${options.feature}". Available features:\n`);
  for (const f of features) {
    process.stderr.write(`  - ${f}\n`);
  }
}
```

---

## 3. Seeding library extensions

All new helpers go in `packages/eval/src/seeding.ts`.

### `seedThread`

```typescript
export async function seedThread(
  db: HyperIdleDb,
  opts: {
    threadId?: string;
    hostKind: string;
    hostId: string;
    initiatorId: string;
    participants: string[];
  },
): Promise<{ threadId: string }>
```

Inserts into `threads` table. Used by: send_message, read_inbox, submit_review, create_item scenarios.

### `seedMessage`

```typescript
export async function seedMessage(
  db: HyperIdleDb,
  opts: {
    messageId?: string;
    senderId: string;
    threadId: string;
    type?: string;       // default: "plain"
    payload: string;     // JSON string
  },
): Promise<{ messageId: string }>
```

Inserts into `messages` table. Used by: read_inbox scenarios (need pre-existing messages to read).

### `seedItem`

```typescript
export async function seedItem(
  db: HyperIdleDb,
  opts: {
    itemId?: string;
    sourceAgentId: string;
    title: string;
    threadId: string;
    kind?: string;
    verb?: string;
    riskTier?: string;
    body?: string;
  },
): Promise<{ itemId: string }>
```

Inserts into `items` table. Used by: route_item, score_attention scenarios (need existing items to operate on).

### `seedArtifact`

```typescript
export async function seedArtifact(
  db: HyperIdleDb,
  opts: {
    artifactId?: string;
    producingTaskId: string;
    kind: string;
    previewJson?: string;
  },
): Promise<{ artifactId: string }>
```

Inserts into `artifacts` table. Used by: submit_review scenarios (need existing artifact for artifactRef).

### `seedConflict`

```typescript
export async function seedConflict(
  db: HyperIdleDb,
  opts: {
    conflictId?: string;
    itemId: string;
    proposedBy: string;
    proposedBody: string;
    versionBase: number;
    versionCurrent: number;
    status?: string;     // default: "open"
  },
): Promise<{ conflictId: string }>
```

Inserts into `knowledge_conflicts` table. Used by: promote_knowledge scenario (conflict gate blocks validated promotion).

### `seedRoutine`

```typescript
export async function seedRoutine(
  db: HyperIdleDb,
  opts: {
    routineId?: string;
    ownerAgentId: string;
    triggerType: "heartbeat" | "calendar" | "event" | "continuous";
    triggerConfig?: Record<string, unknown>;
    skillId?: string;
    doneCondition?: string;
    delegationAllowed?: boolean;
    humanReview?: boolean;
    autonomyLevel?: number;
    silent?: boolean;
    active?: boolean;
    lastRunAt?: string;
    nextRunAt?: string;
  },
): Promise<{ routineId: string }>
```

Inserts into `routines` table. Used by: builtin routines, routine sessions, skill autonomy, delegation scenarios.

### `seedUserSkill`

```typescript
export async function seedUserSkill(
  db: HyperIdleDb,
  opts: {
    userId: string;
    skillId: string;
    autonomyLevel: number;
    successCount?: number;
    failureCount?: number;
    lastUsedAt?: string;
    promotedAt?: string;
  },
): Promise<void>
```

Inserts into `user_skills` table (composite PK on userId + skillId). Used by: skill autonomy, delegation scenarios.

### `seedMultiAgentWorld`

```typescript
export async function seedMultiAgentWorld(
  db: HyperIdleDb,
  opts: {
    agentRole?: UserRole;
    agentSoulPrompt?: string;
    secondAgentRole?: UserRole;
    secondAgentName?: string;
    secondAgentSoulPrompt?: string;
    taskTitle?: string;
    taskDescription?: string;
    betDescription?: string;
    betDoneCondition?: string;
  },
): Promise<
  ScenarioSeedResult & {
    founderId: string;
    teamMembersId: string;
    secondAgentId: string;
  }
>
```

Extends `seedMinimalWorld` with a second agent on the same team. Used by: send_message, handoff_to, read_inbox, delegation scenarios that require two agents in the same team.

---

## 4. Judge factory library

To reduce boilerplate across scenarios, extract reusable judge factories into `packages/eval/src/judges.ts`.

### Universal judges (used by nearly every scenario)

```typescript
export function judgeSessionCompleted(): RubricDimension
export function judgeCostTracked(): RubricDimension
export function judgeNoHarmfulActions(): RubricDimension
```

### Tool-called judges (check DB side effects of specific tools)

Since tool_call events are not persisted to DB in the builtin harness path, these judges rely on tool side effects:

```typescript
export function judgeWriteMemoryCalled(): RubricDimension
// Checks: knowledgeItems row with updatedBy = "agent:<agentId>"

export function judgeCreateTaskCalled(): RubricDimension
// Checks: tasks row with ownerAgentId = agentId and state = "proposed"

export function judgeCreateItemCalled(): RubricDimension
// Checks: items row with sourceAgentId = agentId

export function judgeLogTaskCalled(): RubricDimension
// Checks: tasks.notes contains "[<timestamp> <agentId>]" pattern

export function judgeSendMessageCalled(): RubricDimension
// Checks: messages row with senderId = agentId

export function judgeSubmitReviewCalled(): RubricDimension
// Checks: messages row with type = "review" or "plain" + senderId = agentId in a bet thread

export function judgeHandoffCalled(): RubricDimension
// Checks: sessions.state = "done" AND sessions.endedAt set

export function judgeCreateArtifactCalled(): RubricDimension
// Checks: artifacts row with producingTaskId = taskId

export function judgePromoteKnowledgeCalled(): RubricDimension
// Checks: knowledgeEditLog row with editor = "agent:<agentId>" and field = "status"

export function judgeScoreAttentionCalled(): RubricDimension
// Checks: knowledgeStrategyFabric.attentionScore changed from null/original

export function judgeCreateConflictReviewCalled(): RubricDimension
// Checks: knowledgeConflicts row with proposedBy = "agent:<agentId>"
```

### Parameterized judges

```typescript
export function judgeKnowledgeLayerCorrect(expectedLayer: string): RubricDimension
// Checks: knowledgeStrategyFabric.layer for agent-created items

export function judgeKnowledgeKindCorrect(expectedKind: string): RubricDimension
// Checks: knowledgeStrategyFabric.kind for agent-created items

export function judgeTaskState(expectedState: TaskState): RubricDimension
// Checks: tasks.state for the scenario's task
```

### LLM-as-judge factory

```typescript
export function judgeLlmQuality(opts: {
  id: string;
  label: string;
  extractContent: (ctx: JudgeContext) => Promise<string>;
  criteria: string;
}): RubricDimension
```

Extracts content from DB via `extractContent`, then asks the eval model to score 0.0-1.0 against the provided criteria. Returns score + model's reasoning as note. The criteria string must use binary/anchored scoring (e.g., "Score 1.0 if notes mention all 3 of: task objective, key findings, next steps. Score 0.5 if 2 of 3. Score 0.0 if 1 or fewer.") to reduce LLM-as-judge variance.

### Routine-specific judges (new for v4)

```typescript
export function judgeRoutineFired(routineId: string): RubricDimension
// Checks: routines.lastRunAt updated for the given routine

export function judgeReviewItemCreated(): RubricDimension
// Checks: items row with kind = "review" created by the routine's owner agent

export function judgeKnowledgeStatusChanged(itemId: string, expectedStatus: string): RubricDimension
// Checks: knowledgeItems.status = expectedStatus for a specific item

export function judgeUserSkillLevel(userId: string, skillId: string, expectedLevel: number): RubricDimension
// Checks: userSkills.autonomyLevel for a specific user/skill pair

export function judgeDelegationOccurred(): RubricDimension
// Checks: routine was fired AND the executing agent differs from the owner
```

---

## 5. Interaction-by-interaction deep analysis

### Domains

The following 8 domains provide sufficient diversity for eval coverage:

| Domain ID | Industry | Typical bets |
|-----------|----------|-------------|
| `devops` | Software / DevOps | Infrastructure migration, CI/CD pipeline |
| `frontend` | Software / Frontend | UI component library, accessibility audit |
| `marketing` | Marketing | Campaign launch, brand guidelines refresh |
| `sales` | Sales / CRM | Lead qualification workflow, pipeline report |
| `finance` | Finance / Compliance | Quarterly close procedures, audit prep |
| `legal` | Legal / Contracts | Contract review workflow, compliance policy |
| `healthcare` | Healthcare | Patient data privacy policy, clinical workflow |
| `consulting` | Consulting / Strategy | Client engagement model, knowledge sharing |

Not every interaction needs all 8 domains. Domain selection per scenario is driven by whether the domain exercises a meaningfully different judgment pattern for that specific interaction.

### Soul prompts

Each scenario provides an inline soul prompt tailored to the role and domain. Standard-role agents (builder, growth, brand_voice) use custom soul prompts since no disk-based templates exist for them. Facilitator-role agents (product_manager, practice_facilitator, chief_of_staff) use soul prompts modeled on `docs/souls/*.md` but adapted for the specific domain.

---

### 5.1 write_memory (MEDIUM complexity)

**Source:** `packages/server/src/skill-tools/write-memory.ts`

**Diversity question:** Can this interaction happen differently given role or domain?

**Yes.** Role creates genuinely different judgment:
- Standard agents (builder/growth/brand_voice) are restricted to L0-L2. The layer enforcement gate is a real code path difference.
- Facilitator agents (PM/PF/CoS) can write L3/L4. Choosing the correct layer for factory-wide vs practice knowledge is a judgment call.
- brand_voice agents exercise different kind selection judgment (brand consistency reflections vs technical decisions).

Domain creates some diversity: a DevOps failure analysis vs a marketing campaign reflection exercise different `kind` selection.

**Tunable parameters:**
- Tool description (line 110-111): "Write a new knowledge item..."
- Zod schema: `layer` (L0-L4), `kind` (8 values), `title`, `body`, `topic`, `format` (markdown|toon), `status`
- Layer enforcement: non-facilitators restricted to L0-L2 (lines 46-52, 62-68)
- Scope derivation: `scopeKind` defaults to "product" when `teamId` is present, "factory" otherwise (lines 78-89)
- Default status: "draft" (line 98) -- items start in triage
- `updatedBy`: always `agent:<agentId>` (line 101)

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `wm-kind-selection-builder-devops` | `write_memory` | builder | devops | kind_correctness, body_quality, layer_correctness | Kind selection judgment for technical content -- builder choosing "failure" vs "decision" vs "pattern". The primary tunable surface for tool description changes. |
| `wm-layer-enforcement-growth-marketing` | `write_memory` | growth | marketing | layer_restricted, fallback_behavior, session_completed | Layer enforcement gate -- growth agent instructed to capture a cross-company pattern tries L3, gets FORBIDDEN, must self-correct to L0-L2. Tests error message clarity. |
| `wm-facilitator-l4-cos-consulting` | `write_memory` | chief_of_staff | consulting | layer_correctness, kind_correctness, scope_correctness | Facilitator L4 path -- CoS writing factory-wide principles. Tests that facilitators choose L4 (not L2) for cross-product knowledge. Different code path than standard agents. |
| `wm-reflection-brandvoice-marketing` | `write_memory` | brand_voice | marketing | kind_correctness, body_quality, brand_consistency | Soul prompt influence on kind selection -- brand_voice should produce brand-consistency reflections. Tests whether agent identity shapes tool usage. |

**4 scenarios. Justification:** Covers 3 distinct code paths (standard L0-L2, standard denied L3+, facilitator L3/L4) plus the soul-prompt-as-judgment dimension. Scope derivation tested implicitly (seedMinimalWorld always provides teamId). Fewer than 4 would leave the layer enforcement boundary untested.

---

### 5.2 query_practice (LOW complexity)

**Source:** `packages/server/src/skill-tools/query-practice.ts`

**Diversity question:** Can this interaction happen differently given role or domain?

**Partially.** The tool itself is universal (same FTS + layer filter regardless of role). But the judgment of WHEN to search and WHAT to search for differs between a builder looking for implementation guidance and a facilitator curating community knowledge.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `qp-proactive-search-builder-frontend` | `query_practice` | builder | frontend | knowledge_referenced, session_notes_quality, session_completed | Proactive search by a worker -- seeds accessibility patterns, task asks builder to implement accessible components. Tests whether tool description prompts agents to search before acting. |
| `qp-facilitator-curation-pf-devops` | `query_practice` | practice_facilitator | devops | knowledge_referenced, curation_quality, session_completed | Systematic curation by a facilitator -- PF querying existing practices before creating new ones. Different judgment pattern than builder search. |
| `qp-layer-filter-pm-finance` | `query_practice` | product_manager | finance | knowledge_referenced, session_completed | Seeds items across L2 and L3. Task asks PM to find practice knowledge specifically. Tests whether agent correctly uses the layer parameter (default L3 vs explicit L2). |

**3 scenarios. Justification:** LOW complexity but 3 scenarios needed for per-interaction statistical stability. Two usage patterns (worker search vs facilitator curation) plus a layer parameter exercise. Read-only tool requires LLM-as-judge on session notes for all three.

---

### 5.3 write_session_notes (LOW complexity)

**Source:** `packages/server/src/skill-tools/write-session-notes.ts`

**Diversity question:** No. The tool works identically regardless of role or domain. The only variant is append vs overwrite.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `wsn-quality-growth-sales` | `write_session_notes` | growth | sales | notes_written, notes_quality, session_completed | Content quality under a different soul prompt than POC. Growth agent analyzing sales pipeline should produce substantive notes, not boilerplate. |
| `wsn-append-builder-devops` | `write_session_notes` | builder | devops | notes_written, notes_appended, session_completed | Append mode -- task requires multiple phases of work, agent should call write_session_notes with `append: true` after each phase. Tests whether tool description is clear about append semantics. |

**2 scenarios (plus existing POC = 3 total). Justification:** LOW complexity. The POC validates basic usage. Two additional scenarios cover content quality (LLM-as-judge) and append mode (the only non-trivial parameter). 3 total is the minimum for statistical stability.

---

### 5.4 create_artifact (MEDIUM complexity)

**Source:** `packages/server/src/skill-tools/create-artifact.ts`

**Diversity question:** Can this happen differently given role or domain?

**Yes, mildly.** The 12 artifact kinds exercise different preview schemas. A builder producing a code_diff exercises different schema navigation than a PM producing a decision. Domain affects what kind is appropriate.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `ca-code-diff-builder-devops` | `create_artifact` | builder | devops | artifact_created, kind_correctness, preview_valid, session_completed | Structured preview construction for code_diff (the most complex preview shape -- file, hunks). Tests whether tool description + preview schema are clear enough. |
| `ca-decision-pm-healthcare` | `create_artifact` | product_manager | healthcare | artifact_created, kind_correctness, decision_quality, session_completed | Judgment-heavy content -- PM making a compliance decision artifact with claim + rationale. Healthcare domain makes "good" rationale genuinely different. |
| `ca-verification-builder-frontend` | `create_artifact` | builder | frontend | artifact_created, kind_correctness, preview_valid, session_completed | Numeric preview fields -- verification artifact with suite/passed/failed counts. Tests a distinct preview shape (numbers vs strings). |

**3 scenarios. Justification:** 12 artifact kinds but only 3 preview shape families exercise different tunable surfaces: complex structured (code_diff), judgment content (decision), and numeric (verification). Other kinds share the same schema surface.

---

### 5.5 create_item (HIGH complexity)

**Source:** `packages/server/src/skill-tools/create-item.ts`

**Diversity question:** Can this happen differently given role or domain?

**Yes.** The judgment of which `kind` to use, what `riskTier` to assign, and whether to set `blocking: true` varies significantly by role (builder escalating vs PM coordinating) and by domain (healthcare high-risk vs marketing low-risk). The view routing deterministic function (`routeItem`) produces different outcomes based on these judgments.

**Note:** `items.costEstimate` and `items.attentionScore` columns were dropped in O2. The Zod schema still accepts them but the DB insert silently ignores them. Rubrics must NOT reference these columns.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `ci-escalation-builder-finance` | `create_item` | builder | finance | item_created, kind_correctness, risk_tier_assessment, reasoning_present, session_completed | Escalation judgment -- when should a builder escalate vs continue? Finance domain has real compliance blockers. Tests `kind: "escalation"` + `riskTier: "high"` + reasoning quality. |
| `ci-knowledge-proposal-builder-consulting` | `create_item` | builder | consulting | item_created, kind_correctness, view_routed_correctly, body_quality, session_completed | Knowledge proposal workflow -- builder proposes a pattern discovered during work. Tests `kind: "knowledge"` routing to "knowledge" view. |
| `ci-review-request-builder-frontend` | `create_item` | builder | frontend | item_created, kind_correctness, risk_tier_assessment, session_completed | Review request -- builder requests human review on a high-risk UI change. Tests review creation judgment. |
| `ci-work-item-pm-devops` | `create_item` | product_manager | devops | item_created, kind_correctness, view_routed_correctly, blocking_flag, session_completed | PM coordination item -- PM discovers critical infrastructure issue. Tests `kind: "work"`, `verb: "bet"`, `blocking: true` judgment. Different role perspective than builder scenarios. |
| `ci-chat-growth-marketing` | `create_item` | growth | marketing | item_created, kind_correctness, view_routed_correctly, session_completed | Lightweight conversation item -- growth agent needing a quick human check on campaign messaging. Tests `kind: "chat"` routing to "conversations" view. Exercises a different kind than the 4 above. |

**5 scenarios. Justification:** HIGH complexity with 10 kinds, 6 verbs, and 3 risk tiers creating a large judgment space. 5 scenarios cover the 5 distinct agent-initiated kind patterns: escalation, knowledge, review, work, and chat. The remaining kinds (cost_cap_breach, autonomy_change, ordering, post-bet-retro, skill_change) are system-generated, not agent-initiated. 5 is the minimum for stable signal on a HIGH complexity interaction.

---

### 5.6 create_task (MEDIUM complexity)

**Source:** `packages/server/src/skill-tools/create-task.ts`

**Diversity question:** Can this happen differently given role?

**Yes.** A PM decomposes bets into tasks proactively during planning. A builder creates subtasks reactively during work when they discover sub-problems. The quality of task titles, descriptions, and done conditions is the tunable surface -- it depends on both the soul prompt and the tool description.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `ct-decomposition-pm-marketing` | `create_task` | product_manager | marketing | tasks_created, decomposition_quality, done_conditions_present, task_titles_descriptive, session_completed | Proactive bet decomposition by PM. LLM-as-judge evaluates task scoping and done condition quality. Marketing domain exercises non-technical task decomposition. |
| `ct-subtask-builder-devops` | `create_task` | builder | devops | tasks_created, task_relevant, done_conditions_present, session_completed | Reactive subtask creation by builder during work. Different judgment pattern -- builder decomposes their own technical work, not a cross-team bet. |
| `ct-decomposition-pm-healthcare` | `create_task` | product_manager | healthcare | tasks_created, decomposition_quality, done_conditions_present, session_completed | PM decomposition in a regulated domain. Healthcare compliance creates genuinely different "good" task descriptions (regulatory requirements, audit trails). Tests whether domain context shapes task quality. |

**3 scenarios. Justification:** Single code path but 3 scenarios needed: two usage patterns (PM planning vs builder reactive) plus domain diversity within the PM pattern (marketing vs healthcare produces genuinely different "good" decompositions). The security constraint (cross-bet prevention) is structural, not judgment.

---

### 5.7 log_task (LOW complexity)

**Source:** `packages/server/src/skill-tools/log-task.ts`

**Diversity question:** No. The tool works identically regardless of role or domain. Append-only with timestamp prefix.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `lt-progress-tracking-builder-legal` | `log_task` | builder | legal | notes_logged, notes_quality, session_completed | Mid-session progress logging during a contract review. Tests whether tool description prompts ongoing logging (not just end-of-session). |
| `lt-multi-entry-builder-devops` | `log_task` | builder | devops | notes_logged, multiple_entries, session_completed | Multiple log entries -- task requires multiple phases. Rubric checks tasks.notes contains multiple `[timestamp agentId]` entries separated by `---`. Tests the append semantics. |
| `lt-discovery-pm-consulting` | `log_task` | product_manager | consulting | notes_logged, notes_quality, session_completed | PM logging discoveries during coordination work. Different role perspective -- PM logs coordination insights, not implementation progress. |

**3 scenarios. Justification:** LOW complexity needs 3 for statistical stability. Covers: basic usage, multi-entry append, and different role perspective (PM vs builder log different content).

---

### 5.8 read_inbox (MEDIUM complexity)

**Source:** `packages/server/src/skill-tools/read-inbox.ts`

**Diversity question:** Marginally. The tool is read-only and works identically for all roles. The judgment is whether to check the inbox and how to respond. PM coordination workflow and builder receiving instructions are different usage patterns.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `ri-check-and-respond-pm-consulting` | `read_inbox` | product_manager | consulting | inbox_checked, message_responded, session_completed | Primary workflow: PM checks inbox, finds pending question from builder, responds via send_message. Tests the inbox-check + response workflow. |
| `ri-empty-inbox-builder-devops` | `read_inbox` | builder | devops | session_completed, no_harmful_actions | Empty inbox edge case: no messages for the builder. Tests graceful degradation (doesn't crash, doesn't create spurious items). |
| `ri-multiple-threads-builder-frontend` | `read_inbox` | builder | frontend | inbox_checked, correct_thread_responded, session_completed | Seeds messages in multiple threads. Task asks builder to check and respond to the relevant one. Tests participant filtering and message prioritization. |

**3 scenarios. Justification:** MEDIUM complexity with participant JSON filtering. 3 scenarios cover: primary workflow, empty inbox edge case, and multi-thread filtering. The participant filter (JSON parse in JS) is a tunable surface -- if it breaks, the agent sees no messages.

---

### 5.9 send_message (MEDIUM complexity)

**Source:** `packages/server/src/skill-tools/send-message.ts`

**Diversity question:** Marginally. Tool works the same regardless of role. PM coordination messages and builder status updates are different judgment patterns.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `sm-coordination-pm-frontend` | `send_message` | product_manager | frontend | message_sent, recipient_correct, message_quality, session_completed | PM-initiated coordination -- sending task priorities to a builder. Tests recipient selection and message content quality. |
| `sm-handoff-context-builder-devops` | `send_message` | builder | devops | message_sent, message_quality, session_completed | Builder-initiated communication -- sharing findings with a teammate before handoff. Tests proactive communication guidance in soul prompt. |
| `sm-thread-reuse-builder-consulting` | `send_message` | builder | consulting | message_sent, thread_reused, session_completed | Seeds an existing direct thread between two agents. Second message should reuse the thread (not create a new one). Tests `findOrCreateDirectThread` reuse path. |

**3 scenarios. Justification:** MEDIUM complexity. 3 scenarios cover: PM coordination pattern, builder proactive communication, and thread reuse (the only non-trivial structural behavior).

---

### 5.10 submit_review (HIGH complexity)

**Source:** `packages/server/src/skill-tools/submit-review.ts`

**Diversity question:** Yes. The two message paths (structured ReviewPayload with artifactRef vs plain fallback) exercise different code paths. Review quality judgment varies by domain (healthcare compliance review vs marketing campaign review).

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `sr-with-artifact-builder-devops` | `submit_review` | builder | devops | review_submitted, message_type_correct, reasoning_quality, artifact_ref_present, session_completed | Full review path -- builder submits review with artifactRef linking to a seeded code_diff artifact. Tests structured ReviewPayload message type. |
| `sr-plain-fallback-builder-marketing` | `submit_review` | builder | marketing | review_submitted, reasoning_quality, session_completed | Fallback path -- builder submits review without artifactRef. Tests "plain" message type with "Review requested:" prefix. Different code path. |
| `sr-review-quality-pm-healthcare` | `submit_review` | product_manager | healthcare | review_submitted, reasoning_quality, reasoning_count, session_completed | Quality-focused -- PM reviewing healthcare compliance. LLM-as-judge evaluates reasoning thoroughness. Healthcare domain demands multi-point reasoning. |
| `sr-bet-thread-targeting-builder-frontend` | `submit_review` | builder | frontend | review_submitted, thread_host_kind_correct, session_completed | Bet thread targeting -- seeds a pre-existing bet thread. Rubric verifies the review message lands in the thread with `hostKind="bet"` and `hostId=betId`. Tests the thread management logic. |

**4 scenarios. Justification:** HIGH complexity with 2 code paths + quality dimension + thread management. 4 scenarios cover each distinct surface. The participant auto-addition is structural.

---

### 5.11 handoff_to (HIGH complexity)

**Source:** `packages/server/src/skill-tools/handoff-to.ts` + `packages/server/src/services/handoff-protocol.ts`

**Diversity question:** Yes. Three target types (toAgent, toRole, toHuman) exercise completely different code paths in handoff-protocol.ts. Status selection (completed vs blocked vs in_progress) is judgment-dependent. Context quality varies by domain.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `ht-to-agent-builder-devops` | `handoff_to` | builder | devops | handoff_called, target_correct, status_correct, context_quality, session_completed | Direct handoff to specific teammate. Tests `toAgent` path -- task ownership transfer to seeded agent. |
| `ht-to-role-builder-consulting` | `handoff_to` | builder | consulting | handoff_called, status_correct, context_quality, session_completed | Role-based handoff -- builder hands off to "product_manager" role. Tests team member lookup code path. |
| `ht-to-human-builder-healthcare` | `handoff_to` | builder | healthcare | handoff_called, human_escalation_correct, review_item_created, status_blocked, session_completed | Human escalation -- HIPAA question requiring human judgment. Tests `toHuman: true` path (task blocked + review item created). The most destructive handoff type. |
| `ht-context-quality-pm-finance` | `handoff_to` | product_manager | finance | handoff_called, remaining_work_present, artifacts_present, reason_quality, session_completed | Handoff metadata quality -- PM coordinates financial audit and hands off with detailed context. LLM-as-judge evaluates remaining_work and artifacts quality. |

**4 scenarios. Justification:** 3 distinct code paths (toAgent, toRole, toHuman) plus a quality dimension. 4 scenarios is the minimum to cover each path + quality. The escalation sub-path (toRole with no available agent creating an escalation item) is a structural outcome, not agent judgment.

---

### 5.12 route_item (MEDIUM complexity, facilitator-only)

**Source:** `packages/server/src/skill-tools/route-item.ts`

**Diversity question:** Marginally within the facilitator role. All three facilitator roles can route items, but the judgment about WHAT overrides to apply depends on the item content and domain context.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `roi-risk-override-pm-finance` | `route_item` | product_manager | finance | item_routed, risk_tier_changed, view_correct, session_completed | Risk tier override -- PM reassesses a financial compliance item from low to high. Tests risk assessment judgment. High risk routes to "conversations". |
| `roi-kind-reclassify-pf-consulting` | `route_item` | practice_facilitator | consulting | item_routed, kind_changed, view_correct, session_completed | Kind classification -- PF classifies an unclassified item as "knowledge", routing to "knowledge" view. Tests kind selection judgment. |
| `roi-verb-override-cos-marketing` | `route_item` | chief_of_staff | marketing | item_routed, verb_changed, view_correct, session_completed | Verb override -- CoS reclassifies a marketing item with `verb: "bet"`, routing to "work" view. Tests all three override dimensions are covered. |

**3 scenarios. Justification:** 3 override dimensions (riskTier, kind, verb) each exercised by a different facilitator role. Fewer than 3 would leave an override dimension untested.

---

### 5.13 score_attention (HIGH complexity, facilitator-only)

**Source:** `packages/server/src/skill-tools/score-attention.ts`

**Diversity question:** Yes across the three code paths (override on knowledge_item, recompute, item no-op). Not across roles (all facilitators use it the same way).

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `sa-override-pm-healthcare` | `score_attention` | product_manager | healthcare | score_set, score_reasonable, target_correct, session_completed | Override mode on knowledge_item -- PM prioritizes patient privacy knowledge. Tests `knowledgeStrategyFabric.attentionScore` write and score judgment. |
| `sa-recompute-pf-devops` | `score_attention` | practice_facilitator | devops | recompute_called, session_completed | Recompute mode -- PF refreshes attention scores via the attention engine. Tests mode distinction (no `score` argument required). |
| `sa-item-noop-cos-marketing` | `score_attention` | chief_of_staff | marketing | session_completed, score_attempted, no_error | Item target no-op -- CoS attempts to score an item. O2 migration dropped the column, so this is a graceful no-op. Tests degradation behavior. |

**3 scenarios. Justification:** 3 distinct code paths. Each must be tested. Fewer than 3 leaves a code path uncovered.

---

### 5.14 promote_knowledge (HIGH complexity, facilitator-only)

**Source:** `packages/server/src/skill-tools/promote-knowledge.ts`

**Diversity question:** Yes. The 8-state machine has multiple paths, and the conflict gate creates a genuinely different code path. Different facilitator roles exercise different promotion patterns (PF does triage, CoS does archival, PM encounters conflicts).

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `pk-draft-triage-pf-consulting` | `promote_knowledge` | practice_facilitator | consulting | promotion_correct, from_status_correct, reason_present, edit_log_created, session_completed | Triage workflow -- PF promotes a draft item to "active" (bypassing pipeline). The most common facilitator action. |
| `pk-pipeline-pf-devops` | `promote_knowledge` | practice_facilitator | devops | promotion_correct, from_status_correct, session_completed | Pipeline promotion -- captured to provisional. Standard pipeline path. |
| `pk-conflict-blocked-pm-healthcare` | `promote_knowledge` | product_manager | healthcare | conflict_gate_respected, session_completed, no_harmful_actions | Conflict gate -- seeds open conflict, PM attempts promotion to "validated". Tool returns CONFLICT_OPEN. Tests the safety mechanism. |
| `pk-archive-cos-marketing` | `promote_knowledge` | chief_of_staff | marketing | promotion_correct, from_status_correct, reason_present, session_completed | Archival -- CoS archives stale marketing knowledge. Tests the cleanup path. |

**4 scenarios. Justification:** 4 distinct judgment patterns in the state machine: triage (draft->active), pipeline (captured->provisional), conflict gate (blocked), and archival (stale->archived). The needs_human state is system-entered, not agent-driven. Race protection is structural.

---

### 5.15 create_conflict_review (MEDIUM complexity, facilitator-only)

**Source:** `packages/server/src/skill-tools/create-conflict-review.ts`

**Diversity question:** No. The tool works the same regardless of which facilitator role calls it. Conflict identification judgment doesn't vary meaningfully by domain.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `ccr-detect-conflict-pf-devops` | `create_conflict_review` | practice_facilitator | devops | conflict_created, proposed_body_quality, version_base_correct, session_completed | Conflict identification -- PF detects contradictory DevOps practices. Tests conflict creation with correct versionBase. |
| `ccr-dedup-guard-pm-finance` | `create_conflict_review` | product_manager | finance | dedup_respected, session_completed, no_harmful_actions | Dedup guard -- seeds existing open conflict from same agent. Tool returns DUPLICATE. Tests the dedup guard code path. |
| `ccr-version-guard-cos-consulting` | `create_conflict_review` | chief_of_staff | consulting | version_guard_respected, session_completed | Version guard -- seeds a knowledge item and instructs CoS to file conflict with versionBase ahead of current. Tool returns INVALID_INPUT. Tests the version guard. |

**3 scenarios. Justification:** 3 code paths: successful creation, dedup rejection, version rejection. Each must be tested for the interaction's eval set to be self-sufficient.

---

### 5.16 Session (HIGH complexity)

**Source:** `packages/server/src/services/session-provisioning.ts`

**Diversity question:** Yes. Model tier selection varies by agent configuration. The basic lifecycle is universal but cost tracking and workspace teardown are independent tunable surfaces.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `sess-lifecycle-growth-sales` | `session` | growth | sales | session_completed, cost_tracked, session_row_valid, task_state_correct | Full lifecycle validation: session row has state="done", outcome="completed", endedAt set; task state transitioned; bet cost tracked. The canonical integration test. |
| `sess-model-tier-builder-devops` | `session` | builder | devops | session_completed, model_tier_correct | Model tier resolution: seeds agent with `modelTierPreference: "reasoning"`. Rubric checks `sessions.modelTier = "reasoning"`. Tests the resolution chain. |
| `sess-workspace-cleanup-builder-frontend` | `session` | builder | frontend | session_completed, workspace_destroyed | Workspace teardown: verifies workspace directory no longer exists after normal completion. Tests the Phase 11 cleanup path. |

**3 scenarios. Justification:** Most of session provisioning's 11 phases are structural (not agent-judgment-dependent). 3 scenarios cover: lifecycle integration, model tier (tunable), and workspace teardown (observable side effect). Cost cap pre-flight is structural (throws before session starts).

---

### 5.17 Materialized knowledge (HIGH complexity)

**Source:** `packages/fabric/src/materialization.ts`

**Diversity question:** Yes. Different roles get different L3 items (via ROLE_TO_COMMUNITY mapping). Different tasks produce different relevance rankings.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `mk-utilization-builder-healthcare` | `materialized_knowledge` | builder | healthcare | knowledge_referenced, session_notes_quality, session_completed | Multi-layer utilization: seeds L2 (HIPAA docs), L3 (security patterns), L4 (company principles). LLM-as-judge verifies agent referenced knowledge from multiple layers. Tests workspace discoverability. |
| `mk-ranking-pm-devops` | `materialized_knowledge` | product_manager | devops | relevant_knowledge_used, irrelevant_knowledge_ignored, session_completed | Ranking effectiveness: seeds 10+ items (3 relevant, 7 irrelevant). LLM-as-judge verifies agent focused on relevant items. Tests rankAndBudget() effectiveness. |
| `mk-readonly-respect-builder-frontend` | `materialized_knowledge` | builder | frontend | session_completed, context_unmodified, no_harmful_actions | Read-only enforcement: verifies files in `context/` were not modified. Tests workspace orientation communication. |

**3 scenarios. Justification:** 3 distinct tunable surfaces: multi-layer knowledge access, relevance ranking, and read-only enforcement. Each produces different diagnostic information when scores are low.

---

### 5.18 Composed prompt (MEDIUM complexity)

**Source:** `packages/fabric/src/prompt-composition.ts`

**Diversity question:** Yes. Soul prompt identity delivery matters most for brand_voice (whose entire value is behavioral constraint). Task comprehension varies by domain complexity.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `cp-identity-brandvoice-marketing` | `composed_prompt` | brand_voice | marketing | identity_adherence, session_notes_on_brand, session_completed | Soul prompt identity delivery: detailed brand_voice soul prompt with tone guidelines. LLM-as-judge evaluates whether output reflects the brand voice. Tests the primary tunable surface of composed prompts. |
| `cp-task-comprehension-pm-legal` | `composed_prompt` | product_manager | legal | task_understood, actions_aligned, session_completed | Task section clarity: PM given complex legal compliance bet with specific done conditions. LLM-as-judge verifies actions align with task (not generic behavior). Tests task section effectiveness. |
| `cp-template-vars-pf-devops` | `composed_prompt` | practice_facilitator | devops | identity_adherence, community_correct, session_completed | Template variable substitution: PF soul prompt uses `{{community}}`. Rubric verifies agent references the correct community name in session notes. Tests the substitution mechanism. |

**3 scenarios. Justification:** 3 tunable surfaces: soul prompt identity, task comprehension, and template variable substitution. Truncation testing would require a contrived >4000-token soul prompt -- not realistic.

---

### 5.19 Tool authorization (MEDIUM complexity)

**Source:** `packages/server/src/skill-tools/tool-registry.ts` (toolsForRole, buildToolRegistry)

**Diversity question:** Yes -- the two authorization tiers (standard 11-tool vs facilitator 15-tool) exercise different code paths.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `ta-standard-agent-builder-sales` | `tool_authorization` | builder | sales | session_completed, no_unauthorized_attempts, appropriate_tools_used | Standard 11-tool set: builder completes task without attempting facilitator tools. Tests whether the composed prompt correctly signals available tools. |
| `ta-facilitator-workflow-pm-consulting` | `tool_authorization` | product_manager | consulting | facilitator_tools_used, session_completed | Facilitator 15-tool set: PM uses at least one facilitator-only tool (promote_knowledge, score_attention). Tests whether soul prompt guides facilitators to use their extra capabilities. |
| `ta-layer-enforcement-growth-marketing` | `tool_authorization` | growth | marketing | session_completed, layer_restriction_observed | Write_memory layer enforcement within the tool: growth agent writes knowledge but is restricted to L0-L2 inside write_memory handler. This is authorization within a tool, not at the registry level. Tests the inner gate. |

**3 scenarios. Justification:** 3 authorization boundaries: registry-level standard, registry-level facilitator, and handler-level (write_memory layer enforcement). Each is a different code path.

---

### 5.20 Knowledge writeback (MEDIUM complexity, new interaction)

**Source:** File watcher in `packages/fabric/src/` (startWatcher), workspace `knowledge/` zone

**Diversity question:** No. The file watcher and writeback mechanism work identically regardless of role or domain. The agent writes files to `knowledge/` and the watcher syncs them.

**How the interaction works:** During a session, the workspace has a `knowledge/` zone that is writable. If the agent writes or edits files there (as opposed to using `write_memory`), the file watcher detects changes, debounces them, and syncs them back to the DB as knowledge items. This is an implicit interaction -- no tool call, just filesystem writes.

**Testing approach:** These scenarios run through the normal `runEvalSession` path. The task instructs the agent to write knowledge files to the workspace. The rubric checks whether corresponding knowledge items appear in the DB (created by the watcher, not by the agent's tool calls).

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `kw-file-write-builder-devops` | `knowledge_writeback` | builder | devops | knowledge_file_written, db_item_synced, session_completed | Basic writeback: agent writes a markdown file to `knowledge/decisions/`. Rubric checks a corresponding knowledge item exists in the DB. Tests the watcher sync path. |
| `kw-edit-existing-builder-frontend` | `knowledge_writeback` | builder | frontend | knowledge_file_edited, db_item_updated, session_completed | Edit an existing materialized file: seeds a knowledge item that gets materialized into `knowledge/`. Agent edits the file. Rubric checks the DB item was updated. Tests the edit-writeback path. |
| `kw-ignored-zone-builder-consulting` | `knowledge_writeback` | builder | consulting | work_file_written, no_unwanted_sync, session_completed | Agent writes files to `work/` (not `knowledge/`). Rubric verifies no new knowledge items were created from work files. Tests that the watcher correctly ignores non-knowledge zones. |

**3 scenarios. Justification:** 3 distinct writeback paths: new file creation, existing file edit, and zone-boundary enforcement. The watcher debounce timing is a tunable parameter but not agent-judgment-dependent.

---

### 5.21 Built-in routines (HIGH complexity, new interaction)

**Source:** `packages/fabric/src/services/builtin-routines.ts`

**Diversity question:** Yes -- the 5 routines are fundamentally different in trigger type, output pattern, and ownership. Each exercises different code within `runBuiltinRoutine`.

**How the interaction works:** Built-in routines execute WITHOUT creating full sessions. They are functions that read DB state and write directly (items, threads, knowledge items). They are triggered by the routine scheduler (heartbeat, calendar, event) or manually via API. The eval tests these by calling `runBuiltinRoutine` directly and checking DB state afterward.

**Testing approach:** These scenarios do NOT use `runEvalSession`. They call `runBuiltinRoutine` directly after seeding the appropriate world state. This is correct because builtin routines bypass the session lifecycle -- they are NOT agent sessions.

**However**, this means the `TriggerContext` pattern from X7 doesn't apply directly. We need a new trigger pattern for non-session scenarios.

**Framework extension:** Add an alternative trigger type for non-session scenarios:

```typescript
export interface EvalScenario {
  // ...existing fields...
  readonly trigger: (ctx: TriggerContext) => Promise<TriggerResult>;
}
```

For builtin routine scenarios, the trigger function:
1. Calls `runBuiltinRoutine` directly (imported from `@hyperidle/fabric`)
2. Returns a synthetic `TriggerResult` with `outcome: "completed"` (if the routine fired) or `outcome: "crashed"` (if it didn't)
3. Sets `sessionId` to a synthetic ID (routines don't create full sessions)
4. Sets `totalCostCents: 0` and `durationMs` to the wall-clock time

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `br-cost-sentinel-warning` | `builtin_routines` | chief_of_staff | -- | routine_fired, warning_emitted, no_breach_emitted | Cost sentinel: seeds factory_settings with cost_actual at 85% of cost_cap. Calls `runBuiltinRoutine("builtin:cost-sentinel")`. Rubric checks `cost_cap_warning` event was emitted (via checking the RunBuiltinResult.emitted array). Tests the warning threshold. |
| `br-cost-sentinel-breach` | `builtin_routines` | chief_of_staff | -- | routine_fired, breach_emitted | Cost sentinel: seeds factory_settings with cost_actual at 105% of cost_cap. Tests the breach threshold and event emission. |
| `br-cost-sentinel-ok` | `builtin_routines` | chief_of_staff | -- | routine_fired, no_events_emitted | Cost sentinel: seeds cost_actual at 50% of cap. Tests the ok level (no events emitted). |
| `br-practice-meeting` | `builtin_routines` | practice_facilitator | -- | routine_fired, meeting_anchor_created | Practice meeting: calls `runBuiltinRoutine("builtin:practice-meeting")`. Rubric checks a knowledge item with `meta.role = "practice_meeting_anchor"` was created via knowledgeStrategyFabric. |
| `br-post-bet-retro-fired` | `builtin_routines` | product_manager | -- | routine_fired, review_item_created, hypothesis_present | Post-bet retro: seeds a completed bet with hypothesis. Calls `runBuiltinRoutine("builtin:post-bet-retro", { betId })`. Rubric checks a review item was created in items table with the bet's hypothesis in the body. |
| `br-post-bet-retro-dedup` | `builtin_routines` | product_manager | -- | routine_not_fired, dedup_reason | Post-bet retro dedup: seeds a bet AND an existing retro item with the `betId=<id>` marker. Calls `runBuiltinRoutine`. Should return `{ fired: false, reason: "already-retroed" }`. Tests dedup guard. |
| `br-portfolio-retro` | `builtin_routines` | chief_of_staff | -- | routine_fired, review_item_created, knowledge_summary_present | Portfolio retro: seeds L3/L4 knowledge items updated in the last 30 days. Calls `runBuiltinRoutine("builtin:portfolio-retro")`. Rubric checks review item body contains knowledge item counts. |
| `br-knowledge-decay` | `builtin_routines` | chief_of_staff | -- | routine_fired, stale_items_marked | Knowledge decay: seeds knowledge items with old `updatedAt` timestamps. Calls `runBuiltinRoutine("builtin:knowledge-decay")`. Rubric checks some items transitioned to "stale" status. |

**8 scenarios. Justification:** 5 routines with 8 scenarios. Cost sentinel needs 3 (warning/breach/ok are genuinely different level states that exercise different code branches in `classifyLevel`). Post-bet retro needs 2 (fire + dedup are different code paths). Practice meeting, portfolio retro, and knowledge decay need 1 each (single code path each, deterministic output). This is a HIGH complexity interaction with multiple independent handlers -- 8 is the minimum for coverage.

---

### 5.22 Routine sessions (MEDIUM complexity, new interaction)

**Source:** `packages/fabric/src/services/routine-scheduler.ts` (`createRoutineSession`, `checkAndFireRoutine`)

**Diversity question:** No. Routine sessions are lightweight sessions (no workspace, no materialization) that work identically regardless of the agent's role.

**How the interaction works:** The routine scheduler calls `createRoutineSession` which inserts a session row with `state: "active"` and no workspace. When `humanReview` is true on the routine, `createReviewItem` creates an item + thread for human oversight.

**Testing approach:** Seed a routine with the appropriate trigger config, then call `checkAndFireRoutine` directly. Check that a session row was created and the routine's timestamps were updated.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `rs-heartbeat-fire` | `routine_sessions` | chief_of_staff | -- | session_created, routine_timestamps_updated, next_run_computed | Heartbeat trigger: seeds a routine with `triggerType: "heartbeat"`, `intervalSeconds: 900`. Calls `checkAndFireRoutine`. Rubric checks: sessions row created, `routines.lastRunAt` set, `routines.nextRunAt` = lastRunAt + 900s. |
| `rs-calendar-fire` | `routine_sessions` | practice_facilitator | -- | session_created, routine_timestamps_updated | Calendar trigger: seeds a routine with `triggerType: "calendar"`, cron expression for past time. Calls `checkAndFireRoutine`. Rubric checks session created and nextRunAt computed from cron expression. |
| `rs-human-review-flag` | `routine_sessions` | product_manager | -- | session_created, review_item_created | humanReview: seeds a routine with `humanReview: true`. Calls `checkAndFireRoutine`. Rubric checks both a session and a review item were created. |
| `rs-cost-cap-blocked` | `routine_sessions` | chief_of_staff | -- | session_not_created, routine_not_fired | Cost cap blocking: seeds factory_settings with cost_actual >= cost_cap. Calls `checkAndFireRoutine`. Rubric checks no session was created (routine skipped). Tests the cost cap pre-flight in the scheduler. |

**4 scenarios. Justification:** 4 distinct code paths in `checkAndFireRoutine`: heartbeat fire, calendar fire, humanReview flag, and cost cap block. Each produces different observable state.

---

### 5.23 Skill autonomy (MEDIUM complexity, new interaction)

**Source:** `packages/db/src/schema.ts` (`userSkills` table), `packages/fabric/src/services/routine-scheduler.ts` (autonomyLevel on routines)

**Diversity question:** No. The autonomy progression (L1-L4) works identically regardless of role or domain. The judgment surface is in the threshold logic and review item gating.

**How the interaction works:** The `userSkills` table tracks per-agent per-skill autonomy levels (L1-L4) with success/failure counts. At L1, routine output produces a review item for human approval. At L4, the routine runs silently. The `routines.autonomyLevel` field determines the current operating level.

**Testing approach:** Seed userSkills rows at different autonomy levels, seed routines with matching skillIds, then verify that the correct review-item gating occurs.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `ska-l1-review-required` | `skill_autonomy` | practice_facilitator | -- | routine_fired, review_item_created, autonomy_level_correct | L1 autonomy: seeds userSkill at L1 and routine with `humanReview: true`. Fires routine. Rubric checks review item was created (L1 = every run needs human review). |
| `ska-l4-silent` | `skill_autonomy` | chief_of_staff | -- | routine_fired, no_review_item, autonomy_level_correct | L4 autonomy: seeds userSkill at L4 and routine with `silent: true`. Fires routine. Rubric checks NO review item was created (L4 = silent execution). |
| `ska-success-tracking` | `skill_autonomy` | product_manager | -- | skill_record_exists, counts_correct | Success/failure tracking: seeds userSkill with successCount=4, failureCount=1. Verifies the record exists and counts are correct. Foundation for promotion logic. |

**3 scenarios. Justification:** 3 observable states: L1 with review gating, L4 silent execution, and success/failure counter integrity. The promotion threshold logic (when to advance from L1 to L2) is application logic that doesn't exist in the codebase yet -- it would be tested when implemented. These scenarios validate the data model and gating behavior.

---

### 5.24 Delegation (MEDIUM complexity, new interaction)

**Source:** `packages/fabric/src/services/routine-scheduler.ts` (`findDelegate`, WIP check, delegation logic in `checkAndFireRoutine`)

**Diversity question:** No. Delegation works identically regardless of domain. The code path depends only on: is the owner at WIP limit? Is delegation allowed? Does a teammate with the skill exist?

**How the interaction works:** When `checkAndFireRoutine` runs and the routine owner is at their WIP limit (`maxConcurrentSessions`), the scheduler checks `delegationAllowed`. If true and the routine has a `skillId`, `findDelegate` searches `userSkills` for another agent with the same skill who is NOT at their WIP limit. If found, the session runs under the delegate. If not found, the routine is deferred.

**Testing approach:** Seed two agents with the same skill. Put the owner at WIP limit (seed an active session). Enable delegation. Call `checkAndFireRoutine`.

**Scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `del-successful-delegation` | `delegation` | chief_of_staff | -- | routine_fired, delegate_used, session_agent_correct | Successful delegation: owner at WIP limit, delegate available. Rubric checks session was created with the delegate's agentId (not the owner's). |
| `del-no-delegate-available` | `delegation` | chief_of_staff | -- | routine_not_fired, deferred_reason | No delegate: owner at WIP limit, only candidate also at WIP limit. Rubric checks routine NOT fired with reason "owner at WIP limit, no delegate available". |
| `del-delegation-not-allowed` | `delegation` | practice_facilitator | -- | routine_not_fired, deferred_reason | Delegation disabled: owner at WIP limit, `delegationAllowed: false`. Rubric checks routine NOT fired with reason "owner at WIP limit, delegation not allowed". |

**3 scenarios. Justification:** 3 code paths in the delegation logic: successful delegation, no delegate available, delegation not allowed. Each produces a different `FireResult`. This is the complete branching tree.

---

## 6. Summary table: all scenarios

| # | ID | Feature | Role | Domain | Key rubric dimensions | Tags |
|---|---|---------|------|--------|----------------------|------|
| 1 | `wm-kind-selection-builder-devops` | `write_memory` | builder | devops | kind_correctness, body_quality, layer_correctness | quick |
| 2 | `wm-layer-enforcement-growth-marketing` | `write_memory` | growth | marketing | layer_restricted, fallback_behavior, session_completed | |
| 3 | `wm-facilitator-l4-cos-consulting` | `write_memory` | chief_of_staff | consulting | layer_correctness, kind_correctness, scope_correctness | |
| 4 | `wm-reflection-brandvoice-marketing` | `write_memory` | brand_voice | marketing | kind_correctness, body_quality, brand_consistency | |
| 5 | `qp-proactive-search-builder-frontend` | `query_practice` | builder | frontend | knowledge_referenced, session_notes_quality, session_completed | quick |
| 6 | `qp-facilitator-curation-pf-devops` | `query_practice` | practice_facilitator | devops | knowledge_referenced, curation_quality, session_completed | |
| 7 | `qp-layer-filter-pm-finance` | `query_practice` | product_manager | finance | knowledge_referenced, session_completed | |
| 8 | `wsn-quality-growth-sales` | `write_session_notes` | growth | sales | notes_written, notes_quality, session_completed | quick |
| 9 | `wsn-append-builder-devops` | `write_session_notes` | builder | devops | notes_written, notes_appended, session_completed | |
| 10 | `ca-code-diff-builder-devops` | `create_artifact` | builder | devops | artifact_created, kind_correctness, preview_valid, session_completed | |
| 11 | `ca-decision-pm-healthcare` | `create_artifact` | product_manager | healthcare | artifact_created, kind_correctness, decision_quality, session_completed | |
| 12 | `ca-verification-builder-frontend` | `create_artifact` | builder | frontend | artifact_created, kind_correctness, preview_valid, session_completed | |
| 13 | `ci-escalation-builder-finance` | `create_item` | builder | finance | item_created, kind_correctness, risk_tier_assessment, reasoning_present, session_completed | |
| 14 | `ci-knowledge-proposal-builder-consulting` | `create_item` | builder | consulting | item_created, kind_correctness, view_routed_correctly, body_quality, session_completed | |
| 15 | `ci-review-request-builder-frontend` | `create_item` | builder | frontend | item_created, kind_correctness, risk_tier_assessment, session_completed | |
| 16 | `ci-work-item-pm-devops` | `create_item` | product_manager | devops | item_created, kind_correctness, view_routed_correctly, blocking_flag, session_completed | |
| 17 | `ci-chat-growth-marketing` | `create_item` | growth | marketing | item_created, kind_correctness, view_routed_correctly, session_completed | |
| 18 | `ct-decomposition-pm-marketing` | `create_task` | product_manager | marketing | tasks_created, decomposition_quality, done_conditions_present, task_titles_descriptive, session_completed | quick |
| 19 | `ct-subtask-builder-devops` | `create_task` | builder | devops | tasks_created, task_relevant, done_conditions_present, session_completed | |
| 20 | `ct-decomposition-pm-healthcare` | `create_task` | product_manager | healthcare | tasks_created, decomposition_quality, done_conditions_present, session_completed | |
| 21 | `lt-progress-tracking-builder-legal` | `log_task` | builder | legal | notes_logged, notes_quality, session_completed | quick |
| 22 | `lt-multi-entry-builder-devops` | `log_task` | builder | devops | notes_logged, multiple_entries, session_completed | |
| 23 | `lt-discovery-pm-consulting` | `log_task` | product_manager | consulting | notes_logged, notes_quality, session_completed | |
| 24 | `ri-check-and-respond-pm-consulting` | `read_inbox` | product_manager | consulting | inbox_checked, message_responded, session_completed | |
| 25 | `ri-empty-inbox-builder-devops` | `read_inbox` | builder | devops | session_completed, no_harmful_actions | quick |
| 26 | `ri-multiple-threads-builder-frontend` | `read_inbox` | builder | frontend | inbox_checked, correct_thread_responded, session_completed | |
| 27 | `sm-coordination-pm-frontend` | `send_message` | product_manager | frontend | message_sent, recipient_correct, message_quality, session_completed | |
| 28 | `sm-handoff-context-builder-devops` | `send_message` | builder | devops | message_sent, message_quality, session_completed | |
| 29 | `sm-thread-reuse-builder-consulting` | `send_message` | builder | consulting | message_sent, thread_reused, session_completed | |
| 30 | `sr-with-artifact-builder-devops` | `submit_review` | builder | devops | review_submitted, message_type_correct, reasoning_quality, artifact_ref_present, session_completed | |
| 31 | `sr-plain-fallback-builder-marketing` | `submit_review` | builder | marketing | review_submitted, reasoning_quality, session_completed | |
| 32 | `sr-review-quality-pm-healthcare` | `submit_review` | product_manager | healthcare | review_submitted, reasoning_quality, reasoning_count, session_completed | |
| 33 | `sr-bet-thread-targeting-builder-frontend` | `submit_review` | builder | frontend | review_submitted, thread_host_kind_correct, session_completed | |
| 34 | `ht-to-agent-builder-devops` | `handoff_to` | builder | devops | handoff_called, target_correct, status_correct, context_quality, session_completed | |
| 35 | `ht-to-role-builder-consulting` | `handoff_to` | builder | consulting | handoff_called, status_correct, context_quality, session_completed | |
| 36 | `ht-to-human-builder-healthcare` | `handoff_to` | builder | healthcare | handoff_called, human_escalation_correct, review_item_created, status_blocked, session_completed | |
| 37 | `ht-context-quality-pm-finance` | `handoff_to` | product_manager | finance | handoff_called, remaining_work_present, artifacts_present, reason_quality, session_completed | |
| 38 | `roi-risk-override-pm-finance` | `route_item` | product_manager | finance | item_routed, risk_tier_changed, view_correct, session_completed | |
| 39 | `roi-kind-reclassify-pf-consulting` | `route_item` | practice_facilitator | consulting | item_routed, kind_changed, view_correct, session_completed | |
| 40 | `roi-verb-override-cos-marketing` | `route_item` | chief_of_staff | marketing | item_routed, verb_changed, view_correct, session_completed | |
| 41 | `sa-override-pm-healthcare` | `score_attention` | product_manager | healthcare | score_set, score_reasonable, target_correct, session_completed | |
| 42 | `sa-recompute-pf-devops` | `score_attention` | practice_facilitator | devops | recompute_called, session_completed | |
| 43 | `sa-item-noop-cos-marketing` | `score_attention` | chief_of_staff | marketing | session_completed, score_attempted, no_error | |
| 44 | `pk-draft-triage-pf-consulting` | `promote_knowledge` | practice_facilitator | consulting | promotion_correct, from_status_correct, reason_present, edit_log_created, session_completed | quick |
| 45 | `pk-pipeline-pf-devops` | `promote_knowledge` | practice_facilitator | devops | promotion_correct, from_status_correct, session_completed | |
| 46 | `pk-conflict-blocked-pm-healthcare` | `promote_knowledge` | product_manager | healthcare | conflict_gate_respected, session_completed, no_harmful_actions | |
| 47 | `pk-archive-cos-marketing` | `promote_knowledge` | chief_of_staff | marketing | promotion_correct, from_status_correct, reason_present, session_completed | |
| 48 | `ccr-detect-conflict-pf-devops` | `create_conflict_review` | practice_facilitator | devops | conflict_created, proposed_body_quality, version_base_correct, session_completed | |
| 49 | `ccr-dedup-guard-pm-finance` | `create_conflict_review` | product_manager | finance | dedup_respected, session_completed, no_harmful_actions | |
| 50 | `ccr-version-guard-cos-consulting` | `create_conflict_review` | chief_of_staff | consulting | version_guard_respected, session_completed | |
| 51 | `sess-lifecycle-growth-sales` | `session` | growth | sales | session_completed, cost_tracked, session_row_valid, task_state_correct | |
| 52 | `sess-model-tier-builder-devops` | `session` | builder | devops | session_completed, model_tier_correct | quick |
| 53 | `sess-workspace-cleanup-builder-frontend` | `session` | builder | frontend | session_completed, workspace_destroyed | |
| 54 | `mk-utilization-builder-healthcare` | `materialized_knowledge` | builder | healthcare | knowledge_referenced, session_notes_quality, session_completed | |
| 55 | `mk-ranking-pm-devops` | `materialized_knowledge` | product_manager | devops | relevant_knowledge_used, irrelevant_knowledge_ignored, session_completed | |
| 56 | `mk-readonly-respect-builder-frontend` | `materialized_knowledge` | builder | frontend | session_completed, context_unmodified, no_harmful_actions | quick |
| 57 | `cp-identity-brandvoice-marketing` | `composed_prompt` | brand_voice | marketing | identity_adherence, session_notes_on_brand, session_completed | |
| 58 | `cp-task-comprehension-pm-legal` | `composed_prompt` | product_manager | legal | task_understood, actions_aligned, session_completed | |
| 59 | `cp-template-vars-pf-devops` | `composed_prompt` | practice_facilitator | devops | identity_adherence, community_correct, session_completed | |
| 60 | `ta-standard-agent-builder-sales` | `tool_authorization` | builder | sales | session_completed, no_unauthorized_attempts, appropriate_tools_used | quick |
| 61 | `ta-facilitator-workflow-pm-consulting` | `tool_authorization` | product_manager | consulting | facilitator_tools_used, session_completed | |
| 62 | `ta-layer-enforcement-growth-marketing` | `tool_authorization` | growth | marketing | session_completed, layer_restriction_observed | |
| 63 | `kw-file-write-builder-devops` | `knowledge_writeback` | builder | devops | knowledge_file_written, db_item_synced, session_completed | |
| 64 | `kw-edit-existing-builder-frontend` | `knowledge_writeback` | builder | frontend | knowledge_file_edited, db_item_updated, session_completed | |
| 65 | `kw-ignored-zone-builder-consulting` | `knowledge_writeback` | builder | consulting | work_file_written, no_unwanted_sync, session_completed | |
| 66 | `br-cost-sentinel-warning` | `builtin_routines` | chief_of_staff | -- | routine_fired, warning_emitted, no_breach_emitted | quick |
| 67 | `br-cost-sentinel-breach` | `builtin_routines` | chief_of_staff | -- | routine_fired, breach_emitted | |
| 68 | `br-cost-sentinel-ok` | `builtin_routines` | chief_of_staff | -- | routine_fired, no_events_emitted | |
| 69 | `br-practice-meeting` | `builtin_routines` | practice_facilitator | -- | routine_fired, meeting_anchor_created | |
| 70 | `br-post-bet-retro-fired` | `builtin_routines` | product_manager | -- | routine_fired, review_item_created, hypothesis_present | |
| 71 | `br-post-bet-retro-dedup` | `builtin_routines` | product_manager | -- | routine_not_fired, dedup_reason | |
| 72 | `br-portfolio-retro` | `builtin_routines` | chief_of_staff | -- | routine_fired, review_item_created, knowledge_summary_present | |
| 73 | `br-knowledge-decay` | `builtin_routines` | chief_of_staff | -- | routine_fired, stale_items_marked | |
| 74 | `rs-heartbeat-fire` | `routine_sessions` | chief_of_staff | -- | session_created, routine_timestamps_updated, next_run_computed | |
| 75 | `rs-calendar-fire` | `routine_sessions` | practice_facilitator | -- | session_created, routine_timestamps_updated | |
| 76 | `rs-human-review-flag` | `routine_sessions` | product_manager | -- | session_created, review_item_created | |
| 77 | `rs-cost-cap-blocked` | `routine_sessions` | chief_of_staff | -- | session_not_created, routine_not_fired | |
| 78 | `ska-l1-review-required` | `skill_autonomy` | practice_facilitator | -- | routine_fired, review_item_created, autonomy_level_correct | |
| 79 | `ska-l4-silent` | `skill_autonomy` | chief_of_staff | -- | routine_fired, no_review_item, autonomy_level_correct | |
| 80 | `ska-success-tracking` | `skill_autonomy` | product_manager | -- | skill_record_exists, counts_correct | |
| 81 | `del-successful-delegation` | `delegation` | chief_of_staff | -- | routine_fired, delegate_used, session_agent_correct | |
| 82 | `del-no-delegate-available` | `delegation` | chief_of_staff | -- | routine_not_fired, deferred_reason | |
| 83 | `del-delegation-not-allowed` | `delegation` | practice_facilitator | -- | routine_not_fired, deferred_reason | |

**Total: 83 scenarios** across 24 features (+ 1 existing POC = 84 total).

### Role coverage

| Role | Scenario count |
|------|---------------|
| builder | 28 |
| growth | 5 |
| brand_voice | 2 |
| product_manager | 19 |
| practice_facilitator | 11 |
| chief_of_staff | 14 |

All 6 roles are exercised. Builder has the most (primary worker role, uses more interactions in more varied contexts per the concept). CoS and PF are heavily represented in the new interactions (20-24) because routines and knowledge governance are their primary work.

### Domain coverage

| Domain | Scenario count |
|--------|---------------|
| devops | 17 |
| frontend | 10 |
| marketing | 10 |
| sales | 4 |
| finance | 5 |
| legal | 3 |
| healthcare | 8 |
| consulting | 9 |
| (no domain) | 17 |

The 17 "no domain" scenarios are the new interactions (20-24) which are system-level (routines, delegation, skill autonomy) and do not involve domain-specific agent judgment.

### Per-feature scenario counts

| Feature | Count | Justification |
|---------|-------|---------------|
| write_memory | 4 | 3 code paths + soul prompt axis |
| query_practice | 3 | Minimum for stability |
| write_session_notes | 2+POC=3 | LOW complexity |
| create_artifact | 3 | 3 preview shape families |
| create_item | 5 | HIGH, 5 agent-initiated kinds |
| create_task | 3 | 2 patterns + domain diversity |
| log_task | 3 | Minimum for stability |
| read_inbox | 3 | Primary + empty + multi-thread |
| send_message | 3 | 2 patterns + thread reuse |
| submit_review | 4 | 2 code paths + quality + thread |
| handoff_to | 4 | 3 code paths + quality |
| route_item | 3 | 3 override dimensions |
| score_attention | 3 | 3 code paths |
| promote_knowledge | 4 | 4 state machine paths |
| create_conflict_review | 3 | 3 code paths |
| session | 3 | Lifecycle + tier + cleanup |
| materialized_knowledge | 3 | Utilization + ranking + readonly |
| composed_prompt | 3 | Identity + task + template vars |
| tool_authorization | 3 | Standard + facilitator + inner gate |
| knowledge_writeback | 3 | Create + edit + zone boundary |
| builtin_routines | 8 | 5 routines, 8 paths |
| routine_sessions | 4 | 4 code paths |
| skill_autonomy | 3 | L1/L4/counters |
| delegation | 3 | 3 branching outcomes |

---

## 7. Implementation tasks (ordered)

### Phase 1: Framework extensions (no scenario code)

**Task 1.1:** Add `feature` field to `EvalScenario` in `packages/eval/src/types.ts`. Add `FeatureBreakdown` interface. Add `featureBreakdown` field to `EvalReport`.

**Task 1.2:** Add `--feature` / `-f` flag to CLI (`packages/eval/src/cli.ts`). Add `feature` to `RunOptions` and `CliArgs`. Add feature filtering to `runner.ts` after scenario filtering. Add zero-match feature discovery (print available features to stderr).

**Task 1.3:** Add feature breakdown computation to `runner.ts` after all scenarios complete. Group by `feature`, compute average score per group.

**Task 1.4:** Update existing POC scenario to include `feature: "write_session_notes"`.

**Task 1.5:** Update `discoverScenarios` in `runner.ts` to handle array exports:

```typescript
for (const value of Object.values(mod)) {
  if (isEvalScenario(value)) {
    scenarios.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (isEvalScenario(item)) {
        scenarios.push(item);
      }
    }
  }
}
```

### Phase 2: Seeding library extensions

**Task 2.1:** Add `seedThread` to `packages/eval/src/seeding.ts`.

**Task 2.2:** Add `seedMessage` to `packages/eval/src/seeding.ts`.

**Task 2.3:** Add `seedItem` to `packages/eval/src/seeding.ts`.

**Task 2.4:** Add `seedArtifact` to `packages/eval/src/seeding.ts`.

**Task 2.5:** Add `seedConflict` to `packages/eval/src/seeding.ts`.

**Task 2.6:** Add `seedRoutine` to `packages/eval/src/seeding.ts`.

**Task 2.7:** Add `seedUserSkill` to `packages/eval/src/seeding.ts`.

**Task 2.8:** Add `seedMultiAgentWorld` to `packages/eval/src/seeding.ts`.

### Phase 3: Judge factory library

**Task 3.1:** Create `packages/eval/src/judges.ts` with all reusable judge factories listed in Section 4.

**Task 3.2:** Refactor POC scenario (`poc-session-notes.ts`) to use extracted judge factories where applicable.

### Phase 4: Scenario files

**File structure:**

```
packages/eval/src/scenarios/
  index.ts                          # Updated with all new exports
  poc-session-notes.ts              # Existing (updated with feature field)
  write-memory.ts                   # 4 scenarios
  query-practice.ts                 # 3 scenarios
  write-session-notes.ts            # 2 scenarios (wsn-quality, wsn-append)
  create-artifact.ts                # 3 scenarios
  create-item.ts                    # 5 scenarios
  create-task.ts                    # 3 scenarios
  log-task.ts                       # 3 scenarios
  read-inbox.ts                     # 3 scenarios
  send-message.ts                   # 3 scenarios
  submit-review.ts                  # 4 scenarios
  handoff-to.ts                     # 4 scenarios
  route-item.ts                     # 3 scenarios
  score-attention.ts                # 3 scenarios
  promote-knowledge.ts              # 4 scenarios
  create-conflict-review.ts         # 3 scenarios
  session.ts                        # 3 scenarios
  materialized-knowledge.ts         # 3 scenarios
  composed-prompt.ts                # 3 scenarios
  tool-authorization.ts             # 3 scenarios
  knowledge-writeback.ts            # 3 scenarios
  builtin-routines.ts               # 8 scenarios
  routine-sessions.ts               # 4 scenarios
  skill-autonomy.ts                 # 3 scenarios
  delegation.ts                     # 3 scenarios
```

Each file exports an array of `EvalScenario` objects:

```typescript
// scenarios/write-memory.ts
export const writeMemoryScenarios: EvalScenario[] = [
  wmKindSelection,
  wmLayerEnforcement,
  wmFacilitatorL4,
  wmReflectionBrandvoice,
];

// scenarios/index.ts
export { default as pocSessionNotes } from "./poc-session-notes.js";
export { writeMemoryScenarios } from "./write-memory.js";
// ... etc
```

**Implementation order within Phase 4:**

1. **Non-session scenarios first** (new interactions 20-24 that don't require runEvalSession): `builtin-routines.ts`, `routine-sessions.ts`, `skill-autonomy.ts`, `delegation.ts`
2. **LOW complexity features** (quick wins): `write-session-notes.ts`, `log-task.ts`, `query-practice.ts`
3. **MEDIUM complexity**: `write-memory.ts`, `create-artifact.ts`, `create-task.ts`, `read-inbox.ts`, `send-message.ts`, `route-item.ts`, `create-conflict-review.ts`, `tool-authorization.ts`, `composed-prompt.ts`, `knowledge-writeback.ts`
4. **HIGH complexity** (depend on seeding helpers and judge factories): `create-item.ts`, `submit-review.ts`, `handoff-to.ts`, `promote-knowledge.ts`, `score-attention.ts`, `session.ts`, `materialized-knowledge.ts`

### Phase 5: Validation

**Task 5.1:** Run `npm run check` -- zero type errors.

**Task 5.2:** Run `npm run lint` -- zero lint errors.

**Task 5.3:** Run `npm run test` -- all existing tests pass (eval scenarios are NOT tests; they don't run in `npm run test`).

**Task 5.4:** Run `npm run eval -- --feature write_session_notes` -- verify feature filtering works and POC scenario runs.

**Task 5.5:** Run `npm run eval -- --quick` -- verify quick-tagged scenarios run.

---

## 8. Risks and mitigations

### R1: Eval cost at scale

**Risk:** 83 scenarios x real LLM calls = significant API cost per full suite run.

**Mitigation:** Tag 10 scenarios as `quick` (see Tags column in summary table). `--quick` mode runs ~10 scenarios for rapid iteration. Full suite for milestone checks. Default model is OpenRouter with DeepSeek v4 Pro (~$0.01-0.05 per scenario), so full suite costs ~$1-4. The non-session scenarios (20-24) that call service functions directly cost $0 in LLM calls.

### R2: Non-session scenarios don't fit the existing trigger pattern

**Risk:** The X7 framework assumes every scenario runs through `provisionSession`. Built-in routine scenarios, routine session scenarios, skill autonomy scenarios, and delegation scenarios call service functions directly -- they don't create full agent sessions.

**Mitigation:** These scenarios still implement the `EvalScenario` interface. Their `trigger` function calls the service function directly (e.g., `runBuiltinRoutine`) and returns a synthetic `TriggerResult`. The `seedResult.workspaceBasePath` is set to a temp dir (unused). The `sessionId` is synthetic. Cost is 0. Duration is wall-clock time of the service call. This works because the `EvalScenario` interface only requires that `trigger` returns a `TriggerResult` -- it doesn't mandate that `provisionSession` was called.

### R3: LLM-as-judge consistency

**Risk:** LLM-as-judge dimensions produce non-deterministic scores across runs.

**Mitigation:** LLM-as-judge dimensions use binary criteria where possible ("does the text contain reference X?") and anchored gradation when needed ("Score 1.0 if 3 of 3, 0.5 if 2 of 3, 0.0 otherwise"). The `judgeLlmQuality` factory enforces this pattern.

### R4: Flaky scenarios due to agent non-determinism

**Risk:** An agent may or may not call a specific tool depending on model mood.

**Mitigation:** Task prompts are highly directive ("Use the write_memory tool to capture..."). When a well-prompted agent still doesn't call the expected tool, that's a real signal that the tool description needs improvement -- which is exactly what evals measure.

### R5: Data model drift

**Risk:** Schema changes break rubric dimensions.

**Mitigation:** Every rubric dimension in this architecture has been verified against `packages/db/src/schema.ts`. Known dropped columns documented in the reconciliation table. The `createRoutineSession` cost: 0 issue is flagged (sessions table has no cost column; Drizzle silently drops it).

### R6: Knowledge writeback watcher timing

**Risk:** The file watcher debounce means writeback scenarios may need to wait for the watcher to process file changes before checking DB state.

**Mitigation:** The `runEvalSession` trigger already waits for session completion (which includes watcher teardown via `endSession`). By the time the rubric judges run, the watcher has processed all pending changes. If timing issues arise, the trigger can add a small delay before returning.

### R7: Feature filter discoverability

**Risk:** Developers don't know valid feature names.

**Mitigation:** When `--feature` matches zero scenarios, the CLI prints available features extracted from loaded scenarios.

---

## 9. Self-critique

### Strengths
- Every rubric dimension references a verified DB column or uses LLM-as-judge with explicit criteria
- Scenario count per feature is justified by code path analysis and diversity question, not formula
- All 6 roles are covered; builder has the most (28) reflecting its primary worker status
- New interactions (20-24) are thoroughly covered with 21 dedicated scenarios
- Non-session scenarios (builtin routines, routine sessions, skill autonomy, delegation) have a clean integration strategy via synthetic TriggerResult
- The costEstimate/attentionScore/sessions.cost data model pitfalls are all documented and avoided

### Weaknesses
- 83 scenarios is a large surface area. The builder should prioritize Phase 4 by implementing non-session scenarios first (they're cheapest to validate -- no LLM calls), then LOW complexity, then MEDIUM, then HIGH.
- LLM-as-judge dimensions add variance. A future workpackage could introduce cached judge baselines.
- `read_inbox` and `query_practice` scenarios rely on LLM-as-judge for observable effects since these tools are read-only. This is the weakest signal in the library.
- The knowledge writeback scenarios (#63-65) depend on the file watcher actually running during eval sessions. If the watcher has issues in the PGlite test environment, these scenarios may not produce observable DB state.

### What I considered and rejected
- **More than 83 scenarios:** Could add more domain variants per tool, but that tests domain judgment, not HyperIdle features. The concept doc says diversity should detect whether a change helps broadly -- 2-4 domains per feature achieves this.
- **Mock-based scenarios:** Rejected per spec: "Nothing is mocked."
- **Cross-tool integration scenarios:** Rejected because each scenario tests one interaction from one angle (concept principle 2).
- **Fewer scenarios for new interactions (20-24):** Considered 1-2 per interaction but rejected because these interactions represent the CoS and PF's primary work patterns and need self-sufficient eval sets per the diversity principle.
- **A separate trigger interface for non-session scenarios:** Considered a `DirectTrigger` type, but the synthetic `TriggerResult` approach reuses the existing interface with no framework changes. YAGNI.

---

## 10. Model comparison matrix

Produced by running the same scenarios with different models:

```bash
npm run eval -- --model claude-sonnet-4-6 --output eval-sonnet.json
npm run eval -- --model claude-haiku-4-5 --output eval-haiku.json
npm run eval -- --model deepseek/deepseek-v4-pro --output eval-deepseek.json
```

Each report includes `featureBreakdown` (per-interaction average scores). The matrix IS the set of reports -- each report is a row, each interaction is a column group. Compare `featureBreakdown[feature].averageScore` across model reports to identify which interactions degrade on cheaper models.

Non-session scenarios (builtin_routines, routine_sessions, skill_autonomy, delegation) are deterministic -- they produce the same scores regardless of model since no LLM call is involved. These serve as a control group: if their scores change between runs, the framework has a bug.

A `--compare` flag that reads multiple reports and prints a diff table is deferred (follow-up).

---

## 11. Expanded cross-cutting interactions

Sections 5.16, 5.17, and 5.18 defined 3 scenarios each for Session, Materialized knowledge, and Composed prompt. These are insufficient. These three interactions are **cross-cutting foundations** -- they establish the base context that every tool call sits on top of. A session with cost pressure changes how the agent uses every tool. Rich materialized knowledge changes how the agent decomposes tasks. A strong soul prompt constrains tool selection across the board.

The original 9 scenarios tested each foundation in isolation. The expanded set adds **combined evals** that test how each foundation affects tool usage and agent behavior. When a combined eval scores low, the diagnostic tells us which foundation is failing to influence agent behavior -- not which tool is broken.

### Design principle for combined evals

A combined eval has two layers:

1. **Foundation layer** -- seeds the cross-cutting condition (cost pressure, rich knowledge, strong soul prompt).
2. **Tool layer** -- observes whether the condition changed tool usage via standard rubric dimensions on the tool's DB side effects.

The rubric always includes at least one dimension that measures the cross-cutting effect (did cost pressure change behavior?) alongside the standard tool-correctness dimensions (did the tool call succeed?). This means a combined eval can fail in two independent ways: the tool might break (regression in the tool handler) or the foundation might fail to influence behavior (regression in prompt composition, materialization, or session lifecycle).

### Seeding patterns for combined evals

Combined evals use `seedMinimalWorld` plus targeted overrides:

- **Cost pressure**: `seedBet({ costAppetiteMinor: 200 })` + `seedAgent({ costCapMinor: 500 })` to create a bet near its budget ceiling.
- **Rich knowledge**: multiple `seedKnowledge()` calls across L2/L3/L4 layers with domain-specific content.
- **Sparse knowledge**: `seedMinimalWorld` with the default single factory-level item (the baseline for comparison).
- **Strong soul prompt**: custom `agentSoulPrompt` with explicit behavioral constraints and identity markers.
- **Truncated prompt**: deliberately oversized soul prompt (>4000 tokens persona + tools) to trigger `truncatePersona()`.

---

### 11.1 Session -- expanded (HIGH complexity)

**Source:** `packages/server/src/services/session-provisioning.ts`

The original 3 scenarios (5.16) test the session lifecycle in isolation: basic completion, model tier resolution, workspace cleanup. The expanded set tests how session parameters (cost pressure, planning context, session duration) affect tool usage quality across the session.

**Tunable surfaces exercised by the expanded set:**

| Surface | Where | What changes |
|---------|-------|-------------|
| Cost cap proximity | `cost-cap.ts:checkCostCap()`, `recordCostAndCheck()` | Agent sees a bet with costAppetiteMinor near costActual. Does it work more efficiently? |
| Planning turn | Soul prompt: "Plan before executing" | Agent given explicit planning instruction. Does it produce better task decomposition? |
| Reflection checkpoint | Soul prompt: "After completing a subtask, reflect on what you learned" | Agent given reflection instruction. Does it produce higher quality knowledge capture? |
| Bet appetite context | `session-context.ts:buildSessionContextData()` → `bet.appetite` field | Agent sees a "small batch" vs "big batch" appetite. Does it adjust scope? |
| Cost tracking observability | `cost-cap.ts:recordCostAndCheck()` → `cost_cap_warning` event | Session near cost cap emits warning. Does agent behavior change after warning? |
| Multi-session history | Seeded prior sessions on the same task | Agent sees task with prior session history. Does it avoid repeating work? |

**Expanded scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `sess-lifecycle-growth-sales` | `session` | growth | sales | session_completed, cost_tracked, session_row_valid, task_state_correct | (Existing) Full lifecycle validation. |
| `sess-model-tier-builder-devops` | `session` | builder | devops | session_completed, model_tier_correct | (Existing) Model tier resolution. |
| `sess-workspace-cleanup-builder-frontend` | `session` | builder | frontend | session_completed, workspace_destroyed | (Existing) Workspace teardown. |
| `sess-cost-pressure-builder-devops` | `session` | builder | devops | session_completed, cost_tracked, efficiency_improved, fewer_tool_calls | **Combined with tool usage.** Seeds bet with costAppetiteMinor=300 (low) and a task that could reasonably use 3-5 tool calls. Rubric checks: (a) session completed, (b) agent used fewer tool calls than the baseline `sess-lifecycle` scenario for comparable output quality, (c) session notes mention cost awareness. LLM-as-judge on session notes for cost-aware reasoning. Tests whether `bet.appetite` in the composed prompt influences agent frugality. |
| `sess-cost-pressure-pm-marketing` | `session` | product_manager | marketing | session_completed, cost_tracked, decomposition_efficiency, tasks_created | **Combined with create_task.** PM given a bet with costAppetiteMinor=400 and a complex marketing campaign to decompose. Rubric checks: (a) tasks created, (b) decomposition is scoped to the budget (not 15 subtasks for a $4 budget), (c) session notes reference budget constraint. LLM-as-judge on task count vs budget proportionality. Tests whether cost context shapes PM coordination judgment. |
| `sess-planning-turn-pm-healthcare` | `session` | product_manager | healthcare | session_completed, tasks_created, decomposition_quality, planning_evidence | **Combined with create_task.** PM soul prompt includes "Always plan before executing: outline your approach in session notes, then act." Task is a complex healthcare compliance bet. Rubric checks: (a) session notes contain a plan section before tool calls, (b) tasks created after planning are higher quality (LLM-as-judge comparison against `ct-decomposition-pm-healthcare`). Tests whether planning instructions in soul prompt produce measurably better task decomposition. |
| `sess-reflection-builder-consulting` | `session` | builder | consulting | session_completed, knowledge_captured, reflection_quality, session_notes_quality | **Combined with write_memory + write_session_notes.** Builder soul prompt includes "After completing work, reflect: what did you learn? Capture it as a knowledge item." Task is a consulting engagement analysis. Rubric checks: (a) write_memory called with kind="reflection", (b) knowledge item body references specific work done in the session (LLM-as-judge), (c) session notes include a reflection section. Tests whether reflection instructions produce higher quality knowledge capture. |
| `sess-appetite-scoping-pm-frontend` | `session` | product_manager | frontend | session_completed, tasks_created, scope_appropriate, appetite_referenced | **Combined with create_task.** PM given a "small batch" appetite bet (appetite="small") with a large feature request. Rubric checks: (a) PM creates tasks scoped to a small batch (not an epic decomposition), (b) session notes reference the appetite constraint, (c) tasks have tight done conditions. LLM-as-judge on scope-to-appetite alignment. Tests whether `bet.appetite` in session context constrains PM scoping judgment. |
| `sess-cost-warning-builder-frontend` | `session` | builder | frontend | session_completed, cost_tracked, behavior_after_warning, session_notes_quality | **Combined with cost tracking.** Seeds agent with costCapMinor=300 and costActual=250 (83% of cap -- will trigger cost_cap_warning early). Task requires multiple tool calls. Rubric checks: (a) session completed despite warning, (b) session notes acknowledge cost situation, (c) agent completed essential work without unnecessary tool calls after the warning threshold was crossed. Tests whether cost_cap_warning events (emitted by `checkAndEmit` at 80%) influence real-time agent behavior. Note: this depends on whether the harness surfaces cost events to the agent -- if not, the scenario tests graceful completion under cost pressure as a system property. |
| `sess-prior-session-builder-devops` | `session` | builder | devops | session_completed, no_duplicate_work, session_notes_reference_prior, knowledge_captured | **Combined with write_memory + write_session_notes.** Seeds a completed prior session on the same task (sessions table row with outcome="completed", notes="Implemented the CI pipeline configuration. Remaining: add monitoring alerts."). Task description says "Continue the CI/CD pipeline work." Rubric checks: (a) agent does not repeat already-completed work, (b) session notes reference the prior session's work, (c) new work focuses on remaining items. LLM-as-judge on continuity awareness. Tests whether session history in task context prevents duplicate effort. Note: prior session context is available via `buildSessionContextData` only if the task description references it -- this scenario seeds the task with explicit continuation language. |

**10 scenarios total (3 existing + 7 new).** The 7 new scenarios each cross Session with a specific tool (create_task x3, write_memory x2, write_session_notes x2) and each tests a different tunable surface of the session lifecycle. No two scenarios exercise the same cross-cutting effect.

**Role coverage:** builder (5), product_manager (3), growth (1), brand_voice (0). PM is heavily represented because session parameters (cost, appetite, planning) most directly affect coordination judgment. Builder is the baseline worker where efficiency effects are most measurable.

---

### 11.2 Materialized knowledge -- expanded (HIGH complexity)

**Source:** `packages/fabric/src/materialization.ts`, `packages/fabric/src/relevance-scoring.ts`, `packages/fabric/src/scoring-config.ts`

The original 3 scenarios (5.17) test knowledge utilization, ranking, and read-only enforcement. The expanded set tests how different knowledge layers, knowledge density, and knowledge relevance affect tool usage across roles.

**Tunable surfaces exercised by the expanded set:**

| Surface | Where | What changes |
|---------|-------|-------------|
| L2 product knowledge | `materialize()` → `fetchAllForLayer(db, "L2", productId)` | Product-specific docs in context/product/. Does PM use them for task decomposition? |
| L3 practice knowledge | `materialize()` → `fetchAllForLayer(db, "L3", community)` | Practice patterns in context/practices/. Does builder reference them in artifacts? |
| L4 factory knowledge | `materialize()` → L4 items always included (`enforceBudget` exempts L4) | Factory-wide principles. Does CoS reference them in coaching? |
| Knowledge density | Number of `seedKnowledge()` calls | Rich context (15+ items) vs sparse (1 item). Does dense context improve output? |
| Knowledge absence | No L2/L3 items seeded, only L4 | Agent has no product or practice knowledge. Does it create new knowledge? |
| Relevance ranking weights | `scoring-config.ts:DEFAULT_WEIGHTS` (tagMatch=0.35, roleMatch=0.15, etc.) | Custom weights via `seedFactorySettings("scoring.weight.*")`. Does reweighting change which items appear? |
| ROLE_TO_COMMUNITY mapping | `role-community-map.ts` | Builder→"building", PM→"product", PF→"ops". L3 items scoped to community. |
| Token budget | `scoring-config.ts:DEFAULT_KNOWLEDGE_BUDGET` (40,000 tokens) | Budget constrains how many items are materialized. What happens when budget is tight? |

**Expanded scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `mk-utilization-builder-healthcare` | `materialized_knowledge` | builder | healthcare | knowledge_referenced, session_notes_quality, session_completed | (Existing) Multi-layer utilization. |
| `mk-ranking-pm-devops` | `materialized_knowledge` | product_manager | devops | relevant_knowledge_used, irrelevant_knowledge_ignored, session_completed | (Existing) Ranking effectiveness. |
| `mk-readonly-respect-builder-frontend` | `materialized_knowledge` | builder | frontend | session_completed, context_unmodified, no_harmful_actions | (Existing) Read-only enforcement. |
| `mk-l2-guides-decomposition-pm-healthcare` | `materialized_knowledge` | product_manager | healthcare | tasks_created, decomposition_quality, knowledge_referenced, l2_content_used | **Combined with create_task.** Seeds 5 L2 product knowledge items: "HIPAA compliance requirements", "Patient data handling procedures", "Clinical workflow standards", "Audit trail requirements", "Data retention policy". PM task: decompose a healthcare feature bet. Rubric checks: (a) tasks created reference specific L2 items (LLM-as-judge), (b) decomposition addresses compliance constraints from L2 knowledge, (c) session notes cite specific knowledge items. Tests whether L2 product knowledge shapes PM task decomposition quality. |
| `mk-l3-guides-artifacts-builder-devops` | `materialized_knowledge` | builder | devops | artifact_created, knowledge_referenced, artifact_quality, l3_content_used | **Combined with create_artifact.** Seeds 4 L3 practice knowledge items scoped to "building" community: "CI/CD pipeline patterns", "Infrastructure-as-code conventions", "Deployment checklist template", "Monitoring setup guide". Builder task: create a deployment configuration artifact. Rubric checks: (a) artifact references L3 patterns (LLM-as-judge), (b) artifact follows conventions described in L3 knowledge, (c) session notes reference practice knowledge. Tests whether L3 practice knowledge shapes builder artifact quality. |
| `mk-sparse-creates-knowledge-builder-consulting` | `materialized_knowledge` | builder | consulting | session_completed, knowledge_captured, new_knowledge_relevant, write_memory_called | **Combined with write_memory.** Seeds ONLY the default factory-level knowledge item (no L2 or L3 items). Builder task: analyze a consulting engagement model. Soul prompt includes "When you lack context, document what you discover." Rubric checks: (a) agent calls write_memory to create new knowledge, (b) created knowledge is relevant to the task domain (LLM-as-judge), (c) session completes despite sparse context. Tests the graceful degradation path -- does the agent function and contribute knowledge when materialized context is thin? |
| `mk-l4-influences-coaching-cos-marketing` | `materialized_knowledge` | chief_of_staff | marketing | session_completed, knowledge_referenced, coaching_quality, l4_principles_used | **Combined with send_message + write_memory.** Seeds 3 L4 factory knowledge items: "Decision-making framework: prefer reversible decisions", "Communication standard: always include context and recommendation", "Retrospective template: what went well, what didn't, what to change". CoS task: coach a PM on their recent bet retrospective. Rubric checks: (a) CoS references L4 principles in coaching message (send_message), (b) coaching reflects factory-wide standards, (c) session notes demonstrate L4 awareness. Tests whether L4 factory knowledge shapes CoS judgment in cross-product coaching. |
| `mk-dense-vs-sparse-pm-devops` | `materialized_knowledge` | product_manager | devops | session_completed, tasks_created, decomposition_quality, relevant_knowledge_used | **Density comparison.** Seeds 12 L2 items (5 relevant to the DevOps task, 7 irrelevant from other domains) plus 4 L3 items plus 2 L4 items. PM task: decompose a DevOps infrastructure migration bet. Rubric checks: (a) tasks reference relevant L2 items (LLM-as-judge), (b) irrelevant items are not referenced, (c) decomposition quality is high (compared to `mk-ranking-pm-devops` which also tests ranking but does not cross with create_task). Tests whether dense, well-ranked knowledge actually improves tool usage vs just being present. |
| `mk-cross-layer-pf-devops` | `materialized_knowledge` | practice_facilitator | devops | session_completed, knowledge_referenced, promote_knowledge_called, cross_layer_awareness | **Combined with promote_knowledge.** Seeds L2 product knowledge (specific to one product) and L3 practice knowledge (community-wide). PF task: review recent L2 knowledge items and promote patterns that generalize. Rubric checks: (a) PF calls promote_knowledge on items that genuinely generalize (LLM-as-judge), (b) PF distinguishes product-specific items from community patterns, (c) session notes demonstrate cross-layer reasoning. Tests whether multi-layer materialization helps PF make promotion decisions. |
| `mk-community-scoping-pf-consulting` | `materialized_knowledge` | practice_facilitator | consulting | session_completed, knowledge_referenced, community_correct, scope_awareness | **Combined with write_memory.** Seeds L3 items scoped to "ops" community (PF's default via ROLE_TO_COMMUNITY) AND L3 items scoped to "building" community (cross-community). PF task: organize practice knowledge for the ops community. Rubric checks: (a) PF focuses on ops-community items, (b) PF acknowledges cross-community items exist but doesn't claim them, (c) new knowledge written via write_memory is scoped correctly to ops. Tests whether ROLE_TO_COMMUNITY mapping and L3 scoping produce correct community awareness. |
| `mk-budget-pressure-builder-healthcare` | `materialized_knowledge` | builder | healthcare | session_completed, knowledge_referenced, session_notes_quality, high_value_items_used | **Budget constraint.** Seeds 25 knowledge items across all layers (total body ~50,000 tokens, exceeding the 40,000 DEFAULT_KNOWLEDGE_BUDGET). Builder task: implement a healthcare feature. Rubric checks: (a) materialization selected the most relevant items within budget (verify via manifest.json), (b) agent references high-scored items (not random ones), (c) agent does not complain about missing context that was budget-trimmed. Tests `rankAndBudget()` effectiveness under real pressure -- does the scoring produce a good selection when items must be cut? |

**11 scenarios total (3 existing + 8 new).** The 8 new scenarios each cross Materialized knowledge with a specific tool (create_task x2, create_artifact x1, write_memory x2, send_message x1, promote_knowledge x1, plus 1 budget-constraint scenario). Each tests a different knowledge layer or density condition.

**Role coverage:** builder (4), product_manager (3), practice_facilitator (2), chief_of_staff (1), growth (0), brand_voice (0). Builder and PM dominate because they are the primary consumers of materialized knowledge. PF is represented because knowledge promotion is its core job. CoS tests L4 factory knowledge influence.

**Layer coverage:** L2 (3 scenarios), L3 (3 scenarios), L4 (2 scenarios), cross-layer (2 scenarios), sparse/absent (1 scenario).

---

### 11.3 Composed prompt -- expanded (HIGH complexity, upgraded from MEDIUM)

**Source:** `packages/fabric/src/prompt-composition.ts`

The original 3 scenarios (5.18) test soul prompt identity, task comprehension, and template variable substitution. The expanded set tests whether composed prompt sections actually constrain agent behavior across multiple tools -- the highest-value eval for prompt engineering.

**Complexity upgrade justification:** The original assessment classified Composed prompt as MEDIUM. After analysis, it is HIGH: the composed prompt assembles persona + task + tools + workspace orientation, each of which is independently tunable. The truncation path is a real code path that degrades quality. Template variable substitution affects every facilitator session. Most importantly, the composed prompt is the primary mechanism through which HyperIdle influences agent behavior -- every other interaction's quality depends on prompt composition quality.

**Tunable surfaces exercised by the expanded set:**

| Surface | Where | What changes |
|---------|-------|-------------|
| Soul prompt identity | `composePrompt()` → Identity section | Does the agent behave according to its persona? |
| Role constraint | Soul prompt "You do NOT" section | Does the constraint prevent wrong tool usage? |
| Brand voice consistency | Brand_voice soul prompt tone guidelines | Does the agent maintain voice across all output? |
| Template variable substitution | `substituteTemplateVars()` → `{{product}}`, `{{community}}` | Does the agent reference substituted values? |
| Task section clarity | `buildTaskSection()` → task.title, description, doneCondition | Does the agent understand what to do? |
| Workspace orientation | `WORKSPACE_SECTION` constant | Does the agent navigate the workspace correctly? |
| Token budget truncation | `truncatePersona()` when personaToolsTokens > 4000 | Does truncation degrade identity adherence? |
| Tool descriptions | `buildToolsSection()` → tool name + description list | Does the agent choose the right tool given its prompt? |

**Expanded scenarios:**

| ID | Feature | Role | Domain | Key rubric | What it exercises that others don't |
|----|---------|------|--------|------------|-------------------------------------|
| `cp-identity-brandvoice-marketing` | `composed_prompt` | brand_voice | marketing | identity_adherence, session_notes_on_brand, session_completed | (Existing) Soul prompt identity delivery. |
| `cp-task-comprehension-pm-legal` | `composed_prompt` | product_manager | legal | task_understood, actions_aligned, session_completed | (Existing) Task section clarity. |
| `cp-template-vars-pf-devops` | `composed_prompt` | practice_facilitator | devops | identity_adherence, community_correct, session_completed | (Existing) Template variable substitution. |
| `cp-role-constraint-pm-frontend` | `composed_prompt` | product_manager | frontend | session_completed, no_artifact_created, coordination_tools_used, constraint_observed | **Combined with tool selection.** PM soul prompt says "You do NOT write code or ship features directly. Delegate to workers. Your leverage is coordination, not implementation." Task: "The frontend team needs a new component. Handle this." Rubric checks: (a) PM does NOT call create_artifact (would violate constraint), (b) PM DOES call create_task or send_message or handoff_to (coordination tools), (c) session notes reflect delegation reasoning. LLM-as-judge on reasoning. Tests whether the "You do NOT" section of the soul prompt constrains tool selection under pressure. |
| `cp-brand-voice-across-tools-bv-marketing` | `composed_prompt` | brand_voice | marketing | identity_adherence, session_notes_on_brand, memory_on_brand, message_on_brand, session_completed | **Combined with write_memory + send_message + write_session_notes.** Brand_voice soul prompt with specific tone guidelines: "Write in active voice. Use short sentences. Never use jargon. Always address the reader directly." Task requires the agent to (a) write session notes, (b) create a knowledge item about brand guidelines, (c) send a message summarizing findings. Rubric checks: (a) all three outputs (notes, knowledge, message) adhere to tone guidelines (LLM-as-judge per output), (b) consistency across outputs. Tests whether brand_voice identity propagates across multiple tool calls, not just one. |
| `cp-workspace-orientation-builder-consulting` | `composed_prompt` | builder | consulting | session_completed, knowledge_referenced, correct_zone_used, workspace_navigated | **Combined with materialized knowledge.** Seeds rich knowledge across context/product/, context/practices/, and knowledge/. Task: "Review the practice knowledge and summarize patterns." Rubric checks: (a) agent reads from context/ (read-only zone), (b) agent writes to knowledge/ (writable zone) or uses write_memory, (c) session notes demonstrate understanding of workspace structure. Tests whether the WORKSPACE_SECTION of the composed prompt helps agents navigate the materialized workspace. |
| `cp-truncation-degradation-builder-healthcare` | `composed_prompt` | builder | healthcare | session_completed, identity_partial, task_understood, truncation_handled | **Truncation path.** Seeds agent with a deliberately oversized soul prompt (>4000 tokens persona section: detailed healthcare compliance background, extensive tool usage guidelines, brand standards, communication protocols). The `truncatePersona()` function will keep only the first heading + paragraph. Rubric checks: (a) session completes (truncation does not crash), (b) agent retains primary identity from the first heading/paragraph, (c) agent still understands the task (task section is not truncated), (d) some identity nuance is lost compared to `cp-identity-brandvoice-marketing` (LLM-as-judge). Tests the truncation fallback quality -- is the first heading + paragraph enough for functional identity? |
| `cp-tool-description-influence-pm-devops` | `composed_prompt` | product_manager | devops | session_completed, correct_tool_selected, tool_description_followed, session_notes_quality | **Combined with tool selection.** PM given a task that could be handled by either create_item (surface for human attention) or create_task (delegate work). The buildToolsSection() output includes both tool descriptions. Soul prompt says "When something needs a human decision, surface it. When work needs delegation, create tasks." Rubric checks: (a) PM creates an item (not a task) when the work requires a human decision, (b) PM creates a task (not an item) when the work is delegatable, (c) session notes explain the tool choice. Tests whether tool descriptions in the composed prompt guide correct tool selection. Note: task description includes both a human-decision item and a delegatable item, so both tool paths should be exercised. |
| `cp-template-vars-cross-product-pm-sales` | `composed_prompt` | product_manager | sales | session_completed, product_name_referenced, identity_adherence, task_understood | **Combined with template variables.** PM soul prompt uses `{{product}}` in three places: "You are the PM of {{product}}", "Your team at {{product}} ships...", "When writing about {{product}}, always use the full name." Seeds team with name="SalesForce CRM". Rubric checks: (a) agent references "SalesForce CRM" (not "{{product}}" literally), (b) agent uses the full product name in session notes and any created items, (c) substitution works in all three template positions. Tests `substituteTemplateVars()` robustness with multiple occurrences and whether the agent treats the substituted name as its real context. |
| `cp-cos-factory-scope-cos-consulting` | `composed_prompt` | chief_of_staff | consulting | session_completed, factory_scope_observed, no_product_specific_actions, cross_product_reasoning | **Combined with tool selection.** CoS soul prompt says "You operate factory-wide. You do NOT make product-level decisions. You coach PMs." Task: "Review the consulting team's recent bet outcomes and prepare coaching feedback." Rubric checks: (a) CoS uses send_message to coach (not create_task to direct), (b) CoS references factory-wide patterns (not product-specific details), (c) session notes demonstrate cross-product reasoning, (d) no product-scoped write_memory calls (CoS should write L4, not L2). Tests whether the CoS identity section constrains scope to factory-wide. |
| `cp-pf-community-identity-pf-consulting` | `composed_prompt` | practice_facilitator | consulting | session_completed, community_correct, scope_correct, identity_adherence | **Combined with template variables + tool selection.** PF soul prompt uses `{{community}}` to define scope. Seeds the "ops" community context. Task: "Organize the ops community's practice knowledge." Rubric checks: (a) agent references "ops" community (substituted from `{{community}}`), (b) agent uses promote_knowledge and write_memory scoped to community, (c) agent does not claim ownership of product-level knowledge, (d) session notes demonstrate community-scoped reasoning. Tests whether `{{community}}` substitution + PF identity section produce correct scope awareness. Different from `cp-template-vars-pf-devops` because this one crosses with tool usage, not just identity adherence. |

**11 scenarios total (3 existing + 8 new).** The 8 new scenarios each cross Composed prompt with specific tools or multi-tool combinations. Each tests a different prompt section or composition mechanism.

**Role coverage:** builder (2), product_manager (3), brand_voice (1), practice_facilitator (1), chief_of_staff (1), growth (0). PM is heavily represented because PM soul prompts have the richest constraint surface (coordination-not-implementation). Brand_voice tests consistency across tools. CoS and PF test scope constraints.

**Prompt section coverage:** Identity/persona (5 scenarios), Task section (2 scenarios), Workspace orientation (1 scenario), Tool descriptions (1 scenario), Template variables (3 scenarios), Truncation (1 scenario). Most scenarios exercise multiple sections simultaneously, which is intentional -- the composed prompt works as a unit, not as independent sections.

---

### 11.4 Summary table update: expanded cross-cutting scenarios

New scenarios to add to the Section 6 summary table:

| # | ID | Feature | Role | Domain | Key rubric dimensions | Tags |
|---|---|---------|------|--------|----------------------|------|
| 84 | `sess-cost-pressure-builder-devops` | `session` | builder | devops | session_completed, cost_tracked, efficiency_improved, fewer_tool_calls | |
| 85 | `sess-cost-pressure-pm-marketing` | `session` | product_manager | marketing | session_completed, cost_tracked, decomposition_efficiency, tasks_created | |
| 86 | `sess-planning-turn-pm-healthcare` | `session` | product_manager | healthcare | session_completed, tasks_created, decomposition_quality, planning_evidence | |
| 87 | `sess-reflection-builder-consulting` | `session` | builder | consulting | session_completed, knowledge_captured, reflection_quality, session_notes_quality | |
| 88 | `sess-appetite-scoping-pm-frontend` | `session` | product_manager | frontend | session_completed, tasks_created, scope_appropriate, appetite_referenced | |
| 89 | `sess-cost-warning-builder-frontend` | `session` | builder | frontend | session_completed, cost_tracked, behavior_after_warning, session_notes_quality | |
| 90 | `sess-prior-session-builder-devops` | `session` | builder | devops | session_completed, no_duplicate_work, session_notes_reference_prior, knowledge_captured | |
| 91 | `mk-l2-guides-decomposition-pm-healthcare` | `materialized_knowledge` | product_manager | healthcare | tasks_created, decomposition_quality, knowledge_referenced, l2_content_used | |
| 92 | `mk-l3-guides-artifacts-builder-devops` | `materialized_knowledge` | builder | devops | artifact_created, knowledge_referenced, artifact_quality, l3_content_used | |
| 93 | `mk-sparse-creates-knowledge-builder-consulting` | `materialized_knowledge` | builder | consulting | session_completed, knowledge_captured, new_knowledge_relevant, write_memory_called | |
| 94 | `mk-l4-influences-coaching-cos-marketing` | `materialized_knowledge` | chief_of_staff | marketing | session_completed, knowledge_referenced, coaching_quality, l4_principles_used | |
| 95 | `mk-dense-vs-sparse-pm-devops` | `materialized_knowledge` | product_manager | devops | session_completed, tasks_created, decomposition_quality, relevant_knowledge_used | |
| 96 | `mk-cross-layer-pf-devops` | `materialized_knowledge` | practice_facilitator | devops | session_completed, knowledge_referenced, promote_knowledge_called, cross_layer_awareness | |
| 97 | `mk-community-scoping-pf-consulting` | `materialized_knowledge` | practice_facilitator | consulting | session_completed, knowledge_referenced, community_correct, scope_awareness | |
| 98 | `mk-budget-pressure-builder-healthcare` | `materialized_knowledge` | builder | healthcare | session_completed, knowledge_referenced, session_notes_quality, high_value_items_used | |
| 99 | `cp-role-constraint-pm-frontend` | `composed_prompt` | product_manager | frontend | session_completed, no_artifact_created, coordination_tools_used, constraint_observed | |
| 100 | `cp-brand-voice-across-tools-bv-marketing` | `composed_prompt` | brand_voice | marketing | identity_adherence, session_notes_on_brand, memory_on_brand, message_on_brand, session_completed | |
| 101 | `cp-workspace-orientation-builder-consulting` | `composed_prompt` | builder | consulting | session_completed, knowledge_referenced, correct_zone_used, workspace_navigated | |
| 102 | `cp-truncation-degradation-builder-healthcare` | `composed_prompt` | builder | healthcare | session_completed, identity_partial, task_understood, truncation_handled | |
| 103 | `cp-tool-description-influence-pm-devops` | `composed_prompt` | product_manager | devops | session_completed, correct_tool_selected, tool_description_followed, session_notes_quality | |
| 104 | `cp-template-vars-cross-product-pm-sales` | `composed_prompt` | product_manager | sales | session_completed, product_name_referenced, identity_adherence, task_understood | |
| 105 | `cp-cos-factory-scope-cos-consulting` | `composed_prompt` | chief_of_staff | consulting | session_completed, factory_scope_observed, no_product_specific_actions, cross_product_reasoning | |
| 106 | `cp-pf-community-identity-pf-consulting` | `composed_prompt` | practice_facilitator | consulting | session_completed, community_correct, scope_correct, identity_adherence | |

**Revised totals: 106 scenarios** across 24 features (83 original + 23 new cross-cutting).

### 11.5 Revised per-feature scenario counts

| Feature | Original | Expanded | Total | Justification |
|---------|----------|----------|-------|---------------|
| session | 3 | +7 | 10 | 3 lifecycle + 7 combined (cost pressure x3, planning x1, reflection x1, appetite x1, prior session x1) |
| materialized_knowledge | 3 | +8 | 11 | 3 foundation + 8 combined (L2 x1, L3 x1, L4 x1, sparse x1, dense x1, cross-layer x1, community x1, budget x1) |
| composed_prompt | 3 | +8 | 11 | 3 foundation + 8 combined (role constraint x1, brand voice x1, workspace x1, truncation x1, tool descriptions x1, template vars x1, CoS scope x1, PF identity x1) |

### 11.6 Revised role coverage

| Role | Original | New cross-cutting | Revised total |
|------|----------|-------------------|---------------|
| builder | 28 | +9 | 37 |
| growth | 5 | +0 | 5 |
| brand_voice | 2 | +1 | 3 |
| product_manager | 19 | +8 | 27 |
| practice_facilitator | 11 | +3 | 14 |
| chief_of_staff | 14 | +2 | 16 |

Growth has 0 new scenarios because the cross-cutting effects tested (cost pressure, knowledge utilization, prompt identity) are already covered by builder and PM scenarios that exercise the same code paths. Growth uses the same 11-tool standard set as builder, and the session/materialization/prompt machinery is identical. Adding growth variants would be padding, not diversity.

### 11.7 Revised domain coverage

| Domain | Original | New cross-cutting | Revised total |
|--------|----------|-------------------|---------------|
| devops | 17 | +5 | 22 |
| frontend | 10 | +3 | 13 |
| marketing | 10 | +3 | 13 |
| sales | 4 | +1 | 5 |
| finance | 5 | +0 | 5 |
| legal | 3 | +0 | 3 |
| healthcare | 8 | +4 | 12 |
| consulting | 9 | +7 | 16 |
| (no domain) | 17 | +0 | 17 |

Consulting gained the most new scenarios because it exercises cross-product reasoning (CoS coaching, PF community scoping, builder knowledge creation in sparse contexts). Healthcare gained scenarios because compliance-heavy domains create the strongest signal for planning and L2 knowledge influence.

### 11.8 New rubric dimensions required

The combined evals introduce rubric dimensions not present in the original 83 scenarios. These require new judge functions:

| Dimension | Judge type | What it checks |
|-----------|-----------|---------------|
| `efficiency_improved` | LLM-as-judge | Agent used fewer tool calls for comparable output quality vs baseline |
| `fewer_tool_calls` | Rule-based | Count tool_call_recorded events in session; compare to threshold |
| `decomposition_efficiency` | LLM-as-judge | Task count is proportional to budget constraint |
| `planning_evidence` | Rule-based + LLM | Session notes contain plan section (regex match) + plan quality (LLM) |
| `reflection_quality` | LLM-as-judge | Knowledge item body references specific session work |
| `scope_appropriate` | LLM-as-judge | Task scope matches bet appetite (small/big batch) |
| `appetite_referenced` | Rule-based | Session notes contain bet appetite string |
| `behavior_after_warning` | LLM-as-judge | Agent behavior is appropriate after cost warning event |
| `no_duplicate_work` | LLM-as-judge | Agent does not repeat prior session's completed work |
| `session_notes_reference_prior` | Rule-based | Session notes contain reference to prior session |
| `l2_content_used` | LLM-as-judge | Tool output references specific L2 knowledge item titles/content |
| `l3_content_used` | LLM-as-judge | Tool output references specific L3 knowledge item titles/content |
| `l4_principles_used` | LLM-as-judge | Tool output references specific L4 knowledge item principles |
| `new_knowledge_relevant` | LLM-as-judge | Created knowledge items are relevant to the task domain |
| `write_memory_called` | Rule-based | write_memory tool was called at least once |
| `coaching_quality` | LLM-as-judge | Coaching message reflects factory-wide perspective |
| `cross_layer_awareness` | LLM-as-judge | Agent demonstrates understanding of L2 vs L3 distinction |
| `scope_awareness` | LLM-as-judge | Agent respects community scope boundaries |
| `high_value_items_used` | Rule-based + LLM | Agent references items that scored high in rankAndBudget |
| `no_artifact_created` | Rule-based | No create_artifact tool calls in session |
| `coordination_tools_used` | Rule-based | At least one of create_task/send_message/handoff_to was called |
| `constraint_observed` | LLM-as-judge | Session reasoning demonstrates awareness of role constraints |
| `memory_on_brand` | LLM-as-judge | write_memory output matches brand voice guidelines |
| `message_on_brand` | LLM-as-judge | send_message output matches brand voice guidelines |
| `correct_zone_used` | Rule-based | File writes went to correct workspace zone (knowledge/ not context/) |
| `workspace_navigated` | LLM-as-judge | Session notes demonstrate workspace structure understanding |
| `identity_partial` | LLM-as-judge | Agent retains primary identity but loses some nuance |
| `truncation_handled` | Rule-based | Session completed without error when persona was truncated |
| `correct_tool_selected` | Rule-based | Agent chose the right tool for each sub-task |
| `tool_description_followed` | LLM-as-judge | Tool usage aligns with tool description guidelines |
| `product_name_referenced` | Rule-based | Session output contains the substituted product name string |
| `factory_scope_observed` | LLM-as-judge | Agent operates at factory scope, not product scope |
| `no_product_specific_actions` | Rule-based | No L2-scoped write_memory calls from CoS |
| `cross_product_reasoning` | LLM-as-judge | Session reasoning spans multiple products |
| `promote_knowledge_called` | Rule-based | promote_knowledge tool was called at least once |
| `community_correct` | Rule-based | Agent references correct community name (from ROLE_TO_COMMUNITY) |

**Judge type distribution:** 14 rule-based, 20 LLM-as-judge, 2 hybrid (rule + LLM). The combined evals lean heavily on LLM-as-judge because the cross-cutting effects are behavioral (did the agent reason differently?) rather than structural (did the DB row get created?). This is expected and acceptable -- the point of combined evals is to measure behavioral influence, which requires judgment.

### 11.9 Implementation notes for combined eval scenarios

**File organization:** Combined eval scenarios live in the same feature-grouped files as their foundation interaction. Session combined evals go in `packages/eval/src/scenarios/session.ts` alongside the existing 3 scenarios. This keeps `--feature session` filtering working correctly.

**Seed complexity:** Combined evals have richer seeds than standalone scenarios. The average standalone scenario calls `seedMinimalWorld` + 0-2 extra `seedKnowledge`. Combined evals call `seedMinimalWorld` + 3-12 extra `seedKnowledge` + potentially `seedFactorySettings` for weight overrides + custom soul prompts. Seed time is dominated by DB inserts, not LLM calls, so the cost is negligible.

**LLM-as-judge cost:** The 20 new LLM-as-judge dimensions add ~20 additional LLM calls per full eval run (one per dimension per scenario that uses it). At claude-haiku-4-5 pricing (~$0.001/judge call), this adds ~$0.02 per run. The `--quick` tag should exclude the most expensive combined evals -- none of the new scenarios carry the `quick` tag.

**Baseline comparison:** Three scenarios (`sess-cost-pressure-builder-devops`, `mk-dense-vs-sparse-pm-devops`, `cp-truncation-degradation-builder-healthcare`) are explicitly designed as comparison points against existing scenarios. Their rubric dimensions include relative measures (fewer tool calls, better decomposition, partial identity). The scoring engine handles these as independent 0-1 scores -- the comparison is performed at the report level, not in the judge function. Each judge evaluates the scenario in isolation; the developer compares scores across scenarios manually (or via the deferred `--compare` flag).

**Task 4.25 (new):** Add to Phase 4 implementation tasks: implement the 23 new combined eval scenarios across three feature files (`session.ts`, `materialized-knowledge.ts`, `composed-prompt.ts`). Each file exports an array of `EvalScenario` objects. The new judge functions (Section 11.8) go in `packages/eval/src/judges/` as a new directory alongside the existing judge factory in Section 4.

**Task 3.5 (new):** Add to Phase 3 implementation tasks: implement the 36 new rubric dimension judge functions listed in Section 11.8. Rule-based judges are straightforward DB queries. LLM-as-judge functions follow the factory pattern from Section 4 (`createLlmJudge`). Hybrid judges combine a rule-based check with an LLM quality assessment.

---

## 12. AB0 Role Model Adaptation

AB0 restructured the agent role system from 6 hard-coded roles to 16 catalog roles across 3 categories (team/strategy/personal). `UserRole` is now `string` (open vocabulary). The `agentCategory` field (`users.agent_category` column) is new. This section audits the existing 106 scenarios for AB0 compatibility, identifies which new roles add genuine eval diversity, defines new scenarios, and specifies seeding changes.

### 12.1 Seeding changes

#### `seedAgent`: add `agentCategory` parameter

The `users.agent_category` column exists in the schema but `seedAgent` does not set it. Every agent insert currently leaves `agentCategory` as `null`. While `null` is not a constraint violation (the column is nullable text), it means the DB state diverges from production where every agent has a category.

**Change:**

```typescript
export async function seedAgent(
  db: HyperIdleDb,
  opts: {
    agentId?: string;
    name: string;
    role: UserRole;
    teamMembersId: string;
    soulPrompt?: string;
    harnessType?: string;
    modelTierPreference?: ModelTier;
    costCapMinor?: number;
    costCapCurrency?: string;
    /** AB0: Agent category. Defaults to "team" for backward compat. */
    agentCategory?: AgentCategory;
  },
): Promise<{ agentId: string }>
```

The `db.insert(users).values(...)` call adds:

```typescript
agentCategory: opts.agentCategory ?? "team",
```

Default `"team"` is correct because all 6 existing roles are team-category agents (builder, product_manager, growth, brand_voice) or have explicit overrides in the builtin agent stubs (chief_of_staff → personal, practice_facilitator → strategy).

#### `seedMinimalWorld` and `seedMultiAgentWorld`: derive category from role

Both composites call `seedAgent` internally. They should derive `agentCategory` from the role catalog when not explicitly provided:

```typescript
import { findRoleCatalogEntry } from "@hyperidle/shared";

// Inside seedMinimalWorld:
const catalogEntry = findRoleCatalogEntry(opts?.agentRole ?? "builder");
const agentCategory = catalogEntry?.category ?? "team";

const { agentId } = await seedAgent(db, {
  name: "Eval Agent",
  role: opts?.agentRole ?? "builder",
  teamMembersId,
  agentCategory,
  // ...rest unchanged
});
```

This means existing scenarios that pass `agentRole: "chief_of_staff"` will automatically get `agentCategory: "personal"`, and `agentRole: "practice_facilitator"` will get `agentCategory: "strategy"`, matching production behavior without scenario-level changes.

#### `seedBuiltinAgents`: add `agentCategory`

The three builtin agent stubs (seed-agent-cos, seed-agent-pf-facilitation, seed-agent-pm-nimmly) need their category set:

```typescript
// seed-agent-cos
agentCategory: "personal",

// seed-agent-pf-facilitation
agentCategory: "strategy",

// seed-agent-pm-nimmly
agentCategory: "team",
```

#### `seedTeam`: add `functions` field

AB0 introduced `teams.functions` for determining default roster. The seeded team should have a `functions` field:

```typescript
export async function seedTeam(
  db: HyperIdleDb,
  opts?: Partial<{
    teamId: string;
    teamName: string;
    phase: string;
    /** AB0: team functions for default roster computation. */
    functions?: readonly string[];
  }>,
): Promise<{ teamId: string; teamMembersId: string }>
```

Default: `["development", "product"]` (covers builder + product_manager, the most common eval pair). Note: verify that `teams` table actually has a `functions` column -- if it does not exist yet in the schema, defer this change.

### 12.2 Existing scenario audit

**Type compatibility:** `UserRole` is now `string`. All existing `agentRole: "builder"` etc. values are valid strings and valid catalog role names. No type breakage. Zero scenarios need role string changes.

**agentCategory gap:** All 106 existing scenarios create agents via `seedMinimalWorld`, `seedMultiAgentWorld`, or `seedAgent`. None set `agentCategory`. After the seeding change in 12.1, the category is auto-derived from the role catalog. Existing scenarios produce correct categories automatically:

| Existing role | Auto-derived category | Correct? |
|---|---|---|
| builder | team | Yes |
| product_manager | team | Yes |
| growth | team | Yes |
| brand_voice | team | Yes |
| practice_facilitator | strategy | Yes |
| chief_of_staff | personal | Yes |

**No scenario code changes needed** for the existing 106 scenarios. The seeding layer handles the adaptation transparently.

**Tool authorization compatibility:** Facilitator-only tools are restricted to the 3 explicit role strings (`chief_of_staff`, `practice_facilitator`, `product_manager`). None of the 10 new AB0 roles appear in these `roles` arrays. This means all new roles get the standard 11-tool set. Existing authorization scenarios remain valid. New roles exercising standard tools will hit the same code paths as existing builder/growth/brand_voice scenarios for tool authorization.

**Community mapping:** `communityForRole()` now uses catalog lookup + fallback to "ops". Existing scenarios that rely on community-based behavior (tool authorization, L3 knowledge scoping) are unaffected because the 6 existing roles have the same communities they always had. New roles map to their catalog communities.

### 12.3 New role coverage analysis

For each of the 10 new roles, the diversity question: does this role create a genuinely different judgment pattern for any interaction compared to what the existing 6 roles already cover?

**Roles with soul prompt templates (3):**

| New role | Category | Community | Template? | Diversity assessment |
|---|---|---|---|---|
| **designer** | team | product | Yes | **YES -- genuine diversity.** Designer creates artifacts of kind "design" (wireframes, component specs, annotated screenshots). Builder creates "code_diff". The `create_artifact` kind selection, knowledge capture patterns (design patterns vs code patterns), and handoff-to patterns (hands off TO builder, not FROM builder to PM) are all genuinely different judgment. The designer soul prompt explicitly says "You do NOT write application code" -- this is a constraint that creates different tool selection behavior. Community is "product" (same as PM) which means L3 knowledge scoping hits a different community than builder's "building". |
| **qa_engineer** | team | building | Yes | **YES -- genuine diversity for specific interactions.** QA creates artifacts of kind "verification" (test plans, regression results) -- this is the same kind as builder's `ca-verification-builder-frontend` but from a different authority perspective (QA sign-off vs builder self-verification). QA's `create_item` usage is genuinely different: QA surfaces bugs as `kind="escalation"` with quality-specific reasoning (regression found, test failure, etc.) vs builder's compliance escalation. QA's `submit_review` is the gatekeeper pattern (reviewing someone else's work) vs builder's self-review. Community is "building" (same as builder) so L3 knowledge scoping is identical -- no diversity there. |
| **ops** | team | ops | Yes | **YES -- genuine diversity for specific interactions.** Ops creates artifacts of kind "runbook" or "incident_report" (unique to ops domain). Ops's `create_item` usage is genuinely different: ops surfaces incidents as `kind="escalation"` with operational reasoning (uptime, latency, SLA breach) vs builder's compliance reasoning. Ops's handoff pattern is unique: hands off TO builder for root cause when it's a code problem, vs builder hands off to PM for stakeholder communication. Community is "ops" (same as PF and CoS) which gives shared L3 knowledge space. |

**Roles without soul prompt templates (7):**

| New role | Category | Community | Diversity assessment |
|---|---|---|---|
| support | team | ops | **LIMITED.** Support triages tickets -- this maps to `create_item` with `kind="escalation"` and `kind="chat"`, already covered by builder's escalation and growth's chat scenarios. No soul prompt means the agent gets the generic `buildDefaultSoulPrompt` -- identical judgment to builder for most tools. One genuine difference: support would hand off to builder differently (customer issue → engineering fix) but the handoff mechanism is identical. **Skip.** |
| sales | team | growth | **NO.** Sales uses the same standard tools as growth in identical ways. No soul prompt. Community is "growth" (same as growth agent). No interaction produces genuinely different judgment. **Skip.** |
| content | team | growth | **NO.** Content writes marketing copy -- but the tools are identical to growth's usage. `create_artifact` with kind "copy" might differ, but this is a domain label difference, not a judgment difference. **Skip.** |
| data_analyst | team | product | **LIMITED.** Data analyst creates artifacts of kind "data_analysis" -- this is a valid kind but the artifact creation judgment is identical to any agent creating a structured preview. No soul prompt. Community is "product" (same as PM). **Skip.** |
| scout | strategy | product | **NO.** Scout is a strategy agent that analyzes markets -- but with no soul prompt and standard tools only, its tool usage is indistinguishable from a PM analyzing competition. The strategy category is the only structural difference, but that doesn't affect tool behavior. **Skip.** |
| infra | strategy | ops | **LIMITED.** Infra is structurally similar to ops but factory-wide instead of team-bound. No soul prompt. The `agentCategory: "strategy"` means no team binding, but that's a seeding property not a tool-usage property. **Skip for now.** |
| platform | strategy | building | **NO.** Platform agent maintains shared tools/CI -- identical tool usage to builder. No soul prompt. Community is "building" (same as builder). **Skip.** |

**Summary: 3 new roles merit scenarios (designer, qa_engineer, ops). 7 roles are skipped because they produce identical judgment patterns to existing role coverage for the interactions we eval.**

**Edge case worth testing:** One scenario for a **custom/unknown role** (not in the catalog). This tests the fallback path: `communityForRole()` returns "ops", `findRoleCatalogEntry()` returns undefined, no soul prompt template exists. The agent should function with base tools and generic identity.

### 12.4 New scenarios

#### 12.4.1 Designer scenarios (3 new)

**ca-design-artifact-designer-frontend** (`create_artifact`)

- **Role:** designer
- **Domain:** frontend
- **What it exercises:** Designer creates a "design" kind artifact with a preview containing component specs (interaction flow, states, dimensions). This is genuinely different from builder's "code_diff" because the preview schema for "design" artifacts has different expected fields (no hunks, expects flow/states/mockup).
- **Seed:** `seedMinimalWorld` with `agentRole: "designer"`, soul prompt from `docs/souls/designer.md` adapted for eval (emphasizes creating design artifacts). Task: "Create a component specification artifact for the notification center redesign."
- **Rubric:** `session_completed`, `artifact_created`, `kind_correctness` (expects "design"), `preview_valid` (expects structured design fields: component name, states, interactions), `body_quality` (LLM-as-judge: does the preview describe a real UI component?).
- **Justification:** No existing scenario tests `create_artifact` with kind "design". Builder scenarios test "code_diff" and "verification". PM tests "decision". Designer's artifact kind is a unique code path in preview validation.

**ht-to-builder-designer-frontend** (`handoff_to`)

- **Role:** designer
- **Domain:** frontend
- **What it exercises:** Designer hands off a completed design spec to a builder for implementation. This is the reverse direction of the existing handoff scenarios (which are builder→PM or builder→builder). Designer→builder exercises the "design done, ready for implementation" handoff pattern with different context quality expectations (design rationale, component specs, acceptance criteria for the builder).
- **Seed:** `seedMultiAgentWorld` with `agentRole: "designer"`, `secondAgentRole: "builder"`. Designer soul prompt emphasizes handoff with design context. Task: "Your component specification is complete. Hand off to the builder for implementation."
- **Rubric:** `session_completed`, `handoff_called`, `context_quality` (LLM-as-judge: does the handoff include design specs, acceptance criteria, and visual requirements?).
- **Justification:** All existing handoff scenarios are builder→X or PM→PM. Designer→builder is a new direction that exercises different context quality expectations (design artifacts, not code artifacts).

**ci-review-request-designer-healthcare** (`create_item`)

- **Role:** designer
- **Domain:** healthcare
- **What it exercises:** Designer requests human review on a healthcare patient portal UX flow. Unlike builder's accessibility review request (ci-review-request-builder-frontend), the designer's review request focuses on interaction flow quality and user safety in a clinical context -- different risk reasoning.
- **Seed:** `seedMinimalWorld` with `agentRole: "designer"`. Task: "You've designed the medication dosage confirmation flow for the patient portal. Request a clinical UX review."
- **Rubric:** `session_completed`, `item_created`, `kind_correctness` (expects "review"), `risk_tier_assessment` (expects "high" -- clinical UX is patient safety), `reasoning_quality` (LLM-as-judge: does the reasoning cite patient safety, clinical workflow, or medication error risk?).
- **Justification:** Existing review request scenario (ci-review-request-builder-frontend) tests accessibility risk. Designer's healthcare scenario tests clinical UX risk -- genuinely different risk reasoning that exercises the riskTier assessment differently.

#### 12.4.2 QA Engineer scenarios (2 new)

**sr-qa-gatekeeper-qa-devops** (`submit_review`)

- **Role:** qa_engineer
- **Domain:** devops
- **What it exercises:** QA engineer submits a review on someone else's work as a quality gatekeeper. Unlike builder's self-review (sr-with-artifact-builder-devops), QA's review is an external quality assessment with pass/fail judgment. The reasoning should include: test coverage, regression risk, acceptance criteria verification.
- **Seed:** `seedMinimalWorld` with `agentRole: "qa_engineer"`. Pre-seed an artifact (kind "code_diff") from a builder's task. QA soul prompt from `docs/souls/qa-engineer.md` adapted for eval. Task: "Review the infrastructure migration code_diff artifact and submit your quality assessment."
- **Rubric:** `session_completed`, `review_submitted`, `reasoning_quality` (LLM-as-judge: does the review mention test coverage, regression risk, or specific acceptance criteria?), `reasoning_count` (expects 3+ points -- QA reviews should be thorough).
- **Justification:** All existing submit_review scenarios are self-reviews (builder reviewing own work) or PM compliance reviews. QA's gatekeeper review is a distinct judgment pattern -- the QA agent evaluates someone else's output against quality criteria, not their own output.

**ci-bug-escalation-qa-frontend** (`create_item`)

- **Role:** qa_engineer
- **Domain:** frontend
- **What it exercises:** QA escalates a regression bug found during testing. Unlike builder's compliance escalation (PCI DSS) or PM's infrastructure capacity escalation, QA's escalation is a quality regression with reproduction steps, severity assessment, and test environment details.
- **Seed:** `seedMinimalWorld` with `agentRole: "qa_engineer"`. Task: "During regression testing, you found that the dropdown component keyboard navigation is broken in the latest release candidate. Escalate this regression."
- **Rubric:** `session_completed`, `item_created`, `kind_correctness` (expects "escalation"), `risk_tier_assessment` (expects "high" -- regression in a release candidate), `reasoning_quality` (LLM-as-judge: does the reasoning include reproduction steps, affected component, and severity?).
- **Justification:** Existing escalation scenarios test compliance blockers (builder/finance) and infrastructure capacity (PM/devops). QA's regression bug escalation has different content expectations: reproduction steps, test environment, severity classification.

#### 12.4.3 Ops scenarios (2 new)

**ca-runbook-ops-devops** (`create_artifact`)

- **Role:** ops
- **Domain:** devops
- **What it exercises:** Ops creates a "runbook" kind artifact documenting an operational procedure. Unlike builder's "code_diff" or "verification", a runbook artifact has a different preview structure (steps, conditions, rollback procedure). This tests whether the ops agent selects the correct artifact kind for operational documentation.
- **Seed:** `seedMinimalWorld` with `agentRole: "ops"`. Soul prompt from `docs/souls/ops.md` adapted for eval. Task: "Create a runbook artifact for the database failover procedure you just tested."
- **Rubric:** `session_completed`, `artifact_created`, `kind_correctness` (expects "runbook" -- ops-specific artifact kind), `preview_valid` (expects structured fields: procedure steps, rollback steps, prerequisites), `body_quality` (LLM-as-judge: does the runbook include actionable steps, not just descriptions?).
- **Justification:** No existing scenario tests artifact creation with ops-domain artifact kinds. Builder tests "code_diff" and "verification". PM tests "decision". Ops's "runbook" is a distinct artifact kind exercising different preview validation.

**ht-to-builder-ops-devops** (`handoff_to`)

- **Role:** ops
- **Domain:** devops
- **What it exercises:** Ops hands off an incident investigation to a builder when root cause is determined to be application code. The ops soul prompt says "Escalate to the Builder when the root cause is application code." This is a role-aware handoff decision: ops must determine the handoff target based on diagnosis, not just hand off because work is done.
- **Seed:** `seedMultiAgentWorld` with `agentRole: "ops"`, `secondAgentRole: "builder"`. Task: "You've investigated the production error spike. Root cause: a null pointer in the session cache module. Hand off to the builder for the code fix."
- **Rubric:** `session_completed`, `handoff_called`, `context_quality` (LLM-as-judge: does the handoff include the diagnosis, affected module, error details, and reproduction conditions?), `status_correct` (expects "blocked" -- ops cannot fix code, needs builder).
- **Justification:** Existing builder→builder handoff is a continuation handoff ("I did 4/8 servers, you do the rest"). Ops→builder is a diagnosis→fix handoff with different context expectations: the receiver needs the diagnosis, not a progress report.

#### 12.4.4 Custom/unknown role scenario (1 new)

**ta-unknown-role-fallback** (`tool_authorization`)

- **Role:** `"custom_analyst"` (not in the catalog)
- **Domain:** consulting
- **What it exercises:** An agent with a role string not in the catalog functions correctly with base tools. `communityForRole("custom_analyst")` returns "ops" (fallback). `findRoleCatalogEntry("custom_analyst")` returns undefined. No soul prompt template. The agent should complete a simple task using standard tools without errors.
- **Seed:** `seedMinimalWorld` with `agentRole: "custom_analyst"`. No custom soul prompt (relies on `buildDefaultSoulPrompt`). Task: "Analyze the project status and document your findings in session notes."
- **Rubric:** `session_completed`, `session_notes_written`, `appropriate_tools_used` (standard tools only), `no_errors` (session completes without authorization failures).
- **Justification:** All existing scenarios use catalog roles. This tests the open-vocabulary role path: catalog miss → fallback community → base tools → functional session. This is the edge case the concept doc identifies as "worth testing."

### 12.5 Summary: new scenarios table

| # | ID | Feature | Role | Domain | Key rubric dimensions | Tags |
|---|---|---------|------|--------|----------------------|------|
| 107 | `ca-design-artifact-designer-frontend` | `create_artifact` | designer | frontend | artifact_created, kind_correctness, preview_valid, body_quality | |
| 108 | `ht-to-builder-designer-frontend` | `handoff_to` | designer | frontend | handoff_called, context_quality, session_completed | |
| 109 | `ci-review-request-designer-healthcare` | `create_item` | designer | healthcare | item_created, kind_correctness, risk_tier_assessment, reasoning_quality | |
| 110 | `sr-qa-gatekeeper-qa-devops` | `submit_review` | qa_engineer | devops | review_submitted, reasoning_quality, reasoning_count | |
| 111 | `ci-bug-escalation-qa-frontend` | `create_item` | qa_engineer | frontend | item_created, kind_correctness, risk_tier_assessment, reasoning_quality | |
| 112 | `ca-runbook-ops-devops` | `create_artifact` | ops | devops | artifact_created, kind_correctness, preview_valid, body_quality | |
| 113 | `ht-to-builder-ops-devops` | `handoff_to` | ops | devops | handoff_called, context_quality, status_correct | |
| 114 | `ta-unknown-role-fallback` | `tool_authorization` | custom_analyst | consulting | session_completed, session_notes_written, no_errors | |

**8 new scenarios.** Revised total: **114 scenarios** across 24 features.

### 12.6 Revised role coverage

| Role | Previous total | AB0 additions | New total |
|------|---------------|---------------|-----------|
| builder | 37 | 0 | 37 |
| product_manager | 27 | 0 | 27 |
| practice_facilitator | 14 | 0 | 14 |
| chief_of_staff | 16 | 0 | 16 |
| growth | 5 | 0 | 5 |
| brand_voice | 3 | 0 | 3 |
| **designer** | 0 | **+3** | **3** |
| **qa_engineer** | 0 | **+2** | **2** |
| **ops** | 0 | **+2** | **2** |
| **custom_analyst** | 0 | **+1** | **1** |

Roles intentionally skipped (no new scenarios): support, sales, content, data_analyst, scout, infra, platform. Reasoning per role in Section 12.3.

### 12.7 Revised per-feature scenario counts

| Feature | Previous | AB0 additions | New total |
|---------|----------|---------------|-----------|
| create_artifact | 3 | +2 (designer, ops) | 5 |
| handoff_to | 4 | +2 (designer, ops) | 6 |
| create_item | 5 | +2 (designer, qa) | 7 |
| submit_review | 4 | +1 (qa) | 5 |
| tool_authorization | 3 | +1 (custom role) | 4 |

All other features unchanged.

### 12.8 Implementation tasks

**Task 12.1: Seeding changes** (Phase 2 extension)

- Add `agentCategory` parameter to `seedAgent` (default: `"team"`)
- Add auto-derivation of `agentCategory` from role catalog in `seedMinimalWorld` and `seedMultiAgentWorld` via `findRoleCatalogEntry()`
- Add `agentCategory` to the 3 builtin agent stubs in `seedBuiltinAgents`
- Import `findRoleCatalogEntry` and `AgentCategory` from `@hyperidle/shared`

**Task 12.2: New scenario files** (Phase 4 extension)

The 8 new scenarios go into existing feature files, not new files:

- `packages/eval/src/scenarios/create-artifact.ts`: add `caDesignArtifactDesignerFrontend`, `caRunbookOpsDevops`
- `packages/eval/src/scenarios/handoff-to.ts`: add `htToBuilderDesignerFrontend`, `htToBuilderOpsDevops`
- `packages/eval/src/scenarios/create-item.ts`: add `ciReviewRequestDesignerHealthcare`, `ciBugEscalationQaFrontend`
- `packages/eval/src/scenarios/submit-review.ts`: add `srQaGatekeeperQaDevops`
- `packages/eval/src/scenarios/tool-authorization.ts`: add `taUnknownRoleFallback`

Each scenario follows the established pattern: const declaration, add to the exported array.

**Task 12.3: Soul prompt integration**

The designer, qa_engineer, and ops scenarios should use soul prompts derived from `docs/souls/designer.md`, `docs/souls/qa-engineer.md`, and `docs/souls/ops.md` respectively. These are NOT loaded from disk (per the `@lore X7` in seeding.ts -- eval does NOT use the production seed). Instead, the key behavioral constraints from each template are inlined into the `agentSoulPrompt` field of each scenario's seed, same as existing scenarios do with builder and PM soul prompts.

**Task 12.4: Verify `buildDefaultSoulPrompt` handles new roles**

The existing `buildDefaultSoulPrompt(role: UserRole)` returns a generic prompt. Since `UserRole` is now `string`, it already handles "designer", "qa_engineer", "ops", and "custom_analyst" without changes. Verify this at build time.

### 12.9 What this section does NOT change

- **Feature count:** Still 24 interactions. No new interactions from AB0.
- **Framework code:** No changes to `EvalScenario`, `EvalReport`, `FeatureBreakdown`, CLI flags, or runner logic. AB0 adaptation is entirely in seeding + scenarios.
- **Existing scenarios:** Zero changes to the 106 existing scenario definitions. The seeding layer absorbs the adaptation.
- **Facilitator tool restrictions:** The `roles` arrays on the 4 facilitator tools remain `["chief_of_staff", "practice_facilitator", "product_manager"]`. None of the new AB0 roles need facilitator access for the scenarios defined here.
- **Non-session scenarios (interactions 20-24):** Builtin routines, routine sessions, skill autonomy, and delegation scenarios are unchanged. These interactions are owned by CoS and PF -- roles that existed pre-AB0. The new team roles (designer, qa_engineer, ops) do not participate in routine/delegation workflows.
