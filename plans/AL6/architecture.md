# AL6 — Architecture: Harness review-return hooks (v2 — hook-based return forcing)

Implements `plans/AL6/concept.md` v2. Span: agent-runtime / harness-adapter / tool / shared-events. **One SHARED-contract change** (additive `SessionOutcome` member `not_returned` + additive `HarnessCapabilities.canForceReturn`) — see §0.3 and concept §8. No DB change. No verdict/thread change. No new harness type.

## 0. What changes from v1, and why

### 0.1 The verified SDK hook API (source-driven)

Read from the **installed** package `packages/server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (not memory):

- `Options.hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>` (sdk.d.ts:1318). The `query({ prompt, options })` call accepts a `hooks` map.
- `HookEvent` includes `'Stop'` and `'SubagentStop'` (sdk.d.ts `HookEvent` union).
- `HookCallbackMatcher = { matcher?: string; hooks: HookCallback[]; timeout?: number }` (sdk.d.ts:749).
- `HookCallback = (input: HookInput, toolUseID: string | undefined, options: { signal: AbortSignal }) => Promise<HookJSONOutput>` (sdk.d.ts:743).
- `StopHookInput = BaseHookInput & { hook_event_name: 'Stop'; stop_hook_active: boolean; last_assistant_message?: string }` (sdk.d.ts).
- **The decision-return shape** — `HookJSONOutput = AsyncHookJSONOutput | SyncHookJSONOutput`; the **block-with-reason** shape is `SyncHookJSONOutput` (sdk.d.ts):
  ```ts
  type SyncHookJSONOutput = {
    continue?: boolean;          // false = stop the whole session entirely (user-facing stopReason)
    suppressOutput?: boolean;
    stopReason?: string;         // shown to the USER when continue=false
    decision?: 'approve' | 'block';   // <-- the Stop-hook control
    systemMessage?: string;
    reason?: string;             // <-- shown to CLAUDE; the forcing guidance
    hookSpecificOutput?: ...;    // Stop/SubagentStop also accept hookSpecificOutput.additionalContext
  };
  ```

**The exact "block + reason" decision for a Stop hook** (verified against the Claude Code hooks reference, https://code.claude.com/docs/en/hooks — followed from the 301 redirect of docs.claude.com/en/docs/claude-code/hooks):

> Returning `{ "decision": "block", "reason": "<text>" }` from a **Stop** hook **prevents Claude from stopping and continues the conversation**; `reason` is shown to Claude as guidance for what to do next.

This is **distinct** from `{ continue: false, stopReason }`, which terminates the whole session and shows `stopReason` to the *user* (not Claude). AL6 wants the former (force the agent to keep going and return), so the AL6 Stop hook returns:
```ts
return { decision: "block", reason: AL6_FORCE_RETURN_MESSAGE };   // when no return seen this turn
return {};                                                        // when a return WAS seen → allow stop
```
Verification status: **VERIFIED** against installed `sdk.d.ts` (the `decision`/`reason`/`continue`/`stopReason` field shapes are read directly from the type) **and** the public hooks doc (the Stop-event `decision:block` semantics). ⚠️ One residual UNVERIFIED nuance: the docs describe the *settings.json/stdout-JSON* hook protocol; that the **in-process SDK `HookCallback` returning a `SyncHookJSONOutput` object** is interpreted with identical `decision:block` semantics is strongly implied by the shared `SyncHookJSONOutput` type but is asserted, not demonstrated, by the SDK README. **The SDK Stop-hook behavioral test (T7) is the proof** — it drives a real `query()` with the hook and asserts the agent is re-prompted. Until T7 is green, treat the SDK-path forcing as `⚠️ UNVERIFIED-AT-RUNTIME`.

### 0.2 The v1 → v2 reconciliation (keep / re-task / replace)

| v1 artifact | Fate in v2 | Why |
|---|---|---|
| `RETURN_ACTION_NAMES` + `isReturnAction` (`packages/shared/.../return-actions.ts`) | **KEEP unchanged** | The closed-set decision was sound (concept §2). Still the single source of truth. |
| `ReturnGate` / `createReturnGate` (`return-gate.ts`) — the "did a return fire?" observer | **KEEP as detection core** | The detection bit is correct and harness-agnostic. v2 builds the forcing layer *on top* of it. (Fix the `let Returned` casing nit while here.) |
| `evaluateReturn(gate, endReason)` | **KEEP, extend** | Still maps end-reason → verdict. v2 adds the `not_returned`-as-outcome consumption (§1.4). |
| `session_not_returned` event | **KEEP** | Now the surfacing channel in BOTH tiers (force-exhausted and reject). |
| v1 site-A wiring: emit event, then `endSession(..., "completed")`, `outcome: "completed"` | **REPLACE** | This is the rejected behavior. v2: a `not_returned` verdict on a no-force harness sets `outcome: "not_returned"` (Tier 2), not `"completed"`. |
| v1 "flag is the v1 policy; redirect is a follow-up" decision (v1 arch §7) | **REPLACE** | Founder rejected flag-only. v2 makes force primary. |
| The classifying lint guard (turn-drain vs relay vs exempt) | **KEEP** | Still needed — a future turn drain must not forget to wire the gate+forcing. |

**Nothing in the closed-set / detection layer is ripped out.** What's replaced is the *response*: the passive "emit + settle completed" becomes "force (Tier 1) or reject-as-non-completed (Tier 2)."

### 0.3 The one SHARED-contract change

`packages/shared/src/events.ts:42` — `SessionOutcome = "completed" | "crashed" | "stopped"` gains a member:
```ts
export type SessionOutcome = "completed" | "crashed" | "stopped" | "not_returned";
```
Additive. But every `switch (outcome)` / outcome-discriminating consumer must handle it. Enumerate + guard (§5, AC4-static). Consumers found: `session-provisioning.ts` (`ProvisionSessionResult.outcome` already widened to `SessionOutcome | "budget_exhausted"` at :218 — extend its narrowing), `endSession` outcome write, `observability/events.ts:44`, `updateRoutineRunOnSessionEnd`. Also additive: `HarnessCapabilities.canForceReturn: boolean` (`harness-adapter.ts:113`), defaulted per adapter (§3).

---

## 1. The forcing layer — where it lives per harness

The detection seam is uniform (consume `streamEvents`, observe `tool_call`). **Forcing is NOT uniform** — it must intervene where the agent's turn-end decision is made, which differs by harness class. Two Tier-1 (force) mechanisms + one Tier-2 (reject) fallback.

### 1.1 Tier 1a — SDK adapter (`claude-agent-sdk-adapter.ts`): native `Stop` hook

The SDK owns the loop; we cannot break into it from the provisioning drain. We intercept at the SDK's own turn-end via `options.hooks.Stop`.

- **New:** a per-session forcing state on `ActiveSession`: `{ returnSeen: boolean; forceCount: number }`.
- `translateMessage` already yields `tool_call` events (adapter:272-277). Add: when a yielded `tool_call`'s name ∈ `RETURN_ACTION_NAMES`, set `session.returnSeen = true`. The adapter reuses `isReturnAction` from shared — same predicate as the gate, no second list.
- Wire `options.hooks.Stop` in `startSession`, into `queryOptions`:
  ```ts
  hooks: {
    Stop: [{ hooks: [async (): Promise<SyncHookJSONOutput> => {
      if (session.returnSeen) return {};                          // allow stop
      if (session.forceCount >= AL6_MAX_FORCE_RETURNS) return {}; // budget spent → allow stop; drain Tier-2 rejects
      session.forceCount += 1;
      return { decision: "block", reason: AL6_FORCE_RETURN_MESSAGE };
    }] }],
  }
  ```
- After the budget is spent the hook *allows* the stop; the provisioning drain then sees `returnGate.returned === false` and applies **Tier 2 reject** (`outcome: "not_returned"`). So even the SDK path falls through to reject if the agent refuses N times — the guarantee holds. `canForceReturn: true`.
- ⚠️ `permissionMode`/`hooks` interplay: hooks run regardless of permission mode. No change to the existing env allow-list or `bypassPermissions` gating.

### 1.2 Tier 1b — Builtin adapter (`builtin-harness-adapter.ts`): HyperIdle owns the loop

HyperIdle drives `runChatTurn` / the task `runLoop` directly via `callLlm` in a `while (true)` loop. The "stop attempt" is the loop's `break`. Force = re-inject + `continue` instead of breaking.

- Track `returnSeen` inside the session (set when an executed `tool_call`'s name ∈ `RETURN_ACTION_NAMES` — `executeToolCalls` already iterates them).
- At each loop's end-of-turn break point (where `runChatTurn` emits `completion` and `break`s; and the task loop's terminal break), before breaking: if `!returnSeen && forceCount < AL6_MAX_FORCE_RETURNS`, push a `user` message with `AL6_FORCE_RETURN_MESSAGE`, `forceCount++`, and `continue` instead of breaking.
- Reuses the EXACT same constant + predicate. `canForceReturn: true`.
- **Eval proves this path** (the eval registers `BuiltinHarnessAdapter` — §6).

### 1.3 Tier 2 — CLI / remote / isolated adapters: reject-the-turn

These run a subprocess/worker; tools route via MCP; there is no reachable in-loop turn-end hook and no way to inject a "keep going" message mid-session without a per-adapter protocol change (out of scope: "No new harness types"). `canForceReturn: false`.

- No adapter change. The detection gate already observes their stream `tool_call` events at the provisioning drain (site A). At teardown, a `not_returned` verdict → **Tier 2 reject**: `outcome: "not_returned"` + `session_not_returned` event.
- ⚠️ **MCP-bridge surfacing (carried v1 risk, T8).** CLI/remote with `mcpSupport: true` invoke return tools via the MCP bridge, not `registry.invoke` in the drain. The adapter must still surface a stream `tool_call` for the return tool (provisioning emits `tool_call_recorded` at :817-829, implying it reaches the stream). T8 proves it; **fallback** if not: observe at the MCP bridge invoke boundary (`mcp-bridge.ts` `createMcpBridge({ sessionId, registry })`), updating a `sessionId → returnSeen` map — also harness-agnostic. T8 decides.

### 1.4 The unified drain decision (site A — `session-provisioning.ts` Phase 10)

The provisioning drain stays the single place the **verdict → outcome** mapping happens (Tier 2 lives here; Tier 1 already happened inside the adapter before the stream exhausted). Replace v1's :958-985 block:

```ts
const returnEndReason = aborted ? "stopped" : "completed";
const returnVerdict = evaluateReturn(returnGate, returnEndReason);

