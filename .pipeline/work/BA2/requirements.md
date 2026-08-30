# BA2 — Requirements

**Source of authority.** A live interview with the founder on 2026-08-25, after both `plan.md` and the
first `architecture.md` were rejected. The rejection was of the premise, not the execution. Everything
below overrides `plan.md` where they conflict, and overrides
`docs/process-layer/staged-operation.md` entirely — that doc describes a mechanism the founder has now
rejected, and is scheduled for rewrite as part of this work.

---

## The outcome, in one paragraph

An agent working on a task tries to do something with its own hands — run a command, write a file. A
per-team permission list decides whether that needs a human first. If it does, the agent is **pushed
back**, not stopped: it is told the action needs approval and how to ask for it. The agent then
**writes a review** — the review product that already exists, with its artifacts and canvases — making
its case: what it has done, what it wants to do next, and the kind of action it wants cleared. A human
approves the *result*. Attached to that approval, the blocked kind of action is cleared once. The agent
is brought back and carries on, and decides for itself when the work is finished.

## Why this shape

The value is not the blocking. The value is **learning what agents themselves think is dangerous**.
The list starts empty, so a fresh system never blocks anything and an agent only ever raises a review
because it decided to. What agents keep asking about is the signal that eventually earns an entry in
the list.

---

## Decisions taken in the interview

Each is settled. A later phase may not reopen one without going back to the founder.

### D1 — The system may stop an agent, but stopping is not a review
A block is a **push-back to the agent**: *that is not something you do without approval, and here is
how to ask*. The system creates no review, captures nothing, and records no proposed call. A review is
work the agent performs afterwards, and only if it chooses to.

### D2 — A permission list, per team, that starts empty
What is blocked is decided by a list of rules **owned per team**. Not per agent, not per workspace.
It is intentionally **empty on a fresh system**, so day one the agent always self-elects. Entries are
added by a human in settings for now. A classifier may replace or supplement the list later; it is not
part of this work.

### D3 — Interception happens in the session, not in HyperIdle's tool router
The actions worth intercepting are the ones the agent takes with its own hands inside the session —
shell commands, file writes, its own credentials. **HyperIdle's own MCP tool calls do not matter here.**
The carrier is either the harness's native permission tooling or a hook injected into the session,
whichever each harness supports.

### D4 — Every harness, with harness-specific solutions
This must work on all supported harnesses. That means building a separate mechanism per harness rather
than one uniform carrier. This is the bulk of the work and the least-known part.

### D5 — The capture concept is dead
Nothing records the attempted call verbatim. There is no argument snapshot, no identity hash gating, no
permission keyed to one exact call, and no two-session grant machinery of the kind previously
specified. What a human approves is the agent's **account** of what it wants to do, not a
machine-captured fact about what it tried.

### D6 — A review always has a task; the task is the denominator
Never the bet. Tasks will exist without bets, so a bet cannot be the anchor. There is no such thing as
a review with no task: anywhere a human asks an agent to do something, that is a task of some kind. If
a session has no task, that is a gap in how the work was modelled, not a case this bends for.

### D7 — The review lands in the thread the human was already in
If the task already has a thread, the review goes there. If it does not, a thread is created and
attached to the task, and it surfaces to the human. The rule is: pick the best available thread, which
is the one the human was already in.

### D8 — Approval is of the result, and clears an action as a rider
The human says yes to the result the agent proposed. Attached to that, the actions the agent named
become free to perform — the hook stops interrupting them.

### D9 — Cleared once, by kind, and only if it was blocked
- **Once.** The pass is spent on use. The next time, the agent asks again.
- **By kind, not by exact command.** "Merge" is approved, not one specific invocation. If the exact
  command differs or fails, the agent adapts and fixes itself — that is the point of approving the
  action rather than the bytes.
- **Only if it was blocked.** If an agent names an action in a review that it was never blocked from
  doing, that does **not** start blocking it. A review never adds friction.

### D10 — The agent is brought back and decides when it is done
A review can happen mid-session, not only at the end, so approval must resume the agent's work rather
than fire a single command. Executing the approved command directly on approval was considered and
rejected as the primary mechanism: bringing the agent back and letting it decide where the end is, is
the safer and more natural bet.

