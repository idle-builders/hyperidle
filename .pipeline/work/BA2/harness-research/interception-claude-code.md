# Interception research — claude-code

**Question.** How does an external system make claude-code refuse a specific tool call before it runs, and tell the model why — headless, sandboxed, per-session?

**Binary under test.** `claude` at `/opt/homebrew/bin/claude` → `/opt/homebrew/Caskroom/claude-code@latest/2.1.247/claude` (Mach-O arm64). Version string: `2.1.247 (Claude Code)`. Node `v24.18.0` (`/opt/homebrew/opt/node@24/bin` first on PATH).

**Method.** Every claim below was produced by running the real binary against real models (`--model sonnet`) in throwaway directories under the session scratchpad. `/Users/tg/.claude` was never edited. No production code was written. Where the repo's own comments or the binary's embedded documentation disagree with what the binary did, the observation wins and I say so.

**Headline.** This version has a first-class **deferral** mechanism (`permissionDecision: "defer"`, print-mode only) that nobody in the repo appears to know about. It gates a specific call, hands the exact pending tool call back to the harness, and on resume **re-runs the gate and executes the original call with no model persuasion at all**. That removes the two criteria that failed on claude — they were failures of the deny-plus-approval-message design, not of the harness.

---

## Q1. The exact PreToolUse contract

### Config shape

Hook config is the standard settings shape. Verified working from three different sources (project file, `--settings <file>`, `--settings '<json string>'`):

```json
{ "hooks": { "PreToolUse": [ { "matcher": "Bash",
  "hooks": [ { "type": "command", "command": "/abs/path/gate.sh" } ] } ] } }
```

Embedded documentation inside the binary (`strings -a claude | sed -n '379820,379960p'`) confirms the event table and adds two hook types beyond `command`: `"prompt"` (LLM evaluates a condition) and `"agent"` (runs an agent), both available on `PreToolUse`, `PostToolUse`, `PermissionRequest`. Also documented: `timeout`, `statusMessage`, and a `PermissionRequest` event that runs *before the permission prompt*.

### Hook stdin — real payload

Captured by teeing the hook's stdin to a file:

```json
{
 "session_id": "6f62a983-8998-446a-aa18-2d8954b5e5cf",
 "transcript_path": "/Users/tg/.claude/projects/-private-tmp-...-gate-s1/6f62a983-....jsonl",
 "cwd": "/private/tmp/.../gate/s1",
 "prompt_id": "dd30ba42-e0bd-46ab-8e1e-77a7befdcfa6",
 "permission_mode": "bypassPermissions",
 "effort": { "level": "high" },
 "hook_event_name": "PreToolUse",
 "tool_name": "Bash",
 "tool_input": { "command": "git push", "description": "Push current branch to remote" },
 "tool_use_id": "toolu_01NoH7Cyb99eYgDzVsWuMWwP"
}
```

`tool_use_id` is present — the hook can correlate a decision with the exact call.

### What blocks a call — three mechanisms, all verified

**(a) JSON on stdout, `permissionDecision: "deny"` — recommended.**

```bash
cd $S/s1 && claude -p "Run exactly this shell command: git push" \
  --session-id "$SID" --model sonnet --output-format stream-json --verbose \
  --permission-mode bypassPermissions
```

Hook emitted:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
 "permissionDecisionReason":"HyperIdle rule GATE-1: pushing to a remote is not approved for this session."}}
