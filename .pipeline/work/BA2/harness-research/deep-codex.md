# deep-codex — the codex CLI as an agent harness

**Binary:** `codex-cli 0.150.1` — `/opt/homebrew/bin/codex` → `/opt/homebrew/Caskroom/codex/0.150.1/bin/codex` (Homebrew cask, Mach-O arm64, compiled Rust).
**Machine:** macOS 15.7.1 arm64. Auth: ChatGPT account (no API key).
**Date produced:** 2026-09-02. **Produced by:** research pass for BA2.
**Supersedes:** `interception-codex.md`, and the codex sections of `session-continuation.md`.

**Evidence rule.** Every claim below is tagged **(TEST)** — a command run against this binary, with its real output — or **(WEB)** — a page fetched on 2026-09-02, quoted. Nothing else is asserted. Where the two disagree, TEST wins and the disagreement is called out.

**Method.** Two independent sources of truth were used, plus live runs:
1. `strings` over the shipped binary, which embeds **23 complete JSON Schemas** for the hook wire protocol (`pre-tool-use.command.input`, etc.) and the full app-server protocol.
2. `codex app-server generate-json-schema --out <dir>` — 295 generated schema files, the authoritative config/protocol shapes.
3. Live runs against an isolated `CODEX_HOME` (auth.json copied, never the real `~/.codex`) and a throwaway git repo.

> **Version warning.** This machine runs **0.150.1**. `codex doctor` reports `latest version 0.152.1` and the release page shows multiple stable releases per week plus near-daily alphas. Everything below is measured on 0.150.1 and should be re-measured after any bump.

---

## Claims table

| # | Claim | Kind | Reference |
|---|---|---|---|
| 1 | Version is `codex-cli 0.150.1`; installed by Homebrew cask | TEST | `codex --version` |
| 2 | Latest release is 0.152.1; 0.150.1 is behind | TEST | `codex doctor` → `latest version 0.152.1` |
| 3 | `codex exec` **blocks forever reading stdin** when stdin is not a TTY and not closed | TEST | `codex exec --json … "prompt"` with an open pipe → hung 2 min, stderr `Reading additional input from stdin...`, zero output |
| 4 | `< /dev/null` fixes it; exit 0, 10 events | TEST | same command with `< /dev/null` → `EXIT=0` |
| 5 | `codex exec` has **no** `-a/--ask-for-approval` flag (top-level `codex` does) | TEST | `codex exec … -a never` → `error: unexpected argument '-a' found`, exit 2 |
| 6 | `codex exec resume` has **no** `-s/--sandbox`, `-C/--cd`, `--add-dir`, `-p/--profile`, `--color` | TEST | `codex exec resume --help` flag diff vs `codex exec --help` |
| 7 | `--json` emits `thread.started`, `turn.started`, `item.started`, `item.completed`, `turn.completed`, `turn.failed`, `error` | TEST | 12 live runs; see §3 |
| 8 | Thread id appears **only** in `thread.started.thread_id` | TEST | run1.jsonl line 0 |
| 9 | Token usage appears **only** in `turn.completed.usage` | TEST | run1.jsonl line 9 |
| 10 | Measured tool names are **`Bash`** and **`apply_patch`** | TEST | PreToolUse hook payloads |
| 11 | MCP tools are named **`mcp__<server>__<tool>`** to hooks | TEST | hook saw `mcp__humangate__ask_human` |
| 12 | Hook config lives at `$CODEX_HOME/hooks.json`, `<repo>/.codex/hooks.json`, or `[hooks]` in `config.toml` | WEB+TEST | learn.chatgpt.com/docs/hooks; both file paths fired live |
| 13 | An untrusted hook is **silently skipped** — no stderr, no stream event, exit 0, tool runs | TEST | run4: hook present, 0 invocations, exit 0 |
| 14 | `--dangerously-bypass-hook-trust` makes it fire, and emits two `item.completed / type:error` warnings | TEST | run5 |
| 15 | `--dangerously-bypass-hook-trust` does **not** persist trust | TEST | `config.toml` after run5 contains only `[projects.*]` |
| 16 | Writing `[hooks.state."<key>"] trusted_hash = "<sha256>"` into `config.toml` makes the hook fire with **no** flag and **no** warnings | TEST | trust run: 1 hook call, 0 warnings, exit 0 |
| 17 | `key` and `currentHash` come from `hooks/list` over `codex app-server` | TEST | see §5.3 |
| 18 | **Editing `hooks.json` invalidates the hash → hook silently skipped, zero output anywhere** | TEST | changed `matcher` only → 0 hook calls, 0 stderr, 0 stream mentions, command ran |
| 19 | PreToolUse `permissionDecision: "deny"` blocks the call and the reason reaches the model **verbatim** | TEST | run6; model quoted and obeyed the reason |
| 20 | **A blocked tool call produces NO event in the `--json` stream** — only a stderr line | TEST | run6: no `command_execution` item for the blocked call |
| 21 | Hook **exit 2** blocks; stderr becomes the reason | TEST | `echo boom >&2; exit 2` → `Command blocked by PreToolUse hook: boom` |
| 22 | Hook **exit 1** fails OPEN — tool runs | TEST | run7: `echo FAILEXIT` executed |
| 23 | Hook **timeout** fails OPEN | TEST | run7 + timing run (30s sleep, `timeout: 4`, 11s total wall, command ran) |
| 24 | Hook **malformed JSON on stdout, exit 0** fails OPEN | TEST | run7: `echo GARBAGE` executed |
| 25 | `"timeout": <n>` in `hooks.json` is honoured, in seconds | TEST | timing run |
| 26 | Default hook timeout is **600 s** (`SessionEnd` 1 s) | WEB+TEST | docs/hooks; `hooks/list` → `"timeoutSec": 600` |
| 27 | **`continue: false` is IGNORED in `codex exec`** — the tool ran anyway | TEST | stop run: command executed, exit 0, no `stopReason` anywhere |
| 28 | A `.rules` file containing bare `allow *` / `deny *` is **invalid Starlark** and `codex exec` **exits 1 before any model call** | TEST | `Error loading rules: …starlark error: Parse error: unexpected new line` |
| 29 | `--ignore-rules` clears that error | TEST | exit 0, 4 events |
| 30 | `prefix_rule(pattern=[…], decision="forbidden")` blocks and the justification reaches the model | TEST | rules run: `policy forbids commands starting with echo` |
| 31 | A forbidden command produces **NO event in the `--json` stream** either | TEST | rules run: zero `command_execution` items |
| 32 | `.rules` does **not** see through a nested shell: `bash -lc 'git push …'` ran while `git push …` was rejected | TEST | nested-shell run, exit 128 from git itself |
| 33 | `approval_policy = "never"` makes **every MCP tool call fail**: `MCP tool call requires approval, but approval policy is never` | TEST | mcp1 run |
| 34 | With `approval_policy = "on-request"` + a `PermissionRequest` hook returning `behavior: "allow"`, MCP calls succeed | TEST | mcp2 run: two successful `mcp_tool_call` items |
| 35 | MCP failures **do** appear in the stream (`status: "failed"`, `error.message`) — unlike hook blocks | TEST | mcp1 vs run6 |
| 36 | A **broken MCP server fails completely silently** — exit 0, nothing on stderr, nothing in the stream | TEST | broken-mcp run |
| 37 | A blocked `Bash` is routed around via `apply_patch` unless `apply_patch` is also gated | TEST | run6 and mcp2: model wrote the file instead |
| 38 | `codex exec resume <uuid>` preserves the thread id and full context; the blocked action can be retried | TEST | phase1/phase2: same `thread_id`, remembered exact filename, retried, succeeded |
| 39 | Resume works from a **different cwd**; cwd rebinds to the process cwd, context survives, no warning | TEST | resume-cwd run |
| 40 | `resume <well-formed-but-unknown-uuid>` → **exit 1**, clear error | TEST | `no rollout found for thread id … (code -32600)` |
| 41 | **`resume <non-uuid-name>` that matches nothing silently starts a BRAND NEW session**, exit 0, new thread id | TEST | `codex exec resume not-a-uuid` |
| 42 | **`resume --last` with no sessions also silently starts a new session**, exit 0 | TEST | fresh `CODEX_HOME` run |
| 43 | Transcripts are JSONL at `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` | TEST | `find $CODEX_HOME/sessions` |
| 44 | `--ephemeral` writes no session file (22 → 22) and therefore cannot be resumed | TEST | ephemeral run |
| 45 | `--output-schema` forces the final message to conform | TEST | `last.txt` = `{"answer":"done"}` |
| 46 | **`--ignore-user-config` also disables PROJECT-level hooks**, contradicting its help text | TEST | clean A/B: 1 call without, 0 calls with |
| 47 | On a ChatGPT-account login, `gpt-5.4-nano`, `gpt-5-codex-mini`, `o3` are rejected with HTTP 400; `gpt-5.4-mini` and `gpt-5.6-sol` work | TEST | model matrix run |
| 48 | An unsupported/unknown model → `turn.failed` event and **exit 1** | TEST | model matrix run |
| 49 | Exit codes: 0 = success (incl. blocked tools), 1 = turn failed / rules load error / unknown-uuid resume, 2 = CLI usage error | TEST | §2.4 |
| 50 | 12 hook events exist in the binary; the docs list 11 (omit `Interrupt`) | TEST+WEB | binary `HookEventName` enum vs docs/hooks |
| 51 | `HookTrustStatus` = `managed \| untrusted \| trusted \| modified`; managed hooks bypass trust | TEST | generated `HooksListResponse.json` |
| 52 | MCP hooks, prompt hooks and agent hooks are declared but **not implemented** in 0.150.1 | TEST | binary strings: `MCP hooks are not supported`, `prompt hooks are not supported yet`, `agent hooks are not supported yet` |
| 53 | Config layer order (lowest→highest): packaged defaults, MDM, system, enterprise-managed, user, project, legacy `managed_config.toml` | TEST | binary strings `Config layer stack (lowest precedence first)` |
| 54 | `requirements.toml` rules may not use `decision = "allow"` | TEST | binary string: `has decision 'allow', which is not permitted in requirements.toml` |
| 55 | Project-local config/hooks/execpolicy are disabled until the project is trusted | TEST | app-server stderr; `config.toml` `[projects.*] trust_level` |
| 56 | `codex mcp-server` is deprecated in favour of the app server | WEB | learn.chatgpt.com/docs/codex-sdk |
| 57 | Docs moved: `developers.openai.com/codex/*` 308-redirects to `learn.chatgpt.com/docs/*`; repo `docs/*.md` are now stubs | WEB | doc sweep, 2026-09-02 |

