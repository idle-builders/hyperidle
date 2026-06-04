# Architecture Critique: X8 v4+combined (full)

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:8 LI:9 AC:7 DM:7 N:9 MD:8 FMC:6 S:7 V:7

---

## Dimension Scores

### 1. Spec Alignment (SA: 8/10)

The v4+combined architecture delivers 106 scenarios across 24 interactions. The original 83 scenarios were well-justified per code path analysis. Section 11 adds 23 combined eval scenarios across the three cross-cutting foundations (Session: 7, Materialized knowledge: 8, Composed prompt: 8). The concept's requirement for per-interaction diversity is satisfied: every interaction has at least 3 scenarios, the diversity question is answered substantively for each, and the "no domain" convention for system-level interactions (20-24) is correctly applied.

The expansion is motivated by a real gap: the original 9 cross-cutting scenarios tested each foundation in isolation, but the concept's core thesis is that these foundations shape ALL downstream tool usage. The combined evals directly test that thesis.

The per-interaction counts are now 10/11/11 for the three cross-cutting interactions. This is a significant increase from 3/3/3. The justification is that each new scenario crosses a different tunable surface (cost pressure, knowledge density, soul prompt constraint, etc.) with a specific tool, and no two scenarios exercise the same cross-cutting effect. I verified this claim against the scenario tables -- each combined eval tests a unique combination of foundation x tool x surface.

Gap: The expansion adds 23 LLM-dependent session-based scenarios. At ~$0.05/scenario (full model), the cost increase is ~$1.15 per full run. The architecture correctly notes that none carry the `quick` tag. However, the `quick` set (10 scenarios) remains unchanged despite the 27% scenario count increase. A `quick` scenario for each cross-cutting foundation would provide faster feedback on regressions in the new combined evals.

### 2. Layer Integrity (LI: 9/10)

Unchanged from v4 critique. The eval package sits outside the three-layer architecture. Combined eval scenarios import from the same public APIs (`@hyperidle/fabric`, `@hyperidle/db`) as the original scenarios. No new layer violations introduced.

The combined evals' seeding patterns (multiple `seedKnowledge()` calls, custom soul prompts via `seedAgent()`, `seedFactorySettings()` for weight overrides) use the same seeding library as standalone scenarios. Seeding complexity increases but the import chain remains clean.

### 3. API Contracts (AC: 7/10)

**Existing contracts from v4 remain valid.** The `feature` field, `FeatureBreakdown`, `--feature` flag, and seeding helper signatures are unchanged.

**New combined eval rubric dimensions introduce 36 new judge functions** (Section 11.8). Of these:
- 14 are rule-based (DB queries or string matches) -- straightforward.
- 20 are LLM-as-judge -- each needs a prompt template, response parsing, and error handling. The architecture specifies WHAT each judges but not HOW for the 20 LLM-as-judge dimensions. The existing `judgeLlmQuality` factory (Section 4) covers the interface but not the specific criteria strings. The builder must write 20 distinct criteria strings with binary/anchored scoring. The architecture gives a one-line description per dimension but no example criteria. This is a repeat of WARNING-5 from v4 at larger scale.
- 2 are hybrid (rule + LLM) -- the contract for combining a boolean check with an LLM score is not specified. Does the hybrid score 0.0 if the rule fails regardless of LLM? Or does it blend?

**`fewer_tool_calls` dimension references events not persisted to DB.** Section 11.8 says this dimension is "Rule-based: Count tool_call_recorded events in session." But `tool_call_recorded` events are stored in an in-memory `SessionActivityBuffer` (server/src/app.ts line 399) that exists for the REST API activity endpoint. The eval harness (`runEvalSession` via `provisionSession`) may or may not have access to this buffer. The `JudgeContext` provides `db` and `seedResult` but not the `SessionActivityBuffer`. The architecture does not specify how the judge accesses tool call counts. See WARNING-6 below.

