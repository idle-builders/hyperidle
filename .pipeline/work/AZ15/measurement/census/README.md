# AZ15 shipped spacing census

## Reproduce

From the AZ15 worktree root:

```sh
node .pipeline/work/AZ15/measurement/scripts/spacing-census.mjs
```

The script scans production `.ts`, `.tsx`, and `.css` under `layers/core-ui/src` and `framework/design-system/src`. Tests, stories, fixtures, mocks, and dev-only surfaces are excluded. It does not mutate product files.

Outputs:

- `raw.json` / `raw.csv`: authored occurrences, resolved value, property, orientation, and file context before semantic classification.
- `classified.json` / `classified.csv`: raw rows plus deterministic category, likely relationship, and confidence.
- `summary.json`: reproducible frequency tables, including a full value/property/orientation/family/relationship cross-tab.

## Scope and classification limits

This census measures authored occurrences, not unique DOM elements. A shorthand padding string expands to physical sides; responsive/variant utilities count as authored. Values inside runtime-computed expressions that cannot be resolved statically remain `unresolved`.

Category classification is deterministic but heuristic. `padding`, `geometry`, `canvas-coordinate`, `negative-overlap`, `CSS reset`, and inline subject content have high-confidence structural rules. `control-internal` is medium-confidence because it uses element/file context. Likely semantic relationships are intentionally low-confidence and must be checked against real paint; they are leads, not requirements.

## Classified totals

The 241 shipped files contain 2,629 authored occurrences:

| Category | Count | AZ15 treatment |
| --- | ---: | --- |
| Likely composition | 754 | Vocabulary and visual relationship review |
| Padding/inset | 773 | Surface padding is measured; AZ7 control and AZ11 page geometry remain excluded |
| Geometry/size/alignment | 667 | Not composition spacing |
| Control-internal | 263 | AZ7 exclusion; only narrowly documented lint handling |
| Authored review-artifact content | 61 | Subject pixels, not Hearth chrome |
| Canvas coordinate | 49 | Coordinate system, not rhythm |
| CSS/native reset | 41 | Zeroing browser defaults, not semantic distance |
| Optical offset | 13 | Narrow exception; verify visually |
| Negative overlap | 8 | Intentional overlap/positioning, not positive rhythm |

## Likely composition frequency

| Computed value | Hearth vocabulary | Count | Horizontal | Vertical | Other |
| ---: | --- | ---: | ---: | ---: | ---: |
| 0 | zero | 1 | 0 | 1 | 0 |
| 1 | no | 7 | 0 | 7 | 0 |
| 2 | no | 10 | 0 | 10 | 0 |
| 3 | `--space-1` | 80 | 22 | 58 | 0 |
| 4 | no | 36 | 13 | 23 | 0 |
| 6 | `--space-2` | 187 | 99 | 87 | 1 |
| 7 | no | 1 | 0 | 1 | 0 |
| 8 | no | 46 | 26 | 18 | 2 |
| 9 | `--space-3` | 160 | 103 | 55 | 2 |
| 12 | `--space-4` | 145 | 53 | 86 | 6 |
| 18 | `--space-6` | 58 | 8 | 48 | 2 |
| 24 | `--space-8` | 21 | 5 | 16 | 0 |
| 36 | `--space-12` | 2 | 0 | 2 | 0 |
| 48 | `--space-16` | 0 | 0 | 0 | 0 |

`6`, `9`, and `12` account for 492/754 likely composition occurrences (65%). `18` is mostly vertical. `24` is uncommon but strongly concentrated in Work/Knowledge/Settings page stacks. After alignment indents are separated, `36` has only two composition candidates: the Review Composition outer phase stack and a Setup prose break. `48` has no shipped composition occurrence; its shipped uses are padding/size/geometry.

The 102 likely off-vocabulary occurrences occupy 95 unique source lines. They are dominated by `8px` (46) and `4px` (36); several `1/2/7px` rows are likely optical or control sub-elements that need narrow reclassification during implementation rather than automatic substitution.

## Property, orientation, and family

- Horizontal general gaps: 307.
- Vertical general gaps: 243.
- Vertical top/bottom margins: 159.
- Review is the largest family (221), followed by Work (137), design system (111), Settings (86), shared components (80), other Core UI (41), Knowledge (36), Shell (30), and Conversations (12).
- Relationship guesses are low-confidence: close content 293, inline peers 265, group/content stacks 93, unclassified composition 78, major stacks 15, and label/content 10.

The full cross-tab is in `summary.json` as `compositionCrossTab`; it is not copied here because its purpose is drill-down, not a second requirements system.

## Authored form finding

Only two likely composition occurrences currently use `var(--space-*)` directly. Most vocabulary-conforming composition is written as an arbitrary pixel class such as `gap-[6px]`; eight `12px` occurrences use a Tailwind alias. Requiring variable spelling for all existing composition would touch about 690 unique source lines across 113 files before semantic fixes or tests. The round therefore surfaces strict variable normalization as an explicit founder scope choice rather than hiding it inside AZ15.
