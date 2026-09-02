# opencode as an agent harness — definitive reference

- **Binary:** `/opt/homebrew/bin/opencode` → `/opt/homebrew/Cellar/opencode/1.18.25/bin/opencode`
- **Version:** `1.18.25` (`opencode --version`)
- **Date of all runs:** 2026-09-02
- **Machine:** Darwin 24.6.0 arm64, Node `v24.18.0` on PATH
- **Model for live runs:** `openrouter/z-ai/glm-4.7-flash` (the repo's locked opencode test model)
- **Produced by:** Claude Code research pass for BA2, from the worktree `/Users/tg/hyperidle/.claude/worktrees/gate-build`
- **Supersedes:** `interception-opencode.md` and the opencode sections of `session-continuation.md` in this folder.

Every claim below is tagged **(TEST)** — a command run against this binary, with its real output — or
**(WEB)** — a URL fetched on 2026-09-02, quoted. Nothing is inferred. Where the two disagree it is
called out and TEST wins.

opencode is open source. Source citations are against the **exact release tag** of the installed
binary: `https://github.com/sst/opencode` at tag `v1.18.25`. Raw files were fetched from
`https://raw.githubusercontent.com/sst/opencode/v1.18.25/<path>`.

All experiments ran in throwaway git repos under `/tmp/ocx/*` with `XDG_CONFIG_HOME` pointed at a
scratch dir. The user's `~/.config/opencode` was read, never written. No credential value is recorded
anywhere in this document.

---

## Claims table

| # | Claim | Kind | Reference |
|---|---|---|---|
| 1 | Installed version is `1.18.25`; latest release is `1.18.26` (2026-09-01) | TEST + WEB | `opencode --version`; `api.github.com/repos/sst/opencode/releases` |
| 2 | Release cadence: 12 releases between 2026-08-07 and 2026-09-01 (~3/week) | WEB | GitHub releases API, §1 |
| 3 | `tool.execute.before` receives args on the **SECOND** parameter as `output.args`; the first carries only `{tool, sessionID, callID}` | TEST + WEB | probe plugin log §5.3; `packages/plugin/src/index.ts` and `packages/opencode/src/session/tools.ts:104-110` |
| 4 | A plugin denies a tool call by **throwing**; the thrown message reaches the model verbatim | TEST + WEB | §5.4; `docs/plugins.mdx:250-253` |
| 5 | A denied call appears in the JSON stream as `tool_use` with `part.state.status:"error"` and `part.state.error` = the message. Exit code stays **0** | TEST | §3.4, §5.4 |
| 6 | A plugin that **fails to import** (syntax error) is silently skipped — nothing on stdout, nothing on stderr even at `--log-level DEBUG`. The gate is inert and the run proceeds | TEST | §5.6 variant 1 |
| 7 | A plugin whose factory throws, or which exports a non-function, logs one `level=ERROR ... "failed to load plugin"` line to **stderr only**, then proceeds | TEST | §5.6 variants 2, 3 |
| 8 | `opencode debug info` lists a plugin that failed to load — it lists configured origins, not loaded plugins. It is **not** a liveness check | TEST | §5.6 |
| 9 | `--pure` disables every external plugin including the sandbox's own, with no message at any log level | TEST | §5.7 |
| 10 | `XDG_CONFIG_HOME` moves only the config dir. `data`, `cache`, `state` are unaffected | TEST | §8.1 |
| 11 | `opencode run` **blocks reading stdin to EOF whenever stdin is not a TTY**. An inherited open pipe hangs the process indefinitely with zero output | TEST + WEB | §9.1; `cli/cmd/run.ts:416` |
| 12 | Piped stdin is appended to / becomes the prompt | TEST | §2.5 |
| 13 | Two concurrent `opencode run` processes on the same data dir frequently kill one with `database is locked`, exit 1, **zero bytes on stdout** | TEST | §9.3 |
| 14 | A per-run `XDG_DATA_HOME` removes the lock collision entirely (3/3 concurrent runs green) | TEST | §9.3 |
| 15 | Default permission for the `build` agent is `"*": "allow"` — a zero-config headless run allows everything | TEST + WEB | §6.1; `agent/agent.ts:120` |
| 16 | Reading a `*.env` file, and any path outside the worktree, defaults to `ask` → **auto-rejected** in `opencode run` without `--auto` | TEST + WEB | §6.2; `agent/agent.ts:122-135` |
| 17 | The auto-reject notice goes to **stderr**, not stdout; the JSON stream stays clean | TEST | §6.2 |
| 18 | `OPENCODE_PERMISSION` is a real, working, **undocumented** env var, deep-merged over the resolved config | TEST | §6.3; absent from `docs/permissions.mdx` |
| 19 | A whole-tool `deny` (`{"bash":"deny"}`) **removes the tool from the model's toolset entirely** — no denial message, the tool just does not exist | TEST + WEB | §6.4; `session/llm/request.ts:209-213`, `permission/index.ts:204-219` |
| 20 | A pattern deny (`{"bash":{"*":"allow","x*":"deny"}}`) keeps the tool and denies the call with fixed prose + the matched ruleset as JSON | TEST | §6.4 |
| 21 | Invalid `OPENCODE_PERMISSION` JSON is skipped with a WARN — fail-open | TEST | §6.3 |
| 22 | The `permission.ask` plugin hook is declared in the types and in opencode's own built-in docs, but is **never dispatched** — it did not fire once | TEST + WEB | §5.5; binary `trigger("...")` inventory |
| 23 | Measured builtin tool ids: `invalid question bash read glob grep edit write task webfetch todowrite skill` | TEST | §7.1 |
| 24 | The shell tool's id and permission key are `bash`, not `shell` | TEST + WEB | §7.1; `tool/shell/id.ts:15-17` |
| 25 | For `gpt-*` models `edit`/`write` are replaced by `apply_patch` | WEB | `tool/registry.ts:297-300` |
| 26 | MCP tool name = `sanitize(server) + "_" + sanitize(tool)`, e.g. `hyperidle_ask_human` | TEST + WEB | §7.2; `mcp/catalog.ts:117-119` |
| 27 | MCP tool calls pass through `tool.execute.before` exactly like builtins | TEST | §7.2 |
| 28 | A dead MCP server logs `WARN "server unavailable"` and the run continues, exit 0 | TEST | §7.3 |
| 29 | A git repo with **no commits** gets `projectID = "global"` and shares its session namespace with 1613 other sessions on this machine | TEST | §4.2 |
| 30 | Sessions live in one global SQLite file `~/.local/share/opencode/opencode.db` (2.9 GB here) | TEST | §4.1 |
| 31 | A bogus `--session` id fails loudly: exit 1, `Error: Session not found`, in ~1s | TEST | §4.3 |
| 32 | Resume works with `--dir`, without `--dir`, and with `--continue`; the prior "`--dir` shape must match" hang was the stdin bug | TEST | §4.4 |
| 33 | Resume with a `--dir` that differs from the session's own directory **hangs forever** with zero stdout while the turn actually executes | TEST | §4.5 |
| 34 | Resuming from a different `XDG_DATA_HOME` fails loudly: exit 1, `Session not found` | TEST | §4.6 |
| 35 | `--format json` emits exactly six event types: `step_start`, `step_finish`, `text`, `reasoning`, `tool_use`, `error` | TEST + WEB | §3.2; `cli/cmd/run.ts` emit call sites |
| 36 | Session id is on every emitted line as top-level `sessionID` | TEST | §3.3 |
| 37 | Token usage and cost are on `step_finish.part.tokens` / `.cost` | TEST | §3.5 |
| 38 | `tool.execute.before` may be async and opencode waits indefinitely — a 45 s hook was honoured with no timeout | TEST | §5.9 |
| 39 | Hooks run sequentially in plugin order; the first throw short-circuits the remaining plugins | TEST | §5.8 |
| 40 | Both `.opencode/plugin/` and `.opencode/plugins/` load; docs name only the plural | TEST + WEB | §5.2; `docs/plugins.mdx:22-23` |
| 41 | First plugin load writes 3645 files / 61 MB of `node_modules` into `<sandbox>/.opencode/`, +1.4 s cold, needs network | TEST | §5.2 |
| 42 | `tool.definition` hook rewrites the tool description the model sees — a third channel for rule text | TEST | §5.10 |
| 43 | The full product loop works end to end on the real binary: block → model asks a human via MCP → session ends → later resume delivers the verdict → the gate allows the retry | TEST | §10 |
| 44 | The gate plugin lives inside the agent's own sandbox at `.opencode/plugin/*.js`; the agent read it unprompted during a run | TEST | §5.4, §11 |
| 45 | Without `--model`, opencode uses the user's most recent model from `~/.local/state/opencode/model.json` | TEST | §8.2 |
| 46 | Config search order: global `config.json` → global `opencode.json` → global `opencode.jsonc` → `<dir>/opencode.json` → `<dir>/.opencode/opencode.json` → `<dir>/.opencode/opencode.jsonc` | TEST | §8.3 |
| 47 | `OPENCODE_CONFIG_DIR` **adds** a config directory, it does not replace the global one | WEB | `config/paths.ts:23-41` |
| 48 | Default bash tool timeout is 120000 ms; the model can override per call | WEB | `tool/shell.ts:347` |
| 49 | `opencode run` injects a hard-coded session ruleset denying `question`, `plan_enter`, `plan_exit` | TEST + WEB | §6.1; `cli/cmd/run.ts:429-446` |
| 50 | Exit 1 cases measured: no message, unknown flag, bogus session, model/provider error, `database is locked`. Exit 0: successful run, plugin-denied call, permission-denied call, dead MCP server | TEST | §2.6 |

---

## 1. Identity

**(TEST)**

```
$ opencode --version
1.18.25

$ readlink -f /opt/homebrew/bin/opencode
/opt/homebrew/Cellar/opencode/1.18.25/bin/opencode

$ file /opt/homebrew/Cellar/opencode/1.18.25/bin/opencode
... : Mach-O 64-bit executable arm64

$ ls -la /opt/homebrew/Cellar/opencode/1.18.25/bin/opencode
-r-xr-xr-x@ 1 tg admin 144123746 Aug 28 07:41 ...
```

A 144 MB single-file Bun-compiled binary, installed by Homebrew. The JS bundle is embedded and is
greppable with `LC_ALL=C grep -a`.

**Version reporting.** `opencode --version` prints the bare version and exits 0. `opencode debug info`
prints `opencode version: 1.18.25`, OS, terminal, and the plugin origin list.

**Release cadence (WEB, `https://api.github.com/repos/sst/opencode/releases`, fetched 2026-09-02):**

```
v1.18.26 2026-09-01T21:52:15Z
v1.18.25 2026-08-28T05:58:20Z   <- installed
v1.18.24 2026-08-28T04:10:14Z
v1.18.23 2026-08-25T06:30:49Z
v1.18.22 2026-08-24T14:37:19Z
v1.18.21 2026-08-21T14:51:11Z
v1.18.20 2026-08-21T08:09:31Z
v1.18.19 2026-08-20T06:22:06Z
v1.18.18 2026-08-13T01:15:04Z
v1.18.17 2026-08-12T20:25:07Z
v1.18.16 2026-08-10T06:07:08Z
v1.18.15 2026-08-07T06:49:55Z
```

Twelve releases in 25 days, sometimes two in the same hour. The npm `dist-tags` for
`@opencode-ai/plugin` also carry a `dev` channel that publishes several times a day
(`0.0.0-dev-202609020429`). **Treat any behaviour here as version-pinned.** A HyperIdle gate that
depends on plugin internals needs a version assertion.

**Canonical URLs**

| What | URL |
|---|---|
| Docs home | `https://opencode.ai/docs/` |
| CLI | `https://opencode.ai/docs/cli/` |
| Plugins | `https://opencode.ai/docs/plugins/` |
| Permissions | `https://opencode.ai/docs/permissions/` |
| MCP servers | `https://opencode.ai/docs/mcp-servers/` |
| Config JSON Schema | `https://opencode.ai/config.json` |
| Source repo | `https://github.com/sst/opencode` |
| Docs source (`.mdx`) | `packages/web/src/content/docs/*.mdx` in that repo |
| Plugin type contract | `packages/plugin/src/index.ts` in that repo |

The binary also ships a built-in skill, `customize-opencode`, whose body is a compact authoritative
config reference. Read it with **(TEST)** `opencode debug skill`. It is more accurate than the website
in several places (it names both plugin directory spellings, for instance).

---

## 2. Invocation

### 2.1 Command surface (TEST, `opencode --help`)

```
opencode [project]           start opencode tui                       [default]
opencode run [message..]     run opencode with a message
opencode serve               starts a headless opencode server
opencode attach <url>        attach to a running opencode server
opencode session             manage sessions          (list | delete)
opencode export [sessionID]  export session data as JSON
opencode import <file>       import session data from JSON file or URL
opencode db                  database tools           (query | path)
opencode debug               debugging and troubleshooting tools
opencode mcp                 manage MCP servers
opencode models [provider]   list all available models
opencode stats               show token usage and cost statistics
opencode agent | providers | plugin | upgrade | uninstall | github | pr | acp | web | completion
```

Only `run` is a headless one-shot. The bare `opencode` entry point is the TUI; its `--prompt` flag
exists but does not give a headless one-shot exchange.

### 2.2 `opencode run` flags relevant to automation (TEST, `opencode run --help`)

| Flag | Meaning |
|---|---|
| `[message..]` | positional prompt (multiple words are joined with spaces) |
| `--format default\|json` | `json` = raw JSON events, one per line. Default is human-formatted |
| `-m, --model provider/model` | e.g. `openrouter/z-ai/glm-4.7-flash` |
| `--variant` | provider-specific reasoning effort |
| `--agent <name>` | which agent to run as |
| `-s, --session <id>` | resume that session |
| `-c, --continue` | resume the most recent session |
| `--fork` | fork on resume (requires `--continue` or `--session`) |
| `--dir <path>` | directory to run in (also `process.chdir`s) |
| `--command <name>` | run a slash command instead of a prompt |
| `-f, --file <path>` | attach files |
| `--title` | name the session |
| `--auto` | auto-approve anything not explicitly denied |
| `--pure` | run without external plugins |
| `--print-logs`, `--log-level DEBUG\|INFO\|WARN\|ERROR` | structured logs to stderr |
| `--thinking` | emit `reasoning` events |
| `--share` | share the session |
| `--attach <url>`, `-p/--password`, `-u/--username`, `--port` | drive a running server instead |
| `-i, --interactive` | split-footer interactive mode (not headless) |

`--dir` is **not** a global flag. `opencode debug config --dir X` prints the help text and does
nothing. Only `run` (and the TUI positional) accept it. **(TEST)**

### 2.3 What `--dir` actually does (WEB, `cli/cmd/run.ts:334-346`)

```ts
const directory = (() => {
  if (!args.dir) return args.attach ? undefined : root
  if (args.attach) return args.dir
  try {
    process.chdir(path.isAbsolute(args.dir) ? args.dir : path.join(root, args.dir))
    return process.cwd()
  } catch {
    UI.error("Failed to change directory to " + args.dir)
    process.exit(1)
  }
})()
```

It `chdir`s the process. Passing `--dir` and setting `cwd` are equivalent for a fresh session; they
are **not** equivalent on resume (§4.5).

### 2.4 `--pure` (TEST)

`--pure` sets `OPENCODE_PURE=1`, which replaces the external plugin origin list with `[]`
(**WEB**, `plugin/index.ts:181`: `const plugins = flags.pure ? [] : (cfg.plugin_origins ?? [])`).
Line 182-183 of the same file is an **empty `if` block** where a warning presumably used to live:

```ts
const plugins = flags.pure ? [] : (cfg.plugin_origins ?? [])
if (flags.pure && cfg.plugin_origins?.length) {
}
```

Measured: with a working deny plugin in `.opencode/plugin/`, `--pure` let the blocked command through
and printed nothing about plugins even at `--log-level DEBUG`. See §5.7. `--pure` gives **no** config,
MCP or auth isolation.

### 2.5 stdin (TEST — and this is the single most consequential finding in this document)

**WEB**, `cli/cmd/run.ts:416`:

```ts
const piped = process.stdin.isTTY ? undefined : await Bun.stdin.text()
```

`opencode run` reads stdin **to EOF** before doing anything else whenever stdin is not a TTY. Proof
with no model call at all — an invocation that must fail with "you must provide a message":

```
### A: no message, stdin=/dev/null
$ opencode run --dir "$SB" </dev/null
exit=1 elapsed=1s stderr=Error: You must provide a message or a command

### B: no message, stdin = a pipe held open for 25s
$ ( sleep 25 ) | opencode run --dir "$SB"
elapsed=25s exit=1 stderr=Error: You must provide a message or a command
```

25 s of pipe = 25 s of silence, then the identical error. Piped content, if any, becomes the prompt:

```
$ echo "PIPED-TEXT-ONLY" | opencode run --dir "$SB"
exit=0 elapsed=6s
stdout: What would you like me to do?
```

**Consequence:** any parent that spawns `opencode run` with an inherited or unclosed pipe on stdin
gets a process that produces zero bytes and never exits. Always spawn with stdin `/dev/null` (or close
it immediately). This is §12's refutation of the "intermittent init stall".

### 2.6 Exit codes (TEST)

| Situation | Exit | stdout | stderr |
|---|---|---|---|
| successful run | 0 | JSON events | empty |
| tool call denied by a plugin throw | **0** | `tool_use` with `state.status:"error"` | empty |
| tool call denied by permission rule | **0** | same | empty |
| permission auto-rejected (`ask`) | 0 | same | `! permission requested: read (.env); auto-rejecting` |
| dead MCP server | 0 | normal events | `WARN "server unavailable" key=broken type=local status=failed` |
| no message and no `--command` | 1 | empty | `Error: You must provide a message or a command` |
| unknown flag | 1 | yargs usage text | empty |
| `--session` id does not exist | 1 | empty | `Error: Session not found` |
| `--fork` without `--continue`/`--session` | 1 | — | `Error: --fork requires --continue or --session` |
| unknown model id | **1** | one `{"type":"error",...}` line | empty |
| concurrent run loses the DB lock | **1** | **empty** | `Error: Unexpected error` + `database is locked` |
| resume with a mismatched `--dir` | never exits | **empty** | debug logs only |

Two of these are traps: a lost DB lock and a mismatched-`--dir` resume both produce **zero JSON**, so a
caller that only parses stdout sees an empty stream and must fall back to the exit code — and in the
hang case, to a timeout.

---

## 3. Output protocol

### 3.1 How the stream is produced (WEB, `cli/cmd/run.ts:679-692`)

```ts
function emit(type: string, data: Record<string, unknown>) {
  if (args.format === "json") {
    process.stdout.write(JSON.stringify({ type, timestamp: Date.now(), sessionID, ...data }) + EOL)
    return true
  }
  return false
}
```

Newline-delimited JSON. Every line has `type`, `timestamp` (ms epoch), `sessionID`, plus the payload.

### 3.2 The complete event vocabulary (TEST + WEB)

Six types, and only six. Grepping every `emit("` call site in `cli/cmd/run.ts`:

```
725:  emit("tool_use",    { part })
746:  emit("step_start",  { part })
750:  emit("step_finish", { part })
754:  emit("text",        { part })
767:  emit("reasoning",   { part })
789:  emit("error",       { error: props.error })
855:  emit("error",       { error: result.error })
872:  emit("error",       { error: result.error })
```

| Type | When | Notes |
|---|---|---|
| `step_start` | each LLM step begins | carries `part.snapshot` (a git-ish content hash) |
| `tool_use` | a tool part reaches status `completed` **or** `error` | intermediate `running`/`pending` states are **not** emitted in JSON mode |
| `step_finish` | each LLM step ends | carries `tokens` and `cost` |
| `text` | an assistant text part completes | |
| `reasoning` | a reasoning part completes | only when `--thinking` is passed |
| `error` | `session.error` for this session, or a failed prompt/command call | also sets exit 1 |

There is no `session_start`, no `session_end`, no `init`, no `done`. The stream simply stops when the
session goes idle.

### 3.3 Where the session id appears (TEST)

Top level on every line, and again inside `part`:

```json
{"type":"step_start","timestamp":1788332821769,"sessionID":"ses_f9f0ebaccffeN5OMRA3I7fnRZP",
 "part":{"id":"prt_...","messageID":"msg_...","sessionID":"ses_f9f0ebaccffeN5OMRA3I7fnRZP",
         "snapshot":"853694...","type":"step-start"}}
```

The **first line of stdout** is enough to capture it. Session ids are `ses_` + 25 chars. The same id
comes back on resume, so continuity is observable on the wire.

### 3.4 How a blocked call appears (TEST)

Plugin throw — the message is ours, verbatim:

```json
{"type":"tool_use","timestamp":...,"sessionID":"ses_...","part":{
  "type":"tool","tool":"bash","callID":"call_...",
  "state":{"status":"error",
           "input":{"command":"bash deploy.sh"},
           "error":"BLOCKED by rule prod-deploy. This action needs a human's approval. Call the hyperidle_ask_human tool to request it, then stop and end your turn. Do not retry and do not work around it."}}}
```

Permission rule deny — fixed prose plus the matched ruleset as JSON:

```json
"error":"The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules [{\"permission\":\"*\",\"action\":\"allow\",\"pattern\":\"*\"},{\"permission\":\"bash\",\"pattern\":\"*\",\"action\":\"allow\"},{\"permission\":\"bash\",\"pattern\":\"*BLOCKED-CMD*\",\"action\":\"deny\"}]"
```

Permission auto-reject (a rule resolving to `ask` in a non-`--auto` run):

```json
"error":"The user rejected permission to use this specific tool call."
```

All three are the **same structural shape**: `tool_use` / `state.status:"error"` / `state.error`. A
consumer cannot tell a policy denial from a crashed hook from an ordinary tool failure by shape alone —
only by the text. Put a machine-readable marker in your deny message.

### 3.5 Tokens and cost (TEST)

```json
{"type":"step_finish", ..., "part":{"reason":"tool-calls","tokens":{"total":7245,"input":7133,
 "output":10,"reasoning":38,"cache":{"write":0,"read":64}},"cost":0.00044782}}
```

`reason` is `"tool-calls"` or `"stop"`. Cost is USD. Cache read/write proves context reuse on resume —
the resumed turn opened at `cache.read: 7616` continuing the previous turn.

### 3.6 What does **not** go to stdout (TEST)

- The permission auto-reject notice → **stderr** (`! permission requested: read (.env); auto-rejecting`).
- Plugin load failures → stderr at best, often nothing at all (§5.6).
- MCP server failures → stderr `WARN`.
- `database is locked` → stderr, plain text, not JSON.

The JSON stream was never polluted by a non-JSON line in any of the ~40 runs here. Every stdout line
parsed as JSON.

---

## 4. Session model

### 4.1 Where sessions live (TEST)

Not files — one global SQLite database.

```
$ opencode db path
/Users/tg/.local/share/opencode/opencode.db

$ du -sh ~/.local/share/opencode
2.9G

$ opencode db "select name from sqlite_master where type='table' order by name"
__drizzle_migrations account account_state control_account credential data_migration event
event_sequence message migration part permission project project_directory session
session_context_epoch session_input session_message session_share sqlite_sequence todo workspace
```

The data dir also holds `auth.json` (provider credentials), `log/`, `snapshot/` (per-project git-like
snapshots of the working tree), `storage/`, `tool-output/`, `repos/`.

`~/.local/state/opencode/` holds `model.json` (recently used models), `prompt-history.jsonl` (every
prompt the user has ever typed) and a `locks/` directory with 1180 entries.

A transcript can be exported: **(TEST)** `opencode export <sessionID>` → `{"info": {...}, "messages":
[{"info":..., "parts":[...]}, ...]}`. `--sanitize` redacts sensitive transcript and file data.

### 4.2 Project scoping — and the "global" bucket trap (TEST)

Sessions are keyed by a project id. `opencode debug scrap` lists known projects.

```
$ opencode db "select project_id, count(*) c from session group by 1 order by c desc limit 6"
project_id                                 c
c0919c5a9b3c8a04993786660bb467b75af1ba6a   1961     <- /Users/tg/hyperidle
global                                     1613
fc1bc6a4c9688ac59e0d2e04085007d5b76a51fa   450
...
```

A git repo **with no commits** resolves to project id `"global"`:

```
$ cd /tmp/ocx/sess && git init -q .   # no commit yet
$ opencode debug scrap | head
[ { "id": "global", "worktree": "/private/tmp/ocx/sess", "vcs": "git", ... } ]

$ opencode session list        # from that empty repo
... 102 rows, including sessions created in completely unrelated directories
```

After a single commit the same directory got its own hash:

```
$ git add -A && git commit -qm init
$ opencode run "say ok" --dir /tmp/ocx/sess --print-logs --log-level INFO 2>&1 | grep -o 'projectID=[a-z0-9]*'
projectID=7fd5a93088640c9f7b10ffcba0861db2c7983938

$ opencode session list        # now scoped
2 sessions
```

**Consequence for a sandbox harness:** a freshly `git init`ed sandbox with no commit lands in the same
session namespace as every other commit-less directory on the machine, and `opencode session list`
there enumerates the user's unrelated sessions. Commit once in the sandbox, or isolate
`XDG_DATA_HOME`, or both.

### 4.3 Bogus session id — fails loudly (TEST)

```
$ opencode run "hi" --dir "$SB" --session ses_doesnotexist --format json </dev/null
exit=1 elapsed=1s
stdout: (empty)
stderr: Error: Session not found
```

**WEB**, `cli/cmd/run.ts:455-465` — `sdk.session.get(...)` then `if (!current?.data) { UI.error("Session not found"); process.exit(1) }`.

### 4.4 Resume works in every reasonable shape (TEST)

Codeword `PLUM-42` planted in phase 1 with `--dir /tmp/ocx/sess`:

| Resume form | Result |
|---|---|
| `run "..." --dir /tmp/ocx/sess --session <id>` | **works**, 5 s, answered `PLUM-42`, `cache.read: 7296` |
| `run "..." --session <id>` (cwd = the same sandbox, no `--dir`) | **works**, 3 s, answered `PLUM-42` |
| `run "..." --dir <sandbox> --continue` | works |
| `run "..." --dir <sandbox> --session <id> --fork` | works (documented; `--fork` requires one of the two) |

This **refutes** the prior note's claim that the `--dir` shape must match between phase 1 and phase 2.
That claim's four hanging cells were the stdin bug of §2.5; with stdin closed, all four work.

### 4.5 The one resume shape that genuinely hangs (TEST)

Resuming a session with a `--dir` that points at a **different directory than the session's own**:

```
$ cd /tmp && opencode run "What was the codeword?" --dir /tmp/ocx/p1 --session <id-from-/tmp/ocx/sess> \
    --format json --print-logs --log-level DEBUG </dev/null
```

After 197 s: **0 bytes on stdout**, process alive, never exits. The debug log shows why:

```
message="creating instance" directory=/private/tmp/ocx/p1
message="creating instance" directory=/private/tmp/ocx/sess
...
message=loop session.id=ses_f9f093371ffeoUprHkXtgXpQ6O step=1
message="exiting loop" session.id=ses_f9f093371ffeoUprHkXtgXpQ6O
message=cleanup prune=7.days
```

Two instances are created — one for the CLI's `--dir`, one for the session's own directory. The turn
runs to completion on the session's instance; the printer loop in `run.ts` is subscribed to the
`--dir` instance's event stream, never sees `session.status: idle`, and never breaks. **The work
happens and the caller learns nothing, forever.** A harness must either pass the session's own
directory on resume or not pass `--dir` at all, and must have a hard wall-clock timeout regardless.

### 4.6 Data-dir binding (TEST)

```
$ XDG_DATA_HOME=/tmp/ocx/d1 opencode run "hello" --dir /tmp/ocx/e2e --session <id-from-default-data-dir>
exit=1
Error: Session not found
```

Loud and correct. The session store follows `XDG_DATA_HOME`, so a per-run isolated data dir means
resume must use the same one.

---

## 5. Interception — the plugin system

### 5.1 The contract (WEB, `packages/plugin/src/index.ts` at tag v1.18.25)

```ts
export type PluginInput = {
  client: ReturnType<typeof createOpencodeClient>
  project: Project
  directory: string
  worktree: string
  experimental_workspace: { register(type: string, adapter: WorkspaceAdapter): void }
  serverUrl: URL
  $: BunShell
}
export type Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>
export type PluginModule = { id?: string; server: Plugin; tui?: never }
```

Measured **(TEST)** — the probe plugin logged its own input keys:

```
PLUGIN_FACTORY_CALLED input_keys=["client","project","worktree","directory","experimental_workspace","serverUrl","$"]
PLUGIN_FACTORY directory=/private/tmp/ocx/s1 worktree=/private/tmp/ocx/s1 serverUrl=http://localhost:4096/
```

Note `serverUrl` is the **fallback** `http://localhost:4096` at factory time (`plugin/index.ts:163-165`
returns `Server.url ?? new URL("http://localhost:4096")`, and the real server URL is not yet bound
when plugins are constructed). Do not treat it as a live address at load time.

There is no `ctx.on(...)`, no event-emitter registration, no `PreToolUse`. Dispatch is by **object
key** on the returned hooks object.

**Every export of the module must be a function.** (WEB, `plugin/index.ts:99-112`, `getLegacyPlugins`
iterates `Object.values(mod)` and `if (!plugin) throw new TypeError("Plugin export is not a function")`).
Adding `export const settings = { ... }` to an otherwise-working plugin kills the whole plugin — proven
in §5.6 variant 3.

### 5.2 Where plugins load from (TEST + WEB)

Measured with three files in two directories:

```
$ opencode debug info
plugins:
- file:///private/tmp/ocx/plug/.opencode/plugin/a-singular.js
- file:///private/tmp/ocx/plug/.opencode/plugin/c-second.js
- file:///private/tmp/ocx/plug/.opencode/plugins/b-plural.js
```

Both spellings load, `plugin/` before `plugins/`, alphabetical within a directory, **every** `.js`
(and `.ts`) file. A stale file left in the directory still runs — clear the directory when
re-provisioning.

The public docs name only the plural. **(WEB, `docs/plugins.mdx:22-23`)**:

> `.opencode/plugins/` - Project-level plugins
> `~/.config/opencode/plugins/` - Global plugins

The binary's own built-in skill is more accurate **(TEST, `opencode debug skill`)**:

> "Auto-discovered plugins (no config entry needed): any `*.ts` or `*.js` file in `.opencode/plugin/` or `.opencode/plugins/`."

Additional origins: `plugin: [...]` in `opencode.json` (npm specs, `./relative.ts`, `file:///abs.js`,
or `["name", {options}]` tuples), and `~/.config/opencode/plugins/` globally.

**Cost of the plugin route (TEST).** The first load in a fresh sandbox writes `package.json`,
`package-lock.json`, `.gitignore` and a full `node_modules/` into `<sandbox>/.opencode/`:

```
cold-with-plugin ms=2028      files=3645  size=61M
warm-with-plugin ms=655
no-plugin        ms=606
```

So ~1.4 s and 61 MB on first load, and it needs network (`bun install` — **WEB**, `docs/plugins.mdx:86`:
"OpenCode runs `bun install` at startup to install these"). `.opencode/.gitignore` is written covering
`node_modules`, `package.json`, `package-lock.json`, `bun.lock`, `.gitignore`, so git status stays
clean apart from the `.opencode/` directory itself.

### 5.3 `tool.execute.before` — the exact signature (TEST + WEB)

**WEB**, `packages/plugin/src/index.ts`:

```ts
"tool.execute.before"?: (
  input: { tool: string; sessionID: string; callID: string },
  output: { args: any },
) => Promise<void>
```

**WEB**, the call site, `packages/opencode/src/session/tools.ts:104-110`:

```ts
yield* plugin.trigger(
  "tool.execute.before",
  { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID },
  { args },
)
```

**TEST**, a probe plugin that logs both parameters of a real run:

```
HOOK tool.execute.before ARG1={"tool":"bash","sessionID":"ses_f9f0c3651ffeeczlHz7ac3d6J0","callID":"call_9463"} ARG2={"args":{"command":"echo probe-run"}}
HOOK tool.execute.before ARG1={"tool":"read","sessionID":"ses_f9f0c3651ffeeczlHz7ac3d6J0","callID":"call_fa50"} ARG2={"args":{"filePath":"/private/tmp/ocx/s1/README.md"}}
```

**The prior claim is CONFIRMED three ways.** Reading `input.input` gives `undefined`; reading `input`
gives only the three identifiers. The arguments are `output.args` on the **second** parameter. A gate
that reads the first parameter sees no command, matches no rule, and allows everything while looking
like it works.

`tool.execute.after` is `(input: {tool, sessionID, callID, args}, output: {title, output, metadata})` —
here the args **are** on the first parameter. The two hooks differ. **(TEST)**:

```
HOOK tool.execute.after ARG1={"tool":"read","sessionID":"ses_...","callID":"call_fa50","args":{"filePath":"/private/tmp/ocx/s1/README.md"}}
```

### 5.4 Denying — throw (TEST + WEB)

**WEB**, `docs/plugins.mdx:249-256`:

```ts
return {
  "tool.execute.before": async (input, output) => {
    if (input.tool === "read" && output.args.filePath.includes(".env")) {
      throw new Error("Do not read .env files")
    }
  },
}
```

There is no return-value protocol — no `{permission:"deny"}`, no exit code. Throwing is the mechanism.
Mechanically **(WEB, `plugin/index.ts:294)** the dispatcher is
`yield* Effect.promise(async () => fn(input, output))` — a rejected promise becomes a defect that
aborts the tool execution.

**TEST**, a gate that blocks a real command and tells the model why:

```js
"tool.execute.before": async (input, output) => {
  if (input.tool === "bash" && String(output.args?.command ?? "").includes("deploy")) {
    throw new Error("HYPERIDLE-GATE: rule 'prod-deploy' blocks this command. A human must approve it. Do not retry; use the read tool to inspect deploy.sh instead.")
  }
}
```

Stream:

```
TOOL_USE bash error {"command":"bash deploy.sh production ."} "HYPERIDLE-GATE: rule 'prod-deploy' blocks this command. ..."
TEXT "The command was blocked by a permission rule 'prod-deploy'. Let me inspect the deploy.sh script:"
TOOL_USE read ... (allowed, ran normally)
```

The call never ran, our exact sentence reached the model, the model read it and acted on it, and every
other tool stayed available in the same turn. Exit code 0.

**A caution from the same run.** The model, told it was blocked by a rule, went looking for the rule
and read the gate's own source file:

```
TOOL_USE bash completed {"command":"ls -la .opencode/plugin/"}
TOOL_USE read completed {"filePath":"/private/tmp/ocx/s2/.opencode/plugin/gate.js"}
TEXT "The command was blocked by a permission rule in `.opencode/plugin/gate.js:7` that blocks any bash command containing \"deploy\"."
```

The gate lives inside the sandbox the agent works in, is readable, and is writable. See §11.

### 5.5 Every hook the binary actually dispatches (TEST)

Exhaustive inventory of `trigger("...")` in the shipped bundle:

```
$ LC_ALL=C grep -aoE 'trigger\("[a-zA-Z._]+"' /opt/homebrew/Cellar/opencode/1.18.25/bin/opencode | sort -u
trigger("chat.headers"     trigger("chat.message"     trigger("chat.params"
trigger("command.execute.before"                      trigger("file.open"
trigger("experimental.chat.messages.transform")       trigger("experimental.chat.system.transform"
trigger("experimental.compaction.autocontinue"        trigger("experimental.provider.small_model"
trigger("experimental.session.compacting"             trigger("experimental.text.complete"
trigger("shell.env"        trigger("tab.new"          trigger("tool.definition"
trigger("tool.execute.after")                         trigger("tool.execute.before"
```

Sixteen. Plus `event`, `config`, `tool`, `auth`, `provider` and `dispose`, which are wired by other
paths (verified firing for `event`, `config`, and `dispose` is registered as an Effect finalizer).

Measured in one real run, in order:

```
PLUGIN_FACTORY_CALLED
HOOK config                                   (ARG1 = the full merged config, no second arg)
HOOK chat.message                             (input: sessionID, agent, model, messageID, variant | output: message, parts)
HOOK experimental.provider.small_model
HOOK experimental.chat.system.transform       (output: { system: string[] })
HOOK chat.params                              (output: temperature, topP, topK, maxOutputTokens, options)
HOOK chat.headers                             (output: { headers })
HOOK experimental.chat.messages.transform     (input: {} | output: { messages })
HOOK tool.definition   x12                    (input: { toolID })
HOOK tool.execute.before
HOOK shell.env                                (input: cwd, sessionID, callID | output: { env })
HOOK tool.execute.after
HOOK experimental.text.complete               (input: sessionID, messageID, partID | output: { text })
HOOK event  x160+                             (message.part.delta, plugin.added, message.part.updated,
                                               message.updated, session.updated, session.status,
                                               session.diff, catalog.updated, session.idle,
                                               session.created, reference.updated, integration.updated)
```

**`permission.ask` NEVER FIRED.** It is declared in `packages/plugin/src/index.ts`:

```ts
"permission.ask"?: (input: Permission, output: { status: "ask" | "deny" | "allow" }) => Promise<void>
```

and it is listed in opencode's own built-in `customize-opencode` skill under "Hook surface". But it is
**not in the `trigger(` inventory**, and a plugin registering it and setting `output.status = "allow"`
had no effect: the `.env` read was still auto-rejected and the hook's log file was empty.

```
$ cat /tmp/ocx/pa.log
(empty)
TOOL_USE read error {"filePath":"/private/tmp/ocx/pa/.env"} "The user rejected permission to use this specific tool call."
```

**WEB and TEST disagree; TEST wins.** Do not design around `permission.ask` on 1.18.25.

### 5.6 Fail-open — tested for real, four ways (TEST)

Four sandboxes, identical prompt `Run the shell command: echo BLOCKED-CMD`, identical gate logic that
should deny it. Run with `--print-logs --log-level ERROR`.

| Variant | Plugin file | Blocked? | stdout signal | stderr signal |
|---|---|---|---|---|
| 0 control | valid gate | **yes** — `TOOL_USE bash error "GATE-DENY: blocked"` | the denial | none |
| 1 | syntax error (`export const Gate = async () => ({ this is not valid javascript (((`) | **NO — command ran** | **nothing** | **nothing** |
| 2 | factory throws (`export const Gate = async () => { throw new Error("FACTORY-BOOM") }`) | **NO — command ran** | nothing | `level=ERROR message="failed to load plugin" path=file:///.../gate.js error=FACTORY-BOOM` |
| 3 | valid gate **plus** `export const settings = { note: "not a function" }` | **NO — command ran** | nothing | `level=ERROR message="failed to load plugin" path=... error="Plugin export is not a function"` |

Every variant exited **0** and printed `TEXT "BLOCKED-CMD"`.

**Variant 1 is the dangerous one.** Re-run at DEBUG to be certain:

```
$ cd /tmp/ocx/f1 && opencode debug info --print-logs --log-level DEBUG 2>&1 | grep -i 'plugin\|error\|fail'
plugins:
- file:///private/tmp/ocx/f1/.opencode/plugin/gate.js
```

Nothing. **A plugin that fails to import is silently skipped at every log level, and `debug info`
still lists it.** The origin list is configuration, not load status.

The source explains the split. **(WEB, `plugin/loader.ts:181-185`)** an import failure calls
`report.error(candidate, retry, "load", ...)` and returns no value; **(WEB, `plugin/index.ts:193-215`)**
that report callback calls `publishPluginError(...)`, which publishes a `Session.Event.Error` with no
`sessionID`. The JSON printer in `run.ts:787-790` only emits errors whose `props.sessionID` matches the
run's session, so the event is filtered out and never printed. Meanwhile a factory throw takes a
different path **(WEB, `plugin/index.ts:224-241`)** where the event publish is commented out with
`// TODO: make proper events for this` and only `Effect.logError("failed to load plugin", ...)` remains.

**Implication for HyperIdle:** a plugin-based gate has no in-band liveness signal. `debug info` cannot
prove it loaded. stderr proves it for two of three failure modes and nothing for the third. If the
plugin route is used, the plugin must prove its own liveness out of band — e.g. write a file or ping
the bridge on load, and refuse to start the session until that lands. And the adapter must stop
discarding opencode's stderr wholesale, because that is the only channel for variants 2 and 3.

### 5.7 `--pure` makes the gate inert, silently (TEST)

Same sandbox, same working gate as variant 0, only `--pure` added:

```
$ opencode run "Run the shell command: echo BLOCKED-CMD" --dir /tmp/ocx/f0 --format json --pure \
    --print-logs --log-level DEBUG </dev/null
EXIT=0
TOOL_USE bash completed {"command":"echo BLOCKED-CMD"} ""
TEXT "BLOCKED-CMD"
--- any plugin mention in logs? ---   (none)
```

Not a word about plugins at DEBUG. `opencode debug info --pure` does say
`external plugins disabled (--pure)`, but the run path says nothing. Confirms claim 9. If HyperIdle
uses the plugin route, `--pure` must be removed from the invocation; and if it is removed, the
sandbox's config isolation has to come from `XDG_CONFIG_HOME`, because `--pure` never provided any
(§8).

### 5.8 Ordering and short-circuiting (TEST)

Three plugins, `a-singular.js` and `c-second.js` in `.opencode/plugin/`, `b-plural.js` in
`.opencode/plugins/`. `c-second` throws.

```
A singular bash
C singular2 bash
TOOL_USE bash error "C-DENIES"
```

`b-plural` never ran. Hooks fire sequentially in the plugin order shown by `debug info`, and the first
throw aborts the chain. **(WEB, `plugin/index.ts:291-296`)**:

```ts
for (const hook of s.hooks) {
  const fn = hook[name] as any
  if (!fn) continue
  yield* Effect.promise(async () => fn(input, output))
}
```

Consequence: a permissive plugin ordered after a denying one is never consulted; and a plugin that
throws for an unrelated reason silently prevents every later plugin's hook from running.

### 5.9 A gate may block for as long as it likes (TEST)

```js
"tool.execute.before": async (input, output) => {
  if (input.tool !== "bash") return
  await new Promise(r => setTimeout(r, 45000))
}
```

```
EXIT=0 elapsed=51s
TOOL_USE bash completed "slow-test\n"
2026-09-02T07:20:34.961Z HOOK START {"command":"echo slow-test"}
2026-09-02T07:21:19.971Z HOOK END after 45s
```

No timeout on the hook, and no timeout on the tool call while the hook is pending. A gate can do a
real network round trip to a HyperIdle bridge — or, in principle, hold the call open while a human
decides. (opencode's own bash tool timeout of 120 s applies to the **command**, after the hook
returns.)

### 5.10 `tool.definition` — a third channel to the model (TEST)

```js
"tool.definition": async (input, output) => {
  if (input.toolID === "bash")
    output.description = "Run a shell command. HYPERIDLE RULE prod-deploy: any command containing the word deploy is blocked and needs a human's approval first — call hyperidle_ask_human instead.\n\n" + output.description
}
```

Asked to quote the first sentence of its bash tool description, the model returned:

```
TEXT "\"Run a shell command. HYPERIDLE RULE prod-deploy: any command containing the word deploy is blocked and needs a human's approval first — call hyperidle_ask_human instead.\""
```

So the rule can be stated **before** the model tries the action, not only after it is blocked. The hook
also receives `output.parameters` and `output.jsonSchema` and fires once per tool per agent.

Other hooks worth knowing for this problem: `experimental.chat.system.transform` mutates
`output.system: string[]` (inject standing policy into the system prompt); `chat.message` sees each
user message; `shell.env` mutates the environment handed to the bash tool.

---

## 6. Interception — permissions (no plugin required)

### 6.1 The default ruleset (TEST + WEB)

**WEB**, `packages/opencode/src/agent/agent.ts:119-136` — the defaults every agent starts from:

```ts
{
  "*": "allow",
  doom_loop: "ask",
  external_directory: { "*": "ask", ...whitelistedDirs },
  question: "deny", plan_enter: "deny", plan_exit: "deny",
  read: { "*": "allow", "*.env": "ask", "*.env.*": "ask", "*.env.example": "allow" },
}
```

The `build` agent merges `{question: "allow", plan_enter: "allow"}` on top, then the user's config
permission last. **The starting point is allow-everything.** Measured in a zero-config run:

```
level=INFO message=evaluated permission=bash pattern="echo hello-from-opencode" action.permission=* action.action=allow action.pattern=*
```

**WEB**, `permission/index.ts:28-38` — when *no* rule matches at all the fallback is `"ask"`, but with
`"*": "allow"` present a rule always matches, so that fallback is unreachable in practice for the
built-in agents.

Separately, **(WEB, `cli/cmd/run.ts:429-446`)** `opencode run` in non-interactive mode injects a
session-level ruleset:

```ts
const rules = interactive ? [] : [
  { permission: "question",   action: "deny", pattern: "*" },
  { permission: "plan_enter", action: "deny", pattern: "*" },
  { permission: "plan_exit",  action: "deny", pattern: "*" },
]
```

Visible in the session-creation log **(TEST)**:

```
message=created id=ses_... permission="[{\"permission\":\"question\",\"pattern\":\"*\",\"action\":\"deny\"},{\"permission\":\"plan_enter\",...},{\"permission\":\"plan_exit\",...}]"
```

### 6.2 What `ask` means headlessly (TEST)

**WEB**, `cli/cmd/run.ts:803-820`:

```ts
if (event.type === "permission.asked") {
  if (auto) { await client.permission.reply({ requestID: permission.id, reply: "once" }) }
  else {
    UI.println(... `permission requested: ${permission.permission} (${permission.patterns.join(", ")}); auto-rejecting`)
    await client.permission.reply({ requestID: permission.id, reply: "reject" })
  }
}
```

Measured, with **no permission config at all**:

```
$ opencode run "Use the read tool to read the file .env and tell me its contents." --dir /tmp/ocx/p1 --format json </dev/null
EXIT=0
stdout: TOOL_USE read error {"filePath":".env"} "The user rejected permission to use this specific tool call."
stderr: ! permission requested: read (.env); auto-rejecting

$ opencode run "Use the read tool to read the file /etc/hosts ..." --dir /tmp/ocx/conc --format json </dev/null
stdout: TOOL_USE read error {"filePath":"/etc/hosts"} "The user rejected permission to use this specific tool call."
stderr: ! permission requested: external_directory (/etc/*); auto-rejecting
```

So out of the box, a headless opencode **cannot** read `.env` files or anything outside the worktree.
With `--auto` it can:

```
$ opencode run "Use the read tool to read .env and print it." --format json --auto </dev/null
TOOL_USE read completed "<path>/private/tmp/ocx/pa/.env</path>...<content>\n1: SECRET_TOKEN=xyz\n..."
```

but an explicit `deny` still wins under `--auto`:

```
$ OPENCODE_PERMISSION='{"bash":{"*":"allow","*NOPE*":"deny"}}' opencode run "Run the shell command: echo NOPE" --format json --auto </dev/null
TOOL_USE bash error "The user has specified a rule which prevents you from using this specific tool call. ..."
```

**(WEB, `docs/permissions.mdx`)**: "Explicit `\"deny\"` rules are still enforced. Auto mode only
changes requests that would otherwise ask for approval."

**The prior claim that "a session with no permission set auto-rejects tool calls in non-interactive
mode" is REFUTED as a general statement.** Nothing is rejected by default except the specific things
the defaults mark `ask`: `*.env` reads, paths outside the worktree, `doom_loop`, and the three
`question`/`plan_*` denies.

### 6.3 `OPENCODE_PERMISSION` (TEST)

Real, works, **and appears nowhere in the public docs** — `docs/permissions.mdx` does not mention it.
It is documented only in the binary's built-in escape-hatch list alongside `OPENCODE_CONFIG_CONTENT`.

```
$ OPENCODE_CONFIG_CONTENT='{"permission":{"bash":{"*":"allow"}}}' \
  OPENCODE_PERMISSION='{"bash":{"ls*":"deny"}}' opencode debug config
"permission": { "bash": { "*": "allow", "ls*": "deny" } }
```

A **deep merge** on top of everything else, per process. Invalid JSON is skipped, fail-open:

```
$ OPENCODE_PERMISSION='{not json' opencode debug config --print-logs --log-level WARN
level=WARN message="OPENCODE_PERMISSION contains invalid JSON, skipping" err="SyntaxError: JSON Parse error: Expected '}'"
```

Because it is generated by HyperIdle rather than executed, this fail-open is verifiable before spawn —
unlike the plugin's.

### 6.4 Two very different denials (TEST + WEB)

This distinction is not in the prior notes and it matters.

**Pattern deny — the tool stays, the call fails:**

```
$ OPENCODE_PERMISSION='{"bash":{"*":"allow","*BLOCKED-CMD*":"deny"}}' opencode run "Run the shell command: echo BLOCKED-CMD" --format json </dev/null
TOOL_USE bash error {"command":"echo BLOCKED-CMD"} "The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules [{\"permission\":\"*\",\"action\":\"allow\",\"pattern\":\"*\"},{\"permission\":\"bash\",\"pattern\":\"*\",\"action\":\"allow\"},{\"permission\":\"bash\",\"pattern\":\"*BLOCKED-CMD*\",\"action\":\"deny\"}]"
TEXT "Blocked by permission rule"
```

**Whole-tool deny — the tool disappears:**

```
$ OPENCODE_PERMISSION='{"bash":"deny"}' opencode run "Run the shell command: echo BLOCKED-CMD. If you cannot, say exactly which tools you do have." --format json </dev/null
TEXT "I cannot run shell commands. The tools I have are:\n\n- `read`: Read files or directories\n- `write`: Write files\n- `glob`: Find files by pattern\n- `grep`: Search file contents\n- `edit`: Edit files\n- `task`: Launch subagents\n- `webfetch`: Fetch..."
```

No `tool_use` event at all. The mechanism **(WEB, `permission/index.ts:204-219` and
`session/llm/request.ts:209-213`)**:

```ts
export function disabled(tools: string[], ruleset) {
  const edits = ["edit", "write", "apply_patch"]
  const reads = ["list_mcp_resources", "list_mcp_resource_templates", "read_mcp_resource"]
  return new Set(tools.filter((tool) => {
    const permission = edits.includes(tool) ? "edit" : reads.includes(tool) ? "read" : tool
    const rule = ruleset.findLast((rule) => Wildcard.match(permission, rule.permission))
    return rule?.pattern === "*" && rule.action === "deny"
  }))
}
...
const disabled = Permission.disabled(..., Permission.merge(input.agent.permission, input.permission ?? []))
return Record.filter(input.tools, (_, k) => input.user.tools?.[k] !== false && !disabled.has(k))
```

Choose deliberately. If HyperIdle wants the model to *know* an action is forbidden and to route to a
human, it must use a **pattern** deny (or the plugin route), because a whole-tool deny removes the
capability without explanation.

Also from that snippet: `edit`, `write` and `apply_patch` all map to the **permission key `edit`**, and
the three MCP-resource tools map to `read`. **A permission key is not always a tool name.**

### 6.5 Evaluation semantics (WEB + TEST)

**WEB**, `permission/index.ts:28-38`:

```ts
export function evaluate(permission, pattern, ...rulesets) {
  return rulesets.flat().findLast((rule) =>
    Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern)
  ) ?? { action: "ask", permission, pattern: "*" }
}
```

`findLast` — **the last matching rule wins**, and rulesets are concatenated in the order
`agent defaults → agent overrides → user config → session rules`. Within one object, insertion order
matters. The built-in skill states it plainly **(TEST, `opencode debug skill`)**: "opencode evaluates
the LAST matching rule, so put broad rules first and narrow rules last."

Known permission keys, from the same built-in skill **(TEST)**: `read, edit, glob, grep, list, bash,
task, external_directory, todowrite, question, webfetch, websearch, lsp, doom_loop, skill`. Of these,
`todowrite, question, webfetch, websearch, doom_loop` accept only a flat action, not a pattern object.
The config schema's `additionalProperties` is open, so any tool id — MCP tools included — can carry a
rule.

Path patterns support `~/`, `$HOME/` expansion **(WEB, `permission/index.ts:178-184`)**.

### 6.6 Config-file permissions (WEB, `docs/permissions.mdx`)

```json
{ "$schema": "https://opencode.ai/config.json",
  "permission": { "bash": { "*": "ask", "git *": "allow", "rm *": "deny" },
                  "edit": { "*": "deny", "packages/web/src/content/docs/*.mdx": "allow" } } }
```

Per-agent overrides live under `agent.<name>.permission`. `"permission": "allow"` as a bare string is
allow-everything.

---

## 7. Tool vocabulary — measured

### 7.1 Builtin tool ids (TEST)

A plugin registering `tool.definition` logs `input.toolID` for every tool offered. One real run with
`openrouter/z-ai/glm-4.7-flash`:

```
invalid question bash read glob grep edit write task webfetch todowrite skill
```

(the list appears twice — once for the main `build` agent, once for the internal `title` agent).

The shell tool is **`bash`**, not `shell`, and this is deliberate. **(WEB, `tool/shell/id.ts:15-17`)**:

```ts
// Keep the exposed tool ID and permission key as "bash" for compatibility with
// existing plugins, users, and saved permissions. Rename with opencode 2.0.
export const ToolID = "bash"
```

The registry **(WEB, `tool/registry.ts:231-247`)** can also offer `websearch`, `apply_patch`, `lsp`,
`plan_exit`, `execute` (code mode) under conditions:

| Tool | Condition | Source |
|---|---|---|
| `websearch` | provider is `opencode`/`opencode-go`, or `OPENCODE_ENABLE_EXA` / `OPENCODE_ENABLE_PARALLEL` | `registry.ts:58-65, 293-295` |
| `apply_patch` | model id contains `gpt-` and not `oss`/`gpt-4` | `registry.ts:297-299` |
| `edit`, `write` | **only when `apply_patch` is not used** — i.e. NOT offered to `gpt-*` models | `registry.ts:300` |
| `question` | client is app/cli/desktop or `OPENCODE_ENABLE_QUESTION_TOOL` | `registry.ts:207` |
| `lsp` | `OPENCODE_EXPERIMENTAL_LSP_TOOL` | `registry.ts:245` |
| `plan_exit` | `OPENCODE_EXPERIMENTAL_PLAN_MODE` and cli client | `registry.ts:246` |
| `execute` | `OPENCODE_EXPERIMENTAL_CODE_MODE` | `registry.ts:118-119, 243` |

**A rule that matches on `edit`/`write` silently matches nothing on a `gpt-*` model.** Match on the
permission key `edit` instead, which covers all three (§6.4).

Argument shapes measured: `bash → {command}` (plus optional `timeout`, `description`),
`read → {filePath, limit?}`, `glob → {pattern}`.

### 7.2 MCP tool names (TEST + WEB)

**WEB**, `mcp/catalog.ts:117-119`:

```ts
export const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_")
export const toolName = (clientName: string, name: string) => sanitize(clientName) + "_" + sanitize(name)
```

**TEST** — a server named `hyperidle` exposing `ask_human`:

```
TOOL_USE hyperidle_ask_human completed {"question":"Please approve running \"bash deploy.sh\"..."} "Review r-99 filed..."
```

Single underscore, no `mcp__` prefix, no double underscore. And it goes through the gate hook exactly
like a builtin:

```
BEFORE hyperidle_ask_human {"question":"Please approve running \"bash deploy.sh\" ..."}
```

So a plugin gate can intercept MCP tool calls too, and a permission rule can name
`hyperidle_ask_human` directly.

### 7.3 MCP configuration and failure (TEST + WEB)

Config lives under `mcp` in any `opencode.json`, keyed by server name.

```json
{ "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "hyperidle": { "type": "local", "command": ["node", "/abs/path/server.mjs"],
                   "enabled": true, "environment": {}, "timeout": 30000 },
    "remote-thing": { "type": "remote", "url": "https://...",
                      "headers": { "Authorization": "Bearer {env:TOKEN}" } } } }
```

- `type` is required and discriminates `local` (stdio, `command` is an **array**) from `remote`
  (Streamable HTTP / SSE, `url` + `headers`).
- `enabled: false` disables a server inherited from a parent config.
- `timeout` per server; global default `experimental.mcp_timeout`; hard default 30000 ms
  **(WEB, `mcp/catalog.ts:12`, `DEFAULT_TIMEOUT = 30_000`)**.
- String values support `{env:VAR}` and `{file:path}` interpolation. Shell `${VAR}` is **not**
  substituted. **(TEST, built-in skill text.)**
- OAuth: `opencode mcp auth <name>` / `logout` / `debug`. Credentials live in the data dir.

**Handshake, measured** against a hand-rolled zero-dependency stdio server:

```
RECV {"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{"roots":{}},"clientInfo":{"name":"opencode","version":"1.18.25"}},"jsonrpc":"2.0","id":0}
RECV {"method":"notifications/initialized","jsonrpc":"2.0"}
RECV {"method":"tools/list","jsonrpc":"2.0","id":1}
RECV {"method":"tools/call","params":{"name":"ask_human","arguments":{...}}}
```

Protocol version offered: `2025-11-25`. Tools are listed at startup, before the first LLM call, and
re-listed on `notifications/tools/list_changed` (`mcp/index.ts:442-465`, `watch`).

**Failure is fail-open and quiet:**

```
$ cat opencode.json
{ "mcp": { "broken": { "type": "local", "command": ["/nonexistent/binary"], "enabled": true } } }
$ opencode run "Say the word ok and nothing else." --format json --print-logs --log-level WARN </dev/null
EXIT=0 elapsed=3s
stdout: TEXT "ok"
stderr: level=WARN run=c3b4b11a message="server unavailable" key=broken type=local status=failed
```

The run proceeds without the tools. If HyperIdle's ask-a-human tool comes from MCP, **a dead MCP server
means the agent is blocked with no way to escalate**, and stdout says nothing about it. `opencode mcp
list` reports status; a pre-flight check is warranted.

---

## 8. Isolation

### 8.1 What each XDG variable moves (TEST)

```
$ XDG_CONFIG_HOME=$X/cfg XDG_DATA_HOME=$X/data XDG_STATE_HOME=$X/state XDG_CACHE_HOME=$X/cache opencode debug paths
home       /Users/tg
data       /tmp/ocx/xdg/data/opencode
bin        /tmp/ocx/xdg/cache/opencode/bin
log        /tmp/ocx/xdg/data/opencode/log
repos      /tmp/ocx/xdg/data/opencode/repos
cache      /tmp/ocx/xdg/cache/opencode
config     /tmp/ocx/xdg/cfg/opencode
state      /tmp/ocx/xdg/state/opencode
tmp        /var/folders/.../T/opencode
```

With only `XDG_CONFIG_HOME` set, **only `config` moves**; `data`, `cache`, `state` stay global.

| Variable | Moves | Holds |
|---|---|---|
| `XDG_CONFIG_HOME` | `config` | `opencode.json(c)`, `config.json`, global `plugins/`, `agent(s)/`, `command(s)/`, `skill(s)/` |
| `XDG_DATA_HOME` | `data`, `log`, `repos` | `opencode.db` (all sessions), **`auth.json`**, `snapshot/`, `storage/`, `tool-output/` |
| `XDG_STATE_HOME` | `state` | `model.json` (recent models), `prompt-history.jsonl`, `locks/`, `kv.json` |
| `XDG_CACHE_HOME` | `cache`, `bin` | downloaded LSP servers etc. |

### 8.2 What leaks with only `XDG_CONFIG_HOME` (TEST)

**Fixed by it:** the user's global `opencode.json` (their MCP server, their agent definitions, their
`plugin: []` entries), the user's global `plugins/` directory, the user's global skills.

```
$ XDG_CONFIG_HOME=/tmp/oc-deep-cfg opencode debug config      # in a bare sandbox
{ "$schema": "https://opencode.ai/config.json", "agent": {}, "mode": {}, "plugin": [], "command": {}, "username": "tg" }

$ opencode debug config                                        # same sandbox, real global config
{ ... "mcp": { "hyperidle": { "type": "remote", "url": "http://127.0.0.1:<port>/api/mcp/<REDACTED>",
   "headers": { "Authorization": "Bearer <REDACTED>" } } }, "agent": { <three full agent prompts> },
   "plugin": [ "file:///Users/tg/.config/opencode/plugins/pipeline.js" ] ... }

$ XDG_CONFIG_HOME=/tmp/oc-deep-cfg opencode debug skill        # 1 skill (built-in only)
$ opencode debug skill                                          # many, incl. the user's pipeline skill
```

**Still leaking:**

1. **Every session in the global database**, and the "global" project bucket if the sandbox has no
   commit (§4.2).
2. **The user's most recent model.** With no `--model` and an empty config, a run picked
   `openrouter/qwen/qwen3.8-max` — the first entry of `~/.local/state/opencode/model.json`. Always
   pass `--model` explicitly, or isolate `XDG_STATE_HOME`.
3. **`~/.local/state/opencode/prompt-history.jsonl`** — every prompt the user has ever typed into
   opencode, plaintext, in the state dir.
4. **`~/.opencode/`** if it exists — `config/paths.ts:34-38` walks `.opencode` under `$HOME`
   independently of `XDG_CONFIG_HOME`. (It does not exist on this machine, so this is WEB-only.)
5. **External skills** — per the built-in skill text, `~/.claude/skills/<name>/SKILL.md` and
   `~/.agents/skills/<name>/SKILL.md` are auto-loaded from `$HOME`. Disable with
   `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` / `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1`. (Neither directory
   exists on this machine — WEB-only, untested.)
6. **Auth**, deliberately: `auth.json` is in the data dir, so config isolation leaves provider
   credentials working. That is usually what you want.

`OPENCODE_CONFIG_DIR` does **not** replace the global config dir — **(WEB, `config/paths.ts:23-41)**
it is appended to the search list alongside `Global.Path.config`.

### 8.3 Config resolution order (TEST, from a run's own logs)

```
message="creating instance" directory=/private/tmp/ocx/e2e
message=loading path=<config>/opencode/config.json
message=loading path=<config>/opencode/opencode.json
message=loading path=<config>/opencode/opencode.jsonc
message=loading path=/private/tmp/ocx/e2e/opencode.json
message=loading path=/private/tmp/ocx/e2e/.opencode/opencode.json
message=loading path=/private/tmp/ocx/e2e/.opencode/opencode.jsonc
message=init
```

Later wins. Then `OPENCODE_CONFIG` (an extra file), `OPENCODE_CONFIG_CONTENT` (inline JSON, merged as
a final local-scope layer), and `OPENCODE_PERMISSION` (permission block only) merge on top.
`OPENCODE_DISABLE_PROJECT_CONFIG=1` skips the project layers entirely.

Config load and plugin load both complete **before** `message=init`, on both the fresh and the resume
path. A fresh process re-reads everything, so a deny set rewritten between two turns of the same
session takes effect on the next turn. Nothing survives the process boundary.

### 8.4 Recommended isolation for a HyperIdle sandbox run

```
XDG_CONFIG_HOME=<sandbox>/.xdg/config    # hides user config, plugins, skills, MCP
XDG_DATA_HOME=<sandbox>/.xdg/data        # own session DB -> fixes the lock collision (§9.3)
                                         #   ...and requires copying auth.json in, and pinning
                                         #   the same value on every resume of that session
XDG_STATE_HOME=<sandbox>/.xdg/state      # no model bleed, no prompt-history writes
OPENCODE_DISABLE_EXTERNAL_SKILLS=1
OPENCODE_DISABLE_AUTOUPDATE=1
opencode run "<prompt>" --dir <sandbox> --model <explicit> --format json  </dev/null
```

Verified **(TEST)** that copying `~/.local/share/opencode/auth.json` into
`<XDG_DATA_HOME>/opencode/auth.json` keeps openrouter auth working. (Its contents were never read or
printed.) Provider keys from the environment (e.g. `OPENROUTER_API_KEY`) also work regardless of data
dir.

Do **not** add `--pure` if a plugin gate is used (§5.7).

---

## 9. Limits, stalls, concurrency

### 9.1 The stdin block — the real cause of the "intermittent init stall"

Covered in §2.5. Deterministic, not intermittent: `opencode run` waits for stdin EOF whenever stdin is
not a TTY. It reproduced at exactly the pipe hold time (25 s held → 25 s wait) with no plugin, no
permission config and no model call. The first run of this research session hung for the full 120 s
Bash-tool timeout with zero bytes; the identical command with stdin closed finished in **5 s**.

The prior note's observation that "the last log line is always `message=init`" is consistent: the
stdin read happens in the run handler, and the instance/config/plugin bootstrap logs precede it.

**Fix: spawn with stdin `/dev/null`, or write the prompt and close stdin.** Keep a hard wall-clock
timeout anyway, for §9.2.

### 9.2 The other hang: mismatched `--dir` on resume

§4.5. 197 s and counting, zero stdout, work completed. There is no wall clock inside `opencode run` —
nothing will ever end it. Any harness must impose its own.

### 9.3 Concurrency — `database is locked` (TEST)

Two concurrent runs in the **same** sandbox:

```
elapsed=13s rc1=1 rc2=0
--- c1 --- stdout: (empty)   stderr: Error: Unexpected error / database is locked
--- c2 --- TEXT "BRAVO"
```

Three concurrent runs in **three different** sandboxes — the database is global, so it makes no
difference:

```
--- k1 rc=0 stdoutbytes=1041 --- TEXT "TAG1"
--- k2 rc=1 stdoutbytes=0    --- Error: Unexpected error / database is locked
--- k3 rc=0 stdoutbytes=1041 --- TEXT "TAG3"
```

Rate, four repeated pairs:

```
round 1: rc=0,0 locked_procs=0
round 2: rc=1,0 locked_procs=1
round 3: rc=0,1 locked_procs=1
round 4: rc=0,1 locked_procs=1
```

Five of six concurrent groups lost a process. **Note the failure shape: exit 1, plain-text stderr,
zero JSON on stdout.** A caller parsing only stdout sees an empty successful-looking stream.

Giving each run its own `XDG_DATA_HOME` fixes it completely:

```
$ for i in 1 2 3; do ( XDG_DATA_HOME=/tmp/ocx/d$i opencode run "Reply with exactly: ISO$i" ... ) & done; wait
--- i1 rc=0 --- TEXT "ISO1"
--- i2 rc=0 --- TEXT "ISO2"
--- i3 rc=0 --- TEXT "ISO3"
```

A fresh isolated data dir is ~1 MB. The user's shared one is 2.9 GB, which is very likely why the
lock window is wide enough to hit this often. (The DEBUG log of a run against the shared dir also
shows a `cleanup prune=7.days` pass at the end.)

### 9.4 Other timeouts

| Thing | Limit | Source |
|---|---|---|
| bash tool default | 120000 ms, model can override per call, global override `OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS` | WEB `tool/shell.ts:347, 618` |
| bash timeout message to model | "shell tool terminated command after exceeding timeout ${input.timeout} ms. If this command is expected to take longer and is not waiting for interactive input, retry with a larger timeout value in milliseconds." | WEB `tool/shell.ts:564` |
| MCP connect / request | 30000 ms default, per-server `timeout`, global `experimental.mcp_timeout` | WEB `mcp/catalog.ts:12`, `mcp/index.ts:286` |
| `tool.execute.before` hook | **none** — 45 s honoured | TEST §5.9 |
| `opencode run` overall | **none** | TEST §4.5 |

---

## 10. The product question, tested end to end

**Can we block a specific tool call, tell the model why, let it call an MCP tool to ask a human, end
the session, and later resume that same session delivering the human's answer so it retries the
blocked action?**

**Yes. Proven on the real binary, no stubs.** Setup:

- Sandbox `/tmp/ocx/e2e`, a git repo with one commit and a `deploy.sh`.
- `.opencode/plugin/gate.js` — throws on any bash command containing `deploy` unless
  `/tmp/ocx/approved` exists.
- `opencode.json` — one local stdio MCP server named `hyperidle`, a hand-rolled zero-dependency Node
  script exposing `ask_human`.
- Seed prompt carrying the standing policy plus the task.

**Phase 1** (`opencode run "<seed>" --dir $E --model $M --format json </dev/null`, exit 0):

```
SESSION ses_f9f0401b9ffeH2QS3zB8W3I2XD
TOOL_USE bash error {"command":"bash deploy.sh"} "BLOCKED by rule prod-deploy. This action needs a human's approval. Call the hyperidle_ask_human tool to request it, then stop and end your turn. Do not retry and do not work around it."
TOOL_USE hyperidle_ask_human completed {"question":"Please approve running \"bash deploy.sh\" to deploy. This action is currently blocked by the prod-deploy rule and needs human approval to proceed."} "Review r-99 filed. A human will answer later in this same conversation."
TEXT "Review r-99 filed. A human will answer later in this same conversation."
```

Gate log: `BEFORE bash {...}` then `BEFORE hyperidle_ask_human {...}`. The process exited.

**The human answers**, out of band: `touch /tmp/ocx/approved`.

**Phase 2**, a brand-new process resuming the same session:

```
$ opencode run "Approved. A human reviewed review r-99 and approved it. The prod-deploy block has been lifted for this action. Retry it now." \
    --dir $E --session ses_f9f0401b9ffeH2QS3zB8W3I2XD --model $M --format json </dev/null
EXIT=0
SESSION ses_f9f0401b9ffeH2QS3zB8W3I2XD          <- same id
TOOL_USE bash completed {"command":"bash deploy.sh"} "DEPLOYED\n"
TOKENS {"total":7758,"input":95,"output":10,"reasoning":37,"cache":{"write":0,"read":7616}}
TEXT "Deployed"
```

Gate log across both phases:

```
BEFORE bash {"command":"bash deploy.sh"}
BEFORE hyperidle_ask_human {...}
BEFORE bash {"command":"bash deploy.sh"}
ALLOWED (approval present)
```

`input: 95` tokens with `cache.read: 7616` proves the full prior context came with the resume; the
task was never restated.

**Where it works:** every step. Block with free text, escalate through MCP, terminate the process,
re-evaluate the gate from scratch in a new process (plugins and config are re-read before `init`),
deliver a verdict as an ordinary user turn, retry.

**Where it breaks, or would:**

1. **The gate must be re-decided per process.** There is no persistence. Whatever the gate reads —
   a file, a bridge — must be current at spawn time. That is a feature here, not a limitation.
2. **The sandbox must still exist at the same path when the human answers** (§4.5) — a different
   `--dir` hangs forever rather than failing.
3. **The data dir must be the same** (§4.6) — that one at least fails loudly.
4. **If the MCP server is down, there is no escalation path** and stdout says nothing (§7.3).
5. **If the gate plugin fails to import, the block simply does not happen** and nothing anywhere says
   so (§5.6). The retry loop would never be entered; the action would just execute.
6. **Concurrency** — a second opencode process anywhere on the machine can kill this one with
   `database is locked` and an empty stdout (§9.3), unless data dirs are per-run.
7. **The agent can read and rewrite the gate** (§11).

---

## 11. Sandbox-integrity notes (observed, not speculative)

These are recorded because they were **observed in real runs**, not because a threat model was assumed.

1. **The gate is inside the workspace.** `.opencode/plugin/gate.js` sits at the sandbox root. In §5.4
   the model, having been told a rule blocked it, listed `.opencode/plugin/` and read `gate.js`
   unprompted, then quoted the rule's line number back. Nothing stopped it. Editing it would not
   affect the running process (plugins load once at startup) but **would** affect the next resume,
   which is exactly the moment BA2 depends on.
2. `OPENCODE_PERMISSION` has no such exposure: it is an env var on the child process, written by
   HyperIdle, invisible in the filesystem, and re-supplied on every spawn.
3. Default permissions already forbid reading `*.env` and anything outside the worktree in a headless
   run (§6.2), so a plain sandbox is not wide open by accident.
4. A whole-tool `deny` removes the capability rather than refusing it (§6.4) — worth knowing when
   deciding what an agent should not merely be denied but never offered.

---

## 12. Prior-claims audit

### CONFIRMED

| Prior claim | Where | Evidence here |
|---|---|---|
| `tool.execute.before` args are on the **second** parameter (`output.args`); the first is `{tool, sessionID, callID}` | `interception-opencode.md` §2 | §5.3 — source at tag v1.18.25 (both the type and the call site) plus a live probe log |
| The existing HyperIdle code reads the wrong parameter, so `tool_input` is always `{}` | ibid., "Corrections" | The signature is confirmed; the code claim was not re-inspected here, so it stands as previously reported |
| A plugin that fails to load is fail-open | ibid. §7b | §5.6 — three distinct failure modes, all fail open, all let the blocked command run |
| Denial is by **throwing**; there is no return-value protocol | ibid. §3 | §5.4 + `docs/plugins.mdx:250-253` |
| The thrown message reaches the model verbatim and the model acts on it | ibid. §4 | §5.4, §10 |
| `OPENCODE_PERMISSION` is a real env var, merged into the resolved config, undocumented | ibid. §5 | §6.3 |
| The permission-route deny text is fixed prose plus the matched ruleset JSON | ibid. §4 | §6.4 |
| `--pure` disables the sandbox's own plugin and provides no config/MCP isolation | ibid. §1, §7a | §5.7, §8.2 |
| `XDG_CONFIG_HOME` is the correct isolation lever, and `OPENCODE_CONFIG_DIR` is not | ibid. §1 | §8.1-8.3 (`OPENCODE_CONFIG_DIR` confirmed additive from source) |
| Both `.opencode/plugin/` and `.opencode/plugins/` load; docs name only the plural | ibid. §7f | §5.2 |
| A plugin costs a `node_modules` install in the sandbox (~3645 files / 61 MB) | ibid. §7d | §5.2 — same file count, measured cold cost 2.0 s vs 0.6 s warm |
| A resumed run is a fresh process that re-reads config and re-loads plugins before `init` | ibid. §6 | §8.3, §10 |
| Config search order (global config/opencode/opencode.jsonc → project → project `.opencode`) | ibid. §6 | §8.3 |
| A bogus session id fails loudly, exit 1, `Error: Session not found` | `session-continuation.md` §3 | §4.3 |
| opencode resumes headlessly, carries a user message, keeps full prior context, acts on the verdict | ibid. §1, §3 | §4.4, §10 |
| The session id is on every JSONL event as `sessionID` | ibid. §3 | §3.3 |
| `--continue` and `--fork` work | ibid. §6 | §4.4 |
| A `--dir` pointing somewhere other than the session's directory hangs with zero output while the work still executes | ibid. §5c (last paragraph) | §4.5 — reproduced, with the mechanism identified |
| `cli-harness-adapter.ts:145`'s comment that "`--dir <sandbox>` does not accept a per-session prompt" is false | ibid. §6 | §4.4 |

### REFUTED

| Prior claim | Where | What is actually true |
|---|---|---|
| **"`opencode run` intermittently stalls at `init` for 150-300 s… cause not fully identified."** | `interception-opencode.md` §7g | Not intermittent and fully identified: `cli/cmd/run.ts:416` reads stdin to EOF whenever stdin is not a TTY. Hold a pipe open for 25 s → wait exactly 25 s. Close stdin → 5 s. §2.5, §9.1 |
| **"The resume must repeat the `--dir` shape the session was created with"** — 4/4 and 3/3 hangs on the mismatched cells | `session-continuation.md` §5c, §6 | Refuted. With stdin closed, `--dir` present and `--dir` absent both resume correctly from the session's own directory (§4.4). The genuine hang is a `--dir` pointing at a **different directory**, which is a different rule (§4.5) |
| **"A session with no permission set auto-rejects tool calls in non-interactive mode"** | task brief / implied by `interception-opencode.md` §7e | Refuted as stated. The `build` agent's baseline is `"*": "allow"`; a zero-config headless run executed `bash` with no prompt at all. Only the specific defaults marked `ask` (`*.env` reads, paths outside the worktree, `doom_loop`) are auto-rejected. §6.1, §6.2 |
| "On the plugin route, a broken plugin's only signal is a stderr line" | `interception-opencode.md` §7b | Half true. A factory throw or a non-function export logs one stderr line. **An import/syntax failure logs nothing at any level, and `debug info` still lists the plugin.** §5.6 |
| "`opencode debug info` tells you which plugins loaded" (implied by using it as the check) | ibid. §1, §2 | It lists configured **origins**. A plugin with a syntax error appears in that list and is not loaded. §5.6 |

### NOT TESTED / UNTESTABLE HERE

| Prior claim | Why |
|---|---|
| The specific defects in `provision-gate-hook.ts` (`input?.input ?? {}`, substring-based deny detection) and `adapter-pool.ts` (`opencode-stderr-ignore`) | This pass audited the binary, not the HyperIdle tree. The underlying binary facts those corrections rest on are all confirmed |
| The `@lore` in the repo about the plugin API shape | Same reason; the shape it describes is confirmed correct |
| Comparative claims about claude-code, codex, cursor-agent in `session-continuation.md` | Out of scope for this document |
| That the 2.96 GB `opencode.db` causes the stall | Superseded — the stall is stdin. The large DB **does** correlate with the `database is locked` failures (§9.3), which is a different problem |

---

## 13. Unverified / open questions

1. **`~/.opencode/` as a config source.** `config/paths.ts:34-38` walks `.opencode` under `$HOME`
   outside `XDG_CONFIG_HOME`. That directory does not exist on this machine, so the leak is
   source-only, never observed.
2. **External skills from `~/.claude/skills/` and `~/.agents/skills/`.** Named in opencode's built-in
   `customize-opencode` skill; neither directory exists here, so the auto-load and the
   `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` escape hatch are WEB-only.
3. **Whether a `"global"`-bucket session belonging to the user can actually be *resumed* from an
   uncommitted sandbox.** `opencode session list` there enumerates 100 of them (§4.2); resuming one
   was not attempted, because it would read the user's real conversations.
4. **Remote (Streamable HTTP / SSE) MCP transports.** Only a local stdio server was exercised. The
   config shape and the 30 s default are source-read.
5. **OAuth-backed MCP servers** (`opencode mcp auth`) — untested.
6. **`opencode serve` / `--attach` / `opencode acp`.** A long-lived server would sidestep both the
   per-run bootstrap cost and possibly the DB lock contention, and its event stream is richer than the
   six-type `run` stream. Not explored; likely worth a follow-up if HyperIdle wants many concurrent
   opencode sessions.
7. **Whether the plugin-error `Session.Event.Error` is visible on any channel** (the server SSE stream,
   the TUI). It is not visible in `run --format json` or in logs. Not chased further.
8. **Subagent (`task` tool) sessions.** `run.ts` tracks child sessions
   (`event.properties.info.parentID`) and mirrors their parts. Gate behaviour inside a subagent was not
   tested; the plugin hooks are process-global so they should apply, but that is inference, not
   measurement.
9. **`--fork` semantics on resume** — documented and previously reported working; not re-tested here.
10. **Windows / Linux.** Everything here is macOS arm64.
11. **Version drift.** 1.18.26 shipped four days after 1.18.25 and the dev channel publishes daily.
    None of this was re-verified against 1.18.26.

---

## 14. Raw appendix — commands relied on

Environment used for every experiment unless stated otherwise:

```
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
CFG=/tmp/oc-deep-cfg          # scratch XDG_CONFIG_HOME
M=openrouter/z-ai/glm-4.7-flash
# every opencode invocation ends with  </dev/null
```

**Identity**

```
opencode --version                                   -> 1.18.25
readlink -f /opt/homebrew/bin/opencode
file /opt/homebrew/Cellar/opencode/1.18.25/bin/opencode
opencode --help ; opencode run --help ; opencode debug --help ; opencode session --help
curl -sSL "https://api.github.com/repos/sst/opencode/releases?per_page=12"
```

**Source (all at tag v1.18.25)**

```
curl -sS https://raw.githubusercontent.com/sst/opencode/v1.18.25/packages/plugin/src/index.ts
curl -sS .../packages/opencode/src/plugin/index.ts        # fail-open paths, --pure, trigger loop
curl -sS .../packages/opencode/src/plugin/loader.ts       # load-stage error handling
curl -sS .../packages/opencode/src/permission/index.ts    # evaluate, disabled, visibleTools, fromConfig
curl -sS .../packages/opencode/src/agent/agent.ts         # default ruleset
curl -sS .../packages/opencode/src/tool/registry.ts       # tool list + conditions
curl -sS .../packages/opencode/src/tool/shell/id.ts       # ToolID = "bash"
curl -sS .../packages/opencode/src/session/tools.ts       # the tool.execute.before call site
curl -sS .../packages/opencode/src/session/llm/request.ts # Permission.disabled filter
curl -sS .../packages/opencode/src/cli/cmd/run.ts         # stdin, emit, permission auto-reject, exits
curl -sS .../packages/opencode/src/config/paths.ts        # config dir search
curl -sS .../packages/opencode/src/mcp/catalog.ts         # toolName/sanitize, DEFAULT_TIMEOUT
curl -sS .../packages/web/src/content/docs/plugins.mdx
curl -sS .../packages/web/src/content/docs/permissions.mdx
```

**Binary inventories**

```
OC=$(readlink -f /opt/homebrew/bin/opencode)
LC_ALL=C grep -aoE 'trigger\("[a-zA-Z._]+"' "$OC" | sort -u
LC_ALL=C grep -aoE 'OPENCODE_[A-Z0-9_]+'    "$OC" | sort -u
opencode debug skill        # the built-in `customize-opencode` config reference
```

**stdin proof (no model call)**

```
opencode run --dir "$SB" </dev/null                  # exit 1 in 1s
( sleep 25 ) | opencode run --dir "$SB"              # exit 1 in 25s, identical error
echo "PIPED-TEXT-ONLY" | opencode run --dir "$SB"    # piped text becomes the prompt
```

**Plugin probe (hook inventory, parameter shapes, tool ids)**

```
# .opencode/plugin/probe.js registers all 17 declared hook names and logs both parameters
opencode run "Run the shell command 'echo probe-run' and then read the file README.md" \
  --dir /tmp/ocx/s1 --model "$M" --format json </dev/null
```

**Fail-open matrix**

```
# f0 valid gate | f1 syntax error | f2 factory throws | f3 extra non-function export
for v in 0 1 2 3; do
  opencode run "Run the shell command: echo BLOCKED-CMD" --dir /tmp/ocx/f$v --model "$M" \
    --format json --print-logs --log-level ERROR </dev/null
done
opencode debug info --print-logs --log-level DEBUG     # in each of f1 f2 f3
```

**Permissions**

```
OPENCODE_PERMISSION='{"bash":{"*":"allow","*BLOCKED-CMD*":"deny"}}' opencode run "Run the shell command: echo BLOCKED-CMD" ...
OPENCODE_PERMISSION='{"bash":"deny"}'                              opencode run "... say exactly which tools you do have." ...
opencode run "Use the read tool to read the file .env ..." ...                 # ask -> auto-reject
opencode run "Use the read tool to read the file .env ..." --auto ...          # ask -> approved
OPENCODE_PERMISSION='{"bash":{"*":"allow","*NOPE*":"deny"}}' opencode run "... echo NOPE" --auto ...
OPENCODE_PERMISSION='{not json' opencode debug config --print-logs --log-level WARN
OPENCODE_CONFIG_CONTENT='{"permission":{"bash":{"*":"allow"}}}' OPENCODE_PERMISSION='{"bash":{"ls*":"deny"}}' opencode debug config
```

**Sessions**

```
opencode run "Remember this codeword: PLUM-42. Just reply OK." --dir /tmp/ocx/sess --format json
opencode run "What was the codeword?" --dir /tmp/ocx/sess --session <id> --format json    # works
cd /tmp/ocx/sess && opencode run "What was the codeword? Answer in one word." --session <id> --format json  # works
cd /tmp && opencode run "What was the codeword? One word." --dir /tmp/ocx/p1 --session <id> --format json --print-logs --log-level DEBUG   # HANGS
XDG_DATA_HOME=/tmp/ocx/d1 opencode run "hello" --dir /tmp/ocx/e2e --session <id>          # exit 1 Session not found
opencode run "hi" --dir "$SB" --session ses_doesnotexist --format json                    # exit 1 Session not found
opencode session list ; opencode debug scrap ; opencode db path
opencode db "select name from sqlite_master where type='table' order by name"
opencode db "select project_id, count(*) c from session group by 1 order by c desc limit 6"
opencode export <sessionID>
```

**Concurrency**

```
# same sandbox, two at once
( opencode run "Reply with exactly: ALPHA" --dir $C ... ) & ( opencode run "Reply with exactly: BRAVO" --dir $C ... ) & wait
# three different sandboxes, shared data dir
for i in 1 2 3; do ( opencode run "Reply with exactly: TAG$i" --dir /tmp/ocx/k$i ... ) & done; wait
# three different sandboxes, isolated data dirs (auth.json copied, never read)
for i in 1 2 3; do ( XDG_DATA_HOME=/tmp/ocx/d$i opencode run "Reply with exactly: ISO$i" ... ) & done; wait
```

**End-to-end (§10)**

```
# phase 1
opencode run "<seed policy + task>" --dir /tmp/ocx/e2e --model "$M" --format json </dev/null
# human approves
touch /tmp/ocx/approved
# phase 2
opencode run "Approved. A human reviewed review r-99 and approved it. The prod-deploy block has been lifted for this action. Retry it now." \
  --dir /tmp/ocx/e2e --session ses_f9f0401b9ffeH2QS3zB8W3I2XD --model "$M" --format json </dev/null
```

All scratch directories (`/tmp/ocx`, `/tmp/oc-deep.*`, `/tmp/oc-deep-cfg`, `/tmp/ocsrc`) were removed
after the run. Nothing under `/Users/tg/.config/opencode` or `/Users/tg/.local/share/opencode` was
modified except by opencode's own normal operation (new sessions in the shared database, and the
snapshot directories those runs created).
