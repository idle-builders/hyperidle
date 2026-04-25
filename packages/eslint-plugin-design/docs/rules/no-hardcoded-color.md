# `design/no-hardcoded-color`

**Severity (K6):** `warn` (promotable to `error` in K8).
**AQ rule:** AQ-008, AQ-009.
**Source of truth:** [AESTHETICS.md § Color & Dark Mode](../../../design-system/AESTHETICS.md#color--dark-mode).

## Why

Hex / `rgb()` / `hsl()` literals inside `.tsx` component files bypass the
semantic-token layer (`tokens.css`). Bypassing tokens means the value cannot
follow theme switches (Lucid Dark ↔ Lucid Light) and cannot be tuned
centrally. Only `tokens.css` (and other CSS files) should hold raw color
values; component code addresses them by token.

## Incorrect

```tsx
const ring = "#ff00aa";
const bg = "rgb(0,0,0)";
```

## Correct

```tsx
const ring = "var(--primary)";
const bg = "var(--surface-1)";
```

## Cross-link

See AESTHETICS.md § Color & Dark Mode "Pure-black halation guard" and
"Raw Tailwind color usage" rows.
