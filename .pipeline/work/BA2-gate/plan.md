# An agent asks before doing something risky, and a human clears it

**Status:** plan agreed with the founder 2026-08-29, ready to build. Replaces the design in
`../BA2/architecture.md`, which was written against premises the founder has since overturned.

The authority for every decision here is `../BA2/founder-rulings.md` (24 rulings). The facts about
harness behaviour come from `../BA2/harness-research/`, all demonstrated against installed binaries
rather than documentation.

---

## What it does, in plain words

An agent working on a task tries to do something with its own hands — run a command, write a file. A
rule says whether that needs a person first. If it does, the agent is **told it needs approval**, writes
a **review** making its case, and its session ends. A human reads the review and approves or declines.
The verdict comes back to the agent as **a message from that human, in its own session, picked up where
it left off** — and it carries on.

The list of rules is **empty on a fresh install**. Nothing is ever interrupted until someone adds a
rule. The point is not to police agents; it is to learn what agents themselves flag as worth asking
about.

## The five moments

**1. A rule matches.** Rules are ordinary scoped items — **global, a team, or a single agent** — like
everything else scoped in this system. When a session is provisioned we resolve the set that applies to
it: global, plus its agent's team, plus that agent. That set is written into the sandbox as the harness's
own hook configuration.

**2. The agent is pushed back, not stopped.** The hook denies the action and returns **a terse statement
of fact naming the rule**. Nothing more. The instruction for what to do next lives in the seed prompt
the session already carries — *some actions need approval; ask with `submit_review`* — because an
imperative in the deny message is what a model once refused as a prompt injection (ruling 6).

**3. The agent files a review, and the session ends.** `submit_review` is the existing tool: it posts a
review into the task's thread with the agent's own case — what it did, what it wants to do, and real
artifacts. The session ends normally. Nothing is held open.

**4. A human decides.** In the review surface that already exists, now reachable and honest after the
five merged changes.

**5. The verdict resumes the session.** We rewrite the sandbox's hook configuration to drop the cleared
rule, then resume the agent's **own** session with the verdict as **a user message**. It retries, the
hook no longer matches, the action runs, and the agent decides for itself when the work is done.

Declining resumes the session too, carrying the reasoning back. The rule stays in force, so the action
stays blocked, and the agent may argue again.

## Why it is shaped this way

**Why the verdict is a user message, not a tool result or a transcript entry.** An earlier design ended
the session and built a *new* one carrying a fabricated transcript that asserted *"a human reviewed and
approved your request."* A real cursor-agent refused to act on it, correctly: nothing authenticated the
claim. A genuine user turn in a genuinely resumed session is not a claim *about* a human — it is the
human. Given the identical sentence through that channel, the same model reasoned *"that got approved,
so I'll try it once more."*

**Why the session ends rather than waits.** A blocking tool call was the simpler idea and works on two
harnesses. It cannot work on the other two: codex enforces a wall clock that progress notifications do
not reset, and cursor-agent caps every tool call at 60 seconds and sends no progress token, so keepalive
is structurally impossible there. Ruling 4 requires all four.

**Why the hook configuration changes rather than a database clearance.** The permission is "this action,
once, for this piece of work". Rewriting the sandbox's own hook config before resuming expresses that
directly, expires naturally when the work ends, and needs no table, no state machine and no persistence.

**Why there is no liveness monitoring.** A dead hook fails open silently on three of four harnesses, and
an earlier design grew a whole heartbeat mechanism plus a settings display to notice it. The founder
judged that over-engineered (ruling 20). Accepted, and the residual risk is recorded rather than solved.

## What has to be built

- **Rules as scoped items** — the store, and resolution by union at provisioning.
- **A settings surface** to add, see and remove them, showing each rule's scope.
- **A hook per harness** that asks HyperIdle whether an action is allowed, and denies with the rule's
  name. The decision is ours, not the hook config's: codex can only match on tool names, never command
  text, so every rule is evaluated in our own code.
