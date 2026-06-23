# AL6 v4 — Architecture: per-harness native hook provisioning + MCP-bridge enforcement

**Concept:** `plans/AL6/concept.md`. **Spec:** `.pipeline/work-packages/TRACK-AL.md` §AL6. **Versions rejected:** v1 (flag), v2 (Claude-only), v3 (provisioner re-prompt loop + instruction-file rewrite). **This is v4, revision 2** — grounds every harness/tool/seam claim in the actual tree + real tool docs (the v4-r1 critique caught fictional `codex`/`gemini` adapters and a mis-described bridge seam).

**v4 design:** provision a real turn-end/Stop hook into each harness's OWN native hook system as first-class sandbox/adapter setup *where that hook engine can BLOCK*; the harness enforces; HyperIdle provisions + adjudicates over the MCP bridge. **Honest scope (r2):** only the Claude harnesses have a blocking hook engine today; aider/goose/opencode have observe-only hooks (or none), so they declare `nativeReturnHook:"none"` and the kept drain-end `ReturnGate` is their floor. One provisioning contract for all; one adjudication source of truth for all.

---

## 0. Source verification (mechanism survey — required for enforcement WPs)

### 0.1 Claude hook engine — VERIFIED against installed types
Verified against the **installed** SDK types (`packages/server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`, v0.2.109) — not web claims (web-research rule).

1. **SDK Stop hook (in-process):** `HOOK_EVENTS` includes `'Stop'` (sdk.d.ts:738); `HookEvent` union includes `'Stop'` (sdk.d.ts:757). Hook returns `HookJSONOutput`; `SyncHookJSONOutput` carries `{ decision?: 'approve' | 'block'; reason?: string; continue?: boolean; systemMessage?: string }`. `decision:'block' + reason` blocks the stop and feeds `reason` to the model — **VERIFIED**. (This is what the existing SDK adapter already does.)
2. **File-provisioned hooks (`.claude/settings.json`):** `Options.settingSources?: SettingSource[]`; `SettingSource = 'user' | 'project' | 'local'` (sdk.d.ts:394, doc sdk.d.ts:~1660). Doc: `'project'` = `.claude/settings.json`, read from `cwd`; omitted = all sources loaded (CLI default). → the Claude Code CLI and the SDK read hooks from a `.claude/settings.json` written into the sandbox `cwd`. This is the file-provisioning seam — identical pattern to `.mcp.json`. **Seam VERIFIED.** The JSON `hooks` block format and the **exit-2 + stderr block channel** of the CLI Stop hook are ⚠️ **UNVERIFIED-AT-RUNTIME** (no live `claude` binary guaranteed in build/CI) → proven by the **real-binary keystone eval (§9)**, which is the thing that makes v4 not-Claude-SDK-only.

### 0.2 Non-Claude integrated CLIs — VERIFIED against real tool docs (web-research rule: corroborated, treated skeptically)
The only non-Claude CLIs actually in the tree are `CLI_TOOL_CONFIGS` = **aider, goose, opencode** (`adapter-pool.ts:324–353`). Verified hook support for each:

