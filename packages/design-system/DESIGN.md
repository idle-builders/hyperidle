# HyperIdle Design System — Token Reference

Single source of truth for all design tokens. Both `.tsx` (Tailwind) and `.html` representations derive from these values.

**Current theme:** Hearth (light + dark modes). A unified theme system with two modes — Hearth Dark and Hearth Light — switchable via `data-theme` attribute or `prefers-color-scheme`. All components use semantic tokens (`var(--surface-elevated)`, not `#ffffff`) so either mode can be applied by swapping the token sheet. Hearth is light-first: the default mode is `hearth-light`.

**Design principles:** See `PRINCIPLES.md` for the universal design principles that guide all component decisions regardless of theme mode.

---

## Theme Switching

The Hearth theme supports two modes:

| Mode | Attribute | Base Surface |
|------|-----------|-------------|
| Hearth Light | `data-theme="hearth-light"` | `#f5f0e6` |
| Hearth Dark | `data-theme="hearth-dark"` | `#1a1510` |

The app respects `prefers-color-scheme` by default. Users can override via the settings panel. The `data-theme` attribute on the `<html>` element controls which mode is active. Hearth is light-first — the unset default maps to `hearth-light`.

---

## Color

### Surfaces — Hearth Light (warm cream tones)

| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-page` | `#f5f0e6` | App chrome, body background |
| `--surface-container` | `#ede7db` | Rail, sidebar, nav backgrounds |
| `--surface-elevated` | `#ffffff` | Cards, panels, elevated content |
| `--surface-overlay` | `#ffffff` | Modals, popovers, dialogs |

### Surfaces — Hearth Dark (deep warm earth)

| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-page` | `#1a1510` | App chrome, body background |
| `--surface-container` | `#231e16` | Rail, sidebar, nav backgrounds |
| `--surface-elevated` | `#2c261c` | Cards, panels |
| `--surface-overlay` | `#352e23` | Modals, popovers, dialogs |

### Accents (forest green — state-driven, not decorative)

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--accent-primary` | `#16764f` | `#2eaa7a` | Links, selection, active indicators |
| `--accent-primary-dim` | `rgba(22,118,79,0.08)` | `rgba(46,170,122,0.1)` | Primary tint fills |
| `--accent-primary-hover` | `#105e3f` | `#20a070` | Primary hover fills |
| `--accent-secondary` | `#d97706` | `#d97706` | Secondary accent (amber) |

### Status Tokens

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--status-success` | `#16764f` | `#2eaa7a` | Healthy, approved, done |
| `--status-warning` | `#d97706` | `#d97706` | Behind schedule, attention needed |
| `--status-error` | `#dc4a3a` | `#ee6a5a` | Blocked, errors, rejected |
| `--status-info` | `#2e7dba` | `#4498d4` | Informational indicators |

### Text — Hearth Light (warm dark tones)

| Token | Hex | Usage | Contrast |
|-------|-----|-------|----------|
| `--text-primary` | `#2c241a` | Titles, values, active nav | 13.45:1 on surface-page |
| `--text-secondary` | `#6b5d4d` | Body, captions, inactive nav | 5.61:1 on surface-page |
| `--text-tertiary` | `#9a8d7e` | Timestamps, hints (decorative/hint only) | 2.85:1 on page — WCAG-exempt hint role |
| `--text-placeholder` | `#bfb5a5` | Input placeholders | Placeholder-only, exempt from AA |
| `--text-on-accent` | `#ffffff` | Text on accent-primary buttons | 5.62:1 on accent-primary |

### Text — Hearth Dark (lightened warm tones, WCAG AA)

| Token | Hex | Usage | Contrast |
|-------|-----|-------|----------|
| `--text-primary` | `#ede5d8` | Titles, values, active nav | 14.50:1 on surface-page |
| `--text-secondary` | `#a89880` | Body, captions, inactive nav | 6.45:1 on surface-page |
| `--text-tertiary` | `#9a8e7e` | Timestamps, hints | 5.65:1 on surface-page — AA pass |
| `--text-placeholder` | `#5a5048` | Input placeholders | Placeholder-only |
| `--text-on-accent` | `#ffffff` | Text on accent-primary buttons | |

