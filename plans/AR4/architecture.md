# AR4 — Assistant turn, agent execution, and dispatcher: real harness integration

**Type.** backend + test-infra (test-fidelity conversion). **No new primitive, no UI.** Reuses AR1/AR2 mechanisms.

**One-line.** Convert the six harness-facing tests off stubbed adapters (`vi.mock("../harness/llm-client")`, `EchoHarnessAdapter`/`CapturingHarnessAdapter`/`ScriptedHarnessAdapter`, directly-seeded `in_progress`) to **real-harness integration**. The **full `SUPPORTED_HARNESSES` (4-harness) matrix rides AD2 + R1** — the only two of the six that genuinely flow through `provisionSession` and therefore support claude/codex/opencode. The **assistant-turn files (AH3/AK4/AH6) convert to real-`builtin`-only** because `runAssistantTurn` is builtin-only *by construction* (no sandbox, no MCP bridge — see C-1 resolution below); they get an explicit, justified **builtin-only guard carve-out**, not a phantom 4-lane matrix. Reuses AR2's `SUPPORTED_HARNESS_LANES` + `runThroughHarness` + `createSandboxCapture`. No bespoke rigs.

> **Matrix assignment (resolves critique C-1):** `AD2-real` + `R1-real` = **builtin+claude+codex+opencode** (real `provisionSession`, all four runnable). `AH3-real` + `AK4-real` + `AH6-real` = **builtin only** (the only harness `runAssistantTurn` actually uses), each declared in a `BUILTIN_ONLY_INTEGRATION` carve-out. `per-agent-seam` = full demotion to units (no harness).

---

## Required reading (builder, before writing tests)

- `.pipeline/work-packages/TRACK-AR.md` §AR4 (lines 158-198) + track header (1-19).
- `packages/server/src/harness/__tests__/provision-real-session.ts` — `SUPPORTED_HARNESS_LANES`, `runThroughHarness`, `createSandboxCapture`, `startMcpBridgeServer`, per-harness prep helpers. **The only sanctioned rig.**
- `packages/server/src/harness/__tests__/require-harness.ts` — `requireHarness(<name>)`, `HarnessName`.
- `packages/server/src/harness/__tests__/AR2-provision-real-session.integration.test.ts` — the reference: lane-table loop, seedDomain, 240s timeouts, honest floors, ID-override-via-prepFn-wrapper pattern.
- `.claude/rules/testing.md` §Integration tests: two archetypes (the equal-coverage rule + the path-only predicate note).
- `docs/agent-layer/harness-coverage-enforcement.md`.
- `scripts/lib/honest-harness-predicate.ts` — `isHarnessIntegrationPath` (path-only), `SUPPORTED_HARNESSES`, `EXPLICIT_HARNESS_INTEGRATION`.
- `scripts/honest-harness-guard.ts` — `ruleFor` (stub/coverage/skipIf rules), `SCAN_DIRS`.
- `scripts/lib/attestation-floor.ts` — `HARNESS_TAG` regex (`[harness:X]` in a describe ancestor), `assertPerHarnessFloor`.
- `packages/server/src/services/assistant-turn.ts` — `runAssistantTurn` (adapter-pool path, **NOT** `provisionSession`).
- `packages/fabric/src/services/task-dispatcher.ts` — `registerTaskDispatcher` → `drainQueue` → `provisionSession`; `provision-registry.ts` (`setProvisionSessionFn`).

---

## Phase 0 — Interrogation (resolved against code)

**Q1. Is `AH3-assistant-turn-unit.test.ts` in scope?** No. `packages/server/src/__tests__/AH3-assistant-turn-unit.test.ts` (39 lines) only asserts `ASSISTANT_TURN_TIMEOUT_MS` and `ProviderTimeoutError` exist — pure unit, no harness, no `vi.mock`. Same for `tools/__tests__/AK4-assistant-draft-registry.test.ts` (already a `.test.ts` unit). Leave both untouched. The six in-scope files are the four `vi.mock`/seamed `.integration.test.ts` plus the two `provisionSession` files (R1, AD2).

**Q2 — load-bearing. Does the assistant-turn path go through `provisionSession`? And which harnesses can it actually run?** **No to provisionSession — and the assistant turn is `builtin`-only by construction.** `runAssistantTurn` (`assistant-turn.ts:376`) calls `adapterPool.select(...)` then drives the adapter's `startSession`/`streamEvents` directly. It is **task-free by deliberate design** (`@lore AH3 §A`: "Using provisionSession would pollute tasks/bets with fake rows"). Verified against code, `runAssistantTurn` **cannot run a CLI harness**:
- **No sandbox.** It builds `SessionConfig` internally with `sandboxPath: ""` (`assistant-turn.ts:466`, hardcoded — the test cannot inject it). `CliHarnessAdapter.startSession` spawns with `cwd: config.sandboxPath` (`cli-harness-adapter.ts:426`) → empty cwd → CLI cannot start.
- **No MCP bridge.** `CLAUDE_CLI_CONFIG` passes `--mcp-config .mcp.json --strict-mcp-config` unconditionally (`adapter-pool.ts:487-489`); `provisionSession` is what writes `.mcp.json`. `runAssistantTurn` writes none and passes no `mcpConnectionInfo` → `claude`/`codex`/`opencode` crash "MCP config not found."
- **Model resolved internally.** `runAssistantTurn` resolves the model from the agent row + `credentialResolver` (`:326-373`); it **ignores** any externally-supplied `resolvedModel`. The lane table's `prepFn.resolvedModel` is a field this path never reads. So lane reuse is **adapter-pool-only**, not model.

This is not a test gap — it is the **real shape of the production path.** An assistant agent with `harnessType="claude"` would hit the same empty-sandbox/no-bridge bug in production. Forcing claude/codex/opencode onto `runAssistantTurn` would test a path that does not exist — the exact "phantom gate" the track header warns against. Therefore:
- **AH3 / AK4 / AH6** convert to **real `builtin` only** (the only harness the assistant turn uses), via a thin lane runner `runAssistantTurnThroughHarness` that builds a **real builtin adapter pool + a real OpenRouter `credentialResolver` + real agent-row `modelProvider`/`modelId`** (see Q2b for why the resolver is mandatory) and calls `runAssistantTurn`. Each converted file declares only `requireHarness("builtin")` and is added to a new **`BUILTIN_ONLY_INTEGRATION`** carve-out list so the guard skips the 4-harness coverage rule for it (still enforcing zero-stub + no-skipIf + builtin-declared).
- **per-agent-seam** demotes entirely to units (model-routing logic, no harness).
- **AD2 (dispatcher) + R1 (route)** go through `provisionSession` (AD2 via `drainQueue`, R1 via the POST handler) — these **genuinely run all four harnesses** and reuse `runThroughHarness`/the lane table verbatim. **The full 4-harness matrix obligation lives here.**

This split is the spine of the plan. AR2's `runThroughHarness` is reusable verbatim for AD2/R1; for the builtin assistant-turn files the builder adds a **thin builtin lane runner** (`runAssistantTurnThroughHarness`, in `provision-real-session.ts`) — reusing the builtin adapter construction, NOT rebuilding it. (Design-it-twice §A.)

