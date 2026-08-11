# AZ7 — One status vocabulary

## Work package

**Outcome.** A user learns what a status looks like once and reads it correctly everywhere, and two surfaces describing the same object never disagree about its state.

**Why this matters.** One scroll of the team page shows five different presentations of "status": an uppercase tinted chip on bets, lowercase coloured monospace text on agents ten rows below, a bare coloured dot on routines, uppercase monospace warnings repeated thirteen times in settings, and lowercase monospace pills in the conversation queue. The words disagree too — the team header says BLOCKED while the status card beside it says "Attention". A user cannot build a reliable mental model of state, which is the one thing this product exists to communicate.

**What exists today.** A shared status chip and a shared status-to-presentation mapping already exist in the design system; several surfaces bypass both and build local presentations. A lint rule against locally-built status presentation is documented but is not preventing the forks. Some lists render an identical status on every row, where the chip conveys nothing.

**Missing delta.** One decided mapping from status meaning to presentation and wording, adopted everywhere, with the local forks deleted.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** **Folded into the architecture round.** What is undecided — the canonical word for each state where surfaces currently disagree, and which states deserve a chip at all — is decided in the architecture round below and approved there before any code is written.

**Execution procedure (human-approved).** Skip the pipeline's standard phase set. One agent runs an architecture round first and stops; the founder reviews and approves it before any code is written. The same agent then builds in a single session — tests, then code. When it is done, one fresh agent reviews it, one round only. No refinement, design or critique phase, and no further human gate after the architecture approval. Founder decision, 2026-08-11: this is the approved procedure for this work package and the orchestrator does not add phases to it.

**Constraints.** The documented colour-to-meaning table in settings is already correct and is the reference, not a candidate for change.

**Out of scope.** Adding new statuses or changing state machines; the identity/avatar treatment beside a status.

## Acceptance criteria

- Each distinct status meaning has exactly one visual treatment across the whole interface.
- Two surfaces describing the same object's status use the same word for it.
- A status that is identical on every row of a list is either removed from the rows or carries information that distinguishes them.
- No surface constructs its own status presentation instead of using the shared one.
- Automated evidence fails if a new locally-built status presentation is introduced.

## Validation scenarios

- Given the team page, when the user compares the header status with the status card and the agent rows, then the same state is shown the same way and named the same word.
- Given a list where every item shares a status, when the user views it, then the interface does not repeat an identical badge on every row.
