# AL6 v4-final — Architecture: per-harness native-hook provisioning + process-wrapper floor

**Concept:** `plans/AL6/concept.md`. **Spec:** `.pipeline/work-packages/TRACK-AL.md` §AL6. **Superseded:** v1 (flag), v2 (Claude-SDK-only), v3 (universal HyperIdle re-prompt loop + instruction-file rewrite), v4-r1/r2 (built on the WRONG harness list — aider/goose, now purged).

**v4-final design:** provision return-enforcement per-harness at sandbox/adapter setup under one seam (`provisionReturnHook`), choosing the STRONGEST channel the harness natively supports — a native BLOCKING `Stop` hook for Claude Code (SDK + CLI) and Codex, a native soft-continue for Cursor, and a HyperIdle process re-engage for OpenCode and anything else without a hard block. HyperIdle's sandbox/process ownership is the floor; the drain-end `ReturnGate` (event-stream-fed, outside agent control) is the un-bypassable backstop on every harness. NOT a universal re-prompt loop, NOT an instruction-file rewrite.

---

## 0. Source verification (mechanism survey — required for enforcement WPs)

### 0.1 The real supported harness set — VERIFIED against the corrected tree
- `docs/architecture/components.md:288` — "first-class for `codex`, `claude-code`, `cursor-agent`, and `opencode`".
- `harness-discovery.ts:54–60` — `HarnessDiscoveryResult` = `{ builtin, codex, "claude-code", opencode, "cursor-agent" }`.
- `adapter-pool.ts:332–358` — `CLI_TOOL_CONFIGS` = `{ codex, opencode }`. **aider/goose purged** (commit `46ba1d26`).
- `harness-discovery.ts:286–325` — `probeCursorAgentCli`: cursor-agent reports `installed` (binary on PATH) or `unavailable` ("does not expose a documented headless local CLI surface that HyperIdle can drive") — **not spawnable as a session today**.

### 0.2 Claude hook engine — VERIFIED against installed types + existing code
Verified against the **installed** SDK types (`packages/server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`, v0.2.109) and the existing adapter — not web claims (web-research rule).

1. **SDK Stop hook (in-process):** `HOOK_EVENTS` includes `'Stop'`; `SyncHookJSONOutput` carries `{ decision?: 'approve'|'block'; reason?: string; … }`. `decision:'block'+reason` blocks the stop and feeds `reason` to the model. **VERIFIED + ALREADY SHIPPING** — `claude-agent-sdk-adapter.ts:198–213` (the `stopHook` closure).
2. **File-provisioned hooks (`.claude/settings.json`):** `Options.settingSources?: SettingSource[]`, `SettingSource='user'|'project'|'local'`; default behavior reads `.claude/settings.json` from cwd (`'project'`). The Claude Code CLI's `Stop` hook supports `{"decision":"block","reason":...}` (JSON on stdout) OR exit-code-2 + stderr; the reason is fed back to the model. → write `<sandbox>/.claude/settings.json` at setup, identical drop-a-file model as `.mcp.json`. **Seam VERIFIED; the CLI block-channel end-to-end against our shipped binary is ⚠️ UNVERIFIED-AT-RUNTIME → proven by §9 real-harness test.** Source: Claude Code hooks docs (`docs.claude.com/en/docs/claude-code/hooks`), corroborated by the SDK type contract.

### 0.3 Codex CLI hook engine — VERIFIED (web 2026-06-24, treated skeptically)
- Codex CLI ships a **NEW hooks system** (distinct from the older observe-only `notify`). It supports a `Stop` (turn-end) hook with the same `{"decision":"block","reason":...}` blocking semantics as Claude Code — the reason is fed back to the model. Provisioned by writing `.codex/hooks.json` (or hook config under `.codex/config.toml`) into the sandbox.
- HyperIdle spawns codex via `codex exec <prompt> --json` from `cwd:sandboxPath` (`adapter-pool.ts:333–346`, `@lore X5`), so a `.codex/hooks.json` in the sandbox is read the same way `.mcp.json`/`AGENTS.md` are.
- ⚠️ **UNVERIFIED-AT-RUNTIME** that the block channel fires end-to-end in the exact codex version on the dev/CI machine → proven by §9 (real `codex` binary). Source: OpenAI Codex CLI hooks documentation (web, 2026-06-24); cross-checked against the codex `exec --json` ndjson surface already in the tree.

### 0.4 OpenCode — VERIFIED observe-only at turn-end
- OpenCode plugin hooks (`.opencode/plugins/*.ts`): `session.idle` fires when the agent finishes a turn — **observe-only** (notification/telemetry; no documented block/inject). A blocking `session.stopping` event is an **OPEN, unmerged feature request** (`sst/opencode#16626`); attempting an in-tool re-prompt from `session.idle` races teardown in `opencode run`. `tool.execute.before` CAN throw to block a *tool* mid-turn — but that is AC5-excluded mid-turn blocking, NOT turn-end enforcement.
- **Conclusion:** OpenCode has NO blocking turn-end hook. Enforcement = the `session.idle` plugin emits a turn-end signal + HyperIdle's process wrapper re-invokes the CLI in the sandbox it owns. Source: `opencode.ai/docs/plugins`; `github.com/sst/opencode/issues/16626`.