---

## 1. Identity

**(TEST)** `codex --version` → `codex-cli 0.150.1`.
Install path `/opt/homebrew/bin/codex` is a symlink into `/opt/homebrew/Caskroom/codex/0.150.1/bin/codex`. `codex doctor` reports:

```
✓ runtime      brew (package /opt/homebrew/Caskroom/codex/0.150.1, …)
      install method           brew
      executable               /opt/homebrew/bin/codex
✓ install      consistent
      managed by               npm: no · bun: no · pnpm: no
Updates
      update action            brew upgrade --cask codex
      latest version           0.152.1
      latest version status    newer version is available
```

So this install is **two minor releases behind**. `codex doctor` is the single best one-shot environment probe — it prints `CODEX_HOME`, the resolved config path, auth mode, MCP server count, sandbox posture, rollout inventory and the update target. It is cheap (no model call) and worth running as a preflight in any harness integration.

**Release cadence (WEB, 2026-09-02).** `https://github.com/openai/codex/releases` — multiple stable releases per week plus near-daily `-alpha.N` tags; `0.152.0` and `0.152.1` both shipped 2026-09-01. Treat the CLI surface as unstable across minor versions.

**Canonical docs (WEB, 2026-09-02).** The docs moved. `developers.openai.com/codex/*` now issues a blanket **308 Permanent Redirect** to `https://learn.chatgpt.com/docs/*` — and because the rewrite is unconditional, a 308 is *not* evidence the target page exists. Current pages:

| Topic | URL |
|---|---|
| CLI overview | `https://learn.chatgpt.com/docs/codex/cli` |
| Non-interactive / `--json` | `https://learn.chatgpt.com/docs/non-interactive-mode` |
| Hooks | `https://learn.chatgpt.com/docs/hooks` |
| Sandbox | `https://learn.chatgpt.com/docs/sandboxing` |
| Rules (execpolicy) | `https://learn.chatgpt.com/docs/agent-configuration/rules` |
| Config reference | `https://learn.chatgpt.com/docs/config-file/config-reference` |
| MCP | `https://learn.chatgpt.com/docs/extend/mcp` |
| Developer commands (resume/fork) | `https://learn.chatgpt.com/docs/developer-commands?surface=cli` |
| SDK | `https://learn.chatgpt.com/docs/codex-sdk` |
| Changelog | `https://learn.chatgpt.com/docs/changelog` |

Every page is fetchable as raw markdown by appending `.md`. The index is `https://learn.chatgpt.com/llms.txt`.
**The `openai/codex` repo's `docs/*.md` files are now one-line stubs** pointing at the hosted docs — they are no longer a content source. The exception is `docs/config.md`, which still carries a real "Lifecycle hooks" section on `allow_managed_hooks_only`.

**CLI vs SDK (WEB).** `https://learn.chatgpt.com/docs/codex-sdk` — "If you use Codex through Codex CLI, the IDE extension, or Codex cloud, you can also control it programmatically." TypeScript (Node 18+) and Python (3.10+) SDKs live at `github.com/openai/codex/tree/main/sdk`. **`codex mcp-server` is deprecated**; custom clients are pointed at the **app server** (`codex app-server`), which is the same protocol this document uses for `hooks/list`.

---

## 2. Invocation

### 2.1 The stdin trap — read this first

**(TEST)** This is the single most important operational fact for automation.

```
$ codex exec --json --skip-git-repo-check -m gpt-5.4-mini -s workspace-write \
    -c approval_policy='"never"' "…prompt…" > run1.jsonl 2> run1.err
   (hung; killed at 2 minutes)
$ cat run1.err
Reading additional input from stdin...
$ wc -l < run1.jsonl
0
```

`codex exec` **hangs forever** when stdin is a pipe that never closes — even though a prompt argument was supplied. The help explains why: *"If stdin is piped and a prompt is also provided, stdin is appended as a `<stdin>` block"*. **(WEB)** the docs say the same: "If stdin is piped and you also provide a prompt argument, Codex treats the prompt as the instruction and the piped content as additional context."

The fix is unconditional: **always run `codex exec` with `< /dev/null`** (or a closed stdin) unless you deliberately want to append stdin.

```
$ codex exec … "…prompt…" < /dev/null > run1.jsonl 2> run1.err
EXIT=0 ; 10 events
```

Note the `Reading additional input from stdin...` line is printed to stderr **even with `/dev/null`** — it is not a warning you can key on.

### 2.2 Flag surface — three different shapes

**(TEST)** The flag sets of `codex`, `codex exec` and `codex exec resume` differ, and the differences bite.

| Flag | `codex` | `codex exec` | `codex exec resume` |
|---|---|---|---|
| `-m/--model` | ✅ | ✅ | ✅ |
| `-s/--sandbox` | ✅ | ✅ | ❌ |
| `-a/--ask-for-approval` | ✅ | ❌ | ❌ |
| `-C/--cd` | ✅ | ✅ | ❌ |
| `--add-dir` | ✅ | ✅ | ❌ |
| `-p/--profile` | ✅ | ✅ | ❌ |
| `--json` | ❌ | ✅ | ✅ |
| `-o/--output-last-message` | ❌ | ✅ | ✅ |
| `--output-schema` | ❌ | ✅ | ✅ |
| `--ephemeral` | ❌ | ✅ | ✅ |
| `--ignore-user-config` | ❌ | ✅ | ✅ |
| `--ignore-rules` | ❌ | ✅ | ✅ |
| `--skip-git-repo-check` | ❌ | ✅ | ✅ |
| `--dangerously-bypass-hook-trust` | ✅ | ✅ | ✅ |
| `--color` | ❌ | ✅ | ❌ |

Consequences:
- **Approval policy in `exec` must be set with `-c approval_policy='"never"'`** (TOML value, so the inner quotes are required). `codex exec … -a never` fails with exit 2.
- **Sandbox on resume must be `-c sandbox_mode='"workspace-write"'`.**
- **There is no `-C` on resume** — you must `cd` to the workspace yourself, or accept the process cwd (see §4.4).

Defaults observed in a run with no overrides **(TEST)**:

```
workdir: /private/tmp/deepcodex-wxsh/work
model: gpt-5.6-sol
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: none
```

So `codex exec`'s default approval policy is already `never`, and the default sandbox is `workspace-write` scoped to the workdir plus `/tmp` and `$TMPDIR`.

### 2.3 Subcommands relevant to automation

`codex exec [PROMPT]`, `codex exec resume <ID|name> [PROMPT]`, `codex exec fork <ID|name> [PROMPT]`, `codex exec review`.
Also: `codex mcp {list,get,add,remove,login,logout}`, `codex app-server`, `codex doctor`, `codex features list`, `codex sandbox <cmd>` (run a command under the seatbelt sandbox with no model at all — useful for testing policies), `codex debug models`, `codex queue`, `codex archive`/`unarchive`/`delete`.

`codex app-server generate-json-schema --out <dir>` emits 295 JSON Schema files describing the whole protocol. This is the authoritative reference for config shapes and is free to run.

### 2.4 Exit codes (TEST)

| Exit | Meaning | Evidence |
|---|---|---|
| `0` | Turn completed. **Also returned when tools were blocked by a hook or by execpolicy.** | run6, rules run |
| `0` | Also returned when a resume silently degraded to a new session | §4.5 |
| `1` | Turn failed (`turn.failed` event) — e.g. unsupported model | model matrix |
| `1` | `.rules` failed to parse — printed before any model call | §6.1 |
| `1` | `resume <unknown-uuid>` → `no rollout found for thread id … (code -32600)` | §4.5 |
| `2` | CLI usage error (unknown flag) | `codex exec … -a never` |

**Exit code alone is not a safety signal.** A run in which every tool call was denied still exits 0.

---

## 3. Output protocol (`--json`)

**(TEST)** A complete, unedited stream from a two-tool run:

```json
{"type":"thread.started","thread_id":"01a060ef-403a-7590-ba87-9a889da80a87"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"I'll run the shell command first…"}}
{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"/bin/zsh -lc 'echo hello-from-codex'","aggregated_output":"","exit_code":null,"status":"in_progress"}}
{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"/bin/zsh -lc 'echo hello-from-codex'","aggregated_output":"hello-from-codex\n","exit_code":0,"status":"completed"}}
{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"…"}}
{"type":"item.started","item":{"id":"item_3","type":"file_change","changes":[{"path":"/private/tmp/…/note.txt","kind":"add"}],"status":"in_progress"}}
{"type":"item.completed","item":{"id":"item_3","type":"file_change","changes":[{"path":"/private/tmp/…/note.txt","kind":"add"}],"status":"completed"}}
{"type":"item.completed","item":{"id":"item_4","type":"agent_message","text":"Created `note.txt` with `banana`."}}
{"type":"turn.completed","usage":{"input_tokens":36326,"cached_input_tokens":27904,"cache_write_input_tokens":0,"output_tokens":212,"reasoning_output_tokens":52}}
```

