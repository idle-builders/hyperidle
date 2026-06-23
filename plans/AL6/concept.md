# AL6 — Concept: Harness review-return hooks (v3 — harness-agnostic forcing)

**Concept act.** AL6 makes returning to HyperIdle the mandatory last step of every agent turn, on every harness, drawn from a closed set of accepted return actions. v1 *flagged* (passive event, turn settles anyway) — rejected. v2 *forced on Claude only* (SDK `Stop` hook + builtin loop) and **reject-only on the three genuinely-external harnesses (CLI, remote, isolated)** — rejected again. The founder: *"was this only built for claude? this needs to work with all harnesses."* (AC4: "the enforcement holds uniformly regardless of which harness produced the turn.")

**The v3 reshape — one decision point only: where forcing lives.** v2 located forcing *inside the harness* (a native turn-end hook the harness must expose). Only Claude exposes one, so only Claude got forced. v3 relocates the **primary forcing mechanism to the provisioning layer** as a **re-prompt loop**: when a turn ends without a return, the provisioner **re-engages the same session with the forcing message and runs another turn** — using the one operation *every* adapter already implements (`startSession` → `streamEvents` → `stopSession`). **Any harness that can run a turn can run another turn.** The native hook (SDK `Stop`) is demoted from "the forcing mechanism" to **a fast-path optimization**: it catches the agent *in-turn* (cheaper — no new session) where available, but it is no longer the *only* place forcing happens. The closed return set, the `ReturnGate` detection, the `not_returned` outcome, and the SDK Stop hook are all carried forward; what changes is that **forcing is now universal, and reject is the genuine floor only where re-engagement is technically impossible.**

> **History.** v1: read-only observer, emits `session_not_returned`, turn settles `completed`. Rejected (flag ≠ force). v2: `canForceReturn:true` on `claude-agent-sdk-adapter` + `builtin-harness-adapter` (force); `canForceReturn:false` on `cli`/`remote`/`isolated` (reject-only — the turn is marked `not_returned` but the agent is **never re-prompted to return**). Rejected: the v1 "flag ≠ force" gap **still exists for every non-Claude harness.**

---

## 1. The load-bearing nouns

### 1.1 Turn (unchanged)

**A turn is one bounded run of an agent acting on the user's behalf through a harness, from `startSession(config)` until the adapter's `streamEvents` iterable exhausts.** This is the one event structurally identical across every adapter (all implement `HarnessAdapter.streamEvents()`). Two enforced turn drains (`session-provisioning.ts` Phase 10 = site A; `assistant-turn.ts` `drainStreamEvents` = site B); one exempt internal-extraction drain (`bet-decomposition.ts`); two forwarding relays (`isolated-session-worker.ts`, `desktop-worker-client.ts`).

A turn is **NOT** a single LLM round-trip, a single tool call, a task/bet, or a thread/message.

> **v3 refinement.** A turn may now span **more than one harness session** at the provisioning layer: a re-prompted turn is `session run #1 (no return)` → `session run #2 (forcing message seeded, agent returns)`. The *conceptual* turn is the whole enforced span; the *harness session* is its unit of re-engagement. The gate's question — "did a return fire across this span?" — is answered over all runs of the span, not per harness-session.

### 1.2 Return action (unchanged)

A tool invocation, from a fixed closed set, that surfaces the turn's work into a human-attended HyperIdle surface. **NOT** a state-mutation tool (`write_memory`, `create_artifact`), a read/query tool, or a planning/bookkeeping tool.

### 1.3 Accepted-return set (unchanged)

The closed, enumerable set of tool names that count as a valid turn ending. Single `packages/shared` constant `RETURN_ACTION_NAMES = { submit_review, handoff_to, send_message }`. Closed (membership fixed in code), enumerable (AC2), harness-agnostic (AC4 — same set gates every adapter). **v3 carries this forward verbatim.**

### 1.4 Re-engagement (NEW — the v3 mechanism)

**Re-engagement is running another turn-run of the same session, seeded with the forcing message, when the prior run ended without a return.** It is the **harness-agnostic** primary forcing mechanism. Concretely: the provisioner builds a fresh `SessionConfig` that carries the *prior context plus the `AL6_FORCE_RETURN_MESSAGE`*, calls `harness.startSession(forcedConfig)` again, drains it through the *same* `ReturnGate`-observed loop, up to `AL6_MAX_FORCE_RETURNS` re-engagements.

