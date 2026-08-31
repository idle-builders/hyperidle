# Interception in codex — real-binary research

**Binary:** `codex-cli 0.150.1` (`/opt/homebrew/bin/codex` → `/opt/homebrew/Caskroom/codex/0.150.1/bin/codex`, Mach-O arm64, compiled Rust — not a JS bundle).
**Node:** v24.18.0 (`/opt/homebrew/opt/node@24/bin` first on PATH).
**Date:** 2026-08-31.
**Method:** `strings` on the compiled binary to recover its own vocabulary and its *embedded JSON schemas*, then every claim re-proved by running the binary against a throwaway `CODEX_HOME` and a throwaway git repo. `/Users/tg/.codex` was never written to — only `auth.json` was copied out of it.
**No published documentation was consulted.** Everything below is either a string/schema extracted from the shipped binary or a live run. Where the two disagree with prior repo notes, the binary wins and it is called out.

---

## Verdict up front

**Yes — codex can be gated per-session, and there are TWO independent mechanisms. Both are plain files inside `CODEX_HOME`, both are re-read on `codex exec resume`, and neither touches the user's real `~/.codex`.**

| | **execpolicy `.rules`** | **`hooks.json` PreToolUse** |
|---|---|---|
| File | `$CODEX_HOME/rules/*.rules` | `$CODEX_HOME/hooks.json` (+ a trust entry in `config.toml`) |
| Matches | **command argv prefix** (real command text) | tool name via `matcher`; **command text inside the hook script** |
| Covers | shell exec only | shell exec **and** `apply_patch` (file writes), and MCP tools |
| Reason reaches model | **yes**, verbatim `justification` | **yes**, verbatim `permissionDecisionReason` |
| Extra process per call | none | yes (spawns the hook script) |
| Needs `--dangerously-bypass-hook-trust` | **no** | yes, unless you write `trusted_hash` |
| On malformed config | **fails CLOSED** (codex exits 1) | **fails OPEN, silently** |
| On script error / timeout | n/a | **fails OPEN** |
| Misses | `bash -lc 'git push …'` (nested shell) | nothing observed |

**Recommendation: use both.** `.rules` is the fail-closed spine; the PreToolUse hook is the text-matching net that also covers file writes. Each covers the other's hole.

---

## Q1 — What hook events does this version support?

Enumerated from the binary's own `HookEventName` enum and its embedded per-event JSON schemas.

```
strings -a /opt/homebrew/bin/codex > codex-strings.txt
grep -an '"title": "' codex-strings.txt | grep command
```

```
476529:  "title": "post-tool-use.command.input",
476600:  "title": "post-tool-use.command.output",
476666:  "title": "permission-request.command.input",
476756:  "title": "permission-request.command.output",
476813:  "title": "post-compact.command.input",
476906:  "title": "pre-tool-use.command.input",
476998:  "title": "pre-tool-use.command.output",
477055:  "title": "pre-compact.command.input",
477137:  "title": "session-start.command.input",
477226:  "title": "session-end.command.input",
477288:  "title": "subagent-start.command.input",
477412:  "title": "subagent-stop.command.input",
477520:  "title": "user-prompt-submit.command.input",
477650:  "title": "stop.command.input",
477748:  "title": "interrupt.command.input",
```

Full event list (`HookEventNameWire`, both spellings present in the binary):

```
PreToolUse  PermissionRequest  PostToolUse  PreCompact  PostCompact
SessionStart  SessionEnd  UserPromptSubmit  SubagentStart  SubagentStop
Stop  Interrupt
```
```
pre_tool_use permission_request post_tool_use pre_compact post_compact
session_start session_end user_prompt_submit subagent_start subagent_stop
```

**Conclusion.** A pre-execution event exists and it is genuinely called **`PreToolUse`**. The coordinator's warning that `PreToolUse` is "Claude Code's name and probably wrong for codex" does **not** hold for codex 0.150.1 — codex 0.150.1 has deliberately adopted the Claude-Code-compatible hook wire format (it even reads `CLAUDE_PLUGIN_ROOT` / `CLAUDE_PLUGIN_DATA` placeholders). The existing HyperIdle provisioning shape is correct **for codex** (it is proven wrong for cursor; that is a separate matter).