### 0.5 Cursor Agent — VERIFIED soft-only + not-spawnable today
- Cursor's hooks include a `stop` hook, but its only turn-end lever is `followup_message` — a **soft re-prompt issued AFTER the turn ends, not a hard block**. Local-CLI hook execution for `cursor-agent` is ⚠️ **UNVERIFIED** (Cursor's hooks are documented for the IDE/agent; whether `cursor-agent`'s headless CLI executes `.cursor/hooks.json` locally is unconfirmed) — and moot today because `cursor-agent` has no spawnable headless surface (`harness-discovery.ts:301–324`). Source: Cursor hooks docs (web); `harness-discovery.ts` discovery state.

### 0.6 None of the four CLIs expose turn-termination via MCP
Verified: none of claude-code/codex/opencode/cursor exposes a turn-stop control through MCP. **Enforcement is NOT architected around MCP.** MCP is solely the callback transport the native blocking hook uses to read gate state from HyperIdle.

---

## 1. Plan reconciliation (spec ⇆ reality) — verified at file:line

| Assumption | Reality (file:line) | Plan handling |
|---|---|---|
| Closed return set exists | `RETURN_ACTION_NAMES` `shared/src/harness/return-actions.ts:23` | KEEP untouched |
| `ReturnGate` exists | `server/src/harness/return-gate.ts` (`evaluateReturn:64`) | KEEP; expose to callback + drain floor |
| `not_returned` persisted | `session-provisioning.ts:996–1017` emits `session_not_returned` + endSession `"not_returned"` | KEEP persistence; REMOVE the loop that produced it |
| v3 re-prompt loop | `runSession` `while(true)` `session-provisioning.ts:773` | DELETE |
| v3 sandbox-rewrite carrier | `re-engage.ts` `rewriteSandboxForcing`; imported `session-provisioning.ts:36`; called `:915` | DELETE `re-engage.ts`; KEEP `AL6_FORCE_RETURN_MESSAGE` (hook `reason` reuses it) |
| `.mcp.json` provisioning | `session-provisioning.ts:690–700` writes `.mcp.json` to sandbox root | MODEL `.claude/settings.json` + `.codex/hooks.json` writes on this exact pattern |
| MCP bridge + token + route | `mcp-bridge.ts:102–142` (`createMcpBridge({sessionId,registry})`, 256-bit token `:106`); registers ONLY `registry.definitions` `:120–136` | the callback rides this; inject `hyperidle_return_status` as a registry `ToolDefinition` (§4) |
| Registry binds ctx | `buildToolRegistry(ctx, {role})` `tool-registry.ts:261`; `invoke` calls `def.handler(parsed.data, ctx)` `:282`; `ToolContext.sessionId` `:44` | the tool handler reads `ctx.sessionId` → enforcement registry (no token→session indirection needed) |
| `CLI_TOOL_CONFIGS` = codex/opencode | `adapter-pool.ts:333–357` | provision `codex:"settings-codex"` (block); `opencode:"process-reengage"` |
| cursor-agent discovery-only | `harness-discovery.ts:301–324` (`unavailable`) | declare a `cursor` channel for the future, but NOT a spawnable enforcement target today |
| existing SDK Stop hook | `claude-agent-sdk-adapter.ts:198–213,302–325` (`stopHook`, `getForceReturnCount`, caps) | KEEP; reframe as `sdk-inprocess` channel; read registry not local `al6` |
| `hasNativeReturnHook`/`canReEngage` caps | `harness-adapter.ts:139,151` | REPLACE with `returnEnforcement` channel descriptor (§5) |
| `getForceReturnCount?`/`continueSession?` | `harness-adapter.ts:175,187` | `getForceReturnCount` KEEP (now reads registry block-count); DELETE `continueSession?` (Mode-2 dead) |
| `CLI_TOOL_CONFIGS` use `{{sandbox}}` | `adapter-pool.ts:351` opencode uses `{{sandbox}}` (`@lore AK1`, renamed from `{{workspace}}`) | the template-var bug from r1 was the OLD `{{workspace}}`; AK1 already fixed it. `.claude/settings.json`/`.codex/hooks.json` writes use `sandboxPath` directly regardless |

---

## 2. The provisioning seam — `provisionReturnHook`

The single new responsibility: **at session/sandbox setup, install the harness's native return-enforcement channel — right where `.mcp.json` and `AGENTS.md` are already provisioned**. `runSession` collapses from the v3 `while(true)` loop to a SINGLE `startSession` + single drain. Provisioning happens BEFORE `startSession`:

```ts
// session-provisioning.ts, Phase 8b (after .mcp.json write ~line 700, before startSession)
provisionReturnHook({
  sandboxPath,
  channel: harness.getCapabilities().returnEnforcement,   // §5
  bridgeToken: mcpBridgeToken,                             // callback credential
  mcpUrl,                                                  // ${mcpBaseUrl}/api/mcp/${token}
  forceBudget: AL6_MAX_FORCE_RETURNS,
});
```

`provisionReturnHook` dispatches on the declared channel:
- `"sdk-inprocess"` → no file; the SDK adapter wires its `Stop` closure in `startSession` (already does). HyperIdle passes `SessionConfig.returnHook` so the closure reads the enforcement registry instead of its own `al6` state.
- `"settings-claude"` → write `<sandbox>/.claude/settings.json` with a `Stop` command hook that POSTs `hyperidle_return_status` over the bridge and blocks (exit 2 + stderr `reason`) when not returned & budget left.
- `"settings-codex"` → write `<sandbox>/.codex/hooks.json` with the equivalent `Stop` hook (`decision:block`+`reason`).
- `"builtin-loop"` → no file; the builtin loop consults the registry at loop-end.
- `"process-reengage"` → write the OpenCode `.opencode/plugins/return-signal.ts` (emits a turn-end marker) and arm HyperIdle's process wrapper (§4.4) to re-invoke on a no-return turn-end.
- `"soft-continue"` (Cursor, future) → write `.cursor/hooks.json` with a `stop` hook returning `followup_message`. Inert today (cursor not spawnable).
- `"none"` (remote-nonconforming worker fallback) → no local artifact; drain-gate floor only.

---

## 3. Per-adapter enforcement table (VERIFIED, codex+opencode real)

| Adapter | Native turn-end channel | `returnEnforcement` | Provisioned config | Callback to HyperIdle | Verified |
|---|---|---|---|---|---|
| **claude-agent-sdk** (`claude-agent-sdk-adapter.ts`) | `options.hooks.Stop` closure — **hard block** | `"sdk-inprocess"` | none on disk; closure reads `SessionConfig.returnHook`→registry | in-process registry read (same process) | VERIFIED + shipping (`:198–213`) |
| **claude-code CLI** (`cli-harness-adapter.ts` + a NEW `CLI_TOOL_CONFIGS.claude` / the existing claude-code path) | `.claude/settings.json` `Stop` — **hard block** (exit 2 + stderr / `decision:block`) | `"settings-claude"` | HTTP POST `${mcpUrl}` → `hyperidle_return_status` | seam VERIFIED; block-channel ⚠️ UNVERIFIED-AT-RUNTIME → §9 |
| **codex** (`CLI_TOOL_CONFIGS.codex`) | `.codex/hooks.json` `Stop` — **hard block** (`decision:block`+`reason`) | `"settings-codex"` | HTTP POST `${mcpUrl}` → `hyperidle_return_status` | hook system VERIFIED (web 2026-06-24); end-to-end ⚠️ UNVERIFIED-AT-RUNTIME → §9 |
| **opencode** (`CLI_TOOL_CONFIGS.opencode`) | `session.idle` plugin — observe-only at turn-end | `"process-reengage"` | plugin emits turn-end marker; HyperIdle wrapper re-invokes | wrapper-side VERIFIED; re-engage reliability ⚠️ UNVERIFIED → §9 |
| **cursor-agent** (discovery-only) | `stop` hook → `followup_message` — soft | `"soft-continue"` | n/a today (not spawnable) | local-CLI hook exec ⚠️ UNVERIFIED; inert until Cursor ships a headless surface |
| **isolated** (`isolated-harness-adapter.ts` → `isolated-session-worker.ts`) | inherits inner SDK `Stop` closure — **hard block** | `"sdk-inprocess"` | inner closure → registry; worker forwards `returnHook` | VERIFIED (forks SDK adapter) |
| **builtin** (`builtin-harness-adapter.ts`) | in-process loop owns turn-end — **block** | `"builtin-loop"` | direct in-process registry read | VERIFIED (owns its loop) |
| **remote** (`remote-harness-adapter.ts`) | worker-side; depends on the worker | `"process-reengage"` unless worker guarantees a block | `dispatch` carries `returnHook`; conforming worker installs it | HyperIdle-side VERIFIED; worker honoring = worker-protocol contract |
| **mock** (`shared/.../mock-harness-adapter.ts`) | n/a (test) | per-test | declares per test need | n/a | n/a |

The blocking (hard-enforce) rows: claude-agent-sdk, claude-code CLI, codex, isolated (inherited), builtin (owns loop). The soft / wrapper rows: opencode (process re-engage), cursor (soft, inert), remote (process re-engage default). **No row claims a non-existent adapter; no `gemini`; no aider/goose.**

---

## 4. The hook → HyperIdle adjudication contract (over the MCP bridge)

The bridge already exists, token-authed (`/api/mcp/:token`, 256-bit `mcp-bridge.ts:106`). It registers ONLY `registry.definitions` (`:120–136`) — there is no "alongside" seam. Fix: inject `hyperidle_return_status` as a per-session `ToolDefinition` so the bridge picks it up automatically.

