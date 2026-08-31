# Knowledge Promotion with Attention Recompute

Use this skill when you need to promote high-quality draft or review knowledge items to active status, and to refresh attention scores across the knowledge base.

## When to use

- Scheduled weekly sweep (Sundays at 4am, after the decay sweep)
- When there is a backlog of draft items waiting for promotion
- When attention scores are stale and need refreshing

## What this skill does

1. Find all knowledge items in `draft` or `review` status
2. Recompute attention scores using `score_attention(mode:"recompute")`
3. Promote items with high attention scores (above 0.7) to `active` status using the `promote_knowledge` tool
4. Report which items were promoted and which remain in review

## Guidance

Use `search_knowledge` to find items by status. For each candidate, recompute its attention score first. Only promote items that are clearly valuable and well-formed. Items that need more work should stay in draft. Write a brief summary of promotions made.
