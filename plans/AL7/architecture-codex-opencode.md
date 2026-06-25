# AL7 delta — Architecture: route codex + opencode CLI tool calls through the MCP bridge to `registry.invoke`

**Workpackage:** AL7 (Review execution loop) — delta only. The trust-first two-session loop is **locked** (`concept.md`, the CONTEXT in the task prompt). This plan adds **two more harness lanes** to the existing proof so the loop is proven LIVE against **all three real installed CLIs** (claude already proven; codex + opencode are this delta). `builtin` is in-process and already green; `cursor-agent` is NOT supported — ignored.

**Scope of this delta:** **production-bridge stateful upgrade (R1 closure)** + transport wiring + real-harness lanes re-pointed at the PRODUCTION bridge + probe truthing + docs. **No reshaping** of the router, the two-session loop, the registry shape, or the verdict grammar. One transport-agnostic registry; no per-backend branching in the router.

> **R1 closure is in scope (REVISED).** The prior revision scoped the stateless-bridge gap OUT as "pre-existing, shared with claude." That was wrong for the founder standard ("real path, no stubs"): codex and opencode have **no SDK adapter** — the HTTP MCP bridge is their ONLY production transport — and the production bridge is stateless, which the MCP SDK source proves throws on a real CLI client's SECOND request. A test stand-in going green while production is broken is a false-green. **This revision makes the production bridge session-capable (stateful) and re-points all three real-harness lanes at the PRODUCTION bridge** (`createMcpBridge` + real `createMcpRoute`), deleting the test-only stateful stand-in. See R1-closure section below for the source-verified SDK API.

---

## Required reading (engineer reads before implementing)

- `packages/server/src/harness/__tests__/AL7-two-session-trust-first.real-harness.test.ts` — THE TEMPLATE. The codex/opencode lanes mirror the claude lane (capturing router, session-1-capture → approve → session-2-grant-bearing → real file written). **REVISED:** the template lane's test-only stateful server (`buildStatefulMcpServer`, lines 266–311) + the route override (`app.all("/mcp/:token")`, lines 372–378) are **DELETED** and replaced by the PRODUCTION bridge (`createMcpBridge` + real `createMcpRoute` catch-all at `/api/mcp/:token`) once the production bridge is stateful (T0). All three lanes then exercise the real production transport. The existing `per-harness matrix` block (codex/opencode `wiring-needed` assertions) is also **replaced** by this delta.
- `packages/server/src/harness/__tests__/AL6-real-harness-return-enforcement.real-harness.test.ts` — verbatim proven spawn recipes: codex `CODEX_HOME`+`codex exec <prompt> --json`+`--dangerously-bypass-hook-trust`, git-init'd sandbox; opencode `opencode run <msg> --format json --pure --model <m>`; `buildCleanEnv()` + `spawnDetached()` + auth probes (`codexAuthed`, `opencodeAuthed`).
- `packages/server/src/harness/cli-harness-adapter.ts` (lines 292–351) — `startSession` template substitution. `{{mcpUrl}}` **already exists** in the `TemplateVar` union (line 49) and resolves from `config.mcpConnectionInfo?.url` (line 306). The CODEX_HOME injection block (319–340) is where the per-session codex config is pointed at.
- `packages/server/src/harness/adapter-pool.ts` (lines 340–392) — `CLI_TOOL_CONFIGS.codex` / `.opencode`. The hole: neither has a `{{mcpUrl}}` slot nor a config-file mechanism.
- `packages/server/src/services/session-provisioning.ts` (lines 726–838) — Phase 8b writes `.mcp.json` for claude auto-discovery (745–753) and threads `mcpConnectionInfo` to the adapter (836–838). This is the exact flow the codex/opencode analog mirrors.
- `packages/server/src/tools/live-proof-lanes.ts` — `getLiveProofLaneState` + `probeLiveProofHarnessAvailability`. codex/opencode are hardcoded `wiring-needed`; this delta flips them to real `which` probes.
- `packages/server/src/mcp/mcp-bridge.ts` (lines 102–142) — production bridge factory `createMcpBridge`; transport is currently **stateless** (`sessionIdGenerator: undefined`, line 110). **T0 makes this stateful** (R1 closure). The bridge is already one long-lived `McpBridgeInstance` per session token — exactly the shape stateful mode needs; the ONLY change is the constructor option.
- `packages/server/src/mcp/mcp-bridge-registry.ts` — `handleRequest(token, request)` looks up the per-token instance and delegates to `instance.transport.handleRequest(request)`. **No change needed** — the registry already keeps the transport instance alive across requests (it is a `Map<token, instance>`), which is precisely what stateful mode requires. Confirmed against source.
- `packages/server/src/routes/mcp-route.ts` (lines 116–120) — `ALL /mcp/:token` JSON-RPC bridge delegates to `bridgeRegistry.handleRequest`. EVERY CLI (claude `.mcp.json`, codex toml, opencode json) points at `${base}/api/mcp/${token}` → this route → the bridge transport. So a stateful bridge fixes claude's HTTP path too (see R1 closure). No route change.

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