**Q2b — load-bearing (resolves W-1). Why the builtin assistant lane needs a real credential resolver.** If `runAssistantTurnThroughHarness` calls `runAssistantTurn({db,eventBus,adapterPool})` with **no `credentialResolver`** (as a naive port would), it hits the else-branch at `assistant-turn.ts:352-366`, which requires `process.env.ANTHROPIC_API_KEY`. Per the strict harness-key model **no Anthropic key ever exists** → it persists a `MissingCredentialError("missing_key")` notice and returns — **no real model runs, the test is vacuously green-ish against a notice row.** To get a *real* builtin turn the runner MUST:
1. construct a real `CredentialResolver` that yields the **OpenRouter** key from `.env` (`OPENROUTER_API_KEY`, the builtin harness's only key per harness-key-model), and
2. seed the agent row with `modelProvider: "openrouter"` + a real `modelId`, so `resolveAgentModel` (`:329`) produces an `openai-compatible` resolved model that the builtin adapter actually calls.

Neither is in the lane table. Both are explicit responsibilities of `runAssistantTurnThroughHarness` (signatures §). The "reuses lane.prepFn model" claim is **dropped** — only the builtin adapter is reused; the credential + model path is built fresh and correctly.

**Q3 — load-bearing. Does the honest-harness-guard currently flag any of the six files?** **No — and this is the central mechanical task.** `isHarnessIntegrationPath` (`honest-harness-predicate.ts:55-62`) is **path-only**: it matches `…/harness/__tests__/*.integration.test.ts` OR a member of `EXPLICIT_HARNESS_INTEGRATION` (today only `session-provisioning.integration.test.ts`). The six files live in `packages/server/src/__tests__/` (AH6, seam, R1, AD2) or `packages/server/src/routes/__tests__/` (AH3, AK4) — **none match.** Two consequences:
  1. `routes/__tests__/` is not in `SCAN_DIRS` (`honest-harness-guard.ts:389-392`) → the **guard's CLI file-collection** can never see AH3/AK4. (NOT a floor concern — see below.)
  2. Until a converted file's path-suffix is added to `EXPLICIT_HARNESS_INTEGRATION`, neither the guard nor the attestation floor select it — so a half-converted file mints green silently.

**Two distinct wirings, do not conflate (corrects N-1):**
- **`EXPLICIT_HARNESS_INTEGRATION`** (`honest-harness-predicate.ts`) is what `isHarnessIntegrationPath` matches. This is the **single load-bearing switch** that makes BOTH the guard AND the attestation floor (`attestation-floor.ts:88` applies `isHarnessIntegrationPath` directly to vitest JSON paths) select a file. Every converted file's path-suffix goes here.
- **`SCAN_DIRS`** (`honest-harness-guard.ts`) only governs which directories the **guard's standalone CLI** walks when collecting files to check. It is **irrelevant to the attestation floor** (the floor reads vitest's emitted JSON, not the filesystem). We add `packages/server/src/routes/__tests__` to `SCAN_DIRS` solely so the guard *lints* the AH3/AK4 real files — not for attestation counting.
- **`BUILTIN_ONLY_INTEGRATION`** (NEW list, `honest-harness-predicate.ts` + consumed in `ruleFor`) — the carve-out that exempts a selected file from the 4-harness *coverage* rule while keeping every other rule (zero-stub, no-skipIf, must-declare-`builtin`). Only the three assistant-turn real files go here. See "guard carve-out" §.

**Q4. What is the smallest still-useful version?** Convert the genuinely agent-driven assertions to the real matrix; **demote** the route-contract / error-path / pure-mapping assertions to honest `*.test.ts` units (they were never harness integration). Do not force a real LLM through an error-path test whose subject is HTTP status mapping or queue arithmetic.

**Q5. Failure mode if the dispatch→provision real flow (AC2) is wrong?** The founder's core loop (task → agent → result) stays unproven exactly where it matters. Mitigation: AC2 is its own dedicated test that drives `registerTaskDispatcher` + `transitionTask(...,"accepted")` and asserts on **real session outcome + capture-seam file** — never on a seeded `in_progress` row.

**Q6. Product bug honest tests may surface?** Track header warns of cost over-counting (AR3's `recordCostAndCheck` — **out of scope here**, flag if hit) and sandbox-deleted-before-observable (AR2's capture seam already solves this — reuse it). New AR4-specific risk: the assistant-turn path persists a **reply message** (DB row), so its real-output channel is the `messages` row, not the sandbox — a different observation channel than AR2's file capture. See Risks.

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "no `vi.mock` of harness/LLM client … remains" | `AK4`, `AH6`, `per-agent-seam` `vi.mock("../harness/llm-client.js")`; `AH3`/`AD2`/`R1` use stub **adapters** not `vi.mock` | Remove `vi.mock`; convert agent-driven assertions to real adapters; demote pure-logic to units. |
| "EchoHarnessAdapter remains" | No `EchoHarnessAdapter` in these files; the stubs are `ScriptedHarnessAdapter` (R1), `CapturingHarnessAdapter` (AD2), scripted `streamEvents` (AH3 H1). | Treat spec's "echo adapter" as the class of in-file fake adapters; convert/demote per triage. |
| dispatch tests "seed `in_progress`" | AD2 seeds `state:"proposed"` then `transitionTask(...,"accepted")` to **trigger** dispatch (correct); several **downstream** assertions seed `state:"in_progress"` directly (the seam-bypass the spec names). | AC2 test drives the real trigger→`drainQueue`→`provisionSession`→real harness; keep the queue-arithmetic assertions as honest service-integration (they test the dispatcher state machine, not the harness). |
| guard already enforces these files | Path-only predicate excludes all six (Q3). | Add each converted file to `EXPLICIT_HARNESS_INTEGRATION`; add `packages/server/src/routes/__tests__` to `SCAN_DIRS`. |
| `runAssistantTurn` goes through `provisionSession` | It does **not** (Q2); it is also **builtin-only by construction** (no sandbox/bridge, Q2). | Assistant-turn lane runner calls `runAssistantTurn` with a real **builtin** adapter pool + real OpenRouter resolver (Q2b); only AD2/R1 use `runThroughHarness`. |
| assistant-turn files prove the full 4-harness matrix | `runAssistantTurn` can only run builtin (Q2). | Matrix obligation moves to AD2/R1; AH3/AK4/AH6 are builtin-only + `BUILTIN_ONLY_INTEGRATION` carve-out. |
| `provisionSession` signature for dispatch | `drainQueue` calls `provisionSession({db,eventBus,adapterPool,workspace,mcpBridgeRegistry,mcpBaseUrl},{taskId,agentId,productId:teamId,sandboxBasePath,resolvedModel,sessionWorkflow?})` (`task-dispatcher.ts:366`) | Lane table already produces compatible params; thread `mcpBridgeRegistry`/`mcpBaseUrl` into `TaskDispatcherDeps` for CLI lanes. |

No `/concept` gap. No doc contradiction.

---

## Per-file triage

Legend: **Convert (matrix)** = real-harness, full `SUPPORTED_HARNESSES` (4) via lane table — AD2/R1 only. **Convert (builtin)** = real `builtin` turn via `runAssistantTurnThroughHarness` + `BUILTIN_ONLY_INTEGRATION` carve-out — AH3/AK4/AH6 (Q2: the assistant turn can run no other harness). **Demote** = move the assertion to a `*.test.ts` unit (or keep as honest service-integration `{db,app,eventBus}` with no harness) — it was never harness integration. **Keep** = already honest, leave.

### 1. `AH3-assistant-turn.integration.test.ts` (1171 lines, `routes/__tests__/`)
Production under test: `runAssistantTurn` (adapter-pool path — Q2).

