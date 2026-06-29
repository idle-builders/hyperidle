# AR4 — Assistant turn, agent execution, and dispatcher: real harness integration

**Type.** backend + test-infra (test-fidelity conversion). **No new primitive, no UI.** Reuses AR1/AR2 mechanisms.

**One-line.** Convert the six harness-facing tests off stubbed adapters (`vi.mock("../harness/llm-client")`, `EchoHarnessAdapter`/`CapturingHarnessAdapter`/`ScriptedHarnessAdapter`, directly-seeded `in_progress`) to **real-harness integration**, and flow the **dispatch→provision→real-agent** seam across the full `SUPPORTED_HARNESSES` matrix using AR2's `SUPPORTED_HARNESS_LANES` + `runThroughHarness` + `createSandboxCapture`. No bespoke rigs.

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

**Q2 — load-bearing. Does the assistant-turn path go through `provisionSession`?** **No.** `runAssistantTurn` (`assistant-turn.ts:376`) calls `adapterPool.select(...)` then drives the adapter's `startSession`/`streamEvents` directly. It is **task-free by deliberate design** (`@lore AH3 §A`: "Using provisionSession would pollute tasks/bets with fake rows"). So:
- For **AH3 / AK4 / AH6 / per-agent-seam**, the "production path" in AC1 is `runAssistantTurn` + a **real adapter registered in the `AdapterPool`** (real `BuiltinHarnessAdapter` calling a real model, or a real `CliHarnessAdapter`). `runThroughHarness` (which calls `provisionSession`) is the **wrong** vehicle for these four — they do not provision a session.
- For **AD2 (dispatcher) + R1 (route)**, the production path **is** `provisionSession` (AD2 via `drainQueue`, R1 via the POST handler). These reuse `runThroughHarness`/the lane table directly.

This split is the spine of the plan. AR2's `runThroughHarness` is reusable verbatim for AD2/R1; for the assistant-turn files the builder builds a **thin parallel lane runner** (`runAssistantTurnThroughHarness`, added to `provision-real-session.ts`) that registers the same per-lane real adapters into an `AdapterPool` and calls `runAssistantTurn` — reusing `SUPPORTED_HARNESS_LANES`' adapter-construction and per-harness prep, NOT rebuilding it. (Design-it-twice §A below.)

**Q3 — load-bearing. Does the honest-harness-guard currently flag any of the six files?** **No — and this is the central mechanical task.** `isHarnessIntegrationPath` (`honest-harness-predicate.ts:55-62`) is **path-only**: it matches `…/harness/__tests__/*.integration.test.ts` OR a member of `EXPLICIT_HARNESS_INTEGRATION` (today only `session-provisioning.integration.test.ts`). The six files live in `packages/server/src/__tests__/` (AH6, seam, R1, AD2) or `packages/server/src/routes/__tests__/` (AH3, AK4) — **none match.** Two consequences:
  1. `routes/__tests__/` is not even in `SCAN_DIRS` → the guard can never see AH3/AK4.
  2. Until a converted file is added to `EXPLICIT_HARNESS_INTEGRATION`, the guard does NOT enforce its full-matrix coverage and the attestation floor does NOT count its agentic executions — so a half-converted file mints green silently. **Each converted file MUST be added to `EXPLICIT_HARNESS_INTEGRATION`** in the same change that converts it, and `routes/__tests__` MUST be added to `SCAN_DIRS`. This is the AR4 enforcement wiring, the analogue of AR2's keystone.

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
| `runAssistantTurn` goes through `provisionSession` | It does **not** (Q2). | Assistant-turn lane runner calls `runAssistantTurn` with a real-adapter pool; only AD2/R1 use `runThroughHarness`. |
| `provisionSession` signature for dispatch | `drainQueue` calls `provisionSession({db,eventBus,adapterPool,workspace,mcpBridgeRegistry,mcpBaseUrl},{taskId,agentId,productId:teamId,sandboxBasePath,resolvedModel,sessionWorkflow?})` (`task-dispatcher.ts:366`) | Lane table already produces compatible params; thread `mcpBridgeRegistry`/`mcpBaseUrl` into `TaskDispatcherDeps` for CLI lanes. |