## R1 closure — production bridge becomes session-capable (stateful)

**The gap (founder-standard violation):** Production points every CLI at `${mcpBaseUrl}/api/mcp/${token}` → `createMcpRoute` `ALL /mcp/:token` → `bridgeRegistry.handleRequest` → `instance.transport.handleRequest`. The transport is built **stateless** (`createMcpBridge`, `sessionIdGenerator: undefined`). A real CLI MCP client issues **separate HTTP requests** for `initialize` → `tools/list` → `tools/call`. The stateless transport throws on the SECOND request. codex/opencode have **no SDK adapter** — this HTTP path is their ONLY production transport — so as previously scoped they would be "wired" but **broken in production** while a stateful test stand-in went green. False-green. This revision closes it.

> Note on the prior "claude uses the SDK in-process, so claude is unaffected" framing: irrelevant to the bridge. claude's `.mcp.json` (`session-provisioning.ts:744–753`) points claude at the SAME `/api/mcp/${token}` HTTP bridge. claude-over-HTTP hits the same stateless transport and would also break. The stateful upgrade fixes all three uniformly. (The claude SDK adapter may also talk MCP some other in-process way, but the provisioned `.mcp.json` HTTP path is real and must work.)

### Verified SDK API (read from installed source — NOT assumed)

Installed: `@modelcontextprotocol/sdk@1.29.0` (`node_modules/@modelcontextprotocol/sdk/package.json`). Production transport class: `WebStandardStreamableHTTPServerTransport` (`dist/esm/server/webStandardStreamableHttp.{d.ts,js}`). Evidence, line-cited:

- **Stateless reuse-throw is stateless-ONLY.** `webStandardStreamableHttp.js:137–141`:
  ```js
  // In stateless mode (no sessionIdGenerator), each request must use a fresh transport.
  if (!this.sessionIdGenerator && this._hasHandledRequest) {
      throw new Error('Stateless transport cannot be reused across requests. Create a new transport per request.');
  }
  this._hasHandledRequest = true;
  ```
  → With a `sessionIdGenerator` set, the guard is bypassed; one transport instance serves unlimited requests. (Confirms: stateful mode is exactly the fix, and a single long-lived per-session transport is the intended stateful shape.)

- **Stateful enable = pass a `sessionIdGenerator`.** Option declared at `webStandardStreamableHttp.d.ts:41–48` (`sessionIdGenerator?: () => string` — "If not provided, session management is disabled (stateless mode)"). Constructor reads it at `.js:63`. The class docstring example (`.d.ts:126–135`) is the canonical pattern:
  ```ts
  new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });  // stateful
  ```

- **Init assigns the session id; the SDK echoes it in the `mcp-session-id` response header.** `.js:421–438`: on an `initialize` request, `this.sessionId = this.sessionIdGenerator?.(); this._initialized = true;` (+ optional `onsessioninitialized` callback). The header is set on responses at `.js:233–234`, `:281–282`, `:511–512`, `:727–728` (`headers['mcp-session-id'] = this.sessionId`).

- **Subsequent (list/call) requests are validated against that header.** `.js:585–601` `validateSession`: stateless (`sessionIdGenerator === undefined`) → skip; else require `_initialized` (else 400 "Server not initialized"), require `mcp-session-id` header (else 400), require it `=== this.sessionId` (else 404 "Session not found"). The client carries the header automatically (MCP Streamable-HTTP spec); we do nothing on the server beyond keeping the instance alive — which the registry already does.

- **Re-init is rejected.** `.js:425–427`: an `initialize` arriving when already initialized → 400 "Server already initialized". Harmless for us (one CLI session = one transport instance = one init).