| Tool | Hook mechanism (verified) | Can BLOCK turn-end? | Source |
|---|---|---|---|
| **aider** | NONE. Only `--notifications-command` — runs a command to alert the user when the LLM is waiting; fire-and-forget, no callback, no control-flow effect. No hook/event/callback system. | **NO** | aider.chat/docs/config/options.html (notifications-command); aider.chat/docs/scripting.html |
| **goose** | Hooks via the **Open Plugins hooks spec**: events incl. `SessionStart`, `SessionEnd`, `Stop`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`; `hooks/hooks.json` under `~/.agents/plugins/<name>/` or project `.agents/plugins/<name>/`. **Fire-and-forget by spec:** "Hooks that fail or time out are logged but won't crash the host tool"; exit 0 = success; NO `decision`/`block`/`continue`/`reason` output field. | **NO** | goose-docs.ai/blog/2026/05/14/goose-hooks/; open-plugins.com/agent-builders/components/hooks (spec: exit 0 = success, "Failures MUST NOT crash the host tool", no decision schema) |
| **opencode** | Plugin hooks (JS/TS module → hooks object). `session.idle` fires when the agent finishes responding — **observe-only** (notification example, no documented block/inject). `tool.execute.before` CAN throw to block a *tool* (mid-turn) — but that is AC5-excluded mid-turn tool blocking, NOT turn-end enforcement. No documented follow-up-injection / stop-prevention. | **NO at turn-end** | opencode.ai/docs/plugins/ |

**Honest conclusion (CRIT-2):** *None* of the three integrated non-Claude CLIs has a **blocking** turn-end hook. goose + opencode follow the Open Plugins spec, which is intentionally fire-and-forget (the spec explicitly forbids hooks from crashing/blocking the host). aider has no hooks at all. → **The truthful path is the honest rescope (CRIT-2 path 3):** native blocking hook for the Claude harnesses; `nativeReturnHook:"none"` + the kept drain-gate floor for aider/goose/opencode; one extensible provisioning contract. **`codex`/`gemini` are removed** — not spawnable adapters (`codex` is a discovery descriptor only, `harness-capability-descriptors.ts:11` `KNOWN_HARNESS_FAMILIES`; `gemini` is absent from the tree). **This is a scope decision for the founder — see §11.**

---

## 1. Plan reconciliation (spec ⇆ reality) — all rows re-verified at file:line (r2)

| Spec/concept assumption | Reality (verified file:line) | Plan handling |
|---|---|---|
| Closed return set exists | `RETURN_ACTION_NAMES` in `shared/src/harness/return-actions.ts` | KEEP, untouched |
| `ReturnGate` exists | `server/src/harness/return-gate.ts` (`evaluateReturn`) | KEEP; expose state to callback + drain floor (new read seam) |
| `not_returned` SessionOutcome persisted | `session-provisioning.ts` emits `session_not_returned` + endSession `"not_returned"` | KEEP the persistence; REMOVE the loop that produced it |
| v3 re-prompt loop | `runSession` `while(true)` in `session-provisioning.ts` | DELETE |
| v3 sandbox-rewrite carrier | `re-engage.ts` `rewriteSandboxForcing`; `AL6_FORCE_RETURN_MESSAGE` appended | DELETE `re-engage.ts`; KEEP `AL6_FORCE_RETURN_MESSAGE` (hook `reason` reuses it) |
| `.mcp.json` provisioning pattern | `session-provisioning.ts` Phase 8b writes `.mcp.json` to sandbox root | MODEL a Claude-CLI `.claude/settings.json` write on this exact pattern |
| MCP bridge + token + route | `mcp-bridge.ts` (`McpBridgeInstance{token,sessionId}`), `mcp-bridge-registry.ts` (keyed by token), `routes/mcp-route.ts` (`ALL /mcp/:token`) | the hook callback rides this; the return-status tool is injected into the per-session registry (see §4, WARN-1 fix) |
| Bridge registers tools | `createMcpBridge` registers ONLY `registry.definitions` (`mcp-bridge.ts:118–136`) — **no "alongside" seam** | inject `hyperidle_return_status` as a `ToolDefinition` in the registry; the bridge picks it up automatically (WARN-1 fix) |
| Registry is per-session | `buildToolRegistry(toolContext, {role})` at `session-provisioning.ts:608`; `ToolContext.sessionId` exists (`tool-registry.ts:44`) | the tool handler reads `ctx.sessionId` → enforcement-registry lookup (resolves WARN-1's sessionId wiring) |
| `CLI_TOOL_CONFIGS` = aider/goose/opencode | `adapter-pool.ts:324–353` — **no codex, no gemini** | provision `"none"` for all three; NO codex/gemini rows |
| `codex` family | discovery descriptor only (`harness-capability-descriptors.ts:10` `KNOWN_HARNESS_FAMILIES`), not a spawnable CLI config | NOT an enforcement target; removed from the hook table |
| `hasNativeReturnHook`/`canReEngage` caps | `shared/.../harness-adapter.ts:139,151` | REPLACE with v4 `nativeReturnHook` provisioning descriptor (§5) |
| `getForceReturnCount?`/`continueSession?` | `harness-adapter.ts:175,187` | `getForceReturnCount` KEEP (now reads hook-block count); DELETE `continueSession?` (Mode-2 dead) |
| `CLI_TOOL_CONFIGS` use `{{workspace}}` | `adapter-pool.ts:327,337,346` use `{{workspace}}`; template type is `{{sandbox}}` | ⚠️ PRE-EXISTING BUG (templates never substitute). Does NOT affect the `.claude/settings.json` write (uses `sandboxPath` directly). But WOULD block adding any NEW non-Claude CLI config (e.g. a future hook-capable CLI) — flagged as a prerequisite for the extensibility path (WARN-4, §11). Out of AL6 scope to fix; noted for the builder. |

---

## 2. The provisioning seam — where the hook gets installed

The single new responsibility: **at session/sandbox setup, write/pass the harness's native return-enforcement hook config — right where `.mcp.json` and `CLAUDE.md` are already provisioned** — for the harnesses whose hook can block. For the rest, the channel is `"none"` (no file, gate floor).

Three provisioning channels, chosen per-adapter (a capability the adapter declares):
- **In-process** (Claude SDK closure): the adapter wires the `Stop` hook in its own `startSession` from `SessionConfig` (it already does — reframed as its provisioning impl).
- **File-provisioned** (`.claude/settings.json`): written to the sandbox root by a new `provisionReturnHook(sandboxPath, ctx)` step in `session-provisioning.ts`, called in Phase 8b alongside the `.mcp.json` write. The file references the bridge token so the hook can call back.
- **None** (aider/goose/opencode + remote-without-blocking-worker): no file, no closure; the drain-end `ReturnGate` is the floor.

### 2.1 New provisioning step (replaces the v3 loop)
`runSession` collapses from a `while(true)` loop to a **single** `startSession` + single drain. Hook provisioning happens BEFORE `startSession`:

```ts
// session-provisioning.ts, Phase 8b (after .mcp.json write, before startSession)
provisionReturnHook({
  sandboxPath,
  adapter: harness,
  channel: harness.getCapabilities().nativeReturnHook,   // §5
  bridgeToken: mcpBridgeToken,                            // callback credential
  mcpUrl,                                                 // ${mcpBaseUrl}/api/mcp/${token}
  forceBudget: AL6_MAX_FORCE_RETURNS,
});
```

`provisionReturnHook` dispatches on the declared channel:
- `"sdk-inprocess"` → no file write; SDK adapter wires the closure itself. HyperIdle passes `SessionConfig.returnHook` so the closure reads the enforcement registry instead of holding its own state.
- `"settings-json"` → write `<sandbox>/.claude/settings.json` with a `Stop` command hook that POSTs the bridge `hyperidle_return_status` tool.
- `"builtin-loop"` → no file; the builtin loop consults the registry at loop-end.
- `"none"` → no hook; the drain-end gate computes `not_returned` (the floor for aider/goose/opencode).

---

## 3. Per-adapter native-hook mechanism table (r2 — verified, codex/gemini removed)

| Adapter | Native blocking hook | Provisioned config (v4) | Callback to HyperIdle | Verified |
|---|---|---|---|---|
| **claude-agent-sdk** (`claude-agent-sdk-adapter.ts`) | `options.hooks.Stop` closure — **blocks** | NONE on disk — closure wired in `startSession`. Closure reads return state via `SessionConfig.returnHook` (enforcement registry) instead of its current in-memory `al6.returnSeen`. | in-process: closure reads the enforcement registry directly (same process); no HTTP | VERIFIED (sdk.d.ts) |
| **claude CLI / Claude Code** (`cli-harness-adapter.ts`, requires a NEW `CLI_TOOL_CONFIGS.claude` entry) | `Stop` hook in `.claude/settings.json` — **blocks via exit 2 + stderr** | `provisionReturnHook` writes `<sandbox>/.claude/settings.json` → `hooks.Stop[0].hooks[0] = { type:"command", command:"<POST bridge return_status; exit 2 + stderr reason if not returned & budget left; else exit 0>" }` | HTTP POST to `${mcpUrl}` invoking `hyperidle_return_status` | seam VERIFIED; block channel ⚠️ UNVERIFIED-AT-RUNTIME → proven by §9 real-binary keystone |
| **aider** (`CLI_TOOL_CONFIGS.aider`) | NONE (notify only) | `nativeReturnHook:"none"` — no file | n/a (gate floor) | VERIFIED — no hooks |
| **goose** (`CLI_TOOL_CONFIGS.goose`) | Open-Plugins hooks, **non-blocking** | `nativeReturnHook:"none"` — gate floor (NOT a fire-and-forget Open-Plugins hook, which cannot enforce) | n/a (gate floor) | VERIFIED — spec is fire-and-forget |
| **opencode** (`CLI_TOOL_CONFIGS.opencode`) | `session.idle` (observe-only at turn-end) | `nativeReturnHook:"none"` — gate floor | n/a (gate floor) | VERIFIED — observe-only |
| **isolated** (`isolated-harness-adapter.ts` → `isolated-session-worker.ts`) | inherits inner SDK `Stop` closure — **blocks** | inner `ClaudeAgentSdkAdapter` provisions its own hook; worker forwards `SessionConfig.returnHook` | inner closure → enforcement registry | VERIFIED (worker forks the SDK adapter) |
| **builtin** (`builtin-harness-adapter.ts`) | in-process loop owns turn-end — **blocks** | loop checks registry at loop-end, re-injects in-place (no file) | direct in-process registry read | VERIFIED (builtin owns its loop) |
| **remote** (`remote-harness-adapter.ts`) | worker-side; depends on the worker's harness | `dispatch` gains `returnHook` (token + budget); a conforming worker installs its native hook | worker's hook → bridge tool | HyperIdle-side VERIFIED; worker honoring it = worker-protocol contract |
| **mock** (`shared/.../mock-harness-adapter.ts`) | n/a (test) | declares a channel per test need | n/a | n/a |

**`codex` and `gemini` rows DELETED vs r1** — they are not spawnable adapters (codex = discovery descriptor only; gemini absent). No row claims a non-Claude blocking hook. The only blocking rows are Claude-SDK, Claude-CLI, isolated (inherits Claude-SDK), and builtin (owns its loop). aider/goose/opencode/remote-without-conforming-worker are honest `"none"` gate-floor rows.

---

## 4. The hook → HyperIdle enforcement contract (over the MCP bridge) — WARN-1 fixed

The bridge already exists and is token-authenticated (`/api/mcp/:token`). The bridge registers ONLY `registry.definitions` (`mcp-bridge.ts:118–136`) — **there is no "alongside" registration seam, so r1's description was wrong.** The fix: register `hyperidle_return_status` as a `ToolDefinition` injected into the per-session registry so the bridge picks it up automatically.

### 4.1 Registration seam (the real one)
- `buildToolRegistry(toolContext, {role})` (`session-provisioning.ts:608`) builds `definitions` from `toolsForRole(role)`.
- Add `hyperidle_return_status` as a `ToolDefinition` (`tool-registry.ts:65`) appended to the session's registry (either added to the role-filtered set for harness sessions, or injected via a new `extraTools` option on `buildToolRegistry` so it is only present for harness-driven sessions, not the UI API).
- `createMcpBridge({sessionId, registry})` (`mcp-bridge.ts:687`) then registers it with every other tool — zero change to `createMcpBridge`.

### 4.2 sessionId → enforcement-registry lookup (WARN-1)
- The tool handler signature is `(args, ctx: ToolContext)`; **`ToolContext.sessionId` already exists** (`tool-registry.ts:44`).
- The handler reads `ctx.sessionId` → looks up the **session enforcement registry** (`return-enforcement-registry.ts`, new) → `{ gate, forceCount, exempt }`. The bridge token is the transport identity; `ctx.sessionId` is the adjudication identity; they are bound because the registry and the bridge are both built per-session in `runSession` with the same `sessionId`. No token→session indirection is needed inside the tool — the registry is built with `sessionId` in scope and the `ToolContext` carries it.

### 4.3 Tool: `hyperidle_return_status`
- **Input:** none (`z.object({})`). Identity comes from `ctx.sessionId`.
- **Output (JSON):**
  ```ts
  interface ReturnStatusResult {
    returned: boolean;        // ReturnGate.returned for this session
    exempt: boolean;          // empty-tools drain → enforcement N/A
    forceCount: number;       // hook-fired blocks so far this turn
    budgetLeft: number;       // AL6_MAX_FORCE_RETURNS - forceCount
    forceMessage: string | null; // AL6_FORCE_RETURN_MESSAGE when a block is warranted, else null
  }
  ```
- **Semantics (server-side, pure):** delegates to `shouldForceReturn(gate, forceCount)` + gate state. `forceMessage !== null` ⇔ the hook should BLOCK (re-inject). The hook MUST report it blocked (or the tool increments on issuing a non-null `forceMessage`) so budget is consumed. `returned || exempt || budgetLeft===0` → `forceMessage:null` → hook allows end.
- **State location:** a per-session `return-enforcement-registry.ts` (new, in `server/src/harness/`) keyed by `sessionId`, populated by `runSession` at start, holding `{ gate, forceCount, exempt }`, read by the tool handler + the in-process closures. Mirrors `mcpBridgeRegistry`'s lifecycle (register at start, unregister at end).

### 4.4 The block mechanism per channel
| Channel | "block + re-inject" | "allow end" |
|---|---|---|
| SDK closure | `return { decision:"block", reason: forceMessage }` | `return { decision:"approve" }` |
| `.claude/settings.json` command hook | `process.exit(2)` + write `reason` to stderr (Claude Code feeds a blocking Stop hook's stderr back to the model) ⚠️ UNVERIFIED-AT-RUNTIME → proven by §9 | `process.exit(0)` |
| builtin loop | continue loop with `forceMessage` injected as the next message | break loop |
| remote worker | worker re-injects per its harness's block primitive | worker ends turn |
| **none** (aider/goose/opencode) | n/a — no hook fires; drain-gate records `not_returned` | n/a — drain-gate records `completed` if returned |

### 4.5 Why the bridge, not a new HTTP endpoint
The bridge is already provisioned into every MCP-capable sandbox (`.mcp.json`), token-authed (256-bit, `mcp-bridge.ts:106`), torn down on session end. Injecting one tool into the registry is zero new surface, no new auth, no new route. The in-process paths (SDK/builtin) read the registry directly and skip HTTP; the bridge tool is the channel for the file-provisioned (Claude CLI) and remote paths.

---

## 5. SHARED-contract changes (adapter interface + capability)

### 5.1 `HarnessCapabilities` (`packages/shared/src/harness/harness-adapter.ts`)
- **REMOVE** `hasNativeReturnHook: boolean` and `canReEngage: boolean` (v3 concepts — re-engage is gone).
- **ADD** `nativeReturnHook: NativeReturnHookProvisioning` where
  ```ts
  type NativeReturnHookProvisioning =
    | "sdk-inprocess"   // adapter wires a BLOCKING Stop closure in startSession
    | "settings-json"   // HyperIdle writes .claude/settings.json (BLOCKING)
    | "builtin-loop"    // in-process loop owns turn-end (BLOCKING)
    | "none";           // no BLOCKING turn-end hook — gate-floor only (aider/goose/opencode/remote-nonconforming)
  ```
  Declares the PROVISIONING CHANNEL; `provisionReturnHook` dispatches on it. Non-optional (TS strict catches any omission across the adapters — the forcing function for "uniform across harnesses").
  **Note:** the `{ file: string }` variant from r1 is REMOVED — no integrated non-Claude CLI has a blocking hook-config file to write today. It can be re-added when a hook-capable CLI is integrated (the extensibility path, §11). Until then, offering it would be dead code claiming coverage that does not exist.

### 5.2 `SessionConfig` (`harness-adapter.ts`)
- **ADD** `readonly returnHook?: ReturnHookConfig` where
  ```ts
  interface ReturnHookConfig {
    readonly bridgeToken: string;   // bridge callback credential
    readonly mcpUrl: string;        // ${mcpBaseUrl}/api/mcp/${token}
    readonly forceBudget: number;   // AL6_MAX_FORCE_RETURNS
  }
  ```
  SDK/builtin closures read this (with `sessionId` from `config`) to reach the enforcement registry; the `settings-json` template interpolates `bridgeToken`/`mcpUrl`.

### 5.3 `HarnessAdapter` interface
- **KEEP** `getForceReturnCount?(sessionId): number` — **WARN-2:** now returns the **enforcement-registry hook-block count** (incremented when the provisioned hook gets `forceMessage!==null`), NOT a loop counter. With the loop deleted, `forceReturnCount` surfaced on `ProvisionSessionResult` is sourced solely from the registry (no `loopForceCount` term — the old `loopForceCount + getForceReturnCount` formula in the `harness-adapter.ts:170` doc must be updated to drop the loop term).
- **DELETE** `continueSession?(handle, message)` (Mode-2 — dead in v4; no re-engage).

### 5.4 `harness-capability-descriptors.ts` / `mock-harness-adapter.ts`
- Update each adapter's `getCapabilities()` to return `nativeReturnHook` (per §3) instead of the two removed booleans.

---

## 6. Files: add / modify / delete

### Add
- `packages/server/src/harness/return-enforcement-registry.ts` — per-session `{ gate, forceCount, exempt }` registry; `register/get/incrementForce/unregister`. Read by the tool handler + in-process closures.
- `packages/server/src/harness/provision-return-hook.ts` — `provisionReturnHook(args)` dispatching on `nativeReturnHook`; writes `.claude/settings.json` for `settings-json`; no-op for `sdk-inprocess`/`builtin-loop`/`none`.
- `packages/server/src/tools/return-status-tool.ts` — the `hyperidle_return_status` `ToolDefinition` (reads `ctx.sessionId` → enforcement registry; reuses `shouldForceReturn`+gate). Injected into the per-session registry.
- Unit tests: `provision-return-hook.test.ts`, `return-enforcement-registry.test.ts`, `return-status-tool.test.ts`.
- `packages/server/src/mcp/return-status.integration.test.ts` — hook→bridge→registry round-trip via a real `createMcpBridge` + `handleRequest`.

### Modify
- `packages/shared/src/harness/harness-adapter.ts` — §5 contract changes (incl. update the `getForceReturnCount` doc to drop the loop term — WARN-2).
- `packages/shared/src/harness/mock-harness-adapter.ts` — `nativeReturnHook`.
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` — Stop closure reads `config.returnHook`/registry instead of local `al6` state; `getCapabilities → nativeReturnHook:"sdk-inprocess"`.
- `packages/server/src/harness/cli-harness-adapter.ts` + `adapter-pool.ts` — add a `claude` CLI config to `CLI_TOOL_CONFIGS` (`nativeReturnHook:"settings-json"`); aider/goose/opencode declare `"none"`.
- `packages/server/src/harness/builtin-harness-adapter.ts` — `nativeReturnHook:"builtin-loop"`; loop-end checks registry.
- `packages/server/src/harness/isolated-harness-adapter.ts` / `isolated-session-worker.ts` — forward `returnHook`; inherit inner SDK hook; `nativeReturnHook:"sdk-inprocess"`.
- `packages/server/src/harness/remote-harness-adapter.ts` — `dispatch` carries `returnHook`; `nativeReturnHook` declared (`"none"` unless the worker contract guarantees a blocking hook).
- `packages/server/src/tools/tool-registry.ts` — `buildToolRegistry` gains an `extraTools`/harness-session path so `hyperidle_return_status` is present for harness sessions (WARN-1 registration seam).
- `packages/server/src/services/session-provisioning.ts` — **DELETE the `while(true)` re-prompt loop**; single `startSession`+drain; call `provisionReturnHook` in Phase 8b; register/unregister the enforcement registry entry; compute `not_returned` from gate at drain-end (KEEP); `forceReturnCount` = registry count (WARN-2).
- `packages/eval/src/scenarios/force-return.ts` + `packages/eval/src/provision-harness.ts` — rework for the real-binary keystone proof (§9).

