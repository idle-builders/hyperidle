# Linear — what makes it killer (research notes)

## TL;DR — 2 lines
Linear's superpower is opinionated speed: a local-first sync engine that makes every action feel instantaneous, paired with a keyboard-first vocabulary (C/T/J/K/S/P/L) and a fixed lightweight workflow (Triage → Backlog → Todo → In Progress → Done) that no admin can mangle. For HyperIdle, the lesson is that taste plus a single enforced shape — not flexibility — is what creates trust and flow when humans direct AI agents.

## Founder's priority filter (overrides agent rankings — read this first)

**[CORE — first-class for HyperIdle]**
- **Fixed flows / state — feature not bug.** Pick the agent lifecycle once, refuse to make it configurable. Discipline > flexibility.
- **Code diffs inline.** Already on our roadmap; treat this as confirmation.
- **Automatism — auto-rollover, auto-close, auto-carry.** The "stuff that gets forgotten" must be invisible. Linear's biggest invisible win.
- **Create-anywhere-on-the-fly (`C`).** This is the shape of the **CoC (Chief of Staff)**: an access-anywhere assistant that does NOT pull other agents away from work. The CoC is HyperIdle's `C` key.

**[AVOID — explicitly don't borrow]**
- **Cycles.** Agents and cycles don't fit. HyperIdle is kanban-like, not sprint-like.

**[LATER — when integrations land]**
- **Triage as a place.** Gold pattern, but only matters once external sources push items in. Park it.

**[DEMOTE — late-stage polish, not the leverage point]**
- Optimistic UI / local-first sync engine
- Keyboard verbs (J/K, Cmd+K, S/P/L/A)
- Project Updates (recurring narrative posts)

Rationale: keyboard and optimistic UI matter eventually, but they aren't what makes Linear *loved*. The fixed flow + automatism + create-on-the-fly are. The CoC analogue is the most leveraged borrow.

## Signature features
| Feature | What it is | Why users love it | What HyperIdle borrows |
|---|---|---|---|
| Cycles | Fixed 1–8 week sprint with auto-rollover; can't set custom dates ("avoids busywork associated with optimizing cycle timing" — Linear docs) | Forced cadence without ceremony; nothing is lost between cycles | Bet appetites are the analogue — fixed length, automatic carry of unfinished work into next bet review |
| Triage | Special inbox where integration-created and outsider issues land before entering team flow | Single chokepoint for incoming noise; routine, not scattered | Conversations review feed: agent-surfaced items land in one Triage rail before becoming Work |
| Local-first sync engine | IndexedDB as primary store; mutations via GraphQL, sync via WebSocket; "every change happens locally first" (bytemash.net) | Sub-100ms interactions; "click an issue, it opens instantly" (HN, 2025) | Optimistic UI is non-negotiable for agent-state UI; treat the local store as truth-of-record |
| Opinionated workflow | One status pipeline: Triage → Backlog → Todo → In Progress → In Review → Done → Canceled. No custom-fields zoo | "Cannot replicate complex Jira workflows" is a feature, not a bug | Pick our agent lifecycle states once and refuse to make them configurable |
| Command palette (Cmd+K) | Universal action surface: create, assign, change status, label — all from typing | "shortcuts feel like the primary interface, with the mouse as the fallback" (Efficient.app) | Cmd+K on every page; agents and tasks are addressable via verbs not menus |
| Project Updates | Recurring narrative status post with health (On track / At risk / Off track) + rich text; reminders nudge owners | Single source of "where are we" without status meetings | Bet-level update posts authored by Founder, summarized by an agent |

## Core daily journey (engineer / PM)
| Step | User does | Why frictionless |
|---|---|---|
| Open app | Inbox is default landing | One place to see "what changed since I left" |
| Triage new asks | `G then T` to navigate; `1` accept, `2` duplicate, `3` decline, `H` snooze | Each decision is a single keystroke; no drop-downs |
| Work the cycle | Filter to current cycle, `J/K` to move between issues | Vim-style row nav keeps hands on keyboard |
| Update an issue | `S` status, `P` priority, `L` label, `A` assignee — all open inline picker | Modeless; can chain S→P→L without closing |
| Create on the fly | `C` from anywhere opens new-issue modal | "Create issue" is the most-used verb, so it gets the shortest binding |
| Capture sub-work | Open parent → "Add sub-issues"; parent auto-closes when all subs are done | Hierarchy without manual rollup math |
| Close the day | Inbox: `Backspace` to dismiss, `H` to snooze unresolved | Inbox-zero is fast, not aspirational |

## Keyboard system (the philosophy)
| Shortcut | Purpose | Why it's loved |
|---|---|---|
| `C` | Create issue from anywhere | Global, modeless; the most-used verb gets the shortest key |
| `J` / `K` | Navigate up / down rows | Vim heritage; same in inbox, lists, triage |
| `Cmd+K` | Command palette | Type any verb or destination; central to muscle memory |
| `G` then `<letter>` | Navigate ("Go to") — `G I` Inbox, `G T` Triage, `G B` Backlog | Two-stroke chord = no modifier hell |
| `S` / `P` / `L` / `A` | Set status / priority / label / assignee | Letter-only, single press, opens inline picker |
| `1` / `2` / `3` | Triage: Accept / Duplicate / Decline | Numeric row maps to ordered choices |
| `H` | Snooze | Unified across inbox, triage, notifications |
| `Backspace` / `Shift+Backspace` | Delete one / delete all notifications | Email-keyboard parity |
| `Cmd/Ctrl+Shift+M` | Move issue between teams | One of the few modifier shortcuts; rare action |

Philosophy notes: Linear avoids the `Ctrl` modifier almost entirely; nearly everything is a bare letter or `G`-prefixed chord. As one HN commenter put it: "It's like they know what I'm about to click on before I do."

## Killer micro-interactions
| Interaction | Pattern | Notes |
|---|---|---|
| Optimistic UI | Mutation applied to local IndexedDB instantly, then GraphQL mutation + WebSocket reconcile in background | Removes network latency from the interaction path |
| Submenu safe-triangle | When hovering a submenu, mouse can move diagonally without closing it (CSS `clip-path` polygon between cursor and submenu) | "One small thing you won't see but will feel" — Linear engineering blog |
| Auto-rollover | Unfinished issues silently carry to next cycle | Eliminates manual sprint hygiene |
| Auto-close parent | When all sub-issues done, parent flips to Done | Hierarchy without rollup work |
| Capacity dial | Cycle view shows likelihood of completion based on prior 3 cycles' velocity | Forecast without spreadsheets |
| Bidirectional Slack/email sync (Asks) | Comment in Linear posts back to Slack thread | Stakeholders don't have to switch context |
| Snooze with smart re-trigger | Snoozed item resurfaces if new activity occurs before timer expires | Snooze is intent, not just hide |

## What people specifically rave about
| Source | Quote / observation | What it tells us |
|---|---|---|
| HN, gkoberger | "Linear might be the best-made software I've seen in a decade" | Aesthetic + speed make a brand on their own |
| HN, ghayes | "Even under attack, Linear is faster than JIRA" | Performance is the default, not a feature |
| HN, erex78 | "It's like they know what I'm about to click on before I do" | Predictive UI / optimistic UI feels telepathic |
| HN, plainOldText | "Sprinkled with details that show care" | Invisible polish accumulates into trust |
| Lenny's Newsletter / Karri Saarinen | "3–5 people with good taste make better decisions than large committees" | Founder-driven taste beats committee design |
| Linear (firstround) | Engineers rated Linear 4.6/5 UX vs Jira 3.2/5 (2024 survey) | Quantified developer satisfaction gap |
| ProductManagementResources | "Creating an issue: Linear 8s vs Jira 45s" | Specific friction reduction = mass switching |
| Figma blog | "You shouldn't need a handbook to start using Linear" | Onboarding by convention, not training |

## Common complaints (anti-patterns to avoid)
| Complaint | Why it bites | HyperIdle implication |
|---|---|---|
| Single-assignee constraint | Real work has shared ownership | For agents, owner is always one agent; for humans, accept it as a feature |
| No board / swimlane views | PMs who think in Kanban feel boxed in | Pick one primary view per surface; resist mode-explosion |
| No custom issue types or hierarchies beyond parent/sub | Enterprise teams hit ceiling | Decide once whether agent work has more than 2 levels — and stop |
| Marketing copy is vague ("buzzwords", "tells me nothing" — HN) | Even great products fail on first impression | Plain-language home; show the actual UI |
| Animations cause "perceived slowness" (Pulcinella, HN) | Even sub-100ms can feel slow if animation steals the frame | Budget animations; never block input on a transition |
| Free plan caps at 250 issues | Hostile to evaluators | Don't gate the core loop behind quota |
| Limited offline | Local-first promise breaks under planes/tunnels | If we promise local-first, complete the offline story |
| Cycles vs active work confusing in UI | Users mix the two columns | Be explicit which slice of work the user is looking at right now |
| Can't customize triage notifications individually | All-or-nothing | Allow per-source filters from day one |
| Slack integration shallow (per HN, knes) | Can't create from arbitrary thread | If we integrate Slack, support full message-to-task with context capture |

## The Linear Method — what's enforced vs flexible
| Dimension | Enforced | Flexible |
|---|---|---|
| Cycle rhythm | Yes, fixed-length, auto-generated | Length (1–8 weeks), cooldown periods |
| Status pipeline | Yes, the 5–7 named states | Sub-labels, projects underneath |
| Project ownership | Every project has a single named owner | Who that is can change |
| Triage as gateway | Yes, integration-created issues land there | Routing rules, responder rotation |
| Issue size | Small enough to ship in a cycle | What "small" means per team |
| Project specs | Yes, projects have a written brief | Brief format |
| Cross-functional teams | Designer + engineer paired | Team composition |
| Auto-rollover | Yes — no way to keep open issues in a closed cycle | (none) |
| Code diffs as progress | Stated principle | (none) |

## AI features (2025 — Triage Intelligence / Product Intelligence)
| Feature | What it does | Pattern HyperIdle should note |
|---|---|---|
| Triage Intelligence | When a new issue lands in Triage, AI proposes assignee, team, labels, linked work | Suggest, don't auto-act, by default |
| Auto-apply suggestions | Optional escalation: AI commits its proposals after a threshold | Two-tier autonomy: suggest → auto |
| Issue summaries | Long discussion threads collapsed into a brief | Same need in agent conversations |
| Processing window | "1–4 minutes to generate high-quality suggestions" | They explicitly trade latency for quality on triage; honest about the trade |
| Surface | Suggestions appear in the same Triage UI, not a separate AI panel | AI is a verb on existing surfaces, not a destination |

## Top 5 lessons for HyperIdle
1. **Optimistic local-first is the floor, not a feature.** Every Work and Conversations interaction must commit locally and reconcile in the background. Sub-100ms is the bar.
2. **One opinionated workflow, no custom-fields zoo.** Pick the agent lifecycle states (likely Triage → Queued → Running → Review → Done → Canceled) and refuse to make them configurable.
3. **Keyboard verbs over menus.** `C` create bet, `T` triage conversation, `R` review output, `J/K` row nav, `Cmd+K` palette. Bare letters first, modifiers only for rare actions.
4. **Triage is a place, not a notification setting.** Agent outputs and external requests should land in a single Triage rail with one-keystroke disposition (Accept / Duplicate / Decline / Snooze).
5. **Auto-rollover is the right default for time-bound work.** Bets/cycles should never silently lose unfinished work; carry it with provenance, don't ask the human to file it manually.

## Sources
- Linear docs: linear.app/docs (triage, inbox, cycles, parent-and-sub-issues, priority, labels, customer-requests, linear-asks, triage-intelligence)
- Linear Method: linear.app/method, linear.app/method/introduction
- Linear blog: linear.app/now (cx-in-linear, scaling-the-linear-sync-engine, why-is-quality-so-rare, ai)
- Linear changelog: 2023-10-12 triage-responsibility, 2024-12-09 customer-requests, 2025-08-14 product-intelligence, 2025-09-19 auto-apply-triage-suggestions
- Hacker News threads: id 23693029, 31914697, 33199304, 44833834
- First Round Review — "Linear's Path to Product-Market Fit"; Lenny's Newsletter — Karri Saarinen interview
- Figma blog — "The Linear Method: Opinionated Software"; Karri Saarinen 10 Rules
- Pragmatic Engineer — "The Story of Linear as told by its CTO"
- Comparison write-ups: Efficient.app, Cotera, ProductManagementResources, Atono (Linear vs Jira)
- Engineering write-ups: medium.com/linear-app/invisible-details, bytemash.net Linear rabbit hole
