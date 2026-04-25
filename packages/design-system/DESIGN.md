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
| `--surface-1` | `#19191c` | IconRail, Rail, sidebar backgrounds |
| `--surface-2` | `#1e1e22` | Submenu, sheets |
| `--surface-3` | `#27272b` | Main content area |
| `--surface-4` | `#323237` | Cards, selected nav items |
| `--surface-5` | `#3e3e44` | Card hover, button backgrounds |
| `--surface-6` | `#4a4a52` | Elevated surfaces, button hover |
| `--surface-ghost` | `rgba(255,255,255,0.05)` | Chip fills, kbd hints |

### Surfaces — Lucid Light

| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-0` | `#fafaf9` | App chrome, body background |
| `--surface-1` | `#ffffff` | IconRail, Rail, sidebar backgrounds |
| `--surface-2` | `#f4f4f2` | Submenu, sheets |
| `--surface-3` | `#eaeae8` | Main content area, cards |
| `--surface-4` | `#ddddd9` | Selected nav items, row hover |
| `--surface-5` | `#d0d0cc` | Button backgrounds |
| `--surface-6` | `#c4c4be` | Elevated surfaces, button hover |
| `--surface-ghost` | `rgba(0,0,0,0.04)` | Chip fills, kbd hints |

### Accents (state-driven — not decorative)

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--primary` | `#e0e7ff` | `#4f46e5` | Links, selection, active indicators |
| `--primary-dim` | `rgba(224,231,255,0.08)` | `rgba(79,70,229,0.08)` | Primary tint fills |
| `--primary-hover` | `rgba(224,231,255,0.14)` | `rgba(79,70,229,0.12)` | Primary hover fills |
| `--warn` | `#a8a8b0` | `#78787e` | Behind schedule, attention needed (gray — monochrome) |
| `--ok` | `#c8c8d0` | `#8e8e94` | Healthy, approved, done (gray — monochrome) |
| `--danger` | `#f87171` | `#dc2626` | Blocked, errors, rejected (red — the only color) |

#### Monochrome Status Philosophy

Warn and ok are intentionally neutral grays. Only danger carries chromatic color (red). This enforces the principle that color is reserved for "act now" situations. Status is communicated through shape, position, and text — not color — except when something is genuinely wrong.

### Text — Lucid Dark (3-step grayscale)

| Token | Hex | Usage | Contrast |
|-------|-----|-------|----------|
| `--text-hi` | `#ededef` | Titles, values, active nav | 15:1 on surface-0 |
| `--text-mid` | `#a0a0a6` | Body, captions, inactive nav | 8.5:1 on surface-0 |
| `--text-lo` | `#6e6e76` | Mono labels, timestamps, hints | 4.5:1 on surface-0 (WCAG AA) |

### Text — Lucid Light

| Token | Hex | Usage | Contrast |
|-------|-----|-------|----------|
| `--text-hi` | `#1a1a1e` | Titles, values, active nav | 16:1 on surface-0 |
| `--text-mid` | `#6b6b70` | Body, captions, inactive nav | 7.5:1 on surface-0 |
| `--text-lo` | `#737378` | Mono labels, timestamps, hints | 4.5:1 on surface-0 (WCAG AA) |

