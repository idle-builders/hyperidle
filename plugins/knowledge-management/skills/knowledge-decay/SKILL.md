# Knowledge Decay Sweep

Use this skill when you need to review the team's knowledge base for stale or outdated items. This is the weekly upkeep routine that keeps the knowledge base relevant.

## When to use

- Scheduled weekly sweep (Sundays at 3am)
- When the knowledge base has grown large and needs pruning
- When you want to identify items that have not been referenced or updated recently

## What this skill does

1. Search for knowledge items not updated in 30 or more days
2. Recompute attention scores for those items using the `score_attention` tool
3. Archive items whose attention score falls below 0.1 and have not been referenced in 90 days
4. Report a summary of what was pruned and what was retained

## Guidance

Start by searching for knowledge items sorted by last-updated date. Use `score_attention(mode:"recompute")` on each candidate. Only archive items that are genuinely stale — prefer lowering the score over archiving when in doubt. Write a brief summary of changes made.
