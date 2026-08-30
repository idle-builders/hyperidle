# BA2 — An agent asks before it does something consequential, and a human clears it

> **Rewritten 2026-08-25 from a founder interview**, which replaced this package's concept. The
> interview is `interview-2026-08-25.md` and is the most authoritative source for this work. The
> original spec is kept as `plan-superseded-2026-08-17.md`. Where `docs/` disagrees with this plan,
> `docs/` is wrong — see *Consequences* below.

## Work package

**Outcome.** An agent working on a task tries to do something with its own hands — run a command,
write a file. A per-team permission list decides whether that needs a human first. If it does, the
agent is pushed back rather than stopped dead: it is told the action needs approval and how to ask.
The agent then writes a review — the review product that already exists — making its case: what it has
done, what it wants to do next, and the kind of action it wants cleared. A human approves the result.
Attached to that, the blocked kind of action is cleared once. The agent is brought back, carries on,
and decides for itself when the work is finished.

**Why this matters.** This is how a human stays in control of an agent doing consequential work
without gating everything an agent does. The value is not the blocking — it is **learning what agents
themselves think is dangerous**. The list starts empty, so a fresh system never interrupts anything and
an agent only ever raises a review because it decided to. What agents keep asking about is the signal
that eventually earns an entry in the list.

**What exists today.**
- **The review product is large and real**: `submit_review`, review messages, review artifacts, and
  nine purpose-built canvases (`layers/core-ui/src/pages/review/canvas-registry.ts`). This work rides
  it and does not build a parallel one.
