# Lucid Theme System

The Lucid theme is a unified design language with two modes: **Lucid Dark** and **Lucid Light**. They share structure, typography, spacing, and interaction patterns — only surface colors, text colors, border opacities, and accent intensities change between modes.

---

## Design Philosophy

**Monochrome status signals.** Warn and ok are neutral grays in both modes. Only danger is red. Color is reserved for "act now" situations. Status is communicated through position, shape, text, and fill — not hue — except when something is genuinely broken.

**Precision instrument aesthetic.** Dense, purposeful, distinctive. Every element earns its place. The UI is a tool, not a showcase.

**No pure black, no pure white.** Lucid Dark uses `#111113` (lifted off pure black to prevent halation). Lucid Light uses `#fafaf9` (warm off-white to reduce glare).

---

## Shared Properties (Both Modes)

| Property | Value |
|----------|-------|
| Font UI | Geist (400/500/600) |
| Font Mono | Geist Mono (400/500) |
| Radii | 0 / 4px / 8px / 12px / 999px |
| Motion fast | 80ms |
| Motion medium | 150ms |
| Motion slow | 250ms |
| Spacing grid | 4px baseline |
| Border subtle opacity | 0.06 |
| Border default opacity | 0.10 |
| Border emphasis opacity | 0.16 |
| DaisyUI --rounded-box | 8px |
| DaisyUI --rounded-btn | 4px |
| DaisyUI --rounded-badge | 4px |

---

## Lucid Dark

**Mood:** Precise, engineered, quietly confident. A well-organized workspace at 10pm.
**References:** Vercel/Geist, Linear, Superhuman, Warp terminal.

Near-black base (`#111113`), seven tonal surface steps with clear perceptual gaps, 1px borders as the primary organizational mechanism, Geist Mono for data, maximum density with mathematical consistency.

| Token | Value |
|-------|-------|
| `--surface-0` | `#111113` |
| `--surface-1` | `#18181b` |
| `--surface-2` | `#1e1e21` |
| `--surface-3` | `#232326` |
| `--surface-4` | `#28282c` |
| `--surface-5` | `#2e2e33` |
| `--surface-6` | `#35353b` |
| `--text-hi` | `#ececef` |
| `--text-mid` | `#a1a1aa` |
| `--text-lo` | `#71717a` |
| `--primary` | `#e0e7ff` |
| `--warn` | `#a8a8b0` (gray) |
| `--ok` | `#c8c8d0` (gray) |
| `--danger` | `#f87171` (red) |
| `--border-default` | `rgba(255,255,255,0.10)` |
| `--float` | `0 0 32px rgba(0,0,0,0.4)` |

**File:** `html/themes/lucid-dark.css`

---

## Lucid Light

**Mood:** Clear, authoritative, daylight-bright. A modern command center with natural light.
**References:** Stripe Dashboard, GitHub (light), Apple HIG, Linear (light mode).

Warm off-white base (`#fafaf9`), white content cards, card elevation via subtle shadows. Status colors are muted grays against light backgrounds except danger which pops as saturated red.

| Token | Value |
|-------|-------|
| `--surface-0` | `#fafaf9` |
| `--surface-1` | `#f4f4f3` |
| `--surface-2` | `#ededec` |
| `--surface-3` | `#ffffff` |
| `--surface-4` | `#f7f7f6` |
| `--surface-5` | `#ebebea` |
| `--surface-6` | `#e0e0df` |
| `--text-hi` | `#18181b` |
| `--text-mid` | `#52525b` |
| `--text-lo` | `#a1a1aa` |
| `--primary` | `#4f46e5` (indigo) |
| `--warn` | `#78787e` (gray) |
| `--ok` | `#8e8e94` (gray) |
| `--danger` | `#dc2626` (red) |
| `--border-default` | `rgba(0,0,0,0.10)` |
| `--float` | `0 4px 24px rgba(0,0,0,0.08)` |

**File:** `html/themes/lucid-light.css`

---

## How to Switch Themes

### Via data-theme attribute

```html
<html data-theme="lucid-dark">
<!-- or -->
<html data-theme="lucid-light">
```

### Via settings panel

Users toggle between Lucid Dark and Lucid Light in the app settings. The preference is persisted and overrides `prefers-color-scheme`.

### Via system preference

When no user preference is set, the app respects `prefers-color-scheme: dark` / `prefers-color-scheme: light`.

### In the design system viewer

```bash
bun run ds:serve
# Open http://localhost:8098/BetCard.html
# Use the theme picker in the top-right corner to switch between Lucid Dark and Lucid Light
```

### Apply a theme mode to the full app

The TSX components use `var(--token-name)` throughout. To switch modes:
1. Load the appropriate theme CSS file (`lucid-dark.css` or `lucid-light.css`)
2. Set `data-theme="lucid-dark"` or `data-theme="lucid-light"` on the root element

---

## Creating Components for Both Modes

All components must work in both Lucid Dark and Lucid Light. Rules:

1. **Use semantic tokens only.** `var(--surface-3)`, never `#232326` or `#ffffff`.
2. **Use alpha-based borders.** `var(--border-default)` adapts to both modes automatically when using white-alpha (dark) or black-alpha (light).
3. **Test in both modes.** Every component must be visually verified in Lucid Dark and Lucid Light before shipping.
4. **Shadows in light mode.** Light mode uses `var(--float)` shadows for elevation. Dark mode uses surface lightness.
5. **Status colors are gray.** Do not rely on warm/cool hue to distinguish ok from warn. Use text labels and icons.
