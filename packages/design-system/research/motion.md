# Research: Motion

## Question set

- Duration tiers across Material/Apple/Carbon.
- Easing-curve conventions.
- `prefers-reduced-motion` enforcement.
- Skeleton vs spinner research.
- GPU-property restriction.
- Acceptable max for UI transitions.

## Sources surveyed

- Material 3 — Motion (easing/duration tokens): https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
- Material 3 — Motion (overview): https://m3.material.io/styles/motion/overview
- Apple HIG — Motion: https://developer.apple.com/design/human-interface-guidelines/motion
- IBM Carbon — Motion (overview): https://carbondesignsystem.com/guidelines/motion/overview/
- IBM Carbon — Motion (basics, durations): https://carbondesignsystem.com/guidelines/motion/basics/
- Atlassian — Motion: https://atlassian.design/foundations/motion
- MDN — `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- WCAG SC 2.3.3 Animation from Interactions: https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html
- Tailwind — Transition Duration: https://tailwindcss.com/docs/transition-duration

## Findings

### Duration tiers

- Material 3: `short1` 50ms, `short2` 100ms, `short3` 150ms, `short4` 200ms; `medium1` 250ms, `medium2` 300ms, `medium3` 350ms, `medium4` 400ms; `long1`-`long4` up to 600ms; `extra-long1`-`4` up to 1000ms.
- Carbon: `fast-01` 70ms, `fast-02` 110ms, `moderate-01` 150ms, `moderate-02` 240ms, `slow-01` 400ms, `slow-02` 700ms.
- Atlassian: small 100ms, medium 200ms, large 400ms.

Convergence:
- **Micro-interactions: 70-150ms** (Material short1/2, Carbon fast-01/02, Atlassian small).
- **Disclosure / state changes: 150-300ms** (Material short3-medium2, Carbon moderate-01/02, Atlassian medium).
- **Overlay open/close: 250-400ms** (Material medium2-4, Carbon slow-01, Atlassian large).
- **Anything > 400ms is exceptional** (Carbon slow-02 is the upper bound for product UI).

HyperIdle's tiers (80/150/250) sit inside the convergence band on each tier. No bump warranted.

### Easing curves

- Material `emphasized` cubic-bezier(0.2, 0, 0, 1); `standard` cubic-bezier(0.2, 0, 0, 1); accelerate/decelerate variants.
- Carbon `productive` standard-easing `cubic-bezier(0.2, 0, 0.38, 0.9)`; `entrance` and `exit` variants.
- Atlassian motion easing curves documented as "ease-in-out" defaults with explicit cubic-bezier alternates.

Convergence: **bespoke cubic-bezier tuned for the system, not raw `ease`**. HyperIdle currently uses CSS `ease` default. Three sources support a custom curve, but they each pick different curves — no convergence on a specific value. Recommendation: `no change` until a downstream story allocates time to tune.

### `prefers-reduced-motion`

- MDN documents the `(prefers-reduced-motion: reduce)` media query as the standard hook.
- WCAG SC 2.3.3 (AAA) recommends respecting reduced-motion preferences.
- Material, Carbon, and Atlassian motion docs all explicitly require the system honor reduced-motion.

Convergence: **must respect `prefers-reduced-motion`** on every animation. Lintable as "any `transition` or `animation` declaration without a `@media (prefers-reduced-motion)` fallback at the file or component level".

### Skeleton vs spinner

Carbon and Material both ship skeleton components and recommend them for content placeholders; spinners are reserved for indeterminate operations. Atlassian motion docs reference both. HyperIdle ships both already.

### GPU-property restriction

All three systems' motion docs warn against animating layout-triggering properties (width, height, top, left). The cross-system advice is to animate **transform** and **opacity** only. Tailwind documents `transition-transform` and `transition-opacity` as the default safe choices.

## Disagreements

- Custom cubic-bezier curves: each system picks a different curve. No 3-source consensus on a specific easing value. Recommendation `no change`.
- Total duration cap: Carbon goes to 700ms for `slow-02`; Material extra-long-4 reaches 1000ms; HyperIdle caps at 250ms. The current cap is conservative but inside the safe band.

## Draft recommendations rows

| Token | Current | Recommended | Rationale | Sources | Lintable | Lint hint |
|---|---|---|---|---|---|---|
| `--motion-fast` | 80ms | no change | All three systems place micro-interactions in 70-150ms https://m3.material.io/styles/motion/easing-and-duration/tokens-specs https://carbondesignsystem.com/guidelines/motion/basics/ https://atlassian.design/foundations/motion | Material 3, Carbon, Atlassian | yes | regex: `duration-\[\d+ms\]` allowlist `{80,150,250}` |
| `--motion-medium` | 150ms | no change | Sits inside disclosure-state band 150-300ms across all three systems https://m3.material.io/styles/motion/easing-and-duration/tokens-specs https://carbondesignsystem.com/guidelines/motion/basics/ https://atlassian.design/foundations/motion | Material 3, Carbon, Atlassian | yes | regex: `duration-\[150ms\]` |
| `--motion-slow` | 250ms | no change | Inside overlay band 250-400ms https://m3.material.io/styles/motion/easing-and-duration/tokens-specs https://carbondesignsystem.com/guidelines/motion/basics/ https://atlassian.design/foundations/motion | Material 3, Carbon, Atlassian | yes | regex: `duration-\[250ms\]` |
| Easing curve | CSS `ease` default | no change (note: tunable by future story) | Three systems use bespoke cubic-bezier but disagree on the curve; no 3-source consensus https://m3.material.io/styles/motion/easing-and-duration/tokens-specs https://carbondesignsystem.com/guidelines/motion/basics/ https://atlassian.design/foundations/motion | Material 3, Carbon, Atlassian | no | - |
| `prefers-reduced-motion` honoring | not enforced at lint | required at file with `transition`/`animation` | Three systems plus WCAG mandate respecting reduced-motion https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html https://m3.material.io/styles/motion/overview | MDN, WCAG, Material 3 | partial | ast: any file with `transition:` or `animation:` should reference `prefers-reduced-motion` |
| Animated property allowlist | not enforced | `transform`/`opacity` only | All three systems warn against layout-triggering animations https://m3.material.io/styles/motion/overview https://carbondesignsystem.com/guidelines/motion/overview/ https://atlassian.design/foundations/motion | Material 3, Carbon, Atlassian | partial | regex: `transition-(width\|height\|top\|left\|right\|bottom)` flagged |
