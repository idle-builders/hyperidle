# AZ15 — Spacing and elevation hold across the product

## Work package

**Outcome.** Vertical and horizontal rhythm is deliberate on every surface — related things sit closer than unrelated things, sections separate the same way everywhere, and depth is used to mean something rather than decoratively.

**Why this matters.** Founder observation, 2026-08-11: *"there are so many spaces with weird spacing or non at all."* Neither audit pass measured this, so it is the one significant complaint with no evidence behind it yet. What is already visible: pages that end in 400px of dead space while their densest region has no breathing room at all; stat cards ~60% empty air; section headers with no separation above or below so groups read as one wall; a routine list whose rows are 44px tall next to section actions that are 40px, with no shared rhythm. Spacing is what makes an interface feel considered, and it is the most common thing a user perceives as "unpolished" without being able to name.

**What exists today.** A 3px-grid spacing scale (`3 / 6 / 9 / 12 / 18 / 24 / 36 / 48`) and warm-tinted shadow tokens are defined, with a lint rule against off-grid values — but it sits at `warn` for core-ui, which AZ7's diagnosis proved never executes (`npm run lint --quiet` skips warn-level rules entirely), and nothing polices the shadow tokens at all. Whether shipped surfaces honour the grid — and whether the grid produces good proportion when they do — is unmeasured. Elevation is currently near-absent: measured earlier, the filled surfaces across the app carry no shadow at all in 12 of 13 cases, so depth is doing no work.

**Missing delta.** A measurement of what is actually shipping, then a decided proportional system — what separates a section from a section, a group from a group, a row from a row, and when depth is used — applied product-wide. The enforcement half (the final AC) lands the way AZ7 landed its gates: spacing and shadow/elevation token rules at `error`, populations cleared in the same change, no warn tier left behind.

**Depends on.** None. Sequence after AZ7 if convenient: closing the control set first removes noise from the measurement.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** **Folded into the combined refine + design + architecture round — and this package's round begins with measurement.** Unlike the others, the evidence does not exist yet: the round must first measure spacing and elevation as shipped before deciding anything. A decision made without that measurement would be guesswork. The measurement, the decided system and the technical plan are one artifact, approved before any code.

**Execution procedure (human-approved).** Skip the pipeline's standard phase set. One agent runs a single **combined refine + design + architecture round** — sharpening the requirement, deciding the user-facing shape, and producing the technical plan as one artifact — and stops there. The founder reviews and approves that one artifact before any code is written. The same agent then builds in a single session — tests, then code. When it is done, one fresh agent reviews it, one round only. No separate refinement, design, critique or architecture phases, and no further human gate after the approval. Founder decision, 2026-08-11: this is the approved procedure for this work package and the orchestrator does not add phases to it.

**Constraints.** The existing spacing scale is the vocabulary; this decides how it is *used*, not what the values are. Density over whitespace remains the standing principle — whitespace is earned.

**Out of scope.** Content column width and page-level geometry (AZ11); component-internal padding decided as part of the control set (AZ7).

## Acceptance criteria

- A measurement of spacing and elevation as currently shipped exists, covering every primary surface, and is specific enough to name offenders.
- A decided proportional system states the separation between sections, between groups within a section, and between rows within a group, and when elevation is used and what it means.
- Every primary surface conforms to that system.
- Related elements are visibly closer to each other than to unrelated elements on every surface.
- A surface that violates the system fails verification rather than passing silently.

## Validation scenarios

- Given any two primary pages, when a user compares how sections are separated, then the separation is the same.
- Given a section containing groups of rows, when a user looks at it, then group boundaries are perceptible without reading the labels.
- Given a surface using elevation, when asked what the elevation signifies, then the answer is the one the decided system states.
