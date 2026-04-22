# Color Usage

## Core Rule: Color Is for Meaning, Not Decoration

The interface is monochrome by default. Color appears only when it carries meaning:
- **Interactive affordance:** Accent color on links, active tabs, primary buttons
- **Status:** Semantic colors for healthy/warning/error/info states
- **Data differentiation:** Chart series, category indicators

If you're adding color to "make it look nicer," stop. The design should work in grayscale first.

## The Token Palette

### Surfaces (elevation through lightness)

Closer to user = lighter. This simulates overhead lighting.

| Level | Usage |
|-------|-------|
| `surface-0` | Deepest background, app chrome (#111113 dark / #fafaf9 light) |
| `surface-1` | Sidebar, submenu backgrounds |
| `surface-2` | Main content area |
| `surface-3` | Cards, panels |
| `surface-4` | Elevated: card hover, active elements |
| `surface-5` | Highest elevation: button hover, dropdowns |
| `surface-ghost` | Translucent fills (chips, badges, kbd hints) |

**Never skip levels.** A card (surface-4) should not sit on app chrome (surface-0) directly — it needs a content area (surface-2 or surface-3) behind it.

### Text (three levels only)

| Token | Usage |
|-------|-------|
| `--text-hi` | Primary content: titles, values, active nav. ~90% white. |
| `--text-mid` | Secondary: body text, descriptions, inactive nav. ~67% white. |
| `--text-lo` | Tertiary: timestamps, IDs, hints, mono labels. ~50% white. |

No other text colors for content. Status text uses the status color directly.

### Accents (functional, not decorative)

| Token | Meaning |
|-------|---------|
| `--primary` | Interactive: links, selections, active indicators |
| `--ok` | Positive state: healthy, done, approved |
| `--warn` | Attention: behind, needs review, caution |
| `--danger` | Negative state: blocked, error, rejected |

### Status Color Rules

- Status colors appear at 14% opacity as backgrounds (via `color-mix`)
- Full saturation only on the dot/icon indicator
- Text within status chips uses the status color
- **Always pair color with a non-color signal:** dot shape, text label, icon

## Dark Mode Specifics

- **No pure black (#000000).** It causes halation (bright text bleeds). Lucid Dark uses #111113.
- **No pure white (#ffffff) text.** Use off-white (--text-hi is #ececef in dark mode).
- **Shadows don't work for elevation** in dark mode. Use surface lightness instead.
- **Desaturate status colors by ~15-20%** compared to light mode equivalents. Garish colors against dark backgrounds distract from content.
- **Warm gray undertones** prevent the "gloomy cave" feeling. Cool blue-grays cause fatigue during long sessions (Linear's finding).

## Hardcoded Color Detection

These should never appear in component code:
- Raw hex values (`#aabbcc`) — use `var(--token-name)` instead
- RGB/HSL values (`rgb(...)`, `hsl(...)`) — use tokens
- Tailwind color utilities (`text-blue-500`, `bg-gray-800`) — use token-based arbitrary values
- Opacity on colored elements without using token-defined tint values

**The only acceptable raw color values** are in `tokens.css` itself and in the anti-pattern test fixtures.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `bg-gray-800` for cards | `bg-[var(--surface-4)]` |
| Adding color "for visual interest" | Remove it. Does it convey meaning? |
| Red text without icon or label | Add a warning icon or "Error:" prefix |
| White (#fff) text | `text-[var(--text-hi)]` which is off-white |
| Status color on large areas | Status color on small indicators (chip, dot). Large areas use surface tones. |
