# AZ4 — No machine data in the interface

## Work package

**Outcome.** A user never sees an internal identifier, enum value, raw timestamp or source markup where a human-readable name, label or date belongs.

**Why this matters.** The largest text on a conversation is currently a database key. Team feeds title themselves with their own record id twice over. Sessions are subtitled with agent keys, org-chart rows with team keys, knowledge with a raw ISO string and "by unknown", agents with snake_case role enums. Machine data leaking into the interface is the single loudest signal that a product is unfinished, and it is visible on the surface a user spends the most time in.

**What exists today.** Identity lookups fall back to the raw key when resolution misses — and for teams the lookup always misses. Several surfaces print stored values straight through with no display mapping: enum values, ISO-8601 strings, markdown source in list previews. The setup flow already contains human labels for some of the same enums, so the mapping exists but is not shared. A relative-age formatter can emit a zero quantity, and at least one count is hardcoded to a plural noun.

**Missing delta.** One rule, applied everywhere: a stored value is translated for display, and an unresolved name degrades to a human fallback rather than a key.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Not required — this is a correctness and presentation pass with no new user-facing concepts. An architecture round still precedes the build — see the execution procedure below.

**Execution procedure (human-approved).** Skip the pipeline's standard phase set. One agent runs an architecture round first and stops; the founder reviews and approves it before any code is written. The same agent then builds in a single session — tests, then code. When it is done, one fresh agent reviews it, one round only. No refinement, design or critique phase, and no further human gate after the architecture approval. Founder decision, 2026-08-11: this is the approved procedure for this work package and the orchestrator does not add phases to it.

**Constraints.** Identifiers may still appear in copy-for-support affordances and developer surfaces, provided they are not the primary label of an object.

**Out of scope.** Changing what objects are named or how names are authored; permalink URL shapes; the artifact preview body (AZ6).

## Acceptance criteria

- No value used as a system or database key renders as the primary label of an object.
- When a display name cannot be resolved, the interface renders a human fallback naming the kind of thing, not the key.
- Stored enumerations render as display labels.
- Dates and times render in a consistent human register per context; no ISO-8601 string appears in the interface.
- A relative age never renders a zero quantity, and adjacent surfaces describing the same instant do not use two different formats.
- Counts agree grammatically with the number they report.
- Prose fields render as formatted text; source markup does not appear in previews or bodies.

## Validation scenarios

- Given a team feed conversation, when the user opens it, then its title is the team's name and no record id appears as a heading.
- Given a knowledge item, when the user views its detail, then its edited time reads the same way in the header and in the metadata panel.
- Given an item last changed twenty-nine days ago, when it appears in a list, then its age reads as a non-zero quantity.
