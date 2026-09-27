# HyperIdle — Design Restart Prompts

**Status:** draft for founder review. Nothing here is approved yet.
**Date:** 2026-08-17

## Decisions already made

| Decision | Choice |
|---|---|
| Design language | **Neo-brutal light, exactly as `applications/website`.** Hearth is retired. |
| Prompt shape | **Five per-journey prompts.** Each designs whatever surfaces its journey touches. |
| Catalogue | **Every surface we have.** No surface is dropped without a founder call. |

## How to use this

Each prompt below is self-contained. Hand one to a designer (human or agent) with §0 attached — §0 is the shared language and every prompt inherits it verbatim. Prompts are independent: they can run in parallel, and they can be reviewed one at a time.

Every prompt asks for **populated real state only**. No skeletons, no error states, no empty states in the first pass — those are a second round once the populated design is approved. Content is supplied per prompt and is real content lifted from the running app; do not invent placeholder copy.

---

# §0 — The language (attach to every prompt)

This is not a mood board. These are the values from `applications/website/src/styles/tokens.css` and `site.css`, which are shipping today at the marketing site. The app must be visually continuous with that site — a user who clicks INSTALL should not feel a change of product.

## Palette

Four colors. There is no fifth.

| Token | Value | Role |
|---|---|---|
| `--paper` | `#fffdf5` | Page canvas |
| `--white` | `#ffffff` | Card and panel fill |
| `--ink` | `#000000` | All borders, all primary text, chip fills |
| `--yellow` | `#fcee0a` | Current state, selection, primary action, highlight |

Secondary text: `#333333` / `#444444` / `#555555`. Nothing else.

Color does **not** carry status. Yellow means *you are here* or *act on this* — it never means "success". Status is carried by words in a mono label, not by hue. This is a deliberate break from the current app, where six pastel chip colors do all the structural work and none of it lands.

## Structure

- **Borders: `3px solid #000000`.** Every card, chip, button, input, panel. The border is the design.
- **Radius: `0`.** Everywhere. No exceptions.
- **Shadows: hard offset, no blur.** `3px 3px 0 #000` chips · `5px 5px 0 #000` cards · `8px 8px 0 #000` hero and overlays.
- **Spacing scale:** 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96.

## Type

- **Display — Archivo Black, UPPERCASE.** Page titles, section titles, big numbers. `line-height: 0.98–1.2`.
- **Body — Space Grotesk**, 17px/1.6 base, weights 400/500/700.
- **Labels and metadata — Space Mono, 700, 11–13px, `letter-spacing: 0.08–0.16em`, UPPERCASE.** Every eyebrow, status, timestamp, key in a key-value pair, and column header.

All three are self-hosted OFL woff2, already committed at `applications/website/src/assets/fonts/`. Adopting them into the app is a file copy — no licensing or CDN question.

## Motion and interaction

- Hover: `translate(-2px, -2px)` and the shadow grows one step.
- Active: `translate(3px, 3px)` and the shadow disappears — the element is physically pressed into the page.
- Duration 100ms hover, 540ms entry reveal, `cubic-bezier(0.16, 1, 0.3, 1)`.
- Focus: `3px solid #000` outline, `3px` offset. Never a glow.
- Rotation: chips and eyebrows may sit at −3° to +1.5°. Use it sparingly — on eyebrows, index badges, and status chips. Never on anything a user reads for more than a few words, and never on rows in a list.

## Hard nos

Rounded corners · blur · gradients · drop shadows with blur · pastel status colors · cream-on-cream cards · pill buttons · glass · centered narrow content columns · uppercase 11px labels used as the *only* hierarchy device · decorative icons.

## The cost, stated plainly

This language deliberately violates the enforced design lint: `AQ-008` (no hardcoded colors), `AQ-009` (pure black banned as a background), `AQ-011` (radius must be 10/16/pill), `AQ-012` (blurred shadow tokens), `AQ-019` (system fonts only). `eslint-plugin-design`, `design-css-gate` and `design-profile-census` all have to be rewritten against the new tokens. The website tokens file also carries a comment saying it must never move into `framework/design-system` — that decision is being reversed on purpose.