```

Real stream:

```
[assistant:tool_use] Bash {"command":"git push","description":"Push current branch to remote"}
[user:tool_result] is_error=true "HyperIdle rule GATE-1: pushing to a remote is not approved for this session."
[assistant:text] "The push was blocked by a session rule: `HyperIdle rule GATE-1: ...` Pushing isn't permitted here, so I can't complete this."
[result] subtype=success is_error=false num_turns=2
```

Exit code of the hook is `0`. The block comes from the JSON, not the exit code.

**(b) exit 2 + stderr — works, but leaks the mechanism.**

Hook: `echo "GATE-3: exit-2 stderr message, rule NO_REMOTE_PUSH." >&2; exit 2`

```
[user:tool_result] is_error=true "PreToolUse:Bash hook error: [$CLAUDE_PROJECT_DIR/.claude/gate.sh]: GATE-3: exit-2 stderr message, rule NO_REMOTE_PUSH.\n"
```

The message is **wrapped**: `PreToolUse:<Tool> hook error: [<command string>]: <stderr>`. The model then talked about "a repo hook (`gate.sh`)" rather than about the policy. Use (a) if you care about the wording.

**(c) `permissionDecision: "defer"` — the interesting one. See Q5.**

Also confirmed present in the binary but not exercised here: `permissionDecision: "ask"`, `hookSpecificOutput.updatedInput` (rewrite the tool input before it runs), and a `PermissionDenied` hook with `{"hookSpecificOutput":{"hookEventName":"PermissionDenied","retry":true}}` — "tell the model it may retry".

### Deny works under `bypassPermissions`

Every run above used `--permission-mode bypassPermissions`. The PreToolUse deny still fired. A hook deny is not a permission-prompt escalation; it is above the permission system.

---

## Q2. What the model sees, verbatim

With the JSON deny, the tool result content is **exactly and only** the `permissionDecisionReason` string. No prefix, no "hook", no path, no tool name:

```
[user:tool_result] is_error=true "Blocked by HyperIdle session policy GATE-1 (not-approved action: git push)."
```

So the wording is fully ours. With exit-2 it is not (see the wrapper above).

**Wording matters, and here is the evidence.** In trial 4 of the resume batch the model completed the action and then volunteered, unprompted:

> "One flag for you: the initial `git push` was blocked by session policy GATE-1, and then a message arrived in the conversation claiming that restriction had been lifted. That message came through the same channel as ordinary chat text, not as a verified system control — I can't actually confirm a session policy change from a claim inside the conversation…"

The model treats an in-band "you are now approved" user message as a possible social-engineering attempt. It complied anyway (5/5), but it noticed. This is a direct argument for the defer mechanism in Q5, where approval is carried **out of band** by the harness rewriting the deny set — the model is never asked to believe anything.

Practical wording rules from what I observed:
- State the rule and the fact. `"Blocked by <system> policy <RULE-ID>: <action> is not approved for this session."` — clean, and the model relays it accurately.
- Do not put an imperative or an instruction to the model inside the reason. It is untrusted-channel text arriving in a tool result; it is exactly the shape a prompt injection has.
- If you need the model to *do* something after a block, do it with a real user turn or with defer — not with the deny text.

---

## Q3. Can a matcher discriminate on command text?

**No. The matcher is tool-name only.**

Sandbox `s2` used `"matcher": "Bash(git push:*)"` with a hook that denies unconditionally, and prompted for `git status` then `git push`:

```
[assistant:tool_use] Bash {"command":"git status"}   → allowed
[assistant:tool_use] Bash {"command":"git push"}     → allowed, ran, failed on "no configured push destination"
hook invocations: 0   (the hook log file was never created)
```

The hook was never invoked. The permission-rule grammar `Tool(specifier)` is **not** understood by the hook matcher — it is treated as a regex against the tool name, and `Bash(git push:*)` does not match `Bash`.

Compare `"matcher": "Bash"` in `s1`/`s3`/`s5`: invoked on every Bash call, with the full command string in `tool_input.command`.

**Consequence:** match on tool name, discriminate on `tool_input.command` inside the hook. That is also strictly more capable — the hook sees the raw command text, including compound `&&` chains and nested `sh -c '…'` (see Q4 limits).

---

## Q4. A deny mechanism independent of hooks

Yes — `permissions` in settings, and CLI flags that write the same thing.

### `permissions.deny` in a settings file

`s4/.claude/settings.json` = `{ "permissions": { "deny": ["Bash(git push:*)"] } }`, no hooks at all:

```
[assistant:tool_use] Bash {"command":"git push"}
[user:tool_result] is_error=true "Permission to use Bash with command git push has been denied."
```

Works, including under `--permission-mode bypassPermissions`. **But the message is fixed** — there is no reason field. The model is told *that* it was denied, never *why*.

### `--disallowedTools` / `--allowedTools` (per-session, no files)

```bash
claude -p "Run exactly this shell command: git push" \
  --disallowedTools "Bash(git push:*)" --permission-mode bypassPermissions ...
