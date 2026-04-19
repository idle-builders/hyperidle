# HyperIdle User Guide

HyperIdle is an operating system for running a Product Factory — a portfolio of digital products where AI agents do the implementation work, and human founders validate and steer.

---

## What Is HyperIdle?

You are a founder (CEO or CPO) managing a fleet of AI agents organized into product teams. Each team has a Product Manager, Builders, Growth Agents, and Ops Agents — all AI. Your job is to shape the work, review the output, curate the knowledge, and coach the system. HyperIdle gives you the interface to do this in minutes per day.

### Core Principles

- **AI recommends, humans decide.** Agents propose. You approve, reject, or redirect.
- **Thoroughness is cheap.** Agents cover every edge case, write every test, read every doc. You focus on judgment calls.
- **Knowledge compounds.** Every decision, pattern, and lesson is captured and reused across the factory.

---

## Getting Started

### Installation

```bash
bun install
bun run setup --profile laptop
bun dev
```

Open [http://localhost:5173](http://localhost:5173). The factory is seeded with sample products, agents, and routines so you can explore immediately.

### First Login

The app opens to **Conversations > Review** — this is your primary workspace. From here you can:

1. **Scan the Rail** (right sidebar) — blocked agents, cost burn, unread count
2. **Handle review items** — approve, reject, or request changes on agent work
3. **Navigate** via the Icon Rail (left sidebar) to Work, Knowledge, or Settings

---

## The Interface

```
┌──────────┬────────────┬───────────────────┬─────────┐
│ Icon     │ Submenu    │ Main Pane         │ Rail    │
│ Rail     │            │                   │ (HUD)   │
│ (nav)    │ (filters)  │ (content)         │         │
└──────────┴────────────┴───────────────────┴─────────┘
```

- **Icon Rail** (left): Top-level navigation. Icons for Conversations, Work, Knowledge. Avatar at the bottom opens Settings.
- **Submenu**: Context-sensitive filters for the current view.
- **Main Pane**: Where the work happens — review threads, kanban boards, knowledge items.
- **Rail** (right): Always-visible heads-up display. Shows blocked agents, cost burn rate, unread counts, and active bet progress.

---

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

#### Chief of Staff Thread

A pinned thread at the top of Conversations. Your Chief of Staff agent surfaces cross-product patterns, monthly reflections, and coaching suggestions. This is where strategic conversations happen.

---

### 2. Work (weekly planning + daily tracking)

Work is organized in three levels:

**Portfolio** — All your products at a glance. Status cards show each product's cycle phase, lead agent, active bets, shipped work, and cost variance.

**Team** — Click a product to see its team view, which has two panels:

- **Canvas** (top): Shaped bets ready to be committed. Drag pitches onto the canvas to commit work. A hard capacity limit prevents overloading — the badge turns red if you exceed it.
- **Kanban** (bottom): Active tasks in four columns: Planned, In Progress, Blocked, Done. Tasks are grouped under their parent bet.

**Bet Detail** — Click a bet to see its full pitch, progress bar, cost tracker, task list, and comment thread.

#### Weekly Planning Workflow

1. Open **Work > Portfolio**
2. Click a product to enter **Team View**
3. Click **"+"** to open the **Pitch Selector** — browse shaped pitches
4. Commit 2-3 bets (drag to canvas, capacity is enforced)
5. Kill or reshape stale pitches
6. Done — agents start working

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

---

## The Rail (Heads-Up Display)

The Rail is your always-visible dashboard on the right side of the screen.

**Minimized** (icon strip): Blocked agent count, unread threads, daily cost burn.

**Expanded** (click to toggle): Full dashboard showing:
- Active bets with progress bars
- Blocked agents with how long they've been waiting
- Knowledge additions
- Cost burn rate (daily and weekly)
- System stability
- Unread breakdown
- Agent activity
- Recent completions

The Rail is the **only notification surface** in the app. No bell icon, no top-bar toasts — just the Rail.

---

## Global Search

Press **Cmd+K** (or **Ctrl+K**) from any view to search across:
- **Threads** — conversation content
- **Bets & Tasks** — work items
- **Knowledge** — titles and summaries

Results are grouped by type. Use arrow keys to navigate, Enter to open, Escape to close.

---

## Settings

Click your avatar in the Icon Rail to open Settings. Five sections:

| Section | What You Configure |
|---------|-------------------|
| **Profile** | Your name, role, preferences |
| **Products** | Product settings, cycle length, cool-down periods |
| **Agents** | Autonomy levels per agent per skill, pause/reactivate |
| **Notifications** | Per-type toggles, quiet hours, per-product mute |
| **Appearance** | Density (compact/default/comfortable), theme |

### Autonomy Levels

Each agent can have a different autonomy level per skill:

- **L1**: Every action needs your approval
- **L2**: Most actions approved, some autonomy for low-risk work
- **L3**: Mostly autonomous, you review important decisions
- **L4**: Fully autonomous unless blocked

Agents start conservative and earn more autonomy as their success rate justifies it.

---

## Agents

### Agent Types

**Factory-wide agents** (shared across all products):
- **Chief of Staff** — cross-product patterns, monthly coaching, strategic conversations
- **Practice Facilitators** (5) — one per discipline (Building, Growth, Product, Ops, Facilitation)
- **Infra Agent**, **Platform Agent**, **Scout**

**Product team agents** (one set per product):
- **Product Manager** (team lead)
- **Builder(s)** — implementation
- **Growth Agent** — analytics, experiments, marketing
- **Ops Agent** — deployment, monitoring

### How Agents Work

Agents run in **sessions** — bounded work units on a specific task. Each session:
1. Gets a materialized workspace (code, context, knowledge)
2. Works toward the task's done conditions
3. Creates review items when they need your approval
4. Finishes and captures learnings

You don't manage sessions directly. Agents pick up work from committed bets, run sessions, and surface results through Conversations.

---

## Cost Management

Costs are tracked at three levels, strictly nested:

```
Factory budget
  └── Team budget
       └── Agent budget
```

### How Limits Work

- **Agent cap hit**: Agent stops accepting new sessions
- **Team cap hit**: Team finishes in-progress work, takes no new tasks
- **Factory cap hit**: All teams stop

Hitting a limit always produces a conversation thread — it's never silent.

### What You See

- **Rail**: Daily and weekly burn rate
- **Work > Bet Detail**: Cost actual vs. cost cap per bet
- **Settings > Products**: Configure budgets per agent, team, or factory

---

## Notifications

### What Rings (Push Notifications)

- Blocking review items (medium risk or higher)
- Urgent chat items flagged by agents

### What's Silent

- Non-blocking reviews
- FYI items
- New knowledge additions

### Daily Digest

Low-priority items are batched into an evening digest.

### Quiet Hours

Configure in **Settings > Notifications**:
- Per-human quiet hours (e.g., 6pm-8am)
- Per-product silence (e.g., mute a product for the weekend)
- Per-agent noise dial (cap notifications from a noisy agent)
- Blocking items queue during quiet hours but don't push

---

## Daily Rhythms

### Daily Check-In (3 minutes)

1. Glance at the **Rail**: blocked agents, cost burn, unread count
2. Handle **blocking reviews** in Conversations (15 sec each, use keyboard shortcuts)
3. Check the **Chief of Staff** thread for anything notable
4. Done

### Weekly Planning (15 minutes)

1. **Work > Portfolio** — scan product status
2. Click a product — **Team View**
3. Commit 2-3 new bets from shaped pitches
4. Kill or reshape stale work
5. Done

### Weekly Knowledge Curation (20 minutes)

1. **Knowledge** — select a scope
2. **Needs Attention** — edit, merge, archive
3. **Recently Created** — see what agents are learning
4. Done

### Monthly Coaching (30 minutes)

1. Open the **Chief of Staff** pinned thread
2. Read recent messages and cross-product patterns
3. Reply with your thoughts
4. Chief of Staff drafts updates to principles/focus
5. Review and approve the changes

---

## Handling Common Situations

### An Agent is Blocked

1. Rail shows a blocked agent with duration
2. Click to open the review thread
3. Artifact view shows what the agent is waiting on
4. Press `A` to approve, `R` to request changes, or `X` to reject
5. Agent resumes immediately

### A Bet is Over Budget

1. Cost thread appears in Conversations
2. Review the spend breakdown
3. Options: increase the cap, reduce scope, or kill the bet

### Knowledge Conflict

When two agents modify the same knowledge:
- Structured data: last-writer-wins with conflict flag
- Prose: facilitator creates a review thread for you to resolve
- You see the conflict in the Knowledge detail view

### You Disagree with an Agent's Approach

1. Press `R` (Request Changes) on the review item
2. Add a comment explaining what you want differently
3. The agent revises and resubmits

---

## Deployment

Three profiles for different environments:

| Profile | Database | Best For |
|---------|----------|----------|
| **Laptop** | SQLite | Local development, trying things out |
| **VPS** | PostgreSQL (Docker Compose) | Self-hosted, single server |
| **Cloud** | Managed PostgreSQL | Production, scalable |

### Laptop Setup

```bash
bun install
bun run setup --profile laptop
export HYPERIDLE_API_KEY=your-secret-key
bun dev                              # development mode (terminal stays open)
```

#### Running as a Background Service (macOS)

To keep HyperIdle running after you close the terminal — and across reboots:

```bash
export HYPERIDLE_API_KEY=your-secret-key
bin/service install
```

This builds the frontend, installs a macOS LaunchAgent, and starts the server. HyperIdle will be available at [http://localhost:3001](http://localhost:3001) and will restart automatically on login.

| Command | What it does |
|---------|-------------|
| `bin/service install` | Build, install, and start the service |
| `bin/service stop` | Stop the server |
| `bin/service start` | Start the server |
| `bin/service restart` | Stop, rebuild if needed, and start |
| `bin/service status` | Check if the server is running |
| `bin/service logs` | Tail the server log |
| `bin/service uninstall` | Stop and remove the service |
| `bin/service rebuild` | Rebuild the frontend after code changes |

### VPS Setup

```bash
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD at minimum
bun run setup --profile vps
docker compose up -d
bun run db:migrate:pg
bun run db:seed:pg
```

### Cloud Setup

```bash
export DATABASE_URL=postgres://user:pass@host:5432/hyperidle
bun run setup --profile cloud
bun run db:migrate:pg
bun run db:seed:pg
```

See `docs/DEPLOYMENT.md` for full details.