### 3.1 Envelope types

`thread.started` · `turn.started` · `item.started` · `item.completed` · `turn.completed` · `turn.failed` · `error`.
**(WEB)** docs/non-interactive-mode: "Event types include `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.*`, and `error`." Matches.

### 3.2 Item types observed live

| `item.type` | Fields |
|---|---|
| `agent_message` | `id`, `text` |
| `command_execution` | `id`, `command`, `aggregated_output`, `exit_code`, `status` |
| `file_change` | `id`, `changes[{path,kind}]`, `status` |
| `mcp_tool_call` | `id`, `server`, `tool`, `arguments`, `result`, `error`, `status` |
| `error` | `id`, `message` |

**(WEB)** docs also list reasoning, web searches and plan updates as item types; those were not exercised here.

Note `item.type: "error"` is used for **warnings**, not only failures — `--dangerously-bypass-hook-trust` emits two of them per run and the turn still succeeds.

### 3.3 Where the identifiers live

- **Thread/session id:** `thread.started.thread_id` — and nowhere else in the stream. It is the same UUID used by `codex exec resume`, and the same one embedded in the rollout filename.
- **Token usage:** `turn.completed.usage` — and nowhere else. Fields: `input_tokens`, `cached_input_tokens`, `cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens`. There is no per-item cost.
- **Turn id:** *not* in the `--json` stream at all. It appears only in hook payloads (`turn_id`).

### 3.4 The blind spot — blocked calls are invisible

This is the most consequential finding in this document.

**(TEST)** A `PreToolUse` hook denied a `Bash` call. The complete `--json` stream:

```json
{"type":"thread.started","thread_id":"01a060f1-b22c-7b22-a287-ddc5f61b8ddc"}
{"type":"item.completed","item":{"id":"item_0","type":"error","message":"`--dangerously-bypass-hook-trust` is enabled…"}}
{"type":"item.completed","item":{"id":"item_1","type":"error","message":"`--dangerously-bypass-hook-trust` is enabled…"}}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"I'll run the shell command exactly as requested…"}}
{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"The shell is blocked in this session, so I'm writing…"}}
{"type":"item.started","item":{"id":"item_4","type":"file_change",…}}
…
{"type":"turn.completed","usage":{…}}
```

There is **no `command_execution` item at all** for the denied call. The only machine-readable trace is a line on **stderr**:

```
ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: HYPERIDLE GATE: … Command: echo secret-value
```

The same holds for execpolicy denials (§6.2): zero stream items, one stderr line.

**Implications for a supervisor:**
1. You cannot detect a blocked tool call by reading `--json`. You must parse **stderr** for `Command blocked by PreToolUse hook:` / `Tool call blocked by PreToolUse hook:` / `rejected:`.
2. Better: have the hook script itself emit a record to a sidecar file. The hook runs in your process tree and can log whatever you want. Do not rely on the harness telling you.
3. Contrast with MCP: an MCP failure **does** appear structurally (`status:"failed"`, `error.message`). The stream is inconsistent about which denials it reports.

### 3.5 Structured final output

**(TEST)** `--output-schema schema.json -o last.txt` with
`{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"],"additionalProperties":false}`
wrote `last.txt` = `{"answer":"done"}`. Both flags work on `exec` and `exec resume`.

---

## 4. Session model

### 4.1 Identity

A session/thread is a UUID (v7-shaped, e.g. `01a060f4-25cd-79c2-b2a4-a50fc0cc448e`). It is surfaced in `thread.started.thread_id`, in the hook payload as `session_id`, and inside the rollout filename. Sessions may additionally carry a **name**, which `resume` will accept in place of a UUID — see §4.5 for why that is dangerous.

### 4.2 On-disk transcripts

**(TEST)**

```
$CODEX_HOME/sessions/2026/09/02/rollout-2026-09-02T09-04-47-01a060ef-403a-7590-ba87-9a889da80a87.jsonl
```

First line is a `session_meta` record:

```json
{"timestamp":"…","ordinal":0,"type":"session_meta","payload":{
  "session_id":"01a060ef-…","id":"01a060ef-…","cwd":"/private/tmp/deepcodex-wxsh/work",
  "originator":"codex_exec","cli_version":"0.150.1","source":"exec","thread_source":"user",
  "model_provider":"openai","base_instructions":{"text":"You are Codex, a coding agent based on GPT-5…"}}}
```

The full system prompt is stored in the rollout — useful for auditing, and a reason to treat rollout files as sensitive.

There is also a **thread-history SQLite mirror**. `codex doctor` cross-checks the two:

```
✓ threads      rollout files and state DB thread inventory agree
      rollout DB active files  22        rollout DB rows          22
      rollout DB sources       exec=22
```

Other state in `CODEX_HOME`: `state_5.sqlite`, `logs_2.sqlite` (**735 MB on the real home**), `goals_1.sqlite`, `memories_1.sqlite`, `queue_1.sqlite`, `thread_history_1.sqlite`, `archived_sessions/`, `session_index.jsonl`, `models_cache.json`, `auth.json`.

**Do not copy `~/.codex` wholesale** to build an isolated home — the SQLite files are large and locked. Copying **only `auth.json`** into a fresh `CODEX_HOME` worked for every run in this document, including `codex login status` → `Logged in using ChatGPT`.

### 4.3 What `resume` does

**(TEST)** `codex exec resume <uuid> "<prompt>"` reloads the rollout, keeps the **same** `thread_id`, and appends a new turn. Full context survives: in the phase-1/phase-2 experiment the model recalled the exact filename (`gate-target.txt`) and the exact command it had been blocked on, without being retold.

**What is re-read on resume:** `hooks.json`, `config.toml` (including `[hooks.state]`), and `rules/*.rules`. This is what makes a "hold list" mutable between runs.
**What is not carried:** the sandbox mode is re-derived from config/defaults, not inherited from the CLI flags of the original run — and since `resume` has no `-s`, you must pass `-c sandbox_mode=…`.

`codex exec fork <ID>` forks into a *new* session instead of appending.

### 4.4 Different working directory

**(TEST)** Resuming a session from a different directory works, silently:

```
$ cd /tmp/deepcodex-wxsh/other        # a different git repo
$ codex exec resume 01a060f4-… --json "…what filename did I ask for, and what is your cwd?"
thread_id: 01a060f4-25cd-79c2-b2a4-a50fc0cc448e
MSG> You originally asked for `gate-target.txt`, and my current working directory is `/private/tmp/deepcodex-wxsh/other`.
```

Same thread, context intact, **cwd rebound to the new process cwd**, no warning. Sessions are not pinned to their original workspace. Combined with the absence of `-C` on `resume`, this means the caller is fully responsible for `cd`-ing correctly — get it wrong and the agent will happily operate on the wrong tree.

### 4.5 Failure modes — tested, and two are silent

| Input | Result |
|---|---|
| Well-formed UUID, no such rollout | **(TEST)** exit 1, `Error: thread/resume: thread/resume failed: no rollout found for thread id 00000000-… (code -32600)`, empty stdout. Loud and safe. |
| Non-UUID string that matches no session name | **(TEST)** **exit 0, brand-new session, new `thread_id`, no warning.** `codex exec resume not-a-uuid --json "hi"` produced a fresh `thread.started` with a different id. |
| `--last` with no sessions in `CODEX_HOME` | **(TEST)** **exit 0, brand-new session.** Verified in a fresh `CODEX_HOME`. |
| `--ephemeral` run, then resume | Impossible — no rollout is written (§4.6). |

**This is a trap worth engineering around.** If your session id is ever empty, truncated, or a name rather than a UUID, codex will not tell you the resume failed — it will start a fresh agent with no memory and report success. **Always assert that `thread.started.thread_id` in the resumed run equals the id you asked for.** That single check catches both silent cases.

### 4.6 `--ephemeral`

**(TEST)** Session-file count before and after an `--ephemeral` run: 22 → 22. Nothing is persisted, so the run cannot be resumed. Useful for one-shot work; incompatible with any gate-and-resume flow.

---

## 5. Permission / interception

Four independent mechanisms exist. They compose, and they have opposite failure modes.

### 5.1 The complete hook wire contract (extracted from the binary)

The binary embeds 23 JSON Schemas. Twelve events exist **(TEST)**, from the `HookEventName` enum in the generated app-server schema:

```
preToolUse  permissionRequest  postToolUse  preCompact  postCompact
sessionStart  sessionEnd  userPromptSubmit  subagentStart  subagentStop
stop  interrupt
```

**(WEB)** docs/hooks lists eleven — it omits `Interrupt`. The binary is the authority.

**`pre-tool-use.command.input`** (what your script reads on stdin) — all fields required:

```json
{"cwd","hook_event_name":"PreToolUse","model","permission_mode","session_id",
 "tool_input","tool_name","tool_use_id","transcript_path","turn_id",
 "agent_id"?,"agent_type"?}
```
`permission_mode` ∈ `default | acceptEdits | plan | dontAsk | bypassPermissions`.
`turn_id` is documented in-schema as *"Codex extension: expose the active turn id to internal turn-scoped hooks."*

A real payload **(TEST)**:

```json
{"session_id":"01a060f1-0478-7e41-9ad4-208c77a7b041",
 "turn_id":"01a060f1-04c0-7dd2-9dd7-e0855c8aed32",
 "transcript_path":"/private/tmp/…/sessions/2026/09/02/rollout-…jsonl",
 "cwd":"/private/tmp/deepcodex-wxsh/work","hook_event_name":"PreToolUse",
 "model":"gpt-5.4-mini","permission_mode":"bypassPermissions",
 "tool_name":"Bash","tool_input":{"command":"echo probe-A"},
 "tool_use_id":"call_YJYH8d9rKCG2KDZ5bn8ZjUG5"}
```

