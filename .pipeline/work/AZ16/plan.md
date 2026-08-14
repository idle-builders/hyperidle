# AZ16 — Every design token is enforced

> **Founder role authority — 2026-08-14.** The approved public text roles are exactly `label`,
> `metadata`, `small`, `copy`, `control`, `input`, `avatar-initial`, `subheading`, `lead`, `title`,
> `display`, `metric`, `data`, and `inline-code`. `avatar-initial` uses deterministic 9/10/12/13px
> container variants; `subheading` is the 15px compact-heading role and owns document h4–h6. Count
> normalizes to `data`. This authority supersedes every earlier role-list or unresolved-role wording.

> **Founder-approved concept — 2026-08-14.** This authority supersedes earlier ladder and blocker
> wording. Public typography is a closed set of complete named definitions; seven purpose motion
> profiles are approved; reduced motion disables all animation, transition, WAAPI, and smooth scroll
> globally; border widths are 1/1.5/2px. Remaining work is a confined technical amendment: deterministic
> manifests, migrations, error-level lint ownership, computed/painted proof, and green activation. The
> ordered sub-1,000-line architecture waves are leaves of AZ16, not new registered work packages.

> **Maintainer-approved evidence correction — 2026-08-14.** The final semantic API is the reviewed
> per-source manifest, not an extractor heuristic: fourteen complete text roles (`label`, `metadata`,
> `small`, `copy`, `control`, `input`, `avatar-initial`, `subheading`, `lead`, `title`, `display`,
> `metric`, `data`, `inline-code`) plus glyph repair, with zero unmapped or exceptions. Extractors parse typed Tailwind,
> actual JSX styles, local constants/templates/filtered joins, production `.ts/.tsx/.css`, and literal
> foreign roots. Motion has an equivalent every-job map to seven profiles or SNAP/REMOVE. Border
> evidence approves 1/1.5/2px, counts `border-2` as 2px, permits explicit token width spellings on all
> sides, preserves only Toast's exact 1.5px status rail, and removes other state rails. Static manifests
> provide total coverage; representative painted/computed proof samples shipped output. Architecture
> may propose but must not register the under-1,000-line delivery leaves without maintainer approval.

> **Maintainer-approved amendment — 2026-08-13.** This amendment overrides conflicting pre-build,
> exception, dependency, and validation wording below. AZ15 has already completed spacing/elevation;
> AZ16 audits those families and records their existing gates but does not reimplement them. Before
> enabling new gates, audit every declared token and family with reproducible production/development,
> raw-equivalent, off-scale, unused, context, and foreign-content counts. Typography has zero
> exceptions: a good special value joins the documented ladder; otherwise migrate it. Under
> `prefers-reduced-motion: reduce`, authored UI has zero-duration CSS transitions/animations and no
> WAAPI animation. Measured border roles approve the smallest coherent 1/1.5/2px ladder. Delivery is
> deliberately simple: extend/add linter rules, migrate the
> measured population, and make lint/check/tests green. Static census plus focused computed/painted
> proof replaces a broad runtime scanner unless implementation evidence shows one is necessary.

> **Maintainer-approved semantic amendment — 2026-08-13.** Public typography is a closed set of named,
> complete definitions (`count`, `label`, `metadata`, `small`, `copy`, `control`, `lead`, `title`,
> `data`), never a public size ladder. The corrected audit below adds `inline-code` and removes any
> visual-size-only role. Each definition binds family,
> size, line height, weight, and tracking; the mobile input is a complete control variant, not a raw-size
> escape. The later corrected per-site census supersedes this amendment's earlier 792 size-reference
> count. Motion follows the same purpose-profile rule; the later correction below fixes the final names
> and animated properties. Reduced motion
> disables all CSS animation/transition and smooth scrolling. No typography exceptions.

> **Maintainer-approved correction — 2026-08-13.** The typography audit is per authored site across all
> five properties, not a size-reference count; every authored site consumes one profile while un-authored
> children inherit. Inline code is a complete fixed role. Motion shrinks to feedback (opacity/filter),
> move/spring (transform), enter, activity, loading, and busy; every color/background/border/shadow/width
> change snaps. Reduced mode uses animation/transition none and scroll auto. Border is 1/1.5/2px with
> explicit spellings; Toast keeps the sole existing 1.5px status rail and every other state rail is
> removed. Implementation may be split only after maintainer approval; this amendment registers none.

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
