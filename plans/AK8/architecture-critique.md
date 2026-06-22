# AK8 — Architecture critique (reviewer, Phase 2)

Plan: `plans/AK8/architecture.md`. Concept: `plans/AK8/concept.md`. Code read cold to verify all AK3/AK6/AK7 claims.

**Verification of plan's reality claims — all accurate:**
- `WorkSelectionRequestedEvent` sibling pattern exists (events.ts:305); `KernelEvent` union has the `@lore O1` checklist (events.ts:372). ✓
- `Strategy<TDb>` is a 4-method interface (strategy-port.ts:277); adding a 5th is the AK6/AK7 idiom. ✓
- `runBetDecomposition` NEVER-throws + CAS-NULL→running + markTerminal on every exit (bet-decomposition.ts:269-432). ✓
- `selectOwner({surface:'bet_decomposer', roleHint:'product_manager'})` is the current decomposer-pick site (bet-decomposition.ts:317). ✓
- `enumerateTeamCandidates` reusable (select-agent.ts:56); `SelectionCandidate`/`DecompositionTaskInput` exist in shared. ✓
- Boundary doc §2a row "Trigger=Kernel", §3b "deferred to AK8 = decomposition trigger" (kernel-strategy-split.md:47, 286-288), §4 "AK3-as-built = Minimal fallback" (294-296). ✓
- ESLint: strategy-minimal package ban scoped to server (eslint.config.ts:600); `% <expr>.length` guard scoped to `services/**` ex `select-agent.ts` (932). Fabric round-robin lives in `packages/fabric/` — correctly outside guard scope. ✓

---

## 1. Boundary integrity (§2a cut — does the decision stay in Strategy, mechanism in Kernel?) — 8/10

The Option-A cut is correct and matches §2a row-by-row: Kernel emits `work_decompose_requested` (Trigger), `decomposeBet` returns the plan (Selection/decision), Kernel keeps sandbox/cost/CAS/persist/dispatch (Execution). Option B is rightly rejected with the exact hard-rule citation (strategy-port.ts:294 — Strategy never spawns a session / enforces cost). The design-it-twice is genuine, not theatre.

- **WARNING — the cut leaks for the `tasks:[]` path.** When the Strategy returns `tasks:[]`, the Kernel runs `runRealPmTurn` — i.e. the Kernel decides the breakdown *content* via its own LLM turn, with only the decomposer-agent chosen by the Strategy. Under the Minimal Strategy this is defensible (§4: AK3-as-built IS the Minimal fallback). But the plan markets the same `tasks:[]` for **Fabric** (lines 104-113), claiming "knowledge-matched decomposition" is satisfied by decomposer-selection + `assembleContext` context. That is a thin reading of AC2's "Fabric = knowledge-matched". It is not *wrong* per §2a (the cut holds — the Kernel runs the turn as mechanism), but the spec's word "knowledge-matched breakdown" is delivered only as "knowledge-fed PM turn", with the actual task list still authored by the Kernel-run LLM. The plan acknowledges this ("decomposition quality is explicitly out of scope — eval concern") — acceptable, but the designer must ensure the AC2 test for Fabric does NOT assert a knowledge-derived task list (it cannot, in v1) and instead asserts the no-regression parity. The plan's AC mapping already does this (scenario 2 = parity vs AK3 oracle) — consistent. Leaving as WARNING because the gap between spec wording and v1 reality is real and must be flagged to the reviewer at code time.

## 2. The `tasks:[]` sentinel — sound or confusing? — 6/10

This is the load-bearing decision and the weakest-specified part of the plan.

- **CRITICAL — the rewire (lines 121-134) never reconciles `decomposeBet` with the existing `runDecompositionTurn` test-override seam.** Every protected AK3 integration test injects `runDecompositionTurn` (a deps override that *replaces* the LLM turn and supplies a fixed task list — bet-decomposition.ts:73, AK3-bet-decomposition.integration.test.ts:159,189,380...). Today, when that override is present, `runBetDecomposition` skips `assembleContext` AND the real turn (bet-decomposition.ts:362,389). The plan's step 8 says "if `plan.tasks.length>0` persist; else scratch sandbox + assembleContext + PM turn". But it does not say what happens to `deps.runDecompositionTurn` in the new flow. Three-way interaction is unspecified: (a) Strategy returns `tasks:[]` AND override present → must run the override (current tests depend on this); (b) Strategy returns non-empty tasks AND override present → which wins? The plan is silent. This MUST be resolved in T3: the precedence is almost certainly `plan.tasks` (if non-empty) → else `runDecompositionTurn` override (if present) → else real PM turn. State that ordering explicitly, or the protected tests break in a way the builder will "fix" by relaxing assertions (the exact MEMORY: tests-must-not-drive-behavior trap).

