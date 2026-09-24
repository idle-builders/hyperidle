# Running Your Team

The day-to-day operating rhythm and a playbook for common situations. For what each view does, see [Three Core Views](three-core-views.md); for agent roles, see [Agents](agents.md).

## Rhythms

### Daily check-in (~3 minutes)

1. Glance at the **Sidebar** — an unread dot marks new notifications.
2. Open **Conversations** and handle waiting reviews. Each review shows compactly with an **Open review** button; the decision happens on the review page, not inline in the conversation.
3. Skim the **assistant** thread for anything notable.

### Weekly planning (~15 minutes)

1. Open **Work** — the overview is the landing page for all teams and their active tasks.
2. Click a team to open its team page.
3. Move 2–3 proposed tasks to `accepted` that are ready to start.
4. Kill or reshape stale work.

Task lifecycle semantics live in [Tasks and Sessions](../../process-layer/tasks-and-sessions.md).

### Weekly knowledge curation (~20 minutes)

1. Open **Knowledge**.
2. Work through the **Triage** tab — it is sorted by attention score, highest need first. Edit, resolve conflicts, archive.
3. Switch the sort to **recency** to see what agents have learned lately.

### Monthly reflection (~30 minutes)

1. Open the **assistant** pinned thread.
2. Read recent messages for cross-team patterns.
3. Reply with your thoughts. If a pattern warrants committed work, the assistant can draft a root task for you to review and activate.

## Handling Common Situations

### Turning a document into a task

When a captured insight is ready to become committed work, promote it directly — no retyping.

1. Open the document in the **Knowledge** view.
2. Click the overflow menu (`···`) in the top-right corner.
3. Choose **Promote to task**.

**Single team:** the task is created immediately and you land in the task page, body pre-filled with the document's content. Review, refine, then move it from `proposed` to `accepted` when ready.

**Multiple teams:** you are taken to the task create page (`Work → New task`) with the body pre-filled. Pick your team, then create.

The source document is not changed. The new task opens in `proposed` status — you accept it manually when the description is ready. The task header shows "From knowledge: &lt;title&gt;" with a link back to the original document, so the origin is always traceable.

**Archived documents cannot be promoted.** Archive the document only when you no longer need it as a promotion source, or after the derived task has been accepted.

### No subtasks after accepting a task

After you accept a task, the subtask section shows "No subtasks yet." Subtasks are added by agents on the team as they break down the work, or by you directly.

If no subtasks appear after the team has been running for a while:

1. Check that an active AI agent exists on the team. Navigate to the team page and confirm there is at least one agent with an appropriate role (builder, product manager, etc.).
2. If no agent is present, click **Add an agent** (visible in the "No subtasks yet" state) or navigate to the team page directly.

Task and session lifecycle detail lives in [Tasks and Sessions](../../process-layer/tasks-and-sessions.md).

### An agent is blocked

1. The blocked state shows as a status chip on the conversation.
2. Open the conversation — the review shows compactly with an **Open review** button.
3. Click **Open review** to reach the review page; the artifact view shows what the agent is waiting on.
4. Decide with the verdict buttons: **Approve** or **Request changes**, or open the overflow menu for **Approve with comments**, **Edit**, or **Reject**. There are no verdict keyboard shortcuts — `Esc` closes the open artifact.
5. The agent resumes immediately; the conversation shows a one-line verdict echo.

The verdict grammar is defined in [Thread Primitive](../../human-interface-layer/thread-primitive.md).

### Killing a task

Killing a task stops its in-flight work and kills its entire subtree.

1. Open the task, click the overflow menu (`···`), and choose **Kill**.
2. A confirmation dialog explains exactly what happens:
   - **The entire subtask tree is killed** and their active sessions are stopped.
   - **Existing artifacts are preserved** — nothing already produced is deleted.
   - **Running agents finish their current step first**, so killing is not an instant stop.
3. Enter a reason (required) and confirm.

### Viewing a task's sessions

Each task records the agent **sessions** that worked on it.

1. Open a task from its parent task or from the team page.
2. The **Sessions** section lists every session for that task.
3. A live green dot and an **Active** label mark a session that's currently running. Finished sessions show their final state — `Done`, `stopped` (if the task was killed), or `crashed`.
4. If no agent has started yet, you'll see **No sessions yet.**

### Knowledge conflict

When two agents (or an agent and you) modify the same document at the same time: whoever saves first wins. The second, stale save is refused outright and simply discarded — there is no per-field merge, and nothing is kept for you to resolve. If your own edit gets refused, reload the document and redo the change against its current body.

Sync and conflict mechanics live in [Sync and Conflict Resolution](../../knowledge-architecture/sync-and-conflict-resolution.md).

### You disagree with an agent's approach

1. Click **Open review** on the review in the conversation.
2. On the review page, click **Request changes**.
3. Add a comment explaining what you want differently.
4. The agent revises and resubmits.

## Keeping work bounded

HyperIdle does not track or enforce spend. Your ceiling is the budget on your upstream provider account (OpenRouter, Anthropic), set there.

What HyperIdle does bound is **concurrency** — how much runs at once: each agent has a maximum number of simultaneous sessions (default 1). At the limit, new work queues or moves to a teammate.

You can see agent status on **Work → Team**. The reasoning behind bounding concurrency rather than time lives in [WIP Limits](../../process-layer/wip-and-cost-limits.md).
