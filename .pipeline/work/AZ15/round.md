# AZ15 — combined measurement, requirements, design, and architecture round

**Status:** founder review required; no production implementation is authorized by this artifact.

**Work package:** AZ15, “Spacing & Elevation” (`M`, `mvp`)

**DOC-CLASS:** `update`. The authoritative UI/design-system references need the approved spacing guidance, exclusions, and elevation meanings. End-user workflow documentation does not change.

## Founder decision in one minute

Approve an existing-vocabulary spacing system expressed as **semantic guidance with ranges**, not a universal exact mapping:

- close relationships: `3–9px`, normally `6–9px`;
- peer groups: `12–18px`;
- major vertical sections: `24–36px`;
- repeated rows: normally contiguous (`0px`) when divider/shape supplies grouping;
- `48px`: exceptional phase/empty-state breathing room, not recurring page rhythm.

Context chooses within a range: use the compact end on dense, one-line, strongly bounded layouts; use the roomy end for multiline content, weak boundary cues, reflowed narrow layouts, or a real task/phase change.

Elevation remains semantic: normal content is flat; selected in-place states use `--shadow-subtle`; bounded working planes/actionable cards use `--shadow-default`; transient/hover-floated surfaces use `--shadow-elevated`.

No new spacing or shadow token is justified. Approval authorizes the proportional lint/migration/test plan below, not an exact-pixel audit of every route.

## 1. Clarified requirement

### Outcome

Across the signed-in product, proximity should communicate relationship before decoration does. Similar relationships should draw from the same small range, while density, content shape, borders, surfaces, and viewport can justify a different rung within that range. A shadow should have one semantic reason to exist.

### Load-bearing definitions

- A **primary surface** is a repeat-use, signed-in route/state that owns the whole Main pane or a durable split-pane destination. Materially different queue/detail states count separately; creation and review count.
- A **section** is a top-level task, phase, or content region below the page header. A major section boundary separates independently meaningful regions.
- A **group** is a related cluster inside a section: field set, stat set, action cluster, or card content phase.
- A **row** is one repeated same-shaped item in a list/table.
- **Close relation** means one element names, qualifies, or completes another: label/control, title/meta, icon/text, value/unit.
- **Elevation** is perceived z-order created by a Hearth shadow. Borders, background fills, focus rings, and subject-authored preview pixels are not elevation.

Primary surfaces exclude redirects, setup/first-run, not-found, and dev-only demos. Transient dialogs/menus/popovers/sheets are not primary surfaces but remain in the elevation and vocabulary audit.

### Acceptance interpretation

| Plan AC | Implementable obligation |
| --- | --- |
| AC1 | Preserve a reproducible shipped census, classified exclusions, representative real-instance review, and controlled visual comparisons. |
| AC2 | Publish the complete range guidance and elevation meanings in this round; do not reduce them to a universal exact ladder. |
| AC3 | Bring shipping Hearth chrome onto the allowed vocabulary and correct measured hierarchy offenders across the affected surface families. Verify representative stable relationships, not exact pixels for every route. |
| AC4 | Related elements must remain visibly closer than unrelated regions. Selection within ranges must cite density/content/boundary context when it is not obvious. |
| AC5 | Raw/off-vocabulary composition spacing and raw shadows fail static verification. Stable shared component contracts fail targeted rendered tests. A valid token does not fail merely because another value in the same guidance range could also work. |

## 2. Evidence and coverage

### Reproducible evidence

Read [`measurement/README.md`](measurement/README.md) first. It indexes:

- `measurement/scripts/spacing-census.mjs` and `measurement/census/` — raw/classified authored usage and cross-tabs;
- `measurement/instances/` — real seeded-app overlay paint and representative rung/problem review;
- `measurement/comparisons/` — six controlled dense/sparse, desktop/narrow comparisons plus metrics;
- route-computed baselines, earlier off-grid findings, shadow sites, and real screenshots.

The in-app browser became unavailable during the revision. Following the design-skill fallback, real app and comparison paint were captured with the repository Playwright runtime and inspected as images. No annotation/approval was inferred from that fallback.

### What counts as shipped coverage

Canonical route ownership in `layers/core-ui/src/router.tsx`, plus Settings' query state and durable split destinations, yields 15 primary surfaces:

1. Conversations queue;
2. Conversation detail;
3. Work overview;
4. Work team;
5. new bet;
6. bet detail;
7. task detail;
8. review;
9. routine detail (direct and split placement);
10. agent profile (direct and split placement);
11. Knowledge list;
12. Knowledge create;
13. Knowledge detail;
14. artifact permalink;
15. Settings Main-pane state.

Every surface has route/source/computed baseline coverage. Populated paint covers dominant queue/detail/team/bet/task/routine/Knowledge families; Settings and overlay paint plus isolated real-structure comparisons cover dense forms, sparse details, narrow reflow, and transient depth. Post-build proof remains family/contract based; route-wide per-surface pixel assertions are excluded.

## 3. Shipped spacing census

The census scans 241 production TS/TSX/CSS files in Core UI and the design system, excluding tests, stories, fixtures, mocks, and dev-only surfaces.

### Classified authored occurrences

| Category | Count | Treatment |
| --- | ---: | --- |
| Likely composition | 754 | Vocabulary and relationship review |
| Padding/inset | 773 | Surface padding measured; AZ7 control and AZ11 geometry exclusions remain |
| Geometry/size/alignment | 667 | Not composition rhythm |
| Control-internal | 263 | AZ7 exclusion; narrow lint handling |
| Authored review-artifact content | 61 | Subject pixels, not Hearth chrome |
| Canvas coordinate | 49 | Coordinate system, not rhythm |
| CSS/native reset | 41 | Default removal, not semantic distance |
| Optical offset | 13 | Narrow visual exception |
| Negative overlap | 8 | Positioning/overlap, not positive rhythm |

Classification is deterministic but heuristic. Structural categories are high confidence; control classification is medium confidence; likely semantic relationships are deliberately low confidence and were checked against paint rather than promoted directly into requirements.

### Likely composition frequency

| Value | Count | Horizontal | Vertical | Finding |
| ---: | ---: | ---: | ---: | --- |
| `0` | 1 authored reset-like occurrence | 0 | 1 | Author count under-represents contiguous layout; real row/list paint is the evidence for zero gap. |
| `1` | 7 | 0 | 7 | Mostly optical baseline candidates; not a composition token. |
| `2` | 10 | 0 | 10 | Mix of optical/control subparts and a few real ultra-tight stacks; classify before migration. |
| `3` | 80 | 22 | 58 | Established micro relationship. |
| `4` | 36 | 13 | 23 | Off vocabulary; many badges/chips/control parts, some legacy composition. |
| `6` | 187 | 99 | 87 | Most common rung; balanced close horizontal and vertical use. |
| `7` | 1 | 0 | 1 | Optical dot alignment. |
| `8` | 46 | 26 | 18 | Main off-vocabulary composition cluster; mostly aliases/raw legacy gaps. |
| `9` | 160 | 103 | 55 | Common close/medium rung, especially inline peers and SectionLabel. |
| `12` | 145 | 53 | 86 | Dominant medium/group and dense-stack rung. |
| `18` | 58 | 8 | 48 | Primarily vertical groups/content phases. |
| `24` | 21 | 5 | 16 | Uncommon but concentrated in Work/Knowledge/Settings outer stacks. |
| `36` | 2 | 0 | 2 | Review Composition phase stack and Setup prose break. |
| `48` | 0 | 0 | 0 | No shipped true-composition use; existing occurrences are padding/geometry. |

`6/9/12` make up 492/754 likely composition occurrences (65%). There are 102 likely off-vocabulary occurrences on 95 unique source lines, dominated by `8` (46) and `4` (36). Review has the most likely composition occurrences (221), then Work (137), design system (111), Settings (86), shared components (80), other Core UI (41), Knowledge (36), Shell (30), and Conversations (12).

Only two likely composition occurrences currently spell a `var(--space-*)` token directly; most valid values are authored as explicit pixel utilities. Requiring variable spelling everywhere would touch roughly 690 unique source lines across 113 files before semantic fixes, so it is a founder scope choice rather than a hidden AZ15 assumption.

## 4. Representative shipped-instance findings

Detailed citations are in [`measurement/instances/README.md`](measurement/instances/README.md).

