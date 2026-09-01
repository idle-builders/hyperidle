# Interception: cursor-agent

Binary: `/Users/tg/.local/bin/cursor-agent` → `/Users/tg/.local/share/cursor-agent/versions/2026.08.25-3e8eec8/`
Version: `2026.08.25-3e8eec8`. Date of research: 2026-08-31.
Every claim below was run against this binary. No published Cursor documentation was consulted; the binary is the sole authority here.

---

## Verdict

**Yes. cursor-agent can be gated per-session, and the mechanism is a project-local `<workspaceDir>/.cursor/hooks.json` declaring a `preToolUse` command hook that returns `{"permission":"deny","user_message":"<reason>"}` on stdout.**

Every requirement is met:

| Requirement | Status |
|---|---|
| Per-session, not global | **Met.** Config is per-workspace-directory. Nothing under `/Users/tg/.cursor` is read or written for hooks. |
| Deny a specific action, allow everything else | **Met.** Default is allow; the script decides per tool call. |
| Model learns WHY, naming the rule | **Met.** `user_message` reaches the model verbatim inside the tool result. |
| Deny set rewritable between runs, session resumes | **Met.** Proven with `--resume`: same session, rule cleared, command then ran. |
| Auth keeps working (inherited Cursor login) | **Met.** No `HOME` redirect needed, so nothing about auth is touched. |

One caveat, not a blocker: the model receives the reason but does not reliably **quote** it. See Q4.

---

## Correction to the starting premises

The brief said cursor-agent "has no hooks flag at all" and inferred it has no hooks. That inference is wrong. Hooks are **file-configured, not flag-configured** — there is no CLI flag and there never needs to be. The `permissions.deny` route in `cli-config.json` also works but is strictly worse (Q5).

---

## Q1 — Does cursor-agent read project-local config from its working directory?

**Yes, for hooks.** Extracted from the bundle (`190.index.js`), then proven live.

```js
function U(e){return{
  enterpriseConfigPath: "/Library/Application Support/Cursor/hooks.json",
  userConfigPath:            join(homedir(), ".cursor", "hooks.json"),
  projectConfigPath:         join(e, ".cursor", "hooks.json"),   // e = workspace dir
  claudeUserConfigPath:      join(homedir(), ".claude", "settings.json"),
  claudeProjectConfigPath:   join(e, ".claude", "settings.json"),
  claudeProjectLocalConfigPath: join(e, ".claude", "settings.local.json")
}}
```

**Live proof — a real command refused.**

Workspace `…/scratchpad/ws1`, file `.cursor/hooks.json`:

```json
{"version":1,"hooks":{"beforeShellExecution":[{"command":"<abs>/.cursor/hook-deny.sh"}]}}
```

Script returns deny when the command contains `git push`.

```
cd $W && cursor-agent --print --output-format text --force --trust --approve-mcps \
  "Run exactly this shell command and nothing else: git push origin main"
```

Real output:

```
The push was blocked by a hook: BA2-RULE-7 gates `git push` pending human approval.
Nothing was pushed. You'll need to grant that approval (or adjust the hook in
Cursor Settings > Hooks) before this can run.
```

The hook was invoked exactly once with the command text. `--trust` was required; without it the workspace-trust prompt blocks a headless run, as the brief suspected.

**Conclusion: project-local `.cursor/hooks.json` solves per-session isolation directly.** A sandboxed session that gets its own working directory gets its own gate for free.

---

## Q2 — What else scopes config per run, and where does auth actually live?

Auth is in the **macOS keychain**, not a file:

```
$ security dump-keychain | grep -i cursor
    "svce"<blob>="cursor-access-token"     "acct"<blob>="cursor-user"
    "svce"<blob>="cursor-refresh-token"    "acct"<blob>="cursor-user"
```

Three redirection levers, tested:

```
$ CURSOR_CONFIG_DIR=$S/cfgdir cursor-agent status
✓ Logged in as grundtob@gmail.com          # config redirected, auth INTACT
   (a fresh cli-config.json appeared in $S/cfgdir)

$ HOME=$S/fakehome cursor-agent status
Not logged in                              # auth BREAKS

$ XDG_CONFIG_HOME=$S/xdg cursor-agent status
✓ Logged in as grundtob@gmail.com          # auth INTACT
```

From `cursor-config/dist/paths.js`:

```js
function o(){ // config dir
  if (process.env.CURSOR_CONFIG_DIR?.trim()) return process.env.CURSOR_CONFIG_DIR;
  if (process.env.XDG_CONFIG_HOME?.trim())  return join(XDG_CONFIG_HOME,"cursor");
  return join(homedir(), ".cursor");
}
function l(){ return process.env.CURSOR_DATA_DIR?.trim() || join(homedir(),".cursor"); }
```

**Conclusion.** `HOME` is the wrong lever — it breaks auth, exactly as the brief observed, and no auth-file copy fixes it because the credential is in the keychain. `CURSOR_CONFIG_DIR` is the right lever if you ever need to isolate `cli-config.json`, and it leaves auth alone. **But you do not need it for the hook route**, since hooks are already per-workspace. Note `hooks.json`'s *user* path uses `homedir()` directly and ignores `CURSOR_CONFIG_DIR`.

Also note: a run **rewrites** the `cli-config.json` in whatever config dir it is pointed at (it backfills defaults). Never point `CURSOR_CONFIG_DIR` at the user's real `~/.cursor`.

---

## Q3 — Which event covers which action, and what is the payload?

Live map. Workspace `ws3` registered a logging hook on nine events, then the agent was asked to read a file, create a file, and edit a file, with no shell:

```
=== EVENTS FIRED ===
   2 afterFileEdit
   2 beforeReadFile
   4 postToolUse
   5 preToolUse
   1 sessionStart
```

Full event vocabulary from the bundle (`hooks/dist/index.js`):

```
beforeShellExecution  beforeMCPExecution  afterShellExecution  afterMCPExecution
beforeReadFile        afterFileEdit       beforeTabFileRead    afterTabFileEdit
stop                  beforeSubmitPrompt  afterAgentResponse   afterAgentThought
sessionStart          sessionEnd          preCompact           subagentStart
subagentStop          preToolUse          postToolUse          postToolUseFailure
workspaceOpen
```

### `preToolUse` is the one to use — it covers everything

It is the generic pre-execution gate and it fires for file tools as well as shell. Real payloads captured:

```json
{"hook_event_name":"preToolUse","tool_name":"Read",
 "tool_input":{"file_path":"…/ws3/existing.txt"}}

{"hook_event_name":"preToolUse","tool_name":"Write",
 "tool_input":{"file_path":"…/ws3/notes.txt","content":"banana\n"}}
```

Full payload keys: `conversation_id, generation_id, model, tool_name, tool_input, tool_use_id, session_id, hook_event_name, cursor_version, workspace_roots, user_email, transcript_path`.

**There IS a pre-write gate.** `afterFileEdit` being post-hoc is not a limitation, because `preToolUse` fires with `tool_name:"Write"` and the **full content** before the write lands. Proven: with a `preToolUse` deny on `secrets.env`, the file was **not created** (`ls | grep -c secrets.env` → `0`).

### `beforeShellExecution` payload

```json
{"conversation_id":"…","generation_id":"…","model":"default",
 "command":"git push origin main","cwd":"","sandbox":false,
 "session_id":"…","hook_event_name":"beforeShellExecution",
 "cursor_version":"2026.08.25-3e8eec8",
 "workspace_roots":["…/ws1"],
 "user_email":"grundtob@gmail.com","transcript_path":null}
```

**Yes — the script receives the full command text**, so the gate can match on the command, not just a tool name.

**Gotcha: `cwd` is the empty string.** It was `""` in every capture, and the rejected tool call echoed `"workingDirectory":""`. Use `workspace_roots[0]` instead; it was always correct and absolute.

### Other events