**Keep these rules — they are good and language-independent:** realistic content always, no AI-aesthetic tells, touch targets ≥44px, text contrast ≥4.5:1, `prefers-reduced-motion` kills animation, one spelling per value, every custom component has a story.

---

# The catalogue — every surface, mapped

Verify coverage here before approving any prompt.

| # | Surface | Prompt |
|---|---|---|
| 1 | Setup / onboarding | J1 |
| 2 | App shell — sidebar, wordmark, nav, settings entry | J1 |
| 3 | Global search panel | J1 |
| 4 | Notifications — popover and inbox | J1 |
| 5 | Not-found and failure states | J1 |
| 6 | Conversations list | J2 |
| 7 | Thread view + composer | J2 |
| 8 | Agent decision cards | J2 |
| 9 | Review-request cards in thread | J2 |
| 10 | Live session activity | J2 |
| 11 | Review canvases — all 8 types | J3 |
| 12 | Split view | J3 |
| 13 | Verdict flow + anchored comments | J3 |
| 14 | Artifact permalink, gallery, embed | J3 |
| 15 | Work overview | J4 |
| 16 | Team | J4 |
| 17 | Bet + bet create | J4 |
| 18 | Task | J4 |
| 19 | Routine | J4 |
| 20 | Knowledge list, triage, detail, create, scopes | J5 |
| 21 | Agent profile | J5 |
| 22 | Settings — all 11 sections | J5 |

---

# J1 — ARRIVE

**The journey.** A founder installs HyperIdle off the marketing site, sets it up, and finds their way around every day after. This prompt owns the frame that all other surfaces live inside — get it wrong and nothing else can be right.

**Surfaces to design:** setup/onboarding · app shell (wordmark, sidebar navigation, contextual sidebar section, settings entry) · global search panel · notifications popover and inbox · not-found and failure pages.

## What's broken today

- Setup is a centered beige card that looks like every other SaaS signup. A user arrives from a black-and-yellow site and lands somewhere unrecognizable. **The single worst continuity break in the product.**
- The sidebar's contextual section shows the wrong context — it says CONVERSATIONS while you're on an agent page, and renders an empty WORK heading on work pages.
- That contextual section duplicates the main list: on Conversations and on Knowledge, the same five items appear twice on screen at once.
- Notifications is a small popover with two rows. There is no inbox.
- Nav counts (Conversations 2, Knowledge 5) are the only signal of anything needing attention, and they're tiny.

## Real content to design against

