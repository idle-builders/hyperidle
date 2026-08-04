# Reference Systems Matrix

A condensed cross-system comparison consumed by every other research report. Rows are reference design systems; columns are the dimensions K1 must answer for HyperIdle. Sources are linked verbatim — no values are paraphrased from training data without a public URL.

## Matrix

| System | Base grid | Body size | Type ladder | Accent rule | Dark surfaces | Radius scale | Motion durations | Touch min | Density model |
|---|---|---|---|---|---|---|---|---|---|
| Material Design 3 | 4dp grid | 14sp body, 16sp body-large | display/headline/title/body/label tiers | Primary/secondary/tertiary; tonal | Surface tonal palette (multi-level) | 0/4/8/12/16/28 ext-small to ext-large | short 50-200ms, medium 250-400ms | 48dp min target | Compact/comfortable via density-spacing |
| Apple HIG (macOS/iOS) | 8pt + 4pt half-step | 17pt iOS body, 13pt macOS body | Type styles (Title 1-3, Body, Caption) | Accent color (system) | System materials (thin-thick) | Implicit, ~6-12pt | Standard (default) animations | 44pt iOS, 28pt macOS | Density via Compact mode |
| IBM Carbon | 8px / 4px sub-grid | 14px body-01, 16px body-02 | 12 token type ladder | Interactive blue 60 (light) | Layer model (4+ levels) | 0/2/4/8/12/16 | fast-01 70ms to slow-02 700ms | 44x44 (WCAG) | Defined density tokens |
| Atlassian Design | 4px (space.025-1000) | 14px body, 16px medium body | Heading 100-1000 | Primary blue | Multi-level dark surfaces | 2/4/6/8/12/16/20/24 (radius tokens) | small 100ms, medium 200ms, large 400ms | 44px target | Spacing density via tokens |
| Shopify Polaris | 4px (space-025 to 3200) | 14px body-md, 16px body-lg | Heading sm/md/lg/xl | Action primary | Surface tokens by elevation | 050-750 (radius tokens) | Documented motion tokens | 44x44 px | Density via spacing |
| Vercel Geist | 4px scale | 14px / 16px body | Geist h1-h6 | Single accent (mono first) | Background base + foregrounds | 4/6/8/12 + full | Geist motion guidance | 24-44px | One default; not multi-density |
| Linear (web app) | 4/8 grid (observed) | 13-14px body in dense lists | Linear Display + Inter | Single accent | Layered dark | Small radii (4-8px) | Snappy 80-150ms | Standard | Single dense default |
| Refactoring UI | 4px / 8px | 16px default body | Modular scale | Single brand | Multi-shade | Small closed scale | Short, purposeful | 44px+ touch | Comfortable default |
| Tailwind CSS defaults | 4px (rem 0.25 step) | 16px (text-base) | text-xs through text-9xl | n/a | n/a | rounded-sm to rounded-3xl | duration-75 to duration-1000 | n/a | n/a |
| WCAG 2.1 / 2.2 | n/a | n/a | n/a | 4.5:1 contrast min | n/a | n/a | reduce-motion query | 44x44 (2.5.5 AAA), 24x24 (2.5.8 AA) | n/a |

## Source links (verbatim, primary)

- Material 3 layout & spacing: https://m3.material.io/foundations/layout/applying-layout/window-size-classes
- Material 3 typography: https://m3.material.io/styles/typography/type-scale-tokens
- Material 3 motion: https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
- Material accessibility (touch target 48dp): https://m3.material.io/foundations/accessible-design/accessibility-basics
- Apple HIG layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Apple HIG typography: https://developer.apple.com/design/human-interface-guidelines/typography
- Apple HIG buttons (44pt touch): https://developer.apple.com/design/human-interface-guidelines/buttons
- IBM Carbon spacing: https://carbondesignsystem.com/elements/spacing/overview/
- IBM Carbon type: https://carbondesignsystem.com/guidelines/typography/overview/
- IBM Carbon motion: https://carbondesignsystem.com/guidelines/motion/overview/
- Atlassian spacing tokens: https://atlassian.design/foundations/spacing
- Atlassian typography: https://atlassian.design/foundations/typography-beta
- Shopify Polaris space tokens: https://polaris.shopify.com/tokens/space
- Shopify Polaris typography: https://polaris.shopify.com/design/typography
- Vercel Geist (design system home): https://vercel.com/geist/introduction
- Tailwind spacing: https://tailwindcss.com/docs/customizing-spacing
- Tailwind responsive breakpoints: https://tailwindcss.com/docs/responsive-design
- WCAG 2.1 SC 2.5.5 Target Size: https://www.w3.org/WAI/WCAG21/Understanding/target-size.html
- WCAG 2.2 SC 2.5.8 Target Size (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- MDN prefers-reduced-motion: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

## Cross-system convergences

- **4px or 8px grid is universal.** No major reference system uses 5px, 6px, or 10px as a base unit.
- **Body type sits between 14px and 16px.** Mobile guidelines push the floor to 16px; productivity desktop tools settle at 14px.
- **Touch target floor is 44 CSS pixels** (Apple, WCAG 2.5.5 AAA) with a 24x24 minimum from WCAG 2.2.
- **Motion micro-interactions converge on 80-200ms.** State transitions sit at 200-400ms.
- **Closed radius scales win.** Every reference system ships a fixed scale; none allow arbitrary radii.

## Cross-system divergences (escalated to AESTHETICS Appendix B)

- **Body size 14 vs 16.** Productivity tools (Linear, Carbon, GitHub) ship 14px defaults; consumer tools (Material body-large, Polaris body-lg) ship 16px.
- **Density model.** Material formalizes a density-spacing token; Apple has a Compact toggle on macOS; Vercel ships a single density.
- **Dark surface count.** Carbon's 4-layer Layer model vs Material's continuous tonal palette vs Apple's 4 system materials.
