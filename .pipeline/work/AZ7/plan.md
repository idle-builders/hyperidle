# AZ7 — Close the visual system

## What we need

Every button, input, filled surface, radius and status in the product should be drawn from a
closed, written-down set, so a builder picks from a list instead of inventing and a reviewer can
tell a violation from a choice.

Measured across twelve routes by computed style, the product shipped 47 distinct button recipes, 6
input recipes and 13 distinct uses of one surface fill — the same `--surface-container` standing in
for a chip, a card, a banner, an input and an empty state, with radius and border varying per
instance. "Pill" was spelled two ways; status had five presentations and two contradicting words for
the same state on one page. This is the root cause of "everything looks slightly different
everywhere", and why fixing surfaces one at a time never converged. The tokens and design-system
components were sound and largely unused as a system, and the aesthetic rules already forbade much
of this — so establishing *why the rules were not biting* was part of the work.

Done means: a written closed set per axis — button variants, input variants, filled-surface
meanings, radii, status presentations — each entry stating what it is for; every value in use
resolving to a member of its set; one spelling of "pill" and every radius on the documented scale;
each surface fill carrying one meaning; adding a variant outside a closed set failing verification
rather than passing silently; and the remaining migration work enumerated so it can be worked as
ordinary bugs.

The binding constraint: decide from what already ships. This closes a set, it does not design a new
look, and no new component may be introduced whose job an existing design-system export already
does. Spacing and elevation, page-level geometry (AZ11) and the migration of every call site are
out of scope.

## How it works

**The diagnosis.** The existing rules were not running, for four independent proven reasons: `npm
run lint` runs `eslint . --quiet`, which does not merely hide warn-level rules but never executes
them, and every core-ui design rule was wired at warn; three plugin rules appeared in no config
block at any severity, so they ran on zero files and read as healthy forever; `lint:design`, the one
command that would have shown findings, crashed on type-aware rules with no `parserOptions.project`
and was not part of `verify`; and the rules that did run covered only two `.tsx` globs and expressed
nothing like "this control must be the design-system component". "The violations predate the rules"
was refuted — the design-system block, which is at error, had zero survivors; the population lived
exactly where the rules were warn or absent.

**The decided sets** live in `framework/design-system/DESIGN.md` §"Closed Sets (AZ7)". Button is
four variants and three sizes, enforced by the type union plus a compile-time set-equality guard;
`amber` was deleted (zero uses) and `size="icon"` added to cover 20 shipped hand-rolled square icon
buttons at one size. A full-width clickable row is `Row`, a segmented switch is `TabBar`, a link is
a link. Cards are `--surface-elevated`; the contradicting "flat cards use `--surface-container`"
rule was retired, and `--surface-page`'s second job as a hover tint moved to `--accent-primary-dim`.
The only permitted spelling of a non-zero radius is a `--r-*` token, retiring `rounded-full` as the
pill's second spelling. `RowCell.tone` — a third status channel with one call site — was deleted
outright, making every remaining use a compile error; a state's word comes from `status-mapping.ts`
and the domain-model label registries, and a surface may not invent one.

**The enforcement is structural, so it cannot decay the same way.** Every rule lands at error,
cleared to zero survivors in the same PR, because error is the only severity `--quiet` still runs —
no baseline, no severity dial, carve-outs only where documented with a reason. The plugin exports
one flat-config block built from a single severity table over all its rules, asserted by a totality
test, so a rule can no longer be exported and wired nowhere. Two new rules carry the new axes:
`radius-token-only` (replacing `no-off-scale-radius`, whose `rounded-full` allowance was the defect)
and `no-handrolled-control`.

**The remainder is enumerated, not hidden.** The migration backlog is generated from the
measurement scripts, and a `design:backlog:check` gate wired into `npm run verify` re-runs the real
generators and fails if the committed file differs. That guard exists because a review round found
the backlog had drifted after a scanner change was never regenerated; the adjudication was "not
another manual correction — make the drift mechanically checkable." The recurring failure pattern
across four review rounds was exactly that: a tracked file asserting something the code no longer
supports.

## How we work on this

Shipped after four review rounds (three NOT DONE, then DONE, with the drift gate break-tested
against eleven perturbations). Accepted trade-offs: pill is respelled across 69 sites; icon buttons are one size, so the migrated
16–28px ones got visibly larger (founder-approved); `no-handrolled-control` is scoped to
`layers/core-ui/src`, because the design system is where controls are built, so a fork inside it is
caught by review rather than lint; and "recessed surfaces carry no outline" was deliberately left
out, since outlines and elevation are AZ15's axis.

Deferred and residual:

- The scope line was founder-approved as: radii, inputs and status close fully; buttons close
  partly; the remainder is bug-list work. Three genuine button sites remain behind documented
  `eslint-disable`s, and ~59 hand-rolled control sites fold into AZ-bugs.md Batch D as 46 items.
- "Every fill has one meaning everywhere" is founder-deferred: the fill *vocabulary* is closed and
  enforced, but `--surface-container` still carries multiple shapes and reduces over time. Spacing
  stays at warn (108 findings) — AZ15's package, unenforced by design after this.
- The rules' static boundary is documented: both read class strings through a deliberately
  conservative collector following only a same-file const with one declaration and one write, so a
  radius built through a `let`, an import, a property read or runtime composition passes silently.
- Recorded and unfixed: design-system `.stories.tsx` files sit inside the app's `@source` glob, so
  story-only utilities ship in the production stylesheet; `Button.tsx`'s prose comment emits
  utility-shaped strings as real CSS rules; the drift gate goes quiet (fail-closed) when the
  difference is not site-level.
- `npm run verify` hard-depends on generator scripts that lived in this work-item folder
  (`.pipeline/work/AZ7/measurement/`) and on the generated `migration-backlog.md`. That was already
  flagged at ship as an unusual home for a permanent gate's generator; the consolidation that
  produced this file removed them, so `design:backlog:check` must be re-homed under `tools/` or
  retired before `verify` is green again.
- Outside this package: `.pipeline/AZ-bugs.md` exists on disk in one worktree only — `.gitignore`
  matches no re-include pattern, so git is blind to it and pruning that worktree loses it. The fix
  is a one-line re-include, explicitly not this package's job.
