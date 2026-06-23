# AL6 — Architecture: Harness review-return hooks (v3-r2 — sandbox-file forcing carrier)

**Status:** v3-r2 plan. Supersedes v3-r1 (which named `config.messages` as the carrier — falsified by reading the adapters). Reconciled against shipped v2 on branch `feat/AL6-review-return-hooks`. **Every carrier claim below cites the file:line where the running model reads it.**

**The one change v3 makes:** relocate the **primary forcing mechanism** from inside the harness (a native turn-end hook only Claude exposes) to the **provisioning layer** as a **re-prompt loop**. **The carrier — corrected in v3-r2 — is the sandbox instruction file (`AGENTS.md`/`CLAUDE.md`) the provisioner already writes via `writeSandboxAgentsMd`**, the one surface every adapter reads on every `startSession` (`cwd: config.sandboxPath`). Native hooks (SDK `Stop`, builtin loop) survive as an in-turn fast-path optimization (`hasNativeReturnHook`). Result: cli/remote/isolated — reject-only in v2 — are actively forced in v3 through a carrier they provably read.

---

## 0. Carrier verification (read before anything — this is what v3-r1 got wrong)

| Adapter | `startSession` instruction surface (file:line, read) | `config.messages` read? | v3-r2 carrier |
|---|---|---|---|
| **cli** | `cli-harness-adapter.ts:184-211`: resolves fixed 5-var templates `{{sandbox}}{{model}}{{apiKey}}{{baseUrl}}{{mcpUrl}}` (`:35`,`:128-134`), spawns `cwd: config.sandboxPath` (`:209`). No prompt/messages arg. | **No** | Rewrite sandbox `AGENTS.md`/`CLAUDE.md`; re-spawn reads `cwd`. |
| **SDK** | `claude-agent-sdk-adapter.ts:217` `cwd: config.sandboxPath`; `:237` constant kickoff `"Begin working…"`; context auto-discovered from `CLAUDE.md` (`@lore X1`, `:231-235`). | **No** | Layer A Stop hook `:198-213` (primary); sandbox rewrite + new `startSession` (backstop). |
| **isolated** | `isolated-harness-adapter.ts:128` `child.send({type:"start",config})` → worker `isolated-session-worker.ts:49-51` forks `new ClaudeAgentSdkAdapter()` + `startSession(config)` reading `CLAUDE.md` from `config.sandboxPath`. | **No** | Rewrite sandbox file; second isolated `startSession`. Inner Stop hook = bonus. |
| **remote** | `remote-harness-adapter.ts:104-113` `ws.send({type:"dispatch",sessionId,config})` — whole config to an out-of-tree worker. | sent on wire; no in-tree proof worker reads it | Rewrite sandbox + re-dispatch; reaches model iff worker shares sandbox/re-runs provisioning (HyperIdle's does). §3.6 degradation. |
| **builtin** | in-proc loop; chat path reads `config.messages` (`@lore AH3 H3`); task path = planning loop (no `messages`). | **Yes (chat only)** | Layer A loop re-inject (`builtin-harness-adapter.ts`, v2 kept). |

**The carrier itself:** `writeSandboxAgentsMd(sandboxPath, assembledPrompt)` — `packages/fabric/src/context-assembly-prompt.ts:277-280` — `fs.writeFileSync` of BOTH `AGENTS.md` and `CLAUDE.md`; its doc (`:286-308`) states this is the canonical "same bytes reach the model regardless of which harness" surface. Idempotent → safe to re-write per re-engage. **grep-confirmed:** `config.messages` is read only by `builtin-harness-adapter.ts` (+ `llm-cassette.ts` test helper) — never by cli/isolated/remote/SDK.

---

## Required reading (builder, before any code)

- `plans/AL6/concept.md` (v3-r2) — nouns, the re-prompt loop, §0 carrier table, `hasNativeReturnHook`/`canReEngage`, no-genuine-floor finding.
- `.pipeline/work-packages/TRACK-AL.md` §AL6 lines 206–244 — ACs (esp. AC4) + constraints.
- `packages/fabric/src/context-assembly-prompt.ts:277-280` — `writeSandboxAgentsMd` (the carrier).
- `packages/server/src/services/session-provisioning.ts` — Phase 8.5 (`:651` sandbox write), Phase 9 (`:709-728` start), Phase 10 (`:760-897` drain), Phase 11 (`:899-1003` teardown). The drain + teardown become the re-prompt loop.
- `packages/server/src/harness/return-gate.ts` — `ReturnGate`, `evaluateReturn`.
- `packages/shared/src/harness/return-actions.ts` — closed set, forcing message, `AL6_MAX_FORCE_RETURNS`, `shouldForceReturn`.
- `packages/shared/src/harness/harness-adapter.ts` — `HarnessAdapter`, `HarnessCapabilities`, `SessionConfig`.
- Five adapters + `isolated-session-worker.ts` (carrier traced, §0).
- `packages/eval/src/{provision-harness.ts,scenarios/force-return.ts,types.ts}` — eval; v3 adds the external path.
- `packages/server/src/services/session-lifecycle.ts` `endSession` (`terminalOutcome` param, kept).

---

## Plan reconciliation (spec ⇆ shipped v2 reality)

| Spec/concept assumption | Reality in v2 code | v3-r2 handling |
|---|---|---|
| Forcing universal across harnesses (AC4) | `canForceReturn:true` only sdk+builtin; cli/remote/isolated `false` ⇒ never re-prompted | **CHANGE.** Provisioning re-prompt loop forces all via sandbox-file rewrite; rename `canForceReturn`→`hasNativeReturnHook`. |
| Closed return set | `RETURN_ACTION_NAMES` in shared | **KEEP** verbatim. |
| Detection observer | `return-gate.ts` | **KEEP**; extend gate lifetime across the loop. |
| `not_returned` outcome persisted | `SessionOutcome` has it; `endSession(...,terminalOutcome)` writes row+event | **KEEP**; reached only after budget spent. |
| SDK Stop hook | `claude-agent-sdk-adapter.ts:198-213` | **KEEP** as Layer-A fast-path. |
| Builtin loop re-inject | `builtin-harness-adapter.ts` runLoop | **KEEP** as Layer-A fast-path. |
| Tier-2 "reject immediately" on non-force harness | provisioning settles `not_returned` straight away | **CHANGE** → re-prompt loop, reject only after budget. |
| **Forcing carrier = `config.messages`** (v3-r1) | **no external adapter reads `config.messages`** (grep-confirmed) | **REPLACE.** Carrier = **sandbox-file rewrite** (`writeSandboxAgentsMd`), the surface every adapter reads (§0). |
| Force-count | `builtin.getSessionForceCount` (`:369`, builtin-only; counts in-turn re-injects) | **CHANGE.** Define ONE turn-level `forceReturnCount` on `ProvisionSessionResult` that sums loop re-engages **and** native-hook injections (§2.4). |
| Eval proves forcing | `provision-harness.ts:70-77` registers **builtin only**; reads `getSessionForceCount` | **CHANGE.** Add external-shaped harness-kind path; force-count from the result (§5). |
| `continueSession` adapter method | does not exist | **ADD** optional `continueSession?` (Mode 2, SDK-only optimization). |

---

## 1. Type & contract changes (SHARED — `packages/shared/src/harness/harness-adapter.ts`)

### 1.1 `HarnessCapabilities` — rename + add

```ts
export interface HarnessCapabilities {
  // … existing fields unchanged …

  /**
   * AL6 v3: TRUE iff this adapter has a native in-turn fast-path that catches a
   * stop BEFORE the session ends and re-injects the forcing message without a new
   * startSession (SDK Stop hook; builtin loop). OPTIMIZATION HINT ONLY — does NOT
   * gate whether forcing happens. Forcing is universal via the provisioning
   * re-prompt loop (sandbox-file rewrite). Replaces v2's `canForceReturn`.
   */
  readonly hasNativeReturnHook: boolean;

  /**
   * AL6 v3: TRUE iff this adapter can run a second turn with augmented context
   * (sandbox-file rewrite re-engage, or Mode-2 continueSession). The re-prompt
   * loop only re-engages adapters where this is true; a `false` adapter is a
   * genuine reject-only floor. ALL in-tree adapters: true (static guarantee, §9).
   */
  readonly canReEngage: boolean;
}
```
**Migration:** 5 in-tree adapters + `mock-harness-adapter` (+ test stubs) return `canForceReturn` today. Rename to `hasNativeReturnHook` (same value: `true` sdk/builtin, `false` cli/remote/isolated) and add `canReEngage: true` to all. `npm run check` enforces completeness (non-optional fields). Call sites reading `canForceReturn`: (a) the five adapters, (b) provisioning's reject branch (deleted, T7), (c) tests (§9 + W3).

### 1.2 `HarnessAdapter` — optional `continueSession` (Mode 2, SDK-only optimization)

```ts
export interface HarnessAdapter {
  startSession(config: SessionConfig): Promise<SessionHandle>;
  streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent>;
  stopSession(handle: SessionHandle): Promise<SessionResult>;
  getCapabilities(): HarnessCapabilities;

  /** AL6 v3 (Mode 2 — optional): re-engage a LIVE in-process handle (SDK's open
   *  query) with a follow-up message. Mode-1 (sandbox-rewrite + new startSession)
   *  adapters DO NOT implement this; the provisioner falls back to Mode-1. */
  continueSession?(handle: SessionHandle, message: string): Promise<SessionHandle>;
}
```
Optional ⇒ zero breakage for the four Mode-1 adapters. Only `ClaudeAgentSdkAdapter` is a candidate, and its Stop hook already forces in-turn, so `continueSession` is a pure optimization. ⚠️ UNVERIFIED: live-`query` follow-up injection (`Options.resume`/input streaming, `sdk.d.ts`). **If infeasible, omit it entirely** — the SDK uses the sandbox-rewrite Mode-1 backstop and the Stop hook handles forcing in-turn anyway. Not on AC4's critical path.

### 1.3 `SessionConfig` — no shape change; carrier is the sandbox file, NOT `messages`

No new field. v3-r2 does NOT use `config.messages` as the external carrier (no external adapter reads it). The carrier is `writeSandboxAgentsMd(config.sandboxPath, …)` re-invoked before each re-engage. `config.messages` stays exactly as today (builtin-chat path only).

### 1.4 `SessionOutcome` (SHARED — `events.ts`) — unchanged

`"completed" | "crashed" | "stopped" | "not_returned"` — kept.

---

## 2. The re-prompt loop — `runSession` (`session-provisioning.ts`)

The v2 single drain (`:760-897`) + teardown verdict (`:951-1002`) become a **bounded re-prompt loop** around the existing drain. The drain body (cost/token/tool-call) is unchanged; it is wrapped.

### 2.1 Shape (pseudocode — builder implements against real Phase 8–11)

```
const returnGate = createReturnGate();        // one gate for the whole turn-span
let loopForceCount = 0;                        // count of Layer-B re-engages
const adapterId = selectedAdapter.id;          // §2.3: slot held across the loop
acquire/hold the adapter slot ONCE (do NOT release per run);
let assembledForcing = assembledPrompt;        // base prompt; forcing appended on re-engage

let firstRun = true;
while (true) {
  // Phase 9 start (unchanged config EXCEPT the sandbox file was (re)written below)
  harnessHandle = await harness.startSession({ ...startConfig });
  if (firstRun) { sessionRunRegistry.register(...); onHarnessStarted?.(); firstRun = false; }
  else          { sessionRunRegistry.updateHandle(sessionId, harnessHandle); }  // re-arm abort for the new run

  // ── existing Phase 10 drain, unchanged, observing the SAME returnGate ──
  for await (event of harness.streamEvents(harnessHandle)) {
     returnGate.observe(event);
     … cost / token / tool_call / abort / budget handling (verbatim from v2) …
  }
  await harness.stopSession(harnessHandle);     // DO NOT release the pool slot here

  endReason = crashed ? "crashed" : budgetExhausted ? "budget_exhausted" : aborted ? "stopped" : "completed";

  if (endReason !== "completed") break;                 // crash/abort/budget → exempt
  if (returnGate.returned) break;                       // returned somewhere in the span
  if (loopForceCount >= AL6_MAX_FORCE_RETURNS) break;   // budget spent → not_returned
  if (!harness.getCapabilities().canReEngage) break;    // genuine floor → not_returned (none in-tree)

  loopForceCount++;
  assembledForcing = `${assembledForcing}\n\n${AL6_FORCE_RETURN_MESSAGE}`;
  writeSandboxAgentsMd(sandboxPath, assembledForcing);  // ← THE CARRIER: rewrite AGENTS.md/CLAUDE.md
  // (Mode-2: if harness.continueSession exists, drive it instead of startSession — SDK optimization)
}

adapterPool.release(adapterId);                          // §2.3: release ONCE, post-loop
sessionRunRegistry.deregister(sessionId);                // §2.3: deregister ONCE, post-loop
// teardown verdict (unchanged): evaluateReturn(returnGate, endReason) → forceReturnCount surfaced (§2.4)
```

### 2.2 Verdict at teardown (unchanged logic, now reads the spanned gate)

`evaluateReturn(returnGate, endReason)` → `"returned" | "not_returned"`. On `not_returned`: emit `session_not_returned`, `endSession(..., terminalOutcome="not_returned")`, return `outcome:"not_returned"`. On `"returned"`: default `completed`. Identical to v2 `:918-1002` — only now after the loop, so `not_returned` means "budget spent", not "first run had no return".

### 2.3 Loop invariants — MANDATED shapes (W1/W2)

These are **required**, not ⚠️-fallbacks:

- **Hold the adapter-pool slot across the WHOLE loop; release exactly once, post-loop.** v2 releases per run at `:888/:894`. `AdapterPool.release(id)` (`adapter-pool.ts:254-260`) just decrements `currentLoad`; releasing inside the loop re-opens a concurrency slot mid-span and lets another session grab it between re-engages. **Acquire once, release once after the loop** (also on every exempt/crash break path). The v2 `release` calls at `:732`(start-fail), `:888`(crash), `:894`(normal) collapse to a single post-loop release with a try/finally guard so an early break still releases.
- **`onHarnessStarted?.()` fires exactly once** (first run only) — the detached HTTP-202 caller must not be re-signalled per re-engage. Guard with the `firstRun` flag.
- **`sessionRunRegistry` registered once; handle re-armed per run; deregistered once post-loop.** A PATCH/handoff abort during run #2 must still cooperatively abort, so the registry's live `handle` is updated to the new run each iteration (`updateHandle` — a thin setter; if absent, deregister+re-register is acceptable but re-register must NOT re-fire `onHarnessStarted`). `aborted` checked each inner-drain iteration; an abort ends the loop (exempt `stopped`).
- **No double `session_ended` / cost double-count.** `session_ended` is emitted exactly once, at teardown after the loop (the v2 `endSession` call), never per run. `stopSession` per run returns a `SessionResult` whose cost is **already counted via the per-event `cost_update` stream** inside the drain — the loop must NOT also add `SessionResult.cost`, exactly as v2 doesn't (v2 ignores `stopSession`'s returned cost; the running `totalCostCents` comes from the event stream `:791-829`). This holds across N runs because each run's `cost_update` events accumulate into the same `totalCostCents`. One span = one `session_ended`, one summed cost.
- **MCP bridge / sandbox created once** (Phase 6/8b, before the loop); reused across runs; torn down once post-loop. Re-engagement does NOT re-provision sandbox or bridge — only rewrites the AGENTS.md/CLAUDE.md file inside the existing sandbox.

