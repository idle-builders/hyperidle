# Running Your Team

The day-to-day operating rhythm and a playbook for common situations. For what each view does, see [Three Core Views](three-core-views.md); for agent roles, see [Agents](agents.md).

## Rhythms

### Daily check-in (~3 minutes)

1. Glance at the **Sidebar** — an unread dot marks new notifications.
2. Open **Conversations** and handle waiting reviews. Each review shows compactly with an **Open review** button; the decision happens on the review page, not inline in the conversation.
3. Skim the **assistant** thread for anything notable.

### Weekly planning (~15 minutes)

1. Open **Work** — the overview is the landing page for all teams and bets.
2. Click a team to open its team page.
3. Activate 2–3 draft bets that are ready.
4. Kill or reshape stale work.

Bet lifecycle semantics live in [Bets](../../process-layer/bets-shape-commit-change-ship.md).

### Weekly knowledge curation (~20 minutes)

1. Open **Knowledge**.
2. Work through the **Triage** tab — it is sorted by attention score, highest need first. Edit, resolve conflicts, archive.
3. Switch the sort to **recency** to see what agents have learned lately.

### Monthly reflection (~30 minutes)

1. Open the **assistant** pinned thread.
2. Read recent messages for cross-team patterns.
3. Reply with your thoughts. If a pattern warrants committed work, the assistant can draft a bet for you to review and activate.

## Handling Common Situations

### Turning a knowledge item into a bet

When a captured insight is ready to become committed work, promote it directly — no retyping.

1. Open the knowledge item in the **Knowledge** view.
2. Click the overflow menu (`···`) in the top-right corner.
3. Choose **Promote to bet**.

**Single team:** the bet is created immediately and you land in the bet page, body pre-filled with the item's content. Review, refine, then choose **Activate bet** from the bet's overflow menu when ready.

**Multiple teams:** you are taken to the bet create page (`Work → New bet`) with the body pre-filled. Pick your team, then create.

The source knowledge item is not changed. The new bet opens in `draft` status — you activate it manually when the description is ready. The bet header shows "From knowledge: &lt;title&gt;" with a link back to the original item, so the origin is always traceable.

**Archived items cannot be promoted.** Archive the item only when you no longer need it as a promotion source, or after the derived bet has been activated.

### No tasks after activating a bet

After you activate a bet, the task section briefly shows "Planning the work" while an eligible team agent breaks the bet into tasks. If that state persists or a blocker appears:

**"No one can take this work"** — The team has no active AI agent eligible to own tasks.

1. Click **Add an agent** in the blocked state, or navigate to the team page directly.
2. Add an agent with a team role (builder, product manager, growth, etc.).

The current build exposes no re-plan control on an active bet, so planning does not restart automatically after you add the agent.

**"Couldn't plan the work"** — The planning turn failed or produced an empty breakdown. Review the bet's goal and done condition — make them specific and actionable.

**Still planning after several minutes** — This should not happen. A hung planning turn resolves to a blocker automatically on the next server restart.

Task and session lifecycle detail lives in [Tasks and Sessions](../../process-layer/tasks-and-sessions.md).

### An agent is blocked

1. The blocked state shows as a status chip on the conversation.
2. Open the conversation — the review shows compactly with an **Open review** button.
3. Click **Open review** to reach the review page; the artifact view shows what the agent is waiting on.
4. Decide with the verdict buttons: **Approve** or **Request changes**, or open the overflow menu for **Approve with comments**, **Edit**, or **Reject**. There are no verdict keyboard shortcuts — `Esc` closes the open artifact.
5. The agent resumes immediately; the conversation shows a one-line verdict echo.

The verdict grammar is defined in [Thread Primitive](../../human-interface-layer/thread-primitive.md).

### Killing a bet

Killing a bet stops its in-flight work and frees your team's capacity for other bets.

1. Open the bet, click the overflow menu (`···`), and choose **Kill**.
2. A confirmation dialog explains exactly what happens:
   - **In-progress tasks are killed** and their active sessions are stopped.
   - **Existing artifacts are preserved** — nothing already produced is deleted.
   - **Team capacity is freed.**
   - **Running agents finish their current step first**, so killing is not an instant stop.
3. Enter a reason (required) and confirm.

### Viewing a task's sessions

Each task records the agent **sessions** that worked on it.

1. Open a task from its bet page.
2. The **Sessions** section lists every session for that task.
3. A live green dot and an **Active** label mark a session that's currently running. Finished sessions show their final state — `Done`, `stopped` (if the bet was killed), or `crashed`.
4. If no agent has started yet, you'll see **No sessions yet.**

### Knowledge conflict

When two agents modify the same knowledge:

- **Structured kinds** (pattern, anti-pattern, decision, failure) merge per-field, last-writer-wins, with a conflict record kept.
- **Prose** is never auto-merged — the facilitator creates a review for you to resolve.
- The conflict is visible on the knowledge item itself (banner) and raises its attention score, so it surfaces in Triage.

Sync and conflict mechanics live in [Sync and Conflict Resolution](../../knowledge-architecture/sync-and-conflict-resolution.md).

### You disagree with an agent's approach

1. Click **Open review** on the review in the conversation.
2. On the review page, click **Request changes**.
3. Add a comment explaining what you want differently.
4. The agent revises and resubmits.

## Keeping work bounded

HyperIdle does not track or enforce spend. Your ceiling is the budget on your upstream provider account (OpenRouter, Anthropic), set there.

What HyperIdle does bound is **concurrency** — how much runs at once:

- Each agent has a maximum number of simultaneous sessions (default 1). At the limit, new work queues or moves to a teammate.
- Each team has a capacity — the number of parallel tasks it will take on.

You can see capacity and status on **Work → Team**. The reasoning behind bounding concurrency rather than time lives in [WIP Limits](../../process-layer/wip-and-cost-limits.md).