if (returnVerdict === "not_returned") {
  // The adapter already force-continued up to N times if it could (Tier 1);
  // reaching here means the agent still did not return → reject the turn (Tier 2).
  eventBus.emit({ type: "session_not_returned", /* …as v1… */ });
  await endSession(db, eventBus, sessionContext, totalCostCents, 0, "not_returned"); // was implicit "completed"
  // …token accumulation, workspace destroy…
  return { sessionId, outcome: "not_returned", totalCostCents, taskId, returnVerdict };
}
// returned → unchanged completed path
await endSession(db, eventBus, sessionContext, totalCostCents, 0);
return { sessionId, outcome: "completed", totalCostCents, taskId, returnVerdict };
```

`endSession`'s signature already takes an optional final outcome arg (used for `"budget_exhausted"`); pass `"not_returned"` the same way.

### 1.5 Site B — assistant turns (`assistant-turn.ts` `drainStreamEvents`)

Unchanged from v1's reasoning: the assistant path persists a plain reply (the "NEVER silent" invariant) — a structural return into a human-attended thread. The gate is wired for uniformity; the assistant path is compliant-by-construction. **No forcing needed** (there is nothing to force — the reply always surfaces). Keep the gate observation; document compliant-by-construction.

### 1.6 Site C — extraction drain (`bet-decomposition.ts`): exempt (unchanged)

`tools: []` internal-extraction drain — no gate, no forcing, no reject. Exempt-by-construction (concept §1.5). Marker `// AL6-exempt: internal-extraction drain (tools:[])` retained.

