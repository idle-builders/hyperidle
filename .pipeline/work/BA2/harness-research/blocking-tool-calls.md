# Blocking tool calls — can a tool call park a session until a human answers?

Research date: **2026-08-30**. Every per-harness claim below was produced by driving the **real installed
binary** headlessly against a throwaway MCP server, in the same spawn and config shape production uses
(`adapter-pool.ts` `CLI_TOOL_CONFIGS`, `cli-mcp-config.ts` `writeHarnessMcpConfig`). Nothing here is
inferred from a changelog. Where a claim is *not* live-proven it is marked `UNVERIFIED`.

Binaries as installed on this machine, checked live:

| Harness | Installed version | Brief said | Note |
|---|---|---|---|
| claude-code | **2.1.247** | 2.1.220 or later | newer |
| codex | **codex-cli 0.150.1** | 0.150.1 | matches |
| cursor-agent | **2026.08.25-3e8eec8** | 2026.08.25-3e8eec8 | matches |
| opencode | **1.18.25** | 1.18.16 | **newer than the brief** |

---

## 1. The verdict

### The founder is right that the pattern exists and is widely used. He is wrong that it is a special protocol mechanism.

The pattern he is describing — "a tool call that waits forever, used to send a message back to your
session via WhatsApp or Telegram" — is real and common. But it is **a completely ordinary MCP
`tools/call` that simply does not return**. There is no distinct protocol facility behind it. Four
independent human-in-the-loop MCP servers, read directly from their own READMEs on 2026-08-30:

- `vikrant82/tasksync-mcp` — *"1. Agent calls `get_feedback` and blocks. 2. You see the waiting session
  in the web UI… 4. Agent receives your response and continues working."* Optional `--heartbeat` mode
  with `--timeout=<ms>` default `3600000`.
- `StoyPenny/mcp-kilo-telegram` — a `ask_human()` tool with a `timeout_seconds` parameter, described as
  "blocking"; example `timeout_seconds=300`.
- `theohero/telegram-human-in-the-loop` — `TIMEOUT_SECONDS`, default `3600`, "how long to wait for a reply".
- `underwear/mcp-hitl-wrapper` — a proxy that blocks a wrapped tool pending Telegram approval; "timeout →
  agent gets an error, nothing happens".

**Not one of them uses MCP elicitation.** They are all plain blocking tools. The `--heartbeat` idea in
tasksync is the MCP **progress notification** keepalive, which is the one genuine protocol assist here.

### MCP elicitation exists, and is unusable for us.

`elicitation/create` (MCP spec revision **2025-06-18**, `https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation`)
is exactly the facility one would reach for: the server asks the client for structured input, the client
shows the user a form, the answer comes back as `accept` / `decline` / `cancel`. It is the closest
protocol-level match to the founder's description.

**All four harnesses refuse it headlessly, instantly.** Live-proven, one run each:

| Harness | Declared `elicitation` capability at `initialize` | What `elicitation/create` actually returned, headless |
|---|---|---|
| claude-code 2.1.247 | `{"elicitation":{"form":{}},"roots":{"listChanged":true}}` | `{"action":"cancel"}` after **0.01 s** |
| codex 0.150.1 | `{"elicitation":{"form":{},"url":{}}}` | `{"action":"decline"}` after **0.00 s** |
| cursor-agent 2026.08.25 | `{"elicitation":{"form":{}}}` | `{"action":"decline"}` after **0.01 s** |
| opencode 1.18.25 | `{"roots":{}}` — **no elicitation at all** | server-side error `Client does not support form elicitation` |

Three of four *advertise* the capability and then auto-refuse it. That is the trap: a naive capability
check at `initialize` would have said "yes, three of four support this" and been wrong on all three.

This is not a permission-flag artifact. I swept the approval variable per harness (details in §2); the
answer never changed.

### So: is the founder's "same path" available to us?

**Yes on three harnesses, no on cursor-agent.**

The usable mechanism is *a plain long-blocking MCP tool call on our existing bridge* — no new protocol,
no new transport, no elicitation. Every harness's ceiling is summarised in §3. The one hard stop is
**cursor-agent: 60 seconds, not configurable.**

### One extra, claude-only, that genuinely blocks

claude-code 2.1.247 has an **`Elicitation` hook**. A hook can intercept the elicitation request and answer
it programmatically instead of showing a dialog. **Live-proven**: a hook held an `elicitation/create`
open for **480 seconds** (with progress notifications keeping the idle timer alive) and then returned
`{"action":"accept","content":{"answer":"APPROVED_BY_HUMAN_AFTER_480S"}}`; the tool call resumed with
that verdict and the agent read it. This is a real blocking-human-approval path — but it exists on
claude only, so it cannot be "the same path" across the fleet.