| Block (line) | Subject | Decision | Harnesses |
|---|---|---|---|
| AC1 trigger path (119) | POST message → reply persisted; trigger fires | **Convert (builtin)** the "reply persisted" leg to a real turn; the "POST→trigger fires" wiring is a route contract → keep as service-integration with `runTurn` injected (no harness; trigger is the subject). | builtin |
| AC2 error surface / notice classes (215) | `mapErrorToNotice` → notice kind, no secret leak | **Demote** to `*.test.ts` unit — pure error→notice mapping, no harness. | — |
| AC2 hung provider timeout (347) | `runAssistantTurn` resolves within `ASSISTANT_TURN_TIMEOUT_MS` | **Demote** to unit via injected adapter that never emits + `turnTimeoutMs` override — timeout logic is deterministic, not harness behavior. | — |
| AC3 PATCH 403 (432) | Agents API rejects ast-* systemPrompt edit | **Demote**/keep as service-integration (`{db,app}`) — pure route authz, no harness. | — |
| AC5 defaults at registration (488) | lazy-create assistant defaults | **Demote**/keep service-integration — DB shape, no harness. | — |
| H1 happy-path (569) | scripted adapter completion → reply persisted | **Convert (builtin)** — this IS the "real reply" proof (AC1). Real builtin turn, assert persisted `messages` row is the model's reply (non-empty, sender `ast-*`). **Inherits per-agent-seam test-2 coverage** (W-3): this is the surviving home for "a real assistant message is persisted, not silently dropped." | builtin |
| H1 no-resolvedModel throws (648) | startSession validates resolvedModel | **Demote** to unit — validation logic. | — |
| H2 notice round-trip (679) | GET returns persisted notice | **Demote**/keep service-integration. | — |
| H3 user message reaches model (937) | `SessionConfig.messages` carries transcript | **Convert (builtin)** — the canonical CC-004 "user message never reached model" proof. Real builtin turn; assert the reply is responsive to the user message (proves transcript reached model). | builtin |
| M3 null-resolve → missing_key (727) | missing credential → notice | **Demote** to unit. | — |
| loop-guard ast-* no re-trigger (792) | sender-based re-trigger guard | **Demote**/keep service-integration. | — |

**Net:** one converted `*.integration.test.ts` (H1 + H3 + AC1-reply leg as the three real-turn assertions, **real builtin only**); the rest split into `AH3-assistant-turn.test.ts` units + retained service-integration in `routes/__tests__`. The converted file is added to `EXPLICIT_HARNESS_INTEGRATION` **and** `BUILTIN_ONLY_INTEGRATION` (carve-out from the 4-harness coverage rule).

### 2. `AK4-assistant-draft.integration.test.ts` (659 lines, `routes/__tests__/`)
Production under test: `runAssistantTurn` + assistant-draft tool registry. Currently `vi.mock("../../harness/llm-client.js")` to script `callLlm` tool_use sequences.

| Block | Subject | Decision | Harnesses |
|---|---|---|---|
| AC1 text-only reply (146) | text end_turn → plain reply persisted | **Convert (builtin)** — real builtin turn, assert non-empty `ast-*` reply. | builtin |
| AC2 create_bet tool_use → draft bet (228) | tool_use → `bets` row status=draft + `payload.toolCalls.betId` | **Split.** The **tool-handler logic** (create_bet handler writes a draft `bets` row given a tool call) → **demote** to a `*.test.ts` unit testing the registry handler directly (the AK4 registry unit already exists — extend it). The **"a real agent actually calls create_bet"** claim → **Convert (builtin)** one real-builtin assertion that the agent, told to draft a bet, produces a draft `bets` row. ⚠ tool-call nondeterminism: phrase the task explicitly; honest floor = "a draft bet row appeared OR a non-empty reply". | builtin |
| AC3a bet stays draft (382) | no autonomous commit after turn | **Demote** to unit — post-turn invariant over a given tool result. | — |
| AC4 edit_bet same betId (460) | second turn mutates same bet, count stays 1 | **Demote** to unit — registry handler idempotency over a supplied tool call. | — |
| AC4-loop-bound MAX_TOOL_ITERATIONS=3 (587) | loop cap + never-silent | **Demote** to unit — deterministic loop bound, scripted `callLlm` is the *correct* tool here (it tests the loop, not the harness). | — |

**Net:** one converted `*.integration.test.ts` (AC1 reply + AC2 "real agent drafts a bet", **real builtin only**); the deterministic tool-handler/loop assertions fold into `tools/__tests__/AK4-assistant-draft-registry.test.ts` (already a unit). Converted file → `EXPLICIT_HARNESS_INTEGRATION` + `BUILTIN_ONLY_INTEGRATION`.

### 3. `AH6-lane-gates-broken-turn.integration.test.ts` (476 lines, `__tests__/`)
Production under test: `runAssistantTurn` lane-gate behavior on broken turns. Currently `vi.mock("../harness/llm-client.js")` with a closure-controlled `callLlm` (CassetteMiss / empty-content).

| Block | Subject | Decision | Harnesses |
|---|---|---|---|
| Term 1: no `assistantTurnDeps` → no reply (203) | trigger wiring is load-bearing (negative) | **Demote**/keep service-integration — proves the POST handler doesn't fire `runAssistantTurn` without deps; no harness. | — |
| Term 2a: CassetteMiss → provider_error notice (263) | cassette miss → mapped notice | **Demote** to unit — error→notice mapping (overlaps AH3 AC2 mapping unit; consolidate). | — |
| Term 2b: empty-content → degenerate reply, S1 false (339) | degenerate-completion predicate | **Demote to unit (be honest — W-2).** A real model essentially never returns an empty content array, so the broken-lane leg **cannot** be forced on real output reliably. The deterministic part — the lane-gate **verdict function** (S1 distinct-reply predicate) over a **crafted** empty/degenerate transcript — moves to a `*.test.ts` unit (`AH6-lane-gate-verdict.test.ts`). This is the verdict-function-over-supplied-input leg, not a harness test. | — |
| Sanity: normal run → S1 true (418) | distinct non-empty reply predicate | **Convert (builtin)** — the **only real** leg of AC3: run a real builtin turn, capture real output, assert the S1 verdict over that real output = valid (non-empty, distinct). This proves "the lane gate runs on real harness output." | builtin |

**Net (W-2 honest):** one converted `*.integration.test.ts` carrying **only the Sanity (valid-lane) leg as a real builtin turn** — the gate verdict asserted over **real** output. The **broken-lane** assertion is **not** real harness output; it demotes to a deterministic verdict-function unit (`AH6-lane-gate-verdict.test.ts`) over a crafted empty transcript. The mapping/trigger assertions demote to units / service-integration. Converted file → `EXPLICIT_HARNESS_INTEGRATION` + `BUILTIN_ONLY_INTEGRATION`. **State plainly in DoD:** AC3's *valid-lane* leg is real; AC3's *broken-lane* verdict is a unit (no real model emits empty on demand).

### 4. `assistant-turn-per-agent-seam.integration.test.ts` (471 lines, `__tests__/`)
Production under test: `runAssistantTurn` routes through `resolveAgentModel` (per-agent branch) vs `resolveModelTier`. Currently `vi.mock` `callLlm` to **capture `options.model.model`**.

The subject is **which model id reaches the adapter** — that is a model-resolution-routing assertion, not harness behavior. The `callLlm`-capture is a model-routing probe, not a harness stub.

