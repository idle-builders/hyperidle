## 7. The Cross-Cutting Data Model

> **Reframe note (added with the L1 Thread primitive).** The Item / Response shape below is a *routing* working set — what's surfaced to which view, with what verdict yet. The *conversation history* (including the verdict and any inline comments) lives as a sequence of typed messages on the underlying Thread (§4.5). The two reconcile in implementation (architect's call during L1 planning); the concept rule is that the Thread + Message rows are the source of truth for the conversation, and the Item / Response model is one projection of it.

Every item that flows through any view is the same shape under the hood. The view decides how to render it; the meta layer decides where to send it.

```
Item {
  id              # stable, addressable
  source          # which agent sent this — uses agent identity
  layer           # L0 / L1 / L2 / L3 / L4
  verb            # review | prioritize | bet | assist | curate
  kind            # review | chat | rail | work | knowledge <!-- @lore AD8a: historical — Rail removed in U6 -->
  title           # one-line, decidable
  body            # markdown; rendered by the view (chat threads, reasoning text)
  proposed_action # the structured thing the human is deciding on (review kind only)
                  # typed: { type: "text_diff" | "content_preview" | "visual_comparison" |
                  #          "action_summary" | "data_metrics",
                  #          payload: { ... type-specific fields ... } }
                  # each type has its own renderer in the Conversations view (see §4.1)
  options         # which actions are allowed: approve|edit|reject|snooze|reply|
                  # request_changes|comment|inline_comment|escalate|...
  risk_tier       # low | medium | high — controls notification + blocking behavior
  attention_score # numeric, from facilitators — controls ordering
  blocking        # bool — does an agent literally pause until this is resolved?
  deadline?       # optional soft deadline
  thread?         # threads items together for the same task or conversation
  pinned?         # bool — the assistant's chat is always pinned
  reasoning       # WHY the agent surfaced this — non-negotiable for trust
  cost_estimate?  # token / dollar cost of the proposed action
  audit_trail     # full history of the decision so far
  created_at
}
```

And every human action takes the same shape:

```
Response {
  item_id
  decision        # approve | approve_with_comments | comment | inline_comment |
                  # request_changes | edit | reject | reply | snooze | escalate |
                  # nudge | flag | merge | split | rename | archive | ...
  inline_anchor?  # for inline_comment: which part of the proposal
  edits?          # if decision === "edit"
  feedback?       # short text for the agent
  approver        # human identity
  view            # which view the response came from
  responded_at
}
```

**`reasoning` is non-negotiable.** Every Item explains *why* the agent surfaced it. The 2026 research was unambiguous: humans don't trust agents they can't reason about.

**`kind` and `verb` are separate on purpose.** `verb` is the human activity; `kind` is the rendering shape. A single item can shift kinds without losing identity — a chat thread that produces a concrete proposal becomes a review thread inline, and the history is preserved.

---
