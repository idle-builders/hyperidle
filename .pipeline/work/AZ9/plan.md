# AZ9 — Lists and tiles use the shared primitives

## Work package

**Outcome.** Lists of the same kind of thing look the same wherever they appear, rows fill their container, and repeated blocks stop being re-invented per page.

**Why this matters.** The conversation queue — the app's most-used list — is hand-rolled, while global search renders the very same threads through the design system's thread row with an avatar, a snippet and a status. The primary surface is visibly poorer than the search results for identical data. Separately, the shared row primitive shrink-wraps instead of filling its container when it is interactive, so routine rows render at three different widths inside one section with ragged separators — which reads as a rendering failure and is plausibly why pages forked away from the primitive in the first place.

**What exists today.** The design system already provides a thread row, a statistic tile and a compact empty state; pages variously use them, fork them or hand-roll equivalents. The shared row's interactive branch omits the width declaration its other branch received during an earlier fix, so it sizes to its content. Four sections render four different treatments of "nothing here".

**Missing delta.** The shared primitives fixed where broken and adopted where forked, with the forks deleted.

**Depends on.** None.

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** Not required — the primitives exist and are the approved patterns. A combined refine + design + architecture round still precedes the build — see the execution procedure below.

**Execution procedure (human-approved).** Skip the pipeline's standard phase set. One agent runs a single **combined refine + design + architecture round** — sharpening the requirement, deciding the user-facing shape, and producing the technical plan as one artifact — and stops there. The founder reviews and approves that one artifact before any code is written. The same agent then builds in a single session — tests, then code. When it is done, one fresh agent reviews it, one round only. No separate refinement, design, critique or architecture phases, and no further human gate after the approval. Founder decision, 2026-08-11: this is the approved procedure for this work package and the orchestrator does not add phases to it.

**Constraints.** Existing keyboard affordances on lists (triage navigation and actions) must survive the consolidation. Status presentation follows AZ7 once decided; adopting the shared row must not entrench a status treatment AZ7 will change.

**Out of scope.** The artifacts list's information design on the team page if it needs a new shape — record it rather than inventing one here; sorting and filtering behaviour.

## Acceptance criteria

- The conversation queue renders through the same shared row as other thread lists, with the same information.
- Interactive rows fill the width of their container and their separators span the full row.
- Repeated statistic blocks render through the shared tile.
- Sections with nothing to show render the shared empty state rather than a bare heading and rule.
- No page retains a hand-rolled equivalent of a shared list, tile or empty-state primitive.

## Validation scenarios

- Given the conversation queue and global search results for the same threads, when the user compares them, then each thread is presented the same way.
- Given a section of interactive rows, when the user views it, then every row and separator is the same width.
- Given a section with no items, when the user views it, then it explains that it is empty rather than showing an empty heading and a rule.
