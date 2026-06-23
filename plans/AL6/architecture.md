# AL6 v4 — Architecture: per-harness native hook provisioning + MCP-bridge enforcement

**Concept:** `plans/AL6/concept.md`. **Spec:** `.pipeline/work-packages/TRACK-AL.md` §AL6. **Versions rejected:** v1 (flag), v2 (Claude-only), v3 (provisioner re-prompt loop + instruction-file rewrite). **This is v4** — the founder's design: provision a real turn-end/Stop hook into EACH harness's OWN native hook system as first-class sandbox/adapter setup; the harness enforces; HyperIdle provisions + adjudicates over the MCP bridge.

---

## 0. Source verification (mechanism survey — required for enforcement WPs)

Verified against the **installed** SDK types (`packages/server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`, v0.2.109) — not web claims (web-research rule).

1. **SDK Stop hook (in-process):** `Options.hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>`; `HookEvent` includes `'Stop'` (`HOOK_EVENTS` const, sdk.d.ts:738). `StopHookInput` carries `stop_hook_active`, `last_assistant_message`. Hook returns `HookJSONOutput`; `SyncHookJSONOutput` has `{ decision?: 'approve' | 'block'; reason?: string; continue?: boolean; systemMessage?: string }` (sdk.d.ts:5540). `decision:'block' + reason` blocks the stop and feeds `reason` to the model — VERIFIED. (This is what the existing SDK adapter already does.)
2. **File-provisioned hooks (`.claude/settings.json`):** `Options.settingSources?: SettingSource[]`; `SettingSource = 'user' | 'project' | 'local'` (sdk.d.ts:5391). Doc (sdk.d.ts:1660-1669): *"`'project'` — Project settings (`.claude/settings.json`). When omitted, all sources are loaded (matches CLI defaults). Pass `[]` to disable filesystem settings."* → **The Claude Code CLI and the SDK (when `settingSources` includes `'project'` or is omitted) read hooks from a `.claude/settings.json` written into the sandbox `cwd`.** This is the v4 file-provisioning seam — identical pattern to `.mcp.json`. VERIFIED for Claude; the JSON `hooks` block format (matcher → `{ type: "command", command }`) is the documented Claude Code settings format ⚠️ UNVERIFIED-AT-RUNTIME (no live CLI in repo to exercise; the live eval proves it — see §9).
3. **codex / gemini CLI hook formats:** no binary, no vendored docs in-repo. ⚠️ UNVERIFIED — flagged per-row in §3; each must be verified against the real tool at build time or recorded as a genuine documented exception. The founder's bar permits a documented exception, NOT a re-prompt-loop fallback.

---

## 1. Plan reconciliation (spec ⇆ reality)

| Spec/concept assumption | Reality (grepped) | Plan handling |
|---|---|---|
| Closed return set exists | `RETURN_ACTION_NAMES` in `shared/.../return-actions.ts` | KEEP, untouched |
| `ReturnGate` exists | `server/.../return-gate.ts` | KEEP; expose state to callback (new read seam) |
| `not_returned` SessionOutcome persisted | `session-provisioning.ts` emits `session_not_returned` + `endSession(...,"not_returned")` | KEEP the persistence; REMOVE the loop that produced it |
| v3 re-prompt loop | `runSession` `while(true)` 712–917 | DELETE |
| v3 sandbox-rewrite carrier | `re-engage.ts` `rewriteSandboxForcing`; `AL6_FORCE_RETURN_MESSAGE` appended | DELETE `re-engage.ts`; KEEP `AL6_FORCE_RETURN_MESSAGE` (hook `reason` reuses it) |
| `.mcp.json` provisioning pattern | `session-provisioning.ts` Phase 8b writes `.mcp.json` to sandbox root | MODEL v4 `.claude/settings.json` provisioning on this exact pattern |
| MCP bridge + token + route | `mcp-bridge.ts`, `mcp-bridge-registry.ts`, `routes/mcp-route.ts` (`ALL /api/mcp/:token`) | the hook callback rides this; add one MCP tool to the per-session bridge |
| `hasNativeReturnHook`/`canReEngage` caps | `shared/.../harness-adapter.ts:139,151` | REPLACE with v4 `nativeReturnHook` provisioning descriptor (§5) |
| `getForceReturnCount?`/`continueSession?` | `harness-adapter.ts:175,187` | `getForceReturnCount` KEEP (now reads hook-fired count); DELETE `continueSession?` (Mode-2 dead) |
| `CLI_TOOL_CONFIGS` use `{{workspace}}` | `adapter-pool.ts:327,337,346` use `{{workspace}}` but template type is `{{sandbox}}` | ⚠️ PRE-EXISTING BUG (templates never substitute) — note for builder; out of AL6 scope but the `.claude/settings.json` write does not depend on it |