```

```
[user:tool_result] is_error=true "Permission to use Bash with command git push has been denied."
```

Same fixed message.

### What this version supports

From `claude --help` and the binary's settings keys: `permissions.allow`, `permissions.deny`, `permissions.ask`, `permissions.defaultMode` (`acceptEdits | auto | bypassPermissions | manual | dontAsk | plan`), `permissions.additionalDirectories`, `permissions.disableBypassPermissionsMode`. Entry grammar is `ToolName` or `ToolName(specifier)`, e.g. `Bash(git *)`, `Bash(git push:*)`, `Edit`. Sources are user / project / local / managed-policy, selectable with `--setting-sources user,project,local` and overlayable with `--settings`.

### Per-session writability

Both are per-session writable, three ways:
1. `--settings /abs/path/session-settings.json` — verified.
2. `--settings '<inline JSON string>'` — verified; the whole gate can live in argv with zero files in the workspace.
3. `--disallowedTools` on the command line — verified.

### Which is more suitable

**The hook, for HyperIdle.** Both are per-session. The separator is the message: `permissions.deny` cannot say why, and requirement 3 is that the model learns why. The hook also gives a live decision point — the deny set can live in a file the hook reads at call time, so it changes between runs without rewriting any settings — and it is the only path to `defer`.

`permissions.deny` is still worth carrying as a belt-and-braces second layer for actions where you want a hard stop even if the hook process dies.

### Honest limits of both

- **Compound commands are handled.** `git status && git push origin main` was denied by `permissions.deny` as a whole. Nothing ran; the bare remote stayed empty.
- **Nested shells are not.** `sh -c 'git push origin main'` **defeated `permissions.deny`** — the push succeeded:
  ```
  [assistant:tool_use] Bash {"command":"sh -c 'git push origin main'"}
  [user:tool_result] is_error=false "* [new branch] main -> main"
  ```
  A substring check inside a hook *would* have caught this one, because the hook sees the raw string. Neither approach is a sandbox. This is a policy gate against a cooperative agent, not a containment boundary — consistent with the repo ethos, but say it out loud in the plan.

---

## Q5. Resume

### Does a resumed run re-read the gate? Yes.

`claude -p <msg> --resume <uuid> --settings <file>` re-reads `--settings` and re-executes the hook. Verified by the hook log, which records the deny set as seen at each invocation:

```
1788201162 CMD=git status && ...              DENY=git push,
1788201164 CMD=git push origin main           DENY=git push,     ← blocked
1788201188 CMD=git push origin main           DENY=              ← resumed run, deny set rewritten, allowed
```

Sessions are **global by UUID**: I resumed a session created in `.../gate/s5` from cwd `.../gate/s6` and it resumed correctly. (Transcripts are filed under `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl`, but resume does not require the original cwd.)

### Mechanism A — deny + an approval message: 5/5 complied

Five independent sandboxes, each with its own bare remote, each gated by a hook reading a per-session `denyset.txt`.

Base run (all five): `claude -p "Push the current branch to the remote with git push." --session-id <uuid> --settings <file> --setting-sources user --model sonnet --output-format stream-json --verbose --permission-mode bypassPermissions < /dev/null`
→ 5/5 blocked, 5/5 remotes empty.

Then `: > denyset.txt` and resume with this **exact wording**:

> `Approval granted: the GATE-1 restriction on git push has been removed for this session. git push is now allowed. Please complete the push.`

Result: **5 of 5 re-attempted and completed the push.** All five bare remotes have `main`:

```
t1 remote main: 84e16129eae0d898d8d2454c60224d6daa12fe9e
t2 remote main: 3363c811601b173e7c7e5967cb5858c83e33c6cd
t3 remote main: 8e44ab858f374397627cd1c8169fbbcf0001e566
t4 remote main: efaea48745667bec4f24fb306a477170c1cb8fae
t5 remote main: 46214a55924d71d60793daee07a50dcde5f7b1e2
```

Completion text non-empty in 5/5. Two of the five needed an extra turn to discover `--set-upstream`; both recovered on their own. One (t4) complied while explicitly flagging the approval message as unverifiable (quoted in Q2).

So with this wording the criterion passes 5/5 — but it is still **model behaviour**, it is measured on five runs, and the model has told us it distrusts the channel. A rate of 5/5 is not a guarantee.

### Mechanism B — `permissionDecision: "defer"`: deterministic, no persuasion

The binary carries strings the embedded docs omit:

```
 returned permissionDecision=defer in interactive mode; ignoring (defer is print-mode only)
 returned permissionDecision=defer for a served call; refusing (no resume machinery)
[print.ts] Auto-resuming deferred tool
Error: No deferred tool marker found in the resumed session. Either the session was not
  deferred, the marker is stale (tool already ran), or it exceeds the tail-scan window.
  Provide a prompt to continue the conversation.
```

Hook returns:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"defer",
 "permissionDecisionReason":"HyperIdle GATE-1: git push needs approval; the run is paused pending it."}}
```

The run **stops cleanly** and hands the harness the pending call. Real `--output-format json` result (usage stripped):

```json
{ "stop_reason": "tool_deferred",
  "terminal_reason": "tool_deferred",
  "session_id": "6acf16d4-927f-4a03-b55f-1c2a4fd8d491",
  "is_error": false, "num_turns": 1, "subtype": "success",
  "result": "",
  "deferred_tool_use": { "id": "toolu_01FPh8BhMedjy8KgRr9F3AbY", "name": "Bash",
    "input": { "command": "git push origin main", "description": "Push local main branch to origin" } } }
```

