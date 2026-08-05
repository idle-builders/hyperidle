# K13 — Skill + Rule Audit (Density Awareness)

**Story:** K13 Phase 8. **Status:** Deliverable, not requiring action — feeds
a future K14 if greenlit. The K13 spec is explicit: "Skill/rule audit
produces a TODO list, not implementation. That's K14 if green-lit."

**Scope.** Re-read the existing skills + rules cited in the K13 spec and
ask, for each: (a) are they making proper use of density-awareness? (b)
where do they need new rules / new dimensions / new checks? Capture as a
concrete TODO list per skill / rule.

**Reading basis:** the K13 critique results doc
(`density-critique-K13.md`) — particularly Phase 2 (cross-tier coherence)
and Phase 3 (AI-aesthetic at comfortable) — flag the gaps the existing
tooling would not catch.

---

## 1. `.claude/rules/aesthetic-quality.md`

**State today.** Hard rules AQ-001..AQ-016 plus AI-aesthetic catalog
AQ-101..AQ-113 plus K11's AQ-017 (density-aware vs density-static
buckets). Concise (under 60 lines per K5 contract). Maps 1:1 to ESLint
plugin slugs.

**K13 finding it would not catch.** The cross-tier coherence dimension
is invisible to the rule file — every AQ rule is single-tier. A
component that consumes `var(--density-pad-x)` correctly under
`design/use-density-tokens` can still produce a tier transition that
feels "Partial" because a *neighbor* literal (e.g., illustration
spacing) doesn't move with it. AQ-017 owns the per-component bucket
question; nothing owns the per-surface tier-coherence question.

**TODO for K14.**

- **AQ-018 (proposed) — "Tier-coherence neighbors."** A density-aware
  component should not be visually paired with a density-static neighbor
  on a single surface unless the static neighbor is a status indicator
  (StatusChip, Tag) or a brand chrome element (IconRail icons). The
  rule detects: a `<EmptyState>` whose illustration inside is
  literal-spaced; a `<PitchCard>` whose action footer is literal-padded;
  the `Composer` block on `/conversations/chat`. Fix: either pull the
  static neighbor into a density-aware variant, or add a designer-call
  exception with rationale.
- **AQ-003 text update.** The current text reads
  `compact = default × 0.75; comfortable = default × 1.25 (designer-call)`
  but K9 and K11 shipped `comfortable = default × 1.5`. The K9
  `tokens.css` `@lore` already flagged this as "K5 follow-up: this line
  should be updated." K14 should fix the rule text and add the
  K10/K11/K13 references.
- **Add a "When you change a density token" sub-section.** Three steps:
  (a) update `tokens.css` and `html/_tokens.css` per tier in lockstep;
  (b) re-run `bun framework/design-system/scripts/k13-capture.ts` (or
  successor) to refresh the visual matrix; (c) gate on
  `density-tier.test.ts`. Today this lore lives in the K9 token comment
  only and does not surface to an agent doing a routine token bump.

---

## 2. `.claude/skills/design-critique/SKILL.md`

**State today.** Nine scoring dimensions including K5's "Premium polish."
Critique loop runs up to four iterations with the gate at score ≥ 7.

**K13 finding it would not catch.** The skill scores a component at
**one** tier — whichever the dev server happens to be in. A component
that is 9/10 at default but 7/10 at comfortable would pass critique
silently if the agent never thinks to toggle density. K13's matrix
required 66 captures because no skill enforces the tier-by-tier
discipline.

The skill also asks "is the screenshot taken?" but does not require
"are the three tier screenshots taken?" — the K12 workbench makes this
cheap (one URL, three pill clicks) but the skill does not direct the
agent to do it.

**TODO for K14.**