- **Capturing the harness's session id** so we can resume it. This is the genuinely new piece — the repo
  has none of it, and currently throws codex's thread id away on arrival. It is about one line per
  harness; on claude we can name the session going in rather than capture it.
- **Resuming with the verdict**, per harness, using the invocations in
  `../BA2/harness-research/session-continuation.md`.
- **Rewriting the hook config** before the resume, to drop the cleared rule.

## What gets deleted

The old capture machinery, and everything the abandoned two-session design grew: the clearance table and
its state machine, the compare-and-swap spend, the retry and abandon paths, the liveness heartbeat, the
`review_approved` session-request kind and its check constraint, `resolveReviewReengagementRequest`, and
`buildResumeTranscript`. **Three competing shapes for this moment are live in the repo today** — that is
what a design changing three times leaves behind, and the cleanup is part of this work, not after it.

`docs/process-layer/staged-operation.md` still documents the mechanism the founder rejected and must be
rewritten from scratch.

## Two things that will bite, both measured

**cursor-agent fails silently on a wrong resume.** The other three fail loudly on a bad session id or a
mismatched working directory. cursor-agent exits 0, echoes back the id you asked for, and runs a
**context-free** session — which is exactly the original failure wearing a success code. A positive check
that the resumed session is the one we meant is required, not optional.

**The verdict's wording is load-bearing on cursor-agent.** A bare *"Approved. Go ahead."* complied in
three runs of six — objecting not from suspicion but on mechanism: *"a chat message saying 'approved'
isn't the same as the formal review approval mechanism the policy requires."* Naming the gate fact in the
verdict took it to eight of eight. Per ruling 16 the wording is ours to tune, and a non-complying model
is a finding to characterise rather than a failure to route around.

## How it will be proven

Every acceptance criterion below is demonstrated against **real harness binaries**, not stubs — this
repo's standard, and the thing that caught four defects in this work that every other test passed.

1. With no rules, an agent does consequential work uninterrupted and no review is created.
2. With a rule, a matching action is blocked and the agent is told which rule — **on all four harnesses**.
3. The agent files a review carrying its real case, and it reaches the human in the task's thread.
4. Approving resumes that agent's own session, the action then succeeds, and the agent finishes.
5. Declining resumes it too, and the action stays blocked.
6. An action named in a review that was never blocked does not become blocked.
7. A resume that targets the wrong session is detected rather than proceeding context-free.

## Still open

- **How "once" is enforced within a resumed session.** Dropping the rule from the config clears it for
  that session; whether the agent may then repeat the action, or the shim re-arms after one use, is a
  detail to settle when built.
- **Whether a session with no task can have rules at all.** A review needs a task (ruling 6 of the
  interview); what a rule means for a task-free session is unsettled.

## The two open questions, settled

### How "once" is enforced

The founder ruled the clearance is one time, "but again only if it blocked in the first place."

**The clearance consumes itself.** When the verdict resumes the session we rewrite the sandbox's hook
config, and the entry we write is a single-use one: the shim, on matching it, allows the action and
removes the entry from the file in the same step. The agent retries and succeeds. If it attempts the
same action again later in that session, the entry is gone, the original rule matches again, and it is
pushed back again — which is exactly "once, and only because it blocked."

This needs no table, no expiry, and no bookkeeping outside the sandbox. The clearance lives and dies with
the piece of work, because the file does.

### Whether a task-free session can have rules

**The premise this rested on is wrong, and the schema says so explicitly.** Ruling 6 recorded that a
review needs a task, on the founder's reading that "realistically anything is a task." It is not:
`sessions.taskId` is nullable, and the comment on the column states the reason outright — assistant,
routine, knowledge and decomposition runs "are real sessions without fabricated task rows." Making them
task-free was a deliberate choice not to fabricate data, and it agrees with the standing no-fabrication
rule.

