# AZ15 — Spacing and elevation hold across the product

## Final outcome

Vertical and horizontal rhythm now uses the existing Hearth vocabulary deliberately: related elements sit closer than unrelated sections, repeated rows preserve dense continuity, and shadows identify z-order rather than decorate containers. The founder approved numerical vocabulary enforcement (option A) on 2026-08-12. Valid explicit-pixel utilities may remain; off-vocabulary composition and raw elevation shadows fail shipping design lint.

The semantic system is guidance with ranges, not an exact mapping:

- close relationships: `3–9px`, normally `6–9px`;
- peer groups: `12–18px`;
- major sections: `24–36px`;
- repeated rows: normally contiguous (`0px`) when dividers or repeated shape provide grouping;
- `48px`: exceptional phase or empty-state breathing room, not routine page rhythm.

No spacing or shadow token was added. Density remains preferred over decorative whitespace.

## Why this was needed

The repository already defined a 3px-grid vocabulary (`3 / 6 / 9 / 12 / 18 / 24 / 36 / 48`) and warm shadow tokens, but the spacing rule was warning-only and raw shadows were not governed. Shipped rhythm had not been measured. Baseline inspection found dense regions with weak group separation, detached labels, Agent/Routine outer stacks using group spacing for major sections, and elevation absent on 12 of 13 previously measured filled surfaces.

## Human-approved procedure and decision

This package used one combined measurement + requirement clarification + design + architecture round, one founder approval, one tests-then-code build session, and one fresh implementation review. The review returned NOT DONE with six blockers; the same builder closed only those recorded blockers. The objective closure changed the effective outcome to DONE without adding a second review round. A six-entry retro, including a cost entry, followed before ship.

The founder rejected an initial exact `24/18/9/6/0` ladder because it preceded comparative paint and had irregular unexplained jumps. The revised round measured shipped use and compared real-structure alternatives. The founder then approved semantic ranges and option A: enforce the numerical vocabulary without requiring every valid class to use `var(--space-*)` spelling.

## Definitions and scope

- A **primary surface** is a repeat-use signed-in route/state that owns the Main pane or a durable split-pane destination. Materially different queue/detail states count separately.
- A **section** is a top-level task, phase, or content region below the page header.
- A **group** is a related cluster within a section, such as a field set, stat set, action cluster, or card content phase.
- A **row** is a repeated same-shaped item in a list or table.
- A **close relation** is one element naming, qualifying, or completing another: label/control, title/meta, icon/text, or value/unit.
- **Elevation** is perceived z-order created by a Hearth shadow. Borders, fills, focus rings, and subject-authored preview pixels are not elevation.

In scope were composition gaps and Hearth chrome shadows across Core UI and the design system, existing-token enforcement, narrow structural exclusions, measured hierarchy fixes, representative stable tests, and authoritative design documentation.

Out of scope remained page widths/gutters/shell geometry, control-internal padding and hit targets, new tokens, typography, workflows, copy, IA, motion, backend/data/API changes, and reauthoring subject content. Redirects, setup/first-run, not-found, and dev-only demos were not primary surfaces. Transient dialogs, menus, popovers, and sheets were not primary surfaces but remained governed for spacing vocabulary and elevation.

## Measurement methodology and coverage

The planning census statically scanned production `.ts`, `.tsx`, and `.css` under `layers/core-ui/src` and `framework/design-system/src`, excluding tests, stories, fixtures, mocks, and dev-only surfaces. It recorded authored occurrences, resolved values where possible, CSS property, orientation, component/surface family, and likely semantic relationship. Deterministic heuristic classification separated composition from padding/inset, geometry/size/alignment, control internals, subject-authored content, canvas coordinates, resets, optical offsets, and negative overlap. Structural categories were high confidence; control categories were medium confidence; semantic relationships were deliberately low confidence and checked against paint.

The census measured authored occurrences rather than unique DOM nodes. Shorthands expanded to physical sides, responsive variants remained authored occurrences, and unresolved expressions remained visible. Source/static findings and computed real-app layout were complementary evidence.

Canonical route ownership plus Settings state yielded 15 primary surfaces:

1. Conversations queue;
2. Conversation detail;
3. Work overview;
4. Work team;
5. new bet;
6. bet detail;
7. task detail;
8. Review;
9. routine detail, direct and split placement;
10. agent profile, direct and split placement;
11. Knowledge list;
12. Knowledge create;
13. Knowledge detail;
14. artifact permalink;
15. Settings Main-pane state.

