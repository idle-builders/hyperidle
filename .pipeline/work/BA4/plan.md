# BA4 — Watch an agent work, live

## Work package

**Outcome.** Someone can open a session and watch the agent working in it as it happens — what it is
saying, what it is thinking, which tools it is calling and what came back — and reach that view from
the product rather than by knowing a URL.

**Why this matters.** An agent doing work you cannot see is something you either trust blindly or
interrupt constantly. Watching a session is how a human builds a calibrated sense of what an agent
does well, and how they catch a run going wrong early instead of reading the wreckage afterwards. On
a shared backend it is also how one person sees what a teammate's agent is doing.

**What exists today.** The renderers already exist for a far richer session than the system emits, and
they are better than the data. A session view component is mounted but unreachable — its only two
openers are production-dead paths, there is no session page or route, and its send handler is a stub.
A second component renders the same activity feed separately. On the producing side the drain loop
handles token usage, tool calls and errors only, and **silently drops the completion text every
harness already sends**.

**Missing delta.** A reachable session surface, and a producer that emits what the renderers can
already show. The producer work is tiered by cost and should be ordered accordingly: agent prose is
already arriving and merely dropped; reasoning and tool results arrive on the raw wire and are lost in
one mapping step; tool status and output need an identifier the canonical tool-call event does not
carry; diffs and sub-agent session identifiers exist on no wire at all.

**Depends on.** None.

**Complexity.** L

**Engineering tier.** mvp

**Pre-build.** Design required — this is a new user-facing surface with live, streaming content, and
the question of what a person watching actually needs to see is not settled by an existing pattern.
Refinement not required; the outcome is clear.

**Constraints.**
- One renderer for the activity feed, not two. The finished surface must not leave both the session
  view and the separate activity panel rendering the same thing.
- Content the system cannot actually produce must not be rendered as though it might appear. If a
  tier is not built, its affordance does not ship.

**Out of scope.** Intervening in or steering a running session from this view. Replaying finished
sessions as a distinct experience. Diffs and sub-agent nesting, unless the design phase establishes
they are needed for the surface to be worth using — they exist on no wire and would be invention.

## Acceptance criteria

- A session is reachable from the product through a stable route.
- While an agent is running, its prose output appears in that view as it is produced.
- Tool calls the agent makes appear in that view as they happen.
- The activity feed is rendered by one component, not two.
- Every kind of content the view can display corresponds to something the system actually emits.

## Validation scenarios

- Given an agent is running a session, when someone opens that session, then they see the agent's
  output appear without reloading.
- Given an agent calls a tool, when the call happens, then it appears in the session view.
- Given a session that has finished, when someone opens it, then they see what happened in it.
