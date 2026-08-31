# AU27 — The assistant turn is just an ordinary agent: de-specialize its output + execution path

**Status: shipped 2026-08-04.**

## What we need

The assistant turn should run as a genuinely ordinary tool-driven agent session — same execution path,
same output mechanism, same tool surface — as every other agent kind, so that "the assistant is just an
ordinary agent" is true in the code and not only in intent. AU21's Decision H2 closed the assistant's
**input** side (core bakes the transcript, orchestration formats it) but left the **output** side special:
the assistant ran through a bespoke `conversational` mode, returned a special result shape, and
`dispatch` — not the agent, not a tool — parsed that reply and posted it into the thread afterward. Every
other kind produces its work products through explicit tool calls during the session and flows through
the shared `run-orchestration` poller. The runtime still forked on "is this the assistant," which is
exactly the specialness this track exists to remove.

The maintainer put it plainly: *"the assistant is just an ordinary agent [session] … it uses tools like
any other agent. there is nothing special,"* and *"the only place where the assistant is treated specially
is in the UI since it can show up in a different spot visually."* Nothing was user-visibly broken — this is
coherence debt, and the precondition for resumable harness sessions applying uniformly across kinds.

**This is a deletion work package**, scope-locked to six things: a generic `reply` tool; a calling-thread
id on the tool context, baked at emit; the assistant onto the shared poller; delete `conversational` mode;
delete the `@hyperidle/dispatch` package; purge the `AL6` work-package-ID naming from production code. Any
increment that grew the surface rather than shrinking it needed explicit justification against that lock.

Done means the assistant's response is authored by the assistant itself through the same `CoreApiPort`
route and middleware a human uses, with no orchestration-side post-hoc write anywhere in the path; `reply`
works for every agent kind (proven by a task_run posting into its own task's thread); `threadId` reaches
the tool context from the baked request with zero orchestration→core reads on the run path; no
`conversational` execution branch survives a type check and grep; the assistant is consumed by the shared
poller with no second execution entry; and the return gate forces the session-appropriate action, proven
on a real harness rather than in gate unit tests alone.

Deliberately accepted, not deferred: the assistant's bet-draft cards and tool-call summary rows lose their
only data source and **go away**, with no replacement — pre-users, no one to regress. One UI file is
edited, only to delete those now-dead branches; the assistant's distinct visual spot is untouched. There
is no migration, no backfill, no schema change, and no tombstone comments narrating what was removed.

Out of scope: resumable per-thread harness sessions (AU25); mid-run delivery into a running session
(AU22); any UI redesign; and the pre-handoff admission-failure notice UX, which the founder ruled a
different concern — see *How we work on this* for the three defects spun out with it.

## How it works

**`reply` is deliberately narrower than `send_message`: it takes no thread argument.** That is what makes
it mean "answer your caller," and it removes a whole loop class. It posts a plain message into the
session's calling thread through `ports.coreApi.insertMessage` — the same route `send_message` already
uses. It carries no `roles`, so every agent kind gets it. Its errors are tool results, never throws: a
session with no calling thread (routine_run, knowledge_action) gets `NO_CALLING_THREAD` naming the
alternatives that do work, and the session continues. It is marked `reversible` on purpose, because
reversibility classification fails closed and an unmarked `reply` would route every answer to human
review under a session workflow.

**`ToolContext.threadId` is optional and absent means absent** — the `taskId: ""` idiom for a missing id
was deliberately not copied, because `reply` has to be able to tell. It is baked by each per-kind resolver
at emit, so orchestration only parses the drained payload and never reads core on the run path.

**Threads are found by `(hostKind, hostId)` lookup, not by a foreign key on the host.** `tasks.threadId`
is a denormalized shortcut and the anomaly among the eight thread hosts, not the norm; knowledge items
have working conversations with no such column. So the task's thread is resolve-or-created core-side at
emit time — a core write, which leaves the zero-orchestration-reads boundary intact — rather than by a
migration making the column non-null. Lazy resolve-or-create is the architecture, not a gap.

**The one return gate is adjusted in place, never shadowed.** The requirement is per-session: a session
whose output belongs in a calling thread cannot satisfy the gate with an unrelated return tool, and the
forcing message names the action that session actually needs. The change extends the existing return
action names, forcing predicate and enforcement entries across all six force sites and four harness
channels; no second gate, no parallel registry, no bypass.

**The force budget is finite, so a never-silent net catches the rest.** The already-emitted
`session_not_returned` event gains the calling thread id and a `conversation` subscriber that posts one
notice; absent a thread the subscriber no-ops. The assistant's tool surface grows from three tools to
roughly seventeen as a direct consequence, and that is the point rather than a side effect. The mechanism
is named for what it does — return enforcement — not for the work package that introduced it.

## How we work on this

The build ran in three phases so the seam was the review unit: five additive increments that land safely
alone because nothing consumes them yet; a switchover where one commit changes live behavior and the next
removes what it made unreachable; and the mechanical rename last, over a settled surface.

Residual risks the next work package should own, all recorded at review and none blocking: a structurally
failing `reply` (the `NO_CALLING_THREAD` result) still satisfies the return gate, so a routine or
knowledge turn can end without its intended return if a model ignores a correcting error; only one of the
eleven harness tests is visible to the enforcement machinery; the regression guard for the switchover
lives in the release-gated harness lane; and a silent-retry window remains.

Spun out as its own follow-up: the pre-handoff admission-failure chain. Three real defects were found and
are recorded rather than fixed here — a `resolveModel` throw escapes `runClaimedRequest`, so no
`agent_run_admission_failed` fires at all for that failure; the failure-code union is too coarse to say
why (no missing-credential or no-eligible-harness case, though that vocabulary already exists); and the
request is claimed before that throw, with the catch neither terminalizing nor releasing it, so the row
loops on lease expiry indefinitely. The third is pre-existing for task_run but AU27 newly exposes it for
the highest-volume kind; bounding it means the same catch block the first defect fixes, so splitting the
work would leave a half-corrected path. AU27 accepts the exposure rather than half-fixing it.

Noted in passing, not actionable here: picking a team's human by an unordered `limit(1)` makes the
emit-created task thread list a nondeterministic participant on multi-human teams, and the fast-tier
resolution warning fires per request rather than once, on runs whose harness never reads that tier.
