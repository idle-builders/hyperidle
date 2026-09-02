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

## What the manual proof found

Six defects, each fixed and each with a test that goes red when the fix is reverted.

1. **`submit_review` only wrote a review when evidence was attached.** With just a title and reasoning
   — the ordinary case for an agent asking BEFORE it acts — it wrote a plain message. Only a `review`
   message renders the card that carries the verdict buttons, so the common ask could never be
   answered, and the link row pointed at a message no verdict could reach. The rare case worked; the
   ordinary one was silently broken.
2. **The review surface crashed on a real review.** `GET /api/reviews/:id` returned `{...payload,
   threadId}`, while the page calls `.find`/`.filter`/`.map` on `artifacts`, `conversation`, `intent`,
   `needs` and `resultKpis` with no guard. Every fixture had them; no agent-filed review did. The
   route now composes the subject from real rows and answers "we have none of that" with an empty
   list, never an invented one.
3. **The sandbox was destroyed while a verdict was owed.** Recorded as an accepted gap about lost
   files; it is actually what hangs the resume. Teardown now keeps the directory when the session
   filed a review, and the resumed session ADOPTS it rather than spawning a fresh one.
4. **Re-materialising context into that directory failed with EACCES.** Context files are chmod-ed to
   0444; the bundle path deletes the tree first, the bundle-less path a resume takes wrote straight
   over them. The human approved and the session crashed before the agent started.
5. **A review filed while the app was open was invisible until a restart.** A message append pushed
   only to `thread:<id>`, which nobody is subscribed to unless they already have that thread open, and
   the pushed list row hardcoded `hasUnresolvedReview: false`.
6. **A resumed session had no calling thread.** The never-silent net had nowhere to post, so a resumed
   agent that ended without returning left the person who approved staring at silence.

Two of these were nearly missed by a passing test. The sandbox-lifetime check first watched the
`workspace.destroy` spy, which removes an already-removed tree — the delete that matters is the `fs.rm`
in the terminal transition. And it first read the tool call off the event stream, which production
never uses: with the MCP bridge open a return action arrives through `onToolCall` instead. Both
versions were green and both did nothing on a real run. The check now asks the `review_sessions` row —
the durable fact — and the test asserts the directory on disk.

## Where each harness stands

| | asks | verdict lands | resumes with context | returns after the verdict |
|---|---|---|---|---|
| claude-code | yes | yes | yes | yes — both approve and decline |
| cursor-agent | sometimes | yes | yes, in the original directory | yes when it asked |
| codex | yes | yes | yes | no — ends without returning |
| opencode | no | — | — | — |

**cursor-agent** files a real review some runs and simply stops on others. Nothing forces it: its
hooks file is the one the research found voided when the matcher is written the way its own docs show.

**codex** asks reliably and its resume genuinely carries context — proved directly against the real
binary: a thread told to remember a word answered with it after `exec resume`. What it does not do is
return on the resumed turn. The human is no longer left in silence (defect 6), but the answer they
get is the never-silent notice, not the agent's.

**opencode** never reaches the loop. Its own log names the cause: `failed to load plugin …
return-signal.ts error="Plugin export is not a function"`. The plugin HyperIdle writes exports an
object with `setup(ctx)`; the installed opencode requires `Plugin = (input, options?) => Promise<Hooks>`.
That is the return gate, not this package, and it is registered separately.

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

Done is behavioural. The evidence is a maintainer's run of the real desktop application against a real
repository, driven through its own screens: invent a task, let the agent raise a review, approve it
once and decline it once, and read what the agent says when it comes back.

On claude-code both halves closed. Approved, the agent returned to its own directory, verified its
commit and marked the task done. Declined, it said *"'Proofground' is off the table"* and asked for a
steer instead of treating the task as refused — the plan's rule that a decline declines the solution,
observed rather than asserted.

Beneath that, the lanes cover the parts a run cannot isolate: the message type, the loader's contract,
the sandbox lifetime on both invocation modes, context re-materialisation, the live push, and the
calling thread on a resume. Every one was sanity-broken.

## Remaining work

Nothing in BA2. Registered outside it: opencode's return-signal plugin, cursor's unreliable forcing,
and three things the run exposed that are nobody's package yet — the team's repository is never
mounted into a session's sandbox, the agent Customize panel swallows a 422 and shows only "Unsaved
changes", and `describeSelectFailure` reports a harness-type mismatch as "all adapters are at
capacity".

## Documentation this makes false

`docs/process-layer/staged-operation.md` describes the capture mechanism that was deleted long before
this change. It is named here so it is not read as authority.