**`sess-cost-warning-builder-frontend` references `seedAgent({ costCapMinor: 300 })`.** The current `seedAgent` (seeding.ts lines 90-118) does NOT accept `costCapMinor`. The `users` table has `costCapMinor` (schema.ts line 47), but the seeding helper omits it. The builder must extend `seedAgent` or use a raw DB insert. See WARNING-7 below.

**`sess-appetite-scoping-pm-frontend` relies on `bet.appetite="small"`.** The `seedBet` helper (seeding.ts lines 122-148) does NOT seed the deprecated `appetite` text column -- it only seeds `costAppetiteMinor`. The `SessionContextData.bet.appetite` will be `null` for all seeded bets, rendering as `**Appetite:** null` in the composed prompt (prompt-composition.ts line 171). The scenario's claim that the agent will see "small batch" appetite in its prompt is false without either extending `seedBet` to accept `appetite` or adding a raw DB update. See WARNING-8 below.

### 4. Data Model Alignment (DM: 7/10)

**All 52 column references from v4 remain verified.** No new direct column references introduced in Section 11 -- the combined eval scenarios reuse the same rubric dimensions from Sections 5.1-5.24.

**However, the combined eval scenarios make implicit claims about data availability that are not verified:**

1. **Prior session history (sess-prior-session-builder-devops).** The scenario claims "prior session context is available via `buildSessionContextData` only if the task description references it." Verified: `buildSessionContextData` (session-context.ts lines 52-101) queries ONLY `tasks`, `bets`, `users`, and `teams` tables. It does NOT query `sessions` for prior sessions on the same task. The agent's only knowledge of prior sessions comes from the task description (a static string). The scenario seeds prior sessions in the DB and seeds the task description with "Continue the CI/CD pipeline work" -- but the agent has no way to see the prior session's `notes` or `outcome` fields. The scenario's `no_duplicate_work` rubric dimension depends on the agent reading the task description (which just says "continue...") and inferring what was already done. This is measuring task description quality, not session history awareness. The scenario description is misleading about what mechanism provides prior session context.

2. **Cost cap proximity in session context.** The `sess-cost-pressure-*` scenarios seed `costAppetiteMinor` on the bet. The composed prompt includes `bet.appetite` (the deprecated string field) and `bet.description`. It does NOT include `costAppetiteMinor` or `costActualMinor`. The cost information the agent sees is `**Appetite:** null` (because `appetite` is not seeded). For cost pressure to actually appear in the prompt, the builder must either:
   - Seed `bet.appetite` with a string like "$3.00 budget"
   - Embed cost information in `bet.description` or `task.description`
   - Extend `buildTaskSection` to include `costAppetiteMinor`

   The architecture describes seeding `costAppetiteMinor` but does not trace how that value reaches the agent's prompt. See CRITICAL-2 below.

3. **Cost warning events reaching the agent.** `sess-cost-warning-builder-frontend` says "depends on whether the harness surfaces cost events to the agent." The architecture correctly hedges this but still includes `behavior_after_warning` as a rubric dimension. If the harness does NOT surface cost events, this dimension is untestable as described. The architecture should explicitly state whether this dependency is met.

### 5. Naming (N: 9/10)

Naming conventions from v4 remain consistent. The 23 new scenario IDs follow the established `{prefix}-{description}-{role}-{domain}` pattern. Combined eval scenario IDs are descriptive: `sess-cost-pressure-builder-devops`, `mk-l2-guides-decomposition-pm-healthcare`, `cp-role-constraint-pm-frontend`. The prefix makes it immediately clear which cross-cutting foundation is being tested.

The 36 new rubric dimension names (Section 11.8) are clear and consistent: `l2_content_used`, `l3_content_used`, `l4_principles_used`, `factory_scope_observed`, `cross_product_reasoning`. The naming makes the layer/scope being tested immediately obvious.

### 6. Module Depth (MD: 8/10)

The expansion adds scenarios to existing feature-grouped files (`session.ts`, `materialized-knowledge.ts`, `composed-prompt.ts`). This is the right call -- combined evals belong with their foundation interaction, and `--feature session` filtering continues to work.

