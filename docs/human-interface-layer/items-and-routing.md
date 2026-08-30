# Items and Routing

<!-- @source framework/db/src/schema.ts -->
<!-- @source framework/api-contract/src/core-api-port.ts -->

Every item that flows through any view is the same shape under the hood. The view decides how to render it; the process layer decides where to send it.

## 1. The Item shape

An Item is a **routing projection**, not the conversation itself. The Thread + Message rows are the source of truth for the conversation history — including the verdict and any inline comments (see [thread-primitive.md](thread-primitive.md)). Every Item belongs to a thread: `thread_id` is a NOT NULL FK (`framework/db/src/schema.ts`).

Live columns (`framework/db/src/schema.ts`):

```
Item {
  id               # stable, addressable
  source_agent_id  # which agent sent this — uses agent identity
  layer            # knowledge-architecture layer; see docs/knowledge-architecture/the-five-layers.md
  verb             # the human activity: review | prioritize | bet | assist | curate
  kind             # the rendering shape: review | chat | skill_change | work | knowledge
  title            # one-line, decidable
  body             # markdown; rendered by the view
  attachments
  proposed_action  # the structured thing the human is deciding on (review kind only)
  options          # which actions are allowed
  risk_tier        # low | medium | high — controls routing + notification behavior
  blocking         # bool — does an agent literally pause until this is resolved?
  reasoning        # WHY the agent surfaced this — non-negotiable for trust
  audit_trail      # full history of the decision so far
  thread_id        # NOT NULL — every item hangs off a Thread
  created_at
}
```

Risk tiers are enforced at the tool boundary: `low | medium | high` (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts`).

Review-kind items render through the review canvases; the decision UI is the 5-verdict grammar owned by [thread-primitive.md](thread-primitive.md).

**Two durable principles:**

- **`reasoning` is non-negotiable.** Every Item explains *why* the agent surfaced it. Humans don't trust agents they can't reason about.
- **`kind` and `verb` are separate on purpose.** `verb` is the human activity; `kind` is the rendering shape. An item can shift kinds without losing identity — a chat thread that produces a concrete proposal becomes a review thread inline, and the history is preserved.

There is no separate Response record. The `responses` table was dropped (`framework/db/src/schema.ts`) — human verdicts project as `verdict`-typed messages on the thread, carrying a `decision` from the 5-value grammar plus `resolvesMessageId`. See [thread-primitive.md](thread-primitive.md).

## 2. Routing: how items find the right view

Routing is a pure function: `routeItem({ riskTier, kind, verb })` (`framework/api-contract/src/core-api-port.ts`), invoked by the `route_item` facilitator tool (`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts`). Facilitators — the strategy agents that curate attention — do the routing (see [../knowledge-architecture/facilitators.md](../knowledge-architecture/facilitators.md)).

Rules, in match order:

| # | Rule | View |
|---|---|---|
| 1 | `risk_tier` medium or high | Conversations |
| 2 | `kind` review or skill_change | Conversations |
| 3 | `kind` knowledge | Knowledge — async curation, never approval |
| 4 | `kind` work or `verb` bet | Work — bet-shaped items only when shaped enough to bet on |
| 5 | `kind` chat | Conversations |
| 6 | everything else | Conversations (default) |

Strategic / rule-shaped items — about how the factory *operates*, not what it's doing — belong in the assistant's thread: the pinned user-hosted thread classifies as "assistant" (`framework/domain-model/src/thread.ts`).

## 3. The less-interruptive-view principle

When in doubt, facilitators err toward the less interruptive view. Conversations is the most expensive surface — it can interrupt a human's day. Items that don't earn a push notification shouldn't push there: only review items with `risk_tier` ≥ medium or `blocking` earn a `review_request` push; low-risk, non-blocking reviews demote to ambient (`framework/domain-model/src/notifications.ts`). Notification cadence and queue mechanics live in [notification-primitive.md](notification-primitive.md).

## 4. Routing is not a gate

Routing an item to Conversations puts it in front of a human; whether the agent *waits* is a separate question. There is no unconditional synchronous gate for high-risk or skill-change items — gating rides approval-rate trust (AD4: verdict-history × `risk_tier`, `layers/core-api/policy/src/policy-engine.ts`) and fades as trust grows. The trust surface is owned by [review-primitive.md](review-primitive.md). The gate that routes a consequential action to a human is being rebuilt; no document describes a live mechanism for it until it lands.
