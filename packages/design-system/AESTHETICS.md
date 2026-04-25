# AESTHETICS

Long-form, citation-backed synthesis of what makes a productivity-tool UI feel premium and usable. This document is the canonical research handoff for downstream work in Track K (notably K6 and K7).

## How to read this document

This document is structured so a downstream agent (a developer, a lint-rule author, a UI-sweep author) can answer concrete questions without reading every paragraph.

- **The recommendations table at the end of each topic section is the source of truth for K7.** When K7 changes a token or sweeps a component, it cites the row in the recommendations table that drove the change. If a token does not appear in any recommendations table, K7 must not change it.
- **K7 reads the recommendations tables.** K6 reads the `Lintable` and `Lint hint` columns to author ESLint rules. K8 validates the resulting code against the same tables.
- **`no change` is normative.** When the Recommended cell reads `no change`, K7 must NOT bump the token. K7 acceptance criteria that mention "if K1 recommends a bump" are conditional — absence of a bump is itself a deliberate verdict, not an oversight.
- **Resolution categories.** A row's Recommended cell falls into one of four resolution kinds:
  - **A specific value** (e.g., `16px`, `0.5`, `comfortable`) — apply as written.
  - **`no change`** — research-backed; current value sits in the cross-system band, no movement.
  - **`(designer-call)`** — research did not converge on a single value, but the design team chose a stance anyway. The Recommended cell carries the chosen value followed by `(designer-call)`. Rationale must include a one-line justification. K7 applies the value; K6 may lint it; reviewers may revisit the call but should not silently revert it.
  - **Behavioral** (e.g., `apply font-variant-numeric: tabular-nums on tables`) — applied at the component or sweep level, not as a token bump.
- **Citation discipline.** Every concrete claim has at least one source-id in the Sources column. Source-ids resolve to the URL register in Appendix A (`S1`, `S5`, `S22`, ...). Recommendations that change a token's value (Recommended != Current AND Recommended != `no change`) require **at least 3 distinct organization domains** in the Sources column — Apple HIG and Material Design count as separate organizations, but two articles from the same site count as one. The 3-domain rule applies to **every** topic section, including Mobile and AI-Aesthetic. The only escape valve is `(designer-call)`, which explicitly admits that research did not converge.
- **Lintability legend.**
  - `yes` — the rule can be expressed as a JS regex or single jscodeshift selector; the `Lint hint` cell carries the authorable form (e.g., `regex: /\brounded-(2xl|3xl)\b/`).
  - `partial` — the rule needs an AST scan plus context (e.g., "only inside non-modal components"); the `Lint hint` column gives the AST selector AND the contextual predicate.
  - `no` — the rule is a design judgment that cannot be lintable; recorded for designer review only.
- **Cross-references.** Each section heading lists the `tokens.css` token group it touches, the placeholder K6 rule id it maps to, and the K7 work that consumes it.
- **PRINCIPLES.md cross-link.** This document complements `PRINCIPLES.md` (the seven-universals charter). Where the two overlap (notably the AI-Aesthetic section), this document is the deeper handoff. K5 must add a one-line cross-link from `PRINCIPLES.md` header to this file; until that ships, expect agents to land on `PRINCIPLES.md` first.
- **Per-topic research.** Appendix C links to the long-form research files under `packages/design-system/research/`. Those files contain the raw citations and the disagreement logs.

If you skim only one thing in this document: read the recommendations tables.

---

## 0. Glossary

- **Density preset.** One of `default`, `compact`, `comfortable` applied via `[data-density]` on the AppShell root; controls `--density-pad-*`, `--density-gap`, `--density-row-h`, `--density-text`.
- **Type scale.** The closed set of font sizes used across the UI; HyperIdle's current set is documented in `DESIGN.md` and reflected in the typography section below.
- **Off-grid.** A spacing/sizing value that is not a multiple of 4px.
- **Off-scale.** A radius, font-size, or other token whose value falls outside the closed set defined in `tokens.css`.
- **AI-aesthetic.** A visual pattern statistically common in LLM-generated UI but uncommon in productivity-tool design systems; see Section 7.
- **MVQP.** Minimum Viable Quality Product (Stripe). The principle that aesthetic quality is functionally material.
- **Touch target.** The interactive area of a control as measured in CSS pixels; the cross-system floor is 44 CSS px.
- **Density override.** An explicit user-selected density in Settings that defeats the viewport-driven auto-switch.

---

## Spacing & Density

Token group: `--density-pad-*`, `--density-gap`, `--density-row-h`. Map to K6 rules `design/no-off-grid-spacing`, `design/no-off-scale-spacing`. Consumed by K7, re-tiered by K9.

### K9 changelog (Density Ladder Re-tier — Real Comfortable Mode)

K9 overrides the K1 verdicts on the rows below. Each was recorded as `no change` by K1 because no 3-source consensus existed on a specific value above the productivity-tool floor; K9 takes the cluster-midpoint values explicitly as a `(designer-call)` per the K1 resolution category and tags the rows accordingly. The K7 tier ratio (`compact = default × 0.75; comfortable = default × 1.25`) is replaced by `compact = default × 0.75; comfortable = default × 1.5`. Today's `default` becomes the new `compact` (no power-user loses what they had); the new `default` and the new `comfortable` shift up into the iOS Settings / Notion / Apple Mail comfort band.

Rows overridden by K9:

- `--density-pad-y` (default): K1 verdict `no change` (8 px) → K9 12 px (designer-call).
- `--density-pad-x` (default): K1 verdict `no change` (12 px) → K9 16 px (designer-call).
- `--density-gap` (default): K1 verdict `no change` (8 px) → K9 12 px (designer-call).
- `--density-row-h` (default): K1 verdict `no change` (32 px) → K9 44 px (designer-call; also clears AQ-015 floor).
- `Density tier ratio (compact)`: K1 `default × 0.75 (designer-call)` → unchanged in shape, but applied against the new (larger) default.
- `Density tier ratio (comfortable)`: K1 `default × 1.25 (designer-call)` → K9 `default × 1.5 (designer-call)`.

Note for K5 follow-up: `.claude/rules/aesthetic-quality.md` AQ-003 still cites the K7 1.25× ratio. Update to `compact = default × 0.75; comfortable = default × 1.5` per this K9 re-tier.

#### K11 sub-changelog (Density Sweep + Lint Enforcement)

K11 makes the K9 ladder real on every surface a user looks at. The K10 audit at `packages/design-system/research/density-audit.md` is the implementation spec; every component refactor traces to one row in that matrix. K11 also adds the `design/use-density-tokens` and `design/no-density-tokens` lint rules + the opt-out manifest at `packages/eslint-plugin-design/density-allowlist.json` so future PRs cannot drift the swept components back to literal pixels (or leak density tokens onto the canonical density-static surfaces — StatusChip, Tag, IconRail, NotFound).