### Delete
- `packages/server/src/harness/re-engage.ts` (`rewriteSandboxForcing`) — the v3 carrier.
- `AL6_FORCE_RETURN_MESSAGE` **KEEP** (hook `reason` reuses it). `shouldForceReturn` **KEEP** (the tool reuses it).
- v3 lore/tests asserting the loop / `canReEngage` / `continueSession` / sandbox-rewrite carrier.

---

## 7. Acceptance criteria + verification

| AC | Criterion (v4 framing) | Verification |
|---|---|---|
| **AC1** | Every turn, every harness, ends only after a return action; a would-be no-return end is not accepted as complete | Integration: drive each adapter type with a stub model that does NOT return; for blocking harnesses assert the hook fired a block and the recorded outcome is `not_returned` (never `completed`); for `"none"` harnesses assert the drain recorded `not_returned`. Unit: `return-status-tool` returns `forceMessage!==null` when gate.returned=false & budget left. |
| **AC2** | HyperIdle enumerates the closed valid-ending set | Unit (KEEP): `return-actions.closure.test.ts` — every `RETURN_ACTION_NAMES` member maps to a registered tool; set is a finite `as const`. |
| **AC3** | A no-return end is detected and not silently completed — redirected or surfaced as not-returned | Integration: gate=false at end → `session_not_returned` emitted + `outcome:"not_returned"` persisted. Unit: `evaluateReturn(gate,"completed")==="not_returned"` (KEEP). |
| **AC4** | Enforcement holds uniformly across harnesses — **blocking-hook-enforced where a hook engine exists; gate-floor-enforced where it doesn't; one contract for all** | (a) Type: `nativeReturnHook` non-optional → `npm run check` forces every adapter to declare its channel. (b) Unit: `provisionReturnHook` writes the correct artifact per channel (`.claude/settings.json` content asserted for `settings-json`; no-op asserted for `none`). (c) **Live eval (§9): the provisioned NATIVE hook on a real `claude` CLI binary reading a real `.claude/settings.json` blocks a no-return turn-end** — the keystone that proves a FILE-provisioned (not SDK-in-process) hook enforces. (d) Integration: a `"none"` adapter (e.g. the eval-external fixture) with no return → `not_returned` at drain (the honest floor). |
| **AC5** | Mid-turn non-terminal tool use unaffected — only the ending is constrained | Unit: the hook is a `Stop`/turn-end hook only; mid-turn `tool_call` events never consult it. Integration: a session that calls a non-return tool mid-turn then returns → zero blocks, `outcome:"completed"`. |

