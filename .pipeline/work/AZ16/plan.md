# AZ16 — Every design token is enforced

## Work package

**Outcome.** Every token family in `tokens.css` has a build gate at `error` in app and design-system code: typography (font size, family, weight, line height, tracking), motion (duration, easing), border width, and raw Tailwind palette names. A builder who reaches for an off-token value fails verification the same way a type error fails — the token system is total, not partially, enforced.

**Why this matters.** AZ7 closed radius, color vocabulary, controls and status, and in doing so proved the disease: rules registered at `warn` never ran (`npm run lint --quiet` skips warn-level rules entirely), and rules wired nowhere read as healthy forever. The typography, motion and border families still sit exactly where AZ7's population sat before it — `no-off-scale-font-size` at warn for core-ui, `no-hardcoded-tracking` and `no-off-scale-duration` unwired for core-ui, `no-raw-tailwind-color` at warn, and no rule at all for font family, font weight, line height, easing completeness or border width. Every surface built until this closes drifts on exactly those axes, invisibly. By the end of the AZ track the token system should have no ungated family, or the next page re-creates the "everything looks slightly different everywhere" finding AZ7 was built to end.

**What exists today.** `tokens.css` defines the families: font sizes (`--text-xs`…`--text-3xl`, 8), font families (`--font-sans`, `--font-mono`), weights (`--fw-normal`…`--fw-bold`, 4), line heights (`--leading-*`, 4), tracking (`--tracking-caps`, `--tracking-caps-sm`), motion (`--motion-fast/default/slow`, `--motion-ease`, `--easing-expressive`), border widths (`--bw-thin/default/strong`), border colors (`--border-*`, 3), z-index (`--z-*`, 7). Existing design-lint rules: `no-off-scale-font-size` (warn in core-ui), `no-hardcoded-tracking` (off in core-ui), `no-off-scale-duration` (off in core-ui), `no-raw-tailwind-color` (warn in core-ui), `no-raw-overlay-z` (error). Radius, color literals, controls and status are already gated at error by AZ7; spacing and elevation (shadows) are AZ15's axis. AZ7 also leaves the machinery this package extends: the `hearth-config.ts` total severity table (a rule cannot be exported and wired nowhere), the deep class-string walker with same-file const resolution in `tools/eslint-plugin-design/src/util.ts`, and the pattern of landing a rule at `error` with its population cleared in the same change.

**Missing delta.** Promotion and wiring of the existing typography/motion/color rules to `error` in core-ui with their populations cleared; new rules for the families nothing polices (font family, font weight, line height, easing, border width); and a totality property over `tokens.css` itself — a token family with no enforcement gate fails verification, so the next family added to the token file cannot ship ungated.

**Depends on.** None. (AZ7's enforcement machinery is merged; this extends it. Sequencing preference, not a dependency: run after AZ15, since both promote rules in the same severity table and AZ15's spacing decisions may move nearby populations.)

**Complexity.** M

**Engineering tier.** mvp

**Pre-build.** **Folded into the combined refine + design + architecture round.** The round begins with measurement — the population per family (as AZ7's did) — then decides per family whether the existing scale is the vocabulary to gate or needs a documented exemption shape, and produces the technical plan as one artifact, approved before any code. Track convention (founder decision, 2026-08-11): same agent builds in one session (tests, then code); one fresh review round afterwards. Recorded here so the orchestrator reads it and does not add phases.

**Constraints.** Decide from what already ships — this enforces the existing token vocabulary, it does not redesign the type scale, motion curve or border system. No new rule may duplicate a job an existing design-lint rule already does. Every rule lands at `error` with zero survivors in the same change — no baseline, no severity dial; per-file carve-outs only where documented with a reason (the AZ7 pattern).

**Out of scope.** Spacing and elevation/shadow tokens (AZ15 owns that axis and its enforcement AC); page geometry (AZ11); radius, color vocabulary, controls, status (AZ7, shipped); whether the typography/motion scales themselves are right (this closes the gate around them; redesigning them is a different decision).

## Acceptance criteria

- Every typography token family (font size, family, weight, line height, tracking) fails verification when used off-token in app or design-system code, and the existing off-token population is cleared in the same change (any surviving site carries a documented exemption citing its reason).
- Motion tokens (duration and easing) fail verification when used off-token in app code, population cleared the same way.
- Border-width tokens fail verification when a raw width is used instead, population cleared the same way.
- Raw Tailwind palette color names fail verification in app code at `error`.
- A token family in `tokens.css` that has no enforcement gate fails verification — the gate set is total over the token file, mechanically asserted.
- Every gate in this package runs under `npm run lint` as actually invoked (no warn-tier rule, no rule wired nowhere) — asserted mechanically, not by inspection.

## Validation scenarios

- Given a page that uses `text-[13.5px]`, `tracking-[0.04em]`, `duration-[130ms]` or a raw `border-[2px]`, when `npm run lint` runs, then it fails and names the rule and the offending class.
- Given a new token family added to `tokens.css` with no gate, when verification runs, then it fails and names the ungated family.
- Given the shipped app, when typography, motion and border values are counted by computed style, then each count equals the size of its token family.
