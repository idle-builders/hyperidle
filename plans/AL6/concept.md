# AL6 — Concept: Harness review-return hooks (v3 — harness-agnostic forcing via the sandbox instruction file)

**Concept act.** AL6 makes returning to HyperIdle the mandatory last step of every agent turn, on every harness, drawn from a closed set of accepted return actions. v1 *flagged* (passive event, turn settles anyway) — rejected. v2 *forced on Claude only* (SDK `Stop` hook + builtin loop) and **reject-only on the three genuinely-external harnesses (CLI, remote, isolated)** — rejected again. The founder: *"was this only built for claude? this needs to work with all harnesses."* (AC4: "the enforcement holds uniformly regardless of which harness produced the turn.")

**v3-r2 honesty correction.** The first v3 draft claimed forcing reached cli/remote/isolated by appending the forcing message to `SessionConfig.messages` (and "threading it into the prompt arg"). **That claim was false, and reading the adapters proves it:** no external adapter reads `config.messages`, and the CLI adapter has no prompt/messages arg at all. This v3-r2 traces, per adapter, the channel the running model *actually* reads, and pins the carrier to **the sandbox instruction file (`AGENTS.md`/`CLAUDE.md`) that `writeSandboxAgentsMd` already writes** — the one surface every harness reads on every spawn. Every carrier claim below cites the file:line where the model reads it.

> **History.** v1: read-only observer, emits `session_not_returned`, turn settles `completed`. Rejected (flag ≠ force). v2: `canForceReturn:true` on sdk+builtin (force); `false` on cli/remote/isolated (reject-only — never re-prompted). Rejected: the v1 "flag ≠ force" gap **still exists for every non-Claude harness.** v3-r1: re-prompt loop with `config.messages` as the carrier. **Carrier falsified by code** (no external adapter reads `messages`). v3-r2 (this doc): carrier = sandbox instruction-file rewrite, verified against each adapter.

---

## 0. The carrier, traced (the load-bearing correction)

**What the running model actually reads, per adapter** — verified by reading each `startSession` and the worker:

| Adapter | The model's instruction surface (file:line) | Reads `config.messages`? | Re-engage carrier (verified) |
|---|---|---|---|
| **cli** (`cli-harness-adapter.ts`) | `startSession` (`:183-211`) resolves a **fixed 5-var template set** `{{sandbox}} {{model}} {{apiKey}} {{baseUrl}} {{mcpUrl}}` (`:35`, `:184-194`) and spawns with `cwd: config.sandboxPath` (`:209`). **No prompt arg, no messages arg.** The agent's entire context is the files in `cwd` — i.e. `AGENTS.md`/`CLAUDE.md`. | **No** (grep-confirmed: `config.messages` read only by builtin). | **Rewrite the sandbox file** (`writeSandboxAgentsMd`, fabric `context-assembly-prompt.ts:277-280`) with the forcing message appended, then a fresh `startSession`. The re-spawned subprocess reads the rewritten file from `cwd`. |
| **SDK** (`claude-agent-sdk-adapter.ts`) | `startSession` passes `cwd: config.sandboxPath` (`:217`) and a **constant** kickoff `prompt: "Begin working on your assigned task."` (`:237`); real context is auto-discovered from `CLAUDE.md` in `cwd` (`@lore X1`, `:231-235`). | **No.** | **Layer A** = the live `Stop` hook (`:198-213`, `decision:block + reason=forcing`) re-injects in-turn — the real, verified primary. **Layer B backstop** = rewrite sandbox file + new `startSession` (same carrier as cli). |
| **isolated** (`isolated-harness-adapter.ts`) | `startSession` `child.send({type:"start",config})` (`:128`); the worker (`isolated-session-worker.ts:49-51`) constructs a **fresh `ClaudeAgentSdkAdapter`** and calls `startSession(config)` → the inner SDK reads `CLAUDE.md` from `config.sandboxPath`. | **No.** | **Rewrite the sandbox file** + a second isolated `startSession`; the worker forks a second SDK session that reads the rewritten file. **Bonus:** the inner SDK's own Stop hook (Layer A) *also* fires, so an isolated turn is doubly forced in-turn. |
| **remote** (`remote-harness-adapter.ts`) | `startSession` `ws.send({type:"dispatch",sessionId,config})` (`:104-113`) — the whole `config` crosses the WS to a worker process. What the worker does with it is **out of tree**. | The config object (incl. `messages` if present) is *sent on the wire*, but **nothing in-tree proves a worker reads `messages`**; HyperIdle's own remote worker is expected to re-run provisioning (which reads the sandbox file). | **Rewrite the sandbox file** when the worker shares the filesystem/sandbox surface; re-dispatch carries the updated `config`. Honest degradation (§5): a third-party worker that neither re-reads the sandbox nor replays context cannot be context-re-engaged — a worker limitation, narrowly documented. |
| **builtin** (`builtin-harness-adapter.ts`) | In-process loop; on the **chat path** reads `config.messages` (`@lore AH3 H3`); on the **task path** runs the planning loop (no `messages`). | **Yes (chat path only).** | **Layer A** = the loop's own re-inject of `AL6_FORCE_RETURN_MESSAGE` (v2 code, kept), in-turn, no new session. |