---

## 2. Per-harness support, headless

Every run used HyperIdle's production spawn shape and config dialect. The probe server was a stateful
Streamable-HTTP MCP server (SDK `@modelcontextprotocol/sdk@1.29.0`, the same version this repo has in
`node_modules`), which is what all four harnesses dial in production.

### claude-code 2.1.247

- **Spawn**: `claude -p <prompt> --output-format stream-json --verbose --model haiku --mcp-config .mcp.json
  --strict-mcp-config --permission-mode bypassPermissions` — production's `CLAUDE_CLI_CONFIG.args`.
- **Negotiates** protocol `2025-11-25`. Also issues a pre-`initialize` `server/discover` carrying
  `io.modelcontextprotocol/protocolVersion: 2026-07-28` — it speaks a newer draft than the spec revision
  our SDK targets.
- **Sends a `progressToken`** on every `tools/call` (`_meta.progressToken`), so progress-notification
  keepalive is available.
- **Elicitation: auto-cancel.** Swept four permission configurations, all `{"action":"cancel"}` in ~0.01 s:
  | Config | Result |
  |---|---|
  | `--permission-mode bypassPermissions` | tool ran, elicitation `cancel` in 0.01 s |
  | `--permission-mode manual --allowedTools mcp__probe__ask_human` | tool ran, elicitation `cancel` in 0.01 s |
  | `--permission-mode acceptEdits --allowedTools mcp__probe__ask_human` | tool ran, elicitation `cancel` in 0.01 s |
  | no `--permission-mode` / `manual` / `dontAsk` without `--allowedTools` | the *tool call itself* was denied; elicitation never reached |

  So the cancel is not caused by the permission mode. Claude Code's own docs
  (`https://docs.claude.com/en/docs/claude-code/mcp.md`, fetched 2026-08-30) say elicitation is presented
  as *"an interactive dialog"*; headless `-p` has no dialog, so it cancels.
- **Elicitation hook works and blocks.** `.claude/settings.json` `hooks.Elicitation[].hooks[]` with
  `{type:"command", command:"node …", timeout:600}`. The hook receives
  `{hook_event_name:"Elicitation", mcp_server_name, message, mode:"form", requested_schema}` on stdin and
  answers with `{"hookSpecificOutput":{"hookEventName":"Elicitation","action":"accept","content":{…}}}`.
  Live-proven at **90 s**, **340 s**, and — with the server also emitting progress notifications while the
  elicitation is open — **480 s**. Documented at
  `https://docs.claude.com/en/docs/claude-code/hooks.md` §Elicitation.
  The elicitation path is governed by the **same 300 s idle timer** as a plain blocking call, but only
  **one** of the three levers reaches it (see the table below).
- **Plain blocking tool: works, with a 300 s idle cap by default, and the cap is liftable.**
  - 300 s blocking call → returned; agent reported the secret correctly.
  - 1500 s blocking call, default config → aborted. Claude's own error text, verbatim:
    `MCP server "probe" tool "wait_seconds" sent no response or progress for 300s; aborting. If this
    server is configured in your MCP settings, set a per-server "timeout" (ms) to allow longer silent
    runs for just this server; otherwise set CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT (ms) globally (0 disables).`
  - Three independent lifts, each live-proven with a **480 s** blocking call that returned successfully:
    | Lever | Result at 480 s |
    |---|---|
    | `.mcp.json` per-server `"timeout": 3600000` | returned at 480.00 s |
    | env `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=0` | returned at 480.00 s |
    | server sends progress notifications every 5 s (default config otherwise) | returned at 480.00 s |

    For an **open elicitation** the three levers are **not** equivalent — this is the one place the
    documented knobs mislead. Each row is a separate 480 s live run:
    | Lever, with an elicitation held open 480 s | Result |
    |---|---|
    | `.mcp.json` per-server `"timeout": 3600000` | **failed** at ~355 s: `transport dropped mid-call; response for tool "ask_human" was lost` |
    | env `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=0` | **failed** at ~355 s, identical error and identical timing |
    | server sends progress notifications while the elicitation is open | **succeeded** — 95 progress notifications, `{"action":"accept",…}` returned at 480.12 s |

    A 340 s hold succeeds on default config; 480 s does not. So the ceiling is the 300 s idle timer, and
    **progress notifications are the only lever that lifts it on the elicitation path.**
