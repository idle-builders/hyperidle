# AL7 delta — Architecture: route codex + opencode CLI tool calls through the MCP bridge to `registry.invoke`

**Workpackage:** AL7 (Review execution loop) — delta only. The trust-first two-session loop is **locked** (`concept.md`, the CONTEXT in the task prompt). This plan adds **two more harness lanes** to the existing proof so the loop is proven LIVE against **all three real installed CLIs** (claude already proven; codex + opencode are this delta). `builtin` is in-process and already green; `cursor-agent` is NOT supported — ignored.

**Scope of this delta:** transport wiring + two real-harness test lanes + probe truthing + docs. **No reshaping** of the router, the two-session loop, the registry, the bridge, or the verdict grammar. One transport-agnostic registry; no per-backend branching in the router.

---

## Required reading (engineer reads before implementing)

- `packages/server/src/harness/__tests__/AL7-two-session-trust-first.real-harness.test.ts` — THE TEMPLATE. The codex/opencode lanes mirror this verbatim (capturing router, stateful test MCP server, session-1-capture → approve → session-2-grant-bearing → real file written). The existing `per-harness matrix` block (codex/opencode `wiring-needed` assertions) is **replaced** by this delta.
- `packages/server/src/harness/__tests__/AL6-real-harness-return-enforcement.real-harness.test.ts` — verbatim proven spawn recipes: codex `CODEX_HOME`+`codex exec <prompt> --json`+`--dangerously-bypass-hook-trust`, git-init'd sandbox; opencode `opencode run <msg> --format json --pure --model <m>`; `buildCleanEnv()` + `spawnDetached()` + auth probes (`codexAuthed`, `opencodeAuthed`).
- `packages/server/src/harness/cli-harness-adapter.ts` (lines 292–351) — `startSession` template substitution. `{{mcpUrl}}` **already exists** in the `TemplateVar` union (line 49) and resolves from `config.mcpConnectionInfo?.url` (line 306). The CODEX_HOME injection block (319–340) is where the per-session codex config is pointed at.
- `packages/server/src/harness/adapter-pool.ts` (lines 340–392) — `CLI_TOOL_CONFIGS.codex` / `.opencode`. The hole: neither has a `{{mcpUrl}}` slot nor a config-file mechanism.
- `packages/server/src/services/session-provisioning.ts` (lines 726–838) — Phase 8b writes `.mcp.json` for claude auto-discovery (745–753) and threads `mcpConnectionInfo` to the adapter (836–838). This is the exact flow the codex/opencode analog mirrors.
- `packages/server/src/tools/live-proof-lanes.ts` — `getLiveProofLaneState` + `probeLiveProofHarnessAvailability`. codex/opencode are hardcoded `wiring-needed`; this delta flips them to real `which` probes.
- `packages/server/src/mcp/mcp-bridge.ts` (lines 83–110) — production bridge transport is **stateless** (`sessionIdGenerator: undefined`); the test lanes use a **stateful** test server (see Risk R1).
- `packages/server/src/routes/mcp-route.ts` (lines 55–118) — `ALL /mcp/:token` JSON-RPC bridge + `POST /mcp/:token/return-status`.

---

## Phase 0 — Interrogation (settled by binary research; recorded for the reviewer)

All probes below were run against the **actually installed binaries** (`codex` = codex-cli 0.141.0 at `/opt/homebrew/bin/codex`; `opencode` = 1.17.8 at `/opt/homebrew/bin/opencode`; `claude` = 2.1.170). Verbatim evidence in "Binary research" below.

**Q1 — Can codex accept a remote streamable-HTTP MCP server in headless `codex exec`?**
**Yes.** `codex mcp add <name> --url <URL> --bearer-token-env-var <ENV>` writes a `[mcp_servers.<name>]` block to `$CODEX_HOME/config.toml`; codex auto-detects `transport.type = "streamable_http"`. A **hand-written** `config.toml` block is read identically (verified — no `codex mcp add` call needed). Since AL6 already injects `CODEX_HOME=<sandbox>/.codex-home`, the analog is: append the `[mcp_servers.hyperidle]` block to that same `config.toml`. → plan §1.

**Q2 — Can opencode accept a remote MCP server in headless `opencode run`?**
**Yes.** A project-local `opencode.json` with `mcp.hyperidle = { type:"remote", url, headers:{Authorization:"Bearer <token>"}, enabled:true }` is loaded from the **spawn cwd** (verified: opencode loaded `.../sandbox/opencode.json` and registered `hyperidle`). The production adapter spawns opencode with `cwd: config.sandboxPath`, so writing `opencode.json` into the sandbox is the exact analog of claude's `.mcp.json`. → plan §1.