---

## 2. The provisioning seam — where the hook gets installed

The single new responsibility: **at session/sandbox setup, write/pass the harness's native return-enforcement hook config — right where `.mcp.json` and `CLAUDE.md` are already provisioned.**

Two provisioning channels, chosen per-adapter (a capability the adapter declares):

- **File-provisioned** (`.claude/settings.json` and codex/gemini equivalents): written to the sandbox root by a new `provisionReturnHook(sandboxPath, ctx)` step in `session-provisioning.ts`, called in Phase 8b alongside the `.mcp.json` write. The file references the bridge token so the hook can call back.
- **In-process** (SDK closure): the adapter wires the `Stop` hook in its own `startSession` from `SessionConfig` (it already does — reframed as its provisioning impl).

### 2.1 New provisioning step (replaces the v3 loop)
`runSession` Phase 9-10 collapses from a `while(true)` loop to a **single** `startSession` + single drain. The provisioning of the hook happens BEFORE `startSession`:

```ts
// session-provisioning.ts, Phase 8b (after .mcp.json write, before startSession)
provisionReturnHook({
  sandboxPath,
  adapter: harness,
  capability: adapterCapabilities.nativeReturnHook,   // §5
  bridgeToken: mcpBridgeToken,                          // the callback credential
  mcpBaseUrl,
});
```

`provisionReturnHook` dispatches on the adapter's declared `nativeReturnHook` provisioning channel:
- `"sdk-inprocess"` → no file write; the SDK adapter wires the closure itself (already does). HyperIdle passes a flag/token via `SessionConfig.returnHook` so the closure calls the bridge instead of holding its own state.
- `"settings-json"` → write `.claude/settings.json` with a `Stop` command hook that curls/posts the bridge `hyperidle_return_status` MCP tool.
- `"file:<path>"` → write the tool-specific hook config file (codex/gemini), if verified.
- `"none"` → genuine exception: no hook; the drain still computes `not_returned` at end (the only place the floor still lives without a loop).

---

## 3. Per-adapter native-hook mechanism table

For each: the native hook, the provisioned config, and how it calls back to HyperIdle.