- **Dense Settings/forms:** `24px` peer-section rhythm works because headings, dividers, and surface fills already mark boundaries. Current `18px` title-to-card distance makes a label look detached from what it names.
- **Sparse details:** Agent/Routine `12px` outer stacks collapse configuration, capabilities, and activity into one group. They need the major-section range.
- **Lists:** contiguous rows plus dividers provide strong dense scanning; extra row whitespace would weaken the list.
- **Horizontal composition:** `6–12px` dominates icon/text, title/status, inline actions, and row parts. `18–24px` is appropriate only for visibly separate stat/column clusters.
- **Overlay:** real `GlobalSearchPanel` paint works at desktop and 760px with its current off-vocabulary `8px` gap, `12px` padding, and elevated shadow. `9px` is the least disruptive vocabulary correction. Fixed panel width is geometry, not AZ15 rhythm.
- **Off-vocabulary `4/8`:** some are genuine legacy composition, while pill/badge/control parts belong to AZ7 exclusions. Nearest-number bulk replacement is unsafe.
- **Optical/canvas/negative values:** dot baselines, review coordinates, alignment indents, and negative transforms must remain separate from composition.
- **Authored artifacts:** email/web-preview subject pixels are excluded; Hearth preview chrome is governed.

## 5. Controlled comparisons and conclusion

Six inspected comparisons in [`measurement/comparisons/SPEC.md`](measurement/comparisons/SPEC.md) hold content, typography, padding, borders, shadows, and other relationships constant.

| Test | Dense result | Sparse/narrow result | Conclusion |
| --- | --- | --- | --- |
| section `24/36` | `24` preserves clear Settings hierarchy and costs 36px less across four sections | `36` makes a weak-cue sparse phase break unmistakable; `24` remains usable with panels/dividers | major sections need `24–36`, not one exact value |
| group `12/18` | `12` keeps consecutive form groups cohesive | `18` helps multiline clusters after narrow reflow | groups need `12–18` |
| close `6/9` | repeated `6` label/control gaps save 24px and pair compact controls more strongly | `9` better connects small-caps labels to larger panels; difference is subtle with dividers | close relationships need `6–9`, with `3` for micro typographic units |

Candidate systems considered:

- **Compact exact:** `6/12/24` works on dense forms but under-expresses sparse phase changes.
- **Roomy exact:** `9/18/36` works on sparse details but compounds scroll and detaches related controls.
- **Guidance ranges (selected):** close `6–9`, groups `12–18`, sections `24–36`, with `3` and `48` reserved for their narrower roles.

The existing scale is adequate. Unequal increments are useful: close relations need 3px discrimination, while hierarchy changes need 6–12px discrimination. A mathematically regular ladder would not improve the rendered surfaces, and no missing intermediate value emerged.

## 6. Spacing guidance contract

These are design guidance ranges. They define good options and escalation questions, not a linter-enforced semantic type system.

### Complete vocabulary

| Value | Suggested meaning and range role | Vertical use | Horizontal use |
| ---: | --- | --- | --- |
| `0` | Continuity/reset | contiguous repeated rows when divider/shape groups them; CSS reset | flush segmented edges, deliberate overlap/reset |
| `3` | Micro, same typographic unit | heading/subtitle micro lead, title/meta when typography already binds them | value/unit, dot/text, very small icon/label where hit areas are unaffected |
| `6` | Compact close relation | compact label/control, support line, title/meta | icon/text, chip parts where not AZ7-internal, tight actions |
| `9` | Default close relation / compact peer spacing | SectionLabel to list/card, multiline support | standard icon/text, compact inline peers/actions |
| `12` | Dense group / standard horizontal peers | consecutive fields, card content clusters | row title/action, standard action group, grid/stat column gap |
| `18` | Roomy group / distinct horizontal cluster | multiline groups, weakly bounded content phases | separate stat/action clusters, wrapping peer groups |
| `24` | Dense major section / compact column separation | top-level peer sections with strong heading/divider/surface cues | separate content columns or page regions (not page gutter ownership) |
| `36` | Roomy major section / task-phase break | sparse sections, weak boundary cues, distinct workflow chapters | rare large column/phase separation where width permits |
| `48` | Exceptional breathing/phase space | hero/empty-state composition or singular major phase transition; never repeated routine page rhythm | rare canvas/hero separation, not ordinary content columns |

### How to choose within a range

Choose the compact end when:

- content is dense or frequently scanned;
- labels and values are one line;
- a divider, surface change, heading, or repeated shape already supplies a boundary;
- the viewport is narrow and extra vertical scroll adds no meaning.

Choose the roomy end when:

- content wraps or has multiple internal lines;
- adjacent groups have independent tasks/meanings;
- boundary cues are weak or intentionally flat;
- a responsive reflow turns horizontal clusters into vertical phases;
- typography changes scale markedly between the two elements.