**Q3 — Where does the token live per binary (security boundary)?**
codex: token is **not** inline — it's read from an env var named by `bearer_token_env_var`. So the adapter must also set that env var (e.g. `HYPERIDLE_MCP_TOKEN=<token>`) on the codex spawn. opencode: token is **inline** in `headers.Authorization`. claude: inline in URL path (`/api/mcp/<token>`). All three carry the token; this is trusted-collaboration creds, not paranoia (ETHOS §4). → plan §1, §6.

**Q4 — Does the bridge route accept a Bearer header / is the token-in-path enough?**
The path token (`/api/mcp/:token`) is the bridge's session key (`bridgeRegistry.handleRequest(token, raw)`). codex sends the Bearer header **in addition**; opencode sends it too. The route ignores the header for the JSON-RPC bridge (it keys on path token) — harmless. No route change needed. → Risk R3.

**Q5 — Smallest useful version?** Two new real-harness lanes (codex, opencode) that prove session-1-capture + session-2-grant-bearing real file write, plus the `CLI_TOOL_CONFIGS` slot + per-session config writer that makes production sessions actually reach the bridge. Nothing more (no AL8 auto-flow, no new tools).

---

## Binary research (verbatim evidence — required by the "don't assume external tool capabilities" rule)

### codex (codex-cli 0.141.0)

`codex mcp add --help`:
```
Usage: codex mcp add [OPTIONS] <NAME> (--url <URL> | -- <COMMAND>...)
  --url <URL>                     URL for a streamable HTTP MCP server
  --bearer-token-env-var <ENV_VAR>  ... Only valid with streamable HTTP servers
  --env <KEY=VALUE>               ... Only valid with stdio servers
```

Resulting `$CODEX_HOME/config.toml` after `codex mcp add hyperidle --url <U> --bearer-token-env-var HYPERIDLE_MCP_TOKEN`:
```toml
[mcp_servers.hyperidle]
url = "http://127.0.0.1:9999/api/mcp/test-token-abc"
bearer_token_env_var = "HYPERIDLE_MCP_TOKEN"
```

`codex mcp get hyperidle --json` (transport auto-detected):
```json
{ "name":"hyperidle","enabled":true,
  "transport":{ "type":"streamable_http",
    "url":"http://127.0.0.1:9999/api/mcp/test-token-abc",
    "bearer_token_env_var":"HYPERIDLE_MCP_TOKEN" } }
```

A **hand-written** identical `[mcp_servers.hyperidle]` block in `config.toml` is read identically (`codex mcp list` / `get --json` confirm) — so the adapter writes the toml block directly (no shelling out to `codex mcp add`).

`codex exec --help` confirms headless single-turn: `codex exec [OPTIONS] [PROMPT] ... --json ... -c <key=value>` (config override also available). `CODEX_HOME` is the config root (AL6-proven).

### opencode (1.17.8)

`opencode mcp add --help`:
```
opencode mcp add [name]
  --url     URL for a remote MCP server
  --header  HTTP header for a remote MCP server (KEY=VALUE)
  --env     environment variable for a local MCP server (KEY=VALUE)
```

Resulting `opencode.json` after `opencode mcp add hyperidle --url <U> --header "Authorization=Bearer <tok>"`:
```jsonc
{ "$schema":"https://opencode.ai/config.json",
  "mcp": { "hyperidle": {
    "type":"remote",
    "url":"http://127.0.0.1:9999/api/mcp/test-token-abc",
    "headers": { "Authorization":"Bearer test-token-abc" } } } }
```

Config resolution (DEBUG logs): opencode loads `opencode.json` from the **spawn cwd** (in addition to `$HOME/.config/opencode/`):
```
message=loading path=.../sandbox/opencode.json
message="server unavailable" key=hyperidle type=remote status=failed   # config loaded; only the TCP connect failed (no server up)
●  ✗ hyperidle  failed
```
`opencode run --help` confirms headless: `opencode run [message..] --format json --pure --model <provider/model> --dir <dir>`. No `OPENCODE_CONFIG` env var exists — config is the cwd-rooted `opencode.json` walk.

**Conclusion:** both binaries genuinely support a remote streamable-HTTP MCP server in headless mode. **Neither cannot-do-headless-remote-MCP.** No founder-blocking finding.

---

## Plan reconciliation (spec ⇆ reality)

