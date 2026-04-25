# `design/no-off-scale-font-size`

**Severity (K6):** `warn`.
**AQ rule:** AQ-004.
**Source of truth:** [AESTHETICS.md § Typography](../../../design-system/AESTHETICS.md#typography).

## Why

The HyperIdle type scale is the closed set `{11, 12, 13, 14, 15, 16, 18, 20, 24}`
(productivity-tool consensus across Carbon, Polaris, Atlassian + the
designer-call addition of 20 from K1). Off-scale values fragment the
ladder and break vertical rhythm.

## Incorrect

```tsx
<span className="text-[10px]" />
<span className="text-[17px]" />
<span className="text-[22px]" />
```

## Correct

```tsx
<span className="text-[14px]" />     // body-default
<span className="text-[20px]" />     // heading mid-step (designer-call)
<span className="text-sm" />         // Tailwind's named steps map to scale
```

## Cross-link

[AESTHETICS.md § Typography — Recommendations](../../../design-system/AESTHETICS.md#recommendations-1) "Body size (default)" row.