- **WARNING — `tasks:[]` is an overloaded sentinel that conflates two distinct meanings:** "I have no breakdown, you run the default turn" (Minimal/Fabric v1) vs a hypothetical future "I decomposed to zero tasks deliberately." The plan relies on `tasks:[]` → fall through to Kernel turn, but `runBetDecomposition` step 9 ALSO treats an empty `taskList` *after* the turn as `blocked/empty`. So empty-from-Strategy means "run turn" while empty-from-turn means "blocked". A reader cannot tell from the type which empty is which. Mitigation options for the designer: (a) accept it but document the asymmetry loudly with a `@lore` (the plan's T5 does promise a `tasks:[]`-semantics lore comment — good); or (b) make the sentinel explicit (`tasks: DecompositionTaskInput[] | null` where `null` = "run your default turn", `[]` = "I produced zero"). Option (b) is cleaner and removes the New-Hire confusion; the plan should at least record why it rejected it. Not blocking (the `@lore` mitigation is real) but the designer should add the explicit-vs-sentinel design-it-twice note.

- Does `tasks:[]` preserve AK3 behaviour *exactly*? For Minimal: yes IF precedence above is fixed — the Kernel still runs `runRealPmTurn`/override → identical taskList → identical insert/dispatch. The decomposer-id now comes from `decomposeBet.decomposerAgentId` instead of `selectOwner(bet_decomposer)`; the Minimal impl reproduces `find(role===pm) ?? candidates[0]` (plan line 96) which matches the AK7 oracle (agent-selection.ts:110-112). Byte-identical decomposer choice. ✓ (contingent on CRITICAL above).

## 3. AK3 guarantee preservation — 8/10

The per-guarantee table (lines 142-149) is thorough and each guarantee maps to a concrete mechanism. Verified each against code:
- No-false-promise: every new early-exit calls `markTerminal`; the new `decomposeBet` call gets a try/catch → `blocked/failed` mirroring the assembleContext catch (bet-decomposition.ts:379). ✓ sound.
- No-eligible-agent blocker: step 2 `findEligibleTeamAgents` unchanged + new `null`/invalid `decomposerAgentId` → `blocked/no_eligible_agent`. ✓ Reuses same reason code → same UI copy.
- CAS idempotency: event emit + port call are post-CAS (only the CAS winner reaches step 3-4). ✓ Verified the CAS is the first statement in `runBetDecomposition` (bet-decomposition.ts:284); duplicate `bet_state_changed` loses CAS → returns before emit. Correct.
- Crash recovery: `resolveOrphanedDecompositions` untouched; in-process `decomposeBet` crash leaves 'running' → swept. ✓
- User Sovereignty: `decomposeBet` is a pure planning call (no session/tools/cost); fallback turn stays `tools:[]`. ✓

- **WARNING — double-validation gap on `decomposerAgentId`.** Plan step 6 says validate `decomposerAgentId` "via the same load-and-validate guard as selectOwner (active AI user)". But `selectOwner` *itself* does that validation internally (select-agent.ts:149-153) and the plan REMOVES the `selectOwner(bet_decomposer)` call (line 134). So the validation guard the plan reuses no longer runs on this path unless the builder re-implements it inline in `bet-decomposition.ts`. That inline re-implementation is fine, but it is net-new Kernel code that must be specified (load users row, assert kind==='ai' && status==='active', else `blocked/no_eligible_agent`). The plan gestures at it ("same guard as selectOwner") without acknowledging the guard's code no longer executes here. Specify the inline validation in T3 so the builder doesn't assume `decomposeBet` already validated (it returns a raw agentId the Strategy chose — could be off-team/inactive/non-existent for a third-party Strategy).

## 4. AC4 provability + ESLint guard (T4) — 5/10

- **CRITICAL — the existing ESLint guards do NOT prove AC4 for the decomposer decision.** The plan's T4 leans on two existing guards: (a) the `@hyperidle/strategy-minimal` import ban (eslint.config.ts:600) and (b) the `% <expr>.length` round-robin guard (932). Verified both. Neither catches the decomposer-pick regression. The decomposer pick today/in AK7 is `eligible.find(role==='product_manager') ?? eligible[0]` — a `.find()` expression, NOT a `% length` expression. The round-robin guard's selector is `MemberExpression > BinaryExpression[operator='%'] > MemberExpression[property.name='length']` — it would NOT fire on a re-introduced inline `candidates.find(c => c.role === 'product_manager') ?? candidates[0]` in `bet-decomposition.ts`. So a developer could re-add the decomposer decision inline post-AK8 and every guard stays green. AC4 ("swap Strategy = swap behaviour, NO Kernel code change") is therefore NOT statically enforced for the decomposition decision — only the per-task round-robin half (AK7's concern) is guarded. T4 as written is partial theatre for AK8's specific decision. The designer must either (a) add a guard that catches inline decomposer selection (hard — `.find` on candidate arrays is a broad pattern, risk of false positives), or (b) honestly downgrade AC4's static-proof claim: AC4 is proven at RUNTIME by the strategy-swap integration test (T3 — run same commit under Minimal vs a divergent Strategy, assert different decomposer), and the *import ban* prevents the Kernel from naming a concrete Strategy. The runtime test IS a real AC4 proof; the plan should lead with it and stop overselling T4's ESLint as the AC4 enforcement. As-is, the plan claims T4 "proves AC4 statically" (line 188) — that claim is false for the decomposer decision.

- **WARNING — the AC4 swap test needs a *divergent* Strategy, not two role-match-PM Strategies.** Plan line 205 proposes swapping `minimalStrategy` vs `fabricStrategy`. But both pick `find(role===pm) ?? candidates[0]` identically — so on a single-PM team they return the SAME decomposer and the test proves nothing. The test must use a Strategy whose `decomposeBet` returns a demonstrably *different* decomposer (e.g. a fixture that picks `candidates[last]` or a non-PM) to show behaviour changed with no Kernel edit. Specify this in T3 or AC4's runtime proof is vacuous.

## 5. Ordered tasks — sequencing & commit boundaries — 8/10

T1 (shared contracts) → T2 (Strategy impls) → T3 (rewire) → T4/T5 is correct topological order: shared contracts precede consumers (the workplanning-dependency-order MEMORY). Each is a clean commit boundary.

- **WARNING — T1/T2 omit the protected-test Strategy-mock update.** Adding `decomposeBet` to `Strategy<TDb>` makes `makeFabricLikeStrategy()` (AK3 integration tests, AK3-bet-decomposition.integration.test.ts:66) and any other inline Strategy fixture fail to typecheck — they construct a `Strategy` object literal missing the new method. This is forced by `npm run check` the moment T1 lands. The plan's "Protected tests: setup may evolve" note (line 216) covers the *permission* to edit but T1/T2 don't list the fixtures as files-to-touch, so the builder hits a typecheck wall between T1 and T2 with no task owning the fix. Add to T1 (or a T1.5): "update every inline `Strategy` test fixture to implement `decomposeBet`; assertions frozen, only the fixture shape grows." Same applies to `minimalStrategy`/`fabricStrategy` real impls (covered by T2) and any fabric/strategy-minimal unit-test fixtures.

- NICE-TO-HAVE — T5 marks `server-factory.ts` as "no logic change expected — confirm". Good that it's a confirm-only task; `registerBetDecomposition` deps are unchanged (verified — subscriber only needs `BetDecompositionDeps`, no Strategy injection; it reads `getActiveStrategy()` at call time). ✓

## 6. AC → runtime-test mapping — 8/10

Every AC maps to a concrete integration test (DB + event-bus), not just lint/typecheck:
- AC1: emit assertion + decision-source assertion (strategy-swap). Runtime. ✓
- AC2: scenario 1 (Minimal ≥1 task) + scenario 2 (Fabric parity vs AK3 oracle). Runtime. ✓
- AC3: no-eligible blocker, strategy-throw → blocked/failed, duplicate-event idempotency, plus protected AK3 crash-recovery/4-state/`tools:[]` stay green. Runtime. ✓
- AC4: strategy-swap runtime test (the real proof — see §4) + import ban. ✓

- **WARNING — AC1 "Kernel does NOT decide" needs a test that would FAIL if the Kernel hard-coded the breakdown.** The proposed AC1 test (line 202: "the breakdown comes from `decomposeBet` not a Kernel constant; spy/strategy-swap shows different output") is correct in intent but must be a *spy on `decomposeBet` being called* PLUS the divergent-Strategy swap from §4. A test that only asserts "≥1 task created" passes even if the Kernel ignored the Strategy. Make the spy-call assertion explicit in T3 (`expect(strategy.decomposeBet).toHaveBeenCalledWith(objectContaining({betId}))`).

- NICE-TO-HAVE — no test named for the new `work_decompose_requested` emit being *post-CAS* (i.e. duplicate event → exactly ONE emit). The plan mentions it (line 182) — keep it; it's the AC3-idempotency proof for the new event specifically.

## 7. Naming & honesty — 9/10

`work_decompose_requested` parallels `work_selection_requested` — reads as a family (concept §vocab). `DecomposeBetRequest`/`DecompositionPlan`/`decomposeBet` are honest. The plan is candid about the `bet_decomposer` AK7 surface going dead at the production call site (line 158) and pre-flags it for the reviewer's dead-code lens — exactly right given the AK7 retro's inverse-CRITICAL (a seam wired nowhere). The "retain surface, remove caller" decision is well-justified (no closed-union churn, AK7 protected tests reference it).

- NICE-TO-HAVE — `DecompositionPlan.decomposerAgentId: string | null` mirrors `SelectAgentOutcome.agentId: string|null` honestly. Consider documenting that a non-null id here is NOT pre-validated (unlike `selectOwner`'s return) — see §3 double-validation gap.

## 8. Module depth / no leakage into Strategy packages — 9/10

The plan keeps `runRealPmTurn`, `adapterPool`, `resolveModel`, `checkCostCap`, sandbox path all Kernel-side (verified they live in bet-decomposition.ts + imported from fabric for cost only). `decomposeBet` carries only `db`/ids/description/candidates — no harness, no cost, no sandbox. Proportional: the port method is a planning call exactly like `selectAgent`. No new shared types beyond the two + event. Minimal surface. ✓

## 9. Security & abuse — 9/10

Thorough and correct:
- Agent-authored task fields (future third-party Strategy) flow through the SAME `insertProposedBetTasks` truncation + `betId`-from-bet binding (verified bet-decomposition.ts:180-191, betId never from input). ✓
- Unattachable-session guard on `decomposerAgentId` — BUT see §3 WARNING: the guard must be re-implemented inline since `selectOwner` is removed; the security section assumes it runs. Cross-reference §3.
- Cost pre-flight retained Kernel-side on the validated decomposer. ✓
- Rate-limit/SSRF/path-traversal/secrets correctly N/A (no new route, scratch path Kernel-derived from betId, unchanged). ✓

---

## Overall: 7.0 / 10 — REVISE (one CRITICAL blocks pass)

The plan is well-grounded, reconciles spec↔reality accurately, and the §2a cut is correct. But two CRITICAL gaps must be closed before code:

### CRITICAL (must resolve)
1. **`decomposeBet` ↔ `runDecompositionTurn` override precedence is unspecified (§2).** Every protected AK3 integration test injects `runDecompositionTurn`. The rewire (lines 121-134) never says how the new `tasks:[]` fall-through interacts with the existing override seam. Without an explicit precedence (`plan.tasks` non-empty → else `runDecompositionTurn` override → else real PM turn), the protected tests break and the builder is pushed toward relaxing frozen assertions. Specify the three-way ordering in T3.
2. **T4 ESLint does NOT statically prove AC4 for the decomposition decision (§4).** The `% length` guard cannot catch a re-introduced inline `candidates.find(role===pm)` decomposer pick; the import ban only stops naming a concrete Strategy. The plan's claim "T4 proves AC4 statically" is false for the decomposer decision. Either add a guard that catches inline decomposer selection, or downgrade the claim and lead AC4 on the runtime strategy-swap test — and make that swap test use a *divergent* Strategy (§4 WARNING), else it's vacuous.

### WARNING (should resolve)
- **W1** Inline `decomposerAgentId` validation must be specified in T3 — `selectOwner`'s internal active-AI guard no longer runs once the call is removed (§3).
- **W2** AC4 swap test must use a divergent-decomposer Strategy, not minimal-vs-fabric (both pick the same PM) — otherwise the AC4 runtime proof is vacuous (§4).
- **W3** T1/T2 must list the protected-test Strategy fixtures (`makeFabricLikeStrategy` et al.) as files-to-touch — adding the 5th port method breaks their typecheck; assertions stay frozen, only fixture shape grows (§5).
- **W4** AC1 test must spy that `decomposeBet` was actually called (not just "≥1 task created") so it fails if the Kernel ignored the Strategy (§6).
- **W5** Fabric `tasks:[]` v1 delivers "knowledge-matched" only as decomposer-selection + context-fed turn, not a knowledge-derived task list. Ensure the AC2-Fabric test asserts AK3-parity, not a knowledge breakdown (§1). Plan already does this — keep it explicit at code time.

### NICE-TO-HAVE
- Reconsider the overloaded `tasks:[]` sentinel vs an explicit `tasks: [...] | null` (§2 W); at minimum the promised T5 `@lore` must spell out the empty-from-Strategy ("run turn") vs empty-from-turn ("blocked/empty") asymmetry.
- Document that `DecompositionPlan.decomposerAgentId` is NOT pre-validated by the Strategy (§7).

Score is exactly at the 7 threshold but the two CRITICALs are unresolved → **REVISE**. None require redesign — all are specification tightenings within the chosen Option-A architecture. The cut is sound; the plan just under-specifies the test-seam interaction and oversells the static AC4 proof.
