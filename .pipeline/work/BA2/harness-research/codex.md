# BA2 phase 1 — harness research: **codex**

Researcher: planner agent. Date: **2026-08-27**.
Installed binary: **`codex-cli 0.146.1`** (`/opt/homebrew/bin/codex` →
`/opt/homebrew/Caskroom/codex/0.146.1/bin/codex`, `codex --version`, run 2026-08-27).
Official docs consulted: `https://learn.chatgpt.com/docs/hooks` (the redirect target of
`https://developers.openai.com/codex/hooks`), HTTP `last-modified: Thu, 27 Aug 2026 15:03:23 GMT` —
i.e. the docs were current on the day of this research and may describe a build newer than 0.146.1.
Where docs and the installed binary disagree, that is called out.

---

## 1. Verdict

**Yes — with one structural caveat.**

Codex has a real **`PreToolUse` hook** that fires before the agent's own shell commands and its own
file edits, can **deny** them, and delivers a **hook-authored message back to the model** as the tool
call's result. I proved both halves live against the installed binary, in headless `codex exec`, in
the same shape HyperIdle already provisions (per-session `CODEX_HOME` + `hooks.json` +
`--dangerously-bypass-hook-trust`). The blocked agent keeps its turn and can act on the message.

The caveat: **hook enforcement fails open and fails silently.** When hook trust is not satisfied,
codex runs the action anyway with no warning, no error, and no event. I also hit a state in which
hooks stopped firing entirely in a `CODEX_HOME` I had mutated repeatedly, while codex still printed
its "hooks are enabled" startup warning — I could not identify the trigger. OpenAI's own docs say
"Treat tool hooks as a useful guardrail, not a complete enforcement boundary." So codex can carry
BA2's push-back, but the mechanism cannot be assumed on; it has to prove itself per session.

**Not usable:** codex's native approval mechanism. `codex exec` rejects `--ask-for-approval`
outright, and `approval_policy` set through config is accepted but **inert** in exec — an untrusted
command ran with no approval and no hang. The `PermissionRequest` hook, which is codex's "about to
ask a human" event, therefore never fires in a headless run. Verified both.

---

## 2. The mechanism

One `PreToolUse` entry added to the `hooks.json` that HyperIdle already writes into the per-session
`CODEX_HOME` (`provisionCodexHome`, `layers/agent-execution/harness-registry/src/provision-return-hook.ts:211`).

```json
{
  "hooks": {
    "Stop":       [ { "hooks": [ { "type": "command", "command": "<CODEX_HOME>/return-check.sh", "timeout": 10 } ] } ],
    "PreToolUse": [ { "matcher": "Bash|apply_patch",
                      "hooks": [ { "type": "command", "command": "<CODEX_HOME>/pre-tool-use.sh", "timeout": 10 } ] } ]
  }
}
```

- The hook is a command. Codex writes one JSON object to its **stdin** and reads its **stdout**.
- Stdin carries `tool_name`, `tool_input`, `tool_use_id`, `session_id`, `turn_id`, `cwd`,
  `transcript_path`, `model`, `permission_mode`.