**The single load-bearing fact:** `writeSandboxAgentsMd(sandboxPath, assembledPrompt)` (fabric `context-assembly-prompt.ts:277-280`) does a plain idempotent `writeFileSync` of `AGENTS.md` **and** `CLAUDE.md`, and its own doc (`:286-308`) states this is the canonical surface "the same bytes reach the model regardless of which harness executes." Because every adapter sets `cwd: config.sandboxPath` fresh on each `startSession`, **rewriting that file before re-spawn is a carrier that genuinely reaches the model on every harness.** `config.messages` is not — and v3-r1 was wrong to claim it.

---

## 1. The load-bearing nouns

### 1.1 Turn (unchanged)

**A turn is one bounded run of an agent acting on the user's behalf through a harness, from `startSession(config)` until the adapter's `streamEvents` iterable exhausts.** This is the one event structurally identical across every adapter. Two enforced turn drains (`session-provisioning.ts` Phase 10; `assistant-turn.ts` `drainStreamEvents`); one exempt internal-extraction drain (`bet-decomposition.ts`); two forwarding relays (`isolated-session-worker.ts`, `desktop-worker-client.ts`).

A turn is **NOT** a single LLM round-trip, a single tool call, a task/bet, or a thread/message.

> **v3 refinement.** A turn may now span **more than one harness session** at the provisioning layer: a re-prompted turn is `session run #1 (no return)` → `session run #2 (sandbox file rewritten with forcing, agent returns)`. The *conceptual* turn is the whole enforced span; the *harness session* is its unit of re-engagement. The gate's question — "did a return fire across this span?" — is answered over all runs of the span.

### 1.2 Return action (unchanged)

A tool invocation, from a fixed closed set, that surfaces the turn's work into a human-attended HyperIdle surface. **NOT** a state-mutation tool (`write_memory`, `create_artifact`), a read/query tool, or a planning/bookkeeping tool.

### 1.3 Accepted-return set (unchanged)

Single `packages/shared` constant `RETURN_ACTION_NAMES = { submit_review, handoff_to, send_message }`. Closed, enumerable (AC2), harness-agnostic (AC4). v3 carries this forward verbatim.

### 1.4 Re-engagement (the v3 mechanism) — carrier corrected

**Re-engagement is running another turn-run of the same session after the prior run ended without a return, with the forcing message delivered through the channel the target adapter's model actually reads.** It is the **harness-agnostic** primary forcing mechanism for adapters without a native in-turn hook.

The defining property: re-engagement needs nothing beyond the four-method interface **plus the sandbox file the provisioner already writes.** Concretely, for an external adapter: **rewrite `AGENTS.md`/`CLAUDE.md` in the sandbox with the forcing message appended (re-call `writeSandboxAgentsMd`), then `harness.startSession(config)` again.** The re-spawned process reads the rewritten file from `cwd`.