Horizontal guidance is not the vertical ladder rotated. Baseline alignment, wrapping, available width, and target size matter. Use `3–9` for inline close relations, `9–12` for ordinary peers/actions, `18–24` for distinct clusters/columns, and `36–48` only for rare large layout separation. Do not shrink a control's hit area to achieve a horizontal gap; that is AZ7 territory.

### Anti-patterns and escalation

- Do not use a large gap to compensate for missing heading, divider, or surface hierarchy.
- Do not use every step in one composition merely to demonstrate the scale.
- Do not treat `18` as the label gap or `36` as the section gap everywhere.
- Do not insert empty spacer elements.
- Do not convert coordinates, optical offsets, control padding, or subject-authored pixels into composition tokens.
- If neither endpoint in a suggested range works, first inspect typography, wrapping, border/surface cues, and whether the relationship was classified correctly. Escalate a token change only with two real affected surfaces and controlled paint. AZ15 found no such need.

## 7. Elevation contract

Only existing shadows are used:

| Level | Meaning | Examples | Misuse |
| --- | --- | --- | --- |
| Flat | ordinary in-flow content at current plane | sections, row groups, recessed/container regions | decorative shadow on every filled region |
| `--shadow-subtle` | selected/current state remaining on parent plane | selected nav, active tab/row | cards, dialogs |
| `--shadow-default` | bounded working plane or meaningful foreground card at rest | shell Main pane, actionable object/status card | every container |
| `--shadow-elevated` | temporarily closer surface or hover lift of a default actionable card | dialog, menu, popover, task/assistant sheet | static page section |

An elevated surface must answer “above what?” and “why now?” Focus/validation rings are state cues, not depth. Literal subject shadows inside rendered artifact content are excluded; Hearth preview chrome is governed. `TaskSheet.tsx`'s `shadow-lg` must migrate to `--shadow-elevated`.

## 8. Scope and architecture

### In scope

- Composition gaps and Hearth chrome shadows across the measured surface families.
- Existing-token vocabulary enforcement, including Tailwind aliases/raw values.
- Classification and narrow documented exclusions for AZ7/control, geometry, optical, coordinate, overlap, and subject content.
- Representative stable component/relationship tests and painted family proof.
- Authoritative design/rule documentation updates.

### Out of scope

- AZ11 page widths/gutters/header/shell geometry.
- AZ7 control-internal padding/hit targets/icon/badge geometry.
- New tokens, typography, workflows, copy, IA, motion, or backend/data/API behavior.
- Semantic endpoint enforcement or route-wide per-surface pixel checks.
- Reauthoring review/artifact subject content.

### Static contracts

- Extend `design/no-off-grid-spacing` to resolve recognized Tailwind aliases and arbitrary composition spacing. Reject authored composition values outside `0/3/6/9/12/18/24/36/48`.
- Do not make semantic ranges lint rules. `gap-[12px]` remains valid even if a reviewer might reasonably choose `18px` for a particular group.
- Add `design/shadow-token-only`: allow the three Hearth shadow variables (and conditional `shadow-none`), reject named/raw elevation shadows, preserve narrow focus/validation and subject-content exclusions.
- Promote applicable shipping spacing/shadow violations to error only after raw findings are classified and narrow exceptions are credible.
- Whether valid explicit-pixel classes must all become `var(--space-*)` spelling is an explicit founder choice; it is not required to enforce the vocabulary numerically.

### Rendered contracts

Use targeted tests only where semantics are stable and owned by a component:

- `SectionLabel` stays in the close range (`6–9`) and preserves divider behavior;
- `Row`/`ItemList` remain contiguous with dividers;
- stable page-stack owners used across states stay in the major range (`24–36`);
- known Agent/Routine top-level stacks move out of group spacing into the major range;
- Task Sheet/search/dialog chrome uses the correct elevation token.

Tests should assert a vocabulary/range invariant or component contract, not a preferred endpoint where both endpoints are valid. Route screenshots remain regression evidence for layout families, not a promise of exact pixel parity across every route.

### Contracts/types/security

- Token values, public component props, TypeScript domain types, schemas, APIs, database, and network contracts remain unchanged.
- No inputs, storage, requests, credentials, auth, or new untrusted rendering are introduced. Security exposure is unchanged.

### Ownership and likely paths