So four session kinds run without a task, and they do not split the way the ruling assumed:

- **Assistant** sessions are the interactive kind — a human is in the conversation. An agent that needs
  permission there should ask in the thread. It does not need this machinery, and a review would be a
  slower way to ask a question of someone already listening.
- **Routine, knowledge and decomposition** sessions run **unattended**. These are the sessions this gate
  exists for, and they are precisely the ones with no task to hang a review on.

That is a real gap, not a detail to settle while building, so it is flagged rather than decided. The
recommendation: let a review hang off the **session**, with the task as an optional stronger anchor when
one exists. A session always exists, always has an agent and an owner, and the review surfaces already
resolve a thread to post back into. Ruling 6's instinct — that a review needs somewhere to belong — holds;
"task" was the wrong noun for it.

**Nothing else is blocked by this.** Task-backed sessions are the majority path and the whole gate can be
built, tested and proven against them. This decides only how far it reaches afterwards.

---

## Correction after the first build attempt — a resumed session is a real session

The first attempt at the loop was abandoned. Its reviewer found fourteen blocking problems, and the root
of most of them was one under-specification in this plan.

**What the plan said:** "resume the agent's own session with the verdict as a user message."

**What it left open:** *what a resumed session is*. The first attempt read it as "spawn the harness again
with resume arguments" — a detached process fired from teardown, with a side store mapping session ids to
resume functions.

**Why that cannot work.** The provisioner opens the MCP bridge, then runs the session inside a
`try/finally` that closes it. A resume fired after that runs against a **dead bridge**: the resumed agent
has no HyperIdle tools at all, and the hook's `/action-check` call gets a 401 — which a deny-by-default
script reads as "block everything". The resumed agent was also an orphan: its stream was never drained,
its output never reached a thread, and nothing ever stopped it. It ran invisibly.

**The correction.** A resumed session is not a spawn — it is **a session**, and it goes through the same
provisioning flow as any other. Everything that flow already does is what a resumed session needs: open
the bridge, drain the stream, account tokens, post output back to the thread, tear down once. The only
difference is one branch at the point the harness is started:

- a new session calls `startSession` with a composed prompt;
- a resumed session calls `resumeSession` with the harness's native session id and the verdict as its
  user message.

Everything before and after that branch is unchanged. This is both more faithful to the intent and *less*
code than the detached-spawn approach it replaces — no side store, no separate lifecycle, no second
teardown path.

**Two further findings from that attempt, easy to rebuild wrongly:**

- **The clearance is keyed to the action, not to "the next tool call".** The first attempt let the resumed
  session's first call — a harmless read — consume the one-time pass, so the action that was actually
  cleared got denied again. Single-use means single-use *for the cleared action*.
- **A verdict on an ordinary review must not mint a gate clearance.** The first attempt registered on
  every `submit_review`, so approving a normal design review granted a bypass. Only a review that a gate
  actually caused may clear anything.

---

## The per-harness architecture, measured

Every row below was proven against the installed binary. Details and the commands that produced them are
in `../BA2/harness-research/interception-*.md`.

### Where the gate lives, per harness

| Harness | Mechanism | Where it is written | How a call is blocked | How the reason reaches the model |
|---|---|---|---|---|
| **claude-code** 2.1.247 | `PreToolUse` command hook | `--settings` (file or inline JSON) + `--setting-sources user` — **nothing in the workspace, nothing in `~/.claude`** | `permissionDecision: "deny"`, or **`"defer"`** (see below) | `permissionDecisionReason`, verbatim |
| **codex** 0.150.1 | `PreToolUse` hook **and** execpolicy `.rules` | `$CODEX_HOME/hooks.json` and `$CODEX_HOME/rules/*.rules` | hook: `permissionDecision: "deny"` or exit 2 + stderr · rules: `decision="forbidden"` | reason verbatim · rule `justification` |
| **cursor-agent** 2026.08.25 | `preToolUse` command hook | `<sandbox>/.cursor/hooks.json` (project level) | `{"permission":"deny","user_message":"…"}` | `user_message` (**`agent_message` is silently dropped on the CLI path**) |
| **opencode** 1.18.x | `OPENCODE_PERMISSION` env var — **no plugin needed** | process env; JSON merged into resolved config | config `deny` | fixed prose + the matched rule pattern (the plugin route gives exact text, at the cost of a plugin) |