- **Automatic backgrounding does not apply to us.** The docs say an MCP call still running after two
  minutes moves to a background task — but explicitly *not* for "calls in non-interactive mode, unless
  `CLAUDE_AUTO_BACKGROUND_TASKS` is set to `1`". HyperIdle runs `-p`, which is non-interactive.
  Consistent with observation: our 300 s and 480 s calls blocked the whole time, no task id.

### codex 0.150.1

- **Spawn**: `codex exec --sandbox workspace-write --model gpt-5.4-mini <prompt> --json` with
  `CODEX_HOME` pointing at a per-session `.codex-home/config.toml` — production's shape.
- **Negotiates** protocol `2025-06-18`. **Sends a `progressToken`.**
- **Elicitation: auto-decline in 0.00 s.** Codex bundles a full elicitation implementation, but its UI
  lives in `tui/src/bottom_pane/mcp_server_elicitation.rs` (string extracted from the binary) — a TUI
  component. `codex exec` has no TUI, so it declines.
- **Approval sweep**: without `default_tools_approval_mode = "approve"` on the server block the *tool call
  itself* is refused (`MCP tool call requires approval, but approval policy is never`) — elicitation is
  never reached. `--approve-for-me` is **not** a valid `codex exec` flag in 0.150.1 (exit 2, usage error);
  it exists only on the interactive command.
- **Plain blocking tool: 300 s default, configurable up.**
  - 300 s call → returned (300.02 s).
  - 1500 s call → aborted with `timed out awaiting tools/call after 300s`.
  - `tool_timeout_sec = 30` → aborted with `timed out awaiting tools/call after 30s`. The knob is real.
  - `tool_timeout_sec = 1200` with a **420 s** call → **returned at 420.00 s**. The cap is liftable.
  - **Progress notifications do NOT reset codex's timer.** With `tool_timeout_sec = 30`, a tool sending a
    progress notification every 5 s still died at 30 s.
- **Doc/binary discrepancy, flagged.** `https://developers.openai.com/codex/mcp.md` (fetched 2026-08-30)
  says `tool_timeout_sec` "Default: `60`". The installed 0.150.1 binary demonstrably defaults to **300 s**.
  Trust the binary.

### cursor-agent 2026.08.25-3e8eec8 — the hard stop

- **Spawn**: `cursor-agent -p <prompt> --print --output-format stream-json --model auto --trust
  --approve-mcps` with `.cursor/mcp.json` — production's shape.
- **Negotiates** protocol `2025-11-25`, identifies as `{"name":"Cursor","version":"1.0.0"}`.
- **Sends NO `progressToken`** on `tools/call`. Confirmed on every cursor run. Progress-notification
  keepalive is therefore impossible: the server has no token to address a progress notification to.
- **Elicitation: auto-decline in 0.01 s.** Also with `--force` (a.k.a. `--yolo`). Without `--approve-mcps`
  the MCP server is not exposed to the model at all.
- **Cursor has no elicitation hook.** Its hook surface
  (`https://cursor.com/docs/hooks.md`, fetched 2026-08-30) is `sessionStart`/`sessionEnd`,
  `preToolUse`/`postToolUse`/`postToolUseFailure`, `subagentStart`/`subagentStop`,
  `beforeShellExecution`/`afterShellExecution`, `beforeMCPExecution`/`afterMCPExecution`,
  `beforeReadFile`/`afterFileEdit`, `beforeSubmitPrompt`, `preCompact`, `stop`,
  `afterAgentResponse`/`afterAgentThought`, plus Tab and app-lifecycle hooks. No elicitation event.
- **Plain blocking tool: hard 60 s, not configurable.**
  - 300 s call → aborted at exactly **60.00 s**, `notifications/cancelled` with reason
    `McpError: MCP error -32001: Request timed out`. Cursor then retried and died at 60 s again.
  - 180 s call with a `"timeout": 1200000` field added to `.cursor/mcp.json` → **still 60.01 s**. The field
    is ignored.
  - 180 s call with progress notifications → still 60 s (no progressToken, so none could be sent).
  - Root cause, read from the installed bundle: cursor ships an MCP SDK whose request timeout is
    `n?.timeout ?? 6e4`, and its own call site is `callTool({name:t,arguments:n})` — **no options object,
    so no `timeout` and no `resetTimeoutOnProgress` is ever passed.** Hardcoded 60 s.

### opencode 1.18.25

- **Spawn**: `opencode run <prompt> --dir <sandbox> --format json --pure --model
  openrouter/z-ai/glm-4.7-flash` with `OPENCODE_CONFIG` → per-session `opencode.json` — production's shape.
  (`--pure` does **not** stop the MCP config from loading; MCP tools worked in every `--pure` run.)
