# `design/no-raw-tailwind-color`

**Severity (K6):** `warn`.
**AQ rule:** AQ-008.
**Source of truth:** [AESTHETICS.md § Color & Dark Mode](../../../design-system/AESTHETICS.md#color--dark-mode) "Raw Tailwind color usage" lint hint.

## Why

Raw Tailwind palette classes (e.g. `bg-blue-500`, `text-indigo-400`,
`border-red-500`) bypass the Lucid semantic-token system. Productivity systems
(Carbon, Material 3, Atlassian) all require named semantic tokens for color
because they are theme-aware (Lucid Dark / Lucid Light), state-aware
(`--primary-hover`, `--primary-dim`), and centrally tunable.

## Incorrect

```tsx
<div className="bg-blue-500" />
<div className="text-indigo-400 border-red-500" />
<div className="ring-emerald-300" />
```

## Correct

```tsx
<div className="bg-surface-1" />
<div className="text-text-hi border-border-default" />
<div className="ring-[var(--primary)]" />
```

## Cross-link

[AESTHETICS.md § Color & Dark Mode — Recommendations](../../../design-system/AESTHETICS.md#recommendations-2) "Raw Tailwind color usage" row.