⚠️ **`permission_mode` was reported as `bypassPermissions` in every `exec` run** — with `approval_policy = "never"` *and* with `approval_policy = "on-request"`. Do not treat it as a faithful mirror of the approval policy.

**`pre-tool-use.command.output`** (what your script writes to stdout):

```json
{"continue": true,                      // boolean, default true — SEE §5.6, IGNORED in exec
 "decision": "approve" | "block",
 "reason": "…",                          // required when decision == "block"
 "stopReason": "…",
 "suppressOutput": false,
 "systemMessage": "…",
 "hookSpecificOutput": {
   "hookEventName": "PreToolUse",        // required
   "permissionDecision": "allow" | "deny" | "ask",
   "permissionDecisionReason": "…",
   "additionalContext": "…",
   "updatedInput": <any>}}
```

Other events' outputs, extracted the same way:
- `post-tool-use.command.output` — adds `hookSpecificOutput.updatedMCPToolOutput`; `decision` is `block` only.
- `stop.command.output` — `decision: "block"` only, and the schema carries the note *"Claude requires `reason` when `decision` is `block`; we enforce that semantic rule during output parsing rather than in the JSON schema."*
- `session-start.command.output` / `user-prompt-submit.command.output` — `hookSpecificOutput.additionalContext`.
- `pre-compact.command.output` / `post-compact.command.output` — only the four common fields; no decision.

The wire format is **deliberately Claude-Code-compatible**. The binary reads `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA` placeholders and recognises `settings.json` / `settings.local.json` / `disableAllHooks` for migration.

**Not implemented in 0.150.1 (TEST, binary strings):**
```
skipping MCP tool hook in <…>: MCP hooks are not supported
skipping prompt hook in <…>: prompt hooks are not supported yet
skipping agent hook in <…>: agent hooks are not supported yet
```
So although `HookHandlerConfig` has `command | mcp_tool | prompt | agent` variants, **only `command` works**.

### 5.2 Config file locations and shape

**(WEB)** docs/hooks: *"Codex discovers hooks next to active config layers in either of these forms: `hooks.json` [or] inline `[hooks]` tables inside `config.toml`"*, and *"If more than one hook source exists, Codex loads all matching hooks. Higher-precedence config layers don't replace lower-precedence hooks."*

**(TEST)** Both of these fired live:
- `$CODEX_HOME/hooks.json` → `hooks/list` reports `"source":"user"`
- `<repo>/.codex/hooks.json` → `"source":"project"`
- ❌ `$CODEX_HOME/hooks/hooks.json` is **not** a location — a file placed there was silently ignored (this was my first wrong guess; it cost two runs and produced *no* diagnostic).

Working file **(TEST)**:

```json
{"hooks":{"PreToolUse":[{"matcher":"^Bash$","hooks":[
  {"type":"command","command":"/abs/path/hook.sh","timeout":600}]}]}}
```

`matcher` is a **regex over the tool name**. Both `"^Bash$"` and `"*"` worked. Per-handler fields, from the generated `ConfiguredHookHandler` schema: `type` (`command`|`mcp_tool`|`prompt`|`agent`), `command`, `commandWindows`, `async`, `timeoutSec`, `statusMessage`, `additionalContextLimit`. `additionalContextLimit` is documented in-schema as *"`null` uses 2,500 tokens; `0` disables spilling for this hook"* — large `additionalContext` is spilled to disk (`Full hook output saved to: …`).

**Full config layer order (TEST, binary strings `Config layer stack (lowest precedence first)`):**
`packaged defaults` → `MDM` → `system` → `enterprise-managed` → `user` → `project` → `legacy managed_config.toml`.
Managed layers read `<managed-requirements>/requirements.toml`; `/etc/codex/managed_config.toml` is a real path. `HookSource` enumerates `system | user | project | mdm | sessionFlags | plugin | cloudRequirements | cloudManagedConfig | legacyManagedConfigFile | legacyManagedConfigMdm | unknown`.

**(TEST)** Project-local layers are gated on trust. The app-server says so plainly:
```
ERROR codex_app_server: Project-local config, hooks, and exec policies are disabled in the
following folders until the project is trusted, but skills still load.
  1. /Users/tg/hyperidle/.../.codex
     To load project-local config, hooks, and exec policies, add /Users/tg/hyperidle as a
     trusted project in <CODEX_HOME>/config.toml.
```
Trust is `[projects."<path>"] trust_level = "trusted"` in `config.toml`.

### 5.3 Hook trust — the silent killer

**(WEB)** docs/hooks: *"Codex requires you to review and trust the exact hook definition. Codex records trust against the hook's current hash, so new or changed hooks are marked for review and skipped until trusted."*

**(TEST)** "Skipped" means **absolutely silently**:

```
$ codex exec --json … "Run the shell command 'echo probe-A'. Then stop." < /dev/null
EXIT=0
stderr: Reading additional input from stdin...
hook invocations: 0
```

No stderr warning. No stream event. Exit 0. The tool ran. If you deploy a hook and never check, you will believe you are gated and you will not be.

`HookTrustStatus` **(TEST**, generated schema**)** = `managed | untrusted | trusted | modified`.

**Three ways to get a hook to actually run:**

**(a) `--dangerously-bypass-hook-trust`** — works, and is loud. **(TEST)** the hook fired (2 invocations) and the stream carried two warning items:
```json
{"type":"item.completed","item":{"id":"item_0","type":"error",
 "message":"`--dangerously-bypass-hook-trust` is enabled. Enabled hooks may run without review for this invocation."}}
```
**It does not persist trust** — after the run, `config.toml` contained only the `[projects.*]` entry.

**(b) Write the trusted hash yourself — the production path. (TEST)**
Get `key` and `currentHash` from the app server:

```
$ { printf '%s\n' \
   '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"p","title":"p","version":"0.0.1"}}}' \
   '{"jsonrpc":"2.0","method":"initialized","params":{}}' \
   '{"jsonrpc":"2.0","id":2,"method":"hooks/list","params":{"cwd":"'"$W"'"}}'; sleep 6; } \
  | CODEX_HOME=$CH codex app-server 2>/dev/null
```
```json
{"key":"/private/tmp/…/codexhome/hooks.json:pre_tool_use:0:0",
 "eventName":"preToolUse","handlerType":"command","command":"…/hooklog.sh",
 "async":false,"matcher":"^Bash$","timeoutSec":600,
 "sourcePath":"/private/tmp/…/codexhome/hooks.json","source":"user",
 "enabled":true,"isManaged":false,
 "currentHash":"sha256:5d5fe6ad91dbcade592a62108e0ec13ee69fcdcd6e4e27d0f32c89f04a89b4c3",
 "trustStatus":"untrusted"}
```
Two gotchas: the request needs `params.cwd`, and the app server needs a moment before it answers — without the trailing `sleep`, the `id:2` response never arrives.

Then write into `$CODEX_HOME/config.toml`:
```toml
[hooks.state."/private/tmp/…/codexhome/hooks.json:pre_tool_use:0:0"]
trusted_hash = "sha256:5d5fe6ad91dbcade592a62108e0ec13ee69fcdcd6e4e27d0f32c89f04a89b4c3"
```
**(TEST)** result: hook fired (1 invocation), **no** `--dangerously-bypass-hook-trust`, **zero** warning items in the stream, exit 0.

**(c) Managed hooks.** `HookTrustStatus: "managed"` and the TUI string *"Managed hooks are always on"* indicate that hooks delivered via MDM / `requirements.toml` bypass trust entirely. Not exercised here — see open questions.

### 5.4 The editing trap — confirmed

**(TEST)** With a valid `[hooks.state]` entry in place, I changed **one field** in `hooks.json` (`matcher` from `"^Bash$"` to `"*"`) and left `trusted_hash` untouched:

```
hook calls after editing hooks.json (stale hash): 0
any warning on stderr?   (none)
any warning in stream?   0
did the command run?     RAN: staleprobe
EXIT=0
```

**The hash covers the hook entry's content.** Any edit — matcher, timeout, even the command path — silently disarms the gate with zero diagnostics.

**Design consequence: `hooks.json` must be byte-stable for the life of a session.** Put anything mutable (a hold list, an approval flag) in a **sidecar file that the hook script reads at runtime**. The script's own contents are *not* hashed — only the `hooks.json` entry that names it — so the script can change freely, but in practice keep both stable and mutate a data file.

### 5.5 Fail-open vs fail-closed — measured

One run, four commands, a hook that behaves differently per command. **(TEST)**

| Hook behaviour | Tool outcome | Verdict |
|---|---|---|
| `exit 1` + stderr | `echo FAILEXIT` **ran** | **FAIL OPEN** |
| `sleep 20` with `"timeout": 3` | `echo TIMEOUTX` **ran** | **FAIL OPEN** |
| non-JSON on stdout, `exit 0` | `echo GARBAGE` **ran** | **FAIL OPEN** |
| `echo boom >&2; exit 2` | `echo EXIT2X` **blocked** | **FAIL CLOSED** |

The exit-2 block:
```
ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: boom. Command: echo EXIT2X
```
**stderr becomes the reason verbatim.** **(WEB)** docs/hooks agrees: hooks can *"use exit code `2` and write the blocking reason to `stderr`"*, and *"Exit `0` with no output is treated as success."*

**Timeout is real and enforced. (TEST)** A hook that slept 30 s with `"timeout": 4`: total wall clock for the whole run was **11 s**, and the command ran. So the key is `timeout`, the unit is seconds, it is honoured, and expiry fails open.
**(WEB)** default: *"If `timeout` is omitted, Codex uses `600` seconds for most hooks. `SessionEnd` uses `1` second by default and supports up to `3` seconds."* **(TEST)** `hooks/list` confirms `"timeoutSec": 600`.