Five new density tokens were added (full per-tier rows below in this section's recommendations table; full citations + rationale in `density-audit.md` § 4):

- `--density-card-pad` (8 / 12 / 16 px): card outer padding budget — BetCard, TaskCard, PitchCard, SkeletonCard, EmptyState/ErrorState pad-y, ArtifactView content pad, PitchSelector pad, WorkPortfolio inline product card. Atlassian / Linear / Material 3.
- `--density-page-gutter` (8 / 16 / 24 px): the `<main>` page gutter — split from `--density-pad-x` so the page margin and component interior pad can move on independent cadences. Also consumed by Submenu, Rail (expanded), ReviewHeader. Atlassian / Bootstrap / Tailwind.
- `--density-icon-size` (14 / 16 / 20 px): list-row icon size cascade — defined for K12 / future use; SearchField, the WorkBet sort headers, Submenu / Rail expand chevrons should consume. Material 3 / Carbon / Fluent.
- `--density-avatar-size` (24 / 32 / 40 px): row-anchor avatars — ThreadRow, ReviewHeader. Card-internal avatars (BetCard lead, WorkPortfolio product avatar) explicitly stay literal at 24 px. Slack / Linear / Material 3.
- `--density-card-gap` (4 / 8 / 12 px): intra-card gap (label↔value, row↔row inside a card) — KeyValue, BetCard, TaskCard, PitchCard, SkeletonCard, EmptyState/ErrorState, ConversationsChat message group, PitchSelector detail pane. Independent of `--density-gap` (inter-row) so rhythms can diverge. Linear / Notion / Material 3.

Components swept by K11 (every surface in K10's matrix marked `yes` or `partial`, in lockstep TSX + HTML per `.claude/rules/visual-parity.md`):

- Tier 1: KeyValue (gap → `--density-card-gap`), NavItem (already wired in K9), ThreadRow (gap, body text, avatar → `--density-avatar-size`), KnowledgeRow (gap + factoryMode override retired per § 3.2.2), NotificationRow (pad + gap + body text).
- Tier 2: BetCard (card-pad, card-gap, row gap, title), TaskCard (card-pad, card-gap, row gap, title), PitchCard (card-pad, card-gap, row gap, title, hypothesis-escalates), EmptyState (pad-x, pad-y → card-pad, gap → card-gap, title), ErrorState (same as EmptyState), Skeleton (List row-h + gap; Card pad + gap).
- Tier 3 shells: Submenu (page-gutter), Rail expanded (page-gutter), ReviewHeader (page-gutter, gap, proposer-name), Canvas (column gap), Kanban (column gap), ArtifactView (content pad), PitchSelector (card-pad, section gap, detail-pane pad). AppShell `<main>` (page-gutter).
- Pages: WorkPortfolio (section gap + inline product-card adopts BetCard density shape per § 3.4.P1).

Components K11 explicitly leaves literal (the lint rule allowlist enforces these stay literal in future PRs):

- `StatusChip`, `Tag` — badge-as-callout (§ 3.1.1, § 3.1.2). Density-toggling badges destroys their as-callout function.
- `IconRail` — brand chrome (§ 3.3.K1). The canonical density-static shell. § 5.6.
- `NotFound` — error page chrome (§ 3.4.P8).
- Specific axes inside otherwise density-aware components: NavItem icon + count chip (§ 3.1.4), ReviewHeader verdict buttons + avatar (§ 3.3.K5 + § 5.2), BetCard progress bar h + lead avatar (§ 3.2.4), TaskCard max-w (§ 3.2.5), PitchCard max-w (§ 3.2.6), EmptyState/ErrorState description font + alignment (§ 3.2.7 + § 5.1), Submenu width (§ 3.3.K2), Rail width + collapsed pills (§ 3.3.K3), ArtifactView diff lines + sparkline + visual-cmp pad (§ 3.3.K4), Canvas drop-zone min-h + DnD geometry (§ 3.3.K6), Kanban grid template (§ 3.3.K7).

The full per-component matrix appears in **Appendix D — Density-Aware Component Matrix** at the end of this file (the K10 audit at `packages/design-system/research/density-audit.md` is the canonical source of truth; Appendix D is the AESTHETICS.md entry point so downstream agents do not need to leave this document).

### Findings

The 4px grid is universal across reference systems. Material 3, IBM Carbon, Atlassian, Shopify Polaris and Tailwind all build their spacing scales as multiples of 4px (Carbon and Atlassian permit a single 2px sub-step for fine adjustments inside small interactive elements). Productivity-tool defaults cluster at 8-12px vertical padding, 12-16px horizontal padding, and 32-40px row heights for dense list views. HyperIdle's current default density (8 / 12 / 8 / 32 / 14) sits at the lower end of the productivity cluster. See `research/spacing-density.md` for the per-source numbers.

The cross-system convergence supports holding the 4px grid as a hard rule and allowing 2px only inside chips/icons/focus offsets. Sources do not converge on a single specific value to bump `--density-pad-y` above 8px; the cluster is 8-12px with no 3-source agreement on a midpoint.

### Density ladder coherence

The three density presets must shift together. Material 3 documents window-size-class density modifiers as proportional offsets (S1); Apple HIG describes Compact as a fractional reduction of the regular layout (S10); Carbon's productive vs expressive themes scale token sets together (S16). None publishes an exact ratio, so HyperIdle takes a **designer-call** stance: `compact = default × 0.75`, `comfortable = default × 1.25`, both rounded to the nearest 4px multiple (or 2px floor for chip-internal contexts). When `default` moves, the other tiers move proportionally and the row-height ladder is recomputed as `pad-y × 4 + content cap-height`. The current tokens (`tokens.css:132-156`) deviate from this rule (compact pad-x 6px ≠ default 12px × 0.75 = 9px → 8px; comfortable pad-y 12px = default 8px × 1.5 instead of 1.25). The ladder-coherence row in the recommendations table is what K7 enforces.

### Recommendations

| Token | Current value | Recommended value | Rationale | Sources | Lintable | Lint hint |
|---|---|---|---|---|---|---|
| Grid base unit | 4px | no change | All major systems converge on 4px (Material, Carbon, Atlassian, Polaris); 2px allowed only inside chips/icons | S1 S16 S21 S27 | yes | regex: `/\b(p\|m\|gap)[xytrbl]?-\[(\d+)px\]/` allowlist `{4,8,12,16,20,24,32,40,48}` |
| `--density-pad-y` (default) | 0.5rem (8px) | 0.75rem (12px) (designer-call) | K9 — moves to the upper end of the 8-12 px Carbon/Atlassian/Polaris cluster to land in the iOS Settings / Notion / Apple Mail comfort band. K1 was `no change` because no 3-source consensus picked a single midpoint; K9 takes 12 px explicitly as a designer call. | S16 S21 S27 | partial | regex: `/\bpy-\[(\d+)px\]/` allowlist tied to density preset |
| `--density-pad-x` (default) | 0.75rem (12px) | 1rem (16px) (designer-call) | K9 — moves to the upper end of the 12-16 px productivity cluster (Carbon, Atlassian, Polaris) for the new comfort-band default. K1 verdict `no change` overridden as designer call. | S16 S21 S27 | partial | regex: `/\bpx-\[(\d+)px\]/` allowlist tied to density preset |
| `--density-gap` (default) | 0.5rem (8px) | 0.75rem (12px) (designer-call) | K9 — paired with the pad-y bump so cards/rows breathe at the same step. Sits inside the 4-12 px gap cluster across Material/Carbon/Atlassian. K1 `no change` overridden. | S1 S16 S21 | partial | regex: `/\bgap-\[(\d+)px\]/` allowlist `{4,8,12,16}` |
| `--density-row-h` (default) | 2rem (32px) | 2.75rem (44px) (designer-call) | K9 — bumps the default row height into the AQ-015 44 CSS px touch-target floor at the default tier itself, removing the K8 special-case where comfortable was the only tier that cleared the floor. Carbon/Atlassian/Polaris row heights span 32-48 — 44 sits in band. K1 `no change` overridden. | S16 S21 S27 S39 | no | - |
| Sub-grid 2px allowance | implicit | 2px allowed only inside StatusChip and Tag (no other contexts) | Carbon spacing-01, Atlassian space.025 and Polaris space-050 reserve 2px only for fine chip/icon adjustment | S16 S21 S27 | partial | ast: `JSXAttribute[name.name='className'][value.value=/\b(p\|m\|gap)[xytrbl]?-\[2px\]/]` flagged outside `StatusChip\|Tag` parent |
| Density tier ratio (compact) | 6/4/4/26 (irregular) | default × 0.75, rounded to 4px (designer-call) | No reference system publishes a numeric ratio; Material/Apple/Carbon all describe proportional density modes without quoting a multiplier (designer-call: 0.75 picked as the cross-system midpoint of "tighter than default but legible") | S1 S10 S16 | partial | ast: tokens.css `[data-density="compact"]` block — each value equals default × 0.75 ±4px |
| Density tier ratio (comfortable) | 16/12/12/40 (irregular) | default × 1.5, rounded to 4px (designer-call) | K9 — re-tiered from K7's 1.25× to 1.5×. The comfortable tier matches the iOS Settings / Notion / Apple Mail comfort band (Apple HIG, Notion product UI, Apple Mail) instead of the K7 +25 % nudge that read as the same layout slightly bigger. row-h is exempt from the upper-bound rule and lands at a designer-call 56 px (>= AQ-015 44 px floor, < strict 1.5× cap of 66 → 64). | S1 S10 S16 | partial | ast: tokens.css `[data-density="comfortable"]` block — each value equals default × 1.5 ±4px (row-h exempt) |
| `--density-card-pad` | not codified | 8 / 12 / 16 px across compact / default / comfortable (designer-call) | K11 — card outer padding budget. Cards have a different scale than list rows; today every card hardcodes `p-[8px]` so density toggling is invisible on the surfaces that occupy the most pixels. Atlassian / Linear / Material 3 all publish the 8/12/16 ladder. See `density-audit.md` § 4.2. | S5 S4 S3 | partial | ast: tokens.css `[data-density="*"]` block defines `--density-card-pad` as 8/12/16; lint: `design/use-density-tokens` flags BetCard / TaskCard / PitchCard / SkeletonCard / EmptyState / ErrorState / ArtifactView / PitchSelector if they use literal padding |
| `--density-page-gutter` | not codified | 8 / 16 / 24 px across compact / default / comfortable (designer-call) | K11 — `<main>` page gutter, split from `--density-pad-x` per `density-audit.md` § 3.5. The page gutter and component interior pad must move on independent cadences (a 4 % page-gutter change is not a 50 % NavItem-pad change). Stops at 24 px to prevent hero spacing (§ 5.3). | S5 S17 S18 | partial | ast: AppShell.tsx `<main>` className contains `var(--density-page-gutter)`; Submenu / Rail expanded / ReviewHeader outer pad consume the same |
| `--density-icon-size` | not codified | 14 / 16 / 20 px across compact / default / comfortable (designer-call) | K11 — list-row icon size cascade. Material 3 / Carbon / Fluent all expose an icon-size cascade alongside the spacing cascade. NOT consumed by NavItem (brand chrome stays literal per § 3.1.4). Reserved for K12 / K13 wiring of SearchField + sort headers. | S2 S1 S16 | partial | ast: tokens.css `[data-density="*"]` block defines `--density-icon-size` as 14/16/20 |
| `--density-avatar-size` | not codified | 24 / 32 / 40 px across compact / default / comfortable (designer-call) | K11 — row-anchor avatar size cascade. Slack / Linear / Material 3 all publish 24/32/40. ONLY for row-anchor avatars (ThreadRow, ReviewHeader); card-internal avatars (BetCard lead, WorkPortfolio product) explicitly stay literal at 24 px per § 4.4. The IconRail user avatar also stays literal — it is brand chrome (§ 5.8). | S9 S4 S2 | partial | ast: ThreadRow / ReviewHeader avatar img className contains `var(--density-avatar-size)` |
| `--density-card-gap` | not codified | 4 / 8 / 12 px across compact / default / comfortable (designer-call) | K11 — intra-card gap (label↔value, row↔row inside a card). Independent of `--density-gap` (inter-row by Submenu / Rail) so rhythms can diverge. At comfortable, an inter-row gap of 16 px and an intra-card gap of 12 px gives the card an internal hierarchy. Linear / Notion / Material 3 all sit at 4/8/12. | S4 S6 S2 | partial | ast: KeyValue / BetCard / TaskCard / PitchCard / SkeletonCard / EmptyState / ErrorState gap consume `var(--density-card-gap)` |

Disagreements: see Appendix B.1.

---

## Typography

Token group: `--ui`, `--mono`, type scale in `DESIGN.md`. Map to K6 rules `design/no-off-scale-font-size`. Consumed by K7.

### Findings

Productivity-tool body type sits at 14px across Carbon (`body-01`), Polaris (`body-md`), Linear, GitHub, and Atlassian. Consumer-content systems sit at 16px (Material `body-large`, Polaris `body-lg`). Practical Typography recommends 15-25px for prose, explicitly outside the productivity-tool scope. HyperIdle's 14px body matches the productivity convergence. See `research/typography.md`.

Headings cluster at 24/20/18/16/14 across reference systems. HyperIdle's 24/18/14 ramp is a tight productivity ladder; sources do not converge on a specific intermediate (some pick 20, others pick 22, others 16) so no single intermediate is recommended.

Mono is for code, IDs, timestamps, and tabular numerics. Tabular numerals (`font-variant-numeric: tabular-nums`) are required when numbers must align in columns; Apple HIG, Material 3 and Carbon all call this out. HyperIdle currently uses Geist Mono for these contexts but does not enforce tabular numerals at the token layer.

### Body and heading bump verdict

**Body: no change at the default density.** The 14px default is the productivity-tool consensus across Carbon, Polaris, Atlassian, and Linear. Bumping body to 15px or 16px would move toward consumer-content defaults that target prose, not data-dense workflow UIs. The comfortable density preset already sits at 15px (`--density-text: 0.9375rem`), which is the appropriate auto-switch value at the mobile breakpoint (see Section 6).

**Body line-height: bump default from 1.45 to 1.5 (designer-call).** Material body (S2), Polaris body-md, and HyperIdle's current 1.45 sit in a 1.43-1.5 cluster; Carbon body-01 is tighter at 1.29. Three sources sit at the 1.5 ceiling of the cluster (Material, Polaris, WebAIM-derived prose guidance) — picking 1.5 makes the dense layout breathe without bumping the size. Comfortable preset bumps to 1.55. Tagged designer-call because the cluster is a band, not a point.

**Heading: add 20px as the intermediate (designer-call).** The 24/18/14 ramp skips a critical mid-step. Carbon body-02 / heading lands at 20px (S17); Polaris heading-md at 20px (S28); Material 3 title-large at 22 with body-large 16 — Material is the outlier. Two of three productivity systems include 20. Tagged designer-call because Material disagrees on 20-vs-22; HyperIdle picks 20 to match the productivity cluster.

**Letter-spacing for caps.** StatusChip, Tag, and any uppercase label needs `+0.02em` (2%) tracking per Apple HIG (S11) and Refactoring UI (S47). Tabular numerics use default tracking (0); numeric tables additionally use `font-variant-numeric: tabular-nums` for column alignment.

**Font-weight scale.** Codify 400 (body), 500 (label/heading), 600 (emphasis/heading-bold). Mirrors PRINCIPLES.md:186 and reconciles K1 to it.

**One mobile-specific exception** (covered as a behavioral rule in the recommendations below): inputs at the mobile breakpoint must use a font-size of at least 16px to prevent iOS Safari from auto-zooming on focus.

### Recommendations

| Token | Current value | Recommended value | Rationale | Sources | Lintable | Lint hint |
|---|---|---|---|---|---|---|
| Body size (default) | 14px | 15px (designer-call) | K9 — bumps the new default tier to 15 px to match the iOS Settings / Notion / Apple Mail comfort band; 14 px is preserved on the new `compact` tier for power-users on small screens. K1 `no change` overridden. | S17 S22 S28 | yes | regex: `/\btext-\[(\d+)px\]/` allowlist `{11,12,13,14,15,16,18,20,24}` |
| Body size (comfortable) | 15px | 16px (designer-call) | K9 — bumps comfortable to 16 px (iOS Mail / Notion comfort tier), giving the density toggle a real type-scale step (compact 14 → default 15 → comfortable 16). | S2 S45 S46 | yes | regex: `/\btext-\[16px\]/` |
| Body line-height (default) | 1.45 | 1.55 (designer-call) | K9 — pulled up from K7's 1.5 to match the new larger 15 px body. Material/Polaris/WebAIM all sit at 1.5+ for body size 15+; 1.55 picks the upper-cluster value for the new default. | S2 S28 S45 | partial | ast: tokens.css / Tailwind config — body line-height token equals 1.55 |
| Body line-height (comfortable) | 1.45 | 1.6 (designer-call) | K9 — paired with the comfortable body bump to 16 px; 1.6 lands inside the Material body-large / Apple Reading 1.5-1.6 band for body 16. | S2 S28 S45 | partial | ast: tokens.css `[data-density="comfortable"]` line-height equals 1.6 |
| Heading scale | 24/18/14 | 24/20/18/14 — add 20px intermediate (designer-call) | Carbon and Polaris both include 20px as a heading mid-step; Material disagrees (22). HyperIdle picks 20 to match the 2-of-3 productivity cluster (designer-call: tie-break against Material in favor of Carbon+Polaris) | S17 S28 S2 | yes | regex: `/\btext-\[(20)px\]/` admitted; `text-\[(22)px\]` flagged |
| `--density-text-h1` (per-tier H1 token) | not codified | 24 / 26 / 28 px across compact / default / comfortable (designer-call) | K9 — H1 grows under comfortable so the type-scale toggle reads at the page level, not just the body level. 24 px (compact) is the K1 H1 anchor; +2 px per step matches the 1.5× spacing-tier ratio rounded to even px. Material 3 (S2) display sizes scale similarly between compact/expanded windows. | S2 S17 S28 | partial | ast: tokens.css `[data-density="*"]` block defines `--density-text-h1` as 24/26/28 |
| `--density-text-h2` (per-tier H2 token) | not codified | 18 / 20 / 22 px across compact / default / comfortable (designer-call) | K9 — H2 likewise scales, taking K1's 20 px Carbon/Polaris mid-step on the new `default` tier and bracketing it 18/22 for compact/comfortable. | S17 S28 S2 | partial | ast: tokens.css `[data-density="*"]` block defines `--density-text-h2` as 18/20/22 |
| Heading line-height | not codified | 1.2-1.25 (designer-call) | Cross-system band (Material 1.25, Carbon 1.2, Apple HIG 1.2-1.3); pick 1.25 for ≤20px headings, 1.2 for 24px+ (designer-call: band, not point) | S2 S11 S17 | partial | ast: heading text-token line-height in {1.2, 1.25} |
| Letter-spacing for caps | not enforced | +0.02em (+2%) on default/compact; +0.015em on comfortable (designer-call) | K9 — slightly tightens caps tracking under comfortable because uppercase labels at the larger body size do not need the same wedge to feel airy. Apple HIG / Refactoring UI cluster sits at 1.5-2 % for body 14-16 px; K9 picks the lower-cluster value at the larger size. | S11 S47 S22 | partial | ast: any element with `text-uppercase` or `uppercase` Tailwind class lacking `tracking-wide` or `tracking-[var(--tracking-caps)]` |
| Font-weight scale | implicit | 400 / 500 / 600 codified — body 400, label/heading 500, emphasis 600 | Carbon, Atlassian, and Vercel Geist all expose a 3-step weight scale rooted at 400/500/600; reconciles K1 to PRINCIPLES.md:186 | S17 S22 S29 | partial | ast: any `font-weight: \d+` outside {400, 500, 600} flagged |
| Input font-size on mobile | inherits 14px | 16px minimum on input/textarea/select at viewport <= 768px | iOS Safari zooms inputs below 16px on focus; Apple HIG, MDN, WebAIM all document this | S11 S43 S45 | partial | ast: `input,textarea,select` lacking `text-base` or `text-[16px]` at mobile breakpoint |
| Tabular numerals on numeric data | not enforced | apply `font-variant-numeric: tabular-nums` on tables and numeric KeyValue contexts | Apple HIG, Material 3 and Carbon all require tabular figures for column alignment | S11 S2 S17 | partial | regex: `/(KeyValue\|<td)/` near digit-only text content lacking `tabular-nums` class |
| Font families | Geist + Geist Mono | no change | Vercel Geist plus shadcn/ui ecosystem plus Carbon all support a sans + mono pair | S29 S49 S17 | no | - |

Disagreements: see Appendix B.2.

---

## Color & Dark Mode

Token group: surface ladder, text tokens, accents, borders. Map to K6 rules `design/no-hardcoded-color`, `design/no-raw-tailwind-color`. Consumed by K7.

### Findings

Best-in-class dark themes ship at least 4 surface levels for elevation (Material 3 surface-container family, Apple HIG four system materials, Carbon `layer-01..03`+background, Atlassian elevation tokens). HyperIdle ships 7 levels plus surface-ghost — already exceeds the cross-system minimum.

Pure black (#000) is avoided by every productivity-tool dark theme. Material anchors at #1C1B1F; Carbon at #161616 (g100); Apple lifts content surfaces off true black. HyperIdle's #111113 sits inside this band.

Contrast: WCAG 2.1 AA (4.5:1 normal text, 3:1 large text) is the universal compliance target. AAA (7:1) is recommended where possible; APCA is a draft replacement (W3C Silver / WCAG 3) and not normative. HyperIdle's text-lo at 4.5:1 against surface-0 meets AA.

The monochrome status philosophy (warn/ok as gray, only danger as red) is a project decision — sources do not converge on this rule. Carbon, Material, and Atlassian all ship chromatic warning palettes. The recommendation preserves HyperIdle's choice as `no change` because removing chromatic warn/ok is a deliberate aesthetic stance, not a researched mandate.

See `research/color-dark.md`.

### Recommendations

| Token | Current value | Recommended value | Rationale | Sources | Lintable | Lint hint |
|---|---|---|---|---|---|---|
| Dark base surface | #111113 | no change | All productivity dark themes lift base off pure black; current value sits in the cross-system band (Material, Carbon, Apple HIG) | S3 S18 S13 | yes | regex: `/background(-color)?\s*:\s*#000(000)?\b/` |
| Surface ladder count | 7 levels | no change | 4-level cross-system minimum already exceeded (Material, Carbon, Atlassian) | S3 S18 S23 | no | - |
| Surface temperature | cool-neutral (current `#111113` measures slightly cool in OKLCH) | hold cool-neutral (designer-call) | Linear ships warm-neutral, Apple HIG documents a slight warm tint, Carbon ships cool — no 3-source consensus on warm-vs-cool. HyperIdle holds cool to keep contrast crisp on data-dense surfaces (designer-call: cool wins on legibility for code/IDs) | S13 S18 S23 | no | - |
| Text contrast floor | 4.5:1 (text-lo) | no change | WCAG 2.1 AA is the universal compliance target; APCA is draft (Material, Carbon both ship AA) | S37 S3 S18 | partial | ast: text token contrast against surface ≥ 4.5:1, computed at lint time via WCAG-pair check |
| Status colors (warn/ok monochrome) | gray | no change | Project-specific philosophy; reference systems disagree (Carbon, Material, Atlassian all chromatic) | S18 S4 S23 | no | - |
| Border tier count | 3 (subtle/default/emphasis) | no change | Matches Carbon border-subtle ladder, Atlassian border tokens, Material outline pair | S18 S24 S4 | no | - |
| Pure-black halation guard | text-hi #ededef on #111113 | no change | Apple HIG, Material 3 and Carbon warn against pure-black halation; current pairing avoids it | S13 S3 S18 | yes | regex: `/background(-color)?\s*:\s*#000000\b/` |
| Elevation feedback (hover / focus / pressed) | not codified | hover surface delta = +1 ladder step; focus-ring 2px outset using `--primary` at 60% opacity; pressed = -1 ladder step (designer-call) | Material 3, Apple HIG and Atlassian all ship per-state surface deltas but quote different values; HyperIdle picks ±1 ladder step + 2px focus ring as the consistent productivity baseline (designer-call: ±1 step is the cross-system midpoint) | S6 S10 S25 | partial | ast: interactive primitives must define `:hover`, `:focus-visible`, `:active` selectors with surface delta or focus-ring tokens |
| Raw Tailwind color usage | not enforced | no change at token level; K6 sub-rule blocks in component code (see Appendix B.3) | Carbon, Material 3 and Atlassian all require named semantic color tokens; existing tokens.css already enforces this in the design system | S18 S4 S23 | yes | regex: `/\b(text\|bg\|border)-(red\|blue\|green\|yellow\|indigo\|purple\|violet\|fuchsia\|pink\|emerald\|sky\|amber\|rose\|orange\|lime\|teal\|cyan)-\d{3}\b/` |

Disagreements: see Appendix B.3.

---

## Borders/Radii/Shadows

Token group: `--r0..r3`, `--r-pill`, border tokens, `--float`. Map to K6 rules `design/no-off-scale-radius`, `design/no-ai-aesthetic`. Consumed by K7.

### Findings

Productivity-tool radius scales converge on 0/4/8/12 with a pill option. Material 3 shape tokens (extra-small 4dp / small 8dp / medium 12dp / large 16dp / extra-large 28dp / full), Atlassian (`100`=4 / `200`=8 / `300`=12 / `400`=16 / circle), and shadcn/ui (`--radius` default `0.625rem` = 10px per the current `globals.css` template at S49) all sit inside 0-16. HyperIdle's `--r0..r3` (0/4/8/12) matches the productivity sub-band exactly. The 16px+ radii (Material extra-large, Tailwind `rounded-2xl`) are reserved for "expressive" surfaces; using them on productivity primitives is one of the strongest AI-aesthetic tells (see Section 7).

Dark-mode shadow is inadequate by itself; tonal layering carries elevation. Material 3, Atlassian, and Carbon all document this. HyperIdle's 7-level surface ladder already implements tonal layering. Float shadows are reserved for overlay surfaces (modals, popovers); HyperIdle's `--float` token isolates this case.

Border opacity vs solid: 3-of-4 reference systems use solid borders derived from the surface palette. HyperIdle uses opacity. Both approaches work; the difference is implementation detail.

See `research/borders-radii-shadows.md`.

### Recommendations

| Token | Current value | Recommended value | Rationale | Sources | Lintable | Lint hint |
|---|---|---|---|---|---|---|
| Radius scale | 0/4/8/12 + pill | no change | Material 3, Atlassian, Carbon converge on 0/4/8/12 productivity sub-band | S5 S24 S18 | yes | regex: `/\brounded-\[(\d+)px\]/` allowlist `{0,4,8,12,9999}` |
| `rounded-2xl` and above | not blocked | no change at token level; K6 sub-rule blocks in component code (see Appendix B.4) | Material 3, Carbon, shadcn/ui all reserve >=16px radii for expressive surfaces; AI-aesthetic critique consensus | S5 S18 S48 | yes | regex: `/\brounded-(2xl\|3xl)\b/` (allow `rounded-full`) |
| Dark-mode shadow tier | `--float` only | no change | Material 3, Atlassian and Carbon all rely on tonal layering; no new shadow tier supported by 3-source consensus | S6 S25 S18 | no | - |
| Border opacity vs solid | opacity 3-tier | no change | 3-of-4 systems use solid; HyperIdle's opacity approach is functionally equivalent and adapts across the surface ladder | S18 S24 S6 | no | - |
| Float shadow on overlays | `--float` token | no change | Material 3, Atlassian and Tailwind all isolate overlay shadow from card shadow | S6 S25 S33 | partial | ast: components matching `/Modal\|Dialog\|Popover\|Tooltip/` must reference `var(--float)` in their root style |
| `shadow-lg`/`-xl` cards | not blocked | no change at token level; K6 sub-rule restricts to overlay surfaces (see Appendix B.4) | Material 3, Atlassian, Tailwind all reserve heavy shadow for overlays only | S6 S25 S33 | yes | regex: `/\bshadow-(lg\|xl\|2xl)\b/` outside files matching `/Modal\|Dialog\|Popover\|Tooltip/` |

Disagreements: see Appendix B.4.

---

## Motion

Token group: `--motion-fast`, `--motion-medium`, `--motion-slow`. Map to K6 rules `design/no-off-scale-motion`. Consumed by K7.

### Findings

Three duration tiers cover almost all UI motion: micro-interactions at 70-150ms, disclosure/state at 150-300ms, overlay open/close at 250-400ms. Material 3 (short1-medium4 tokens), IBM Carbon (`fast-01` 70ms through `slow-01` 400ms) and Atlassian (small 100 / medium 200 / large 400) all converge on this banding. Anything over 400ms is exceptional. HyperIdle's 80/150/250 sits inside the bands on each tier.

`prefers-reduced-motion` honoring is mandatory across MDN, WCAG SC 2.3.3, and all three design-system motion docs. Animated property restriction to `transform` + `opacity` (no layout-triggering animations) is also universally documented.

Easing curves are bespoke per system but disagree on the specific cubic-bezier value, so no 3-source consensus exists for a HyperIdle curve. CSS `ease` default stays.

See `research/motion.md`.

### Recommendations

| Token | Current value | Recommended value | Rationale | Sources | Lintable | Lint hint |
|---|---|---|---|---|---|---|
| `--motion-fast` | 80ms | no change | All three systems (Material, Carbon, Atlassian) place micro-interactions in 70-150ms | S7 S20 S26 | yes | regex: `/\bduration-\[(\d+)ms\]/` allowlist `{80,150,250}` |
| `--motion-medium` | 150ms | no change | Inside disclosure-state band 150-300ms across Material, Carbon, Atlassian | S7 S20 S26 | yes | regex: `/\bduration-\[150ms\]/` |
| `--motion-slow` | 250ms | no change | Inside overlay band 250-400ms across Material, Carbon, Atlassian | S7 S20 S26 | yes | regex: `/\bduration-\[250ms\]/` |
| Easing curve | CSS `ease` | `cubic-bezier(0.2, 0, 0, 1)` (designer-call) | Material standard-easing, Carbon `productive-easing`, and Atlassian medium-curve all use a similar in-out bezier but disagree on exact control points; HyperIdle picks Material's standard curve as the cluster anchor (designer-call: tie-break in favor of the most-cited curve) | S7 S20 S26 | yes | regex: `/cubic-bezier\(0\.2,\s*0,\s*0,\s*1\)/` admitted; bare `ease` flagged in tokens.css |
| Reduced-motion media block | absent in tokens.css | add `@media (prefers-reduced-motion: reduce)` block in tokens.css that sets `--motion-fast/medium/slow: 1ms` and disables `skeleton-pulse` keyframe | MDN, WCAG SC 2.3.3 and Material 3 mandate respect for reduced-motion; tokens.css currently has zero such block | S42 S41 S8 | yes | regex: `tokens.css` must contain `@media\s*\(prefers-reduced-motion:\s*reduce\)` block |
| `prefers-reduced-motion` honoring (component-level) | not enforced at lint | K6 sub-rule requires component animations to inherit reduced-motion via tokens (see Appendix B.5) | MDN, WCAG SC 2.3.3 and Material 3 mandate respect for reduced-motion | S42 S41 S8 | partial | ast: any file declaring `transition:` or `animation:` not via `var(--motion-*)` flagged |
| Animated property allowlist | not enforced | restrict to `transform`, `opacity`, `filter`, `backdrop-filter` only | Material 3, Carbon and Atlassian all warn against layout-triggering animations | S8 S19 S26 | partial | regex: `/\btransition-(width\|height\|top\|left\|right\|bottom\|margin\|padding\|inset)\b/` flagged |

Disagreements: see Appendix B.5.

---

## Mobile & Touch

Token group: viewport breakpoints (new), auto-density behavior (new), touch-target floor. Map to K6 rules `design/require-mobile-input-size`, `design/require-touch-target-min`. Consumed by K7.

### Findings

The cross-system touch-target floor is **44 CSS pixels** (Apple HIG, WCAG 2.1 SC 2.5.5 AAA). Material 3 specifies a slightly higher 48 dp minimum on Android. WCAG 2.2 SC 2.5.8 (AA) drops the floor to 24 CSS px when targets are spaced apart. The recommended HyperIdle floor is 44 CSS px — the cross-platform value.

Breakpoint conventions converge near **768 px** for the mobile/tablet boundary (Tailwind `md` 768px, Bootstrap `md` 768px, Material's medium window-size class). The tablet/desktop boundary sits at **1024 px** (Tailwind `lg`).

Three independent organizations support **viewport-driven density adjustment**: Google (Material 3 window-size classes), Apple (HIG Compact size class on iOS), and IBM (Carbon 2x-grid responsive guidance, S51). The recommendation: at viewport <= 1024 px, auto-switch `[data-density]` to `comfortable` so paddings and row heights expand to provide 44 px+ touch targets. When the user has explicitly chosen a density in Settings, the explicit choice wins over the auto-switch. The contract is a tri-state preference: `auto | default | compact | comfortable`. `auto` is the factory value and the only state that fires the viewport switch; once the user picks a non-`auto` value in Settings, it persists across breakpoints.

Mobile body type: inputs at viewport <= 768 px must use a font-size of at least 16px to prevent iOS Safari from auto-zooming on focus. Non-input body type can stay 14-15 px (the comfortable density preset already sets `--density-text` to 15 px).

See `research/mobile-touch.md`.

### Recommendations

| Token | Current value | Recommended value | Rationale | Sources | Lintable | Lint hint |
|---|---|---|---|---|---|---|
| Minimum touch target | not codified | 44 CSS px on every interactive element at viewport <= 1024 px | WCAG 2.5.5 AAA + Apple HIG converge on 44; Material 48 exceeds it | S39 S12 S9 | partial | ast (lint): `JSXElement[name=/^(button\|a)$/]` className lacking `min-h-\[44px\]\|h-\[44px\]\|min-h-11\|h-11`; (E2E): Playwright assertion that `box.height >= 44` at viewport 768 |
| Mobile breakpoint | implicit Tailwind `md` 768px | codify 768px as mobile/tablet boundary, 1024px as tablet/desktop | Tailwind, Bootstrap, Material window-size classes all converge near 768px; 1024px is the desktop floor | S31 S36 S1 | yes | regex: `/@media\s*\(min-width:\s*(768\|1024)px\)/` allowlisted |
| Auto-density behavior | none | `[data-density="comfortable"]` at viewport <= 1024 px when Settings preference is `auto` | Three independent organizations (Google, Apple, IBM) map viewport class to density: Material window-size classes, Apple HIG Compact mode, Carbon 2x-grid responsive guidance | S1 S10 S51 | partial | ast: AppShell hook reads `(window.innerWidth <= 1024)` AND `settings.density === 'auto'` then sets `[data-density="comfortable"]` |
| Density preference state | implicit | tri-state Settings value (`auto`, `default`, `compact`, `comfortable`); `auto` is factory default and the only state that fires the viewport switch | Without a tri-state, "user picked default" is indistinguishable from "user has not chosen", so the auto-switch can never fire after first preference write | S1 S10 S51 | partial | ast: settings store schema must declare `density` as union of `auto`, `default`, `compact`, `comfortable` |
| Mobile input font-size | inherits 14px | 16 px on `input`, `textarea`, `select` at viewport <= 768 px | iOS Safari zoom mitigation cited across Apple HIG, MDN, WebAIM | S11 S43 S45 | yes | regex: `/<(input\|textarea\|select)[^>]*className=[^>]*>/` lacking `text-base\|text-\[16px\]\|md:text-sm` |
| Touch target spacing | not codified | 8 px minimum between touch targets at mobile | Material 3, WCAG 2.5.8 and Apple HIG all require non-overlapping touch targets | S9 S40 S10 | no | - |

Disagreements: see Appendix B.6.

---

## AI-Aesthetic Anti-Patterns

Map to K6 rule `design/no-ai-aesthetic`. Consumed by K6 (lint sub-rules) and K7 (component sweep targets).

> **Supersedes the AI Aesthetic Blacklist in `PRINCIPLES.md`.** This catalog is the canonical list. The shorter table in `PRINCIPLES.md:156` will be reduced to a pointer to this section by K5 — until then, expect the two to overlap, and treat this catalog as authoritative.

### Findings

LLM-generated UI defaults to a recognizable visual signature: oversized rounded corners, indigo-purple gradient backgrounds, generous padding, hero sections, centered content, glass morphism, and identical 3-column card grids. These tells appear in v0 outputs, in unrefined ChatGPT/Claude generations, and in the early outputs of every coding agent that hasn't been steered toward productivity-tool defaults. The countermeasures shipped by mature AI design tools (shadcn/ui's closed `--radius`, Geist's monochrome-first typography, Radix's accessible primitives) explicitly remove these defaults.

The HyperIdle anti-pattern catalog below is the source for the K6 `design/no-ai-aesthetic` rule. Each item lists what to avoid and the corrective pattern.

### Predictive rubric — split by detectability

Tells fall into two buckets: **screenshot-detectable** (visible to a vision reviewer with no source access) and **code-detectable** (require DOM/CSS access). Only the screenshot-detectable tells count against the 3-tell threshold for "this is an AI-aesthetic artifact." Code-detectable tells are linted by K6 directly.

- **Screenshot-detectable** (use these for the 3+ rubric): #1 rounded-2xl everywhere, #2 indigo/purple gradients, #4 hero sections, #5 emoji as iconography, #7 glass morphism / backdrop-blur, #10 shadow-lg/xl on cards, #13 gradient-on-text, #14 full-bleed accent nav, #15 over-iconification.
- **Code-detectable** (lint-only, do not contribute to screenshot rubric): #3 oversized padding, #6 centered everything, #8 Inter / system-ui only, #9 3-column identical card grid, #11 Lorem ipsum placeholder, #12 marketing copy.

### Anti-pattern catalog

The following list contains 15 catalogued tells. Three or more **screenshot-detectable** tells in a single screenshot is the threshold for the predictive checklist (see `research/ai-aesthetic.md`) to flag the artifact as AI-aesthetic.

- **`rounded-2xl` everywhere.** Avoid: 16 px+ corner radius on cards/buttons/badges. Correct: closed productivity radius scale `r0/r1/r2/r3` (0/4/8/12 px); reserve `rounded-full` for pill shapes only.
- **Indigo / purple gradient backgrounds.** Avoid: `bg-gradient-to-r from-indigo-500 to-purple-500` and friends. Correct: flat surface tokens; gradients must be earned by a specific design rationale.
- **`p-8` / `p-12` oversized padding.** Avoid: 32-48 px internal padding on every card. Correct: density tokens (`--density-pad-x`, `--density-pad-y`) — productivity defaults sit at 8-16 px.
- **Hero sections in productivity tools.** Avoid: full-width centered title + subtitle + CTA group at the top of an internal tool. Correct: ToolbarHeader / NavRail patterns; productivity tools have no heroes.
- **Emoji as iconography.** Avoid: leading emoji in nav items, status chips, button labels. Correct: vector icon set (Lucide / Tabler / system); HyperIdle uses Lucide.
- **Centered everything.** Avoid: page-level `text-center` and `mx-auto` on body content. Correct: left-align text and content; center only for modal headers and EmptyState.
- **Glass morphism / `backdrop-blur` on cards.** Avoid: translucent + blurred surfaces as the default card chrome. Correct: solid surfaces from the 7-level surface ladder.
- **Inter / system-ui as the only font.** Avoid: a single sans family with no mono differentiation. Correct: Geist + Geist Mono; mono signals data, IDs, timestamps.
- **3-column identical card grid.** Avoid: `grid-cols-3` with mapped identical children regardless of content variance. Correct: real component layouts (List, Kanban, Board) tuned to the data shape.
- **`shadow-lg` / `shadow-xl` on cards.** Avoid: heavy drop shadow on every card. Correct: tonal layering via the surface ladder; reserve heavy shadow for the `--float` overlay token.
- **Lorem ipsum / generic placeholder text.** Avoid: "Lorem ipsum...", "Click here", "Submit". Correct: realistic content matching the actual use case.
- **Marketing copy on internal tools.** Avoid: "Effortless", "Seamless", "Powerful", "Beautiful", "Stunning", "Game-changing" headings. Correct: literal task labels ("Pitch review", "Threads", "Knowledge").
- **Gradient-on-text.** Avoid: `bg-gradient-to-r from-* to-* bg-clip-text text-transparent` for headings or page titles. Correct: solid `--text-hi`; gradients on text are decoration without information.
- **Full-bleed colored accent navigation.** Avoid: nav rails that paint the entire column with a brand or accent color (purple/indigo/teal sidebar). Correct: `--surface-1` rail with selected-item indicator only — color is information, not chrome.
- **Over-iconification.** Avoid: every row carrying a Lucide icon, every chip carrying a leading icon, every label carrying a trailing chevron. Correct: icons earn their place — use them when they carry information, not as decoration. Productivity rows often have zero icons.

### Recommendations

| Token | Current value | Recommended value | Rationale | Sources | Lintable | Lint hint |
|---|---|---|---|---|---|---|
| #1 `rounded-2xl` / `rounded-3xl` use | not blocked | block in component files (K6 sub-rule) | Material 3, Carbon, shadcn/ui all reserve >=16 px radii for expressive surfaces | S5 S18 S48 | yes | regex: `/\brounded-(2xl\|3xl)\b/` (allow `rounded-full` for pills) |
| #2 Indigo / purple gradient backgrounds | not blocked | block in productivity components | Tailwind, Refactoring UI, shadcn/ui all flag indigo-purple gradient as AI-default | S33 S47 S48 | yes | regex: `/\bbg-gradient-(to\|from\|via)-(indigo\|purple\|violet\|fuchsia\|pink)-\d{3}\b/` |
| #3 `p-8` / `p-12` oversized padding | not blocked | restrict to hero/expressive contexts | Productivity defaults (Carbon, Atlassian, Material) sit at 8-16 px | S16 S21 S1 | yes | regex: `/\b(p\|px\|py)-(8\|10\|12\|14\|16)\b/` |
| #4 Hero section pattern | not blocked | forbid in `packages/web/src/pages/work/**` | Refactoring UI, Carbon, Material 3 all separate productivity chrome from hero treatments | S47 S18 S5 | partial | ast: `JSXElement[name=/^section$/]` containing className matching `/text-(4xl\|5xl\|6xl)/` AND `/text-center/` |
| #5 Emoji as iconography | not blocked | forbid in NavItem / Button / StatusChip text nodes | Carbon, Material 3, Refactoring UI all use vector icon sets | S17 S2 S47 | partial | regex: `/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u` matching leading character of any text node child of `Button\|NavItem\|StatusChip` |
| #6 Centered everything | not blocked | block page-level `text-center` and `mx-auto` on body content | Refactoring UI, Carbon, Polaris all default to left-aligned productivity layouts | S47 S17 S28 | partial | regex: `/\btext-center\b/` flagged outside `EmptyState\|Modal\|Dialog\|Toast` parents |
| #7 Glass morphism / backdrop-blur | not blocked | block in productivity components | Material 3, Carbon, shadcn/ui all default to solid surfaces in productivity contexts | S3 S18 S48 | yes | regex: `/\bbackdrop-(blur\|filter)/` and `/\bbg-(white\|black)\/\d+/` |
| #8 Inter / system-ui only | not blocked | require both `--ui` (sans) and `--mono` font stacks declared | Vercel Geist, Carbon and shadcn/ui all ship sans+mono pairs | S29 S17 S49 | partial | ast: tokens.css must declare both `--ui` and `--mono` font tokens; component-level inline `font-family: Inter, system-ui` flagged |
| #9 3-column identical card grid | not blocked | block `grid-cols-3` with `.map(` on identical card children outside known dashboard contexts | Refactoring UI, Carbon and Polaris all warn against decorative-grid patterns on productivity surfaces | S47 S17 S28 | partial | regex: `/grid-cols-3[^"]*gap-(6\|8\|10\|12)/` near `\.map\(` |
| #10 `shadow-lg` / `shadow-xl` cards | not blocked | restrict to `--float` overlay surfaces | Material 3, Atlassian, Tailwind all reserve heavy shadow for overlays only | S6 S25 S33 | yes | regex: `/\bshadow-(lg\|xl\|2xl)\b/` outside files matching `/Modal\|Dialog\|Popover\|Tooltip/` |
| #11 Lorem ipsum / placeholder text | not blocked | block in committed source | Refactoring UI, Polaris and Atlassian content guidelines all warn against placeholder copy in shipped product | S47 S28 S22 | yes | regex: `/\b(Lorem ipsum\|consectetur adipiscing\|Click here)\b/i` |
| #12 Marketing copy in product chrome | not blocked | forbid superlative copy in product chrome | Refactoring UI, Carbon and Polaris all differentiate product chrome from marketing copy | S47 S17 S28 | partial | regex: `/>\s*(Effortless\|Seamless\|Powerful\|Beautiful\|Stunning\|Game-changing)\b/` in JSX text nodes |
| #13 Gradient-on-text | not blocked | block `bg-clip-text text-transparent` with gradient backgrounds in headings | Refactoring UI, Apple HIG and Carbon all reserve gradient-on-text for marketing surfaces, not product chrome | S47 S11 S17 | yes | regex: `/\bbg-clip-text\b[^"]*\btext-transparent\b/` or vice-versa |
| #14 Full-bleed colored accent nav | not blocked | nav rail background must be `--surface-1` (no accent fill) | Material 3, Carbon and Atlassian navigation guidance all use neutral surfaces with selected-item indicators only | S4 S18 S23 | partial | ast: `NavRail\|Sidebar` root className must not match `/\bbg-(indigo\|purple\|teal\|emerald\|sky\|violet)-\d{3}\b/` |
| #15 Over-iconification | not blocked | NavItem / KeyValue / row primitives must allow zero-icon variants; reject leading icon on every row | Refactoring UI, Carbon and Polaris all warn against decorative iconography in dense lists | S47 S17 S28 | partial | ast: list-row primitive components must accept `icon` as optional and not render a placeholder when omitted |

Disagreements: see Appendix B.7.

---

## Appendix A — Source register

Each entry: id, title, organization, URL, date accessed (verified live via `curl -I` 2026-04-25).

- [S1] Material Design 3 — Layout / window size classes — Google — https://m3.material.io/foundations/layout/applying-layout/window-size-classes — accessed 2026-04-25
- [S2] Material Design 3 — Type scale tokens — Google — https://m3.material.io/styles/typography/type-scale-tokens — accessed 2026-04-25
- [S3] Material Design 3 — Color system overview — Google — https://m3.material.io/styles/color/system/overview — accessed 2026-04-25
- [S4] Material Design 3 — Color roles — Google — https://m3.material.io/styles/color/roles — accessed 2026-04-25
- [S5] Material Design 3 — Shape — Google — https://m3.material.io/styles/shape — accessed 2026-04-25 (replaces dead `/styles/shape/overview`)
- [S6] Material Design 3 — Elevation overview — Google — https://m3.material.io/styles/elevation/overview — accessed 2026-04-25
- [S7] Material Design 3 — Motion easing & duration tokens — Google — https://m3.material.io/styles/motion/easing-and-duration/tokens-specs — accessed 2026-04-25
- [S8] Material Design 3 — Motion overview — Google — https://m3.material.io/styles/motion/overview — accessed 2026-04-25
- [S9] Material Design 3 — Accessible design — Google — https://m3.material.io/foundations/accessible-design — accessed 2026-04-25 (replaces dead `/accessible-design/accessibility-basics`)
- [S10] Apple Human Interface Guidelines — Layout — Apple — https://developer.apple.com/design/human-interface-guidelines/layout — accessed 2026-04-25
- [S11] Apple Human Interface Guidelines — Typography — Apple — https://developer.apple.com/design/human-interface-guidelines/typography — accessed 2026-04-25
- [S12] Apple Human Interface Guidelines — Buttons (44pt touch) — Apple — https://developer.apple.com/design/human-interface-guidelines/buttons — accessed 2026-04-25
- [S13] Apple Human Interface Guidelines — Dark Mode — Apple — https://developer.apple.com/design/human-interface-guidelines/dark-mode — accessed 2026-04-25
- [S14] Apple Human Interface Guidelines — Color — Apple — https://developer.apple.com/design/human-interface-guidelines/color — accessed 2026-04-25
- [S15] Apple Human Interface Guidelines — Motion — Apple — https://developer.apple.com/design/human-interface-guidelines/motion — accessed 2026-04-25
- [S16] IBM Carbon — Spacing — IBM — https://carbondesignsystem.com/elements/spacing/overview/ — accessed 2026-04-25
- [S17] IBM Carbon — Typography overview — IBM — https://carbondesignsystem.com/guidelines/typography/overview/ — accessed 2026-04-25
- [S18] IBM Carbon — Color overview — IBM — https://carbondesignsystem.com/elements/color/overview/ — accessed 2026-04-25
- [S19] IBM Carbon — Motion overview — IBM — https://carbondesignsystem.com/guidelines/motion/overview/ — accessed 2026-04-25
- [S20] IBM Carbon — Motion basics (durations) — IBM — https://carbondesignsystem.com/guidelines/motion/basics/ — accessed 2026-04-25
- [S21] Atlassian Design — Spacing — Atlassian — https://atlassian.design/foundations/spacing — accessed 2026-04-25
- [S22] Atlassian Design — Typography (beta) — Atlassian — https://atlassian.design/foundations/typography-beta — accessed 2026-04-25
- [S23] Atlassian Design — Color — Atlassian — https://atlassian.design/foundations/color-new — accessed 2026-04-25
- [S24] Atlassian Design — Border — Atlassian — https://atlassian.design/foundations/border — accessed 2026-04-25
- [S25] Atlassian Design — Elevation — Atlassian — https://atlassian.design/foundations/elevation — accessed 2026-04-25
- [S26] Atlassian Design — Motion — Atlassian — https://atlassian.design/foundations/motion — accessed 2026-04-25
- [S27] Shopify Polaris — Space tokens — Shopify — https://polaris.shopify.com/tokens/space — accessed 2026-04-25
- [S28] Shopify Polaris — Typography — Shopify — https://polaris.shopify.com/design/typography — accessed 2026-04-25
- [S29] Vercel Geist — Introduction — Vercel — https://vercel.com/geist/introduction — accessed 2026-04-25
- [S30] Tailwind CSS — Customizing spacing — Tailwind Labs — https://tailwindcss.com/docs/customizing-spacing — accessed 2026-04-25
- [S31] Tailwind CSS — Responsive design / breakpoints — Tailwind Labs — https://tailwindcss.com/docs/responsive-design — accessed 2026-04-25
- [S32] Tailwind CSS — Border Radius — Tailwind Labs — https://tailwindcss.com/docs/border-radius — accessed 2026-04-25
- [S33] Tailwind CSS — Box Shadow — Tailwind Labs — https://tailwindcss.com/docs/box-shadow — accessed 2026-04-25
- [S34] Tailwind CSS — Padding — Tailwind Labs — https://tailwindcss.com/docs/padding — accessed 2026-04-25
- [S35] Tailwind CSS — Transition Duration — Tailwind Labs — https://tailwindcss.com/docs/transition-duration — accessed 2026-04-25
- [S36] Bootstrap 5 — Breakpoints — Bootstrap — https://getbootstrap.com/docs/5.3/layout/breakpoints/ — accessed 2026-04-25
- [S37] WCAG 2.1 — SC 1.4.3 Contrast (Minimum) — W3C — https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html — accessed 2026-04-25
- [S38] WCAG 2.1 — SC 1.4.6 Contrast (Enhanced) — W3C — https://www.w3.org/WAI/WCAG21/Understanding/contrast-enhanced.html — accessed 2026-04-25
- [S39] WCAG 2.1 — SC 2.5.5 Target Size — W3C — https://www.w3.org/WAI/WCAG21/Understanding/target-size.html — accessed 2026-04-25
- [S40] WCAG 2.2 — SC 2.5.8 Target Size (Minimum) — W3C — https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html — accessed 2026-04-25
- [S41] WCAG 2.1 — SC 2.3.3 Animation from Interactions — W3C — https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html — accessed 2026-04-25
- [S42] MDN — `prefers-reduced-motion` — Mozilla — https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion — accessed 2026-04-25
- [S43] MDN — font-size — Mozilla — https://developer.mozilla.org/en-US/docs/Web/CSS/font-size — accessed 2026-04-25
- [S44] MDN — Viewport meta — Mozilla — https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag — accessed 2026-04-25
- [S45] WebAIM — Fonts (body text size) — WebAIM — https://webaim.org/techniques/fonts/ — accessed 2026-04-25
- [S46] Practical Typography — Point size — Matthew Butterick — https://practicaltypography.com/point-size.html — accessed 2026-04-25
- [S47] Refactoring UI — book / blog — Wathan & Schoger — https://www.refactoringui.com/ — accessed 2026-04-25
- [S48] shadcn/ui — Themes — shadcn — https://ui.shadcn.com/themes — accessed 2026-04-25
- [S49] shadcn/ui — Docs / Installation (manual `globals.css` template; `--radius: 0.625rem`) — shadcn — https://ui.shadcn.com/docs/installation/manual — accessed 2026-04-25
- [S50] Radix Primitives — Getting started — WorkOS — https://www.radix-ui.com/primitives/docs/overview/getting-started — accessed 2026-04-25 (replaces dead `/overview/styling`)
- [S51] IBM Carbon — 2x Grid (responsive layout) — IBM — https://carbondesignsystem.com/elements/2x-grid/overview/ — accessed 2026-04-25

## Appendix B — Disagreement log

- **B.1 Spacing.** Carbon allows spacing-01 (2px) sub-grid; Polaris caps at 4px steps; Atlassian splits the difference with space.025 (2px) for fine adjustment. Resolution: 4px hard rule, 2px allowlisted only inside chips and icon paddings.
- **B.2 Typography.** 14px (Carbon, Polaris, Linear, Atlassian) vs 16px (Material body-large) for body. Productivity-tool consensus wins for the default density; comfortable density already covers the 15-16 region.
- **B.3 Color.** Apple HIG permits true black on OLED; Material/Carbon explicitly avoid. HyperIdle aligns with Material/Carbon. The "raw Tailwind color" recommendation is held at "no change" at the token level because the token system already enforces semantic colors; the K6 sub-rule will guard component code separately.
- **B.4 Borders.** 3-of-4 systems use solid border colors; HyperIdle uses opacity (implementation difference). The `rounded-2xl` and `shadow-lg` rows are held at "no change" at the token level; K6 lint sub-rules will block them in component code citing the same three sources.
- **B.5 Motion.** Each system defines its own cubic-bezier curve; no 3-source consensus on a specific value. Recommendation `no change` for easing. The `prefers-reduced-motion` and animated-property-allowlist rows are held at "no change" at the token level; K6 lint sub-rules will enforce them.
- **B.6 Mobile.** Touch target floor 44 (Apple/WCAG) vs 48 (Material). Recommendation locks to 44 as the cross-platform floor; Material's 48 is permissive (a 44-px element passes Material too).
- **B.7 AI-aesthetic.** Some critics defend `rounded-2xl` as a deliberate aesthetic; productivity systems disagree. HyperIdle locks to productivity defaults via K6 sub-rules.

## Appendix C — Per-topic research reports

- `research/foundation.md` — Phase 0 current-state inventory consumed by every section.
- `research/reference-systems-matrix.md` — Cross-system matrix used as a quick lookup by the per-topic reports.
- `research/spacing-density.md` — Section 1 backing research.
- `research/typography.md` — Section 2 backing research.
- `research/color-dark.md` — Section 3 backing research.
- `research/borders-radii-shadows.md` — Section 4 backing research.
- `research/motion.md` — Section 5 backing research.
- `research/mobile-touch.md` — Section 6 backing research.
- `research/ai-aesthetic.md` — Section 7 backing research.
- `research/ai-design-agents.md` — Cross-cutting survey of AI design agents (shadcn/ui, v0, Geist).
- `research/density-audit.md` — K10 per-component density-aware audit; spec for K11. Appendix D below mirrors its matrix in tabular form.

## Appendix D — Density-Aware Component Matrix (K10 / K11)

The full per-component reasoning (axis-by-axis verdicts, citations, "stays literal — and why" rationales) lives in `packages/design-system/research/density-audit.md`. That file is the **canonical source of truth** for what scales and what stays literal; this appendix is the AESTHETICS.md entry point so a downstream agent can answer "should `BetCard` body text scale?" without leaving this document.

The opt-out manifest at `packages/eslint-plugin-design/density-allowlist.json` is generated from this matrix. The `design/use-density-tokens` and `design/no-density-tokens` lint rules read it at run-time and refuse to lint when the manifest contradicts itself (a component is in exactly one bucket).

### D.1 Density-aware components (consume `var(--density-*)`)

The `design/use-density-tokens` rule errors (in `packages/design-system/src/**`) or warns (in `packages/web/src/**`) when these components have literal pixel padding/gap/font-size on a non-chrome `className`.

| Component | Tier | Axes that scale | Tokens consumed | Literal axes (chrome — see audit § for rationale) |
|---|---|---|---|---|
| NavItem | 1 | min-h, pad-x, pad-y, body text | `--density-row-h`, `--density-pad-*`, `--density-text` | icon, count chip |
| KeyValue | 1 | value font, gap | `--density-text`, `--density-card-gap` | label font, label tracking |
| ThreadRow | 2 | pad-x, pad-y, gap, body text, snippet, avatar | `--density-pad-*`, `--density-gap`, `--density-text`, `--density-avatar-size` | timestamp |
| KnowledgeRow | 2 | pad-x, pad-y, gap, body text | `--density-pad-*`, `--density-gap`, `--density-text` | caption, timestamp, version pill |
| NotificationRow | 2 | pad, gap, body text | `--density-pad-*`, `--density-gap`, `--density-text` | timestamp |
| BetCard | 2 | card-pad, card-gap, row gap, title font | `--density-card-pad`, `--density-card-gap`, `--density-gap`, `--density-text` | progress bar h, progress text, lead avatar (24 px) |
| TaskCard | 2 | card-pad, card-gap, row gap, title font | `--density-card-pad`, `--density-card-gap`, `--density-gap`, `--density-text` | owner font, max-w (320 px Kanban geometry) |
| PitchCard | 2 | card-pad, card-gap, row gap, title font, hypothesis font | `--density-card-pad`, `--density-card-gap`, `--density-gap`, `--density-text` | max-w (320 px PitchSelector budget) |
| EmptyState | 2 | pad-x, pad-y, gap, title font | `--density-pad-x`, `--density-card-pad`, `--density-card-gap`, `--density-text` | description font, alignment (text-left ALWAYS) |
| ErrorState | 2 | pad-x, pad-y, gap, title font | `--density-pad-x`, `--density-card-pad`, `--density-card-gap`, `--density-text` | Retry button (DaisyUI), alignment |
| SkeletonList | 2 | row-h, gap | `--density-row-h`, `--density-gap` | none |
| SkeletonCard | 2 | card-pad, card-gap | `--density-card-pad`, `--density-card-gap` | bar heights (abstract content) |
| Submenu | 3 | page-gutter, gap, inner pad-x | `--density-page-gutter`, `--density-gap`, `--density-pad-x` | width (240 px), header chrome, filter chips |
| Rail (expanded) | 3 | page-gutter, section gap | `--density-page-gutter`, `--density-gap` | width (360 px), section header, pill chrome |
| ArtifactView | 3 | content pad | `--density-card-pad` | diff line h + pad, metadata strip, visual cmp pad, sparkline |
| ReviewHeader | 3 | page-gutter, gap, proposer name | `--density-page-gutter`, `--density-gap`, `--density-text` | timestamp, avatar (24 px chrome), verdict buttons (`btn-xs` ALWAYS — § 5.2), more menu chrome |
| Canvas | 3 | column gap | `--density-gap` | column header, capacity badge, drop-zone min-h, drop-zone pad |
| Kanban | 3 | column gap | `--density-gap` | grid template (1/2/4 cols fixed), column header, group header |
| PitchSelector | 3 | card-pad, section gap, detail-pane pad | `--density-card-pad`, `--density-gap`, `--density-card-gap` | max-h (480 px overlay), header chrome, close + Add-to-canvas buttons |
| WorkPortfolio | page | section gap, card-pad, card-gap | `--density-gap`, `--density-card-pad`, `--density-card-gap` | H1 (uppercase mono), product avatar (24 px), progress bar h |
| WorkBet | page | page-gutter (via main), section gap, comment item pad | `--density-page-gutter` (inherited), `--density-gap`, `--density-card-pad` | breadcrumb, task table (DaisyUI table-xs) |
| KnowledgeDetail | page | page-gutter (via main), body markdown, observation pad | `--density-page-gutter` (inherited), `--density-text`, `--density-card-pad` | metadata bar, section H2, edit textarea, Save/Cancel buttons |

### D.2 Density-static components (forbid `var(--density-*)`)

The `design/no-density-tokens` rule errors when these components consume any `var(--density-*)` token. These surfaces must look the same at every density tier.

| Component | Tier | Why static | Audit § |
|---|---|---|---|
| StatusChip | 1 | Badge-as-callout — Carbon `tag-sm`, Polaris `Badge`, Material 3 `chip-small`. Density toggling badges destroys their as-callout function. | § 3.1.1 |
| Tag | 1 | Same as StatusChip — badge, not text. Free-form labels would visually swell at comfortable. | § 3.1.2 |
| IconRail | 3 | Brand chrome — Material 3 NavRail / Carbon UI Shell / Slack / Linear all fix the nav-rail width. The canonical density-static shell. | § 3.3.K1 + § 5.6 |
| NotFound | page | Error page chrome — user is recovering from a navigation mistake, not reading. | § 3.4.P8 |
