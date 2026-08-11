# AZ12 — Dark mode borders hold

## Work package

**Outcome.** In dark mode, dividers, card edges and separators are as legible as they are in light mode, so structure reads at a glance.

**Why this matters.** Dark mode is widely reported as feeling "flat" or "muddy", and the cause is narrower than it looks. The surface ladder is sound and near-identical across themes — container to elevated measures 5.3 units of lightness in light and 5.2 in dark. The defect is the border token: it sits 8.9 units of lightness from the card surface in light but only 2.0 in dark, so every divider and card edge dissolves. One token pair explains the whole complaint, which makes this a very small change with a disproportionate effect.

**What exists today.** Border tokens are defined per theme alongside the surface tokens. The dark values were chosen to sit close to their surfaces and are, measurably, too close to separate. Some card treatments compensate with shadow, which does not read on dark surfaces.

**Missing delta.** Dark border values that separate from their adjacent surfaces at parity with light.

**Depends on.** None.

**Complexity.** S

**Engineering tier.** mvp

**Pre-build.** Not required — this is a token value correction with a measurable target, not a new visual direction.

**Constraints.** Change token values only; no component may work around the theme by declaring its own border colour. The surface ladder is correct and is not in scope to change.

**Out of scope.** The light theme; shadows and elevation; any component's border geometry or radius.

## Acceptance criteria

- In dark mode, a divider or card edge is perceptible against the surface it sits on.
- The lightness separation between a border token and its adjacent surface is comparable between the two themes.
- The correction is made in theme token values, not in component styles.
- Automated evidence fails if a theme's border-to-surface separation falls below the agreed threshold.

## Validation scenarios

- Given the team page in dark mode, when the user views a card and a list of rows, then the card edge and every row separator are visible.
- Given both themes, when border-to-surface separation is measured, then neither theme is materially worse than the other.
