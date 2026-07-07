# Three Core Views

Everything you do lives in one of three views: **Conversations**, **Work**, and **Knowledge**. This is the walkthrough of each. Concept-level framing lives in [the three views](../../human-interface-layer/the-three-views.md); per-view layout detail in the [information architecture docs](../../information-architecture/index.md). For how these views fit your day and week, see [Running your team](running-your-team.md).

---

## 1. Conversations — where you spend most of your time

A conversation is a calm, single-column read of the messages you and your agents deliberately send. Humans and agents are equal participants, grouped by author — one avatar, name, and time per run of messages from the same sender. Agents get a green avatar; your own messages carry a quiet "You" label. No bubbles, no badge soup.

### References show inline, not as bare links

When a message points at something — a code artifact, an image, a knowledge doc — it renders as a compact **reference chip** you click to open the real thing. A linked session shows as a quiet "Show session" chip; clicking it opens the **Session view** in a right panel alongside the conversation. Every other reference navigates to its own view. The conversation never renders a viewer in place.

### Session view — watching an agent work

When an agent works on a task, it runs a **session** — a bounded, streaming work run. Clicking a session chip opens a calm, append-only stream in the same column shape as a conversation:

- **Agent prose** — full-width markdown, streaming token-by-token, with a quiet caret on the in-progress turn.
- **Tool rows** — completed tool calls fold into a single "N steps" aggregate; the header signals failures ("· 1 failed") and the error shows on expand. Only the currently running call stands alone.
- **Reasoning** — folds to "Thought for Ns" in italic; click to expand.
- **File diffs** — a "Changed files (N)" panel surfaces every file the agent edited, always reachable even when the edits are folded into the aggregate. Click to open the full diff.
- **Sub-agent sessions** — a sub-agent tool row carries an "Open session" link into its own session view.
- **Cost** — the combined session total (`$0.71 · 48.2k tokens`) sits in the session header, not inline per turn.

**Sending mid-session.** You can type and send while the agent works. Your message queues ("Queued · sends when the agent finishes", cancellable with ✕) and is delivered at the next turn boundary — it never interrupts the agent.

**Composer pills.** The Session view composer shows model and option pills derived from the harness's capability descriptor. Available options depend on the harness; undeclared options are simply absent.

The session view is read-plus-queue, not a decision surface. Verdicts happen on the review page.

### Reviews open on the review page

A review request shows compactly in the conversation: a "Review requested" marker, the proposal line, the change-set as a reference chip, and one **Open review** button. You never approve or reject inside the conversation. Once decided, the conversation shows a one-line echo — "✓ Approved by …" — with a quiet **View review** link back.

### Review verdicts

The review page ships five decisions (full grammar in [thread primitive](../../human-interface-layer/thread-primitive.md)):

| Decision | Effect |
|---|---|
| **Approve** | Agent proceeds with the proposed change |
| **Approve with comments** | Proceeds, feedback attached |
| **Request changes** | Blocks the agent until it revises |
| **Edit** | You adjust the proposal yourself |
| **Reject** | Proposal is dead, agent moves on |

Approve is the primary button; approve-with-comments, edit, and reject sit in an overflow menu. There are no verdict keyboard shortcuts — only `Esc` (closes the review). Comments are a conversation section on the review page, not a verdict.

The artifact view shows exactly what changed; its embed shapes are defined in [artifact primitive](../../process-layer/artifact-primitive.md).

**After approving an action.** If the review carries an action (a refund, a merge, a send), approving triggers it immediately, and the action card shows a result band:

- Green **Executed** — completed; a short receipt confirms it (the merged commit SHA, the refund reference).
- Red **Execution failed** — the external tool errored; the exact error text is shown untruncated. A failed action is never silently swallowed.

### Quick questions

An agent can ask a quick question inline — a small "?" marker, the question, and answer buttons. The buttons render today but answering is not yet wired to the backend.

### The composer

One text box, one **Send**. The **"+"** button opens a tools menu — Insert block, Attach file, Mention, Reference item, Format, Emoji. Attachments show as draft reference chips above the box; remove one with its ✕. Plain send works today; the richer "+" actions route to their tools as those land.

### The assistant

Your assistant is not a pinned conversation — it opens as an overlay from the sidebar. See [The interface](the-interface.md).

---

## 2. Work — planning and tracking

Work is organized in three levels:

**Work overview** — a flat list of your teams: name, active-bet count, and a status chip (healthy / behind / blocked). Teams sort by urgency — blocked first, then behind, then healthy. If you have exactly one team, the overview is skipped and Work opens straight on your team's page.

**Team page** — burn-vs-capacity metrics, active bets, routines, and agents. **New bet** lives here and on the Work overview header.

**Bet detail** — the bet's description (rendered as Blocks), progress, cost tracker, task list, and comment thread. Lifecycle semantics live in [bets](../../process-layer/bets-shape-commit-change-ship.md).

### What the task section shows

The Tasks section on a bet detail page shows one of five states:

| State | What you see | What it means |
|---|---|---|
| Tasks present | Task rows with status chips | Agents are working or work is queued |
| Not committed | "Not committed yet" | The bet is still a draft; commit to start work |
| Planning | "Planning the work" with a live pulse | An agent is breaking the bet into tasks — takes a moment |
| Blocked — no agent | "No one can take this work" + Add an agent | No agent on the team can own tasks; add one to proceed |
| Blocked — failed | "Couldn't plan the work" | Planning failed; refine the goal and commit again |

Either tasks are there, or an honest reason explains why they aren't.

**Committing a bet** immediately triggers decomposition — an agent breaks the bet into tasks, which appear once its turn finishes. Task and session details live in [tasks and sessions](../../process-layer/tasks-and-sessions.md).

---

## 3. Knowledge — your team's shared memory

Knowledge is one store your whole team — humans and agents — reads and writes. Internally it is organized in five layers; that taxonomy lives in [the five layers](../../knowledge-architecture/the-five-layers.md).

### Scope pills

The knowledge list filters by four scope pills:

- **All** — everything you can see
- **Shared** — company-wide and cross-team knowledge
- **Team** — knowledge belonging to a team
- **Private** — your own items

### Browsing

Two tabs: **Triage** (draft items awaiting curation) and **Curated** (items grouped by topic). Sort pills: **relevance** (default), **recency**, **frequency**. Topic health indicators (fresh / some stale / mostly stale) help you spot areas needing attention.

### Curating

- **Edit** — inline markdown editing with auto-save; **Done** when finished.
- **Archive** — remove stale or superseded items.

Merge and split exist as API operations but have no UI yet; flagging is an agent operation, not a user action.
