# AZ8 — One message composer

## Work package

**Outcome.** Wherever a user can write a message, the composer looks and behaves the same, and never covers the message above it.

**Why this matters.** There are three composers today: a textarea with an attach control and an icon send button in conversations; a bare input with a text "Send" pill on tasks, knowledge and artifacts; and the design system's own composer, used only in review threads. Writing a message is the single most repeated action in the product, and it is a different control each time. Worse, in a conversation the last message is clipped behind the composer with no spacing, and at a phone viewport the composer sits on top of the review card, cutting its primary action in half.

**What exists today.** The design system ships a composer that no main thread surface uses. The two hand-rolled variants differ in affordances, in their disabled treatment and in their placeholder register. The message list does not reserve space for the composer that overlays it.

**Missing delta.** One composer, adopted on every thread surface, in a layout that reserves its own space.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Not required — the design system's composer is the approved pattern; this is adoption. An architecture round still precedes the build — see the execution procedure below.

**Execution procedure (human-approved).** Skip the pipeline's standard phase set. One agent runs an architecture round first and stops; the founder reviews and approves it before any code is written. The same agent then builds in a single session — tests, then code. When it is done, one fresh agent reviews it, one round only. No refinement, design or critique phase, and no further human gate after the architecture approval. Founder decision, 2026-08-11: this is the approved procedure for this work package and the orchestrator does not add phases to it.

**Constraints.** No loss of an affordance a user has today: attachment and send-by-keyboard must survive the consolidation wherever they exist now.

**Out of scope.** Message rendering, grouping and day separators; the assistant overlay gaining a composer where it has none (AZ13 territory if the overlay is reshaped, otherwise a follow-up).

## Acceptance criteria

- Every surface on which a user can write a message renders the same composer.
- That composer offers the same affordances on every surface where the underlying capability exists.
- The last item of a message list is fully readable and is never obscured by the composer, at every supported viewport.
- No hand-rolled composer remains in the codebase.

## Validation scenarios

- Given a conversation, a task and a knowledge item, when the user compares the message inputs, then they are the same control with the same affordances.
- Given a conversation scrolled to the end at a phone viewport, when the user reads the last message, then it is fully visible above the composer.
