## 8. Handoff: The Coordination Primitive

The 2026 ecosystem converged on handoff as the coordination primitive: an agent has a `transfer_to_X` tool, calls it, and the system tracks the active agent on the thread. We adopt this directly, inspired by Google's A2A (Agent-to-Agent) protocol's design: structured handoff messages with context IDs, explicit task states, and message parts.

### 8.1 Handoff protocol (A2A-inspired)

Every handoff is a structured message, not just a "transfer_to" call. The protocol borrows from A2A's JSON-RPC model but keeps it simpler — we don't need discovery or capability negotiation because all agents are known to the factory.

**Handoff message structure:**

```
handoff {
  context_id         # links this handoff to the task + thread (continuity across handoffs)
  from_agent         # who is handing off
  to_agent           # who receives (agent_id, 'human', or role like 'builder')
  task_id            # the task being worked
  reason             # why: 'phase_complete', 'skill_needed', 'blocked', 'escalation'
  status             # what the hander-off is reporting: 'working', 'completed', 'failed', 'canceled'
  message            # freeform context for the receiving agent
  artifacts          # list of file references produced so far
  remaining_work     # structured description of what's left
  created_at
}
```

**Task states in the handoff** (inspired by A2A):

- `working` — "I made progress but the task isn't done; pick up where I left off."
- `completed` — "My part is done; the next phase needs a different skill."
- `failed` — "I couldn't complete this; here's what went wrong."
- `canceled` — "This work is no longer needed" (rare; usually the task is `killed` directly).

The `context_id` is the thread ID on the task. Every handoff is also a thread message, so the full history of who handed off what to whom — with structured metadata, not just chat text — is preserved and readable by any participant.

### 8.2 Handoff inside a task

When an agent is working a task and needs to hand off, it:

1. Writes session notes about what it did and what's next (synced back via the Knowledge Fabric's file watcher).
2. Calls the `handoff` tool with a structured handoff message (status, reason, remaining work, artifacts).
3. The session ends; the new agent is set as the task's `owner`; the handoff message is written to the task's thread; the new agent receives a notification.
4. The new agent starts a session, reads the previous session's notes, the handoff message, and the task thread, and continues.

The `to_agent` can be a specific agent ID or a **role** (e.g., "builder", "growth-marketer"). If a role is specified, the team's facilitator (Product Manager) resolves it to the best available agent with that skill and capacity.

No supervisor decides the handoff itself. The agent decides. Same pattern as LangGraph Swarm or OpenAI Agents SDK handoffs. But the handoff message is structured, not just a string — making it parseable by the receiving agent and auditable by the facilitator.

### 8.3 Handoff between tasks

When a task completes and another task's last upstream dependency clears, the Dependency Watcher transitions the downstream task from `hold` to `accepted` and notifies the owner through its thread. The owner can then start a session. Dependency-chain progression is automatic; no central scheduler decides when to unblock — the state machine handles it.

The upstream task's completion produces a handoff message with status `completed` and the relevant artifacts, which the downstream task's owner can reference.

### 8.4 Handoff to a human

When an agent needs human input it can't proceed without, it produces a handoff with `to_agent: 'human'` and `reason: 'blocked'`. The task moves to `blocked`. When the human replies, the task can move back to `in_progress` and the agent starts a new session.

Handoff to a human is the same shape as handoff to another agent — a structured message on the thread and a state change. Humans are identities in the matrix.

### 8.5 Handoff is not workflow

Workflow engines wire transitions in advance. Handoff is decided at runtime by the agent that's closest to the work. The thread + structured handoff messages are what make this safe: the entire history of who handed off what to whom, with what status and artifacts, is preserved and any participant can read it.

### 8.6 Cross-team work: chat thread + cross-team tasks

Sometimes a bet needs work from a team that isn't the bet's owning team. The most common case is a **platform team** — a team whose product is a shared substrate (auth, billing, design system, infrastructure) that other product teams rely on. The Ambrovia team's bet might need a new endpoint from the platform team. The Nimmly team might need a new component from the design-system team.

The protocol is deliberately lightweight:

1. The requesting team's lead opens a **chat thread** to the providing team's lead (same Conversations infrastructure as everywhere else; team leads are just identities in the matrix). The chat explains what's needed, why, and the appetite.
2. If the providing team agrees to take it on, they add a **cross-team task** to the requesting team's bet. The task's `owner` is an agent from the providing team, not the requesting team. The task lives on the requesting bet (so the bet's done condition tracks it) but the work happens inside the providing team's capacity and rhythm.
3. The providing team treats the cross-team task like any other task — sessions, notes, handoffs, the lot. When done, the artifact lands where the requesting bet expects it and the cross-team task transitions to `done`.
4. If the providing team declines or pushes back on the appetite, the chat thread is the negotiation surface. If it can't resolve, escalate to the assistant thread.

Cross-team tasks should be the exception, not the default. **The goal is product teams with end-to-end ownership.** If a product team is constantly opening cross-team tasks, that's a smell — either the product team is missing a skill it should have on roster, or the platform team's interface is too low-level for the product team to consume. Either is a Practice item to surface and a possible team-membership change.

Platform teams are the legitimate exception: a billing team or a design-system team's whole job is to be depended on by other products. Those teams have a high cross-team task rate by design. For every other team, the rate should approach zero.

---