Config file shape (`HookHandlerConfig` = `Command | McpTool`; a `MatcherGroup` has `matcher` + `hooks`):

```json
{"hooks":{"PreToolUse":[{"matcher":"^Bash$","hooks":[
  {"type":"command","command":"/abs/path/hook.sh","timeout":600,"async":false,
   "statusMessage":null,"additionalContextLimit":null}]}]}}
```

Location is confirmed by codex itself (`hooks/list` over the app-server, below): `sourcePath` = `$CODEX_HOME/hooks.json`, `source: "user"`. TOML hooks files are also accepted (`failed to parse TOML hooks in …`), and there is a `hooks.managed_dir` / `allow_managed_hooks_only` admin path we do not need.

---

## Q2 — What output blocks the call?

The binary's embedded `pre-tool-use.command.output` schema:

```json
{
  "definitions": {
    "PreToolUseDecisionWire": {"enum": ["approve","block"]},
    "PreToolUsePermissionDecisionWire": {"enum": ["allow","deny","ask"]},
    "PreToolUseHookSpecificOutputWire": {
      "properties": {
        "additionalContext": {"type":"string"},
        "hookEventName": {"const":"PreToolUse"},
        "permissionDecision": {"$ref":"#/definitions/PreToolUsePermissionDecisionWire"},
        "permissionDecisionReason": {"type":"string"},
        "updatedInput": {}
      },
      "required": ["hookEventName"]
    }
  },
  "properties": {
    "continue": {"type":"boolean","default":true},
    "decision": {"$ref":"#/definitions/PreToolUseDecisionWire"},
    "hookSpecificOutput": {"$ref":"#/definitions/PreToolUseHookSpecificOutputWire"},
    "reason": {"type":"string"},
    "stopReason": {"type":"string"},
    "suppressOutput": {"type":"boolean","default":false},
    "systemMessage": {"type":"string"}
  }
}
```

Input the hook receives on stdin (proved live):

```json
{"session_id":"01a05911-b26e-77f2-bbde-6336918b2603",
 "turn_id":"01a05911-b2b4-7dc1-a36d-b3b15f547a80",
 "transcript_path":".../ch/sessions/2026/08/31/rollout-….jsonl",
 "cwd":".../ws","hook_event_name":"PreToolUse","model":"gpt-5.6-sol",
 "permission_mode":"bypassPermissions","tool_name":"Bash",
 "tool_input":{"command":"ls"},
 "tool_use_id":"exec-6310b019-ab1b-4e28-8266-ff5447fc6492"}
```

### Two blocking forms, both proven

**(a) JSON on stdout, exit 0 — the one to use.**

Hook body:
```bash
echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"HYPERIDLE-RULE-7: pushing to a remote needs founder approval. Ask, do not retry."}}'
```
Run:
```
CODEX_HOME=$R/ch codex exec --dangerously-bypass-hook-trust --skip-git-repo-check \
  -s workspace-write -C $R/ws "Run this shell command: git push origin main . …"
```
Output:
```
hook: PreToolUse
ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: HYPERIDLE-RULE-7: pushing to a remote needs founder approval. Ask, do not retry.. Command: git push origin main .
hook: PreToolUse Blocked
```

**(b) Exit code 2 + stderr.** Hook `echo "EXIT2-DENY: ls is forbidden by rule 9" >&2; exit 2`:
```
hook: PreToolUse
ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: EXIT2-DENY: ls is forbidden by rule 9. Command: ls
hook: PreToolUse Blocked
```

`{"decision":"block","reason":"…"}` is also accepted by the schema; the binary carries the guard string `hook returned decision:block without a non-empty reason`, so `reason` is mandatory in that form.

