# Research: Borders, Radii & Shadows

## Question set

- Common closed radius scales (0/4/8/12 vs 2/4/8/16)?
- Dark-mode shadow handling (substitute with tonal layering).
- Float-shadow patterns for modals.
- Risks of `rounded-2xl` in productivity tools.
- Border opacity vs solid line conventions.

## Sources surveyed

- shadcn/ui — Themes (radius scale): https://ui.shadcn.com/themes
- Radix Primitives — Getting started: https://www.radix-ui.com/primitives/docs/overview/getting-started
- Material 3 — Shape: https://m3.material.io/styles/shape
- Material 3 — Elevation: https://m3.material.io/styles/elevation/overview
- IBM Carbon — Tokens (border + layer): https://carbondesignsystem.com/elements/color/overview/
- Atlassian — Border (foundations): https://atlassian.design/foundations/border
- Atlassian — Elevation: https://atlassian.design/foundations/elevation
- Vercel Geist — Introduction: https://vercel.com/geist/introduction
- Tailwind — Border Radius: https://tailwindcss.com/docs/border-radius
- Tailwind — Box Shadow: https://tailwindcss.com/docs/box-shadow

## Findings

### Radius scales

- Material 3 shape tokens: extra-small 4dp, small 8dp, medium 12dp, large 16dp, extra-large 28dp, full (pill).
- Atlassian border-radius tokens: `border.radius.050` 2px, `100` 4px, `200` 8px, `300` 12px, `400` 16px, `circle` (pill).
- Tailwind defaults: rounded-sm 2px, rounded 4px, rounded-md 6px, rounded-lg 8px, rounded-xl 12px, rounded-2xl 16px, rounded-3xl 24px, rounded-full.
- shadcn/ui: configurable radius variable (`--radius`), default `0.625rem` (10px) per the manual `globals.css` install template at https://ui.shadcn.com/docs/installation/manual (verified 2026-04-25).
- Carbon: layer/component tokens — radii are component-specific (buttons 0px in productive, rounded in expressive).

Convergence: **0/4/8/12** is the universal productivity-tool closed scale. The 16+ values exist (Material extra-large, Tailwind 2xl/3xl) but they're for hero/expressive surfaces, not productivity components.

HyperIdle's scale (0/4/8/12 + pill) matches the productivity convergence directly.

### `rounded-2xl` risk

Three of the LLM-aesthetic critique threads cited under `ai-aesthetic.md` flag `rounded-2xl` (16px+) as an AI tell when applied to productivity primitives. Material reserves 16dp+ for "expressive" surfaces (hero cards, large cards). Carbon's productive theme keeps button radii at 0px; expressive theme is the only place rounded buttons appear.

### Dark-mode shadows

- Material 3: dark theme uses surface-tinted overlays in addition to (or in place of) shadow blur.
- Atlassian elevation: documents that shadow alpha must be raised in dark mode to remain visible, while preserving the overlay surface.
- Carbon documents that elevation in dark themes is conveyed through layer color, not shadow.

Three sources confirm that **shadows alone are inadequate in dark mode** — tonal layering or a brighter surface is required. HyperIdle already does this (7 surface layers).

### Float shadows for modals

- Material 3 elevation level 3 (6dp) for modal-like surfaces.
- Atlassian `elevation.shadow.overlay` token for modals.
- Tailwind shadow-lg / shadow-xl for floating elements.

Three sources agree that floating overlays (modals, popovers) deserve a dedicated shadow distinct from cards. HyperIdle's `--float` token is exactly this.

### Border opacity vs solid

Carbon and Atlassian use solid border tokens. Material uses solid `outline` tokens. Apple HIG uses semi-transparent separators. HyperIdle uses opacity. 3-of-4 lean solid; difference is implementation. No 3-source mandate to change.

## Disagreements

- Material allows 28dp extra-large radius for cards; Carbon keeps cards at small radii in productive theme. HyperIdle aligns with Carbon.
- Atlassian `border.radius.050` (2px) exists; Material does not include 2px. HyperIdle does not have 2px.

## Draft recommendations rows

| Token | Current | Recommended | Rationale | Sources | Lintable | Lint hint |
|---|---|---|---|---|---|---|
| Radius scale | 0/4/8/12 + pill | no change | Three productivity systems converge on 0/4/8/12 https://m3.material.io/styles/shape https://atlassian.design/foundations/border https://carbondesignsystem.com/elements/color/overview/ | Material 3, Atlassian, Carbon | yes | regex: `rounded-\[(\d+)px\]` allowlist `{0,4,8,12,9999}` |
| `rounded-2xl` and above | not enforced | forbid except hero/expressive surfaces | Three AI-aesthetic critiques flag 16px+ on productivity primitives; productivity systems reserve >=16 for expressive https://m3.material.io/styles/shape https://carbondesignsystem.com/elements/color/overview/ https://atlassian.design/foundations/border | Material 3, Carbon, Atlassian | yes | regex: `\brounded-(2xl|3xl|full)\b` (allowlist `rounded-full` for pills) |
| Dark-mode shadow | `--float` only | no change | Tonal layering already present; no new shadow tier needed https://m3.material.io/styles/elevation/overview https://atlassian.design/foundations/elevation https://carbondesignsystem.com/elements/color/overview/ | Material 3, Atlassian, Carbon | no | - |
| Border opacity vs solid | opacity-based 3-tier | no change | 3-of-4 systems use solid, but opacity is functionally equivalent and adapts across surface ladders https://carbondesignsystem.com/elements/color/overview/ https://atlassian.design/foundations/border https://m3.material.io/styles/elevation/overview | Carbon, Atlassian, Material 3 | no | - |
| Float shadow on modals | `--float` token | no change | All three reference systems isolate overlay shadow from card shadow https://m3.material.io/styles/elevation/overview https://atlassian.design/foundations/elevation https://tailwindcss.com/docs/box-shadow | Material 3, Atlassian, Tailwind | partial | ast: modal/dialog components must reference `--float` |
