# Return-Gate Enforcement

Every agent turn that completes normally must invoke one of three return actions before stopping. A turn that doesn't is **never silently recorded as `completed`** — enforcement is provisioned per-harness at sandbox setup time, adjudicated by HyperIdle via a real HTTP route, and backstopped by a drain-end `ReturnGate` that no harness can bypass.

Test-side honesty (the four-harness matrix, locked test models, lint guard) is a separate mechanism — see [harness-coverage-enforcement.md](harness-coverage-enforcement.md).

---

## 1. The Accepted-Return Set

Three tool names form the closed accepted-return set (`RETURN_ACTION_NAMES` in `packages/shared/src/harness/return-actions.ts`):

| Tool | Meaning |
|---|---|
| `submit_review` | Submit work for human or agent review |
| `handoff_to` | Delegate the task to another agent or human |
| `send_message` | Send a result or update to a thread |

The set is **closed**: membership is enumerated in a `readonly` tuple; `isReturnAction(toolName)` is an O(1) lookup and the single runtime check. Adding a member requires a deliberate edit to that tuple — there is no open fallback.

**Dialect-prefix stripping (AR2 W1 fix):** CLI harnesses route tool calls through the MCP bridge, and each dialect decorates the tool name. The MCP protocol namespaces with the server prefix (`mcp__<server>__<tool>`, e.g. `mcp__hyperidle__submit_review`); OpenCode exposes tools as `<server>_<bare-name>` (e.g. `hyperidle_submit_review`). Before AR2, `isReturnAction` received the raw decorated name and returned `false` — causing CLI-harness turns that called a return action to be recorded as `not_returned`. A module-private `stripMcpNamespace(toolName)` in `return-actions.ts` strips both the `mcp__<server>__` prefix and the opencode `hyperidle_` prefix before the membership check. `isReturnAction` calls it internally, so all callers get correct behaviour without knowing the transport layer.

---

## 2. Exemptions

**Internal-extraction drains** — sessions provisioned with `tools: []` — are structurally exempt. With no tools the agent cannot call any return action; enforcement is impossible, not merely waived. The exemption check is `isInternalExtractionDrain({ tools })` (same file). The `no-ungated-stream-drain` lint rule marks these loops `// AL6-exempt: internal-extraction drain` so the static check skips them.

**Non-completed end-reasons** (`crashed`, `stopped`, `budget_exhausted`) are also exempt. `evaluateReturn(gate, endReason)` returns `"returned"` for any non-`completed` reason — the agent was prevented from finishing, not choosing to skip the return.

---

## 3. Per-Harness Native Enforcement

### Overview

v4 replaces the v3 outer re-prompt loop with per-harness enforcement provisioned once at sandbox setup. `provisionReturnHook` (`packages/server/src/harness/provision-return-hook.ts`) is called at Phase 8b in `session-provisioning.ts`, just after `.mcp.json` is written and **before** `startSession`. It dispatches on `HarnessCapabilities.returnEnforcement` — a non-optional `ReturnEnforcementChannel` that every adapter must declare.

The channel type is defined in `packages/shared/src/harness/harness-adapter.ts` as:

```
"sdk-inprocess" | "settings-claude" | "settings-codex" |
"builtin-loop" | "process-reengage" | "soft-continue" | "none"
```

`sdk-inprocess` is dead — no adapter declares it since claude-code moved to the CLI adapter and `settings-claude`; it survives only in the type union. Because the field is non-optional, `npm run check` fails any adapter that doesn't declare a channel — the "uniform across harnesses" guarantee is enforced at the type level.

### Adjudication: `POST /api/mcp/:token/return-status`

All file-provisioned hooks (claude-code, codex) reach HyperIdle via a plain-HTTP route defined in `packages/server/src/routes/mcp-route.ts`:

```
POST /api/mcp/:token/return-status
Authorization: Bearer <token>
Body: {} (ignored)

Response 200 — empty body       → allow stop
Response 200 — non-empty body   → forceMessage; hook must block
Response 401                    → Authorization header missing the token
```

401 fires only when the `Authorization` header does not contain the token (belt-and-suspenders — the token is already in the URL path). An unknown or already-ended token returns **200 with an empty body** (allow stop — the session drain already recorded the outcome).

The route resolves the bearer token to a `sessionId` via `McpBridgeRegistry.lookup`, then reads the per-session `EnforcementEntry` from the `EnforcementRegistry`. It calls `shouldForceReturn(entry.gate, entry.forceCount)` and, if a force message is returned, increments `entry.forceCount` and returns the message as the response body.

