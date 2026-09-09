# Knowledge Promotion with Attention Recompute

Use this skill when you need to promote high-quality proposed knowledge items to active status, and to refresh attention scores across the knowledge base.

## When to use

- Scheduled weekly sweep (Sundays at 4am, after the decay sweep)
- When there is a backlog of proposed items waiting for promotion
- When attention scores are stale and need refreshing

## What this skill does

1. Run `run_knowledge_sweep(kind:"autoPromotion")` — it promotes every `proposed` item whose finding repeats across 5 or more scopes to `active`, in one call.
2. For items the sweep did not promote, recompute attention scores using `score_attention(mode:"recompute")` so their standing is current even while they wait.
3. Report which items were promoted and which remain proposed.

## Guidance

`run_knowledge_sweep` is the promotion mechanism — do not try to list or filter proposed items by hand, there is no tool for that. Only recompute attention on items the sweep left proposed; do not promote by hand outside the sweep's own repetition rule. Write a brief summary of what the sweep did.
