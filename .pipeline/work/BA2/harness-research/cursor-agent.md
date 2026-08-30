# BA2 harness research — `cursor-agent`

Researched 2026-08-27. Installed binary: **`cursor-agent` 2026.08.25-3e8eec8** (`cursor-agent --version`,
resolved to `~/.local/share/cursor-agent/versions/2026.08.25-3e8eec8/`). Logged in as
`grundtob@gmail.com` (`cursor-agent status`).

---

## Verdict

**Yes. cursor-agent can do everything BA2 needs, and it is the best-equipped of the harnesses looked at
so far.**

It has a first-class hook system that fires **before** a shell command, a file write, a file read and an
MCP call; a hook can **deny** the action, and the denial carries **our own text into the model's context
as the tool result**. Proven live, headless, with the exact flags this repo already passes.

Two caveats, both real and both cheap to design around:

1. **`permission: "deny"` is the only usable decision. `"ask"` silently ALLOWS the action in headless
   mode** — no prompt, no block, no message. Proven. Never emit `"ask"`.
2. **Use `user_message`, not `agent_message`.** The docs say `agent_message` is "the message sent to the
   agent when denied". On the installed CLI it is **dropped entirely** — a deny carrying only
   `agent_message` reached the model as a bare "Command execution was blocked by a hook." Proven, and
   confirmed in the shipped code. `user_message` is what actually reaches the model.

A second, simpler mechanism also exists (a declarative allow/deny list at
`<workspace>/.cursor/cli.json`). It blocks, but it produces a fixed string with no room for our text, so
it satisfies half of the requirement and cannot produce the push-back. Hooks are the mechanism for BA2.

---

## The mechanism

Write `<sandbox>/.cursor/hooks.json` per session, next to the `.cursor/mcp.json` this repo already
writes for this harness (`layers/agent-execution/harness-registry/src/cli-mcp-config.ts:168-190`,
`writeCursorJson`). No flag, no env var, no change to the spawn — the config is picked up from the
process cwd, which for this repo is the sandbox
(`layers/agent-execution/harness-registry/src/cli-harness-adapter.ts:559`, `cwd: config.sandboxPath`).

Shape (verified by running it):

```json
{
  "version": 1,
  "hooks": {
    "beforeShellExecution": [
      { "command": "<abs path to script>", "matcher": "rm|curl", "failClosed": true, "timeout": 5000 }
    ],
    "preToolUse": [
      { "command": "<abs path to script>", "matcher": "Write|Shell", "failClosed": true }
    ]
  }
}
```

The hook is an executable that receives one JSON object on stdin and writes one JSON object on stdout.
A fresh process per tool call — so it can consult live state (a one-time pass that has just been granted
by a human) without restarting the session. To block:

```json
{ "permission": "deny", "user_message": "<the push-back the agent will read>" }
```

Which event to hook:

| BA2 needs to intercept | Event | Blocks? | Our text reaches the model? |
|---|---|---|---|
| Shell command | `beforeShellExecution` | Yes (proven) | Yes, via `user_message` (proven) |
| File write / edit | `preToolUse` (`tool_name: "Write"`) | Yes (proven) | Yes, via `user_message` **and** `additional_context` (both proven) |
| File read | `beforeReadFile` or `preToolUse` (`Read`) | Yes (documented; `preToolUse` deny proven) | Yes |
| Everything, one choke point | `preToolUse` | Yes | Yes |

There is **no `beforeFileEdit`/`beforeWriteFile` event** — `afterFileEdit` only fires after the write has
landed. So file writes must go through the generic `preToolUse`. That is fine: `preToolUse` fires for
every tool with a normalised Claude-style `tool_name` (`Shell`, `Read`, `Write`, `Grep`, `WebFetch`,
`Task`, `MCP:<name>`).

---

## Evidence

