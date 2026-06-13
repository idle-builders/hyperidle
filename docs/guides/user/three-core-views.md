## Three Core Views

### 1. Conversations (where you spend 90% of your time)

Conversations is the review and communication hub. It has two modes:

**Review** — Items that need your decision:
- Code diffs, copy drafts, deployment plans, configuration changes
- Each item has an artifact view (the thing being reviewed) and a verdict toolbar

**Chat** — Agent-initiated discussions:
- "I noticed 3 bets hit the same bug — want to discuss?"
- "This architecture choice has trade-offs, here's what I see"

#### Review Verdicts

When reviewing an item, you have these actions:

| Action | Shortcut | Effect |
|--------|----------|--------|
| **Approve** | `A` | Agent proceeds with the proposed change |
| **Request Changes** | `R` | Blocks the agent until they revise |
| **Reject** | `X` | Proposal is dead, agent moves on |
| **Snooze** | `S` | Revisit later (default 4 hours) |
| **Comment** | — | Add feedback without a verdict |
| **Escalate** | — | Flag for deeper review |

Most reviews take 15-30 seconds. The artifact view shows you exactly what changed — code diffs, content previews, before/after comparisons, or action summaries.

#### assistant Thread

A pinned thread at the top of Conversations. Your assistant agent surfaces cross-product patterns, monthly reflections, and coaching suggestions. This is where strategic conversations happen.

---

### 2. Work (weekly planning + daily tracking)

Work is organized in three levels:

**Portfolio** — All your bets in one place. A flat list of bet cards across all teams. Filter by status (active, completed, draft) or by team. Outcome-verdict filters (validated, refuted, partial, inconclusive) appear only once at least one bet has a recorded outcome — before that they are not shown. When the portfolio is empty, a create affordance explains what bets are and invites you to create the first one.

**Team** — Click a team name from the team screen to see its team view: burn-vs-capacity metrics, active bets, routines, and agents.

**Bet Detail** — Click a bet to see its full pitch, progress bar, cost tracker, task list, and comment thread.

#### Weekly Planning Workflow

1. Open **Work > Portfolio**
2. Click a team in the sidebar or navigate via a bet's team link to enter **Team View**
3. Click **"New bet"** to create a bet (title, pitch, team, appetite)
4. Review active bets and their progress
5. Done — agents start working

---

### 3. Knowledge (weekly curation)

Knowledge is the factory's institutional memory, organized in five layers:

| Layer | Scope | Examples |
|-------|-------|----------|
| **L0** | Session | Working context (ephemeral) |
| **L1** | Task | What was tried, what broke, what differed |
| **L2** | Product | Briefs, architecture, brand guidelines, decisions |
| **L3** | Practice | Cross-product patterns and anti-patterns per discipline |
| **L4** | Factory | Principles, monthly focus, portfolio strategy |

#### Three Knowledge Scopes

- **Practice** — grouped by discipline (Building, Growth, Product, Ops, Facilitation). Cross-product learnings.
- **Product** — per-product knowledge (architecture, briefs, decisions).
- **Factory** — your principles and strategic direction.

#### Browsing and Curating

The Knowledge view offers five sort modes: By Topic (default), Needs Attention, Recently Created, Most Accessed, and Stale.

Actions you can take:
- **Edit** — inline markdown editing with auto-save
- **Merge** — combine duplicate items
- **Split** — break an overloaded item into focused pieces
- **Flag** — mark for review
- **Archive** — remove stale or superseded items

Topic health indicators (Fresh / Some Stale / Mostly Stale) help you spot areas that need attention.

#### Weekly Curation Workflow

1. Open **Knowledge**
2. Select a scope (Practice, Product, or Factory)
3. Switch to **"Needs Attention"** view
4. Read, edit, merge, or archive items
5. Browse **"Recently Created"** to see what agents are learning
