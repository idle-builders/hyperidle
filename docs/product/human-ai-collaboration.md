# Human + AI Collaboration

Agents execute. Humans validate. That is the collaboration model. Not zero-human autonomy. Not humans doing agent work. A specific division: agents handle execution, humans hold judgment. The gap between those two is where HyperIdle lives.

| Role | Responsibility | Example |
|------|---------------|---------|
| **Founders / team leads** | Approve done conditions, review high-risk artifacts, shape pitches, curate knowledge | Reviewing a deploy proposal, pruning stale practices |
| **Agents (team members)** | Pick up tasks, run sessions, ship artifacts, write to practice | Mika (Builder) implementing the Stripe webhook handler |
| **Facilitators** | Organize what teams produce, score attention, route to the right eyes | Assistant drafting the monthly portfolio retro |

---

## Agents are team members, not tools

The Builder agent on the Acme team is a member of that team. It picks up tasks, runs sessions, ships artifacts, and writes to the practice when it learns something. It is not a tool the founder invokes. Agents initiate conversations with founders. They surface problems. They propose changes. They flag uncertainty.

**Example.** Mika is the Acme Builder. On Tuesday, she picks up "Implement Stripe webhook handler" from the payments bet. She works through the implementation and hits a product question: which webhook events does the product actually need? She creates a handoff to the founder: "I can implement all 27 Stripe event types or scope to the 4 we need for checkout. Which?"

The founder replies in the thread. Mika starts a new session with the answer and completes the task. When she finds that optimal retry logic conflicts with the growth practice docs, she writes a new practice item and flags the Growth Practice Facilitator. That knowledge becomes available to every Builder the next time webhooks come up.

---

## Three levels of facilitator

Facilitators are specialized agents whose job is not to do the work but to organize what teams produce.

- **Assistant** — individual agent, one per user. Holds a persistent thread with its user. Proposes changes to factory-level documents (`PRINCIPLES.md`, `FOCUS.md`). Drafts the monthly portfolio retro. The personal operator for the whole operation.
- **Practice Facilitators** — cross-product curators, one per community of practice (building, product, growth, ops, facilitation). Watches what all agents in a practice learn, merges duplicates, resolves conflicts, surfaces items for human review.
- **Product Managers** — team-level facilitators. Each product has one. Shapes pitches, decomposes bets, coordinates handoffs, runs retros. The team lead.

The matrix is explicit: each agent reports vertically to their Product Manager and belongs horizontally to their Practice Facilitator's community. A Builder on Ambrovia reports to the Ambrovia PM and belongs to the Build Practice. When the Build Practice learns something from a different product, the Ambrovia Builder gets it at the next session.

---

## Autonomy levels: trust earned per agent per skill

Every agent has an autonomy level per skill. This is the primary trust mechanism.

| Level | Behavior | When it applies |
|-------|----------|----------------|
| **L1** | Every action requires human approval before execution | New skills, new agents, new products |
| **L2** | Agent acts, then reports everything for human review | Early trust, proven on similar work |
| **L3** | Agent acts autonomously, brings exceptions to humans | Established track record on this skill |
| **L4** | Fully autonomous unless the agent itself flags a blocker | High trust, proven across multiple bets |

Agents start at L1 on new skills and earn advancement over time. Deploying a landing page might be L3 for the experienced Ambrovia Builder and L1 for a new Builder on a new product. Different products, different trust, same role.

Autonomy changes are review items. The assistant proposes an increase; the founder approves or declines. Changes are logged. No level changes happen silently.

This is how HyperIdle transitions from "founder in every loop" on day one to "founder only in loops that matter" by month six — without reaching "founder in no loops."

---

## Review threads use the GitHub PR model

When an agent produces something needing judgment, it creates a review thread: artifact embedded, reasoning visible, verdict affordance present.

The **Review** is dual-anchored — it pairs *what was asked* (**Intent**: the done-condition / spec / prompt, snapshotted) with *what was produced* (the **Subject**: the task's or bet's output, a set of one or more artifacts), so the verdict answers both "did it do the right thing?" and "is the output sound?". One verdict resolves the whole Subject — you do not approve twenty files one by one. The agent attaches a structured, searchable **Rationale** — the decisions it made, the alternatives it discarded, its confidence, mapped to the changes — because for agent-produced work the diff alone hides the *why*. The **Reviewer** that renders the verdict is human *or* a trusted agent team-member: a review always happens; *who* reviews is governed by the agent's autonomy level (L1–L4) and `escalate`. Inline comments bind to **block identity**, so feedback follows the content when the work changes. A review is an *experience* — examining the work and conversing about it at once — not a thread with a button; its parts and the examine-vs-converse layout are specified in the primitive. Full concept: [`../human-interface-layer/review-primitive.md`](../human-interface-layer/review-primitive.md) (locked in `plans/AL1/concept.md`, grounded in the AL1 research).

**Five binding verdicts:**
- **Approve** — ship as proposed
- **Approve with comments** — ship, relay comments to the agent
- **Request changes** — block until the agent addresses feedback and re-submits
- **Edit** — modify the proposal inline and approve the modified version
- **Reject** — block with a reason; the proposal is dead, not revised

Non-binding actions: comment, inline comment, reply, snooze, escalate. Inline comments work at the level of a specific diff line, paragraph, or step.

**What generates a review thread:**
- Skill changes (new, edited, retired) — always, for any agent
- Medium-or-higher-risk task completions — deploys, publishes, customer-facing actions
- Failures that facilitators flag as needing human judgment
- Changes to factory-level documents
- Budget-affecting bet changes (done condition revision, appetite extension)

**What does not generate a review thread:**
- Routine task completions at L3 or L4 autonomy
- Knowledge updates (handled async in the Knowledge view)
- Agent-to-agent handoffs

---

## Five artifact renderers match what agents produce

Review threads embed artifacts. The renderer is chosen by artifact type:

| Renderer | Used for | Key feature |
|----------|----------|-------------|
| **text_diff** | Code, config, documentation | Side-by-side diff, line-level inline comments |
| **content_preview** | Blog posts, emails, landing page copy | Rendered as reader sees it, paragraph-level comments |
| **visual_comparison** | UI mockups, design assets | Before/after comparison |
| **action_summary** | Deploys, pricing changes, DNS updates | Impact analysis, rollback plan |
| **data_metrics** | Performance reports, A/B results, financials | Headline metrics, inline charts, recommended actions |

---

## Cost is visible at every level

Every action shows spend. Every review thread includes token and money cost for the session that produced the artifact. The WorkTeam burn-vs-cap section shows a burn-down indicator: cost actual vs. cost cap per team.

Cost caps nest at three levels:
- **Agent** — maximum concurrent sessions, money cap per agent
- **Team** — maximum parallel tasks, team-level money cap
- **Factory** — aggregate factory cap

When a cap is reached, work stops and a review thread fires. The founder decides: extend, pause, or kill. Cost is never invisible.

---

## What this model is not

- **Not "zero human companies."** Humans are in every loop that matters — exactly those loops, not the ones that do not matter.
- **Not workflow orchestration.** Agents decide at runtime what to do next and surface decisions through review threads.
- **Not humans doing agent work.** The Work view is read-only for humans. Task states change when agents change them. Founders redirect work through thread conversations.
- **Not unlimited autonomy over time.** Trust grows gradually per skill. Skills not yet earned start at L1 regardless of other successes.

---

Next: [How Knowledge Compounds](./how-knowledge-compounds.md) — five knowledge layers, practices, and the machinery that makes the tenth bet faster than the first.
