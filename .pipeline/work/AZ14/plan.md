# AZ14 — One rule for opening and editing an object

## Work package

**Outcome.** A user can predict what a click will do to their context — take over the page, open a pane beside what they were reading, or float above it — and knows how to start editing anything, because both follow one stated rule.

**Why this matters.** Today the grouping is arbitrary. Opening a routine or an agent splits the screen; opening a bet, task, knowledge item, thread or artifact takes the whole page; notifications, the assistant and search float above it. Nothing about those objects explains the split, so every click is a small gamble with the user's place. Editing is split the same way: a bet's pitch is a live editor that is always editable in place, while a knowledge item is read-only behind an Edit button — the same prose primitive with two different mental models. Users learn an interface by forming rules; an interface with no rule cannot be learned, only memorised.

**What exists today.** A split-pane surface exists and is used for two object kinds. Full-page routes exist for everything else. Three overlay surfaces exist with differing dismissal and scrim behaviour. Prose editing is a live inline editor on one surface and a mode switch on another.

**Missing delta.** A decided rule mapping object kind and user intent to presentation, and a decided editing model, both applied consistently.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** **Folded into the combined refine + design + architecture round.** What earns a split pane rather than a page, what earns an overlay, and whether prose edits inline or through a mode are product decisions with no existing approved pattern to follow. They are made in that one artifact and approved before any code.

**Execution procedure (human-approved).** Skip the pipeline's standard phase set. One agent runs a single **combined refine + design + architecture round** — sharpening the requirement, deciding the user-facing shape, and producing the technical plan as one artifact — and stops there. The founder reviews and approves that one artifact before any code is written. The same agent then builds in a single session — tests, then code. When it is done, one fresh agent reviews it, one round only. No separate refinement, design, critique or architecture phases, and no further human gate after the approval. Founder decision, 2026-08-11: this is the approved procedure for this work package and the orchestrator does not add phases to it.

**Constraints.** Whatever is decided must hold at every viewport — a split pane has to degrade to something coherent on a phone.

**Out of scope.** The individual overlay defects (missing composer, clipping, scrim extent) — those are bug-list work; this decides the pattern they should conform to.

## Acceptance criteria

- A written rule states which presentation each object kind and intent uses, and why.
- Every object in the product is opened according to that rule.
- A single editing model applies to prose wherever it is editable.
- Opening something never silently discards what the user was reading without a way back to it.
- The rule holds at every supported viewport, including where a split pane cannot fit.

## Validation scenarios

- Given two objects the rule treats alike, when the user opens each, then both present the same way.
- Given a prose field on two different surfaces, when the user starts editing each, then the interaction is the same.
- Given a split presentation at a phone viewport, when the user opens it, then it degrades to the decided fallback rather than a squeezed pane.
