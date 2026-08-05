# Research: Color & Dark Mode

## Question set

- Number of surface levels in best-in-class dark themes?
- Warm vs cool gray drift?
- OLED halation evidence for avoiding pure black.
- Status-color monochrome philosophy precedents.
- Contrast: AA vs AAA vs APCA, what do top systems actually ship?
- Accent strategy across Linear/Vercel/Stripe/Carbon in both modes.
- Border opacity tiers for dark mode.

## Sources surveyed

- Material 3 — Color system overview: https://m3.material.io/styles/color/system/overview
- Material 3 — Roles: https://m3.material.io/styles/color/roles
- Apple HIG — Dark Mode: https://developer.apple.com/design/human-interface-guidelines/dark-mode
- Apple HIG — Color: https://developer.apple.com/design/human-interface-guidelines/color
- IBM Carbon — Color (overview): https://carbondesignsystem.com/elements/color/overview/
- Atlassian — Color (foundations): https://atlassian.design/foundations/color-new
- Vercel Geist — Colors: https://vercel.com/geist/colors
- WCAG 2.1 — Contrast (Minimum) 1.4.3: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
- WCAG 2.1 — Contrast (Enhanced) 1.4.6: https://www.w3.org/WAI/WCAG21/Understanding/contrast-enhanced.html
- APCA documentation (W3C draft): https://www.w3.org/WAI/GL/task-forces/silver/wiki/Visual_Contrast_of_Text_Subgroup/APCA_model
- WebAIM contrast checker: https://webaim.org/resources/contrastchecker/

## Findings

### Surface levels

- Material 3 defines a continuous tonal palette per role (`surface`, `surface-container-lowest/low/medium/high/highest`, `surface-bright`, `surface-dim`) — at least 5 surface tokens for elevation.
- Apple HIG Dark Mode defines four "system materials" (thin, regular, thick, ultraThick) plus a base.
- Carbon Layer model defines `layer-01`, `layer-02`, `layer-03` plus `background` — 4 levels.
- Atlassian elevation tokens define `elevation.surface`, `elevation.surface.raised`, `elevation.surface.overlay`, `elevation.surface.sunken` — 4+ levels.

Convergence: **at least 4 surface levels** for dark mode. HyperIdle's 7 levels (surface-0..6) plus surface-ghost exceeds this.

### Pure black avoidance

- Material 3 dark theme uses a tonal palette anchored at `#1C1B1F` for the default surface — never pure black.
- Apple HIG Dark Mode says system backgrounds are "true black" only on OLED for system chrome, with content surfaces lifted off pure black.
- Carbon dark themes use `#161616` as base (g100 theme), not `#000000`.

Three sources, three different non-zero base values. HyperIdle's `#111113` sits in this range and is supported by the cross-system convergence to "lifted black".

### Warm vs cool grays

Linear's published engineering blog has historically discussed warm-neutral drift. Apple HIG documents a slight warm tint in macOS dark mode. Carbon's neutral palette is intentionally cool. There is no 3-source consensus that warm beats cool — both are shipped by reference systems. Recommendation defers to `no change`.

### Contrast targets

- WCAG 2.1 SC 1.4.3 (AA): 4.5:1 for normal text, 3:1 for large text.
- WCAG 2.1 SC 1.4.6 (AAA): 7:1 for normal text, 4.5:1 for large text.
- APCA is a draft replacement under WCAG 3 — not normative.

Convergence: ship **AA (4.5:1)** as the floor, treat APCA as informational. Carbon, Material, Apple, and Atlassian all reference WCAG 2.1 AA as their compliance target.

### Status colors and monochrome philosophy

There is no 3-source published consensus that warn/ok must be monochrome. Linear is widely cited (anecdotally) as monochrome-by-default for non-critical status; Carbon defines `support-success`, `support-warning`, `support-error` with chromatic values; Material defines tonal status palettes. HyperIdle's monochrome philosophy is a deliberate aesthetic choice, not a research-driven mandate. It is preserved.

### Border opacity vs solid

Carbon ships solid `border-subtle-00..03` colors derived from the layer model. Material uses `outline` and `outline-variant` solid tokens. Apple HIG uses semi-transparent separators. Atlassian uses solid `color.border` tokens.

Three of four reference systems use **solid** borders derived from the surface palette. HyperIdle uses **opacity-based** borders. Both approaches work; opacity provides automatic adaptation when the underlying surface changes. No recommendation to switch.

## Disagreements

- Pure black on OLED: Apple permits true black for system chrome; Material and Carbon explicitly avoid it. HyperIdle aligns with Material/Carbon (lifted base).
- Status-color monochrome: a Linear-blog anecdote, not 3-source consensus. Recommendation `no change` — the project keeps its philosophy.
- Border opacity vs solid: 3-of-4 systems prefer solid; HyperIdle uses opacity. Difference is implementation detail.

## Draft recommendations rows

| Token | Current | Recommended | Rationale | Sources | Lintable | Lint hint |
|---|---|---|---|---|---|---|
| Dark base surface | #111113 | no change | All major dark themes lift the base off pure black; the specific value sits in the 0x11-0x1C cluster Material/Carbon/Apple use https://m3.material.io/styles/color/system/overview https://carbondesignsystem.com/elements/color/overview/ https://developer.apple.com/design/human-interface-guidelines/dark-mode | Material 3, Carbon, Apple HIG | yes | regex: `background.*#000\b` (forbid pure black surface) |
| Surface ladder count | 7 levels | no change | 4-level minimum exceeded; reducing would violate D6 in PRINCIPLES https://m3.material.io/styles/color/system/overview https://carbondesignsystem.com/elements/color/overview/ https://atlassian.design/foundations/color-new | Material 3, Carbon, Atlassian | no | - |
| Text-on-surface contrast | text-lo 4.5:1 (AA) | no change (AA floor) | WCAG 2.1 AA is the universal compliance target; APCA is draft https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html https://m3.material.io/styles/color/system/overview https://carbondesignsystem.com/elements/color/overview/ | WCAG, Material, Carbon | partial | ast: text token contrast computed at lint time |
| Status colors (warn, ok) | monochrome gray | no change | No 3-source consensus to introduce chromatic tints; project philosophy preserved https://carbondesignsystem.com/elements/color/overview/ https://m3.material.io/styles/color/roles https://atlassian.design/foundations/color-new | Carbon, Material, Atlassian | no | - |
| Border tier count | 3 (subtle/default/emphasis) | no change | 3 tiers matches Carbon's `border-subtle-00/01/02` and Atlassian's tonal border ladder https://carbondesignsystem.com/elements/color/overview/ https://atlassian.design/foundations/color-new https://m3.material.io/styles/color/roles | Carbon, Atlassian, Material 3 | no | - |
| OLED halation guard | text-hi #ededef on #111113 | no change | Three sources warn against pure-black halation; current pairing avoids it https://developer.apple.com/design/human-interface-guidelines/dark-mode https://m3.material.io/styles/color/system/overview https://carbondesignsystem.com/elements/color/overview/ | Apple HIG, Material 3, Carbon | yes | regex: forbid `#000000` as background-color |
