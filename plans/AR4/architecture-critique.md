# AR4 — Architecture Critique

**Reviewer:** Phase-2 evaluator (fresh read of `plans/AR4/architecture.md`).
**Verdict: REVISE.** Overall **6/10**. One **CRITICAL** (the assistant-turn matrix is unbuildable as specified — an internal inconsistency between the 4-harness coverage requirement and `runAssistantTurn`'s builtin-only construction). Strong on the dispatcher/route half (AD2/R1), strong on reconciliation and honesty elsewhere; the assistant-turn half rests on a mechanism the production code cannot support.

---

## What the plan gets right (verified against code)

- **`runAssistantTurn` ≠ `provisionSession` (Q2) — confirmed.** `assistant-turn.ts:217` takes `AssistantTurnDeps {db,eventBus,adapterPool,credentialResolver?,runTurn?,turnTimeoutMs?}`, selects an adapter from the pool (`:376`) and drives `startSession`/`drainStreamEvents` directly. Never calls `provisionSession`. The plan's spine — "don't route assistant turns through `runThroughHarness`" — is correct.
- **Dispatcher production touch is real, necessary, and minimal — confirmed.** `drainQueue` builds the `provisionSession` deps inline at `task-dispatcher.ts:366-374` and passes only `db,eventBus,adapterPool,workspace,mcpBridgeRegistry,mcpBaseUrl` — **no** `onBeforeTeardown`. `ProvisionSessionDeps.onBeforeTeardown` exists (`session-provisioning.ts:236`) and production callers omit it (`:1180-1190`, observer throws are swallowed, teardown still runs). Adding an optional field + threading it is ~2 additive lines, preserves the contract, and "observes, does not disable cleanup" per the spec. **Accept.** `mcpBridgeRegistry`/`mcpBaseUrl` are already on `TaskDispatcherDeps` (`:99-103`) — plan step 3's "confirm" is satisfied.
- **Guard is path-only and `routes/__tests__` is unscanned — confirmed.** `isHarnessIntegrationPath` (`honest-harness-predicate.ts:57-62`) matches only `…/harness/__tests__/*.integration.test.ts` or `EXPLICIT_HARNESS_INTEGRATION` suffixes. `SCAN_DIRS` (`honest-harness-guard.ts:389-392`) = `harness/__tests__` + `server/src/__tests__` only. AH3/AK4 live in `routes/__tests__/` (confirmed by `find`) → invisible today. Adding both files to `EXPLICIT_HARNESS_INTEGRATION` and `routes/__tests__` to `SCAN_DIRS` is the correct wiring.
- **AD2 keystone is genuinely buildable.** AD2 fires via `transitionTask(...,"accepted")` after `registerTaskDispatcher` (`:258-261`) — the real entry. 7 `in_progress` seeds exist as downstream/queue fixtures; the plan correctly keeps those as service-integration and drives AC2 via the real trigger. The AD2/R1 paths go through `provisionSession`, so the 4-harness lane table (`SUPPORTED_HARNESS_LANES`) applies verbatim — these two files **can** ship full-matrix.
- **Per-agent-seam full demotion is honest (scrutiny #3).** Verified: the file `vi.mock`s `llm-client` to capture `options.model.model` and asserts `capturedModel.model === PER_AGENT_MODEL_ID` (`:188`), provider (`:189`), and `!BUILT_IN_TIER_IDS.has(...)` (`:192`). That is pure `resolveAgentModel`-vs-`resolveModelTier` routing — no harness behavior. Forcing 4 real LLMs to prove "model id X was selected" would be exactly the over-engineering the demotion avoids. Full demotion to a `resolveAgentModel` unit is the right call. (One caveat under WARNING-3.)

---

## CRITICAL

### C-1. The assistant-turn 4-harness matrix is unbuildable — `runAssistantTurn` is builtin-only by construction; the plan claims it ships "fully covered" across claude/codex/opencode.

The plan's §coverage-debt step 2 asserts each converted assistant-turn file (`AH3-…-real`, `AK4-…-real`, `AH6-…-real`) "already declares all four `requireHarness` lanes → passes the coverage check immediately → AR4 ships its converted files fully covered." This is false. `runAssistantTurn` structurally cannot run the three CLI harnesses:

1. **No sandbox.** `runAssistantTurn` builds `SessionConfig` internally with `sandboxPath: ""` (`assistant-turn.ts:466`); the test cannot inject it. `CliHarnessAdapter.startSession` spawns with `cwd: config.sandboxPath` (`cli-harness-adapter.ts:426`). Empty cwd → the CLI cannot start.
2. **No MCP bridge.** `CLAUDE_CLI_CONFIG` passes `--mcp-config .mcp.json --strict-mcp-config` unconditionally (`adapter-pool.ts:487-489`); `provisionSession` is what writes `.mcp.json` into the sandbox. `runAssistantTurn` writes nothing and passes no `mcpConnectionInfo` (`{{mcpUrl}}` → `""`). The spawned `claude`/`codex`/`opencode` binary crashes "MCP config file not found."
3. **The lane table's model is the wrong shape.** `runAssistantTurn` resolves the model **internally** from the agent row + `credentialResolver` (`:326-373`); it ignores any externally-supplied `resolvedModel`. `SUPPORTED_HARNESS_LANES[*].prepFn` returns a `ProvisionSessionParams.resolvedModel` — a field `runAssistantTurn` never reads. So "reuses `lane.prepFn` for adapter + model" is only half true: the `AdapterPool` is reusable, the **model path is not**.

The builder is therefore cornered on AH3/AK4/AH6: a CLI lane through `runAssistantTurn` crashes (no sandbox/bridge) → red; routing it through `provisionSession` is the option the plan explicitly rejected (fabricates task/bet rows, contradicts the `@lore AH3 §A` task-free design); shipping builtin-only fails the `honest-harness-guard` coverage check the moment the file enters `EXPLICIT_HARNESS_INTEGRATION` (it demands all of `SUPPORTED_HARNESSES`). The plan never resolves this collision.

**Root cause:** the assistant turn is a **genuinely builtin-only production path.** An assistant agent with `harnessType="claude"` would hit the same empty-sandbox/no-bridge bug in production — it is not a real path. Forcing claude/codex/opencode lanes onto it tests a path that does not exist — the exact "phantom gate… gating on a dependency the real path never uses" the track header warns against.

**Fix (pick one, state it explicitly):**
- **(a) — recommended.** Convert AH3/AK4/AH6 to **real builtin only** (the only harness the assistant turn actually uses) and do **not** force them onto the 4-harness matrix. Carry the full `builtin+claude+codex+opencode` matrix on **AD2/R1** (which genuinely go through `provisionSession` and support all four). This requires a sanctioned single-harness path for builtin-only production surfaces — most cleanly, a per-file coverage carve-out in `honest-harness-guard` keyed to an explicit "builtin-only production path" list, justified in the plan. Without that carve-out, adding the file to `EXPLICIT_HARNESS_INTEGRATION` fails coverage and leaving it off means the guard/floor don't see it (the silent-green hole the plan's own Q3 names).
- **(b)** If the assistant turn *should* support CLI harnesses, that is a **production change to `runAssistantTurn`** (provision a sandbox + MCP bridge for CLI adapters) — far larger than the "one production touch" the plan budgets, and out of AR4's stated scope. Name it and rescope, or defer.

Either way the plan as written — "5 `*-real` files, all 4 lanes, atomic full coverage, no coverage-debt entries" — cannot be delivered. Three of those five files cannot run three of the four lanes.

---

## WARNING

### W-1. The builtin assistant-turn lane fails too — `runAssistantTurnThroughHarness` as specified persists a `missing_key` notice, not a real turn.
The plan's signature (Type-signatures §, and Design-it-twice §A) calls `runAssistantTurn({db,eventBus,adapterPool}, …)` with **no `credentialResolver`.** That hits the else-branch at `assistant-turn.ts:352-366`, which requires `process.env.ANTHROPIC_API_KEY` — a key the STRICT harness model says **never exists** — and otherwise persists a `MissingCredentialError` notice and returns. No real model runs. To get a real builtin turn the runner **must** construct a real `CredentialResolver` that yields an OpenRouter-backed model **and** seed the agent row with `modelProvider`/`modelId` so `resolveAgentModel` (`:329`) produces an `openai-compatible` model. None of that is in the lane table or the plan's signature. **Fix:** specify the credential-resolver construction + agent-row model fields as part of `runAssistantTurnThroughHarness`; drop the "reuses lane.prepFn model" claim.

### W-2. AH6 AC3 "broken turn on real output" effectively demotes to a unit — be honest about it.
Verified: AH6 induces brokenness via `mockCallLlmBehavior = "empty-content"` (a scripted empty content array, `:82-83`) and asserts the S1 distinct-reply predicate is false (`:336-339`). A real model essentially never returns an empty content array, so the plan's §B "induce brokenness through a real mechanism the harness genuinely produces" is non-deterministic and not reliably achievable. The plan's own §B fallback lands the broken-leg assertion in a **unit** (verdict function over crafted input) and keeps only the **sanity** (non-empty) leg as real. Net: AC3's *broken* half is proven by a unit, not real harness output. That is defensible, but the plan presents AH6 as a converted real file proving "lane-gate on a broken/real turn" — state plainly that only the valid-lane leg is real and the broken-lane verdict is a unit. (And AH6 is a `runAssistantTurn` file → also blocked by C-1.)

### W-3. Per-agent-seam test-2 ("turn completes / message persisted") loses its only home on full demotion.
The file's test at `:195-272` asserts an assistant message **is persisted** (turn completes, not silently dropped) — a turn-completion smoke, not model routing. A `resolveAgentModel` unit cannot carry it. The plan demotes the whole file and relies on AH3's builtin-real H1 conversion to cover "a real reply is persisted." That cross-file dependency is fine **only if** the AH3 builtin-real conversion actually lands (see C-1/W-1). Call out explicitly that this assertion's coverage migrates to AH3-real, so protectedTests can verify it isn't silently dropped.

### W-4. Risk #3 misdiagnoses the CLI failure mode.
The plan frames the CLI-reply risk as "does the assistant-turn MCP bridge expose `send_message`." But `runAssistantTurn` persists the reply from `drainStreamEvents` → `drainResult.text` (`:512-513`) — the model's stdout text, **not** an MCP `send_message` row. `send_message` is the *provisionSession/task* return channel (AR2 W-2), not the assistant-turn channel. The real CLI blocker is start-time (no sandbox/bridge, C-1), not reply persistence. The risk register points at the wrong wall.

---

## NIT

- **N-1.** The plan says adding `routes/__tests__` to `SCAN_DIRS` is needed for the attestation floor to count AH3/AK4. It is not — the floor (`attestation-floor.ts:78-115`) reads vitest JSON paths and applies `isHarnessIntegrationPath` directly; `SCAN_DIRS` only governs the **guard's** file collection. The `EXPLICIT_HARNESS_INTEGRATION` suffix entry is what makes the floor count them. Minor conflation; clarify so the builder doesn't think `SCAN_DIRS` is load-bearing for attestation.
- **N-2.** Step 3 "`mcpBridgeRegistry`/`mcpBaseUrl` are already on `TaskDispatcherDeps` — confirm" — they are (`:99-103`). Fold the "confirm" into a stated fact; no action item.
- **N-3.** The single-archetype file-split guidance (the "Guard nuance" blockquote) is sound and worth keeping — a file cannot be both full-matrix harness-facing and fake-adapter service-integration. Good catch by the plan.

---

## Dimension scores

| # | Dimension | Score | Note |
|---|---|---|---|
| 1 | Spec fidelity / AC completeness | 6 | Excellent triage + reconciliation; the central assistant-turn matrix-coverage claim contradicts the production code (C-1). |
| 2 | Layer integrity / architectural soundness | 5 | Correctly separates assistant-turn from provisionSession, then misses that the separation makes the CLI matrix impossible (C-1). |
| 3 | Data model / contract changes | 8 | Dispatcher `onBeforeTeardown` additive + minimal; reply-row channel identified. Clean. |
| 4 | Interface / API design | 5 | `runAssistantTurnThroughHarness` signature omits the credential path; "reuses lane model" is wrong (W-1). |
| 5 | Complexity / simplicity | 7 | Avoids bespoke rigs where it can; per-agent full demotion is the right simplification. |
| 6 | Reuse of AR2 pattern | 6 | Verbatim-correct for AD2/R1; over-claimed for the assistant-turn files. |
| 7 | Testability / validation plan | 5 | AD2/R1 solid; AH6 broken-leg is really a unit (W-2); AH3/AK4 CLI lanes unbuildable (C-1). |
| 8 | Security & abuse | 9 | Correctly N/A; reuses AR2 secret/path posture. |
| 9 | Risk honesty / surfaced unknowns | 6 | Unusually thorough Design-it-twice + risks, but the largest risk (CLI lanes can't start in the assistant-turn path) is mis-stated as a send_message question (W-4). |

**Overall: 6/10 — REVISE** (a CRITICAL is present; approval requires ≥7 and zero CRITICAL).

## Required before re-submission
1. **Resolve C-1.** Either (a) make AH3/AK4/AH6 real-**builtin-only** with an explicit, justified `honest-harness-guard` carve-out for builtin-only production paths, and move the 4-harness matrix obligation onto AD2/R1; or (b) rescope to add real production sandbox+bridge support to `runAssistantTurn` (and own that it exceeds the "one production touch" budget). Pick one and write it down.
2. **Fix W-1.** Specify the real `CredentialResolver` + agent-row model fields the builtin assistant-turn lane needs; correct the `runAssistantTurnThroughHarness` signature.
3. **Fix W-2.** State that AH6's broken-lane assertion is a unit and only the valid-lane leg is real.
4. Address W-3/W-4 and N-1 in passing.

**Carry-forward to Phase 4:** verify the chosen C-1 resolution is actually what the builder implemented (no smuggled CLI lane that crashes-then-asserts-weakly; no `state:"in_progress"` seed inside the AD2-real AC2 assertion; the builtin lane uses a real OpenRouter resolver, not `ANTHROPIC_API_KEY`); confirm `onBeforeTeardown` stays additive-optional and teardown still deletes the sandbox; confirm no demoted assertion (per-agent test-2, AH6 verdict, AD2/R1 error paths) is silently lost.

---

## Round 2 — re-critique of the revised plan

**Verdict: APPROVE.** Overall **8/10**. Zero CRITICAL. Every required change from Round 1 landed and is mechanically correct against the code, not cosmetic. Approval bar (≥7, no CRITICAL) met.

### C-1 — RESOLVED (verified mechanically, not cosmetically)

The fix is the recommended (a): AH3/AK4/AH6 convert to **real builtin only** via a first-class `BUILTIN_ONLY_INTEGRATION` carve-out; the 4-harness matrix moves entirely to AD2/R1. Verified against code:

- **The carve-out is honest, not an allowlist hack.** The plan slots a `BUILTIN_ONLY_INTEGRATION` check into `ruleFor` *before* the coverage rule (`honest-harness-guard.ts:359` `missingHarnesses`): if the file is listed, skip the 4-harness coverage check but still enforce (a) zero-stub (`:340-348`, unchanged), (b) no-skipIf (`:323-336`, unchanged), and (c) a positive `declared.has("builtin")` check. The discipline is preserved; only the 3 CLI lanes the path *cannot* run are exempted. This is mechanically sound — `ruleFor` already has the exact insertion point, and `declaredHarnesses` (`:212`) gives the builtin-declared check for free.
- **Builtin-only is genuinely correct here vs coverage-debt.** Confirmed against `assistant-turn.ts`: `runAssistantTurn` builds `SessionConfig` with `sandboxPath:""` (no cwd for a CLI), writes no `.mcp.json`, passes no `mcpConnectionInfo`, and resolves the model internally (ignores external `resolvedModel`). A CLI harness genuinely cannot run this path in production — it is builtin-only by construction, not "temporarily <4." Coverage-debt would lie ("debt to be paid") and trip the debt-paid branch (`:371-375`) forever. The carve-out states the truth. **Right distinction.**
- **The floor still holds — verified.** `assertPerHarnessFloor` (`attestation-floor.ts:127-143`) fails only if a *supported* harness has zero executed agentic assertions **across the whole selected set**, bucketed by the `[harness:X]` describe tag in `ancestorTitles` (`:98-99`). AD2-real + R1-real each loop all four `SUPPORTED_HARNESS_LANES` → builtin/claude/codex/opencode each >0. The three builtin-only files add builtin executions. So claude/codex/opencode floors are satisfied by AD2/R1; builtin by all five. The carve-out lives in the **guard's** coverage rule, which is independent of the **floor** (floor reads vitest JSON tags, not guard coverage). **No floor change needed — and the plan correctly claims none.** This is the key non-cosmetic point: the carve-out cannot silently drop a harness from the floor, because the floor never consulted the guard's coverage rule.
- **AD2/R1 genuinely flow through `provisionSession` and run all four.** Confirmed: `drainQueue` (`task-dispatcher.ts:247`) → `resolveProvisionSession()` → `provisionSession(...)` (`:366`) with `mcpBridgeRegistry`/`mcpBaseUrl` already threaded (`:372-373`); R1 POST → `provisionSession` is the same path. `SUPPORTED_HARNESS_LANES` (`provision-real-session.ts:395`) carries all four with per-harness `prepFn` (claude `.mcp.json`, codex git, opencode XDG). The matrix obligation lands where the path can actually bear it.

### W-1 — RESOLVED (verified)

The revised `runAssistantTurnThroughHarness` constructs a real OpenRouter `CredentialResolver` + seeds agent-row `modelProvider:"openrouter"`/`modelId`. Verified this takes the `:326` branch in `assistant-turn.ts` (`deps.credentialResolver` truthy → `resolveAgentModel`), avoiding the `:352-366` else-branch entirely (no `ANTHROPIC_API_KEY`, no `missing_key` notice). Confirmed `resolveAgentModel` with `openrouter` → `credentialResolver.resolve("openrouter_api_key")` → runnable `{provider:"openrouter", baseUrl:"https://openrouter.ai/api"}` model (`model-gateway.ts:98-114`) the builtin adapter calls. The "reuses lane.prepFn model" claim is explicitly dropped (Q2b, §A). The builtin lane yields a **real** turn, not a notice row. **Correct.**

### W-2 — RESOLVED honestly (verified)

AH6 broken-leg demoted to `AH6-lane-gate-verdict.test.ts` unit; only the valid-lane (Sanity) leg is real. Verified the current broken-leg uses `mockCallLlmBehavior="empty-content"` (a scripted empty content array, `:82-83`) — a real model essentially never emits this, so it genuinely cannot be forced on real output. The plan moves the S1 verdict-over-crafted-empty-transcript (the predicate is a pure fn, `:49`) to a unit and keeps the valid-lane S1-over-real-output as the real leg. This is **not hiding a skip** — it is an honest decomposition by what each leg can actually prove, stated plainly in DoD (AC3 row), §B, and protectedTests (the verdict unit is named the inheritor of Term-2b). No `skipIf`, no vacuous green.

### W-3 / W-4 — addressed

- **W-3:** per-agent-seam test-2 ("a real assistant message is persisted") now has a named home — AH3-real H1 is listed in protectedTests (line 144, 344) as the explicit inheritor, with the dependency stated ("if AH3-real builtin conversion does not land, this coverage is lost"). The cross-file migration is no longer implicit.
- **W-4:** risk #3 corrected — now states the assistant reply channel is `drainResult.text` (`assistant-turn.ts:512-513`), not an MCP `send_message` row, and reframes the real risk as the W-1 credential path. The risk register points at the right wall.
- **N-1:** `SCAN_DIRS` vs `EXPLICIT_HARNESS_INTEGRATION` conflation corrected — the plan now states plainly that the floor selects via `isHarnessIntegrationPath` on vitest JSON (independent of `SCAN_DIRS`) and `SCAN_DIRS` is guard-lint-only. Matches the code (`attestation-floor.ts:88` applies the predicate to JSON paths).

### Residual notes (not blocking)

- **The carve-out is a new shared mechanism.** `BUILTIN_ONLY_INTEGRATION` is introduced by AR4 and lands in `honest-harness-predicate.ts` + `ruleFor`. sharedFiles flags the conflict risk with AR3/AR5/AR6 honestly. Phase-4: confirm the `ruleFor` insertion is an early-skip of *only* the coverage rule and does not short-circuit the stub/skipIf rules (the plan says "consults it before the coverage rule" — the builder must place it after `:348` stub-check, after `:336` skipIf-check, before `:359` coverage-check, and still emit the builtin-declared violation).
- **One production touch** (`onBeforeTeardown` on `TaskDispatcherDeps`) is additive-optional and confirmed-minimal (Round-1 verified). Phase-4: confirm teardown still deletes the sandbox (observe-not-disable).

### Dimension scores (round 2)

| # | Dimension | R1 | R2 | Note |
|---|---|---|---|---|
| 1 | Spec fidelity / AC completeness | 6 | 8 | Triage intact; the matrix-coverage contradiction is resolved by moving the obligation to AD2/R1 and carving out the builtin-only path honestly. |
| 2 | Layer integrity / soundness | 5 | 8 | The assistant-turn/provisionSession separation is now consistent — builtin-only is owned as the real production shape, not papered over. |
| 3 | Data model / contract | 8 | 8 | Unchanged — dispatcher `onBeforeTeardown` additive; reply-row channel correct. |
| 4 | Interface / API design | 5 | 8 | `runAssistantTurnThroughHarness` now specifies the credential resolver + agent-row model fields; no `lane` param; "reuses lane model" dropped. |
| 5 | Complexity / simplicity | 7 | 8 | The carve-out is the minimal honest mechanism; per-agent full demotion retained. |
| 6 | Reuse of AR2 pattern | 6 | 8 | Verbatim for AD2/R1; the builtin runner is correctly a *second* thin runner, not a forced lane-table reuse. |
| 7 | Testability / validation plan | 5 | 8 | AD2/R1 full-matrix; builtin-only files honest; AH6 broken-leg correctly a unit; floor math verified. |
| 8 | Security & abuse | 9 | 9 | Unchanged — correctly N/A; AR2 secret/path posture reused. |
| 9 | Risk honesty | 6 | 8 | Risk #3 corrected; the builtin-only constraint and the one production touch are surfaced with fallbacks. |

**Overall: 8/10 — APPROVE.** Zero CRITICAL. Proceed to build.

### Carry-forward to Phase 4 (additive to Round 1's list)
- Confirm `ruleFor`'s `BUILTIN_ONLY_INTEGRATION` branch skips **only** the coverage rule (stub + skipIf rules still fire) and still emits a violation if a listed file fails to declare `requireHarness("builtin")`.
- Confirm attestation `byHarness` shows claude/codex/opencode satisfied by AD2-real+R1-real and builtin by all five — and that adding the carve-out did not zero any harness in the floor.
- Confirm the builtin assistant lane actually resolves an OpenRouter model at runtime (a real turn, non-empty `ast-*` reply) — not a `missing_key` notice row masquerading as green.
- Confirm AH6-real carries the valid-lane leg only and `AH6-lane-gate-verdict.test.ts` carries the broken-lane verdict — no smuggled `empty-content` scripted mock left in the `*-real` file.
