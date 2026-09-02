# claude-code CLI — deep harness reference

**Binary under test.** `claude` → `/opt/homebrew/bin/claude` → `/opt/homebrew/Caskroom/claude-code@latest/2.1.247/claude` (Mach-O 64-bit arm64, 233 MB, bun-compiled single file).
**Version string.** `2.1.247 (Claude Code)`. Build commit `89c726188daf` (from `claude doctor`).
**Machine.** darwin-arm64, Node `v24.18.0` on PATH, installed via Homebrew cask `claude-code@latest`.
**Date of testing.** 2026-09-01 / 2026-09-02.
**Produced by.** A research agent driving the real binary. Every TEST row below is a command actually run on this machine, output captured, not paraphrased. Model for all model-calling tests: `haiku` (`claude-haiku-4-5-20251001`), the repo's locked test model.
**Scope.** Supersedes `interception-claude-code.md` and `session-continuation.md` for claude-code. Prior claims are audited at the end — confirmed, refuted, untested.

**Method note.** The parent process (this session) exports ~25 `CLAUDE_CODE_*` env vars that change child behaviour. Every test below ran through a wrapper (`$D/cc`, appendix A) that unsets `CLAUDE*`, `CLAUDECODE`, `AI_AGENT`, `BAGGAGE`, `MCP_*`, `ANTHROPIC_BASE_URL` and pins PATH. Without it, the measured tool list gains an extra `Artifact` tool. If you reproduce these results from inside a Claude Code session without scrubbing, you will get different tool vocabularies.

---

## 1. Claims table

Each row: claim | evidence kind | how to check it in one hop. `TEST` = a command run here. `WEB` = a page fetched on 2026-09-02.

### Identity & invocation

| # | Claim | Kind | Reference |
|---|---|---|---|
| 1 | Version is `2.1.247 (Claude Code)`; `-v`/`--version` prints exactly that | TEST | `claude --version` |
| 2 | Real path is `/opt/homebrew/Caskroom/claude-code@latest/2.1.247/claude`; `/opt/homebrew/bin/claude` is a symlink | TEST | `readlink -f /opt/homebrew/bin/claude` |
| 3 | Install method homebrew cask `claude-code@latest`, **no auto-update**; build commit `89c726188daf` | TEST | `claude doctor` → "Package manager: homebrew … Auto-updates: Managed by package manager" |
| 4 | Homebrew has two casks: `claude-code` = stable (~1 week behind), `claude-code@latest` = every release. Homebrew installs do not auto-update | WEB | https://code.claude.com/docs/en/overview — "`claude-code` tracks the stable release channel, which is typically about a week behind… Homebrew installations do not auto-update." |
| 5 | Canonical docs host is `code.claude.com/docs/en/…`; `docs.claude.com/en/docs/claude-code/…` 301-redirects there | TEST+WEB | WebFetch of `https://docs.claude.com/en/docs/claude-code/hooks` → 301 → `https://code.claude.com/docs/en/hooks` |
| 6 | `--help` does **not** list every flag. `--max-turns`, `--permission-prompt-tool`, `--init-only`, `--system-prompt-file`, `--append-subagent-system-prompt`, `--advisor`, `--channels`, `--teammate-mode` all exist but are absent from `claude --help` | TEST | appendix B.1 |
| 7 | `--restricted` and `--exec` do **not** exist in 2.1.247 (`unknown option`). Docs say `--restricted` requires v2.1.248 | TEST+WEB | appendix B.1; https://code.claude.com/docs/en/cli-reference |

### Exit codes

| # | Claim | Kind | Reference |
|---|---|---|---|
| 8 | Success → exit `0` | TEST | appendix B.2 |
| 9 | Unknown flag → exit `1`, `error: unknown option '--nosuchflag'` on stderr | TEST | appendix B.2 |
| 10 | Bogus resume UUID → exit `1`, stderr `No conversation found with session ID: <uuid>`, empty stdout | TEST | appendix B.2 |
| 11 | Non-UUID `--session-id` → exit `1`, stderr `Error: Invalid session ID. Must be a valid UUID.` | TEST | appendix B.2 |
| 12 | `--settings <missing file>` → exit `1`, stderr `Error: Settings file not found: <path>`. An inline JSON string that fails to parse is reported the same way ("Settings file not found: {\"hooks\":") | TEST | appendix B.2 |
| 13 | Settings JSON that parses but fails **schema** validation → exit `0`, run proceeds, **no warning anywhere** | TEST | appendix B.3 |
| 14 | `--max-budget-usd` exceeded → exit `1`, stdout `Error: Exceeded USD budget (0.0001)` | TEST | appendix B.2 |
| 15 | `--max-turns` exceeded → exit `1`, result frame `subtype:"error_max_turns"`, `terminal_reason:"max_turns"`, `is_error:true`, `result:null` | TEST | appendix B.4 |
| 16 | `claude -p --resume <id>` with **no prompt** on a non-deferred session → exit `1`, stderr `Error: No deferred tool marker found in the resumed session…` | TEST | appendix B.2 |
| 17 | SIGTERM → exit `143`. SIGINT → exit `0` (ends the turn) | TEST | appendix B.5 |

### Output protocol

| # | Claim | Kind | Reference |
|---|---|---|---|
| 18 | `--output-format` = `text` \| `json` \| `stream-json`; `stream-json` requires `--verbose` for the full stream | TEST+WEB | appendix C.1 |
| 19 | First stream-json line is `{"type":"system","subtype":"init",…}` carrying `session_id`, `tools`, `mcp_servers`, `model`, `permissionMode`, `apiKeySource`, `slash_commands`, `skills`, `agents`, `plugins`, `capabilities`, `claude_code_version`, `memory_paths`, `cwd`, `messaging_socket_path` | TEST | appendix C.1 |
| 20 | **The init frame is not always first.** On a deferred-tool resume the `tool_result` of the resumed call arrives **before** `system/init` | TEST | appendix E.4 |
| 21 | `session_id` appears on essentially every frame, and in the result frame | TEST | appendix C.1 |
| 22 | Token usage appears twice: per-assistant-message `message.usage`, and aggregated in the result frame under `usage` + `modelUsage` (per canonical model, with `costUSD`, `contextWindow`, `maxOutputTokens`, `costBasis`) | TEST | appendix C.1 |
| 23 | Result frame fields: `type`, `subtype`, `is_error`, `stop_reason`, `terminal_reason`, `result`, `session_id`, `uuid`, `num_turns`, `duration_ms`, `duration_api_ms`, `total_cost_usd`, `usage`, `modelUsage`, `permission_denials`, `subagent_stats`, `queued_turn_count`, `api_error_status`, `ttft_ms`, `fast_mode_state`. Plus `deferred_tool_use` when deferred and `structured_output` when `--json-schema` is used | TEST | appendix C.1, C.2, E.2 |
| 24 | `permission_denials` in the result frame lists every blocked call as `{tool_name, tool_use_id, tool_input}` — this is the machine-readable record of what the gate stopped | TEST | appendix D.1 |
| 25 | `terminal_reason` enum (from the shipped bundle): `completed`, `max_turns`, `tool_deferred`, `hook_stopped`, `stop_hook_prevented`, `aborted_streaming`, `aborted_tools`, `background_requested`, `blocking_limit`, `rapid_refill_breaker`, `prompt_too_long`, `image_error`, `model_error`, `api_error`, `malformed_tool_use_exhausted`, `budget_exhausted`, `structured_output_retry_exhausted`, `tool_deferred_unavailable`, `turn_setup_failed` | TEST (binary strings) | appendix G.1 |
| 26 | Result `subtype` values seen/present: `success`, `error_max_turns`, `error_during_execution`, `error_max_budget_usd`, `error_max_structured_output_retries` | TEST (binary strings + live) | appendix B.4, G.2 |
| 27 | **Trap: `result` is `""` whenever `stop_reason == "tool_deferred"`.** The payload is in `deferred_tool_use` | TEST | appendix E.2 |
| 28 | **Trap: a resumed run can emit TWO `result` frames and TWO `system/init` frames** — one for the auto-resumed deferred tool, one for the new user turn. A reader taking the first gets the wrong one | TEST | appendix E.5 |
| 29 | On a deferred re-defer, `terminal_reason` is `null` while `stop_reason` is `tool_deferred`, and `num_turns` is a nonsense cumulative number (observed 12 on a 1-turn resume) | TEST | appendix E.3 |
| 30 | `--json-schema` puts the parsed object in `structured_output` and its JSON text in `result` | TEST | appendix C.2 |
| 31 | `--include-hook-events` adds `system/hook_started` and `system/hook_response` frames carrying `hook_id`, `hook_name`, `hook_event`, `stdout`, `stderr`, `exit_code`, `outcome` | TEST | appendix D.6 |
| 32 | Other observed system subtypes in a plain print run: `rate_limit_event` (top-level type), `system/thinking_tokens`, `system/post_turn_summary`, `system/permission_denied`, `system/vcs_state_changed` | TEST | appendix C.1, D.3, E.4 |

### Session model

| # | Claim | Kind | Reference |
|---|---|---|---|
| 33 | The caller **can assign** the session id: `--session-id <uuid>` is honoured verbatim and appears in the init frame, the hook payload and the transcript filename | TEST | appendix E.1 |
| 34 | Transcripts live at `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`. Encoding replaces `/` and `.` with `-` (`/private/tmp/ccdeep.2SxKwI/s1` → `-private-tmp-ccdeep-2SxKwI-s1`) | TEST | appendix E.1 |
| 35 | **`--resume <uuid>` is NOT bound to the working directory in 2.1.247.** Resuming from an unrelated cwd works, exit 0, full context preserved | TEST | appendix E.6 — **this refutes `session-continuation.md`** |
| 36 | Docs confirm: since v2.1.223 the ID search covers "the current project directory and its git worktrees, then every other project on this machine" | WEB | https://code.claude.com/docs/en/cli-reference `--resume` |
| 37 | A cross-directory resume appends to the **original** transcript file; each record carries the new `cwd`. An empty project dir is created for the new cwd (holding only `memory/`) | TEST | appendix E.6 |
| 38 | `--continue` in a directory with **no** sessions silently starts a **brand new session**, exit 0, no warning | TEST | appendix E.7 |
| 39 | `--fork-session` on resume returns a new `session_id` with the prior context intact | TEST | appendix E.8 |
| 40 | **Concurrent resume of one session succeeds for both processes and silently loses one branch.** Both turns append to the same transcript; the next resume follows only the last-written `last-prompt.leafUuid` | TEST | appendix E.9 |
| 41 | `--no-session-persistence` works and makes the session unresumable (`No conversation found with session ID`) | TEST | appendix E.10 |
| 42 | Transcript record types observed: `user`, `assistant`, `attachment`, `queue-operation`, `last-prompt`, `ai-title`, `atis-latch`, `mode`. `last-prompt` records carry `leafUuid` — this is how resume picks a branch | TEST | appendix E.11 |
| 43 | User records carry `permissionMode`, `promptSource:"sdk"`, `entrypoint:"sdk-cli"`, `cwd`, `gitBranch`, `version` | TEST | appendix E.11 |

### Permission / interception

