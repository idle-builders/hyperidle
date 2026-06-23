# AL6 — Architecture: Harness review-return hooks (v3 — provisioning re-prompt loop)

**Status:** v3 plan. Supersedes v2 (`git show 21597540:plans/AL6/architecture.md`). Reconciled against the shipped v2 code on branch `feat/AL6-review-return-hooks` @ `0715161a`.

**The one change v3 makes:** relocate the **primary forcing mechanism** from inside the harness (a native turn-end hook only Claude exposes) to the **provisioning layer** as a **re-prompt loop** built on the four-method `HarnessAdapter` interface every adapter implements. Native hooks (SDK `Stop`, builtin loop) survive as an **in-turn fast-path optimization** (`hasNativeReturnHook`), not as the gate on whether forcing happens. Result: cli/remote/isolated — reject-only in v2 — are actively forced in v3 via re-engagement.

---

## Required reading (builder, before any code)

- `plans/AL6/concept.md` (v3) — the load-bearing nouns, the re-prompt loop, per-adapter re-engagement table, `hasNativeReturnHook`/`canReEngage` semantics, the no-genuine-floor finding.
- `.pipeline/work-packages/TRACK-AL.md` §AL6 lines 206–244 — ACs (esp. AC4) + constraints.
- `packages/server/src/services/session-provisioning.ts` lines 520–1003 — `runSession` Phase 8–11; the drain loop becomes the re-prompt loop.
- `packages/server/src/harness/return-gate.ts` — `ReturnGate`, `evaluateReturn` (gate lifetime extends across the loop).
- `packages/shared/src/harness/return-actions.ts` — closed set, forcing message, `AL6_MAX_FORCE_RETURNS`, `shouldForceReturn`.
- `packages/shared/src/harness/harness-adapter.ts` — `HarnessAdapter`, `HarnessCapabilities`, `SessionConfig` (gains the re-engage seam).
- Five adapters + `isolated-session-worker.ts`.
- `packages/eval/src/{provision-harness.ts,scenarios/force-return.ts,types.ts}` — eval; v3 adds the external path.
- `packages/server/src/services/session-lifecycle.ts` `endSession` (lines 258–310) — `terminalOutcome` param (kept).

---

## Plan reconciliation (spec ⇆ shipped v2 reality)

| Spec/concept assumption | Reality in v2 code | v3 handling |
|---|---|---|
| Forcing universal across harnesses (AC4) | `canForceReturn:true` only on sdk+builtin; cli/remote/isolated `false` ⇒ never re-prompted | **CHANGE.** Provisioning re-prompt loop forces all; rename `canForceReturn`→`hasNativeReturnHook` (optimization only). |
| Closed return set | `RETURN_ACTION_NAMES = {submit_review,handoff_to,send_message}` in shared | **KEEP** verbatim. |
| Detection observer | `return-gate.ts` `createReturnGate`/`evaluateReturn`/`isReturnAction` | **KEEP** core; extend gate lifetime across the loop (one gate per turn-span). |
| `not_returned` outcome persisted to row + bus | `SessionOutcome` has `not_returned`; `endSession(...,terminalOutcome)` writes row+event; `session_not_returned` event emitted | **KEEP**; reached only after re-prompt budget spent. |
| SDK Stop hook | wired in `claude-agent-sdk-adapter.ts` (`hooks.Stop`, `decision:block+reason`) | **KEEP** as Layer-A fast-path. |
| Builtin loop re-inject | `runExecuteTurn`/`runChatTurn` re-inject `AL6_FORCE_RETURN_MESSAGE` | **KEEP** as Layer-A fast-path. |
| Tier-2 "reject immediately" on non-force harness | provisioning settles `not_returned` straight away for cli/remote/isolated | **CHANGE** → re-prompt loop, reject only after budget / `canReEngage:false`. |
| Forcing carrier = `SessionConfig.messages` (AH3) | `messages` exists; **task sessions do NOT pass `messages`** (planning loop) — only assistant/chat path does | **HANDLE.** Mode-1 re-engage must seed forcing where the adapter consumes it; see §3.3 (the carrier-per-path nuance — the real subtlety v3 must get right). |
| Eval proves forcing | `force-return.ts` runs **builtin only** (Tier-1); `forceReturnCount` read from `builtin.getSessionForceCount` (builtin-only method) | **CHANGE.** Add external (cli-shaped) eval path; source force-count from the **provisioner** (turn-level), not the builtin adapter. |
| `continueSession` adapter method | **does not exist** (interface is 4 methods) | **ADD** optional `continueSession?` (Mode 2) for SDK live-`query`; Mode-1 covers the rest. |

