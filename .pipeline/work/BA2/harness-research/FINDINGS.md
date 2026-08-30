# BA2 phase 1 — what the harnesses can actually do

Five harnesses researched independently, 2026-08-25, against the binaries installed on this machine.
Every "yes" below was **demonstrated live**, not read in documentation. Per-harness detail and evidence
is in the sibling files.

| Harness | Version tested | Can we block a session action? | Can we send text the model reads? |
|---|---|---|---|
| claude-code | 2.1.220 | **Yes** — `PreToolUse` hook | Yes |
| codex | codex-cli 0.146.1 | **Yes** — `PreToolUse` hook | Yes, as the tool result |
| opencode | 1.18.16 | **Yes** — config `permission`, or a plugin's `tool.execute.before` | Yes, verbatim, via the plugin throw |
| cursor-agent | 2026.08.25-3e8eec8 | **Yes** — hook system | Yes, via `user_message` |
| builtin | in-process | **Nothing to intercept** — see below | n/a |

**The plan's "every harness" constraint survives.** All four CLI harnesses can do this. That was the
largest open risk in the package and it has closed favourably.

---

## The five things that shape the architecture

### 1. Native approval is unusable everywhere. Hooks are the only path.
Every harness has some notion of "ask the human", and on every one of them it is useless in the
headless form this product runs:

- **codex** — `codex exec` rejects `--ask-for-approval` outright; `approval_policy` is inert there and
  `PermissionRequest` never fires.
- **opencode** — `"ask"` auto-rejects, and without `experimental.continue_loop_on_deny` it ends the
  agent's turn.
- **cursor-agent** — `permission: "ask"` does not block at all headlessly: the action simply runs, with
  no prompt and no message.

So there is no "use the harness's own permission tooling" option to weigh against hooks. The interview
offered both; reality offers one.

### 2. The decision belongs to HyperIdle, not the hook config
codex's `matcher` matches **tool names only** — never command text, never file paths. So a rule like
"merging needs approval" cannot be expressed in hook configuration on codex, and by extension the
rules cannot live in per-harness config anywhere without diverging.

Every rule must be evaluated **in the hook body, against the action's actual arguments**. That is the
opposite of a problem: it means one rule engine, owned by HyperIdle, and four thin per-harness shims
that transport an action to it and carry a verdict back. The per-harness work is thinner than the plan
feared — the harness-specific part is the wiring, not the logic.

### 3. The hook must call home, or HyperIdle never learns a block happened
On codex a blocked action produces **no JSONL item at all** — nothing on the wire tells HyperIdle
anything occurred. So the hook cannot be a passive gate; it has to report back over the bridge, the way
the existing Stop hook already does. On claude-code this is direct: a hook can be `type: "http"` and
POST straight to HyperIdle's bridge with the session token — **proven end to end, no shell script in
the sandbox needed**, the same shape as the existing `/return-status` route
(`layers/agent-execution/harness-registry/src/mcp/mcp-route.ts:36`).

This is the substrate the whole feature rides, and it already exists for a different job.

### 4. Blocking succeeding is not the same as the agent understanding — and each harness fails differently
Three independent researchers hit the same class of trap from three angles:

- **cursor-agent** — `agent_message`, the field *Cursor's own documentation* says carries the
  explanation to the agent, is **discarded by the installed CLI**. A deny carrying only it reaches the
  model as a bare "blocked by a hook" with no reason. Use `deny` + `user_message`.
- **claude-code** — the **model may refuse the push-back as a prompt injection**. Sonnet, twice, on two
  phrasings, identified a deny reason that told it what to do next as *"characteristic of a prompt
  injection embedded in tool output"* and refused. Opus complied on identical input. The proven fix:
  state the permission policy in the seed prompt HyperIdle already authors, and keep the deny reason a
  terse fact naming the rule. Sonnet then complied first try. **Consequence: the push-back's
  instructions cannot live in the hook's message.**
- **opencode** — the message arrives verbatim, but only via the plugin path, which is currently
  disabled (see §5).