| # | Claim | Kind | Reference |
|---|---|---|---|
| 44 | Full hook-event list in the shipped bundle (31 names): `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Notification`, `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart`, `SessionEnd`, `Stop`, `StopFailure`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PostCompact`, `PermissionRequest`, `PermissionDenied`, `Setup`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `Elicitation`, `ElicitationResult`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`, `InstructionsLoaded`, `CwdChanged`, `FileChanged`, `DirectoryAdded`, `MessageDisplay` | TEST (binary strings) | appendix G.3 |
| 45 | Docs list the same set plus `PreModelSwitch` / `PostModelSwitch` | WEB | https://code.claude.com/docs/en/hooks |
| 46 | **Events that actually fire in a plain `-p` run**: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolBatch`, `MessageDisplay`, `Stop`, `SessionEnd`. `PermissionRequest` did **not** fire in `bypassPermissions`, `default`, or `manual` mode in these runs | TEST | appendix D.7 |
| 47 | `PreToolUse` stdin payload: `session_id`, `transcript_path`, `cwd`, `prompt_id`, `permission_mode`, `hook_event_name`, `tool_name`, `tool_input`, `tool_use_id`. (`effort` appears only when the parent supplies `CLAUDE_EFFORT`; absent in a scrubbed env) | TEST | appendix D.1 |
| 48 | `permissionDecision` accepted values in this build: **`allow`, `deny`, `ask`, `defer`**. The bundle carries the 4-value enum twice; the **embedded and public docs only document `allow`/`deny`** | TEST+WEB | appendix G.4; https://code.claude.com/docs/en/hooks lists only `"deny"` and `"allow"` |
| 49 | `deny` + `permissionDecisionReason` → the model's `tool_result` content is **exactly and only** the reason string, `is_error: true`. No prefix, no tool name, no hook path | TEST | appendix D.1 |
| 50 | `deny` fires even under `--permission-mode bypassPermissions` — the hook sits above the permission system | TEST | appendix D.1 |
| 51 | `ask` under headless `bypassPermissions` behaves as a deny: emits `system/permission_denied` with `message` = the reason, and the tool_result is the reason string verbatim | TEST | appendix D.3 |
| 52 | `updatedInput` on a PreToolUse `allow` **rewrites the command that runs**, and the stream's `tool_use` frame still shows the ORIGINAL input. The stream misreports what executed | TEST | appendix D.4 |
| 53 | `additionalContext` on a PreToolUse `allow` reaches the model | TEST | appendix D.5 |
| 54 | Exit `2` + stderr blocks, but the message is wrapped: `PreToolUse:<Tool> hook error: [<command path>]: <stderr>` — the model then talks about "a hook", not about your policy | TEST | appendix D.2 |
| 55 | **Every hook failure mode fails OPEN**: exit 1 with stderr, missing executable (exit 127), malformed JSON on stdout, and configured-timeout expiry all let the tool run. No stderr on the parent, no system event without `--include-hook-events` | TEST | appendix D.8 |
| 56 | Docs agree and say so explicitly for PreToolUse: "A timed-out `command`, `http`, or `mcp_tool` hook doesn't block the tool call… don't count on a stalled hook to act as a gate" | WEB | https://code.claude.com/docs/en/hooks |
| 57 | `hook_response.outcome` distinguishes failures: `error` (exit 1 / 127, stderr captured), `cancelled` (timeout, exit_code 1, empty stderr). **`success` for malformed JSON** — a garbled gate is indistinguishable from a healthy allow | TEST | appendix D.6 |
| 58 | Hook commands run through `/bin/sh` (the ENOENT message is `/bin/sh: <path>: No such file or directory`) | TEST | appendix D.6 |
| 59 | **No default hook timeout under ~400 s.** A PreToolUse hook with no `timeout` key slept 400 s; the run waited the whole time and then honoured its `deny` | TEST | appendix D.9 |
| 60 | Docs state the default hook timeout is 600 s (30 s on `UserPromptSubmit`/`PreModelSwitch`/`PostModelSwitch`, 10 s on `MessageDisplay`) — consistent with the 400 s measurement | WEB | https://code.claude.com/docs/en/hooks |
| 61 | A configured `"timeout": 2` is honoured: the hook is cancelled at ~2 s and the tool proceeds | TEST | appendix D.8 |
| 62 | **Hook matchers are tool-name regexes only.** `"*"` matches every tool including MCP tools. The permission-rule grammar (`Bash(git push:*)`) is not understood by a matcher | TEST | appendix D.10, F.2 |
| 63 | Hooks **merge** across sources: with `--setting-sources project` + `--settings <json>`, both the project hook and the session hook fire on the same call | TEST | appendix F.1 |
| 64 | Docs confirm the merge rule: "Hook entries merge across settings levels rather than replacing each other" | WEB | https://code.claude.com/docs/en/hooks |
| 65 | Hook config file locations (docs): `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json`, managed policy, plugin `hooks/hooks.json`, skill frontmatter, subagent frontmatter | WEB | https://code.claude.com/docs/en/hooks |
| 66 | **A typo in the hook config silently disables the gate.** `hooks` as an object instead of an array, a mis-cased event name (`PreToolUSE`), or `"type":"cmd"` all produce an ungated session with exit 0 and no message | TEST | appendix D.11 |
| 67 | `permissions.deny` with a scoped rule (`Bash(git push:*)`) blocks at runtime, but the message is **fixed**: `Permission to use Bash with command <cmd> has been denied.` There is no reason field | TEST | appendix F.2 |
| 68 | `permissions.deny` naming a **bare MCP tool** removes the tool entirely — it never appears in `tools`, and `ToolSearch` answers `No matching deferred tools found`. It is invisibility, not denial | TEST | appendix F.3 |
| 69 | Docs confirm the bare-name semantics for `--disallowedTools`: "A bare tool name removes the matching tools from Claude's context… A scoped rule such as `Bash(rm *)` leaves the tool available and denies only matching calls" | WEB | https://code.claude.com/docs/en/cli-reference |
| 70 | **`permissions.deny` is defeated by a nested shell.** `sh -c 'git push origin main'` walked straight through a `Bash(git push:*)` deny rule and reached git | TEST | appendix F.4 |
| 71 | `--permission-prompt-tool mcp__<srv>__<tool>` works headlessly: the MCP tool is called with `{tool_name, input, tool_use_id}` plus `_meta["claudecode/toolUseId"]`, returns `{"behavior":"deny","message":"…"}` or `{"behavior":"allow","updatedInput":{…}}`, and the deny message reaches the model **verbatim** | TEST | appendix H.1 |
| 72 | **The permission prompt tool has no short timeout: it held the run open for 408 s and then its `allow` executed the original call.** A synchronous human-in-the-loop approval inside one process is therefore possible for at least ~7 minutes | TEST | appendix H.2 |
| 73 | Not every tool call reaches the permission prompt tool — already-allowed calls (e.g. `echo SECOND`, and `Read`) bypass it | TEST | appendix H.1 |
| 74 | Permission modes accepted by `--permission-mode`: `acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk`, `plan` (per `--help`); docs add `default` as the name `manual` aliases | TEST+WEB | `claude --help`; https://code.claude.com/docs/en/cli-reference |
| 75 | This machine's `~/.claude/settings.json` sets `permissions.defaultMode: "auto"`, so an unspecified mode is **not** `default` here | TEST | appendix F.5 |

### Deferral (`permissionDecision: "defer"`)

| # | Claim | Kind | Reference |
|---|---|---|---|
| 76 | `defer` stops the run cleanly with `stop_reason` and `terminal_reason` = `"tool_deferred"`, `is_error:false`, `subtype:"success"`, `result:""`, and `deferred_tool_use: {id, name, input}` | TEST | appendix E.2 |
| 77 | `claude -p --resume <uuid>` with **no prompt** re-runs the gate on the stored call and executes it if now allowed. **No model decision is involved** | TEST | appendix E.4 |
| 78 | Resuming while still denied re-defers cleanly, no model call, a fresh `tool_deferred` result. Idempotent and safe to poll | TEST | appendix E.3 |
| 79 | Resuming **with a prompt** while still denied: result #1 re-defers the original call, then the new user turn runs and can defer again with a **different** `deferred_tool_use.id` — two `tool_deferred` result frames in one stream | TEST | appendix E.5 |
| 80 | Resuming **with a prompt** after the gate clears: the deferred call executes first (result #1, `end_turn`), then the new user turn runs (result #2). Two `system/init` frames | TEST | appendix E.5 |
| 81 | **Permission-mode mismatch on resume silently kills the deferred call.** Deferred under `bypassPermissions`, resumed under `acceptEdits` → `system/permission_denied` "This command requires approval", tool never runs, exit 0, ordinary-looking completion text | TEST | appendix E.12 |
| 82 | The binary carries `Deferred tool resume: permissionMode mismatch (deferred under '…')`, ` returned permissionDecision=defer in interactive mode; ignoring (defer is print-mode only)`, and ` returned permissionDecision=defer for a served call; refusing (no resume machinery)` | TEST (binary strings) | appendix G.5 |
| 83 | The `permissionDecisionReason` on a `defer` is **not** shown to the model (no tool_result is produced). Defer talks to the harness; deny talks to the model | TEST | appendix E.2 |
| 84 | A base run that simply fails to call the tool is **shape-identical** to a normal run — `stop_reason: end_turn`, `deferred_tool_use: null`, zero hook invocations. Always branch on `stop_reason`, never assume a defer happened | TEST | appendix E.13 |

### Tool vocabulary

| # | Claim | Kind | Reference |
|---|---|---|---|
| 85 | Measured `tools` array in a scrubbed-env, `--setting-sources ""` run (30 names): `Task`, `Bash`, `CronCreate`, `CronDelete`, `CronList`, `DesignSync`, `Edit`, `EnterWorktree`, `ExitWorktree`, `ListAgents`, `Monitor`, `NotebookEdit`, `PushNotification`, `Read`, `RemoteTrigger`, `ReportFindings`, `ScheduleWakeup`, `SendMessage`, `Skill`, `TaskCreate`, `TaskGet`, `TaskList`, `TaskOutput`, `TaskStop`, `TaskUpdate`, `ToolSearch`, `WebFetch`, `WebSearch`, `Workflow`, `Write` | TEST | appendix C.1 |
| 86 | Shell = **`Bash`**; file write = **`Write`**; file edit = **`Edit`**; file read = **`Read`**. Notebook edit = `NotebookEdit`. `Glob` and `Grep` do **not** appear in this build's `tools` array (the embedded docs still name them as "common tool matchers") | TEST | appendix C.1 |
| 87 | MCP tool names are `mcp__<server>__<tool>`; non-identifier characters in a server name are normalised to `_` (`claude.ai Atlassian Rovo` → `mcp__claude_ai_Atlassian_Rovo__…`) | TEST | appendix I.1, I.3 |
| 88 | Docs: plugin-bundled MCP servers are `mcp__plugin_<plugin>_<server>__<tool>` | WEB | https://code.claude.com/docs/en/mcp |
| 89 | **MCP tools are deferred behind `ToolSearch` in this build**: they are listed in the init `tools` array, but the model must call `ToolSearch` with `select:<name>` before it can call them. The gate sees a `ToolSearch` PreToolUse first | TEST | appendix I.1 |
| 90 | The Bash tool has a built-in `rm` containment: `rm` outside the session's working directories is refused with "For security, Claude Code may only remove files from the allowed working directories for this session" — independent of hooks and permissions | TEST | appendix D.7 |
| 91 | The Bash tool refuses a long leading `sleep` ("blocks long leading `sleep` commands as a safety measure") | TEST | appendix B.5 |
| 92 | `--tools "Bash,Read"` restricts **built-in** tools only. `--tools ""` leaves the built-ins empty but MCP tools remain | TEST | appendix I.4 |

### MCP

| # | Claim | Kind | Reference |
|---|---|---|---|
| 93 | `--mcp-config` accepts a file path or an inline JSON string; format is `{"mcpServers":{"<name>":{…}}}` | TEST | appendix I.1, I.5 |
| 94 | Transports (docs): `http` / `streamable-http`, `sse` (deprecated), `ws`, `stdio` (default when `type` is absent). Binary strings contain `stdio`, `http`, `sse`, `websocket`, `sse-ide`, `ws-ide` | WEB+TEST | https://code.claude.com/docs/en/mcp; appendix G.6 |
| 95 | Scopes (docs): local → `~/.claude.json` under `projects[<path>].mcpServers`; project → `.mcp.json` at repo root; user → `~/.claude.json` user-level | WEB | https://code.claude.com/docs/en/mcp |
| 96 | `.mcp.json` at the repo root loads under `--setting-sources project` (and by default) and does **not** load under `--setting-sources ""` | TEST | appendix I.2 |
| 97 | A stdio server that exits immediately shows `{"name":"bad","status":"failed"}` in init, **no stderr, no `mcp_server_errors`, run continues** — fail-open | TEST | appendix I.5 |
| 98 | A config entry that fails validation (e.g. `url` with no `type`) is skipped and reported in `mcp_server_errors` with `{name, type:"url_missing_type", message}` | TEST | appendix I.5 |
| 99 | Resuming a session **without** re-supplying `--mcp-config` removes the tools; the model is told the server "disconnected" | TEST | appendix I.6 |
| 100 | Docs: with `-p`, `--mcp-config` waits for pending servers up to `MCP_TIMEOUT` (30 s default) before the first turn | WEB | https://code.claude.com/docs/en/headless |

### Isolation — what leaks

| # | Claim | Kind | Reference |
|---|---|---|---|
| 101 | **`--setting-sources ""` does NOT stop the user's claude.ai account connectors from loading.** A run with `--setting-sources ""` still connected `claude.ai Atlassian Rovo` and listed `claude.ai Figma / Galaxus Shop / Gmail / Google Drive / Google Calendar` | TEST | appendix I.3 — **not recorded in either prior note** |
| 102 | **`--tools ""` does not remove them either**: with `--tools ""` the model still had 27 `mcp__claude_ai_Atlassian_Rovo__*` tools reaching the user's real Jira/Confluence | TEST | appendix I.4 |
| 103 | `--strict-mcp-config` **does** remove them (`mcp_servers: []`) | TEST | appendix I.3 |
| 104 | `{"disableClaudeAiConnectors":true}` in `--settings` also removes them | TEST | appendix I.7 |
| 105 | `ENABLE_CLAUDEAI_MCP_SERVERS=false` in the environment also removes them | TEST | appendix I.7 |
| 106 | Docs confirm connectors are auto-available only under a claude.ai login, and name both switches | WEB | https://code.claude.com/docs/en/mcp |
| 107 | `--setting-sources user` additionally loads local-scope MCP servers from `~/.claude.json` (observed `vibe-annotations`, status `failed`) | TEST | appendix I.3 |
| 108 | Default (no `--setting-sources`) loads the project's `.claude/settings.json` — a repository can inject hooks into a `-p` run with no trust prompt | TEST | appendix F.1 |
| 109 | Docs say so plainly: "Without `--bare`, a `-p` session runs the hooks in a project's `.claude/settings.json` and connects the servers in its `.mcp.json`, even in a folder you've never trusted. A `-p` session shows no workspace trust dialog" | WEB | https://code.claude.com/docs/en/headless |
| 110 | `CLAUDE_CONFIG_DIR=<dir>` isolates config but **destroys inherited auth**: `Not logged in · Please run /login` | TEST | appendix J.1 |
| 111 | `--bare` likewise gives `Not logged in` — it never reads OAuth or the keychain; it needs `ANTHROPIC_API_KEY` or an `apiKeyHelper` | TEST+WEB | appendix J.1; `claude --help`; https://code.claude.com/docs/en/headless |
| 112 | With inherited auth, every run writes `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl` and creates the project dir plus a `memory/` subdir. `memory_paths.auto` in the init frame points into `~/.claude` even with `--setting-sources ""` | TEST | appendix C.1, E.1 |
| 113 | Bundled skills still load with `--setting-sources ""` (16 of them: `deep-research`, `dataviz`, `code-review`, `run`, …) — these are shipped with the binary, not settings-sourced | TEST | appendix C.1 |
| 114 | The parent environment leaks: running unscrubbed from inside a Claude Code session added an `Artifact` tool and an `effort` field in the hook payload | TEST | §Method note, appendix D.1 |

### Limits & stalls

| # | Claim | Kind | Reference |
|---|---|---|---|
| 115 | A PreToolUse hook can hold the run for at least 400 s (no default timeout hit) | TEST | appendix D.9 |
| 116 | A `--permission-prompt-tool` MCP call can hold the run for at least 408 s | TEST | appendix H.2 |
| 117 | Two concurrent `--resume` processes on one session both succeed; no lock, no error, one branch lost | TEST | appendix E.9 |
| 118 | Docs: piped stdin is capped at 10 MB; background bash tasks are killed ~5 s after the final result; background subagents are waited on up to a 10-minute idle ceiling (`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`) | WEB | https://code.claude.com/docs/en/headless |
| 119 | A `rate_limit_event` frame is emitted early in the stream with `five_hour` / `seven_day` utilization and `resetsAt` | TEST | appendix C.1 |

---

## 2. Identity

`claude --version` → `2.1.247 (Claude Code)`. `claude doctor` (which reads settings in the current directory without a trust prompt) reports:

```
Running: package-manager (2.1.247)
Commit: 89c726188daf
Platform: darwin-arm64
Package manager: homebrew
Path: /opt/homebrew/Caskroom/claude-code@latest/2.1.247/claude
Config install method: unknown
Search: OK (bundled)
Auto-updates: Managed by package manager
Auto-update channel: latest
```

The binary is a single 233 MB bun-compiled Mach-O; its embedded JS bundle is greppable with `strings -a`, which is how several claims below were sourced. Version is also reported in-band: the init frame carries `claude_code_version`, and every transcript record carries `version`.

Release channels: `claude-code` (stable, ~1 week behind, skips regressions) and `claude-code@latest` (every release). This machine is on `@latest` and **does not auto-update** — new versions arrive only on `brew upgrade`. Native installs (`curl https://claude.ai/install.sh | bash`) do auto-update in the background.

