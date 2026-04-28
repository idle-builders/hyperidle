# Work — Journey Map (v3)

## What this view exists for
"Show me what my teams are making — let me see the actual output, not just status — and tell me if it's healthy and what it costs."

## The shapes Work takes
- **Portfolio**: every product, every active bet, what shipped this week, total burn.
- **Product**: the work-output of one team — could be a SaaS product, the finance function, the sales org, the support desk. One team, one stream of bets.
- **Bet**: one shaped commitment within a product, with an appetite, a done condition, and an artifact stack.
- **Story / task**: one discrete unit owned by the agent team. Agents pick it up per the team's ordering.
- **Session**: one bounded agent run. **Lives in the harness (opencode, hermes, pi agent, openclaw, ...). Work view links out — it does not render the interior.**

## What an agent produces (the output we surface)
Function-agnostic. A "product" in HyperIdle is the work-output of a team, and teams span every function in a company. The output kinds we render:
- **Code & infra** — diff, deploy preview URL, check results, running endpoint.
- **Written content** — landing copy, blog post, email, support reply, documentation, release notes.
- **Visual asset** — mockup, logo, screenshot, before/after compare, ad creative.
- **Sales output** — pitch deck, outbound sequence, CRM update, drafted contract or NDA.
- **Marketing output** — campaign plan (audience, messaging, channels, budget), ad copy, landing experiment.
- **Finance output** — forecast, runway model, P&L analysis, cap table change, board summary.
- **Operations output** — SOP, vendor evaluation matrix, incident retro, process doc.
- **People output** — job description, performance summary, comp band, hiring recommendation with rationale.
- **Customer support output** — drafted reply, refund decision, escalation note, FAQ update.
- **Decision with rationale** — structured action_summary for any of the above.
- **Data / analysis** — headline metrics, charts, recommendation.
- **Summary of an agent run** — high-level: cost, duration, agent name, link into the harness. The interior is the harness's job.

(Sources: `PROCESS_LAYER.md` §3.2 artifacts; `AGENT_LAYER.md` §3 roles; `HUMAN_INTERFACE_LAYER.md` §4.1 ArtifactView five shapes.)

## Reference apps — what we borrow
- **Vercel preview URLs**: push → click preview → see the change live. Borrows: every shipped task carries a preview link or rendered artifact directly on the card.
- **GitHub PRs**: artifact-first review surface, side-by-side diff, audit trail by commit.
- **Storybook / Chromatic**: visual diff before/after on visual_comparison artifacts.
- **Linear**: keyboard speed, j/k row navigation, opinionated states, cycle window.
- **Notion projects**: artifact lives next to status; bet detail embeds recent outputs inline.
- **CodeSandbox / StackBlitz**: embed the running thing where reasonable.
- **Figma**: who's touching which artifact right now.
- **Asana / Jira (cautionary)**: status without output is blind project mgmt. Avoid.

## The five personas, in this view
Personas hold across functions — the artifact changes, the reflex doesn't.
- **Grandma**: wants to *see* what the team made — could be a landing page, a sales deck, a forecast chart, a hiring recommendation. Smiles at a thumbnail or a one-line headline.
- **Casual operator**: "is my team shipping, on budget, what does the latest output look like?" Drills into one card.
- **Business person**: throughput and risk across products and functions. A "what shipped this week" gallery she can forward.
- **Power user**: the one bet that needs them, latest artifact, keyboard-driven. Same muscle whether it's code or a contract.
- **Hacker CTO / rockstar VP**: per function — the CTO wants the diff and deploy URL; the VP Sales wants the dialer log, the deck, the outbound sequence; the CFO wants the model. All want to drill bet → story and read what the agent actually did, then jump into the harness session if needed.

## Basics — top 3 jobs every persona does, at every level