**Refuting the prior repo note.** The claim "codex fires the hook but produces empty completions; the deny-response format is unknown" is wrong for 0.150.1. The format is the one above, and the model completes normally after a block.

---

## Q3 — What does the model see, and can we influence it?

Yes — the reason string is passed through **verbatim** and the model quotes it back. Same run as (a), the model's own final answer:

```
The command was not run. It was blocked with this exact refusal:

> Command blocked by PreToolUse hook: HYPERIDLE-RULE-7: pushing to a remote
> needs founder approval. Ask, do not retry.. Command: git push origin main .
```

The envelope codex adds is fixed: `Command blocked by PreToolUse hook: <your reason>. Command: <the command>` (for non-shell tools: `Tool call blocked by PreToolUse hook: <reason>. Tool: <name>`). Everything between is ours.

The instruction inside the reason is obeyed. With `"HYPERIDLE-GATE: \`git push\` is on this session's hold list. Ask the human to clear it; do not retry."` the model answered:

```
The command was blocked by the session's HYPERIDLE-GATE hold list.
Please clear the `git push` hold, then ask me to retry.
```

It did not retry, did not try a workaround, and ended the turn asking the human. That is exactly the BA2 shape (agent asks, human clears).

---

## Q4 — Command text, or only tool name? **SETTLED: both, at different layers.**

**The `matcher` field matches the TOOL NAME only, as a regex.** Proved by a negative and a positive.

Negative — `matcher: "^ls$"` against the command `ls`:
```
hooks.json: {"hooks":{"PreToolUse":[{"matcher":"^ls$","hooks":[…]}]}}
prompt: "run exactly: ls"
→ no "hook: PreToolUse" line at all; hook log file never created; command ran.
```
Positive — `matcher: "^Bash$"` against the same command:
```
hook: PreToolUse
hook: PreToolUse Failed
```

**But the hook body receives the full command text** in `tool_input.command`, so a rule *can* match command text — you just do the matching in the script, not in `matcher`. Proven end to end: a hook that substring-matches `git push` against `tool_input.command` blocked `git push origin main` while `git status --short` and `echo done` ran untouched.

**And the `.rules` execpolicy matches command text natively** (Q5).

So: the claim "codex can only match on tool names" is **refuted**. It is true of one field (`matcher`) and false of the mechanism. If it drove a design decision, that decision should be revisited.

Tool names observed: `Bash` (shell) and `apply_patch` (file writes). PreToolUse fires for both:
```
apply_patch | {"command":"*** Begin Patch\n*** Add File: b.txt\n+banana\n*** End Patch"}
Bash        | {"command":"sed -n '1p' b.txt"}
```
So the hook can gate file edits as well as commands.

---

## Q5 — A permissions/deny config independent of hooks? **Yes — execpolicy `.rules`.**

`codex exec --help` carries `--ignore-rules  Do not load user or project execpolicy '.rules' files`. The user store is `$CODEX_HOME/rules/*.rules` (the real `~/.codex/rules/default.rules` is where codex persists "always allow" approvals). Syntax is Starlark; the binary's TOML mirror is `ExecPolicyDecisionToml` with `enum: allow | prompt | forbidden`, plus `pattern`, `justification`, `token`, `any_of`.

`$CODEX_HOME/rules/default.rules`:
```python
prefix_rule(pattern=["git", "push"], decision="forbidden", justification="HYPERIDLE-GATE: git push is on this session's hold list.")
```
```
codex exec --skip-git-repo-check -s workspace-write -C $R/ws "run exactly: git push origin main"
```
```
ERROR codex_core::tools::router: error=exec_command failed for `/bin/zsh -lc 'git push origin main'`:
CreateProcess { message: "Rejected(\"`/bin/zsh -lc 'git push origin main'` rejected: HYPERIDLE-GATE: git push is on this session's hold list.\")" }

model: `git push origin main` was blocked by the session's `HYPERIDLE-GATE` hold policy.
       The command did not run and nothing was pushed.
```