No `/concept` gap. No doc contradiction.

---

## Per-file triage

Legend: **Convert** = real-harness, full `SUPPORTED_HARNESSES` matrix via lane table. **Demote** = move the assertion to a `*.test.ts` unit (or keep as honest service-integration `{db,app,eventBus}` with no harness) — it was never harness integration. **Keep** = already honest, leave.

### 1. `AH3-assistant-turn.integration.test.ts` (1171 lines, `routes/__tests__/`)
Production under test: `runAssistantTurn` (adapter-pool path — Q2).

| Block (line) | Subject | Decision | Harnesses |
|---|---|---|---|
| AC1 trigger path (119) | POST message → reply persisted; trigger fires | **Convert** the "reply persisted" leg to a real turn; the "POST→trigger fires" wiring is a route contract → keep as service-integration with `runTurn` injected (no harness; trigger is the subject). | builtin+claude+codex+opencode |
| AC2 error surface / notice classes (215) | `mapErrorToNotice` → notice kind, no secret leak | **Demote** to `*.test.ts` unit — pure error→notice mapping, no harness. | — |
| AC2 hung provider timeout (347) | `runAssistantTurn` resolves within `ASSISTANT_TURN_TIMEOUT_MS` | **Demote** to unit via injected adapter that never emits + `turnTimeoutMs` override — timeout logic is deterministic, not harness behavior. | — |
| AC3 PATCH 403 (432) | Agents API rejects ast-* systemPrompt edit | **Demote**/keep as service-integration (`{db,app}`) — pure route authz, no harness. | — |
| AC5 defaults at registration (488) | lazy-create assistant defaults | **Demote**/keep service-integration — DB shape, no harness. | — |
| H1 happy-path (569) | scripted adapter completion → reply persisted | **Convert** — this IS the "real reply" proof (AC1). Real adapter, assert persisted `messages` row is the model's reply (non-empty, sender `ast-*`). | builtin+claude+codex+opencode |
| H1 no-resolvedModel throws (648) | startSession validates resolvedModel | **Demote** to unit — validation logic. | — |
| H2 notice round-trip (679) | GET returns persisted notice | **Demote**/keep service-integration. | — |
| H3 user message reaches model (937) | `SessionConfig.messages` carries transcript | **Convert** — this is the canonical CC-004 "user message never reached model" proof. Real turn; assert the reply is responsive to the user message (proves transcript reached model). | builtin+claude+codex+opencode |
| M3 null-resolve → missing_key (727) | missing credential → notice | **Demote** to unit. | — |
| loop-guard ast-* no re-trigger (792) | sender-based re-trigger guard | **Demote**/keep service-integration. | — |

**Net:** one converted `*.integration.test.ts` (H1 + H3 + AC1-reply leg as the three real-turn assertions, looped over the four lanes); the rest split into `AH3-assistant-turn.test.ts` units + retained service-integration in `routes/__tests__`. The converted file is added to `EXPLICIT_HARNESS_INTEGRATION`.

### 2. `AK4-assistant-draft.integration.test.ts` (659 lines, `routes/__tests__/`)
Production under test: `runAssistantTurn` + assistant-draft tool registry. Currently `vi.mock("../../harness/llm-client.js")` to script `callLlm` tool_use sequences.

| Block | Subject | Decision | Harnesses |
|---|---|---|---|
| AC1 text-only reply (146) | text end_turn → plain reply persisted | **Convert** — real turn, assert non-empty `ast-*` reply. | builtin+claude+codex+opencode |
| AC2 create_bet tool_use → draft bet (228) | tool_use → `bets` row status=draft + `payload.toolCalls.betId` | **Split.** The **tool-handler logic** (create_bet handler writes a draft `bets` row given a tool call) → **demote** to a `*.test.ts` unit testing the registry handler directly (the AK4 registry unit already exists — extend it). The **"a real agent actually calls create_bet"** claim → **Convert** one real-harness assertion that the agent, told to draft a bet, produces a draft `bets` row. ⚠ tool-call nondeterminism: phrase the task explicitly; honest floor = "a draft bet row appeared OR a non-empty reply", builtin/claude reliable, codex/opencode best-effort (mirror AR2 W-2). | builtin+claude+codex+opencode |
| AC3a bet stays draft (382) | no autonomous commit after turn | **Demote** to unit — post-turn invariant over a given tool result. | — |
| AC4 edit_bet same betId (460) | second turn mutates same bet, count stays 1 | **Demote** to unit — registry handler idempotency over a supplied tool call. | — |
| AC4-loop-bound MAX_TOOL_ITERATIONS=3 (587) | loop cap + never-silent | **Demote** to unit — deterministic loop bound, scripted `callLlm` is the *correct* tool here (it tests the loop, not the harness). | — |

