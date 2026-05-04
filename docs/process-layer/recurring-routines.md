## 9. Recurring Routines

Routines are how recurring work attaches to the factory. They are the mechanism for "weekly metrics review," "every Monday morning portfolio standup," "every PR triggers a copy review," "every hour the cost sentinel checks burn rate."

### 9.1 Three trigger shapes

- **Calendar (cron-shaped).** "Every Monday at 9am." "First of the month at 7am." Standard cron expressions.
- **Event-shaped.** "When an artifact of type `landing-page-copy` is published, run brand-voice review." Routines react to events emitted by other parts of the factory.
- **Heartbeat-shaped.** "Every hour, check cost burn." Continuous low-frequency loops. Equivalent to Letta's sleep-time agents in spirit.

### 9.2 Owned by a named agent, executable by teammates

Every routine has an owner — a specific named agent. The owner holds the *thread of memory* for the routine. The Growth Practice Facilitator owns "weekly metrics review," which means the GPF's memory contains "what I noticed last week, what I'm watching, what I want to check this week."

If `delegation_allowed: true`, a teammate with the same skill can pick up an execution when the owner is overloaded. The teammate writes back into the owner's memory state when finished. The muscle memory of "the GPF owns metrics" is preserved; the execution can flex with capacity.

If `delegation_allowed: false`, only the owner can run it. Some routines need the owner specifically (the Chief of Staff's monthly portfolio review, for example).

### 9.3 Sleep-time routines: memory-only runs

A routine can run as a sleep-time pass that updates the agent's memory without producing a thread or a review item. This is how an agent stays current on context that doesn't need a verdict.

Example: a "watch the brand-voice channel" routine runs every hour, summarizes new examples into the brand-voice agent's memory, and produces no thread. The agent is just... staying read-up. When it needs to ship a copy review, its memory is current.

This pattern is borrowed from Letta's sleep-time agents and is one of the most underused patterns in the 2026 ecosystem. It's how you get "always-current context" without paying for an always-running daemon.

### 9.4 Adding a routine (human-approved)

Routines are powerful and they compound. A misconfigured routine can burn cost forever silently. So **adding a routine is always a human review item**, the same way adding a skill is. The Chief of Staff or the routine's would-be owner drafts the routine, posts a review thread to the human, and on approval the routine becomes active.

Each routine carries an autonomy level (L1-L4). At L1, every run produces a review thread. At L4, runs are autonomous unless the routine explicitly blocks. Autonomy levels move up over time as the routine earns trust, same mechanism as skills.

### 9.5 Pruning routines

Routines drift. A weekly metrics review made sense for a product that was finding its footing; six months in it might be cargo cult. The Knowledge view view shows all active routines the human could prune. The Chief of Staff also flags routines that haven't produced anything actionable in a long time as candidates for retirement.

---