The 36 new judge functions (Section 11.8) are proposed for a new `packages/eval/src/judges/` directory alongside the existing flat `judges.ts`. This is a reasonable refactor given the scale: 36 new functions + the existing set makes a single file unwieldy. However, the architecture should specify the file structure within `judges/` -- one file per category (rule-based, llm-as-judge, hybrid) or one per interaction? The current plan leaves this to the builder.

Task 3.5 (implement 36 judge functions) is listed after Task 3.1-3.2 but does not specify whether the new judges go in the existing `judges.ts` or the new `judges/` directory. This is ambiguous.

### 7. Failure-Mode Coverage (FMC: 6/10)

**Carried forward from v4 (still applicable):**

- **CRITICAL-1: `checkAndFireRoutine` requires `taskId` in triggerConfig.** Unchanged. The v4 finding is still valid. The expansion does not address it.
- **WARNING-1: Feature name type safety still missing.** Now at 106 scenarios, the risk is higher.
- **WARNING-2: Factory settings key mismatch.** Unchanged. Still applies to `rs-cost-cap-blocked` and `br-cost-sentinel-*`.
- **WARNING-3: Builtin routine scenarios must seed routine rows.** Unchanged.
- **WARNING-4: `seedConflict` versionCurrent consistency.** Unchanged.
- **WARNING-5: `judgeLlmQuality` implementation still unspecified.** Now worse: 20 additional LLM-as-judge dimensions with unspecified criteria strings.

**New failure modes from Section 11:**

- **CRITICAL-2: Cost information does not reach the agent's prompt.** See Data Model Alignment above. Three combined evals (`sess-cost-pressure-builder-devops`, `sess-cost-pressure-pm-marketing`, `sess-cost-warning-builder-frontend`) depend on the agent being cost-aware, but `costAppetiteMinor`/`costActualMinor` are not included in the composed prompt. The deprecated `appetite` field is null for seeded bets. Cost awareness requires either extending the prompt composition to include structured cost data, or encoding cost information into `bet.description` / `task.description`. The architecture does not trace the data path from seed to prompt for cost scenarios.

- **WARNING-6: `fewer_tool_calls` judge cannot access tool call counts.** The `tool_call_recorded` events are in an in-memory buffer not available to eval judges. The judge would need to either: (a) count DB side effects as a proxy for tool calls, (b) add a tool-call log to the DB, or (c) access the harness event stream. None of these options are specified.

- **WARNING-7: `seedAgent` does not accept `costCapMinor`.** The `users.costCapMinor` column exists (schema.ts line 47) but `seedAgent` omits it. Scenarios `sess-cost-warning-builder-frontend` and `sess-cost-pressure-*` need this parameter.

- **WARNING-8: `seedBet` does not seed `appetite`.** The deprecated `bets.appetite` text column is the only string that appears in the composed prompt's task section. `seedBet` only seeds `costAppetiteMinor` (integer, not included in prompt). Scenarios `sess-appetite-scoping-pm-frontend` rely on a non-null `appetite` value that the current seeding helper cannot produce.

- **WARNING-9: `sess-prior-session-builder-devops` overstates session history mechanism.** `buildSessionContextData` does not query prior sessions. The scenario's `no_duplicate_work` and `session_notes_reference_prior` dimensions depend on the agent reading the task description string, not on any structured session history. The scenario description should clarify that prior session awareness is seeded via task description, not via the session context pipeline.

### 8. Simplicity (S: 7/10)

**The combined eval design principle is sound.** The two-layer structure (foundation + tool) with independent failure modes is clean. The diagnostic value is real: when a combined eval scores low, you learn whether the foundation is failing to influence behavior OR the tool is broken.

**Complexity concerns:**

1. **106 scenarios is a large surface area.** The v4 critique noted 83 was ambitious. Adding 23 more brings the total to 106 scenarios in 25 files. The non-session scenarios (17) remain cheap, but the remaining 89 all require LLM calls. At $0.05/scenario, a full run costs ~$4.50. This is acceptable but the architecture should update the cost estimate in R1 (currently says "$1-4").

