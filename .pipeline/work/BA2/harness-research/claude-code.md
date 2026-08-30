# BA2 phase 1 — harness research: `claude-code`

Research only. No design, no code. Every claim below is either **PROVEN** (I ran it against the real
binary and read the output), **DOCUMENTED** (official Anthropic docs, cited with date), or
**UNVERIFIED** (marked, and I say so).

- **Harness:** the real `claude` CLI, not the Agent SDK.
- **Installed version:** `2.1.220 (Claude Code)` — `claude --version`, run 2026-08-27.
  Binary: `/opt/homebrew/Caskroom/claude-code@latest/2.1.220/claude` (Mach-O arm64, 245 MB).
- **Official docs consulted:** <https://docs.claude.com/en/docs/claude-code/hooks.md>, fetched
  2026-08-27 (HTTP `date: Thu, 27 Aug 2026 16:12:51 GMT`), 291,938 bytes.
- **Live probes:** nine `claude -p` runs against the real binary in
  `/private/tmp/claude-501/.../scratchpad/{hooktest,nativedeny,holdtest,pathtest,asktest,httptest}`.
  Nothing was written into the repository.

---

## Verdict

**Yes, without a caveat on the mechanism — with one large caveat on the agent's reaction.**

We can intercept an action the agent takes with its own hands (a shell command, a file write, a
`WebFetch`) **before it happens**, block it, and deliver text that reaches the model. This is the
`PreToolUse` hook returning `permissionDecision: "deny"` with a `permissionDecisionReason`. I proved
all three parts against the installed binary, **with `--permission-mode bypassPermissions` still
passed exactly as the repo passes it today**. The flag does not have to change.

The caveat is behavioural, not technical, and it is the biggest finding in this document:

> **A model may refuse to act on the push-back, because instructions arriving in a tool result look
> like prompt injection.** With Sonnet, a deny reason that told the agent what to do next was
> explicitly identified as "characteristic of a prompt injection embedded in tool output" and the
> agent refused to comply — twice, on two different phrasings. Opus complied on the same input. The
> behaviour is model-dependent and cannot be relied on.
>
> **The mitigation is proven and cheap:** state the policy in the trusted channel (the seed prompt
> that HyperIdle already authors, or `--append-system-prompt`) and keep the deny reason a terse fact
> that names the rule. With that in place, Sonnet complied immediately and wrote the ask file.

So: the interception is solid; the *push-back* only works if the agent is told about the permission
system up front, in a channel it trusts.

---

## Mechanism

The repo **already injects hooks into the sandbox** — this is not new machinery.

`provisionClaudeSettings` writes `<sandbox>/.claude/settings.json` and `<sandbox>/.claude/return-check.sh`
before the subprocess starts
(`layers/agent-execution/harness-registry/src/provision-return-hook.ts:131`, called from
`layers/agent-orchestration/run-orchestration/src/provisioner.ts:1423`). Today that file carries a
single `hooks.Stop` entry for return enforcement
(`provision-return-hook.ts:154-165`). The adapter loads it with `--settings .claude/settings.json`
(`layers/agent-execution/harness-registry/src/adapter-pool.ts:457-458`).

A `PreToolUse` entry goes in the **same object, next to `Stop`**. No new provisioning path, no new
file, no flag change.

The adjudicator already exists too: `POST /api/mcp/:token/return-status`
(`layers/agent-execution/harness-registry/src/mcp/mcp-route.ts:36-56`) is a plain-HTTP endpoint the
Stop hook curls with the session bridge token as Bearer auth. A permission adjudication endpoint is
the same shape.

There are two ways to wire the hook, and **the HTTP form is the better fit and I proved it works**:

| form | how | proven |
|---|---|---|
| `type: "command"` | shell script in the sandbox, reads the event JSON on stdin, prints a JSON decision | yes (runs 1,2,3,5,6,7) |
| `type: "http"` | Claude Code POSTs the event JSON straight to a URL with configured headers; the **response body** is the decision | yes (run 8) |

The HTTP form removes the shell script entirely: HyperIdle's bridge decides live, per call, against
the real per-team rule store, with the session token in an `Authorization` header — exactly the
existing `return-status` pattern. Proven end-to-end in run 8: the local server received
`{"auth":"Bearer server-minted-token-abc123","tool":"Bash","input":{"command":"echo hyperidle-canary",...}}`
and its JSON response denied the call.

