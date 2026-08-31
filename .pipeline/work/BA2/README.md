# BA2 — an agent asks, a human clears

## The live documents

- **`../BA2-gate/plan.md`** — the design, settled. Start here.
- **`interview-2026-08-25.md`** — the founder interview. What this is and why.
- **`founder-rulings.md`** — 25 rulings, each with its reasoning and, where one reversed an earlier one,
  why. Rulings 18 → 22 → 22a are worth reading as a set: the same claim was asserted wrongly three times
  because each assertion tested one combination and reasoned about the rest.
- **`harness-research/interception-{claude-code,codex,cursor-agent,opencode}.md`** — how each harness
  actually refuses a tool call. Measured against the installed binary, with the command and its output
  recorded. These are what the build follows.
- **`harness-research/session-continuation.md`** — how each harness resumes a session and carries a new
  user message. Needed by the return half.

## What shipped

The work was split into pieces, each reviewed independently and merged: the old capture machinery deleted
(#529), scoped action rules (#532), harness session handles (#533), and stale documentation fixed (#534).
Four earlier pieces fixed production bugs no test had caught — codex sessions dying at startup,
cursor-agent never reporting token usage, all nine review canvases showing invented content, and a human
being unable to reach or approve a review.

## What was retired, and why

Removed in the parent of `31a120cfe`, where git history keeps them:

- **`SPLIT-ANALYSIS.md`** — the seven-way split it describes is done; every piece either shipped or was
  rebuilt.
- **`harness-research/{claude-code,codex,cursor-agent,opencode}.md`** and **`FINDINGS.md`** — the first
  research pass, from 2026-08-27. It asked the right question and the `interception-*.md` files answer it
  properly: measured against the binaries rather than partly reasoned, and exact about file paths, event
  names and response protocols. Keeping both invites a reader to follow the weaker pair.
- **`harness-research/blocking-tool-calls.md`** — asked whether a tool call could park a session until a
  human answered. Settled: it cannot work on codex or cursor-agent, so the session ends instead. The
  conclusion and its reasoning are in the plan.
- **`harness-research/builtin.md`** — the built-in harness was retired from the product in #536.

The rule this work package earned is now enforced repo-wide in `.claude/rules/architecture.md` (#538):
harness features are file-based, every harness must be researched and implemented on its own terms, and
an architecture touching a harness must name that harness's real paths and vocabulary.
