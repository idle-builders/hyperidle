## Three Core Views

### 1. Conversations (where you spend 90% of your time)

A conversation is a calm, single-column read of the messages you and your agents deliberately send. Humans and agents are equal participants, grouped by author — one avatar, name, and time per run of messages from the same sender. Your own messages carry a quiet "You" label; an agent is marked by its green avatar. No bubbles, no badge soup.

#### References show inline, not as bare links

When a message points at something — a code artifact, an image, a knowledge doc, a referenced block — it renders as a compact **reference chip** you can click to open the real thing. A linked session shows as a quiet "Show session" fold, never an inlined work-log. Clicking any reference opens its own view (the artifact view, the knowledge page, the session dial-in); the conversation never renders a viewer in place.

#### Reviews open on the review page

A review request shows compactly in the conversation: a "Review requested" marker, the proposal line, the change-set as a reference chip, and one **Open review** button.

You do **not** approve or reject inside the conversation. Click **Open review** to reach the review page, where the artifact view and the full verdict toolbar live. Once you decide, the conversation shows a one-line echo — "✓ Approved by …" — with a quiet **View review** link back. (See the [review page](#review-verdicts) below for the verdict actions.)

#### Quick questions

An agent can ask a quick question inline — a small "?" marker, the question, and neutral answer buttons. Pick one to answer without leaving the conversation.

#### The composer

One text box, one **Send**. The **"+"** button opens a single tools menu — Insert block, Attach file, Mention, Reference item, Format, Emoji. Attachments you add show as draft reference chips above the box; remove one with its ✕. Plain send works today; the richer "+" actions are affordances that route to their tools as those land.

#### Review Verdicts

When you open a review on the review page, you have these actions:

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

**Work overview** — A list of your teams. Each team row shows the team name, how many bets are active, and a status chip (healthy / behind / blocked). Teams sort by urgency: blocked first, then behind, then healthy. Click a row to open that team.

If you only have one team, the Work overview is skipped — clicking Work in the sidebar takes you straight to your team's page.

**Team** — Each team page shows burn-vs-capacity metrics, active bets, routines, and agents. Click **New bet** here or from the Work overview header to start a bet.

**Bet Detail** — Click a bet to see its full pitch, progress bar, cost tracker, task list, and comment thread.

#### What the task section shows

The Tasks section on a bet detail page shows one of four states:

| State | What you see | What it means |
|---|---|---|
| Tasks present | Task rows with status chips | Agents are working or work is queued |
| Not committed | "Not committed yet" | The bet is still in draft; commit to start work |
| Planning | "Planning the work" with a live pulse | The PM agent is breaking the bet into tasks — takes a moment |
| Blocked — no agent | "No one can take this work" + Add an agent link | The team has no agent eligible to own tasks; add one to proceed |
| Blocked — failed | "Couldn't plan the work" | The PM turn failed; try committing again after refining the goal |

The "Tasks will appear here once agents start work" placeholder no longer appears on committed bets — either tasks are there, or an honest reason explains why they aren't.

#### Weekly Planning Workflow

1. Open **Work** — you see your teams sorted by urgency
2. Click a team (or use the Work overview header's **New bet** button)
3. In **Team View**, click **"New bet"** to create a bet (title, pitch, team, appetite)
4. Open the bet and click **Commit** — agents immediately begin breaking the bet into tasks
5. Watch the task section: tasks appear within seconds once the PM agent finishes planning
6. Review active bets and their progress

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
