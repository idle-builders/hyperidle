# `design/no-off-grid-spacing`

**Severity (K6):** `warn`.
**AQ rule:** AQ-001, AQ-002.
**Source of truth:** [AESTHETICS.md § Spacing & Density](../../../design-system/AESTHETICS.md#spacing--density).

## Why

Productivity systems (Material 3, IBM Carbon, Atlassian, Polaris, Tailwind)
all build on a 4px grid. The closed allowlist
`{4, 8, 12, 16, 20, 24, 32, 40, 48}` covers the productivity cluster.
The 2px sub-grid value is reserved for chip / icon internals only — see
AESTHETICS.md "Sub-grid 2px allowance" row.

## Incorrect

```tsx
<div className="p-[5px]" />
<div className="gap-[7px]" />
<div className="px-[6px] py-[2px]" />  // 2px subgrid outside chip context
```

## Correct

```tsx
<div className="p-[8px]" />
<div className="gap-[12px]" />
<div className="px-3 py-2" />          // Tailwind's grid scale is fine
```

## Cross-link

[AESTHETICS.md § Spacing & Density — Recommendations table](../../../design-system/AESTHETICS.md#recommendations) "Grid base unit" lint hint.