**Re-engagement is NOT** a retry-on-crash (crashes exempt, §3.3), NOT an infinite loop (bounded at N), NOT a new event the adapter must emit, and — the v3-r2 correction — **NOT "append to `config.messages`"** (no external adapter reads that field).

### 1.5 Not-returned (turn outcome) — reshaped in v3

**`not_returned` is the outcome of a turn that, after all re-engagement attempts were exhausted (or were genuinely impossible), still ended without a return action**, for ALL harnesses uniformly. A harness reaches `not_returned` only when: (a) it re-engaged N times and the agent still refused, OR (b) it is a `canReEngage:false` floor (§5 — and v3 ships none). It remains a non-completed `SessionOutcome` member (v2 SHARED change kept).

`not_returned` is **NOT** a crash, a `stopped`/aborted turn, a `budget_exhausted` turn, or an internal-extraction-drain end.

### 1.6 Internal-extraction drain (NOT a turn) — exempt (unchanged)

A session run with `SessionConfig.tools === []` is a tool-less, deterministic, platform-internal extraction — structurally cannot invoke a return, so exempt. `isInternalExtractionDrain(config)` carried forward.

### 1.7 Forwarding relay (NOT an enforcement site) — reframed in v3

A relay (`isolated-session-worker.ts`, `desktop-worker-client.ts`) re-emits events verbatim. It terminates no turn and must not gate. **v3 reframe:** the relay is also not where forcing happens, but IS the conduit for a re-engagement. Re-engaging an isolated session = the *parent provisioner* rewrites the sandbox file and starts a second isolated session whose worker forks a second SDK session that reads the rewritten file. The relay forwards the second run's events exactly as the first. No relay-level forcing logic; the relay's contract is unchanged.

---

## 2. The closed accepted-return set (unchanged from v2)

`{ submit_review, handoff_to, send_message }` — exactly the spec's trio. `update_task_status`→`done` deferred (argument-gated). The `_args` predicate seam in `isReturnAction` is pre-wired. Everything else in `ALL_TOOL_DEFINITIONS` is NOT a return.

---

## 3. Enforcement — operational meaning of "a turn cannot end without returning"

### 3.1 Detection (unchanged core; lifetime extended)

The `ReturnGate` observes every consumed `HarnessEvent`; the single bit "was a `tool_call` in `RETURN_ACTION_NAMES` seen?" is the detection core. Sits at the agnostic seam: consumption of `streamEvents()`. **In v3 the gate's lifetime spans the whole re-engagement loop** — one gate per *turn*, observing all session-runs, so a return on run #2 satisfies a no-return on run #1.

### 3.2 The forcing layer — relocated to the provisioning layer (the v3 core)

v2 put forcing *inside the harness*. v3 puts the **primary forcing loop in the provisioner**, above the agnostic `streamEvents` seam, with the **sandbox-file rewrite as the carrier**:

```
turn = one ReturnGate, forceCount = 0
loop:
  run = harness.startSession(config)              // reads the sandbox file from cwd
  drain run through gate (Phase 10)
  stopSession(run)
  end-reason exempt (crash/abort/budget/extraction)?  → settle, exit loop
  gate.returned?                                       → settle "completed", exit loop
  forceCount >= AL6_MAX_FORCE_RETURNS?                 → settle "not_returned", emit event, exit loop
  !canReEngage?                                        → settle "not_returned" (no in-tree adapter)
  forceCount++
  rewriteSandboxForcing(sandboxPath, assembledPrompt)  ← append AL6_FORCE_RETURN_MESSAGE, re-write AGENTS.md/CLAUDE.md
  (loop: run another turn; the re-spawn reads the rewritten file)
```

This loop uses the four-method interface **plus a file write the provisioner already does**. There is no `canForceReturn` branch in it. Every adapter that can `startSession` twice over a stable sandbox is forced.

> **The carrier is NOT `config.messages`.** The loop never relies on an adapter replaying `messages`; it relies on the adapter reading its `cwd` sandbox file — which every adapter verifiably does.