### route-checklist (channel must cover every adapter)
`provisionReturnHook` + `getCapabilities().nativeReturnHook` exercised for: `claude-agent-sdk`, `claude CLI`, `builtin`, `isolated`, `remote`, `aider`, `goose`, `opencode`, `mock`. A per-adapter table test asserts each returns a non-`undefined` channel and `provisionReturnHook` handles it (incl. the `"none"` no-op).

### Security & abuse cases
- **Callback auth:** `hyperidle_return_status` rides the existing bridge token (256-bit, `/api/mcp/:token` → 401 on unknown). No new auth surface, no new rate-limit.
- **Hook command injection (`.claude/settings.json`):** the command is a fixed template + the session's own server-minted bridge token/url (hex, not agent-authored). No agent-controlled value enters the shell command. Unit-assert the written command contains only the server-minted token/url.
- **Agent disabling the hook (WARN-3):** an agent with sandbox file-write could edit `.claude/settings.json` to remove the Stop hook. **Mitigation:** HyperIdle's drain-end `ReturnGate` is the un-bypassable backstop — its **truth source is the harness EVENT STREAM that HyperIdle ingests, which is OUTSIDE agent control** (the agent cannot forge a `submit_review` tool-call event it did not emit). Even if the hook is deleted, the no-return turn is still recorded `not_returned`. Document as `@lore`: the hook is the forcing layer; the event-stream-fed gate is the record-of-truth. **Explicit honesty:** `"none"`-channel adapters are gate-only — they are NOT "native-hook uniform"; their enforcement is detection + honest surfacing (AC's "surfaced as not-yet-returned"), not in-turn forcing.
- **Path traversal:** `.claude/settings.json` path is `path.join(sandboxPath, ".claude", "settings.json")` — no agent input. N/A.