2. **20 new LLM-as-judge dimensions multiply variance.** The v4 architecture uses LLM-as-judge for ~15 existing dimensions. Adding 20 more means 35+ LLM-as-judge evaluations per full run. Each adds non-determinism. The architecture acknowledges this ("The combined evals lean heavily on LLM-as-judge because the cross-cutting effects are behavioral") but does not propose mitigation beyond the existing `judgeLlmQuality` factory. Consider: a shared LLM-as-judge temperature setting, or a "strict mode" that uses binary criteria only.

3. **Baseline comparison without a comparison engine.** Three scenarios are "explicitly designed as comparison points" against existing scenarios. The architecture says "the developer compares scores across scenarios manually." This is fine for now (the `--compare` flag is deferred), but the combined evals' value proposition depends on being compared to their standalone counterparts. Without automated comparison, the baseline relationship is documentation-only.

4. **The `sess-prior-session-builder-devops` scenario seeds complex state that is invisible to the agent.** Seeding prior sessions in the DB when `buildSessionContextData` does not query them creates complexity that does not influence the test outcome. The scenario's value comes from the task description string, not the seeded sessions. The extra seeding is misleading.

### 9. Verifiability (V: 7/10)

**The v4 validation tasks (5.1-5.5) are retained.** The expansion adds Task 4.25 (implement 23 combined eval scenarios) and Task 3.5 (implement 36 judge functions). Both are verifiable via typecheck + lint.

**Runtime verification is harder for combined evals.** The combined evals ALL require LLM calls (they are session-based). None are deterministic. None carry `quick` tags. The builder cannot verify any combined eval without API keys. The v4 critique's SUGGESTION-1 (validate at least one non-session scenario during build) is still valid, but provides no coverage for the new combined eval scenarios.

**The LLM-as-judge criteria strings are not verifiable at build time.** The builder can write 20 criteria strings that typecheck and lint but produce meaningless scores (too lenient, too strict, or off-target). The architecture does not specify how to validate judge quality. A single end-to-end test of one combined eval scenario would catch judge wiring issues.

**Cost estimate update needed.** R1 says "$1-4" for a full suite. With 106 scenarios (89 LLM-based + 17 deterministic), the estimate should be $4-6.

---

## CRITICAL Findings (must fix before build)

### CRITICAL-1: `checkAndFireRoutine` silently fails without `taskId` in triggerConfig

**Carried forward from v4 critique.** Unchanged and still critical. All scenarios in Sections 5.22 and 5.24 that call `checkAndFireRoutine` will silently return `{ fired: false, reason: "no taskId in trigger config" }` if `seedRoutine` is called without `taskId` in `triggerConfig`.

**Resolution:** Same as v4 -- add explicit guidance that `triggerConfig` must include `taskId` pointing to a seeded task row.

### CRITICAL-2: Cost information does not reach the agent's composed prompt

Three combined eval scenarios depend on the agent being cost-aware:

- `sess-cost-pressure-builder-devops`: "Rubric checks agent used fewer tool calls... session notes mention cost awareness"
- `sess-cost-pressure-pm-marketing`: "session notes reference budget constraint"
- `sess-cost-warning-builder-frontend`: "session notes acknowledge cost situation"

The composed prompt includes `**Appetite:** ${context.bet.appetite}` (prompt-composition.ts line 171). For seeded bets, `bet.appetite` is `null` (the `seedBet` helper does not set the deprecated `appetite` column). The prompt renders `**Appetite:** null`. The structured `costAppetiteMinor` field is NOT included in the composed prompt -- `buildTaskSection` does not reference it.

The agent has no way to be cost-aware from its prompt. These scenarios will either:
1. Score 0.0 on cost-awareness dimensions (the agent has no cost information)
2. Require the builder to embed cost info in `bet.description` or `task.description` (undocumented workaround)
3. Require extending `buildTaskSection` to include `costAppetiteMinor` / `costActualMinor` (out of scope for X8)