**Net:** one converted `*.integration.test.ts` (AC1 reply + AC2 "real agent drafts a bet" over four lanes); the deterministic tool-handler/loop assertions fold into `tools/__tests__/AK4-assistant-draft-registry.test.ts` (already a unit). Converted file → `EXPLICIT_HARNESS_INTEGRATION`.

### 3. `AH6-lane-gates-broken-turn.integration.test.ts` (476 lines, `__tests__/`)
Production under test: `runAssistantTurn` lane-gate behavior on broken turns. Currently `vi.mock("../harness/llm-client.js")` with a closure-controlled `callLlm` (CassetteMiss / empty-content).

| Block | Subject | Decision | Harnesses |
|---|---|---|---|
| Term 1: no `assistantTurnDeps` → no reply (203) | trigger wiring is load-bearing (negative) | **Demote**/keep service-integration — proves the POST handler doesn't fire `runAssistantTurn` without deps; no harness. | — |
| Term 2a: CassetteMiss → provider_error notice (263) | cassette miss → mapped notice | **Demote** to unit — error→notice mapping (overlaps AH3 AC2 mapping unit; consolidate). | — |
| Term 2b: empty-content → degenerate reply, S1 false (339) | degenerate-completion predicate | **Convert (AC3 core)** — AR4 AC3 is "lane-gate behavior on a **broken/real turn** proven against **real harness output**." Drive a real harness with a task that yields a degenerate/near-empty turn and assert the lane-gate verdict on real output. ⚠ Forcing a real model to emit empty is unreliable → see Design-it-twice §B; honest floor = the gate's verdict function over the **real** captured output, asserted to be the broken-lane verdict. | builtin+claude+codex+opencode |
| Sanity: normal run → S1 true (418) | distinct non-empty reply predicate | **Convert** — the positive companion to AC3, real turn, S1 predicate true. | builtin+claude+codex+opencode |

**Net:** one converted `*.integration.test.ts` (Term 2b broken-lane + Sanity over four lanes); the mapping/trigger assertions demote to units / service-integration. Converted file → `EXPLICIT_HARNESS_INTEGRATION`.

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

**§A — Assistant-turn real lane runner.** *Option 1:* reuse `runThroughHarness` (goes through `provisionSession`). Rejected — `runAssistantTurn` is deliberately task-free; routing it through `provisionSession` would fabricate task/bet rows and contradict the `@lore AH3 §A` design. *Option 2 (chosen):* add `runAssistantTurnThroughHarness(lane, ctx, params)` to `provision-real-session.ts` that calls `lane.prepFn` for adapter+prep, registers the adapter into an `AdapterPool`, and calls `runAssistantTurn({db,eventBus,adapterPool},{userId,threadId,triggerMessageId})`. Trade-off: a second lane runner alongside `runThroughHarness`. Reason it wins: it respects the production architecture (two genuinely different production paths), and it still single-sources adapter construction from the lane table. Reject-reason for forcing one runner: it would lie about the production path.

