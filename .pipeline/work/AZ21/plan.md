# AZ21 — Search and Assistant entry surface

## Work package

**Outcome.** A person has one clear top-corner entry point for finding something or asking for help, while Search and Assistant retain distinct task outcomes inside a coherent surface.

**Why this matters.** Search and Assistant both begin with “I need to get somewhere or accomplish something specific,” yet two adjacent icon triggers expose separate windows and force the user to choose a mechanism before expressing their intent.

**What exists today.** AZ13 visually groups the existing Search and Assistant triggers in the brand row and preserves both current panels. Their windows, state and capabilities remain separate.

**Missing delta.** One designed entry interaction that decides how search, commands, context and assistant conversation coexist, what opens by default, and how existing capabilities migrate without disappearing.

**Depends on.** AZ13 — the stable header tool region must exist before one combined entry surface replaces its provisional grouped triggers.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Refinement and design required. The shared intent model, default mode, transitions and ownership of the existing windows are unresolved.

**Constraints.** Preserve keyboard access and every retained Search and Assistant capability. Do not imply one backend operation when the system still performs two different tasks.

**Out of scope.** New assistant intelligence, new search indexing and redesigning result destinations after they open.

## Acceptance criteria

- One labelled entry point opens a coherent surface from desktop and mobile while retaining all approved Search and Assistant journeys.
- The surface makes the current mode and available transition between finding and asking understandable without requiring the user to choose the mechanism before entering intent.
- Existing separate windows and triggers are removed only after their retained capabilities and keyboard entry paths are available through the combined surface.

## Validation scenarios

- Given the user knows an object name, when they open the entry surface and type it, then they can navigate to the matching result without first selecting Search mode.
- Given the user needs synthesis or action rather than a destination, when they continue into Assistant behavior, then their entered context is preserved and the mode change is clear.
