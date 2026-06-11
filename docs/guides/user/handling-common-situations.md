## Handling Common Situations

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
