# Research: Typography

## Question set

- What is the reference-system body size for productivity tools (14/15/16)?
- Should HyperIdle bump body and/or headings?
- What weights and line-heights for body, label, caption, mono, headings?
- Tabular numerals — when required?
- Mono usage for IDs/timestamps.
- Is the current 24/18/14/13/12/11 ladder coherent or does it have gaps?
- Mobile body minimum.

## Sources surveyed

- Apple HIG — Typography: https://developer.apple.com/design/human-interface-guidelines/typography
- Material 3 — Type scale tokens: https://m3.material.io/styles/typography/type-scale-tokens
- IBM Carbon — Typography: https://carbondesignsystem.com/guidelines/typography/overview/
- Atlassian — Typography (beta): https://atlassian.design/foundations/typography-beta
- Shopify Polaris — Typography: https://polaris.shopify.com/design/typography
- Practical Typography (Butterick) — Point size: https://practicaltypography.com/point-size.html
- Refactoring UI (book): https://www.refactoringui.com/
- WebAIM — Body text size: https://webaim.org/techniques/fonts/
- MDN font-size: https://developer.mozilla.org/en-US/docs/Web/CSS/font-size

## Findings

### Body type size

- Carbon body-01 is 14px; body-02 is 16px. Productivity contexts default to body-01.
- Material 3 body-large is 16sp; body-medium is 14sp; body-small is 12sp.
- Apple iOS Body is 17pt (~17px); macOS body in window content is typically 13pt (~13px).
- Polaris body-md is 14px; body-lg is 16px.
- Atlassian Heading 100/200 set base body around 14px.
- Practical Typography recommends 15-25px on the web, biased toward 18-21px for prose. Productivity UIs are explicitly outside the prose use case.
- WebAIM recommends "at least 16 pixels" for general body text but acknowledges design systems frequently use 14px for dense data UIs.

Convergence for productivity-tool body: **14px is the modal value** (Carbon body-01, Polaris body-md, Atlassian heading-100, Linear in observed UI). 16px is the consumer-content default.

HyperIdle's current 14px body sits at the productivity-tool consensus. Bumping to 15px or 16px would move toward the consumer-content default but would not match a specific productivity-tool reference.

### Headings

Material 3 headlines: small 24, medium 28, large 32. Title: small 14, medium 16, large 22. Carbon productive headings: 14/16/20/28/32/42. Polaris heading-sm/md/lg/xl: 14/16/20/24. Apple HIG Title 1/2/3 are 28/22/20pt on iOS.

HyperIdle's heading ladder (24/18/14) is a tight productivity-tool ramp; it skips the typical 20-22 step.

### Mono / data type

- Carbon code-01 is 12px and code-02 is 14px (IBM Plex Mono).
- Polaris uses `font-family-mono` for tabular IDs at body sizes.
- All systems agree: mono is for code, IDs, timestamps, and tabular numerics — never for prose.

### Tabular numerals

Apple HIG calls out tabular figures (`font-feature-settings: 'tnum'`) for numeric columns. Material specifies tabular numerals for lists with numeric data. Carbon documents `font-variant-numeric: tabular-nums` for tables.

### Line height

Material body line-heights are 1.43-1.5; Carbon body-01 line-height is 1.29; Polaris body-md is 1.43. The HyperIdle 1.45 default sits in this range.

### Mobile body minimum

iOS Safari zooms an `<input>` smaller than 16px on focus. WebAIM's general recommendation of 16px applies on mobile. Material body-large at 16sp is the mobile default.

## Body / heading bump verdict

**Body: no change** at the default density. 14px is the productivity-tool consensus across Carbon, Polaris, Linear and Atlassian. The arguments to bump body to 15-16px draw on consumer-content defaults (Material body-large, Practical Typography) which target prose, not data-dense UIs.

The mobile case is different: at the mobile breakpoint, body should resolve to the **comfortable** density text (15px) per the auto-density recommendation in `mobile-touch.md`, plus the `<input>` font-size must be **>= 16px** to prevent iOS Safari zoom. This is a behavioral recommendation, not a token change.

**Heading: no change** — the 24/18 ramp is coherent for a productivity tool. Adding a 20px or 22px intermediate is optional but not driven by 3-source consensus on a specific value.

## Disagreements

- 14 vs 16 px body: productivity vs consumer split is irreconcilable; HyperIdle is a productivity tool, so 14 wins for body but 16 wins for inputs (iOS zoom).
- Material continuous type ramp vs Carbon discrete productive ramp: both are valid for their respective domains.

## Draft recommendations rows

| Token | Current | Recommended | Rationale | Sources | Lintable | Lint hint |
|---|---|---|---|---|---|---|
| Body size (default) | 14px | no change | 3 productivity-tool systems converge on 14px (Carbon body-01 https://carbondesignsystem.com/guidelines/typography/overview/, Polaris body-md https://polaris.shopify.com/design/typography, Atlassian https://atlassian.design/foundations/typography-beta) | Carbon, Polaris, Atlassian | yes | regex: `text-\[(\d+)px\]` allowlist `{11,12,13,14,15,16,18,20,24}` |
| Body size (comfortable / mobile) | 15px | no change | Sits between productivity 14 and consumer 16 https://m3.material.io/styles/typography/type-scale-tokens https://practicaltypography.com/point-size.html https://webaim.org/techniques/fonts/ | Material 3, Practical Typography, WebAIM | yes | regex: `text-\[15px\]` |
| Heading scale | 24/18/14 | no change | Productivity ramp coherent; no 3-source consensus on adding intermediate https://carbondesignsystem.com/guidelines/typography/overview/ https://m3.material.io/styles/typography/type-scale-tokens https://polaris.shopify.com/design/typography | Carbon, Material, Polaris | no | - |
| Input font-size on mobile | n/a (inherits 14px) | min 16px on input/textarea/select at mobile breakpoint | iOS Safari zooms inputs below 16px https://developer.apple.com/design/human-interface-guidelines/typography https://developer.mozilla.org/en-US/docs/Web/CSS/font-size https://webaim.org/techniques/fonts/ | Apple HIG, MDN, WebAIM | partial | ast: `<input>`/`<textarea>`/`<select>` className lacks `text-base` or `text-[16px]` at mobile |
| Tabular numerals on numeric data | not enforced | `font-variant-numeric: tabular-nums` on tables and KeyValue numeric values | Three sources require tabular figures for aligned numeric columns https://developer.apple.com/design/human-interface-guidelines/typography https://m3.material.io/styles/typography/type-scale-tokens https://carbondesignsystem.com/guidelines/typography/overview/ | Apple HIG, Material 3, Carbon | partial | regex: `<td|KeyValue` near numeric content lacks `tabular-nums` |
