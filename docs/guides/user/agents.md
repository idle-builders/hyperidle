## Agents

### Your Assistant

Every HyperIdle user has a personal **Assistant** — a permanent conversation thread in the overlay at the bottom of the sidebar. The Assistant is a personal operator scoped to you: it sees what you can see and acts on your behalf.

**Starting work by talking.** The most natural way to create a bet is to describe your idea in the Assistant thread and let it draft the bet for you:

1. Open the Assistant overlay (click the assistant button in the sidebar, or press `Cmd+.`).
2. Describe your idea in natural language. For example: "I want to add a waitlist page with email capture and a confirmation email."
3. The Assistant replies with context questions or clarifications, then drafts a bet — a goal and a concept body — derived from the conversation.
4. The draft appears as a **BetCard** below the Assistant's reply. Click it to open the bet in the authoring surface.
5. Review and edit the description, done condition, and hypothesis. The draft is fully editable.
6. When the bet looks right, commit it. Committing starts work — the team picks up the bet and begins planning tasks.

**Iterating the draft conversationally.** If the draft isn't quite right, keep talking:

- "Narrow the scope to just the waitlist form — skip the confirmation email for now."
- "Change the appetite to two weeks."
- "Add a done condition: the signup rate from the landing page is tracked in analytics."

Each reply updates the same draft in place. The BetCard in the thread updates on the next turn.

**What the Assistant never does.** The Assistant drafts and refines but never commits on your behalf. Committing is always your action — it's the moment you decide work starts. The Assistant also cannot create teams, add agents, or take any administrative action from the thread.

---

### Agent Types

**Your personal agent:**
- **Assistant** — your personal operator. Converses in its own persistent thread. Can draft bets from conversation, answer questions, and help you navigate the factory.

**Product team agents** (one set per team):
- **Product Manager** (team lead) — shapes, decomposes bets into tasks, coordinates
- **Builder(s)** — implementation (code, tests, deployments)
- **Growth Agent** — analytics, experiments, marketing
- **Ops Agent** — deployment, monitoring, incident response

**Strategy agents** (knowledge-scoped, mostly background):
- **Practice Facilitators** (one per discipline: Building, Growth, Product, Ops, Facilitation) — synthesize cross-team patterns into knowledge; surface items for your attention

### How Agents Work

Agents run in **sessions** — bounded work units on a specific task. Each session:
1. Gets context assembled from the task, the bet, and relevant knowledge
2. Works in a sandbox toward the task's done condition
3. Creates review items when they need your approval
4. Finishes and captures learnings back into the knowledge layer

You don't manage sessions directly. Agents pick up work from committed bets, run sessions, and surface results through Conversations.
