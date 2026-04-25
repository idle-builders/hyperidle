# `design/require-focus-on-interactive`

**Severity (K6):** `warn`.
**AQ rule:** AQ-015 (touch target / a11y), WCAG 2.1 SC 2.1.1 (Keyboard).
**Source of truth:** [AESTHETICS.md § Mobile & Touch](../../../design-system/AESTHETICS.md#mobile--touch).

## Why

A `<div onClick>` or `<span onClick>` is invisible to keyboard navigation
and screen readers unless it explicitly opts in. The cleanest fix is to
use a real `<button>`. If you must keep the `div` (layout reasons), prove
you've handled focus by adding `tabIndex={0}`, an explicit `role="button"`
(or another interactive role), or a `focus-visible:` Tailwind class.

## Incorrect

```tsx
<div onClick={() => {}}>Click me</div>
<span onClick={handler}>X</span>
```

## Correct

```tsx
<button type="button" onClick={() => {}}>Click me</button>

<div onClick={() => {}} tabIndex={0} role="button">Click me</div>

<span onClick={handler} className="focus-visible:ring-2">X</span>
```

## Cross-link

[AESTHETICS.md § Mobile & Touch](../../../design-system/AESTHETICS.md#mobile--touch) "Minimum touch target" row, and WCAG 2.1 SC 2.1.1 (Keyboard).
