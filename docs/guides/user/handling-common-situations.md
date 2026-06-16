## Handling Common Situations

### Turning a Knowledge Item into a Bet

When a captured insight is ready to become committed work, promote it directly — no retyping.

1. Open the knowledge item in the **Knowledge** view.
2. Click the overflow menu (`···`) in the top-right corner.
3. Choose **Promote to bet**.

**Single team:** the bet is created immediately and you land in the bet editor, body pre-filled with the item's content. Review, refine, then click **Commit** when ready.

**Multiple teams:** you are taken to the bet create page (`Work → New bet`) with the body pre-filled. Pick your team, optionally set an appetite, then create.

The source knowledge item is not changed. The new bet opens in `draft` status — you commit it manually when the pitch is ready. The bet header shows "From knowledge: &lt;title&gt;" with a link back to the original item, so the origin is always traceable.

**Archived items cannot be promoted.** Archive the item only when you no longer need it as a promotion source, or after the derived bet has been committed.

---

### No Tasks After Committing a Bet

After you commit a bet, the task section briefly shows "Planning the work" while the PM agent breaks the bet into tasks. If that state persists or a blocker appears:

**"No one can take this work"** — The team has no active AI agent eligible to own tasks.
1. Click **Add an agent** in the blocked state, or navigate to the team page directly.
2. Add an agent with a team role (builder, product manager, growth, etc.).
3. Commit the bet again — the PM agent will now have eligible owners to assign tasks to.

**"Couldn't plan the work"** — The PM agent turn failed or produced an empty breakdown.
1. Review the bet's goal and done condition — make them specific and actionable.
2. Click **Commit** again from the overflow menu (`···`) on the bet.

**Still planning after several minutes** — This should not happen. A hung turn resolves to a blocker automatically on the next server restart. If it persists, restart the server.

---

### An Agent is Blocked

1. Sidebar shows a blocked agent with duration
2. Click to open the review thread
3. Artifact view shows what the agent is waiting on
4. Press `A` to approve, `R` to request changes, or `X` to reject
5. Agent resumes immediately

### A Bet is Over Budget

1. Cost thread appears in Conversations
2. Review the spend breakdown
3. Options: adjust the appetite, reduce scope, or kill the bet

### Adjusting a Bet's Appetite

The **appetite** is how much money you're willing to spend on a bet — a budget, not a duration.

1. Open the bet and click the overflow menu (`···`) next to the status badge.
2. Choose **Adjust appetite** (available on `active` bets only).
3. Pick a currency and enter the new amount (in whole units, e.g. `250` for $250).
4. Add a reason — it's recorded in the bet's revision log — and click **Save**.

The appetite chip on the bet updates immediately.

### Killing a Bet

Killing a bet stops its in-flight work and frees your team's capacity for other bets.

1. Open the bet, click the overflow menu (`···`), and choose **Kill**.
2. A confirmation dialog explains exactly what happens:
   - **In-progress tasks are killed** and their active sessions are stopped.
   - **Existing artifacts are preserved** — nothing already produced is deleted.
   - **Team capacity is freed.**
   - **Running agents finish their current step first**, so cost may tick up briefly before they halt — killing is not an instant cost cut-off.
3. Enter a reason (required) and confirm.

### Viewing a Task's Sessions

Each task records the agent **sessions** that worked on it.

1. Open a task (from the Kanban board or the task detail view).
2. The **Sessions** section lists every session for that task.
3. A live green dot and an **Active** label mark a session that's currently running. Finished sessions show their final state — `Done`, `stopped` (if the bet was killed), or `crashed`.
4. If no agent has started yet, you'll see **No sessions yet.**

### Knowledge Conflict

When two agents modify the same knowledge:
- Structured data: last-writer-wins with conflict flag
- Prose: facilitator creates a review thread for you to resolve
- You see the conflict in the Knowledge detail view

### You Disagree with an Agent's Approach

1. Press `R` (Request Changes) on the review item
2. Add a comment explaining what you want differently
3. The agent revises and resubmits