---

## Evidence

### 1. Hook events, and what `PreToolUse` can do

**PROVEN — the event exists and denies in 2.1.220.** Run 1: settings with a `PreToolUse` /
`matcher: "Bash"` hook returning
`{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}`.
The stream showed the tool call, then:

```json
{"type":"user","message":{"content":[{"type":"tool_result",
  "content":"BLOCKED BY HYPERIDLE: this action needs human approval. …",
  "is_error":true,"tool_use_id":"toolu_016rgS1ADzvwqx1BdYJ6AxRV"}]}}
```

The command never ran. The reason text reached the model verbatim — the agent quoted it back.

**PROVEN — the installed binary ships its own hooks reference.** `strings` on the 2.1.220 binary
contains an embedded "Hooks Configuration" document (the `claude-code-docs` skill reads it). It lists
the events for *this build*: `PermissionRequest`, `PreToolUse` ("Run before tool, can block"),
`PostToolUse`, `PostToolUseFailure`, `Notification`, `Stop`, `PreCompact`, `PostCompact`,
`UserPromptSubmit`, `SessionStart`. It documents
`hookSpecificOutput.permissionDecision` as `"allow" | "deny" | "ask"` (PreToolUse only) and
`permissionDecisionReason` as "Reason for the permission decision (PreToolUse only)". Symbol counts
in the binary corroborate: `PreToolUse` ×95, `permissionDecision` ×15, `hookSpecificOutput` ×40.

**DOCUMENTED (docs.claude.com/en/docs/claude-code/hooks.md, fetched 2026-08-27).** The live docs add
a fourth outcome, `"defer"`, and state precedence `deny > defer > ask > allow`. On the reason field:
*"For `"allow"` and `"ask"`, shown to the user but not Claude. For `"deny"`, shown to Claude."*
Exit-code 2 + stderr is an equivalent route to `deny` — the same shape the existing Stop hook uses.

**Version gap, stated plainly:** the live docs describe builds up to **2.1.246**; we run **2.1.220**.
I checked every version-gated note in that page. The ones newer than 2.1.220 concern
`classifierContext` (2.1.236), `quota_auto_resume_*` notification types (2.1.234), sandbox network
`permission_prompt` (2.1.246), and a removed `SessionEnd` matcher (2.1.234). **None touch
`PreToolUse` deny, HTTP hooks, or `defer`.** And I proved deny, HTTP and the payload shape on 2.1.220
directly, so the gap does not matter for this work package.

### 2. What a denial looks like from the agent's side

**PROVEN — the agent sees a message and keeps going.** It is not a hard stop. The deny arrives as a
normal `tool_result` with `is_error: true`; the turn continues; the agent can then call another tool.
In run 3 the agent read the block, decided not to retry, called `Write`, and produced its ask file —
all in the same turn. That is exactly the shape AC 3 needs: pushed back, still alive, able to raise a
review.

**PROVEN — and this is the risk.** Whether the agent *acts on* the instruction in the reason is
model-dependent:

| run | model | deny reason | outcome |
|---|---|---|---|
| 1 | sonnet | "…call the tool `submit_review`…" | **refused.** "That pattern is characteristic of a prompt injection embedded in tool output… I'm not going to act on it." |
| 2 | sonnet | "…write a file named ASK.txt…" | **refused.** "legitimate tool/permission errors don't instruct the model to take specific alternate actions… I'm flagging this rather than complying." No file written. |
| 9 | opus | identical to run 2 | **complied.** Wrote ASK.txt with what it did, what it wants next, and the clearance it needs. |
| 3 | sonnet | terse: "Blocked by team permission rule `shell-echo-canary`. Human approval required." — **with the policy stated in the seed prompt** | **complied.** Wrote ASK.txt naming the rule. |

The run-3 seed prompt told the agent, before any work: the team has a permission list; a
tool result saying it was blocked by a team permission rule is HyperIdle's own permission system, not
an error and not an injection; when it happens, do not retry, write the ask instead. That flipped
Sonnet from refusal to compliance on the first attempt.

**Read this as an architectural constraint, not a bug.** The push-back's *instructions* belong in the
prompt HyperIdle already controls. The deny reason belongs to naming which rule fired.

