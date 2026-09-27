---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# Comments

A comment earns its place by saying something the code can't say on its own: why, not what.

## Write

- **Why, not what.** Explain a decision, a constraint, or a trade-off the code itself doesn't show.
  Never narrate what the next line plainly does.
- **Present tense, present state.** No code history: no "previously", no "X replaced Y", no work-item
  narrative, no changelog. If it explains an active constraint, state the constraint — not its
  backstory.
- **No stale notes.** Delete a `TODO`, `RED`, or `FIXME` comment once the thing it flags is done.
- **Short.** A comment that has grown into a paragraph is a sign it belongs in a doc, not the code.

## Lore

`@lore` comments capture non-obvious, currently useful context — see the `lore` skill for what
qualifies and how to write one. This file doesn't repeat that; it only says lore is a comment, so the
rules above apply to it too: one line, present constraint, no history.

## Not in scope here

Applying this file to existing production comments is separate, later work. This rule governs what you
write from here on.