### 1. See what the team has made
**Trigger:** Lands on the view, scans for actual outputs — thumbnails, preview links, rendered drafts, latest decks, latest forecasts, latest diffs.
**Outcome:** Knows what their teams have produced without leaving for GitHub, Vercel, Figma, Google Drive, the CRM, or the spreadsheet.
**Universal because:** Show-don't-tell core. Grandma sees thumbnails. Operator clicks the preview on her bet. PM forwards "what shipped this week" — a landing page from one team, a contract from another, a forecast from a third. Power user opens the latest artifact on the troubled bet. CTO/VP drills bet → story and reads the artifact at full fidelity, then jumps into the harness for the session interior. Drilling and seeing output collapse into one job: every level shows output at its own resolution. Portfolio = ship feed across all products. Product = artifact stack for one team. Bet = artifact stack for one commitment. Story = current converging artifact. Session = delegated to the harness.
**Holds in:** portfolio (cross-function ship feed) ✓ product (team's artifact stack) ✓ bet (bet's artifact stack) ✓ story (current artifact) ✓ session (jump-out to harness) ✓

### 2. Spot what's on fire
**Trigger:** Scans for trouble — BLOCKED, behind appetite, failing checks, rejected reviews, cost spike, dead session.
**Outcome:** Knows which product, bet, or story needs them right now, or that nothing does.
**Universal because:** Health triage is every persona's reflex on a status surface. Grandma looks for red. Operator checks if hers is okay. PM reads risk across products. Power user finds the one thing to act on. CTO/VP scans which session crashed or burned budget. The "fire" reshapes by level: portfolio = a product whose team is stalled; product = a bet behind appetite; bet = a rejected review or stuck dependency; story = a failing check or blocker.
**Holds in:** portfolio ✓ product ✓ bet ✓ story ✓ session (surfaced as a story-level summary; details in the harness) ✓

### 3. See what it's costing
**Trigger:** Glances at money — today's spend, weekly burn, cost-per-output, whether a bet is still inside its appetite.
**Outcome:** Knows the agents are within bounds, and which artifact cost what.
**Universal because:** Spend is the only persona-agnostic anxiety, and it's most legible when tied to output: "this landing page cost $4, this contract cost $0.80, this forecast cost $11, this rewrite cost $97." Grandma wants reassurance. Operator watches her bet's appetite. PM compares cost-per-shipped across products and functions. Power user notes the trend. CTO/VP traces the dollar back to the story that caused it.
**Holds in:** portfolio (factory burn) ✓ product (team burn) ✓ bet (appetite vs. spend) ✓ story (task cap vs. actual) ✓ session (run cost as story metadata) ✓

## Value-adds — most personas, less often

### Portfolio level
- **What shipped this week (cross-function artifact gallery)** — PM, operator, grandma loves it as a recap.
- **Cycle phase + days remaining** — operator, PM, power user.
- **Portfolio kill / coast / invest decisions** — power user, CTO.

### Product level
- **See the team's roster and current load** — operator, PM, power user, CTO.
- **See the team's active bets at a glance** — operator, PM, power user, CTO. (Most teams carry one; some carry parallel threads.)
- **See the team's burn vs. its cost cap** — power user, CTO. (Per-team caps are real; surface them.)
- **Drill into the team's most troubled bet** — operator, PM, power user, CTO.