| Block | Subject | Decision | Harnesses |
|---|---|---|---|
| per-agent openrouter model reaches callLlm (110) | `resolveAgentModel` branch selected | **Demote** to unit — test `resolveAgentModel`/model-gateway selection directly: given an agent row with `modelProvider:openrouter`+`modelId`, assert the resolved model id. No harness needed (the model never has to *run*). | — |
| per-agent anthropic model (275) | same, anthropic provider | **Demote** to unit. | — |
| missing model → notice, never throws (~420) | resolution failure → notice | **Demote** to unit (overlaps AH3 M3). | — |
| (optional) real per-agent run | a real agent with a per-agent model actually completes | **Convert (1 leg, optional)** — if the reviewer wants a live proof that the per-agent-selected model truly runs, one real builtin lane suffices; the four-harness matrix is overkill for a routing assertion. **Recommendation: full demotion**, no converted file. The model-routing decision is pure logic; forcing four real LLMs to prove "model id X was selected" is the exact over-engineering the demotion path exists to avoid. |

**Net:** **demote entirely** to `assistant-turn-per-agent-seam.test.ts` unit(s). The `.integration.test.ts` label is removed; not added to `EXPLICIT_HARNESS_INTEGRATION`. (This is the honest answer per the spec's "pure-logic remnants demoted to units.")

> **W-3 — test-2 ("message persisted") has no home as a `resolveAgentModel` unit.** The file's `:195-272` test asserts an assistant message **is persisted** (turn completes, not silently dropped) — a turn-completion smoke, *not* model routing. A `resolveAgentModel` unit cannot carry it. Its coverage **migrates to `AH3-real` H1** (the real builtin turn that asserts a persisted `ast-*` reply). To prevent silent loss, **`AH3-real` H1 is listed in protectedTests** as the explicit inheritor of "a real assistant message is persisted." If the AH3-real builtin conversion does not land, this coverage is lost — so the dependency is named, not implicit.

### 5. `R1-wire-agent-execution.integration.test.ts` (560 lines, `__tests__/`)
Production under test: `POST /api/sessions` → `provisionSession`. Currently in-file `ScriptedHarnessAdapter` registered into `makePool`.

| Block | Subject | Decision | Harnesses |
|---|---|---|---|
| AC2/AC3/AC4 POST admits + completes async (225) | route admits 202 active, session reaches done via real provision | **Convert** — route POST → real `provisionSession` → real harness → session `done`/`completed`. Reuse the lane table for adapter+model; the POST is the entry, `provisionSession` runs underneath. | builtin+claude+codex+opencode |
| AC6/AC7 missing credential → 500 MISSING_CREDENTIAL, no row (312) | pre-flight credential rejection | **Demote**/keep service-integration with honest `NullCredentialResolver` — pre-flight fires **before** any adapter; no harness is started (`harness.startedConfigs.length===0` asserts exactly that). | — |
| AC4 crashed harness → crashed session (359) | crash path | **Convert (1 leg) or Demote.** Forcing a real binary to crash is hard. **Recommend demote** to a service-integration test that injects an adapter whose `streamEvents` throws — the subject is `provisionSession`'s crash→`crashed`-outcome state mapping, not harness behavior. Honest: stub belongs in the unit lane testing the orchestrator's crash branch. | — |
| Backward-compat: no adapters → bare insert (415) | route fallback when no pool | **Keep** service-integration — explicitly the no-harness path. | — |
| CostCapExceededError → 422 (482) | error→status mapping | **Demote**/keep service-integration. | — |
| ConcurrencyLimitError → 429 (522) | error→status mapping | **Demote**/keep service-integration. | — |

**Net:** one converted `*.integration.test.ts` (AC2/AC3/AC4 happy-path over four lanes); error-path/back-compat assertions stay as honest `{db,app,eventBus}` service-integration (real DB+app, no harness) in the same or a sibling file. Converted file → `EXPLICIT_HARNESS_INTEGRATION`.

### 6. `AD2-task-dispatcher.integration.test.ts` (1351 lines, `__tests__/`) — **carries AC2**
Production under test: `registerTaskDispatcher` → `drainQueue` → `provisionSession`. Currently in-file `CapturingHarnessAdapter` via `makeBuiltinPool`; many assertions seed `state:"in_progress"` directly.

| Block | Subject | Decision | Harnesses |
|---|---|---|---|
| AC1 auto-provision on accepted (234) | `transitionTask(...,"accepted")` → session row created | **Convert (this is AR4 AC2)** — the dispatch→provision→**real agent** seam. Drive `registerTaskDispatcher` + real trigger; assert real session `outcome` + **capture-seam file** (not a seeded row). | builtin+claude+codex+opencode |
| AC1 no ownerAgentId → no session (282) | negative: null owner doesn't dispatch | **Keep** service-integration — proves the dispatcher *doesn't* enqueue; no harness runs by design. | — |
| AC2 handoff re-dispatch (363) | `session_ended` + ownerAgentId change → new session for agentB | **Convert (1 real leg) + Demote rest.** The *re-dispatch trigger* (session_ended → drainQueue fires for new owner) is dispatcher state-machine logic → keep service-integration. **One** real leg proves the re-dispatched session actually runs a real agent. ⚠ this block seeds `in_progress`/`sessionA` directly to simulate the ended session — that scaffolding is legitimate for the *trigger* test; only the "new session ran for real" claim needs a real harness. | builtin (1 leg) |
| AC3 cost cap → queue, no session (516) | CostCapExceeded → task stays accepted | **Demote**/keep service-integration — queue arithmetic + cost-cap gate, no harness. | — |
| AC4 concurrency limit → queue + drain on free (578) | ConcurrencyLimit queuing | **Demote**/keep service-integration — queue state machine. The `in_progress` seeds here simulate a busy agent; legitimate for testing the limiter. | — |
| AC5 non-coding task → builtin, no git (729) | harness selection by task kind | **Convert (selection assertion)** — that a non-coding task actually dispatches to a runnable harness is provable real; but the *selection logic* (builtin vs claude-code by task kind) is deterministic → **demote** the selection to a unit, **convert** one "it actually ran" leg. | builtin |
| AC6 GET /api/dispatch-queue (866) | queue snapshot endpoint | **Keep**/Demote service-integration — `getDispatchQueueSnapshot` shape, no harness. `in_progress` seeds are queue fixtures. | — |
| AC-idempotency restart no dup (984) | startupSweep idempotency | **Keep** service-integration — sweep logic; no harness behavior. | — |
| AC-sweep-race (1098) | stale sweep doesn't pollute queue | **Keep** service-integration — generation-guard logic. | — |

**Net:** AC1 becomes the **AC2 keystone** real-flow test (four lanes through the dispatcher); the queue/cost/concurrency/sweep state-machine assertions stay honest service-integration with the in-file fake adapter retained **only where the harness is explicitly not the subject** (a queue-arithmetic test legitimately uses a fast fake). Converted-leg file (the AC1 real-flow lanes) → `EXPLICIT_HARNESS_INTEGRATION`.

> **Guard nuance.** A single physical file cannot be both "harness-facing integration (full matrix)" and "service-integration with a fake adapter" — `isHarnessIntegrationPath` + the coverage check would fail the file for the fake-adapter blocks. **Split AD2 (and R1, AH3) into two files:** `AD2-task-dispatcher-real.integration.test.ts` (the converted real-flow lanes, added to `EXPLICIT_HARNESS_INTEGRATION`) and `AD2-task-dispatcher.integration.test.ts` (the queue/cost/sweep service-integration that keeps a fast fake adapter — and is **left OUT** of `EXPLICIT_HARNESS_INTEGRATION`, so the guard never selects it). Same split for R1 (`R1-...-real` vs the error-path service file) and AH3/AK4/AH6 (real file vs demoted units). This keeps each file single-archetype, which the path-only guard requires.

---

## The dispatch→provision→real-agent flow (AC2 — the new build)

**Production functions exercised (no new production code):**
`registerTaskDispatcher(deps)` (`task-dispatcher.ts:502`) → on `task_transitioned`/registration sweep → `drainQueue` (`:247`) → `resolveProvisionSession()` (`:256`, the registry-injected real `provisionSession`) → `provisionSession(...)` (`:366`) → real `HarnessAdapter` → `endSession` teardown (`session-lifecycle.ts:341`).

**Test shape (one real leg per harness lane):**
```
for (const lane of SUPPORTED_HARNESS_LANES) {
  describe(`${lane.describeTag} AD2 AC2 — dispatch→provision→real agent`, () => {
    requireHarness(lane.harnessName);
    // CLI lanes: const bridge = await startMcpBridgeServer() in beforeEach
    test("accepted task provisions + runs a real harness turn", async ({ db, eventBus }) => {
      setProvisionSessionFn(provisionSession);        // wire registry → real provisionSession
      setActiveStrategy(fabricStrategy);
      await seedDispatchDomain(db, lane, { taskId, agentId, taskDescription, doneCondition });
      // 1. build deps from the lane's prepFn output (adapter pool + sandboxBasePath + bridge)
      const { pool, params } = lane.prepFn({ db, eventBus, tmpDir, bridge });
      const cap = createSandboxCapture(lane-capture-paths);
      const dispose = registerTaskDispatcher({
        db, eventBus, adapterPool: pool, workspace: new LocalSandboxAdapter(),
        sandboxBasePath: tmpDir,
        ...(bridge ? { mcpBridgeRegistry: bridge.mcpBridgeRegistry, mcpBaseUrl: bridge.mcpBaseUrl } : {}),
        onBeforeTeardown: cap.onBeforeTeardown,        // ← capture seam through the dispatcher path
      });
      // 2. fire the REAL trigger — NOT a seeded in_progress row:
      await transitionTask(db, eventBus, taskId, "accepted");
      // 3. wait for the real session to land + reach a terminal outcome
      await vi.waitFor(async () => {
        const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
        expect(s).toBeDefined(); expect(["done"]).toContain(s.state);
      }, { timeout: 240_000 });
      // 4. assert on REAL output: terminal non-crash outcome + capture-seam file (AR2 honest floor)
      const [s] = await db.select()...; expect(["completed","not_returned"]).toContain(s.outcome);
      const answer = cap.files.get("answer.txt"); if (answer) expect(answer).toContain("4");
      dispose();
    }, 240_000);
  });
}
```

**Key design decisions:**
1. **Capture-before-teardown via the dispatcher path.** `TaskDispatcherDeps` does **NOT** currently forward `onBeforeTeardown` to `provisionSession` (it passes only `db,eventBus,adapterPool,workspace,mcpBridgeRegistry,mcpBaseUrl` at `:366`). **Minimal production change required:** add optional `onBeforeTeardown?: BeforeTeardownContext callback` to `TaskDispatcherDeps` and thread it into the `provisionSession` deps in `drainQueue`. This mirrors AR2's own production seam (it added `onBeforeTeardown` to `ProvisionSessionDeps`) and is the lightest change that makes the dispatched real agent's sandbox output observable. **This is the one production-code touch in AR4** — preserves the dispatch API (additive optional field), satisfies the "preserve dispatcher contracts" constraint. Flag to reviewer; alternative in Design-it-twice §C.
2. **Real trigger, not seeded `in_progress`.** Step 2 uses `transitionTask(...,"accepted")` — the dispatcher's real entry. The AC explicitly forbids seeding `in_progress`; this honors it.
3. **Reuse `lane.prepFn`** for adapter + model + per-harness prep (codex git-init, opencode XDG, claude `.mcp.json`) — zero bespoke rig. The dispatcher consumes the same `AdapterPool` the lane builds.
4. **Honest floor identical to AR2 W-2:** builtin/claude reliably `completed` (fire `send_message`); codex/opencode `not_returned` + best-effort file. FAIL on `crashed`/`error`. The dispatch task uses the same `doneCondition` phrasing AR2 settled on.

---

## Design-it-twice

**§A — Assistant-turn real lane runner (builtin-only).** *Option 1:* reuse `runThroughHarness` (goes through `provisionSession`). Rejected — `runAssistantTurn` is deliberately task-free; routing it through `provisionSession` would fabricate task/bet rows and contradict the `@lore AH3 §A` design. *Option 2 (rejected, was the previous plan):* a 4-lane `runAssistantTurnThroughHarness` reusing `lane.prepFn`. Rejected per critique C-1 — `runAssistantTurn` cannot run a CLI harness (no sandbox `cwd`, no `.mcp.json` bridge, ignores external `resolvedModel`; Q2). A CLI lane through it crashes at start-time. *Option 3 (chosen):* `runAssistantTurnThroughHarness(ctx, params)` in `provision-real-session.ts` that (1) builds a **real builtin adapter** into an `AdapterPool`, (2) constructs a **real OpenRouter `CredentialResolver`** from `OPENROUTER_API_KEY`, (3) seeds the agent row's `modelProvider:"openrouter"`+`modelId` so `resolveAgentModel` yields a runnable model (Q2b), then calls `runAssistantTurn({db,eventBus,adapterPool,credentialResolver},{userId,threadId,triggerMessageId})`. It takes **no `lane`** — there is only one runnable lane (builtin). Trade-off: a second runner alongside `runThroughHarness`, builtin-scoped. Reason it wins: it is the *honest* vehicle for a genuinely builtin-only production path; forcing CLI lanes would test a path that does not exist.

**§B — Proving the AH6 gate on real output (W-2 honesty).** *Option 1:* force the model to emit empty/degenerate output and assert the broken-lane verdict on real output. Rejected — non-deterministic; a capable model essentially never returns an empty content array, so the broken-lane leg is not reliably achievable on real output. *Option 2 (chosen, honest):* split the AC into two legs by what each can actually prove. **(i) Real leg:** run a **real builtin** turn, capture the **real** output, assert the lane-gate **verdict function** over it = valid (non-empty/distinct). This is the only leg that genuinely "runs the gate on real harness output," and it is real. **(ii) Unit leg:** the broken-lane verdict (empty/degenerate transcript → broken) is asserted by the **pure verdict function over a crafted empty transcript** in `AH6-lane-gate-verdict.test.ts` — a deterministic unit, not a harness test. **State plainly:** AC3's broken-lane half is a unit; only the valid-lane half is real. No pretense that a real model is coaxed into emitting empty. Trade-off: one real proof + one unit instead of two real proofs — but the second "real proof" was never achievable, so this is the honest decomposition, not a weakening.

**§C — Dispatcher capture seam.** *Option 1 (chosen):* add optional `onBeforeTeardown` to `TaskDispatcherDeps`, thread into `drainQueue`'s `provisionSession` call. *Option 2:* assert only on DB `sessions.outcome` + `messages` rows, no sandbox capture. Trade-off: Option 2 needs zero production change but cannot observe a pure-sandbox file the dispatched agent wrote (the founder's "task → file produced" proof). Option 1 costs ~3 lines of additive production code and gives the load-bearing artifact proof. Choose Option 1; if the reviewer rejects any production touch, fall back to Option 2 with the DB outcome as the honest floor (still a real run, just a weaker observation channel).