### The Per-Session Enforcement Registry

`packages/server/src/harness/return-enforcement-registry.ts` provides a `Map<sessionId, EnforcementEntry>` keyed by session UUID. Each entry holds:

- `gate: { returned: boolean }` — live reference to the drain `ReturnGate`; mutated by the event-stream observer.
- `forceCount: number` — how many times the hook has fired for this session.
- `exempt: boolean` — true for internal-extraction drains.

The registry is the single source of truth for force budget tracking. It is registered before `startSession` and unregistered at session teardown.

---

## 4. Per-Harness Mechanism

### `claude-code` — `settings-claude`

`provisionReturnHook` writes two files into the sandbox:

1. **`.claude/return-check.sh`** — a shell script that `curl`s the bridge (`POST /api/mcp/:token/return-status`). If the response body is non-empty (forceMessage), it writes to stderr and exits 2. If empty, it exits 0 (allow stop).
2. **`.claude/settings.json`** — contains `enableAllProjectMcpServers: true` (workspace trust marker — without this Claude Code silently ignores project-level hooks) and a `hooks.Stop` entry whose `command` is `.claude/return-check.sh`.

**Blocking protocol:** exit-2 + stderr. Claude Code re-prompts with the stderr content as a blocking user message.

**Proof:** `AL6-real-harness-return-enforcement-realbinary.integration.test.ts` — "FULL BINARY PROOF (claude)" spawns the real `claude` binary (`buildCleanEnv` zeroes `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT`/etc. so nested-session detection is bypassed; keychain auth still works via `HOME`/`PATH`). Turn completes → Stop hook fires → bridge receives `POST` → `callCount >= 1` asserted.

### `codex` — `settings-codex` (CODEX_HOME strategy)

Codex reads hooks **only** from `CODEX_HOME/hooks.json` (default `~/.codex/hooks.json`). A project-local `.codex/hooks.json` is silently ignored. v4 provisions a **per-session CODEX_HOME** at `<sandboxPath>/.codex-home/`:

1. Copies **only `auth.json` and `config.toml`** from `~/.codex`. SQLite database files (`.sqlite`, `.sqlite-wal`, `.sqlite-shm`) are intentionally excluded — copying them triggers a file lock that causes codex to exit before making an LLM call. When `auth.json`/`config.toml` are absent, codex falls back to env-based auth (`OPENAI_API_KEY`).
2. Writes `hooks.json` into `.codex-home/` with the nested format codex v0.141.0 requires:
   ```json
   { "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "..." }] }] } }
   ```
   The flat format `{ "Stop": { "command": "..." } }` is silently ignored by codex — the nested format is the only working shape.
3. Writes `return-check.sh` into `.codex-home/`.

`CliHarnessAdapter.startSession` detects the `.codex-home/` directory in the sandbox and injects `CODEX_HOME=<sandboxPath>/.codex-home` into the spawn env plus `--dangerously-bypass-hook-trust` on the command line to bypass the hook hash-check.

**Blocking protocol:** `{"decision":"block","reason":"..."}` on stdout (not exit-2 + stderr like Claude Code). Exit 0 with this JSON output blocks the stop and re-prompts with the reason. Exit 0 with no JSON (or `{"decision":"approve"}`) allows the stop.

**Proof:** `AL6-real-harness-return-enforcement-realbinary.integration.test.ts` — "FULL BINARY PROOF (CODEX_HOME)" proves end-to-end: real `codex exec` binary, per-session CODEX_HOME, Stop hook fires, bridge POST received, `callCount >= 1` asserted.

### `opencode` — `process-reengage`

OpenCode has no native blocking Stop hook. Enforcement is via **process wrapper re-invocation**: `CliHarnessAdapter` owns the `opencode run` spawn, parses `step_finish` events in the stdout stream at turn-end, then re-invokes `opencode run <forceMessage>` with the forcing message as a positional argument (`run-arg` carrier).

`provisionReturnHook` writes `.opencode/plugins/return-signal.ts` (a plugin that listens on `session.idle`), but plugin auto-load from a project-local `.opencode/` directory is not supported by the current opencode release. The operative enforcement path is the process wrapper.

Re-engage is bounded by `AL6_MAX_FORCE_RETURNS`. The `CliSession.reEngageCount` counter tracks re-spawns; when the budget is spent, the session ends and the drain-gate floor settles the verdict.