- **Add a 10th dimension: Cross-tier coherence.** Same scoring band
  (0-10). Definitions:
  - 9-10: every tier transition is felt and intentional; no surface is
    visually identical across two tiers (unless explicitly density-static
    per K10) and no surface is unrecognizably different.
  - 7-8: most transitions felt; one or two Partials traceable to a
    static-mate constraint (per K13's verdict legend).
  - < 7: a tier transition is broken (visually identical when it
    shouldn't be) or over-stepped (unrecognizable leap).
  Score requires capturing the surface at all 3 tiers via the K12
  workbench. Add Playwright snippet to the skill body.
- **Mandate three captures, not one.** The skill body currently says
  "Screenshot it (Playwright or dev server)." Update to "Screenshot it
  at compact AND default AND comfortable (3 captures). For
  primitives, use the K12 workbench at `:8098` density toolbar; for
  pages, use the dev server with the AppShell density override snippet
  in `framework/design-system/scripts/k13-capture.ts:setDensity`."
- **Add a "Density-aware?" check before scoring.** Read
  `framework/design-system/research/density-audit.md` to know whether
  the surface is density-aware or density-static, then expect the
  matching tier behavior. Density-static surfaces that DO change
  across tiers are a finding (the inverse direction the K6 rule
  `design/no-density-tokens` already enforces; the skill should call
  it out visually too).
- **Premium polish dimension — add a tier sub-rubric.** "Does the
  surface still feel premium at comfortable, or does it slide into
  marketing-landing-page territory?" Reference AQ-101..AQ-113.
- **Required Reading update.** Add
  `framework/design-system/research/density-audit.md` (K10 matrix) and
  `framework/design-system/research/density-critique-K13.md` (K13
  verdict legend + Partial taxonomy).

---

## 3. `.claude/skills/design-lint/SKILL.md`

**State today.** Runs `bun run lint:design` (the ESLint plugin) plus
higher-level cross-component checks the AST cannot do, including a
"Density-tier consistency" check that reads K10's matrix at run time.

**K13 finding it would not catch.** The skill knows about
density-aware vs density-static (AQ-017) but does not know about
**tier-coherence neighbors** (the AQ-018 candidate above). Two
components that individually pass the per-bucket rule can still
produce a Partial tier transition together.

The skill also runs against source code — it cannot see the rendered
output. Phase 3 of K13 ("AI-aesthetic at comfortable") needed an
eyeball pass against the comfortable screenshots; the lint output was
identical at every tier (because lint reads source). The skill should
direct the agent to also run a screenshot pass.

**TODO for K14.**

- **Add tier-coherence neighbor check** corresponding to the AQ-018
  proposal. For each `.tsx` page file under `layers/web/src/pages/`,
  walk the JSX tree and flag any density-aware component placed
  adjacent to (sibling or child) a density-static neighbor that is not
  an explicitly allowlisted status indicator.
- **Add a "screenshot pass at comfortable" step.** After the AST run,
  direct the agent to capture the affected pages at comfortable via the
  K12 workbench / dev server and visually compare against the AQ-101..
  AQ-113 catalog. Output the comparison as a new "AI-aesthetic at
  comfortable" finding bucket. The K13 capture script is the reference
  implementation.
- **Density-tier consistency (existing) — extend.** Today the check
  cross-references AST findings with the K10 matrix. Extend it to also
  cross-reference with the K13 critique results doc — a surface that
  K13 graded "Partial" should surface as a `(consistency)` warning so
  agents know "this surface needs a tier-coherence look, the K13
  critique already flagged it."

---

## 4. ESLint plugin rules

### 4.1 `design/use-density-tokens` (K11)

**State.** Flags literal pixel padding/gap/font-size inside components
the K10 audit marked density-aware. Reads
`tools/eslint-plugin-design/density-allowlist.json`.

**TODO for K14.**

- **Extend the axis vocabulary.** The K10 matrix and the K11 sweep added
  five new tokens (`--density-card-pad`, `--density-page-gutter`,
  `--density-icon-size`, `--density-avatar-size`, `--density-card-gap`).
  The rule today checks `pad-x`, `pad-y`, `gap`. Add per-axis
  recognition for the new tokens so a literal `h-[24px]` on an
  avatar-bearing component triggers a finding pointing at
  `--density-avatar-size`.
- **Per-axis allowlist granularity.** Today a component is either
  density-aware-on-an-axis or density-static-on-an-axis, but the
  manifest schema is component-level not axis-level. K10's matrix
  already records per-axis decisions ("partial: padding only,
  font-size literal"). Schema change in `density-allowlist.json` to
  match the matrix granularity.

### 4.2 `design/no-density-tokens` (K11)

**State.** Inverse of `use-density-tokens` — flags `var(--density-*)`
in components K10 marked density-static (e.g., StatusChip, IconRail).

**TODO for K14.**

- **Add a per-axis variant.** Today the rule is component-level
  density-static. K10 actually allows "density-static on font-size,
  density-aware on row-h" patterns (e.g., a hypothetical chip family
  that grows in click-target size with comfortable but holds its
  visual height). Mirror the per-axis schema change in 4.1.
- **Allow exceptions via inline pragma.** Today the only escape is
  the JSON manifest. Add a `// eslint-disable-next-line design/no-density-tokens
  -- (designer-call) <reason>` pattern that requires a designer-call
  rationale to silence the rule on a single line.

### 4.3 `design/no-ai-aesthetic` (K6)

**State.** Class-name match against AQ-101..AQ-113 anti-pattern list.

**TODO for K14.**

- **Add a tier-aware check.** Some AI-aesthetic tells (notably AQ-103
  "oversized padding" — `p-8`/`p-10`/`p-12`) are tier-amplified: a `p-4`
  literal looks fine at default but reads as oversized at comfortable
  when neighboring cards have grown to `--density-card-pad: 16 px`.
  The rule should flag literals that, when added to the comfortable
  card-pad, would push past the AQ-103 threshold.
- **Cite the K13 critique doc when available.** When a component
  triggers the rule, the message should suggest "see
  `framework/design-system/research/density-critique-K13.md` for the
  surface's tier-coherence verdict before deciding whether to
  silence." Only useful once K14 ships the AQ-018 work.

### 4.4 `design/no-off-scale-font-size` (K6)

**State.** Flags `text-[Npx]` not in the type scale.

**TODO for K14.**

- **Add density-text awareness.** Today the closed scale is the
  literal Tailwind scale + density tokens. K9 introduced
  `--density-text-h1` and `--density-text-h2`; the rule should
  recognize `var(--density-text-h*)` as on-scale and not flag a
  consumer.
- **Flag heading utilities that bypass density-text-h*.** A literal
  `text-2xl` on an H1 means the H1 won't grow under comfortable.
  The rule should propose `var(--density-text-h1)` as the fix when
  the literal sits on a heading element.

### 4.5 `design/require-focus-on-interactive` (K6)

**State.** Flags `<div onClick>` / `<span onClick>` without `tabIndex`,
`role`, or focus-visible class. AQ-015 / WCAG 2.1.1.

**TODO for K14.**

- **Add a touch-target axis.** AQ-015 requires ≥ 44 CSS px touch
  target at viewport ≤ 1024 px. The rule today catches keyboard
  focus but not touch sizing. Add a sibling rule or extend this rule
  to also flag interactive elements whose computed (declared) min-h
  drops below `--density-row-h`'s smallest tier value (currently
  2 rem = 32 px under compact).

---

## 5. Suggested K14 scope (prioritized)

If K14 is greenlit, the **minimum useful slice** is:

1. **AQ-003 text fix** in `aesthetic-quality.md` (5 min — just update
   the ratio text and cite K9/K11).
2. **AQ-018 (Tier-coherence neighbors) rule + skill check** — the
   single highest-leverage gap K13 surfaced. Without it, the K13
   discipline does not survive past one re-run.
3. **`design-critique` 10th dimension (Cross-tier coherence) + 3-tier
   capture mandate** — bakes the K13 method into the routine flow.
4. **Per-axis schema in `density-allowlist.json`** — preserves K10's
   matrix granularity that the current schema flattens.

The remaining items (`no-ai-aesthetic` tier-amplification,
`no-off-scale-font-size` density-text awareness, touch-target axis on
`require-focus-on-interactive`) are valuable additions but lower
impact; they can land in K14 or get scheduled as standalone follow-ups.

The two adjacent recommendations from K13 Phase 4 (the chat
**Composer** primitive and the Submenu width fix) are **separate
stories** — they touch component code and the component budget, not
just rules. Recommend filing as K15 / K16 so they don't bleed into
K14's rule scope.

---

## 6. What K13 explicitly did NOT do (per spec contract)

- **Did not implement any of the TODOs above.** This is K14's call.
- **Did not edit any skill or rule file.** K13 is the audit; K14 is
  the action.
- **Did not change AESTHETICS.md AQ catalog.** Only the K13 changelog
  line in § Spacing & Density was added (in the Phase 8 doc commit).
- **Did not edit token values.** Phase 4 outcome was "no change; K11
  ladder confirmed." That is the explicit AC default.