### 3.3 Exemptions (unchanged)

The re-prompt loop fires only on **normal completion with no return**. Exempt end-reasons: **crashed**, **aborted/stopped** (`handoff_to` is itself a return so the gate is already satisfied), **budget_exhausted**, **internal-extraction drain**. A re-engagement that itself crashes/aborts/exhausts-budget is exempt and ends the loop.

### 3.4 The two layers of forcing — fast-path (native hook) + floor (re-prompt)

v3 keeps BOTH, reframed. Not "Tier 1 vs Tier 2 harness classes" (the v2 framing the founder rejected). They are **two layers that compose on every harness:**

**Layer A — native in-turn fast-path (where the harness exposes a turn-end hook).**
The SDK `Stop` hook (`claude-agent-sdk-adapter.ts:198-213`, verified) and the builtin loop's re-inject catch the agent *before the session ends* and re-inject the forcing message *without a new session*. Strictly an optimization: cheaper, no sandbox re-read, no perceptible stop/restart. Where present and successful, the turn returns within the first run and Layer B never engages.

**Layer B — provisioning re-prompt loop (the universal floor — §3.2).**
After a run drains with the gate still empty, the provisioner rewrites the sandbox file with the forcing message and re-engages with a new run. **This works for every adapter that reads its sandbox `cwd`** — i.e. all of them.

