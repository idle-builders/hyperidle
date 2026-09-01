# An agent asks before doing something risky, and a human clears it

**Status:** design settled and half built. Every harness mechanism below was proven against its installed
binary.

## Where this stands

**Merged.** The old approval machinery deleted (#529, −8,074 lines). Scoped action rules with their
settings surface (#532). Harness session-handle capture and resume for all four harnesses (#533). Stale
documentation corrected (#534). Four earlier pieces fixed production bugs no test had caught — codex
sessions dying at startup, cursor-agent never reporting token usage, all nine review canvases showing
invented content, and a human unable to reach or approve a review (#521–#525).

**Open, proven, not yet a feature — PR #542.** The **deny half**: a rule matches, the action is blocked,
the agent is told which rule. Demonstrated against all four real binaries. It is a safe merge but does
nothing for a user yet, for three reasons:

- The loop does not close. Criteria 3–7 below are unbuilt: no review is filed, no verdict returns, no
  session resumes.
- **The desktop application does not wire `actionRulesPort`**, so the gate cannot fire there at all. Only
  `remote-server` wires it.
- It is not inert either: it always injects `XDG_CONFIG_HOME` for opencode (replacing `--pure`) and
  defaults `OPENCODE_PERMISSION` to allow-all when no gate is present. That changes every opencode
  session, gated or not.

**Built since, on the same branch.** The return half, end to end in code:

- `sessions.harness_session_id` — the harness's own id, persisted after the stream drains, because
  without it there is nothing to resume. Null when the harness reported none: that session genuinely
  cannot be resumed, and the verdict path says so.
- `gate_reviews` — the record that a review and a block are the same event. `submit_review` writes one
  only when the gate is holding a denial against that session, so an ordinary review clears nothing.
- A clearance keyed to the rule **and** the tool, spent by that action alone.
- `session_resume`, a sixth intent kind, so the verdict travels the same durable queue as every other
  handoff from a domain write to the agent runtime.
- `gate_resume`, a session source of its own: it composes no prompt and assembles no context, and a
  request row claiming otherwise would be a lie.
- The provisioner branch: reopen the harness session, deliver the verdict as a user turn, clear first.
- The failure path: when the resume cannot be prepared, the human who approved is told in their thread.

**Still to build.** The proof. Criteria 3–7 are code without evidence — no real-binary test yet drives
an agent from block, through filing a review, to a human's verdict and a completed action. Plus the
desktop wiring check, and the cursor-agent fail-closed assertion, which is still a file-shape check.

**Known weakness in the current proof.** The fail-closed check genuinely runs the script against an
unreachable server for claude and codex. For cursor-agent and opencode it only asserts the file is
syntactically valid and contains deny logic — that is a file-shape check, not a fail-closed proof, and it
is exactly the kind of assertion that stayed green while a Claude-shaped hook sat unread in cursor's
config.

This document describes the design as it now stands. It was rewritten from a version that had grown by
appending corrections, which left the reader reconstructing the current shape from its own history — the
prose form of the problem this work package deleted from the codebase. Git history keeps what changed
and why.

- **What we are building and why:** `../BA2/interview-2026-08-25.md` — the founder interview.
- **The authority for every decision:** `../BA2/founder-rulings.md` — 25 rulings.
- **How each harness actually behaves:** `../BA2/harness-research/interception-*.md` and
  `session-continuation.md` — measured against real binaries, never inferred from documentation.

---

## What it does, in plain words

An agent working on a task tries to do something with its own hands — run a command, write a file. A rule
says whether that needs a person first. If it does, the agent is **told**, writes a **review** making its
case, and its session ends. A human reads the review and approves or declines. The verdict reaches the
agent **in its own session, picked up where it left off**, and it carries on.

The list of rules is **empty on a fresh install**. Nothing is ever interrupted until someone adds a rule.
The point is not to police agents; it is to learn what agents themselves flag as worth asking about.

## The five moments

**1. A rule matches.** Rules are ordinary scoped items — **global, a team, or a single agent**. At
provisioning we resolve the set that applies to a session: global, plus its agent's team, plus that agent.
That set is written into the sandbox in the shape that harness reads.

**2. The agent is pushed back, not stopped.** The gate denies the action and returns **a terse statement
of fact naming the rule**. Nothing more. The instruction for what to do next lives in the seed prompt —
*some actions need approval; ask with `submit_review`* — because an imperative in a deny message is what a
model once refused as prompt injection (ruling 6).

**3. The agent files a review, and the session ends.** `submit_review` already exists: it posts a review
into the task's thread with the agent's own case — what it did, what it wants to do, and real artifacts.
Nothing is held open.

**4. A human decides**, in the review surface that now works.

**5. The verdict returns the agent to its work.** How, differs by harness, and one of them is better than
the rest:

**All four** resume the agent's own session with the verdict as **a user message**, having first cleared
the rule for that one action. The agent retries, the gate no longer matches, the action runs.

**`defer` is researched, rejected for now, and worth revisiting** (founder, 2026-09-01). claude has a
`permissionDecision: "defer"` that would be better on paper: the run stops with
`stop_reason: "tool_deferred"`, and resuming with no prompt re-runs the gate on the stored call and
executes it — no model decision, so approval never has to be believed. It cannot be used at the first
block, because **`permissionDecisionReason` on a defer is not shown to the model** (there is no
tool_result — `harness-research/interception-claude-code.md`). The agent would never learn it was
blocked, so it could not write the review making its case, which is moment 3 and the whole "an agent
asks" half of this package. Revisit it as a claude-only refinement of the RETURN leg once the uniform
loop is proven.

Declining also resumes, carrying the reasoning back. The rule stays in force, so the action stays blocked,
and the agent may argue again.

## Why it is shaped this way

**Why the verdict is a user message and not a fabricated transcript.** An earlier design ended the session
and built a *new* one carrying an assertion that "a human reviewed and approved your request". A real
cursor-agent refused to act on it, correctly — nothing authenticated the claim. A genuine user turn in a
genuinely resumed session is not a claim *about* a human; it is the human. claude's `defer` is better
still, because the approval never has to be believed.

**Why the session ends rather than waits.** A blocking tool call works on two harnesses and cannot work on
the other two: codex enforces a wall clock that progress notifications do not reset, and cursor-agent caps
every tool call at 60 seconds with no progress token. Ruling 4 requires all four.

**Why a resumed session goes through provisioning.** A resumed session **is a session**. It takes the same
provisioning path as any other, which already opens the MCP bridge, drains the stream, accounts tokens,
posts output back to the thread, and tears down once. The only difference is one branch where the harness
starts: a new session composes a prompt; a resumed one passes its native session id and the verdict.

An earlier attempt fired the resume from teardown as a detached spawn. It ran against a **closed bridge** —
no HyperIdle tools, and a 401 that a deny-by-default script reads as "block everything" — with its stream
undrained and its output never reaching a thread. It ran invisibly.

**Why the clearance is a config change, not a database row.** The permission is "this action, once, for
this piece of work". Rewriting the sandbox's own gate state expresses that directly and expires naturally
when the work ends. No table, no state machine, no persistence.

**Why there is no liveness monitoring.** A dead gate fails open silently on most harnesses, and an earlier
design grew a heartbeat plus a settings display to notice it. The founder judged that over-engineered
(ruling 20). The residual risk is recorded rather than solved.

---

## The per-harness architecture, measured

Harness features are files, and every harness has its own vocabulary. Writing one harness's shape into
another fails **silently** — the file is written, nothing errors, the gate never runs. That is exactly how
this work package lost a cycle, and it is now a standing rule in `.claude/rules/architecture.md`.

| Harness | Mechanism | Where it is written | How a call is blocked | How the reason reaches the model |
|---|---|---|---|---|
| **claude-code** 2.1.247 | `PreToolUse` command hook | `--settings` (file or inline) + `--setting-sources user` — **nothing in the workspace, nothing in `~/.claude`** | `permissionDecision: "deny"`, or **`"defer"`** | `permissionDecisionReason`, verbatim |
| **codex** 0.150.1 | `PreToolUse` hook **over** execpolicy `.rules` | `$CODEX_HOME/hooks.json`, `$CODEX_HOME/rules/*.rules` | hook: `permissionDecision: "deny"` or exit 2 + stderr · rules: `decision="forbidden"` | reason verbatim · rule `justification` |
| **cursor-agent** 2026.08.25 | `preToolUse` command hook | `<sandbox>/.cursor/hooks.json` (project level) | `{"permission":"deny","user_message":"…"}` with `"failClosed": true` | `user_message` — **`agent_message` is silently dropped on the CLI path** |
| **opencode** 1.18.x | plugin hook `tool.execute.before` **over** `OPENCODE_PERMISSION` | `<sandbox>/.opencode/plugin/`; drop `--pure`, isolate with `XDG_CONFIG_HOME` | the handler **throws** | the thrown message, verbatim |

codex's `PreToolUse` is **not** a Claude-ism — codex deliberately adopted the Claude-compatible wire
format. cursor and opencode have entirely their own.

**Every harness gates through a hook that asks HyperIdle, and our code decides.** Two harnesses also get a
static layer beneath that hook — codex's `.rules` and opencode's `OPENCODE_PERMISSION` — which fails
closed if the hook never loads. Neither static layer is the primary mechanism: a config can only match a
tool name, and cannot name the rule in the refusal.

### What holds on every harness

- **A matcher only ever sees the tool NAME.** Verified separately on claude, codex and cursor. Command
  text is discriminated inside our own code — which is where the decision belongs anyway.
- **The mutable deny set lives in a sidecar data file, never in the gate config.** Editing codex's
  `hooks.json` invalidates its trusted hash and the hook is then skipped **with zero output**. cursor
  freezes registration at process start but re-runs the script per call — so a sidecar makes the gate live
  *mid-session*, better than the per-run behaviour this plan originally asked for.
- **Fail-open is the silent default.** codex hooks fail open on error, malformed JSON or timeout. cursor
  fails open unless `failClosed` is set per entry. An opencode plugin that fails to load is fail-open, and
  its only signal is a stderr line the adapter currently discards. Every gate is fail-closed by
  construction, and proven so.

### Traps that cost a cycle if rediscovered

- **cursor-agent also reads `<cwd>/.claude/settings.json`** and maps its `PreToolUse` hooks onto its own.
  HyperIdle's own repo settings could fire inside a cursor session. Audit before shipping.
- **opencode puts tool args on the SECOND handler parameter** (`output.args`); the first carries only
  `{ tool, sessionID, callID }`. The previous implementation read `input.input` and so always received
  `{}` — a gate that cannot see the command allows everything, while looking like it works.
- **cursor refuses symlinked config paths silently.** Write real files into the sandbox.
- **A resumed claude run emits two `result` frames**, the first empty, and `tool_deferred` always carries
  an empty result. Read the last frame, or use `--output-format json`.
- **A resumed run must use the same permission mode** as the run it resumes, or the auto-resumed call dies
  at "This command requires approval".
- **`opencode run` intermittently stalls at `init` for 150–300s**, reproducing with no plugin and no gate.
  Cause unidentified; the harness needs a hard per-run timeout regardless.

---

## What has to be built

Rules as scoped items and the settings surface are **already merged**, as is session-handle capture and
resume for all four harnesses. What remains:

- **A gate per harness**, in that harness's own shape, asking HyperIdle and denying with the rule's name.
- **The sidecar deny set** each gate reads per call, so clearance takes effect without touching gate config.
- **The `/action-check` route** the gates call — already built, keep it.
- **The verdict path:** a review a gate caused, approved, resumes that session through provisioning with
  the rule cleared. `defer` on claude; verdict-as-user-message on the other three.
- **Cleanup, as part of this work and not after it** — see below.

### Two rules the build must honour

- **The clearance is keyed to the ACTION, not to "the next tool call".** An earlier attempt let the resumed
  session's first call — a harmless read — consume the one-time pass, so the action that was actually
  cleared got denied again. Single-use means single-use *for the cleared action*.
- **Only a review a gate actually caused may clear anything.** An earlier attempt registered on every
  `submit_review`, so approving an ordinary design review granted a bypass. The `gate_reviews` record
  already built is the right answer; keep it.

## What was abandoned, and is gone

Two earlier attempts at this loop were abandoned and **deleted** — no archive branch, no revivable copy.
They are described here only so the same shapes are not rebuilt:

- **A detached-spawn resume**, fired from teardown with a side store of resume functions. It ran against a
  closed MCP bridge and produced an invisible orphan session.
- **Claude's hook shape written into every harness.** codex, cursor-agent and opencode each ignored a file
  they never read, and the silent failures were misread as harness limitations.

Both are superseded by the measured per-harness contracts above. The `--pure` flag went with them — it
disables the sandbox's own plugin and provides no isolation at all.

The gate exists in exactly **one** shape per harness. No compatibility path, no second mechanism kept
"just in case".

## How it will be proven

Against **real harness binaries**, never stubs, gated with `requireHarness` so a missing harness hard-fails
rather than skipping to green. `it.todo` is not proof. A criterion that skipped on an auth probe is not
proven, and must be reported as skipped.

1. With no rules, an agent does consequential work uninterrupted and no review is created.
2. With a rule, a matching action is blocked and the agent is told which rule — **on all four harnesses**.
3. The agent files a review carrying its real case, and it reaches the human in the task's thread.
4. Approving returns the agent to its work, the action succeeds, and the agent finishes.
5. Declining also returns it, and the action stays blocked.
6. An action named in a review that was never blocked does not become blocked.
7. A resume that targets the wrong session is detected rather than proceeding context-free.

Measured compliance for the user-message route, with wording that names the gate fact: **5 of 5** on
claude, **8 of 8** on cursor-agent. A bare "Approved. Go ahead." managed 3 of 6 — one model objecting,
correctly, that a chat message is not the approval mechanism the policy requires. Per ruling 16 the wording
is ours to tune, and a non-complying model is a finding to characterise, not a failure to route around.

## An honest limit, worth stating in the product

`sh -c 'git push origin main'` defeats a name-matched deny on claude, and `bash -lc '…'` slips past codex's
`.rules` — though its hook catches that form. **This gates a cooperative agent, not a determined one.**
That is the right shape for a collaboration checkpoint and consistent with the ethos — security is earned,
never preemptive — but it should be said plainly rather than implied.

## A review belongs to a task — and that is not in question

Ruling 6 stands: a review needs a task. An earlier draft of this plan reopened it, reasoning from the fact
that `sessions.taskId` is nullable that there must be sessions the gate could never serve. That was wrong,
and it came from confusing **how a session starts** with **what the agent does in it**.

A session can be woken by any of the many routine trigger events, or by a mention in a conversation. That
is only the trigger. **When the agent goes and makes something, that is a task** — `create_task` exists
for exactly this. A session starts without a task because it has not done anything yet; by the time an
agent is about to run a consequential command, it is doing work, and work is a task.

So there is no design question here. There is one **fact to verify while building**: `submit_review` reads
`ctx.taskId` and errors if it is missing, so the gate needs that populated by the time the agent asks. If a
routine-triggered session that creates a task carries that task id in its context, nothing needs doing. If
it does not, that is a small wiring fix — not a question about what a review belongs to.
