# Three Core Views

Everything you do lives in one of three views: **Conversations**, **Work**, and **Knowledge**. This is the walkthrough of each. Concept-level framing lives in [the three views](../../human-interface-layer/the-three-views.md); per-view layout detail in the [information architecture docs](../../information-architecture/index.md). For how these views fit your day and week, see [Running your team](running-your-team.md).

---

## 1. Conversations — where you spend most of your time

A conversation is a calm, single-column read of the messages you and your agents deliberately send. Humans and agents are equal participants, grouped by author — one avatar, name, and time per run of messages from the same sender. Agents get a green avatar; your own messages carry a quiet "You" label. No bubbles, no badge soup.

### References show inline, not as bare links

When a message points at something — a code artifact, an image, or a knowledge doc — it renders as a compact **reference chip**. Clicking a contextual reference inspects the real object in a pane alongside the conversation, preserving your reading position and draft. **Back to conversation** folds the pane away. Structural **Open** actions still navigate to the object's full page.

### Session view — watching an agent work

When an agent works on a task, it runs a **session** — a bounded, streaming work run. Clicking a session chip opens a calm, append-only stream in the same column shape as a conversation:

- **Agent prose** — full-width markdown, streaming token-by-token, with a quiet caret on the in-progress turn.
- **Tool rows** — completed tool calls fold into a single "N steps" aggregate; the header signals failures ("· 1 failed") and the error shows on expand. Only the currently running call stands alone.
- **Reasoning** — folds to "Thought for Ns" in italic; click to expand.
- **File diffs** — a "Changed files (N)" panel surfaces every file the agent edited, always reachable even when the edits are folded into the aggregate. Click to open the full diff.
- **Sub-agent sessions** — a sub-agent tool row carries an "Open session" link into its own session view.

**Sending mid-session.** You can type and send while the agent works. Your message queues ("Queued · sends when the agent finishes", cancellable with ✕) and is delivered at the next turn boundary — it never interrupts the agent.

**Model options are set on the agent, not per message.** How an agent's model runs — its effort level, its variant, whatever its harness exposes — is part of configuring that agent, in Settings → Agents. Those options then apply to every run of that agent. What you can set depends on the harness and the model you picked; a model that exposes nothing simply shows no options.

The session view is read-plus-queue, not a decision surface. Verdicts happen on the review page.

### Reviews open on the review page

A review request shows compactly in the conversation: a "Review requested" marker, the proposal line, the change-set as a reference chip, and one **Open review** button that navigates to the review page. You never approve or reject inside the conversation. Once decided, the conversation shows a one-line echo — "✓ Approved by …" — with a quiet **Inspect review** action that opens the resolved review beside the conversation.

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

Work is organized in levels:

**Work overview** — a flat list of your teams: name, in-progress task count, and a status chip (healthy / behind / blocked). Teams sort by urgency — blocked first, then behind, then healthy. If you have exactly one team, the overview is skipped and Work opens straight on your team's page.

**Team page** — capacity and status, active tasks, routines, and agents. **New task** lives here and on the Work overview header.

**Task detail** — the task's description (rendered as Blocks), subtask tree, outcome section, and comment thread. A task may have subtasks to any depth; each subtask links to its own task page. Lifecycle semantics live in [tasks and sessions](../../process-layer/tasks-and-sessions.md).

### What the subtask section shows

The Subtasks section on a task page shows one of three states:

| State | What you see | What it means |
|---|---|---|
| Subtasks present | Subtask rows with status chips | Agents are working or work is queued |
| No subtasks yet | "No subtasks yet" + Add an agent | The task is accepted but no subtasks exist; add an agent or subtask to get work started |
| Proposed | State chip shows "proposed" | The task hasn't been accepted yet |

Either subtasks are there, or an honest reason explains why they aren't.

**Accepting a task** moves it from `proposed` to `accepted`. The subtask section shows "No subtasks yet" until agents on the team begin adding work. Task and session details live in [tasks and sessions](../../process-layer/tasks-and-sessions.md).

---

## 3. Knowledge — your team's shared memory

Knowledge is one store your whole team — humans and agents — reads and writes. Internally it is a nested tree, not a fixed layer ladder: where an item sits says what it's about. See [Knowledge Architecture](../../knowledge-architecture/index.md).

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