---

## 2. Shared constants (additive)

`packages/shared/src/harness/return-actions.ts` (existing — extend):
```ts
/** AL6 v2: the forcing re-injection message. Single source — SDK hook reason,
 *  builtin loop re-inject, and any future forcing path all use THIS string. */
export const AL6_FORCE_RETURN_MESSAGE =
  "You have not yet returned your work to HyperIdle. Before this turn can end you must call exactly one of: " +
  "submit_review (submit work for review), handoff_to (hand the task to another agent or a human), or " +
  "send_message (send your result to a thread). Choose the one that fits and call it now.";

/** AL6 v2: max force-continue re-injections per turn before falling through to reject. */
export const AL6_MAX_FORCE_RETURNS = 2;
```
`RETURN_ACTION_NAMES` / `isReturnAction` — unchanged.

---

## 3. Types / schemas / DB

- **`SessionOutcome`** (`shared/src/events.ts`): + `"not_returned"` (§0.3).
- **`HarnessCapabilities`** (`shared/src/harness/harness-adapter.ts`): + `readonly canForceReturn: boolean`. Per adapter: SDK `true`, builtin `true`, cli/remote/isolated `false`, mock configurable (default `false`).
- **`SessionResult.outcome`** (`harness-adapter.ts:110`) is the *adapter-level* result (`"completed" | "crashed" | "stopped"`). v2 does **not** widen it: `not_returned` is a *provisioning-level* verdict (Tier 2 decided at the drain, not by the adapter). The adapter still reports `completed`; the drain overrides to `not_returned`. Keeps the adapter contract minimal.
- **`ProvisionSessionResult.outcome`** (`session-provisioning.ts:218`): already `SessionOutcome | "budget_exhausted"` — now includes `not_returned` via the widened `SessionOutcome`.
- **DB:** none. `not_returned` is a runtime outcome + event, not a persisted row.
- **`session_not_returned` event:** unchanged shape (v1).