**§B — Proving the AH6 "broken turn" gate on real output.** *Option 1:* force the model to emit empty/degenerate output. Rejected — non-deterministic; a capable model rarely returns empty. *Option 2 (chosen):* run a **real** turn, capture the **real** output, and assert the **lane-gate verdict function** (the S1 distinct-reply predicate / return-gate verdict) over that real output — for the "sanity" leg the real output is non-empty → verdict=valid; for the broken leg, induce brokenness through a **real** mechanism the harness genuinely produces (e.g. a task that legitimately yields a no-content turn, or assert that an empty model completion — which the gate must handle — is graded broken by the real predicate). The gate's *pure verdict function* over a supplied transcript is **also** unit-tested (demoted from Term 2b). This gives one honest real-harness proof (gate runs on real output) + one deterministic unit (verdict function over crafted input). Trade-off: the broken-leg real assertion is best-effort; mitigated by the unit covering the deterministic verdict.

**§C — Dispatcher capture seam.** *Option 1 (chosen):* add optional `onBeforeTeardown` to `TaskDispatcherDeps`, thread into `drainQueue`'s `provisionSession` call. *Option 2:* assert only on DB `sessions.outcome` + `messages` rows, no sandbox capture. Trade-off: Option 2 needs zero production change but cannot observe a pure-sandbox file the dispatched agent wrote (the founder's "task → file produced" proof). Option 1 costs ~3 lines of additive production code and gives the load-bearing artifact proof. Choose Option 1; if the reviewer rejects any production touch, fall back to Option 2 with the DB outcome as the honest floor (still a real run, just a weaker observation channel).

---

## coverage-debt.allowlist.json + EXPLICIT_HARNESS_INTEGRATION plan

The current `coverage-debt.allowlist.json` (13 entries) stages AR3–AR6 files **that the guard already selects** (all under `harness/__tests__/` or the explicit list). The six AR4 files are **not currently selected** (Q3), so they are **not on either allowlist today**.

**The conversion is therefore additive to the selection set, with a debt window per file:**

For each file that gains a converted real-harness sibling (`AD2-...-real`, `R1-...-real`, `AH3-...-real`, `AK4-...-real`, `AH6-...-real`):
1. **Add the converted file path to `EXPLICIT_HARNESS_INTEGRATION`** (`honest-harness-predicate.ts`) so the guard + attestation floor select it. Add `packages/server/src/routes/__tests__` to `SCAN_DIRS` (`honest-harness-guard.ts`) so AH3/AK4 real files are scanned.
2. In the **same change**, the converted file **already declares all four `requireHarness` lanes** (it loops `SUPPORTED_HARNESS_LANES`) → it passes the coverage check immediately → **no coverage-debt entry needed.** AR4 ships its converted files **fully covered**, not staged. (Coverage-debt is only for a file selected before its lanes are complete; AR4 converts atomically, so it skips the debt window.)
3. The **demoted** files (`per-agent-seam`, and the unit halves of AH3/AK4/AH6/R1/AD2) are renamed to `*.test.ts` → never match `isHarnessIntegrationPath` → never selected → not on any allowlist. ✔
4. The **service-integration remainder** files (AD2 queue/cost/sweep, R1 error-paths) keep `.integration.test.ts` but are **deliberately kept out of `EXPLICIT_HARNESS_INTEGRATION`** and use no harness adapter that trips the stub-content check (a fast fake adapter in a non-selected file is fine — the guard only checks selected files).

