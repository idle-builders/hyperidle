# HyperIdle Design System — Token Reference

Single source of truth for all design tokens. Both `.tsx` (Tailwind) and `.html` representations derive from these values.

**Current theme:** Lucid (light + dark modes). A unified theme system with two modes — Lucid Dark and Lucid Light — switchable via `data-theme` attribute or `prefers-color-scheme`. All components use semantic tokens (`var(--surface-3)`, not `#1a1a1c`) so either mode can be applied by swapping the token sheet.

**Design principles:** See `PRINCIPLES.md` for the universal design principles that guide all component decisions regardless of theme mode.

---

## Theme Switching

The Lucid theme supports two modes:

| Mode | Attribute | Base Surface |
|------|-----------|-------------|
| Lucid Dark | `data-theme="lucid-dark"` | `#111113` |
| Lucid Light | `data-theme="lucid-light"` | `#fafaf9` |

The app respects `prefers-color-scheme` by default. Users can override via the settings panel. The `data-theme` attribute on the `<html>` element controls which mode is active.

---

## Color

### Surfaces — Lucid Dark (tonal layering + borders)

| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-0` | `#111113` | App chrome, body background |
| `--surface-1` | `#18181b` | IconRail, Rail, sidebar backgrounds |
| `--surface-2` | `#1e1e21` | Submenu, sheets |
| `--surface-3` | `#232326` | Main content area |
| `--surface-4` | `#28282c` | Cards, selected nav items |
| `--surface-5` | `#2e2e33` | Card hover, button backgrounds |
| `--surface-6` | `#35353b` | Elevated surfaces, button hover |
| `--surface-ghost` | `rgba(255,255,255,0.06)` | Chip fills, kbd hints |

### Surfaces — Lucid Light

| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-0` | `#fafaf9` | App chrome, body background |
| `--surface-1` | `#f4f4f3` | IconRail, Rail, sidebar backgrounds |
| `--surface-2` | `#ededec` | Submenu, sheets |
| `--surface-3` | `#ffffff` | Main content area, cards |
| `--surface-4` | `#f7f7f6` | Selected nav items, row hover |
| `--surface-5` | `#ebebea` | Button backgrounds |
| `--surface-6` | `#e0e0df` | Elevated surfaces, button hover |
| `--surface-ghost` | `rgba(0,0,0,0.04)` | Chip fills, kbd hints |

### Accents (state-driven — not decorative)

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--primary` | `#e0e7ff` | `#4f46e5` | Links, selection, active indicators |
| `--primary-dim` | `rgba(224,231,255,0.12)` | `rgba(79,70,229,0.08)` | Primary tint fills |
| `--primary-hover` | `rgba(224,231,255,0.18)` | `rgba(79,70,229,0.12)` | Primary hover fills |
| `--warn` | `#a8a8b0` | `#78787e` | Behind schedule, attention needed (gray — monochrome) |
| `--ok` | `#c8c8d0` | `#8e8e94` | Healthy, approved, done (gray — monochrome) |
| `--danger` | `#f87171` | `#dc2626` | Blocked, errors, rejected (red — the only color) |

#### Monochrome Status Philosophy

Warn and ok are intentionally neutral grays. Only danger carries chromatic color (red). This enforces the principle that color is reserved for "act now" situations. Status is communicated through shape, position, and text — not color — except when something is genuinely wrong.

### Text — Lucid Dark (3-step grayscale)

| Token | Hex | Usage | Contrast |
|-------|-----|-------|----------|
| `--text-hi` | `#ececef` | Titles, values, active nav | 15:1 on surface-0 |
| `--text-mid` | `#a1a1aa` | Body, captions, inactive nav | 8.5:1 on surface-0 |
| `--text-lo` | `#71717a` | Mono labels, timestamps, hints | 4.5:1 on surface-0 (WCAG AA) |

### Text — Lucid Light

| Token | Hex | Usage | Contrast |
|-------|-----|-------|----------|
| `--text-hi` | `#18181b` | Titles, values, active nav | 16:1 on surface-0 |
| `--text-mid` | `#52525b` | Body, captions, inactive nav | 7.5:1 on surface-0 |
| `--text-lo` | `#a1a1aa` | Mono labels, timestamps, hints | 4.5:1 on surface-0 (WCAG AA) |

### Shadow

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--float` | `0 0 32px rgba(0,0,0,0.4)` | `0 4px 24px rgba(0,0,0,0.08)` | Floating surfaces only (modals, popovers) |

### Borders

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--border-subtle` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.06)` | Decorative dividers, section separators |
| `--border-default` | `rgba(255,255,255,0.10)` | `rgba(0,0,0,0.10)` | Card borders, panel edges, input borders |
| `--border-emphasis` | `rgba(255,255,255,0.16)` | `rgba(0,0,0,0.16)` | Active panels, focused inputs, emphasized sections |

---

## Typography

### Families

| Token | Font | Usage |
|-------|------|-------|
| `--ui` / `font-sans` | Geist (400/500/600) | All UI text |
| `--mono` / `font-mono` | Geist Mono (400/500) | Data labels, numeric values, uppercase tags |
| `font-heading` | Geist Mono (500/600) | Section headers (uppercase, tracking-wider) |

### Scale

| Size | Weight | Line Height | Usage |
|------|--------|-------------|-------|
| 24px | 600 | 1.2 | Page titles (rare) |
| 18px | 600 | 1.3 | Section headings |
| 14px | 600 | 1.45 | Mono — section headers (`font-heading` uppercase tracking-wider) |
| 14px | 500 | 1.45 | Subheadings, nav labels |
| 14px | 400 | 1.45 | Body text (default) |
| 12px | 600 | 1.4 | Mono — small section headers (`font-heading` uppercase tracking-wider) |
| 12px | 500 | 1.4 | Small labels, metadata |
| 13px | 400 | 1.4 | Mono — data values (Geist Mono) |
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
| `--r1` | 4px | Buttons, chips, badges |
| `--r2` | 8px | Cards, panels, boxes |
| `--r3` | 12px | Modals, overlays |
| `--r-pill` | 999px | Scrollbar thumbs, pill shapes |

Tailwind/DaisyUI overrides: `--rounded-btn: 4px`, `--rounded-box: 8px`, `--rounded-badge: 4px`.

---

## Motion

Single easing curve: `ease` (CSS default). Three duration tiers.

| Token | Value | Usage |
|-------|-------|-------|
| `--motion-fast` | 80ms | Instant feedback — hover, focus ring, chip state |
| `--motion-medium` | 150ms | Disclosure changes — Rail expand, tab swaps |
| `--motion-slow` | 250ms | Overlay open/close — Settings, Global Search |

Tuned for crisp responsiveness. Longer feels sluggish; shorter drops the transition entirely.

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

- No purple/indigo palettes in dark mode (indigo primary in Lucid Light is intentional and controlled)
- No excessive gradients
- No `rounded-2xl` everywhere
- No `p-8`/`p-12` oversized padding
- No stock 3-column card grids
- No hero sections
- No decorative icons on every element
- No glass morphism / frosted glass effects