---

## 4. Per-AC verification (AC1/AC3 now BOTH a behavioral test AND a live eval)

| AC | Property | Method |
|---|---|---|
| **AC1** — a turn ending without a return is not accepted as complete | runtime behavior + **live forcing** | **(a) Behavioral integration test:** builtin-adapter `runSession` whose agent (mock LLM / cassette) calls a non-return tool then tries to stop → assert it is force-re-prompted (≥1 `AL6_FORCE_RETURN_MESSAGE` injected) and either returns or, after `AL6_MAX_FORCE_RETURNS`, settles `outcome: "not_returned"` (NEVER `"completed"`). **(b) Live eval** `force-return` (§6): a real model on the builtin (Tier-1) path that initially tries to end without returning is actually forced and ends up calling a return tool — and a compliant agent's return is accepted as `completed`. **AC1 is evidenced only when BOTH (a) and (b) pass.** |
| **AC2** — accepted-return set is closed + enumerable | value-import unit test + type | `return-actions.closure.test.ts` (kept from v1): every `RETURN_ACTION_NAMES` member maps to a real `ALL_TOOL_DEFINITIONS` entry; the `as const` readonly-tuple type makes it non-widenable (a `check`-time guarantee). |
| **AC3** — attempt to end without a return is detected + not silently completed | runtime behavior + **live eval** | **(a) Unit:** `evaluateReturn(gate,"completed") === "not_returned"` when no return seen. **(b) Integration:** Tier-2 (cli/remote-shaped mock, `canForceReturn:false`) → `outcome: "not_returned"` + `session_not_returned` emitted; the agent's result is NOT counted as completed. **(c) Live eval:** the §6 `force-return` scenario asserts the not-yet-returned attempt is acted on (forced), not silently green. |
| **AC4** — enforcement holds uniformly across harnesses | runtime + static | **(a) Parameterized integration test:** the same not-return turn yields a non-`completed` resolution on builtin (force-then-reject), SDK-shaped, and cli/remote-shaped (reject) adapters — the *guarantee* (never `completed` without a return) is identical even where the *mechanism* differs. **(b) `canForceReturn` table test:** each real adapter reports the expected capability bit (SDK/builtin true; cli/remote/isolated false). **(c) Classifying lint guard** (§5) — every turn drain wires the gate; relays/extraction exempt. **(d) `SessionOutcome` exhaustiveness:** a `check`-time `never` guard so adding `not_returned` forces every consumer to handle it. **(e) T8** proves the MCP-bridge path surfaces the return tool. |
| **AC5** — mid-turn non-terminal tool use unaffected | runtime behavior | Unit: gate observing ten non-return `tool_call`s then `submit_review` → `returned`; the forcing layer never fires while a return is pending or mid-turn — it only evaluates at the stop attempt. Integration: a builtin turn calling `read_inbox`+`write_memory` mid-turn then `submit_review` completes `completed`, no force injected, mid-turn tools executed. |

All runtime tests import the module and assert behavior. AC2's closure is a value-import unit test (not a filesystem grep). The static legs (lint guard, `SessionOutcome` exhaustiveness) are `check`/`lint`, never tests.

---

## 5. Static guards