---

## Guard carve-out + EXPLICIT_HARNESS_INTEGRATION + BUILTIN_ONLY_INTEGRATION plan

The current `coverage-debt.allowlist.json` (13 entries) stages AR3–AR6 files **that the guard already selects** (all under `harness/__tests__/` or the explicit list). The six AR4 files are **not currently selected** (Q3), so they are **not on either allowlist today**.

### The builtin-only guard carve-out (resolves C-1)

The coverage rule in `ruleFor` (`honest-harness-guard.ts:356-369`) demands every selected file declare **all** of `SUPPORTED_HARNESSES` (4). A real `builtin`-only file (AH3/AK4/AH6) would therefore FAIL coverage the moment it enters `EXPLICIT_HARNESS_INTEGRATION` — yet leaving it off means the guard never lints it (the silent-green hole Q3 names). The honest resolution is a **first-class carve-out, not an allowlist hack**:

1. **New list `BUILTIN_ONLY_INTEGRATION: readonly string[]`** in `honest-harness-predicate.ts` — path-suffixes of files whose production path is genuinely builtin-only (the assistant turn). Documented with the reason: "`runAssistantTurn` has no sandbox/MCP bridge → cannot run a CLI harness (Q2); the 4-harness matrix is a phantom gate here."
2. **`ruleFor` consults it before the coverage rule:** if the file is in `BUILTIN_ONLY_INTEGRATION`, **skip the 4-harness coverage check**, but still enforce (a) stub-content (zero stubs), (b) no-skipIf, and (c) **a positive `missingHarnesses` check restricted to `{builtin}`** — i.e. the file MUST declare `requireHarness("builtin")` (a builtin-only file that declares *no* harness is still a violation). This keeps the carve-out honest: it exempts only the *3 CLI lanes the path cannot run*, never the discipline.
3. **Why a carve-out and not the coverage-debt allowlist:** coverage-debt means "covered <4 *temporarily*, will reach 4." A builtin-only path will **never** reach 4 — using coverage-debt would lie ("debt to be paid") and would trip the "coverage debt paid — remove from allowlist" branch (`:371-375`) forever. The carve-out states the truth: this path is builtin-only by construction.
4. **Attestation floor unaffected.** The floor's `assertPerHarnessFloor` fails only if a *supported* harness has **zero** executed agentic assertions **across the whole selected set**. `AD2-real` + `R1-real` loop all four lanes → builtin/claude/codex/opencode each > 0. The builtin-only files add builtin executions (tagged `[harness:builtin]`). So claude/codex/opencode floors are satisfied by AD2/R1; builtin is satisfied by all five. **No floor change needed.**

