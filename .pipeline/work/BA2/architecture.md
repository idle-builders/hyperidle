# BA2 — architecture

The technical reading of `plan.md`. It decides nothing about how the program works; where this file
and the plan disagree, the plan wins. Harness behaviour comes from `harness-research/deep-*.md` and
from nowhere else — not from `founder-rulings.md`, which records decisions rather than measurements,
and several of whose rulings turn on harness facts that later measurement refuted.

## What this is now

There is no interception. Nothing hooks a tool call, nothing matches a rule, nothing is blocked. The
agent is told once, in the context materialised for its session, that work deserving a person's
agreement goes through `submit_review` — and it elects to ask.

That deleted 5,452 lines: every per-harness gate writer, the gate store, `/action-check`, the
`action_rules` table and its route, settings surface and UI. All of it is preserved on
`archive/action-gate-interception` at `4b4dbec21` so the follow-up package cherry-picks rather than
rebuilds.

It also deleted a failure class rather than mitigating one. Every harness's interception mechanism
fails open in a way that looks like success — claude reports malformed hook JSON as a successful
allow, codex silently skips a hook whose config hash changed, cursor voids its whole hooks file when
the matcher is written the way its own documentation shows, opencode logs nothing at all when a plugin
fails to import. A gate would have had to prove itself alive on every run to be worth anything.
Nothing to disarm is simpler than something that must be checked.

## Obligations

| From the plan | Implementation obligation | State |
|---|---|---|
| The agent is told to ask | The orientation is appended to the session's context unconditionally — there is no rule list to make it conditional on | **done** |
| The agent asks with a real review | `submit_review` unchanged. It is already one of the three return actions, so calling it satisfies the return gate and the session ends on its own — no new mechanism | **done** |
| A verdict knows what to resume | One row per review recording the session that filed it | **done** |
| The verdict reaches the agent | Durable intent → session request → provisioning → reopen the harness's own session with the verdict as a real user turn | **done, one defect** |
| A decline declines the solution, not the task | The decline resumes with reasoning and marks nothing on the task | **done** |
| All four harnesses | Resume is per-harness; the review itself is one MCP tool and identical everywhere | **one defect** |
| Done is what the task says | No gate, no CI job. Evidence is behavioural | **outstanding** |

## Contracts

**The link.** One row per review: the review message, and the session that filed it. Unique on the
review. It carries nothing else — nothing was blocked, so there is no permission to remember and no
rule or tool to key one to.

**The verdict.** Three outcomes, each a fact a caller may have to act on: *no session filed this
review* (nothing to resume, nothing wrong), *not resumable* (a session filed it but cannot be brought
back — the human answered something that will reach nobody and must be told), and *queued*.

**The resume.** A durable intent whose source is the review verdict, drained into a session request,
provisioned like any other session, with one branch at harness start: reopen the harness's own session
and deliver the verdict as a real user turn.

**The instruction.** A session's opening user turn is what the agent is asked to do; for a task
session that is the task. It is distinct from the assembled context that becomes AGENTS.md, and it is
delivered whole. Conflating the two is what previously handed agents 200 characters of the wrong text.

## The one defect left in the code

`resumeSession` is given the **new** session's sandbox path. cursor-agent binds a chat to the literal
working directory it started in — `~/.cursor/chats/<md5(cwd)>/` — so resuming from anywhere else exits
0, echoes back the correct session id, and runs with no context whatsoever. There is no error and
nothing in the stream. claude finds a session by id from any directory and is unaffected; codex and
opencode need checking against the same question. This is the most likely cause of the unexplained
hang recorded against the earlier attempt, and it is marked in the code at the call site.

The fix is to resume in the session's own directory. That requires the sandbox to still exist when the
human answers, which is a real constraint the plan does not yet address — a sandbox is destroyed at
teardown, and a human may take days. **This is a plan question, not an architecture one**, and it is
the one open item that could change the shape of the work.

## Failure behaviour

A verdict that cannot be delivered is reported to the human who gave it, in the thread they gave it
in. That is the only failure path this change adds, and it exists because the defect it guards against
— a human believing something happened when it did not — is the thing this package is for.

Everything else fails as an ordinary session failure. Per the plan we do not monitor session health
here; that is a general concern we will want anyway.

## Security

This change reaches two surfaces.

**An agent-authored field a human acts on.** A review's title, reasoning and artifacts are written by
a model and rendered to a person who then approves something. The abuse case is a review that
misrepresents what it will do. What the plan approves is the agent's account, and approval grants no
capability the agent did not already have — nothing was blocked, so nothing is unblocked. The blast
radius of a misleading review is a human's attention, not an escalation.

**A state-changing decision endpoint.** The verdict resumes a session. The abuse case is resuming a
session that did not file the review; closed by the link record being written from the session's own
identity at filing time, never from the tool's arguments.

Not touched: credentials, outbound requests, and sandbox isolation from the user's own configuration.
That last is a real exposure and is recorded outside this package.

## Verification

Done is behavioural — the agent decides it is done according to the task and marks it done. The
evidence is the maintainer's: invent a task locally, let the agent raise a review, then approve it once
and decline it once and observe each outcome, on all four harnesses.

Existing lanes cover the parts beneath it and are adequate: unit tests for the instruction passing
through whole, service integration for the link, the verdict path and the resume branch. Two things
those lanes cannot show and the manual check must — that a resumed session carries its context on each
harness, and that an agent told only by its context actually elects to ask.

## Remaining work

1. The cursor resume directory defect, and the sandbox-lifetime question it raises — plan first.
2. The manual proof.

## Documentation this makes false

`docs/process-layer/staged-operation.md` describes the capture mechanism that was deleted long before
this change. It is named here so it is not read as authority.
