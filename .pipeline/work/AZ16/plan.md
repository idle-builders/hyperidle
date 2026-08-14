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

## Delivered semantic contract

Every owned typography declaration consumes one complete profile. Children with no authored typography
inherit normally. Raw five-field definitions are legal only in the central registry.

| Public role | Complete definition | Approved mapped sites |
|---|---|---:|
| `type-label` | sans / 11px / 1.25 / 600 / .06em | 116 |
| `type-metadata` | sans / 12px / 1.4 / 500 / 0 | 231 |
| `type-small` | sans / 13px / 1.4 / 400 / 0 | 232 |
| `type-copy` | sans / 15px / 1.55 / 400 / 0 | 48 |
| `type-control` | sans / 13px / 1.25 / 500 / 0 | 90 |
| `type-input` | sans / 13px / 1.4 / 400 / 0; mobile 16px with the other fields unchanged | 11 |
| `type-avatar-initial` | sans / stacked 9px, sm 10px, md 12px, lg 13px / 1 / 600 / 0 | 14 |
| `type-subheading` | sans / 15px / 1.4 / 600 / 0 | 10 |
| `type-lead` | sans / 17px / 1.25 / 600 / -.01em | 12 |
| `type-title` | sans / 20px / 1.4 / 600 / -.01em | 11 |
| `type-display` | sans / 24px / 1.25 / 600 / -.01em | 3 |
| `type-metric` | sans / 24px / 1 / 600 / -.01em / tabular numerals | 7 |
| `type-data` | mono / 12px / 1.4 / 500 / 0 | 99 |
| `type-inline-code` | mono / 13px / 1.55 / 400 / 0 | 2 |

Structural meaning wins over visual similarity: controls and inputs map to their control roles; avatar
identity maps to `avatar-initial`; headings map by hierarchy; KPI values map to `metric`; uppercase
structural captions (including KpiStat, StatTile, SectionLabel, field/table captions, and badges) map to
`label`; block code maps to `data`; inline code maps to `inline-code`; remaining sites map to data,
metadata, copy, or small. Count is not a separate role. Document h1/h2/h3 map to
display/title/lead and h4–h6 map to subheading. ProseMirror `pre code` is block data.

Avatar variants are container-driven: the shared Avatar follows its sm/md/lg size prop; overlapping
BetCard, ThreadRow, and ConversationSurface groups use stacked; dense standalone 22–28px chrome uses
sm; CommentRow uses md; SessionAvatar uses stacked in ParticipantGroup and sm in message/PartGroup.
Owned strong/b and em/i remain semantic markup. Profiles own emphasis: strong/b is fixed at 600 and
em/i is italic while inheriting the other profile fields. Three old local emphasis declarations were
removed; foreign content remains untouched.

Typography public syntax is `type-copy` in JSX, `@apply type-copy` in owned CSS/generated content, or
`TYPE_STYLE.metric` when inline style is required.

| Motion profile | Exact job | Final consumers |
|---|---|---:|
| `motion-feedback` | opacity/filter, 120ms, `cubic-bezier(.25,.1,.25,1)` | 9 |
| `motion-move` | transform, 240ms, standard curve | 15 |
| `motion-spring` | transform, 240ms, `cubic-bezier(.34,1.56,.64,1)` | 2 |
| `motion-enter` | opacity+transform, 120ms, `cubic-bezier(0,0,.2,1)`, once | 1 |
| `motion-activity` | opacity pulse, 1.4s, in-out, infinite | 7 |
| `motion-loading` | skeleton opacity pulse, 1.8s, in-out, infinite | 6 |
| `motion-busy` | rotation, 750ms, linear, infinite | 2 |

Enter moves from `translateY(6px)` and opacity 0 to rest/opacity 1. Activity pulses .45→1→.45;
loading .55→1→.55; both use `cubic-bezier(.4,0,.2,1)`. Busy rotates 0→360 degrees. Color,
background, border, shadow, width, max-width,
and `all` snap. Card lift profiles animate only transform; shadows and presses snap. Dead AppShell
drawer, NeedsYouChip trailing-span, and DoneRow transitions were removed. Reduced mode globally applies
`animation:none!important`, `transition:none!important`, and `scroll-behavior:auto!important` to every
element and pseudo, including foreign previews. WAAPI and smooth scrolling are forbidden.

Exactly four production rAF calls remain, all structural scheduling: RoleCombobox focus; KnowledgeDetail
render-ready anchor scroll; AppShell restoration start; and AppShell's bounded retry inside `restore`.
Lint binds those exact call identities and rejects any added, moved, or structurally changed call.

