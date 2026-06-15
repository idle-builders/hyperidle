# AL1 — Review: Information Architecture (extends the concept)

**This document contains zero design language** — no colors, no spacing, no typography, no layout positions, no component names, no interaction mechanics. It is the layer between the locked concept (`plans/AL1/concept.md` — the nouns and rules) and any future design: it enumerates every information element a review surfaces, why each exists, what it does, what belongs with what, and the order in which a reviewer comes to understand it. A fresh designer should be able to design the review from this document and the concept alone, without inheriting any prior visual decision.

**Read with:** `plans/AL1/concept.md` and `docs/human-interface-layer/review-primitive.md` (the concept defines Review, Subject, Intent, Rationale, Reviewer, Anchor, Verdict, Cost; this IA enumerates the information those nouns produce). Evidence base: `plans/AL1/AL1-review-experience-dossier.md`, `plans/AL1/AL1-voice-of-the-user.md`.

**The one job of a review:** let a reviewer (human or agent) answer "**can this be approved, or must something happen first?**" — and act on that answer. Every element below earns its place by serving that job; if an element does not help answer or act on that question, it does not belong.

---

## A. The elements (exhaustive)

Every atomic piece of information a review can contain. Each is listed with *what it is*, *why it exists* (the reviewer need it serves), and *what it does*.

### A1 — Orientation elements (who/what/standing)
- **Work identity** — the name of the unit of work under review (the task; or, at ship, the bet). *Why:* the reviewer must know what they are judging before anything else. *Does:* names the thing.
- **Author** — who/what produced the work (an agent, or a human), including whether it is an agent. *Why:* the reviewer calibrates trust and reads rationale differently for an agent vs. a person; the concept allows agent authors. *Does:* attributes the work.
- **Reviewer of record** — who is rendering the verdict (a human, or a trusted agent). *Why:* the concept makes "who reviews" the live axis; a review always happens, but the reviewer may be delegated, with a human reachable by escalation. *Does:* attributes the decision.
- **Standing** — the review's current state: awaiting a verdict, or resolved; and whether it is blocking (the author cannot proceed until it resolves). *Why:* tells the reviewer whether action is owed and how urgent. *Does:* states where the review is in its life.
- **Trust/autonomy context** — the autonomy level under which this work was produced, i.e. *why this needs a review at all* (new skill, high-risk action, factory-document change, budget event, flagged failure). *Why:* explains the review's existence and the depth of scrutiny warranted. *Does:* justifies the review.
- **Cost** — the tokens and money the producing session consumed. *Why:* the reviewer weighs spend against result and decides whether re-runs are worth it; the concept requires cost to be present on every review. *Does:* quantifies what the result cost.
- **Time** — when the work was produced / last activity. *Why:* freshness and ordering. *Does:* situates the review in time.

### A2 — Intent elements (what was asked)
- **Intent statement** — the captured "what was asked": the task's done-condition, specification, or prompt, snapshotted at review time. *Why:* the concept's first anchor — review judges against the ask, not a moving target; "the prompt is the unit of review." *Does:* states the target the work must meet.
- **Intent items** — the discrete, checkable parts the ask decomposes into. *Why:* lets the reviewer verify fulfilment piece by piece rather than as one vague blob. *Does:* breaks the ask into verifiable claims.
- **Per-item fulfilment** — for each intent item, whether it is addressed or not addressed. *Why:* this is the core "did it do the right thing" judgment. *Does:* marks each part met or unmet.
- **The gap(s)** — the intent items that are *not* addressed, named explicitly. *Why:* the single most decision-relevant fact ("what's missing"); the research names the unaddressed gap as the thing reviewers most need surfaced. *Does:* exposes what the work failed to do.
- **Intent-met summary** — the count/proportion of the ask that is met. *Why:* a one-glance readiness signal. *Does:* summarizes fulfilment.

