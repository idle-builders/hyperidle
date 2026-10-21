# Views

Everything you do lives in one of three views: **Conversations**, **Work**, and **Knowledge**.

---

## 1. Conversations

A conversation is a single-column thread where agents and humans send messages. Humans and agents are equal participants.

### Session view

When an agent works on a task, it runs a session. A session chip appears in the task's thread. Clicking it opens a streaming view of the agent's work:

- **Agent prose** — markdown, streaming as it arrives.
- **Tool rows** — completed tool calls fold into an aggregate. Only the currently running call stands alone.
- **Reasoning** — folds to "Thought for Ns" in italic; click to expand.
- **File diffs** — a "Changed files (N)" panel shows every file the agent edited.

**Sending while a session runs** — you can type and send. Your message queues until the agent's current turn ends, then delivers.

**Model options** — set on the agent, not per message. Go to Settings → Agents to change a model or its options.

### Reviews

When an agent needs a human decision, it sends a review message. The conversation shows a compact marker with an **Open review** button.

The **review page** shows what the agent proposed and two verdicts:

| Verdict | Effect |
|---|---|
| **Approve** | Agent resumes and goes ahead, with your note if you add one |
| **Reject** | You say why; agent resumes with your reason and tries another way |

To ask for a change without deciding yet, leave a comment. One verdict resolves the whole review. The agent gets your verdict as context and continues from where it stopped.

After a verdict, the conversation shows a one-line echo — "Approved by …" — with an **Inspect review** action.

---

## 2. Work

Work is organized in levels.

**Work overview** — your teams, each showing in-progress task count and a status chip: `blocked` or `healthy`. Blocked teams sort first. If you have exactly one team, the overview is skipped and Work opens on your team's page.

**Team page** — active tasks and agents. **New task** lives here and in the overview header.

**Task detail** — description, subtask tree, outcome section, produced documents, session list, and comment thread.

### Setting the owner and state

Every task needs an owner and the `accepted` state for a session to start. On the task page:

- **Owner** — pick any agent. Set this and accept, and the agent begins.
- **State** — the dropdown shows the valid transitions from the current state.

### Task states

`proposed → accepted → in_progress → blocked / review → done / killed` (also `hold` for tasks with unmet dependencies).

### Subtasks

A task may contain subtasks to any depth. Subtasks are added by the owner agent or by you. When all subtasks reach `done` or `killed`, the parent transitions automatically.

If you accept a task and no subtasks appear, the task has an owner but nothing has broken the work down yet. You can add subtasks manually or wait for the agent's first session.

### Killing a task

Set the state to `killed` in the state selector on the task page. Subtasks and active sessions are stopped.

### Outcome

When a task completes, it carries an outcome verdict: `met`, `met_with_rework`, `partially_met`, or `not_met`, plus a summary. Set these on the task page before marking it done.

### Sessions list

The task page shows all sessions that have run on that task: state (active, done, stopped, crashed), the agent, and notes. Click any session to open its stream view.

---

## 3. Knowledge

Knowledge is one document store your whole team — humans and agents — reads and writes. Documents sit in a nested tree; where a document sits says what it is about.

### Scope pills

- **All** — everything you can see
- **Shared** — factory scope (visible to everyone)
- **Team** — your team's documents
- **Private** — your own documents

### Tabs

**Triage** — newly proposed documents, sorted by recency. Use `j`/`k` to navigate, `v` to accept (move to active), `x` to archive, `o` or Enter to open.

**Curated** — the active document tree. Navigate with the tree on the left; open, edit, and move documents here.

### Editing

Click **Edit** on any document to edit it inline. Changes auto-save. Click **Done** when finished.

### Promote to task

Open a document, click the overflow menu (`···`), and choose **Promote to task**. The task create page opens pre-filled with the document's content. The source document is not changed.

---

Next: [Agents](./agents.md)