**Proof:** `AL6-real-harness-return-enforcement-realbinary.integration.test.ts` — the live process-reengage proof spawns the real opencode binary, detects `step_finish` on the first turn, fires the re-engage spawn with the forcing message, and confirms both turns complete.

### `builtin` — `builtin-loop`

`provisionReturnHook` is a no-op for `builtin-loop`. The builtin harness (`BuiltinHarnessAdapter`) owns its own loop. At two intercept points — `end_turn`/`stop` in `runExecuteTurn` and end-of-loop break in `runChatTurn` — the adapter calls `shouldForceReturn({ returned: session.returnSeen }, session.forceCount)`. If non-null, it pushes the forcing message as a user message and continues the loop without setting `session.done = true`.

An exemption applies: if none of the session's tool defs are return actions (e.g. the `create_bet`/`edit_bet`-only chat path), the force check is skipped — forcing an agent to call a tool it doesn't have causes a hard error.

### `cursor-agent` — `soft-continue` (inert)

Cursor Agent is not spawnable today (`cursor-agent` binary unavailable; no documented headless CLI surface). `provisionReturnHook` is a no-op for `soft-continue`. No sessions are started, so nothing to enforce. The drain-gate floor handles any future surface.

---

## 5. Forcing Budget

`AL6_MAX_FORCE_RETURNS = 2` (`packages/shared/src/harness/return-actions.ts`). The budget is enforced via `shouldForceReturn(gate, forceCount)`:

- Returns the `AL6_FORCE_RETURN_MESSAGE` string when `!gate.returned && forceCount < AL6_MAX_FORCE_RETURNS`.
- Returns `null` when budget is exhausted or the agent already returned.

Each hook invocation that returns a force message increments `entry.forceCount` in the enforcement registry (via the `/return-status` route or the in-process registry call). When `forceCount >= 2`, `shouldForceReturn` returns `null` and the hook allows the stop — the session proceeds to drain-gate evaluation.

---

## 6. Uniform Outcome Guarantee

On **every** harness, a no-return turn is **never recorded `completed`**:

1. `evaluateReturn(gate, endReason)` (`packages/server/src/harness/return-gate.ts`) returns `"not_returned"`.
2. `runSession` emits `session_not_returned` on the event bus.
3. `endSession` is called with `terminalOutcome: "not_returned"` — writes `"not_returned"` to `sessions.outcome` in the DB **and** to the `session_ended` bus event's `outcome` field.
4. `provisionSession`/`runSession` returns `{ outcome: "not_returned", returnVerdict: "not_returned" }` to the caller.

`SessionOutcome` (`packages/shared/src/events.ts`) is `"completed" | "crashed" | "stopped" | "not_returned"`. Every `switch(outcome)` consumer must handle all four members.

### The Backstop

The drain-end `ReturnGate` is the un-bypassable backstop. Even if an agent strips its own hook config file, the drain still evaluates `evaluateReturn(gate, endReason)` at stream-exhaust. An agent can prevent the hook from firing; it cannot prevent the drain-gate verdict from recording `not_returned`.

| Adapter | Channel | Native enforcement | Backstop |
|---|---|---|---|
| `BuiltinHarnessAdapter` | `builtin-loop` | In-process loop intercept + re-injects | drain-gate floor |
| `CliHarnessAdapter` (claude-code) | `settings-claude` | Stop hook exit-2+stderr blocks | drain-gate floor |
| `CliHarnessAdapter` (codex) | `settings-codex` | Stop hook decision:block JSON blocks | drain-gate floor |
| `CliHarnessAdapter` (opencode) | `process-reengage` | Process wrapper re-invokes with forcing message | drain-gate floor |
| `RemoteHarnessAdapter` | `process-reengage` | Re-engage via forcing message | drain-gate floor |
| cursor-agent | `soft-continue` | Inert today | drain-gate floor |

---

## 7. The `ReturnGate` Observer

`packages/server/src/harness/return-gate.ts` defines a lightweight, allocation-free, harness-agnostic observer:

```ts
interface ReturnGate {
  observe(event: HarnessEvent): void;
  readonly returned: boolean;
}
```

One gate is created per session (`createReturnGate()`). Every consumed `HarnessEvent` is passed to `gate.observe(event)` — when a `tool_call` event names a return action (`isReturnAction(event.toolName)`), `returned` flips to `true`. `evaluateReturn(gate, endReason)` is called at stream-exhaust to produce the `ReturnVerdict`.