- `beforeReadFile` — fires per file read; payload carries `file_path` **and the file `content`**.
- `afterFileEdit` — post-hoc; payload carries `file_path` and `edits:[{old_string,new_string}]`. Useless as a gate, fine as an audit trail.
- `beforeMCPExecution` — MCP tool calls. Untested live (no MCP server configured), but the deny path is identical in code (`H("MCP tool execution", w.user_message)`).
- `beforeSubmitPrompt` and `stop` did **not** fire in `--print` mode. Do not depend on them headlessly.

### `preToolUse` has no `matcher`

Cursor's native `hooks.json` entry supports `command`, `timeout`, `failClosed` — there is **no `matcher` field**. (`matcher` exists only on the Claude-settings compatibility conversion path.) A `preToolUse` hook fires for **every** tool call; the script must dispatch on `tool_name` itself. Keep the script fast — it is on the critical path of every tool call.

---

## Q4 — What does the model see when denied?

**`user_message` reaches the model. `agent_message` is silently dropped on the CLI path.**

Test: script returned `{"permission":"deny","user_message":"SENTINEL_USER_ALPHA","agent_message":"SENTINEL_AGENT_BRAVO"}`. Raw `stream-json`:

```
grep -o "SENTINEL_USER_ALPHA\|SENTINEL_AGENT_BRAVO" stream.json | sort | uniq -c
   3 SENTINEL_USER_ALPHA
```

`SENTINEL_AGENT_BRAVO` appears **zero** times. The tool result the model consumed:

```json
{"type":"tool_call","subtype":"completed","tool_call":{"shellToolCall":{"result":{"rejected":{
  "command":"git push origin main","workingDirectory":"",
  "reason":"Command execution was blocked by a hook: SENTINEL_USER_ALPHA\n\nTo view or modify configured hooks, go to Cursor Settings > Hooks.\n\nAgent note: Do not suggest workarounds to the blocked tool.",
  "isReadonly":false}}}}}
```

`agent_message` is only wired into `PreToolUseRequestResponse({… agentMessage: r.agent_message …})`, which is the ACP/worker protocol path, not the CLI. **Put the reason in `user_message`.**

### The two wrappers differ — `preToolUse` is cleaner

`beforeShellExecution` deny → the model sees:

```
Command execution was blocked by a hook: <user_message>

To view or modify configured hooks, go to Cursor Settings > Hooks.

Agent note: Do not suggest workarounds to the blocked tool.
```

`preToolUse` deny → the model sees:

```
<user_message>

Agent note: Do not suggest workarounds to the blocked tool.
```

**Recommendation: gate on `preToolUse`.** It covers shell and file tools with one hook, and its wrapper does not tell the model to go fiddle with "Cursor Settings > Hooks" — advice that is wrong and unreachable for a headless HyperIdle session. The built-in "Do not suggest workarounds" line is a bonus: in every run the agent stopped rather than routing around the block.

### How far can we influence the text? Fully, but the model paraphrases

`user_message` is inserted verbatim and is unbounded — you can name the rule, the id, and what the human must do. Fallback when omitted is `"<toolName> blocked by preToolUse hook"`.

**Caveat worth designing around.** The model *received* the reason in all cases, but only sometimes echoed it. With `beforeShellExecution` it quoted the sentinel back to the user; with `preToolUse` on a write it paraphrased to `"The write was blocked by a permission check, so secrets.env was not created."` and dropped the sentinel entirely. So:

- HyperIdle must **not** parse the model's prose to learn which rule fired. It already knows — its own hook script decided.
- If the user must see the rule name, HyperIdle should surface it from its own gate, or read `tool_call.result.rejected.reason` out of the `stream-json`, which always carries it verbatim.

---

## Q5 — Does `--force` / `--yolo` override deny?

**No. Deny is authoritative for both mechanisms.** `--yolo` is a documented alias for `--force`.

Every hook-deny test above ran **with `--force`** and was still blocked. The `permissions.deny` route was tested both ways:

```
--- A: deny + --force ---
The command was blocked by your permissions configuration, so nothing was pushed. …
--- B: deny WITHOUT --force ---
The push was blocked — the permissions configuration in this session doesn't allow `git push origin main`. …
```

Blocked identically. Production can safely keep passing `--force`/`--trust`/`--approve-mcps`.

### The `permissions.deny` route, and why it is second-best

It works, and the grammar is real. Config in a `CURSOR_CONFIG_DIR`:

```json
{"version":1,"permissions":{"allow":[],"deny":["Write(**/gated.txt)","Shell(echo:*secret*)"]}}
```

Live:

```
--- A: Write(**/gated.txt) ---   → blocked, file not created (ls | grep -c → 0)
--- B: Shell(echo:*secret*) ---  → blocked ("echo mysecret123")
--- C: control, echo plainvalue --- → "Output: `plainvalue`"
```

**Exact grammar**, from `matchesShell` / `matchesPathEntry` in `index.js`:

- **Shell entries** — `Shell(<pattern>)`. If `<pattern>` contains a `:`, it splits into `commandPattern:argsPattern`; matches when the command pattern globs the base command *or* the whole command, **and** the args pattern globs the argument string. Otherwise it matches if **any** of: glob(pattern, fullCommand), `fullCommand.startsWith(pattern + " ")`, glob(pattern, baseCommand), `baseCommand === pattern`. So `Shell(git push)` matches `git push origin main` by **prefix**, and globs (`*`, `**`) are supported throughout.
- **Path entries** — `Write(<glob>)`, `Read(<glob>)`. Regex `^\s*Write\s*\((.*)\)\s*$`, inner value tilde-expanded, then **glob-matched against the absolute path**. So use `Write(**/name)`, not `Write(name)` — a bare relative name will not match an absolute path.
- Other kinds seen in the persist path: `Mcp(<provider>:<toolName>)`, `WebFetch(<domain>)`, `WebSearch(<term>)`. `Delete` is persisted as a `Write` entry.

**Why not use it for BA2:** it carries **no reason**. The model got only `"blocked by your permissions configuration"` — nothing names the rule, and there is no field to add one. It also needs `CURSOR_CONFIG_DIR` isolation, and a run rewrites that config file. Use it, if at all, only as a belt-and-braces backstop under the hook.

---

## Q6 — Does a changed file take effect mid-session, or only at process start?

**`hooks.json` registration is read once at process start and cached. The hook *script* runs fresh on every tool call.**

Proof: a hook script that wiped `hooks.json` to `{"version":1,"hooks":{}}` on its first invocation, then a run with three separate shell commands:

```
=== hooks.json now ===
{"version":1,"hooks":{}}
=== hook invocations (commands seen) ===
"command":"echo one"
"command":"echo two"
"command":"echo three"
```

The hook kept firing after its own registration was deleted.

**This is better than the brief needs, not worse.** Because the script is re-executed per tool call, put the mutable deny set in a *data* file the script reads (or have the script call HyperIdle over HTTP) and the gate becomes live **mid-session**, not merely per-run. Only the registration is frozen at start.

### Per-run rewritability, proven with `--resume`

```
--- RUN 1: gate active ---
session_id=6c41fbc2-fae6-4a0c-be4c-2c25e63929a5
RESULT: The command was blocked by a hook (RULE_ALPHA: gated pending human approval), so it did not run.

   (denyset.json rewritten between runs — rule cleared)

--- RUN 2: same session resumed, gate cleared ---
RESULT: It ran this time and printed `MARKER_CMD`. | session: 6c41fbc2-fae6-4a0c-be4c-2c25e63929a5
```

Same `session_id`. Requirement 4 is met exactly as specified.

---

## Q7 — What makes this silently not work

**1. Fail-OPEN is the default. This is the dangerous one.**

If the hook script errors, exits non-zero, prints nothing, or prints invalid JSON, the action is **allowed**. Proven with a script that prints `this is not json` and exits 3:

```
--- A: broken hook, failClosed ABSENT ---
The command ran but returned no exit status, so I can't confirm whether it actually executed.
   (it ran)

--- B: same broken hook, failClosed TRUE ---
The command didn't run — a configured hook (`.cursor/broken.sh`) failed with exit code 3,
and it's set to fail closed, so the shell tool was blocked.
```

The bundle confirms four distinct fail-open branches: `exit_nonzero`, `empty_stdout`, `invalid_json`, `invalid_response` — each returns `{success:false}` (allow) unless `failClosed === true`.

**HyperIdle must set `"failClosed": true` on every gating hook entry.** Without it, a crashed gate is an open gate and nothing says so. Note the failure message names the script path and exit code to the model — fine for us, but it leaks the gate's file path.

**2. Config sources MERGE — they do not override.**

All sources are concatenated into one execution list, in order: `enterprise, team, project, user, runtime, claude-project-local, claude-project, claude-user, plugins`. There is no precedence and no override. Any one of them can deny.

**3. cursor-agent reads Claude Code's settings.** `<cwd>/.claude/settings.json`, `<cwd>/.claude/settings.local.json`, and `~/.claude/settings.json` are loaded and their `PreToolUse` hooks are mapped onto cursor's `preToolUse` (`Bash→Shell, Read→Read, Write→Write, Edit→Write, Grep→Grep, WebFetch→WebFetch, WebSearch→WebSearch, Task→Task`). **In this repo that means HyperIdle's own `.claude/settings.json` hooks would fire inside a cursor-agent session** if a session's workspace is the repo. Audit that before shipping.

**4. Symlinked config paths are refused.** The loader rejects any config path containing a symlink (`refusing to load config path that contains a symlink`). A sandbox that symlinks `.cursor` into place gets a **silently ungated** session. Write real files.

**5. Writing Claude's hook shape into cursor's file.** Cursor's shape is `{"version":1,"hooks":{"<event>":[{"command":"…"}]}}`. Claude's nested `{"hooks":{"PreToolUse":[{"matcher":…,"hooks":[…]}]}}` is a different shape and will not register in `.cursor/hooks.json`. This is almost certainly what produced the earlier "cursor ignores hooks" conclusion.

**6. `permission:"ask"` is a third value.** For `beforeShellExecution` the code routes it to an interactive prompt. Untested headlessly and there is no reason to risk it — **use `deny` only**.

**7. Absolute paths in `command`.** Relative script paths were not tested; the payload `cwd` is empty, so do not rely on relative resolution.

---

## Recommended shape for HyperIdle

Per session, in the session's sandboxed working directory:

```
<sessionDir>/.cursor/hooks.json     ← written once at session start (registration is frozen anyway)
<sessionDir>/.cursor/gate.sh        ← the gate; re-executed on every tool call
<sessionDir>/.cursor/denyset.json   ← rewritable at any time, including mid-session
```

`hooks.json`:

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      { "command": "/abs/path/<sessionDir>/.cursor/gate.sh", "failClosed": true }
    ]
  }
}
```

`gate.sh` reads the JSON payload on **stdin**, dispatches on `tool_name` (`Shell` / `Write` / `Read` / MCP), matches against the current deny set, and prints on **stdout** either:

```json
{"permission":"allow"}
```

or

```json
{"permission":"deny","user_message":"<rule id>: <why>, and what the human must do"}
```

Invocation stays as production has it: `--print --output-format stream-json --force --trust --approve-mcps`. Read the rule back out of `tool_call.result.rejected.reason` in the stream rather than trusting the model's prose.

Also confirmed: **hooks fire under `--sandbox enabled`**, and the **hook script itself runs unsandboxed** (`sandboxPolicy:{perUser:{type:"insecure_none"}}` in the executor). Proven — the script wrote `/tmp/cursor-hook-escaped-sandbox.marker` from inside a sandboxed run while the agent's own `echo` was denied. So the gate can reach the network to ask HyperIdle's server for a decision even when the agent is confined.