- **Classifying drain lint guard** (kept from v1): an ESLint rule (or marker+grep) over `for await … streamEvents` loops classifying each as turn-drain / forwarding-relay / exempt-extraction-drain via the `// AL6-relay` and `// AL6-exempt` markers; turn drains must thread the gate; relays/exempt must not. Prevents a future turn drain forgetting enforcement without firing on the two relays or the extraction drain.
- **`SessionOutcome` exhaustiveness:** the new `not_returned` member must force a `check` error in any consumer that does not handle it. Implement via the existing discriminated-switch pattern + a `const _exhaustive: never = outcome` tail in the outcome-consuming functions (`endSession` outcome write, observability mapping, routine-run update). Static property → type system, not a test.

---

## 6. Live eval (DoD — first-class)

`packages/eval/src/scenarios/force-return.ts` (new), registered in `scenarios/index.ts`. Uses `runEvalSession` (builtin adapter, Tier-1 force path) + the existing judge/seed shape (mirrors `submit-review.ts`).

**Scenario `fr-forced-return-builder` (the teeth — AC1/AC3 forcing):**
- **Seed:** `seedMinimalWorld` with an agent system prompt that *tempts non-return*: e.g. "Do the analysis and then STOP — do not call any tool to report back; just end your turn." We want the model to *attempt* to end without returning so the forcing layer is exercised; the prompt deliberately discourages the return so the test isn't trivially green.
- **Trigger:** `runEvalSession` (builtin, `canForceReturn:true`).
- **Rubric (judges):**
  1. `judgeForceReturnInjected` (new) — assert ≥1 `AL6_FORCE_RETURN_MESSAGE` was injected this session (the forcing actually fired). Source: a `force_return_injected` count surfaced on `TriggerResult` (the eval harness reads the builtin session's force counter — additive eval-only field on the result).
  2. `judgeReturnEventuallyCalled` — assert a return tool (`submit_review`/`handoff_to`/`send_message`) was ultimately invoked OR the outcome settled `not_returned` (never `completed`-without-return). Either proves the turn was not accepted as a clean completion.
  3. `judgeSessionOutcomeNotSilentlyCompleted` — assert the session did NOT end `completed` with `returnVerdict === "not_returned"` (the exact v1 bug — a not-returned turn marked completed).
- **Scenario `fr-compliant-return-builder` (happy path — AC1 accept):** agent prompted to submit its work; assert a return tool fires, NO force injected, outcome `completed`. Mirrors `submit-review` plus the no-force assertion.

**Why builtin, not SDK, for the eval:** `runEvalSession` registers `BuiltinHarnessAdapter` and drives it without booting a server (`@lore X7`). Builtin is a Tier-1 force path, so the eval proves *real forcing*, not just rejection. The **SDK Stop-hook path** is proven by the T7 behavioral test (driving a real `query()` with the hook); wiring the SDK adapter into the eval harness is a larger lift and deferred — the concept's force guarantee is identical for both Tier-1 mechanisms, and T7 covers the SDK-specific hook wiring. ⚠️ If an *MCP-routed live* path is also required (founder's "ideally also an MCP-routed path"), add `fr-forced-return-mcp` driving a cli/remote-shaped adapter with `mcpSupport:true` asserting Tier-2 reject — but that is a reject-path eval (no forcing), so its value is proving the MCP bridge surfaces the return tool for detection (overlaps T8). Recommend: T8 (behavioral) for MCP detection, builtin eval for live forcing; add the MCP eval only if the reviewer insists.

---

## 7. Ordered task list (each independently committable; RED tests first per AC)

