# BA2 — Founder interview, 2026-08-25

The record of the conversation that replaced this work package's concept. **This is the most
authoritative source for BA2.** Where `plan.md`, `requirements.md`, any architecture, or anything in
`docs/` disagrees with this file, this file wins.

## How it started

An architecture had been produced and taken through three independent critique rounds. At the concept
gate the founder rejected **both the architecture and the plan** — not the execution, the premise —
and asked for an interview instead.

## What the founder said, in substance

**On scope.** Reviews should not be bet-scoped. Tasks will exist without bets, so a bet cannot be the
anchor. A review is part of a thread and a task, or even a session. *"If anything it's the task, not
the bet."*

**On where a review lands.** Most reviews probably have their own thread, because it is an agent
reaching out to a human after taking over a task. If the task came from a thread, the review goes back
into that thread. If the task has no thread yet, the review attaches one. *"Essentially we pick the
best available thread that feels most normal to the human, which is the thread where we anyhow already
were."*

**On classifying danger.** *"How we classify what is bad needs some flexibility. These days no one
maintains such lists anymore — if anything classifiers have become the thing."* But not yet: for now a
permission list, intentionally empty at the start. On a fresh system the agent always self-elects; as
the system gets better, a list of what to actually interrupt accumulates. A classifier is a later
point.

**On the real starting point.** *"There is an agent who wants to do something destructive and wants an
approval, so the agent should be proposing what kind of request he is allowed to do afterwards — even
though he could have done it before. This way we learn what the agent thinks is dangerous or needs a
review."* Reviews are a formalized way of communication which includes artifacts and examples.

**On not over-building.** *"Let's not build a gigantic machinery around blocking commands. This in many
cases won't be about a single command and more about the next action that will be performed."*

## The questions, and the answers

**Does anything ever stop the agent?** Yes, sometimes — but stopping does not create a review, because
a review requires the agent to produce a great deal. The stop is a push-back: *that is not something
you do, you need an approval for this, and you can get it via a review.* Permission lists exist in all
kinds of harnesses; what is probably needed here is a hook, or something like one, that intercepts the
harness. A classifier may come later. For now the list is empty, so a fresh system means the agent
always self-elects.

**What did the human approve?** The result the agent proposed in the review. Attached to it, some
actions (*"i.e. merge to bring the dashboard live"*) become free for the agent to perform — whatever
hook there was stops interrupting when the agent tries it.

**Does the permission burn on use?** One time. And only if the action was blocked in the first place:
an agent may raise a review proposing an action it was never blocked from doing, and that must not
start blocking it afterwards.

**Can a review exist without a task?** No. A review needs a task. *"Realistically anything is a task.
Anywhere you ask the agent to do something it's a task of some sort."*

**Where does the human meet it?** If the task originates from a thread, the review goes back into that
thread — the task already has a thread and the review uses it. If the task has no thread yet, the
review attaches one to the task and it surfaces to the user.

**How exact must the match be?** Same kind, not the same command. The founder noted that on approval
the command could even be executed directly via hooks, and if it fails the agent will fix itself —
*"that's also where you see we approved the action, not the exact command."*

**End of the work or the middle?** A review can also be mid-session, so bringing the agent back and
letting it decide when the end is, is the safer and more natural bet. Direct execution was therefore
not taken as the primary mechanism.

**How does the list get its first entry?** Somewhere in settings, from a UI perspective. The founder
flagged the harder question as **which service owns the permission list** — that needs a clean
structure.

**Whose list is it?** Per team.

**What must the agent produce for a review?** *"Go look at the review — it's an entire huge product
with a lot of things and a massive MCP tools thing. It's a huge user experience."* Research confirmed:
`submit_review`, review messages, review artifacts, and nine purpose-built canvases. This work rides
that product.

**Does the capture concept survive?** *"Capture concept makes no sense."* Nothing records the attempted
call verbatim. What a human approves is the agent's account of what it wants to do, not a
machine-captured fact about what it tried.

**What can actually be blocked?** *"We can either use the permission tooling that harnesses have or
build a hook that we add into this session. The goal is to intercept actions in the session. Our MCP
tool actions don't matter."*

**Every harness?** *"This should work on all harnesses, and yeah that means building harness-specific
solutions."*

**One package?** Yes — split into batches or phases if necessary.

**The docs?** *"The docs are probably wrong in many places."*

## Not answered

Whether a decline is final or the agent may come back with a better case. The orchestrator took the
assumption that a decline carries reasoning back and the agent may re-argue, and flagged it as
overturnable.

## What this overturned

- The capture-and-gate mechanism in `docs/process-layer/staged-operation.md`, including its explicit
  statements that there is no permission list and that the carrier is HyperIdle's own MCP bridge.
- The original `plan.md`, whose framing was "connect a chain that is broken in the middle".
- The architecture built from it, and the three critique rounds spent on it.