Every family had route/source/computed baseline coverage. Populated paint covered the dominant queue, detail, team, bet, task, routine, Knowledge, Settings, and overlay families. Post-build proof was intentionally family/contract based rather than an exact-pixel matrix across routes.

## Baseline evidence and conclusions

The census covered 241 shipping files and 2,629 authored spacing occurrences:

| Classification | Count | Disposition |
| --- | ---: | --- |
| likely composition | 754 | vocabulary and relationship review |
| padding/inset | 773 | measured; control/page-geometry boundaries preserved |
| geometry/size/alignment | 667 | not composition rhythm |
| control-internal | 263 | excluded through narrow structural roles |
| authored review-artifact content | 61 | subject pixels, not Hearth chrome |
| canvas coordinate | 49 | coordinate system |
| CSS/native reset | 41 | default removal |
| optical offset | 13 | narrow visual exception |
| negative overlap | 8 | positioning/overlap |

Within likely composition, `6`, `9`, and `12` accounted for 492 of 754 occurrences (65%). There were 102 likely off-vocabulary occurrences on 95 unique source lines, led by `8px` (46) and `4px` (36). Horizontal general gaps numbered 307; vertical general gaps 243; vertical top/bottom margins 159. Review was the largest family (221), followed by Work (137), design system (111), Settings (86), shared components (80), other Core UI (41), Knowledge (36), Shell (30), and Conversations (12).

Only two likely composition occurrences directly spelled a `var(--space-*)` token. Normalizing all already-valid utilities would have touched about 690 lines in 113 files, so option A avoided a disproportionate mechanical rewrite.

Representative real instances showed:

- dense Settings/form sections work at `24px` when headings, dividers, and fills already mark boundaries, while the old `18px` title/content relation looked detached;
- sparse Agent/Routine `12px` outer stacks collapsed independently meaningful regions and needed major-section spacing;
- contiguous rows with dividers provide strong, dense list scanning;
- `6–12px` dominates horizontal icon/text, title/status, inline-action, and row relationships, while `18–24px` suits distinct clusters or columns;
- Global Search worked visually with its legacy `8px` gap and elevated shadow; `9px` was the least disruptive vocabulary correction;
- off-vocabulary `4/8px` included both genuine composition and excluded pill/control parts, so nearest-number bulk replacement was unsafe.

Six controlled real-structure comparisons held content, typography, padding, borders, and shadows constant across dense/sparse and desktop/narrow examples:

| Comparison | Finding |
| --- | --- |
| section `24` vs `36` | `24` preserves dense hierarchy; `36` makes sparse weak-cue phase changes unmistakable; major sections need `24–36` |
| group `12` vs `18` | `12` keeps dense form groups cohesive; `18` helps multiline narrow reflow; groups need `12–18` |
| close `6` vs `9` | `6` pairs compact controls efficiently; `9` better connects labels to larger panels; close relations need `6–9`, with `3` for micro units |

Compact exact (`6/12/24`) under-expressed sparse phase changes; roomy exact (`9/18/36`) compounded scrolling and detached related controls. The selected range model fit both. Unequal scale increments were useful, and no missing intermediate token emerged.

## Authoritative spacing guidance

| Value | Semantic role | Vertical examples | Horizontal examples |
| ---: | --- | --- | --- |
| `0` | continuity/reset | contiguous divided rows | flush segmented edges, deliberate reset |
| `3` | micro, same typographic unit | heading/subtitle or title/meta micro lead | value/unit, dot/text, tiny icon/label |
| `6` | compact close relation | compact label/control, support line | icon/text, tight actions, permitted close parts |
| `9` | default close relation / compact peers | SectionLabel to list/card, multiline support | standard icon/text, compact peers/actions |
| `12` | dense group / standard peers | consecutive fields, card clusters | title/action, action groups, stat columns |
| `18` | roomy group / distinct cluster | multiline groups, weakly bounded phases | separate stat/action or wrapping clusters |
| `24` | dense major section / compact columns | top-level sections with strong cues | content columns or page regions, not gutters |
| `36` | roomy major section / task-phase break | sparse sections with weak cues | rare large region separation where width permits |
| `48` | exceptional breathing/phase space | singular hero, empty state, or major phase transition | rare canvas/hero separation, never ordinary columns |

