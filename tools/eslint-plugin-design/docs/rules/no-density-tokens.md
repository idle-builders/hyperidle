# design/no-density-tokens

Density-static components (per the K10 audit at `framework/design-system/research/density-audit.md`) must NOT consume `var(--density-*)` tokens. These surfaces should look the same at every density tier.

Maps to **AQ-017** in `.claude/rules/aesthetic-quality.md` (inverse).

## Rationale

K10 identified four canonical density-static surfaces (and adjacent literal-axes inside otherwise density-aware components — those are managed by `densityAware.components[].literalAxes`):

| Component | Why it stays static |
|-----------|---------------------|
| `StatusChip` | Badge-as-callout — Carbon `tag-sm`, Polaris `Badge`, Material 3 `chip-small` all hold chip dimensions constant. Density toggling badges destroys their as-callout function. |
| `Tag` | Same as `StatusChip` — badge, not text. Free-form labels would visually swell at comfortable. |
| `IconRail` | Brand chrome — Material 3 NavRail / Carbon UI Shell / Slack / Linear all fix the nav-rail width across all density modes. The canonical density-static example, per § 5.6. |
| `NotFound` | Error page — user is recovering from a navigation mistake, not reading. |

This rule is the inverse of `design/use-density-tokens`. Both rules read the same `density-allowlist.json` and refuse to lint when the manifest puts a component in both buckets.

## Examples

### Incorrect (density-static component using a density token)

```tsx
// framework/design-system/src/StatusChip.tsx (density-static per § 3.1.1)
<span className="px-[var(--density-pad-x)]">…</span>
//                ^^^^^^^^^^^^^^^^^^^^^^^^^^
// 'var(--density-pad-x)' consumes a density token inside a density-static
// component (StatusChip). Per K10 audit (density-audit.md): Badge-as-callout.
```

### Correct

```tsx
<span className="px-[8px]">…</span>
```

## Configuration

| Path | Level |
|------|-------|
| `framework/design-system/src/**` | `error` |
| `layers/web/src/shell/**` | `error` (IconRail is the canonical static shell) |
| `layers/web/src/components/**` | `warn` |

## When NOT to use

If a component is genuinely density-aware (its outer pad/gap/body text scales with density), move it from `densityStatic.components` to `densityAware.components` in `density-allowlist.json`. That bucket is enforced by `design/use-density-tokens`.

## Related

- `design/use-density-tokens` — inverse rule (requires density tokens on density-aware components)
- `framework/design-system/research/density-audit.md` § 5.5 + § 5.6 — full rationale for badge / icon-rail static-ness
- `.claude/rules/aesthetic-quality.md` — AQ-017