- **`submit_review` anchors to the bet.** It resolves the task's bet and posts to the bet's host thread
  (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:603`). That is wrong under this
  plan and is this package's to correct.
- **No permission list exists**, in any scope.
- **Nothing intercepts what an agent does in its session.** The claude adapter runs with permissions
  bypassed; the codex hook is a Stop hook for return enforcement; there is no opencode permission
  config in the repository.
- **A large body of machinery exists for the rejected concept** — capture of the attempted call, its
  verbatim arguments, tailored grants, a two-session grant path — aimed at HyperIdle's own MCP tool
  router, which the founder has ruled is not the layer that matters.

**Missing delta.** A per-team rule store and the settings surface that fills it; session-level
interception on every supported harness; the push-back that tells a blocked agent how to ask; the
clearing of an action on approval; and the agent's resumption afterwards. Plus the retirement of the
superseded machinery and the correction of the docs that specify it.

**Depends on.** None.

**Complexity.** L — unchanged from registration, but the shape is different: the work is now mostly
per-harness rather than mostly in core.

**Engineering tier.** mvp

**Pre-build.** **Harness research first, before architecture.** What each of the five supported
harnesses can actually do about intercepting a session's own actions is the least-known part and the
largest risk, and it decides the shape of everything else. It must be established against each
harness's real, current capability — verified, not assumed. Architecture follows that. Light design for
the settings surface that holds the rules; no design work for the review surface, which exists.

## Phases

One package, delivered in order. Each phase is proven before the next begins.

1. **What each harness can do.** ✅ **Complete 2026-08-25** — see `harness-research/FINDINGS.md`.
   All four CLI harnesses can block a session action and return text the model reads, proven live
   against the installed binaries. Builtin is excluded by ruling.
2. **The loop, end to end, on one harness.** The per-team rule store, the settings surface, the
   push-back, the agent's review, the human's approval in the task's thread, the one-time clearing, and
   the agent resuming and finishing. This is the proof vehicle: it must run on a real binary against a
   real database, with nothing on the chain stubbed.
3. **The remaining harnesses to equal coverage.** Same loop, same proof, each with its own mechanism.
4. **Retire and correct.** Remove the superseded capture machinery, and rewrite the documentation that
   specifies it.

## Constraints

- **The list is empty on a fresh system.** Nothing ships pre-marked. An agent that is never blocked
  behaves exactly as it does today. *(Founder ruling, `founder-rulings.md`.)*
- **A review never adds friction.** If an agent names an action in a review that it was not blocked
  from doing, that must not start blocking it — for that agent or anyone else.
- **Cleared by kind, once.** Approval clears the kind of action, not one exact command, and the pass is
  spent on use. If the command differs or fails, the agent adapts.
- **The task is the denominator, never the bet.** A review always has a task. A session with no task is
  a gap in how the work was modelled, not a case this bends for.
- **Land where the human already was.** Reuse the task's thread if it has one; otherwise create one and
  attach it to the task.
- **The agent decides when it is done.** A review can happen mid-session, so approval resumes the
  agent's work rather than firing one command.
- **Every CLI harness** — claude-code, codex, opencode, cursor-agent — with harness-specific hook
  solutions. **The builtin harness is excluded by founder ruling** (`founder-rulings.md` §7): it has no
  subprocess to hook and every action it takes is a HyperIdle tool call, which is out of scope. The
  accepted consequence is that a team's rule does not reach an agent running on builtin.
- **Hooks are the mechanism** (`founder-rulings.md` §4). Native harness approval is not an alternative:
  phase 1 proved it unusable headlessly on all four.
- **The push-back is two pieces** (`founder-rulings.md` §6): standing policy in the seed prompt naming
  `submit_review`, and a terse fact in the hook's deny message. An imperative in the deny message is
  what a model refused as a suspected prompt injection.
- **A gate that fails open must be detectable.** On three of the four harnesses a broken gate is
  silent, so "no block was reported" may never be read as "nothing needed blocking".
- **A failure between approval and the agent resuming must reach the human** who approved, in the
  thread they approved in. Silent failure is a defect this package may not reproduce.

## Out of scope

- A classifier that infers danger. Explicitly later.
- Growing the permission list automatically from what agents ask about. The signal is the point of the
  feature, but a human adds entries in settings for now.
- Per-agent or per-workspace rules. Per team.
- Reworking the review product's layout or its canvases.
- Intercepting HyperIdle's own MCP tool calls. Ruled out: those are not the actions that matter.

## Acceptance criteria

1. With an empty permission list, an agent performs consequential actions without interruption and no
   review is created.
2. With a team rule in place, an agent attempting a matching action in its session is stopped and told
   it needs approval and how to ask — on every CLI harness (builtin excluded, ruling 7).
3. A pushed-back agent can raise a review carrying its case and naming the action it wants cleared, and
   that review reaches the human in the task's thread.
4. Approving the review lets the agent perform that kind of action once, and the agent resumes its work
   and finishes it.
5. An action named in a review that was not blocked stays unblocked and never becomes blocked.
6. When any step between approval and the agent resuming fails, the human is told in the thread they
   approved in, and the work is not left silently looking approved-but-not-done.
7. Declining leaves the action blocked and the agent does not perform it; the agent is told why and
   may raise a better-argued review (founder ruling 9).
8. **The review screens work and are reachable** (founder ruling 11). A human can get to a review from
   where they already are and act on it — not only for the task-hosted reviews this package
   introduces, but for the review surface as a whole where it is broken. "Accessible" is read as
   reachable and usable, not as assistive-technology accessibility; see ruling 11.
9. **A review shows the real thing, not a stub** (founder ruling 12). The review canvases render the
   actual artifacts and examples the agent produced — the content pipeline that populates them is in
   scope. A canvas that silently substitutes a fabricated demo fails this.
10. **An agent's review renders on the canvases and can be approved** (founder ruling 13). The nine
    canvases already work — the demo world proves it. What is missing is an agent's path to producing
    their content: `submit_review` speaks the pre-consolidation artifact vocabulary and the loader
    never resolves a reference. The six-kind consolidation stays; the wiring is this story.
11. **Reviews are demonstrated working end to end** — a real review, produced by an agent, reached,
    read and acted on by a human, with the outcome observed. Not a component test with a hand-fed
    fixture. Proof is read from the DOM and reported in prose; screenshots are not evidence here.

## Validation scenarios

- A fresh workspace with no rules: an agent runs a consequential command; nothing interrupts and
  nothing is reviewed.
- A team rule covering that command: the agent is stopped, raises a review, the human approves in the
  task's thread, and the agent completes the work — proven on each CLI harness with its real
  binary, not a stub.
- An agent names an unblocked action in a review: after approval that action is still not blocked, for
  anyone.
- Approval succeeds but the agent cannot be resumed: the human sees in the thread that the work did not
  happen, and why.

## Consequences for the repository

- `docs/process-layer/staged-operation.md` is wrong in its central mechanism — it specifies capture at
  the MCP router and states there is no permission list. It is rewritten in phase 4, not patched. The
  founder's expectation is that other docs are wrong in similar ways; correcting what this work touches
  is in scope, a general documentation sweep is not.
- The AL7 capture machinery is superseded. What, if anything, survives is an architecture question.
- `submit_review`'s bet anchoring is corrected here.

## Open, for architecture

- How a review names the action it wants cleared, so approval can be matched to a rule. The push-back
  knows which rule blocked the agent; carrying that identity into the review and back is the smallest
  shape. Do not build a classifier for it.
- Which service owns the permission list. The founder raised this as needing clean structure; per-team
  ownership plus the repository's table-ownership rules should settle it.