Then clear the deny set and resume **with no prompt at all**:

```bash
claude -p --resume $SID --settings "$JSON" --setting-sources user --model sonnet \
  --output-format stream-json --verbose --permission-mode bypassPermissions < /dev/null
```

```
[user:tool_result] is_error=false "To .../d1/remote.git\n * [new branch]      main -> main"
[assistant:text] "Push succeeded — `main` was pushed to `origin` as a new branch (`9932868 c1`)…"
[result] subtype=success turns=1
remote: 99328685c351fb6ea3484c489eb08f8f3d464fb7
```

Note `turns=1` and no tool_use frame: the model was **not asked to decide again**. Claude Code re-ran the gate on the stored call, the gate now allowed it, and the call executed. Compliance is not a model property here.

Other defer behaviour I measured:

- **Resume with the deny set still populated** → re-defers, cleanly, no model call, `stop_reason: tool_deferred` again. Idempotent and safe to poll.
- **Resume with a prompt instead (rejection path)** → the deferred call is attempted, re-defers, and then the new user turn runs normally:
  ```
  prompt: "The approval request for git push was refused by the reviewer. Do not attempt it again; summarise what is left undone."
  → "The `git push` for the `main` branch was not approved, so it wasn't run…"   stop_reason=end_turn
  remote: still empty
  ```
- **`deferred_tool_use` payload** gives the harness `id`, `name`, `input` — everything needed to render an approval request to a human without parsing the transcript.
- The `permissionDecisionReason` on a defer is **not shown to the model** (there is no tool_result). Defer tells the *harness*; deny tells the *model*. If the model should also learn why it stopped, deny is the one that does that.

---

## Q6. Empty completion text on a resumed run

**Found the cause. Both causes.**

**1. `stop_reason: "tool_deferred"` always has `result: ""`.** Not a failure — the run stopped mid-turn on purpose and the payload is in `deferred_tool_use`. Any caller reading `result` as "the agent's answer" sees an empty string. Check `stop_reason`/`terminal_reason` before reading `result`.

**2. A resumed run can emit more than one `result` frame in `stream-json`.** Resuming a deferred session *with a prompt* produced, in order:

```
[result] subtype=success turns=24 result=""            ← the auto-resumed deferred call
[assistant:text] "The `git push` … was not approved, so it wasn't run…"
[result] subtype=success turns=1  result="The `git push` … was not approved, so it wasn't run…"
```

A reader that takes the **first** `result` frame gets `""`. Take the last one, or use `--output-format json`, which emits a single object.

**3. Not a cause, but adjacent:** with `-p "<prompt>"` and stdin left open, the binary prints to stderr

```
Warning: no stdin data received in 3s, proceeding without it. If piping from a slow command,
redirect stdin explicitly: < /dev/null to skip, or wait longer.
```

Always spawn with stdin closed (`< /dev/null`). And note that `claude -p --resume <uuid>` with **no** prompt is not "empty prompt" — it is the deferred-tool resume verb, and on a non-deferred session it errors with `No deferred tool marker found in the resumed session`, exit code 0, nothing on stdout. Same for `claude -p "" --resume <uuid>`.

For the record: across the five deny-then-approve resumes, `result` was non-empty 5/5. Ordinary `end_turn` resumes do not produce empty text.

---

## Q7. What silently disables or breaks this

**Workspace trust is NOT required in this version — the repo comment is wrong.**
`s3/.claude/settings.json` contained hooks only, no `enableAllProjectMcpServers`, in a directory never opened interactively. The hook fired. And `~/.claude.json` records for that directory:

```json
{ "allowedTools": [], "hasTrustDialogAccepted": false }
```

`claude --help` states it directly for `-p`: *"The workspace trust dialog is skipped when Claude is run in non-interactive mode (via -p, or when stdout is not a TTY)."* The `enableAllProjectMcpServers: true` marker in `provision-return-hook.ts` is not what makes the hook load in a `-p` run. (It may still matter for the Stop-hook path in some other invocation shape — but the WARN-F1 rationale as written does not hold for 2.1.247 print mode.)

**The permission mode on resume can silently kill the auto-resumed call.** Deferred under `bypassPermissions`, resumed under `--permission-mode acceptEdits`:

```
[user:tool_result] is_error=true "This command requires approval"
[assistant:text] "The `git push origin main` command needs your approval to run — it hasn't executed yet…"
remote: still empty
```

