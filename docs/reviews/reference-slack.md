# Slack — what makes it killer (research notes)

## TL;DR — 2 lines
Slack's edge is **opt-in, topic-scoped attention**: you join channels you care about, scan one bolded sidebar to see what's new, and reply with a single emoji to clear the stack. For HyperIdle, the lesson is *not* "build chat" — it's **build a sidebar of topic-scoped feeds where one glance answers "what changed?" and one tap closes the loop**, while ruthlessly avoiding the always-on noise spiral that Slack itself causes at scale.

## Founder's priority filter (overrides agent rankings — read this first)

**[CORE — first-class for HyperIdle]**
- **Threads / localized discussions.** Likely a *theme across the entire app*, not just Conversations. A bet, a task, or a knowledge item can each need a conversation = a thread. Threads are the unit of localized discussion that attaches to anything.
- **Notification anxiety as the hard problem.** Exactly what HyperIdle will face — and **harder than Slack** because AI generates conversations far faster and more frequently than humans. Pinning / reordering are NOT necessarily the right answers in an AI-driven world.
- **Topic grouping.** Going through conversations *by topic* rather than chronologically may reduce context switching. Worth designing into the inbox, not just the sidebar.
- **Notification philosophy.** In an AI world, signal volume IS the problem. We must be ruthless about what is genuinely blocking vs. for-the-record. Default-quiet, deliberate escalation, and agents that respect human attention budgets.

**[DEMOTE — late-stage polish, not the leverage point]**
- Sidebar-of-bolded-unreads (general nav pattern)
- Cmd+K quick switcher
- Reactions / emoji "reacji" — emojis are *human-to-human*; HyperIdle needs **preformatted actions** (structured quick-replies) instead.
- Search modifier mini-language (`from:`, `in:`, `before:`)
- Drag-to-reorder sidebar / custom sections

Rationale: the *hard problem* HyperIdle inherits from Slack is attention management at AI-generated message volume. Threads + topic grouping + a brand-new notification model are the levers. UI polish (sidebar, search, reactions) is downstream.

## Signature features
| Feature | What it does | Why users love it | What HyperIdle should borrow |
|---|---|---|---|
| Channels | Topic-scoped, opt-in feeds; anyone can create one | Replaces giant CC: lists; you choose your attention surface | Per-bet / per-product / per-decision feeds, opt-in by default |
| Threads (sidebar) | Replies pop into right pane, parent stays in channel | Side-conversations don't drown the main feed | Agent reasoning, retries, sub-questions go in a thread; only the answer hits the parent feed |
| @ mentions w/ tiers (`@here` < `@channel` < `@everyone`) | 3 escalation levels, admin-restrictable | Caller signals urgency without spamming | Mention agent / team / human-only; admins can lock `@everyone` equivalents |
| Reactions ("reacji") | One-click emoji reply on any message | Replaces "thanks!"/"got it"/"+1" follow-ups; cuts message count | Structured low-friction reply on agent outputs (approve / retry / archive / "eyes" = "I'm taking this") |
| Cmd+K Quick Switcher | Type-ahead jump to any channel/person/DM | Typing beats scrolling once you have >20 channels | Global jumper across bets, products, agents, decisions, conversations |
| Search w/ modifiers | `from:@user in:#channel before:2024-01 has::eyes:` | Composable filters that compose like a tiny query language | Same modifier grammar over knowledge corpus + conversation log |

## Core daily journey (the loop that hooked everyone)
| Step | User does | Why frictionless |
|---|---|---|
| Wake / return | Glance at sidebar — bolded items = unread | One-glance "what changed since I left" |
| Triage | Cmd+K to first unread, or click | Zero-mouse path from cold-open to first reply |
| Skim | Scroll channel; threads collapsed by default | Side-conversations don't pollute main flow |
| Acknowledge | React with `:eyes:` / `:white_check_mark:` | Closes loops without typing a sentence |
| Reply | Inline message; threaded if branching | Branch is one click, not a new doc |
| Defer | "Save for later" / "Mark unread" | Inbox-zero behaviour without an inbox |
| Focus | Snooze / DND / set status | Async-respectful, not "appear online" |
| Search later | Cmd+G with `from:` `in:` `has:` | "I know I saw this" → 5-second retrieval |

## Killer micro-interactions
| Interaction | Pattern | Notes for HyperIdle |
|---|---|---|
| Cmd+K quick switcher | Fuzzy-match name; Enter jumps; Up/Down through unreads | Single canonical keyboard surface — every nav must be reachable here |
| Cmd+/ shortcut sheet | Press Cmd+/ to see all shortcuts in-app | Discoverability for power users without clutter |
| Drag-to-reorder sidebar + custom sections | Power users group "client work / projects / fun" | Let founders re-section by phase, bet, or product as their mental model shifts |
| Empty-state onboarding | Empty channels teach by prompting "send your first message" | Don't tutorial — let the empty state ask for the first action |
| 3-question signup survey | Workspace name → instant rendered preview | Show value reflected back inside ~30s of typing |
| `@here` vs `@channel` warning at >6 members | UI nudges before a noisy ping | Default-quiet; require deliberate choice to escalate |
| Slackbot reminders (`/remind me ...`) | Natural-language deferred ping | An LLM-native equivalent is trivial and obvious for HyperIdle |
| Persistent WebSocket → <100ms render | Messages feel "live" not "loaded" | For agent updates, real-time matters: a 2s stutter feels broken |

