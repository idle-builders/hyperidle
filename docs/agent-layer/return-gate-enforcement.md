# Return-Gate Enforcement

Every agent turn that completes normally must invoke one of four return actions before stopping. A turn that doesn't is **never silently recorded as `completed`** — enforcement is provisioned per-harness at sandbox setup time, adjudicated by HyperIdle via a real HTTP route, and backstopped by a drain-end `ReturnGate` that no harness can bypass.

Test-side honesty (the five-harness matrix, locked test models) is a separate mechanism — see [harness-coverage-enforcement.md](harness-coverage-enforcement.md), which also records that its execution-level floor was deleted with the attestation.

---

## 1. The Accepted-Return Set

Four tool names form the closed accepted-return set (`RETURN_ACTION_NAMES` in `framework/harness-protocol/src/harness/return-actions.ts`):

| Tool | Meaning |
|---|---|
| `submit_review` | Submit work for human or agent review |
| `handoff_to` | Delegate the task to another agent or human |
| `send_message` | Send a result or update to a thread |
| `reply` | Answer the person or agent who triggered this session (posts into the session's calling thread, or a direct thread with the sole human user when the session has no calling thread) |

The set is **closed**: membership is enumerated in a `readonly` tuple; `isReturnAction(toolName)` is an O(1) lookup and the single runtime check. Adding a member requires a deliberate edit to that tuple — there is no open fallback.

**Dialect-prefix stripping (AR2 W1 fix):** CLI harnesses route tool calls through the MCP bridge, and each dialect decorates the tool name. The MCP protocol namespaces with the server prefix (`mcp__<server>__<tool>`, e.g. `mcp__hyperidle__submit_review`); OpenCode exposes tools as `<server>_<bare-name>` (e.g. `hyperidle_submit_review`). Before AR2, `isReturnAction` received the raw decorated name and returned `false` — causing CLI-harness turns that called a return action to be recorded as `not_returned`. A module-private `stripMcpNamespace(toolName)` in `return-actions.ts` strips both the `mcp__<server>__` prefix and the opencode `hyperidle_` prefix before the membership check. `isReturnAction` calls it internally, so all callers get correct behaviour without knowing the transport layer.

---

## 2. Exemptions

**Internal-extraction drains** — sessions provisioned with `tools: []` — are structurally exempt. With no tools the agent cannot call any return action; enforcement is impossible, not merely waived. The exemption check is `isInternalExtractionDrain({ tools })` (same file). The `no-ungated-stream-drain` lint rule marks these loops `// return-exempt: internal-extraction drain` so the static check skips them.

**Non-completed end-reasons** (`crashed`, `stopped`) are also exempt. `evaluateReturn(gate, endReason)` returns `"returned"` for any non-`completed` reason — the agent was prevented from finishing, not choosing to skip the return.

---

## 3. Per-Harness Native Enforcement

### Overview

v4 replaces the v3 outer re-prompt loop with per-harness enforcement provisioned once at sandbox setup. `provisionReturnHook` (`layers/agent-execution/harness-registry/src/provision-return-hook.ts`) is called by the run provisioner (`layers/agent-orchestration/run-orchestration/src/provisioner.ts`), just after `.mcp.json` is written and **before** `startSession`. It dispatches on `HarnessCapabilities.returnEnforcement` — a non-optional `ReturnEnforcementChannel` that every adapter must declare.

The channel type is defined in `framework/harness-protocol/src/harness/harness-adapter.ts` as:

```
"sdk-inprocess" | "settings-claude" | "settings-codex" |
"process-reengage" | "soft-continue" | "none"
```

`sdk-inprocess` is dead — no adapter declares it since claude-code moved to the CLI adapter and `settings-claude`; it survives only in the type union. Because the field is non-optional, `npm run check` fails any adapter that doesn't declare a channel — the "uniform across harnesses" guarantee is enforced at the type level.

### Adjudication: `POST /api/mcp/:token/return-status`

All file-provisioned hooks (claude-code, codex) reach HyperIdle via a plain-HTTP route defined in `layers/agent-execution/harness-registry/src/mcp/mcp-route.ts`:

```
POST /api/mcp/:token/return-status
Authorization: Bearer <token>
Body: {} (ignored)

Response 200 — empty body       → allow stop
Response 200 — non-empty body   → forceMessage; hook must block
Response 401                    → Authorization header missing the token
```

401 fires only when the `Authorization` header does not contain the token (belt-and-suspenders — the token is already in the URL path). An unknown or already-ended token returns **200 with an empty body** (allow stop — the session drain already recorded the outcome).

The route resolves the bearer token to a `sessionId` via the injected `McpSessionRegistry.lookup`, then reads the per-session `EnforcementEntry` from the `EnforcementRegistry`. It calls `shouldForceReturn(entry.gate, entry.forceCount)` and, if a force message is returned, increments `entry.forceCount` and returns the message as the response body.

### The Per-Session Enforcement Registry

`layers/agent-execution/harness-registry/src/return-enforcement.ts` provides a `Map<sessionId, EnforcementEntry>` keyed by session UUID (`EnforcementEntry` and `EnforcementRegistry` are declared in `framework/harness-protocol/src/harness/enforcement-registry.ts`). Each entry holds:

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

**Proof:** `real-harness-return-enforcement-realbinary.integration.test.ts` — "FULL BINARY PROOF (claude)" spawns the real `claude` binary (`buildCleanEnv` zeroes `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT`/etc. so nested-session detection is bypassed; keychain auth still works via `HOME`/`PATH`). Turn completes → Stop hook fires → bridge receives `POST` → `callCount >= 1` asserted.

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

**Proof:** `real-harness-return-enforcement-realbinary.integration.test.ts` — "FULL BINARY PROOF (CODEX_HOME)" proves end-to-end: real `codex exec` binary, per-session CODEX_HOME, Stop hook fires, bridge POST received, `callCount >= 1` asserted.

### `opencode` — `process-reengage`

OpenCode has no native blocking Stop hook. Enforcement is via **process wrapper re-invocation**: `CliHarnessAdapter` owns the `opencode run` spawn, parses `step_finish` events in the stdout stream at turn-end, then re-invokes `opencode run <forceMessage>` with the forcing message as a positional argument (`run-arg` carrier).

`provisionReturnHook` writes `.opencode/plugins/return-signal.ts` (a plugin that listens on `session.idle`), but plugin auto-load from a project-local `.opencode/` directory is not supported by the current opencode release. The operative enforcement path is the process wrapper.

Re-engage is bounded by `MAX_FORCE_RETURNS`. The `CliSession.reEngageCount` counter tracks re-spawns; when the budget is spent, the session ends and the drain-gate floor settles the verdict.

**Proof:** `real-harness-return-enforcement-realbinary.integration.test.ts` — the live process-reengage proof spawns the real opencode binary, detects `step_finish` on the first turn, fires the re-engage spawn with the forcing message, and confirms both turns complete.

> **Removed: the `builtin-loop` channel.** The built-in harness owned its own loop and intercepted
> turn-end in process, so `provisionReturnHook` was a no-op for it — it wrote no file and spawned
> nothing, which made its "live proof" a proof that nothing happened. The harness and the channel are
> both gone. Every channel that remains provisions a real artifact a real binary reads.

### `cursor-agent` — `none`

`CURSOR_AGENT_CLI_CONFIG` declares `returnEnforcementChannel: "none"`, so `provisionReturnHook` writes no artifact. Cursor Agent runs headless via `--print --output-format stream-json` with the same event shapes as claude, so sessions do start and do need a verdict — the drain-gate floor is the only enforcement it has. Auth is inherited from the Cursor login; `--trust` + `--approve-mcps` allow headless workspace + MCP without interactive prompts.

---

## 5. Forcing Budget

`MAX_FORCE_RETURNS = 2` (`framework/harness-protocol/src/harness/return-actions.ts`). The budget is enforced via `shouldForceReturn(gate, forceCount)`:

- Returns the `FORCE_RETURN_MESSAGE` string when `!gate.returned && forceCount < MAX_FORCE_RETURNS`.
- Returns `null` when budget is exhausted or the agent already returned.

Each hook invocation that returns a force message increments `entry.forceCount` in the enforcement registry (via the `/return-status` route or the in-process registry call). When `forceCount >= 2`, `shouldForceReturn` returns `null` and the hook allows the stop — the session proceeds to drain-gate evaluation.

---

## 6. Uniform Outcome Guarantee

On **every** harness, a no-return turn is **never recorded `completed`**:

1. `evaluateReturn(gate, endReason)` returns `"not_returned"`. It is a deps field wired to the enforcement registry's `evaluate` method in `layers/core-api/src/services/run-orchestration-composition.ts`.
2. `runSession` emits `session_not_returned` on the event bus.
3. `endSession` is called with `terminalOutcome: "not_returned"` — writes `"not_returned"` to `sessions.outcome` in the DB **and** to the `session_ended` bus event's `outcome` field.
4. `provisionSession`/`runSession` returns `{ outcome: "not_returned", returnVerdict: "not_returned" }` to the caller.

`SessionOutcome` (`framework/domain-model/src/events.ts`) is `"completed" | "crashed" | "stopped" | "not_returned"`. Every `switch(outcome)` consumer must handle all four members.

### The Backstop

The drain-end `ReturnGate` is the un-bypassable backstop. Even if an agent strips its own hook config file, the drain still evaluates `evaluateReturn(gate, endReason)` at stream-exhaust. An agent can prevent the hook from firing; it cannot prevent the drain-gate verdict from recording `not_returned`.

| Adapter | Channel | Native enforcement | Backstop |
|---|---|---|---|
| `CliHarnessAdapter` (claude-code) | `settings-claude` | Stop hook exit-2+stderr blocks | drain-gate floor |
| `CliHarnessAdapter` (codex) | `settings-codex` | Stop hook decision:block JSON blocks | drain-gate floor |
| `CliHarnessAdapter` (opencode) | `process-reengage` | Process wrapper re-invokes with forcing message | drain-gate floor |
| `RemoteHarnessAdapter` | `process-reengage` | Re-engage via forcing message | drain-gate floor |
| `CliHarnessAdapter` (cursor-agent) | `none` | None declared | drain-gate floor |

---

## 7. The `ReturnGate` Observer

`layers/agent-execution/harness-registry/src/return-enforcement.ts` defines a lightweight, allocation-free, harness-agnostic observer:

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

`computeForceReturnCount` (`layers/agent-orchestration/run-orchestration/src/provisioner.ts`) **sums two sources** at session teardown:

```ts
const registryForceCount = enforcementRegistry.get(sessionId)?.forceCount ?? 0;
const adapterForceCount = harness.getForceReturnCount?.(sessionId) ?? 0;
return registryForceCount + adapterForceCount;
```

The registry is the primary source (incremented by the `/return-status` route); `getForceReturnCount` (optional method on `HarnessAdapter`) supplements for an adapter that maintains its own in-process counter. Zero when no forcing was needed — and `forceCount = 0` on a `not_returned` outcome is an honest signal that the hook never fired (inspect hook provisioning + endpoint wiring), never a drain fallback.

---

## 9. Static Guard: `no-ungated-stream-drain`

The ESLint rule `design/no-ungated-stream-drain` (`tools/eslint-plugin-design/src/rules/no-ungated-stream-drain.ts`) classifies every `for await … of <streamEvents-iterable>` loop as one of:

- **TURN-DRAIN** — must call `gate.observe(event)` in the loop body.
- **RELAY** — loop body passes events through; annotated `// return-relay`. Must NOT call `observe`.
- **EXEMPT** — exempt internal-extraction drain; annotated `// return-exempt: internal-extraction drain`. Must NOT call `observe`.

A violation is a build error. Future drain sites cannot silently skip the gate.

---

## 10. Live Evals: `force-return` Feature

`tools/eval/src/scenarios/force-return.ts` — behavioral proof, local-only, never CI:

```
npm run eval -- --feature force_return
```

Four scenarios:

- **`fr-compliant-return-builder`** — agent instructed to call `submit_review`. Judges verify: outcome `completed`, `submit_review` called, `forceReturnCount = 0`.

- **`fr-forced-return-builder`** — agent instructed NOT to call return tools (in-process enforcement). Judges verify: `forceReturnCount >= 1`, outcome is `completed` or `not_returned`, and the v1 regression (`completed` + `returnVerdict="not_returned"` simultaneously) did not occur.

- **`fr-forced-return-external-compliant`** — agent on a `process-reengage`-shaped harness; first run ends without a return action (natural analysis response). Re-engage fires: second spawn with forcing message. Agent reads the forcing message and calls `submit_review`. Judges verify: `forceReturnCount >= 1`, `outcome = completed`, `returnVerdict = returned` — proves re-engage converts a real external non-Claude agent into returning.

- **`fr-forced-return-external`** — same shape, agent instructed NOT to return. Both re-engage budget rounds spent. Judges verify: `forceReturnCount >= 1`, `outcome = not_returned`. Proves the reject floor holds when the agent won't comply.

Together the two external scenarios form complete process-reengage coverage: forcing works and the floor holds.

---

## 11. Real-Harness Integration Tests

`layers/core-api/src/__tests__/real-harness-return-enforcement-realbinary.integration.test.ts` covers all five supported harnesses in a single file (AR6 consolidation — the former scripted in-process anchor file was merged into this file).

Each real-binary lane is gated by `requireHarness(<name>)` (hard-fail, never skip) + an inner auth check. Runs locally via `test:integration`'s serial `harness` project. Nothing carries the result anywhere — the lane has no CI job, so a human running it is the only record.

| Harness | Proof |
|---|---|
| `claude-code` | "FULL BINARY PROOF (claude)" — `buildCleanEnv` zeroes CC env vars; Stop hook fires; bridge `callCount >= 1` |
| `codex` | "FULL BINARY PROOF (CODEX_HOME)" — per-session `.codex-home/`; `CODEX_HOME` injected; Stop hook fires; bridge `callCount >= 1` |
| `opencode` | live process-reengage proof — `step_finish` detected; re-engage spawn fires with forcing message; both turns complete |
| `cursor-agent` | provisioning a no-artifact channel resolves without throwing |

Real-binary tests are local-only (require binary + auth). The deterministic anchor — the force-bounded `shouldForceReturn` behavior and the gate's returned/not-returned detection — lives in `return-gate.test.ts` (unit test) and runs without any real binary or LLM call.
