# Hearth Theme System

The Hearth theme is a unified design language with two modes: **Hearth Light** and **Hearth Dark**. They share structure, typography, spacing, and interaction patterns — only surface colors, text colors, border values, and accent intensities change between modes.

Hearth is **light-first**: the default mode is `hearth-light`, matching most productivity apps and reducing eye fatigue in typical office environments.

---

## Design Philosophy

**Warm earth aesthetic.** Surfaces use warm cream and earth tones rather than cool grays. The palette evokes natural materials: parchment, leather, aged wood.

**Forest green as the single accent.** The primary accent is `#16764f` (forest green, lightened to `#2eaa7a` in dark mode for contrast). Amber (`#d97706`) serves as the secondary accent for attention-drawing elements.

**Semantic status signals.** Status colors communicate meaning clearly: green for success, amber for warning, red for error, blue for info. Colors are context-appropriate rather than decorative.

**No external font dependencies.** Hearth uses system-ui and ui-monospace — the native UI fonts on each platform. This eliminates flash-of-incorrect-font, reduces load time, and respects the user's OS font preferences.

---

## Shared Properties (Both Modes)

| Property | Value |
|----------|-------|
| Font UI | system-ui, -apple-system, Segoe UI |
| Font Mono | ui-monospace, SF Mono, Cascadia Code |
| Radii | 0 / 10px / 16px / 9999px |
| Motion fast | 120ms |
| Motion default | 240ms |
| Motion slow | 450ms |
| Spacing grid | 6px baseline (values: 3, 6, 9, 12, 18, 24, 36, 48) |
| DaisyUI --rounded-box | 16px |
| DaisyUI --rounded-btn | 9999px |
| DaisyUI --rounded-badge | 9999px |

---

## Hearth Light

**Mood:** Warm, open, daylight-clear. A well-lit workspace with natural materials.
**References:** Notion (light), Linear (light), Bear app.

Warm cream base (`#f5f0e6`), white elevated surfaces, forest green accent that reads as confident without being aggressive.

| Token | Value |
|-------|-------|
| `--surface-page` | `#f5f0e6` |
| `--surface-container` | `#ede7db` |
| `--surface-elevated` | `#ffffff` |
| `--surface-overlay` | `#ffffff` |
| `--text-primary` | `#2c241a` |
| `--text-secondary` | `#6b5d4d` |
| `--text-tertiary` | `#9a8d7e` |
| `--accent-primary` | `#16764f` |
| `--accent-secondary` | `#d97706` |
| `--status-success` | `#16764f` |
| `--status-warning` | `#d97706` |
| `--status-error` | `#dc4a3a` |
| `--status-info` | `#2e7dba` |
| `--border-default` | `#d5cbb8` |

**Token source:** `framework/design-system/src/tokens.css` (Hearth Light section)

---

## Hearth Dark

**Mood:** Warm, focused, evening-ready. A candlelit workspace with depth.
**References:** Obsidian (dark), Bear (dark), Craft (dark).

Deep warm earth base (`#1a1510`), no cool grays anywhere. Dark mode accent (`#2eaa7a`) is lightened relative to light mode (`#16764f`) for contrast on dark surfaces.

| Token | Value |
|-------|-------|
| `--surface-page` | `#1a1510` |
| `--surface-container` | `#231e16` |
| `--surface-elevated` | `#2c261c` |
| `--surface-overlay` | `#352e23` |
| `--text-primary` | `#ede5d8` |
| `--text-secondary` | `#a89880` |
| `--text-tertiary` | `#9a8e7e` |
| `--accent-primary` | `#2eaa7a` |
| `--accent-secondary` | `#d97706` |
| `--status-success` | `#2eaa7a` |
| `--status-warning` | `#d97706` |
| `--status-error` | `#ee6a5a` |
| `--status-info` | `#4498d4` |
| `--border-default` | `#554a3c` |

**Token source:** `framework/design-system/src/tokens.css` (Hearth Dark section)

---

## How to Switch Themes

### Via data-theme attribute

```html
<html data-theme="hearth-light">
<!-- or -->
<html data-theme="hearth-dark">
```

### Via settings panel

Users toggle between Hearth Light and Hearth Dark in the app settings. The preference is persisted and overrides `prefers-color-scheme`.

### Via system preference

When no user preference is set, the app respects `prefers-color-scheme: dark` / `prefers-color-scheme: light`. The default (no data-theme set) is `hearth-light`.

### In the design system viewer

```bash
npm run ds:serve
# Open http://localhost:8098/BetCard.html
# Use the theme picker in the top-right corner to switch between Hearth Light and Hearth Dark
```

### Apply a theme mode to the full app

The TSX components use `var(--token-name)` throughout. To switch modes:
1. Load the appropriate theme CSS file (`hearth-light.css` or `hearth-dark.css`)
2. Set `data-theme="hearth-light"` or `data-theme="hearth-dark"` on the root element

---

## Creating Components for Both Modes

All components must work in both Hearth Light and Hearth Dark. Rules:

1. **Use semantic tokens only.** `var(--surface-elevated)`, never `#ffffff` or `#2c261c`.
2. **Use solid-value borders.** `var(--border-default)` is a warm solid tone that reads clearly in both modes.
3. **Test in both modes.** Every component must be visually verified in Hearth Light and Hearth Dark before shipping.
4. **Shadows are active in both modes.** Light mode shadows are warm-tinted; dark mode shadows are black-based.
5. **Status colors are semantic.** Do not use accent-primary for status — use `--status-*` tokens.