The hook allowed it; the *permission system* then blocked it, because headless has nobody to ask. Resuming under the default mode worked only because this machine's `~/.claude/settings.json` sets `permissions.defaultMode: "auto"`. **Resume with the same permission mode as the base run, explicitly.** The binary also carries `Deferred tool resume: permissionMode mismatch (deferred under '…')`, so some mode pairs are refused outright.

**`--print` silently ignores invalid settings.** From `--help`: *"Settings files that fail validation are silently ignored in this mode (no error dialog is shown)."* A typo in the gate settings produces an ungated session with no warning. The gate should be verified live, not assumed.

**`defer` is print-mode only.** In interactive mode it is ignored with `defer is print-mode only`. For a served/cloud call it is refused: `no resume machinery`.

**Setting sources.** Pass `--setting-sources user` (or `""`) so a repository's own `.claude/settings.json` inside the sandbox cannot add `permissions.allow` entries or hooks you did not choose. All the runs above used `--setting-sources user` plus `--settings <session file>` and behaved deterministically.

**`CLAUDE_CONFIG_DIR` isolates the config home but destroys inherited auth.**

```bash
CLAUDE_CONFIG_DIR=$S/cfg claude -p "Reply with exactly: OK" --model sonnet --output-format text
→ Not logged in · Please run /login
```

So requirement 1's "the user's real `~/.claude` must never be mutated" **cannot be fully met while keeping inherited login**. With inherited auth, every run writes a transcript to `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl` and a project entry to `~/.claude.json` — my 18 test runs created 18 of each. What we *can* keep out of `~/.claude` is all gate configuration: no settings file, no hook, no deny set, no permission rule of ours ever lands there. That is the honest boundary. (`--no-session-persistence` avoids transcript writes but also makes the session unresumable, so it is incompatible with requirement 4.)

---

## Verdict

**The mechanism that gates claude-code per session is a `PreToolUse` command hook, delivered by `--settings` (file or inline JSON) together with `--setting-sources user`, matched on tool name, discriminating on `tool_input.command`, and returning `hookSpecificOutput.permissionDecision`.**

Concretely, for the five things HyperIdle needs:

1. **Per-session, not global** — `--settings <per-session file>` + `--setting-sources user`. Nothing written to `~/.claude` except session transcripts, which are unavoidable with inherited auth.
2. **Deny one action, allow the rest** — hook matches `"Bash"`, decides on the command string. The permission-rule grammar `Bash(git push:*)` does *not* work in a hook matcher; it does work in `permissions.deny`, which can ride alongside as a second layer.
3. **The model learns why** — `permissionDecision: "deny"` with `permissionDecisionReason`. The model sees that string verbatim and nothing else. `permissions.deny` and `--disallowedTools` cannot do this; their message is fixed.
4. **Deny set changes between runs; the agent then completes the action** — two options, and I recommend the second:
   - *deny + approval message*: **5/5 complied** with the wording in Q5. Real, but it is model behaviour, one model flagged the approval as unverifiable, and five runs is five runs.
   - *`permissionDecision: "defer"`*: the run stops with `stop_reason: "tool_deferred"` and hands back `deferred_tool_use{id,name,input}`; `claude -p --resume <uuid>` with **no prompt** re-runs the gate on that exact call and executes it. **No model decision is involved, so there is no compliance rate to worry about.** Verified end-to-end. Resuming while still denied re-defers harmlessly; resuming with a prompt gives you the rejection path.
   - Best of both: **defer to pause, and on a rejection resume with a prompt that says so** — or deny outright when you want the model to know a rule exists and to keep working around it.
5. **Auth keeps working** — yes, as long as `CLAUDE_CONFIG_DIR` is left alone. Setting it isolates config and breaks login.

**Why the earlier attempt partly worked, and where it stopped.** Blocking and telling the model why worked because that is exactly what a `PreToolUse` JSON deny does. The two failures were design, not harness: re-attempt-after-approval was delegated to the model's willingness to believe an in-band approval message (recoverable — 5/5 here with better wording, and fully removable via defer), and the "empty completion text" was `result: ""` on a `tool_deferred` stop and/or reading the first of two `result` frames on a resumed stream.

**Stated plainly, the limits.** This gate stops a cooperative agent, not a determined one: `sh -c 'git push …'` walked straight through `permissions.deny`. `--print` ignores a malformed settings file in silence, so the gate must be proven live rather than assumed. And a resumed run must use the same permission mode as the run that deferred, or the auto-resumed call dies at a permission prompt with nobody to answer it.