### Bet level
- **Read the pitch** — operator, PM, power user, CTO. (Grandma reads the title.)
- **Pick / commit a pitch into the cycle** — power user, CTO.
- **Pause a bet** — operator, PM, power user, CTO. (Stops new task pickups; running tasks finish their session.)
- **Force-stop a bet** — power user, CTO. (Hard kill: terminate running sessions in their harnesses, freeze the artifact stack, return agents to other work.)
- **Comment to unblock** — operator, PM, power user, CTO. (A hint the agent reads at next pickup. Not an order.)
- **Downvote a story or artifact** — operator, PM, power user, CTO. (Weak negative signal that informs the team's prioritization without halting work.)
- **Adjust the bet's appetite or budget** — power user, CTO. (Changes the cap; agents respect it on next iteration.)
- **Understand what happens when a bet is stopped** — operator, PM, power user, CTO. (Before confirming any pause/force-stop, the user sees a clear "what stops, what continues, what's saved" affordance: which sessions terminate vs. drain, which artifacts are frozen vs. discarded, where the agents go next.)
- **Flag a bet for the PM** — operator, power user.

### Story / task level
*Tasks are owned by the agent team. Agents pick them up per the team's ordering. Humans don't reorder, reassign, or move tasks between columns.*
- **See which agent is on which task** — power user, CTO, operator (for hers).
- **Comment on a task or its artifact** — operator, PM, power user, CTO.
- **Open the task's thread** — operator, PM, power user, CTO.
- **Read who's blocked and why** — PM, operator, power user, CTO.
- **Jump into the agent's session in its harness** — power user, CTO. (One link out to opencode / hermes / pi agent / openclaw / ... — the harness owns the interior.)

## Delighters
- **See the bet's revision log (done condition changes)** — power user, CTO.
- **Compare ship rate across products and functions** — PM, CTO, power user.
- **Live preview embed on the bet card** — every persona; especially grandma when the artifact is visual (a landing page, a deck slide, a logo).
- **"What shipped since you last looked"** — single recap row at the top of Portfolio.
- **Cost-per-artifact call-out** — "this contract cost $0.80, this landing page cost $4, this forecast cost $11." CTO/VP and operator value highly.
- **Cycle countdown that turns urgent at <72h** — power user and PM.
- **Agent of the day / artifact highlight** — humanises the fleet for grandma; ignored by CTO.

## What's NOT here
- **Reading or replying to a review thread.** Belongs in Conversations. Work shows there's a verdict pending and a preview, not the thread.
- **Editing the pitch shape (appetite, sketches, rabbit-holes).** Belongs in the Pitch editor / Bet detail markdown.
- **The session interior (diff details, tool calls, agent reasoning trace).** Belongs in the agent harness. Work links out; it does not render.
- **Reordering, reassigning, or moving tasks.** Tasks are agent-owned. The human's task-level affordances are comment, downvote, and read.

## Sanity check
- **See what the team has made** — if broken: every persona reduced to status badges. Grandma loses the smile, operator opens GitHub or the CRM in another tab, PM has nothing to forward, power user can't tell whether the bet is converging, CTO/VP can't audit the work. Genuine basic.
- **Spot what's on fire** — if broken: grandma can't tell if she should worry, CTO can't find the blown session, no one acts. Genuine basic.
- **See what it's costing** — if broken: every persona has unbounded financial anxiety. Genuine basic.

## Founder's edits addressed (v2 → v3)
1. **Product level added.** The hierarchy is now five layers — Portfolio → Product → Bet → Story → Session. Product is the team's work-stream. Each basic now holds across all five. Value-adds grouped by level (now five sections). Verified against `PROCESS_LAYER.md` §3.4 (Team is product-bound) and `AGENT_LAYER.md` §3.2 (one team per product).
2. **Function-agnostic outputs.** Rewrote "What an agent produces" to cover engineering, design, marketing, sales, finance, ops, support, and people outputs — not just code/diff/visual/data. Personas updated: the CTO equivalent for sales is the rockstar VP, for finance is the CFO. Same reflex, different artifact.
3. **Bet-level human actions; tasks are agent-owned.** Removed "Move a task between columns." Added bet-level affordances: pause, force-stop, comment-to-unblock, downvote, adjust appetite/budget, plus an explicit "Understand what happens when a bet is stopped" affordance that surfaces consequences before the user confirms. Task-level human affordances are now restricted to comment, downvote, open thread, and read-who's-blocked.
4. **Session level delegated to the harness.** Collapsed session-specific value-adds. The single story-level affordance is "Jump into the agent's session in its harness." Work surfaces session metadata (cost, duration, agent, outcome) but does not render the interior — opencode, hermes, pi agent, openclaw, and the rest own that surface.