Choose the compact end when content is dense, labels are single-line, a divider/surface/heading already supplies the boundary, or a narrow viewport would add meaningless scroll. Choose the roomy end when content wraps, groups have independent tasks, boundary cues are weak, horizontal clusters reflow into vertical phases, or typography changes scale markedly.

Horizontal spacing is not the vertical ladder rotated. Baselines, wrapping, available width, and target size matter: use `3–9` for inline close relations, `9–12` for ordinary peers/actions, `18–24` for distinct clusters/columns, and `36–48` only for rare large layout separation. Never shrink a hit target to obtain a gap.

Anti-patterns include using a large gap instead of a heading/divider/surface, using every rung in one composition, universal `18px` label or `36px` section spacing, empty spacer elements, and treating coordinates/optical offsets/control padding/subject pixels as composition. If a range fails, inspect typography, wrapping, boundary cues, and relationship classification first. A token change requires two affected real surfaces and controlled paint.

## Elevation contract

| Level | Meaning | Examples |
| --- | --- | --- |
| flat | ordinary in-flow content on the current plane | sections, row groups, recessed regions |
| `--shadow-subtle` | selected/current state remaining on its parent plane | selected navigation, active tab/row |
| `--shadow-default` | bounded working plane or meaningful foreground card at rest | shell Main pane, actionable object/status card |
| `--shadow-elevated` | temporarily closer surface or hover lift of a default actionable card | dialog, menu, popover, task/assistant sheet |

An elevated surface must answer “above what?” and “why now?” Focus and validation rings are state cues, not depth. Literal subject shadows inside rendered artifacts are excluded only on marked subject nodes; Hearth preview chrome remains governed.

## Implemented contracts and ownership

`design/no-off-grid-spacing` resolves supported Tailwind aliases and arbitrary authored composition values, rejects values outside `0/3/6/9/12/18/24/36/48`, and follows stable class strings. Its exclusions are bounded to intrinsic controls, explicitly marked compact-pill/control roles, overlay/optical offsets, coordinates, negative overlap, resets, nonnumeric margins, page geometry, and marked subject content. It does not mechanically enforce a semantic endpoint within an approved range.

`design/shadow-token-only` permits `none` and the three Hearth shadow variables for shipping chrome. It rejects named/raw shadows in utilities, inline and template-literal `boxShadow`, stylesheets, and selector variants. Narrow focus/validation effects and marked subject nodes remain permitted.

Both rules run at error for shipping Core UI and design-system code. Stable component tests protect SectionLabel close range (`6–9`), Row/ItemList continuity plus dividers, Agent/Routine major range (`24–36`), Settings named-content close range (`6–9`), and TaskSheet elevation. These are range/component contracts, not preferred endpoints or route-wide exact-pixel promises.

Known hierarchy fixes moved Agent and Routine top-level stacks to `24px`, Settings title/content to `9px`, and Global Search composition to `9px`; genuine legacy composition was classified and migrated. TaskSheet now uses `--shadow-elevated`. Four review-identified control/pill internals were explicitly restored to their owned values: Assistant context-control `ml-1`, HostThread prefill `gap-1`, ReviewAction `gap-[4px]`, and ReviewVisual `gap-[4px]`.

Authoritative guidance lives in `framework/design-system/AESTHETICS.md`, `framework/design-system/DESIGN.md`, `framework/design-system/PRINCIPLES.md`, `docs/ui-design/rules.md`, and `.claude/rules/aesthetic-quality.md`. Lint implementation and tests live under `tools/eslint-plugin-design/src`; stable rendered seams live in design-system and Core UI tests. Token values, public props, TypeScript domain types, schemas, APIs, storage, auth, and network behavior did not change.

## Post-build evidence

The post-build census left 18 heuristic off-vocabulary candidates, all manually reclassified into approved exclusions: two comment matches, five compact control/pill internals, and eleven optical alignment offsets. No actual off-vocabulary composition remained. Shipping design lint independently reported zero spacing or shadow errors.

Eight directly inspected desktop/narrow real-app captures covered:

- Settings desktop and narrow: `9px` named-content relation, `24px` peer sections;
- Agent desktop: `24px` top-level rhythm;
- Routine narrow: `24px` top-level rhythm through reflow;
- Work team and task desktop: contiguous rows and legible boundaries;
- Knowledge detail desktop: clear content/discussion/metadata/backlink groups;
- Global Search narrow: `9px` composition and warm `--shadow-elevated` overlay.