**Net: a PreToolUse hook is a fail-open guard.** Three of four failure modes let the tool through. The only reliable deny paths are a well-formed `permissionDecision:"deny"` and `exit 2`. If the gate must hold when your infrastructure breaks, back it with `.rules` (§6), which fails closed.

### 5.6 `continue: false` does not work in `exec`

**(TEST)** A hook returning
```json
{"continue": false, "stopReason": "HYPERIDLE: session halted pending human decision.", "systemMessage": "gate halted the run"}
```
produced: **the command ran**, `exit 0`, and neither `stopReason` nor `systemMessage` appeared anywhere in the stream or on stderr.

The field is in the schema (`"continue": {"default": true, "type": "boolean"}`) but has no effect on a `PreToolUse` hook under `codex exec` in 0.150.1. **You cannot terminate a codex session from a hook.** To end a turn you must deny the tool and rely on the model choosing to stop (§7).

### 5.7 `PermissionRequest`

A separate event, fired when a tool needs approval under `approval_policy = "on-request"`. Its output shape is stricter:

```json
{"hookSpecificOutput":{"hookEventName":"PermissionRequest",
  "decision":{"behavior":"allow"|"deny","message":"…"}}}
```

The schema documents three reserved fields that **fail closed** if used:
- `interrupt` — *"PermissionRequest hooks currently fail closed if this field is `true`."*
- `updatedInput` — *"…fail closed if this field is present."*
- `updatedPermissions` — *"…fail closed if this field is present."*

**(TEST)** A `PermissionRequest` hook returning `behavior: "allow"` was invoked twice and unblocked MCP tool calls that `approval_policy` would otherwise have killed (§7.2). Its payload has no `tool_use_id` (unlike `PreToolUse`) but does carry `tool_name` and `tool_input`.

---

## 6. execpolicy `.rules`

### 6.1 Format — and the prior claim, confirmed

`.rules` files are **Starlark** (the binary links `starlark-0.14.2`). **(WEB)** docs/agent-configuration/rules: *"Rules are experimental and may change."*

**The specific prior claim under test** — that a `.rules` file containing bare `allow *` / `deny *` lines is invalid and makes codex exit 1 before any model call — is **CONFIRMED (TEST)**:

```
$ printf 'allow *\ndeny *\n' > $CODEX_HOME/rules/bad.rules
$ codex exec --json … "Reply with exactly the word OK…" < /dev/null
EXIT=1
Error loading rules:
/private/tmp/…/codexhome/rules/bad.rules:1: starlark error: error: Parse error: unexpected new line, expected expression (problem is on or around line 1)
```

stdout was **empty** — zero JSONL. The failure happens at startup, before the model is contacted. **`.rules` fails CLOSED**, the exact opposite of hooks.

> ⚠️ **A contradicting string exists in the binary**: `Error parsing rules; custom rules not applied.` appears in `app-server/src/lib.rs`. That suggests the **app-server / TUI path fails OPEN** on a broken rules file while the **`codex exec` CLI path fails CLOSED**. I measured only the CLI path. If you drive codex through the app server, re-test this.

**`--ignore-rules` (TEST)**: with the same broken file present, `codex exec --ignore-rules …` exited 0 and produced 4 events. This flag must never appear in a gated invocation.

The real grammar, from the binary's own error strings and the shipped `~/.codex/rules/default.rules`:

```python
prefix_rule(pattern=["git", "push"], decision="forbidden", justification="…")
prefix_rule(pattern=["npm", "run", "verify"], decision="allow")
network_rule(host="…", protocol="https", decision="allow", justification="…")
host_executable(name="node", paths=["/usr/local/bin/node"])
```

**(WEB)** decision values: *"allow: Run the command outside the sandbox without prompting. prompt: Prompt before each matching invocation. forbidden: Block the request without prompting."* and *"Codex applies the most restrictive decision when more than one rule matches (`forbidden` > `prompt` > `allow`)."*

Validation errors the parser emits (TEST, binary strings): `rules prefix_rule at index N has an empty pattern`, `… has an invalid pattern token at index N`, `… has an empty justification`, `… is missing a decision`, `network_rule protocol must be one of http, https, socks5_tcp, socks5_udp`, `host_executable paths must be absolute`, `expected every example to match at least one rule`.

There is also a built-in blocklist independent of your rules: `rm -f style commands are not permitted. Use a safer approach`.

### 6.2 Discovery and precedence

**(WEB)** *"Codex scans `rules/` under every active config layer at startup, including Team Config locations and the user layer at `~/.codex/rules/`. Project-local rules under `<repo>/.codex/rules/` load only when the project `.codex/` layer is trusted."*

**(TEST)** `$CODEX_HOME/rules/default.rules` loaded and took effect.
**(TEST)** `requirements.toml` (managed layers) **may not use `allow`**: `rules prefix_rule at index N has decision 'allow', which is not permitted in requirements.toml: Codex merges these rules with other config and uses the most restrictive result (use 'prompt' or 'forbidden')`.

### 6.3 What a forbidden command looks like

**(TEST)** `prefix_rule(pattern=["echo"], decision="forbidden")`, then a prompt to run `echo hello-rules`:

stderr:
```
ERROR codex_core::tools::router: error=exec_command failed for `/bin/zsh -c 'echo hello-rules'`:
CreateProcess { message: "Rejected(\"`/bin/zsh -c 'echo hello-rules'` rejected: policy forbids commands starting with `echo`\")" }
```
model's own final answer:
```
The command was not executed. The shell rejected it because of a policy rule that
forbids commands starting with `echo`.
```
`--json` stream: **zero `command_execution` items**. Same blind spot as §3.4.

Note codex **parses the shell command line** — the policy matched `echo` even though argv[0] is `/bin/zsh`.

### 6.4 The nested-shell hole — confirmed

**(TEST)** With `prefix_rule(pattern=["git","push"], decision="forbidden", justification="HYPERIDLE-GATE: git push is on hold.")`, one prompt asking for both forms:

```
(1) git push origin main            → Rejected("… HYPERIDLE-GATE: git push is on hold.")
(2) bash -lc 'git push origin main' → RAN. /bin/zsh -lc "bash -lc 'git push origin main'"
                                       exit 128, "fatal: 'origin' does not appear to be a git repository"
```

The second form **executed** — it only failed because the throwaway repo has no remote. `.rules` does not see through one level of nested shell. A `PreToolUse` hook does, because the hook script receives the whole raw command string in `tool_input.command` and can substring-match it.

**Neither mechanism is sufficient alone.** `.rules` fails closed but is evadable; hooks are not evadable by nesting but fail open. Run both.

---

## 7. Tool vocabulary — measured

Rules match on tool **names**, so these are load-bearing. **(TEST)**, read straight out of `PreToolUse` payloads:

| Tool name | `tool_input` | Stream item type |
|---|---|---|
| **`Bash`** | `{"command":"echo probe-A"}` | `command_execution` (with `command` rewritten to `/bin/zsh -lc '…'`) |
| **`apply_patch`** | `{"command":"*** Begin Patch\n*** Add File: probe.txt\n+x\n*** End Patch\n"}` | `file_change` |
| **`mcp__<server>__<tool>`** | the tool's own arguments, e.g. `{"question":"…"}` | `mcp_tool_call` (with separate `server` and `tool` fields) |

Notes:
- The hook sees the **model's** command (`echo probe-A`); the stream shows the **wrapped** command (`/bin/zsh -lc 'echo probe-A'`). Match on the former in hooks, the latter in `.rules`.
- File writes go through **`apply_patch`**, not a `Write`/`Edit` tool. Gating `Bash` alone leaves the entire filesystem writable — see §8.
- MCP naming is the double-underscore Claude convention: `mcp__humangate__ask_human`.
- The binary's shell allowlist (which interpreters it recognises when parsing a command line) includes: `bash bun cmd dash deno eval fish git julia ksh lua node nodejs npm osascript perl php pnpm powershell pwsh py python python3 pythonw rm ruby sh sudo yarn zsh Rscript`.

---

## 8. Blocking, routing around, and what actually holds

### 8.1 The reason reaches the model, verbatim, and is obeyed

**(TEST)** Hook returns:
```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
 "permissionDecisionReason":"HYPERIDLE GATE: running shell commands is not permitted in this session. Do not retry the shell. Instead write the answer into a file named blocked-note.txt using your patch tool."}}
```
Codex wraps it: `Command blocked by PreToolUse hook: <your reason>. Command: <cmd>` (for non-shell tools: `Tool call blocked by PreToolUse hook: <reason>. Tool: <name>`). Everything between the fixed ends is yours.

The model **read the instruction and followed it exactly**, writing `blocked-note.txt` via `apply_patch`. You can steer a blocked agent with the reason string. That is the mechanism BA2 needs.

### 8.2 …which is also the danger: it routes around

**(TEST)** In that same run the model **fabricated** the blocked command's output (`secret-value`) and wrote it to a file, then reported success. In the MCP run (§8.4) it was told the shell was gated and simply used `apply_patch` to achieve the identical file-write effect.

**Blocking `Bash` does not block the effect.** If you gate the shell you must also gate `apply_patch`, or the agent will write files anyway. A matcher of `"*"` with per-tool logic in the script is the safe default; `"^Bash$"` is a hole.

Conversely, when the reason *explicitly forbids workarounds* — *"Do not attempt any workaround and do not use any other tool. Stop now and tell the user you are waiting for approval."* — **(TEST)** the model complied: one blocked attempt, no second tool call, turn ended with `Waiting for approval to run the shell command that writes gate-target.txt.` and exit 0. **Write the prohibition into the reason.** It is behavioural, not enforced, so pair it with a `"*"` matcher.