### 2.4 ONE unified force counter (CRITICAL-3)

v2's `forceReturnCount` lived only in the builtin adapter (`getSessionForceCount`, `:369`) and counted **in-turn Layer-A re-injects**; the provisioning loop counter would be a separate number that stays 0 for builtin. **Reconcile into one turn-level number** surfaced on the result:

```ts
// ProvisionSessionResult gains:
readonly forceReturnCount: number;   // = loopForceCount + nativeHookForceCount
```
- `loopForceCount` = the §2.1 loop's Layer-B re-engage count (non-zero for cli/isolated/remote; 0 for builtin/SDK when Layer A resolves first).
- `nativeHookForceCount` = the adapter's in-turn injection count, read from a **capability-gated optional accessor**. Generalize v2's builtin-only `getSessionForceCount` into an optional interface method `getForceReturnCount?(sessionId: string): number` implemented by builtin (existing `forceCount`) and SDK (`al6.stopHookCount`, `claude-agent-sdk-adapter.ts:186,204`). The provisioner reads it after the loop if present, else 0.
- **Combine:** `forceReturnCount = loopForceCount + (harness.getForceReturnCount?.(handleId) ?? 0)`.

This single number means: the kept **builtin** eval judge still sees its Layer-A injections (via `getForceReturnCount`), AND the new **external** eval judge sees the Layer-B loop re-engages (via `loopForceCount`) — neither silently regresses. The builtin path's number is unchanged from v2 (loopForceCount stays 0 there because Layer A returns in-turn).