- **Negotiates** protocol `2025-11-25`. **Sends a `progressToken`.**
- **Declares NO elicitation capability** — `{"roots":{}}` only. The server-side `elicitInput` call fails
  immediately with `Client does not support form elicitation`. Its published config schema
  (`https://opencode.ai/config.json`, fetched 2026-08-30) contains no elicitation key of any kind.
  The binary contains a handful of `elicitation` strings, but those are unreachable SDK type definitions —
  the live handshake is the truth.
- **Plain blocking tool: 60 s default, liftable two ways.**
  - 300 s call → aborted at **60.02 s**, `MCP error -32001: Request timed out`.
  - **Progress notifications reset the clock**: a 180 s call emitting progress every 5 s **returned at
    180.00 s** with no config change at all.
  - **Per-server `timeout` works**: `mcp.probe.timeout = 1200000` in `opencode.json`, 180 s call with *no*
    progress notifications → **returned at 180.00 s**.

---

## 3. Timeout behaviour, side by side

Nothing waits forever anywhere. The MCP spec itself forbids it in spirit: *"Implementations SHOULD
establish timeouts for all sent requests… Implementations MAY choose to reset the timeout clock when
receiving a progress notification… However, implementations SHOULD always enforce a maximum timeout"*
(`https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle`, §Timeouts). Every one of our
four harnesses follows that guidance.

| Harness | Default cap on a silent blocking tool call | Configurable? | Progress notifications reset it? | Sends a `progressToken`? |
|---|---|---|---|---|
| claude-code 2.1.247 | **300 s** (idle timer, HTTP transport) | **Yes** — `.mcp.json` per-server `"timeout"` ms, or `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` ms (`0` disables). Wall-clock default beyond that is `MCP_TOOL_TIMEOUT`, documented ≈28 h | **Yes** | Yes |
| codex 0.150.1 | **300 s** (`tool_timeout_sec`) | **Yes** — `tool_timeout_sec` in the `[mcp_servers.*]` block. 1200 proven | **No** | Yes |
| cursor-agent 2026.08.25 | **60 s** | **No** — no knob found, and the bundle passes no options to `callTool` | **No** (no token) | **No** |
| opencode 1.18.25 | **60 s** | **Yes** — `mcp.<name>.timeout` ms | **Yes** | Yes |

Failure shape when the cap is hit is consistent and *loud*, which is good news: the client sends
`notifications/cancelled` for the request, the server sees its `AbortSignal` fire, and the agent receives
an explicit error string it can act on. No harness silently pretends the call succeeded.

Two second-order caps worth knowing about, both claude-only and both documented at
`https://docs.claude.com/en/docs/claude-code/mcp.md`:
- Automatic backgrounding of >2-minute MCP calls — **does not apply in non-interactive `-p` mode**, which
  is the only mode HyperIdle uses. Verified by observation.
- A per-request "first response byte" timer for HTTP servers, set to the greatest of 60 s, the applicable
  tool timeout, and `MCP_TIMEOUT`. It never bit in any run.

### Claude's elicitation path obeys the idle timer, and only progress notifications lift it

For a **plain blocking tool**, all three of claude's levers lift the 300 s cap (each proven at 480 s). For
an **open elicitation**, only progress notifications work: both `.mcp.json` `"timeout": 3600000` and
`CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=0` failed at ~355 s with the same
`transport dropped mid-call` error and the same timing, while progress notifications carried a 480 s hold
to a clean `accept`. Anyone building on the claude Elicitation hook must emit progress; the config knobs
that the error message itself recommends do not cover this case.

---

## 4. What HyperIdle has today

All three files are in `layers/agent-execution/harness-registry/src/mcp/`.

**The bridge already runs on the right substrate.** `mcp-bridge.ts` builds one `McpServer` +
`WebStandardStreamableHTTPServerTransport` per session, in **stateful** mode
(`sessionIdGenerator: () => crypto.randomUUID()`), keyed by a 64-char hex path token. That transport
supports server→client requests. **Live-proven**: I stood up a server using the *same* class and the same
SDK version and drove a real MCP client at it — `elicitation/create` went out over the wire and the answer
came back. So the transport is not the obstacle; the harnesses are.

