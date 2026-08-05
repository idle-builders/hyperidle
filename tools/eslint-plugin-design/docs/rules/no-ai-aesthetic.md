# `design/no-ai-aesthetic`

**Severity (K6):** `warn`.
**AQ rules:** AQ-101, AQ-102, AQ-107, AQ-012, AQ-111.
**Source of truth:** [AESTHETICS.md § AI-Aesthetic Anti-Patterns](../../../design-system/AESTHETICS.md#ai-aesthetic-anti-patterns).

## Why

LLM-generated UI defaults to a recognizable signature: oversized rounded
corners, indigo-purple gradients, glassmorphism, heavy drop shadows on
cards, and gradient-on-text headings. This rule fires the SCREENSHOT-DETECTABLE
+ regex-detectable tells from the K1 catalog. Three or more screenshot tells
in a single frame fails the predictive checklist (see
`research/ai-aesthetic.md`).

## Tells covered

| # | Tell | Pattern |
|---|---|---|
| 1 | Oversized radius | `rounded-2xl`, `rounded-3xl` |
| 2 | AI-aesthetic gradient bg | `bg-gradient-*` + `{from,via,to}-{indigo|purple|violet|fuchsia|pink}-NNN` |
| 7 | Glass morphism | `backdrop-blur*`, `backdrop-filter*` |
| 10 | Heavy shadow on cards | `shadow-{lg,xl,2xl}` outside Modal/Dialog/Popover/Tooltip files |
| 13 | Gradient-on-text | `bg-clip-text` + `text-transparent` |

## Incorrect

```tsx
<div className="rounded-2xl" />
<div className="bg-gradient-to-r from-indigo-500 to-purple-500" />
<div className="backdrop-blur-md" />
<div className="shadow-xl" />              // not in Modal/Dialog/Popover/Tooltip
<h1 className="bg-clip-text text-transparent" />
```

## Correct

```tsx
<div className="rounded-[8px]" />
<div className="bg-surface-1" />
<div className="bg-surface-2" />
<div className="shadow-sm" />               // tonal layering carries elevation
<h1 className="text-text-hi" />
```

## Cross-link

[AESTHETICS.md § AI-Aesthetic Anti-Patterns — Anti-pattern catalog (15 tells)](../../../design-system/AESTHETICS.md#anti-pattern-catalog).