---

## 3. Re-engagement mechanism per adapter (the core feasibility design)

`rewriteSandboxForcing(sandboxPath, assembledForcing)` = re-call `writeSandboxAgentsMd` with the forcing message appended (Mode 1). Optionally `continueSession` (Mode 2, SDK). The loop calls `startSession(config)` after the rewrite, or `continueSession(handle,msg)` where present, then drains identically.

### 3.1 Per-adapter coverage table (ALL 5 — carrier cited file:line)

| Adapter | `hasNativeReturnHook` | `canReEngage` | Re-engage mode | Carrier the MODEL reads (file:line) | Floor? |
|---|---|---|---|---|---|
| **builtin** | `true` | `true` | Layer A in-turn | loop re-injects `AL6_FORCE_RETURN_MESSAGE` in-process (`builtin-harness-adapter.ts` runLoop, v2 kept). Layer B never reached (gate returns in-turn). | No |
| **SDK** | `true` | `true` | Layer A (`Stop` hook); Mode-2/Mode-1 backstop | Stop hook `decision:block+reason` re-injected into the live `query` (`claude-agent-sdk-adapter.ts:198-213`). Backstop: rewrite `CLAUDE.md` (`writeSandboxAgentsMd`) read from `cwd:config.sandboxPath` (`:217`) on a new `startSession`. | No |
| **cli** | `false` | `true` | **Mode 1 (sandbox rewrite)** | `writeSandboxAgentsMd(sandboxPath,…)` rewrites `AGENTS.md`/`CLAUDE.md`; the re-spawned subprocess reads them from `cwd: config.sandboxPath` (`cli-harness-adapter.ts:209`). **No prompt/messages arg exists** (`:184-194`) — the sandbox file is the only channel. **v2 gap closed via a verified carrier.** | No |
| **isolated** | `false` | `true` | **Mode 1 (sandbox rewrite)** | rewrite sandbox file; second isolated `startSession` → worker forks `new ClaudeAgentSdkAdapter()` (`isolated-session-worker.ts:49-51`) reading `CLAUDE.md` from `config.sandboxPath`. Inner Stop hook also fires (bonus). | No |
| **remote** | `false` | `true`* | **Mode 1 (sandbox rewrite + re-dispatch)** | rewrite sandbox file; re-dispatch `config` (`remote-harness-adapter.ts:104-113`). Reaches model iff the worker shares the sandbox FS or re-runs provisioning (reads the file). HyperIdle's own worker does. | No* |