| Owner | Paths | Responsibility |
| --- | --- | --- |
| Design lint | `tools/eslint-plugin-design/src/rules/no-off-grid-spacing.ts`; new `shadow-token-only.ts`; RuleTester files; `src/index.ts`; `src/hearth-config.ts` | Resolve vocabulary, enforce shadows, encode narrow structural exceptions. |
| Stable component evidence | design-system tests for `SectionLabel`, `Row`, `ItemList`; targeted Core UI layout tests/E2E only where stable selectors already exist | Test ranges/continuity/elevation, not route-wide exact pixels. |
| Known hierarchy fixes | `pages/AgentProfile.tsx`, `pages/work/RoutineDetailPane.tsx`, `pages/SettingsPage.tsx`, shared owners exposed by classified review | Correct measured misuse; choose endpoints using the guidance. |
| Vocabulary migration | classified Core UI/design-system composition rows; `shell/TaskSheet.tsx` | Replace real off-vocabulary composition/raw shadow; preserve exclusions. |
| Documentation | `framework/design-system/DESIGN.md`, `AESTHETICS.md` if conflicting; `docs/ui-design/rules.md`; `.claude/rules/aesthetic-quality.md` | Publish ranges, choice factors, exclusions, elevation meanings. |

## 9. Ordered tests-then-code plan

1. **Red — spacing vocabulary:** add RuleTester cases for valid vocabulary through arbitrary values and aliases, invalid `4/8/16`, negative/coordinate/control/subject exclusions, and precise failure messages. Prove failures before implementation.
2. **Red — shadow vocabulary:** add valid token/focus/subject and invalid `shadow-lg`/raw literal cases. Prove failures before implementation.
3. **Red — stable rendered contracts:** add focused SectionLabel close-range, Row/ItemList continuity, shared major-stack range, and overlay elevation assertions only where the owner/selector is stable. Include negative fixtures outside the range/vocabulary.
4. **Green — lint:** resolve aliases/raw classes, add/export/configure the shadow rule, and keep config-totality green. Do not encode semantic endpoint preference.
5. **Classify before migration:** use `census/classified.csv` as a queue. Each candidate becomes composition migration, AZ7/control, padding/geometry, optical, coordinate/overlap, reset, or subject-content. No nearest-number bulk rewrite.
6. **Fix shared/known hierarchy:** preserve contiguous rows; keep SectionLabel in `6–9`; move Agent/Routine top-level peer regions into `24–36`; bring Settings named-content relation into `6–9`; fix other measured failures using compact/roomy criteria.
7. **Fix vocabulary/elevation:** migrate genuine `4/8` composition based on relationship, replace Task Sheet `shadow-lg`, and correct other raw shadow sites. Preserve focus glows and subject pixels.
8. **Document:** update authoritative design/binding rules with the range tables, horizontal guidance, exclusions, and escalation rule.
9. **Verify:** focused RuleTester/component/E2E suites, `npm run check`, `npm run lint:design`, `npm run test:full`, `npm run verify`; zero unclassified shipping design-lint failures.
10. **Paint:** retain desktop/narrow screenshots for dense Settings/form, sparse Agent/Routine detail, Work/Knowledge list/detail, Review, and one overlay. Inspect hierarchy, density, wrapping, shadow meaning, and absence of AZ7/AZ11 movement.

## 10. AC-by-AC completion evidence

| AC | Automated evidence | Painted/reviewer evidence | Failure signal |
| --- | --- | --- | --- |
| AC1 | Reproducible census and classification outputs; scripts exit nonzero on failure. | Indexed real-instance and comparison paint. | Missing output/category or unreproducible script blocks review. |
| AC2 | Docs/rule fixtures include the complete vocabulary and ranges. | Reviewer can explain compact versus roomy choice on dense/sparse examples. | Any artifact reintroducing a universal exact ladder blocks approval. |
| AC3 | Error-level vocabulary/shadow lint; stable component range/continuity tests. | Representative surface-family paint after migration. | Raw composition/shadow fails lint; stable shared contract fails its test. |
| AC4 | Targeted tests assert related range is below the owning major-range relationship where stable. | Dense/sparse/narrow inspection confirms relationship without decorative whitespace. | Reviewer cannot identify the relationship or endpoint rationale. |
| AC5 | Negative lint fixtures and component out-of-range fixtures. | Painted regression review for changed families. | Valid in-range token does not fail solely due to endpoint preference; invalid vocabulary/raw shadow does. |