Canonical docs: `https://code.claude.com/docs/en/<page>`. The old `docs.claude.com/en/docs/claude-code/<page>` URLs 301 to it. A machine-readable index lives at `https://code.claude.com/docs/llms.txt`.

Release cadence is fast and unannounced — 2.1.243, .245, .246, .247, .248, .250 all exist in the changelog window I checked. Treat any behaviour here as version-pinned to 2.1.247.

---

## 3. Invocation

### The headless shape that works

```bash
claude -p "<prompt>" \
  --session-id <uuid> \
  --settings <file-or-inline-json> \
  --setting-sources "" \
  --strict-mcp-config --mcp-config <file-or-inline-json> \
  --model haiku \
  --output-format stream-json --verbose \
  --permission-mode bypassPermissions \
  < /dev/null
```

Every element earns its place:

- `--setting-sources ""` stops the sandbox repo's `.claude/settings.json` and the user's settings from adding hooks or permission rules you did not choose. It does **not** stop claude.ai connectors (claim 101).
- `--strict-mcp-config` is the only flag that does (claims 103, 102).
- `< /dev/null` avoids a 3-second stdin wait. `--help` documents it, and the docs note that an unreadable stdin now prints a warning and continues.
- `--verbose` is required for the full `stream-json` stream.

### Output formats

- `text` — just the final answer on stdout.
- `json` — one object, the same shape as the final `result` frame. **Use this when you only want the outcome**: it cannot suffer the two-result-frames trap.
- `stream-json` — newline-delimited JSON, one object per line.

`--input-format stream-json` accepts newline-delimited user messages on stdin:

```
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Reply with exactly: STREAMIN"}]}}
```
and produced `[result] 'STREAMIN' stop=end_turn`.

### Model selection

`--model haiku|sonnet|opus|fable` or a full name. An unknown model exits 1 with a message on **stdout** plus a context-window warning on stderr. `--fallback-model a,b` is print-mode only.

### Permission modes

`--permission-mode` accepts `acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk`, `plan` in this build (`--help`). Docs add `default`, which `manual` aliases. **Important on this machine**: `~/.claude/settings.json` sets `permissions.defaultMode: "auto"`, so a run that omits the flag and does not pass `--setting-sources ""` starts in `auto`, not `default`. Always pass the mode explicitly.

### Settings sources

`--setting-sources` takes a comma-separated subset of `user,project,local`; `""` disables all three. `--settings` is an **overlay that merges**, not a replacement — hooks from both the enabled sources and the overlay fire on the same call (claim 63). `--settings` accepts a path or an inline JSON string, so a whole gate can live in argv with zero files in the sandbox.

### Working directory

`cwd` decides which project folder the transcript is filed under and which `.claude/settings.json` / `.mcp.json` are candidates. It does **not** bind `--resume` (claim 35). `--add-dir` grants file access to extra directories but, per docs, does not discover `.claude/` configuration from them.

### Exit codes, measured

| Situation | Exit | Where the message goes |
|---|---|---|
| success | 0 | — |
| unknown flag | 1 | stderr `error: unknown option '…'` |
| unknown model | 1 | stdout (message) + stderr (warning) |
| bogus `--resume` uuid | 1 | stderr `No conversation found with session ID: …` |
| non-uuid `--session-id` | 1 | stderr `Error: Invalid session ID. Must be a valid UUID.` |
| `--settings` file missing / unparseable string | 1 | stderr `Error: Settings file not found: …` |
| `--settings` parses but fails schema | **0** | **nowhere — silent** |
| `--max-budget-usd` exceeded | 1 | stdout `Error: Exceeded USD budget (…)` |
| `--max-turns` exceeded | 1 | result frame `subtype:"error_max_turns"` |
| `-p --resume <id>` with no prompt, non-deferred | 1 | stderr `Error: No deferred tool marker found…` |
| SIGTERM | 143 | — |
| SIGINT | 0 | ends the turn |

There is no distinct exit code for "the model refused". A refusal is an ordinary `end_turn` success with the refusal in `result`. Detect a blocked call from `permission_denials` in the result frame, not from the exit code.

---

## 4. Output protocol

### Frame types observed live

| `type` | `subtype` | Notes |
|---|---|---|
| `system` | `init` | session metadata; normally first, but **not on a deferred resume** |
| `system` | `thinking_tokens` | incremental estimate, many per turn |
| `system` | `post_turn_summary` | `status_category`, `status_detail`, `needs_action` |
| `system` | `permission_denied` | carries `message` — emitted for `ask` and for a permission-system block |
| `system` | `vcs_state_changed` | emitted when the working tree changed |
| `system` | `hook_started` / `hook_response` | only with `--include-hook-events` |
| `rate_limit_event` | — | top-level type, `five_hour` / `seven_day` utilization |
| `assistant` | — | `message.content[]` with `thinking`, `text`, `tool_use`; `message.usage`; `parent_tool_use_id` |
| `user` | — | `message.content[]` with `tool_result` (`is_error`, `content`) |
| `result` | `success` \| `error_max_turns` \| … | the final frame — but see claim 28 |

The bundle also carries `api_retry`, `compact_boundary`, `plugin_install`, `elicitation`, `mcp_status`, `memory_recall`, `background_tasks`, and ~40 more `system` subtypes (appendix G.7). Treat unknown subtypes as ignorable.

### Where the session id is

`init.session_id`; every `assistant`, `user`, `system` and `result` frame's `session_id`; the hook stdin payload's `session_id`; the transcript filename; every transcript record's `sessionId`. It is also *settable* — see §5.

### Where token usage is

Per assistant message: `message.usage` with `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`, `cache_creation.{ephemeral_5m,ephemeral_1h}_input_tokens`, `service_tier`.

In the result frame: `usage` (same fields plus `output_tokens_details.thinking_tokens`, `server_tool_use`, and an `iterations[]` array) and `modelUsage` keyed by model id with `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `costUSD`, `contextWindow`, `maxOutputTokens`, `canonicalModel`, `provider`, `costBasis`. `total_cost_usd` sits at the top level. Docs note these are client-side estimates.

### The three traps

1. **`result: ""` on a deferred stop.** `stop_reason == "tool_deferred"` always pairs with an empty `result`; the payload is `deferred_tool_use`. Branch on `stop_reason` before you read `result`.
2. **Two `result` frames.** A resume that auto-resumes a deferred call *and* carries a new prompt emits `system/init`, result #1 (the deferred call), `system/init` again, result #2 (the new turn). Take the **last** result frame, or use `--output-format json`.
3. **`terminal_reason` can be `null`** on a deferred re-defer, and `num_turns` on that frame was 12 for a one-turn resume. Only `stop_reason` was reliable across all my deferred runs.

### `permission_denials`

The result frame's `permission_denials` array is the clean machine-readable record of what the gate stopped:

```json
[{"tool_name":"Bash",
  "tool_use_id":"toolu_01HLDKhuzQv1pBLLMVcdEkwM",
  "tool_input":{"command":"git push","description":"Push to remote repository"}}]
```

It was populated for a hook `deny`, for a `permissions.deny` rule, and for a `--permission-prompt-tool` deny. It was **empty** for a `defer` (nothing was denied) and for a hook that failed open.

---

## 5. Session model

### Identity

A session is a UUID. The caller may assign it: `--session-id <uuid>` on the first run is honoured end to end (init frame, hook payload, transcript filename). This is the cleanest handle of any of the four harnesses — no id needs scraping off the stream. A non-UUID value exits 1.

### On disk

```
~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl
~/.claude/projects/<encoded-cwd>/memory/
```

`<encoded-cwd>` is the absolute path with `/` and `.` replaced by `-`. Note macOS `/tmp` resolves to `/private/tmp` in the encoding.

The transcript is newline-delimited JSON. Record types seen: `user`, `assistant`, `attachment`, `queue-operation`, `last-prompt`, `ai-title`, `atis-latch`, `mode`. Messages form a DAG through `parentUuid`. `last-prompt` records carry `{lastPrompt, leafUuid, sessionId}` — **`leafUuid` is how a resume chooses which branch to continue**.

`user` records carry `permissionMode`, `promptSource` (`"sdk"` for `-p`), `entrypoint` (`"sdk-cli"`), `cwd`, `gitBranch`, `version`, `promptId`.

### `--resume`

- Works from **any** directory. The transcript stays in the original project folder; the resumed turn records the new `cwd`. An empty project directory (with only `memory/`) is created for the new cwd.
- A bogus id fails **loudly**: exit 1, `No conversation found with session ID: <uuid>`, empty stdout.
- With **no prompt**, `-p --resume <id>` is not "empty prompt" — it is the *deferred-tool-resume verb*. On a non-deferred session it exits 1 with `Error: No deferred tool marker found in the resumed session. Either the session was not deferred, the marker is stale (tool already ran), or it exceeds the tail-scan window. Provide a prompt to continue the conversation.`
- `--fork-session` gives a new id with the prior context.
- **Permission mode is part of the contract on a deferred resume.** Resuming under a different mode than the one that deferred silently drops the call (claim 81).
- The MCP config is *not* remembered. Re-supply `--mcp-config` on every resume or the tools disappear.

### `--continue`

Per-directory, and it fails **silently** when there is nothing to continue: in a directory with no sessions it started a brand new session, exit 0, no message. `-p --continue` with no prompt is the same deferred-resume verb as `-p --resume`.

### Concurrency

Two `--resume` processes against the same session at the same time both returned successfully (`ALPHA` and `BRAVO`). Both turns were appended to the same transcript. A third resume saw only `BRAVO` — the later-written `last-prompt.leafUuid` won and the other branch was orphaned. **No lock, no error, silent data loss.** Serialise resumes yourself.

### Lifetime

Unmeasured. Every resume here happened within minutes. Whether transcripts are pruned or compacted after days is an open question (§10).

---

## 6. Permission and interception — every mechanism

Four independent mechanisms exist. They compose; they are checked in different places.

### 6.1 PreToolUse hook (command)

Config:

```json
{"hooks":{"PreToolUse":[{"matcher":"Bash",
  "hooks":[{"type":"command","command":"/abs/path/gate.sh","timeout":60,"statusMessage":"Checking…"}]}]}}