**No hooks. No trust. No subprocess. No dangerous flag. The justification reaches the model verbatim.**

Deny-one-allow-the-rest, one session, three commands:
```
1) `git status --short` succeeded (exit 0)
2) `git push origin main` was not executed: the session's safety gate rejected `git push` …
3) `echo done` — exit 0
```

It parses compound shells — `cd . && git push origin main` was rejected. It does **not** see through a nested shell — `bash -lc 'git push origin main'` **ran**. The PreToolUse hook does catch that form (it substring-matches the raw command string), which is the main reason to run both.

Precedence: with `forbidden` in `$CODEX_HOME/rules` and `allow` in the workspace's `.codex/rules`, the **forbid won**. An agent cannot write itself an allow-rule out of the gate.

`decision="prompt"` is not useful headless: under `-a never` it denies, but the justification is dropped and the model gets the generic `approval required by policy, but AskForApproval is set to Never`. Use `forbidden`.

Other config surfaces enumerated from the binary but not needed here: `sandbox_mode` / `-s`, `approval_policy` / `-a`, permission profiles (`allowed_permission_profiles`, `default_permissions`, `network`/`file_system`), `allowed_sandbox_modes`, `guardian_policy_config`. All are coarse posture, not per-action deny lists.

---

## Q6 — Does `codex exec resume` re-read the deny set? **Yes, both mechanisms.**

`.rules` — same session, rule cleared between runs:
```
run 1: "run exactly: git push origin main"  → Rejected("… HYPERIDLE-GATE: on hold")
: > $CODEX_HOME/rules/default.rules
run 2: codex exec resume <SID> "The hold has been cleared. Retry the exact same command now."
     → hook/policy silent; git actually ran: "error: src refspec main does not match any"
```

Hook + sidecar deny list — same pattern:
```
run 1 (denyset.txt contains "git push") → hook: PreToolUse Blocked
: > denyset.txt
run 2: codex exec resume <SID> …        → hook: PreToolUse Completed; command ran
```

Resume also inherits the original sandbox mode (`sandbox: workspace-write` with no `-s` passed). Note `codex exec resume` does **not** accept `-C`; run it with the workspace as cwd.

---

## Q7 — What makes this silently not work

1. **Hook trust — the big one.** A hook whose hash is not recorded as trusted is **silently skipped, with no warning at all**, and the command runs. Baseline run with a correct `hooks.json` and no trust: no `hook:` line, `ls` ran. Trust identity and hash come from codex itself:

   ```
   printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"probe","title":"probe","version":"0.0.1"}}}' \
                 '{"jsonrpc":"2.0","method":"initialized","params":{}}' \
                 '{"jsonrpc":"2.0","id":2,"method":"hooks/list","params":{}}' | codex app-server
   ```
   ```json
   {"key":"…/ch/hooks.json:pre_tool_use:0:0","eventName":"preToolUse","handlerType":"command",
    "command":"…/hook.sh","async":false,"matcher":"^Bash$","timeoutSec":600,
    "sourcePath":"…/ch/hooks.json","source":"user","enabled":true,"isManaged":false,
    "currentHash":"sha256:093ec797572ff0e6687041787f489e0777a72005b1bcde727d356247f665ca0f",
    "trustStatus":"untrusted"}
   ```
   Writing that pair into the session's own `config.toml`:
   ```toml
   [hooks.state."/…/ch/hooks.json:pre_tool_use:0:0"]
   trusted_hash = "sha256:093ec797572ff0e6687041787f489e0777a72005b1bcde727d356247f665ca0f"
   ```
   makes it fire **without** `--dangerously-bypass-hook-trust` — re-checked via `hooks/list` → `"trustStatus":"trusted"`, then a live block. The hash covers the hook entry, so **the deny set must NOT live in `hooks.json`.** Editing `hooks.json` between runs invalidates the hash; proved: changing `matcher` from `^Bash$` to `*` left `trusted_hash` stale and `git push` ran with **zero** hook output. Keep `hooks.json` byte-stable and put the mutable deny set in a sidecar file the script reads.

