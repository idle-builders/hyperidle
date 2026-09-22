# Document Decay Sweep

Use this skill when you need to review the team's documents for stale or unused ones. This is the weekly upkeep routine that keeps the document tree relevant.

## When to use

- Scheduled weekly sweep (Sundays at 3am)
- When the document tree has grown large and needs pruning
- When you want to identify documents that have not been used recently

## What this skill does

1. Find ordinary documents unused for 90 or more days, least-used first:
   `search_documents({ status: "active", slot: "ordinary", inTree: true, unusedSince: <90 days ago, ISO>, sort: "least_used", limit: 50 })`.
2. Archive each result: `edit_document({ id, status: "archived", version })`.
3. Report a summary of what was archived.

## Guidance

`slot: "ordinary"` is the whole safety rule, spelled out: it leaves skills, rules, agent identities and routine prompts alone, because every plugin-contributed document is written with a non-ordinary slot. `inTree: true` keeps artifacts and memories out of the sweep — they are not part of the browsable document tree. Only archive documents genuinely unused for 90+ days; when in doubt, leave it active rather than archive it. Write a brief summary of changes made.

**Caveat:** if a plugin ever contributes an ordinary-slot document to the tree, this filter stops being sufficient on its own — it would need a real provenance check, which this skill does not have access to (`plugin_contributions` is not a readable surface here).
