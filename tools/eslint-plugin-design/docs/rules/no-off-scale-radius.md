# `design/no-off-scale-radius`

**Severity (K6):** `warn`.
**AQ rule:** AQ-011.
**Source of truth:** [AESTHETICS.md § Borders/Radii/Shadows](../../../design-system/AESTHETICS.md#bordersradiishadows) and `framework/design-system/src/tokens.css` (`--r0..r3`, `--r-pill`).

## Why

The closed productivity radius scale is `0 / 4 / 8 / 12 + pill` — Material 3,
Atlassian and shadcn/ui all converge here. Anything 16px or larger reads as an
expressive / consumer surface and is one of the strongest AI-aesthetic tells
(see also `design/no-ai-aesthetic` tell #1).

## Incorrect

```tsx
<div className="rounded-[10px]" />
<div className="rounded-[16px]" />
<div className="rounded-tl-[6px]" />
```

## Correct

```tsx
<div className="rounded-[8px]" />
<div className="rounded-full" />
<div style={{ borderRadius: "var(--r2)" }} />
```

## Cross-link

[AESTHETICS.md § Borders/Radii/Shadows — Recommendations](../../../design-system/AESTHETICS.md#recommendations-3) "Radius scale" row.
