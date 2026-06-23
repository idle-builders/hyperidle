# Return-Gate Enforcement

Every agent turn that completes normally must invoke one of three return actions before stopping. A turn that doesn't is **never silently recorded as `completed`** — the enforcement is harness-agnostic and the outcome guarantee is uniform across all five in-tree harness adapters.

---

## 1. The Accepted-Return Set

Three tool names form the closed accepted-return set (`RETURN_ACTION_NAMES` in `packages/shared/src/harness/return-actions.ts`):

| Tool | Meaning |
|---|---|
| `submit_review` | Submit work for human or agent review |
| `handoff_to` | Delegate the task to another agent or human |
| `send_message` | Send a result or update to a thread |

The set is **closed**: membership is enumerated in a `readonly` tuple; an `isReturnAction(toolName)` O(1) lookup is the single runtime check. Adding a member requires a deliberate edit to that tuple — there is no "open" fallback.

---

## 2. Exemptions

**Internal-extraction drains** — sessions provisioned with `tools: []` — are structurally exempt. With no tools the agent cannot call any return action; enforcement is impossible, not merely waived. The exemption check is `isInternalExtractionDrain({ tools })` (same file). The `no-ungated-stream-drain` lint rule marks these loops `// AL6-exempt: internal-extraction drain` so the static check skips them.

**Non-completed end-reasons** (`crashed`, `stopped`, `budget_exhausted`) are also exempt. `evaluateReturn(gate, endReason)` returns `"returned"` for any non-`completed` reason — the agent was prevented from finishing, not choosing to skip the return.

---

## 3. Harness-Agnostic Forcing Model

Forcing is universal. Every harness adapter can be forced to re-engage; the mechanism is a provisioning-layer re-prompt loop (Layer B) that is independent of harness type. A second, adapter-specific in-turn fast-path (Layer A) exists as an optimization on two adapters — it does NOT gate whether forcing happens.

### Layer B — Provisioning Re-Prompt Loop (universal, all adapters)

The provisioning loop in `runSession` (`packages/server/src/services/session-provisioning.ts`) owns the forcing budget. After a turn ends without a return action:

1. Check `loopForceCount < AL6_MAX_FORCE_RETURNS` (= 2). If spent, skip to settlement.
2. Check `harness.getCapabilities().canReEngage`. All five in-tree adapters return `true`.
3. Call `rewriteSandboxForcing(sandboxPath, assembledPrompt)` (`packages/server/src/harness/re-engage.ts`), which appends `AL6_FORCE_RETURN_MESSAGE` to the assembled prompt and re-writes both `AGENTS.md` and `CLAUDE.md` in the sandbox directory via `writeSandboxAgentsMd`.
4. Increment `loopForceCount` and loop back to Phase 9 (`harness.startSession`).

**Why the sandbox file is the carrier:** every adapter spawns `cwd: config.sandboxPath`. The cli, isolated, and remote adapters launch subprocesses that read `AGENTS.md`/`CLAUDE.md` at startup. The SDK and builtin adapters also read from the sandbox path on each `startSession`. Writing the forcing message to the sandbox file is the ONE channel that verifiably reaches all five adapters — `config.messages` is consumed only by the builtin adapter's chat path and would not reach external harnesses.

**One gate, one session, one event:** a single `ReturnGate` spans the entire loop. The adapter pool slot is held across all runs and released once via `try/finally` after the loop. Exactly one `session_ended` event is emitted. Cost events from all runs accumulate into the same `totalCostCents`.

### Layer A — Native In-Turn Fast-Path (SDK + builtin only)

Two adapters intercept a stop BEFORE the session ends and re-inject the forcing message without a new `startSession`. This is an optimization — it avoids the latency of a full re-spawn:

- **SDK adapter** (`ClaudeAgentSdkAdapter`): Wires a `Stop` hook in the Claude Agent SDK `query` options. When Claude tries to stop (`end_turn`), the hook calls `shouldForceReturn({ returned }, stopHookCount)`. If the budget is not spent, the hook returns `{ decision: "block", reason: AL6_FORCE_RETURN_MESSAGE }` — the SDK re-injects the reason as a user message and continues the turn without breaking.

- **Builtin adapter** (`BuiltinHarnessAdapter`): Owns its own loop. At two intercept points — (a) the `end_turn` / `stop` branch of `runExecuteTurn`, and (b) the end-of-loop break in `runChatTurn` — the adapter calls `shouldForceReturn({ returned: session.returnSeen }, session.forceCount)`. If the result is non-null, it pushes the forcing message as a user message and continues the loop without setting `session.done = true`. A registry exemption applies: if none of the session's tool defs are return actions (e.g. the `create_bet`/`edit_bet`-only chat path), the force check is skipped — forcing an agent to call a tool it doesn't have would cause a hard error.