### protectedTests
- `packages/shared/src/__tests__/return-actions.closure.test.ts` (closed-set invariant) — assertions must not change.
- the `evaluateReturn` exemption tests in `return-gate.test.ts`.

### sharedFiles
- `packages/shared/src/harness/harness-adapter.ts`, `mock-harness-adapter.ts`, `packages/server/src/services/session-provisioning.ts`, `packages/server/src/harness/adapter-pool.ts`, `packages/server/src/tools/tool-registry.ts`, `packages/server/src/mcp/mcp-bridge.ts`.

---

## 8. Design-it-twice — the callback transport

**Option A — bridge MCP tool injected into the registry (chosen).** The hook calls `hyperidle_return_status`, registered as a `ToolDefinition` in the per-session registry (`registry.definitions` → bridge auto-registration). Trade-off: reuses the already-provisioned, already-token-authed bridge; in-process adapters skip HTTP and read the registry directly; `ctx.sessionId` resolves identity with no new wiring. Reject reason for A: none material.

**Option B — dedicated HTTP endpoint `POST /api/sessions/:id/return-status`.** Trade-off: simpler curl in the settings-json hook (no MCP envelope). Reject: needs its own auth (session id is guessable → a separate per-session token = re-inventing the bridge token), a new route mounted pre-auth, a new rate-limit. Strictly more surface than A for no gain.