## 11. Proportionality, line-count, and trade-offs

Expected implementation is approximately **650–900 changed lines**:

- 180–260 lint/rule tests and focused rendered tests;
- 160–240 lint implementation/config;
- 140–220 classified surface migrations;
- 100–140 documentation.

This stays below CLAUDE's 1,000-line sanity threshold. If it approaches 1,000, stop and check whether strict token-variable spelling, AZ7 control parts, geometry, or subject content was accidentally pulled in. Do not create an abstraction to disguise scope.

Trade-offs:

- Guidance ranges preserve contextual design quality but require reviewer judgment. Static lint still provides a crisp vocabulary floor.
- Representative stable tests do not guarantee every route's semantics forever; they avoid brittle route-wide exact-pixel machinery and keep the MVP proportional.
- Classifying 95 off-vocabulary source lines is slower than bulk replacement but prevents damage to control/optical/canvas behavior.
- Keeping valid pixel utility spelling minimizes scope; requiring explicit variables improves naming consistency but expands the migration materially.

Open blockers: **none after the founder records the choices below**.

## 12. Founder choices

1. **Approve the recommended design and build plan:** semantic ranges (`3–9`, normally `6–9`; `12–18`; `24–36`; exceptional `48`), existing elevation meanings, vocabulary enforcement, representative stable tests, and classified migration.
2. **Choose token spelling scope:**
   - **A — numerical vocabulary enforcement (recommended for AZ15 MVP):** existing valid `gap-[6px]`-style classes may remain; reject off-vocabulary/raw values and document tokens as the source scale.
   - **B — require `var(--space-*)` spelling:** add a roughly 690-line/113-file mechanical normalization, likely requiring a split package because it breaches this round's proportional estimate.
3. **Request a range change:** name the relationship/context and desired existing-token endpoints. No new token is implied without two affected real surfaces and controlled paint.

Until approval is recorded, AZ15 stops here. No production code, progress-state update, commit, or build is produced.

## 13. As-built evidence after founder approval

- **Red:** spacing lint failed on named aliases/deep class strings and misclassified padding/optical cases; the absent shadow rule failed to import; config stayed warning-only; rendered Agent/Routine/Settings contracts exposed `12/12/18px` instead of the approved ranges.
- **Implementation:** composition lint now resolves supported aliases/arbitrary pixels and follows stable const class strings, with narrow structural exclusions. Shadow lint accepts only none/Hearth elevation tokens for shipping chrome plus narrow state/subject cases. Both rules run at error.
- **Census:** the post-build rerun leaves no actual off-vocabulary composition. Its 18 heuristic candidates are documented as two comment matches, five compact control/pill internals, and eleven optical offsets in `measurement/post-build-census/README.md`.
- **Stable relationships:** Agent and Routine top-level stacks compute to `24px`; Settings title/content computes to `9px`; TaskSheet renders with `--shadow-elevated`; list-row continuity is unchanged.
- **Paint:** eight inspected desktop/narrow captures cover Settings/forms, Agent, Routine, Work list/detail, Knowledge detail, and Global Search overlay. `painted-proof/README.md` records honest Review and TaskSheet route-capture limits and their focused alternatives.
- **Verification:** focused lint/config fixtures pass `29/29`; `npm run lint:design` reports zero errors (the existing warning backlog remains); `npm run test:full` passes `575/575` files and `6245/6245` tests; `npm run verify` passes typecheck for all 55 packages, lint/governance, Knip, dependency/inventory/backlog gates, the Core UI production build, and the desktop bundle.
- **Proportionality:** production/test/config/authoritative-doc implementation is 686 changed lines (503 additions and 183 deletions), excluding work-package evidence. This stays below the 1,000-line sanity threshold without hiding migration work in an abstraction. The separately retained evidence contains 1,268 authored text lines (round/indexes/READMEs/scripts/spec/comparison HTML), 203,071 machine-generated census/metrics JSON+CSV lines, and 21 PNGs. Its size is reproducible raw/classified measurement data, not production implementation.
- **Governance floor:** AZ15 adds 51 durable non-production evidence files and crossed the pre-existing shrink-only `outside-production-roots` slack threshold. Per the gate's exact recommendation, only that minimum changed from `1062` to `1238` against `1376` live matches; classification logic is unchanged, the invariant is tighter, and governance reports zero known violations.