**Resolution:** Either:
- (a) State explicitly that cost pressure scenarios seed cost information into `bet.description` or `task.description` strings (e.g., `description: "Design a frontend component. Budget: $3.00."`), or
- (b) Extend `seedBet` to accept the deprecated `appetite` string and seed it with a human-readable cost string, or
- (c) Remove the cost-awareness rubric dimensions from these scenarios and test only structural cost cap behavior (session completion under cost pressure, not agent reasoning about cost).

---

## WARNING Findings (should fix)

### WARNING-1: Feature name type safety still missing (v4 carry-forward)

At 106 scenarios, a feature name typo creates a larger blind spot. Define a string literal union type.

### WARNING-2: Factory settings key mismatch (v4 carry-forward)

`seedMinimalWorld` uses keys `"factory_cost_cap_minor"` and `"factory_cost_cap_currency"`. The service functions use `"cost_cap"` and `"cost_actual"`. Still applies to `rs-cost-cap-blocked` and `br-cost-sentinel-*` scenarios.

### WARNING-3: Builtin routine scenarios must seed routine rows (v4 carry-forward)

`runBuiltinRoutine` fetches the routine by ID from the DB. Unchanged.

### WARNING-4: `seedConflict` versionCurrent consistency (v4 carry-forward)

Unchanged.

### WARNING-5: `judgeLlmQuality` implementation still unspecified (v4 carry-forward, worsened)

Now 20+ additional LLM-as-judge dimensions with one-line descriptions. The builder must write criteria strings for: `efficiency_improved`, `decomposition_efficiency`, `reflection_quality`, `scope_appropriate`, `behavior_after_warning`, `no_duplicate_work`, `l2_content_used`, `l3_content_used`, `l4_principles_used`, `new_knowledge_relevant`, `coaching_quality`, `cross_layer_awareness`, `scope_awareness`, `constraint_observed`, `memory_on_brand`, `message_on_brand`, `workspace_navigated`, `identity_partial`, `tool_description_followed`, `factory_scope_observed`, `cross_product_reasoning`. Without example criteria strings, the builder will produce inconsistent quality.

### WARNING-6: `fewer_tool_calls` dimension cannot access tool call counts

The `tool_call_recorded` events are stored in an in-memory `SessionActivityBuffer` (app.ts line 399), not in the DB. The `JudgeContext` provides `db` and `seedResult` but not the activity buffer. The judge function cannot count tool calls as described.

**Recommendation:** Either (a) remove `fewer_tool_calls` as a rubric dimension and rely solely on `efficiency_improved` (LLM-as-judge on session notes), or (b) specify that the judge counts DB side effects as a proxy (count new rows in messages, items, tasks, knowledge_items created during the session), or (c) extend `JudgeContext` to include tool call count from the harness event stream.

### WARNING-7: `seedAgent` does not accept `costCapMinor`

The `users.costCapMinor` column exists but `seedAgent` (seeding.ts lines 90-118) does not expose it. Scenarios `sess-cost-warning-builder-frontend` needs `costCapMinor=300` on the agent. The builder must extend `seedAgent`.

**Recommendation:** Add `costCapMinor?: number` and `costCapCurrency?: string` to `seedAgent` opts.

### WARNING-8: `seedBet` does not seed `appetite`

The deprecated `bets.appetite` column is the only bet-level string in the composed prompt (`**Appetite:** ${context.bet.appetite}`). `seedBet` seeds `costAppetiteMinor` but not `appetite`. The `sess-appetite-scoping-pm-frontend` scenario requires `appetite="small"` to appear in the prompt but the seeding helper cannot produce this.

**Recommendation:** Add `appetite?: string` to `seedBet` opts (the deprecated column still exists in the schema and is read by session context).

### WARNING-9: `sess-prior-session-builder-devops` overstates session history

`buildSessionContextData` does not query prior sessions. The agent's only knowledge of prior work comes from `task.description` (a static string seeded by the eval). The scenario description implies a richer session history mechanism than actually exists. The `no_duplicate_work` and `session_notes_reference_prior` dimensions measure task description comprehension, not session history awareness.

**Recommendation:** Rewrite the scenario description to clarify: "Prior session awareness is seeded via task description text, not via structured session history in the session context pipeline. The agent's continuity cue is the task description containing 'Continue the CI/CD pipeline work.'"

