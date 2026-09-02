# BA2 — an agent asks, a human clears

## The live documents

- **`plan.md`** — the plan. Start here.
- **`interview-2026-08-25.md`** — the founder interview that set the concept. Where anything disagrees
  with this file, this file wins.
- **`founder-rulings.md`** — the decisions, each with its reasoning and, where one reversed an earlier
  one, why. Read the caveat below before trusting any ruling that turns on harness behaviour.
- **`harness-research/deep-{claude-code,codex,cursor-agent,opencode}.md`** — how each harness actually
  behaves. 268 claims, each tagged with the command that produced it or the URL it came from. These
  are what the build follows.

## The rulings have a known fault line

Several rulings were decided on harness facts that later measurement refuted. They still record what
was decided and why; they are not a reliable source for **what a harness does**. For that read
`harness-research/deep-*.md` and nothing else.

The clearest case: ruling 5 rejected holding the agent inline and ruling 24 chose end-the-session-then-
resume, both because waiting was believed impossible on codex and cursor. It is not — every harness
can hold a tool call for minutes or longer, and the "cursor caps every tool call at 60 seconds" fact
was its hook timeout default, misread. End-and-resume is still right, for a different reason: a human
may take days, and a held process does not survive that.

## What was retired, and why

Removed here; git history keeps them.

- **`../BA2-gate/plan.md`** — the previous settled design. Superseded by `plan.md` and the program
  design that follows it. Two plan files is the same "one shape only" problem in prose.
- **`harness-research/interception-*.md`** and **`session-continuation.md`** — the research pass from
  2026-08-27 to 08-31. It asked the right questions and got load-bearing answers wrong: claude-code
  resume is not directory-bound, opencode's "intermittent init stall" is deterministic stdin blocking,
  cursor does report token usage and has no 60-second tool cap, and the prompt-injection refusal that
  shaped ruling 24 did not reproduce. The `deep-*.md` files answer the same questions against the real
  binaries with every claim referenced. Keeping both would invite a reader to follow the weaker pair —
  the same reason that pass retired the one before it.

## Earlier pieces that shipped

The old capture machinery deleted (#529), scoped action rules and their settings surface (#532),
harness session handles (#533), stale documentation fixed (#534). Four earlier pieces fixed production
bugs no test had caught — codex sessions dying at startup, cursor-agent never reporting token usage,
all nine review canvases showing invented content, and a human unable to reach or approve a review.

The rule this work package earned is enforced repo-wide in `.claude/rules/architecture.md` (#538):
harness features are file-based, every harness must be researched and implemented on its own terms,
and an architecture touching a harness must name that harness's real paths and vocabulary.
