# BA2 — A human approves an agent's risky action and the agent can then take it

## Work package

**Outcome.** A human reviewing a proposed action approves it, and the agent that proposed it carries
out exactly that action on its next turn. Today approving marks the thread resolved and nothing else
happens — the agent never receives permission, and it never notices.

**Why this matters.** This is the trust mechanism of the product: the way a human stays in control of
an agent that wants to do something consequential without gating everything an agent does. Right now
the machinery exists on both sides and the middle is missing, so the product pays the full
maintenance cost of the feature and delivers none of its value. Worse, the failure is silent — a
human sees "approved" and assumes the action happened.

**What exists today.** The capture side records a proposed call and owns three tables. A dedicated
endpoint composes the one-time permission, enqueues the follow-up run, and announces the grant. The
review screen approves through the general message endpoint instead, whose handler explicitly
discards the decision. The consuming side looks for a permission that is therefore never minted.
Independent audit found nine disconnected pieces, not one: the object that routes an irreversible
tool call into review is never constructed in production, so such calls currently execute directly;
the approved-call value is never constructed, so a second session could not consume a grant even if
one existed; the anchor identifiers the workflow requires only exist mid-session, while it demands
them at provisioning time; and both bake failures are swallowed.

**Missing delta.** Connect the chain end to end, and invert the reversibility default so switching it
on does not create a gate-by-default classifier.

**Depends on.** None.

**Complexity.** L

**Engineering tier.** mvp

**Pre-build.** Architecture required — the chain has several independent breaks and the anchor-identity
problem (identifiers demanded at provisioning time but only created mid-session) needs a decided shape
before implementation. No design phase: the review screen already exists and this changes what its
existing approve action does, not how it looks.

**Constraints.**
- Approval must remain something a human chose or a real learning earned. The current path hardcodes
  every proposed call as irreversible and defaults unsignalled tools to irreversible, routing unknown
  tools to review before the tool is even known. That default must be inverted as part of this work,
  not after it. Exactly one builtin tool declares itself irreversible today, and every tool is already
  seeded with a reversibility value, so the dial has a home.
- A failure anywhere in the chain must surface to the human who approved. Silent failure is the defect
  being fixed, so reproducing it in a new place fails this work package.

**Out of scope.** Any general approval gate over ordinary agent actions. Reworking the review screen's
layout. Approval routing across teams.

## Acceptance criteria

- Approving a proposed action results in the proposing agent performing that specific action, observable
  end to end without hand-seeded data.
- A tool that is not signalled as irreversible is not routed into review.
- A tool a human has marked irreversible is routed into review before it executes.
- When any step between approval and execution fails, the approving human is told, and the proposed
  action is not silently left as approved-but-not-done.
- Declining a proposed action results in the agent not performing it.

## Validation scenarios

- Given an agent proposes an action a human has marked irreversible, when the human approves it, then
  the agent performs that action on its next run and the outcome is visible to the human.
- Given an agent calls a tool with no reversibility signal, when the call is made, then it executes
  without creating a review.
- Given approval succeeds but the follow-up run cannot be prepared, when the human returns to the
  thread, then they see that the action did not happen and why.