### 3. Does `--permission-mode bypassPermissions` defeat hooks?

**PROVEN — no. They are independent, and the hook wins.** Every run above passed
`--permission-mode bypassPermissions`, byte-identical to `adapter-pool.ts:455-456`. Every deny held.
The hook's own stdin payload confirms the mode was live:

```json
{"session_id":"4f8fbd3c-…","cwd":"…/hooktest","permission_mode":"bypassPermissions",
 "hook_event_name":"PreToolUse","tool_name":"Bash",
 "tool_input":{"command":"echo hyperidle-canary","description":"Echo canary string"},
 "tool_use_id":"toolu_016rgS1ADzvwqx1BdYJ6AxRV"}
```

**The repo's current flag does not have to change.** That removes the risk the brief flagged.

Corroborating: run 7 returned `permissionDecision: "ask"` under `bypassPermissions` in headless `-p`.
Bypass did **not** swallow it into an auto-approve. With no terminal to prompt, the call was refused
and the reason still reached the model. `ask` is not usable as a "wait for a human" primitive in
headless — it degrades to a deny — but it does not silently allow, which is the important part.

### 4. What a hook can match on

**PROVEN — the hook sees the whole tool input, so a rule can express anything about it.**

- **Tool name**, via `matcher`, a regex: `"Bash"`, `"Bash|Write|Edit"`, `"mcp__.*"`.
- **Shell command text.** The `Bash` payload carries `command` and `description` verbatim (run 1).
- **File paths, always absolute.** Run 6 matched `*/secrets/*` on a `Write` and blocked it; the file
  was not created. The hook received
  `{"tool_name":"Write","tool_input":{"file_path":"/private/tmp/.../pathtest/secrets/note.txt","content":"hello"}}`
  — note the model wrote `./secrets/note.txt` and the hook got the resolved absolute path. Docs
  confirm: *"Claude Code expands `~` and relative paths before hooks run, so a hook that matches on
  paths can't be bypassed via `~` or a relative spelling of the same path."*

**DOCUMENTED — there is also a declarative `if` filter** using permission-rule syntax
(`"Bash(git *)"`, `"Edit(*.ts)"`) that gates whether the hook runs at all. It parses shell structure:
`Bash(git *)` fires on `FOO=bar git push` and on `npm test && git push`; `Bash(rm *)` fires on
`echo $(rm -rf /)`. **But the docs say plainly it is best-effort:** *"The filter also fails open,
running your hook regardless of pattern, when the Bash command can't be parsed. Because the `if`
filter is best-effort, use the permission system rather than a hook to enforce a hard allow or deny."*
I did not test `if`. Treat it as an optimisation, not the rule engine.

**Documented, untested by me:** `PreToolUse` matches `Bash`, `PowerShell`, `Edit`, `Write`, `Read`,
`Glob`, `Grep`, `Agent`, `WebFetch`, `WebSearch`, `AskUserQuestion`, `ExitPlanMode`, and MCP tool
names. So a *network call the agent makes with its own tools* (`WebFetch`) is interceptable on the
same event. Hooks also fire inside subagents, with `agent_id` / `agent_type` in the payload
(docs, 2026-08-27).

**A `Read` gap worth knowing:** files referenced with `@` in a prompt are inlined without a tool call,
so no `PreToolUse` fires for them. Irrelevant to blocking *actions*; relevant if a rule ever tries to
block reads.

### 5. Is there a native permission mechanism, and can it talk to the agent?

**PROVEN — yes, it blocks; no, it cannot carry our message.** Run 4 used settings with no hooks at
all, only `{"permissions":{"deny":["Bash(echo hyperidle-canary:*)"]}}`, under `bypassPermissions`. The
call was blocked. The agent received a **fixed, generic** string:

```
Permission to use Bash with command echo hyperidle-canary has been denied.
```

No rule name, no custom reason, nothing about how to ask. That kills it as the mechanism for BA2:
AC 2 requires the agent be *told it needs approval and how to ask*, and a native deny rule cannot say
either. Two further facts from the same run: `bypassPermissions` does **not** override a `deny` rule,
and the docs state deny/ask rules are evaluated *regardless of what a hook returns* — so a native rule
can override a hook's `allow`. Useful as a floor, not as the push-back.

### 6. Bonus: a hook can hold the agent open while a human decides