**Allowlist deltas at ship:**
- `honest-harness-guard.allowlist.json` (stub debt): **no change** — none of the six were ever on it (they weren't selected).
- `coverage-debt.allowlist.json`: **no additions** (atomic full-coverage conversion). If a lane proves flaky and a converted file must ship covering <4 harnesses, **that** is the only case that adds a temporary entry — avoid; prefer fixing the lane.
- `EXPLICIT_HARNESS_INTEGRATION`: **+5 entries** (the five `*-real.integration.test.ts` files). `SCAN_DIRS`: **+`packages/server/src/routes/__tests__`**.

> ⚠ If the reviewer insists AR4 land incrementally (one harness lane at a time per file), then a coverage-debt entry per file is the staging mechanism — added when the file enters `EXPLICIT_HARNESS_INTEGRATION` with <4 lanes, removed when the 4th lane lands. Recommend against; atomic per-file conversion is cleaner and the lane table makes 4-at-once cheap.

---

## Ordered task list (builder)

1. **Predicate + scan wiring (red-enabling).** Add `packages/server/src/routes/__tests__` to `SCAN_DIRS` in `honest-harness-guard.ts`. Leave `EXPLICIT_HARNESS_INTEGRATION` empty of AR4 files for now (added per-file in steps 4-8 as each converted file lands). Proves: guard now *can* see `routes/__tests__`.
2. **Assistant-turn lane runner.** Add `runAssistantTurnThroughHarness(lane, ctx, {userId, threadId, triggerMessageId})` to `provision-real-session.ts` (reuses `lane.prepFn` adapter+prep; calls `runAssistantTurn`). Add seed helper for the assistant-thread domain (user + `ast-*` agent + thread + trigger message). Proves: builtin lane runs a real assistant turn, persists a reply row.
3. **Dispatcher capture seam (production touch).** Add optional `onBeforeTeardown` to `TaskDispatcherDeps`; thread into `drainQueue`'s `provisionSession` call (`task-dispatcher.ts:366-383`). Add `mcpBridgeRegistry`/`mcpBaseUrl` are already on `TaskDispatcherDeps` — confirm. Unit-assert the field is forwarded (service-integration: register dispatcher with a capturing `onBeforeTeardown`, assert it fires).
4. **AD2 → `AD2-task-dispatcher-real.integration.test.ts` (AC2 keystone).** Loop `SUPPORTED_HARNESS_LANES`; the real dispatch→provision→agent flow (§above). Add path to `EXPLICIT_HARNESS_INTEGRATION`. Strip the converted assertions from the original; keep queue/cost/sweep as service-integration in the original file (fast fake adapter retained). Proves: AC2, AC4 (hard-fail via `requireHarness`).
5. **R1 → `R1-wire-agent-execution-real.integration.test.ts`.** Loop lanes; POST `/api/sessions` → real `provisionSession`. Add to `EXPLICIT_HARNESS_INTEGRATION`. Demote crash-path; keep credential/cost/concurrency/back-compat as service-integration in the original. Proves: AC1, AC4.
6. **AH3 → `AH3-assistant-turn-real.integration.test.ts`.** Loop lanes via `runAssistantTurnThroughHarness`; H1 reply + H3 user-message-reaches-model. Add to `EXPLICIT_HARNESS_INTEGRATION`. Demote AC2/M3/H1-novalidate/loop-guard to `AH3-assistant-turn.test.ts` units; keep AC3/AC5/H2 as `routes/__tests__` service-integration. Proves: AC1.
7. **AK4 → `AK4-assistant-draft-real.integration.test.ts`.** Loop lanes; AC1 reply + AC2 "real agent drafts a bet". Remove `vi.mock`. Add to `EXPLICIT_HARNESS_INTEGRATION`. Fold AC3a/AC4/AC4-loop into `tools/__tests__/AK4-assistant-draft-registry.test.ts`. Proves: AC1.
8. **AH6 → `AH6-lane-gates-broken-turn-real.integration.test.ts`.** Loop lanes; Term-2b broken + Sanity over real output (§B). Remove `vi.mock`. Add to `EXPLICIT_HARNESS_INTEGRATION`. Demote Term-1/Term-2a mapping to units. Proves: AC3.
9. **Per-agent-seam → demote entirely.** Rename to `assistant-turn-per-agent-seam.test.ts`; rewrite as `resolveAgentModel`/model-gateway unit tests (no `vi.mock`, no harness). Proves: pure-logic demotion (AC1's "pure-logic remnants demoted to units").
10. **Guard + attestation green.** Run `npm run lint` (honest-harness-guard) — every converted file selected + full-matrix + zero stubs; every demoted file unselected. `npm run check`. Confirm attestation `agenticExecutedByHarness` buckets all four harnesses > 0 for the converted set. (Builder runs the suite; designer does not.)

---

## Type signatures / contracts

```ts
// provision-real-session.ts — NEW assistant-turn lane runner (test-support, additive)
export async function runAssistantTurnThroughHarness(
  lane: HarnessLane,
  ctx: HarnessRunCtx,
  params: { userId: string; threadId: string; triggerMessageId: string },
): Promise<{ cap: SandboxCapture }>;   // assertions read DB rows (messages/bets) + cap.files

// task-dispatcher.ts — TaskDispatcherDeps gains ONE optional field (additive; preserves API)
export interface TaskDispatcherDeps {
  // …existing…
  /** AR4: forwarded to provisionSession so a dispatched real agent's sandbox is observable. */
  readonly onBeforeTeardown?: (ctx: BeforeTeardownContext) => Promise<void>;
}

// honest-harness-predicate.ts — EXPLICIT_HARNESS_INTEGRATION gains the 5 converted files
// honest-harness-guard.ts — SCAN_DIRS gains "packages/server/src/routes/__tests__"
```
Reuse verbatim (no new signatures): `requireHarness`, `SUPPORTED_HARNESS_LANES`, `runThroughHarness`, `createSandboxCapture`, `startMcpBridgeServer`, `lane.prepFn`, `lane.describeTag`.

---

## Acceptance criteria → verification

| AC | Verification |
|---|---|
| AC1 real model turn, no `vi.mock`/echo remains | Converted AH3/AK4/AH6 `*-real` files loop `SUPPORTED_HARNESS_LANES` calling `runAssistantTurnThroughHarness`; assert persisted `ast-*` reply is the real model output (non-empty, responsive). `grep -L vi.mock` over converted files = clean. honest-harness-guard passes (selected, zero stub). |
| AC2 dispatch→provision→real agent | `AD2-...-real`: `transitionTask(...,"accepted")` → `vi.waitFor` real `sessions` row `done` + outcome ∈ {completed,not_returned} + `cap.files` artifact. No `state:"in_progress"` seed in the converted assertions. |
| AC3 lane-gate on broken/real turn | `AH6-...-real`: gate verdict asserted over **real** captured output (broken + sanity legs) per §B; verdict-function unit covers the deterministic branch. |
| AC4 hard-fail on missing harness, none skip | Every converted file: `requireHarness(lane.harnessName)` at describe scope. No `skipIf`. honest-harness-guard skipIf-check passes. On a machine missing codex/opencode → `requireHarness` throws (proven by the AR1 helper). |
| Matrix/coverage | honest-harness-guard coverage check: each `*-real` file declares all four lanes. attestation `agenticExecutedByHarness` > 0 for builtin/claude/codex/opencode across the converted set. |
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
- `packages/server/src/tools/__tests__/AK4-assistant-draft-registry.test.ts` (gains demoted assertions; existing ones unchanged)
- The kept service-integration assertions in R1 (AC6/AC7 credential, cost-cap-422, concurrency-429, back-compat) and AD2 (AC3 cost cap, AC4 concurrency, AC6 queue endpoint, idempotency, sweep-race) — their assertion bodies move file but keep their `expect(...)`.

## sharedFiles (concurrent-WP overlap)

- `packages/server/src/harness/__tests__/provision-real-session.ts` — **also touched by AR3/AR5/AR6** (they consume `SUPPORTED_HARNESS_LANES`/`runThroughHarness`). AR4 **adds** `runAssistantTurnThroughHarness`. Coordinate: additive export, low conflict, but schedule AR4's edit to this file aware of AR3.
- `scripts/lib/honest-harness-predicate.ts` (`EXPLICIT_HARNESS_INTEGRATION`) — **AR3/AR5/AR6 may also add entries.** Append-only list; `merge=union`-safe in spirit but JSON array → real conflict risk. Schedule serially or expect a merge fixup.
- `scripts/honest-harness-guard.ts` (`SCAN_DIRS`) — AR4 adds `routes/__tests__`. Low overlap.
- `scripts/coverage-debt.allowlist.json` — AR3/AR5/AR6 shrink it; AR4 ideally no-ops. JSON array conflict risk.
- `packages/fabric/src/services/task-dispatcher.ts` — AR4 adds optional dep. **AR3's `af7-dispatch-wiring` may touch the same file** — coordinate.

## Migrations

No symbol rename in production. **Test-file renames** (delete-then-create the `*-real` sibling + demoted unit):
- `AH3-assistant-turn.integration.test.ts` → split: `…-real.integration.test.ts` + `AH3-assistant-turn.test.ts` (units) + kept service-integration.
- `AK4-assistant-draft.integration.test.ts` → `…-real.integration.test.ts` + fold into existing registry unit.
- `AH6-lane-gates-broken-turn.integration.test.ts` → `…-real.integration.test.ts` + verdict unit.
- `assistant-turn-per-agent-seam.integration.test.ts` → `assistant-turn-per-agent-seam.test.ts` (full demotion).
- `R1-wire-agent-execution.integration.test.ts` → `…-real.integration.test.ts` + kept error-path service-integration.
- `AD2-task-dispatcher.integration.test.ts` → `…-real.integration.test.ts` + kept queue/sweep service-integration.
No source call-sites reference these test files; only `EXPLICIT_HARNESS_INTEGRATION`/`coverage-debt`/`honest-harness-guard.allowlist` reference paths — update those in lockstep.

---

## Risks / open questions

1. **One production touch (dispatcher capture seam).** Adding `onBeforeTeardown` to `TaskDispatcherDeps` is the only non-test change. Additive-optional, preserves the dispatch API, mirrors AR2's own `ProvisionSessionDeps` seam. **Reviewer: confirm acceptable, or fall to Design-it-twice §C Option 2 (DB-outcome-only observation, zero production touch).**
2. **Assistant-turn ≠ provisionSession (Q2).** The new `runAssistantTurnThroughHarness` is a second lane runner. Risk: reviewer reads "reuse AR2 seam, no bespoke rigs" as "must use `runThroughHarness`." Counter: `runAssistantTurnThroughHarness` reuses the lane table's adapter construction — it is not a bespoke rig, it is the honest vehicle for a genuinely different production path. Flag prominently.
3. **CLI lanes don't fire the MCP return tool on file tasks (AR2 W-2).** codex/opencode → `not_returned`, cost=0. The assistant-turn path's success channel is a **`messages` reply row**, not a sandbox file — CLI harnesses must be prompted to write a reply via `send_message` (the MCP return tool the bridge exposes). **Open: does the assistant-turn MCP bridge expose `send_message` to a dispatched CLI agent the same way the AR2 provisionSession bridge does?** Builder must verify the assistant-turn path's tool exposure; if CLI lanes cannot persist a reply, the honest floor for those lanes is the same non-crash-outcome posture AR2 settled on, and the reply-row assertion becomes best-effort (builtin/claude reliable). Likely the hardest part of the build.
4. **Tool-call nondeterminism (AK4 AC2 real bet draft).** A real agent may not call `create_bet`. Honest floor: draft-bet-row OR non-empty reply; deterministic handler logic lives in the unit. Mirror AR2 best-effort posture.
5. **Runtime cost.** Up to 5 converted files × 4 lanes × ~real-LLM latency, 240s ceilings. Integration config runs real-LLM serially (AR1). Expect a multi-minute suite; acceptable (local-only, attestation-carried). Reuse AR2's serial-lane wiring.
6. **AD2 file size (1351 lines).** Splitting cleanly without dropping a kept assertion is fiddly. The split must be mechanical: real-flow blocks → `-real` file; everything else stays. protectedTests guards against silent assertion loss.
7. **Cost over-counting (AR3 territory).** If an AR4 real multi-step turn trips the `recordCostAndCheck` over-count, **do not fix here** — it is AR3's AC. Flag in retro; AR4 honest floor for builtin uses `totalCostCents > 0` (single-step, not multi-step sum), so it should not depend on the delta bug. If a multi-step assistant turn over-counts, assert only `> 0`, not an exact sum.

---

## What AR4 does NOT do
- Touch AR3 (provisioning/cost/`recordCostAndCheck`), AR5 (decomposition), AR6 (MCP bridge/enforcement) files.
- Add a CI test job (all local, attestation-carried).
- Change the dispatch API beyond the additive optional `onBeforeTeardown`.
- Weaken attestation, the guard, or any allowlist beyond the additive `EXPLICIT_HARNESS_INTEGRATION`/`SCAN_DIRS` wiring.