- **Response mode.** `enableJsonResponse` defaults `false` → SSE streaming (`.js:61,64`). The existing template stateful server does NOT set it and a REAL claude client completed a full turn against it, so the default SSE mode is proven-compatible with real CLI MCP clients. **Leave it default.** (`McpServer.connect(transport)` drives the SSE stream; the catch-all route returns the transport's `Response` verbatim, which already carries the SSE body — confirmed by the working template lane.)

### The change (one line + lore)

`createMcpBridge` (`mcp-bridge.ts:109–111`):
```ts
// BEFORE (stateless — breaks real CLI clients on the 2nd request):
const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
// AFTER (stateful — one session id per per-session transport; registry keeps it alive):
const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
```
- Update the `@lore X2 D1` block (and `McpBridgeInstance` D3 lore at `:42`) from "stateless mode; our token replaces MCP session management" to: "**stateful** mode — the bridge holds one transport per session token; the URL-path token is still the bridge-registry routing key (token → instance), and the SDK's `mcp-session-id` is the per-session MCP-protocol session managed transparently by the transport. Both coexist: path-token routes the request to the right instance; `mcp-session-id` is the MCP handshake the CLI client carries on requests 2+."
- **No registry change.** `mcp-bridge-registry.ts` already stores `Map<token, McpBridgeInstance>` and delegates to the live `instance.transport` — the transport persists across requests for the session's lifetime, which is exactly stateful mode's requirement. Verified: `handleRequest` does not reconstruct the transport.
- **No route change.** `createMcpRoute` `ALL /mcp/:token` already forwards the raw `Request` (carrying `mcp-session-id` on requests 2+) and returns the transport's `Response` (carrying the header). The header is request/response transparent to our code.

### Does stateful break the claude SDK-adapter assumption?

No. The claude SDK adapter (`ClaudeAgentSdkAdapter`) drives the SDK in-process and does not depend on the HTTP transport's session mode; and where claude DOES use the HTTP bridge (its provisioned `.mcp.json`), stateful is strictly more correct than stateless (stateless was already broken for multi-request HTTP MCP). No call site reads `transport.sessionId` or assumes "no session header." The existing X2 bridge integration tests (`packages/server/src/__tests__/mcp-bridge.integration.test.ts`) exercise the bridge over HTTP; T0 must keep them green (they may need a multi-request handshake update — see T0b).

### Proof obligations for the closure (no stub)

1. **T0b integration (in `test:all`, no binary):** drive `createMcpBridge` (production factory) through `createMcpRoute` over a real HTTP listener with a **multi-request handshake**: POST `initialize` → capture the `mcp-session-id` response header → POST `tools/list` with that header → POST `tools/call` with that header. Assert: init returns a session id header; list returns the registered tool; call routes to `registry.invoke` and returns its result. Sanity-break: omit the header on request 2 → 400/404 (proves the session gate is real, not vacuous). This is the deterministic, CI-gating proof that the PRODUCTION bridge is session-capable.
2. **Real-harness lanes re-pointed (local-only):** all three (claude, codex, opencode) hit `createMcpBridge` + real `createMcpRoute` (delete `buildStatefulMcpServer` + the route override). The end-to-end assertion (`captured>=1` → grant → real file written) now runs through the PRODUCTION transport for every CLI.

---

## Plan reconciliation (spec ⇆ reality)

| Spec / CONTEXT assumption | Reality | Plan handling |
|---|---|---|
| "`{{mcpUrl}}` slot missing for codex/opencode is the hole" | True for `args[]`; but the `{{mcpUrl}}` TemplateVar + `mcpConnectionInfo.url` resolution **already exist** end-to-end (cli-harness-adapter.ts:49,306; session-provisioning.ts:836). | The hole is narrower than "wire {{mcpUrl}} through": it's (a) per-session config-file writer + (b) pointing the binary at it. `{{mcpUrl}}` is reused only where a CLI flag wants the URL inline; codex/opencode consume it via the config file, not an arg. |
| "claude writes a JSON MCP config" | session-provisioning.ts:744–753 already writes `.mcp.json` into the sandbox. | Add the codex/opencode analog **in the same Phase 8b block** (write `config.toml` mcp block into `.codex-home/`; write `opencode.json` into the sandbox). |
| "codex via CODEX_HOME" | AL6 already injects `CODEX_HOME=<sandbox>/.codex-home` + writes `auth.json`+`config.toml`+`hooks.json` there. | Append `[mcp_servers.hyperidle]` to that **existing** `config.toml` (don't create a second config root). |
| "the production bridge is the transport claude uses" | Production bridge was **stateless**; real CLI clients need **stateful** (multiple HTTP requests/session). The claude lane used a stateful TEST server, NOT production. | **REVISED — R1 closed:** T0 makes the production `createMcpBridge` stateful (verified SDK API above). All three real-harness lanes are re-pointed at the PRODUCTION bridge (`createMcpBridge` + real `createMcpRoute`); the test-only `buildStatefulMcpServer` + route override are deleted. A deterministic in-CI integration test (T0b) drives the production bridge through init→list→call. No test stand-in remains. |
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
  args: ["run", "{{prompt}}", "--dir", "{{sandbox}}", "--format", "json", "--pure", "--model", "{{model}}"],  // ← AL7 delta: real headless invocation + explicit model (was ["--dir","{{sandbox}}"], which never ran a turn)
  envMap: { ANTHROPIC_API_KEY: "{{apiKey}}" },
  eventFormat: "ndjson",                        // ← AL7 delta: was "text"; opencode --format json emits JSONL
  envAllowlist: ["PATH", "HOME", "LANG"],
  returnEnforcementChannel: "process-reengage",
  reEngageCarrier: "run-arg",
  mcpConfig: { dialect: "opencode-json" },      // ← AL7 delta
},
```

> NOTE on the opencode `args` change: the current `["--dir","{{sandbox}}"]` launches the **interactive TUI**, never completing a headless turn. AL6's real-harness proof used `["run", <msg>, "--format","json","--pure","--model",<m>]`. This delta aligns the production args with the proven recipe.
>
> **W4 closure — `--model` has a real code home (verified).** `{{model}}` is an existing `TemplateVar` resolved by `startSession` from `config.resolvedModel?.model` (`cli-harness-adapter.ts:303`). The prior plan said "`--model` appended at spawn time" but the opencode `args` had NO `{{model}}` slot, so production opencode would spawn with no `--model` and fail (opencode `run` requires a provider-prefixed model id, e.g. `openrouter/~anthropic/claude-haiku-latest`). **Fix: add `"--model","{{model}}"` to the args** (above) so the template engine fills it. Builder MUST verify (T6) that `params.resolvedModel.model` is already provider-prefixed for an opencode-selected agent; if it is a bare id (e.g. `claude-haiku-latest`), the model resolution for opencode harness must produce the provider-prefixed form (small adapter-side or model-resolution fix, in-scope for making the production lane real). The re-engage path already pushes `--model session.reEngageResolvedModel` (`:557-558`), consistent. Flag the args/eventFormat change in review — it touches a `protectedTest` adjacency (AL6 WARN-F3 asserts `reEngageCarrier`, preserved).

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

**Decision:** EXTEND the existing `AL7-two-session-trust-first.real-harness.test.ts` rather than new files — it already owns the capturing router, `startAl7TestServer`/`rebuildBridge`, `buildCleanEnv`, `spawnDetached`. Add two `describe` blocks mirroring `claude-code CLI`. **Replace** the existing `per-harness matrix: codex + opencode wiring verification` block (the two `hasMcpUrlSlot === false` assertions) — those assert the hole still exists and will be FALSE after this delta.

> Rationale for extend-not-split: the server scaffolding + capturing router are ~250 lines of shared setup. Duplicating into two new files triples maintenance. One file, three `describe`s (claude/codex/opencode), shared helpers.

### 2a-prereq. Re-point the test server at the PRODUCTION bridge (R1 closure, T0)

**DELETE** `buildStatefulMcpServer` (lines 266–311) and the `app.all("/mcp/:token")` route override (lines 372–378). **REPLACE** with the production path inside `startAl7TestServer`/`rebuildBridge`:
- build the bridge via the production factory: `const bridge = await createMcpBridge({ sessionId: testSessionId, registry: capturingRouter.registry })` (import from `../../mcp/mcp-bridge.js`);
- `bridgeRegistry.register(bridge)` (already done) — the existing `createMcpRoute(bridgeRegistry, enforcementReg)` catch-all `ALL /mcp/:token` (mounted under `/api`) now serves the bridge over the PRODUCTION transport. **Do not** add a route override.
- `rebuildBridge(newRouter)`: `await bridgeRegistry.unregister(oldToken)` then `const b = await createMcpBridge({ sessionId, registry: newRouter.registry }); bridgeRegistry.register(b)`; expose `b.token`.
- The MCP URL the CLIs hit becomes `${server.url}/api/mcp/${token}` (production path), NOT `/mcp/:token`.

This makes ALL THREE lanes (claude included — re-pointing the claude lane IS feasible and cheap, since the only test-only constructs were `buildStatefulMcpServer` + the override) exercise the production transport. The claude lane's existing assertions are unchanged (protected); only its plumbing swaps to production. (Why re-pointing claude is cheap: the lane already builds `createMcpBridgeRegistry` + `createMcpRoute` from real production modules; the stateful stand-in was the ONLY divergence, and once production is stateful the stand-in is redundant.)

### 2a. Shared adjustment — config writer in the test

The test currently writes claude's `.mcp.json` via `writeMcpConfig`. Add the codex/opencode analogs **using the production `writeCliMcpConfig`** (so the test proves the real writer, not a test-local fork) pointed at the PRODUCTION `${server.url}/api/mcp/${token}` URL. The capturing router, mode switch, and `rebuildBridge` are reused (the latter now calls `createMcpBridge`).

### 2b. codex lane (`describe("codex CLI (real binary, MCP-routed two-session loop)")`)

Spawn recipe (from AL6, verbatim):
- Sandbox: `mkdtempSync`; `git init` + empty commit (codex requires a git repo) — reuse AL6's git-init block.
- Provision a per-session `.codex-home/` with `auth.json` + `config.toml` copied from `~/.codex` (AL6 `provisionCodexHome` recipe — copy ONLY auth.json + config.toml, NO SQLite). Then call `writeCliMcpConfig({ dialect:"codex-toml", sandboxPath, mcpUrl: ${server.url}/api/mcp/${token}, token })` to append `[mcp_servers.hyperidle]`.
- Env: `buildCleanEnv()` + `CODEX_HOME=<sandbox>/.codex-home` + `HYPERIDLE_MCP_TOKEN=<token>`.
- Spawn: `codex` `["exec", <prompt>, "--json", "--dangerously-bypass-hook-trust"]`, `cwd: sandbox`, `detached`, 60s timeout.
- Prompt: "Use the commit_file MCP tool to write 'al7-proof' to proof.txt. You MUST use the commit_file tool." (mirror claude prompt; codex exposes the MCP tool as `hyperidle__commit_file` / `commit_file`).
- Auth gate: `test.skipIf(!codexInstalled)` + in-body `codexAuthed()` skip (mirror AL6).

Assertions (mirror claude):
- **session-1 (capture):** after spawn, `testServer.capturingRouter.captured.length >= 1` and `captured[0].toolId === "commit_file"`. (REAL codex called the tool via MCP → router captured it. Routed through the PRODUCTION stateful bridge.)
- **AC8 control — non-approval-holds (NAMED assertion, not parenthetical):** with mode STILL `capture` (no approval, no `setMode("grant-bearing")`), assert `fs.existsSync(<sandbox>/proof.txt) === false` after session-1. Proves a captured-but-unapproved Proposed Call does NOT execute — half the trust-first contract. This is its own `expect`, separate from the session-1 capture assertion.
- **session-2 (grant):** approve in-process (`approvedCall = captured[0]`; `setMode("grant-bearing")`; `rebuildBridge` — now via `createMcpBridge`), re-spawn codex, assert `fs.existsSync(<sandbox>/proof.txt)` and content `=== "al7-proof"` (REAL codex executed the approved op via its own MCP tool, through the PRODUCTION transport → real file written), and `exitCode !== null` + stdout contains `turn.completed` (work continued).

### 2c. opencode lane (`describe("opencode CLI (real binary, MCP-routed two-session loop)")`)

Spawn recipe (from AL6, verbatim):
- Sandbox: `mkdtempSync` (no git required).
- `writeCliMcpConfig({ dialect:"opencode-json", sandboxPath, mcpUrl: ${server.url}/api/mcp/${token}, token })` → writes `<sandbox>/opencode.json`.
- Env: `buildCleanEnv()`.
- Spawn: `opencode` `["run", <prompt>, "--format","json","--pure","--dir", sandbox, "--model","openrouter/~anthropic/claude-haiku-latest"]`, `cwd: sandbox`, `detached`, 60s timeout. (cwd === --dir so config resolution finds `opencode.json` either way; pass both to match prod args.)
- Prompt: same commit_file instruction.
- Auth gate: `test.skipIf(!opencodeInstalled)` + `opencodeAuthed()`.

Assertions: identical to codex, including the **AC8 control (NAMED): capture-mode spawn → `fs.existsSync(proof.txt) === false`**. session-1 `captured>=1`; session-2 real `proof.txt` written; stdout contains `step_finish`. All routed through the PRODUCTION stateful bridge.

### 2d. Sanity-break note (in test comment, mirror claude's)

For each lane, document: changing the config-file token to a wrong value → PRODUCTION bridge registry lookup fails (401 from `mcp-bridge-registry.handleRequest`) → binary gets a tool error → `captured` stays 0 → assertion fails. Confirms the lane is not vacuous. (The reviewer runs this break under the mock-validation-trap rule; the production bridge's 401 path is the same one exercised.)

### 2e. Deterministic CI anchors (no binary) — TWO tests

**(i) Config-shape — `cli-mcp-config.integration.test.ts`** (runs in `test:all`): import `writeCliMcpConfig`, call both dialects against a temp dir, read back and assert:
- codex: `.codex-home/config.toml` contains `[mcp_servers.hyperidle]` + `url = "<mcpUrl>"` + `bearer_token_env_var = "HYPERIDLE_MCP_TOKEN"`; return value has `tokenEnv.HYPERIDLE_MCP_TOKEN === token`.
- opencode: `opencode.json` parses to `mcp.hyperidle.url === mcpUrl`, `type === "remote"`, `headers.Authorization === "Bearer <token>"`, `enabled === true`.

**(ii) Production-bridge session-capability — `mcp-bridge-stateful.integration.test.ts`** (runs in `test:all`, NO binary — THE R1-closure CI gate): start a real HTTP listener (`@hono/node-server serve`, port 0) mounting `createMcpRoute(bridgeRegistry, enforcementReg)`; register a bridge built by the PRODUCTION `createMcpBridge({ sessionId, registry })` (registry = a minimal real `buildToolRegistry` or the capturing router exposing one tool). Drive a multi-request MCP handshake with raw `fetch`:
1. POST `/api/mcp/:token` with an `initialize` JSON-RPC body + `Accept: application/json, text/event-stream` → assert 200 and capture the `mcp-session-id` response header (non-empty). *(Proves stateful init.)*
2. POST `tools/list` with `mcp-session-id: <captured>` → assert the registered tool name is present. *(Proves request 2 succeeds — the exact request stateless threw on.)*
3. POST `tools/call` (the tool) with the same header → assert it routed to `registry.invoke` and returned its result. *(Proves request 3 / the full turn.)*
- **Sanity-break (anti-vacuous):** repeat step 2 WITHOUT the `mcp-session-id` header → assert 400/404 (the SDK's "Mcp-Session-Id header is required" / "Session not found"). Confirms the session gate is real, not a no-op.
- ⚠️ NOTE for builder: the transport defaults to SSE (`enableJsonResponse=false`); responses may be `text/event-stream`. Parse the SSE `data:` frame for the JSON-RPC result (the MCP `StreamableHTTPClientTransport` does this; a hand-rolled fetch test must read the stream and extract the `data:` line). If SSE parsing is fiddly, the builder MAY use the SDK's `Client` + `StreamableHTTPClientTransport` pointed at the listener URL instead of raw fetch — that is still the PRODUCTION server transport (only the client is the SDK helper), which keeps the proof real. Do NOT set `enableJsonResponse=true` on the production bridge just to simplify the test (would change production behavior to satisfy a test — forbidden).

This (ii) is the deterministic in-CI proof the PRODUCTION bridge is session-capable on Linux. The real-binary lanes are the local-only end-to-end proof (also now through the production bridge).

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
| AC8 | Non-approval-holds (captured-but-unapproved Proposed Call does NOT execute) | **NAMED assertion in BOTH lanes (not parenthetical):** with mode still `capture` (no `setMode("grant-bearing")`), `fs.existsSync(<sandbox>/proof.txt) === false` after session-1. Its own `expect`. (At-most-once / consume-once is inherited from the locked loop's CAS; this delta proves the absence-of-approval half on the real binaries.) |
| AC9 | **R1: production MCP bridge is session-capable (stateful)** | `mcp-bridge-stateful.integration.test.ts` (T0b, in `test:all`): production `createMcpBridge` + `createMcpRoute` over a real listener completes init→list→call via `mcp-session-id`; sanity-break (omit header) → 400/404. |
| AC10 | **R1: real CLIs prove against the PRODUCTION bridge, not a stand-in** | All three real-harness lanes hit `createMcpBridge` + real `createMcpRoute` (test-only stateful server DELETED). `captured>=1` → grant → real file written runs through the production transport. (Local-only.) |

---

## §4 — Ordered task list (write-tests first, TDD)

**R1-closure tasks lead (T0/T0b) — the production bridge must be session-capable BEFORE the lanes can prove against it.**

1. **T0b (red, integration, R1 gate):** `mcp-bridge-stateful.integration.test.ts` — drive production `createMcpBridge` + `createMcpRoute` through init→list→call via `mcp-session-id`; sanity-break omits the header → 400/404 (AC9). Fails RED against the current stateless bridge: request 2 throws `Stateless transport cannot be reused across requests`. *(in `test:all` — this is the CI-gating R1 proof.)*
2. **T0 (green, R1 closure):** flip `createMcpBridge` to `sessionIdGenerator: () => crypto.randomUUID()`; update the X2 D1 + D3 `@lore` blocks (stateless→stateful framing). Confirm the existing `mcp-bridge.integration.test.ts` still green (update to a multi-request handshake if it relied on single-request stateless behavior — read its diff, do not blind-bless). → T0b green.
3. **T1 (red, integration):** `cli-mcp-config.integration.test.ts` — assert `writeCliMcpConfig` output for both dialects (AC5). Fails: function doesn't exist. *(in `test:all`)*
4. **T2 (red, unit):** extend `live-proof-lanes` unit tests — `getLiveProofLaneState("codex"|"opencode")` returns `green-now` when `which` resolves, `absent-fail` when it throws; `probeLiveProofHarnessAvailability` rejects on absence (AC7). Fails: still `wiring-needed`. *(in `test:all`)*
5. **T3 (red→green coupled, real-harness, local-only):** in `AL7-two-session-trust-first.real-harness.test.ts`: (a) **DELETE** `buildStatefulMcpServer` + the `app.all("/mcp/:token")` override; re-point `startAl7TestServer`/`rebuildBridge` at production `createMcpBridge` + real `createMcpRoute` (AC10) — re-points the **claude** lane too (cheap; claude assertions unchanged/protected); (b) ADD codex + opencode `describe` blocks (AC1–AC4) each with the **NAMED AC8 control-spawn** assertion; (c) DELETE the `per-harness matrix` `wiring-needed` block. Local-only (`npm run test:real-harness`); red without the wiring, green after T0+T5+T6.
6. **T4 (green):** add `mcpConfig` field to `CliAdapterConfig`; add `writeCliMcpConfig` (`cli-mcp-config.ts`). → T1 green.
7. **T5 (green):** wire `CLI_TOOL_CONFIGS.codex` + `.opencode` (`mcpConfig`; opencode `args` incl. `"--model","{{model}}"` + `eventFormat: "ndjson"`); add `mcpTokenEnv` threading in `SessionConfig` + `startSession` (codex `HYPERIDLE_MCP_TOKEN` injection, mirror CODEX_HOME — inject OUTSIDE allowlist, non-optional).
8. **T6 (green):** call `writeCliMcpConfig` in `session-provisioning.ts` Phase 8b for the selected CLI adapter; thread `tokenEnv` into the session config. **W3 sub-assertion:** run a real `opencode run --format json` spawn through the adapter and assert ≥1 event normalizes to a structured type (not `unknown`) via `normalizeHarnessEvent`; if `unknown`, add the opencode pre-map. **W4 sub-assertion:** confirm `resolvedModel.model` is provider-prefixed for an opencode agent; if bare, fix model resolution. → T3 codex/opencode lanes green (local).
9. **T7 (green):** flip `live-proof-lanes.ts` codex/opencode to real `which` probes; add `isCodexAvailable`/`isOpencodeAvailable` (use `execFileSync("which", ...)` like `isClaudeCodeAvailable`); update header matrix. → T2 green.
10. **T8 (docs):** update the per-harness matrix in `docs/process-layer/staged-operation.md` and `docs/agent-layer/` harness docs (§5) — include the bridge-is-now-stateful note.
11. **T9 (local proof):** run `npm run test:real-harness` (codex + opencode + claude authed) — capture real green for all three lanes through the PRODUCTION bridge. DoD artifact (AC1–AC4, AC10 proven live).
12. **T10 (gate):** `npm run check` + `npm run lint` + `npm run test` (deterministic lanes incl. T0b + T1 + T2 green). Builder runs verify; designer does NOT.

Dependencies: **T0b (red) → T0 (green) FIRST** — the stateful bridge gates everything downstream (the lanes point at it). T1,T2,T3 (red) before T4–T7 (green). T4 → T5/T6. T3 re-point depends on T0. T7 independent of T0/T4–T6. T9 after T0+T5+T6.

---

## Type signatures / contracts

```ts
// mcp-bridge.ts — createMcpBridge (R1 closure: the ONLY signature-level change to the bridge)
// BEFORE: new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
// AFTER:  new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() })
// McpBridgeInstance / CreateMcpBridgeOptions / the registry interface all UNCHANGED.

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
- **Stateful bridge — no new auth surface (R1).** The bridge auth boundary is UNCHANGED: the 64-char URL-path token is still the only credential and routing key (`bridgeRegistry.handleRequest` 401s unknown tokens). The SDK's `mcp-session-id` (now generated in stateful mode) is an MCP-protocol session id scoped to one already-authenticated bridge instance — it is NOT an auth credential and grants nothing on its own (a request with a valid `mcp-session-id` but unknown path token still 401s at the registry before reaching the transport). DNS-rebinding protection (`enableDnsRebindingProtection`) stays default-off, same as before, listener is loopback in tests and server-internal in prod. **No new secret, no widened surface.**

---

## Protected tests

`protectedTests`:
- `packages/server/src/harness/__tests__/AL7-two-session-trust-first.real-harness.test.ts` — the **claude** lane ASSERTIONS (session-1 capture, session-2 file write) MUST NOT change. The lane's PLUMBING does change (re-pointed from the test-only stateful server to the production `createMcpBridge`); this is the R1 closure, allowed and required. Net: same claude assertions, production transport underneath; ADD codex/opencode `describe`s; REMOVE `buildStatefulMcpServer` + route override + the `per-harness matrix wiring-needed` block.
- `packages/server/src/__tests__/mcp-bridge.integration.test.ts` — existing X2 bridge tests. T0 (stateful) must keep them green; if any relied on single-request stateless reuse-throw behavior, update to the multi-request handshake (read the diff, do not blind-bless).
- `packages/server/src/harness/__tests__/AL6-real-harness-return-enforcement.real-harness.test.ts` — AL6 enforcement assertions unchanged (the opencode `args`/`eventFormat` change must not break AL6's `reEngageCarrier` WARN-F3 assertion, which reads `CLI_TOOL_CONFIGS.opencode.reEngageCarrier` — preserved).

---

## Migrations (renamed/removed symbols)

- **Removed:** the `per-harness matrix: codex + opencode wiring verification` `describe` block (two `hasMcpUrlSlot === false` tests) — become false; delete (don't invert). **Also removed:** the test-only `buildStatefulMcpServer` helper + the `app.all("/mcp/:token")` route override in the AL7 real-harness test (replaced by production `createMcpBridge` + `createMcpRoute`).
- **Changed (production behavior — R1):** `createMcpBridge` transport `sessionIdGenerator: undefined` → `() => crypto.randomUUID()` (stateless→stateful). One line + lore. No symbol rename; the `McpBridgeInstance.transport` type is unchanged (same class).
- **Changed:** `CLI_TOOL_CONFIGS.opencode.args` (`["--dir","{{sandbox}}"]` → headless `run` form incl. `--model {{model}}`) and `.eventFormat` (`"text"` → `"ndjson"`). Grep call sites: only `adapter-pool.ts` (definition) + the AL6/AL7 real-harness tests read it. The AL6 WARN-F3 test reads `reEngageCarrier` (preserved); no other consumer asserts opencode `args`/`eventFormat`.
- No DB / route / column / testid renames.

---

## Shared files

`sharedFiles`:
- `packages/server/src/mcp/mcp-bridge.ts` (`createMcpBridge` — R1 stateful flip) ← AL7 delta-revised
- `packages/server/src/harness/adapter-pool.ts` (`CLI_TOOL_CONFIGS`)
- `packages/server/src/harness/cli-harness-adapter.ts` (`CliAdapterConfig`, `SessionConfig`, `startSession`)
- `packages/server/src/services/session-provisioning.ts` (Phase 8b)
- `packages/server/src/tools/live-proof-lanes.ts`

(AL8 will also touch `session-provisioning.ts` + `adapter-pool.ts` for reversibility auto-flow — schedule AL7 before AL8.)

---

## §5 — Risks (honest callouts)

- **R1 — CLOSED (was: production bridge stateless; real CLIs need stateful).** This revision makes `createMcpBridge` stateful (`sessionIdGenerator: () => crypto.randomUUID()`, source-verified API in the R1-closure section). codex/opencode have NO SDK fallback — the HTTP bridge is their only production transport — so a stateless bridge would leave them BROKEN in production while a stateful stand-in went green (false-green; rejected per founder standard). The test-only `buildStatefulMcpServer` + route override are DELETED; all three real-harness lanes (claude included) now hit the PRODUCTION `createMcpBridge` + `createMcpRoute`. A deterministic in-CI integration test (T0b, `mcp-bridge-stateful.integration.test.ts`) drives the production bridge through init→list→call with the `mcp-session-id` header + a sanity-break. No remaining stub. The registry/route need no change (the registry already holds one long-lived transport per token — exactly stateful's requirement; verified). claude SDK adapter unaffected (it does not depend on the HTTP transport's session mode; where claude uses the HTTP bridge via `.mcp.json`, stateful is strictly more correct).
- **R2 / W4 closure — opencode model id is provider-specific (now wired via `{{model}}`).** `opencode run` needs `--model provider/model`; a bare id fails. The args now carry `"--model","{{model}}"` (§1a), filled from `config.resolvedModel?.model` (`:303`). Builder verifies (T6) `resolvedModel.model` is provider-prefixed for an opencode agent; if bare, fix the opencode model resolution to emit the prefixed form. The real-harness lane hardcodes a known-good id (matches AL6).
- **R3 / W3 closure — opencode JSONL normalization is UNVERIFIED and likely incomplete (verified against source).** The normalizer is `normalizeHarnessEvent` (`packages/shared/src/harness/harness-event-normalization.ts`, imported `cli-harness-adapter.ts:34`, called `:714`) — NOT `normalizeNativeHarnessEvent` (that name does not exist; prior plan was wrong). It switches on a FIXED canonical `input.type` set: `completion | tool_call | error | cost_update | token_usage | pre_compaction` (`:67`); **anything else → `unknown`** (`:59-63`). opencode `--format json` JSONL emits raw types like `step_start`/`step_finish`/`tool` which are NOT in that set, so they normalize to `unknown` unless a per-harness pre-mapping translates them first. There is no evidence the parser currently recognizes opencode's structured events. **Builder MUST (T6) run a real `opencode run --format json` spawn through the adapter and assert ≥1 event normalizes to a structured type (e.g. `tool_call` for the `commit_file` invocation), NOT `unknown`.** If it normalizes to `unknown`, add the opencode-specific pre-map (raw `step_finish`/`tool` → canonical `completion`/`tool_call`) in the adapter — in-scope for this delta (without it the eventFormat change is cosmetic and opencode tool-calls are invisible to the loop). The real-harness lane's session-1 assertion (`captured>=1` via the MCP router) does NOT depend on this normalization — the router captures the MCP tool call directly — but the loop's event handling (return-detection, cost) does. codex `exec --json` is AL6-proven through `normalizeHarnessEvent`.
- **R4 — Auth-gated local-only proof.** The two lanes only run where `codex login status` / `opencode providers list` show creds. Per the rule "if a supported harness is not present/authed, the feature is not proven done on it." T9 must run on a machine where both are authed; if a lane can't run, surface it — do NOT substitute a stub (mock-validation-trap rule). Both binaries are installed + the recipes are AL6-proven, so this is expected to pass.
- **R5 — codex requires a git repo.** `codex exec` refuses outside a git repo (AL6 lore). The real-harness lane git-inits the sandbox; production sandboxes are git-backed (Track AL git-host boundary). If a production sandbox is ever non-git, codex needs `--skip-git-repo-check` — note for the builder, add to codex `extraArgs` if needed.

---

## Self-critique

- **Over-engineering?** No. The R1 closure is a ONE-LINE production change (`sessionIdGenerator`) + lore + a deterministic handshake test + deleting test-only scaffolding (net code REDUCTION in the lane). Plus one `writeCliMcpConfig` helper + one config field. The `{{mcpUrl}}`/`{{model}}` plumbing is reused, not rebuilt. No new abstraction, no new layer.
- **Scope creep?** The R1 stateful flip is in-scope by founder mandate ("real path, no stubs"): codex/opencode have no SDK fallback, so their production transport MUST work, not just a stand-in. The opencode `args`/`eventFormat`/`--model` fixes and the opencode-event pre-map are the minimum to make the production opencode lane real — without them opencode could not complete a turn or surface tool-calls. In-scope.
- **Missing failure mode?** The W3 opencode-normalization gap is now surfaced as a builder must-verify (T6) with a concrete fallback, not assumed-fine. The only remaining honest constraint: the real-binary lanes are local-only (auth-gated) — but the PRODUCTION bridge's session-capability is now proven deterministically IN CI (T0b), so the R1 false-green is genuinely closed, not deferred.
- **Did I keep what was good?** Yes — ONE transport-agnostic registry (no per-backend branch), TDD-first ordering, real `which` probes (absent→FAIL), docs updates. None of that changed; the revision only closes R1 and the W2/W3/W4 minors.