### Per-file wiring

- **AD2-real, R1-real** (4-harness): add path-suffix to `EXPLICIT_HARNESS_INTEGRATION`. They loop `SUPPORTED_HARNESS_LANES` → declare all four → pass coverage immediately. **No coverage-debt entry** (atomic full-coverage conversion).
- **AH3-real, AK4-real, AH6-real** (builtin-only): add path-suffix to `EXPLICIT_HARNESS_INTEGRATION` **AND** `BUILTIN_ONLY_INTEGRATION`. They declare `requireHarness("builtin")` → pass the carved-out coverage rule. **No coverage-debt entry.**
- Add `packages/server/src/routes/__tests__` to `SCAN_DIRS` (`honest-harness-guard.ts`) so the guard's CLI *lints* AH3-real/AK4-real (NOT for attestation — N-1; the floor selects via `isHarnessIntegrationPath` on vitest JSON, independent of `SCAN_DIRS`).
- **Demoted** files (`per-agent-seam`, unit halves of AH3/AK4/AH6/R1/AD2, `AH6-lane-gate-verdict`) → renamed `*.test.ts` → never match `isHarnessIntegrationPath` → never selected → not on any list. ✔
- **Service-integration remainder** (AD2 queue/cost/sweep, R1 error-paths) keep `.integration.test.ts`, deliberately **out** of `EXPLICIT_HARNESS_INTEGRATION` → not selected → a fast fake adapter is fine (the guard only checks selected files).

**Allowlist / config deltas at ship:**
- `honest-harness-guard.allowlist.json` (stub debt): **no change** — none of the six were ever selected.
- `coverage-debt.allowlist.json`: **no additions** — all five converted files ship at their honest full coverage (4 for AD2/R1; builtin-only via carve-out for AH3/AK4/AH6).
- `EXPLICIT_HARNESS_INTEGRATION`: **+5 entries** (the five `*-real.integration.test.ts` files).
- `BUILTIN_ONLY_INTEGRATION`: **NEW list, +3 entries** (AH3-real, AK4-real, AH6-real).
- `SCAN_DIRS`: **+`packages/server/src/routes/__tests__`** (guard lint only).

---

## Ordered task list (builder)

