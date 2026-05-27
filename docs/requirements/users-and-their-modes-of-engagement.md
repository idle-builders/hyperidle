## 1. Users and Their Modes of Engagement

HyperIdle has a unified user model — humans and agents are rows in the same `users` table, distinguished by a `kind` column (`'human' | 'ai'`). The system serves both equally well. The human experience is an app they open. The agent experience is a set of primitives they interact with programmatically.

### 1.1 Human Users (Founders)

Two founders: a CEO and a CPO. Their time is the scarcest resource in the factory. Every human-facing requirement exists to maximize the value extracted per minute of human attention.

The founders engage through six interaction modes, each with a distinct rhythm and cognitive demand:

**Review (seconds, reactive).** Approve, reject, or comment on concrete proposed actions. The target is 15-second decidability for simple items, with room for multi-turn conversation when the item warrants it. This is the daily driver.

**Prioritize (ambient, daily).** Glance at factory state — active bets, blockers, cost burn, items awaiting ordering. Three minutes with morning coffee. No decisions required, just awareness and occasional nudges.

**Create (minutes, proactive).** Founders are not just reviewers — they actively create:
- **Bets** — author markdown pitches and commit bets directly from the Work Canvas.
- **Knowledge** — write knowledge items at any scope (factory, product, practice, team, bet, task, or user-private).
- **Conversations** — initiate threads with specific agents via the RecipientPicker (N key).
- **Session dial-in** — observe a running agent session's live activity stream (D key). Read-only with filter tabs (All | Tools | Reasoning | Cost).

**Bet (weekly, focused).** Pick which 2–3 shaped options the factory works on next. Commit pitches from the shaped pool with a hard capacity cap. Create new bets with markdown pitches. Fifteen minutes, once a week. Forces trade-offs through explicit limits.

**Coach (monthly, conversational).** Talk with the Chief of Staff agent about how the factory is running — cross-product patterns, recurring obstacles, rule changes. Accessible via the Chief of Staff overlay (bottom-right Rail button), deliberately engaged monthly.

**Curate (weekly, editorial).** Tend the cross-product knowledge base. Prioritize the agenda, flag wrong-looking items, prune stale knowledge, author new items at any scope. Twenty minutes, once a week.

### 1.2 Agent Users

Agents interact with HyperIdle through five primitives: workspace, skills, inbox, memory, and rhythm. Agents never see a UI. Their experience is defined by the APIs, schemas, and data stores they read from and write to. Agents share the same `users` table as humans, with `kind='ai'`, and participate in threads, review routing (via `org_edges`), and team membership through the same data model.

---