All live runs used the repo's exact argument set —
`-p <prompt> --print --output-format stream-json --model composer-2.5 --trust --approve-mcps` — matching
`CURSOR_AGENT_CLI_CONFIG` at
`layers/agent-execution/harness-registry/src/adapter-pool.ts:481-501` (registration at `:593-607`).
Model substituted for `{{model}}`; everything else identical. Run directories are under the session
scratchpad; nothing was written into the repo.

### F1 — cursor-agent has a permission mechanism, in fact two. VERIFIED

`cursor-agent --help` (installed 2026.08.25-3e8eec8) lists `-f/--force` ("Force allow commands unless
explicitly denied"), `--yolo`, `--auto-review` ("a server classifier auto-runs safe tool calls and
prompts for the rest"), `--sandbox <enabled|disabled>`, `--trust`, `--approve-mcps`.

Declarative permission tokens exist: `Shell(cmd)`, `Read(glob)`, `Write(glob)`, `WebFetch(domain)`,
`Mcp(server:tool)`, in `permissions.allow` / `permissions.deny`. Source: Cursor docs,
<https://cursor.com/docs/cli/reference/permissions.md>, fetched 2026-08-27. Confirmed present on this
machine — `~/.cursor/cli-config.json` currently contains `"permissions": {"allow": ["Shell(ls)"], "deny": []}`.

The docs place them in `~/.cursor/cli-config.json` (global) **or `<project>/.cursor/cli.json`
(project-specific)**. The project form is per-invocation and therefore writable into the sandbox.

**Proven:** a scratch workspace containing only `.cursor/cli.json` with
`{"permissions":{"deny":["Shell(echo)","Write(**/*.txt)"]}}` blocked the command. Stream result:

```json
{"permissionDenied": {"command": "echo perm_probe", "error": "Command blocked by permissions configuration", "isReadonly": false}}
```

The model reported "The command `echo perm_probe` did **not** run." — but the text it saw was the fixed
string `Permission denied: Command blocked by permissions configuration`. **There is no field for our
own message.** This mechanism gives (a) and not (b), so it cannot carry the push-back on its own.

### F2 — Hooks exist, they can deny, and the denial text reaches the model. VERIFIED, BOTH HALVES

Full event set, read out of the shipped bundle (`index.js`, the hook-event enum):

`beforeShellExecution`, `beforeMCPExecution`, `afterShellExecution`, `afterMCPExecution`,
`beforeReadFile`, `afterFileEdit`, `beforeTabFileRead`, `afterTabFileEdit`, `stop`,
`beforeSubmitPrompt`, `afterAgentResponse`, `afterAgentThought`, `sessionStart`, `sessionEnd`,
`preCompact`, `subagentStart`, `subagentStop`, `preToolUse`, `postToolUse`, `postToolUseFailure`,
`workspaceOpen`.

Matches Cursor's docs, <https://cursor.com/docs/hooks.md>, fetched 2026-08-27: *"Hooks are spawned
processes that communicate over stdio using JSON in both directions… can observe, block, or modify
behavior."*

**Proven — shell block.** `<scratch>/.cursor/hooks.json` with a `beforeShellExecution` hook returning
`{"permission":"deny","user_message":"Blocked by the team permission list: this action needs human
approval. To ask, call the submit_review tool and name the action."}`. The command did not run. The
stream carried:

```
"reason": "Command execution was blocked by a hook: Blocked by the team permission list: this action
needs human approval. To ask, call the submit_review tool and name the action.\n\nTo view or modify
configured hooks, go to Cursor Settings > Hooks.\n\nAgent note: Do not suggest workarounds to the
blocked tool."
```

The agent's own final answer quoted that text back verbatim and concluded the command "**did not
run**". So the push-back demonstrably lands in the model's context and the model acts on it. Note
Cursor appends two fixed sentences of its own — including a helpful *"Do not suggest workarounds to the
blocked tool."*

**Proven — file write block.** A `preToolUse` hook returning
`{"permission":"deny","user_message":"USERMSG_MARKER…","additional_context":"ADDCTX_MARKER: blocked by
rule-42."}` stopped a file creation. The file was never created (`ls` confirms). The agent quoted both
the `user_message` **and** the `additional_context` in its answer:

> Rejected: USERMSG_MARKER: writing that file needs human approval; ask via submit_review.
> …
> Additional context from the block: `ADDCTX_MARKER: blocked by rule-42.`

So on `preToolUse` there are two independent channels into the model. `additional_context` is size-capped
(the bundle throws `HookAdditionalContextTooLargeError` and drops the carrier past the cap).

### F3 — All of this works headless. VERIFIED

Every run above was `--print --output-format stream-json` with stdin closed (`< /dev/null`) and no TTY.
Hooks fired, denied, and the process exited 0 with a normal `result` event. **No human at a keyboard is
involved anywhere.** The hook payload confirms the harness knows it is in the sandbox:

```json
{"hook_event_name":"beforeShellExecution","command":"echo FORBIDDEN_marker_here","cwd":"","sandbox":false,
 "session_id":"32bc07cd-…","cursor_version":"2026.08.25-3e8eec8",
 "workspace_roots":["…/cursor-hook-test"],"user_email":"grundtob@gmail.com","transcript_path":null}
```

Cursor's docs independently confirm hooks are not editor-only — cloud agents run
`.cursor/hooks.json` from the repo (<https://cursor.com/docs/hooks.md>, "Cloud agent support"), and the
CLI changelog records hook work landing in the CLI specifically ("Hooks accept payloads over stdin",
"Hooks fire reliably… in the CLI") — <https://cursor.com/docs/cli/changelog.md>, fetched 2026-08-27.

### F4 — `"ask"` is a trap in headless. VERIFIED

A `beforeShellExecution` hook returning `{"permission":"ask","user_message":"ASKMSG_MARKER: needs human
approval."}` **did not block anything**. The command ran, exit 0, output `hello_ask`, and the agent
reported "No errors occurred." No prompt, no message, nothing in the transcript.

Cursor's docs half-admit this for one event: *"`ask` is accepted by the schema but not enforced for
`preToolUse` today"* and *"`ask` is not supported for `subagentStart` and is treated as `deny`"*
(<https://cursor.com/docs/hooks.md>). The docs do **not** warn about it for `beforeShellExecution`; the
live run shows it fails open there too. **`deny` is the only decision BA2 may emit.**

### F5 — `agent_message` is documented but not delivered. VERIFIED

A `beforeShellExecution` deny carrying **only** `agent_message` produced:

```
"reason": "Command execution was blocked by a hook.\n\nTo view or modify configured hooks, go to Cursor
Settings > Hooks.\n\nAgent note: Do not suggest workarounds to the blocked tool."
```

Our text is gone. The agent had nothing to act on.

Confirmed in the shipped code: `190.index.js` (the hook-execution module) contains **zero** occurrences
of `agent_message`; the deny paths read `user_message` only —
`const o = a.user_message || \`${toolName} blocked by preToolUse hook\`` for `preToolUse`, and
`H("Command execution", i.user_message)` for `beforeShellExecution`. `agent_message` appears only in
`index.js`, where it is copied into an ACP/proto `PreToolUseRequestResponse` for external consumers.

**This contradicts Cursor's own documentation** (<https://cursor.com/docs/hooks.md>, tables at the
`preToolUse` and `beforeShellExecution` sections: *"`agent_message` — Message fed back to the agent when
the action is denied"*). Docs fetched 2026-08-27; binary 2026.08.25-3e8eec8. Trust the binary. Set
`user_message` (and optionally `agent_message` too, harmlessly, for forward compatibility).

### F6 — What a rule can match on. VERIFIED

Two layers.

**Declaratively, in `hooks.json`, via `matcher` (a regex string):**

- `preToolUse` / `postToolUse` / `postToolUseFailure` → matched against **`tool_name`**
  (`Shell`, `Read`, `Write`, `Grep`, `WebFetch`, `Task`, `MCP:<tool>`).
- `beforeShellExecution` / `afterShellExecution` → matched against **the full shell command string**.
- `subagentStart` → matched against the subagent type.

**Proven:** a `beforeShellExecution` hook with `"matcher": "ZZZ_NEVER_MATCHES"` was never invoked (its
log file was never created) while a second, unmatched hook on the same event did run and denied. So the
matcher genuinely gates invocation. (An earlier read of the Claude-compatibility code path in the bundle
suggested matchers only applied to `preToolUse`; the live run disproves that — the docs are right here.)

**Programmatically, inside the hook**, from the stdin payload:

- `beforeShellExecution`: `command`, `cwd`, `sandbox`, plus session/workspace identity.
- `preToolUse`: `tool_name`, `tool_input` (for `Write`: `file_path` + `content`; for `Shell`: `command`
  + `cwd`; for `Read`: `file_path`), `tool_use_id`.
- `beforeReadFile`: `file_path`, `content`, `attachments`.

So file-path and command-pattern matching are both available; only the *coarse* filter is declarative.

**Gotcha, observed:** an edit tool call fires an inner `preToolUse` with `tool_name: "Read"` carrying the
target path and the **edit's** `tool_use_id`. In the write-block run the deny landed on that inner
`Read`, and the rejection surfaced on the `editToolCall`. So `tool_name` is not a faithful description of
the operation in every case, and a rule that denies reads of a path also blocks writes to it.

**Gotcha:** `preToolUse` fires for MCP tools as `MCP:<toolName>`. BA2 explicitly does not target
HyperIdle's own MCP bridge, so any `preToolUse` rule must exclude the `MCP:` prefix or it will
accidentally gate `submit_review` — the very tool the blocked agent is being told to call.

### F7 — Configuration is per-invocation, exactly where we need it. VERIFIED

Config paths, read out of the bundle (`190.index.js`, the path-resolution function):

```
enterpriseConfigPath : /Library/Application Support/Cursor/hooks.json      (macOS)
teamConfigPath       : <…>/.cursor/managed/active-team-hooks/hooks.json
userConfigPath       : ~/.cursor/hooks.json
projectConfigPath    : <workspace>/.cursor/hooks.json          ← this one
claudeUserConfigPath : ~/.claude/settings.json
claudeProjectConfigPath      : <workspace>/.claude/settings.json
claudeProjectLocalConfigPath : <workspace>/.claude/settings.local.json
```

`<workspace>` is the process cwd, which this repo sets to the per-session sandbox
(`cli-harness-adapter.ts:559`). Every live run above proved a project-level `.cursor/hooks.json` is read
with **no flag and no trust prompt** — unlike codex, which needs `CODEX_HOME` plus
`--dangerously-bypass-hook-trust` (`cli-harness-adapter.ts:514-532`).

All sources are **merged**, with precedence enterprise > team > project > user
(<https://cursor.com/docs/cli/changelog.md>). Permission merge is **deny-wins**: the bundle merges
`"deny" → "ask" → "allow"` in that order of strength. So a project hook cannot be overridden by a user
hook, and vice versa: **a user's own `~/.cursor/hooks.json` also runs and can deny things we allow.**
Not present on this machine today (`~/.cursor/hooks.json` does not exist) and outside our control, since
the adapter forwards the real `HOME` (`adapter-pool.ts` `envAllowlist: ["PATH","HOME","LANG","USER","LOGNAME"]`).

Cursor also reads **Claude Code's** `settings.json` hooks from the same workspace. Irrelevant unless a
sandbox ends up with both a `.claude/` and a `.cursor/` provisioned.

### F8 — A broken hook fails OPEN by default. VERIFIED

A `beforeShellExecution` hook that printed garbage to stderr and exited 3, with no `failClosed`:
**the command ran normally**, exit 0, output produced, agent reported "No errors, no crash".

With `"failClosed": true` on the same broken hook, the command was blocked and the agent was told:

```
Command execution was blocked by a hook: Tool blocked because this hook is configured to fail closed
(block when it fails). Hook "…/crash.sh" failed with exit code 3: not json at all
```

Confirmed in the schema (`Hook script failClosed must be a boolean`, default `false`) and the docs
(<https://cursor.com/docs/hooks.md>: *"By default, hook failures (crash, timeout, invalid JSON) allow the
action through (fail-open)"*). **BA2 must set `failClosed: true`,** or a crashed hook silently un-gates
every rule with no signal to anyone.

Per-hook `timeout` (a positive number, ms) is also supported and was accepted at 5000.

### F9 — What the repo wires for this harness today. VERIFIED

`CURSOR_AGENT_CLI_CONFIG` (`adapter-pool.ts:481-501`): binary `cursor-agent`; args
`-p {{prompt}} --print --output-format stream-json --model {{model}} --trust --approve-mcps`; empty
`envMap` (auth inherited via Cursor login); `envAllowlist ["PATH","HOME","LANG","USER","LOGNAME"]`;
`eventFormat "ndjson"`; `eventDialect "claude-stream-json"`; `mcpConfig { dialect: "cursor-json" }`;
**`returnEnforcementChannel: "none"`**. Registered as `local-cursor-agent`, `type: "cursor-agent"`, at
`:593-607`.

So: **no hook file and no settings file is written into the sandbox for cursor-agent today** — unlike
claude (`settings-claude` → `.claude/settings.json` + Stop hook) and codex (`.codex-home/hooks.json` +
`CODEX_HOME` + `--dangerously-bypass-hook-trust`). The plan's claim that "nothing intercepts what an
agent does in its session" is accurate for this harness. What *is* already written is
`<sandbox>/.cursor/mcp.json` (`cli-mcp-config.ts:168-190`) — the same directory a `hooks.json` would go
in.

Note the repo does **not** pass `-f/--force`. Default headless behaviour without it was proven
permissive: shell commands and file writes ran with no approval and no prompt. That means **AC1 (empty
list ⇒ nothing interrupts) holds today with no change**, and the hook only ever needs to add denials.

---

## Still unknown / not verified

- **Whether a deny can be lifted mid-session without restarting the agent.** The mechanism strongly
  suggests yes — the hook is a fresh process per tool call (multiple invocations observed inside one
  session), so it can read current state each time. I did not run the full "block → approve → retry
  succeeds inside the same session" loop. **Inference, not proof.** It is the single most important
  thing for phase 2 to prove first.
- **Session resumption.** `--resume [chatId]`, `--continue`, and `create-chat` exist in `--help` and
  `system.init` emits a `session_id`. Not exercised. The repo's re-engage path re-spawns in the sandbox
  cwd; whether that resumes or starts fresh for this harness is untested.
- **`{"type": "prompt", "prompt": "…"}` hooks** (an LLM-evaluated hook, accepted by the schema alongside
  command hooks). Not tested, and out of scope — BA2 rules out a classifier.
- **Relative hook script paths.** Docs resolve `./hooks/foo.sh` relative to the `hooks.json` directory.
  All my runs used absolute paths.
- **`--sandbox enabled`** and its interaction with hooks. Untested. The hook payload reported
  `"sandbox": false` under the repo's current flags.
- **How the deny surfaces on `beforeReadFile` and `beforeMCPExecution`** — read from the code
  (same `HookDeniedError` path), not run live.
- **Version drift.** The installed binary is two days old and the docs were fetched today, yet they
  already disagree on `agent_message` and on `"ask"`. This CLI moves weekly. Any BA2 hook contract needs
  a live integration test on the real binary, not a fixture — which the repo's harness lane already
  requires.

---

## One-paragraph summary for the founder

cursor-agent can do this. Drop a `hooks.json` next to the `mcp.json` we already write into the session's
sandbox, point it at a small script, and cursor-agent will call that script before every shell command
and every file write. The script says no, and says why, and the agent reads our sentence and stops —
proven end to end against the real binary with no human present. Two things to get right: only ever say
"deny" (saying "ask" quietly lets the action through), and put the explanation in `user_message`, because
the field the documentation tells you to use is silently thrown away.