codex's `PreToolUse` is **not** a Claude-ism: codex has deliberately adopted the Claude-compatible wire
format. cursor and opencode have entirely their own vocabularies.

### What is true on every harness

- **The matcher only sees the tool NAME.** Verified separately on claude, codex and cursor. Command text
  must be discriminated inside our own script — which is what we wanted anyway, since the decision is ours.
- **The mutable deny set must live in a sidecar data file, never in the hook config.** On codex, editing
  `hooks.json` invalidates its trusted hash and the hook is then skipped **with zero output**. On cursor,
  registration freezes at process start but the script re-runs per call — so a sidecar makes the gate live
  mid-session, which is better than the per-run behaviour this plan asked for.
- **Fail-open is the default nearly everywhere**, and it is silent. codex hooks fail open on error,
  malformed JSON or timeout. cursor fails open unless `"failClosed": true` is set per entry. An opencode
  plugin that fails to load is fail-open, and its only signal is a stderr line the adapter currently
  discards. Every gate must be fail-closed by construction and proven so.

### The one place a harness is better than the plan

**claude has `permissionDecision: "defer"`** — present in 2.1.247, absent from the binary's own embedded
docs. The run stops with `stop_reason: "tool_deferred"` and hands back the exact pending call; resuming
with **no prompt** re-runs the gate on that stored call and executes it, in one turn, with no model
decision involved.

That is strictly better than persuading the agent to retry, and it removes the resume-compliance risk on
claude rather than mitigating it — approval never enters the conversation as text a model might distrust.
One model complied while explicitly objecting that in-band approval was unverifiable; it was right to.

The other three have no equivalent, so they keep the design in this plan: the verdict resumes the session
as a user message and the agent retries. Measured compliance with wording that names the gate fact was
**5 of 5** on claude and **8 of 8** on cursor-agent. Same product behaviour, different mechanism — which
is what a per-harness design means.

### Corrections to what this repo believed

- **`--pure` is pure downside for opencode.** It does exactly one thing: empties the plugin origin list,
  silently killing the sandbox's own plugin. It provides **zero** config isolation — the user's global MCP
  server still resolves through it. `XDG_CONFIG_HOME=<sandbox>/.xdg_config` is the real isolation lever.
- **Workspace trust is not required on claude** in print mode; the `enableAllProjectMcpServers` rationale
  does not hold for 2.1.247.
- **codex is not limited to tool names** — the hook body receives `tool_input.command`, and `.rules`
  matches command text natively.
- **cursor-agent also reads `<cwd>/.claude/settings.json`** and maps its `PreToolUse` hooks onto its own.
  HyperIdle's own repo settings could fire inside a cursor session. Audit before shipping.

### An honest limit, worth stating in the product

`sh -c 'git push origin main'` defeats a name-matched deny on claude, and `bash -lc '…'` slips past
codex's `.rules` (though its hook catches that form). **This gates a cooperative agent, not a determined
one.** That is the right shape for a collaboration checkpoint and consistent with the ethos — security is
earned, not preemptive — but it should be said plainly rather than implied.

### Operational finding, unrelated to the gate

`opencode run` intermittently stalls at `message=init` for 150–300s, reproducing with no plugin, no deny
config, a fresh data dir and healthy network; identical invocations succeed in 20–30s at other times.
Cause unidentified. The harness needs a hard per-run timeout regardless of what the gate does.
