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

---

# As-built (consolidated at ship, 2026-08-12)

Folds the founder-approved combined refine + design + architecture round
(formerly `combined-round.md`) and the four-round review record (formerly
`review.md`), both deleted at ship — git history keeps the full text. Section
numbers §1–§6 are preserved from the combined round because shipping source
comments cite them. Canonical closed-set documentation:
`framework/design-system/DESIGN.md` §"Closed Sets (AZ7)". Session-by-session
evidence: `progress.json`. Process learnings: `retro.jsonl`.

## §1 Measurement (condensed)

Instruments stay in `measurement/` (commands in its README): `scan.mjs`
(per-axis populations), `predicates.mjs` (exact sites each predicate flags —
load-bearing for the `design:backlog:check` gate), `render-backlog.mjs`
(renders `migration-backlog.md`), `measure.eslint.config.ts` (every design
rule at error). Base measured: `origin/main` @ `a8ed3ad9` — 164 production
`.tsx` files, 3,444 JSX elements.

- §1.2 Buttons: 167 raw `<button>`s, 118 distinct static recipes, 96 used
  exactly once; three parallel systems (design-system `Button`, DaisyUI
  `btn*`, hand-rolled Tailwind) plus a private tone vocabulary inside
  `RichMessageCard`. `variant="amber"` had zero production uses.
- §1.3 Inputs: 28 raw chrome-carrying text controls in core-ui (25 DaisyUI,
  3 hand-rolled) — a second control system, not six out-of-tune recipes.
- §1.4 Radii — the plan's one wrong number: the "off-scale radius used 99
  times" (computed `3.35544e+07px`) is Tailwind v4's `rounded-full`
  (`calc(infinity * 1px)`, browser-clamped) — the pill under its second
  spelling. Genuinely off-scale radii: 21. The real defect: pill spelled two
  ways (69 `rounded-full` vs 87 `rounded-[var(--r-pill)]`).
- §1.5 Surfaces: `--surface-container` used 79 times in 27 radius/border
  combinations; DESIGN.md contradicted itself (cards elevated vs flat cards
  container).
- §1.6 Status — five named forks, all fixed in this package:
  1. `WorkTeam.tsx` agent-status cell: raw lowercase domain text in a
     `RowCell.tone`, ten rows from a `StatusChip` reading ACTIVE → real
     `StatusChip` (`agentOperationalStatusToStatus` + the label registry).
  2. `WorkTeam.tsx` `StatTile` "Attention"/"Healthy" — words outside
     `status-mapping.ts`, on the page whose header chip read BLOCKED →
     relabeled "Agent Health" with vocabulary "On track"/"Needs attention"
     (neither a StatusChip word; the tile rolls up agent run-health, a
     different measurement than `team.status`).
  3. `harness-presentation.ts` private `Status` type redeclaration → imports
     the design-system `Status`.
  4. `SettingsHarnesses` hand-rolled tone→colour ladder → `RowDot` (its
     `TONE_COLOR` ladder exported).
  5. `ReviewComposition` local `StatusDot` → `RowDot`. (`RichMessageCard`'s
     verdict-button tone vocabulary — the same "local tone ladder" shape —
     migrated to `Button`.)
- §1.7 Why the lint rules saw nothing: §3.1.

## §2 The decided closed sets

Full tables with each member's job live in DESIGN.md §"Closed Sets (AZ7)".
Decisions beyond the tables:

- Set 1 (Button): `variant="amber"` deleted (zero uses — Trade-off 2).
  `size="icon"` added: 20 shipped hand-rolled square icon buttons (16–32px,
  11 files) are a real job no export covered; leaving it out would make every
  one a permanent violation with nowhere to go. One size (32px desktop, 44px
  touch floor) per AQ-003 — the small ones got visibly larger, a
  founder-approved visual change (Trade-off 3). Not a button: a full-width
  clickable list row is `Row`; a segmented switch is `TabBar`; a link is a
  link.