| Spec / CONTEXT assumption | Reality | Plan handling |
|---|---|---|
| "`{{mcpUrl}}` slot missing for codex/opencode is the hole" | True for `args[]`; but the `{{mcpUrl}}` TemplateVar + `mcpConnectionInfo.url` resolution **already exist** end-to-end (cli-harness-adapter.ts:49,306; session-provisioning.ts:836). | The hole is narrower than "wire {{mcpUrl}} through": it's (a) per-session config-file writer + (b) pointing the binary at it. `{{mcpUrl}}` is reused only where a CLI flag wants the URL inline; codex/opencode consume it via the config file, not an arg. |
| "claude writes a JSON MCP config" | session-provisioning.ts:744–753 already writes `.mcp.json` into the sandbox. | Add the codex/opencode analog **in the same Phase 8b block** (write `config.toml` mcp block into `.codex-home/`; write `opencode.json` into the sandbox). |
| "codex via CODEX_HOME" | AL6 already injects `CODEX_HOME=<sandbox>/.codex-home` + writes `auth.json`+`config.toml`+`hooks.json` there. | Append `[mcp_servers.hyperidle]` to that **existing** `config.toml` (don't create a second config root). |
| "the production bridge is the transport claude uses" | Production bridge is **stateless**; real CLI clients need **stateful** (multiple HTTP requests/session). The claude real-harness lane uses a stateful test server, NOT the production bridge. | The codex/opencode lanes reuse the **same stateful test MCP server** from the claude lane (Risk R1). The production wiring is exercised by an integration test that asserts the config file is written correctly (deterministic, in `test:all`), not by re-routing through stateless prod. |
| "`plans/AL7/concept.md` exists" | Not present in this worktree (only `retro.md`). | Plan anchors on the locked CONTEXT vocabulary in the task prompt (`Proposed Call`, `tailored_grant`, consume-once CAS, `proposed_call_granted`, transport-agnostic registry). No re-litigation. |
| live-proof-lanes codex/opencode = `wiring-needed` | Hardcoded strings. | Flip to real `which codex` / `which opencode` probes; remove `wiring-needed` for both; absent binary → lane FAILS (AC14b parity with claude). |

---

## §1 — Per-harness wiring design

**Invariant (do not violate):** ONE transport-agnostic registry handed to both the builtin adapter and the MCP bridge. The router (`buildToolRegistry(...).invoke` in tool-registry.ts) has **zero** per-backend branching. A CLI harness reaches the router only by calling a tool over MCP HTTP at `${mcpBaseUrl}/api/mcp/${token}`. codex and opencode reach that same URL; the only per-binary difference is **how the binary is told the URL** (a config file in a binary-specific dialect). That difference lives entirely in (a) `CLI_TOOL_CONFIGS` and (b) a small per-session config writer — never in the router.

### 1a. `CLI_TOOL_CONFIGS` changes (`adapter-pool.ts`)

Add an `mcpConfig` descriptor to each CLI config declaring **which config dialect** the binary needs and **where** it's written. New optional field on `CliAdapterConfig`:

```ts
// cli-harness-adapter.ts — CliAdapterConfig
/** AL7 delta: per-session MCP config file the binary reads to reach the HyperIdle bridge.
 *  Mirrors claude's .mcp.json. Absent ⇒ binary gets no MCP wiring (builtin/SDK paths). */
readonly mcpConfig?:
  | { readonly dialect: "codex-toml" }      // append [mcp_servers.hyperidle] to .codex-home/config.toml; token via env var
  | { readonly dialect: "opencode-json" };  // write opencode.json into sandbox cwd; token inline in headers
```

```ts
// adapter-pool.ts — CLI_TOOL_CONFIGS
codex: {
  binary: "codex",
  args: ["exec", "{{prompt}}", "--json"],     // unchanged — codex reads MCP from config.toml, not an arg
  envMap: { OPENAI_API_KEY: "{{apiKey}}" },
  eventFormat: "ndjson",
  envAllowlist: ["PATH", "HOME", "LANG"],
  costField: "total_cost_usd",
  returnEnforcementChannel: "settings-codex",
  seedPrompt: "positional",
  mcpConfig: { dialect: "codex-toml" },        // ← AL7 delta
},
opencode: {
  binary: "opencode",
  args: ["run", "{{prompt}}", "--dir", "{{sandbox}}", "--format", "json", "--pure"],  // ← AL7 delta: real headless invocation (was ["--dir","{{sandbox}}"], which never ran a turn)
  envMap: { ANTHROPIC_API_KEY: "{{apiKey}}" },
  eventFormat: "ndjson",                        // ← AL7 delta: was "text"; opencode --format json emits JSONL (step_finish, etc.)
  envAllowlist: ["PATH", "HOME", "LANG"],
  returnEnforcementChannel: "process-reengage",
  reEngageCarrier: "run-arg",
  mcpConfig: { dialect: "opencode-json" },      // ← AL7 delta
},
```

> NOTE on the opencode `args` change: the current `["--dir","{{sandbox}}"]` launches the **interactive TUI**, never completing a headless turn. AL6's real-harness proof used `["run", <msg>, "--format","json","--pure","--model",<m>]`. This delta aligns the production args with the proven recipe. `{{prompt}}` carries the seed message (already resolved by `startSession`); `--model` is appended at spawn time from `config.resolvedModel` (the opencode model is provider-prefixed, e.g. `openrouter/~anthropic/claude-haiku-latest`; see Risk R4). Flag this as a behavior change in review — it touches a `protectedTest` adjacency (AL6 WARN-F3 asserts `reEngageCarrier`, which is preserved).

### 1b. Per-session config writer (`session-provisioning.ts` Phase 8b)

Extend the existing Phase 8b block (where `.mcp.json` is written for claude). After `mcpBridgeToken` is known, branch on the **selected adapter's** `mcpConfig.dialect` (read from `CLI_TOOL_CONFIGS` via the adapter, or thread the config). One new helper, `writeCliMcpConfig`, keeps the dialect knowledge in one place:

```ts
// new file: packages/server/src/harness/cli-mcp-config.ts
export function writeCliMcpConfig(params: {
  dialect: "codex-toml" | "opencode-json";
  sandboxPath: string;
  mcpUrl: string;     // ${mcpBaseUrl}/api/mcp/${token}
  token: string;
}): { tokenEnv?: Record<string, string> } { … }
```

- **codex-toml:** append to `<sandbox>/.codex-home/config.toml` (created by AL6's `provisionCodexHome`; if absent, create it):
  ```toml
  [mcp_servers.hyperidle]
  url = "<mcpUrl>"
  bearer_token_env_var = "HYPERIDLE_MCP_TOKEN"
  ```
  Return `{ tokenEnv: { HYPERIDLE_MCP_TOKEN: token } }` so the adapter sets it on the spawn env. (CODEX_HOME is already injected by the adapter; this writer only adds the mcp block to the same file.)
- **opencode-json:** write `<sandbox>/opencode.json`:
  ```json
  { "$schema":"https://opencode.ai/config.json",
    "mcp": { "hyperidle": { "type":"remote", "url":"<mcpUrl>",
      "headers": { "Authorization":"Bearer <token>" }, "enabled": true } } }
  ```
  Return `{}` (token is inline).

`writeCliMcpConfig` is called only when `mcpBridgeToken` is set and the selected adapter is a CLI adapter with `mcpConfig`. For the **codex env var**, thread `tokenEnv` into `SessionConfig` (new optional `mcpTokenEnv?: Record<string,string>`) and merge it into `resolvedEnvMap` in `startSession` (and add `HYPERIDLE_MCP_TOKEN` to codex's `envAllowlist` OR — preferred — inject it the same way CODEX_HOME is injected, i.e. **outside** the allowlist, since it is per-session-generated, not forwarded from `process.env`). Mirror the CODEX_HOME lore comment.

### 1c. Why this preserves the transport-agnostic registry

The registry/bridge/router are untouched. `createMcpBridge({ sessionId, registry })` already produces the single bridge for the session; `mcpConnectionInfo.url` already points every CLI at it. The delta only teaches two binaries how to *find* that URL in their own config dialect. No new tool, no new route, no per-backend `invoke` branch.

---

## §2 — Two new real-harness test lanes

**Decision:** EXTEND the existing `AL7-two-session-trust-first.real-harness.test.ts` rather than new files — it already owns the capturing router, the stateful test MCP server (`startAl7TestServer`/`buildStatefulMcpServer`/`rebuildBridge`), `buildCleanEnv`, `spawnDetached`. Add two `describe` blocks mirroring `claude-code CLI`. **Replace** the existing `per-harness matrix: codex + opencode wiring verification` block (the two `hasMcpUrlSlot === false` assertions) — those assert the hole still exists and will be FALSE after this delta.

> Rationale for extend-not-split: the stateful test server + capturing router are ~250 lines of shared scaffolding. Duplicating them into two new files triples maintenance and risks the two servers drifting. One file, three `describe`s (claude/codex/opencode), shared helpers. (Design-it-twice considered: separate files give cleaner per-harness `skipIf` isolation but at 3× scaffold cost — rejected.)

### 2a. Shared adjustment — config writer in the test

The test currently writes claude's `.mcp.json` via `writeMcpConfig`. Add the codex/opencode analogs **using the production `writeCliMcpConfig`** (so the test proves the real writer, not a test-local fork) pointed at the test server's **stateful** `/mcp/:token` URL (NOT `/api/mcp/:token` — see Risk R1). The capturing router, mode switch, and `rebuildBridge` are reused unchanged.

### 2b. codex lane (`describe("codex CLI (real binary, MCP-routed two-session loop)")`)

Spawn recipe (from AL6, verbatim):
- Sandbox: `mkdtempSync`; `git init` + empty commit (codex requires a git repo) — reuse AL6's git-init block.
- Provision a per-session `.codex-home/` with `auth.json` + `config.toml` copied from `~/.codex` (AL6 `provisionCodexHome` recipe — copy ONLY auth.json + config.toml, NO SQLite). Then call `writeCliMcpConfig({ dialect:"codex-toml", sandboxPath, mcpUrl: <stateful>/mcp/<token>, token })` to append `[mcp_servers.hyperidle]`.
- Env: `buildCleanEnv()` + `CODEX_HOME=<sandbox>/.codex-home` + `HYPERIDLE_MCP_TOKEN=<token>`.
- Spawn: `codex` `["exec", <prompt>, "--json", "--dangerously-bypass-hook-trust"]`, `cwd: sandbox`, `detached`, 60s timeout.
- Prompt: "Use the commit_file MCP tool to write 'al7-proof' to proof.txt. You MUST use the commit_file tool." (mirror claude prompt; codex exposes the MCP tool as `hyperidle__commit_file` / `commit_file`).
- Auth gate: `test.skipIf(!codexInstalled)` + in-body `codexAuthed()` skip (mirror AL6).

Assertions (mirror claude):
- **session-1:** after spawn, `testServer.capturingRouter.captured.length >= 1` and `captured[0].toolId === "commit_file"`. (REAL codex called the tool via MCP → router captured it.)
- **session-2:** approve in-process (`approvedCall = captured[0]`; `setMode("grant-bearing")`; `rebuildBridge`), re-spawn codex, assert `fs.existsSync(<sandbox>/proof.txt)` and content `=== "al7-proof"` (REAL codex executed the approved op via its own MCP tool → real file written), and `exitCode !== null` + stdout contains `turn.completed` (work continued).

### 2c. opencode lane (`describe("opencode CLI (real binary, MCP-routed two-session loop)")`)

Spawn recipe (from AL6, verbatim):
- Sandbox: `mkdtempSync` (no git required).
- `writeCliMcpConfig({ dialect:"opencode-json", sandboxPath, mcpUrl: <stateful>/mcp/<token>, token })` → writes `<sandbox>/opencode.json`.
- Env: `buildCleanEnv()`.
- Spawn: `opencode` `["run", <prompt>, "--format","json","--pure","--dir", sandbox, "--model","openrouter/~anthropic/claude-haiku-latest"]`, `cwd: sandbox`, `detached`, 60s timeout. (cwd === --dir so config resolution finds `opencode.json` either way; pass both to match prod args.)
- Prompt: same commit_file instruction.
- Auth gate: `test.skipIf(!opencodeInstalled)` + `opencodeAuthed()`.

Assertions: identical to codex (session-1 `captured>=1`; session-2 real `proof.txt` written; stdout contains `step_finish`).

### 2d. Sanity-break note (in test comment, mirror claude's)

For each lane, document: changing the config-file token to a wrong value → bridge lookup fails (401/unknown) → binary gets a tool error → `captured` stays 0 → assertion fails. Confirms the test is not vacuous. (The reviewer runs this break under the mock-validation-trap rule.)

### 2e. Deterministic CI anchor (no binary)

Add `packages/server/src/harness/__tests__/cli-mcp-config.integration.test.ts` (runs in `test:all`, no binary): import `writeCliMcpConfig`, call both dialects against a temp dir, read back and assert:
- codex: `.codex-home/config.toml` contains `[mcp_servers.hyperidle]` + `url = "<mcpUrl>"` + `bearer_token_env_var = "HYPERIDLE_MCP_TOKEN"`; return value has `tokenEnv.HYPERIDLE_MCP_TOKEN === token`.
- opencode: `opencode.json` parses to `mcp.hyperidle.url === mcpUrl`, `type === "remote"`, `headers.Authorization === "Bearer <token>"`, `enabled === true`.

This is the in-CI proof the wiring is correct on Linux; the real-binary lanes are the local-only end-to-end proof.

---

## §3 — `live-proof-lanes.ts` probe changes

- `getLiveProofLaneState("codex")`: replace `return "wiring-needed"` with a real `which codex` probe → `green-now` if present, `absent-fail` if absent (mirror the `claude-code` case + `isClaudeCodeAvailable`).
- `getLiveProofLaneState("opencode")`: same with `which opencode`.
- `probeLiveProofHarnessAvailability("codex"|"opencode")`: replace the `throw "...wiring-needed..."` branches with the absence-is-failure pattern (mirror `claude-code`): resolve if `which` succeeds, throw a descriptive error if absent. Remove `wiring-needed` for both from the type-usage and the file's terminal-state doc header.
- Add `isCodexAvailable()` / `isOpencodeAvailable()` helpers (copy `isClaudeCodeAvailable`).
- Update the header DONE matrix: codex + opencode → `green-now` (real CLI binary installed); keep `cursor-agent: skipped`.

`LiveProofLaneState` keeps `wiring-needed` in the union (other call sites / future harnesses) but codex/opencode no longer return it.

---

## Acceptance criteria → verification method

| # | AC (from AL7 spec, scoped to this delta) | Verification |
|---|---|---|
| AC1 | codex tool call routes through the MCP bridge to `registry.invoke` (session-1 capture) | codex real-harness lane: `capturingRouter.captured.length >= 1`, `captured[0].toolId === "commit_file"` after spawning real `codex exec`. |
| AC2 | opencode tool call routes through the MCP bridge to `registry.invoke` (session-1 capture) | opencode real-harness lane: same assertion after `opencode run`. |
| AC3 | codex session-2 executes the approved op via its OWN tool → real result | codex lane: `fs.existsSync(proof.txt)` + content `"al7-proof"` + stdout `turn.completed`. |
| AC4 | opencode session-2 executes the approved op via its OWN tool → real result | opencode lane: `fs.existsSync(proof.txt)` + content `"al7-proof"` + stdout `step_finish`. |
| AC5 | Production session writes the correct per-session MCP config per binary | `cli-mcp-config.integration.test.ts` asserts the toml/json shape + token placement (in `test:all`). |
| AC6 | The router/registry stays transport-agnostic (no per-backend branch) | `npm run check` + code review: `tool-registry.ts` `invoke` unchanged; no `binary === "codex"` branch in the router. (Static property — review + type, not a runtime test.) |
| AC7 | codex/opencode absent → lane FAILS (never silently passes) | `live-proof-lanes` unit test: stub `which` failure → `probeLiveProofHarnessAvailability("codex")` rejects; `getLiveProofLaneState("codex") === "absent-fail"`. (Mirror existing claude probe tests.) |
| AC8 | At-most-once / non-approval-holds / no-double-run | Inherited from the locked loop (capturing router `grant-bearing` + consume-once). The codex/opencode lanes prove session-2 runs **only** after `approvedCall` is set + mode switched; re-show without re-grant does not write the file (assert in lane: a control spawn with mode still `capture` writes no file). |

---

## §4 — Ordered task list (write-tests first, TDD)

1. **T1 (red, integration):** `cli-mcp-config.integration.test.ts` — assert `writeCliMcpConfig` output for both dialects (AC5). Fails: function doesn't exist. *(in `test:all`)*
2. **T2 (red, unit):** extend `live-proof-lanes` unit tests — `getLiveProofLaneState("codex"|"opencode")` returns `green-now` when `which` resolves, `absent-fail` when it throws; `probeLiveProofHarnessAvailability` rejects on absence (AC7). Fails: still `wiring-needed`. *(in `test:all`)*
3. **T3 (red→green coupled, real-harness, local-only):** extend `AL7-two-session-trust-first.real-harness.test.ts` with the codex + opencode `describe` blocks (AC1–AC4, AC8); DELETE the `per-harness matrix` `wiring-needed` block. These are local-only (`npm run test:real-harness`); they go red without the wiring, green after T5/T6.
4. **T4 (green):** add `mcpConfig` field to `CliAdapterConfig`; add `writeCliMcpConfig` (`cli-mcp-config.ts`). → T1 green.
5. **T5 (green):** wire `CLI_TOOL_CONFIGS.codex` + `.opencode` (`mcpConfig`, opencode `args`/`eventFormat` fix); add `mcpTokenEnv` threading in `SessionConfig` + `startSession` (codex `HYPERIDLE_MCP_TOKEN` injection, mirror CODEX_HOME).
6. **T6 (green):** call `writeCliMcpConfig` in `session-provisioning.ts` Phase 8b for the selected CLI adapter; thread `tokenEnv` into the session config. → T3 codex/opencode lanes green (run locally).
7. **T7 (green):** flip `live-proof-lanes.ts` codex/opencode to real `which` probes; add `isCodexAvailable`/`isOpencodeAvailable`; update header matrix. → T2 green.
8. **T8 (docs):** update the per-harness matrix in `docs/process-layer/staged-operation.md` and `docs/agent-layer/` harness docs (§5).
9. **T9 (local proof):** run `npm run test:real-harness` on this machine (codex + opencode authed) — capture real green for both lanes. This is the DoD artifact (AC1–AC4 proven live).
10. **T10 (gate):** `npm run check` + `npm run lint` + `npm run test` (deterministic lanes green). Builder runs verify; designer does NOT.

Dependencies: T1,T2,T3 (red) before T4–T7 (green). T4 → T5/T6. T7 independent of T4–T6. T9 after T5+T6.

---

## Type signatures / contracts

```ts
// cli-harness-adapter.ts (CliAdapterConfig)
readonly mcpConfig?:
  | { readonly dialect: "codex-toml" }
  | { readonly dialect: "opencode-json" };

// SessionConfig (cli-harness-adapter.ts) — new optional, mirrors mcpConnectionInfo
readonly mcpTokenEnv?: Record<string, string>;   // e.g. { HYPERIDLE_MCP_TOKEN: "<token>" } for codex

// cli-mcp-config.ts
export function writeCliMcpConfig(params: {
  readonly dialect: "codex-toml" | "opencode-json";
  readonly sandboxPath: string;
  readonly mcpUrl: string;
  readonly token: string;
}): { readonly tokenEnv?: Record<string, string> };

// live-proof-lanes.ts (changed return for codex/opencode)
getLiveProofLaneState("codex"): "green-now" | "absent-fail"
getLiveProofLaneState("opencode"): "green-now" | "absent-fail"
```

---

## §5 — Docs to update

- `docs/process-layer/staged-operation.md` — per-harness matrix: codex + opencode rows flip from `wiring-needed`/SDK-only to **MCP-routed, proven live**; record the dialect (codex `config.toml [mcp_servers.*]` under CODEX_HOME; opencode project-local `opencode.json` `mcp` block) + token boundary (codex env var, opencode inline header).
- `docs/agent-layer/` harness docs (harness section / capabilities) — note all three CLIs (claude, codex, opencode) reach the transport-agnostic registry via the MCP bridge; the only per-binary difference is config dialect.
- Header DONE matrix in `live-proof-lanes.ts` (code-doc) — codex/opencode → green-now.

---

## §6 — Security & abuse cases (required block)

- **Secret handling (new credential surface — the per-session MCP token):** codex token lives in `$CODEX_HOME/config.toml` via `bearer_token_env_var` → set as `HYPERIDLE_MCP_TOKEN` on the codex spawn env (per-session, not forwarded from `process.env`; injected like CODEX_HOME, outside the allowlist). opencode token is inline in `opencode.json` headers. Both files live in the per-session sandbox (already isolated). The token is the bridge session key — same trust level as claude's URL-path token. **Addressed:** per-session token, sandbox-scoped config, no global config mutation. (ETHOS §4 — these are creds the tool needs; not withheld.)
- **Path-traversal:** `writeCliMcpConfig` writes to fixed filenames under `sandboxPath` (`config.toml`, `opencode.json`) — no user-controlled path component. **N/A** (no path input).
- **SSRF / outbound URL:** `mcpUrl` is server-constructed (`${mcpBaseUrl}/api/mcp/${token}`), never agent-authored. **N/A.**
- **Input-trust boundary (agent-authored fields):** the captured `commit_file` args are agent-authored and flow to the human checkpoint verbatim (the locked loop's purpose) — unchanged by this delta. **N/A for the delta.**
- **Rate-limit:** no new POST/PATCH route (bridge route pre-exists). **N/A.**
- **Config injection (toml/json):** `mcpUrl`/`token` are server-generated hex/URLs — no toml/json metacharacter injection from agent input. Builder MUST serialize via `JSON.stringify` (opencode) and a literal template with the known-safe hex token (codex toml). **Addressed.**

---

## Protected tests

`protectedTests`:
- `packages/server/src/harness/__tests__/AL7-two-session-trust-first.real-harness.test.ts` — the **claude** lane assertions (session-1 capture, session-2 file write) MUST NOT change; only ADD codex/opencode `describe`s and REMOVE the `per-harness matrix wiring-needed` block.
- `packages/server/src/harness/__tests__/AL6-real-harness-return-enforcement.real-harness.test.ts` — AL6 enforcement assertions unchanged (the opencode `args`/`eventFormat` change must not break AL6's `reEngageCarrier` WARN-F3 assertion, which reads `CLI_TOOL_CONFIGS.opencode.reEngageCarrier` — preserved).

---

## Migrations (renamed/removed symbols)

- **Removed:** the `per-harness matrix: codex + opencode wiring verification` `describe` block in the AL7 real-harness test (two `hasMcpUrlSlot === false` tests) — they assert the hole still exists; they become false. Delete (don't invert) — replaced by the real codex/opencode lanes.
- **Changed:** `CLI_TOOL_CONFIGS.opencode.args` (`["--dir","{{sandbox}}"]` → headless `run` form) and `.eventFormat` (`"text"` → `"ndjson"`). Grep call sites: only `adapter-pool.ts` (definition) + the AL6/AL7 real-harness tests read it. The AL6 WARN-F3 test reads `reEngageCarrier` (preserved); no other consumer asserts opencode `args`/`eventFormat`.
- No DB / route / column / testid renames.

---

## Shared files

`sharedFiles`:
- `packages/server/src/harness/adapter-pool.ts` (`CLI_TOOL_CONFIGS`)
- `packages/server/src/harness/cli-harness-adapter.ts` (`CliAdapterConfig`, `SessionConfig`, `startSession`)
- `packages/server/src/services/session-provisioning.ts` (Phase 8b)
- `packages/server/src/tools/live-proof-lanes.ts`

(AL8 will also touch `session-provisioning.ts` + `adapter-pool.ts` for reversibility auto-flow — schedule AL7 before AL8.)

---

## §5 — Risks (honest callouts)

- **R1 — Production bridge is stateless; real CLI clients need stateful.** `mcp-bridge.ts` uses `sessionIdGenerator: undefined`. The claude real-harness lane already worked around this with a **stateful** test MCP server (`buildStatefulMcpServer` + `/mcp/:token` root handler, NOT the stateless `/api/mcp/:token` bridge). codex and opencode are real CLI MCP clients with the **same** multi-request-per-session behavior, so their lanes MUST point at the stateful test server's `/mcp/:token` URL — verified-by-analogy with claude, but the delta carries the same constraint. **This means the real-harness lanes do NOT exercise the production stateless bridge end-to-end** — neither does claude's. The production path is covered deterministically by `cli-mcp-config.integration.test.ts` (config shape) + the existing X2 bridge integration tests. If the founder wants the *production stateless* bridge proven against a real CLI, that's a separate finding (stateless transport may need a stateful mode for HTTP-MCP CLI clients generally) — **flagging now**, but it is pre-existing (claude has the same gap) and out of this delta's scope.
- **R2 — opencode model id is provider-specific.** `opencode run` needs `--model provider/model` (e.g. `openrouter/~anthropic/claude-haiku-latest`); a bare model id fails. Production `config.resolvedModel.model` must already be provider-prefixed for opencode, or the adapter must format it. Verify during T6; the real-harness lane hardcodes a known-good id (matches AL6).
- **R3 — codex `--json` event stream vs `eventFormat`.** codex `exec --json` emits JSONL including `turn.completed`; opencode `--format json` emits `step_finish`. Both set `eventFormat: "ndjson"`. The existing `normalizeNativeHarnessEvent` handles codex; opencode JSONL normalization must be confirmed (AL6 read `step_finish` from opencode JSON, so the parser sees it). Verify in T6; if opencode JSONL isn't normalized, that's adapter work (small) inside this delta.
- **R4 — Auth-gated local-only proof.** The two lanes only run where `codex login status` / `opencode providers list` show creds. Per the rule "if a supported harness is not present/authed, the feature is not proven done on it." T9 must run on a machine where both are authed; if a lane can't run, surface it — do NOT substitute a stub (mock-validation-trap rule). Both binaries are installed + the recipes are AL6-proven, so this is expected to pass.
- **R5 — codex requires a git repo.** `codex exec` refuses outside a git repo (AL6 lore). The real-harness lane git-inits the sandbox; production sandboxes are git-backed (Track AL git-host boundary). If a production sandbox is ever non-git, codex needs `--skip-git-repo-check` — note for the builder, add to codex `extraArgs` if needed.

---

## Self-critique

- **Over-engineering?** No new abstraction beyond one `writeCliMcpConfig` helper + one config field. The `{{mcpUrl}}` plumbing is reused, not rebuilt. Could inline the writer into Phase 8b, but extracting it lets the deterministic CI test prove it without a binary — worth the one file.
- **Scope creep?** The opencode `args`/`eventFormat` fix is arguably AL6 territory, but the current value never completes a headless turn, so codex/opencode could not be proven without it — in-scope.
- **Missing failure mode?** R1 (stateless prod bridge not proven against a real CLI) is the honest gap the founder must see — surfaced, scoped out (pre-existing, shared with claude), with a deterministic compensating test for the config wiring.