### 8.3 End-to-end: block → stop → resume with a human's answer → retry

This is the product question, tested in full. **(TEST)**

**Phase 1** — hook denies `Bash` with a "waiting for approval" reason:
```
EXIT=0
THREAD_ID=01a060f4-25cd-79c2-b2a4-a50fc0cc448e
stderr: ERROR … Command blocked by PreToolUse hook: HYPERIDLE GATE: this shell command needs
        human approval… Command: echo APPROVED > gate-target.txt
model:  "Waiting for approval to run the shell command that writes `gate-target.txt`."
file:   gate-target.txt does not exist
```

**Phase 2** — flip the sidecar approval flag, resume the same thread:
```
$ codex exec resume 01a060f4-25cd-79c2-b2a4-a50fc0cc448e --json --skip-git-repo-check \
    -m gpt-5.4-mini -c sandbox_mode='"workspace-write"' -c approval_policy='"never"' \
    "The human has approved your request. Proceed now with exactly what you were waiting on." < /dev/null
```
```json
{"type":"thread.started","thread_id":"01a060f4-25cd-79c2-b2a4-a50fc0cc448e"}
{"type":"item.completed","item":{"type":"agent_message","text":"I'm running the exact command now to create `gate-target.txt` with `APPROVED`."}}
{"type":"item.completed","item":{"type":"command_execution","command":"/bin/zsh -c 'echo APPROVED > gate-target.txt'","exit_code":0,"status":"completed"}}
{"type":"turn.completed","usage":{…}}
```
```
$ cat gate-target.txt
APPROVED
```

**Same `thread_id`. Context fully preserved** — the model was never retold the filename or the command. The hook config was re-read, the gate was open, and it retried the exact blocked action.

**The shape works.** Where it works and where it breaks:

| Step | Status |
|---|---|
| Block a specific tool call | ✅ works (`permissionDecision:"deny"` or exit 2) |
| Tell the model *why*, verbatim | ✅ works, and the instruction is obeyed |
| Let it do something else instead | ✅ works — it will use `apply_patch` or an MCP tool |
| Have it call an MCP tool to ask a human | ⚠️ works **only** with `approval_policy="on-request"` + a `PermissionRequest` hook (§8.4) |
| End the session from the hook | ❌ **broken** — `continue:false` is ignored; you can only ask the model to stop |
| Resume that same session later | ✅ works, from any cwd |
| Deliver the human's answer on resume | ✅ works — as the resume prompt, and/or by flipping a sidecar file the hook reads |
| Retry the blocked action | ✅ works |
| **Observe the block from `--json`** | ❌ **broken** — parse stderr or log from the hook |
| **Know the resume actually attached** | ⚠️ must assert `thread_id` yourself (§4.5) |

### 8.4 The MCP escape hatch, and the approval-policy trap

**(TEST)** With `approval_policy = "never"` — the natural setting for automation — **every MCP tool call fails**:

```json
{"type":"item.completed","item":{"type":"mcp_tool_call","server":"humangate","tool":"ask_human",
 "arguments":{"question":"Approve running this shell command…"},
 "result":null,"error":{"message":"MCP tool call requires approval, but approval policy is never"},
 "status":"failed"}}
```

The "agent asks a human via MCP" pattern is **dead on arrival** under `never`.

**(TEST)** The fix: `approval_policy = "on-request"` **plus** a `PermissionRequest` hook that auto-allows:
```json
{"hookSpecificOutput":{"hookEventName":"PermissionRequest",
  "decision":{"behavior":"allow","message":"auto-allowed by HyperIdle gate"}}}
```
Result — the full loop in one session:
```
mcp_tool_call ask_human  → status "completed",
  result: "The human says: yes, you may proceed, but write it to human-ok.txt instead."
agent: "The operator approved the write, but changed the target file."
file_change: human-ok.txt   ← created
```
The `PermissionRequest` hook was invoked twice, once per MCP call, and `human-ok.txt` was written with the human's amended instruction.

Note the model still reached for `apply_patch` at the end rather than retrying the shell — reinforcing §8.2.

### 8.5 MCP configuration and failure behaviour

**(WEB)** docs/extend/mcp: *"Codex stores MCP configuration in `config.toml` alongside other Codex configuration settings."*

**(TEST)** Working stdio declaration in `$CODEX_HOME/config.toml`:
```toml
[mcp_servers.humangate]
command = "/opt/homebrew/opt/node@24/bin/node"
args = ["/abs/path/mcpsrv.mjs"]
```
```
$ codex mcp list
Name       Command                             Args             Env  Cwd  Status   Auth
humangate  /opt/homebrew/opt/node@24/bin/node  …/mcpsrv.mjs     -    -    enabled  Unsupported

$ codex mcp get humangate
humangate
  enabled: true
  transport: stdio
```
Other config keys visible in the binary: `url`, `http_headers`, `env_http_headers`, `bearer_token_env_var` (plain `bearer_token` is rejected: *"uses unsupported `bearer_token`; set `bearer_token_env_var`."*), `env_key`, `startup_timeout_ms`, `timeout_ms`, `refresh_interval_ms`, `cwd`, `enabled`. OAuth is supported via `codex mcp login`; OAuth lock state lives in `$CODEX_HOME/mcp-oauth-locks/`.

**⚠️ A broken MCP server fails completely silently. (TEST)** With
```toml
[mcp_servers.broken]
command = "/nonexistent/binary-xyz"
```
the run produced: **exit 0**, **nothing on stderr**, and **no event of any kind in the `--json` stream**. The binary has an `McpStartupFailure` struct (the app-server surfaces it), but `codex exec --json` does not. A misconfigured MCP server — the thing your human-in-the-loop path depends on — is invisible to automation.

**Mitigation:** before relying on an MCP tool, verify it is actually loaded. `codex doctor` reports `✓ mcp  1 server (1 stdio) · 0 disabled` from config, which only proves it is *declared*. The only proof it *works* is a run in which the tool is called, or a direct probe of the server process.

**Startup ordering (TEST, binary strings):** the binary carries `MCP server tool list changed`, `MCP server prompt list changed`, `MCP server resource list changed` notifications and `mcp_refresh.rs`, so the tool list is refreshed asynchronously. No readiness race was reproduced in these runs, but tools are not guaranteed present at turn 1 of a cold start.

---

## 9. Isolation — what leaks

**(TEST)** A fresh `CODEX_HOME` containing **only** a copied `auth.json` is sufficient:
```
$ CODEX_HOME=$CH codex login status
Logged in using ChatGPT
```
Codex then populates the home itself (sqlite DBs, `skills/.system/`, `plugins/cache/`, `models_cache.json`, `sessions/`). Nothing from `~/.codex/config.toml` leaked into the isolated runs — the default model was the built-in `gpt-5.6-sol`, not the real home's setting.

`--ignore-user-config`: help text says *"Do not load `$CODEX_HOME/config.toml`; auth still uses `CODEX_HOME`"*.

**⚠️ It does more than that. (TEST)** Clean A/B with a project hook at `<repo>/.codex/hooks.json` and nothing else changed:
```
project hook calls WITHOUT --ignore-user-config: 1
project hook calls WITH    --ignore-user-config: 0
(the file still exists)
```
**`--ignore-user-config` also disables PROJECT-level hooks**, which its documentation does not say. It also removed the user-config MCP servers — the model reported *"No `mcp__` tools are exposed in this session."*

Practical isolation recipe:
```
<sandbox>/.codex-home/
  auth.json          # copied from ~/.codex — never symlink, never copy the sqlite files
  config.toml        # [projects."<workspace>"] trust_level = "trusted"
                     # [hooks.state."<key>"] trusted_hash = "…"
                     # [mcp_servers.*]
  hooks.json         # byte-stable for the session's life
  rules/default.rules
```
plus `CODEX_HOME=<that dir>` and **never** `--ignore-user-config` or `--ignore-rules` in the argv.

What still reaches in from outside `CODEX_HOME`: managed/MDM layers (`/etc/codex/managed_config.toml`, `<managed-requirements>/requirements.toml`), the project's own `.codex/` directory (if the project is trusted), `AGENTS.md`, and the environment (`PATH`, proxy vars, `CODEX_SANDBOX*`).

---

## 10. Limits and stalls

- **The stdin hang (§2.1)** is the reproducible one. Foreground `codex exec` in a pipeline without `< /dev/null` will hang forever. Reproduced deterministically.
- **Hook timeout**: default 600 s, per-hook `timeout` in seconds, enforced, fails open. `SessionEnd` is 1 s (max 3 s) — too short for anything but a fire-and-forget signal. The binary carries `clamping <event> hook timeout to <n>s in <path>`, so out-of-range values are silently clamped rather than rejected.
- **A hook runs synchronously in the tool path.** Every gated tool call pays the hook's latency. `async: true` exists in the schema, and the binary warns `running async <event> hook synchronously in <path>` for events that cannot be async.
- **`additionalContext` above ~2,500 tokens is spilled to disk** (`Full hook output saved to: …`), configurable per-hook via `additionalContextLimit`; `0` disables spilling.
- **Websocket**: `codex doctor` reports `✓ websocket connected (HTTP 101) · 15s timeout` — a 15 s connection timeout to the provider.
- **No wall clock on a turn** was observed; long runs are bounded only by the model. A progress notification resetting a timer was **not** tested — see open questions.
- **`logs_2.sqlite` grows without obvious bound** — 735 MB on the real `~/.codex`. Worth monitoring on any long-lived machine.

---

## Prior-claims audit

Against `interception-codex.md` (dated 2026-08-31, same binary version).

### CONFIRMED (re-proved independently)