### D11 — A review is the existing review product
Reviews are already a large surface: `submit_review`, review messages, review artifacts, and nine
purpose-built canvases (`layers/core-ui/src/pages/review/canvas-registry.ts` —
`outcome_summary`, `field_change_set`, `action_operation`, `rendered_in_context`, `metrics_moved`,
`visual_diff`, `code_diff`, `batch`, `browser_preview`). This work **rides that product**; it does not
build a parallel one. A review is a formalized way of communicating, including artifacts and examples,
which is why producing one is real work for the agent and a push-back is not one.

---

## D12 — Declining tells the agent why, and it may come back — CONFIRMED

**Was:** an assumption taken by the orchestrator, not confirmed. The founder was asked at the time and
did not answer, and I decided it rather than block.

**Now: confirmed by the founder, 2026-08-25** (`founder-rulings.md` §9). A decline carries the human's
reasoning back to the agent, and the agent may raise a better-argued review. Every verdict resumes the
agent; a decline simply clears nothing.

This is no longer overturnable-by-default and no longer an open question. **AC7 is unaffected**: a
decline clears nothing, so the action stays blocked and the agent cannot perform it. The one thing it
adds is that the agent is brought back to be told why — without which "the agent may come back" has no
trigger at all, since its session ended when it called `submit_review` (a return action).

D9's "ask again" therefore stands as written.

---

## Acceptance criteria

These replace the criteria in `plan.md`.

1. With an empty permission list, an agent performs consequential actions without any interruption, and
   no review is created.
2. With a team rule in place, an agent attempting a matching action in its session is stopped and told
   it needs approval and how to ask — on every supported harness.
3. A pushed-back agent can raise a review that carries its case and names the action it wants cleared,
   and that review reaches the human in the task's thread.
4. Approving the review lets the agent perform that kind of action once, and the agent resumes its work
   and finishes it.
5. An action named in a review that was not blocked stays unblocked and never becomes blocked.
6. When any step between approval and the agent resuming fails, the human is told in the thread they
   approved in, and the work is not left silently looking approved-but-not-done.
7. Declining leaves the action blocked and the agent does not perform it.

## Validation scenarios

- A fresh workspace with no rules: an agent runs a consequential command; nothing interrupts, nothing
  is reviewed.
- A team rule covering that command: the same agent is stopped, raises a review, the human approves in
  the task's thread, and the agent completes the work — proven on each supported harness with its real
  binary, not a stub.
- The agent names an unblocked action in a review: after approval, that action is still not blocked for
  anyone.
- Approval succeeds but the agent cannot be resumed: the human sees in the thread that the work did not
  happen, and why.

---

## Open, for architecture rather than the founder

- **How a review names the action it wants cleared** so the system can match the approval to a rule.
  The push-back knows which rule blocked the agent; the simplest shape carries that identity into the
  review and back. Decide it; do not build a classifier for it.
- **Which service owns the permission list.** The founder raised this as needing clean structure.
  Per-team ownership plus the repo's table-ownership rules should decide it.
- **What each harness can actually do.** Claude Code has pre-tool-use hooks; codex currently uses a Stop
  hook for return enforcement; opencode has no permission config in the repo; cursor-agent is unknown;
  the builtin harness has no shell and may have nothing to intercept. This must be researched against
  each harness's real, current capabilities — not assumed — before the work is shaped.

## Out of scope

- A classifier that decides danger by inference. Later, explicitly.
- Growing the permission list automatically from what agents ask about. The signal is the point of the
  feature, but a human adds entries in settings for now.
- Per-agent or per-workspace rules. Per team.
- Reworking the review product's layout or canvases.

## Consequences for the repository

- `docs/process-layer/staged-operation.md` is now wrong in its central mechanism and must be rewritten,
  not patched.
- The AL7 proposed-call machinery — capture, tailored grants, the two-session grant path, the
  argument-pinning convenience — is superseded. What of it survives is an architecture question.
- `submit_review` posts to the **bet's** thread today
  (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:603`) and resolves the bet from the
  task. That contradicts D6 and D7 and is this work's to correct.
- The size and shape of this work has changed materially. Whether it stays one work package or is split
  is a `/work-planning` decision for the founder, not this document's.