- To block, the hook prints
  `{"decision":"block","reason":"<text>"}` and exits 0 — the same wire shape the repo's existing
  codex Stop hook already uses (`provision-return-hook.ts:365`). The newer spelling
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
  "permissionDecisionReason":"<text>"}}` is documented as equivalent; exit code 2 with the reason on
  stderr also works. I proved the `decision:block` form.
- The model receives, as the result of its own tool call:
  `Command blocked by PreToolUse hook: <reason>. Command: <the command>`
- Because that is a tool result rather than a turn end, the agent stays alive and can immediately do
  something else — call HyperIdle's `submit_review` tool, for instance. That is exactly the
  "push-back, not a stop" that BA2 requires.

The existing Stop hook and the new PreToolUse hook coexist in one `hooks.json` — proven, both fired
in the same run.

---

## 3. Evidence

Every run below used the installed `codex-cli 0.146.1` binary on 2026-08-27, in a scratch directory
outside the repository, in headless `codex exec`, with `gpt-5.4-mini` (the repo's locked codex test
model, `layers/agent-execution/harness-registry/src/__tests__/require-harness.ts:191`).

### Fact 1 — codex has a PreToolUse hook, not only a Stop hook. **VERIFIED.**

`codex features list` on 0.146.1 reports `hooks   stable   true`. The binary embeds JSON schemas for
eleven hook events: `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`,
`SessionStart`, `SessionEnd`, `SubagentStart`, `SubagentStop`, `Stop`, `UserPromptSubmit` (extracted
with `strings` from the binary; schema titles `pre-tool-use.command.input` /
`pre-tool-use.command.output` etc.). The official docs list the same set.

The repo's `@lore` at `provision-return-hook.ts:35` and the channel `settings-codex`
(`adapter-pool.ts:327`) describe only the Stop hook, because that is all the repo needed. The Stop
hook is written by `provisionCodexHome` and installed at sandbox setup by `installReturnHook`
(`provision-harness-environment.ts:26`). Nothing in the repo currently uses PreToolUse.

### Fact 2a — a PreToolUse hook can deny a shell command. **VERIFIED, live.**

Hook returning `{"decision":"block","reason":"HyperIdle policy: this action needs human approval…"}`
for any input containing a marker; prompt asked the agent to run `echo hyperidle_secret`.

- Hook stdin received:
  `{"…","hook_event_name":"PreToolUse","model":"gpt-5.4-mini","permission_mode":"bypassPermissions",
  "tool_name":"Bash","tool_input":{"command":"echo hyperidle_secret"},"tool_use_id":"call_…"}`
- codex stderr: `ERROR codex_core::tools::router: error=Command blocked by PreToolUse hook: …`
- The command did not run.

### Fact 2b — a PreToolUse hook can deny a file write. **VERIFIED, live.**

Same hook, prompt asked the agent to create `danger.txt`. The agent used codex's `apply_patch` tool.
Hook stdin: `"tool_name":"apply_patch","tool_input":{"command":"*** Begin Patch\n*** Add File:
danger.txt\n+hyperidle_secret .\n*** End Patch\n"}`. The patch was blocked and `danger.txt` was never
created (checked on disk). The agent reported: *"Creating `danger.txt` is blocked by a local policy
gate and needs human approval. I haven't written the file yet."*

This matters because BA2's outcome names both halves — "run a command, write a file" — and codex
routes them through two different tools.

### Fact 2c — the hook's text reaches the model verbatim. **VERIFIED, live.**

From the session rollout transcript that codex itself wrote, the `function_call_output` the model
consumed was, in full:

```
Command blocked by PreToolUse hook: HyperIdle policy: this action needs human approval. Do NOT
retry it. Instead call the review tool to ask a human, explaining what you did and what you want
cleared.. Command: echo hyperidle_secret
```

So the block and the instruction arrive together, as the model's own tool result. This is the single
most important fact for BA2: it is what makes "you need approval, and here is how to ask" possible on
codex rather than a dead stop.

Documented limit: model-visible hook output is capped at roughly 2,500 tokens, with overflow spilled
to a file and replaced by a head-and-tail preview (docs, 2026-08-27). Ample for a push-back message.

### Fact 3 — what `--dangerously-bypass-hook-trust` bypasses, and whether we still need it. **VERIFIED.**

`codex --help` (0.146.1): *"Run enabled hooks without requiring persisted hook trust for this
invocation. DANGEROUS. Intended only for automation that already vets hook sources."*

Codex's **hook trust** is a review gate on the hook definition itself, not on what the hook does.
Docs: codex records trust against the hook's current hash, so a new or changed hook is marked for
review and skipped until a human trusts it via `/hooks` in the interactive CLI. There is no way to
review a hook inside a headless `codex exec`.

**We must keep passing the flag.** Proven by removing it:

| Run | Flag | Hook fired? | Command ran? |
|---|---|---|---|
| identical config | `--dangerously-bypass-hook-trust` | yes | no — blocked |
| identical config | *(flag omitted)* | **no** | **yes — `hyperidle_secret` printed** |
| `trusted_hash` set to a wrong value, flag omitted | — | **no** | **yes** |

In the failing runs codex emitted **no warning at all** about a skipped hook. It fails open, silently.
The repo already passes the flag whenever a `.codex-home/` exists
(`layers/agent-execution/harness-registry/src/cli-harness-adapter.ts:526-533`).

The flag **does not weaken anything BA2 depends on**. It only skips the trust review of our own hook —
a hook HyperIdle writes itself, from server-minted values, into a directory it owns. It does not touch
the sandbox, the approval policy, or hook behaviour. Its only visible side effect is two informational
lines in the JSONL stream (see Fact 6).

Alternatives to the flag, neither of which suits BA2:
- **Managed hooks** via an enterprise `requirements.toml` with `[hooks]` and a `managed_dir` are
  "trusted by policy" and need no flag (docs). But `requirements.toml` is a machine-level MDM artifact,
  not something a per-session sandbox can provide. Not verified by me; documented only.
- **Precomputing `trusted_hash`** in `hooks.json`. The key exists (present in the binary's config
  parser alongside `matcher`, `hooks`, `enabled`). **I could not determine the hash algorithm** and a
  wrong value silently disabled the hook. Treat as unavailable unless someone reverse-engineers it.

### Fact 4 — codex's native approval mechanism cannot serve. **VERIFIED, two ways.**

Codex's sandbox modes are `read-only` (default), `workspace-write`, `danger-full-access`
(`codex exec --help`, 0.146.1). The repo picks `workspace-write` for a reason recorded at
`adapter-pool.ts:309` — a read-only codex refuses every file write, which makes the agent useless.
**Sandbox modes are a blunt capability switch, not a permission mechanism**: they are set once at
spawn, they cannot be per-action, and a denial arrives at the model as a bare OS failure. Proven: in a
`read-only` run the agent got `touch: approval_probe2.txt: Operation not permitted` — no policy, no
reason, nothing to ask a human about. That cannot produce BA2's push-back.

Separately, codex has an approval policy (`--ask-for-approval` with `untrusted` / `on-request` /
`never`). **It is not reachable in a headless exec run:**

- `codex exec -a untrusted …` → `error: unexpected argument '-a' found`. The flag exists on the
  interactive CLI and is absent from `codex exec --help`.
- `codex exec -c approval_policy="untrusted"` → the key is real (`--strict-config` accepts it; a
  deliberately bogus key is rejected with `unknown configuration field`), but the run **ignored it**:
  the untrusted command `touch approval_probe.txt` executed, the file was created, and nothing hung
  and nothing asked. So it neither works nor fails loudly — it is inert.
- With that same policy **and** a `PermissionRequest` hook registered and a sandbox denial occurring,
  the `PermissionRequest` hook **never fired** (its log file was never created). Consistent with the
  docs: *"PermissionRequest runs when Codex is about to ask for approval… It doesn't run for commands
  that don't need approval."* In `codex exec`, codex never asks.

The hook payload confirms the same picture from inside: every PreToolUse invocation in exec reported
`"permission_mode":"bypassPermissions"`.

This also explains, and validates, the existing `@lore AO2 codex-approvals-strip`
(`provision-return-hook.ts:250-282`), which strips `approvals_reviewer` from the copied user config
because it hangs a non-interactive spawn.

**Conclusion: PreToolUse is the only mechanism. There is no second option on codex.**

### Fact 5 — what a hook can match on. **VERIFIED for tool name; rest from docs.**

`matcher` is a **regex over the tool name** (docs; the alternation form `Bash|apply_patch` proven
live). Omitting it, or `"*"` / `""`, matches every occurrence of the event.

Proven: with `"matcher": "Bash"` and a prompt that did both a shell command and a file write, the hook
fired **once**, for `Bash` only, while the `apply_patch` write proceeded untouched. Tool-name
filtering is real and exact.

Canonical tool names (docs, matching what I observed):

| Tool path | `tool_name` | matcher aliases |
|---|---|---|
| shell commands, unified exec | `Bash` | `Bash` |
| file edits | `apply_patch` | `apply_patch`, `Edit`, `Write` |
| MCP tools | `mcp__<server>__<tool>` | same, regex |
| other local function tools | e.g. `update_plan` | same |
| hosted tools (WebSearch) | — | **no hook at all** |

**There is no matching on command text or file path.** `matcher` sees only the tool name. Any pattern
over *what* the command does — a command substring, a path prefix — must be evaluated inside the hook
body, against `tool_input.command`. For `Bash` and `apply_patch` that field is a single string: the
shell command line, or the whole patch text. That is a design constraint for BA2's rule store: rules
are matched by HyperIdle's own code, not by codex.

Docs also note a documented `permissionDecision:"allow"` + `updatedInput` form for **rewriting** a
call instead of blocking it. **I did not verify this**, and the 0.146.1 binary contains an internal
error string `PreToolUse hook returned unsupported permissionDecision:allow`, so rewrite may not work
on the installed build. Do not build on it. `permissionDecision:"ask"` and legacy
`decision:"approve"` are documented as parsed-but-unsupported — on an unsupported field codex marks
the hook failed and **continues the tool call**, i.e. fails open again.

### Fact 6 — a block is invisible to HyperIdle's event stream. **VERIFIED.**

The full JSONL of a blocked run contains **no `command_execution` item at all** — only
`thread.started`, the two bypass-flag notices, `turn.started`, the agent's messages, and
`turn.completed`. The block appears only on stderr (a `codex_core::tools::router` ERROR line) and in
the hook's own stdin.

Two consequences for BA2:
1. **The hook is the only place that knows a block happened.** If HyperIdle needs to know, the hook
   must tell it — the same pattern the Stop hook already uses, POSTing to the per-session bridge
   (`buildCodexReturnCheckScript`, `provision-return-hook.ts:365`). Do not plan to detect blocks by
   parsing codex events.
2. The two `--dangerously-bypass-hook-trust` notices arrive as
   `{"type":"item.completed","item":{"type":"error","message":"…"}}`. The repo's normalizer reads
   `item.text` and ignores `item.message`
   (`layers/agent-execution/harness-registry/src/harness-event-normalization.ts:224-229`), so today
   they degrade to empty completions rather than errors. Benign, but it is load-bearing on a line of
   code that was not written with this in mind — worth an assertion in the proof-vehicle test.

---

## 4. Risks

**R1 — enforcement fails open, always silently. (Highest.)**
Every failure mode I produced ended the same way: codex ran the action, the hook never ran, and
nothing in stdout, stderr, or the event stream said so. Trust unsatisfied → skipped, silently.
Unsupported output field → hook marked failed, **tool call continues**. Hook errors, missing MCP
servers, unavailable tools → *"don't block the operation"* (docs). BA2 must therefore not treat "no
block reported" as "nothing needed blocking." The proof-vehicle should include a positive
self-check — a `SessionStart` hook that reports "I am alive" to the bridge, or an equivalent — so a
session whose gate silently evaporated is detectable rather than indistinguishable from a session with
no matching rules. The founder's ethos rules out preemptive security, but this is not paranoia: it is
the difference between a feature that works and a feature that only appears to.

**R2 — I reproduced a total, unexplained hook outage.**
In one `CODEX_HOME` that I had mutated many times across the session (hooks added, removed, renamed,
a bogus `trusted_hash` written and later removed, scripts rewritten), hooks stopped firing entirely
and never recovered: four consecutive runs, including a config byte-identical to one that had worked
twenty minutes earlier. Codex still printed its "`--dangerously-bypass-hook-trust` is enabled.
Enabled hooks may run without review" notice in those runs, i.e. it believed hooks were enabled. A
**completely fresh** `CODEX_HOME` worked on the first try and on repeat runs (3/3), including with a
stray `hooks.json.off` copied in and including the exact combined Stop + PreToolUse config that had
just failed. **I could not identify the trigger.** I ruled out: matcher alternation, Stop/PreToolUse
coexistence, the stray file, re-use of a `CODEX_HOME` across runs per se, and a corrupt models cache
(imperfect correlation). Where the state is persisted, I could not find — not in `config.toml`, not in
`state_5.sqlite`. HyperIdle provisions a fresh `.codex-home/` per session, which is the configuration
that always worked, so this is probably not a production path. But it is unexplained, it is silent, and
it is the same failure signature as R1.

**R3 — OpenAI says so themselves.**
Docs, 2026-08-27: *"Some specialized tool paths can opt out of the default hook path. Treat tool hooks
as a useful guardrail, not a complete enforcement boundary."* Hosted tools such as `WebSearch` do not
go through hooks at all. `write_stdin` into an existing unified-exec session does not re-fire
PreToolUse — so a long-running shell the agent already opened can keep receiving input unchecked.
BA2's framing ("learn what agents think is dangerous", empty list by default) survives this fine; a
framing that promised containment would not.

**R4 — version drift.** The docs are newer than the installed binary and the two already disagree in
at least one place (rewrite-on-allow). Anything BA2 relies on should be proven against the binary in
the harness lane, not read from the docs. The repo's own `@lore` still says "codex-cli v0.141.0"; the
machine now has 0.146.1.

**R5 — flakiness observed.** One run hung for seven minutes with zero output after printing
`Reading additional input from stdin...`, and produced nothing; re-running the same command with
`</dev/null` worked. Redirect stdin explicitly in any test harness. I did **not** encounter the known
codex MCP-readiness failure, because none of my runs configured an MCP server — so that problem is
neither confirmed nor cleared by this research, and it sits directly on BA2's path, since the blocked
agent has to reach HyperIdle's review tool over MCP.

---

## 5. Still unknown

- **The `trusted_hash` algorithm.** Not determined. Consequence: `--dangerously-bypass-hook-trust`
  is the only route, and it is already in place.
- **The cause of R2.** Not determined.
- **Whether `permissionDecision:"allow"` + `updatedInput` (rewrite) works on 0.146.1.** Documented;
  contradicted by a string in the binary; not tested. BA2 does not need it — the founder chose "bring
  the agent back", not "execute the command directly" — but if that decision is ever revisited, test
  it first.
- **Managed hooks via `requirements.toml`.** Documented only; not tested; almost certainly not usable
  from a per-session sandbox.
- **The `.rules` execpolicy files** (`codex exec --ignore-rules` — "user or project execpolicy
  `.rules` files"). A second, separate native mechanism for constraining commands that I found in the
  CLI surface but did not investigate; the docs site has no page for it that I could locate. Likely a
  static allow/deny policy with no message channel back to the model, which would make it useless for
  BA2's push-back, but that is an **inference, not a verified fact**.
- **Whether a blocked agent will reliably choose to call `submit_review`** rather than give up or work
  around the block. In my runs the agent stopped and reported the block honestly, which is the right
  instinct; whether it will take the instructed next step is a prompting question that only the phase-2
  proof vehicle can answer.