| Adapter | Native hook | Provisioned config (v4) | Callback to HyperIdle | Verified |
|---|---|---|---|---|
| **claude-agent-sdk** (`claude-agent-sdk-adapter.ts`) | `options.hooks.Stop` closure | NONE written to disk — closure wired in `startSession`, reframed as this adapter's hook provisioning. Closure now reads return state via `SessionConfig.returnHook` (calls bridge tool) instead of the in-memory `al6.returnSeen` it tracks today. | in-process: closure calls the registry's `return_status` directly (no HTTP needed — same process) OR the bridge tool for uniformity | VERIFIED (sdk.d.ts) |
| **claude CLI / Claude Code** (`cli-harness-adapter.ts`, `CLI_TOOL_CONFIGS.claude` to be added) | `Stop` hook in `.claude/settings.json` (`project` source, from `cwd`) | `provisionReturnHook` writes `<sandbox>/.claude/settings.json` with `hooks.Stop[0].hooks[0] = { type: "command", command: "<curl POST to bridge return_status; exit 2 + stderr if not returned & budget left>" }` | HTTP POST to `${mcpBaseUrl}/api/mcp/${token}` invoking `hyperidle_return_status`; reads JSON, exit-2 + stderr `reason` to block, exit-0 to allow | Claude: VERIFIED seam; settings JSON `hooks` block format ⚠️ UNVERIFIED-AT-RUNTIME (proven by §9 eval) |
| **codex CLI** | hook/notify mechanism | tool-specific hook-config file written to sandbox | same bridge POST | ⚠️ UNVERIFIED — verify codex hook format at build; if none exists, record `nativeReturnHook:"none"` exception |
| **gemini CLI** | extension/hook mechanism | tool-specific hook-config file | same bridge POST | ⚠️ UNVERIFIED — same |
| **isolated** (`isolated-harness-adapter.ts` → `isolated-session-worker.ts`) | inherits inner SDK adapter's `Stop` closure | inner `ClaudeAgentSdkAdapter` provisions its own hook; the worker forwards `SessionConfig.returnHook` to it | inner closure → bridge tool | VERIFIED (worker forks the SDK adapter) |
| **remote** (`remote-harness-adapter.ts`) | worker-side native hook | `dispatch` message gains `returnHook` field (bridge token + budget); a conforming worker installs its own native hook | worker's hook → bridge tool (worker already has the token) | HyperIdle-side VERIFIED; third-party worker honoring it is a worker-protocol contract, documented |
| **builtin** (`builtin-harness-adapter.ts`) | in-process agent loop owns its own turn-end | the loop checks the registry's return state at loop-end and re-injects in-place (no startSession, no file) | direct in-process registry read | VERIFIED (builtin owns its loop) |
| **mock** (`shared/.../mock-harness-adapter.ts`) | n/a (test) | declares `nativeReturnHook:"none"` or `"sdk-inprocess"` per test need | n/a | n/a |

**Key:** every row provisions a NATIVE hook (or inherits/owns one) — none use a re-prompt loop. The only `"none"` rows are a genuine, documented exception path, never a workaround.

---

## 4. The hook → HyperIdle enforcement contract (over the MCP bridge)

The bridge already exists and is token-authenticated (`/api/mcp/:token`). v4 adds **one MCP tool** to the per-session bridge, registered in `createMcpBridge` alongside the registry tools:

### 4.1 Tool: `hyperidle_return_status`
- **Input:** none (the bridge token IS the session identity — `mcp-bridge.ts` keys the bridge by token→session).
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
- **Semantics (server-side, pure):** delegates to the existing `shouldForceReturn(gate, forceCount)` + gate state. `forceMessage !== null` ⇔ the hook should BLOCK (re-inject). When the hook reports it blocked, HyperIdle increments `forceCount` (so budget is consumed). When `returned || exempt || budgetLeft===0` → `forceMessage:null` → hook allows end.
- **State location:** the per-session `ReturnGate` + a per-session `forceCount` live in a small **session enforcement registry** keyed by `sessionId` (new, in `server/src/harness/return-enforcement-registry.ts`), populated by `runSession` at start and read by the bridge tool. (Mirrors `mcpBridgeRegistry`'s lifecycle.)

### 4.2 Why the bridge, not a new HTTP endpoint
The bridge is already provisioned into every MCP-capable sandbox (`.mcp.json`), already token-authed, already torn down on session end. Adding one tool to it is zero new surface, no new auth, no new route. The SDK/builtin in-process paths can read the registry directly (same process) and skip the HTTP round-trip — the bridge tool is the channel for the file-provisioned (CLI) and remote paths.

### 4.3 The block mechanism per channel
| Channel | "block + re-inject" | "allow end" |
|---|---|---|
| SDK closure | `return { decision: "block", reason: forceMessage }` | `return { decision: "approve" }` |
| `.claude/settings.json` command hook | `process.exit(2)` + write `reason` to stderr (Claude Code feeds stderr of a blocking Stop hook back to the model) ⚠️ UNVERIFIED-AT-RUNTIME — proven by §9 | `process.exit(0)` |
| builtin loop | continue loop with `forceMessage` injected as the next user message | break loop |
| remote worker | worker re-injects per its harness's block primitive | worker ends turn |

---

## 5. SHARED-contract changes (adapter interface + capability)

### 5.1 `HarnessCapabilities` (`packages/shared/src/harness/harness-adapter.ts`)
- **REMOVE** `hasNativeReturnHook: boolean` and `canReEngage: boolean` (v3 concepts — re-engage is gone).
- **ADD** `nativeReturnHook: NativeReturnHookProvisioning` where
  ```ts
  type NativeReturnHookProvisioning =
    | "sdk-inprocess"   // adapter wires Stop closure in startSession
    | "settings-json"   // HyperIdle writes .claude/settings.json
    | "builtin-loop"    // in-process loop owns turn-end
    | { file: string }  // adapter-specific hook-config file written to sandbox
    | "none";           // genuine documented exception — no native hook
  ```
  This declares the PROVISIONING CHANNEL — `provisionReturnHook` dispatches on it. Non-optional (TS strict catches any omission across the 7 adapters).

### 5.2 `SessionConfig` (`harness-adapter.ts`)
- **ADD** `readonly returnHook?: ReturnHookConfig` where
  ```ts
  interface ReturnHookConfig {
    readonly bridgeToken: string;     // for the bridge callback
    readonly mcpUrl: string;          // ${mcpBaseUrl}/api/mcp/${token}
    readonly forceBudget: number;     // AL6_MAX_FORCE_RETURNS
  }
  ```
  The SDK/builtin closures read this to call back; the CLI settings-json template interpolates `bridgeToken`/`mcpUrl`.

### 5.3 `HarnessAdapter` interface
- **KEEP** `getForceReturnCount?(sessionId): number` (now returns hook-fired block count, surfaced on the result).
- **DELETE** `continueSession?(handle, message)` (Mode-2 — dead in v4; no re-engage).

### 5.4 `harness-capability-descriptor.ts` / `mock-harness-adapter.ts`
- Update each adapter's `getCapabilities()` to return `nativeReturnHook` (per §3 table) instead of the two removed booleans.

---

## 6. Files: add / modify / delete

### Add
- `packages/server/src/harness/return-enforcement-registry.ts` — per-session `{ gate, forceCount, exempt }` registry; `register/get/incrementForce/unregister`. Read by the bridge tool + in-process closures.
- `packages/server/src/harness/provision-return-hook.ts` — `provisionReturnHook(args)` dispatching on `nativeReturnHook`; writes `.claude/settings.json` (and codex/gemini files when verified).
- `packages/server/src/mcp/return-status-tool.ts` — the `hyperidle_return_status` MCP tool factory (registered in `createMcpBridge`).
- `packages/server/src/harness/__tests__/provision-return-hook.test.ts`, `return-enforcement-registry.test.ts`, `return-status-tool.test.ts` (unit).
- `packages/server/src/mcp/return-status.integration.test.ts` — hook→bridge→registry round-trip.

### Modify
- `packages/shared/src/harness/harness-adapter.ts` — §5 contract changes.
- `packages/shared/src/harness/mock-harness-adapter.ts` — `nativeReturnHook`.
- `packages/server/src/harness/claude-agent-sdk-adapter.ts` — Stop closure reads `config.returnHook`/registry instead of local `al6` state; `getCapabilities → nativeReturnHook:"sdk-inprocess"`.
- `packages/server/src/harness/cli-harness-adapter.ts` + `adapter-pool.ts` — add `claude` CLI config; `nativeReturnHook:"settings-json"` for claude CLI, per-tool for others.
- `packages/server/src/harness/builtin-harness-adapter.ts` — `nativeReturnHook:"builtin-loop"`; loop-end checks registry.
- `packages/server/src/harness/isolated-harness-adapter.ts` / `isolated-session-worker.ts` — forward `returnHook`; inherit inner SDK hook; `nativeReturnHook:"sdk-inprocess"`.
- `packages/server/src/harness/remote-harness-adapter.ts` — `dispatch` carries `returnHook`; `nativeReturnHook` declared.
- `packages/server/src/mcp/mcp-bridge.ts` — register `hyperidle_return_status`.
- `packages/server/src/services/session-provisioning.ts` — **DELETE the `while(true)` re-prompt loop (712–917)**; single `startSession`+drain; call `provisionReturnHook` in Phase 8b; register the enforcement registry entry; compute `not_returned` from gate at drain-end (KEEP); `forceReturnCount` = registry count.
- `packages/eval/src/scenarios/force-return.ts` + `provision-harness.ts` — rework for native-hook proof (§9).

### Delete
- `packages/server/src/harness/re-engage.ts` (`rewriteSandboxForcing`) — the v3 carrier.
- `AL6_FORCE_RETURN_MESSAGE` **KEEP** (hook `reason` reuses it). `shouldForceReturn` **KEEP** (the bridge tool reuses it).
- v3 lore/tests asserting the loop / `canReEngage` / `continueSession` / sandbox-rewrite carrier.

---

## 7. Acceptance criteria + verification

| AC | Criterion (v4 framing) | Verification |
|---|---|---|
| **AC1** | Every turn, every harness, ends only after a return action; a would-be no-return end is not accepted as complete | Integration: drive a session through each adapter type with a stub model that does NOT return; assert the provisioned hook fired a block and the recorded outcome is `not_returned` (never `completed`). Unit: `return-status-tool` returns `forceMessage!==null` when gate.returned=false & budget left. |
| **AC2** | HyperIdle enumerates the closed valid-ending set | Unit (KEEP): `return-actions.closure.test.ts` — every `RETURN_ACTION_NAMES` member maps to a registered tool; set is a finite `as const`. |
| **AC3** | A no-return end is detected and not silently completed — redirected or surfaced as not-returned | Integration: gate=false at end → `session_not_returned` emitted + `outcome:"not_returned"` persisted. Unit: `evaluateReturn(gate,"completed")==="not_returned"` (KEEP). |
| **AC4** | Enforcement holds uniformly across harnesses — **via a NATIVE hook provisioned + proven per harness** | (a) Type: `nativeReturnHook` non-optional → `npm run check` forces every adapter to declare its provisioning channel. (b) Unit: `provisionReturnHook` writes the correct artifact per channel (`.claude/settings.json` content asserted for `settings-json`; closure-wiring asserted for `sdk-inprocess`). (c) **Live eval (§9): the provisioned NATIVE hook on a non-Claude/external harness blocks a no-return turn-end** — not a loop, not the SDK closure. |
| **AC5** | Mid-turn non-terminal tool use unaffected — only the ending is constrained | Unit: hook is a `Stop`/turn-end hook only; mid-turn `tool_call` events never consult it. Integration: a session that calls a non-return tool mid-turn then returns → zero blocks, `outcome:"completed"`. |

### route-checklist (hook provisioning must cover every adapter)
`provisionReturnHook` + `getCapabilities().nativeReturnHook` must be exercised for: `claude-agent-sdk`, `claude CLI`, `builtin`, `isolated`, `remote`, `mock` (and codex/gemini iff verified). A per-adapter table test asserts each returns a non-`undefined` channel and that `provisionReturnHook` handles it.

### Security & abuse cases
- **Callback auth:** `hyperidle_return_status` rides the existing bridge token (256-bit, `/api/mcp/:token` → 401 on unknown). No new auth surface. N/A new rate-limit beyond the existing `/api/*` limiter.
- **Hook command injection (`.claude/settings.json`):** the command string is built from a fixed template + the session's own bridge token/url (server-minted, not agent-authored). No agent-controlled value is interpolated into the shell command. Token is hex. Assert in a unit test that the written command contains only the server-minted token/url.
- **Agent disabling the hook:** an agent with file-write in its sandbox could edit `.claude/settings.json` to remove the Stop hook. **Mitigation:** HyperIdle's drain-end gate (`evaluateReturn`) is the backstop — even if the hook is bypassed, the no-return turn is still recorded `not_returned`. Document as `@lore`: the hook is the forcing layer; the gate is the un-bypassable record-of-truth. (This is why the gate is KEPT.)
- **Path traversal:** `.claude/settings.json` path is `path.join(sandboxPath, ".claude", "settings.json")` — no agent input. N/A.

### protectedTests
- `packages/shared/src/__tests__/return-actions.closure.test.ts` (closed-set invariant) — assertions must not change.
- the `evaluateReturn` exemption tests in `return-gate.test.ts`.

### sharedFiles
- `packages/shared/src/harness/harness-adapter.ts` (interface + caps), `mock-harness-adapter.ts`, `packages/server/src/services/session-provisioning.ts`, `packages/server/src/harness/adapter-pool.ts`, `packages/server/src/mcp/mcp-bridge.ts`.

---

## 8. Design-it-twice — the callback transport

**Option A — bridge MCP tool (chosen).** The hook calls a `hyperidle_return_status` MCP tool on the existing per-session bridge. Trade-off: MCP-capable channel already provisioned + token-authed for every sandbox; in-process adapters can skip HTTP and read the registry directly. Reject reason for A: none material — it reuses existing infra.

**Option B — dedicated HTTP endpoint `POST /api/sessions/:id/return-status`.** Trade-off: simpler curl in the settings-json hook (no MCP envelope). Reject: needs its own auth (session id is guessable; would need a separate per-session token = re-inventing the bridge token), new route mounted pre-auth, new rate-limit consideration. Strictly more surface than A for no gain. The bridge token already solves auth.

**Synthesis:** A. The file-provisioned (CLI/remote) hooks POST the MCP tool over the bridge URL/token already in `ReturnHookConfig`; the in-process (SDK/builtin) closures read the `return-enforcement-registry` directly — same adjudication function (`shouldForceReturn` + gate), two transports.

---

## 9. Live eval — prove the NATIVE hook on a non-Claude harness (DoD)

**Goal:** prove the PROVISIONED NATIVE HOOK on an external, non-Claude harness blocks a no-return turn-end — not a re-prompt loop, not the SDK closure.

**Scenario `fr-native-hook-external` (reworked from v3's `fr-forced-return-external`):**
- **Harness:** external-shaped adapter whose `nativeReturnHook` provisioning runs through the SAME `provisionReturnHook` code path a real CLI uses (`settings-json` or `file:`). If the real `claude` CLI binary is present, use `CliHarnessAdapter` with `claude` config so a REAL external binary reads a REAL provisioned `.claude/settings.json` Stop hook. If absent, the eval-fixture adapter must (a) provision via the real `provisionReturnHook`, and (b) actually invoke the provisioned hook config at its own turn-end (reading the `.claude/settings.json` the production code wrote and executing its command), so the proven path is the production provisioning path — NOT a re-prompt loop and NOT the SDK closure.
- **Seed:** agent system prompt instructs it NOT to call any return tool (same as v3 seed).
- **What proves "the hook fired and enforced":**
  - `result.forceReturnCount >= 1` sourced from the **enforcement registry's hook-block count** (incremented only when the provisioned hook calls `hyperidle_return_status` and gets `forceMessage!==null`), NOT from a loop counter.
  - assert the registry recorded the block came via the bridge tool (a `hookFiredVia: "bridge"` marker), distinguishing it from the SDK in-process path.
  - `outcome` ∈ {`completed` (agent converted), `not_returned` (refused after budget)} — never `completed` with `returnVerdict:"not_returned"` (v1 regression guard, KEEP).
- **Channel assertion (the v4 teeth):** the eval logs that exactly ONE `startSession` happened (no loop) and that the block originated from the provisioned hook config — proving the harness, not HyperIdle's provisioner, enforced.
- **Run:** local only (`cd packages/eval && node dist/cli.js --feature force_return`); SKIP when no model credentials. Per `feedback_eval_vs_test` + `feedback_agent_behavior_needs_live_eval_and_forcing`.

**Companion unit/integration (CI-safe, deterministic):** a stub model adapter declaring `nativeReturnHook:"settings-json"`; assert `provisionReturnHook` wrote the file, then simulate the hook executing its command against the bridge tool and assert the block/allow decision matches gate state. This proves the wiring without an LLM; the live eval proves a real external agent is actually held.

---

## 10. Ordered task list

1. **SHARED contract** — `harness-adapter.ts`: remove `hasNativeReturnHook`/`canReEngage`, add `nativeReturnHook` + `NativeReturnHookProvisioning` + `SessionConfig.returnHook`/`ReturnHookConfig`; delete `continueSession?`. Update `mock-harness-adapter.ts`. (Blocks everything; `npm run check` will list every adapter to fix.) *Test: type-level via check; mock cap unit.*
2. **Enforcement registry** — `return-enforcement-registry.ts` (per-session gate+forceCount+exempt). *Unit.*
3. **Bridge tool** — `return-status-tool.ts` + register in `createMcpBridge`; reuse `shouldForceReturn`+gate. *Unit + integration (token round-trip).*
4. **`provisionReturnHook`** — dispatch on channel; write `.claude/settings.json` for `settings-json`; no-op for `sdk-inprocess`/`builtin-loop`; `file:` writer stub for codex/gemini (verify or mark exception). *Unit asserting file content + injection-safety.*
5. **SDK adapter** — Stop closure reads `config.returnHook` → registry/bridge instead of local `al6`; `nativeReturnHook:"sdk-inprocess"`. *Unit (closure decision from gate).*
6. **builtin adapter** — loop-end consults registry; `nativeReturnHook:"builtin-loop"`. *Unit.*
7. **isolated + remote** — forward `returnHook`; declare channels. *Unit.*
8. **CLI adapter + `CLI_TOOL_CONFIGS`** — add `claude` CLI config; `settings-json` channel. *Unit.*
9. **`session-provisioning.ts`** — DELETE the v3 loop; single startSession+drain; call `provisionReturnHook` in Phase 8b; register/unregister enforcement registry; KEEP `not_returned`/`session_not_returned`/`evaluateReturn` at drain-end; `forceReturnCount` from registry. *Integration: no-return → `not_returned`; return → `completed`; mid-turn tool → unaffected (AC5).*
10. **DELETE** `re-engage.ts` + v3 loop tests + `canReEngage`/`continueSession` references; fix `AF10` cost-delta + session-provisioning tests that assumed the loop.
11. **Live eval** — rework `force-return.ts`/`provision-harness.ts` to `fr-native-hook-external` (§9); run locally, capture score.
12. **Verify** — `npm run check && npm run lint && npm run test`; then live eval; carry score to review.

**Dependency order:** 1 → (2,3,4 parallel) → (5,6,7,8 parallel) → 9 → 10 → 11. Task 1 is the shared-contract gate; the per-adapter tasks (5-8) each compile-fail until they declare `nativeReturnHook`, which is the desired forcing function (the type makes "uniform across harnesses" un-skippable — directly answering the v1/v2/v3 scope-gap root cause from the retro).

---

## 11. Genuine-exception honesty

- **codex / gemini hook formats are ⚠️ UNVERIFIED.** The plan does NOT assert they have a turn-end hook. At build (task 4/8), each must be verified against the real tool. If a tool genuinely has no turn-end hook, it is recorded `nativeReturnHook:"none"` with a code comment citing the absence — and the drain-end gate remains its (degraded) floor. This is NOT a re-prompt-loop fallback; it is the same un-bypassable record-of-truth gate that v4 keeps for every harness. The founder's bar ("all these harnesses provide support for hooks these days") is met for the verified set (claude SDK, claude CLI, isolated, builtin) and pursued-then-documented for the rest.
- The **remote** third-party-worker case: HyperIdle ships the hook config in `dispatch`; a worker that ignores it degrades to the gate floor. Documented as a worker-protocol contract, not an adapter limitation.