\* **remote caveat (the only residual):** a *third-party* worker that neither shares HyperIdle's sandbox FS nor re-runs provisioning never sees the rewritten file — a property of the external worker, not the adapter. `canReEngage` stays `true` (HyperIdle dispatched correctly + rewrote the file); the documented narrow degradation is §3.6. No class-level "remote can't be forced."

### 3.2 Why no adapter is a genuine architectural floor

- **cli:** stateless subprocess re-reads `cwd` sandbox on each spawn → forced via sandbox rewrite. ✓
- **isolated:** forks an SDK adapter reading `cwd` sandbox → forced via sandbox rewrite; inner Stop hook self-forces. ✓
- **remote:** re-dispatch + sandbox rewrite → forced whenever the worker reads the sandbox/re-runs provisioning (HyperIdle's does). ✓
- **sdk/builtin:** Layer A forces in-turn. ✓

**Net:** v2 = 3 reject-only; v3-r2 = **0 architectural floors**, with one documented per-worker degradation for non-conforming third-party remote workers.

### 3.3 `continueSession` for SDK (Mode 2 detail — optional)

`ClaudeAgentSdkAdapter.continueSession(handle, message)`: inject `message` as a follow-up user turn into the live `query`, return the same handle. ⚠️ UNVERIFIED (live-`query` follow-up). If infeasible, omit — the Stop hook (Layer A) already forces in-turn and the sandbox-rewrite Mode-1 restart is the backstop. Correctness unaffected.

### 3.4 Genuine reject floor (documented, narrow)

Only a `canReEngage:false` adapter (none in-tree) or a remote worker that provably can't see the rewritten sandbox reaches `not_returned` without a real re-prompt. For the latter, the re-dispatch + rewrite still happen (HyperIdle did its part); if the worker drops context, the turn settles `not_returned` after budget — surfaced via `session_not_returned`. Logged as `@lore`, not a HyperIdle floor.

---

## 4. Acceptance criteria → verification

| AC | Criterion | Verification method |
|---|---|---|
| **AC1** | Every turn ends with a return; one that would end without is not accepted complete | **Integration test** (`AL6-reprompt-loop.integration.test.ts`): mock adapter, `hasNativeReturnHook:false, canReEngage:true`, run-1 emits no return + run-2 emits `submit_review` (the mock keyed off the sandbox file content so the SECOND run only returns when the file was rewritten — proving the carrier). Assert `forceReturnCount===1`, `outcome==="completed"`, `returnVerdict==="returned"`. A never-returning mock ⇒ `not_returned` after `AL6_MAX_FORCE_RETURNS`. |
| **AC2** | Closed return set enumerated | **Unit test** (kept): `AL6-return-actions.closure.test.ts` — every `RETURN_ACTION_NAMES` member maps to a registered tool; `as const` finite union. |
| **AC3** | Attempt to end without return detected; never silently complete | **Integration test**: no-return mock ⇒ `session_not_returned` emitted AND row `outcome="not_returned"` AND `forceReturnCount===AL6_MAX_FORCE_RETURNS` (re-prompt actually fired). |
| **AC4** | **Enforcement holds uniformly regardless of harness** (the v3 teeth) | (a) **Parametrized integration test** (`AL6-uniform-forcing.integration.test.ts`): the no-return-then-return scenario through a **sandbox-carrier mock** (`hasNativeReturnHook:false`) whose run-2 return is GATED on observing the rewritten sandbox file, AND a **Layer-A mock** (`hasNativeReturnHook:true`). BOTH reach `forceReturnCount>=1`; NEITHER settles `completed` with `returnVerdict:"not_returned"`. (b) **Static guard** (§9): no in-tree adapter returns `canReEngage:false` — type-level + a compile assertion, not a runtime test. (c) **Live eval (§5)** on an external-shaped real-model harness. |
| **AC5** | Mid-turn non-terminal tool use unaffected | **Integration test** (kept): a run emitting `write_memory`+`read_inbox` then `submit_review` ⇒ no force, `completed`, gate never blocked a mid-turn tool. |

**AC4 is the rejected-twice criterion — its verification is the design's center of gravity.** The sandbox-carrier mock must prove the return happens **only because the sandbox file was rewritten** (not because the mock unconditionally returns on run-2) — otherwise the test would pass with a no-op carrier, repeating v3-r1's hole at the test layer.

---

## 5. Live eval (DoD) — external re-prompt path (CRITICAL-2)

**Goal:** prove the Layer-B re-prompt loop forces a real model through the SAME `runSession` code path the real cli/isolated harness uses — never the builtin Layer-A shortcut.

### 5.1 The plumbing gap, stated honestly

`provision-harness.ts:70-77` registers **only `BuiltinHarnessAdapter`**; force-count comes from builtin-only `getSessionForceCount` (`:120`). There is **no external adapter registration** — so a `fr-forced-return-cli` scenario cannot run as-written. Two facts drive the design:
1. The real `claude` CLI binary + auth may be **absent** in the eval env (the DoD must remain runnable). The cost/AF10 tests that use the local `claude` CLI already skip-with-message when absent.
2. The eval must NOT prove forcing on the builtin (Layer-A) fast-path — that was v2's hole.

### 5.2 Design — external-SHAPED real-model adapter through the real loop

Add a `harnessKind: "builtin" | "external"` param to `runEvalSession` (`provision-harness.ts`). For `"external"`, register an adapter with `hasNativeReturnHook:false, canReEngage:true` whose **only context channel is the sandbox file** — i.e. it `startSession`s a process/agent that reads `cwd` and has NO in-turn hook. Two concrete choices, picked at runtime:
- **If the `claude` CLI binary is present:** register a real `CliHarnessAdapter` configured to invoke it (ndjson, same path AF10 cost tests use) over the seeded sandbox. This is the true external CLI.
- **Else (binary absent):** register a minimal **external-shaped real-model adapter** that drives a real model call (via the same model gateway the eval already uses) seeded SOLELY from the sandbox `AGENTS.md`/`CLAUDE.md` it reads from `cwd` — no Layer-A hook, no builtin loop. A return only happens if the provisioning loop rewrote the sandbox and re-spawned.

Both run through the **same `runSession` re-prompt loop**; the loop re-engages via Mode-1 sandbox rewrite. The eval asserts the LOOP forced through the external path, not a builtin shortcut. (The external-shaped adapter is an eval fixture, not a new in-tree production adapter — it exists to exercise the real provisioning loop with a real model where the CLI binary can't be assumed.)

### 5.3 Force-count source

The eval reads `forceReturnCount` from **`ProvisionSessionResult.forceReturnCount`** (turn-level, §2.4) — the unified counter, NOT `builtin.getSessionForceCount`. For the external path this equals `loopForceCount` (Layer B); for the kept builtin path it equals the native-hook count (Layer A) — both via the one field. `provision-harness.ts` maps `result.forceReturnCount` → `TriggerResult.forceReturnCount`.

### 5.4 Scenario (`packages/eval/src/scenarios/force-return.ts`)

Add `fr-forced-return-external` (mirrors `fr-forced-return-builder` but `harnessKind:"external"`). Judges (kept, now harness-agnostic via turn-level count):
- `force_return_injected`: `forceReturnCount >= 1` — proves the external agent was re-prompted **through the loop** (AC4 live teeth).
- `return_eventually_called_or_not_returned`: `outcome ∈ {completed, not_returned}`, never silent-complete.
- `not_silently_completed`: never `completed` with `returnVerdict:"not_returned"`.

Run locally only (`cd packages/eval && node dist/cli.js --feature force_return`). Evals are not tests (never CI). ⚠️ Skip-with-message when neither the `claude` CLI nor model creds are present — the external-shaped path still needs a real model.

### 5.5 Builtin scenario kept

`fr-forced-return-builder` + `fr-compliant-return-builder` stay (Layer-A proof, now reading the unified `forceReturnCount`). v3 adds the external scenario for the Layer-B proof — the eval covers both layers.

---

## 6. Ordered task list

| # | Task | Files | Proven by | Depends |
|---|---|---|---|---|
| **T1** | Rename `canForceReturn`→`hasNativeReturnHook` + add `canReEngage` to `HarnessCapabilities` | `packages/shared/src/harness/harness-adapter.ts` | `npm run check` | — |
| **T2** | Add optional `getForceReturnCount?(sessionId)` to `HarnessAdapter` (§2.4) + optional `continueSession?` (§1.2) | `harness-adapter.ts` | `npm run check` | T1 |
| **T3** | Update all 5 in-tree `getCapabilities()` + `mock-harness-adapter`: `hasNativeReturnHook` (sdk/builtin true; cli/remote/isolated false); `canReEngage:true` everywhere | 5 adapters, `mock-harness-adapter.ts` | `npm run check`; T8 static guard | T1 |
| **T4** | SDK: implement `getForceReturnCount` (`al6.stopHookCount`); builtin: rename `getSessionForceCount`→`getForceReturnCount` (interface method); optional SDK `continueSession` or documented omission | `claude-agent-sdk-adapter.ts`, `builtin-harness-adapter.ts` | unit tests on the accessors | T2 |
| **T5** | `rewriteSandboxForcing` helper = `writeSandboxAgentsMd(sandboxPath, prompt + "\n\n" + AL6_FORCE_RETURN_MESSAGE)` | new `packages/server/src/harness/re-engage.ts` | unit test: writes the appended file | T1 |
| **T6** | Convert `runSession` Phase 8–11 drain into the bounded re-prompt loop (§2): sandbox-rewrite carrier; **hold slot across loop, release once**; register-once/handle-re-arm/deregister-once; one `session_ended`; surface unified `forceReturnCount` on `ProvisionSessionResult` (§2.4) | `session-provisioning.ts` | T-AC1/AC3/AC4 integration tests | T3,T4,T5 |
| **T7** | Delete v2's "Tier-2 reject immediately" branch (the `canForceReturn` provisioning read) + collapse the three `adapterPool.release` calls to one post-loop release | `session-provisioning.ts` | grep: no `canForceReturn` in provisioning; T-AC4 | T6 |
| **T8** | Red tests: `AL6-reprompt-loop.integration.test.ts`, `AL6-uniform-forcing.integration.test.ts` (sandbox-carrier mock whose run-2 return is GATED on the rewritten file + Layer-A mock; static no-`canReEngage:false` guard) | `packages/server/src/harness/__tests__/` | the tests themselves (red→green) | T6 (target) |
| **T9** | **RE-AUTHOR** `AL6-return-gate.test.ts` (W3): delete the rejected `canForceReturn`-table block (`:332-414`) + its Tier-2 semantics; keep the gate detection/exemption/AC5 blocks; re-point capability assertions to `hasNativeReturnHook`/`canReEngage` with the new semantics | `AL6-return-gate.test.ts` | `npm run test` | T3 |
| **T10** | Eval external path: `runEvalSession` `harnessKind:"external"` branch (real CLI if present, else external-shaped real-model adapter); force-count from result; `fr-forced-return-external` scenario | `provision-harness.ts`, `force-return.ts`, `types.ts` | local eval run (DoD) | T6 |
| **T11** | Update other kept tests for the rename (`AM2-harness-capability-descriptors.test.ts`, `adapter-pool*.test.ts`, `harness-adapter.test.ts`, etc.) | `__tests__/*` | `npm run test` | T3 |
| **T12** | `@lore`: carrier = sandbox-file rewrite (NOT `config.messages`); slot held across loop; unified force counter; `hasNativeReturnHook`=optimization-not-gate; remote third-party degradation | touched files | `/lore` scan | T6,T10 |

**Red-phase first (builder):** write T8 + AC tests before T6 implementation. The sandbox-carrier mock is the cheapest proof the carrier is real — its run-2 return MUST be gated on reading the rewritten file, so a no-op carrier fails the test.

---

## 7. Design-it-twice — where to put the loop & the carrier

**Loop in `runSession` (chosen) vs separate wrapper.** Wrap the Phase-10 drain in a `while`; one `ReturnGate` spans it. The drain body is entangled with `runSession` locals (`totalCostCents`, `aborted`, `budgetExhausted`, `accumulatedTokens`, `sessionRunRegistry`); extracting a wrapper now means a wide param surface or a shared mutable context — larger refactor than the WP warrants. **Pick A;** revisit a `forceReturnLoop` extraction if a third caller needs it.

**Carrier: sandbox-file rewrite (chosen) vs `config.messages` (rejected, v3-r1's error) vs a new prompt arg per adapter.**
- `config.messages`: **rejected — no external adapter reads it** (§0, grep-confirmed). This was the falsified v3-r1 claim.
- A new `{{prompt}}` CLI template + per-adapter prompt arg: would require editing `CLI_TOOL_CONFIGS` (`adapter-pool.ts:272-301`) AND proving each tool consumes it as a user turn — invasive, per-tool, and the CLI tools (aider/goose/opencode) take only the sandbox dir as an arg, reading instructions from files. Rejected as more surface for no gain.
- **Sandbox-file rewrite (chosen):** the one surface every adapter provably reads (`cwd: config.sandboxPath`), via a function the provisioner already calls (`writeSandboxAgentsMd`). Idempotent, no interface change, no per-adapter special-casing. **This is the only carrier verified to reach all five models.**

**Mode-1 (sandbox rewrite) primary; Mode-2 (`continueSession`) optional optimization.** Mode-1 is the universal floor — nothing beyond the existing interface + the existing file write. Mode-2-as-primary would force every adapter to implement a new method, reintroducing the "only some harnesses support it" gap v3 exists to kill.

---

## 8. Security & abuse cases

- **Unbounded loop:** hard-bounded at `AL6_MAX_FORCE_RETURNS` (=2); an adversarial refuser costs ≤3 runs then `not_returned`. **Addressed.**
- **Cost cap:** `routinePerRunCap`/`factoryCap` checks stay per-event and break the whole loop on breach (`budget_exhausted`, exempt). Slot held across loop ≠ unbounded spend (the cap is the spend bound). **Addressed.**
- **Forcing message as injection vector:** `AL6_FORCE_RETURN_MESSAGE` is a frozen `packages/shared` constant, never agent-authored, appended verbatim to the sandbox file. No injection surface. **Addressed.**
- **Sandbox-file rewrite trust:** the appended content is the constant + the same `assembledPrompt` the provisioner already wrote in Phase 8.5; no new untrusted input, same `sandboxPath` (no traversal — path created once, reused). **Addressed.**
- **Subprocess/SSRF (cli/remote):** re-engage reuses the same spawn (array-form, `@lore X5 W1`) / same WS dispatch — no new outbound surface, same env allowlist. **Addressed.**
- **Secret handling:** re-engage reuses the resolved credential path; no new credential surface. **N/A.**

---

## 9. Migrations & the static `canReEngage` guarantee (W4)

**Rename `canForceReturn` → `hasNativeReturnHook`:** grep `canForceReturn` across `packages/` — 5 adapters, `mock-harness-adapter.ts`, provisioning read (delete, T7), and tests. The shipped grep hits: `cli/isolated/remote/builtin/claude-agent-sdk-adapter.ts`, `mock-harness-adapter.ts`, `harness-adapter.ts` (+ `.d.ts`), and tests `claude-agent-sdk-adapter.test.ts`, `adapter-pool.test.ts`, `X3-adapter-pool-type.test.ts`, `AM2-harness-capability-descriptors.test.ts`, `AL6-return-gate.test.ts` (RE-AUTHORED, T9), `harness-adapter.test.ts`, `mcp-route.integration.test.ts`. Each: rename (same value). `npm run check` + `npm run test` confirm none missed.

**`canReEngage:true` for all in-tree adapters = a STATIC guard, not a runtime test (W4).** `canReEngage` is a boolean that CAN be false (the floor exists by design). The guarantee is narrowly **"all in-tree adapters set it `true`"**, enforced statically: (a) the field is non-optional on `HarnessCapabilities` so `npm run check` fails if any `getCapabilities()` omits it; (b) a `satisfies`-based compile assertion or an `eslint-plugin-design` rule asserts each in-tree adapter's literal `canReEngage` is `true` — caught at lint/check, not at runtime. We do NOT overstate this as "no adapter is reject-only" — a future adapter MAY set `canReEngage:false`; the static guard just makes that a deliberate, reviewed edit rather than a silent regression.

**route-checklist:** N/A (no HTTP routes). The "every harness" enumeration analogue is the AC4 parametrized test (sandbox-carrier mock + Layer-A mock) + the static `canReEngage` guard above.

---

## 10. Risks / ambiguities

1. **⚠️ SDK `continueSession` feasibility** (live-`query` follow-up). Mitigation: omit; Stop hook (Layer A) + sandbox-rewrite Mode-1 backstop. Not on AC4's critical path.
2. **Carrier correctness** is the v3-r2 center: external adapters read the sandbox file, not `config.messages`. The AC4 sandbox-carrier mock GATES its run-2 return on the rewritten file, and the live eval is the ultimate proof. This is the single point v3-r1 got wrong; the tests are designed so a no-op carrier fails.
3. **Remote third-party-worker context-delivery** (§3.4) — a worker that ignores the sandbox/doesn't re-run provisioning degrades to reject. Documented `@lore`, not a HyperIdle floor; HyperIdle's own worker reads the sandbox.
4. **Slot held across the loop** changes concurrency accounting — a re-engaging span holds its slot for ≤3 runs. Acceptable: the cost cap bounds spend; holding the slot prevents a mid-span concurrency race (W1). Builder must release on EVERY break path (try/finally).
5. **Builtin task path never takes Mode-1** — re-engagement there is Layer A only; the loop's sandbox-rewrite branch is dead for builtin-task (the gate returns in-turn). Builder must not "fix" it into a spurious second planning session.
6. **External-shaped eval adapter** is a fixture, not a production adapter — it exists to drive the real loop with a real model when the `claude` CLI binary is absent. Builder must register it through the same `runEvalSession`→`provisionSession`→`runSession` path, not a bespoke loop.

---

## protectedTests

- `packages/server/src/tools/__tests__/AL6-return-actions.closure.test.ts` — closed-set assertion must not weaken.
- `AL6-return-gate.test.ts` is **NOT protected** — it is RE-AUTHORED in T9 (W3): the gate detection/exemption/AC5 blocks are kept, but the `canForceReturn`-table block (`:332-414`) encoding the rejected Tier-2 reject semantics is deleted and replaced with `hasNativeReturnHook`/`canReEngage` assertions under the new semantics.

## sharedFiles

- `packages/shared/src/harness/harness-adapter.ts` (interface + capabilities — AM2 also edits `HarnessCapabilities`).
- `packages/shared/src/harness/return-actions.ts` (constants).
- `packages/shared/src/events.ts` (`SessionOutcome` — unchanged, co-located).
- `packages/fabric/src/context-assembly-prompt.ts` (`writeSandboxAgentsMd` — the carrier; read-only dependency, no edit expected).
- `packages/server/src/services/session-provisioning.ts` (the re-prompt loop — high-traffic file).
- `packages/eval/src/{provision-harness.ts,types.ts}` (eval contract).
</content>
</invoke>
