# Running Your Team

A short playbook for common situations. For what each view does, see [Views](views.md); for agent roles and subscriptions, see [Agents](agents.md).

---

## Common situations

### Nothing is running

Check two things:

1. Does the task have an owner? Open the task and look at the Owner field. If it is empty, set one.
2. Is the task in `accepted` state? Both must be true for a session to start.

If the task has an owner and is accepted, check that the owner's harness is signed in: **Settings → Agent backends**.

### An agent is blocked

Open the task. If state is `blocked`, read the thread — the agent should have left a message explaining what it needs.

- If it sent a review, open the review page and give a verdict.
- If it left a plain message, reply in the thread. The agent is subscribed to its thread and will resume.

### You disagree with what an agent is doing

Open the task thread and reply. The agent will see your message on its next turn. For a mid-session redirect, you can also send while the session is active — your message queues and delivers when the current turn ends.

If the work has gone far enough the wrong way, give a **Reject** or **Request changes** verdict on its next review, or kill the task and start over with a clearer goal.

### Stale-save conflict

If you edit a document or task that another agent edited since you loaded the page, you will see a conflict notice. The server rejects the older version. Reload, review the newer state, then re-apply your changes.

### Turning a document into a task

Open the document in Knowledge. Click `···` → **Promote to task**. The task create page opens with the document's content pre-filled. Review, set an owner, then accept when ready.

### Installing plugins for more agents

Go to **Settings → Plugins**. The bundled **role-personas** plugin gives you seven shaped team agents. Install it, then go to the team page to see them. You can edit any agent the plugin brought.

---

Next: [Settings](./settings.md)