### 4.1 Registration seam
- `buildToolRegistry(toolContext, {role})` (`session-provisioning.ts:608`) builds `definitions` from `toolsForRole(role)` and binds `toolContext` (carries `sessionId`, `tool-registry.ts:44,261`).
- Add `hyperidle_return_status` as a `ToolDefinition` appended to the harness-session registry via a new `extraTools` option on `buildToolRegistry` (present only for harness-driven sessions, not the UI API).
- `createMcpBridge({sessionId, registry})` (`mcp-bridge.ts:102`) registers it with every other tool — ZERO change to `createMcpBridge`.

### 4.2 sessionId → enforcement-registry lookup
- `registry.invoke(name, args)` calls `def.handler(parsed.data, ctx)` (`tool-registry.ts:282`) — `ctx` is the bound `ToolContext`, carrying `sessionId`.
- The handler reads `ctx.sessionId` → looks up the **session enforcement registry** (`return-enforcement-registry.ts`, new) → `{ gate, forceCount, exempt }`. The bridge token is the transport identity; `ctx.sessionId` is the adjudication identity; both are built per-session in `runSession` with the same `sessionId`. No token→session indirection needed inside the tool.

### 4.3 Tool: `hyperidle_return_status`
- **Input:** none (`z.object({})`). Identity from `ctx.sessionId`.
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
- **Semantics (server-side, pure):** delegates to `shouldForceReturn(gate, forceCount)` + gate state. `forceMessage !== null` ⇔ the hook should BLOCK (re-inject); the registry increments `forceCount` when it hands back a non-null `forceMessage` so budget is consumed. `returned || exempt || budgetLeft===0` → `forceMessage:null` → hook allows end.
- **State:** a per-session `return-enforcement-registry.ts` (new, `server/src/harness/`) keyed by `sessionId`, populated by `runSession` at start (`{ gate, forceCount:0, exempt }`), read by the tool handler + the in-process closures + the process wrapper. Mirrors `mcpBridgeRegistry` lifecycle (register at start, unregister at end).