1. **`.rules` with bare `allow *` / `deny *` is invalid Starlark → codex exits 1 before any model call.** The claim under special scrutiny. Confirmed exactly, including that stdout is empty.
2. `.rules` fails **CLOSED** on a malformed file; hooks fail **OPEN**. Confirmed both directions.
3. Hooks fail open in **all three** non-blocking failure modes (exit 1, malformed JSON, timeout). Confirmed with a single four-way run.
4. **Exit 2 + stderr blocks**, and stderr becomes the reason. Confirmed.
5. `permissionDecision: "deny"` + `permissionDecisionReason` blocks, and the reason reaches the model **verbatim**. Confirmed.
6. The wrapping envelope is `Command blocked by PreToolUse hook: <reason>. Command: <cmd>`. Confirmed (and the `Tool call blocked by …` variant exists in the binary).
7. **An untrusted hook is silently skipped with no warning at all.** Confirmed — zero output on stderr and in the stream.
8. **`[hooks.state."<key>"] trusted_hash = "sha256:…"` in `config.toml` makes the hook fire without the dangerous flag.** Confirmed end to end, including obtaining `key`/`currentHash` via `hooks/list` over `codex app-server`.
9. **Editing `hooks.json` invalidates the hash and the hook is silently skipped.** Confirmed by changing only `matcher`.
10. `--dangerously-bypass-hook-trust` works and emits warnings into the output stream. Confirmed — they arrive as two `item.completed / type:"error"` items.
11. Tool names are **`Bash`** and **`apply_patch`**; PreToolUse fires for both. Confirmed.
12. `matcher` matches the **tool name** as a regex, not the command text; the command text is available to the script in `tool_input.command`. Confirmed (`^Bash$` and `*` both work).
13. `.rules` **does not see through a nested shell** — `bash -lc 'git push …'` ran while `git push …` was rejected. Confirmed.
14. `codex exec resume` **re-reads both mechanisms**, and a cleared gate lets the previously-blocked action run. Confirmed.
15. `codex exec resume` does **not** accept `-C`. Confirmed — and it also lacks `-s`, `--add-dir`, `-p`, `--color`.
16. Copying only `auth.json` into a throwaway `CODEX_HOME` is sufficient and safe; copying the sqlite files is not. Confirmed.
17. The 12-event `HookEventName` list. Confirmed, and cross-checked against the generated app-server schema.
18. A project-local `.codex/hooks.json` **is** discovered (the note called the older "it is ignored" claim unsafe). Confirmed — `hooks/list` reports it with `source: "project"`, and it fired live.

### REFUTED / CORRECTED

1. **"Resume also inherits the original sandbox mode (`sandbox: workspace-write` with no `-s` passed)."** Misleading. `workspace-write` is simply the **default**, not an inheritance. Since `resume` has no `-s` at all, a session started with `-s read-only` cannot be resumed read-only except via `-c sandbox_mode=…`. Do not rely on inheritance.
2. **The summary table's "Needs `--dangerously-bypass-hook-trust`: yes, unless you write `trusted_hash`" understates the trap.** True as written, but it omits that the flag **does not persist trust**, so every single invocation needs it. Confirmed by inspecting `config.toml` after a bypass run.
3. **"Misses: nothing observed" for the PreToolUse hook.** Not safe. With `matcher: "^Bash$"` — the very matcher the note recommends — `apply_patch` is **not** gated, and the model reliably routes a blocked shell write through `apply_patch`. Observed twice. The matcher must be `"*"` with per-tool logic in the script.
4. **`decision="prompt"` "denies under `-a never`".** Not re-tested in that form, but note `codex exec` has **no `-a` flag** at all — the note's command lines using `-a never` would fail with exit 2 on this binary. The equivalent is `-c approval_policy='"never"'`.

### NOT COVERED BY THE PRIOR NOTES — new findings

1. **The stdin hang.** `codex exec` blocks forever on a non-TTY stdin. Not mentioned anywhere in the prior notes; it is the first thing that will break a pipeline.
2. **Blocked tool calls are absent from the `--json` stream.** The prior notes worked from human-readable output and never examined `--json`, so this was missed entirely. It is the most consequential gap for a supervisor.
3. **`continue: false` is ignored.** You cannot end a session from a hook.
4. **`approval_policy="never"` kills all MCP tool calls**, and the fix is a `PermissionRequest` hook under `on-request`.
5. **A broken MCP server fails silently** — exit 0, no stderr, no stream event.
6. **`--ignore-user-config` also disables project-level hooks**, contrary to its help text.
7. **`resume` degrades silently to a new session** for a non-UUID name and for `--last` with no sessions.
8. **`$CODEX_HOME/hooks/hooks.json` is not a valid location** and produces no diagnostic.
9. **The model model-matrix on a ChatGPT login**: `gpt-5.4-nano`, `gpt-5-codex-mini` and `o3` all rejected with HTTP 400.
10. **MCP hooks, prompt hooks and agent hooks are declared but unimplemented.**

### COULD NOT TEST

1. The prior note's claim that `hooks` is a **feature flag** (`codex doctor --json` → enabled flags include `hooks`) and that disabling it silently kills the layer. `codex features list` was not exercised against a disabled `hooks` flag.
2. `decision="prompt"` behaviour and whether the justification is dropped.
3. Whether the prior note's exact `bash -lc` nesting evades the *hook* as well as `.rules` (it should not, since the hook sees the raw string, but I tested nesting only against `.rules`).

---

## Unverified / open questions

1. **Managed hooks.** `HookTrustStatus: "managed"` and *"Managed hooks are always on"* imply a `requirements.toml` path that bypasses trust entirely — likely cleaner than writing `trusted_hash`. The exact on-disk location codex probes for `<managed-requirements>/requirements.toml` was **not** determined; `/etc/codex/managed_config.toml` is a confirmed string but was not exercised. `allow_managed_hooks_only` exists as a requirements key. **Worth a follow-up** — it would remove the fragile hash bookkeeping.
2. **App-server vs CLI on broken `.rules`.** The CLI fails closed (measured). The string `Error parsing rules; custom rules not applied.` lives in the app-server, suggesting it fails **open**. Not measured. If HyperIdle ever drives codex through `app-server` rather than `exec`, this must be re-tested — it inverts the safety property.
3. **`permission_mode` in hook payloads** reported `bypassPermissions` under both `never` and `on-request`. Whether it is simply unreliable, or reflects something else, is unknown. Do not branch on it.
4. **Does a progress notification reset any wall clock?** Not tested; no turn-level wall clock was observed at all.
5. **Concurrency.** Multiple `codex exec` processes against one `CODEX_HOME` were not tested. `thread-writer-locks/.coordination.lock` and sqlite WAL files exist, so some locking is implemented, but contention behaviour is unknown.
6. **`PostToolUse`, `Stop`, `SessionEnd`, `SubagentStart/Stop`, `Interrupt`** hooks were not exercised live. Their schemas are recorded in §5.1 from the binary, but only `PreToolUse` and `PermissionRequest` were proven to fire.
7. **`updatedInput`** on a `PreToolUse` `allow` decision (rewrite a tool call rather than deny it) was not tested. If it works, it is a strictly better gate than deny-and-hope for some cases.
8. **`--approve-for-me`** ("Route approval requests through automatic review using the workspace-write sandbox") was not tested and may be a simpler answer than the `PermissionRequest` hook for the MCP problem.
9. **MCP readiness race.** The prior harness lore mentions codex MCP readiness failures. Not reproduced here; a cold start with a slow MCP server was not attempted.
10. **Version drift.** Everything here is 0.150.1. Latest is 0.152.1. The flag asymmetries in §2.2 in particular look like accidents likely to change.
11. **Hook hash inputs.** The hash covers the `hooks.json` entry. Whether it also covers the *target script's* contents was **not** isolated — I changed only `matcher`. Assume the script is not hashed, but verify before relying on a mutable script.

---

## Raw appendix

Environment for all runs:
```
TMP=/tmp/deepcodex-wxsh
CH=$TMP/codexhome     # isolated CODEX_HOME; only auth.json copied from ~/.codex
W=$TMP/work           # throwaway git repo (git init + one commit)
```

**A1 — identity**
```
$ codex --version
codex-cli 0.150.1
$ ls -la $(dirname $(which codex))/codex
/opt/homebrew/bin/codex -> /opt/homebrew/Caskroom/codex/0.150.1/bin/codex
$ CODEX_HOME=$CH codex login status
Logged in using ChatGPT
```

**A2 — the stdin hang**
```
$ CODEX_HOME=$CH codex exec --json --skip-git-repo-check -m gpt-5.4-mini -s workspace-write \
    -c approval_policy='"never"' "Run the shell command 'echo hello-from-codex' …" > run1.jsonl 2> run1.err
  (timed out after 2m)
$ cat run1.err
Reading additional input from stdin...
$ wc -l < run1.jsonl
0
# with < /dev/null:
EXIT=0 ; 10 lines ; note.txt == "banana"
```

**A3 — no `-a` on exec**
```
$ CODEX_HOME=$CH codex exec … -a never "…"
error: unexpected argument '-a' found
EXIT=2
```

**A4 — untrusted hook silently skipped**
```
$ cat $CH/hooks.json
{ "hooks": { "PreToolUse": [ { "matcher": "*", "hooks": [ { "type": "command", "command": "…/hooklog.sh" } ] } ] } }
$ CODEX_HOME=$CH codex exec --json --skip-git-repo-check -m gpt-5.4-mini -s workspace-write \
    -c approval_policy='"never"' "Run the shell command 'echo probe-A'. Then stop." < /dev/null
EXIT=0
stderr: Reading additional input from stdin...
HOOK CALLS: 0
```

