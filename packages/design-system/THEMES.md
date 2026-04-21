# Style Directions

Four theme variants for design exploration. Each is a complete set of CSS custom properties that can be applied to any component. Switch between them using the theme picker in the top-right of any HTML component page (`bun run ds:serve` on :8098).

---

## 1. Factory Dark (Current)

**Mood:** Bloomberg terminal meets silent intelligence.
**References:** Bloomberg, Grafana, Datadog.

Pure black base (#000), seven tonal surface steps, no borders (tonal layering only), Space Grotesk for data, maximum density. This was the original direction.

**Strengths:** Dramatic, data-dense, distinctive.
**Weaknesses:** Pure black causes halation, tonal steps too close together to distinguish, lacks visual structure without borders, can feel oppressive in long sessions.

**File:** `html/themes/factory-dark.css`

---

## 2. Calm Precision (Recommended for Exploration)

**Mood:** Focused, professional, quietly confident. A well-organized workspace at 10pm.
**References:** Linear (calmer interface refresh), Raycast, Things 3.

Lifts the base off pure black to warm dark gray (#141416). Fewer surface levels with bigger perceptual gaps. 1px borders as the primary organizational mechanism. Warm gray undertones prevent the "gloomy cave" feeling. Desaturated accents.

**Strengths:** Organized, warm, less fatiguing. Addresses the "too extreme, not organized enough" concern directly. Proven by Linear at similar data complexity.
**Weaknesses:** Risks feeling "generic modern SaaS" — many tools converge on this look.

**Key differences from Factory Dark:**
- No pure black anywhere
- Borders are the primary organizational mechanism (not tonal layering alone)
- Warm gray undertones
- Slightly larger radii (4/6/10 instead of 2/4/8)
- Faster motion (100/180/280ms)
- Geist Mono instead of Space Grotesk for data

**File:** `html/themes/calm-precision.css`

---

## 3. Light Operations Center

**Mood:** Clear, authoritative, daylight-bright. A modern command center with natural light.
**References:** Stripe Dashboard, Notion, GitHub (light), Apple Health.

Warm off-white base (#fafaf9), white content cards, card elevation via subtle shadows. Status colors pop dramatically against light backgrounds. Editorial typography feel.

**Strengths:** Superior readability, card-based layout creates natural visual grouping, feels "executive dashboard" for the CEO/CPO audience. Stripe proves this works for complex financial data.
**Weaknesses:** Breaks "developer tool" aesthetic. Eventually needs a dark mode too.

**Key differences:**
- Light color scheme
- Shadows for elevation (not surface tones)
- Bolder accent colors with more contrast headroom
- Near-black text on white
- Larger radii (4/8/12)
- Borders use black-based alpha instead of white-based

**File:** `html/themes/light-ops.css`

---

## 4. Monochrome Machine

**Mood:** Precise, engineered, uncompromising. A Braun product or Leica interface.
**References:** Vercel/Geist, Superhuman, Warp terminal, Figma chrome.

Near-monochrome palette. One accent color only. Superhuman principle: closer layers = lighter. Maximum density with mathematical consistency. Status communicates through position/shape/fill, not color (except red for "act now").

**Strengths:** Most visually distinctive. Extreme reduction forces every element to justify existence. Single accent makes interactive affordances unmistakable. Scales beautifully to very dense views.
**Weaknesses:** Steep learning curve for status encoding. May feel cold. Harder to execute — tiny missteps in gray values are more visible without color distraction. Charts become harder without a color palette.

**Key differences:**
- Warn/ok status colors are neutral grays (monochrome communication)
- Only danger (#f87171) has actual color — reserved for "act now"
- Geist font family
- Fastest motion (80/150/250ms)
- Deepest surface contrast range

**File:** `html/themes/mono-machine.css`

---

## How to Use

### Browse themes visually

```bash
bun run ds:serve
# Open http://localhost:8098/BetCard.html
# Use the theme picker in the top-right corner
```

### Apply a theme to the full app (future)

The TSX components use `var(--token-name)` throughout. To switch themes:
1. Load the theme CSS file instead of the default tokens
2. Set `data-theme="theme-name"` on the root element

### Create a new theme variant

1. Copy an existing theme file in `html/themes/`
2. Change the token values
3. Add it to `html/themes/_switcher.js` THEMES array
4. Test across all 14 components

### Evaluate themes

For each theme, look at the components and ask:
- Is the hierarchy clear? Can I tell primary from secondary from tertiary?
- Is the density appropriate? Can I scan quickly?
- Does it feel organized? Can I tell where sections begin and end?
- Does it feel cohesive? Do the colors, spacing, and typography work together?
- Would I want to use this for 8 hours?