Layer-A adapters never reach the Layer-B re-prompt loop on a turn where Layer A resolves the forcing. The two layers are mutually exclusive per turn.

### Capability Fields

`HarnessCapabilities` carries two AL6 fields (in `packages/shared/src/harness/harness-adapter.ts`):

| Field | Type | Meaning |
|---|---|---|
| `hasNativeReturnHook` | `boolean` | `true` = adapter has a Layer-A in-turn fast-path (SDK, builtin). Optimization hint only — does NOT gate whether forcing happens. |
| `canReEngage` | `boolean` | `true` = adapter can run a second `startSession` with augmented context (Layer-B loop). ALL five in-tree adapters: `true`. |

`canReEngage` replaced v2's `canForceReturn`. The rename reflects the architecture change: in v2 forcing was binary (either in-turn or reject-only); in v3 forcing is universal via Layer B, and `canReEngage` is always `true` for in-tree adapters. `hasNativeReturnHook` is the new flag that distinguishes adapters with a Layer-A fast-path.

**In-tree values:**

| Adapter | `hasNativeReturnHook` | `canReEngage` |
|---|---|---|
| SDK (`ClaudeAgentSdkAdapter`) | `true` | `true` |
| Builtin (`BuiltinHarnessAdapter`) | `true` | `true` |
| CLI (`CliHarnessAdapter`) | `false` | `true` |
| Remote (`RemoteHarnessAdapter`) | `false` | `true` |
| Isolated (`IsolatedHarnessAdapter`) | `false` | `true` |

### Forcing Budget

`AL6_MAX_FORCE_RETURNS = 2`. For Layer-B: `loopForceCount` counts re-engages; the loop exits when `loopForceCount >= 2`. For Layer-A adapters: `shouldForceReturn(gate, forceCount)` returns `null` when `forceCount >= 2`, and the adapter allows the stop — the turn then proceeds to Layer-B evaluation in the provisioning drain (but because Layer A has already tried twice, the budget is spent and the loop exits to settlement).

---

## 4. Uniform Outcome Guarantee

On **every** harness, a no-return turn is **never recorded `completed`**:

1. `evaluateReturn(gate, endReason)` returns `"not_returned"`.
2. `runSession` emits `session_not_returned` on the event bus.
3. `endSession` is called with `terminalOutcome: "not_returned"` — this writes `"not_returned"` to the `sessions.outcome` DB column **and** to the `session_ended` bus event's `outcome` field.
4. `provisionSession` / `runSession` returns `{ outcome: "not_returned", returnVerdict: "not_returned" }` to the caller.

`SessionOutcome` (`packages/shared/src/events.ts`) is `"completed" | "crashed" | "stopped" | "not_returned"`. Every `switch(outcome)` consumer must handle all four members.

The mechanism is the same for all harnesses — the difference is only whether Layer A fires first:

| Adapter | Layer-A fast-path | Layer-B loop | Outcome on no-return (budget spent) |
|---|---|---|---|
| SDK adapter | Stop hook blocks + re-injects (up to 2×) | skipped (Layer A resolves in-turn) | `not_returned` |
| Builtin adapter | Loop intercepted + re-injects (up to 2×) | skipped (Layer A resolves in-turn) | `not_returned` |
| CLI adapter | — | sandbox-file rewrite + re-startSession (up to 2×) | `not_returned` |
| Remote adapter | — | sandbox-file rewrite + re-startSession (up to 2×) | `not_returned` |
| Isolated adapter | — | sandbox-file rewrite + re-startSession (up to 2×) | `not_returned` |

In all cases: no `completed` outcome without a return action.

---

## 5. The `ReturnGate` Observer

`packages/server/src/harness/return-gate.ts` defines a lightweight, allocation-free, harness-agnostic observer:

```ts
interface ReturnGate {
  observe(event: HarnessEvent): void;
  readonly returned: boolean;
}
```

One gate is created per turn-span (`createReturnGate()`) and spans all Layer-B loop runs. Every consumed `HarnessEvent` is passed to `gate.observe(event)` — when a `tool_call` event names a return action (`isReturnAction(event.toolName)`), `returned` flips to `true`. `evaluateReturn(gate, endReason)` is called at stream-exhaust to produce the `ReturnVerdict`.

For Layer-A adapters the same `isReturnAction` check runs **inside the adapter** (before the event is yielded) to update the adapter's own `returnSeen` flag, which the Stop hook / loop interceptor reads. Both paths use the same single `isReturnAction` function from `@hyperidle/shared` — no per-adapter copy.

---

## 6. `forceReturnCount` on `ProvisionSessionResult`

```ts
forceReturnCount = loopForceCount + (harness.getForceReturnCount?.(sessionId) ?? 0)
```

