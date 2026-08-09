# Hearth Theme System

The Hearth theme is a unified design language with two modes: **Hearth Light** and **Hearth Dark**. They share structure, typography, spacing, and interaction patterns — only surface colors, text colors, border values, and accent intensities change between modes.

Hearth is **light-first**: the default mode is `hearth-light`, matching most productivity apps and reducing eye fatigue in typical office environments.

---

## Design Philosophy

**Crème lemon aesthetic.** Surfaces use pale lemon cream rather than cool grays or flat beige — warm, bright, and energetic. The palette evokes lemon curd, cream, and caramelized sugar.

**Two-role accent.** The accent splits by role, not by decoration:
- **Lemon drop** (`#f0c419`, dark mode `#f5d33d`) is the FILL accent — primary buttons, checkboxes, toggles, count badges. It is bright yellow, so content on it is DARK (`--text-on-accent`), never white.
- **Cocoa** (`#6f4d1e`, dark mode light beige `#d9c9a3`) is the TEXT accent — links, icons, focus rings, ghost buttons, and agent-avatar identity. Text-safe contrast on every surface.

**Semantic status signals.** Status colors communicate meaning clearly: green for success, amber for warning, red for error, blue for info. Success stays green — deliberately decoupled from the lemon accent so the success semantic survives the palette.

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

**Mood:** Bright, energetic, daylight-clear. A well-lit workspace with lemon and cream.
**References:** Notion (light), Linear (light), Bear app.

Pale lemon base, white elevated surfaces, lemon-drop buttons with dark content, cocoa text accents.

**Token source:** `framework/design-system/src/tokens.css` (Hearth Light section) — values live in code, never duplicated here.

Key facts:
- Surfaces: pale lemon ladder (`page → container → white`), even ΔL steps.
- `--accent-primary` = lemon drop (fill role); `--accent-deep` = cocoa (text role).
- `--text-on-accent` is DARK — white fails on lemon (~1.6:1).
- Status: green success, amber warning, red error, blue info (light-mode values are icon/badge only where noted in tokens.css lore).

---

## Hearth Dark

**Mood:** Warm, focused, evening-ready. A candlelit workspace with depth.
**References:** Obsidian (dark), Bear (dark), Craft (dark).

Deep near-neutral base with a whisper of lemon — no cool grays, no brown mud. Dark mode accent is a lighter lemon drop for fills; the text accent is light beige (the crème family inverted onto the deep base — NOT lime, which clashes with the yellow primary).

**Token source:** `framework/design-system/src/tokens.css` (Hearth Dark section) — values live in code, never duplicated here.

Key facts:
- Surfaces keep CP1's de-browned depth; hue nudged amber→lemon at the same low chroma.
- `--accent-primary` = lighter lemon drop; `--accent-deep` = light beige.
- `--text-on-accent` is DARK on lemon fills here too.
- Status tokens pass AA on all dark surfaces.

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

### Apply a theme mode to the full app

The TSX components use `var(--token-name)` throughout. To switch modes:
1. Load the appropriate theme CSS file (`hearth-light.css` or `hearth-dark.css`)
2. Set `data-theme="hearth-light"` or `data-theme="hearth-dark"` on the root element

---

## Creating Components for Both Modes

All components must work in both Hearth Light and Hearth Dark. Rules:

1. **Use semantic tokens only.** `var(--surface-elevated)`, never raw hex values.
2. **Accent by role.** Fills (buttons, checked states, badges) use `--accent-primary` + `--text-on-accent` (dark content). Text/icons/focus/identity use `--accent-deep`. Never use lemon as a text color on pale surfaces — it fails contrast.
3. **Use solid-value borders.** `var(--border-default)` is a warm solid tone that reads clearly in both modes.
4. **Test in both modes.** Every component must be visually verified in Hearth Light and Hearth Dark before shipping.
5. **Shadows are active in both modes.** Light mode shadows are warm-tinted; dark mode shadows are black-based.
6. **Status colors are semantic.** Do not use accent-primary for status — use `--status-*` tokens.
