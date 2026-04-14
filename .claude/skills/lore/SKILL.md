---
name: lore
description: Capture cross-cutting architectural decisions, constraints, gotchas, and tribal knowledge as structured @lore comments in code or as standalone lore documents.
argument-hint: "[file paths, 'scan' to find undocumented decisions, or 'index' to list all lore]"
user-invocable: true
allowed-tools: Read Edit Grep Glob Bash
---

# Lore

Capture and manage tribal knowledge — the decisions, constraints, and gotchas that don't belong in code comments but are too important to forget.

Lore is for **cross-cutting impact**: decisions that affect multiple files, future developers, or require context that isn't obvious from the code alone.

---

## Mode: Capture (`/lore <file paths>`)

Read the specified files and identify decisions worth documenting:

1. **Read each file** and look for:
   - Non-obvious constraints (why something can't be simpler)
   - Cross-cutting decisions (this choice affects files elsewhere)
   - Workarounds (temporary solutions with known limitations)
   - Performance tradeoffs (chose speed over readability, or vice versa)
   - Architecture boundary enforcement (why this import/dependency exists or is forbidden)

2. **Add `@lore` comments** at the relevant code location:

```typescript
/**
 * @lore 2026-04-14
 * @tags architecture, knowledge-fabric
 * @kind constraint
 *
 * Knowledge items at L2+ are materialized as TOON (compact binary) for agent
 * context windows. This means field names are abbreviated to single chars.
 * Don't "fix" the short names — agents receive them as-is and the TOON codec
 * handles the mapping. See KNOWLEDGE_ARCHITECTURE.md §3.2.
 */
```

### Lore Kinds
- **`decision`** — A choice was made between alternatives. Document what was chosen and why.
- **`constraint`** — Something that can't be changed without understanding the ripple effects.
- **`workaround`** — A temporary solution. Document what the real fix would be.
- **`gotcha`** — Something that will surprise future developers.
- **`tradeoff`** — An explicit tradeoff with known costs.

### Rules for `@lore` comments
- Only for cross-cutting impact. If it only affects the current function, use a regular comment.
- Include a date so readers know when this was true.
- Include `@tags` for searchability.
- Keep it under 6 lines. Link to architecture docs for details.
- Never add lore for obvious things. If the code is clear, silence is better.

---

## Mode: Scan (`/lore scan`)

Scan the codebase for decisions that should have lore but don't:

1. Look for patterns that suggest undocumented decisions:
   ```bash
   # TODO/FIXME/HACK/WORKAROUND comments without @lore
   # eslint-disable / biome-ignore / @ts-ignore without explanation
   # Unusual patterns that differ from the rest of the codebase
   ```

2. Read files around each finding. Determine if a `@lore` comment is warranted.

3. Report findings:
   ```
   Found N undocumented decisions:
   
   1. packages/fabric/src/materializer.ts:42
      Pattern: Manual TOON encoding instead of using codec
      Suggested kind: workaround
      
   2. packages/server/src/routes/bets.ts:15
      Pattern: Authorization check duplicated from middleware
      Suggested kind: gotcha
   ```

4. Ask the user which ones to document, then add `@lore` comments.

---

## Mode: Index (`/lore index`)

List all existing `@lore` comments across the codebase:

```bash
# Find all @lore comments
```

Produce a table:

```
| File | Line | Kind | Tags | Summary |
|------|------|------|------|---------|
| packages/fabric/src/materializer.ts | 42 | constraint | knowledge-fabric | TOON field abbreviation is intentional |
| packages/server/src/routes/bets.ts | 15 | gotcha | authorization | Auth check duplicated for historical reason |
```

Group by tags for a knowledge map of the codebase.
