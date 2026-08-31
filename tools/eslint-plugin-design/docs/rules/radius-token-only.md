# `design/radius-token-only`

**Severity:** `error` in both scopes — `layers/core-ui/src/ds/**` and the rest of `layers/core-ui/src/**` — via `hearth-config.ts`.
**AQ rule:** AQ-011.
**Source of truth:** the radius tokens in `layers/core-ui/src/ds/tokens.css`, and AQ-011 in `.claude/rules/aesthetic-quality.md`. and `framework/design-system/src/tokens.css` (`--r-none/--r-subtle/--r-default/--r-pill`).

## Why

AZ7 replaced `no-off-scale-radius` with this rule. The old rule checked the
radius's *pixel value* against the Hearth scale `{0,10,16,9999}` and allowed
any class spelling that landed on it — including `rounded-full` and
`rounded-2xl`. That is exactly the defect AZ7 closes: pill had two spellings
(`rounded-full` and `rounded-[var(--r-pill)]`), and Chrome's computed value for
`rounded-full` (`calc(infinity * 1px)`, clamped to `33,554,432px`) reads as an
egregious off-scale outlier to any computed-style measurement, when it is
really the pill through its other spelling.

`radius-token-only` checks the *spelling*, not just the value: the only
permitted non-zero radius is a `--r-*` token (`rounded-[var(--r-subtle)]`,
`rounded-[var(--r-default)]`, `rounded-[var(--r-pill)]`, with an optional
side/corner infix). Zero radius may be `rounded-none` — there is no
`--r-none` class form in use. Every other Tailwind radius spelling — named
(`rounded`, `rounded-lg`, `rounded-2xl`, …) or arbitrary-pixel
(`rounded-[8px]`) — is a violation, even when the pixel value happens to be
on-scale.

## Incorrect

```tsx
<div className="rounded-full" />       {/* pill's second spelling */}
<div className="rounded-2xl" />        {/* on-scale value, off-scale spelling */}
<div className="rounded-[16px]" />     {/* on-scale value, off-scale spelling */}
<div className="rounded-lg" />
```

## Correct

```tsx
<div className="rounded-none" />
<div className="rounded-[var(--r-subtle)]" />
<div className="rounded-[var(--r-default)]" />
<div className="rounded-[var(--r-pill)]" />
```

## Cross-link

[AESTHETICS.md § Borders/Radii/Shadows — Recommendations](../../../design-system/AESTHETICS.md#recommendations-3) "Radius scale" row.