**A5 — with `--dangerously-bypass-hook-trust`: measured tool names**
```
{"session_id":"01a060f1-0478-7e41-9ad4-208c77a7b041","turn_id":"01a060f1-04c0-7dd2-9dd7-e0855c8aed32",
 "transcript_path":"…/rollout-2026-09-02T09-06-43-01a060f1-….jsonl","cwd":"/private/tmp/deepcodex-wxsh/work",
 "hook_event_name":"PreToolUse","model":"gpt-5.4-mini","permission_mode":"bypassPermissions",
 "tool_name":"Bash","tool_input":{"command":"echo probe-A"},"tool_use_id":"call_YJYH8d9rKCG2KDZ5bn8ZjUG5"}
{… "tool_name":"apply_patch","tool_input":{"command":"*** Begin Patch\n*** Add File: probe.txt\n+x\n*** End Patch\n"},…}
```

**A6 — fail-open / fail-closed, one run**
```
hook: case *FAILEXIT*) exit 1 ;; *TIMEOUTX*) sleep 20 ;; *GARBAGE*) echo "not json" ;; *EXIT2X*) echo boom >&2; exit 2 ;;
hooks.json handler: {"type":"command","command":"…/hookfail.sh","timeout":3}
HOOK CALLS: 4  (Bash × 4)
stderr:  ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: boom. Command: echo EXIT2X
stream:  command_execution completed for FAILEXIT, TIMEOUTX, GARBAGE — and NOTHING for EXIT2X
EXIT=0
```

**A7 — timeout timing**
```
hook: sleep 30 ; hooks.json: "timeout": 4
EXIT=0 WALL=11s ; hook invocations: 1 ; command RAN ("timing-probe")
```

**A8 — `continue:false` ignored**
```
hook stdout: {"continue": false, "stopReason": "HYPERIDLE: session halted…", "systemMessage": "gate halted the run"}
stream: command_execution "/bin/zsh -lc 'echo stopprobe'" exit_code 0 status completed
EXIT=0 ; no stopReason or systemMessage anywhere
```

**A9 — invalid `.rules`**
```
$ printf 'allow *\ndeny *\n' > $CH/rules/bad.rules
$ CODEX_HOME=$CH codex exec --json --skip-git-repo-check -m gpt-5.4-mini \
    -s workspace-write -c approval_policy='"never"' "Reply with exactly the word OK…" < /dev/null
EXIT=1
Error loading rules:
/private/tmp/deepcodex-wxsh/codexhome/rules/bad.rules:1: starlark error: error: Parse error: unexpected new line, expected expression (problem is on or around line 1)
(stdout empty)
$ … --ignore-rules …
EXIT=0 ; 4 lines
```

**A10 — forbidden prefix_rule**
```
$ echo 'prefix_rule(pattern=["echo"], decision="forbidden")' > $CH/rules/default.rules
stderr: ERROR codex_core::tools::router: error=exec_command failed for `/bin/zsh -c 'echo hello-rules'`:
        CreateProcess { message: "Rejected(\"… rejected: policy forbids commands starting with `echo`\")" }
stream: zero command_execution items
EXIT=0
```

**A11 — nested-shell escape**
```
rule: prefix_rule(pattern=["git","push"], decision="forbidden", justification="HYPERIDLE-GATE: git push is on hold.")
stderr: … Rejected("`/bin/zsh -lc 'git push origin main'` rejected: HYPERIDLE-GATE: git push is on hold.")
stream: CMD: /bin/zsh -lc "bash -lc 'git push origin main'" | exit 128 | fatal: 'origin' does not appear to be a git repository
```

**A12 — resume failure modes**
```
$ CODEX_HOME=$CH codex exec resume 00000000-0000-0000-0000-000000000000 --json … "hi" < /dev/null
EXIT=1
Error: thread/resume: thread/resume failed: no rollout found for thread id 00000000-… (code -32600)

$ CODEX_HOME=$CH codex exec resume not-a-uuid --json … "hi" < /dev/null
EXIT=0
{"type":"thread.started","thread_id":"01a060f3-9304-7060-83d0-ac8d7ea5e575"}   ← BRAND NEW

$ CODEX_HOME=$FRESH codex exec resume --last --json … "hello" < /dev/null
EXIT=0
{"type":"thread.started","thread_id":"01a060fa-c4dc-7ed2-82ab-705444bbba42"}   ← BRAND NEW
```

**A13 — hooks/list trust probe**
```
$ { printf '%s\n' \
   '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"p","title":"p","version":"0.0.1"}}}' \
   '{"jsonrpc":"2.0","method":"initialized","params":{}}' \
   '{"jsonrpc":"2.0","id":2,"method":"hooks/list","params":{"cwd":"'"$W"'"}}'; sleep 6; } \
  | CODEX_HOME=$CH codex app-server 2>/dev/null
{"id":2,"result":{"data":[{"cwd":"/private/tmp/deepcodex-wxsh/work","hooks":[
 {"key":"/private/tmp/…/codexhome/hooks.json:pre_tool_use:0:0","eventName":"preToolUse",
  "handlerType":"command","command":"…/hooklog.sh","async":false,"matcher":"^Bash$",
  "timeoutSec":600,"statusMessage":null,"additionalContextLimit":null,
  "sourcePath":"…/codexhome/hooks.json","source":"user","pluginId":null,"displayOrder":0,
  "enabled":true,"isManaged":false,
  "currentHash":"sha256:5d5fe6ad91dbcade592a62108e0ec13ee69fcdcd6e4e27d0f32c89f04a89b4c3",
  "trustStatus":"untrusted"},
 {"key":"/private/tmp/deepcodex-wxsh/work/.codex/hooks.json:pre_tool_use:0:0", … "source":"project", …}],
 "warnings":[],"errors":[]}]}}
```

**A14 — persisted trust, then the editing trap**
```
config.toml:
  [hooks.state."/private/tmp/…/codexhome/hooks.json:pre_tool_use:0:0"]
  trusted_hash = "sha256:5d5fe6ad91dbcade592a62108e0ec13ee69fcdcd6e4e27d0f32c89f04a89b4c3"
run WITHOUT --dangerously-bypass-hook-trust:  hook calls: 1 ; warnings in stream: 0 ; EXIT=0

then change matcher "^Bash$" → "*" in hooks.json, leave trusted_hash stale:
  hook calls: 0 ; stderr: (empty) ; stream mentions of "hook": 0 ; RAN: staleprobe ; EXIT=0
```

**A15 — MCP under `never` vs `on-request`**
```
approval_policy="never":
{"type":"item.completed","item":{"type":"mcp_tool_call","server":"humangate","tool":"ask_human",
 "result":null,"error":{"message":"MCP tool call requires approval, but approval policy is never"},"status":"failed"}}

approval_policy="on-request" + PermissionRequest hook returning {"decision":{"behavior":"allow"}}:
PermissionRequest payload tool_name: mcp__humangate__ask_human   (× 2)
{"type":"item.completed","item":{"type":"mcp_tool_call",…,"result":{"content":[{"type":"text",
 "text":"The human says: yes, you may proceed, but write it to human-ok.txt instead."}]},"status":"completed"}}
→ human-ok.txt created
```

**A16 — broken MCP server**
```
[mcp_servers.broken]
command = "/nonexistent/binary-xyz"
EXIT=0 ; stderr: (empty) ; stream: thread.started / turn.started / agent_message "OK" / turn.completed
(no error, no warning, anywhere)
```

**A17 — `--ignore-user-config` A/B**
```
project hook calls WITHOUT --ignore-user-config: 1
project hook calls WITH    --ignore-user-config: 0
$ ls -la $W/.codex/hooks.json   → still present
```

**A18 — model matrix (ChatGPT-account login)**
```
gpt-5.4-mini      EXIT=0  OUT: OK
gpt-5.4-nano      EXIT=1  {"status":400,"error":{"message":"The 'gpt-5.4-nano' model is not supported when using Codex with a ChatGPT account."}}
gpt-5-codex-mini  EXIT=1  same shape
gpt-5.6-sol       EXIT=0  OUT: OK
o3                EXIT=1  same shape
bogus-model-xyz   EXIT=1  same shape
```

**A19 — end-to-end gate → resume → retry**
```
phase 1: EXIT=0 ; THREAD_ID=01a060f4-25cd-79c2-b2a4-a50fc0cc448e ; gate-target.txt absent
         model: "Waiting for approval to run the shell command that writes `gate-target.txt`."
phase 2: codex exec resume 01a060f4-… --json --skip-git-repo-check --dangerously-bypass-hook-trust \
           -m gpt-5.4-mini -c sandbox_mode='"workspace-write"' -c approval_policy='"never"' \
           "The human has approved your request. Proceed now with exactly what you were waiting on." < /dev/null
         {"type":"thread.started","thread_id":"01a060f4-25cd-79c2-b2a4-a50fc0cc448e"}   ← SAME
         command_execution "/bin/zsh -c 'echo APPROVED > gate-target.txt'" exit_code 0
         cat gate-target.txt → APPROVED
```

**A20 — schema extraction (reproducible, no model call)**
```
$ strings -n 4 /opt/homebrew/Caskroom/codex/0.150.1/bin/codex > codex-strings.txt   # 124,369 lines
# 23 embedded hook schemas recovered by brace-matching around each "$schema" marker:
  pre-tool-use.{input,output}  permission-request.{input,output}  post-tool-use.{input,output}
  pre-compact.{input,output}   post-compact.{input,output}        session-start.{input,output}
  session-end.input            stop.{input,output}                user-prompt-submit.{input,output}
  subagent-start.{input,output} subagent-stop.{input,output}      interrupt.{input,output}
$ CODEX_HOME=$CH codex app-server generate-json-schema --out ./as   # 295 files
```

**Cleanup.** All experiment artefacts live under `/tmp/deepcodex-wxsh` (isolated `CODEX_HOME`, throwaway git repos, hook scripts, MCP server). The real `~/.codex` was never written to; only `auth.json` was read out of it. No credential value appears in this document.
