# AZ7 — Close the visual system

## Work package

**Outcome.** Every button, input, filled surface, radius and status in the product is drawn from a closed, written-down set, so a builder picks from a list instead of inventing, and a reviewer can tell a violation from a choice.

**Why this matters.** Measured across twelve routes by computed style: **47 distinct button recipes**, **6 input recipes** (four fills, six heights, three radii), and **13 distinct uses of one surface fill** — the same `--surface-container` standing in for a 138×32 chip, a 1189×260 card, a banner, an input and an empty state, with radius varying 10 / 16 / 9999px and border present or absent per instance. The documented radius scale is `0 / 10 / 16 / 9999`; the single most-used radius in the app is an off-scale computed value (99 occurrences), and "pill" is spelled two ways. Status has five presentations and two contradicting words for the same state on one page. This is the root cause of "everything looks slightly different everywhere" — and it is why fixing surfaces one at a time has not converged.

**What exists today.** The token file and the design-system component set are sound and largely unused as a system: `StatusChip` and `status-mapping.ts` exist and are bypassed; `Button` exists alongside dozens of local recipes. The aesthetic rules already forbid off-scale radii, off-scale spacing and local status builders, and lint rules exist for several — yet the population above is what actually ships, so either the rules are not running on these files or the violations predate them. Establishing which is part of this work.

**Missing delta.** A decided, closed set per axis — buttons, inputs, filled surfaces, radii, status — plus enforcement that makes adding a 48th button recipe fail rather than merely be discouraged.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** **Folded into the combined refine + design + architecture round.** The decisions — how many button variants exist and what each is for, what an input looks like, what each surface fill means, which states get a chip and what word each state uses — are made in that one artifact and approved before any code.

**Execution procedure (human-approved).** Skip the pipeline's standard phase set. One agent runs a single **combined refine + design + architecture round** — sharpening the requirement, deciding the user-facing shape, and producing the technical plan as one artifact — and stops there. The founder reviews and approves that one artifact before any code is written. The same agent then builds in a single session — tests, then code. When it is done, one fresh agent reviews it, one round only. No separate refinement, design, critique or architecture phases, and no further human gate after the approval. Founder decision, 2026-08-11: this is the approved procedure for this work package and the orchestrator does not add phases to it.

**Constraints.** Decide from what already ships — this closes a set, it does not design a new look. No new component may be introduced whose job an existing design-system export already does.

**Out of scope.** Spacing and elevation (their own package); page-level geometry (AZ11); the migration of every call site, which becomes bug-list work once the set is decided and enforced.

## Acceptance criteria

- A written, closed set exists for each of: button variants, input variants, filled-surface meanings, radii, and status presentations — each entry stating what it is for.
- Every value in use resolves to a member of its set; the counts above are reduced to the decided set.
- "Pill" has one spelling, and every radius in use is on the documented scale.
- Each surface fill has exactly one meaning, and no fill is used for two unrelated jobs.
- Adding a variant outside a closed set fails verification rather than passing silently.
- The migration work needed at each remaining call site is enumerated so it can be worked as ordinary bugs.

## Validation scenarios

- Given the shipped app, when button and input recipes are counted by computed style, then each count equals the size of its decided set.
- Given a new component that introduces an off-set radius or a local status presentation, when verification runs, then it fails and names the offence.
- Given two surfaces showing the same object's status, when a user compares them, then the treatment and the word match.
