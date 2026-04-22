# Plan: Unify Themes into "Lucid" Light/Dark System

## Context

The design system currently has 4 exploratory themes (Factory Dark, Calm Precision, Light Ops, Monochrome Machine). After visual evaluation, the user chose to merge Light Ops (light) and Mono Machine (dark) into a single cohesive theme called **Lucid**, with shared non-color tokens and light/dark color modes. The Bloomberg terminal aesthetic is being retired.

The app is well-prepared: all components use semantic CSS variables (`var(--surface-3)`) and DaisyUI classes (`btn-primary`, `badge-error`). Zero hardcoded Tailwind color classes exist. The migration is primarily token/config changes — no component code rewrites needed.

---

## Lucid Theme Specification

### Shared Tokens (same in both modes)

| Token | Value | Source |
|-------|-------|--------|
| `--r0` | 0 | — |
| `--r1` | 4px | Light Ops (rounder) |
| `--r2` | 8px | Light Ops |
| `--r3` | 12px | Light Ops |
| `--r-pill` | 999px | — |
| `--motion-fast` | 80ms | Mono Machine (snappier) |
| `--motion-medium` | 150ms | Mono Machine |
| `--motion-slow` | 250ms | Mono Machine |
| `--ui` | `"Geist", "Inter", system-ui, sans-serif` | User chose Geist |
| `--mono` | `"Geist Mono", ui-monospace, monospace` | User chose Geist |

### Status Color Philosophy: Monochrome Signals

Inspired by Mono Machine: warn and ok are neutral grays. Only danger carries color (red). This means the interface is calm by default — when red appears, it's impossible to miss because it has the entire color spectrum to itself. Status is communicated through shape (dot, icon), text labels, and position in addition to color.

### Lucid Dark (Mono Machine surfaces + monochrome status)

| Token | Value |
|-------|-------|
| `--surface-0` | `#111113` |
| `--surface-1` | `#19191c` |
| `--surface-2` | `#1e1e22` |
| `--surface-3` | `#27272b` |
| `--surface-4` | `#323237` |
| `--surface-5` | `#3e3e44` |
| `--surface-6` | `#4a4a52` |
| `--surface-ghost` | `rgba(255,255,255,0.05)` |
| `--primary` | `#e0e7ff` |
| `--primary-dim` | `rgba(224,231,255,0.08)` |
| `--primary-hover` | `rgba(224,231,255,0.14)` |
| `--warn` | `#a8a8b0` |
| `--ok` | `#c8c8d0` |
| `--danger` | `#f87171` |
| `--text-hi` | `#ededef` |
| `--text-mid` | `#a0a0a6` |
| `--text-lo` | `#6e6e76` |
| `--float` | `0 2px 16px rgba(0,0,0,0.5)` |
| `--border-subtle` | `rgba(255,255,255,0.06)` |
| `--border-default` | `rgba(255,255,255,0.10)` |
| `--border-emphasis` | `rgba(255,255,255,0.16)` |
| `color-scheme` | `dark` |

### Lucid Light (Light Ops surfaces + monochrome status)

| Token | Value |
|-------|-------|
| `--surface-0` | `#fafaf9` |
| `--surface-1` | `#ffffff` |
| `--surface-2` | `#f4f4f2` |
| `--surface-3` | `#eaeae8` |
| `--surface-4` | `#ddddd9` |
| `--surface-5` | `#d0d0cc` |
| `--surface-6` | `#c4c4be` |
| `--surface-ghost` | `rgba(0,0,0,0.04)` |
| `--primary` | `#4f46e5` |
| `--primary-dim` | `rgba(79,70,229,0.08)` |
| `--primary-hover` | `rgba(79,70,229,0.12)` |
| `--warn` | `#78787e` |
| `--ok` | `#8e8e94` |
| `--danger` | `#dc2626` |
| `--text-hi` | `#1a1a1e` |
| `--text-mid` | `#6b6b70` |
| `--text-lo` | `#737378` |
| `--float` | `0 4px 16px rgba(0,0,0,0.1)` |
| `--border-subtle` | `rgba(0,0,0,0.06)` |
| `--border-default` | `rgba(0,0,0,0.10)` |
| `--border-emphasis` | `rgba(0,0,0,0.16)` |
| `color-scheme` | `light` |

**WCAG fix:** Original Light Ops `--text-lo` was `#9c9ca0` (2.6:1 ratio on `#fafaf9`). Changed to `#737378` (4.5:1, passes AA).

**Light mode warn/ok:** Darker neutral grays (`#78787e`, `#8e8e94`) to maintain readable contrast against the light background. Dark mode uses lighter grays (`#a8a8b0`, `#c8c8d0`) per Mono Machine.

---

## Implementation Phases

### Phase 1: Core Token Files

Rewrite the foundation. Everything else depends on this.

**1A. `packages/design-system/src/tokens.css`** — Rewrite with structure:
```
@layer base {
  :root {
    /* Shared: radii, motion, typography */
  }
  :root, [data-theme="lucid-dark"] {
    /* Dark color tokens (default) */
    color-scheme: dark;
  }
  [data-theme="lucid-light"] {
    /* Light color tokens */
    color-scheme: light;
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme]) {
      /* Light tokens for "system" preference */
      color-scheme: light;
    }
  }
  /* Density presets (unchanged) */
}
```

**1B. `packages/design-system/html/_tokens.css`** — Same token structure without `@layer`. Update Google Fonts import: `Inter + Space Grotesk` → `Geist + Geist Mono`.

**1C. New `html/themes/lucid-dark.css`** and **`html/themes/lucid-light.css`**

**1D. Delete** `factory-dark.css`, `calm-precision.css`, `light-ops.css`, `mono-machine.css`