---

## SUGGESTION Items

### SUGGESTION-1: Add `quick` tags to at least one combined eval per foundation

The `quick` set (10 scenarios) has no combined eval representation. A regression in cost pressure handling, knowledge utilization, or prompt identity delivery would only be caught in a full run. Tag one combined eval per foundation:
- `sess-cost-pressure-builder-devops` (cheapest session combined eval for cost pressure)
- `mk-sparse-creates-knowledge-builder-consulting` (tests graceful degradation with minimal seed)
- `cp-role-constraint-pm-frontend` (tests prompt constraint with clear pass/fail)

### SUGGESTION-2: Specify hybrid judge scoring contract

Two dimensions (`planning_evidence`, `high_value_items_used`) are hybrid (rule + LLM). When the rule-based check fails (e.g., no plan section found by regex), does the dimension score 0.0 immediately? Or does the LLM still evaluate? Specify: "Hybrid dimensions: rule check gates LLM evaluation. If the rule check fails, score is 0.0 and the LLM is not called. If the rule check passes, score is the LLM evaluation result."

### SUGGESTION-3: Update R1 cost estimate

R1 says "$1-4" for a full suite. With 106 scenarios (89 LLM-based), the estimate should be "$4-6" at DeepSeek pricing or "$8-12" at Claude Sonnet pricing. The non-session scenarios (17) still cost $0.

### SUGGESTION-4: Specify `judges/` directory structure

Task 3.5 adds 36 judge functions but does not specify file organization within `packages/eval/src/judges/`. Recommendation: group by type, not by interaction:
- `judges/rule-based.ts` (14 functions)
- `judges/llm-as-judge.ts` (20 functions)
- `judges/hybrid.ts` (2 functions)
- `judges/index.ts` (barrel re-export)

This aligns with the existing pattern of one barrel per directory.

### SUGGESTION-5: Clarify EventBus requirement for non-session scenarios (v4 carry-forward)

The `checkAndFireRoutine` function requires an `EventBus` instance. The architecture should note how the eval runner provides this for non-session scenarios.

---

## Coverage Sufficiency Analysis

### Revised totals

| Feature | Original | Expanded | Total | Assessment |
|---------|----------|----------|-------|------------|
| session | 3 | +7 | 10 | Was minimal (3), now comprehensive. 7 combined evals each test a different tunable surface. No padding. |
| materialized_knowledge | 3 | +8 | 11 | Was minimal (3), now comprehensive. 8 combined evals cover L2/L3/L4/sparse/dense/cross-layer/community/budget. |
| composed_prompt | 3 | +8 | 11 | Upgraded from MEDIUM to HIGH complexity. 8 combined evals cover identity/constraint/brand/workspace/truncation/tools/template/scope. |
| All others | 77 | +0 | 77 | Unchanged from v4. |
| **Total** | **83** | **+23** | **106** | 27% increase, all in cross-cutting foundations. |

### Combined eval quality assessment

The 23 new scenarios are well-designed in concept: each tests a unique foundation x tool x surface combination. The "two-layer" rubric design (foundation + tool-correctness) is the right structure for cross-cutting evals. When a combined eval fails, the developer can distinguish between "the tool broke" and "the foundation failed to influence behavior" by checking whether the tool-correctness dimensions pass while the cross-cutting dimensions fail.

**Strongest combined evals:**
- `cp-role-constraint-pm-frontend` -- clear binary outcome (did the PM avoid create_artifact?), testable via rule-based judge, directly measures prompt influence.
- `mk-sparse-creates-knowledge-builder-consulting` -- tests graceful degradation, has clear DB-observable outcome (write_memory called), minimal seeding.
- `cp-truncation-degradation-builder-healthcare` -- exercises a real code path (truncatePersona), has structural observable outcome (session completed), plus LLM quality assessment.