Setup: "Your agentic operating system. Humans steer, agents build." · fields: Your name · Agent harness (Built-in gateway → Provider: Anthropic / or a coding CLI you're already signed in to) · three orientation tiles: Conversations "Chat with agents", Work "Bets & tasks", Knowledge "Shared docs".

Nav: Notifications · Conversations (2) · Work · Knowledge (5) · settings.

Notifications: "Review requested: New pricing page" REVIEW 2d · "Annual billing is blocked" BLOCKER 3d.

Search for "pricing" returns grouped results — Conversations: "Page build is nearly done. Comparison table renders at all widths…" (review, 2d), "Bet completed: Trial extension flow — hypothesis VALIDATED. 27%…" (chat, 2d) · Work: "Pricing page overhaul" ACTIVE.

## What this prompt must decide

1. **What the sidebar is for.** Today it tries to be both a navigator and a context list, and fails at both. Pick one, or find a shape where both work.
2. **How attention is expressed.** Two blocked things and a pending review should be impossible to miss. Yellow is available and currently unused for this.
3. **Setup as a continuation of the marketing site**, not a departure from it.
4. **Where notifications actually live** — popover, full inbox, or both.

## Deliverable

Populated designs for all five surfaces, at 1440px and 1024px. Real content only, from above. Show the sidebar in at least three route contexts so the contextual-section question is visibly answered.

---

# J2 — DECIDE

**The journey.** An agent hits a question it must not guess at, and asks. The founder answers in one move and the work unblocks. This is the product's core moment and it deserves the best design in the app.

**Surfaces to design:** conversations list · thread view · composer · agent decision cards · review-request cards · live session activity.

## What's broken today

- The conversations list is twelve identical rows. No preview text, no unread state, no sender, no grouping. It's a table pretending to be an inbox. Kind tags (task, bet, agent, team, user, artifact) and BEHIND flags are the only differentiation and they're grey pills.
- The decision card — the most important object in the product — is a plain white box with three pill buttons. It looks like every other message.
- A stray "Founder 7:29 AM" byline renders with no message under it.
- Live agent activity has no visible presence in the thread at all.

## Real content to design against

**Conversations list** (12 rows, with kind + age): Implement annual billing toggle `task` BEHIND 8h · Write the four-email sequence `task` 2d · ★ Assistant `user` 2d · Build the new pricing page `task` BEHIND 2d · Acme Builder, Acme Designer +5 `team` 2d · Acme Builder `agent` 2d · Pricing page overhaul `bet` 3d · Acme Product Manager `agent` 5d · Native mobile spike `bet` 1w · Trial extension flow `bet` 2w · Acme QA Engineer, Founder `artifact` 2w · Self-serve extension flow `task` 2w.

**Thread — "Implement annual billing toggle"** (TASK, participants FO AB, 2 unread):

> **Acme Builder, 6:29 AM** — Annual billing is ready to build except one number: the discount. It changes the proration math and the metering schema, so I would rather not guess.
>
> **Acme Builder, 7:29 AM** — *[DECISION CARD]* What discount should annual plans carry? Margin says low, conversion data from the trial bet says users respond to visible savings.
> - 10% — protect margin, modest nudge
> - 15% — market standard, balanced
> - 20% — aggressive, maximizes annual mix
>
> **Acme Builder, 8:29 AM** — Either way it is a one-line constant — the moment you pick, this task unblocks.

**Thread — "Build the new pricing page"**, containing a review-request card: "New pricing page — ready for your eyes" with a `Comparison` canvas chip.

**Composer:** "Message Founder, Acme Builder…" with an attach affordance and send.

## What this prompt must decide

1. **What a decision card looks like when it is the most important thing on screen.** It should be visible from across the room. Yellow, 8px shadow, whatever it takes.
2. **How a list row earns its place** — what the founder needs to know before opening a thread. Who is asking, what for, how long it's been waiting.
3. **Waiting-on-you vs. running vs. done** as a visible spine through both the list and the thread.
4. **How a live agent session appears in a thread** while it's happening.
5. **Human vs. agent authorship** — currently both are two-letter squares and indistinguishable.

## Deliverable

Populated designs at 1440px and 1024px: the list, a thread with a decision card, a thread with a review-request card, and a thread with a session running. Real content only.

---

# J3 — JUDGE

**The journey.** An agent finishes work and asks for a verdict. The founder looks at the actual thing, comments on it, and calls it. This is the most differentiated machinery in the codebase and today it is close to unusable.

**Surfaces to design:** all 8 review canvases · split view · verdict flow and anchored comments · artifact permalink, gallery, and embed.

## What's broken today

- **The split view destroys the artifact.** Opening the pricing-page review squeezes the preview into roughly a 230px pane, rendering the page about 70px wide. The founder is asked to judge work they cannot see. This is the highest-value bug in the product.
- The artifact permalink page is a large empty rounded box with the caption "Runs on its own, in a box sealed off from the app."
- Eight canvas types exist in code and none of them have a designed identity.
- There is no visible verdict action anywhere in the flow.

## The 8 canvases (all must be designed)

| Canvas | Judges |
|---|---|
| Code diff | Source changes |
| Visual diff | Before/after imagery |
| Browser preview | A live rendered page |
| Rendered in context | The work sitting inside the real product |
| Field change set | Structured field-level edits |
| Metrics moved | Numbers that shifted |
| Action operation | An irreversible operation awaiting approval, plus its outcome |
| Batch | Many small items judged together |

## Real content to design against

Review request: "New pricing page — ready for your eyes", canvas `Comparison`, from Acme Designer on task "Build the new pricing page", bet "Pricing page overhaul".

Surrounding thread: *"One open question for the verdict: hero A leads with the product, hero B leads with the trial. I put B in the review artifact."* → founder: *"Looking at it this afternoon. B is the right instinct given the activation focus."*

Artifacts on the bet: `HTML` "Pricing — Pulse" / NEW PRICING PAGE — PREVIEW, 2d · `TEXT` "Pricing copy — draft 2", 3d · `IMAGE` "Pricing hero — option B", 4d.

Artifact content: a pricing page headed "Simple pricing that scales with your team" — two tiers, "No credit card. Start free for 14 days", a comparison table (Dashboards 5, Seats 3, Exports…).

## What this prompt must decide

1. **How the artifact gets enough room.** Full-bleed review mode, an overlay, a swap, a resizable split — pick a shape where judging is actually possible. This is the prompt's primary job.
2. **A visual identity per canvas type** so the founder knows what kind of judgement is being asked for before reading a word.
3. **Where the verdict lives** and what approve / reject / request-changes look like in a language where yellow is the only accent.
4. **Anchored comments** — commenting on a specific spot in a rendered artifact.
5. **Irreversible operations.** `commit_file` and `create_bet` are marked high-risk in the tool layer and route to human approval. That approval moment needs a design that reads as consequential without becoming a scary enterprise modal.

## Deliverable

Populated designs at 1440px and 1024px: all 8 canvases, the review-with-artifact layout at full width, the verdict moment, an anchored comment, and the artifact permalink. Real content only.

---

# J4 — SHAPE

**The journey.** A founder sets the bets, watches capacity and agent health, and steers work without micromanaging it. Shape Up, run by agents.

**Surfaces to design:** work overview · team · bet · bet create · task · routine.

## What's broken today

- Four pages that should feel like one system feel like four different products.
- **The bet page is one vertical lane** stacking progress → team → pitch → 7 tasks → 3 artifacts → 9 discussion messages → artifact discussion. No composition, no way to scan.
- **The task page contradicts the bet page.** It reports Owner *Unassigned*, *No sessions yet*, Outcome `--` — while that same task's thread shows two agents actively working and a review pending.
- The routine page is a key-value dump with three fields showing `—`.
- The team page renders an agent avatar as a bare letter "A" with no container.
- Seven task statuses (MET, IN REVIEW, IN PROGRESS, BLOCKED, ON HOLD, PLANNED) are six pastel pills that are hard to tell apart.

## Real content to design against

**Team:** Acme · Phase: build · Lead: Acme Product Manager · **BLOCKED** · Capacity **2 / 5** active bets · Agent health **Needs attention**, 4 idle agents.
Active bets: Onboarding email sequence 1/4 ACTIVE · Pricing page overhaul 2/7 ACTIVE.
Routines: Daily digest (System Agent, every day 8:00 AM, 3d) · Knowledge decay (2:00 AM, 15h) · Knowledge promotion (3:00 AM, 14h) · Portfolio retro (every Monday 10:00 AM, 6d) · Post-bet retro (on bet completion, 1w).

**Bet — Pricing page overhaul**, ACTIVE, 29% (2 of 7 tasks), team Acme.

> Pulse's pricing page still shows the three-tier structure from launch. Trial users tell us they cannot tell what they would pay after the trial, and support gets the same "which plan is right for us" question weekly.
>
> **Shape:** collapse to two tiers (Starter, Team) with a visible comparison, rewrite the page copy around outcomes instead of feature counts, and wire annual billing with a founder-approved discount.
>
> **Out of scope:** usage-based pricing, plan downgrades (separate draft bet).

Tasks: Interview trial users about pricing confusion `MET` · Draft the two-tier structure and comparison `MET` · Build the new pricing page `IN REVIEW` · Rewrite pricing copy around outcomes `IN PROGRESS` · Implement annual billing toggle `BLOCKED` · Wire usage metering into the new tiers `ON HOLD` · Set up conversion funnel measurement `PLANNED`.

**Routine — Daily digest:** agent System Agent · schedule Every day at 8:00 AM · trigger Scheduled · silent On · next run Aug 16 9:29 AM · last run Aug 14 — success · created Jul 27 · actions Pause / Trigger Now / Delete.

## What this prompt must decide

1. **A single composition for the bet page** that lets a founder scan pitch, progress, blockers, and artifacts without scrolling through nine messages.
2. **What a task page is for** once the thread carries the conversation and the bet carries the shape. It may not need to be a page at all.
3. **A status system in a four-color palette.** Seven states, no hue to spend. Words, weight, borders, position.
4. **How "this bet is stuck" reads at a glance** across overview, team, and bet.
5. **Whether Work needs an overview page at all** — with one team it already short-circuits straight past it.

## Deliverable

Populated designs at 1440px and 1024px for overview, team, bet, task, routine, and bet create. Real content only.

---

# J5 — TEND

**The journey.** The founder teaches the organization — curating what it knows, and configuring the agents that act on it. Two halves of one act.

**Surfaces to design:** knowledge list · triage queue · knowledge detail · create · scopes · agent profile · settings, all 11 sections.

## What's broken today

- **Settings is 9,200 characters on one scrolling page** across 11 sections: Profile, Org chart, Agents, Agent Behavior, Filesystems, Agent Backends, Connections, Appearance, Credentials, Notifications, Backend mode.
- **"Agent Behavior" dumps raw internals into the product.** All 22 tools are rendered with their LLM-facing prompt text as UI copy, including "HIGH RISK: requires human approval before execution" and "Derives betId and teamId". This is a debug view shipped as a feature.
- **All 13 agents display `HARNESS UNAVAILABLE`.** The default state of the product is an error state.
- The org chart is a table of Delete buttons.
- Knowledge triage already has a real keyboard queue — `j k` navigate, `enter` open, `v` validate, `x` reject — and the design gives it no weight at all.

## Real content to design against

**Knowledge triage** (5 items, each with body preview, age, and validate/reject/open actions): "Annual discount policy — needs founder sign-off" 3d · "Flag-gated rollouts for anything user-visible" 1w · "Hiring notes — when does ops get an agent?" `Private` 1w · "Support tickets that repeat three times become knowledge" 6d · "Trial entitlement date math is UTC end-to-end" 1mo.
Modes: Curated / Triage. Filters: All / Shared / Team / Private. Sort: Relevance / Recency / Frequency.

**Knowledge detail — "Every deploy goes through a review thread":** HEALTHY · confidence 60% · kind pattern · scope Builder · last edited Jul 12 2026 · editor Another editor · backlinks: "Small changes, reviewed same day", "Flag-gated rollouts for anything user-visible".
Body: *"No production deploy without a review thread and a verdict. The two times we skipped this (search hotfix, June; email template, July) both needed a follow-up fix within 24 hours."*

**Agent profile — Acme Builder:** IDLE · health warning "Required harness not available" · role Builder · harness Claude · category team · model tier Default · team Acme · max sessions 3 · created Jul 3 2026 · system prompt (collapsed) · capabilities: Tool use, MCP, File editing, Sub-agents.

**Settings sections:** Profile (display name, email) · Org chart (Founder/Acme, Maya Chen/Acme) · Agents (13) · Agent Behavior (Agents 13, Skills 0, Routines 5, Triggers 6, Tools 22, MCP 0) · Filesystems (none registered) · Agent Backends (Codex, Claude Code, Cursor Agent, OpenCode — all "not installed or not on PATH") · Connections (none) · Appearance (Light/Dark/System) · Credentials (Anthropic, OpenRouter, Shared Backend, OpenAI-compatible — all NOT SET) · Notifications (Review requests, Blocker alerts) · Backend (Web / Worker mode).

## What this prompt must decide

1. **What settings actually is** once the debug view is removed. Propose the split — what's setup, what's per-agent, what's genuinely a preference, and what should not be a user-facing screen at all.
2. **Knowledge triage as a first-class keyboard surface.** It's the best interaction in the app and it looks like a spreadsheet.
3. **Confidence, health, and decay as visible properties** of a knowledge item — the fabric prunes and promotes on a schedule and the founder should be able to see that happening.
4. **A missing harness as a setup step, not an error.** Four backends absent is the normal first-run state.
5. **The agent profile as a portrait, not a config table** — what an agent is, what it can touch, what it's done.

## Deliverable

Populated designs at 1440px and 1024px for the knowledge list, triage queue, detail, agent profile, and a full settings proposal including the section split. Real content only.

---

# Open questions for the founder

1. **Dark mode.** The site is light-only. Long agent sessions at night are a real use case. Ship light-only first, or design both from the start?
2. **Does Work need an overview page** when one team already short-circuits past it?
3. **Does the task page survive**, or does the thread plus the bet cover it?
4. **How much of Settings is a product surface at all** versus a first-run wizard plus a config file?
5. **What happens to the marketing site** — does it stay as-is, or does the app's new work feed back into it?
