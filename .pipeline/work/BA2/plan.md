# BA2 — An agent asks, a human clears

## What we need

An agent working on a task decides that something it is about to do deserves a person's agreement
first. It asks — with a review, using the review product we already have. Its session ends. A human
decides. The agent is brought back with the answer and carries on until it decides it is done.

Nothing is intercepted. The agent is simply told, in the context we materialise for it, that it
should request a review for consequential work. It elects to ask, every time.

**Why it matters.** This is how a human stays in control of an agent doing consequential work without
gating everything an agent does. And electing is the point, not a fallback: *"the agent should be
proposing what kind of request he is allowed to do afterwards — even though he could have done it
before. This way we learn what the agent thinks is dangerous or needs a review."* What agents ask
about is the evidence a future interception list would be built from. We do not have that evidence
yet, so we do not build the list.

**Who it is for.** The human who owns the work, in the thread they were already in.

### What success looks like

Done is what the task says done is — the agent decides it is done according to the task and marks it
done. There is no CI gate here and there does not need to be one; plenty of work has no CI as a
concept at all.

Proven by inventing a task locally, letting the agent raise a review, then approving it and declining
it and seeing what happens each way. On all four harnesses.

### The shape

- **The agent is told to ask.** Materialising a session's context appends the instruction that some
  work deserves a human's agreement, and that `submit_review` is how to get it.
- **The agent asks with a review** — the existing product: `submit_review`, review messages,
  artifacts, the nine canvases. Reviews are a formalised way of communicating that includes artifacts
  and examples.
- **A review needs a task.** Realistically anything is a task — anywhere you ask an agent to do
  something, it is a task of some sort.
- **It lands in the thread the human is already in.** If the task came from a thread, the review goes
  back there. If the task has no thread, one is attached to the task. Never the bet's.
- **What is approved is the agent's account** of what it wants to do. Nothing captures what it tried,
  because nothing stopped it.
- **A decline is not final, and it does not decline the task.** A review declines *the solution*, not
  the target of the task. The reasoning goes back and the agent keeps working toward the same goal
  another way.
- **The session ends and is resumed.** The verdict reaches the agent by resuming its own session, not
  by holding one open — a human may take days, and a held process does not survive that.
- **All four harnesses.** Resume is per-harness and each has its own way; the review itself is one MCP
  tool and is the same everywhere.

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
— what it has done, what it wants to do next, why, with real artifacts — and its session ends. The
review lands in the thread the task already has, or in one attached to the task. Then it sits.
Nothing chases it and nothing expires; an unanswered review is human working hygiene, like any other.

When a human approves, the agent's own session is resumed carrying the verdict, and it carries on
until it decides it is done. A decline resumes it too, with the reasoning — what was declined is the
solution, not the task, so the agent keeps working toward the same goal another way.

**Why no interception.** We do not yet know what is worth interrupting, and this is how we find out.
A maintained list would be guessing, and a classifier is a later point. Not intercepting also removes
the whole failure class that comes with it: every harness's interception mechanism fails open in a way
that looks like success, so a gate would have to prove itself alive on every run to be worth anything.
Nothing to disarm is a great deal simpler than something that must be checked.

**Why the session ends rather than waits.** A human may take days. Every harness can hold a tool call
open for minutes, but not for that, and a held process does not survive a restart. Resuming the
agent's own session also means the verdict arrives as a real turn from the human rather than a claim
about one.

**What it leans on.** The review product and its canvases, the session handle each harness reports,
the resume path, and the context materialisation step that writes the sandbox.

**A known gap, accepted for now.** A sandbox is destroyed when its session ends, so a resumed agent
finds its conversation but not the files it made. The rule we want is that the filesystem belongs to
the *work* and survives until the agent says it is done — only an agent actively deciding it is done
should let us delete it. That changes teardown for every session, not just resumed ones, and needs
something to reap the work that is abandoned rather than finished, so it is its own package. BA2 is
proven with the gap in place, and the proof is weaker for it: the loop is shown to close, not that an
agent returns to its own work intact.

**Deliberately simple.** No rule list, no clearance, no permission that burns, nothing to keep in sync
between a gate and a decision. The agent may ask about something nobody would have stopped, and that
is not a defect — it is the signal we are collecting. It stops being enough when the volume of asking
becomes noise, and the answer then is the list, built from what agents actually asked about.