**Weakest combined evals:**
- `sess-cost-pressure-builder-devops` -- depends on cost information reaching the agent (CRITICAL-2), relies on `fewer_tool_calls` which cannot access tool call counts (WARNING-6), and the `efficiency_improved` dimension is a vague LLM judgment.
- `sess-prior-session-builder-devops` -- overstates the mechanism (WARNING-9), complex seeding for state the agent cannot see.
- `sess-appetite-scoping-pm-frontend` -- depends on `appetite` being seeded (WARNING-8), a deprecated field.

### Role coverage (revised)

| Role | Original | +Combined | Total | Assessment |
|------|----------|-----------|-------|------------|
| builder | 28 | +9 | 37 | Heavy but appropriate -- primary consumer of all three foundations |
| product_manager | 19 | +8 | 27 | Heavy but appropriate -- richest constraint surface |
| chief_of_staff | 14 | +2 | 16 | Adequate |
| practice_facilitator | 11 | +3 | 14 | Adequate |
| growth | 5 | +0 | 5 | Zero combined evals. The architecture's justification (same code paths as builder) is correct. |
| brand_voice | 2 | +1 | 3 | Minimal but targeted -- the one combined eval tests multi-tool brand consistency. |

### Domain coverage (revised)

| Domain | Original | +Combined | Total | Assessment |
|--------|----------|-----------|-------|------------|
| devops | 17 | +5 | 22 | Heavy -- serves as the baseline domain for builder scenarios |
| consulting | 9 | +7 | 16 | Large increase -- exercises cross-product reasoning |
| healthcare | 8 | +4 | 12 | Good -- compliance domain provides strong signal for knowledge influence |
| marketing | 10 | +3 | 13 | Adequate |
| frontend | 10 | +3 | 13 | Adequate |
| sales | 4 | +1 | 5 | Minimal growth |
| finance | 5 | +0 | 5 | No combined evals |
| legal | 3 | +0 | 3 | No combined evals |
| (no domain) | 17 | +0 | 17 | System-level, unchanged |

Finance and legal have zero combined eval scenarios. The architecture does not explicitly justify this. However, since combined evals test foundation x tool interactions (not domain-specific judgment), the domain choice is less significant. The existing standalone evals cover finance and legal for domain-relevant tool judgment.

---

## Prior Critique Findings Status

| Finding | Status | Notes |
|---------|--------|-------|
| CRITICAL-1 (taskId in triggerConfig) | **Still open** | Section 11 does not address it. Still applies to all checkAndFireRoutine scenarios. |
| WARNING-1 (feature name type safety) | **Still open** | Risk increased from 83 to 106 scenarios. |
| WARNING-2 (factory settings key mismatch) | **Still open** | Unchanged. |
| WARNING-3 (builtin routine rows) | **Still open** | Unchanged. |
| WARNING-4 (seedConflict versionCurrent) | **Still open** | Unchanged. |
| WARNING-5 (judgeLlmQuality unspecified) | **Worsened** | 20 additional LLM-as-judge dimensions. |

All v4 findings remain applicable. The expansion did not address any of them.

---

## What's Working Well

- **The two-layer combined eval design is the right abstraction.** Foundation + tool-correctness with independent failure modes gives real diagnostic value. This is not "more scenarios for more coverage" -- each combined eval has a unique diagnostic angle that the standalone eval does not provide.

- **File organization decision is correct.** Combined evals live alongside their foundation interaction's file, keeping `--feature` filtering working. This avoids a separate "combined" directory that would fragment the eval structure.

- **The complexity upgrade for composed_prompt (MEDIUM to HIGH) is justified.** The composed prompt is the primary mechanism through which HyperIdle influences agent behavior. Every other interaction's quality depends on it. The original 3 scenarios were insufficient for this foundational role.

- **Zero-domain convention for system-level interactions.** The 17 non-domain scenarios (interactions 20-24) correctly skip domain, and the combined evals for session/knowledge/prompt correctly apply domain because they test agent judgment through tool usage, which IS domain-influenced.

- **The expansion's growth-is-not-represented justification is honest.** Growth uses the same tools as builder, and the cross-cutting machinery (session, materialization, prompt) is identical. Adding growth combined evals would be padding.
