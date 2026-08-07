# design/use-density-tokens

Density-aware components (per the K10 audit at `framework/design-system/research/density-audit.md`) must consume `var(--density-*)` tokens for the axes K10 prescribes — not literal pixel padding/gap/font-size values.

Maps to **AQ-017** in `.claude/rules/aesthetic-quality.md`.

## Rationale

K9 added a real density ladder. K10 audited every Tier 1+2 primitive and Tier 3 shell and recorded a per-component verdict on which axes should scale with density. K11 swept the components and added this lint rule so that future PRs don't drift literal pixels back into surfaces that K10 marked density-aware.

The opt-out manifest at `tools/eslint-plugin-design/density-allowlist.json` lists every component with its `axes` (must scale) and `literalAxes` (must stay literal — chrome, instrument metrics, DnD primitives, badge-as-callout, etc.). A component is in **exactly one bucket** — `densityAware` (this rule applies) or `densityStatic` (the inverse rule `design/no-density-tokens` applies). Both rules read the same manifest at run-time and refuse to lint when the manifest contradicts itself.

## Examples

### Incorrect (density-aware component using a literal)

```tsx
// framework/design-system/src/BetCard.tsx (density-aware per § 3.2.4)
<div className="p-[8px] gap-[4px]">…</div>
//                ^^^^^         ^^^^^
// 'p-[8px]' uses literal 8px padding/gap inside a density-aware component (BetCard).
```

### Correct

```tsx
<div className="p-[var(--density-card-pad)] gap-[var(--density-card-gap)]">…</div>
```

### Allowed chrome literals

`text-[11px]` and `text-[12px]` are always allowed — every density-aware component has chrome axes (caption, timestamp, version pill) that stay literal. The higher-level `/design-lint` skill cross-references the `literalAxes` manifest for contextual checks the AST can't make.

## Configuration

| Path | Level |
|------|-------|
| `framework/design-system/src/**` | `error` |
| `layers/core-ui/src/**` | `warn` |

## When NOT to use

If a component is genuinely density-static (e.g. `StatusChip`, `Tag`, `IconRail`, `NotFound`), add it to `densityStatic.components` in `density-allowlist.json` instead. That bucket is enforced by `design/no-density-tokens`.

## Related

- `design/no-density-tokens` — inverse rule (forbids density tokens on density-static components)
- `design/no-off-grid-spacing` — AQ-001 (4 px grid)
- `framework/design-system/research/density-audit.md` — K10 audit (source of truth)
- `.claude/rules/aesthetic-quality.md` — AQ-017
