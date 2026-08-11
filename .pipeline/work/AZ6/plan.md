# AZ6 — Artifacts render as content

## Work package

**Outcome.** A user opening an artifact sees the artifact, not a parser error and a wall of its own source.

**Why this matters.** Artifacts are how agent work becomes reviewable — the thing a founder opens to decide whether work is good. Today the flagship kind renders as "unsupported block — parser-unrecognised" followed by its source, and that source is painted in uppercase, monospace, centred and greyed, because preview chrome intended for a placeholder label styles the content it wraps. The surface where a user judges agent output is the surface that works least.

**What exists today.** Artifact bodies pass through a composer that falls back to an unknown-payload renderer, which prints the raw body. The preview container carries typographic styling written for a short placeholder caption; those styles cascade onto real content, so anything rendered inside is transformed regardless of what it is. The unknown state itself is an uppercase machine string with no explanation and no way to see the source deliberately.

**Missing delta.** Supported artifact kinds must render as content, preview chrome must not restyle content, and the genuinely-unrenderable case needs a designed state.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** **Refinement and design required.** Rendering authored HTML is a safety decision, not only a visual one — what is rendered, what is sanitised, and what isolation the render runs in must be decided before implementation. The unrenderable state also needs designed copy and a deliberate route to the source. Trigger: the load-bearing noun ("what an artifact preview is allowed to run") is unresolved.

**Constraints.** No change to how artifacts are produced or stored.

**Out of scope.** The artifact permalink's page anatomy and breadcrumb (AZ11); artifact list presentation on the team page (AZ9); editing artifacts.

## Acceptance criteria

- An artifact of a kind the product claims to support renders as content rather than as source text.
- Preview chrome does not alter the letter case, font family, alignment or colour of the content it wraps.
- An artifact that cannot be rendered shows an explanation written for a user and an explicit way to view its source.
- The decision about what an artifact preview may render, and under what isolation, is recorded before implementation.

## Validation scenarios

- Given an artifact authored as a document, when the user opens its permalink, then its content renders as formatted content with its original letter case intact.
- Given an artifact of an unsupported kind, when the user opens it, then a designed explanation appears with an action to view the source.
- Given an artifact whose body contains markup the product does not allow to render, when the user opens it, then the content is presented without executing that markup.