### Shadow

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--float` | `0 2px 16px rgba(0,0,0,0.5)` | `0 4px 16px rgba(0,0,0,0.1)` | Floating surfaces only (modals, popovers) |

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

Source of truth: `AESTHETICS.md § Typography` recommendations table. Allowlist `{11, 12, 13, 14, 15, 16, 18, 20, 24}` — anything outside this set is off-scale and lints under `design/no-off-scale-font-size`.

| Size | Weight | Line Height | Usage |
|------|--------|-------------|-------|
| 24px | 600 (`--fw-emphasis`) | 1.2 (`--leading-heading-lg`) | Page titles (rare) |
| 20px | 600 | 1.25 (`--leading-heading`) | Section headings (intermediate; designer-call per AESTHETICS.md) |
| 18px | 600 | 1.25 (`--leading-heading`) | Section headings |
| 16px | 400 / 500 | 1.6 (`--leading-body` under `[data-density="comfortable"]`) | Body text (comfortable density) AND mobile inputs (iOS Safari zoom mitigation, ≤ 768px viewport) |
| 15px | 400 | 1.55 (`--leading-body` under `[data-density="default"]`) | Body text (default density, K9 re-tier) |
| 14px | 600 (`--fw-emphasis`) | 1.5 (`--leading-body`) | Mono — section headers (`font-heading` uppercase tracking-wider) |
| 14px | 500 (`--fw-medium`) | 1.5 | Subheadings, nav labels |
| 14px | 400 (`--fw-regular`) | 1.5 (`--leading-body` under `[data-density="compact"]`) | Body text (compact density, K9 re-tier — was the K7 default) |
| 13px | 400 / 500 | 1.4 | Mono — data values (Geist Mono) |
| 12px | 600 | 1.4 | Mono — small section headers |
| 12px | 500 | 1.4 | Small labels, metadata |
| 11px | 500 | 1.3 | Mono — uppercase tags, timestamps (+ `--tracking-caps` 0.02em on uppercase Tag/KeyValue labels; StatusChip retains 0.05em — designer-call) |

### Tracking and weight tokens

| Token | Value | Usage |
|---|---|---|
| `--tracking-caps` | 0.02em (compact / default) / 0.015em (comfortable) | Letter-spacing for uppercase labels (Tag, KeyValue label) per AESTHETICS.md row "Letter-spacing for caps". K9 — slightly tighter under comfortable because uppercase labels at 16 px don't need the same wedge to feel airy. |
| `--leading-body` | 1.5 (compact) / 1.55 (default) / 1.6 (comfortable) | Body line-height per AESTHETICS.md rows "Body line-height" — K9 re-tiered. |
| `--leading-heading` | 1.25 | Heading line-height for ≤ 20px headings |
| `--leading-heading-lg` | 1.2 | Heading line-height for 24px+ headings |
| `--fw-regular` | 400 | Body weight |
| `--fw-medium` | 500 | Label / heading weight |
| `--fw-emphasis` | 600 | Bold heading / emphasis weight |

### Heading-scale density tokens (K9)

`--density-text-h1` and `--density-text-h2` scope the H1/H2 type scale per density tier so the toggle reads at the page-heading level, not just at the body level. Components that render a scale-with-density heading consume these via `var(--density-text-h*)`. Components that use a one-off display heading (e.g. a marketing banner or a fixed-size login title) stay literal — flag the exception inline.

| Token | Compact | Default | Comfortable |
|---|---|---|---|
| `--density-text-h1` | 1.5rem (24px) | 1.625rem (26px) | 1.75rem (28px) |
| `--density-text-h2` | 1.125rem (18px) | 1.25rem (20px) | 1.375rem (22px) |

Note: HyperIdle's productivity-page chrome currently uses uppercase mono labels (`text-sm font-heading uppercase tracking-wider`) as page H1s rather than display-scale headings. Those labels are intentional — they are chrome, not type-scale display text — and stay literal. The new tokens are wired for any future display heading and for the design-system viewer.

---

## Spacing

### Grid

4px baseline grid. All spacing values are multiples of 4px.

### Density Presets

Three presets cascaded via `[data-density]` attribute on the app shell root.

The compact / comfortable tiers are derived from the default tier per AESTHETICS.md § Spacing & Density rows "Density tier ratio" — `compact = default × 0.75; comfortable = default × 1.5` (K9 re-tier; was 1.25× under K7), each rounded to the nearest 4 px multiple. `--density-row-h` is exempt from the upper-bound rule: comfortable's 56 px is a designer call (>= AQ-015's 44 px floor, < strict 1.5× cap of 66 → 64). The new `default` (44 px) already meets the AQ-015 touch-target floor, so K8's mobile auto-density flip is now an aesthetic choice rather than an a11y requirement.

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
| `--tracking-caps` | 0.02em | 0.02em | 0.015em |

### Density preference state

Settings exposes a tri-state `appearance.density` value: `"auto" | "default" | "compact" | "comfortable"`. `"auto"` is the factory default and the only state that fires viewport-driven density auto-switching: at viewport ≤ 1024px the AppShell sets `[data-density="comfortable"]` (per AESTHETICS.md § Mobile & Touch row "Auto-density behavior"). When the user explicitly picks `default`/`compact`/`comfortable`, that choice persists across breakpoint changes. Server-side persistence is deferred (J3/J8).

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

Three duration tiers and a single easing curve. All motion durations honor `prefers-reduced-motion: reduce` (`tokens.css` collapses durations to 1ms and pauses the skeleton-pulse animation under the media query).

| Token | Value | Usage |
|-------|-------|-------|
| `--motion-fast` | 80ms | Instant feedback — hover, focus ring, chip state |
| `--motion-medium` | 150ms | Disclosure changes — Rail expand, tab swaps |
| `--motion-slow` | 250ms | Overlay open/close — Settings, Global Search |
| `--motion-ease` | `cubic-bezier(0.2, 0, 0, 1)` | Standard easing curve (Material standard / cluster anchor across Material / Carbon / Atlassian per AESTHETICS.md § Motion row "Easing curve") |

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