Borders use `--bw-thin:1px`, `--bw-default:1.5px`, and `--bw-strong:2px`. Legal Tailwind forms are
explicit `border[-t|-r|-b|-l|-x|-y|-s|-e]-[var(--bw-...)]` or `border-none`; CSS supports physical,
logical, block/inline, and start/end width properties; inline JSX uses the token or
`BORDER_WIDTH_STYLE`. Toast keeps the sole 1.5px status rail. Fourteen other conditional status/state
rails were removed while normal outlines, separators, action borders, explicit borderless states, and
TaskCard's normal thin outline remain. Avatar seams use strong; eight border-built glyphs became
SVG/mask geometry.

Foreign color, typography, and border input is limited to the two literal
`data-token-subject="foreign"` roots in `ReviewBrowserPreview.RenderedPage` and
`ReviewRenderedInContext.EmailRender`. Siblings and TrafficLights remain owned. Motion and reduced-mode
rules never exempt foreign subtrees.

Motion public syntax is `motion-feedback` in JSX, `@apply motion-feedback` in owned CSS, or
`MOTION_STYLE.feedback` for required inline styles.

## As-built enforcement and audit

`framework/design-system/src/token-profiles.ts` owns typed inline profiles; `tokens.css` owns matching
utilities and keyframes. ESLint rules `typography-profile-only`, `motion-profile-only`, and
`border-width-profile-only` enforce production `.ts/.tsx` at error. The owned PostCSS verdict discovers
production CSS dynamically and fails on zero files. Root lint also promotes raw Tailwind palette checks
to error.

`tools/eslint-plugin-design/src/token-family-owners.ts` is the shared fail-closed classification and
owner registry used by ESLint and the CSS gate. It classifies all 78 token names / 143 declarations
exactly once across thirteen value families plus the explained `component-geometry` non-family. The CSS
gate parses `tokens.css`; an unknown token name, ownerless family, or unexplained non-family fails and
names the token. AZ7 color/radius and AZ15 spacing/elevation ownership remain intact.

Owner sets are color→hardcoded-color/raw-palette, radius→radius, spacing→off-grid spacing,
shadow→shadow, z-index→overlay-z, all five typography families→typography profile,
duration/easing→motion profile, and border width→border profile. Component geometry remains an
explained non-family rather than an invented rule.

The immutable pre-migration audit measured 891 typography sites / 1,630 fields, 146 motion jobs, and
346 border sites (339 owned, 7 foreign), with zero unmapped. Six manifest/decision snapshots are frozen
by SHA-256 and 1,383 checked migration receipts prove every audited destination. These files remain in
the work folder because `npm run lint` executes their checksum and receipt gates.

The final live census dynamically scans discovered production `.ts/.tsx/.css`, rejects raw survivors
and unknown profiles, and reports 884 source profile references (including lead 10 and subheading 10),
motion 9/15/2/1/7/6/2, and border token references thin 211 / default 17 / strong 11. The immutable
audit destinations remain 228/25/20 border sites and 12 lead sites. Equivalent branches—and, after
reconciliation with the latest main, three pane headers—share final class construction. Review keeps
its approved subheading role through `PageHeader.paneTitleProfile`; the other shared pane titles use
lead. The approved live border expansion is therefore 211/17/11. The gate compares measured values to
that expansion and fails any mismatch; it never substitutes receipt totals for measured values.

## Proof, procedure, and residual risk

The named Playwright matrix owns seeded conversations, team, bet, knowledge, settings, and review
routes. It checks every typography/motion/border profile by computed style, the actual interactive
motion states, global reduced mode (including foreign roots), and painted Hearth light/dark plus mobile
input output. Durable screenshots live in `evidence/`.

Founder procedure was: one combined refine/design/architecture round, one founder concept approval,
one builder session across nine sub-1,000-line waves, then exactly one fresh implementation review. That
review found four blockers; the same builder repaired each red-first. No second review or further human
gate was permitted. Final review verdict is DONE: focused blocker tests 23/23, lint PASS, typecheck 55/55,
named Playwright 3/3, and verify PASS.

The affected unit lane passes 573 files / 6,266 tests but retains two watcher timing failures in
`layers/agent-orchestration/run-orchestration`. Both reproduce alone; the package has no branch diff or
branch commits. The review run's separate four failures and two setup `ErrnoError: 44` errors did not
recur. This is accepted non-blocking baseline evidence, not an AZ16 defect.