1. **Predicate + carve-out + scan wiring (red-enabling).** In `honest-harness-predicate.ts`: add the **`BUILTIN_ONLY_INTEGRATION`** list (empty for now). In `honest-harness-guard.ts`: (a) `ruleFor` consults `BUILTIN_ONLY_INTEGRATION` — skip the 4-harness coverage rule but enforce a `{builtin}`-only `missingHarnesses` check; (b) add `packages/server/src/routes/__tests__` to `SCAN_DIRS`. Leave both AR4 lists empty of file entries for now (added per-file in steps 4-8). Proves: guard can see `routes/__tests__`; a builtin-only-listed file passes coverage iff it declares `requireHarness("builtin")`.
2. **Builtin assistant-turn lane runner (with real credential — W-1).** Add `runAssistantTurnThroughHarness(ctx, {userId, threadId, triggerMessageId})` to `provision-real-session.ts`: builds a **real builtin `AdapterPool`**, constructs a **real OpenRouter `CredentialResolver`** (`OPENROUTER_API_KEY`), seeds the agent row `modelProvider:"openrouter"`+`modelId`, and calls `runAssistantTurn({db,eventBus,adapterPool,credentialResolver}, …)`. Add seed helper for the assistant-thread domain (user + `ast-*` agent with model fields + thread + trigger message). **No `lane` param — builtin is the only runnable lane (Q2).** Proves: builtin runs a *real* assistant turn (real model, not a `missing_key` notice) and persists a reply row.
3. **Dispatcher capture seam (production touch).** Add optional `onBeforeTeardown` to `TaskDispatcherDeps`; thread into `drainQueue`'s `provisionSession` call (`task-dispatcher.ts:366-383`). Add `mcpBridgeRegistry`/`mcpBaseUrl` are already on `TaskDispatcherDeps` — confirm. Unit-assert the field is forwarded (service-integration: register dispatcher with a capturing `onBeforeTeardown`, assert it fires).
4. **AD2 → `AD2-task-dispatcher-real.integration.test.ts` (AC2 keystone).** Loop `SUPPORTED_HARNESS_LANES`; the real dispatch→provision→agent flow (§above). Add path to `EXPLICIT_HARNESS_INTEGRATION`. Strip the converted assertions from the original; keep queue/cost/sweep as service-integration in the original file (fast fake adapter retained). Proves: AC2, AC4 (hard-fail via `requireHarness`).
5. **R1 → `R1-wire-agent-execution-real.integration.test.ts`.** Loop lanes; POST `/api/sessions` → real `provisionSession`. Add to `EXPLICIT_HARNESS_INTEGRATION`. Demote crash-path; keep credential/cost/concurrency/back-compat as service-integration in the original. Proves: AC1, AC4.
6. **AH3 → `AH3-assistant-turn-real.integration.test.ts` (builtin-only).** `requireHarness("builtin")` in a `describe("[harness:builtin] …")`; call `runAssistantTurnThroughHarness`; H1 reply (inherits per-agent test-2, W-3) + H3 user-message-reaches-model. Add to `EXPLICIT_HARNESS_INTEGRATION` **+ `BUILTIN_ONLY_INTEGRATION`**. Demote AC2/M3/H1-novalidate/loop-guard to `AH3-assistant-turn.test.ts` units; keep AC3/AC5/H2 as `routes/__tests__` service-integration. Proves: AC1.
7. **AK4 → `AK4-assistant-draft-real.integration.test.ts` (builtin-only).** `requireHarness("builtin")`; AC1 reply + AC2 "real agent drafts a bet". Remove `vi.mock`. Add to `EXPLICIT_HARNESS_INTEGRATION` **+ `BUILTIN_ONLY_INTEGRATION`**. Fold AC3a/AC4/AC4-loop into `tools/__tests__/AK4-assistant-draft-registry.test.ts`. Proves: AC1.
8. **AH6 → `AH6-lane-gates-broken-turn-real.integration.test.ts` (builtin-only) + `AH6-lane-gate-verdict.test.ts` (unit).** Real file: `requireHarness("builtin")`; **Sanity (valid-lane) leg only**, gate verdict over real builtin output (§B). Unit file: broken-lane verdict over a crafted empty transcript (W-2). Remove `vi.mock`. Add real file to `EXPLICIT_HARNESS_INTEGRATION` **+ `BUILTIN_ONLY_INTEGRATION`**. Demote Term-1/Term-2a mapping to units. Proves: AC3 (valid-lane real; broken-lane unit).
9. **Per-agent-seam → demote entirely.** Rename to `assistant-turn-per-agent-seam.test.ts`; rewrite as `resolveAgentModel`/model-gateway unit tests (no `vi.mock`, no harness). Proves: pure-logic demotion (AC1's "pure-logic remnants demoted to units").
10. **Guard + attestation green.** Run `npm run lint` (honest-harness-guard) — AD2-real/R1-real full-matrix + zero stubs; AH3/AK4/AH6-real builtin-only (carve-out) + declare `builtin` + zero stubs; every demoted file unselected. `npm run check`. Confirm attestation `byHarness`: builtin/claude/codex/opencode each > 0 across the selected set (claude/codex/opencode from AD2/R1; builtin from all five). (Builder runs the suite; designer does not.)

---

## Type signatures / contracts

```ts
// provision-real-session.ts — NEW builtin-only assistant-turn runner (test-support, additive).
// NO `lane` param: runAssistantTurn is builtin-only by construction (Q2). Builds a real
// builtin adapter pool + a real OpenRouter CredentialResolver internally (W-1).
export async function runAssistantTurnThroughHarness(
  ctx: { db: Db; eventBus: EventBus; tmpDir: string },
  params: { userId: string; threadId: string; triggerMessageId: string },
): Promise<void>;   // assertions read DB rows (messages / bets) after it resolves

// Seed helper also sets the agent row's model fields so resolveAgentModel yields a runnable model:
//   agent: { id: `ast-${userId}`, modelProvider: "openrouter", modelId: <real OpenRouter model> }

// task-dispatcher.ts — TaskDispatcherDeps gains ONE optional field (additive; preserves API)
export interface TaskDispatcherDeps {
  // …existing… (mcpBridgeRegistry / mcpBaseUrl already present, :99-103)
  /** AR4: forwarded to provisionSession so a dispatched real agent's sandbox is observable. */
  readonly onBeforeTeardown?: (ctx: BeforeTeardownContext) => Promise<void>;
}

// honest-harness-predicate.ts:
//   EXPLICIT_HARNESS_INTEGRATION  += 5 converted files (AD2/R1/AH3/AK4/AH6 -real)
//   export const BUILTIN_ONLY_INTEGRATION: readonly string[] = [ /* AH3/AK4/AH6 -real */ ];
// honest-harness-guard.ts:
//   ruleFor: if BUILTIN_ONLY_INTEGRATION.includes(p) → skip 4-harness coverage rule,
//            but still require declared.has("builtin") + zero-stub + no-skipIf.
//   SCAN_DIRS += "packages/server/src/routes/__tests__"  (guard lint only — NOT the floor, N-1)
```
Reuse verbatim (no new signatures): `requireHarness`, `SUPPORTED_HARNESS_LANES`, `runThroughHarness`, `createSandboxCapture`, `startMcpBridgeServer`, `lane.prepFn`, `lane.describeTag` (AD2/R1 only — the builtin assistant runner does not use the lane table).

---

## Acceptance criteria → verification

| AC | Verification |
|---|---|
| AC1 real model turn, no `vi.mock`/echo remains | AH3/AK4/AH6 `*-real` (builtin-only) call `runAssistantTurnThroughHarness` with a **real OpenRouter resolver** (W-1: NOT the `ANTHROPIC_API_KEY` else-branch); assert persisted `ast-*` reply is the real model output (non-empty, responsive). `grep -L vi.mock` over converted files = clean. honest-harness-guard passes (selected, zero stub, builtin declared). |
| AC2 dispatch→provision→real agent | `AD2-...-real` (4 lanes): `transitionTask(...,"accepted")` → `vi.waitFor` real `sessions` row `done` + outcome ∈ {completed,not_returned} + `cap.files` artifact. No `state:"in_progress"` seed in the converted assertions. |
| AC3 lane-gate on broken/real turn | `AH6-...-real`: **valid-lane** gate verdict asserted over **real builtin output** (the real leg). **Broken-lane** verdict asserted in `AH6-lane-gate-verdict.test.ts` over a crafted empty transcript (W-2 — no real model emits empty on demand). |
| AC4 hard-fail on missing harness, none skip | AD2/R1-real: `requireHarness(lane.harnessName)` per lane. AH3/AK4/AH6-real: `requireHarness("builtin")`. No `skipIf` anywhere. honest-harness-guard skipIf-check passes; missing harness → `requireHarness` throws (AR1 helper). |
| Matrix/coverage | AD2-real + R1-real declare all four lanes (full-matrix coverage rule). AH3/AK4/AH6-real declare `builtin` only (`BUILTIN_ONLY_INTEGRATION` carve-out skips the 4-lane rule but enforces builtin-declared). attestation `byHarness`: builtin/claude/codex/opencode each > 0 across the selected set (claude/codex/opencode via AD2/R1; builtin via all five). |
| Preserve dispatcher API | `TaskDispatcherDeps` change is additive-optional; existing call sites compile unchanged. `npm run check`. |

---

## Security & abuse cases

- **Rate-limit / POST / PATCH:** N/A — no new routes or mutations; tests only.
- **Input-trust / agent-authored fields:** N/A — no production input surface added (the one production touch is an optional test-callback dep).
- **Secret-handling:** Reuse AR2's posture — `requireHarness` messages name harnesses, never secrets; no API key echoed; `provisionCodexHome`/`provisionOpencodeHome` copy only `auth.json`/`config.toml` (not SQLite). No new secret surface.
- **Path-traversal:** N/A — sandbox paths are `mkdtemp` test scratch; capture reads stay within `sandboxPath` (AR2's `readDirRecursive` is rooted).
- **SSRF:** N/A — no new outbound URL; the MCP bridge binds `127.0.0.1` ephemeral (AR2).

---

## protectedTests

The **assertions** (not the wiring) of the demoted/kept service-integration blocks must survive — the spec mandates "demotions preserve the assertion." DoD audits these are not weakened:
- `packages/server/src/__tests__/AH3-assistant-turn-unit.test.ts` (untouched unit)
- **`AH3-assistant-turn-real.integration.test.ts` H1 (builtin)** — the **inheritor of per-agent-seam test-2** ("a real assistant message is persisted, not silently dropped", W-3). protectedTests guards that this assertion lands when the per-agent-seam file is demoted, so the turn-completion coverage is not silently lost in the demotion.
- `AH6-lane-gate-verdict.test.ts` — the **inheritor of AH6 Term-2b** (broken-lane verdict over crafted input, W-2). protectedTests guards the broken-lane verdict assertion survives the AH6 split.
- `packages/server/src/tools/__tests__/AK4-assistant-draft-registry.test.ts` (gains demoted assertions; existing ones unchanged)
- The kept service-integration assertions in R1 (AC6/AC7 credential, cost-cap-422, concurrency-429, back-compat) and AD2 (AC3 cost cap, AC4 concurrency, AC6 queue endpoint, idempotency, sweep-race) — their assertion bodies move file but keep their `expect(...)`.

## sharedFiles (concurrent-WP overlap)

- `packages/server/src/harness/__tests__/provision-real-session.ts` — **also touched by AR3/AR5/AR6** (they consume `SUPPORTED_HARNESS_LANES`/`runThroughHarness`). AR4 **adds** `runAssistantTurnThroughHarness`. Coordinate: additive export, low conflict, but schedule AR4's edit to this file aware of AR3.
- `scripts/lib/honest-harness-predicate.ts` (`EXPLICIT_HARNESS_INTEGRATION` + **NEW `BUILTIN_ONLY_INTEGRATION`**) — **AR3/AR5/AR6 may also add entries.** TS array constants; real conflict risk. The `BUILTIN_ONLY_INTEGRATION` list is new — AR4 introduces it; later tracks with builtin-only production paths reuse it. Schedule serially or expect a merge fixup.
- `scripts/honest-harness-guard.ts` (`SCAN_DIRS` + `ruleFor` carve-out branch) — AR4 adds `routes/__tests__` to `SCAN_DIRS` and a `BUILTIN_ONLY_INTEGRATION` check in `ruleFor`. The `ruleFor` change is a guarded early-skip of the coverage rule — additive, low overlap.
- `scripts/coverage-debt.allowlist.json` — AR3/AR5/AR6 shrink it; AR4 ideally no-ops. JSON array conflict risk.
- `packages/fabric/src/services/task-dispatcher.ts` — AR4 adds optional dep. **AR3's `af7-dispatch-wiring` may touch the same file** — coordinate.

## Migrations

No symbol rename in production. **Test-file renames** (delete-then-create the `*-real` sibling + demoted unit):
- `AH3-assistant-turn.integration.test.ts` → split: `…-real.integration.test.ts` + `AH3-assistant-turn.test.ts` (units) + kept service-integration.
- `AK4-assistant-draft.integration.test.ts` → `…-real.integration.test.ts` + fold into existing registry unit.
- `AH6-lane-gates-broken-turn.integration.test.ts` → `…-real.integration.test.ts` (valid-lane real builtin) + `AH6-lane-gate-verdict.test.ts` (broken-lane verdict unit, W-2) + mapping units.
- `assistant-turn-per-agent-seam.integration.test.ts` → `assistant-turn-per-agent-seam.test.ts` (full demotion).
- `R1-wire-agent-execution.integration.test.ts` → `…-real.integration.test.ts` + kept error-path service-integration.
- `AD2-task-dispatcher.integration.test.ts` → `…-real.integration.test.ts` + kept queue/sweep service-integration.
No source call-sites reference these test files; only `EXPLICIT_HARNESS_INTEGRATION`/`BUILTIN_ONLY_INTEGRATION`/`coverage-debt`/`honest-harness-guard.allowlist` reference paths — update those in lockstep.

---

## Risks / open questions

1. **One production touch (dispatcher capture seam).** Adding `onBeforeTeardown` to `TaskDispatcherDeps` is the only non-test change. Additive-optional, preserves the dispatch API, mirrors AR2's own `ProvisionSessionDeps` seam. **Reviewer: confirm acceptable, or fall to Design-it-twice §C Option 2 (DB-outcome-only observation, zero production touch).**
2. **Assistant turn is builtin-only by construction (Q2 / critique C-1).** `runAssistantTurnThroughHarness` is builtin-scoped, not a 4-lane runner. Risk: reviewer reads "every supported harness, equal coverage" as "AH3/AK4/AH6 must run all four." Counter: the assistant turn *cannot* run a CLI harness (no sandbox `cwd`, no `.mcp.json` bridge) — forcing CLI lanes would be a phantom gate. The 4-harness obligation lives on AD2/R1 (real `provisionSession`); AH3/AK4/AH6 get the `BUILTIN_ONLY_INTEGRATION` carve-out. **If the reviewer instead wants the assistant turn to support CLI harnesses, that is a production change to `runAssistantTurn` (provision a sandbox + MCP bridge for CLI adapters) — far larger than AR4's one-touch budget; out of scope, name it and defer.**
3. **Builtin assistant lane reply channel is `drainResult.text`, not `send_message` (corrects W-4).** `runAssistantTurn` persists the reply from `drainStreamEvents` → `drainResult.text` (`assistant-turn.ts:512-513`) — the model's stdout text, **not** an MCP `send_message` row (`send_message` is the *provisionSession/task* return channel, AR2 W-2). Since the assistant lane is builtin-only, there is no CLI start-time blocker here at all — the builtin adapter runs a single chat completion in-process and `drainResult.text` is the reply. **The real W-1 risk replaces the old send_message risk:** the lane must supply a real OpenRouter resolver + agent model fields or it persists a `missing_key` notice instead of a turn (Q2b). That is the load-bearing thing the builder must get right, not MCP tool exposure.
3a. **The CLI start-time blocker lives on AD2/R1, not the assistant turn.** For AD2/R1 (which *do* provision sandboxes), codex/opencode may land `not_returned` + cost=0 on file tasks (AR2 W-2) — reuse AR2's honest non-crash-outcome floor + `send_message` prompting for those lanes. This is the inherited AR2 posture, not a new AR4 problem.
4. **Tool-call nondeterminism (AK4 AC2 real bet draft).** A real agent may not call `create_bet`. Honest floor: draft-bet-row OR non-empty reply; deterministic handler logic lives in the unit. Mirror AR2 best-effort posture.
5. **Runtime cost.** Up to 5 converted files × 4 lanes × ~real-LLM latency, 240s ceilings. Integration config runs real-LLM serially (AR1). Expect a multi-minute suite; acceptable (local-only, attestation-carried). Reuse AR2's serial-lane wiring.
6. **AD2 file size (1351 lines).** Splitting cleanly without dropping a kept assertion is fiddly. The split must be mechanical: real-flow blocks → `-real` file; everything else stays. protectedTests guards against silent assertion loss.
7. **Cost over-counting (AR3 territory).** If an AR4 real multi-step turn trips the `recordCostAndCheck` over-count, **do not fix here** — it is AR3's AC. Flag in retro; AR4 honest floor for builtin uses `totalCostCents > 0` (single-step, not multi-step sum), so it should not depend on the delta bug. If a multi-step assistant turn over-counts, assert only `> 0`, not an exact sum.

---

## What AR4 does NOT do
- Touch AR3 (provisioning/cost/`recordCostAndCheck`), AR5 (decomposition), AR6 (MCP bridge/enforcement) files.
- Add a CI test job (all local, attestation-carried).
- Change the dispatch API beyond the additive optional `onBeforeTeardown`.
- **Add CLI-harness support to `runAssistantTurn`** (sandbox + MCP bridge for the assistant turn). That is a real production change far beyond AR4's one-touch budget; the assistant turn stays builtin-only and AR4 tests it honestly as such.
- Weaken attestation, the guard, or any allowlist. The `BUILTIN_ONLY_INTEGRATION` carve-out is **not** a weakening — it exempts only the 3 CLI lanes a builtin-only production path *cannot* run, while still enforcing zero-stub + no-skipIf + builtin-declared. The 4-harness floor stays fully enforced via AD2/R1.