```

Delivered by `--settings <file>` or `--settings '<inline json>'`, or from any settings source. Hook types beyond `command` (per the embedded docs): `"prompt"` (an LLM evaluates a condition) and `"agent"` (runs an agent), both only on `PreToolUse`, `PostToolUse`, `PermissionRequest`. Not exercised here.

**stdin** (real capture, scrubbed env):

```json
{
 "session_id": "5325e5cf-fd27-4636-90be-95564f60d25b",
 "transcript_path": "/Users/tg/.claude/projects/-private-tmp-ccdeep-2SxKwI-s1/5325e5cf-….jsonl",
 "cwd": "/private/tmp/ccdeep.2SxKwI/s1",
 "prompt_id": "c74829fb-6345-404f-8c54-9a12983bdb78",
 "permission_mode": "bypassPermissions",
 "hook_event_name": "PreToolUse",
 "tool_name": "Bash",
 "tool_input": {"command": "git push", "description": "Push to remote repository"},
 "tool_use_id": "toolu_01HLDKhuzQv1pBLLMVcdEkwM"
}
```

`tool_use_id` correlates a decision with the exact call, and matches the `tool_use_id` in `permission_denials`.

**stdout** — a JSON object on exit 0:

```json
{"hookSpecificOutput":{
   "hookEventName":"PreToolUse",
   "permissionDecision":"allow"|"deny"|"ask"|"defer",
   "permissionDecisionReason":"…",
   "updatedInput":{…},
   "additionalContext":"…"},
 "systemMessage":"…",
 "continue":false,
 "stopReason":"…",
 "suppressOutput":false}
```

What each `permissionDecision` did, measured:

| Value | Behaviour |
|---|---|
| `allow` | tool runs. `updatedInput` rewrites the input first; `additionalContext` is injected into the model's context. |
| `deny` | tool is blocked. The model's `tool_result` content is **exactly** `permissionDecisionReason`, `is_error: true`. Fires under `bypassPermissions`. Appears in `permission_denials`. |
| `ask` | headless: same as deny. Emits `system/permission_denied {message: <reason>}`; the tool_result is the reason string. |
| `defer` | print-mode only. Run stops, `stop_reason: "tool_deferred"`, the pending call is handed back in `deferred_tool_use`. The reason is **not** shown to the model. See §7. |

**Does the reason reach the model?** With `deny` and `ask`: yes, verbatim, and nothing else — no tool name, no hook path, no "hook" wording. With exit 2 + stderr: yes but wrapped as `PreToolUse:Bash hook error: [/tmp/…/hook3.sh]: <stderr>`, and the model then talks about "a pre-tool hook", not about your policy. With `defer`: no.

**Fail-open, comprehensively.** Every failure mode I could construct let the tool run:

| Failure | Ran? | `hook_response.outcome` | exit_code |
|---|---|---|---|
| hook exits 1 with stderr | **yes** | `error` | 1 |
| hook executable missing | **yes** | `error` | 127 |
| hook prints malformed JSON, exit 0 | **yes** | **`success`** | 0 |
| hook exceeds configured `timeout` | **yes** | `cancelled` | 1 |
| config schema typo (see below) | **yes** | *hook never registered* | — |

None of these produced any output on the parent's stderr, and none produced any stream event **without** `--include-hook-events`. Docs confirm the intent: "don't count on a stalled hook to act as a gate."

The only case a caller can *not* detect even with `--include-hook-events` is malformed JSON — `outcome: "success"`, `exit_code: 0`, indistinguishable from a healthy allow. If you care, have the hook always emit a decision and have the caller assert that a `hook_response` with non-empty `stdout` parsed.

**Config typos are silent.** All three of these produced an ungated session, exit 0, no warning anywhere:

- inner `hooks` as an object instead of an array
- event name mis-cased (`PreToolUSE`)
- `"type": "cmd"` instead of `"command"`

`--help` states it: "Settings files that fail validation are silently ignored in this mode (no error dialog is shown)." A missing *file* is loud (exit 1); a bad *shape* is silent. **A gate must be proven live on every run, not assumed.**

**Matchers are tool names.** `"Bash"` matched every Bash call. `"*"` matched everything including `ToolSearch` and `mcp__probe__*`. `Bash(git push:*)` matched nothing — the permission-rule grammar is not understood by a hook matcher, it is a regex against the tool name. Discriminate on `tool_input.command` inside the hook; that is strictly more capable because the hook sees the raw string including `&&` chains and `sh -c '…'`.

**Timeout.** A hook with no `timeout` key slept 400 s and its `deny` was still honoured — no default cut it off. Docs say the default is 600 s. A configured `"timeout": 2` was enforced (`outcome: "cancelled"`) and failed open.

**Merging.** Hooks from every enabled source plus `--settings` all fire. There is no "replace" semantics. To be sure only your hook runs, pass `--setting-sources ""`.

**Hooks run through `/bin/sh`** (the ENOENT message proves it), and receive the `env` block from settings — `{"env":{"LOGDIR":"…"}}` was visible to the hook script.

### 6.2 Which hook events actually fire

Measured by registering the same logging hook on all 31 event names with matcher `"*"` and running one Bash call in print mode:

```
SessionStart 1
UserPromptSubmit 1
PreToolUse 1
PostToolUse 1
PostToolBatch 1
MessageDisplay 1
Stop 1
SessionEnd 1
```

`PermissionRequest` did not fire in `bypassPermissions`, `default`, or `manual` mode. `PostToolUse` did not fire when the tool was blocked; `PostToolBatch` still did, with the block message in `tool_calls[].tool_response`.

Payload shapes captured (trimmed):

```
SessionStart   {session_id, cwd, hook_event_name, source:"startup"}
UserPromptSubmit {session_id, cwd, prompt_id, permission_mode, hook_event_name, prompt}
PostToolBatch  {session_id, cwd, prompt_id, permission_mode, hook_event_name,
                tool_calls:[{tool_name, tool_input, tool_use_id, tool_response}]}
MessageDisplay {session_id, cwd, prompt_id, hook_event_name, turn_id, message_id, index, final, delta}
Stop           {session_id, cwd, prompt_id, permission_mode, hook_event_name,
                stop_hook_active:false, last_assistant_message}
SessionEnd     {session_id, cwd, prompt_id, hook_event_name, reason:"other"}
```

The bundle also documents `{"hookSpecificOutput":{"hookEventName":"PermissionDenied","retry":true}}` — "Return … to tell the model it may retry." Not exercised.

### 6.3 `permissions.deny` / `--disallowedTools`

Rule grammar is `ToolName` or `ToolName(specifier)`.

A **scoped** rule blocks at runtime with a **fixed** message the caller cannot change:

```
tool_result is_error=True 'Permission to use Bash with command git push origin main has been denied.'
```

A **bare** tool name is different: it removes the tool from the model's context entirely. With `{"permissions":{"deny":["mcp__probe__deploy"]}}` the tool never appeared in the init `tools` array and `ToolSearch` answered `No matching deferred tools found`. That is invisibility, not denial — it may be what you want, but the model will not learn that a rule exists.

Both work under `bypassPermissions`. Neither can say *why*.

**Both are defeated by a nested shell.** `sh -c 'git push origin main'` passed straight through a `Bash(git push:*)` deny and reached git (which then failed for want of a remote — the gate did not stop it). A substring check inside a hook *would* have caught it, because the hook sees the raw string. Neither approach is a sandbox: this is a policy gate against a cooperative agent, and that should be said out loud in any plan built on it.

### 6.4 `--permission-prompt-tool` (undocumented in `--help`, present and working)

`--permission-prompt-tool mcp__<server>__<tool>` routes each permission decision to an MCP tool. Measured contract:

Call payload the server receives:

```json
{"name":"approve",
 "arguments":{"tool_name":"Bash",
              "input":{"command":"git push origin main","description":"Push main branch to origin"},
              "tool_use_id":"toolu_01Rc7rHi9QsTzsxPAXDKqs2x"},
 "_meta":{"claudecode/toolUseId":"toolu_01Rc7rHi9QsTzsxPAXDKqs2x","progressToken":2}}
```

Return, as a single text content block containing JSON:

```json
{"behavior":"deny","message":"ACME PERMTOOL: git push is not approved in this session."}
{"behavior":"allow","updatedInput":{…}}
```

The deny message reached the model **verbatim** (`tool_result is_error=True 'ACME PERMTOOL: git push is not approved in this session.'`) and the call appeared in `permission_denials`. The subsequent `echo SECOND` call was **not** routed to the permission tool — already-allowed calls bypass it, as does `Read`.

**This mechanism has no short timeout.** A permission tool that slept 400 s held the whole `claude -p` invocation open for **408 s** and then its `allow` executed the original call. That makes a synchronous human-in-the-loop approval possible *inside one process*, for at least ~7 minutes, without ending the session at all. Docs note the *startup* wait for the tool's server is `MCP_TIMEOUT` (30 s); the per-call wait is a different thing and was not hit.

Relative to hooks: the permission tool is a long-lived process holding real state, sees `tool_use_id`, can rewrite input, can say why, and can block for minutes. Its weaknesses are that it does not see every call and that it is only consulted by the permission system (so a `permissions.deny` rule or a hook deny short-circuits it).

### 6.5 Permission modes

`--permission-mode` values in this build: `acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk`, `plan`. `bypassPermissions` does **not** disable hooks — a PreToolUse deny still fired under it. It also does not disable the Bash tool's built-in `rm` containment.

---

## 7. Deferral, end to end

The mechanism the public docs do not mention. Verified fully.

**Gate returns:**

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"defer",
 "permissionDecisionReason":"ACME GATE-1: git push needs a human's approval; run paused."}}
```

**Base run result (`--output-format json`, usage trimmed):**

```json
{"stop_reason":"tool_deferred","terminal_reason":"tool_deferred",
 "is_error":false,"subtype":"success","num_turns":1,"result":"",
 "session_id":"00bc9342-1dec-4850-a3d6-0c877e5594d7",
 "deferred_tool_use":{"id":"toolu_01UZb7gHCsRuDthVTDmPGEj2","name":"Bash",
   "input":{"command":"git push -u origin main","description":"Push current branch to remote origin"}}}
```

`deferred_tool_use` gives the harness everything needed to render an approval request to a human without parsing the transcript.

**Resume with the gate cleared and no prompt:**

```bash
claude -p --resume $SID --settings $SET --setting-sources "" --model haiku \
  --output-format stream-json --verbose --permission-mode bypassPermissions < /dev/null
```

Real stream, in order:

```
[system] vcs_state_changed
[tool_result] is_error=False "To /tmp/…/remote2.git\n * [new branch]      main -> main\n…"
[system] init
[assistant:text] "I don't have any prior work to continue from…"
[result] stop=end_turn term=completed turns=1
remote now has main
```

Note the ordering: **the tool_result precedes `system/init`**. Compliance is not a model property here — Claude Code re-ran the gate on the stored call, the gate allowed it, and the call executed. The model was never asked to decide.

**Variants measured:**