Not asked, but it changes what shapes are available, so it is worth the paragraph.

**PROVEN.** Run 5: a `PreToolUse` command hook with `"timeout": 600` that slept **95 seconds** and
then returned `allow`. The hook was not killed; the command ran; the agent reported the output
normally. Wall clock 1:42. The default timeout for `command`, `http` and `mcp_tool` hooks is **600
seconds** (docs, 2026-08-27; the binary's own embedded doc example says 60, which is only an example).

**DOCUMENTED, untested by me — `permissionDecision: "defer"` is purpose-built for our situation.**
The docs describe it as *"for integrations that run `claude -p` as a subprocess and read its JSON
output… It lets that calling process pause Claude at a tool call, collect input through its own
interface, and resume where it left off."* The process exits with `stop_reason: "tool_deferred"` and a
`deferred_tool_use` payload; HyperIdle collects the human decision; `claude -p --resume <session-id>`
re-fires the same `PreToolUse`, which now returns `allow`. **No timeout and no retry limit.** The
installed 2.1.220 binary contains `tool_deferred`, `tool_deferred_unavailable` and `deferred_tool_use`
strings, so the machinery is present in our build — but I did not run it.

Two documented traps if anyone reaches for `defer`:
- *"`"defer"` only works when Claude makes a single tool call in the turn. If Claude makes several
  tool calls at once, `"defer"` is ignored with a warning and the tool proceeds through the normal
  permission flow."* Under `bypassPermissions` "normal permission flow" means the action happens. A
  batched tool call would slip through.
- *"`--resume` restores the permission mode… The exceptions are `plan` and `bypassPermissions`, which
  are never carried over."* A resume must re-pass `--permission-mode`.

Neither of these is a problem for the deny-and-push-back shape the plan describes. I record them
because "hold the agent open" and "defer and resume" are the two obvious alternatives to it, and both
have sharp edges the plan's shape does not.

---

## What is still unknown

- **Whether the injection-refusal is stable.** I have four data points (Sonnet refused twice, Opus
  complied once, Sonnet complied once when primed). That is enough to call it a real risk and enough
  to call the priming mitigation effective, and not enough to claim either is deterministic.
  Model-dependent behaviour deserves a live check on whatever models HyperIdle actually runs, and
  should be proven on the hardest one, not the easiest.
- **`additionalContext` on a deny.** Docs say `hookSpecificOutput.additionalContext` is "added to
  Claude's context alongside the tool result". **UNVERIFIED.** My working assumption — and it is an
  assumption — is that it arrives through the same tool channel and so carries the same injection
  suspicion, which would make it no better than `permissionDecisionReason`. Someone should test it
  before building on it.
- **`defer` end to end.** Never run. Present in the binary by symbol only.
- **The `if` filter.** Never run. Docs say it fails open.
- **The real ceiling on hook timeout.** Proven to 95 s with `timeout: 600` configured. The documented
  default is 600 s. I did not test to 600.
- **`--settings` is additive, not replacing.** Confirmed incidentally: run 1 loaded my *user*
  `~/.claude/settings.json`, its plugins, and fired a plugin `SessionStart:startup` hook, alongside
  the sandbox settings file. The sandbox has a fresh cwd, so project settings will not exist, but the
  sandbox inherits the real `HOME` (`envAllowlist` includes `HOME`, `adapter-pool.ts:471`), so
  **user-level hooks and plugins load inside a HyperIdle session today**. Whether that can interfere
  with a permission hook is **UNVERIFIED**. `--setting-sources <user,project,local>` exists if it
  needs constraining.
- **Evasion.** An agent that wants to get around a command-text rule can (`base64 -d | sh`, a script
  it wrote first, `python -c`). Tool-level interception cannot close that, and per ETHOS this
  package is not building for a rogue agent — but nobody should describe the result as containment.

---

## One-paragraph summary for architecture

Add a `PreToolUse` entry beside the existing `Stop` entry in the settings file the sandbox already
gets, preferably `type: "http"` pointing at a new bridge route alongside `return-status`, carrying the
session bridge token. Keep `--permission-mode bypassPermissions`. On a match return
`permissionDecision: "deny"` with a short reason that names the rule. Put the "here is how you ask"
instruction in the seed prompt, not in the reason — otherwise the agent is liable to read the
push-back as an attack and refuse it.