**No spec/concept contradiction.** The concept's "no genuine architectural floor" is proven against real adapter code in §3.4–§3.6 below.

---

## 1. Type & contract changes (SHARED — `packages/shared/src/harness/harness-adapter.ts`)

### 1.1 `HarnessCapabilities` — rename + add

```ts
export interface HarnessCapabilities {
  // … existing fields unchanged …

  /**
   * AL6 v3: TRUE iff this adapter has a native in-turn fast-path that catches a
   * stop *before the session ends* and re-injects the forcing message without a
   * new startSession (SDK Stop hook; builtin loop break). OPTIMIZATION HINT ONLY —
   * it does NOT gate whether forcing happens. Forcing is universal via the
   * provisioning re-prompt loop (canReEngage). Replaces v2's misnamed
   * `canForceReturn`, whose "false ⇒ never forced" semantics the founder rejected.
   */
  readonly hasNativeReturnHook: boolean;

  /**
   * AL6 v3: TRUE iff this adapter can run a second turn of the same session with
   * augmented context (Mode-1 startSession-reuse or Mode-2 continueSession). The
   * provisioning re-prompt loop only re-engages adapters where this is true; a
   * `false` adapter is a genuine reject-only floor. ALL in-tree adapters: true.
   * Defaults true at every call site — false must be a deliberate, justified edit.
   */
  readonly canReEngage: boolean;
}
```
**Migration:** every `getCapabilities()` returns `canForceReturn` today (5 in-tree adapters + `mock-harness-adapter` + any test). Rename to `hasNativeReturnHook` (same value: `true` sdk/builtin, `false` cli/remote/isolated) and add `canReEngage: true` to all five in-tree + mock. `npm run check` enforces completeness (interface is non-optional for these two — a missing field fails compile). **Call sites that read `canForceReturn`:** grep finds it in (a) the five adapters' `getCapabilities`, (b) provisioning (v2 read it to branch reject — that branch is replaced), (c) tests. Enumerated in §6 route/symbol checklist.

### 1.2 `HarnessAdapter` — optional `continueSession` (Mode 2)

```ts
export interface HarnessAdapter {
  startSession(config: SessionConfig): Promise<SessionHandle>;
  streamEvents(handle: SessionHandle): AsyncIterable<HarnessEvent>;
  stopSession(handle: SessionHandle): Promise<SessionResult>;
  getCapabilities(): HarnessCapabilities;

  /**
   * AL6 v3 (Mode 2 — optional): re-engage a LIVE in-process session handle with a
   * follow-up message, returning a handle whose streamEvents yields the
   * continuation turn. For adapters that hold live session state (SDK's open
   * `query`) where a fresh startSession would lose context. Adapters that
   * re-engage via Mode-1 (new startSession with augmented config) DO NOT
   * implement this; the provisioner falls back to Mode-1 when it is absent.
   */
  continueSession?(handle: SessionHandle, message: string): Promise<SessionHandle>;
}
```
Optional ⇒ zero breakage for the four adapters that use Mode-1. Only `ClaudeAgentSdkAdapter` implements it in v3 (feeds `message` into the live `query` input stream / re-issues with `resume`). ⚠️ UNVERIFIED: the exact SDK call to inject a follow-up into a live `query` (`query.input` push vs new `query({resume})`) — builder verifies against `sdk.d.ts` (`Options.resume`/`continue` at lines 1565/1783; `query` input streaming). If live-injection proves infeasible, the SDK adapter omits `continueSession` and uses Mode-1 (new `startSession`) like the others — the floor still holds because the SDK's own Stop hook (Layer A) handles forcing in-turn anyway.

### 1.3 `SessionConfig` — no shape change; carrier clarified