### A3 — Result / Subject elements (what was produced)
- **Subject** — the work product under review: the *set* of one or more artifacts the task (or bet) produced. *Why:* the concept's unit of judgment; the verdict resolves the whole set, never a single file. *Does:* is the thing being judged.
- **Result headline** — a plain-language statement of the overall outcome (what the work achieved, as a whole). *Why:* lets a reviewer grasp the result without opening any artifact. *Does:* summarizes the outcome.
- **Artifact identity** — for each artifact in the Subject: its name/path. *Why:* lets the reviewer locate and refer to it. *Does:* names each produced thing.
- **Artifact kind** — what type of output each artifact is (code, document/prose, design/visual, data, or an action/operation). *Why:* the kind determines what its content and its review affordances are; the review experience must cover non-code kinds (the research's white space). *Does:* classifies each artifact.
- **Artifact result summary** — a one-line statement of what each artifact achieved. *Why:* lets the reviewer triage the set without reading every artifact's contents. *Does:* summarizes each artifact's outcome.
- **Per-artifact reviewed-state** — whether each artifact is unreviewed, reviewed, or flagged. *Why:* tracks progress across a multi-artifact Subject (the research's named need for large changes). *Does:* records the reviewer's coverage.
- **Artifact content** — the actual produced output, rendered per kind:
  - *Code:* the change (what was added/removed).
  - *Document/prose:* the rendered text as a reader sees it, plus any proposed edits (changes the reviewer can accept or reject, distinct from comments).
  - *Design/visual:* the asset, and its prior state for comparison (what it replaces).
  - *Data:* the resulting metrics/table, and *what changed* in the data (not only the query that produced it).
  - *Action/operation:* what the action will do and its consequences (impact, and how to undo).
  *Why:* the evidence behind the result, examined on a deep read; the content is detail, not the lead. *Does:* shows the actual output.

### A4 — Rationale elements (why)
- **Decisions** — the meaningful choices the author made while producing the work. *Why:* the concept's differentiator; the research names *missing reasoning* as the number-one problem reviewing agent work. *Does:* exposes the author's thinking.
- **Discarded alternatives** — for each decision, the options considered and rejected. *Why:* lets the reviewer judge whether the chosen path was sound. *Does:* shows what was not done, and that it was considered.
- **Confidence** — for each decision, how sure the author is. *Why:* directs the reviewer's scrutiny to where the author is least certain. *Does:* signals reliability per decision.
- **Decision↔evidence link** — the connection from a decision to the artifact spot(s) it affects and the intent item it serves. *Why:* lets the reviewer trace a claim to its proof and to the ask it fulfils. *Does:* ties why → what → asked.
- **Risk flags** — decisions or results the author (or the system) marks as risky or low-confidence. *Why:* the reviewer should be pulled to risks first. *Does:* nominates things needing human judgment.

### A5 — Conversation elements (the discussion)
- **The conversation** — the single discussion over this Subject. *Why:* the concept fixes one conversation per Subject; it is where feedback and back-and-forth live. *Does:* holds the dialogue.
- **General comments** — feedback on the Subject as a whole. *Why:* not all feedback is about one spot. *Does:* carries whole-Subject feedback.
- **Anchored comments** — feedback tied to a specific spot. *Why:* precise, point-of-reference feedback is the table-stakes capability reviewers demand. *Does:* attaches feedback to a place.
- **Anchor** — the precise spot a comment (or a rationale decision) attaches to: a line, a paragraph, a step, a region, a cell, depending on artifact kind. *Why:* the concept requires content-following anchoring by stable identity, so feedback survives changes (the loved-vs-hated differentiator in the research). *Does:* locates feedback within an artifact.
- **Replies / threading** — responses forming a thread under a comment. *Why:* discussion needs continuity. *Does:* structures back-and-forth.
- **Comment author** — who wrote each comment (human or agent). *Why:* the reviewer reads agent and human feedback differently. *Does:* attributes each comment.
- **Comment resolution** — whether a comment thread is open or settled. *Why:* the reviewer must know what is still outstanding. *Does:* tracks which feedback is closed.
- **Suggested edit** *(document/prose kind)* — a proposed concrete change the author or reviewer offers, which can be accepted or rejected, distinct from a comment. *Why:* a proposed edit is an applyable change, not a discussion; the research names this distinction as load-bearing. *Does:* proposes an applyable change.

### A6 — Attention elements (what needs the human)
- **Needs-attention set** — the derived collection of everything requiring action before approval: the unaddressed intent gap(s), risk/low-confidence flags, and unresolved blocking comments. *Why:* the reviewer's scarcest resource is attention; the things that need them must be reachable first ("pull the human in only where it matters"). *Does:* concentrates the decision-relevant problems.
- **Review progress** — how much of the Subject has been reviewed vs. remains. *Why:* tells the reviewer how far through they are and what is left. *Does:* measures coverage.

### A7 — Decision elements (the verdict and operations)
- **Binding verdict options** — the five terminal decisions that resolve the whole Subject: approve; approve with comments; request changes; edit (modify and approve the modified version); reject. *Why:* the concept's locked verdict grammar; this is the reviewer's exit and the point of the whole surface. *Does:* records the decision and ends the review.
- **Resolution** — once decided: which verdict was rendered, by whom, when. *Why:* the outcome and its accountability. *Does:* states how the review ended.
- **Non-binding operations** — comment, reply, anchored comment, snooze, escalate (pull in another reviewer — human or agent). *Why:* the reviewer needs to act short of a verdict, including handing off; escalate realizes "a human holds final judgment." *Does:* lets the reviewer act without resolving.
- **Triage operations** — move to the next/another artifact, jump to a gap or a flagged thing, mark an artifact reviewed, accept/reject a suggested edit, open/resolve a comment. *Why:* the reviewer must navigate and make progress through the Subject. *Does:* moves the reviewer through the work.

---

## B. Logical groups (what belongs together, and why)

The elements cluster into seven groups. Membership is by *shared purpose*, not by position.

1. **Orientation group** — A1 (work identity, author, reviewer, standing, trust context, cost, time). *Belongs together because:* it all answers "what is this and where does it stand," the first thing a reviewer needs.
2. **Ask group** — A2 (intent statement, items, per-item fulfilment, gaps, met-summary). *Together because:* it is the single question "what was asked, and is it met."
3. **Attention group** — A6 (needs-attention set, progress). *Together because:* it is the prioritized "what must I deal with," derived from across the other groups (gaps from the Ask group, flags from Rationale/Result, unresolved blocking comments from Conversation). It is a *view onto* other groups, not a separate store of facts.
4. **Result group** — A3 (Subject, result headline, per-artifact identity/kind/summary/reviewed-state, artifact content). *Together because:* it is "what was produced." The per-artifact content is the deep evidence within this group.
5. **Reasoning group** — A4 (decisions, alternatives, confidence, links, risk flags). *Together because:* it is "why it was done this way," and it threads into the Ask group (which item) and the Result group (which spot).
6. **Discussion group** — A5 (conversation, comments, anchored comments, anchors, replies, authors, resolution, suggested edits). *Together because:* it is the dialogue about the work.
7. **Decision group** — A7 (verdict options, resolution, non-binding operations, triage operations). *Together because:* it is "what I can do," and it is the purpose the whole surface exists to enable.

---

## C. Surfaces (groups composed into coherent surfaces, and why)

A *surface* is a coherent thing a reviewer perceives and works with. The groups compose into these surfaces:

- **The Review surface** — the whole, for judging one Subject. Composes the Orientation, Ask, Attention, Result, Reasoning, Discussion, and Decision groups for a single Subject. *Exists because:* a review is the indivisible act of judging one Subject against its Intent and recording a verdict; one Review = one Review surface.
- **The Examination sub-surface** — within the Review surface, the place where an artifact's actual content (A3 artifact content) is examined, per kind. *Exists as its own surface because:* the artifact is the author's produced output, materially different in nature from the review's own information *about* the work; it is evidence consulted on a deep read, not the primary read.
- **The Review queue surface** — the set of reviews awaiting a given reviewer, across all Subjects. *Exists because:* a reviewer needs to know what is owed to them and in what priority before entering any single review; the research names review-attention overload as a primary pain, and a state-prioritized queue as the answer. (Composes, per pending review, a reduced Orientation + Attention summary.)

---

## D. Layout spaces / placement (where surfaces live in the app's information structure)

Placement, not visual layout — *which part of the app's information structure each surface belongs to, and what it connects to.*

- A **Review** attaches to the unit of work it judges (a task; or a bet at ship-confirmation) and exists as the conversation hosted on that work's artifact/task/bet. *Therefore:* a Review surface is reachable **from the work item it belongs to** (a reviewer looking at the task/bet can reach its review), and **from the producing author's activity** (the work that triggered it).
- The **Review queue surface** belongs to the reviewer's own attention space — the place where things that need *them* are gathered, independent of which work they belong to. It is reached **from notification/attention routing** (the system pulling the reviewer in) and is the entry point that leads into individual Review surfaces.
- The **Examination sub-surface** is nested within its Review surface (an artifact is only examined in the context of the review judging it); it is not an independent destination.
- **Relationship to existing spaces:** reviews are conversations; they live in the same conversational fabric as other threads and are surfaced wherever that work appears (the work view for the task/bet; the reviewer's attention space for the queue). This IA does not introduce a new top-level space; it places the review within the work it concerns and the reviewer's attention.

---

## E. Pages / destinations (only where navigation requires one)

- **Review queue (destination)** — a navigable place listing the reviews awaiting the reviewer, prioritized by what needs them. Justified because a reviewer arrives needing to choose what to review next.
- **Review (destination)** — a navigable place for one Review surface (one Subject). Justified because a verdict is a discrete act on a discrete Subject that the reviewer must be able to link to, return to, and resolve.
- **No further pages are required.** The Examination sub-surface is part of the Review destination, not its own page. Whether the queue and an individual review are separate destinations or one is a design decision, not an IA requirement — the IA requires only that both the *list of what needs me* and *the act of judging one thing* are reachable.

---

## F. The flow of understanding (the order comprehension happens, and information priority)

This is the sequence in which a reviewer comes to understand a review, from most to least decision-relevant. It is about *information priority and order*, not visual hierarchy.

1. **Orient** — "What is this, who produced it, and does it need me?" (Orientation group, esp. work identity, author, standing.) The reviewer must be able to stop here if nothing needs them.
2. **Triage** — "What, if anything, must I deal with?" (Attention group: the gaps, the flags, the unresolved blocking comments — surfaced *before* the calm detail.) This is where a reviewer decides whether to engage deeply or approve.
3. **Judge the ask vs. the result** — "What was asked, what came back, and does it meet it?" (Ask group set against the Result group's headline + per-artifact summaries.) This is the core comprehension for a normal read.
4. **Examine the evidence** *(deep read, on demand)* — "Show me the actual output, the reasoning, and the discussion." (Result group's artifact content; Reasoning group; Discussion group.) Consulted only when the reviewer needs proof or context — secondary to steps 1–3.
5. **Decide** — "Record the verdict." (Decision group.) Always available; the exit of the flow.

**Priority, stated plainly:** primary information = orientation, the needs-attention set, the ask-vs-result judgment, and the decision (a reviewer can act on these alone). Secondary information = the artifact content, the rationale detail, and the discussion (the evidence, consulted on demand). The result/artifact content is *evidence*, not the lead — the lead is whether the result met the ask and what needs the human.

**Two reading modes the IA must support:**
- *Fast read:* steps 1–2 and 5 — orient, see what needs me, decide. The reviewer who approves without opening evidence must still be able to do so responsibly.
- *Slow read:* steps 1–5 including 4 — the reviewer drills into the evidence, reasoning, and discussion before deciding.

---

## G. Relationships and rules (IA-level dependencies)

- A **Review** judges exactly one **Subject**; a Subject contains one or more **Artifacts**.
- A **Verdict** resolves the **whole Subject** — never an individual artifact. (Per-artifact reviewed-state is progress, not a decision.)
- An **Intent** has **intent items**; each item is addressed or not; the unaddressed items are the **gap**.
- A **Rationale decision** links to the artifact spot(s) it affects (via an **Anchor**) and to the **intent item** it serves, and carries a **confidence**.
- A **Comment** is either general (whole Subject) or anchored (to an **Anchor** within an artifact); comments thread and resolve.
- A **suggested edit** exists only for editable artifact kinds (e.g. prose); it is an applyable change, distinct from a comment.
- The **needs-attention set** is *derived*, not authored: it is the union of unaddressed intent gaps + risk/low-confidence flags + unresolved blocking comments. It owns no facts of its own; it re-presents facts from other groups by priority.
- Every Review carries **Cost** and exactly one **Reviewer of record** for its binding verdict; the **Author** and the **Reviewer** are distinct parties (no self-review).
- A Review's **Examination** of an artifact exists only inside that Review; an Artifact's content is only meaningful in the context of the Intent it was meant to fulfil.

---

*This is the information architecture only. It deliberately says nothing about how any of it looks, is spaced, is colored, is grouped visually, is revealed, or is interacted with. Those are design decisions, to be made fresh from this document and the concept.*