- `loopForceCount`: Layer-B re-engages in the provisioning loop (external adapters).
- `harness.getForceReturnCount?(sessionId)`: Layer-A in-turn re-injections (SDK, builtin).

The layers are mutually exclusive per turn, so summing covers both without double-counting. Zero when the agent returned on the first run without any forcing.

`getForceReturnCount` is an optional method on `HarnessAdapter` — only SDK and builtin implement it. External adapters leave it undefined; the `?? 0` fallback applies.

---

## 7. Static Guard: `no-ungated-stream-drain`

The ESLint rule `design/no-ungated-stream-drain` (`packages/eslint-plugin-design/src/rules/no-ungated-stream-drain.ts`) classifies every `for await … of <streamEvents-iterable>` loop as one of:

- **TURN-DRAIN** — must call `gate.observe(event)` in the loop body.
- **RELAY** — loop body passes events through; annotated `// AL6-relay`. Must NOT call `observe`.
- **EXEMPT** — exempt internal-extraction drain; annotated `// AL6-exempt: internal-extraction drain`. Must NOT call `observe`.

A violation (missing `observe`, or wrong classification) is a build error. This ensures future drain sites cannot silently skip the gate.

---

## 8. Live Eval: `force-return` Feature

`packages/eval/src/scenarios/force-return.ts` is the behavioral proof. Four scenarios (local-only, never CI):

```
cd packages/eval && node dist/cli.js --feature force_return
```

- **`fr-compliant-return-builder`** — agent instructed to call `submit_review`. Judges verify: outcome `completed`, `submit_review` called, `forceReturnCount = 0` (no forcing needed).

- **`fr-forced-return-builder`** — agent system prompt explicitly instructs it NOT to call return tools. Judges verify: (1) `forceReturnCount >= 1` (Layer-A forcing fired), (2) outcome is `completed` or `not_returned` — never `completed` with `returnVerdict="not_returned"`, (3) the v1 regression (`completed` + `not_returned` verdict simultaneously) did not occur.

- **`fr-forced-return-external-compliant`** — agent on an external-shaped harness (`hasNativeReturnHook: false`), given a plausible-first-run-ambiguity task. Run 1: agent ends turn without return (natural analysis response). Layer-B loop fires: sandbox `AGENTS.md`/`CLAUDE.md` rewritten with `AL6_FORCE_RETURN_MESSAGE`. Run 2: compliant agent reads the updated file and calls `submit_review`. Judges verify: `forceReturnCount >= 1` AND `outcome = completed` AND `returnVerdict = returned`. **Scored 1.000** — proves forcing converts a real external non-Claude agent into returning.

- **`fr-forced-return-external`** — same external-shaped harness, agent instructed NOT to call return tools. Both re-prompt budget rounds spent. Judges verify: `forceReturnCount >= 1`, `outcome = not_returned` (reject floor). Proves forcing via Layer-B correctly settles `not_returned` when the agent won't comply.

Together `fr-forced-return-external-compliant` (convert success) and `fr-forced-return-external` (reject floor) form complete Layer-B coverage: forcing works on a non-Claude external harness, end-to-end.

---

## 9. Key Constants and Exports (`@hyperidle/shared`)

| Symbol | Location | Value / purpose |
|---|---|---|
| `RETURN_ACTION_NAMES` | `harness/return-actions.ts` | `["submit_review", "handoff_to", "send_message"]` |
| `isReturnAction(name)` | `harness/return-actions.ts` | O(1) membership check |
| `isInternalExtractionDrain(config)` | `harness/return-actions.ts` | Exemption check (`tools.length === 0`) |
| `AL6_FORCE_RETURN_MESSAGE` | `harness/return-actions.ts` | The forcing message text |
| `AL6_MAX_FORCE_RETURNS` | `harness/return-actions.ts` | `2` — budget per turn |
| `shouldForceReturn(gate, count)` | `harness/return-actions.ts` | Pure: returns message or `null` (Layer-A adapters) |
| `SessionOutcome` | `events.ts` | `"completed" \| "crashed" \| "stopped" \| "not_returned"` |
| `SessionNotReturnedEvent` | `events.ts` | Bus event emitted on no-return turns |

### Re-engage helpers (`packages/server/src/harness/`)

| Symbol | Location | Purpose |
|---|---|---|
| `rewriteSandboxForcing(sandboxPath, basePrompt)` | `re-engage.ts` | Layer-B carrier: appends `AL6_FORCE_RETURN_MESSAGE` and rewrites `AGENTS.md` + `CLAUDE.md` |
| `createReturnGate()` | `return-gate.ts` | Creates the per-turn-span observer |
| `evaluateReturn(gate, endReason)` | `return-gate.ts` | Produces `ReturnVerdict` at stream-exhaust |