### 4.4 The block / re-engage mechanism per channel
| Channel | "block + re-inject" | "allow end" |
|---|---|---|
| `sdk-inprocess` (SDK closure) | `return { decision:"block", reason: forceMessage }` | `return { decision:"approve" }` |
| `settings-claude` (`.claude/settings.json` command) | `process.exit(2)` + write `reason` to stderr | `process.exit(0)` |
| `settings-codex` (`.codex/hooks.json` command) | emit `{"decision":"block","reason":forceMessage}` (or exit 2 + stderr per Codex's hook contract) | `{"decision":"approve"}` / exit 0 |
| `builtin-loop` | continue loop with `forceMessage` injected as next message | break loop |
| `process-reengage` (opencode/remote) | HyperIdle wrapper re-invokes the CLI in the SAME sandbox with `forceMessage` (using OpenCode's `opencode run`/native soft-continue if present, else a fresh process turn) | wrapper records `completed` |
| `soft-continue` (cursor, future) | `stop` hook returns `followup_message: forceMessage` | hook returns nothing |

**Process re-engage detail (`process-reengage`):** the OpenCode plugin (`.opencode/plugins/return-signal.ts`) writes a turn-end marker (or HyperIdle reads the CLI's structured turn-end exit). The wrapper, in `runSession`, on a no-return turn-end with budget left, re-`startSession`s **only this no-block adapter** with the forcing message appended to the kickoff prompt (NOT the instruction file). This is bounded by `AL6_MAX_FORCE_RETURNS`. It looks like the v3 loop but is NOT: it is scoped to the no-block adapters only (not universal), provisioned per-adapter as a declared channel, and never rewrites `AGENTS.md`. The blocking adapters never enter this path.

### 4.5 Why the bridge, not a new HTTP endpoint
Already provisioned into every MCP-capable sandbox (`.mcp.json`), token-authed, torn down on session end. Injecting one tool is zero new surface, no new auth, no new route. In-process channels read the registry directly; the bridge tool is the channel for file-provisioned (Claude CLI / Codex) callbacks.

---

## 5. SHARED-contract changes (adapter interface + capability)

### 5.1 `HarnessCapabilities` (`packages/shared/src/harness/harness-adapter.ts`)
- **REMOVE** `hasNativeReturnHook: boolean` (`:139`) and `canReEngage: boolean` (`:151`).
- **ADD** `returnEnforcement: ReturnEnforcementChannel` where
  ```ts
  type ReturnEnforcementChannel =
    | "sdk-inprocess"     // BLOCKING Stop closure wired in startSession (claude-agent-sdk, isolated)
    | "settings-claude"   // HyperIdle writes .claude/settings.json Stop hook (BLOCKING)
    | "settings-codex"    // HyperIdle writes .codex/hooks.json Stop hook (BLOCKING)
    | "builtin-loop"      // in-process loop owns turn-end (BLOCKING)
    | "process-reengage"  // no native block — HyperIdle re-invokes the CLI in its sandbox (opencode, remote default)
    | "soft-continue"     // native soft re-prompt (cursor — inert until spawnable)
    | "none";             // no enforcement artifact — drain-gate floor only (last-resort remote)
  ```
  Declares the PROVISIONING CHANNEL; `provisionReturnHook` dispatches on it. **Non-optional** — TS strict forces every adapter to declare a channel (the forcing function for "uniform across harnesses").

### 5.2 `SessionConfig` (`harness-adapter.ts`)
- **ADD** `readonly returnHook?: ReturnHookConfig`:
  ```ts
  interface ReturnHookConfig {
    readonly bridgeToken: string;   // bridge callback credential
    readonly mcpUrl: string;        // ${mcpBaseUrl}/api/mcp/${token}
    readonly forceBudget: number;   // AL6_MAX_FORCE_RETURNS
  }
  ```
  SDK/builtin closures + the process wrapper read this (with `sessionId` from `config`) to reach the enforcement registry; the `settings-*` templates interpolate `bridgeToken`/`mcpUrl`.

### 5.3 `HarnessAdapter` interface
- **KEEP** `getForceReturnCount?(sessionId): number` (`:175`) — now returns the **enforcement-registry block count** (incremented when the provisioned hook/wrapper got `forceMessage!==null`), NOT a loop counter. Update the doc at `:170` to drop the `loopForceCount + …` formula (no loop term any more).
- **DELETE** `continueSession?(handle, message)` (`:187`) — Mode-2 dead in v4.

### 5.4 `mock-harness-adapter.ts` + descriptor builders
- Update each adapter's `getCapabilities()` to return `returnEnforcement` (per §3) instead of the two removed booleans.

---

## 6. Files: add / modify / delete

### Add
- `packages/server/src/harness/return-enforcement-registry.ts` — per-session `{ gate, forceCount, exempt }`; `register/get/incrementForce/unregister`. Read by tool handler + in-process closures + process wrapper.
- `packages/server/src/harness/provision-return-hook.ts` — `provisionReturnHook(args)` dispatching on `returnEnforcement`; writes `.claude/settings.json` / `.codex/hooks.json` / `.opencode/plugins/return-signal.ts`; no-op for `sdk-inprocess`/`builtin-loop`/`none`.
- `packages/server/src/tools/return-status-tool.ts` — the `hyperidle_return_status` `ToolDefinition` (reads `ctx.sessionId`→registry; reuses `shouldForceReturn`+gate). Injected into the harness-session registry.
- Unit tests: `provision-return-hook.test.ts`, `return-enforcement-registry.test.ts`, `return-status-tool.test.ts`.
- `packages/server/src/mcp/return-status.integration.test.ts` — hook→bridge→registry round-trip via a real `createMcpBridge` + `handleRequest`.
- `packages/server/src/harness/__tests__/AL6-real-harness-return-enforcement.integration.test.ts` — the founder-required real-harness tests (§9).

### Modify
- `packages/shared/src/harness/harness-adapter.ts` — §5 contract changes (remove 2 booleans, add `returnEnforcement` + `SessionConfig.returnHook`/`ReturnHookConfig`; delete `continueSession?`; fix `getForceReturnCount` doc).
- `packages/shared/src/harness/mock-harness-adapter.ts` — `returnEnforcement`.
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` — Stop closure reads `config.returnHook`→registry instead of local `al6`; caps `returnEnforcement:"sdk-inprocess"`.
- `packages/server/src/harness/adapter-pool.ts` — `codex` declares `"settings-codex"`; `opencode` declares `"process-reengage"`; add a `claude` CLI config (`"settings-claude"`) OR route the existing claude-code CLI path there.
- `packages/server/src/harness/builtin-harness-adapter.ts` — `"builtin-loop"`; loop-end consults registry.
- `packages/server/src/harness/isolated-harness-adapter.ts` / `isolated-session-worker.ts` — forward `returnHook`; inherit inner SDK hook; `"sdk-inprocess"`.
- `packages/server/src/harness/remote-harness-adapter.ts` — `dispatch` carries `returnHook`; `"process-reengage"` (or `"none"`).
- `packages/server/src/harness/cli-harness-adapter.ts` — the process-wrapper re-engage path for `process-reengage` adapters (read turn-end marker; bounded re-invoke).
- `packages/server/src/tools/tool-registry.ts` — `buildToolRegistry` gains `extraTools` so `hyperidle_return_status` is present for harness sessions.
- `packages/server/src/services/session-provisioning.ts` — **DELETE the `while(true)` loop**; single `startSession`+drain; call `provisionReturnHook` in Phase 8b; register/unregister the enforcement registry; KEEP `not_returned`/`session_not_returned`/`evaluateReturn` at drain; `forceReturnCount` = registry count.
- `packages/eval/src/scenarios/force-return.ts` + `provision-harness.ts` — rework for the native-hook keystone (§9 local eval).

### Delete
- `packages/server/src/harness/re-engage.ts` (`rewriteSandboxForcing`) — v3 carrier.
- v3 loop tests / `canReEngage` / `continueSession` refs; `AL6-reprompt-loop.integration.test.ts` (re-targeted, not the loop).
- KEEP `AL6_FORCE_RETURN_MESSAGE` + `shouldForceReturn` (reused).

---

## 7. Acceptance criteria + verification

| AC | Criterion (v4 framing) | Verification |
|---|---|---|
| **AC1** | Every turn, every harness, ends only after a return action; a would-be no-return end is not accepted as complete | Integration: drive each adapter with a stub model that does NOT return; for block channels assert the hook fired a block + recorded `not_returned` (never `completed`); for `process-reengage` assert a re-invoke happened then `not_returned` at budget; unit: `return-status-tool` returns `forceMessage!==null` when gate.returned=false & budget left. **Real-harness:** §9. |
| **AC2** | HyperIdle enumerates the closed valid-ending set | Unit (KEEP): `return-actions.closure.test.ts` — every `RETURN_ACTION_NAMES` member maps to a registered tool; finite `as const`. |
| **AC3** | A no-return end is detected and not silently completed — redirected or surfaced as not-returned | Integration: gate=false at end → `session_not_returned` + `outcome:"not_returned"`. Unit: `evaluateReturn(gate,"completed")==="not_returned"` (KEEP). |
| **AC4** | Enforcement holds uniformly — native-block where a blocking hook exists; native-soft / process re-engage where it doesn't; drain-gate floor for all; one contract | (a) Type: `returnEnforcement` non-optional → `npm run check` forces every adapter to declare. (b) Unit: `provisionReturnHook` writes the correct artifact per channel (`.claude/settings.json`, `.codex/hooks.json`, opencode plugin; no-op asserted for `sdk-inprocess`/`builtin-loop`/`none`). (c) **Real-harness integration (§9): the provisioned native hook on a real `claude` AND a real `codex` binary blocks a no-return turn-end; the process wrapper re-engages a real `opencode`.** (d) Integration: a `process-reengage`/`none` adapter at budget → `not_returned` at drain. |
| **AC5** | Mid-turn non-terminal tool use unaffected — only the ending is constrained | Unit: the hook is `Stop`/turn-end only; mid-turn `tool_call` never consults it. Integration: a session that calls a non-return tool mid-turn then returns → zero blocks, `outcome:"completed"`. |

### route-checklist (channel must cover every adapter)
`provisionReturnHook` + `getCapabilities().returnEnforcement` exercised for: `claude-agent-sdk`, `claude-code CLI`, `codex`, `opencode`, `builtin`, `isolated`, `remote`, `cursor` (declared, inert), `mock`. A per-adapter table test asserts each returns a non-`undefined` channel and `provisionReturnHook` handles it.

### Security & abuse cases
- **Callback auth:** `hyperidle_return_status` rides the existing bridge token (256-bit, `/api/mcp/:token` → 401 on unknown). No new auth.
- **Hook command injection (`.claude/settings.json` / `.codex/hooks.json`):** command is a fixed template + the session's server-minted bridge token/url (hex, not agent-authored). No agent-controlled value enters the shell. Unit-assert the written command contains only the server-minted token/url.
- **Agent disabling the hook:** an agent with sandbox file-write could edit `.claude/settings.json` / `.codex/hooks.json` to remove the Stop hook. **Mitigation:** the drain-end `ReturnGate` is the un-bypassable backstop — its truth source is the harness EVENT STREAM HyperIdle ingests, OUTSIDE agent control (the agent cannot forge a `submit_review` event it did not emit). Even if the hook is deleted, the no-return turn is still recorded `not_returned`. `@lore`: the hook is the forcing layer; the event-stream-fed gate is the record-of-truth.
- **Path traversal:** paths are `path.join(sandboxPath, ".claude"|".codex", …)` — no agent input. N/A.

### protectedTests
- `packages/shared/src/__tests__/return-actions.closure.test.ts` (closed-set invariant) — assertions unchanged.
- `evaluateReturn` exemption tests in `return-gate.test.ts`.

### sharedFiles
`packages/shared/src/harness/harness-adapter.ts`, `mock-harness-adapter.ts`, `packages/server/src/services/session-provisioning.ts`, `adapter-pool.ts`, `tools/tool-registry.ts`, `mcp/mcp-bridge.ts`.

---

## 8. Design-it-twice — the callback transport

**Option A — bridge MCP tool injected into the registry (chosen).** The hook calls `hyperidle_return_status`, registered as a `ToolDefinition` in the per-session registry → bridge auto-registration. Reuses the already-provisioned, token-authed bridge; in-process adapters skip HTTP; `ctx.sessionId` resolves identity with no new wiring. Reject reason: none material.

**Option B — dedicated HTTP endpoint `POST /api/sessions/:id/return-status`.** Simpler curl in the hook, but needs its own auth (session id is guessable → a separate per-session token = re-inventing the bridge token), a new route mounted pre-auth, a new rate-limit. Strictly more surface for no gain. **Reject.**

**Synthesis:** A. File-provisioned (Claude CLI / Codex) + the process wrapper POST the MCP tool over the bridge URL/token in `ReturnHookConfig`; in-process (SDK/builtin) closures read the enforcement registry directly — same adjudication (`shouldForceReturn`+gate), two transports.

---

## 9. Real-harness integration tests (founder-required DoD) + local live eval

### 9.1 Real-harness integration tests — `AL6-real-harness-return-enforcement.integration.test.ts`
Follows the EXISTING pattern in `AM2-real-harness-session-probe.integration.test.ts` (`binaryPresent` via `which`, per-harness `*Authed()`, `test.skipIf(!installed)` + in-test `ctx.skip()` on unauthed, real `execFile`/`spawn` with hard-coded arg arrays) and `X3-session-provisioning.integration.test.ts` (provision → run → assert on the session row/outcome). One `test.skipIf` block per supported harness:

| Test (harness) | What's provisioned | Real harness run | Asserted real behavior | Binary-gating |
|---|---|---|---|---|
| **claude-code (CLI)** | `provisionReturnHook` writes a REAL `<sandbox>/.claude/settings.json` `Stop` hook (`settings-claude`) | spawn the real `claude` binary in that sandbox with a seed prompt that instructs "do NOT call any return tool" | the `Stop` hook fired (registry `forceCount>=1`, `hookFiredVia:"settings-claude"`); the turn was BLOCKED (the binary continued / re-prompted) OR ended `not_returned` at budget; gate recorded `returned` vs `not_returned`; exactly ONE `startSession` (no loop) | `binaryPresent("claude")` + `claudeAuthed()` (reuse AM2's check); skip-with-marker if absent |
| **codex (CLI)** | `provisionReturnHook` writes a REAL `<sandbox>/.codex/hooks.json` `Stop` hook (`settings-codex`) | spawn real `codex exec <seed> --json` (per `CLI_TOOL_CONFIGS.codex`) in that sandbox | the `Stop` hook fired (registry `forceCount>=1`, `hookFiredVia:"settings-codex"`); the turn was BLOCKED or ended `not_returned` at budget; gate outcome asserted; one `startSession` | `binaryPresent("codex")` + `codexAuthed()` (reuse AM2's `codex login status`); skip-with-marker if absent |
| **opencode (CLI)** | `provisionReturnHook` writes the `.opencode/plugins/return-signal.ts` + arms the process wrapper (`process-reengage`) | spawn real `opencode --dir <sandbox>` with a no-return seed | the plugin emitted the turn-end marker; HyperIdle's wrapper RE-INVOKED the CLI with the forcing message (registry re-engage count>=1); at budget the gate recorded `not_returned` (never silent `completed`) | `binaryPresent("opencode")` + `opencodeAuthed()` (reuse AM2's `providers list`); skip-with-marker if absent |
| **builtin** | registry-only (`builtin-loop`); no binary | run the builtin harness in-process with a stub model that does not return | the loop re-injected `forceMessage` at loop-end (`forceCount>=1`); at budget → `not_returned`; a returning stub → `completed` with zero blocks | none (always available) — the deterministic anchor of the suite |

Each test asserts BOTH the channel marker (`hookFiredVia` / re-engage count, proving the harness/wrapper enforced — not HyperIdle's old loop) AND the final gate outcome on the session row. **Skip discipline (per AM2):** an absent/unauthed binary `ctx.skip()`s with an explicit reason string; it does NOT silently pass. The WP is NOT done until claude + codex + opencode have each run once locally with a real authed binary and the run is captured in the proof artifact; builtin runs unconditionally in CI.

These prove the ⚠️ UNVERIFIED-AT-RUNTIME claims: claude CLI exit-2+stderr block (§0.2), codex `Stop`-block end-to-end (§0.3), opencode process-wrapper re-engage reliability (§0.4).

### 9.2 Local live eval (kept, complementary)
`packages/eval/src/scenarios/force-return.ts` reworked to drive a real authed binary through the full provisioning → run → outcome path, scored by an LLM judge on "did the agent get redirected to return". Local only (`cd packages/eval && node dist/cli.js --feature force_return`); SKIP with markers when no model credentials / no binary. Per `feedback_eval_vs_test` + `feedback_agent_behavior_needs_live_eval_and_forcing` + `feedback_live_proof_lanes_run_before_ship`. The real-harness integration tests are the founder-required artifact; the eval is the agent-judgment complement.

---

## 10. Ordered task list

1. **SHARED contract** — `harness-adapter.ts`: remove `hasNativeReturnHook`/`canReEngage`, add `returnEnforcement` (`"sdk-inprocess"|"settings-claude"|"settings-codex"|"builtin-loop"|"process-reengage"|"soft-continue"|"none"`) + `SessionConfig.returnHook`/`ReturnHookConfig`; delete `continueSession?`; fix `getForceReturnCount` doc. Update `mock-harness-adapter.ts`. (Blocks everything; `npm run check` lists every adapter to fix.) *Test: type-level via check; mock cap unit.*
2. **Enforcement registry** — `return-enforcement-registry.ts`. *Unit.*
3. **Return-status tool** — `return-status-tool.ts` (`ToolDefinition`, reads `ctx.sessionId`); wire into `buildToolRegistry` via `extraTools` for harness sessions; reuse `shouldForceReturn`+gate. *Unit + integration (real bridge round-trip).*
4. **`provisionReturnHook`** — dispatch on channel; write `.claude/settings.json` / `.codex/hooks.json` / `.opencode/plugins/return-signal.ts`; no-op for `sdk-inprocess`/`builtin-loop`/`none`. *Unit asserting file content + injection-safety + no-op cases.*
5. **SDK adapter** — Stop closure reads `config.returnHook`→registry instead of local `al6`; `"sdk-inprocess"`. *Unit (closure decision from gate).*
6. **builtin adapter** — loop-end consults registry; `"builtin-loop"`. *Unit.*
7. **isolated + remote** — forward `returnHook`; declare channels (`isolated:"sdk-inprocess"`, `remote:"process-reengage"`). *Unit.*
8. **CLI adapters** — `codex:"settings-codex"`, `opencode:"process-reengage"`, claude CLI `"settings-claude"`; the process-wrapper re-engage path in `cli-harness-adapter.ts` for `process-reengage`. *Unit.*
9. **`session-provisioning.ts`** — DELETE the v3 loop; single startSession+drain; `provisionReturnHook` in Phase 8b; register/unregister enforcement registry; KEEP `not_returned`/`session_not_returned`/`evaluateReturn` at drain; `forceReturnCount` from registry. *Integration: no-return → `not_returned` (a block adapter + a process-reengage adapter); return → `completed`; mid-turn tool → unaffected (AC5).*
10. **DELETE** `re-engage.ts` + v3 loop tests + `canReEngage`/`continueSession` refs; fix cost-delta + session-provisioning tests that assumed the loop.
11. **Real-harness integration tests** — `AL6-real-harness-return-enforcement.integration.test.ts` (§9.1) per harness (claude-code, codex, opencode, builtin), AM2/X3 pattern, binary-gated. Run locally with real authed binaries; capture the proof artifact.
12. **Local live eval** — rework `force-return.ts`/`provision-harness.ts` (§9.2); run locally; carry score to review.
13. **Verify** — `npm run check && npm run lint && npm run test`; then `test:integration` (real-harness tests, gated); then the live eval.

**Dependency order:** 1 → (2,3,4 parallel) → (5,6,7,8 parallel) → 9 → 10 → 11 → 12. Task 1 is the shared-contract gate; per-adapter tasks (5–8) each compile-fail until they declare `returnEnforcement` — the type makes "uniform across harnesses" un-skippable (the root-cause fix for the v1/v2/v3 scope gaps).

---

## 11. Honesty ledger (⚠️ flags + what proves them)

| Claim | Status | Proven by |
|---|---|---|
| Claude SDK `Stop` block | VERIFIED (types + shipping code) | already in `claude-agent-sdk-adapter.ts:198–213` |
| Claude CLI `.claude/settings.json` `Stop` block (exit 2 + stderr) | seam VERIFIED; ⚠️ UNVERIFIED-AT-RUNTIME end-to-end | §9.1 real `claude` binary test |
| Codex `.codex/hooks.json` `Stop` block | hooks system VERIFIED (web 2026-06-24); ⚠️ UNVERIFIED-AT-RUNTIME end-to-end | §9.1 real `codex` binary test |
| OpenCode process-wrapper re-engage | wrapper-side VERIFIED; ⚠️ UNVERIFIED re-engage reliability against `opencode run` teardown timing | §9.1 real `opencode` binary test |
| OpenCode has no blocking turn-end hook | VERIFIED (`session.idle` observe-only; `session.stopping` is open FR `sst/opencode#16626`) | web 2026-06-24 |
| Cursor local-CLI hook execution + spawnability | ⚠️ UNVERIFIED + not spawnable today | `harness-discovery.ts:301–324`; declared channel inert until Cursor ships a headless surface |
| No harness exposes turn-stop via MCP | VERIFIED | §0.6 — enforcement uses MCP only as the gate-status callback transport |

**The founder's premise, re-assessed honestly:** *"all these harnesses provide support for hooks these days"* — substantially RIGHT for the real supported set. Two of the spawnable CLIs (Claude Code, Codex) have native BLOCKING turn-end hooks; the remaining real ones (OpenCode, Cursor) have hooks that are observe-only/soft, for which HyperIdle's sandbox/process ownership ("full sandbox = plenty of options") provides the re-engage floor. v4-final ships native blocking enforcement on Claude Code + Codex + builtin + isolated, native-soft/process-reengage on OpenCode/Cursor/remote, and the un-bypassable drain-gate floor on ALL — one provisioning contract, one adjudication source of truth, no fabricated coverage.
