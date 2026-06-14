# Review primitive (TRACK-AL — concept locked in `plans/AL1/concept.md`)

A **Review** is the dual-anchored *experience* of judging a **Subject** (the work product of a task or bet — a set of one or more Artifacts) against the **Intent** it was asked to fulfil, with the agent's structured **Rationale** in view, rendered by a **Reviewer** (human or agent), and terminated by one binding **Verdict** over the whole Subject. It is not a single primitive on screen — it is a *composite of parts* that must let you **examine** the work and **converse** about it at once. Its conversation part reuses the [Thread](./thread-primitive.md) (`review`/`verdict` message types); this doc adds the depth the AL1 research established and does not reopen the verdict grammar (`verdict-actions.md`) or the five artifact renderers (`../product/human-ai-collaboration.md`).

```
Review (review-message)              # one Verdict over the whole Subject
  subject     → Subject              # task/bet output = SET of ≥1 Artifacts (NOT one file)
  intent      → IntentAnchor         # snapshot of done-condition / spec / prompt
  rationale   → Rationale?           # agent's structured "why" (empty for human-authored)
  reviewer    → Reviewer             # { human | agent }
  cost        → { Money, TokenUsage }
  resolved_by → Verdict              # one of 5 binding actions, resolves the SUBJECT

Subject  { artifacts[] (≥1, each with its own renderer), origin: task | bet }
Rationale  entries[]{ id, decision, alternatives_discarded[], confidence, anchors[], intent_ref? }
Anchor   { block_id (PlainPayloadWithBlockId — identity, NEVER coordinate/offset),
           target: line | paragraph | step | region | cell }   # closed
```

## Essential properties
- **Subject = a set.** The unit of judgment is the task/bet output, one or more Artifacts. **One Verdict resolves the whole Subject** — never per-artifact (per-file verdicts are the review-fatigue failure mode).
- **Dual anchor (mandatory).** Always carries an Intent snapshot; the verdict answers "did it do what we asked?" *and* "is the output sound?"
- **Rationale is the agent's, structured, decision-grained, searchable, immutable.** Not the transcript, not prose, not a PR description.
- **Reviewer is human or agent.** A review always happens; *who* renders it is the live axis (autonomy L1–L4 + `escalate`). No self-review. **Default Subject = a task's output** (every task is reviewed); a **bet** review (ship-confirmation) **requires a human Reviewer**; session-level review is a deferred future grain.
- **Anchors follow content.** Bound to block identity, across artifacts, so feedback survives edits.
- **Cost attached** — token + money of the producing session.

## The reviewing experience — the parts (brief for `/design`)
A Review must put these on one screen, balancing **examine** (look at potentially large work) against **converse** (comment/verdict, thread-like, pinned to what you're looking at):
1. **Subject** (set of artifacts) · 2. **Examination surface** (the five renderers) · 3. **Intent** (asked / addressed / NOT-addressed) · 4. **Rationale** (per-decision, linked to spots) · 5. **Conversation channel** (the Thread: comments, replies, resolve) · 6. **Anchors** (join examine↔converse) · 7. **Verdict affordance** (resolves the Subject) · 8. **Cost** · 9. **Navigation & progress** (across N artifacts; per-artifact "reviewed" state; unresolved/blocking) · 10. **Reviewer presence** (human/agent).

**Concept fixes:** one Review = **one conversation over the Subject** (one Thread) with **many anchored inline comments** inside it (GitHub-PR shape), not a thread per file. **Design decides:** the examine-vs-converse layout (split-pane / overlay / rail), how renderer and thread share the viewport, how artifact navigation preserves comment context.

## What it is not
- **Not per-artifact approval** — verdict is over the Subject.
- **Not a chat thread with a verdict button, nor the diff alone** — it is the composite of the parts above.
- **Not per-tool-call approval** — that gates one action, not a work product.
- **Subject is not one Artifact**, and not the task/bet itself — it is their *output set*.
- **Rationale is not the transcript / prose summary / PR description.**
- **Reviewer is not always human, and never the producing agent** (no closed-loop self-review).
- **Anchor is not a coordinate/offset** (Figma/Word failure mode) and not a new content dialect.
- **Verdict grammar is not reopened.**

## Lifecycle
`open → (comment / inline-comment / request-changes ↺) → resolved` by a binding Verdict — the Thread/verdict semantics in `thread-primitive.md`. Re-submission opens a new round. No new lifecycle.

## Authority
- **Intent** — set by whoever defined the work; immutable snapshot at review-open.
- **Rationale** — produced by the producing agent; immutable once the review opens (audit invariant).
- **Verdict** — rendered by the Reviewer (human or agent); server-authoritative; emits an Event Bus event like any Thread write.

## Vocabulary
| Term | Definition | Aliases not to use |
|---|---|---|
| **Review** | Dual-anchored experience of judging a Subject; resolved by a Verdict. | review thread (= the hosting Thread), PR, approval, sign-off |
| **Subject** | Work product under review — task/bet output; set of ≥1 Artifacts. | the artifact, the diff, the PR (hide the set) |
| **Intent** | Snapshot of what was asked. | spec, prompt, ticket (sources of Intent) |
| **Rationale** | Agent's structured, searchable account of *why*. | reasoning, summary, PR description, transcript |
| **Reviewer** | Party rendering the Verdict; human or agent. | approver, validator (human-only) |
| **Anchor** | Content-following pin via block identity. | pin, coordinate, position, offset |

## Contracts
- **Cardinality:** 1 Subject (≥1 Artifacts) · 1 Intent · ≤1 Rationale · 1 Reviewer-of-record/Verdict · 1 binding Verdict over the whole Subject · many Anchors.
- **Closure:** Verdict actions closed; Anchor targets closed `{line,paragraph,step,region,cell}`; Reviewer kind closed `{human,agent}`; Subject membership open.
- **Mutability:** Intent + Rationale immutable at review-open; Subject artifact-set fixed at open (re-submit = new round); Verdict terminates; Anchor identity stable.
- **Identity:** Review = `review`-message id; Subject = task/bet output-bundle id; Anchor = block id; Rationale entry = opaque id → Anchor(s) + Intent item.
- **Hard rules:** (1) verdict resolves the Subject, never one Artifact; (2) dual anchor mandatory; (3) Rationale structured/decision-grained/searchable/immutable; (4) Anchors bind to block identity, never geometry; (5) every task is reviewed (human|agent); a bet review requires a human Reviewer; (6) no self-review; (7) one conversation per Subject, many anchors; (8) verdict grammar untouched.

## Rationale (why this shape)
The prior concept (`../product/human-ai-collaboration.md`) was written before the AL1 research (`../../plans/AL1/`). That research established that reviewing **agent-produced** work breaks the mature human-PR model, and this primitive answers each break: (1) the diff hides *why* and agents touch many files at once — *"the prompt is the real unit of review, not the diff"*, missing-context is the #1 AI-code complaint, and per-file approval is unbearable → **Subject (a set) + dual anchor + Rationale, one verdict over the set**; (2) volume and trust collapse, maintainers "moderating an AI spam filter" → **a review always happens, but the first-line Reviewer can be a trusted agent**, humans pulled in by autonomy + escalation; (3) anchored feedback is make-or-break — Frame.io's content-following anchors loved, Figma/Word coordinate anchors hated → **Anchors bind to block identity**. The headline insight from the founder act: a review is an *experience* of **examine + converse**, not a thread with a button — so the concept enumerates the parts and hands the layout to `/design`. Verdict grammar and renderers from the prior concept survive unchanged; this primitive deepens, not replaces.