## What people specifically rave about
| Source | Quote / observation | What it tells us |
|---|---|---|
| Stewart Butterfield, "We Don't Sell Saddles Here" memo (2013) | "What we are selling is not the software product. We're selling organizational transformation." | Position HyperIdle as the new operating model, not "AI agent dashboard" |
| Slack vs. Email essays (multiple, Slack blog + Medium + Superhuman blog) | Channels democratize creation; "anyone can create" → speed | Founders + agents must be able to spin up a feed/thread without ceremony |
| Slack Design blog (Hubert F., Threads journey) | "'Having threads in Slack' could mean a lot of different things" — Twitter, Reddit and FB models all wrong fits | Thread model isn't universal; design for *this* domain (LLM long-running work) |
| Slack engineering blog (Weaving Threads) | Threads moved to right sidebar to preserve channel flow | Two-pane layout (feed + focused detail) is the proven shape for chat-like work |
| HN comment, kevincox (2022) | "Everyone hates email, no one responds. They switch to Slack. It is great, high signal-to-noise..." | The honeymoon is real — but signal-to-noise degrades with scale. Architect against that |
| HN comment, slg (2022) | "Slack provides no native way to handle a wealth of information that necessitates a 'you might want to read this eventually' category." | Three notification tiers (now / soon / never) — design a fourth: "for the record" |
| HN comment, mdaniel (2022) | "I get the strong impression that Slack considers information that leaves Slack as a threat to the business." | Inverse for HyperIdle: knowledge must promote *out* of conversations into the long-lived corpus |
| Slack help docs | Search modifiers `in:` `from:` `before:` `has::emoji:` | A query mini-language is loved by power users; cheap to build, huge unlock |
| Slack blog ("Some of the ways we use emoji at Slack") | After reactions launched, total message count *dropped* internally | Reactions are a noise-reduction tool, not a noise-additive one |
| Slack Connect product page | Up to 250 organizations per channel; banner above input ("external partner present") | Trust is conveyed by persistent visual context, not modal warnings |

## Common complaints (anti-patterns to avoid)
| Complaint | Why it bites | HyperIdle implication |
|---|---|---|
| Notification anxiety / "Slack-induced anxiety" (Calm Blog, Medium essays) | 71% of IM notifications answered immediately → expectation of instant reply; physical heart-rate spike | Default to digest-style "since you last looked" feeds; instant ping is opt-in, not default |
| Channel sprawl (Slack blog, "10 Commandments" essays) | Every project gets a channel → 200 channels nobody reads | Bind feeds to bets/products with explicit lifecycle (active → archived); auto-archive on bet close |
| Threads "discouraged and don't nest" (HN, multiple) | One-level deep, lost in sidebar; new participants miss them | For agent conversations: surface the thread inline collapsibly, with full visibility of parent context |
| Always-on culture (Fast Company, Computerworld) | 86% work past 7pm; Sunday dread | Status / DND / quiet-hours must be first-class — and *agents must respect them* |
| Mark-as-unread is flawed (Wrangle blog) | New messages in same channel force you to either lose your unread or ignore the new | Provide a real "follow-up" queue, not a fake unread |
| Slack-as-knowledge-base failure (HN, mdaniel) | Decisions vanish into chronological scroll; search is shallow | Promote decisions/answers into the Knowledge layer; conversations are ephemeral by design |
| "Boil the ocean" search across thousands of channels | Hard to know *where* something was said; ambiguous channel naming | Force topic + time + agent/human filters by default in search UI |
| AI training opt-in-by-default (TechCrunch 2024) | Trust collapse | HyperIdle: never train on user content; make this loud and contractual |
| Slack Lists is "not a project management tool" (Reworked, TechTarget) | Trying to bolt structured work onto chat fails | Don't try to be Linear inside chat. Conversations are a surface, not a system of record |

## Top 5 lessons for HyperIdle
1. **Sidebar of bolded unreads is the killer UI** — one glance must answer "what changed?" across all bets/products/agents. Cmd+K fuzzy-jump is the canonical secondary nav.
2. **Reactions > replies** — design first-class one-click responses on agent outputs (approve / retry / archive / "eyes" = "I'm on it"). They cut message volume *and* convey intent better than text.
3. **Threads belong in a side pane, not inline** — Slack's hard-won lesson: long agent reasoning, tool-call traces, and sub-conversations live in a right pane; the main feed shows only milestones.
4. **Tiered, opt-in, sparse notifications** — three explicit levels (urgent / contextual / for-the-record) with hard quiet-hours that *agents* respect. Default-quiet, deliberate escalation.
5. **Conversations are ephemeral; promote answers into Knowledge** — Slack's biggest failure mode is being treated as institutional memory. HyperIdle must have a deliberate "this conversation produced a fact" promotion step into the long-lived corpus.

## Sources cited (by name)
Slack help/blog (search modifiers, sidebar, mentions, reactions); Slack Design blog (Hubert F., Threads journey parts 1–2); Slack Engineering ("Weaving Threads"); Stewart Butterfield, "We Don't Sell Saddles Here" (NFX Founders' List, Indie Hackers reposts); HN threads (`#9754626` "We Tried Slack and Regretted It", `#17621290`, `#17622707`, `#31323227` "Problem with Slack at Scale"); Fast Company (Threads design challenge; 6 hacks); TechCrunch (Threaded messaging launch 2017; Slack AI 2024–25; AI training policy 2024); Calm Blog ("Too many Slack channels"); Medium (Jari Mattlar, "Science Behind Slack Anxiety"; Stéphanie Lauer, "How I developed Slack-induced anxiety"); Computerworld ("10 strategies for preventing Slack burnout"); Wrangle, RescueTime, Help Scout (workflow critiques); Slack Connect product page; Reworked / TechTarget (Slack Lists critique); Salesforce Ben (Canvas, Huddles 2024); Engadget (huddle transcripts).