**Synthesis:** A. File-provisioned (Claude CLI) + remote hooks POST the MCP tool over the bridge URL/token in `ReturnHookConfig`; in-process (SDK/builtin) closures read the enforcement registry directly — same adjudication (`shouldForceReturn`+gate), two transports.

---

## 9. Live eval — the real-binary Claude-CLI keystone (CRIT-1) (DoD)

**Goal:** prove a **FILE-provisioned native hook** (not the SDK in-process closure) blocks a no-return turn-end — the thing that makes v4 not-Claude-SDK-only. The SDK Stop hook is already VERIFIED in types; the FILE path (`.claude/settings.json` Stop hook firing exit-2+stderr against a real binary) is the unproven keystone.

**Scenario `fr-claude-cli-keystone` (reworked from v3's external scenario):**
- **Harness:** `CliHarnessAdapter` with a `claude` `CLI_TOOL_CONFIGS` entry, `nativeReturnHook:"settings-json"`. `provisionReturnHook` writes a REAL `<sandbox>/.claude/settings.json` Stop hook. The eval spawns the **real `claude` binary** in that sandbox; the binary reads the real settings file and fires the hook at turn-end.
- **Seed:** agent system prompt instructs it NOT to call any return tool.
- **What proves "the FILE hook fired and BLOCKED":**
  - the hook's `process.exit(2)` + stderr re-injection is observed to make the real `claude` CLI continue the turn (the model gets the `reason` and tries again), OR — on budget exhaustion — the run ends `not_returned`.
  - `result.forceReturnCount >= 1`, sourced from the **enforcement registry's hook-block count** (incremented only when the provisioned hook called `hyperidle_return_status` and got `forceMessage!==null`) — NOT a loop counter (WARN-2).
  - a `hookFiredVia:"settings-json"` marker on the registry entry distinguishes it from the SDK in-process path.
  - `outcome` ∈ {`completed` (agent converted), `not_returned` (refused after budget)} — never `completed` with `returnVerdict:"not_returned"` (v1 regression guard, KEEP).
- **Channel assertion (the v4 teeth):** exactly ONE `startSession` (no loop), and the block originated from the file-provisioned settings.json hook — proving the harness, not HyperIdle's provisioner, enforced.

**Real-binary availability (CRIT-1, must be answered, not hand-waved):**
- The `claude` CLI ships in the dev/eval environment (it is HyperIdle's own primary harness; the SDK + CLI are first-party deps). The eval **detects the binary** (`which claude`) at start.
- **If `claude` is present** → run the keystone for real; capture the block in the eval log. This is the DoD-satisfying proof.
- **If `claude` is absent** (CI lane without it) → the keystone is SKIPPED with an explicit `SKIPPED: no claude binary — keystone unproven` marker (NOT silently passed), and the WP is NOT done until the keystone has run once locally with a real binary and its log is captured in the WP's proof artifact. The block channel (exit 2 + stderr) is verified against Claude Code's documented Stop-hook behavior at that point; until then it carries ⚠️ UNVERIFIED-AT-RUNTIME. A fixture that "executes the same provisioned config" does NOT substitute — it proves only that HyperIdle can run a shell command, not that the harness fires the hook (the r1 §9 fallback was rejected for exactly this).

**Companion unit/integration (CI-safe, deterministic) — labeled honestly (WARN-2):** a stub adapter declaring `settings-json`; assert `provisionReturnHook` wrote the file, then simulate the hook executing its command against the bridge tool and assert the block/allow decision matches gate state. **This is a WIRING check, not enforcement proof** — it proves HyperIdle's side of the contract (the tool returns the right `forceMessage`, the file is well-formed), NOT that a real harness honors the block. Only the real-binary keystone proves enforcement.

**"Exactly one `startSession`" (WARN-2):** asserted in the eval (the channel assertion above) — it is an enforcement property the real run must show, not a unit assertion against a simulated command.

**Run:** local only (`cd packages/eval && node dist/cli.js --feature force_return`); SKIP when no model credentials / no binary, with explicit markers. Per `feedback_eval_vs_test` + `feedback_agent_behavior_needs_live_eval_and_forcing` + `feedback_live_proof_lanes_run_before_ship`.

---

## 10. Ordered task list

1. **SHARED contract** — `harness-adapter.ts`: remove `hasNativeReturnHook`/`canReEngage`, add `nativeReturnHook` (`"sdk-inprocess"|"settings-json"|"builtin-loop"|"none"`) + `SessionConfig.returnHook`/`ReturnHookConfig`; delete `continueSession?`; update the `getForceReturnCount` doc to drop the loop term. Update `mock-harness-adapter.ts`. (Blocks everything; `npm run check` lists every adapter to fix.) *Test: type-level via check; mock cap unit.*
2. **Enforcement registry** — `return-enforcement-registry.ts`. *Unit.*
3. **Return-status tool** — `return-status-tool.ts` (`ToolDefinition`, reads `ctx.sessionId`); wire into `buildToolRegistry` for harness sessions; reuse `shouldForceReturn`+gate. *Unit + integration (real bridge round-trip).*
4. **`provisionReturnHook`** — dispatch on channel; write `.claude/settings.json` for `settings-json`; no-op for `sdk-inprocess`/`builtin-loop`/`none`. *Unit asserting file content + injection-safety + `"none"` no-op.*
5. **SDK adapter** — Stop closure reads `config.returnHook`→registry instead of local `al6`; `nativeReturnHook:"sdk-inprocess"`. *Unit (closure decision from gate).*
6. **builtin adapter** — loop-end consults registry; `nativeReturnHook:"builtin-loop"`. *Unit.*
7. **isolated + remote** — forward `returnHook`; declare channels (`isolated:"sdk-inprocess"`, `remote:"none"` unless worker-contract-blocking). *Unit.*
8. **CLI adapter + `CLI_TOOL_CONFIGS`** — add `claude` config (`settings-json`); aider/goose/opencode declare `"none"`. *Unit.*
9. **`session-provisioning.ts`** — DELETE the v3 loop; single startSession+drain; `provisionReturnHook` in Phase 8b; register/unregister enforcement registry; KEEP `not_returned`/`session_not_returned`/`evaluateReturn` at drain-end; `forceReturnCount` from registry. *Integration: no-return → `not_returned` (both a blocking and a `"none"` adapter); return → `completed`; mid-turn tool → unaffected (AC5).*
10. **DELETE** `re-engage.ts` + v3 loop tests + `canReEngage`/`continueSession` refs; fix cost-delta + session-provisioning tests that assumed the loop.
11. **Live eval** — rework `force-return.ts`/`provision-harness.ts` to `fr-claude-cli-keystone` (§9); run locally with the real `claude` binary, capture the block log as the proof artifact.
12. **Verify** — `npm run check && npm run lint && npm run test`; then the live keystone eval; carry score to review.

**Dependency order:** 1 → (2,3,4 parallel) → (5,6,7,8 parallel) → 9 → 10 → 11. Task 1 is the shared-contract gate; the per-adapter tasks (5–8) each compile-fail until they declare `nativeReturnHook` — the type makes "uniform across harnesses" un-skippable (directly answering the v1/v2/v3 scope-gap root cause from the retro).

---

## 11. Genuine-exception honesty + the scope decision for the founder

**Verified finding (the founder asked to be told):** the founder asserted *"all these harnesses provide support for hooks these days."* Verified against the real, integrated non-Claude CLIs (aider, goose, opencode) and authoritative docs:
- **True** that goose + opencode have hook systems (Open Plugins spec; opencode plugins) and that hooks are now common.
- **False** that any of them has a **BLOCKING turn-end hook**. The Open Plugins spec is fire-and-forget by design ("Failures MUST NOT crash the host tool"; exit 0 = success; no `decision`/`reason` output). opencode's `session.idle` is observe-only. aider has no hooks at all. → **blocking enforcement is Claude-only at runtime today.**

**What v4 delivers honestly:**
- **Native blocking hook** for the Claude harnesses (SDK in-process Stop closure — VERIFIED; Claude CLI `.claude/settings.json` Stop hook — proven by the real-binary keystone §9), inherited by `isolated`, owned by `builtin`.
- **Gate-floor (`nativeReturnHook:"none"`)** for aider/goose/opencode and non-conforming remote workers: no in-turn forcing, but the event-stream-fed `ReturnGate` detects a no-return end and surfaces it as `not_returned` — never silently `completed`. This is exactly AL6's AC ("redirected to return, OR surfaced as not-yet-returned").
- **One provisioning contract** (`provisionReturnHook` + `nativeReturnHook`) for all harnesses; **one adjudication source of truth** (`ReturnGate` + closed `RETURN_ACTION_NAMES`) for all.

**Extensibility (the answer to "but the founder said all harnesses support hooks"):** the contract is built so that adding a blocking-hook-capable harness later = implementing its `provisionReturnHook` channel (re-add a `{file}` or new channel variant) + declaring its `nativeReturnHook` — **zero core change.** When goose/opencode/aider ship a blocking turn-end hook (or a new CLI with one is integrated), it slots into the existing seam. **Prerequisite for that path (WARN-4):** the `{{workspace}}`→`{{sandbox}}` template bug in `adapter-pool.ts:327,337,346` must be fixed before any NEW non-Claude CLI config can substitute its sandbox path (it does NOT block the Claude `.claude/settings.json` write, which uses `sandboxPath` directly). Noted for the builder; out of AL6's enforcement scope.

**SCOPE DECISION TO SURFACE TO THE FOUNDER (orchestrator, please flag):** the founder's premise ("all these harnesses provide support for hooks") is *partially correct but materially wrong for ENFORCEMENT*: the integrated non-Claude CLIs have observe-only hooks, not blocking ones. v4 therefore ships **blocking enforcement on the Claude harnesses + an honest, extensible gate-floor on the rest**, rather than blocking-everywhere (which the real tools cannot do today). If the founder wants blocking-everywhere, that requires either (a) waiting for these tools to add blocking hooks upstream, or (b) a wrapper that intercepts each CLI's process at turn-end (a much larger, per-tool effort outside AL6). The recommended outcome is (the honest rescope) ship now with the extensible contract; revisit per-tool blocking when upstream support lands.

- The **remote** third-party-worker case: HyperIdle ships the hook config in `dispatch`; a worker that ignores it degrades to the gate floor. Documented as a worker-protocol contract, not an adapter limitation.