The gate reference is stored in the enforcement registry entry so the `/return-status` route can read `entry.gate.returned` without threading state through the hook callback.

---

## 8. `forceReturnCount` on `ProvisionSessionResult`

`computeForceReturnCount` (session-provisioning.ts) **sums two sources** at session teardown:

```ts
const registryForceCount = enforcementRegistry.get(sessionId)?.forceCount ?? 0;
const adapterForceCount = harness.getForceReturnCount?.(sessionId) ?? 0;
return registryForceCount + adapterForceCount;
```

The registry is the primary source (incremented by the `/return-status` route); `getForceReturnCount` (optional method on `HarnessAdapter`) supplements for adapters that maintain their own in-process counter (builtin: `session.forceCount`). Zero when no forcing was needed — and `forceCount = 0` on a `not_returned` outcome is an honest signal that the hook never fired (inspect hook provisioning + endpoint wiring), never a drain fallback.

---

## 9. Static Guard: `no-ungated-stream-drain`

The ESLint rule `design/no-ungated-stream-drain` (`packages/eslint-plugin-design/src/rules/no-ungated-stream-drain.ts`) classifies every `for await … of <streamEvents-iterable>` loop as one of:

- **TURN-DRAIN** — must call `gate.observe(event)` in the loop body.
- **RELAY** — loop body passes events through; annotated `// AL6-relay`. Must NOT call `observe`.
- **EXEMPT** — exempt internal-extraction drain; annotated `// AL6-exempt: internal-extraction drain`. Must NOT call `observe`.

A violation is a build error. Future drain sites cannot silently skip the gate.

---

## 10. Live Evals: `force-return` Feature

`packages/eval/src/scenarios/force-return.ts` — behavioral proof, local-only, never CI:

```
cd packages/eval && node dist/cli.js --feature force_return
```

Four scenarios:

- **`fr-compliant-return-builder`** — agent instructed to call `submit_review`. Judges verify: outcome `completed`, `submit_review` called, `forceReturnCount = 0`.

- **`fr-forced-return-builder`** — agent instructed NOT to call return tools (in-process enforcement). Judges verify: `forceReturnCount >= 1`, outcome is `completed` or `not_returned`, and the v1 regression (`completed` + `returnVerdict="not_returned"` simultaneously) did not occur.

- **`fr-forced-return-external-compliant`** — agent on a `process-reengage`-shaped harness; first run ends without a return action (natural analysis response). Re-engage fires: second spawn with forcing message. Agent reads the forcing message and calls `submit_review`. Judges verify: `forceReturnCount >= 1`, `outcome = completed`, `returnVerdict = returned` — proves re-engage converts a real external non-Claude agent into returning.

- **`fr-forced-return-external`** — same shape, agent instructed NOT to return. Both re-engage budget rounds spent. Judges verify: `forceReturnCount >= 1`, `outcome = not_returned`. Proves the reject floor holds when the agent won't comply.

Together the two external scenarios form complete process-reengage coverage: forcing works and the floor holds.

---

## 11. Real-Harness Integration Tests

`packages/server/src/harness/__tests__/AL6-real-harness-return-enforcement-realbinary.integration.test.ts` covers the four supported harnesses in a single file (AR6 consolidation — the former scripted in-process anchor file was merged into this file).

Each real-binary lane is gated by `requireHarness(<name>)` (hard-fail, never skip) + an inner auth check. Runs locally via `test:integration`'s serial `harness` project; the signed attestation carries the result.

| Harness | Proof |
|---|---|
| `claude-code` | "FULL BINARY PROOF (claude)" — `buildCleanEnv` zeroes CC env vars; Stop hook fires; bridge `callCount >= 1` |
| `codex` | "FULL BINARY PROOF (CODEX_HOME)" — per-session `.codex-home/`; `CODEX_HOME` injected; Stop hook fires; bridge `callCount >= 1` |
| `opencode` | live process-reengage proof — `step_finish` detected; re-engage spawn fires with forcing message; both turns complete |
| `builtin` | realbinary block covers provisioning no-op + real route forcing |

Real-binary tests are local-only (require binary + auth). The deterministic builtin anchor — `forceCount >= 1` on a no-return stub, `outcome = completed` on a returning stub — lives in `AL6-builtin-enforcement.test.ts` (unit test) and runs without any real binary or LLM call.
