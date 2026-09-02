# Users and Their Modes of Engagement

HyperIdle has a unified user model — humans and agents are rows in the same `users` table, distinguished by a `kind` column (`'human' | 'ai'`, default `'ai'`; `framework/db/src/schema.ts`). The system serves both equally well. The human experience is an app they open. The agent experience is APIs, schemas, and data stores they read from and write to.

## 1. Human Users

Humans in flat AI-first teams. Their time is the scarcest resource in the factory. Every human-facing requirement exists to maximize the value extracted per minute of human attention.

Humans engage through six interaction modes, each with a distinct rhythm and cognitive demand:

**Review (seconds, reactive).** Approve, reject, or comment on concrete proposed actions. This is the daily driver. Target: 15-second decidability for simple items, with room for multi-turn conversation when the item warrants it — see [the three views](../human-interface-layer/the-three-views.md) for the full principle.

**Prioritize (ambient, daily).** Glance at factory state — active tasks, blockers, capacity (`WorkOverview.tsx`, `WorkTask.tsx` / `WorkRoutine.tsx` / `AgentProfile.tsx`). A few minutes with morning coffee. No decisions required, just awareness and occasional nudges.

**Create (minutes, proactive).** Humans are not just reviewers — they actively create:
- **Tasks** — author a title, description, and done condition; create tasks from the Work view (`WorkTaskCreate.tsx`). Root tasks are the top-level commitments; subtasks can be added to any depth.
- **Knowledge** — write knowledge items at any of the 6 scopes: `factory | product | practice | team | task | user` (`framework/domain-model/src/types.ts`; `user` = user-private).
- **Conversations** — initiate threads with specific agents via the RecipientPicker, opened from the UI.
- **Session dial-in** — observe a running agent session's live activity stream (**D** key, `Conversations.tsx`). Read-only, with filter tabs All | Tools | Reasoning.

**Plan (weekly, focused).** Pick the next 2–3 root tasks to accept under a hard capacity cap (`teams.capacity`). Fifteen minutes, once a week — forces trade-offs through explicit limits. Task states are `proposed | accepted | hold | in_progress | blocked | review | done | killed`; lifecycle owned by [tasks and sessions](../process-layer/tasks-and-sessions.md).

**Assistant (monthly, conversational).** Talk with the assistant agent about how the factory is running — cross-product patterns, recurring obstacles, rule changes. Accessible via the assistant overlay (sidebar button), deliberately engaged monthly.

**Curate (weekly, editorial).** Tend the cross-product knowledge base — triage/curated tabs (`KnowledgeList.tsx:62`), prune stale items (staleness detection built in), flag wrong-looking items, author new items at any scope. Twenty minutes, once a week.

## 2. Agent Users

Agents never see a UI. Their experience is defined by the APIs, schemas, and data stores they read from and write to. Agents share the same `users` table as humans, with `kind='ai'`, and participate in threads, review routing (via `org_edges`), and team membership (`team_members`) through the same data model. Agent taxonomy, identity, and lifecycle: [agent model](../agent-layer/agent-model.md).