### Shadow

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--shadow-subtle` | `0 1px 4px rgba(44,36,26,0.06)` | `0 1px 4px rgba(0,0,0,0.3)` | Subtle elevation |
| `--shadow-default` | `0 4px 12px rgba(44,36,26,0.08)` | `0 4px 12px rgba(0,0,0,0.4)` | Cards, panels |
| `--shadow-elevated` | `0 8px 24px rgba(44,36,26,0.1)` | `0 8px 24px rgba(0,0,0,0.5)` | Floating surfaces (modals, popovers) |

### Borders

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--border-subtle` | `#e8e0d0` | `#3d342a` | Decorative dividers, section separators |
| `--border-default` | `#d5cbb8` | `#554a3c` | Card borders, panel edges, input borders |
| `--border-strong` | `#b5a890` | `#756850` | Active panels, focused inputs, emphasized sections |

---

## Typography

### Families

| Token | Font | Usage |
|-------|------|-------|
| `--font-sans` / `font-sans` | system-ui, -apple-system, Segoe UI | All UI text |
| `--font-mono` / `font-mono` | ui-monospace, SF Mono, Cascadia Code | Data labels, numeric values, code |

### Scale

Source of truth: `AESTHETICS.md § Typography` recommendations table — U10 Hearth override. Allowlist `{9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 24, 30}` — anything outside this set is off-scale and lints under `design/no-off-scale-font-size`.

| Size | Weight | Line Height | Usage |
|------|--------|-------------|-------|
| 30px | 700 (`--fw-bold`) | 1.2 | Page title, brand heading (Hearth `--text-3xl`) |
| 24px | 600 (`--fw-semibold`) | 1.2 (`--leading-tight`) | Section titles |
| 20px | 600 | 1.25 | Section headings (intermediate) |
| 18px | 600 | 1.25 | Section headings |
| 17px | 500 / 600 | 1.4 | Large labels, card titles (Hearth `--text-lg`) |
| 16px | 400 / 500 | 1.6 (`--leading-body` under `[data-density="comfortable"]`) | Body text (comfortable density) AND mobile inputs |
| 15px | 400 | 1.55 (`--leading-body` under `[data-density="default"]`) | Body text (default density) |
| 14px | 600 (`--fw-semibold`) | 1.5 | Mono section headers (uppercase tracking-wider) |
| 14px | 500 (`--fw-medium`) | 1.5 | Subheadings, nav labels |
| 14px | 400 (`--fw-normal`) | 1.5 (`--leading-body` under `[data-density="compact"]`) | Body text (compact density) |
| 13px | 400 / 500 | 1.4 | Mono — data values |
| 12px | 600 | 1.4 | Mono — small section headers |
| 12px | 500 | 1.4 | Small labels, metadata |
| 11px | 500 | 1.3 | Mono — uppercase tags, timestamps |
| 10px | 500 | 1.3 | Micro-typography — badge-agent labels, avatar-sm initials, swatch labels |
| 9px | 500 | 1.2 | Count badges only (numeric counters — type scale floor) |

### Tracking and weight tokens

| Token | Value | Usage |
|---|---|---|
| `--tracking-caps` | 0.08em | Letter-spacing for uppercase section titles (Hearth wide-tracking signature) |
| `--tracking-caps-sm` | 0.06em | Letter-spacing for smaller uppercase labels (subtitles, sidebar categories) |
| `--leading-body` | 1.5 (compact) / 1.55 (default) / 1.6 (comfortable) | Body line-height |
| `--leading-tight` | 1.25 | Heading line-height |
| `--fw-normal` | 400 | Body weight |
| `--fw-medium` | 500 | Label / heading weight |
| `--fw-semibold` | 600 | Bold heading / emphasis weight |
| `--fw-bold` | 700 | Page title / brand heading weight |

### Heading-scale density tokens (K9)

`--density-text-h1` and `--density-text-h2` scope the H1/H2 type scale per density tier.

| Token | Compact | Default | Comfortable |
|---|---|---|---|
| `--density-text-h1` | 1.5rem (24px) | 1.625rem (26px) | 1.75rem (28px) |
| `--density-text-h2` | 1.125rem (18px) | 1.25rem (20px) | 1.375rem (22px) |

---

## Spacing

### Grid

6px baseline grid. All layout spacing values are from the Hearth `--space-*` scale.

### Density Presets

Three presets cascaded via `[data-density]` attribute on the app shell root.