`SessionConfig.messages` (AH3) already exists. v3 uses it as the Mode-1 forcing carrier **for adapters whose `startSession` replays `messages`**. No new field. The nuance (§3.3): the builtin *task* path ignores `messages` (planning loop), so builtin re-engagement uses Layer A, not Mode-1; cli/remote/isolated consume `config` fresh per run and are seeded via `messages` (+ prompt threading where the harness reads the prompt, not `messages`).

### 1.4 `SessionOutcome` (SHARED — `events.ts`) — unchanged

`"completed" | "crashed" | "stopped" | "not_returned"` — kept from v2.

---

## 2. The re-prompt loop — `runSession` (`session-provisioning.ts`)

The v2 single drain (lines 760–897) + teardown verdict (951–1002) become a **bounded re-prompt loop** around the existing drain. The drain body (cost/token/tool-call handling) is unchanged; it is wrapped.

### 2.1 Shape (pseudocode — builder implements against the real Phase 8–11)

```
// One gate for the whole turn-span (concept §3.1).
const returnGate = createReturnGate();
let forceCount = 0;
let lastResult: { endReason; totalCostCents; ... };
let forcedConfig = baseStartConfig;          // §3.3 builds this

while (true) {
  harnessHandle = await harness.startSession(forcedConfig);   // run a turn
  register liveHandle in sessionRunRegistry;
  onHarnessStarted?.();                                        // first run only (§2.3)

  // ── existing Phase 10 drain, unchanged, observing the SAME returnGate ──
  for await (event of harness.streamEvents(harnessHandle)) {
     returnGate.observe(event);
     … cost / token / tool_call / abort / budget handling (verbatim from v2) …
  }
  await harness.stopSession(harnessHandle);
  deregister; release adapter slot for this run;

  endReason = crashed ? "crashed" : budgetExhausted ? "budget_exhausted" : aborted ? "stopped" : "completed";

  // exempt end-reasons end the loop immediately (no re-engage on crash/abort/budget).
  if (endReason !== "completed") break;
  if (returnGate.returned) break;                       // returned somewhere in the span
  if (forceCount >= AL6_MAX_FORCE_RETURNS) break;       // budget spent → not_returned
  if (!harness.getCapabilities().canReEngage) break;    // genuine floor → not_returned

  forceCount++;
  forcedConfig = reEngageConfig(forcedConfig, harness, AL6_FORCE_RETURN_MESSAGE);  // §3.3
  // loop: run another turn (Mode-2 continueSession used inside reEngageConfig path where available)
}

// teardown verdict (unchanged from v2): evaluateReturn(returnGate, endReason)
```

### 2.2 Verdict at teardown (unchanged logic, now reads the spanned gate)

`evaluateReturn(returnGate, endReason)` → `"returned" | "not_returned"`. On `not_returned`: emit `session_not_returned`, call `endSession(..., terminalOutcome="not_returned")`, return `outcome:"not_returned"`. On `"returned"`: `endSession(...)` default `completed`. **Identical to v2 lines 918–1002** — only now it runs *after* the loop, so `not_returned` means "budget spent / un-re-engageable", not "first run had no return".

### 2.3 Loop invariants (the things that must not break)

