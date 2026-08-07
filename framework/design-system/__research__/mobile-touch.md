# Research: Mobile & Touch

## Question set

- Touch-target minimums (WCAG 2.5.5 AAA / 2.5.8 AA, Apple HIG 44 pt, Material 48 dp, MS Fluent).
- Breakpoint conventions (Tailwind sm/md/lg/xl, Material breakpoints, Bootstrap, Polaris).
- Auto-density triggers — at what viewport width should HyperIdle auto-switch to comfortable?
- When should explicit user override win?
- Mobile body type minimum.
- Hit-slop vs visual size.

## Sources surveyed

- WCAG 2.1 SC 2.5.5 Target Size (AAA, 44x44 CSS px): https://www.w3.org/WAI/WCAG21/Understanding/target-size.html
- WCAG 2.2 SC 2.5.8 Target Size (Minimum) (AA, 24x24 CSS px): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Apple HIG — Buttons (44 pt min): https://developer.apple.com/design/human-interface-guidelines/buttons
- Apple HIG — Layout (touch sizing): https://developer.apple.com/design/human-interface-guidelines/layout
- Material 3 — Accessibility (48dp min): https://m3.material.io/foundations/accessible-design
- Material 3 — Window size classes: https://m3.material.io/foundations/layout/applying-layout/window-size-classes
- IBM Carbon — 2x Grid (responsive layout): https://carbondesignsystem.com/elements/2x-grid/overview/
- Tailwind — Responsive design (breakpoints): https://tailwindcss.com/docs/responsive-design
- Bootstrap — Breakpoints: https://getbootstrap.com/docs/5.3/layout/breakpoints/
- Shopify Polaris — Layout / responsiveness: https://polaris.shopify.com/design/typography
- MDN — Viewport meta: https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag

## Findings

### Touch target floor

- WCAG 2.1 SC 2.5.5 (AAA): 44x44 CSS pixels.
- WCAG 2.2 SC 2.5.8 (AA): 24x24 CSS pixels minimum.
- Apple HIG: 44 pt (44 CSS px) on iOS.
- Material 3: 48 dp (~48 CSS px) on Android.

Convergence on a touch-handled viewport: **44 CSS px is the cross-system floor**. Material's 48dp is slightly higher. Below the 44 px floor, only the WCAG 2.5.8 AA fallback at 24 px applies, and only when targets are spaced apart.

### Breakpoints

- Tailwind: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px.
- Bootstrap 5: `sm` 576px, `md` 768px, `lg` 992px, `xl` 1200px, `xxl` 1400px.
- Material window-size classes: compact <600dp, medium 600-840dp, expanded 840-1200dp, large 1200-1600dp, extra-large >=1600dp.
- Polaris: documents responsive layout using Tailwind-similar conventions (no Polaris-specific value cited for `md`).

Convergence on the **mobile/tablet split: 768px** (Tailwind `md`, Bootstrap `md`, near Material's medium boundary). Below 768px is "phone"; 768-1024 is "tablet"; >=1024 is "desktop".

### Auto-density behavior

- Material 3 explicitly maps window-size classes to padding/margin scaling (compact uses tighter outer margins).
- Apple HIG's Compact size class on iOS reduces vertical density.
- IBM Carbon's 2x Grid documentation maps responsive breakpoints (sm/md/lg/xl/max) to spacing scale offsets, providing the third independent organization for the 3-domain rule.

Three independent organizations (Google / Apple / IBM) support **viewport-driven density adjustment**. Combined with the touch-target floor, the recommendation is: **at viewport <= 1024 px (tablet and phone), auto-switch `[data-density]` to `comfortable`** so paddings and row heights expand to provide 44 px+ touch targets.

User override contract: density is a **tri-state Settings value**: `auto | default | compact | comfortable`. `auto` is the factory default and the only state in which the viewport switch fires. Once the user explicitly picks `default`, `compact`, or `comfortable`, that choice persists across breakpoints. Without the tri-state, "user picked default" is indistinguishable from "user has not chosen", so the auto-switch could never fire after first preference write.

### Mobile body type

iOS Safari zooms `<input>` smaller than 16px on focus (documented behavior; cited via WebAIM and Apple HIG typography). Material body-large is 16sp on mobile. The mobile body floor is **16 px on inputs**, with non-input body free to remain 14-15 px when inside the comfortable density preset (which already sets `--density-text` to 15 px).

### Hit-slop vs visual size

Apple HIG documents that small visual elements may have a larger hit area via padding. Material 3 documents 48dp minimum as the **interactive area**, not necessarily the visual size. The pattern is: visual size can be smaller than the touch target, achieved via transparent padding.

## Disagreements

- 44px (WCAG/Apple) vs 48dp (Material). Both pass 44; the recommendation locks to 44 px as the cross-platform floor.
- Bootstrap's 576/992 vs Tailwind's 640/1024. HyperIdle is on Tailwind so the Tailwind values apply.

## Draft recommendations rows

| Token | Current | Recommended | Rationale | Sources | Lintable | Lint hint |
|---|---|---|---|---|---|---|
| Minimum touch target | not codified | 44 CSS px on every interactive element at viewport <= 1024px | WCAG 2.5.5 AAA + Apple HIG converge on 44; Material's 48 exceeds it https://www.w3.org/WAI/WCAG21/Understanding/target-size.html https://developer.apple.com/design/human-interface-guidelines/buttons https://m3.material.io/foundations/accessible-design | WCAG, Apple HIG, Material 3 | partial | ast: button/link min-height >= 44px at mobile breakpoint |
| Mobile breakpoint | implicit Tailwind `md` 768px | codify 768px as mobile/tablet boundary, 1024px as tablet/desktop | Tailwind `md` + Bootstrap `md` + Material medium-class converge near 768; 1024 is the desktop floor https://tailwindcss.com/docs/responsive-design https://getbootstrap.com/docs/5.3/layout/breakpoints/ https://m3.material.io/foundations/layout/applying-layout/window-size-classes | Tailwind, Bootstrap, Material 3 | yes | regex: `@media \(min-width: (768\|1024)px\)` allowlisted |
| Auto-density behavior | none | `[data-density="comfortable"]` at viewport <= 1024 px when Settings preference is `auto` | Three independent organizations (Google, Apple, IBM) map viewport class to density: Material window-size classes, Apple HIG Compact mode, Carbon 2x-grid responsive guidance https://m3.material.io/foundations/layout/applying-layout/window-size-classes https://developer.apple.com/design/human-interface-guidelines/layout https://carbondesignsystem.com/elements/2x-grid/overview/ | Material 3 (Google), Apple HIG (Apple), Carbon 2x Grid (IBM) | partial | ast: AppShell hook reads `(window.innerWidth <= 1024) && settings.density === 'auto'` then sets `[data-density="comfortable"]` |
| Mobile input font-size | inherits 14px | 16 px on `<input>`, `<textarea>`, `<select>` at viewport <= 768 px | iOS Safari zoom mitigation cited across Apple HIG, MDN, WebAIM https://developer.apple.com/design/human-interface-guidelines/typography https://developer.mozilla.org/en-US/docs/Web/CSS/font-size https://webaim.org/techniques/fonts/ | Apple HIG, MDN, WebAIM | yes | regex: `<input.*className=.*` lacks `text-base` or `text-[16px]` at mobile |
| Touch target spacing | not codified | 8 px minimum between touch targets at mobile | Material 3 + WCAG 2.5.8 + Apple HIG all require non-overlapping touch targets https://m3.material.io/foundations/accessible-design https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html https://developer.apple.com/design/human-interface-guidelines/layout | Material 3, WCAG, Apple HIG | no | - |