- Set 2 (Input): `RoleCombobox` stays a `Select` specialised to the role
  catalogue — folding it would be a new abstraction, not a smaller one. Raw
  checkbox/radio/range with DaisyUI form-control chrome stays permitted
  (AQ-011; `Checkbox`/`Toggle` wrap exactly those classes).
- Set 3 (Filled surfaces) — two consequences, both done:
  1. DESIGN.md "Flat cards use `--surface-container`" retired; cards are
     `--surface-elevated`. One rule survives.
  2. `--surface-page`'s second job as hover tint moved to
     `--accent-primary-dim` (fixed on Button's hover tint, HostThreadSection's
     composer, SearchField, Composer, RoleCombobox, CommentRow's avatar).
- Set 4 (Radius): the only permitted spelling of a non-zero radius is a
  `--r-*` token; `rounded-full` retired as the pill's second spelling
  (Trade-off 1).
- Set 5 (Status): `RowCell.tone` deleted — a third status channel with one
  call site; deletion is a stronger guard than any rule (every remaining use
  is a compile error). Not status, unchanged: `Tag`, `ReferenceChip`,
  `ArtifactKindBadge` (what an object *is*), `LiveDot` (activity), `Progress`
  (how much). A state's word comes from `status-mapping.ts` and the
  domain-model label registries — a surface may not invent one.

## §3 Enforcement

### §3.1 Why the existing rules did not bite (the diagnosis the plan asked for)

The rules were not running. Four independent causes, each proven on the base:

- **D1** — `npm run lint` runs `eslint . --quiet`, which does not merely hide
  warn-level rules — it does not run them at all. Every core-ui design rule
  was wired at warn. They never executed in CI or locally.
- **D2** — three plugin rules (`no-local-status-builder`,
  `no-handrolled-select`, `no-raw-settings-textarea`) appeared in no config
  block at any severity. A rule outside the config runs on zero files and
  reads as healthy forever.
- **D3** — `npm run lint:design` (the one command that would show design
  findings without `--quiet`) crashed outright: it loaded warn-level
  type-aware `@typescript-eslint` rules with no `parserOptions.project`. Not
  part of `verify`, so nothing noticed.
- **D4** — scope and domain holes: design rules ran on `*.tsx` under two
  globs only (`.ts` excluded — why the forked `Status` type in
  `harness-presentation.ts` was never seen), and none of the 25 rules
  expressed "this control must be the design-system component" or "this fill
  has one job" — the population this package cared about was never in any
  rule's domain.

"The violations predate the rules" was not the cause: the design-system
block, which IS at error, had zero survivors. The population lived exactly
where the rules were warn or absent.

### §3.2 How this package's enforcement avoids the same fate

1. Every rule lands at error, cleared to zero survivors in the same PR —
   error is the only severity `--quiet` still runs. No baseline, no severity
   dial, no per-file allowance (AU31/AU32 removed those).
2. Wiring is structural: `hearth-config.ts` exports one flat-config block
   built from a single severity table total over the plugin's rules, asserted
   by a test — a rule can no longer be exported and wired nowhere.
3. Rules name the offence, not a value scale.
4. Every rule break-tested (RuleTester pairs + live red/green demonstrations).

### §3.3 Mechanism per axis

| # | What fails verification | Mechanism |
|---|---|---|
| E1 | 5th Button variant / 4th size | Type union + compile-time set-equality guard in `W2-primitives.test.tsx` — any change to the union fails `npm run check`, not just a resurrected deletion |
| E2 | Raw button/input/textarea/select in core-ui painting DaisyUI control chrome or an accent/status fill | `design/no-handrolled-control`, error |
| E3 | 7th input member | E2 + the design-system export list + review |
| E4 | Fill not one of the tokens | `design/no-hardcoded-color` promoted warn→error for core-ui |
| E5 | Recessed fill drawn with an outline | Deliberately OUT — AZ15's axis (Trade-off 5) |
| E6 | Radius not spelled as a `--r-*` token | `design/radius-token-only`, error (replaced `no-off-scale-radius`, whose `rounded-full` allowance was the defect) |
| E7 | Status outside StatusChip/RowDot; local status builders | `design/no-local-status-builder` wired at error + extended to `.ts`; `RowCell.tone` deletion as the type arm |
| E8 | A plugin rule registered nowhere | `hearth-config` totality test |

Two honest boundaries:
- A word collision cannot be linted ("Attention" is a string literal). E7
  catches builders; scenario 3 is closed by fixing the measured site plus the
  review rule that words come from the registry.
- "Adding a 48th button recipe" only fails where E2 reaches: a hand-rolled
  `<button>` with a token-legal fill still passes E2 unless it uses an
  accent/status fill or a DaisyUI class. That boundary is what makes the
  §4 remainder bug-list work, not lint work.

## §4 The scope line (founder-approved, 2026-08-12)

Approved reading (recommended option S4.1): radii, inputs and status close
fully; buttons close partly; the remainder is enumerated as bug-list work.
AC4 reads as "meanings partly" — deferred, not delivered.

| Axis | Closed in AZ7 | Enumerated as bug-list |
|---|---|---|
| Radii | Fully — 90 non-token occurrences → 0; `radius-token-only` at error, zero survivors. One AQ-011 exemption (`Checkbox`'s `rounded-[6px]`, keyed to the exact design-system path) | 13 occurrences in stories/tests; 7 CSS `border-radius` declarations |
| Inputs | Fully in core-ui — 28/28 chrome-carrying raw text controls migrated to `Input`/`Composer`/`SearchField`/`Select` | none of substance |
| Buttons | Partly — the 63-site DaisyUI + accent-fill union migrated; `Button` gained `size="icon"`, lost `amber`. 3 genuine sites inside the union remain behind documented `eslint-disable`s (SetupFlow preset-picker toggle, ReviewCodeDiff's two 16–18px inline affordances — none fit `size="icon"`'s 32px floor) | ~59 hand-rolled control sites (`migration-backlog.md`) |
| Fills | Vocabulary closed (`no-hardcoded-color` at error, zero survivors; ReviewBrowserPreview/ReviewRenderedInContext carry scoped rule-offs — their literal colours ARE the artifact under review). Meanings partly: SearchField/Composer/RoleCombobox/Input on `--surface-elevated`; hover-tint job on `--accent-primary-dim` | `--surface-container`'s 27 shapes reduce over time; the outlined-recess rule (E5) deferred to AZ15 |
| Status | Fully — all five forks removed; `RowCell.tone` deleted; `no-local-status-builder` wired at error | the audit's "chip on 100% of rows carries no information" stays bug-list (UI-150) |

### §4.2 How the enumeration stays true (AC6)

`migration-backlog.md` is generated, not hand-written: `predicates.mjs` emits
every site with file/line/tag/class string; `render-backlog.mjs` renders it
in AZ-bugs.md shape (46 items, UI-180 onward, deduped against Batch D by
reference). The `design:backlog:check` gate
(`tools/repo-gates/src/design-backlog-drift.ts`, wired into `npm run verify`)
re-runs the real generator pair into a throwaway location and fails if the
committed file differs — so the list cannot silently drift from the code.
This guard exists because review round 3 found the backlog had drifted when a
scanner change was never regenerated (R3-1, §7).

## §5 Technical

### §5.1 Deliverables (as built)

New: `radius-token-only` + `no-handrolled-control` rules (with RuleTester
suites and rule docs), `hearth-config.ts` severity table + totality test,
`design-backlog-drift.ts` gate, `AZ7-icon-button-geometry.spec.ts`
(real-browser geometry proof — jsdom cannot see Tailwind's output),
`eslint.design.config.ts` (standalone design-only config so `lint:design`
runs without the type-aware crash). Deleted: `no-off-scale-radius` (its
allowlist was the defect), Button's `amber` variant, `RowCell.tone` +
`toneColor`. Changed: `eslint.config.ts` spreads `design.configs.hearth`;
DESIGN.md Closed Sets section; AQ-011/AQ-101 one-spelling rule; ~60 core-ui
files (control migration, radius sweep, colour literals, status forks);
`Input` gained `forwardRef` and split single-line height utilities out of
`INPUT_BASE` (textarea min-height cascade fix). And one pre-existing bug
fixed along the way: `layers/core-ui/src/index.css`'s `@source` glob pointed
at `layers/design-system/src` (nonexistent — the package is
`framework/design-system/src`), so the entire design-system utility surface
was dead CSS; fixing it made ~198 rules live (B1, §7).

### §5.2 Contracts

```
// Button — the closed set, enforced by the type checker
variant: "primary" | "secondary" | "ghost" | "destructive"
size:    "default" | "sm" | "icon"

// Row — status is no longer a cell property
interface RowCell { content; width?; align?; numeric?; hideBelow?; "data-testid"? }

// eslint-plugin-design — wiring is total by construction
export const RULE_SEVERITY: Record<keyof typeof rules, { coreUi: Severity; designSystem: Severity }>
export const configs: { hearth: Linter.Config[] }
```

Rule predicates, stated exactly so a reviewer can re-derive the populations:

- `radius-token-only` — on a `className` attribute, any token matching
  `^rounded(-side)?(-named)?(-\[…\])?$` that is not `rounded-none` and not
  `^rounded(-side)?-\[var\(--r-(none|subtle|default|pill)\)\]$` is a
  violation.
- `no-handrolled-control` — on `<button>|<input>|<textarea>|<select>` under
  `layers/core-ui/src/**`: a class matching
  `^(btn|input|textarea|select)(-[a-z0-9]+)*$`, or a
  `bg-[var(--accent-*)]`/`bg-[var(--status-*)]` fill, is a violation.
  `--accent-primary-dim` is excluded by value (it is Set 3's row-hover tint,
  not an accent fill). `checkbox|toggle|radio|range` classes are not matched
  (AQ-011).
- `no-local-status-builder` — unchanged predicate; wired at error, extended
  to `.ts`.

Both AZ7 rules read class strings through the deep collector in
`tools/eslint-plugin-design/src/util.ts`, which follows a class string held
in a same-file const (`createConstIdentifierResolver`) — deliberately
conservative: only a const with exactly one declaration and one write
reference is followed; a `let`, an imported constant, a property read off a
const, mid-token concatenation, or a runtime-computed value stays invisible
(documented in DESIGN.md's enforcement-boundary paragraph).

## §6 Trade-offs (accepted)

1. Pill is spelled `rounded-[var(--r-pill)]` — 69 sites changed;
   `rounded-full` is a lint error. Every computed-style measurement now reads
   four on-scale values.
2. `variant="amber"` deleted (zero uses).
3. Icon buttons are one size (32px desktop / 44px touch floor) — the migrated
   16–28px ones got visibly larger; founder-approved.
4. `no-handrolled-control` is scoped to `layers/core-ui/src` — the design
   system is where controls are built, so its internals may paint chrome; a
   fork inside the design system is caught by review, not lint
   (`RichMessageCard` was).
5. E5 (recessed surfaces carry no outline) left out — outlines and elevation
   are AZ15's axis; closing them here would decide AZ15's question early.

## §7 Review history (four rounds: three NOT-DONE, then DONE)

- **Round 1** found five blocking: B1 — `size="icon"` geometry was dead CSS
  (the composer Send button rendered 17px wide), root-caused to the broken
  `@source` glob on main (§5.1); B2 — 3 of 28 input sites unmigrated; B3 —
  SearchField fill never changed; B4 — WorkTeam status word/treatment fork
  still failing validation scenario 3; B5 — false claims in tracked files and
  a `@ts-expect-error` guard that only caught the literal deleted string
  (replaced by the set-equality guard). All fixed; N1/N3/N8/N9/N12 also
  fixed, N2/N4/N5/N6/N7/N10/N11/N13/N14 recorded.
- **Round 2** found NEW-1: CommentRow's avatar chrome spelled `rounded-full`
  in a const-held class string — un-hidden by round 1's own `@source` fix
  (~198 CSS rules came back live) and invisible to `radius-token-only`'s
  walker. Fixed at both layers: the site, and the walker gap
  (const-identifier resolution). NB-2 (textarea min-height cascade) and NB-3
  (Composer/RoleCombobox fills) fixed.
- **Round 3** found R3-1: `migration-backlog.md` stale against its own
  generator (a round-2 scanner change never regenerated — 5 sites in 2 files
  unlisted). Fixed by regenerating and adding the `design:backlog:check`
  drift guard — the orchestrator's adjudication: "not another manual
  correction — make the drift mechanically checkable."
- **Round 4**: DONE, no blocking findings. Drift gate break-tested with 11
  perturbations; AC3 confirmed (0 elements over 10000px radius across 8
  routes), AC5 (five evasion shapes caught, zero false positives), AC6
  (byte-identical regeneration).

The recurring failure pattern, named by the adjudication: a tracked file
asserting something the code no longer supports — claims hand-maintained
while code moves. The fix was structural (mechanical guards), not a fourth
hand-correction.

## §8 Deferrals, limitations, residual risks

- Migration backlog: 46 items (59 control sites / 24 files, 44 chip sites /
  22 files, core-ui production) fold into AZ-bugs.md Batch D as ordinary
  bugs. The backlog is drift-gated; it cannot silently go stale.
- WorkBet's task-row hover stays hand-rolled pending UI-060 (`Row`'s button
  branch is missing `w-full`; migrating onto it would regress the row's
  width).
- ConversationSurface InsertMenu row + composer toggle and the HostThreadSection
  composer defer to UI-062 (composer consolidation); ReviewCodeDiff's compact
  reviewed-indicator needs a future Checkbox icon-only variant.
- AC4 as a product property (every fill one meaning everywhere) is
  founder-deferred: `--surface-container` still carries multiple shapes,
  reduced over time. Outline/elevation meanings (borders/shadows as a second
  signal) are a later, separate change.
- Spacing stays warn (108 findings) — explicitly AZ15's package, unenforced
  by design after AZ7.
- The radius/control rules' static boundary (same-file single-assignment
  const only) is documented in DESIGN.md; a radius built through a `let`, an
  import, a property read, mid-token concatenation, or runtime composition
  still passes silently.
- `scan.mjs`/`predicates.mjs` key their const map by name per file, not
  lexical scope — they approximate the rule populations, they are not
  equivalent to them (ESLint's scope manager is the correct one).
- Recorded, unfixed (review rounds 2/4, non-blocking): design-system
  `.stories.tsx` files sit inside the app's `@source` glob, so story-only
  utilities ship in the production stylesheet; Button.tsx's prose comment
  emits utility-shaped strings as real CSS rules; the drift gate's message
  goes quiet (counts only) when the difference is not site-level —
  fail-closed either way.
- `plans/AI4/proof/*.png` is rewritten by `AI4-status-language.spec.ts` when
  button geometry changes — decide later whether to refresh or stop the spec
  writing into tracked files.
- `npm run verify` hard-depends on generator scripts living in this
  per-work-package folder (`.pipeline/work/AZ7/measurement/`) — loud and
  fail-closed if the folder is tidied, but an unusual home for a permanent
  gate's generator (contrast `mock-inventory.ts` under `tools/`). Worth a
  later decision.
- `no-local-status-builder` is a name-matching heuristic (pre-existing from
  AI4); AZ7 wired it at error, it did not rewrite it.
- OUTSIDE AZ7, recorded: `.pipeline/AZ-bugs.md` (~150 items) exists on disk
  in one worktree only — `.gitignore` matches no re-include pattern, so git
  is blind to it; pruning that worktree loses it. Fix is a one-line
  `.gitignore` re-include, explicitly not this package's job.