- **`onHarnessStarted?.()` fires exactly once** (first run only) — the detached HTTP-202 caller must not be re-signalled per re-engage. Guard with a `firstRun` flag.
- **Cost accumulates across runs** — `totalCostCents` persists across the loop; each run's cost adds. The per-run cap check (`routinePerRunCap`) stays per-event and breaks the *whole* loop on breach (`budgetExhausted` is an exempt end-reason).
- **`sessionRunRegistry` register/deregister per run** — a PATCH/handoff abort during run #2 must still cooperatively abort. `aborted` is checked each iteration of the inner drain; an abort ends the loop (exempt `stopped`).
- **Adapter pool slot** — `adapterPool.release(adapterId)` per run; re-acquire is implicit because we reuse the same `harness` instance (the pool slot is for concurrency accounting; reusing the resolved adapter is correct since it's the same session-span). ⚠️ builder verifies the pool's release/re-use contract across two `startSession` calls on one adapter instance — if the pool forbids reuse-after-release, hold the slot across the loop and release once at the end.
- **MCP bridge** — created once before the loop; reused across runs (the `.mcp.json` token is stable for the session). Unregister once at teardown.
- **Sandbox** — created once (Phase 6, before `runSession`); reused across runs; destroyed once at teardown. Re-engagement does NOT re-provision the sandbox.

### 2.4 Force-count surfaced at turn level (for eval + result)

`ProvisionSessionResult` gains `readonly forceReturnCount: number` (the loop's `forceCount`). This is the **turn-level** count — works for every adapter, unlike v2's builtin-only `getSessionForceCount`. The eval reads it from the result, not from the adapter (§5).

---

## 3. Re-engagement mechanism per adapter (the core feasibility design)

`reEngageConfig(prevConfig, harness, forcingMessage)` returns the next run's `SessionConfig` (Mode 1) OR drives `continueSession` (Mode 2). One helper, branches on capability + `continueSession` presence.

### 3.1 Decision logic

```
function reEngage(prevConfig, harness, msg):
  if (typeof harness.continueSession === "function")        // Mode 2 (SDK)
     → return { mode: "continue", run: () => harness.continueSession(handle, msg) }
  else                                                       // Mode 1 (cli/remote/isolated/builtin-chat)
     → return { mode: "restart",
                config: { ...prevConfig,
                          messages: [...(prevConfig.messages ?? priorTranscript), { role:"user", content: msg }] } }
```
The loop calls `startSession(config)` for Mode-1 or `continueSession(handle,msg)` for Mode-2, then drains identically.

### 3.2 Per-adapter coverage table (ALL 5 — forced-how, verified against code)

| Adapter | `hasNativeReturnHook` | `canReEngage` | Re-engage mode | Forced how (concretely) | Floor? |
|---|---|---|---|---|---|
| **builtin** (`builtin-harness-adapter.ts`) | `true` | `true` | Layer A (loop re-inject); Mode-1 backstop | **In-turn:** `runExecuteTurn`/`runChatTurn` already re-inject `AL6_FORCE_RETURN_MESSAGE` and continue the loop (v2 code, kept). The agent never reaches `stopSession` un-returned within budget. Provisioning loop is a no-op second layer (gate already returned). | No |
| **SDK** (`claude-agent-sdk-adapter.ts`) | `true` | `true` | Layer A (`Stop` hook); Mode-2 `continueSession` backstop | **In-turn:** Stop hook `decision:block + reason=forcing` (v2 code, kept). If the agent slips the hook budget, provisioner re-engages the live `query` via `continueSession` (or Mode-1 restart if continue infeasible). | No |
| **cli** (`cli-harness-adapter.ts`) | `false` | `true` | **Mode 1** | **v2 GAP CLOSED:** `startSession` spawns a fresh subprocess each call reading `config` (`sandboxPath`, `resolvedModel`, `mcpConnectionInfo`). Provisioner re-spawns with `config.messages` carrying the forcing message **and threads it into the CLI prompt/args** (§3.3). The CLI agent reads the forcing instruction and returns. | No |
| **isolated** (`isolated-harness-adapter.ts`) | `false` | `true` | **Mode 1** | **v2 GAP CLOSED:** `startSession` forks `isolated-session-worker.js` which constructs `new ClaudeAgentSdkAdapter()` + `startSession(config)`. Provisioner starts a **second** isolated session with forcing-augmented `config`; the worker forks a second SDK session. **Bonus:** the inner SDK *also* fires its Stop hook, so an isolated turn is doubly forced. | No |
| **remote** (`remote-harness-adapter.ts`) | `false` | `true`* | **Mode 1** | **v2 GAP CLOSED (with caveat):** `startSession` does `ws.send({type:"dispatch",sessionId,config})`. Provisioner re-dispatches a new session with `config.messages` carrying the forcing message. Forces **iff the remote worker replays `config.messages`** — HyperIdle's own worker honors AH3, so it does. | No* |

\* **remote caveat (the only residual):** a *third-party* remote worker that ignores `config.messages` cannot be re-engaged with context — that's a property of the external worker, not the adapter. `canReEngage` stays `true` for HyperIdle's adapter (it dispatches correctly); a worker that demonstrably can't replay is the documented, narrow degradation in §3.6. **There is no class-level "remote can't be forced."**

### 3.3 The forcing carrier nuance (the real subtlety — must get right)

Three adapter families consume the forcing message via different channels; `reEngageConfig` threads it to the right one:

1. **Adapters that replay `SessionConfig.messages`** (builtin-chat path, any worker honoring AH3): append `{role:"user", content: AL6_FORCE_RETURN_MESSAGE}` to `messages`. The agent sees it as the next user turn.
2. **Adapters that read the prompt/CLAUDE.md, not `messages`** (cli, SDK-direct, isolated-inner-SDK): the agent's instruction surface is the assembled prompt + the `prompt` kickoff string, not `messages`. For these, the re-engage **also appends the forcing message to the kickoff prompt** the adapter passes to its harness (cli: into the `{{...}}`-templated prompt arg / a forcing-suffixed `assembledPrompt`; SDK: the `query({prompt})` kickoff). Builder confirms each adapter's actual instruction channel and threads the message there.
3. **builtin task path** (planning loop, no `messages`): does NOT use Mode-1 at all — Layer A (loop re-inject) handles it in-turn. The provisioning loop's Mode-1 branch is never taken for builtin because the gate already returned by the time `stopSession` resolves.

**Why this matters:** naively stuffing the forcing message only into `messages` would silently fail for cli/SDK/isolated (they ignore `messages` on the task path). The architecture requires the re-engage helper to target each adapter's *actual* instruction channel. This is the single hardest correctness point in v3 — call it out in the red tests (§4 T-ext).

### 3.4 Why no adapter is a genuine architectural floor

- **cli:** stateless subprocess; fresh invocation with augmented context is the natural input. Forced via Mode-1. ✓
- **isolated:** forks a worker running an SDK adapter; a second fork with augmented config re-runs it. Forced via Mode-1; inner SDK self-forces too. ✓
- **remote:** dispatches over WS; a re-dispatch carries the forcing message in `config.messages`. Forced via Mode-1 whenever the worker replays `messages` (HyperIdle's does). ✓
- **sdk/builtin:** Layer A forces in-turn. ✓

**Net:** v2 = 3 reject-only harnesses; v3 = **0 architectural floors**, with one documented per-worker degradation possibility for non-conforming third-party remote workers.

### 3.5 `continueSession` for SDK (Mode 2 detail)

`ClaudeAgentSdkAdapter.continueSession(handle, message)`: looks up the `ActiveSession`, injects `message` as a follow-up user turn into the live `query`, returns the same `handle` (its `streamEvents` is still being drained → the continuation events flow through the existing generator). ⚠️ UNVERIFIED implementation detail (live-`query` follow-up injection) — if infeasible, omit `continueSession` and let the SDK adapter use Mode-1 restart; correctness is unaffected because the Stop hook (Layer A) already forces in-turn and the Mode-1 restart is only a backstop.

### 3.6 Genuine reject floor (documented, narrow)

Only a `canReEngage:false` adapter (none in-tree) or a remote worker that provably ignores `config.messages` reaches `not_returned` without a real re-prompt. For the latter, the re-dispatch still happens (HyperIdle did its part); if the worker drops context, the turn settles `not_returned` after budget — surfaced via `session_not_returned`. This is a third-party-worker limitation, logged as `@lore`, not a HyperIdle design floor.

---

## 4. Acceptance criteria → verification

| AC | Criterion | Verification method |
|---|---|---|
| **AC1** | Every turn ends with a return; a turn that would end without one is not accepted as complete | **Integration test** (`AL6-reprompt-loop.integration.test.ts`): mock adapter whose run-1 emits no return, run-2 emits `submit_review`. Assert `runSession` re-engaged (`forceReturnCount===1`) and `outcome==="completed"`, `returnVerdict==="returned"`. A mock that NEVER returns ⇒ `outcome==="not_returned"` after `AL6_MAX_FORCE_RETURNS` runs. |
| **AC2** | HyperIdle enumerates the closed return set | **Unit test** (kept): `return-actions.closure.test.ts` asserts every `RETURN_ACTION_NAMES` member maps to a real registered tool; set is `as const` finite union. |
| **AC3** | Attempt to end without return is detected; turn does not silently complete (redirected or flagged) | **Integration test**: no-return mock ⇒ `session_not_returned` emitted AND row `outcome="not_returned"` (query the row) AND `forceReturnCount===AL6_MAX_FORCE_RETURNS` (re-prompt actually fired, not just flagged). |
| **AC4** | **Enforcement holds uniformly regardless of harness** (the v3 teeth) | **Parametrized integration test** (`AL6-uniform-forcing.integration.test.ts`): run the no-return-then-return scenario through a **Mode-1 mock adapter** (`hasNativeReturnHook:false, canReEngage:true`) AND a **Layer-A mock** (`hasNativeReturnHook:true`). BOTH must reach `forceReturnCount>=1` and `outcome` ∈ {completed, not_returned} — NEITHER may settle `completed` with `returnVerdict:"not_returned"`. **Plus** a static assertion: no in-tree adapter returns `canReEngage:false` (test imports all five `getCapabilities()`). **Plus the live eval (§5) on a cli-shaped external harness.** |
| **AC5** | Mid-turn non-terminal tool use unaffected | **Integration test** (kept): a run emitting `write_memory`+`read_inbox` then `submit_review` ⇒ no force, `outcome="completed"`, gate observed but never blocked a mid-turn tool. |

**AC4 is the rejected-twice criterion — its verification is the design's center of gravity:** it must prove forcing on a non-Layer-A adapter, both in a fast deterministic test (Mode-1 mock) and in the live eval (cli-shaped, §5).

---

## 5. Live eval (DoD) — external harness path

**Goal:** prove the Layer-B re-prompt loop forces a real agent on a non-builtin, external-shaped harness.

### 5.1 Eval harness change (`packages/eval/src/provision-harness.ts`)

Add `runEvalSessionExternal(deps, params)` (or a `harnessKind: "builtin" | "cli"` param to `runEvalSession`) that registers a **`CliHarnessAdapter`** instead of `BuiltinHarnessAdapter`. Configure it to invoke a real agent CLI (the locally-available `claude` CLI, ndjson format — same path `AF10` cost tests use) over the seeded sandbox, with the forcing-discouraging system prompt. The provisioner drives it through the **same `runSession` re-prompt loop**; the loop re-engages via Mode-1 (`cli` `startSession` re-spawn with forcing-threaded prompt, §3.3).

### 5.2 Force-count source

The eval reads `forceReturnCount` from **`ProvisionSessionResult.forceReturnCount`** (turn-level, §2.4) — NOT `builtin.getSessionForceCount` (v2's builtin-only path). `provision-harness.ts` maps `result.forceReturnCount` → `TriggerResult.forceReturnCount`. This is the change that lets the external path report forcing. `getSessionForceCount` can stay for builtin parity but is no longer the eval's source of truth.

### 5.3 Scenario (`packages/eval/src/scenarios/force-return.ts`)

Add `fr-forced-return-cli` (mirrors `fr-forced-return-builder` but `trigger` uses the external/cli path). Judges (kept from v2, now harness-agnostic since they read turn-level `forceReturnCount` + `returnVerdict`):
- `force_return_injected`: `forceReturnCount >= 1` — **proves the external agent was re-prompted** (the AC4 live teeth).
- `return_eventually_called_or_not_returned`: `outcome ∈ {completed, not_returned}`, never silent-complete.
- `not_silently_completed`: regression guard — never `completed` with `returnVerdict:"not_returned"`.

Run locally only: `cd packages/eval && node dist/cli.js --feature force_return`. Evals are not tests (never CI). ⚠️ Requires the `claude` CLI present locally (skip-with-clear-message if absent, like other live-LLM evals).

### 5.4 Builtin scenario kept

`fr-forced-return-builder` + `fr-compliant-return-builder` stay (Layer-A proof). v3 adds the cli scenario for the Layer-B/external proof — **the eval now covers both forcing layers.**

---

## 6. Ordered task list

| # | Task | Files | Proven by | Depends on |
|---|---|---|---|---|
| **T1** | Rename `canForceReturn`→`hasNativeReturnHook` + add `canReEngage` to `HarnessCapabilities` | `packages/shared/src/harness/harness-adapter.ts` | `npm run check` (interface non-optional) | — |
| **T2** | Update all 5 in-tree `getCapabilities()` + `mock-harness-adapter` (+ any test stub): `hasNativeReturnHook` = (sdk/builtin true, cli/remote/isolated false); `canReEngage: true` everywhere | 5 adapters, `mock-harness-adapter.ts` | `npm run check`; T-AC4 static-cap test | T1 |
| **T3** | Add optional `continueSession?` to `HarnessAdapter` interface | `harness-adapter.ts` | `npm run check` | T1 |
| **T4** | Implement `ClaudeAgentSdkAdapter.continueSession` (Mode 2) — or document omission + Mode-1 fallback | `claude-agent-sdk-adapter.ts` | unit test on the live-query follow-up (or N/A note) | T3 |
| **T5** | `reEngageConfig` helper (Mode-1/Mode-2 dispatch + §3.3 carrier threading) | new `packages/server/src/harness/re-engage.ts` | unit test: builds augmented config targeting correct channel per adapter kind | T1–T4 |
| **T6** | Convert `runSession` Phase 8–11 drain into the bounded re-prompt loop (§2); surface `forceReturnCount` on `ProvisionSessionResult` | `session-provisioning.ts` | T-AC1/AC3/AC4 integration tests | T5 |
| **T7** | Delete v2's "Tier-2 reject immediately" branch (the `canForceReturn` read in provisioning) | `session-provisioning.ts` | grep: no `canForceReturn` remains; T-AC4 | T6 |
| **T8** | Red tests: `AL6-reprompt-loop.integration.test.ts`, `AL6-uniform-forcing.integration.test.ts` (Mode-1 + Layer-A mocks; static no-`canReEngage:false` cap test) | `packages/server/src/harness/__tests__/` | the tests themselves (red→green) | T6 (target) |
| **T9** | Eval external path: `runEvalSession` cli/harnessKind branch; force-count from result; `fr-forced-return-cli` scenario | `provision-harness.ts`, `force-return.ts`, `types.ts` | local eval run (DoD) | T6 |
| **T10** | Update kept v2 unit tests (`AL6-return-gate.test.ts`, closure test, adapter cap tests) for the rename | `__tests__/*` | `npm run test` | T2 |
| **T11** | `@lore` notes: re-prompt loop home, carrier-per-channel nuance (§3.3), remote third-party-worker degradation (§3.6), `hasNativeReturnHook` = optimization-not-gate | touched files | `/lore` scan | T6,T9 |

**Red-phase first (builder):** write T8 + the AC tests before T6 implementation (TDD). T8's Mode-1 mock is the cheapest proof that re-engagement is harness-agnostic — it has NO native hook yet gets forced.

---

## 7. Design-it-twice — where to put the loop

**Option A — loop in `runSession` (chosen).** Wrap the existing Phase-10 drain in a `while` over re-engagements; one `ReturnGate` spans the loop. *Trade-off:* `runSession` grows a loop and a `firstRun`/cost-persistence concern. *Reject reason for the alternative below:* none strong — this keeps all turn-span state (cost, registry, gate) in one scope where it already lives.

**Option B — a separate `forceReturnLoop(harness, config, gate)` wrapper that `runSession` calls.** *Trade-off:* cleaner separation, but it must thread back cost/abort/budget/registry state that currently lives inline in `runSession` — a wide parameter surface or a shared mutable context object. *Reject reason:* the drain body is deeply entangled with `runSession`'s locals (`totalCostCents`, `aborted`, `budgetExhausted`, `accumulatedTokens`, `sessionRunRegistry`); extracting it now is a larger refactor than the WP warrants and raises coupling. **Pick A;** revisit B if a third caller needs the loop.

**Mode-1 vs Mode-2 as the primary re-engage (chosen: Mode-1 primary, Mode-2 optional optimization).** Mode-1 (`startSession`-reuse) is the universal floor — it needs nothing beyond the existing interface, so it is the mechanism that makes AC4 true. Mode-2 (`continueSession`) is a per-adapter optimization for live-state harnesses (SDK). *Reject Mode-2-as-primary:* it would require every adapter to implement a new method, reintroducing the "only some harnesses support it" gap v3 exists to kill.

---

## 8. Security & abuse cases

- **Rate-limit / unbounded loop:** the re-prompt loop is hard-bounded at `AL6_MAX_FORCE_RETURNS` (=2) re-engagements; an adversarial agent that refuses forever costs ≤3 session-runs then settles `not_returned`. No unbounded spend. **Addressed.**
- **Cost cap interaction:** `routinePerRunCap`/`factoryCap` checks stay per-event and break the whole loop on breach (`budget_exhausted`, exempt). A re-engage cannot escape the cap. **Addressed.**
- **Forcing message as injection vector:** `AL6_FORCE_RETURN_MESSAGE` is a frozen constant in `packages/shared`, never agent-authored, never interpolated with agent data. No injection surface. **Addressed.**
- **Input-trust on `config.messages` re-engage:** the appended forcing entry is the constant; prior `messages` are the existing transcript (already trust-bounded by AH3). No new trust boundary. **Addressed.**
- **Subprocess/SSRF (cli/remote):** re-engage reuses the same spawn (array-form, `@lore X5 W1`) / same WS dispatch — no new outbound surface, same sandboxed env allowlist. **Addressed.**
- **Path traversal:** sandbox is created once and reused; no new path input. **N/A.**
- **Secret handling:** re-engage reuses the resolved `apiKey`/credential path; no new credential surface. **N/A.**

---

## 9. Migrations (rename `canForceReturn` → `hasNativeReturnHook`)

Every site referencing `canForceReturn` (grep `canForceReturn` across `packages/`): rename in the 5 adapters' `getCapabilities`, `mock-harness-adapter.ts`, the provisioning read (delete — T7), and tests asserting on it (`AM2-harness-capability-descriptors.test.ts`, `adapter-pool*.test.ts`, any cap test). Each: `rename`. The provisioning `canForceReturn`-based reject branch: `delete` (replaced by the loop). Builder greps the literal and updates each call site; `npm run check` + `npm run test` confirm none missed.

**route-checklist:** N/A (no HTTP routes added). **The "every harness" enumeration is the analogue:** the AC4 uniform-forcing test MUST parametrize over (Mode-1 mock, Layer-A mock) AND statically assert all five in-tree `getCapabilities()` return `canReEngage:true` — so a future adapter that silently ships `canReEngage:false` is caught.

---

## 10. Risks / ambiguities

1. **⚠️ SDK `continueSession` feasibility** (live-`query` follow-up injection). Mitigation: Mode-1 fallback for SDK; Layer-A Stop hook already forces in-turn. Not on the critical path for AC4.
2. **⚠️ Adapter-pool reuse across two `startSession` on one instance** (§2.3). Mitigation: builder verifies; if reuse-after-release is forbidden, hold the slot across the loop, release once.
3. **§3.3 carrier-per-channel** is the subtlest correctness point — cli/SDK/isolated read the prompt, not `messages`, on the task path. Mitigation: T-ext red test asserts the forcing message reaches the agent's *actual* instruction channel for a cli-shaped adapter; the live eval is the ultimate proof.
4. **Remote third-party-worker context-replay** (§3.6) — a non-conforming worker degrades to reject. Documented as a worker limitation, not a HyperIdle floor; HyperIdle's own worker replays `messages`.
5. **Builtin task path never takes Mode-1** — re-engagement there is Layer A only. The loop's Mode-1 branch is dead for builtin-task; that's correct (the gate returns in-turn) but builder must not "fix" it into a spurious second planning session.

---

## protectedTests

- `packages/server/src/tools/__tests__/AL6-return-actions.closure.test.ts` — closed-set assertion must not weaken.
- `packages/server/src/harness/__tests__/AL6-return-gate.test.ts` — detection-core assertions (the gate's "did a return fire" bit) must not change meaning; updates limited to the cap rename.

## sharedFiles

- `packages/shared/src/harness/harness-adapter.ts` (interface + capabilities — touched by any concurrent harness WP; AM2 also edits `HarnessCapabilities`).
- `packages/shared/src/harness/return-actions.ts` (constants).
- `packages/shared/src/events.ts` (`SessionOutcome` — unchanged but co-located).
- `packages/server/src/services/session-provisioning.ts` (the re-prompt loop — high-traffic file).
- `packages/eval/src/{provision-harness.ts,types.ts}` (eval contract).