**1E. Rewrite `html/themes/_switcher.js`** — 2 themes: Dark + Light. Default: lucid-dark.

### Phase 2: Tailwind/DaisyUI + Web CSS

**2A. `packages/web/tailwind.config.ts`** — Replace single `factory-dark` DaisyUI theme with:
- `lucid-dark`: Mono Machine surfaces, monochrome status (secondary=`#a8a8b0`, accent=`#c8c8d0`, error=`#f87171`), `--rounded-box: 8px`, `--rounded-btn: 4px`, `--rounded-badge: 4px`
- `lucid-light`: Light Ops surfaces, monochrome status (secondary=`#78787e`, accent=`#8e8e94`, error=`#dc2626`), same radii
- Font: `sans: ["Geist", "Inter", ...]`, `heading: ["Geist Mono", ...]`
- DaisyUI `warning` and `success` map to gray tones (monochrome status); `error` is the only semantic color

**2B. `packages/web/src/index.css`** — Update Google Fonts import to Geist + Geist Mono.

### Phase 3: App Shell Theme Switching

**3A. `packages/web/src/components/SettingsPanel.tsx`**
- Add `Theme = "light" | "dark" | "system"` type
- Add `theme` to `AppearanceSettings`
- Replace "deferred to v2" placeholder with theme selector (System/Light/Dark)
- Add `onThemeChange` callback, `updateTheme` handler

**3B. `packages/web/src/fixtures/app-shell-data.ts`**
- `appearance: { density: "default", theme: "system" }`

**3C. `packages/web/src/layouts/AppShell.tsx`**
- Add `useEffect` that sets `document.documentElement.setAttribute("data-theme", ...)` based on theme setting
- `"system"` → remove `data-theme` attribute (CSS `@media prefers-color-scheme` takes over)
- `"dark"` → `data-theme="lucid-dark"`
- `"light"` → `data-theme="lucid-light"`

### Phase 4: HTML Components Verification

All 14 components use CSS variables, so they adapt automatically. Verify:
- `color-mix()` opacity in StatusChip works in light mode
- Skeleton shimmer visible in light mode
- No hardcoded hex outside `var()` definitions in `<style>` blocks
- Font references use `var(--ui)` / `var(--mono)`, not hardcoded names

### Phase 5: Documentation

| File | Change |
|------|--------|
| `packages/design-system/DESIGN.md` | Full rewrite: Lucid theme, Geist fonts, new radii/motion/borders |
| `packages/design-system/THEMES.md` | Rewrite: Lucid Dark + Light, shared vs per-mode tokens |
| `packages/design-system/PRINCIPLES.md` | Minor: update pure-black note, clarify indigo accent is intentional |
| `.claude/rules/frontend.md` | Remove "Bloomberg terminal" ref, update to "Lucid" |
| `.claude/rules/design-system.md` | Update theme file references |
| `.claude/agents/designer/AGENT.md` | Remove Bloomberg refs, update aesthetic description |
| `.claude/skills/design-critique/references/*.md` | Update radii, motion, border, font values |

### Phase 6: Tests

| File | Change |
|------|--------|
| `design-system/src/__tests__/themes.test.ts` | 2 themes instead of 4, new filenames |
| `design-system/src/__tests__/tokens.test.ts` | Geist font check, data-theme blocks, prefers-color-scheme |
| `design-system/src/__tests__/docs.test.ts` | Updated theme names, Geist references |
| `web/src/__tests__/foundation.test.ts` | Lucid-dark + lucid-light DaisyUI assertions |
| `web/src/__tests__/motion-tokens.test.ts` | 80/150/250ms values |
| `web/src/__tests__/SettingsPanel*.test.*` | Theme picker rendering + callbacks |
| `web/src/__tests__/AppShell*.test.*` | data-theme attribute on `<html>` |

### Phase 7: Validation

1. `bun run check` — zero type errors
2. `bun run lint` — zero lint errors  
3. `bun run test` — all tests pass
4. `bun run ds:serve` — toggle Dark/Light on all 14 components
5. `bun dev` — Settings > Appearance > theme switching works
6. Verify `prefers-color-scheme` "system" mode
7. Check scrollbars, status chips, color-mix elements in both modes

---

## Critical Files

| Purpose | Path |
|---------|------|
| Token source of truth | `packages/design-system/src/tokens.css` |
| HTML token sheet | `packages/design-system/html/_tokens.css` |
| DaisyUI themes | `packages/web/tailwind.config.ts` |
| Theme switching runtime | `packages/web/src/layouts/AppShell.tsx` |
| Theme picker UI | `packages/web/src/components/SettingsPanel.tsx` |
| Settings defaults | `packages/web/src/fixtures/app-shell-data.ts` |
| Design reference | `packages/design-system/DESIGN.md` |
| Theme switcher (HTML) | `packages/design-system/html/themes/_switcher.js` |
| Foundation test | `packages/web/src/__tests__/foundation.test.ts` |
| Theme test | `packages/design-system/src/__tests__/themes.test.ts` |

## Risks

| Risk | Mitigation |
|------|------------|
| Geist font not on Google Fonts | Inter fallback in font stack ensures rendering; can use Fontsource/Vercel CDN |
| color-mix opacity wrong in light mode | Visual verification in Phase 4; add `--status-tint-opacity` token if needed |
| `--text-lo` WCAG failure in light mode | Already fixed: `#9c9ca0` → `#737378` (4.52:1 ratio) |
| Light-mode indigo primary triggers "no purple" rule | Update AI Aesthetic Blacklist to clarify intentional indigo |
| Monochrome warn/ok reduces color differentiation | Status always paired with shape (dot), text label, and position — never color alone. Aligns with a11y best practice. |
| Visual regression baselines invalidated | Regenerate after rollout |