No inspected capture showed clipping, unexpected wrap, hierarchy inversion, or raw/cool elevation.

Two proof limits remain explicit:

- Review was covered by census, error-level design lint, and focused Review tests, but no new populated Review screenshot was claimed. The available `/conversations/review` path redirected to Conversations and was rejected as misleading evidence because no seeded review message ID was exposed through demo navigation.
- TaskSheet was not captured through a production route because the seeded WorkBet row navigated to the full task route. Its real component test asserts `shadow-[var(--shadow-elevated)]`, and the error-level shadow rule covers its authored chrome. Global Search supplied real overlay paint.

The generated measurement and paint bundle was intentionally removed during ship consolidation after these methods, counts, conclusions, coverage, and limits were folded here. Git history retains the raw evidence if forensic reproduction is ever needed. The review’s sole non-blocking note—that the disposable census script did not hard-fail on zero findings—was not expanded into product scope; any resurrected scanner must add that guard.

## Review closure

The one fresh review found six blockers:

1. broad spacing exemptions allowed `gap-[5rem]`, a rounded inline-flex `px-24 gap-8`, and a relative sized `mt-16`;
2. file-wide Review shadow exemption allowed raw preview-chrome shadows and missed template, stylesheet, and selector variants;
3. exact endpoint tests rejected valid range endpoints and omitted Row/ItemList continuity;
4. four control-internal migrations crossed the package boundary;
5. Main-pane shadow documentation contradicted runtime;
6. work-package identifiers leaked outside `.pipeline/**`.

The closure commit bounded structural exemptions and added break cases, made subject shadow exemption node-scoped, changed tests to ranges plus row continuity, restored the four control values, aligned Main-pane documentation to `--shadow-default`, and removed all identifier leaks. All six blockers were closed; AC1–AC5 are PASS. The non-blocking disposable-scanner note above remained deliberately unassigned.

## Verification and proportionality

Recorded closure verification:

- spacing/shadow break cases: 33/33 pass;
- focused rule/config/component seams: 114/114 pass;
- design lint: zero errors, 42 pre-existing warnings;
- design-plugin typecheck: pass;
- `npm run test:full`: 575/575 files and 6,257/6,257 tests pass;
- `npm run verify`: all 55 package typechecks, 69 governance attacks, lint, Knip, dependency/mock/design inventories, Core UI build, and desktop bundle pass;
- `rg -i '\bAZ15\b' --glob '!.pipeline/**'`: empty.

The consolidated non-pipeline diff against the original base is 716 additions and 181 deletions across 61 files (897 changed lines), below the 1,000-line sanity threshold. The large evidence commit was predominantly generated census data and PNGs, not hidden product implementation, and is removed by consolidation.

The evidence bundle temporarily raised the shrink-only `outside-production-roots` census minimum from 1,062 to the gate-recommended 1,238 because 51 non-production evidence files crossed the allowed slack. Consolidation removed those generated files, so the original floor was restored. Governance passed with 1,327 live matches and 265 slack, below the 266 stop threshold. Classification logic is unchanged.

## Acceptance criteria result

| Acceptance criterion | Final result |
| --- | --- |
| measurement covers every primary surface and names offenders | PASS — 15-surface ownership map, 241-file census, representative computed/paint evidence |
| proportional system and elevation meanings are decided | PASS — semantic ranges, horizontal guidance, exclusions, escalation, and shadow roles are authoritative |
| every primary surface conforms | PASS — shipping composition/shadow lint is error-level; affected families were migrated and representative paint inspected |
| related elements are visibly closer than unrelated elements | PASS — stable range contracts and dense/sparse/narrow paint preserve hierarchy |
| violations fail verification | PASS — adversarial spacing/shadow cases and stable component contracts fail at real seams; valid range endpoints remain allowed |

## Known limits and deferrals

- Semantic endpoint choice remains design guidance and reviewer judgment; lint enforces vocabulary, not taste.
- Representative stable tests and family paint do not promise exact pixels across every route.
- Review and TaskSheet have the explicit paint limitations recorded above.
- The disposable census scanner’s zero-findings hard-failure note was not promoted to product scope.
- Requiring `var(--space-*)` spelling for all valid utilities remains unselected option B and would be a separate, materially larger normalization.
