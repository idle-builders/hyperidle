# HyperIdle Design System — Token Reference

Single source of truth for all design tokens. Both `.tsx` (Tailwind) and `.html` (Claude Design) representations derive from these values.

Aesthetic: Bloomberg terminal meets silent intelligence. Dark-only, tonal layering (no borders), compact density, monospace data labels.

---

## Color

### Surfaces (tonal layering — no border lines)

| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-0` | `#000000` | App chrome, body background |
| `--surface-1` | `#0e0e0e` | IconRail, Rail, sidebar backgrounds |
| `--surface-2` | `#131313` | Submenu, sheets |
| `--surface-3` | `#191a1a` | Main content area |
| `--surface-4` | `#1f2020` | Cards, selected nav items |
| `--surface-5` | `#252626` | Card hover, button backgrounds |
| `--surface-6` | `#2c2c2c` | Elevated surfaces, button hover |
| `--surface-ghost` | `rgba(255,255,255,0.06)` | Chip fills, kbd hints |

### Accents (state-driven — not decorative)

| Token | Hex | Usage |
|-------|-----|-------|
| `--primary` | `#adc6ff` | Links, selection, active indicators |
| `--primary-dim` | `rgba(173,198,255,0.12)` | Primary tint fills |
| `--primary-hover` | `rgba(173,198,255,0.18)` | Primary hover fills |
| `--warn` | `#d58f24` | Behind status, attention needed |
| `--ok` | `#bbffb3` | Healthy, approved, done |
| `--danger` | `#ee7d77` | Blocked, errors, rejected |

### Text (3-step grayscale)

| Token | Hex | Usage | Contrast |
|-------|-----|-------|----------|
| `--text-hi` | `#e7e5e4` | Titles, values, active nav | 16:1 on surface-0 |
| `--text-mid` | `#acabaa` | Body, captions, inactive nav | 9.5:1 on surface-0 |
| `--text-lo` | `#808080` | Mono labels, timestamps, hints | 4.6:1 on surface-0 (WCAG AA) |

### Shadow

| Token | Value | Usage |
|-------|-------|-------|
| `--float` | `0 0 32px rgba(173,198,255,0.08)` | Floating surfaces only (modals, popovers) |

---

## Typography

### Families

| Token | Font | Usage |
|-------|------|-------|
| `--ui` / `font-sans` | Inter (400/500/600) | All UI text |
| `--mono` / `font-heading` | Space Grotesk (400/500) | Data labels, numeric values, uppercase tags |

### Scale

| Size | Weight | Line Height | Usage |
|------|--------|-------------|-------|
| 24px | 600 | 1.2 | Page titles (rare) |
| 18px | 600 | 1.3 | Section headings |
| 14px | 500 | 1.45 | Subheadings, nav labels |
| 14px | 400 | 1.45 | Body text (default) |
| 12px | 500 | 1.4 | Small labels, metadata |
| 13px | 400 | 1.4 | Mono — data values (Space Grotesk) |
| 13px | 500 | 1.4 | Mono — emphasized data |
| 11px | 500 | 1.3 | Mono — uppercase tags, timestamps (+ letter-spacing 0.05em) |

---

## Spacing

### Grid

4px baseline grid. All spacing values are multiples of 4px.

### Density Presets

Three presets cascaded via `[data-density]` attribute on the app shell root.

| Token | Default | Compact | Comfortable |
|-------|---------|---------|-------------|
| `--density-pad-x` | 0.75rem (12px) | 0.375rem (6px) | 1rem (16px) |
| `--density-pad-y` | 0.5rem (8px) | 0.25rem (4px) | 0.75rem (12px) |
| `--density-gap` | 0.5rem (8px) | 0.25rem (4px) | 0.75rem (12px) |
| `--density-row-h` | 2rem (32px) | 1.625rem (26px) | 2.5rem (40px) |
| `--density-text` | 0.875rem (14px) | 0.75rem (12px) | 0.9375rem (15px) |

### Common Spacing Values

| Value | Usage |
|-------|-------|
| 4px | Icon gap, tight grouping |
| 8px | Default padding, component gap |
| 12px | Horizontal padding (default density) |
| 16px | Section gap, comfortable padding |
| 24px | Major section separation |

---

## Radii

Closed set — no arbitrary values.

| Token | Value | Usage |
|-------|-------|-------|
| `--r0` | 0 | No rounding |
| `--r1` | 2px | Buttons, chips, badges |
| `--r2` | 4px | Cards, panels, boxes |
| `--r3` | 8px | Modals, overlays |
| `--r-pill` | 999px | Scrollbar thumbs, pill shapes |

Tailwind/DaisyUI overrides: `--rounded-btn: 2px`, `--rounded-box: 4px`, `--rounded-badge: 2px`.

---

## Motion

Single easing curve: `ease` (CSS default). Three duration tiers.

| Token | Value | Usage |
|-------|-------|-------|
| `--motion-fast` | 120ms | Instant feedback — hover, focus ring, chip state |
| `--motion-medium` | 200ms | Disclosure changes — Rail expand, tab swaps |
| `--motion-slow` | 320ms | Overlay open/close — Settings, Global Search |

Tuned for terminal-style crispness. Longer feels sluggish; shorter drops the transition entirely.

---

## Grid (Shell Layout)

```
┌──────────┬──────────────┬─────────────────────────┬──────────────┐
│ IconRail │   Submenu    │         Main            │    Rail      │
│   48px   │    240px     │         1fr             │  56/360px    │
└──────────┴──────────────┴─────────────────────────┴──────────────┘
```

- `grid-template-columns: 48px 240px 1fr auto`
- Rail collapsed: 56px (icon buttons + count badges)
- Rail expanded: 360px (searchable notification feed)

---

## DaisyUI Components Used

Used directly (not wrapped): badge, btn, tabs, menu, dropdown, modal, drawer, alert, tooltip, skeleton, avatar, divider, collapse, loading, toggle, input, textarea, select, checkbox, radio.

NOT used (wrong tone): hero, card, chat-bubble, carousel, steps, timeline, rating, stat, mockup.

---

## Anti-Patterns (The "AI Aesthetic" Blacklist)

- No purple/indigo palettes
- No excessive gradients
- No `rounded-2xl` everywhere
- No `p-8`/`p-12` oversized padding
- No stock 3-column card grids
- No hero sections
- No decorative icons on every element
- No glass morphism / frosted glass effects
