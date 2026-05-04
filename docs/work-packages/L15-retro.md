# L15 — Retro (variant 2: hook-injected durable state)

**Run.** Branch `ab/L15-2`, worktree `.worktrees/L15-2`. Commit `9399bc6`.

**Variant under test.** Hook-injected durable state surface (Block 2) — the
SessionStart hook reads `.pipeline/active-story` and injects memory + brief
into the system prompt, so personas consume state via injection rather than
calling `Read` on `.pipeline/`.

**Pipeline state inherited from baseline.**
- Steps 1–4 (design, design-critique, architecture, architecture-critique)
  inherited from `ab/L15-baseline` to keep the A/B comparison focused on the
  implementation arc (steps 5–17). Baseline plan score 7.0; design score 8.4.

## What went well

- The plan's protected-test list (§ 12) was load-bearing. Every test row had
  an assertion lock, so the write-tests and write-code agents had a binding
  spec rather than a freeform target. Result: 24 protected tests landed on
  first pass, all green; 0 silent deletions caught by DoD.
- CRITICAL-2 (lazy-thread race) and CRITICAL-3 (cross-team authz) were
  spec'd as named patterns in the plan with concrete idioms. Both landed
  cleanly in the implementation; both have direct unit tests.
- Architecture-critique gate (step 4) had pre-flagged 3 patches that the
  baseline applied — no surprises in the architecture-review (step 10).
- Adversary review and security review both surfaced REAL bugs (orphan-thread
  leak, lost-update race on `participants`, 1-bit case oracle on cross-team
  404 codes). Apply-review fixed all of them with regression tests pinned.

## What went badly

- **Slop-scan ran on the wrong commit range.** The scan's "main..HEAD"
  picked up the Block-2 pipeline files that pre-existed on the variant
  branch. Findings were valid for that code but not for L15. Cost ~5
  minutes; net zero impact since the slop-scan/apply-review explicitly
  scoped out non-L15 findings. **Compound-log candidate:** A/B variant
  pipelines need a scan-scope filter that uses the L15-only commit set, not
  `main..HEAD`. The scan skill should accept an explicit file list.

- **Design CRITICALs were severe (10) and surfaced LATE.** The DS components
  shipped from write-code with: menu off-screen, card-body click wired to
  thread instead of menu, trigger z-stacked under card title, TaskCard.html
  not rendering the pendingRequest slot at all, TaskActionsMenu.html
  overlapping menus, HTML letter shortcuts contradicting TSX. These would
  have been caught by an interactive design-critique pass on the actual
  rendered output; the visual-regression tests in step 5 were structural
  smoke tests (`existsSync` + substring), NOT 5% pixel diffs as the rule
  requires. **Compound-log candidate:** the visual harness needs to be
  enforced as a real pixel-diff in the write-tests step, not a smoke check.
  This is the second story (L11 retro precedent) where DS visual parity
  surfaced as broken at design-review time.

- **Composer modal and toast surface — entire UI feedback layer — landed
  as follow-ups, not L15 scope.** AC-2 ships partial: the menu posts the
  request and the message persists, but the user sees no toast and the
  reason composer doesn't open. The plan §4.6 said "the existing Composer
  is reused inside a DaisyUI dialog" — the implementation didn't build the
  dialog wrapper. Caught at design-review and DoD; filed as
  `L15-composer-modal-and-toast`. **Compound-log candidate:** the
  architecture-critique rubric's "depth" dimension should explicitly
  enforce that EVERY menu action in the design has a wired UI feedback
  path before write-code starts.

- **Time budget blown.** Skill says exit at 45 minutes; this run took
  ~95 minutes end-to-end. Hot path: architecture review (5 min), write-code
  (25 min), apply-review-2 (16 min), four reviews in parallel (max 13 min).
  The agents are not fast enough on M-complexity stories to fit the
  budget; either the budget needs reset or the parallelism needs to extend
  further (e.g. write-tests phases A/B/C/D in parallel).

- **`bun run lint` exits non-zero on unrelated pre-existing files** (47
  errors in design-explorations HTML mockups + 7 in scripts/trace-collector).
  Cleaned 16 of them by deleting L15 mockup variants no longer needed; 31
  remain pre-existing. AC-6's "lint green" is therefore partial across the
  whole tree but L15 is clean. **Compound-log candidate:** add a project
  rule that exploration-mockup HTML and scripts/* are out of the lint
  scope, OR fix them once globally.

## What to feed forward

1. **Variant-scoped scans.** Compound: when in an `ab/*` branch, scope
   `simplification-scan` and `slop-scan` to `git diff --name-only <variant-base>..HEAD`
   instead of `main..HEAD`. The variant-base is the commit where the variant
   diverged from baseline.

2. **Visual-regression must be real pixel diffs.** Compound: write-tests'
   visual-regression-test stub must invoke the actual harness, not write
   a smoke check. Block step 6 from starting if visual harness is mock-only.

3. **UI feedback paths in plan.** The architecture-critique rubric needs
   a "every menu/button action has a documented user-visible feedback
   path" check. Probably a dimension expansion or a hard rule.

4. **Time budget reality-check.** Compound: M-complexity stories take ~75
   minutes minimum end-to-end with current agent speeds. Either soften the
   45-minute threshold for M and L stories, or invest in parallelism.

5. **Lint scope.** Add a `biome.json` ignore for `docs/design-explorations/**/*.html`
   and `scripts/trace-collector.ts`, OR fix the trace-collector naming
   convention violations once.

## What did NOT change vs. baseline path

- The architecture and design were inherited from baseline (steps 1–4 not
  re-run); the difference being measured is implementation throughput +
  quality with hook-injected vs. read-from-disk durable state. No
  conclusion drawn here — that's the comparison agent's job.