"The action was blocked" and "the agent knows why and what to do" are two separate things, and each
needs proving separately, per harness.

### 5. Fail-open is the recurring danger, and it is silent
- **codex** — drop `--dangerously-bypass-hook-trust`, or let a `trusted_hash` go stale, and codex runs
  the action with **no warning, no error, no event**. Reproduced. Separately, a `CODEX_HOME` was hit
  where hooks stopped firing entirely for an unexplained reason while codex still reported them
  enabled.
- **cursor-agent** — a crashed hook fails **open** by default, silently un-gating every rule.
  `failClosed: true` is required.
- **opencode** — `--pure` in the production spawn (`adapter-pool.ts:366`, and again on re-engage at
  `cli-harness-adapter.ts:825`) **disables project plugins entirely**. Proven: the same sandbox that
  blocked a `git push` via a plugin ran it once `--pure` was added.

**Therefore: "no block was reported" may never be read as "nothing needed blocking."** The design needs
a positive, per-session proof that the gate is live. This is the single most important thing phase 2
must get right, and it is not in the plan's acceptance criteria today.

---

## Two decisions for the founder

### A. The builtin harness has nothing to intercept
It is an in-process LLM loop with no subprocess, no shell and no file tools of its own; every action it
takes is a HyperIdle tool-registry call — exactly the category ruled out of scope. Either builtin is
out of scope (and a team's rule then means something different depending on which harness an agent
runs on), or for builtin alone the registry *is* the session and we intercept there. Full argument in
`builtin.md`.

### B. Holding the agent inline — raised, and withdrawn
A claude-code hook was held open for **95 seconds** with `timeout: 600`, so "block and wait inline for
the human" is technically real. It was put to the founder and **withdrawn on their question**, which
was the right one: *what is the purpose of waiting?*

While the hook is held, the agent is frozen **inside the tool call**. It cannot do the one thing the
design needs it to do — compose the review, which is substantial work carrying artifacts and examples.
Filling that wait would mean HyperIdle building the review itself, which is the rejected capture
concept.

The only coherent placement is a hold on the *retry*, after a review already exists. That saves a
session teardown and re-provision when the human is present — a latency and cost optimisation with a
ten-minute ceiling, not a capability, and a second code path through the most failure-prone part of the
system.

**Decided: D10 stands. Approval resumes the agent.** Do not resurrect holding as a "cheap win"; it was
measured, considered, and rejected on the flow, not on feasibility.

### C. The push-back is two pieces, not one
Founder, on the same question: the agent must be **told** to start a review with `submit_review` —
deriving it does not work, because a review carries far too much structure to be guessed at.

That collides with §4's prompt-injection finding: an instruction of the form "now do X" inside a hook's
deny message is precisely what Sonnet twice refused as *"characteristic of a prompt injection embedded
in tool output"*.

So the two halves must be delivered by different channels:

- **Standing policy — in the seed prompt HyperIdle already authors for the session.** That some actions
  need approval, and that the way to get it is `submit_review`. The model trusts this; it is its own
  instructions.
- **The moment of the block — a terse statement of fact in the hook's deny message.** *This action
  needs approval, rule X.* No instruction, no imperative.

This is the shape that was proven to work first try on Sonnet. Architecture must not collapse these
back into one message.

---

## Pre-existing defects found on the way

Neither is BA2's to fix, and both were found only because this research ran the real binaries:

1. **Return enforcement on opencode has never run** — two independent causes (`--pure` disabling
   plugins, and the provisioned plugin's `export default { setup }` not being opencode's plugin API,
   so `setup` is never called). It appears wired and does nothing. Raised as a separate task.
2. **An opencode agent touching any path outside its sandbox is silently auto-rejected and its turn
   ends** — today, with no permission config at all.

## Constraint this creates for phase 3

Removing `--pure` is **required** for opencode's push-back message, but it also lets the operator's
personal global opencode config and plugins into the sandbox. `XDG_CONFIG_HOME` is the isolating lever
and must be set as part of the same change.