**There is no timeout anywhere on the tool path.** Confirmed: a search for `timeout` / `Timeout` /
`AbortSignal` / `setTimeout` across `mcp-bridge.ts`, `mcp-route.ts` and `index.ts` returns nothing. The
tool handler is `async (args) => { const result = await registry.invoke(def.name, args); … }` — if
`invoke` never resolves, the bridge holds the HTTP response open indefinitely. There is also no
session-level wall clock in `cli-harness-adapter.ts`; its only timer is a 5-second SIGTERM→SIGKILL
escalation during teardown. **A blocking tool would work on our side today with no bridge change at all.**

**What is missing to use the mechanism:**
1. Nothing, for the blocking tool itself. A tool whose handler awaits a promise resolved by the human's
   verdict is enough.
2. **Per-harness timeout configuration**, which is where the work is. Three of four config writers already
   exist and would each need one field added, in `cli-mcp-config.ts`:
   - `codex-toml` → `tool_timeout_sec` in the `[mcp_servers.hyperidle]` block.
   - `opencode-json` → `timeout` (ms) in the `mcp.hyperidle` entry.
   - claude → the `.mcp.json` writer is **not** in `cli-mcp-config.ts`; it is written by session
     provisioning (referenced in `adapter-pool.ts`'s `CLAUDE_CLI_CONFIG` lore as
     `{mcpServers:{hyperidle:{type:"http",url}}}`). It needs a `timeout` field, or
     `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` added to the spawn env (`envAllowlist` would need it too).
   - `cursor-json` → nothing to add. There is no knob.
3. **Progress notifications** are the belt-and-braces option and are free on claude and opencode (both
   send a `progressToken`); they do nothing on codex and are impossible on cursor-agent.
4. If the claude `Elicitation` hook path were ever wanted, note that the existing hook entries in
   `provision-return-hook.ts` are written with `timeout: 10` (seconds). A blocking hook needs a far larger
   value; the 340 s proof used `timeout: 600`.

---

## 5. Still unknown / not verified

- **Why claude's two config knobs fail to cover an open elicitation.** The behaviour is proven (both fail
  at ~355 s, progress notifications succeed at 480 s); the *reason* is not established. It could be a bug
  or a deliberate carve-out. Treat "emit progress" as the supported answer.
- **The true upper bound on claude and codex.** Proven to 480 s (claude, three levers) and 420 s (codex,
  `tool_timeout_sec = 1200`). Nobody ran a multi-hour hold. Claude's documented `MCP_TOOL_TIMEOUT` default
  of ≈28 h is `UNVERIFIED` by me — documentation only.
- **opencode's upper bound.** Proven to 180 s by both levers. Higher values are `UNVERIFIED`.
- **Whether a stdio transport changes any of this.** Every run used HTTP, because that is what production
  uses. Claude's docs say stdio servers get a 30-minute idle window instead of 5 minutes and have no
  per-request timer, so stdio would be *more* permissive on claude — `UNVERIFIED` for the others, and
  irrelevant unless we change transport.
- **Whether cursor-agent's 60 s can be raised by any means at all.** I checked `.cursor/mcp.json`'s
  `timeout` field (ignored, live), the CLI flags, and the shipped bundle's `callTool` call site (passes no
  options). I did not find a knob. I cannot prove a negative — but three independent checks agree.
- **A second cursor-agent path**, `beforeMCPExecution` / `afterMCPExecution` hooks, exists and was **not**
  tested. Whether a cursor hook can be held open the way a claude hook can is unknown and would be the
  next thing to try if cursor must be supported.

### Incidental finding, not BA2's to fix

`codex-cli 0.150.1` refuses to start in a non-git directory even when `.codex-home/config.toml` carries
`[projects."<path>"] trust_level = "trusted"` — it still prints *"Not inside a trusted directory and
--skip-git-repo-check was not specified."* `git init` in the same directory makes it run. Production is
unaffected because session sandboxes are git worktrees, but the `buildCodexTrustBlock` lore in
`cli-mcp-config.ts` claims trust alone is sufficient, and by itself it is not.

---

## Reproduction

The probe is throwaway and lives outside the repo, at
`/private/tmp/claude-501/-Users-tg-hyperidle--claude-worktrees-au-service-methods-cleanup-158cd0/1744caa3-ba2c-4746-9401-922a3d0c4cd6/scratchpad/probe/`:
`server.mjs` (MCP server with `wait_seconds`, `wait_seconds_with_progress`, `ask_human`, logging every
JSON-RPC frame), `control-client.mjs` (an SDK client that *does* implement elicitation — the control that
proves the server works), `run.mjs` / `run2.mjs` (per-harness headless drivers),
`run-elicit-hook.mjs` (claude Elicitation-hook driver), `web-transport-server.mjs` (HyperIdle's exact
transport class). Per-run evidence is under `runs/<harness>-<tag>/`.