1. **T1 — Shared additions.** `AL6_FORCE_RETURN_MESSAGE`, `AL6_MAX_FORCE_RETURNS` in `return-actions.ts`; `SessionOutcome += "not_returned"` (events.ts); `HarnessCapabilities += canForceReturn` (harness-adapter.ts). Export. *`feat(AL6): shared forcing message + not_returned outcome + canForceReturn`.*
2. **T2 — `SessionOutcome` exhaustiveness guard + consumer fixes.** Add the `never` tail to every outcome consumer; set `canForceReturn` on all five real adapters + mock. `check` green. *`feat(AL6): exhaustive not_returned handling + per-adapter canForceReturn`.*
3. **T3 — RED behavioral tests** for AC1/AC3/AC5 (builtin force, Tier-2 reject, mid-turn unaffected) + AC4 parameterized + `canForceReturn` table. *`test(AL6): forcing enforcement red tests`.*
4. **T4 — Builtin force (Tier 1b).** Re-inject `AL6_FORCE_RETURN_MESSAGE` + `continue` instead of `break` when `!returnSeen && forceCount < N`; track `returnSeen` via `isReturnAction`; surface force counter on the session for eval. Make T3's builtin AC1 green. *`feat(AL6): builtin loop force-continue on missing return`.*
5. **T5 — SDK force (Tier 1a).** Wire `options.hooks.Stop` returning `decision:block + reason`; track `returnSeen` in `translateMessage`; `forceCount` budget. *`feat(AL6): SDK Stop-hook forces return before turn end`.*
6. **T6 — Drain Tier-2 reject (site A).** Replace v1 :958-985: `not_returned` verdict → `endSession(...,"not_returned")` + `outcome: "not_returned"` (was `"completed"`). Keep `session_not_returned` emit. Make T3's reject test green. *`feat(AL6): reject not-returned turn as non-completed outcome`.*
7. **T7 — SDK Stop-hook behavioral test (resolves ⚠️ UNVERIFIED-AT-RUNTIME).** Drive a real `query()` (or the SDK's injected `queryFn` test seam, adapter:60) with the hook; assert a stop attempt without a return is re-prompted with the reason. *`test(AL6): SDK Stop hook block+reason forces continuation`.*
8. **T8 — MCP-bridge detection (AC4 risk).** Prove a cli/remote (`mcpSupport`) return tool surfaces a stream `tool_call`; if not, wire the `mcp-bridge.ts` invoke-boundary fallback. *`test(AL6): MCP-bridge return surfaces to gate (+fallback if needed)`.*
9. **T9 — Live eval (DoD).** `force-return.ts` with `fr-forced-return-builder` + `fr-compliant-return-builder` + the three judges; register in `index.ts`. *`feat(AL6): live force-return eval scenarios`.*
10. **T10 — Classifying lint guard.** Kept from v1; ensure turn drains wire gate+forcing, relays/extraction exempt. *`feat(AL6): classifying drain lint guard`.*

Run `npm run check && npm run lint && npm run test` after each; `test:all` once at end; the eval (scenario runner) is a live-LLM lane run locally (per memory: e2e/live-LLM is local-only, never a CI job).

---

## 8. Trade-offs quantified

- **Force (Tier 1) vs reject (Tier 2) vs v1 flag.** v1 flag: 0 forcing, `outcome:"completed"` + side event — founder-rejected (no teeth). Tier-2 reject: ~10 LOC at the drain, changes outcome, uniform, but no second chance for the agent. Tier-1 force: ~15 LOC per force path (SDK hook + builtin loop), gives the agent the re-prompt the spec's "redirect" arm demands. v2 ships force where cheap+native (2 paths) and reject everywhere else — the *guarantee* (never silently completed) is uniform; only the *mechanism* degrades. Cost of full uniform forcing on cli/remote: a new per-adapter mid-session inject protocol = new harness surface (out of scope). Not worth it for v2.
- **SDK in-process hook vs settings.json hook.** In-process `options.hooks.Stop` keeps the forcing logic in TS next to the adapter (one source for the message + predicate), no external hook script, no settings file. ⚠️ costs one runtime-verification item (T7) since the in-process callback's `decision:block` interpretation is type-implied not doc-demonstrated.
- **`not_returned` as a `SessionOutcome` member vs a separate boolean.** Member: forces every consumer to handle it (`check`-time), can never be silently dropped — exactly the AC1 teeth. A side boolean would let a consumer ignore it (the v1 failure shape). Cost: touch every outcome switch (~4 sites) + one exhaustiveness guard. Worth it.
- **Eval on builtin vs SDK.** Builtin: already wired in the eval harness, Tier-1 force, zero new harness plumbing — proves real forcing today. SDK-in-eval: larger lift, deferred to T7 behavioral. The force guarantee is identical across Tier-1 mechanisms, so builtin eval + SDK behavioral test together cover both without the SDK-eval cost.

## 9. Source-driven notes

- SDK hook API: **VERIFIED** against installed `packages/server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (`Options.hooks`, `HookEvent` incl. `Stop`, `HookCallback`, `SyncHookJSONOutput` with `decision/reason/continue/stopReason`) + the Claude Code hooks doc (`decision:block` Stop semantics). ⚠️ `⚠️ UNVERIFIED-AT-RUNTIME`: the in-process `HookCallback` returning a block-object is type-implied; **T7 proves it at runtime** before DoD.
- All other touched contracts (`HarnessAdapter.streamEvents`, `ToolCallEvent`, event bus, `SessionOutcome`) are first-party, read directly from source this pass.