**How they compose, per adapter:**
- **SDK / builtin:** Layer A handles forcing in-turn. Layer B is the backstop and the universal guarantee. In practice Layer A resolves first.
- **cli / isolated:** No Layer A at the outer boundary. **Layer B forces them** — sandbox file rewritten, re-spawn reads it. (Isolated's inner SDK also self-forces via its own Stop hook.) This is the exact gap v2 left open; v3 closes it through a *real, verified* carrier.
- **remote:** Layer B via re-dispatch; carrier reaches the model iff the worker shares the sandbox surface or re-runs provisioning (HyperIdle's own worker does). §5 documents the narrow third-party degradation.

**The guarantee (uniform):** no turn settles `completed` without a return. **The forcing (now also uniform):** every harness that can run a second turn over its sandbox is actively re-prompted before any reject.

### 3.5 `canForceReturn` — redefined in v3

v2: `canForceReturn` = "can force at all" (true only for sdk+builtin; the false adapters never got forced) — the rejected semantics.

v3: **`canForceReturn` is renamed/redefined to `hasNativeReturnHook` — "has a native in-turn fast-path (Layer A)", an optimization hint, NOT "can be forced."** Forcing-at-all is universal via Layer B (sandbox-file rewrite) and needs no capability bit. Concretely:

- New name **`hasNativeReturnHook`**: `true` = adapter catches the stop in-turn (SDK Stop hook; builtin loop). `false` = no in-turn hook, **but the provisioner still forces it via Layer B.**
- Pure optimization signal: `true` ⇒ provisioner *may* skip the first redundant re-engage (the in-turn hook already had N attempts). Neither value gates whether forcing happens — only *where*.
- A reviewer grepping for "which harness can't be forced" must find **nothing**. The only reject category is `canReEngage:false` (a distinct bit, §5), and no in-tree adapter sets it false.

### 3.6 AC5 — mid-turn non-terminal tool use unaffected (unchanged)

The gate constrains only the *ending*. Mid-turn tools are never blocked. The re-prompt loop fires after a run drains, never per-call.

---

## 4. Re-engagement per adapter — the mechanism question (concept-level; architecture specs signatures)

The adapter interface today is `startSession / streamEvents / stopSession / getCapabilities` — no continue method. The concept locks WHICH re-engagement mode each adapter uses; the architecture specs the exact signatures.

**Mode 1 — sandbox-file rewrite + `startSession`-reuse (the universal carrier).** The provisioner re-writes the sandbox `AGENTS.md`/`CLAUDE.md` (`writeSandboxAgentsMd` with `assembledPrompt + "\n\n" + AL6_FORCE_RETURN_MESSAGE`) and calls `harness.startSession(config)` again. Works for any adapter that reads its `cwd` sandbox on spawn — **cli, isolated, remote (FS-sharing), and as the SDK/builtin backstop.** No new interface method. No reliance on `config.messages`.

**Mode 2 — `continueSession(handle, message)` (optional adapter method).** For adapters holding live in-process session state (an open SDK `query`) where a fresh `startSession` would lose context. Only the SDK adapter is a candidate, and even there Layer A (the Stop hook) already forces in-turn, so Mode 2 is a pure optimization. Adapters fall back to Mode 1 where absent.

**Per-adapter ruling** (architecture proves feasibility against real code and finalizes):

| Adapter | Holds live loop? | Re-engage mode | Native fast-path (Layer A)? | Forced how (carrier verified) |
|---|---|---|---|---|
| **builtin** | Yes (in-proc loop) | Layer A in-turn | Yes (`hasNativeReturnHook:true`) | Loop re-injects `AL6_FORCE_RETURN_MESSAGE` (`builtin-harness-adapter.ts`, v2 kept). Layer B never reached. |
| **SDK** | Yes (live `query`) | Layer A (`Stop` hook); Mode-2 backstop | Yes | Stop hook `:198-213` (verified). Backstop = sandbox-file rewrite + new `startSession`. |
| **cli** | No — subprocess, stateless | **Mode 1 (sandbox rewrite)** | No | Re-write `AGENTS.md`/`CLAUDE.md`; re-spawn reads it from `cwd:sandboxPath` (`:209`). The v2 gap, closed via a carrier the adapter provably reads. |
| **isolated** | No — forks a worker running an SDK adapter | **Mode 1 (sandbox rewrite)** | No (at the isolated boundary) | Re-write the sandbox file; second isolated `startSession` → worker forks a second SDK session reading the rewritten file. Inner Stop hook is a bonus. |
| **remote** | No — worker over WS | **Mode 1 (sandbox rewrite + re-dispatch)** | No locally | Re-write sandbox + re-dispatch `config`; reaches the model iff the worker shares the sandbox or re-runs provisioning. §5 caveat. |

**Net:** v2 had **three** reject-only harnesses. v3 has **zero architectural floors**: cli + isolated are forced via Mode-1 sandbox-rewrite (verified carrier); remote is forced whenever its worker reads the sandbox/re-runs provisioning (HyperIdle's does), with one narrow, honest third-party degradation.

---

## 5. The genuine floor — and why there is essentially none

A genuine reject-only floor exists **only** when re-engagement is *technically impossible* — the adapter cannot deliver augmented context to a second run. v3's finding: **no in-tree adapter is in this category**, because the carrier is the sandbox file every adapter reads, not a field some adapter might ignore.

The narrowest residual: **a third-party remote worker that neither shares HyperIdle's sandbox filesystem nor re-runs provisioning** — so the rewritten sandbox file never reaches its model. That is a property of the *external worker*, not of HyperIdle's adapter layer. The architecture:
1. Implements Mode-1 sandbox-rewrite re-engage for cli, isolated, remote.
2. Adds an optional `canReEngage` capability bit (distinct from `hasNativeReturnHook`) defaulting `true`; an adapter sets it `false` only if it provably cannot deliver augmented context. **All five in-tree adapters set it `true`.** This is enforced *statically* (type + a compile-time/lint assertion, not a runtime test): the field is non-optional on the two in-tree-relevant adapters and any future adapter shipping `canReEngage:false` is a deliberate, reviewed, justified edit.
3. Reject (`not_returned`) is reached only after the re-prompt budget is spent on a re-engageable adapter, OR on a `canReEngage:false` adapter — and v3 ships none.

This is the bar the founder set: **forcing works for ALL harnesses that can technically run a second turn**, and every in-tree harness can.

---

## 6. Live eval (DoD) — must prove forcing on the external re-prompt path

v2's eval ran only on builtin (the easy in-proc Layer-A loop) and read force-count from a **builtin-only** `getSessionForceCount` (`builtin-harness-adapter.ts:369`). That cannot exercise the Layer-B loop, and `provision-harness.ts` registers **only `BuiltinHarnessAdapter`** (`:70-77`) — so the external path is unproven.

v3's eval **must prove the Layer-B re-prompt loop drives a real model through the same `runSession` code path the real cli/isolated harness uses** — not the builtin Layer-A shortcut. Two honest constraints shape the design:

1. **Force-count must be turn-level.** The eval reads `forceReturnCount` from a new **`ProvisionSessionResult.forceReturnCount`** (the provisioning loop's counter), not from the builtin adapter. §architecture defines how the loop counter and the builtin in-turn count combine into one number so the kept builtin judge doesn't regress.
2. **The external binary may be absent.** Running the real `claude` CLI needs a binary + auth that may not be present in the eval env. So the eval proves the harness-agnostic forcing on an **external-SHAPED adapter** — one with `hasNativeReturnHook:false, canReEngage:true` whose only carrier is the sandbox file — driven by a **real model**, through the **same provisioning re-prompt loop** the real CLI uses. This adapter is NOT the builtin (no Layer-A shortcut); it `startSession`s a process/agent whose context is solely the sandbox `cwd`, so a return only happens if the loop rewrote the sandbox file and re-spawned. If the true `claude` CLI binary is present, the eval uses it; otherwise it uses the external-shaped adapter — either way the **loop forces through the external code path**, never the builtin fast-path. §architecture details the registration plumbing (`runEvalSession` harness-kind branch).

The eval's pass condition: the external-path agent was re-prompted (`forceReturnCount >= 1`) **and** ended `completed` (returned) or honestly `not_returned`, never silently `completed` with `returnVerdict:"not_returned"`.

---

## 7. Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Return action** | A closed-set tool call that surfaces the turn's work into a human-attended HyperIdle surface. | terminal action, finish tool |
| **Accepted-return set** | The closed, enumerable set of tool names that count as a valid turn ending. | return list, allow-list |
| **Re-engagement / re-prompt loop** | Running another session-run of the same turn, with the forcing message delivered via the **sandbox instruction file** the target adapter reads, when the prior run ended without a return. | retry, nudge |
| **Forcing carrier** | The channel the running model actually reads the forcing message from. For external adapters: the sandbox `AGENTS.md`/`CLAUDE.md` (NOT `config.messages`). For SDK/builtin: the native in-turn hook. | config.messages (rejected for externals) |
| **Native return hook (Layer A)** | An in-turn fast-path (SDK `Stop` hook; builtin loop) — an optimization, not the only forcing. | the force mechanism |
| **`hasNativeReturnHook`** | Capability bit: true iff the adapter has a Layer-A in-turn fast-path. Optimization hint; does NOT gate whether forcing happens. (Replaces v2's `canForceReturn`.) | canForceReturn, forceable |
| **`canReEngage`** | Capability bit: true iff the adapter can run a second turn with augmented context (sandbox rewrite or Mode 2). All in-tree adapters: true (static guarantee). False ⇒ genuine reject floor. | — |
| **`not_returned`** | Non-completed turn outcome reached only after the re-prompt budget is spent or on a `canReEngage:false` floor. | flag, escape |

---

## 8. Contracts

- **Cardinality.** A completed turn ends with ≥1 return action across the whole re-engagement span.
- **Closure.** The accepted-return set is closed (one `packages/shared` constant).
- **Carrier.** The forcing message reaches an external adapter's model **only** through the rewritten sandbox file (`writeSandboxAgentsMd`), never through `config.messages`.
- **Mutability.** Set, forcing message, N (re-prompt budget) are frozen constants. A settled `not_returned` outcome is immutable.
- **Hard rules.**
  1. **No turn settles `completed` without a return** (AC1 teeth).
  2. **Forcing is uniform** — every harness that can run a second turn over its sandbox is re-engaged before any reject. There is no harness class that is reject-only by design (AC4 teeth — the v3 fix).
  3. **Forcing is bounded** at N re-engagements; after the budget, settle `not_returned`.
  4. **Detection is observation-only and never blocks a mid-turn tool** (AC5).
  5. **Internal-extraction drains and relays are never forced or rejected.**
  6. **Native hooks are an optimization, not a gate** — their absence never downgrades a harness to reject-only.
  7. **`canReEngage:true` for all in-tree adapters is a static guarantee** (type + compile/lint), not a runtime claim.

---

## 9. SHARED-contract impact (v3 delta over v2)

v2 already added `not_returned` to `SessionOutcome` (kept). v3 adds **two SHARED-contract changes** to `packages/shared/src/harness/harness-adapter.ts`:
1. **`HarnessCapabilities`:** rename `canForceReturn` → `hasNativeReturnHook` (semantics redefined, §3.5) and **add `canReEngage: boolean`** (§5). Both update every `getCapabilities()` impl (5 in-tree + mock).
2. **`HarnessAdapter`:** add an **optional** `continueSession?(handle, message): Promise<SessionHandle>` (Mode 2). Optional ⇒ Mode-1 adapters need not implement it; only the SDK is a candidate, and Layer A already forces it, so this is a pure optimization seam.

Everything else unchanged: verdict grammar, thread model, no new DB table. `session_not_returned` kept as the surfacing channel (emitted only after the re-prompt loop is spent).

---

## 10. Rationale

The founder rejected v2 because forcing was Claude-only: the native turn-end hook is a Claude SDK feature, so locating forcing at the hook made forcing inherit the hook's availability. v3 relocates the primary forcing to the provisioning layer. **The first v3 draft then made a second mistake** — it named `config.messages` as the universal carrier without checking that any external adapter reads it. Reading the adapters shows none do. The corrected v3-r2 pins the carrier to the one surface every adapter verifiably reads on every spawn — the sandbox `AGENTS.md`/`CLAUDE.md` that `writeSandboxAgentsMd` already writes — so re-engagement actually reaches the model. The native hook survives as a cheaper in-turn fast-path. `canForceReturn` becomes `hasNativeReturnHook` so no one reads "this harness can't be forced" off the capability surface again. The eval is upgraded to prove the external re-prompt path live (or via an external-shaped real-model adapter when the CLI binary is absent), closing the v2 hole.

---

## Required reading (downstream: `/architecture`, builder)

- `.pipeline/work-packages/TRACK-AL.md` §AL6 (lines 206–244) — spec + ACs + constraints (esp. AC4 uniform enforcement).
- This concept (`plans/AL6/concept.md`).
- **The carrier — verified:** `packages/fabric/src/context-assembly-prompt.ts:277-280` (`writeSandboxAgentsMd` — the universal sandbox-file carrier) + its doc `:286-308`.
- `packages/shared/src/harness/harness-adapter.ts` — gains `hasNativeReturnHook`/`canReEngage` + optional `continueSession?`.
- `packages/shared/src/harness/return-actions.ts` — closed set, `AL6_FORCE_RETURN_MESSAGE`, `AL6_MAX_FORCE_RETURNS`, `shouldForceReturn`.
- `packages/server/src/harness/return-gate.ts` — detection observer (gate lifetime spans the loop).
- `packages/server/src/services/session-provisioning.ts` — Phase 8.5 sandbox write (`:651`), Phase 9 start (`:709-728`), Phase 10 drain (`:760-897`), Phase 11 teardown — the re-prompt loop's home.
- The five adapters (carrier traced per §0): `cli-harness-adapter.ts:183-211`, `claude-agent-sdk-adapter.ts:198-239`, `isolated-harness-adapter.ts:128` + `isolated-session-worker.ts:49-51`, `remote-harness-adapter.ts:104-113`, `builtin-harness-adapter.ts:369`.
- `packages/server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` — `SyncHookJSONOutput` (`decision:block + reason`, verified), the Layer-A fast-path.
- `packages/eval/src/{provision-harness.ts,scenarios/force-return.ts,types.ts}` — eval; v3 adds the external (sandbox-carrier) path.
- `packages/shared/src/events.ts` — `SessionOutcome` (`not_returned` member, kept).
</content>
</invoke>
