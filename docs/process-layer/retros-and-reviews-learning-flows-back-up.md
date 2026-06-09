## 11. Retros and Reviews: Learning Flows Back Up

Every shipped (or killed) bet produces learning. The job of the process layer is to make sure the learning gets *captured* and *reaches the right place*.

### 11.1 Bet retro (every ship or kill)

When a bet hits `shipped` or `killed`, the Product Manager drafts a retro:

- What was the original hypothesis? Did it hold?
- What surprised us?
- What patterns showed up that the practice should know?
- What rule about how the factory operates should change?
- What artifacts are reusable in future bets?

The retro is posted to the bet's thread. It then routes to two places:

1. **The Practice layer** — the patterns and surprises become Practice items (CAPTURED → eventually ACTIVE), curated by the practice facilitators and the human via the Knowledge view.
2. **The assistant thread** — the rule-shaped insights ("we keep underestimating brand-voice review effort") become assistant thread items for the founder to chew on. If they translate into a `PRINCIPLES.md` change, the assistant drafts the edit and routes back through Conversations for approval.

### 11.2 Cycle retro (monthly)

Once a month the assistant drafts a portfolio-level retro that aggregates across all active products. Cross-product patterns, recurring obstacles, capacity observations, cost trends. This lands in the assistant thread.

### 11.3 Practice contribution loop (continuous, agent-driven)

The biggest learning channel isn't retros — it's the continuous contribution every agent makes to its own practice as it works. This is what keeps the team in sync with the practice without anyone having to push notifications.

The loop:

1. **As an agent works a session**, it accumulates findings — patterns it noticed, things that worked, things that didn't, snippets that should be reusable, things its practice doesn't know yet but should.
2. **At the next practice session** (each practice has its own rhythm — typically weekly), the practice "meets" in a structured three-turn conversation:
   - **Turn 1 — Propose.** Every agent in the practice posts the findings it accumulated since the last session. Each finding is a candidate knowledge item — could become practice knowledge, could become product knowledge, could be noise.
   - **Turn 2 — React.** All agents see the full set of proposals and comment with their own context and relevance: "we saw the same thing in Ambrovia," "this contradicts what we learned last month," "this is product-specific, not practice-level." This cross-pollination is where the real value emerges.
   - **Turn 3 — Synthesize.** The Practice Facilitator reads all proposals and reactions, then decides: which findings become CAPTURED practice items (L3), which get routed to product knowledge (L2), which are noise. The facilitator writes the resulting items back to `knowledge_items`.

   Not all findings become practice knowledge. Plenty will be product-specific and route to L2 instead of L3. The facilitator's job is to make that call.
3. **The Knowledge view** (the human surface, async) is where the human curates what the practice produced — prioritizes the agenda, flags items that look off, prunes the tree when it gets messy.
4. **When a team member starts a task session**, the Knowledge Fabric materializes the relevant practices into the workspace's `context/practices/` directory as TOON packs. Anything new the practice has decided since the last session is now available — automatically, no notification needed. The team is in sync with the practice because every member's workspace is materialized fresh from the same canonical `knowledge_items` store.

This is how knowledge actually flows in a healthy flat company. People in a discipline meet regularly, share what they learned, decide what's worth keeping, and then carry that knowledge back into their work. There's no broadcast "the practice has updated" notification — the knowledge is just *there* the next time the Knowledge Fabric materializes a workspace. The materialization step is what makes the loop close.

The implication for the team: the team stays current on its practice because every team member is also a practice member. The practice is not a wall; it's the substrate that team members swim in between sessions. A team member who shows up to a task session has already absorbed (through its practice membership) whatever the practice has decided since the last task session.

### 11.4 Practice review (weekly, async, by humans)

The Knowledge view view (`HUMAN_INTERFACE_LAYER.md` §4.4) is where the human prunes and shapes the practice each week. This is the recurring counterweight to AI-only drift, and it complements the agent-driven contribution loop above. Agents contribute and discuss; humans prune and shape.

### 11.5 Why retros are not optional

Retros are the bottom-up signal path. Without them, the team learns (in its own memory) but the practice doesn't, the founder doesn't, and the next bet repeats the same mistakes from a different team. Retros are a routine on the Product Manager: they fire automatically when a bet ships or is killed and they cannot be skipped.

---