| Token | Default | Compact (default × 0.75) | Comfortable (default × 1.5) |
|-------|---------|---------|-------------|
| `--density-pad-x` | 1rem (16px) | 0.75rem (12px) | 1.5rem (24px) |
| `--density-pad-y` | 0.75rem (12px) | 0.5rem (8px) | 1rem (16px) |
| `--density-gap` | 0.75rem (12px) | 0.5rem (8px) | 1rem (16px) |
| `--density-row-h` | 2.75rem (44px) | 2rem (32px) | 3.5rem (56px, designer-call) |
| `--density-text` | 0.9375rem (15px) | 0.875rem (14px) | 1rem (16px) |
| `--density-text-h1` | 1.625rem (26px) | 1.5rem (24px) | 1.75rem (28px) |
| `--density-text-h2` | 1.25rem (20px) | 1.125rem (18px) | 1.375rem (22px) |
| `--leading-body` | 1.55 | 1.5 | 1.6 |
| `--tracking-caps` | 0.08em | 0.08em | 0.08em |

### Density preference state

Settings exposes a tri-state `appearance.density` value: `"auto" | "default" | "compact" | "comfortable"`. `"auto"` is the factory default and the only state that fires viewport-driven density auto-switching.

### Common Spacing Values

Hearth 6px grid — the `--space-*` token scale:

| Value | Token | Usage |
|-------|-------|-------|
| 3px | `--space-1` | Tight grouping, minimum gap |
| 6px | `--space-2` | Default gap, icon gap |
| 9px | `--space-3` | Small padding |
| 12px | `--space-4` | Default padding, small element padding |
| 18px | `--space-6` | Card padding, section gap |
| 24px | `--space-8` | Major section separation |
| 36px | `--space-12` | Large section padding |
| 48px | `--space-16` | Page margin (maximum layout grid value) |

---

## Radii

Closed set — no arbitrary values.

| Token | Value | Usage |
|-------|-------|-------|
| `--r-none` | 0 | No rounding |
| `--r-subtle` | 10px | Subtle rounding |
| `--r-default` | 16px | Cards, panels, boxes |
| `--r-pill` | 9999px | Buttons, badges, scrollbar thumbs, pill shapes |

Tailwind/DaisyUI overrides: `--rounded-btn: 9999px`, `--rounded-box: 16px`, `--rounded-badge: 9999px`.

---

## Motion

Three duration tiers and a single easing curve. All motion durations honor `prefers-reduced-motion: reduce`.

| Token | Value | Usage |
|-------|-------|-------|
| `--motion-fast` | 120ms | Instant feedback — hover, focus ring, chip state |
| `--motion-default` | 240ms | Disclosure changes — Rail expand, tab swaps |
| `--motion-slow` | 450ms | Overlay open/close — Settings, Global Search |
| `--motion-ease` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | Standard easing curve (CSS `ease`) |

---

## Grid (Shell Layout)

```
┌────────────────────────┬─────────────────────────────────────────┐
│        Sidebar         │                  Main                   │
│        240px           │                  1fr                    │
└────────────────────────┴─────────────────────────────────────────┘
```

- `grid-template-columns: 240px 1fr`
- Sidebar uses `--surface-container` background (warm linen)
- Main uses `--surface-page` background (warm cream)
- Sidebar collapses to icon-only on narrow viewports

---

## DaisyUI Components Used

Used directly (not wrapped): badge, btn, tabs, menu, dropdown, modal, drawer, alert, tooltip, skeleton, avatar, divider, collapse, loading, toggle, input, textarea, select, checkbox, radio.

NOT used (wrong tone): hero, card, chat-bubble, carousel, steps, timeline, rating, stat, mockup.

---

## Anti-Patterns (The "AI Aesthetic" Blacklist)

- No purple/indigo palettes
- No excessive gradients
- No `rounded-3xl` or arbitrary large radii beyond the Hearth 4-value scale (0/10/16/9999). Note: `rounded-2xl` (16px) IS the Hearth default card radius — do not avoid it.
- No `p-8`/`p-12` oversized padding
- No stock 3-column card grids
- No hero sections
- No decorative icons on every element
- No glass morphism / frosted glass effects
- No cool grays — all neutrals must be warm-tinted (use Hearth surface/text/border tokens)
- No external font imports — system fonts only (`--font-sans`, `--font-mono`)