The defining property: **re-engagement needs nothing the adapter doesn't already have** — it is `startSession` + `streamEvents` + `stopSession`, the four-method interface. It does NOT require a native turn-end hook. The native hook is the *in-turn fast-path*; re-engagement is the *cross-turn floor that every adapter clears*.

**Re-engagement is NOT** a retry-on-crash (crashes are exempt, §3.3), NOT an infinite loop (bounded at N), NOT a new tool/event the adapter must emit. It is **NOT** "continue the same SDK conversation" except as the SDK fast-path special-case (§4.1) — at the provisioning layer it is structurally a new session run with augmented context.

The **carrier of "prior context + forcing message"** is the existing `SessionConfig.messages` field (AH3) — the conversational transcript an adapter already replays. The forcing message is appended as a final `{ role: "user" }` entry. (§4 details which adapters consume `messages` natively and which need a `continueSession` seam.)

### 1.5 Not-returned (turn outcome) — RESHAPED again in v3

**`not_returned` is the outcome of a turn that, after all re-engagement attempts were exhausted (or were genuinely impossible), still ended without a return action.** In v2, `not_returned` was the *immediate* outcome on any non-force harness (no re-prompt). **In v3 it is the outcome only after the re-prompt loop is spent** — for ALL harnesses uniformly. A harness reaches `not_returned` only when: (a) it re-engaged N times and the agent still refused, OR (b) it is a genuine reject-only floor where re-engagement is technically impossible (§5 — and v3 proves there is at most one such floor, with justification).

`not_returned` is **NOT** a crash, a `stopped`/aborted turn, a `budget_exhausted` turn, or an internal-extraction-drain end. It remains a **non-completed `SessionOutcome` member** (the v2 SHARED change is kept).

### 1.6 Internal-extraction drain (NOT a turn) — exempt (unchanged)

A session run with `SessionConfig.tools === []` is a tool-less, deterministic, platform-internal extraction — structurally cannot invoke a return, so exempt by construction. `isInternalExtractionDrain(config)` carried forward.

### 1.7 Forwarding relay (NOT an enforcement site) — REFRAMED in v3

A relay (`isolated-session-worker.ts`, `desktop-worker-client.ts`) re-emits events verbatim to another process/transport. It terminates no turn and must not gate. **v3 reframe:** the relay is also **not where forcing happens** — but it IS the conduit through which a re-engagement reaches the inner agent. The isolated worker forks a `ClaudeAgentSdkAdapter`; re-engagement of an isolated session means the *parent provisioner* starts a second isolated session whose worker forks a second SDK session seeded with the forcing message. The relay forwards that second run's events exactly as it forwarded the first. No relay-level forcing logic; the relay's contract is unchanged.

---

## 2. The closed accepted-return set (unchanged from v2)

`{ submit_review, handoff_to, send_message }` — exactly the spec's named trio. `update_task_status`→`done` deferred (argument-gated; would make the forcing message ambiguous). The `_args` predicate seam in `isReturnAction` is pre-wired. Everything else in `ALL_TOOL_DEFINITIONS` is NOT a return.

---

## 3. Enforcement — operational meaning of "a turn cannot end without returning"

### 3.1 Detection (unchanged from v1/v2)

The `ReturnGate` observes every consumed `HarnessEvent`; the single bit "was a `tool_call` in `RETURN_ACTION_NAMES` seen?" is the detection core. Sits at the one agnostic seam: consumption of `streamEvents()`. **In v3 the gate's lifetime spans the whole re-engagement loop** — one gate per *turn* (the conceptual span), observing all session-runs, so a return on run #2 satisfies a no-return on run #1.

### 3.2 The forcing layer — RELOCATED to the provisioning layer (the v3 core)

v2 put forcing *inside the harness* (hook the harness must expose). v3 puts the **primary forcing loop in the provisioner**, above the agnostic `streamEvents` seam:

```
turn = one ReturnGate, forceCount = 0
loop:
  run = harness.startSession(config_with_any_forcing_message_so_far)
  drain run through gate (Phase 10)
  stopSession(run)
  end-reason exempt (crash/abort/budget/extraction)?  → settle, exit loop
  gate.returned?                                       → settle "completed", exit loop
  forceCount >= AL6_MAX_FORCE_RETURNS?                 → settle "not_returned", emit event, exit loop
  forceCount++
  config = re-engage(config, AL6_FORCE_RETURN_MESSAGE)  ← append forcing msg to messages
  (loop: run another turn)
```

This loop uses ONLY the four-method `HarnessAdapter` interface. **It is harness-agnostic by construction** — there is no `canForceReturn` branch in it. Every adapter that can `startSession` twice is forced.

### 3.3 Exemptions (unchanged)

The re-prompt loop fires only on **normal completion with no return**. Exempt end-reasons: **crashed** (error event / `startSession` threw), **aborted/stopped** (handoff/PATCH cut it — note `handoff_to` is itself a return so the gate is already satisfied), **budget_exhausted** (cap cut it), **internal-extraction drain** (§1.6 — not a turn). A re-engagement that itself crashes/aborts/exhausts-budget is exempt and ends the loop (don't re-engage a crashed session).

### 3.4 The two layers of forcing — fast-path (native hook) + floor (re-prompt)

v3 keeps BOTH, but reframes the relationship. They are not "Tier 1 vs Tier 2 harness classes" (the v2 framing the founder rejected). They are **two layers that compose on every harness:**

**Layer A — native in-turn fast-path (where the harness exposes a turn-end hook).**
The SDK `Stop` hook (`decision:block + reason`) and the builtin loop's own `break`-point catch the agent *before the session ends* and re-inject the forcing message *without starting a new session*. This is strictly an **optimization**: it is cheaper (no new `startSession`, no context re-replay) and it avoids a perceptible "the agent stopped then started again." When present and it succeeds, the turn returns within the first session-run and Layer B never engages.

**Layer B — provisioning re-prompt loop (the universal floor — §3.2).**
After a session-run drains and the gate is still empty, the provisioner re-engages with a new run. **This works for every adapter.** It is what makes forcing uniform.

**How they compose, per adapter:**
- **SDK / builtin:** Layer A handles forcing in-turn. Layer B is the backstop if the agent slips past the hook budget within the session, *and* the universal guarantee. In practice Layer A resolves it first.
- **CLI / remote / isolated:** No Layer A. **Layer B forces them** — the provisioner re-engages with a fresh `startSession` seeded with the forcing message. This is the exact gap v2 left open; v3 closes it.

**The guarantee (uniform):** no turn settles `completed` without a return. **The forcing (now also uniform):** every harness that can run a second turn is actively re-prompted before any reject. Reject (`not_returned`) is reached only after the re-prompt budget is spent, or on a genuine technical floor (§5).

### 3.5 `canForceReturn` — REDEFINED in v3

v2: `canForceReturn` = "can force at all" (true only for SDK+builtin; the false adapters never got forced). **This is the rejected semantics.**

v3: **`canForceReturn` is renamed/redefined to mean "has a native in-turn fast-path (Layer A)" — an *optimization* hint, NOT "can be forced."** Forcing-at-all is universal via Layer B and needs no capability bit. Concretely:

- New name: **`hasNativeReturnHook`** (replaces `canForceReturn`). `true` = the adapter catches the stop in-turn (SDK Stop hook; builtin loop). `false` = no in-turn hook, **but the provisioner still forces it via the Layer-B re-prompt loop.**
- It is purely an optimization signal: when `true`, the provisioner *may* skip the first redundant re-engagement because the in-turn hook already had N attempts. When `false`, the provisioner runs the full Layer-B loop. **Neither value gates whether forcing happens** — only *where*.
- Removing the "force vs reject" meaning is the load-bearing rename. A reviewer grepping for "which harness can't be forced" must find **nothing** — there is no such category anymore (except the §5 floor, which is `canReEngage:false`, a distinct, separately-justified bit).

### 3.6 AC5 — mid-turn non-terminal tool use unaffected (unchanged)

The gate constrains only the *ending*. Mid-turn tools are never blocked. The re-prompt loop fires after a session-run drains, never per-call. A turn that calls ten non-terminal tools then `submit_review` passes; ten then stop triggers re-engagement.

---

## 4. Re-engagement per adapter — the mechanism question (concept-level; architecture specs signatures)

The adapter interface today is `startSession / streamEvents / stopSession / getCapabilities` — **no `continue/send-followup` method.** The concept locks WHICH of two re-engagement modes each adapter uses; the architecture specs the exact signatures.

**Mode 1 — `startSession`-reuse with augmented `messages`.** The provisioner builds a new `SessionConfig` whose `messages` = prior transcript + `{role:"user", content: AL6_FORCE_RETURN_MESSAGE}`, and calls `harness.startSession(forcedConfig)`. Works for any adapter that (a) is stateless across `startSession` calls and (b) replays `messages`. **No new interface method.**

**Mode 2 — `continueSession(handle, message)` (NEW optional adapter method).** For adapters that hold live in-process session state (an open SDK `query`, a running subprocess) where a fresh `startSession` would lose context or be wasteful, an *optional* `continueSession` method re-engages the existing handle. Adapters implement it where they can; the provisioner falls back to Mode 1 (or to reject, §5) where the method is absent.

**The concept's per-adapter ruling** (architecture proves feasibility against real code and finalizes):

| Adapter | Owns/holds live loop? | Re-engagement mode | Native fast-path (Layer A)? | Forced how |
|---|---|---|---|---|
| **builtin** (`builtin-harness-adapter`) | Yes (in-proc loop, replays `messages`) | **Layer A in-turn** (loop re-inject); Layer B = Mode 1 (`startSession` replays `messages`) | Yes | In-turn re-inject (primary); Mode-1 re-engage as backstop |
| **SDK** (`claude-agent-sdk-adapter`) | Yes (live `query`) | **Layer A in-turn** (`Stop` hook); Layer B = **Mode 2** `continueSession` (feed `forcing` into the live `query`) OR Mode 1 (new `startSession` with `messages`) | Yes | Stop hook (primary); re-engage backstop |
| **cli** (`cli-harness-adapter`) | No — subprocess, exits per run; **stateless** | **Mode 1** — new `startSession` with forcing appended to `messages`/prompt. The subprocess is invoked fresh; augmented context is the natural input. | No | **Layer-B Mode-1 re-engage** (the v2 gap, now closed) |
| **isolated** (`isolated-harness-adapter`) | No — forks a worker that runs an **SDK adapter internally** | **Mode 1** — parent starts a second isolated session; its worker forks a second SDK session seeded with forcing. (Inner SDK *also* has the Stop hook, so the inner run self-forces too.) | No (at the isolated boundary) | **Layer-B Mode-1 re-engage**; inner SDK Stop hook is a bonus |
| **remote** (`remote-harness-adapter`) | No — worker over WS transport | **Mode 1** if the worker is stateless per `dispatch` (new `startSession`→new `dispatch` with forcing in `config.messages`); **Mode 2** if the worker protocol can carry a follow-up to a live session | No locally | **Layer-B Mode-1 re-engage** (dispatch a forcing run); see §5 caveat |

**Key feasibility findings (verified against real adapter code):**
- **cli** `startSession` reads `config.sandboxPath`, `config.resolvedModel`, and `config.mcpConnectionInfo`; it spawns fresh each call. Appending the forcing message to `config.messages` (and threading it into the prompt/args the CLI consumes) is a clean Mode-1 re-engage. **No genuine floor.**
- **isolated** `startSession` forks `isolated-session-worker.js`, which constructs a `new ClaudeAgentSdkAdapter()` and calls `startSession(config)`. A second isolated `startSession` re-runs that whole path with the forcing-augmented config. **No genuine floor** — and the inner SDK already carries the Stop hook, so an isolated turn is *doubly* forced.
- **remote** is the only **possible** floor: `startSession` does `ws.send({type:"dispatch", sessionId, config})` to an external worker. A Mode-1 re-engage dispatches a *new* session with `config.messages` carrying the forcing message — **viable iff the remote worker replays `config.messages`** (the same AH3 contract local adapters honor). If a given remote worker ignores `messages`, re-engagement is technically impossible *for that worker* and it falls to reject — **but that is a worker-implementation limitation, not an architectural floor**, and HyperIdle's own worker protocol can and should replay `messages`. The architecture treats remote re-engage as **Mode-1-by-default, reject only if the worker demonstrably cannot replay context** (a documented, narrow, justified floor — not a blanket "remote can't be forced").

**Net:** v2 had **three** reject-only harnesses. v3 has **zero architectural floors**: cli + isolated are forced via Mode-1 re-engage; remote is forced via Mode-1 re-engage whenever its worker honors `messages` (which HyperIdle's worker does), reject only as a documented per-worker degradation, never a class-level "remote can't force."

---

## 5. The genuine floor — and why there is essentially none

A genuine reject-only floor exists **only** when re-engagement is *technically impossible* — i.e. the adapter cannot run a second turn with augmented context. v3's finding: **no adapter is architecturally in this category.** The narrowest possible residual floor is **a remote worker that ignores `config.messages`** — and that is a property of the *external worker*, not of HyperIdle's adapter layer. The architecture:
1. Implements Mode-1 re-engage for cli, isolated, and remote.
2. Adds an optional `canReEngage` capability bit (distinct from `hasNativeReturnHook`) defaulting `true`; an adapter sets it `false` only if it provably cannot replay context. **All five in-tree adapters set it `true`.**
3. Reject (`not_returned`) is reached only after the re-prompt budget is spent on a re-engageable adapter, OR on a `canReEngage:false` adapter — and v3 ships with no `canReEngage:false` adapter.

This is the bar the founder set: **forcing works for ALL harnesses that can technically run a second turn**, and every in-tree harness can.

---

## 6. Live eval (DoD) — must prove forcing on an external harness

v2's eval ran only on builtin (the easy in-proc loop). v3's eval **must prove the Layer-B re-prompt loop on a non-builtin, external-shaped harness.** The eval harness (`provision-harness.ts`) registers only `BuiltinHarnessAdapter` today. v3 specifies adding a **cli-shaped adapter path** to the eval harness: register a `CliHarnessAdapter` (or an isolated-shaped adapter) configured to run a real agent that tries to end without returning, and assert the provisioner re-engaged it (`forceReturnCount >= 1` sourced from the **provisioning loop**, not from a builtin-only `getSessionForceCount`) and the agent ended up returning (or `not_returned` only if truly un-re-engageable). The eval's force-count must be surfaced by the **provisioner** (turn-level), not the builtin adapter (session-level) — so it works for the external path. §architecture details the eval wiring.

---

## 7. Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Return action** | A closed-set tool call that surfaces the turn's work into a human-attended HyperIdle surface. | terminal action, finish tool |
| **Accepted-return set** | The closed, enumerable set of tool names that count as a valid turn ending. | return list, allow-list |
| **Re-engagement / re-prompt loop** | Running another session-run of the same turn, seeded with the forcing message, when the prior run ended without a return. The harness-agnostic primary forcing mechanism. | retry, nudge |
| **Native return hook (Layer A)** | An in-turn fast-path (SDK `Stop` hook; builtin loop break) that catches the stop before the session ends — an optimization, not the only forcing. | the force mechanism |
| **`hasNativeReturnHook`** | Capability bit: true iff the adapter has a Layer-A in-turn fast-path. An optimization hint; does NOT gate whether forcing happens. (Replaces v2's `canForceReturn`.) | canForceReturn, forceable |
| **`canReEngage`** | Capability bit: true iff the adapter can run a second turn with augmented context (Mode 1 or Mode 2). All in-tree adapters: true. False ⇒ genuine reject floor. | — |
| **`continueSession`** | Optional adapter method to re-engage a live in-process handle (Mode 2). Adapters fall back to Mode-1 `startSession`-reuse where absent. | followUp, sendMessage(adapter) |
| **`not_returned`** | Non-completed turn outcome reached only after the re-prompt budget is spent or on a `canReEngage:false` floor. | flag, escape |

---

## 8. Contracts

- **Cardinality.** A completed turn ends with ≥1 return action across the whole re-engagement span.
- **Closure.** The accepted-return set is closed (one `packages/shared` constant).
- **Mutability.** Set, forcing message, N (re-prompt budget) are frozen constants. A settled `not_returned` outcome is immutable.
- **Identity.** A turn has no persistent identity (runtime span, now possibly multi-session-run). The accepted-return set's identity is the constant.
- **Hard rules.**
  1. **No turn settles `completed` without a return** (AC1 teeth).
  2. **Forcing is uniform** — every harness that can run a second turn is re-engaged before any reject. There is no harness class that is reject-only by design (AC4 teeth — the v3 fix).
  3. **Forcing is bounded** at N re-engagements; after the budget, settle `not_returned` (never loop forever, never crash and lose mid-turn side-effects).
  4. **Detection is observation-only and never blocks a mid-turn tool** (AC5).
  5. **Internal-extraction drains and relays are never forced or rejected.**
  6. **Native hooks are an optimization, not a gate** — their absence never downgrades a harness to reject-only.

---

## 9. SHARED-contract impact (v3 delta over v2)

v2 already added `not_returned` to `SessionOutcome` (kept). v3 adds **two SHARED-contract changes** to the `HarnessAdapter` boundary (`packages/shared/src/harness/harness-adapter.ts`):
1. **`HarnessCapabilities`:** rename `canForceReturn` → `hasNativeReturnHook` (semantics redefined to "has Layer-A fast-path", §3.5), and **add `canReEngage: boolean`** (Mode-1/2 re-engageability; §5). Both additive/rename to an existing additive bit; every `getCapabilities()` impl updates.
2. **`HarnessAdapter`:** add an **optional** `continueSession?(handle: SessionHandle, message: string): Promise<SessionHandle>` (Mode 2). Optional ⇒ existing adapters that use Mode-1 re-engage need not implement it; the SDK adapter implements it for the live-`query` fast-path. **This is the adapter-interface change the prompt anticipated.**

Everything else unchanged: verdict grammar, thread model, no new DB table. The `session_not_returned` event is kept as the surfacing channel (now emitted only after the re-prompt loop is spent).

---

## 10. Rationale

The founder rejected v2 because forcing was Claude-only: the native turn-end hook is a Claude SDK feature, so locating forcing *at the hook* made forcing inherit the hook's availability. v3's correction is to **locate the primary forcing at the provisioning layer**, where the only requirement is "can the adapter run another turn?" — which every adapter satisfies, because running a turn IS the adapter's job. The native hook survives as a cheaper in-turn fast-path, not as the forcing mechanism's gate. `canForceReturn` is redefined to `hasNativeReturnHook` (an optimization hint) precisely so no one reads "this harness can't be forced" off the capability surface again. The eval is upgraded to prove the external path live, closing the v2 hole where only the easy builtin loop was exercised.

---

## Required reading (downstream: `/architecture`, builder)

- `.pipeline/work-packages/TRACK-AL.md` §AL6 (lines 206–244) — spec + ACs + constraints (esp. AC4 uniform enforcement).
- This concept (`plans/AL6/concept.md`).
- `packages/shared/src/harness/harness-adapter.ts` — the interface that gains `continueSession?` + `hasNativeReturnHook`/`canReEngage`; `SessionConfig.messages` (AH3) is the forcing carrier.
- `packages/shared/src/harness/return-actions.ts` — closed set, `AL6_FORCE_RETURN_MESSAGE`, `AL6_MAX_FORCE_RETURNS`, `shouldForceReturn` (carried; force-count semantics move to the loop).
- `packages/server/src/harness/return-gate.ts` — the detection observer (carried; gate lifetime now spans the loop).
- `packages/server/src/services/session-provisioning.ts` Phase 10 drain (the re-prompt loop's home) + Phase 11 teardown.
- The five adapters: `builtin-harness-adapter.ts`, `claude-agent-sdk-adapter.ts`, `cli-harness-adapter.ts`, `isolated-harness-adapter.ts`, `remote-harness-adapter.ts`, plus `isolated-session-worker.ts` (the relay that forwards the re-engaged inner run).
- `packages/server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` — `SyncHookJSONOutput` (`decision:block + reason`, verified), the Layer-A fast-path.
- `packages/eval/src/provision-harness.ts`, `packages/eval/src/scenarios/force-return.ts`, `packages/eval/src/types.ts` — the live-eval harness; v3 adds an external (cli-shaped) adapter path.
- `packages/shared/src/events.ts` — `SessionOutcome` (`not_returned` member, kept).
