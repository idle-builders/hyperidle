# Human + AI Collaboration

HyperIdle is not a "zero human company" system. It is not fully autonomous agents. It is not humans doing agent work. It is a specific model: agents execute, humans validate. The gap between those two is where HyperIdle lives.

---

## The roles

**Founders and team leads** are the decision-makers. They approve done conditions, review high-risk artifacts, shape pitches, and curate knowledge. They do not write code, run deployments, or manage task lists directly. Their job is judgment at the moments that require it.

**Agents are team members.** The Builder agent on the Nimmly team is a member of that team. It picks up tasks, runs sessions, writes session notes, ships artifacts, and writes to the practice when it learns something. It is not a tool the founder uses — it is a participant in the team. Agents can initiate conversations with founders. They surface problems. They propose changes. They flag things they are uncertain about.

**Facilitators are curators.** A facilitator is a specialized agent whose job is not to do the work — it is to organize what the team produces, score what needs human attention, and route the right items to the right eyes at the right time. There are three levels:

- The **Chief of Staff** is the factory-level facilitator. It has a persistent Coach thread with each founder — an ongoing conversation about what is working, what is not, and what the principles should say. It proposes changes to factory-level documents (`PRINCIPLES.md`, `FOCUS.md`). It drafts the monthly portfolio retro. It is the COO brain for the whole operation.

- **Practice Facilitators** are cross-product curators, one per community of practice (building, product, growth, ops, and facilitation itself). A Practice Facilitator does not work on any single product. It watches what all the Builder agents across all products are learning, merges duplicates, resolves conflicts, and surfaces what needs human review. A good Practice Facilitator is a senior craftsperson who has seen everything happen twice and can spot the pattern.

- **Product Managers** are team-level facilitators. Each product has one. The Product Manager shapes pitches, decomposes bets, coordinates handoffs, and runs the team's retros. It is the team lead — vertical line management for the team. It also improves itself: it watches its own facilitation quality and proposes process changes.

The matrix structure is explicit: each team member reports vertically to their Product Manager and belongs horizontally to their Practice Facilitator's community. A Builder on the Ambrovia team reports to the Ambrovia Product Manager and belongs to the Build Practice community. When the Build Practice learns something new from a different product, that knowledge is available to the Ambrovia Builder at the next session.

---

## Autonomy levels: the trust dial

Every agent has an autonomy level per skill. This is the primary trust mechanism in HyperIdle.

- **L1** — every action requires human approval before execution.
- **L2** — the agent acts but reports everything; humans review after.
- **L3** — the agent acts autonomously, brings exceptions to humans.
- **L4** — fully autonomous unless the agent itself flags a blocker.

An agent does not start at L4. It starts at L1 on new skills and earns trust over time as its success rate justifies advancement. The level moves up per agent per skill — deploying a landing page might be L3 for the experienced Builder on Ambrovia and L1 for a new Builder on a brand-new product. Different products, different trust, same agent role.

Autonomy levels are edited via Conversations as review items. The Chief of Staff proposes a level increase; the founder approves or declines. Changes are logged. No level changes happen silently.

This is how HyperIdle transitions from "the founder is in every loop" on day one to "the founder is only in the loops that matter" by month six — without ever reaching "the founder is in no loops."

---

## Review threads: the GitHub PR model

When an agent produces something that needs human judgment, it creates a review thread. The review thread looks like a GitHub pull request: artifact embedded, reasoning visible, verdict affordance present.

There are five binding verdicts:
- **Approve** — ship as proposed.
- **Approve with comments** — ship, and relay the comments back to the agent.
- **Request changes** — block the action until the agent addresses the feedback. The agent revises and re-submits; the thread continues in place.
- **Edit** — modify the proposal inline and approve the modified version. Shortcut for "request changes, and here's exactly what I want."
- **Reject** — block the action with a reason. The proposal is dead, not revised.

There are also review actions that do not terminate the thread: comment, inline comment, reply, snooze, and escalate. Inline comments work at the level of a specific diff line, paragraph, or step — the same granularity as a GitHub inline review.

This matters because not everything is a yes/no. Half the interesting items are "yes, but also..." A binary approve/reject model forces founders to rubber-stamp to reduce friction. The PR model keeps the conversation alive until the right answer is clear.

**What generates a review thread:**
- Skill changes (new skills, edits, retirements) — always, for any agent.
- Tasks with risk tier medium or higher completing — deploys, publishes, customer-facing actions, anything irreversible.
- Failures that facilitators flag as needing human judgment.
- Proposed changes to factory-level documents (`PRINCIPLES.md`, `FOCUS.md`).
- Budget-affecting bet changes (done condition revision, appetite extension).

**What does not generate a review thread:**
- Routine task completions at L3 or L4 autonomy.
- Knowledge updates (those are async, handled in the Knowledge view).
- Agent-to-agent handoffs.

---

## The five artifact renderers

Review threads embed artifacts. The renderer is chosen based on what the agent produced:

- **text_diff** — code, config, documentation changes. Side-by-side diff with line numbers. Inline comments on specific lines.
- **content_preview** — blog posts, emails, landing page copy. Rendered as the reader will see it, not as raw markdown. Inline comments on paragraphs.
- **visual_comparison** — UI mockups, design assets. Before/after comparison.
- **action_summary** — deployments, pricing changes, DNS updates. Structured description of what will happen, impact analysis, rollback plan.
- **data_metrics** — performance reports, A/B results, financial projections. Headline metrics, inline charts, recommended actions.

The five renderers cover the range of what agents produce when building products. Extensions via skills can add tool-specific fields to any base renderer.

---

## Cost transparency

Every action shows spend. Every review thread includes token and money cost for the session that produced the artifact. The Rail shows a burn-down strip: current spend vs. budget for the day and the week.

Cost caps exist at three nested levels:

- **Agent level** — a maximum concurrent session count and a money cap per agent.
- **Team level** — a maximum parallel task count and a team-level money cap.
- **Factory level** — an aggregate factory cap.

When a cap is reached, work stops and a review thread fires. The founder decides whether to extend, pause, or kill the work. Cost is never invisible.

---

## What this is not

**Not "zero human companies."** The explicit goal of some agent frameworks is to remove humans from the loop entirely. HyperIdle is the opposite position. Humans are in every loop that matters — exactly those loops, and not the ones that don't.

**Not workflow orchestration.** Platforms like Temporal or LangGraph define graphs of steps in advance. HyperIdle does not. Agents decide at runtime what to do next, and they surface decisions to humans through the review thread mechanism. The coordination structure is emergent, not pre-wired.

**Not humans doing agent work.** Founders do not drag tasks between states, write code, or manage agent schedules. The Work view is read-only observation for humans — task states change when agents change them. If a founder wants to redirect work, they do it through a thread conversation, not by manually editing task state.

**Not unlimited autonomy over time.** Autonomy levels increase gradually as trust is earned. No agent goes from L1 to L4 in a day. No single accumulated success grants blanket autonomy. The trust dial is per-skill, and skills that have not been earned yet start at L1 regardless of the agent's other successes.

---

For the organizational structure that underlies this collaboration, read [How Work Flows](./how-work-flows.md). For how the knowledge the agents produce gets stored and used across products, read [How Knowledge Compounds](./how-knowledge-compounds.md).
