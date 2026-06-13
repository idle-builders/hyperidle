# Design Critique: AI5

DESIGN-CRITIQUE: variant=approved score=8/10  rounds=1  axes: H:8 S:8 T:8 C:9 Co:8 St:7 A:7 AS:9 PP:8

Single-variant ratification (routine class). Scored the two extension shapes (compact EmptyState/ErrorState, ScopePicker) against the rubric. Verified anatomy claims against the real tree.

### CRITICAL
_(none — design anatomy is sound; the factual errors are about *which sites* exist, scored under architecture)_

### WARNING
- [approved.md Decision 2 §states] ScopePicker states table omits **focus**. The pills are keyboard-operable `role="radio"` controls inside a radiogroup; the spec lists active/inactive/disabled but no focus-ring treatment. `clickable.ts` / DS focus convention must apply. Add a focus row (2px outset ring on `--accent-primary`, AQ focus rule) to the anatomy so the builder doesn't ship `outline:none`. The current hand-rolled pills have no focus ring — migrating without adding one preserves an a11y defect.
- [approved.md Decision 2 §touch targets] "pills keep `py-[4px]` visual but gain `min-h-[44px]` at the mobile breakpoint" — `min-h-[44px]` on an inline pill with `py-[4px]` will vertically center the 12px text in a 44px box, visually breaking the dense pill row at ≤1024px (pills become tall lozenges with huge vertical gaps). The "same pattern as other touched controls" is asserted, not shown. Decide explicitly: expand hit area via pseudo-element/`::before` overlay (keeps visual height) vs `min-h` (changes visual height). The design owes the builder the actual mechanism, since AC4 requires all four sites *pixel-identical in chrome* — a min-h that only triggers ≤1024px makes desktop and mobile diverge, and makes the filter row (KnowledgeList, in a `pt-[12px]` header) look different from the create row.
- [approved.md Decision 1 §compact ErrorState retry] compact retry `px-[12px] py-[7px]` + `min-h-[44px]`: same min-h-on-small-padding tension as pills. At 13px text + py-7 the natural height is ~30px; forcing 44px min-height makes the inline retry button a tall block inside an 18px-padded panel. Confirm this reads as "inline" (the stated goal) and isn't a floating slab. A `::after` hit-area overlay preserves the compact look better.

### SUGGESTION
- [approved.md Decision 2 §props] `disabledTitle` is a single string but the disabled reason can differ per option in principle. Today only "team" is ever disabled with one reason, so a single string is correct — note this closure explicitly so a future caller doesn't assume per-option titles.
- [approved.md §stories] Add a `Focused` story to `ScopePicker.stories.tsx` once the focus state is specified, so the focus ring is visually regression-checkable.

### What's Working Well
- Compact-as-a-prop (not a second component) is the right call and is correctly justified against the concept rejection list — this is exactly the consolidation discipline the track demands.
- The `--accent-primary-dim` tint fix riding along with ScopePicker is precise: the token already resolves to `rgba(22,118,79,0.08)` (tokens.css:165), so the swap is provably lossless on the default theme and *gains* theme-portability the hardcoded literal lacks.
