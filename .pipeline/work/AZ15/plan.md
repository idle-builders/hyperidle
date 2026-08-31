# AZ15 — Spacing and elevation hold across the product

Rhythm uses the existing Hearth vocabulary deliberately: related elements sit closer than unrelated
sections, repeated rows keep dense continuity, and shadows identify z-order rather than decorate
containers. No token was added.

**Why.** The 3px-grid vocabulary (`3 / 6 / 9 / 12 / 18 / 24 / 36 / 48`) and warm shadow tokens
already existed, but the spacing rule was warning-only, raw shadows ungoverned, and shipped rhythm
never measured. Baseline inspection found weak group separation in dense regions, detached labels,
Agent/Routine outer stacks using group spacing for major sections, and elevation absent on 12 of 13
filled surfaces.

## The two decisions

**Ranges, not an exact ladder.** An initial exact `24/18/9/6/0` ladder was rejected: it preceded
comparative paint and had irregular unexplained jumps. The approved system is guidance with ranges —
close relationships `3–9px` (normally `6–9`), peer groups `12–18px`, major sections `24–36px`,
repeated rows contiguous (`0px`) where dividers or repeated shape already group them, `48px` only
for exceptional phase or empty-state room. In controlled paint a compact exact set (`6/12/24`)
under-expressed sparse phase changes, and a roomy one (`9/18/36`) compounded scrolling and detached
related controls.

**Option A — enforce the numbers, not the spelling** (2026-08-12). Valid explicit-pixel utilities
may remain; only off-vocabulary composition and raw elevation shadows fail lint. Just two
likely-composition occurrences in the repository spelled a `var(--space-*)` token, so normalizing
every valid utility (option B) would have touched ~690 lines in 113 files — still available as
separate work.

**Definitions.** A **primary surface** is a repeat-use signed-in route or state owning the Main pane
or a durable split-pane destination — 15 of them. A **section** is a top-level region below the page
header, a **group** a related cluster within one, a **row** a repeated same-shaped item, and a
**close relation** one element naming, qualifying or completing another. **Elevation** is perceived
z-order from a Hearth shadow — borders, fills and focus rings are not. Out of scope: page widths,
gutters and shell geometry; control-internal padding and hit targets; new tokens; typography,
workflows, copy, IA, motion. Transient dialogs, menus, popovers and sheets are not primary surfaces
but stay governed.

## Spacing guidance

| Value | Semantic role | Vertical examples | Horizontal examples |
| ---: | --- | --- | --- |
| `0` | continuity/reset | contiguous divided rows | flush segmented edges |
| `3` | micro, same typographic unit | title/meta micro lead | value/unit, dot/text, tiny label |
| `6` | compact close relation | compact label/control, support line | icon/text, tight actions, permitted close parts |
| `9` | default close relation / compact peers | SectionLabel to list/card | standard icon/text, compact peers |
| `12` | dense group / standard peers | consecutive fields, card clusters | title/action, action groups, stat columns |
| `18` | roomy group / distinct cluster | multiline groups, weakly bounded phases | separate stat/action or wrapping clusters |
| `24` | dense major section / compact columns | top-level sections with strong cues | content columns, not gutters |
| `36` | roomy major section / phase break | sparse sections with weak cues | rare large region separation |
| `48` | exceptional breathing/phase space | singular hero, empty state | rare canvas separation, never columns |

Choose the **compact** end when content is dense, labels are single-line, a divider or heading
already supplies the boundary, or a narrow viewport would add meaningless scroll; the **roomy** end
when content wraps, groups have independent tasks, or boundary cues are weak.

**Horizontal spacing is not the vertical ladder rotated** — wrapping, available width and target
size matter: `3–9` for inline close relations, `9–12` for ordinary peers, `18–24` for distinct
clusters or columns, `36–48` only for rare large separation.

**Anti-patterns:** a large gap standing in for a heading; every rung used in one composition;
universal `18px` label or `36px` section spacing; empty spacers; treating coordinates, optical
offsets, control padding or subject pixels as composition. If a range fails, inspect typography,
wrapping and boundary cues first — a token change needs two real surfaces and controlled paint.

| Level | Meaning | Examples |
| --- | --- | --- |
| flat | ordinary in-flow content on the current plane | sections, row groups, recessed regions |
| `--shadow-subtle` | selected/current state remaining on its parent plane | selected navigation, active tab/row |
| `--shadow-default` | bounded working plane or foreground card at rest | shell Main pane, actionable object/status card |
| `--shadow-elevated` | temporarily closer surface, or hover lift of a default card | dialog, menu, popover, task/assistant sheet |

An elevated surface must answer "above what?" and "why now?" Focus and validation rings are state
cues, not depth. Literal subject shadows inside rendered artifacts are excluded only on marked
subject nodes.

## Enforcement

`design/no-off-grid-spacing` rejects anything outside `0/3/6/9/12/18/24/36/48`, resolving Tailwind
aliases and arbitrary authored values, with exclusions bounded to intrinsic controls, marked
compact-pill roles, overlay and optical offsets, coordinates, negative overlap, resets, nonnumeric
margins, page geometry and marked subject content. It does **not** enforce a semantic endpoint
within a range — lint enforces vocabulary, not taste. `design/shadow-token-only` permits `none` and
the three Hearth variables, rejecting raw shadows in utilities, inline and template-literal
`boxShadow`, stylesheets and selector variants. Both run at **error**.

Stable component tests protect SectionLabel's close range, Row/ItemList continuity, Agent/Routine's
major range, Settings named-content close range and TaskSheet elevation. These are **range**
contracts, never preferred endpoints or exact-pixel promises — an early version asserted exact
endpoints and rejected valid ones. Guidance lives in `framework/design-system/` and
`docs/ui-design/rules.md`.

**Known limits.** Semantic endpoint choice stays design guidance and reviewer judgement;
representative tests and family paint promise no exact pixels across every route.

- **Two surfaces have no populated paint.** `/conversations/review` redirects to Conversations with
  no seeded review message id reachable through demo navigation, and TaskSheet was never captured
  through a production route because the seeded WorkBet row navigates to the full task route. Both
  are covered by census, lint and component tests.
- **Nearest-number bulk replacement of `4/8px` is unsafe** — those values include both genuine
  composition and excluded pill parts, so each needs reading.
