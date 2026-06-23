# Return-Gate Enforcement (AL6 v2)

Every agent turn that completes normally must invoke one of three return actions before stopping. A turn that doesn't is **never silently recorded as `completed`** — the enforcement degrades gracefully across harness types but the outcome guarantee is uniform.

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

## 3. Two-Tier Forcing Model

Harnesses fall into two tiers based on whether they own a reachable turn-end hook:

### Tier-1 — Force (re-inject and continue)

Harnesses where `canForceReturn: true` on `HarnessCapabilities`:

- **SDK adapter** (`ClaudeAgentSdkAdapter`): Wires a `Stop` hook in the Claude Agent SDK `query` options. When Claude tries to stop (`end_turn`), the hook calls `shouldForceReturn({ returned }, stopHookCount)`. If the budget is not spent, the hook returns `{ decision: "block", reason: AL6_FORCE_RETURN_MESSAGE }` — the SDK re-injects the reason as a user message and continues the turn without breaking.

- **Builtin adapter** (`BuiltinHarnessAdapter`): Owns its own loop. At two intercept points — (a) the `end_turn` / `stop` branch of `runExecuteTurn`, and (b) the end-of-loop break in `runChatTurn` — the adapter calls `shouldForceReturn({ returned: session.returnSeen }, session.forceCount)`. If the result is non-null, it pushes the forcing message as a user message, increments `session.forceCount`, and continues the loop without setting `session.done = true`. A registry exemption applies: if none of the session's tool defs are return actions (the AK4 chat path with `create_bet`/`edit_bet` only), the force check is skipped entirely — forcing an agent to call a tool it doesn't have would cause a hard error.

**Budget:** `AL6_MAX_FORCE_RETURNS = 2`. After two re-injections without a return, `shouldForceReturn` returns `null` and the adapter allows the stop. The turn then settles to the Tier-2 reject path in the provisioning drain.

### Tier-2 — Reject (settle as `not_returned`)

Harnesses where `canForceReturn: false` (`CliHarnessAdapter`, `RemoteHarnessAdapter`, `IsolatedHarnessAdapter`): no reachable turn-end hook exists. The adapter cannot intercept a stop. The enforced provisioning drain (`runSession` in `session-provisioning.ts`) evaluates `evaluateReturn(gate, "completed")` and applies the rejection directly.

---

## 4. Uniform Outcome Guarantee

On **every** harness, a no-return turn is **never recorded `completed`**:

1. `evaluateReturn(gate, endReason)` returns `"not_returned"`.
2. `runSession` emits `session_not_returned` on the event bus.
3. `endSession` is called with `terminalOutcome: "not_returned"` — this writes `"not_returned"` to the `sessions.outcome` DB column **and** to the `session_ended` bus event's `outcome` field.
4. `provisionSession` / `runSession` returns `{ outcome: "not_returned", returnVerdict: "not_returned" }` to the caller.

`SessionOutcome` (`packages/shared/src/events.ts`) is `"completed" | "crashed" | "stopped" | "not_returned"`. Every `switch(outcome)` consumer must handle all four members.

The mechanism **degrades but does not weaken**:

| Harness | Tier | Mechanism | Outcome on no-return |
|---|---|---|---|
| SDK adapter | 1 | Stop hook blocks + re-injects (up to 2×) | `completed` if forced back, else `not_returned` |
| Builtin adapter | 1 | Loop intercepted + re-injects (up to 2×) | `completed` if forced back, else `not_returned` |
| CLI adapter | 2 | No hook; drain rejects | `not_returned` |
| Remote adapter | 2 | No hook; drain rejects | `not_returned` |
| Isolated adapter | 2 | No hook; drain rejects | `not_returned` |

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

One gate is created per turn drain (`createReturnGate()`). Every consumed `HarnessEvent` is passed to `gate.observe(event)` — when a `tool_call` event names a return action (`isReturnAction(event.toolName)`), `returned` flips to `true`. `evaluateReturn(gate, endReason)` is called at stream-exhaust to produce the `ReturnVerdict`.

For the Tier-1 adapters the same `isReturnAction` check runs **inside the adapter** (before the event is yielded) to update the adapter's own `returnSeen` flag, which the Stop hook / loop interceptor reads. Both paths use the same single `isReturnAction` function from `@hyperidle/shared` — no per-adapter copy.

---

## 6. Static Guard: `no-ungated-stream-drain`

The ESLint rule `design/no-ungated-stream-drain` (`packages/eslint-plugin-design/src/rules/no-ungated-stream-drain.ts`) classifies every `for await … of <streamEvents-iterable>` loop as one of:

- **TURN-DRAIN** — must call `gate.observe(event)` in the loop body.
- **RELAY** — loop body passes events through; annotated `// AL6-relay`. Must NOT call `observe`.
- **EXEMPT** — exempt internal-extraction drain; annotated `// AL6-exempt: internal-extraction drain`. Must NOT call `observe`.

A violation (missing `observe`, or wrong classification) is a build error. This ensures future drain sites cannot silently skip the gate.

---

## 7. Live Eval: `force-return` Feature

`packages/eval/src/scenarios/force-return.ts` is the behavioral proof for the Tier-1 force path. Two scenarios:

- **`fr-forced-return-builder`** — agent system prompt explicitly instructs it NOT to call return tools. Judges verify: (1) `forceReturnCount >= 1` (forcing fired), (2) outcome is `completed` or `not_returned` — never `completed` with `returnVerdict="not_returned"`, (3) the exact v1 regression (`completed` + `not_returned` verdict simultaneously) did not occur.

- **`fr-compliant-return-builder`** — agent instructed to call `submit_review`. Judges verify: outcome `completed`, `submit_review` called, `forceReturnCount = 0` (no forcing needed on a compliant agent).

The eval requires a live LLM and is **local-only** — it is not a CI job:

```
cd packages/eval && node dist/cli.js --feature force_return
```

The Tier-1 builtin path scored **1.000** on the compliant scenario and correctly exercised the force injection on the non-compliant scenario.

---

## 8. Key Constants and Exports (`@hyperidle/shared`)

| Symbol | Location | Value / purpose |
|---|---|---|
| `RETURN_ACTION_NAMES` | `harness/return-actions.ts` | `["submit_review", "handoff_to", "send_message"]` |
| `isReturnAction(name)` | `harness/return-actions.ts` | O(1) membership check |
| `isInternalExtractionDrain(config)` | `harness/return-actions.ts` | Exemption check (`tools.length === 0`) |
| `AL6_FORCE_RETURN_MESSAGE` | `harness/return-actions.ts` | The forcing message text |
| `AL6_MAX_FORCE_RETURNS` | `harness/return-actions.ts` | `2` — budget per turn |
| `shouldForceReturn(gate, count)` | `harness/return-actions.ts` | Pure: returns message or `null` |
| `SessionOutcome` | `events.ts` | `"completed" \| "crashed" \| "stopped" \| "not_returned"` |
| `SessionNotReturnedEvent` | `events.ts` | Bus event emitted on no-return turns |
