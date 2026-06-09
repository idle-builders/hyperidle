## 8. Routing: How Items Find the Right View

The facilitator family (from KNOWLEDGE_ARCHITECTURE.md) does the routing. Each facilitator emits items targeted at a specific view based on the attention they need:

| Item characteristic | View |
|---|---|
| Concrete, decidable, risk ≥ medium or skill-change | Conversations (review kind) |
| Agent-initiated conversation, no verdict needed | Conversations (chat kind) |
| Cross-product pattern, rule change, reflection | Conversations (Chief of Staff's chat, pinned) |
| Order/rank-able, not yet a decision | Conversations filter chips (triage state) |
| Shaped pitch or task status update | Work |
| Knowledge update, in-flight or pruning | Knowledge |

Routing rules:

1. **Risk tier ≥ medium → Conversations (review).** Always. Irreversible or money-shaped items get the synchronous gate.
2. **Skill changes → Conversations (review).** Always. Skills compound, so they wait for a human.
3. **Knowledge updates → Knowledge.** Never Conversations. Async curation, not approval.
4. **Strategic / rule-shaped items → Chief of Staff's chat.** If it's about how the factory *operates*, not what it's doing.
5. **Pitches → Work.** Only when shaped enough to bet on.
6. **Everything else → Conversations with ambient indicators.** Triage badge, filter chips, and agent health dots surface awareness without demanding attention.

When in doubt, facilitators err toward the less interruptive view. Conversations is the most expensive view (it can interrupt a human's day); items that don't earn a phone notification shouldn't push there.

---