2. **`--dangerously-bypass-hook-trust`** — it *only* waives the persisted hook-trust check for that invocation. It does not weaken sandbox or approvals. It works (HyperIdle relies on it today) but it prints two `warning:` lines into the output stream. Writing `trusted_hash` is the cleaner equivalent and lets the flag be dropped.

3. **Hooks fail OPEN in every failure mode.** All three observed live, each ending `hook: PreToolUse Failed` followed by the command succeeding:
   - script exits 1 → command ran
   - script prints malformed JSON → command ran
   - script hangs past its `timeout` → command ran
   A hook is therefore an availability-shaped guard, not a hard gate. **`.rules` is the opposite:** a syntactically broken rules file aborts codex entirely, exit 1:
   ```
   Error loading rules:
   …/ch/rules/default.rules:1: starlark error: error: Parse error: unexpected identifier 'decision', expected symbol ')'
   EXIT=1
   ```
   Fail-closed. This is the argument for making `.rules` the primary mechanism.

4. **`--ignore-rules`** disables the `.rules` layer, and **`--ignore-user-config`** skips `$CODEX_HOME/config.toml` (auth still uses `CODEX_HOME`) which would drop the `hooks.state` trust entries. Neither should ever be in HyperIdle's argv.

5. **Nested shell escapes `.rules`** — `bash -lc 'git push …'` was not matched by `prefix_rule(pattern=["git","push"])`. The hook caught it. Do not rely on `.rules` alone for a rule that matters.

6. **`hooks` is a feature flag** (`codex doctor --json` → enabled feature flags includes `hooks`). It is on by default in 0.150.1; a config that disables it would silently kill the hook layer. `.rules` is not feature-flagged.

7. **Copying `~/.codex` wholesale still breaks things** — the SQLite files (`logs_2.sqlite` is 700 MB) lock. Copy `auth.json` + a minimal `config.toml` only. That prior repo note holds; auth worked throughout on a copied `auth.json`.

8. **A project-local `.codex/hooks.json` is not as ignored as the repo note says** — the real user config contains `[hooks.state."/Users/tg/hyperidle/.codex/hooks.json:pre_tool_use:0:0"]`, so codex has discovered and hashed a project-local hooks file at some point. Irrelevant for us (we own `CODEX_HOME`), but the note's absolute claim is not safe to lean on.

---

## Concretely, for HyperIdle

Per session, in `<sandbox>/.codex-home/`:

```
auth.json                 # copied from ~/.codex (NOT symlinked, no SQLite)
config.toml               # minimal + [hooks.state."<abs>/hooks.json:pre_tool_use:0:0"] trusted_hash = "<currentHash>"
hooks.json                # byte-stable for the life of the session
rules/default.rules       # rewritten between runs — the mutable hold list
denyset.txt               # sidecar the hook script reads — also rewritten between runs
```

- Write one `prefix_rule(pattern=[…], decision="forbidden", justification="…")` per held action into `rules/default.rules`.
- Mirror the same holds as substrings in `denyset.txt`; the PreToolUse hook script matches them against `tool_input.command` and emits `permissionDecision: "deny"` with the same message. This closes the nested-shell hole and extends the gate to `apply_patch`.
- Obtain `currentHash` once at provisioning via the app-server `hooks/list` call above; write it to `config.toml`; then `--dangerously-bypass-hook-trust` can be dropped.
- To clear a hold after approval: rewrite both files, `codex exec resume <session-id> "<message>"` from the workspace cwd. Both files are re-read; the sandbox mode is inherited.

Reason strings should name the rule and tell the model to stop — the model obeys that instruction and hands the turn back to the human.

---

## Artifacts

Scratch (throwaway, not committed): `/private/tmp/claude-501/…/scratchpad/` — `ch/` (temp `CODEX_HOME`), `ws/` (temp git repo), `hook.sh`, `denyset.txt`, `codex-strings.txt`.
