# BA2 — An agent asks, a human clears

## What we need

An agent working on a task decides that something it is about to do deserves a person's agreement
first. It asks — with a review, using the review product we already have. Its session ends. A human
decides. The agent is brought back with the answer and carries on until it decides it is done.

Nothing is intercepted. The agent is simply told, in the context we materialise for it, that it
should request a review for consequential work. It elects to ask, every time.

**Why it matters.** A human stays in control of consequential work without gating everything an agent
does. Electing is the point: *"this way we learn what the agent thinks is dangerous or needs a
review."* What agents ask about is the evidence a future interception list is built from.

**Who it is for.** The human who owns the work, in the thread they were already in.
### What success looks like

Done is what the task says done is — the agent decides it is done and marks it done. There is no CI
gate here; plenty of work has no CI as a concept at all.

Proven by inventing a task locally, letting the agent raise a review, then approving it and declining
it and seeing what happens each way, on all four harnesses.

### The shape

- **The agent is told to ask.** Materialising a session's context appends the instruction that some
  work deserves a human's agreement, and that `submit_review` is how to get it.
- **The agent asks with a review** — the existing product: `submit_review`, review messages,
  artifacts, the nine canvases.
- **A review needs a task.** Anywhere you ask an agent to do something, it is a task of some sort.
- **It lands in the thread the human is already in.** If the task came from a thread, the review goes
  back there. If the task has no thread, one is attached to the task. Never the bet's.
- **What is approved is the agent's account** of what it wants to do; nothing stopped it.
- **A decline declines the solution, not the task.** The reasoning goes back and the agent keeps
  working toward the same goal another way.
- **The session ends and is resumed.** The verdict reaches the agent by resuming its own session.
- **All four harnesses.** Resume is per-harness; the review itself is one MCP tool everywhere.

### Not in this

- **Interception of any kind.** No hooks, no permission list, no blocking a tool call. Registered as
  a follow-up for when we know what is actually worth interrupting.
- Reworking the review screen's layout.
- A classifier.
- Anything that is not BA2 core.

## How it works

When a session's context is materialised, we append to it that some work deserves a person's
agreement before it happens, and that the way to get it is `submit_review`. That is the whole of the
push-back: the agent carries the instruction rather than meeting a wall.

The agent works. When it judges something worth asking about, it calls `submit_review` with its case
and its session ends. The review lands in the thread the task already has, or in one attached to the
task. Then it sits: nothing chases it and nothing expires — an unanswered review is human hygiene.

When a human approves, the agent's own session is resumed carrying the verdict, and it carries on
until it decides it is done. A decline resumes it too, with the reasoning.

**Why no interception.** We do not yet know what is worth interrupting, and this is how we find out.
It also removes a failure class: every harness's interception fails open in a way that looks like
success, so a gate would have to prove itself alive on every run. Nothing to disarm is simpler.

**Why the session ends rather than waits.** A human may take days; a held process does not survive
that. Resuming the agent's own session also means the verdict arrives as a real turn from the human.

**The filesystem belongs to the work.** A session that ends by filing a review is waiting, not
finished, so its directory survives until the agent is brought back. First recorded as an accepted
gap about lost files, which was wrong about the cost: deleting the directory hangs the resume — the
harness starts in a directory that no longer exists and never fails. Reaping abandoned work is
BA12.

**Deliberately simple.** No rule list, no clearance, nothing to keep in sync between a gate and a
decision. An agent asking about something nobody would have stopped is the signal we are collecting;
when that becomes noise, the answer is the list, built from what agents actually asked about.

## Where it stands

Proven on the packaged desktop app against a real repository, through its own screens. The six
defects the run found between an agent asking and a human answering are each fixed, with a test that
goes red when reverted, and each is explained by an `@lore` beside the code it constrains.

| | asks | verdict lands | resumes with context | returns after the verdict |
|---|---|---|---|---|
| claude-code | yes | yes | yes | yes — approve and decline |
| cursor-agent | sometimes | yes | yes, in its original directory | yes when it asked |
| codex | yes | yes | yes, proved against the binary | no — ends without returning |
| opencode | no | — | — | — |

Declined on claude-code, the agent said *"'Proofground' is off the table"* and asked for a steer.
**Deferred, each its own package.** The return gate is why cursor sometimes stops and opencode never
starts: its opencode plugin has never loaded, and it exists only because the protocol discards the
agent's final message (BA13). Token usage and tool calls are counted from inside the session (BA15).
A team's repository never reaches the sandbox (BA14). Interception,
when there is evidence of what is worth interrupting, seeded from `archive/action-gate-interception`
(BA11). The 268-claim harness research this design rests on lives on that branch too.

**Made false by this:** `docs/process-layer/staged-operation.md` describes a long-deleted mechanism.
