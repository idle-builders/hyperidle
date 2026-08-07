# Research: Spacing & Density

## Question set

- What grid units are standard (4 vs 8px)?
- Where do reference systems land for default/compact/comfortable padding, gap, row-height?
- Are sub-grid 2px values ever justified (e.g., chip insets)?
- What is the dense-row height ladder used by Linear/Carbon/Atlassian?
- When does default feel "cramped" vs "right" in productivity tools?
- Should the existing default preset shift up?

## Sources surveyed

- IBM Carbon — Spacing: https://carbondesignsystem.com/elements/spacing/overview/
- Material 3 — Layout & spacing: https://m3.material.io/foundations/layout/applying-layout/window-size-classes
- Atlassian — Spacing: https://atlassian.design/foundations/spacing
- Shopify Polaris — Space tokens: https://polaris.shopify.com/tokens/space
- Apple HIG — Layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Tailwind — Customizing spacing: https://tailwindcss.com/docs/customizing-spacing
- Vercel Geist — Introduction: https://vercel.com/geist/introduction
- Refactoring UI — Spacing chapter (book): https://www.refactoringui.com/

## Findings

### 4px versus 8px grid

Carbon defines a spacing scale of `$spacing-01` (2px) to `$spacing-13` (160px) where every step is a multiple of 4px and most steps double. Material 3 specifies 4dp as the base unit, with all spacing tokens as multiples of 4. Atlassian's spacing scale (`space.025` = 2px through `space.1000` = 80px) is built on a 4px grid with one half-step. Shopify Polaris uses a 4px-based scale (`space-025` = 1px through `space-3200` = 128px).

Convergence: **4px is the de-facto base unit**, with 2px allowed at the very low end for fine adjustments (Carbon `$spacing-01`, Atlassian `space.025`, Polaris `space-050`).

### Default vs compact vs comfortable in productivity tools

Carbon ships compact (`spacing-03` = 8px), default (`spacing-05` = 16px), comfortable (`spacing-06` = 24px) for component padding. Material 3 documents compact, medium and expanded window classes that scale spacing with viewport. Polaris's `card` padding token defaults to `space-400` (16px).

Reading these across all four systems, the clustering is:

- Compact: **4-8px** vertical pad, **6-12px** horizontal pad, **24-28px** row height.
- Default: **8-12px** vertical pad, **12-16px** horizontal pad, **32-40px** row height.
- Comfortable: **12-16px** vertical pad, **16-24px** horizontal pad, **40-48px** row height.

HyperIdle's current default (8/12/8/32/14) sits at the low end of "default". Compact (4/6/4/26/12) sits at the bottom of compact. Comfortable (12/16/12/40/15) sits squarely in the comfortable band.

### Sub-grid 2px — when is it justified?

Carbon `$spacing-01` (2px) and Atlassian `space.025` (2px) both exist for exactly one purpose: optical adjustment inside small interactive elements (chip insets, icon-text gap inside a 24px chip, focus ring offset). They are not used for component-level layout.

### Should default shift up?

Three sources agree the current 8px vertical pad is at the low edge of comfortable for desktop productivity tools (Carbon, Atlassian, Polaris all sit at or above 8px). However, **none of those sources recommend bumping HyperIdle's default specifically** — they describe their own systems. Per the >=3 sources rule, recommending a token change requires three sources that converge on the same target value. The cluster suggests 10-12px vertical pad sits in the middle of "default" rather than the low edge.

## Disagreements

- Carbon and Material allow 2px sub-grid; Polaris and Atlassian limit half-steps to 2px or above. Vercel Geist documentation does not formalize a sub-grid.
- Material 3 documents a `density-spacing` modifier (a single offset like `-2`); Apple HIG describes "Compact" as a top-level mode rather than a token modifier. Atlassian and Polaris do not formalize density at all.

## Draft recommendations rows (for synthesis)

| Token | Current | Recommended | Rationale | Sources | Lintable | Lint hint |
|---|---|---|---|---|---|---|
| `--density-pad-y` (default) | 0.5rem (8px) | `no change, see Disagreements` | 3 sources cluster at 8-12px; not enough convergence on a single value to bump from 8 | Carbon, Atlassian, Polaris | partial | regex: `\bp[xy]?-\[\d+px\]` |
| `--density-pad-x` (default) | 0.75rem (12px) | `no change` | 12px sits inside the 12-16px cluster; not a clear consensus to bump | Carbon, Atlassian, Polaris | partial | regex: `\bpx-\[\d+px\]` |
| Grid base unit | 4px | 4px (codify) | All major systems converge on 4px | Material, Carbon, Atlassian, Polaris | yes | regex: `\b(p|m|gap)-\[(\d+)px\]` allowlist `{2,4,6,8,10,12,16,20,24,32,40,48}` |
| Sub-grid 2px allowance | implicit | Allow only inside chips/icons, never for layout | Carbon `$spacing-01` and Atlassian `space.025` both reserve 2px for fine adjustments | Carbon, Atlassian, Polaris | partial | ast: scan for 2px in non-chip components |