| Resume shape | Gate state | Result |
|---|---|---|
| no prompt | still denying | re-defers cleanly, no model call, fresh `tool_deferred`, `terminal_reason: null`. Idempotent, safe to poll. |
| no prompt | cleared | original call executes (above). One result frame. |
| with a prompt | still denying | result #1 = re-defer of the original; then the new user turn runs and may defer again with a **different** `deferred_tool_use.id`. Two `tool_deferred` result frames. |
| with a prompt | cleared | original call executes (result #1, `end_turn`), then the new user turn runs (result #2). Two `system/init` frames. |
| any | resumed under a different `--permission-mode` | **silent kill**: `system/permission_denied "This command requires approval"`, tool never runs, exit 0, normal-looking completion text. |

The binary carries `Deferred tool resume: permissionMode mismatch (deferred under '…')`, so some mode pairs are refused outright rather than falling to the permission prompt.

**Two failure shapes to guard against:**

1. A base run where the model simply never called the tool is **shape-identical** to a run where nothing needed gating: `stop_reason: end_turn`, `deferred_tool_use: null`, and the hook was invoked zero times. I hit this twice with haiku on the same prompt that deferred elsewhere. Always branch on `stop_reason == "tool_deferred"`; never infer a defer from "the push did not land".
2. `defer` is refused outside print mode: ` returned permissionDecision=defer in interactive mode; ignoring (defer is print-mode only)` and ` returned permissionDecision=defer for a served call; refusing (no resume machinery)`.

---

## 8. Tool vocabulary, measured

Init frame `tools` array, scrubbed env, `--setting-sources ""`, no MCP:

```
Task, Bash, CronCreate, CronDelete, CronList, DesignSync, Edit, EnterWorktree,
ExitWorktree, ListAgents, Monitor, NotebookEdit, PushNotification, Read,
RemoteTrigger, ReportFindings, ScheduleWakeup, SendMessage, Skill, TaskCreate,
TaskGet, TaskList, TaskOutput, TaskStop, TaskUpdate, ToolSearch, WebFetch,
WebSearch, Workflow, Write
```

For a matcher: shell is `Bash`, file write is `Write`, file edit is `Edit`, file read is `Read`, notebook edit is `NotebookEdit`. **`Glob` and `Grep` are absent from this build's array** even though the embedded hook docs still list them as "common tool matchers" — do not write a matcher that depends on them without checking the init frame first.

Running unscrubbed from inside a Claude Code session added `Artifact`. The array is environment-sensitive; measure it, do not assume it.

MCP tools are `mcp__<server>__<tool>`, with non-identifier characters in the server name normalised to `_`. Both forms were observed live:

```
mcp__probe__ask_human
mcp__probe__deploy
mcp__claude_ai_Atlassian_Rovo__searchJiraIssuesUsingJql
```

**MCP tools are deferred behind `ToolSearch` in this build.** They appear in the init `tools` array, but the model's first move was `ToolSearch {"query":"select:mcp__probe__deploy"}` before it could call them. A gate on an MCP tool therefore sees a `ToolSearch` PreToolUse first — matcher `"*"` catches both; a matcher of only the MCP name still works for the real call. On a resumed session where the schema is already in context, no `ToolSearch` was needed.

Two built-in containments exist independently of hooks and permission rules:

- `rm` outside the session's working directories is refused: "For security, Claude Code may only remove files from the allowed working directories for this session: '…'".
- A long leading `sleep` in a Bash command is refused: "The Bash tool blocks long leading `sleep` commands as a safety measure to prevent unproductive waits."

`--tools "Bash,Read"` restricts the built-in set only; MCP tools survive `--tools ""`.

---

## 9. MCP

**Config format**, identical for `.mcp.json`, `--mcp-config <file>` and `--mcp-config '<inline json>'`:

```json
{"mcpServers":{
  "probe":{"command":"/opt/homebrew/opt/node@24/bin/node","args":["/path/srv.mjs"],"env":{"K":"v"}},
  "remote":{"type":"http","url":"https://…/mcp","headers":{"Authorization":"Bearer …"}}
}}
```

Transports (docs): `http` / `streamable-http`, `sse` (deprecated), `ws`, and `stdio` (the default when `type` is absent). Docs also list `headersHelper`, `timeout`, `oauth`, and `${VAR}` / `${VAR:-default}` expansion in `command`, `args`, `env`, `url`, `headers`.

**Scopes** (docs): local → `~/.claude.json` under `projects[<path>].mcpServers`; project → `.mcp.json` at the repo root; user → `~/.claude.json` user-level. `claude mcp add … --scope local|user|project` writes them. `claude mcp login|logout <name>` manages OAuth.

**When they load.** At startup. With `-p` and `--mcp-config`, docs say Claude Code waits for pending servers up to `MCP_TIMEOUT` (30 s default) before the first turn. `init.mcp_servers` reports `{name, status}` with statuses `connected`, `failed`, `needs-auth`, `pending`.

**Failure behaviour, measured.** A server whose command is `/bin/false`:

```
mcp_servers = [{"name":"bad","status":"failed"}]
mcp_server_errors = null
stderr = (empty)
```

The run continued and exited 0. Fail-open, invisible unless you read `init.mcp_servers`.

A config entry that fails *validation* is reported:

```
mcp_servers = []
mcp_server_errors = [{"name":"x","type":"url_missing_type",
  "message":"Skipped — MCP server \"x\" has a \"url\" but no \"type\"; add \"type\": \"http\" (or \"sse\" / \"ws\") to this entry"}]
```

Docs list `type` values `unknown_type`, `url_missing_type`, `invalid_config`, `reserved_name`. A CI gate should fail on a non-empty `mcp_server_errors` **and** on any `mcp_servers[].status != "connected"`.

**Resume does not remember the MCP config.** Re-supply `--mcp-config` on every resume. Without it, the tools are gone and the model is told the server "disconnected".

---

## 10. Isolation — exactly what leaks

**The big one.** `--setting-sources ""` is not isolation. Measured, in an otherwise empty sandbox:

| Flags | `init.mcp_servers` |
|---|---|
| `--setting-sources ""` | `claude.ai Figma (needs-auth)`, `claude.ai Galaxus Shop (needs-auth)`, **`claude.ai Atlassian Rovo (connected)`**, `claude.ai Gmail (needs-auth)`, `claude.ai Google Drive (needs-auth)`, `claude.ai Google Calendar (needs-auth)` |
| `--setting-sources user` | the above **plus** `vibe-annotations (failed)` from `~/.claude.json` |
| `--setting-sources project` | the above plus the sandbox's `.mcp.json` |
| `--setting-sources "" --strict-mcp-config` | `[]` |
| `--settings '{"disableClaudeAiConnectors":true}'` | `[]` |
| `ENABLE_CLAUDEAI_MCP_SERVERS=false` | `[]` |

And `--tools ""` does **not** remove them: with `--tools ""` the model's tool array was 27 `mcp__claude_ai_Atlassian_Rovo__*` entries reaching the user's real Jira and Confluence. A sandboxed HyperIdle run that forgets `--strict-mcp-config` hands the agent the founder's connected accounts. Neither prior note records this.

**What else comes from the host regardless of `--setting-sources`:**

- 16 bundled skills (`deep-research`, `dataviz`, `code-review`, `run`, `verify`, `debug`, `simplify`, `schedule`, `loop`, `claude-api`, …) and 48 slash commands. These ship with the binary.
- `memory_paths.auto` pointing at `~/.claude/projects/<encoded-cwd>/memory/`.
- The transcript and the project directory under `~/.claude/projects/`.
- `messaging_socket_path` (`/tmp/cc-socks/<pid>.sock`).

**What `--setting-sources ""` does stop:** hooks and permission rules from `~/.claude/settings.json`, `.claude/settings.json` and `.claude/settings.local.json`, and the project `.mcp.json`.

**Total isolation is not available while keeping inherited login.** `CLAUDE_CONFIG_DIR=<dir>` isolates the config home but produces `Not logged in · Please run /login`. `--bare` likewise: it "never reads OAuth credentials or the system keychain" and needs `ANTHROPIC_API_KEY` or an `apiKeyHelper` supplied through `--settings`. `--no-session-persistence` avoids the transcript write but makes the session unresumable, so it is incompatible with any resume-based design.

The honest boundary: with inherited auth, **no gate configuration of yours ever lands in `~/.claude`** (settings live in argv or a temp file; hooks live outside the sandbox), but session transcripts and project entries do.

**A repository can inject hooks into your `-p` run.** Default sources include the project's `.claude/settings.json`, and a `-p` run shows no trust dialog. Docs state it explicitly. Always pass `--setting-sources ""` (or `--bare`, or `--safe-mode`) when the working directory is untrusted.

---

## 11. Limits and stalls

- **Hook stall**: no default timeout hit at 400 s; docs say 600 s. A `timeout` key is honoured and fails open.
- **Permission-prompt-tool stall**: held the run 408 s and then completed normally. This is a *feature* for human-in-the-loop, and a hazard for an unattended runner. Cap it yourself.
- **Concurrent resume**: no lock; both succeed; one branch is silently orphaned.
- **`--continue` in a fresh directory**: silently starts a new session instead of failing.
- **MCP server crash**: `status: "failed"`, no stderr, run continues.
- **Malformed hook JSON**: undetectable, gate off.
- Docs: piped stdin capped at 10 MB; background bash tasks killed ~5 s after the final result; background subagents waited on with a 10-minute idle ceiling; the output-drain wait on exit is capped at 30 s.
- No hang was reproduced that did not have an explicit cause. The only unbounded waits I found are the two above, both caller-controlled.

---

## 12. The product question, tested end to end

> Can you block a specific tool call, tell the model why, let it do something else (call an MCP tool to ask a human), end the session, and later resume that same session with the human's answer so it retries the blocked action?

**Yes, and it worked on the first attempt.** Two shapes work; a third is better than both for the retry step.

### Shape A — deny + ask-human + resume with the verdict (measured, works)

Phase 1: `PreToolUse` hook with matcher `"*"` denies `mcp__probe__deploy` while a deny file is non-empty, with the reason text carrying the standing instruction. Real stream:

```
[tool_use]    ToolSearch {"query":"select:mcp__probe__deploy"}
[tool_use]    mcp__probe__deploy {"target":"production"}
[tool_result] is_error=True 'ACME policy PROD-1: deploying to production is not approved. A human must
               approve it. Use the ask_human tool to request approval, then stop and end your turn.'
[tool_use]    ToolSearch {"query":"select:mcp__probe__ask_human"}
[tool_use]    mcp__probe__ask_human {"question":"The production deployment requires human approval per
               ACME policy PROD-1. Do you approve deploying the current build to production?"}
[tool_result] 'SERVER_RAN tool=ask_human …'
[assistant]   "I've requested human approval… I'm stopping here pending your decision."
[result]      stop=end_turn turns=5
```

Phase 2, gate cleared, **resumed from a completely different working directory**:

```bash
claude -p "A human reviewed your request and approved it. The ACME PROD-1 restriction has been
cleared for this action. Retry the deployment now." \
  --resume $SID --mcp-config $MCP --strict-mcp-config --settings $SET --setting-sources "" \
  --model haiku --output-format stream-json --verbose --permission-mode bypassPermissions < /dev/null
```

```
[tool_use]    mcp__probe__deploy {"target":"production"}
[tool_result] 'SERVER_RAN tool=deploy args={"target":"production"}'
[assistant]   "Deployment complete."
[result]      stop=end_turn turns=2
```

No re-`ToolSearch` was needed — the schema survived in context. The deploy was the **first** action of the resumed turn.

**Where it works:** everything mechanical. Session id assignable, deny reason fully ours, MCP ask-human tool callable while blocked, clean end of turn, resume from anywhere, full context, immediate retry.

**Where it breaks:** the retry is a *model decision*. The model has to believe an in-band approval message. That is a compliance rate, not a guarantee, and it should be measured on the model you actually ship, not on haiku.

### Shape B — `permissionDecision: "defer"` (measured, no model decision)

Same block, but the gate returns `defer` instead of `deny`. The run stops with `stop_reason: "tool_deferred"` and hands back `deferred_tool_use{id,name,input}`, which is exactly the payload a human-approval UI needs. On `claude -p --resume <id>` with **no prompt**, Claude Code re-runs the gate on that stored call and executes it. There is no compliance rate because the model is never asked.

**Where it breaks:** (a) the model is never told *why* it stopped, so it cannot work around the block or explain it — pair `defer` with a `deny` on the first attempt if you want both; (b) the resume must use the **same** `--permission-mode` or the call dies silently at the permission system; (c) a base run that never called the tool looks identical to a normal run; (d) `defer` is print-mode only.

### Shape C — `--permission-prompt-tool` holding the call open (measured, one process, no resume)

Because a permission-prompt MCP call can block for at least 408 s without any timeout firing, an approval can be answered **inside the same invocation**: the tool receives `{tool_name, input, tool_use_id}`, parks it for a human, and returns `{"behavior":"allow"}` when the human answers. The original call then runs, the turn continues, and no session resumption is involved at all. That removes the resume-state, cwd-lifetime, and concurrency questions entirely — at the cost of holding a process for the duration and an unmeasured upper bound on how long it will wait.

### Recommendation for a builder

- Gate with a `PreToolUse` command hook, matcher `"*"`, discriminating on `tool_name` and `tool_input`. Use `deny` when the model should know a rule exists and keep working; use `defer` when the action must resume mechanically.
- Assign the session id with `--session-id`; never scrape it.
- Always pass `--setting-sources ""` **and** `--strict-mcp-config`.
- Always pass `--permission-mode` explicitly, and pass the **same** value on resume.
- Read the **last** `result` frame, or use `--output-format json`.
- Branch on `stop_reason` before reading `result`.
- Fail the run if `init.mcp_servers` contains anything not `connected`, or if `mcp_server_errors` is non-empty.
- Prove the gate is live on every run: `--include-hook-events` and assert a `hook_response` for the call you expect to gate. A silent config typo is otherwise indistinguishable from an allowed action.
- Add a `permissions.deny` rule as a second layer for actions that must not run even if the hook process dies — but know it says nothing about *why*, and that `sh -c '…'` walks through it.
- Serialise resumes on one session id.

---

## 13. Prior-claims audit

### `interception-claude-code.md`

**CONFIRMED**

| Claim | Note |
|---|---|
| Hook config shape works from a project file, `--settings <file>` and `--settings '<inline json>'` | confirmed for file and inline |
| Hook stdin payload fields incl. `tool_use_id` | confirmed; `effort` only appears when the parent exports `CLAUDE_EFFORT` |
| `deny` + `permissionDecisionReason` → tool_result is exactly and only the reason | confirmed verbatim |
| Deny fires under `bypassPermissions` | confirmed |
| exit 2 + stderr blocks, message wrapped as `PreToolUse:<Tool> hook error: [<cmd>]: <stderr>` | confirmed verbatim |
| Matcher is tool-name only; `Bash(git push:*)` matches nothing | confirmed |
| `permissions.deny` blocks with a **fixed** message, no reason field | confirmed verbatim |
| `--disallowedTools` same fixed message | confirmed by construction (same rule engine); the bare-name/scoped distinction is new here |
| `sh -c 'git push …'` defeats `permissions.deny` | confirmed |
| `permissionDecision: "defer"` exists, print-mode only, returns `deferred_tool_use{id,name,input}` | confirmed |
| Defer resume with no prompt re-runs the gate and executes the call, no model decision | confirmed |
| Resume while still denied re-defers, idempotent | confirmed |
| Defer's `permissionDecisionReason` is not shown to the model | confirmed |
| `result: ""` on `tool_deferred` | confirmed |
| A resumed run can emit more than one `result` frame | confirmed, with a sharper rule (see refuted below) |
| Workspace trust is not required in `-p` mode | confirmed, and now backed by the docs sentence about `-p` running project hooks in an untrusted folder |
| `--print` silently ignores invalid settings | confirmed and sharpened: a missing **file** exits 1 loudly; a bad **shape** is silent |
| Permission mode on resume can silently kill the auto-resumed call | confirmed exactly |
| `CLAUDE_CONFIG_DIR` isolates config and breaks login | confirmed |
| `--no-session-persistence` makes the session unresumable | confirmed |
| Sessions are global by UUID; resume from another cwd works | **confirmed** — and this is the claim that contradicts the other note |

**REFUTED / corrected**

| Claim | Correction |
|---|---|
| "`claude -p --resume <uuid>` with no prompt … on a non-deferred session … errors with `No deferred tool marker found`, **exit code 0**, nothing on stdout" | Exit code is **1**, not 0. |
| "Resume with a prompt (rejection path) → the deferred call is attempted, re-defers, and then the new user turn runs" — presented as producing `result=""` then a second result | Both halves are true only when the gate is still denying. With the gate **cleared**, resume-with-a-prompt **executes** the deferred call (result #1, `end_turn`) and then runs the new turn (result #2). I also hit two runs where the base never deferred at all, which produces one ordinary `end_turn` result and no re-defer — easy to mistake for "the deferred call was dropped". |
| `--setting-sources user` (or `""`) described as making runs "deterministic" and keeping a repository from adding things you did not choose | True for hooks and permission rules, **false for MCP**: the user's claude.ai connectors load regardless. Only `--strict-mcp-config` / `disableClaudeAiConnectors` / `ENABLE_CLAUDEAI_MCP_SERVERS=false` stop them. |
| "the wording is fully ours" for a deny (implied to be the only mechanism that can say why) | Still true for the hook, but `--permission-prompt-tool` can also deliver a fully custom reason verbatim, and it was not considered. |

**UNTESTED / not re-run here**

- The 5/5 deny-then-approve compliance measurement with sonnet (I ran the analogous flow once on haiku, and it complied — one run is not a rate).
- Hook types `"prompt"` and `"agent"`.
- `PermissionDenied` hook with `{"retry":true}`.
- `defer` in interactive mode and for a served call (binary strings only).

### `session-continuation.md` (claude-code rows only)

**CONFIRMED**

| Claim | Note |
|---|---|
| `claude -p <msg> --resume <uuid>` resumes headlessly, carries the message, full context | confirmed |
| `--session-id <uuid>` on the first run lets the caller name the session — "easier here than anywhere else" | confirmed |
| A bogus id fails loudly: exit 1, `No conversation found with session ID` | confirmed |
| `--fork-session` exists | confirmed and now tested: new id, context preserved |
| Resuming a session does not by itself make an agent re-fire a blocked action | confirmed in spirit — the model retried only when told to; nothing mechanical retried except an explicit `defer` |

**REFUTED — the important one**

> "**Bound to the directory.** `--resume` from a different cwd **fails loudly**: exit 1, `No conversation found with session ID: …`. Sessions are stored per project directory."
> and §5b's table row "claude-code | **hard failure**, exit 1".

**False on 2.1.247.** I resumed a session created in `/tmp/ccdeep.2SxKwI/s1` from `/tmp/ccdeep.2SxKwI/other`, exit 0, with the model correctly recounting the blocked `git push`. I did it again for the full MCP end-to-end (`e2e` → `e2e_other`) and the deploy fired as the first action of the resumed turn. The docs explain why: since **v2.1.223** the `--resume` ID search covers "the current project directory and its git worktrees, then every other project on this machine". Both notes claim to test 2.1.247, so they cannot both be right; my runs are reproducible from appendix E.6 and E.2/phase 2.

**Consequence:** §5b's design conclusion — "the session sandbox must still exist, at the same path, when the human answers" — is **not** a claude-code constraint in this version. The transcript is keyed by the *original* project directory, so that directory's `~/.claude/projects/` entry must survive, but the sandbox itself need not be the cwd of the resuming process. (Whether the *sandbox contents* must survive is a separate question and depends on what the retried tool touches.)

**UNTESTED / not re-run here**

- The 4/4 compliance figure (I ran one).
- How long a session stays resumable.
- Whether the block→approve→retry loop survives a second round trip.
- Cost of a resume on a long session.

---

## 14. Unverified / open questions

1. **Session lifetime.** Nothing here resumed a session older than ~20 minutes. Whether transcripts are pruned, compacted, or expire after days is unknown, and a human answering the next morning is the normal case for BA2.
2. **The "tail-scan window" for the deferred marker.** The error text names it (`or it exceeds the tail-scan window`), but I did not measure how many records or how much time can pass before a deferred marker goes stale.
3. **Which `--permission-mode` pairs the deferred resume refuses outright** (the `permissionMode mismatch` string) versus which fall through to a permission denial as I observed for `bypassPermissions → acceptEdits`.
4. **Upper bound on the permission-prompt-tool wait.** Measured 408 s. `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` and `MCP_TOOL_TIMEOUT` exist in the binary; their defaults were not determined, and my parent env happened to set `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=2000000` — the wrapper unset it, but I did not prove there is no default at, say, 600 s.
5. **The exact default hook timeout.** Measured "at least 400 s"; docs say 600 s. Not pinned.
6. **`PermissionRequest` hook.** Never fired in any mode I tried, headless. Its trigger condition is unknown.
7. **Hook types `"prompt"` and `"agent"`.** Documented inside the binary, never exercised.
8. **`PermissionDenied` hook + `{"retry":true}`.** Would let a gate tell the model "you may retry" out of band. Untested and directly relevant to BA2.
9. **`continue: false` / `stopReason`** on a PreToolUse hook — the "stop the whole run" lever. Untested.
10. **Compliance rates.** Everything model-behavioural here is n=1 or n=2 on haiku. No rate is claimed.
11. **`--replay-user-messages`, `--forward-subagent-text`, `--include-partial-messages`.** Not exercised.
12. **Whether a hook can see or gate subagent (`Task`) tool calls** and how `parent_tool_use_id` interacts with a matcher.
13. **Managed-policy settings.** Not present on this machine; their precedence over `--settings` is docs-only.
14. **Whether `--strict-mcp-config` also suppresses an *organisation*-managed MCP file** (docs mention `managed-mcp.json`); untested.
15. **`claude mcp` writes to `~/.claude.json`** — I never ran it, to avoid mutating the user's config. The scope/location claims for it are docs-only.

---

## 15. Raw appendix

Working directory for every experiment: `D=/tmp/ccdeep.2SxKwI` (throwaway, `mktemp -d`), sandboxes `$D/w1 s1 s2 s3 s4 s5 s6 s8 s9 e2e e2e_other other emptydir`, each `git init`-ed where a git command was needed. `/Users/tg/.claude` was read but never written by me; the binary itself wrote transcripts there.

### A. The scrubbed-env wrapper

```bash
cat > $D/cc <<'EOF'
#!/bin/bash
unset $(env | grep -oE '^(CLAUDE[A-Z_]*|CLAUDECODE|AI_AGENT|BAGGAGE|MCP_[A-Z_]*|ANTHROPIC_BASE_URL)=' | tr -d '=' ) 2>/dev/null
export PATH="/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
exec /opt/homebrew/bin/claude "$@"
EOF
chmod +x $D/cc
```

Parent env vars observed and scrubbed (values redacted): `CLAUDE_AGENT_SDK_VERSION`, `CLAUDE_CODE_ENTRYPOINT`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_OAUTH_SCOPES`, `CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL`, `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`, `CLAUDE_CODE_MESSAGING_TOKEN`, `CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_EFFORT`, `MCP_SERVER_CONNECTION_BATCH_SIZE`, `MCP_CONNECTION_NONBLOCKING`, and ~12 more.

### B. Flags and exit codes

**B.1 — flag presence**

```bash
for f in --restricted --max-turns --permission-prompt-tool --init-only --system-prompt-file \
         --append-subagent-system-prompt --channels --advisor --teammate-mode --exec; do
  out=$($D/cc -p "x" $f 2>&1 </dev/null | head -1); echo "$f : $out"; done
```
```
--restricted : ABSENT (error: unknown option '--restricted')
--max-turns : error: option '--max-turns <turns>' argument missing
--permission-prompt-tool : error: option '--permission-prompt-tool <tool>' argument missing
--init-only : (empty — accepted)
--system-prompt-file : error: option '--system-prompt-file <file>' argument missing
--append-subagent-system-prompt : error: option '--append-subagent-system-prompt <prompt>' argument missing
--channels : error: option '--channels <servers...>' argument missing
--advisor : error: option '--advisor <model>' argument missing
--teammate-mode : error: option '--teammate-mode <mode>' argument missing
--exec : ABSENT (error: unknown option '--exec')
```

**B.2 — exit-code table** (each run `</dev/null`, stdout/stderr captured to files, `echo EXIT=$?`)

```
--- bogus resume uuid                       EXIT=1  stderr: No conversation found with session ID: 00000000-0000-4000-8000-000000000000
--- invalid session-id (not uuid)           EXIT=1  stderr: Error: Invalid session ID. Must be a valid UUID.
--- unknown flag                            EXIT=1  stderr: error: unknown option '--nosuchflag'
--- unknown model                           EXIT=1  stdout: There's an issue with the selected model (no-such-model-xyz)…
--- settings file missing                   EXIT=1  stderr: Error: Settings file not found: /tmp/ccdeep.2SxKwI/nope.json
--- settings malformed JSON string          EXIT=1  stderr: Error: Settings file not found: {"hooks":
--- settings valid JSON, bogus hook schema  EXIT=0  stdout: OK
--- resume, no prompt, non-deferred session EXIT=1  stderr: Error: No deferred tool marker found in the resumed session. Either the session was not deferred, the marker is stale (tool already ran), or it exceeds the tail-scan window. Provide a prompt to continue the conversation.
--- max-budget tiny                         EXIT=1  stdout: Error: Exceeded USD budget (0.0001)
```

**B.3** — see D.11.

**B.4 — `--max-turns`**

```bash
$D/cc -p "Run the Bash tool 5 times, each with 'echo x'." --max-turns 1 \
  --setting-sources "" --model haiku --output-format json --permission-mode bypassPermissions </dev/null
```
```
EXIT=1
stop=tool_use  term=max_turns  subtype=error_max_turns  is_error=True  result=None
```

**B.5 — signals**

```bash
$D/cc -p "Write a 3000 word essay about the history of bread." --setting-sources "" \
  --model haiku --output-format text </dev/null >out 2>&1 & P=$!; sleep 6; kill -TERM $P; wait $P
```
```
sent TERM → EXIT=143
sent INT  → EXIT=0
```

Side observation, from an earlier attempt using `sleep 60` as the payload:
`"The Bash tool blocks long leading \`sleep\` commands as a safety measure to prevent unproductive waits."`

### C. Output protocol

**C.1 — full init + result frame** (`$D/cc -p "Reply with exactly: OK" --model haiku --output-format stream-json --verbose --setting-sources "" < /dev/null`)

init (keys): `agents, analytics_disabled, apiKeySource, capabilities, claude_code_version, cwd, fast_mode_disabled_reason, fast_mode_state, mcp_servers, memory_paths, messaging_socket_path, model, output_style, permissionMode, plugins, product_feedback_disabled, session_id, skills, slash_commands, subtype, terminal_slash_commands, tools, type, uuid`

```
tools = ["Task","Bash","CronCreate","CronDelete","CronList","DesignSync","Edit","EnterWorktree",
 "ExitWorktree","ListAgents","Monitor","NotebookEdit","PushNotification","Read","RemoteTrigger",
 "ReportFindings","ScheduleWakeup","SendMessage","Skill","TaskCreate","TaskGet","TaskList",
 "TaskOutput","TaskStop","TaskUpdate","ToolSearch","WebFetch","WebSearch","Workflow","Write"]
mcp_servers = []      model = "claude-haiku-4-5-20251001"      permissionMode = "default"
apiKeySource = "none" output_style = "default"                 plugins = []
agents = ["claude","Explore","general-purpose","Plan","statusline-setup"]
skills = ["deep-research","design-sync","dataviz","update-config","verify","debug","code-review",
 "simplify","batch","fewer-permission-prompts","doctor","loop","schedule","claude-api","run",
 "run-skill-generator"]
memory_paths = {"auto":"/Users/tg/.claude/projects/-private-tmp-ccdeep-2SxKwI-w1/memory/"}
capabilities = ["interrupt_receipt_v1","interrupt_cancel_queued_v1","msg_lifecycle_v1"]
claude_code_version = "2.1.247"
```

Other frames in the same stream: `{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":…,"rateLimitType":"five_hour",…,"unifiedWindows":{"five_hour":{"utilization":0.03,…},"seven_day":{…}}}}`; seven `{"type":"system","subtype":"thinking_tokens","estimated_tokens":…,"estimated_tokens_delta":…}`; `{"type":"system","subtype":"post_turn_summary","summarizes_uuid":…,"status_category":"review_ready","status_detail":"user prompt acknowledged","needs_action":""}`.

result frame (trimmed): `duration_api_ms, stop_reason:"end_turn", session_id, total_cost_usd:0.0195793, usage{input_tokens:10, cache_creation_input_tokens:7853, cache_read_input_tokens:27413, output_tokens:35, output_tokens_details{thinking_tokens:28}, server_tool_use, service_tier, cache_creation{ephemeral_1h_input_tokens:7853, ephemeral_5m_input_tokens:0}, iterations[…]}, modelUsage{"claude-haiku-4-5-20251001":{inputTokens:907, outputTokens:45, cacheReadInputTokens:27413, cacheCreationInputTokens:7853, costUSD:0.0195793, contextWindow:200000, maxOutputTokens:32000, canonicalModel:"claude-haiku-4-5", provider:"firstParty", costBasis:"list"}}, permission_denials:[], terminal_reason:"completed", subagent_stats{…}, is_error:false, num_turns:1, subtype:"success", api_error_status:null, result:"OK", ttft_ms:2263, type:"result", duration_ms:3321, uuid, queued_turn_count:0`

**C.2 — `--json-schema`**

```bash
$D/cc -p "Return the name Bob." --json-schema '{"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}' \
  --setting-sources "" --model haiku --output-format json </dev/null
```
```
structured_output = {"name": "Bob"}
result = '{"name":"Bob"}'
```

**C.3 — `--input-format stream-json`**

```bash
echo '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Reply with exactly: STREAMIN"}]}}' \
| $D/cc -p --input-format stream-json --output-format stream-json --verbose --setting-sources "" --model haiku
```
```
[result] 'STREAMIN' stop=end_turn
```

### D. Hooks

**D.1 — deny, with payload capture**

`$D/gate.sh` tees stdin to a log, extracts `.tool_input.command`, and emits `$LOGDIR/response.json` when the command matches `$LOGDIR/denyset.txt`.

```bash
$D/cc -p "Run exactly this shell command and nothing else: git push" --session-id "$SID" \
  --settings $D/settings1.json --setting-sources "" --model haiku \
  --output-format stream-json --verbose --permission-mode bypassPermissions < /dev/null
```

Hook stdin captured (verbatim, pretty-printed) — see §6.1.

Stream:
```
[system] init
[assistant:tool_use] Bash {"command": "git push", "description": "Push to remote repository"}
[tool_result] is_error= True 'ACME policy RULE-7: git push is not approved in this session.'
[assistant:text] "The `git push` command is blocked by an ACME policy in this session…"
[result] subtype=success stop_reason=end_turn terminal_reason=completed is_error=False num_turns=2
   permission_denials= [{"tool_name":"Bash","tool_use_id":"toolu_01HLDKhuzQv1pBLLMVcdEkwM",
                        "tool_input":{"command":"git push","description":"Push to remote repository"}}]
```

**D.2 — exit 2**

Hook: `cat >/dev/null; echo "GATE-C: exit-2 stderr message." >&2; exit 2`
```
[tool_result] err= True 'PreToolUse:Bash hook error: [/tmp/ccdeep.2SxKwI/hook3.sh]: GATE-C: exit-2 stderr message.\n'
[text] "The Bash tool call was blocked by a pre-tool hook (GATE-C) with an exit code of 2. This appears
        to be a gate or permission check configured in your settings…"
```

**D.3 — `ask`**

Hook emits `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"ACME: needs approval"}}`
```
[tool_use] Bash {"command":"echo MARKER_RAN",…}
[system] permission_denied {"message": "ACME: needs approval"}
[tool_result] err= True 'ACME: needs approval'
[text] 'The tool needs your approval to execute. This is a permission safety check from the system.'
```

**D.4 — `updatedInput`**

Hook emits `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"rewritten","updatedInput":{"command":"echo REWRITTEN_BY_HOOK","description":"rewritten"}}}`
```
[tool_use] Bash {"command": "echo MARKER_RAN", "description": "Run the requested marker command"}
[tool_result] err= False 'REWRITTEN_BY_HOOK'
```
The `tool_use` frame reports the original command; the rewritten one ran.

**D.5 — `additionalContext`**

Hook emits `…"permissionDecision":"allow","additionalContext":"NOTE_FROM_GATE: the magic word is ZEBRA."`
Prompt asked for the magic word afterwards. Output: `The magic word is **ZEBRA**.`

**D.6 — `--include-hook-events`**

```json
{"type":"system","subtype":"hook_started","hook_id":"dbf56961-…","hook_name":"PreToolUse:Bash",
 "hook_event":"PreToolUse","uuid":"…","session_id":"…"}
{"type":"system","subtype":"hook_response","hook_id":"dbf56961-…","hook_name":"PreToolUse:Bash",
 "hook_event":"PreToolUse","output":"boom\n","stdout":"","stderr":"boom\n","exit_code":1,
 "outcome":"error","uuid":"…","session_id":"…"}
```
Three failure shapes:
```
missing command : output "/bin/sh: /tmp/ccdeep.2SxKwI/nope.sh: No such file or directory\n", exit_code 127, outcome "error"
timeout 2       : output "", stdout "", stderr "", exit_code 1, outcome "cancelled"
malformed JSON  : output "{\"hookSpecificOutput\":{\n", stdout same, stderr "", exit_code 0, outcome "success"
```

**D.7 — which events fire**

Settings registering the same logging hook on all 31 event names, matcher `"*"`.

`--permission-mode bypassPermissions`, prompt `Immediately run the Bash tool with exactly: echo M`:
```
SessionStart 1 · UserPromptSubmit 1 · PreToolUse 1 · PostToolUse 1 · PostToolBatch 1 · MessageDisplay 1 · Stop 1 · SessionEnd 1
```
`--permission-mode default`, prompt `… rm -rf /tmp/ccdeep-nonexistent-xyz`:
```
SessionStart 1 · UserPromptSubmit 1 · PreToolUse 1 · PostToolBatch 1 · MessageDisplay 1 · Stop 1 · SessionEnd 1
```
with the model's answer: *"the Bash tool blocks rm operations outside the allowed working directories for this session"* and `PostToolBatch.tool_calls[0].tool_response` beginning `rm in '/tmp/ccdeep-nonexistent-xyz' was blocked. For security, Claude Code may only remove files from the allowed working directories for this session: …`

`--permission-mode manual`, `echo M`: same eight events as bypassPermissions. `PermissionRequest` never fired.

Payload shapes for SessionStart / UserPromptSubmit / PostToolBatch / MessageDisplay / Stop / SessionEnd are quoted in §6.2.

**D.8 — fail-open matrix** (each run: prompt `Immediately run the Bash tool with exactly: echo M`, hook registered on `PreToolUse`/`Bash`)

```
CASE A  hook exits 1 + stderr        → [tool_result] err=False 'MARKER_RAN'   (ran)
CASE B  hook command missing         → [tool_result] err=False 'MARKER_RAN'   (ran)
CASE C  hook exits 2 + stderr        → BLOCKED (see D.2)
CASE D  malformed JSON, exit 0       → [tool_result] err=False 'MARKER_RAN'   (ran)
CASE E  timeout:2, hook sleeps 20    → [tool_result] err=False 'MARKER_RAN'   (ran; total wall 8s)
```

**D.9 — no default hook timeout**

Hook with **no** `timeout` key, body `cat >/dev/null; date +%s > start; sleep 400; echo '<deny json>'`.
```
tool_use  at 2026-09-02T07:05:33.631Z
tool_result at 2026-09-02T07:12:13.835Z   is_error=True 'late'
```
400 s elapsed; the deny was honoured. (The model then issued a second Bash call, whose hook was killed manually to end the loop.)

**D.10 — matcher `"*"` catches MCP tools**

Hook logging `tool_name` with matcher `"*"`, prompt asking for two MCP tools:
```
ToolSearch
mcp__probe__ask_human
mcp__probe__deploy
```

**D.11 — silent config typos**

```
GOOD config                                → tool_result err=True 'BLOCKED-BY-GATE'
TYPO: inner hooks is an object not array   → tool_result err=False 'MARKER_RAN'   stderr: (empty)
TYPO: event name PreToolUSE                → tool_result err=False 'MARKER_RAN'   stderr: (empty)
TYPO: type 'cmd'                           → tool_result err=False 'MARKER_RAN'   stderr: (empty)
```

### E. Sessions

**E.1 — `--session-id` honoured**
```
SID=5325e5cf-fd27-4636-90be-95564f60d25b
init session_id= 5325e5cf-fd27-4636-90be-95564f60d25b
/Users/tg/.claude/projects/-private-tmp-ccdeep-2SxKwI-s1/5325e5cf-fd27-4636-90be-95564f60d25b.jsonl
/Users/tg/.claude/projects/-private-tmp-ccdeep-2SxKwI-s1/memory/
```

**E.2 — defer base run**
```bash
cd $D/s2; $D/cc -p "Immediately run the Bash tool with exactly this command, no questions: git push -u origin main" \
  --session-id "$SID2" --settings $D/settings2.json --setting-sources "" --model haiku \
  --output-format json --permission-mode bypassPermissions < /dev/null
```
```
stop_reason = "tool_deferred"       terminal_reason = "tool_deferred"
is_error = false  subtype = "success"  num_turns = 1  result = ""
deferred_tool_use = {"id":"toolu_01UZb7gHCsRuDthVTDmPGEj2","name":"Bash",
  "input":{"command":"git push -u origin main","description":"Push current branch to remote origin"}}
hook invocations: 1     remote: (empty)
```

**E.3 — resume while still denied, no prompt**
```
EXIT=0
stop_reason = "tool_deferred"   terminal_reason = null   num_turns = 12   result = ""
deferred_tool_use = {same id}   hook invocations now: 2
```

**E.4 — resume with the gate cleared, no prompt**
```
[system] vcs_state_changed
[tool_result] is_error=False "To /tmp/ccdeep.2SxKwI/remote2.git\n * [new branch]      main -> main\nbranch 'main' set up to track 'origin/main'."
[system] init
[assistant:text] "I don't have any prior work to continue from…"
[result] stop=end_turn term=completed turns=1
remote: 1a7ccb8 c1        hook invocations: 3
```

**E.5 — two result frames**

Gate cleared, resume **with** a prompt:
```
[system] vcs_state_changed
[tool_result] err=False "To /tmp/ccdeep.2SxKwI/remote6.git\n * [new branch]      main -> main…"
[system] init
[result #1] stop=end_turn turns=1 result="I don't see any prior work in this conversation…"
[system] init
[result #2] stop=end_turn turns=1 result="I don't have a record of an approval request…"
TOTAL result frames: 2      remote6: 2d0b1f4 c1
```

Gate still denying, resume **with** a prompt (fresh hook log, base run confirmed to have deferred):
```
hook calls after base: 1
[result #1] stop=tool_deferred result='' deferred={"id":"toolu_01E8qABr8CXVXjqH47DpDo6C",…}
[system] init
[tool_result] err=False 'On branch main\nnothing to commit, working tree clean'
[tool_result] err=False '* main 2d0b1f4 c1'
[result #2] stop=tool_deferred result='' deferred={"id":"toolu_01K9QE35WTgtcCgDsWgqTUns",…}
TOTAL result frames: 2      hook calls after resume: 5      remote6: (empty)
```

**E.6 — resume from a different cwd (the refutation)**
```bash
mkdir -p $D/other && cd $D/other
$D/cc -p "What shell command did you try to run, and what happened? One sentence." \
  --resume 5325e5cf-fd27-4636-90be-95564f60d25b --setting-sources "" --model haiku --output-format json < /dev/null
```
```
EXIT=0   stderr: (empty)
session_id = 5325e5cf-fd27-4636-90be-95564f60d25b
result = "I tried to run `git push`, but it was blocked by an ACME policy that prevents git push
          operations in this session without explicit approval."
```
Transcript stayed in `-private-tmp-ccdeep-2SxKwI-s1/`; its tail records carry `"cwd": "/private/tmp/ccdeep.2SxKwI/other"`. A new project dir `-private-tmp-ccdeep-2SxKwI-other/` was created containing only `memory/`.

**E.7 — `--continue` in an empty directory**
```bash
mkdir -p $D/emptydir && cd $D/emptydir
$D/cc -p "hi" --continue --setting-sources "" --model haiku --output-format text </dev/null
```
```
Hi! I'm Claude Code, your AI assistant for software engineering tasks…
EXIT=0
```
and a brand-new transcript `4722c416-7526-4e96-8b45-97fa54481403.jsonl` appeared in `-private-tmp-ccdeep-2SxKwI-emptydir/`.

**E.8 — `--fork-session`**
```
session_id= 32b8c877-9612-479b-8b21-b18e1f7f6ad6  (orig 91241eba-3cd8-485a-8762-6b4862ac4f22)
result= `mcp__probe__deploy` with target='production'.
```

**E.9 — concurrent resume**
```bash
( $D/cc -p "Say ALPHA only." --resume $SIDE … ) &
( $D/cc -p "Say BRAVO only." --resume $SIDE … ) &
wait
c1: ALPHA        c2: BRAVO
```
Both landed in the same transcript (`grep -c ALPHA` = 4, `grep -c BRAVO` = 4). A third resume asking "List every word I asked you to say in this conversation." answered: `BRAVO`.

**E.10 — `--no-session-persistence`**
```
$D/cc -p "Remember the codeword BANANA. Reply OK." --session-id $SIDN --no-session-persistence … → OK
$D/cc -p "What is the codeword?" --resume $SIDN …  → No conversation found with session ID: b0f446ce-…
```

**E.11 — transcript structure**
```
Counter({'assistant': 26, 'attachment': 20, 'queue-operation': 14, 'user': 12,
         'last-prompt': 8, 'ai-title': 3, 'atis-latch': 3, 'mode': 2})
union of keys: aiTitle, atis, attachment, attributionMcpServer, attributionMcpTool, content, cwd,
 entrypoint, gitBranch, isSidechain, lastPrompt, leafUuid, message, mode, operation, parentUuid,
 permissionMode, promptId, promptSource, requestId, sessionId, sourceToolAssistantUUID, timestamp,
 toolDenialKind, toolUseResult, type, userType, uuid, version
```
```json
{"parentUuid":null,"isSidechain":false,"promptId":"…","type":"user","uuid":"…",
 "timestamp":"2026-09-02T07:15:40.935Z","permissionMode":"bypassPermissions","promptSource":"sdk",
 "userType":"external","entrypoint":"sdk-cli","cwd":"/private/tmp/ccdeep.2SxKwI/e2e",
 "sessionId":"91241eba-…","version":"2.1.247","gitBranch":"main"}
{"type":"last-prompt","lastPrompt":"Say BRAVO only.","leafUuid":"5a2d6ee7-5608-4117-9b1b-fb7f32616e0c","sessionId":"91241eba-…"}
```
`attachment` subtypes observed: `deferred_tools_delta`, `agent_listing_delta`, `skill_listing`, `total_tokens_reminder`, `task_reminder`.

**E.12 — permission-mode mismatch on a deferred resume**
```bash
# base: --permission-mode bypassPermissions  → stop_reason tool_deferred
# resume (gate cleared): --permission-mode acceptEdits
```
```
EXIT=0   stderr: (empty)
[system] permission_denied {"message": "This command requires approval"}
[tool_result] err=True 'This command requires approval'
[system] init
[text] "The git push command requires approval through your permission settings…"
[result] stop=end_turn term=completed
remote6: (empty)
```

**E.13 — a base run that never deferred**
```
BASE stop= end_turn   deferred= null   hook calls: 0
```
Same prompt, same settings as E.2. The model simply did not call the tool. Shape-identical to an ordinary run.

### F. Settings and permission rules

**F.1 — source precedence and merging** (project `.claude/settings.json` registers `PROJECT_HOOK`; `--settings '<json>'` registers `SESSION_HOOK`)
```
--- default setting sources, no --settings          hooks fired: 1 PROJECT_HOOK
--- --setting-sources project, no --settings        hooks fired: 1 PROJECT_HOOK
--- --setting-sources "" , with --settings          hooks fired: 1 SESSION_HOOK
--- --setting-sources project + --settings          hooks fired: 1 PROJECT_HOOK  1 SESSION_HOOK
```

**F.2 — `permissions.deny` on Bash**
```
settings: {"permissions":{"deny":["Bash(git push:*)"]}}
init tools has Bash: True
[tool_use] Bash {"command":"git push origin main",…}
[tool_result] err=True 'Permission to use Bash with command git push origin main has been denied.'
[result] denials=[{"tool_name":"Bash","tool_use_id":"toolu_01UGrcAoD7V9SDj93AbUL5Ak",…}]
```

**F.3 — `permissions.deny` on a bare MCP tool name**
```
settings: {"permissions":{"deny":["mcp__probe__deploy"]}}
init tools w/ probe: ['mcp__probe__ask_human']          ← deploy simply absent
[tool_use] ToolSearch {"query":"select:mcp__probe__deploy"}
[tool_result] 'No matching deferred tools found'
[result] denials=[]
```

**F.4 — nested-shell bypass**
```
[tool_use] Bash {"command": "sh -c 'git push origin main'", …}
[tool_result] err=True "Exit code 128\nfatal: 'origin' does not appear to be a git repository…"
```
The deny rule did not fire; git ran and failed only because `s1` has no remote.

**F.5 — user settings on this machine** (read-only inspection)
```
~/.claude/settings.json top-level keys: agentPushNotifEnabled, effortLevel, enabledPlugins, env,
  extraKnownMarketplaces, model, permissions, skipAutoPermissionPrompt,
  skipDangerousModePermissionPrompt, theme
permissions keys: ['defaultMode']     defaultMode: auto     hook events: []
```

### G. Binary strings (`strings -a /opt/homebrew/Caskroom/claude-code@latest/2.1.247/claude`, 622 706 lines)

**G.1 — terminal_reason enum** (from the compiled bundle, line 534998)
```
"blocking_limit","rapid_refill_breaker","prompt_too_long","image_error","model_error","api_error",
"malformed_tool_use_exhausted","budget_exhausted","structured_output_retry_exhausted",
"tool_deferred_unavailable","turn_setup_failed" | "aborted_streaming","aborted_tools",
"stop_hook_prevented","hook_stopped","tool_deferred","max_turns","background_requested","completed"
```

**G.2 — result subtypes present**
```
503 "success" · 11 "error_during_execution" · 7 "error_max_structured_output_retries"
  4 "error_max_turns" · 4 "error_max_budget_usd"
```

**G.3 — hook event enum** (line 534998, extracted whole)
```json
["PreToolUse","PostToolUse","PostToolUseFailure","PostToolBatch","Notification","UserPromptSubmit",
 "UserPromptExpansion","SessionStart","SessionEnd","Stop","StopFailure","SubagentStart","SubagentStop",
 "PreCompact","PostCompact","PermissionRequest","PermissionDenied","Setup","TeammateIdle","TaskCreated",
 "TaskCompleted","Elicitation","ElicitationResult","ConfigChange","WorktreeCreate","WorktreeRemove",
 "InstructionsLoaded","CwdChanged","FileChanged","DirectoryAdded","MessageDisplay"]
```

**G.4 — permissionDecision enums**
```
grep -oE '"(allow|deny|ask|defer|passthrough)"(,"…")+' | sort | uniq -c
  8 "allow","deny","ask"
  2 "allow","deny","ask","defer"      ← the 4-value enum, twice
  2 "deny","passthrough"
```

**G.5 — defer machinery strings**
```
451826: Deferred tool resume: permissionMode mismatch (deferred under '
454821:  returned permissionDecision=defer for a served call; refusing (no resume machinery)
454823:  returned permissionDecision=defer in interactive mode; ignoring (defer is print-mode only)
510428: Error: No deferred tool marker found in the resumed session. Either the session was not
        deferred, the marker is stale (tool already ran), or it exceeds the tail-scan window.
        Provide a prompt to continue the conversation.
377313: tool_deferred     377337: deferred_tool_use     486703: tool_deferred_unavailable
```

**G.6 — transports**
```
405 "http" · 175 "stdio" · 115 "sse" · 33 "sse-ide" · 31 "ws-ide" · 4 "websocket"
```

**G.7 — `system` subtypes in code** (60 shown of more): `agents_killed, api_error, api_retry, background_tasks, compact_boundary, elicitation, end_session, error, error_during_execution, error_max_budget_usd, error_max_structured_output_retries, error_max_turns, file_snapshot, hook_callback, hook_progress, hook_response, hook_started, informational, init, init_milestone, interrupt, local_command, mcp_authenticate, mcp_message, mcp_reconnect, mcp_status, memory_recall, memory_saved, …`

**G.8 — embedded hooks documentation** (lines 379820–379920) reproduced in §6.1; it documents `permissionDecision` as `"allow", "deny", or "ask"` and does **not** mention `defer`.

### H. `--permission-prompt-tool`

**H.1 — deny + allow**
```bash
$D/cc -p "You are a test fixture. Do not deliberate. Call the Bash tool exactly twice, in order:
first with command 'git push origin main', then with command 'echo SECOND'. No other tools, no questions." \
  --mcp-config $D/mcpperm.json --strict-mcp-config --permission-prompt-tool mcp__perm__approve \
  --setting-sources "" --model haiku --output-format stream-json --verbose </dev/null
```
```
[tool_use] Bash {"command":"git push origin main",…}
[tool_result] err=True 'ACME PERMTOOL: git push is not approved in this session.'
[tool_use] Bash {"command":"echo SECOND",…}
[tool_result] err=False 'SECOND'
[result] denials=[{"tool_name":"Bash","tool_use_id":"toolu_01Rc7rHi9QsTzsxPAXDKqs2x",…}]

permtool invocations (1, not 2):
{"name":"approve","arguments":{"tool_name":"Bash","input":{"command":"git push origin main",
 "description":"Push main branch to origin"},"tool_use_id":"toolu_01Rc7rHi9QsTzsxPAXDKqs2x"},
 "_meta":{"claudecode/toolUseId":"toolu_01Rc7rHi9QsTzsxPAXDKqs2x","progressToken":2}}
```

**H.2 — the 408-second hold**

Permission tool body: `fs.appendFileSync(log,…); await new Promise(r=>setTimeout(r,400000)); send({… behavior:"allow" …})`
```
elapsed = 408 s
calls to perm tool = 1
[tool_result] err=True "Exit code 128\nfatal: 'origin' does not appear to be a git repository…"
[text] "The push failed—there's no `origin` remote configured in this repository."
[result] stop=end_turn term=completed dur_ms=406868
```
(The push failed on git's own grounds — `s1` has no remote — which is the point: the permission tool allowed it after 400 s and the call ran.)

### I. MCP

**I.1 — stdio server, tool naming, ToolSearch deferral**
```
mcp_servers = [{"name":"probe","status":"connected"}]
tools containing 'probe': ['mcp__probe__ask_human','mcp__probe__deploy']
[tool_use] ToolSearch {"query":"select:mcp__probe__ask_human,mcp__probe__deploy","max_results":2}
[tool_result] "[{'type':'tool_reference','tool_name':'mcp__probe__ask_human'}, {…'mcp__probe__deploy'}]"
[tool_use] mcp__probe__ask_human {"question":"hi"}
[tool_result] '[{\'type\':\'text\',\'text\':\'SERVER_RAN tool=ask_human args={"question":"hi"}\'}]'
```

**I.2 — `.mcp.json`**
```
--setting-sources ""        probe tools = []
--setting-sources project   probe tools = ['mcp__probe__ask_human','mcp__probe__deploy']
```

**I.3 — the connector leak**
```
--- --setting-sources ""
  mcp_servers = [{"name":"claude.ai Figma","status":"needs-auth"},
                 {"name":"claude.ai Galaxus Shop","status":"needs-auth"},
                 {"name":"claude.ai Atlassian Rovo","status":"connected"},
                 {"name":"claude.ai Gmail","status":"needs-auth"},
                 {"name":"claude.ai Google Drive","status":"needs-auth"},
                 {"name":"claude.ai Google Calendar","status":"needs-auth"}]
--- --setting-sources "" --strict-mcp-config          mcp_servers = []
--- --setting-sources project --strict-mcp-config     mcp_servers = []
--- --setting-sources user   mcp_servers = [{"name":"vibe-annotations","status":"failed"}, …the six above]
--- --mcp-config … --strict-mcp-config --setting-sources project   mcp_servers = [{"name":"probe","status":"connected"}]
```

**I.4 — `--tools ""` does not remove connector tools**
```
--tools "Bash,Read" → tools = ["Bash","Read", 27 × mcp__claude_ai_Atlassian_Rovo__*]
--tools ""          → tools = [27 × mcp__claude_ai_Atlassian_Rovo__*]
```

**I.5 — server failures**
```
{"mcpServers":{"bad":{"command":"/bin/false","args":[]}}}
  mcp_servers = [{"name":"bad","status":"failed"}]   mcp_server_errors = null   stderr = (empty)

--mcp-config '{"mcpServers":{"x":{"url":"https://example.com/mcp"}}}'
  mcp_servers = []
  mcp_server_errors = [{"name":"x","type":"url_missing_type",
    "message":"Skipped — MCP server \"x\" has a \"url\" but no \"type\"; add \"type\": \"http\" (or \"sse\" / \"ws\") to this entry"}]
```

**I.6 — resume without `--mcp-config`**
```
mcp_servers = []
[text] "I'm unable to call the deploy tool at this moment. The MCP server providing the deploy tool
        has disconnected and is no longer available…"
```

**I.7 — connector kill switches**
```
--settings '{"disableClaudeAiConnectors":true}'  → mcp_servers = []   mcp tools count = 0
ENABLE_CLAUDEAI_MCP_SERVERS=false                → mcp_servers = []   mcp tools count = 0
```

### J. Isolation

**J.1**
```bash
env -i HOME=$HOME PATH=… CLAUDE_CONFIG_DIR=$D/cfg /opt/homebrew/bin/claude -p "Reply with exactly: OK" \
  --model haiku --output-format text < /dev/null
→ Not logged in · Please run /login

$D/cc -p "Reply with exactly: OK" --bare --model haiku --output-format text < /dev/null
→ Not logged in · Please run /login
```

### K. The end-to-end product test

**K.1 — phase 1** (gate on `mcp__probe__deploy`, matcher `"*"`, session id assigned)
```bash
$D/cc -p "Deploy the current build to production using the deploy tool with target='production'.
If an action is blocked, do not retry it and do not work around it; instead use the ask_human tool
to request approval, then stop and end your turn." \
  --session-id $SIDE --mcp-config $D/mcp.json --strict-mcp-config --settings $D/settingsE2E.json \
  --setting-sources "" --model haiku --output-format stream-json --verbose \
  --permission-mode bypassPermissions </dev/null
```
Full stream quoted in §12.

**K.2 — phase 2, from `$D/e2e_other`** — full stream quoted in §12. Gate cleared by truncating the deny file between the two runs.

### L. Cleanup

The temp tree `/tmp/ccdeep.2SxKwI` and its sandboxes are throwaway. The binary wrote transcripts into `~/.claude/projects/-private-tmp-ccdeep-2SxKwI-*/` (about a dozen project dirs); those are the only residue outside the temp tree, and deleting those directories is safe.
