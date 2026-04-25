# Typography

> Canonical research and recommendations table: `packages/design-system/AESTHETICS.md` § Typography. Token values: `packages/design-system/src/tokens.css`. Hard rules: `.claude/rules/aesthetic-quality.md` AQ-004 / AQ-005 / AQ-006 / AQ-007. K6 lint slug: `design/no-off-scale-font-size`. K1 designer-call additions consumed downstream: body line-height 1.5 (default) / 1.55 (comfortable); 20px heading intermediate added; uppercase labels carry +0.02em tracking; mobile inputs ≥ 16px.

Typography carries ~95% of web design information. It is THE primary interface.

## Type Scale (Closed Set)

| Size | Weight | Line Height | Usage |
|------|--------|-------------|-------|
| 24px | 600 | 1.2 | Page titles (rare — one per page max) |
| 18px | 600 | 1.3 | Section headings |
| 14px | 500 | 1.45 | Subheadings, emphasized body, nav labels |
| 14px | 400 | 1.45 | Body text (default) |
| 13px | 400/500 | 1.4 | Monospace data values (Geist Mono) |
| 12px | 500 | 1.4 | Small labels, metadata |
| 11px | 500 | 1.3 | Uppercase tags, timestamps (+ letter-spacing 0.05em) |

No sizes outside this scale. If you need a size not listed, you're making a mistake.

## Font Families

| Family | Token | When to Use |
|--------|-------|-------------|
| Geist (400/500/600) | `--ui` / `font-sans` | All UI text: labels, body, headings, buttons |
| Geist Mono (400/500) | `--mono` / `font-mono` | Data values, numeric displays, IDs, timestamps, uppercase tags |

**Two families maximum.** Hierarchy through weight and size, not family switching.

## Weight Rules

- **400 (Regular):** Body text, inactive labels, secondary information
- **500 (Medium):** Emphasis, nav labels, active states, data values
- **600 (Semi-bold):** Headings only. Never for body text.

If you're using weight 700 (Bold) anywhere, stop. It's too heavy for this design system.

## Line Height

- **Headings (18-24px):** 1.2-1.3 — tight, crisp
- **Body text (14px):** 1.45 — readable without being floaty
- **Small text (11-12px):** 1.3-1.4 — compact but legible
- **Monospace data:** 1.4 — consistent with surrounding text

## Letter Spacing

- **Uppercase 11px tags:** `0.05em` — required for readability at small uppercase sizes
- **Everything else:** `normal` — don't add letter-spacing to body text

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `text-xl` or `text-2xl` for most headings | Section headings are 18px. Only page titles get 24px. |
| Bold (700) for emphasis | Use medium (500) or increase size instead. |
| Monospace for non-data content | Geist Mono is for data: numbers, IDs, timestamps. Not paragraphs. |
| More than 3 font sizes in one component | A component needs at most: title (14-18), body (14), meta (11-12). |
| Missing letter-spacing on uppercase small text | 11px uppercase MUST have `letter-spacing: 0.05em`. |
| Line height too tight on body text | Body at 14px needs `line-height: 1.45`. Not 1.2. |

## The Reading Test

Cover the component with your hand except for the text. Can you understand the hierarchy from text alone (no backgrounds, no colors, no borders)? If yes, the typography is working. If everything reads at the same level, add size/weight differentiation.
