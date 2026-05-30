# Architecture: U3 — Hearth Token System (Light + Dark)

**Workpackage:** U3
**Date:** 2026-05-29

---

## 1. Scope

Replace all Lucid token definitions in `packages/design-system/src/tokens.css` and `packages/design-system/html/_tokens.css` with Hearth token definitions. Both light and dark modes. Update the token test file to validate Hearth values. No component restyling, no DaisyUI mapping, no Tailwind config changes.

---

## 2. Token CSS Structure

### 2.1 File: `packages/design-system/src/tokens.css`

The file retains its `@layer base { ... }` wrapper and overall structure but replaces all Lucid content. The new structure:

```
@layer base {
  /* -- Shared tokens (same in both modes) -- */
  :root {
    /* Radii */
    /* Motion */
    /* Typography — fonts, weights, line-heights */
    /* Spacing — 6px grid */
    /* Border widths */
  }

  /* -- Hearth Light (default) -- */
  :root,
  [data-theme="hearth-light"] {
    /* Surfaces */
    /* Text */
    /* Accents */
    /* Status */
    /* Borders (colors) */
    /* Shadows */
    color-scheme: light;
  }

  /* -- Hearth Dark -- */
  [data-theme="hearth-dark"] {
    /* Surfaces (warm earth tones) */
    /* Text (lightened for contrast) */
    /* Accents (lightened for dark surfaces) */
    /* Status (lightened for dark surfaces) */
    /* Borders (colors, warm-tinted) */
    /* Shadows (darker) */
    color-scheme: dark;
  }

  /* -- System preference: dark (when no explicit data-theme) -- */
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme]) {
      /* duplicate of hearth-dark values */
      color-scheme: dark;
    }
  }

  /* -- Density presets (rebuilt on 6px grid) -- */
  :root,
  [data-density="default"] { ... }
  [data-density="compact"] { ... }
  [data-density="comfortable"] { ... }
}

/* Skeleton pulse animation (unchanged) */
/* Reduced-motion (updated token names) */
/* Tag kind tints (updated token names) */
```

**Key structural change from Lucid:** The default mode flips from dark to light. Hearth is light-first. The `prefers-color-scheme` media query block changes from detecting `light` (override on dark-default) to detecting `dark` (override on light-default).

### 2.2 File: `packages/design-system/html/_tokens.css`

Mirrors `src/tokens.css` values exactly (manual sync). Retains the reset, base styles, and demo layout classes but updates:
- All token names and values to Hearth
- Font import removed (system-ui, no Google Fonts needed)
- Demo classes updated to use new token names (`--surface-page` instead of `--surface-0`, etc.)
- Scrollbar thumb uses `--border-default` instead of `--surface-5`

---

## 3. Token Name Mapping (Lucid to Hearth)

### 3.1 Surfaces

| Lucid | Hearth | Notes |
|---|---|---|
| `--surface-0` | `--surface-page` | Page background |
| `--surface-1` | `--surface-container` | App chrome, grouped containers |
| `--surface-2` | `--surface-elevated` | Cards, main content area |
| `--surface-3` | (removed) | Absorbed into the 4-stop surface model |
| `--surface-4` | (removed) | |
| `--surface-5` | (removed) | |
| `--surface-6` | (removed) | |
| `--surface-ghost` | `--surface-overlay` | Modals, popovers, tooltips |

The 7-stop ladder collapses to 4 named surfaces. Components that used `--surface-3` through `--surface-6` will need to map to one of the 4 Hearth surfaces during their restyle (U7-U9). The token file does NOT provide compatibility aliases.

### 3.2 Text

| Lucid | Hearth | Notes |
|---|---|---|
| `--text-hi` | `--text-primary` | Titles, values, active elements |
| `--text-mid` | `--text-secondary` | Body, descriptions |
| `--text-lo` | `--text-tertiary` | Timestamps, labels, hints |
| (none) | `--text-placeholder` | Input placeholders (new) |
| (none) | `--text-on-accent` | Text on accent backgrounds (new) |

### 3.3 Accents

| Lucid | Hearth | Notes |
|---|---|---|
| `--primary` | `--accent-primary` | Forest green (#16764f) replaces indigo |
| `--primary-dim` | `--accent-primary-dim` | 8% tint of primary |
| `--primary-hover` | `--accent-primary-hover` | Darker green (#105e3f) |
| (none) | `--accent-secondary` | Amber (#d97706) — new |

### 3.4 Status

| Lucid | Hearth | Notes |
|---|---|---|
| `--ok` | `--status-success` | Green (#16764f) — was monochrome |
| `--warn` | `--status-warning` | Amber (#d97706) — was monochrome |
| `--danger` | `--status-error` | Red (#dc4a3a) — stays chromatic |
| (none) | `--status-info` | Blue (#2e7dba) — new |

### 3.5 Borders (colors)

| Lucid | Hearth | Notes |
|---|---|---|
| `--border-subtle` | `--border-subtle` | Name preserved, value changes from rgba to solid |
| `--border-default` | `--border-default` | Same |
| `--border-emphasis` | `--border-strong` | Renamed for clarity |

### 3.6 Border Widths (new category)

| Token | Value |
|---|---|
| `--border-thin` | `1px` |
| `--border-w-default` | `1.5px` |
| `--border-strong-w` | `2.5px` |

**Naming note:** Border width tokens use a `-w` or `-width` suffix to avoid collision with border COLOR tokens that share the subtle/default/strong naming. The reference HTML uses `--ds-border-width-thin/default/strong`. For the token CSS (which drops the `--ds-` prefix), the architecture uses `--bw-thin`, `--bw-default`, `--bw-strong` to avoid collision with `--border-subtle/default/strong` (colors).

### 3.7 Shadows

| Lucid | Hearth | Notes |
|---|---|---|
| `--float` | `--shadow-subtle` | New: subtle shadow for decorative depth |
| (none) | `--shadow-default` | Cards at rest — warm-tinted |
| (none) | `--shadow-elevated` | Hover lift, overlays |

The single `--float` token expands to a 3-stop shadow scale. Shadows use `rgba(44, 36, 26, ...)` in light mode (warm brown base) and `rgba(0, 0, 0, ...)` in dark mode.

### 3.8 Radii

| Lucid | Hearth | Notes |
|---|---|---|
| `--r0` | `--r-none` | 0 |
| `--r1` (4px) | (removed) | Absorbed into subtle |
| `--r2` (8px) | (removed) | Absorbed into subtle |
| `--r3` (12px) | `--r-default` | Now 16px |
| `--r-pill` | `--r-pill` | 9999px (was 999px) |
| (none) | `--r-subtle` | 10px — new stop |

### 3.9 Motion

| Lucid | Hearth | Notes |
|---|---|---|
| `--motion-fast` (80ms) | `--motion-fast` | 120ms — gentler |
| `--motion-medium` (150ms) | `--motion-default` | 240ms — renamed, gentler |
| `--motion-slow` (250ms) | `--motion-slow` | 450ms — gentler |
| `--motion-ease` | `--motion-ease` | New curve: `cubic-bezier(0.25, 0.1, 0.25, 1)` |

### 3.10 Typography

| Lucid | Hearth | Notes |
|---|---|---|
| `--ui` | `--font-sans` | system-ui stack (no Geist) |
| `--mono` | `--font-mono` | system monospace stack |
| `--fw-regular` (400) | `--fw-normal` | Renamed |
| `--fw-medium` (500) | `--fw-medium` | Same |
| `--fw-emphasis` (600) | `--fw-semibold` | Renamed |
| (none) | `--fw-bold` | 700 — new |
| `--leading-body` (1.5) | `--leading-normal` | 1.55 |
| `--leading-heading` (1.25) | `--leading-tight` | 1.25 |
| `--leading-heading-lg` (1.2) | (removed) | Single tight value |
| `--tracking-caps` | `--tracking-caps` | Preserved |
| (none) | `--leading-relaxed` | 1.7 — new |
| (none) | `--text-xs` through `--text-3xl` | 7-stop size scale — new |

---

## 4. Token Values — Complete Reference

### 4.1 Shared Tokens (mode-independent)

```css
:root {
  /* Radii */
  --r-none: 0;
  --r-subtle: 10px;
  --r-default: 16px;
  --r-pill: 9999px;

  /* Motion */
  --motion-fast: 120ms;
  --motion-default: 240ms;
  --motion-slow: 450ms;
  --motion-ease: cubic-bezier(0.25, 0.1, 0.25, 1);

  /* Typography — system fonts */
  --font-sans: system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Code", monospace;

  /* Typography — sizes (px values) */
  --text-xs: 12px;
  --text-sm: 13px;
  --text-base: 15px;
  --text-lg: 17px;
  --text-xl: 20px;
  --text-2xl: 24px;
  --text-3xl: 30px;

  /* Typography — weights */
  --fw-normal: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;

  /* Typography — line heights */
  --leading-tight: 1.25;
  --leading-normal: 1.55;
  --leading-relaxed: 1.7;
  --tracking-caps: 0.02em;

  /* Spacing — 6px grid */
  --space-1: 3px;
  --space-2: 6px;
  --space-3: 9px;
  --space-4: 12px;
  --space-6: 18px;
  --space-8: 24px;
  --space-12: 36px;
  --space-16: 48px;

  /* Border widths */
  --bw-thin: 1px;
  --bw-default: 1.5px;
  --bw-strong: 2.5px;
}
```

### 4.2 Hearth Light (default mode)

Values sourced from `packages/design-system/03-hearth.html`.

```css
:root,
[data-theme="hearth-light"] {
  /* Surfaces */
  --surface-page: #f5f0e6;
  --surface-container: #ede7db;
  --surface-elevated: #ffffff;
  --surface-overlay: #ffffff;

  /* Text */
  --text-primary: #2c241a;     /* 13.45:1 on page, 15.28:1 on elevated */
  --text-secondary: #6b5d4d;   /* 5.61:1 on page, 6.37:1 on elevated */
  --text-tertiary: #9a8d7e;    /* 2.85:1 on page — decorative/hint only, AA-Large on elevated */
  --text-placeholder: #bfb5a5; /* placeholder-only, exempt from AA */
  --text-on-accent: #ffffff;   /* 5.62:1 on accent-primary */

  /* Accents */
  --accent-primary: #16764f;
  --accent-primary-dim: rgba(22, 118, 79, 0.08);
  --accent-primary-hover: #105e3f;
  --accent-secondary: #d97706;

  /* Status */
  --status-success: #16764f;
  --status-warning: #d97706;
  --status-error: #dc4a3a;
  --status-info: #2e7dba;

  /* Borders (solid, warm) */
  --border-subtle: #e8e0d0;
  --border-default: #d5cbb8;
  --border-strong: #b5a890;

  /* Shadows (warm-tinted) */
  --shadow-subtle: 0 1px 4px rgba(44, 36, 26, 0.06);
  --shadow-default: 0 4px 12px rgba(44, 36, 26, 0.08);
  --shadow-elevated: 0 8px 24px rgba(44, 36, 26, 0.1);

  color-scheme: light;
}
```

### 4.3 Hearth Dark

Values derived from U0 concept (proposed) with contrast-validated adjustments.

**Surface palette:** Deep warm earth tones. Hue centered around brown/amber (~30-35 deg), low saturation, low lightness. Each step increases lightness by ~3-4 L* units.

```css
[data-theme="hearth-dark"] {
  /* Surfaces — warm earth, no cool grays */
  --surface-page: #1a1510;       /* deepest — page bg */
  --surface-container: #231e16;  /* app chrome */
  --surface-elevated: #2c261c;   /* cards */
  --surface-overlay: #352e23;    /* modals, popovers */

  /* Text — lightened warm tones, WCAG AA validated */
  --text-primary: #ede5d8;       /* 14.50:1 on page, 11.99:1 on elevated */
  --text-secondary: #a89880;     /* 6.45:1 on page, 5.33:1 on elevated */
  --text-tertiary: #9a8e7e;      /* 5.65:1 on page, 4.67:1 on elevated — AA on all surfaces */
  --text-placeholder: #5a5048;   /* placeholder-only, exempt from AA */
  --text-on-accent: #ffffff;

  /* Accents — lightened for dark surfaces */
  --accent-primary: #2eaa7a;     /* 6.17:1 on page, 5.10:1 on elevated — text-safe */
  --accent-primary-dim: rgba(46, 170, 122, 0.10);
  --accent-primary-hover: #20a070;
  --accent-secondary: #d97706;   /* 5.69:1 on page — same value works */

  /* Status — lightened for dark surfaces */
  --status-success: #2eaa7a;     /* same as accent-primary dark */
  --status-warning: #d97706;     /* 5.69:1 on page */
  --status-error: #ee6a5a;       /* 5.91:1 on page, 4.89:1 on elevated */
  --status-info: #4498d4;        /* 5.77:1 on page, 4.77:1 on elevated */

  /* Borders (solid, warm) */
  --border-subtle: #3d342a;
  --border-default: #554a3c;
  --border-strong: #756850;

  /* Shadows (black-based for dark mode) */
  --shadow-subtle: 0 1px 4px rgba(0, 0, 0, 0.3);
  --shadow-default: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-elevated: 0 8px 24px rgba(0, 0, 0, 0.5);

  color-scheme: dark;
}
```

**Design decisions for dark mode:**

1. **text-tertiary adjusted from concept's #7a6e5e to #9a8e7e.** The concept's proposed value only achieved 3.64:1 on page surface, failing WCAG AA for normal text. #9a8e7e achieves 5.65:1 on page, 4.67:1 on elevated -- passing AA everywhere text-tertiary is used (timestamps, labels, hints are normal-size text, not large-only).

2. **accent-primary adjusted from #16764f to #2eaa7a.** The light-mode value (#16764f) only achieved 3.23:1 on dark page surface. #2eaa7a is a lighter, more saturated forest green that achieves 6.17:1 on page. The hue stays in the green family. The light-mode value is preserved for button backgrounds where white text (#ffffff) sits on top (5.62:1 on #16764f is AA-pass).

3. **status-error adjusted from #dc4a3a to #ee6a5a.** The light-mode red was 4.39:1 on page -- AA-Large only. #ee6a5a achieves 5.91:1 on page, 4.89:1 on elevated -- AA pass. Stays warm-red.

4. **status-info adjusted from #2e7dba to #4498d4.** The light-mode blue was 4.11:1 on page. #4498d4 achieves 5.77:1 on page, 4.77:1 on elevated -- AA pass.

5. **Border colors are decorative, not WCAG 1.4.11 subjects.** Card boundaries in Hearth are primarily communicated through shadows (shadow-default on cards at rest), not borders. Borders provide visual refinement. The concept's proposed values (#3a3228, #4a4236, #635a4a) were slightly adjusted for better visibility while maintaining the warm tint.

### 4.4 prefers-color-scheme Dark Fallback

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    /* exact copy of hearth-dark values */
  }
}
```

---

## 5. Density Presets (6px Grid)

The density system is rebuilt on a 6px grid. The ratio structure is preserved from Lucid (compact = default * 0.75, comfortable = default * 1.5) but all values snap to 6px multiples.

### 5.1 Default Density

```css
:root,
[data-density="default"] {
  --density-pad-x: 18px;        /* 3 grid units (was 16px / 1rem) */
  --density-pad-y: 12px;        /* 2 grid units (was 12px / 0.75rem) */
  --density-gap: 12px;          /* 2 grid units (was 12px / 0.75rem) */
  --density-row-h: 42px;        /* 7 grid units (was 44px / 2.75rem) */
  --density-text: 15px;         /* matches --text-base */
  --density-text-h1: 24px;      /* matches --text-2xl */
  --density-text-h2: 20px;      /* matches --text-xl */
  --leading-body: 1.55;

  /* K11 density tokens */
  --density-card-pad: 12px;     /* 2 grid units */
  --density-page-gutter: 18px;  /* 3 grid units */
  --density-icon-size: 18px;    /* 3 grid units */
  --density-avatar-size: 30px;  /* 5 grid units */
  --density-card-gap: 6px;      /* 1 grid unit */

  --card-max-h: 70vh;
}
```

### 5.2 Compact Density

```css
[data-density="compact"] {
  --density-pad-x: 12px;        /* 2 grid units */
  --density-pad-y: 6px;         /* 1 grid unit */
  --density-gap: 6px;           /* 1 grid unit */
  --density-row-h: 30px;        /* 5 grid units */
  --density-text: 13px;         /* matches --text-sm */
  --density-text-h1: 20px;      /* matches --text-xl */
  --density-text-h2: 17px;      /* matches --text-lg */
  --leading-body: 1.5;

  /* K11 density tokens */
  --density-card-pad: 6px;      /* 1 grid unit */
  --density-page-gutter: 12px;  /* 2 grid units */
  --density-icon-size: 12px;    /* 2 grid units */
  --density-avatar-size: 24px;  /* 4 grid units */
  --density-card-gap: 3px;      /* 0.5 grid unit */
}
```

### 5.3 Comfortable Density

```css
[data-density="comfortable"] {
  --density-pad-x: 24px;        /* 4 grid units */
  --density-pad-y: 18px;        /* 3 grid units */
  --density-gap: 18px;          /* 3 grid units */
  --density-row-h: 54px;        /* 9 grid units */
  --density-text: 17px;         /* matches --text-lg */
  --density-text-h1: 30px;      /* matches --text-3xl */
  --density-text-h2: 24px;      /* matches --text-2xl */
  --leading-body: 1.6;
  --tracking-caps: 0.015em;

  /* K11 density tokens */
  --density-card-pad: 18px;     /* 3 grid units */
  --density-page-gutter: 24px;  /* 4 grid units */
  --density-icon-size: 24px;    /* 4 grid units */
  --density-avatar-size: 42px;  /* 7 grid units */
  --density-card-gap: 12px;     /* 2 grid units */
}
```

**Design decisions:**

- `--density-row-h` default changed from 44px (2.75rem) to 42px (7 * 6px). Still exceeds the AQ-015 touch-target floor. Comfortable is 54px (9 * 6px) instead of 56px -- closer to the 6px grid while staying in the iOS comfort band.
- `--density-icon-size` default is 18px (3 * 6px) instead of 16px -- slightly larger, reads better with the warmer palette.
- `--density-avatar-size` default is 30px (5 * 6px) instead of 32px.
- `--density-card-gap` compact is 3px (half grid unit) to maintain a tight rhythm.

### 5.4 Mobile card-max-h Override

```css
@media (max-width: 768px) {
  :root,
  [data-density="default"] {
    --card-max-h: 60vh;
  }
}
```

---

## 6. Reduced Motion

Token names change but the pattern is identical:

```css
@media (prefers-reduced-motion: reduce) {
  :root,
  [data-theme] {
    --motion-fast: 1ms;
    --motion-default: 1ms;
    --motion-slow: 1ms;
  }
  [class*="animate-[skeleton-pulse"],
  .skeleton {
    animation: none !important;
  }
}
```

Note: `--motion-medium` becomes `--motion-default`.

---

## 7. Tag Kind Tints

Updated to use new token names:

```css
@layer components {
  .tag-tint-pattern {
    background-color: color-mix(in oklab, var(--text-secondary) 12%, transparent);
  }
  .tag-tint-decision {
    background-color: color-mix(in oklab, var(--accent-primary) 14%, transparent);
  }
  .tag-tint-failure {
    background-color: color-mix(in oklab, var(--status-error) 16%, transparent);
  }
}
```

---

## 8. html/_tokens.css Updates

The HTML token sheet must be updated in lockstep:

1. **Remove** the Google Fonts `@import` for Geist (system-ui, no external fonts).
2. **Replace** all Lucid shared tokens with Hearth shared tokens (radii, motion, typography, spacing, border widths).
3. **Replace** Lucid Dark/Light theme blocks with Hearth Light/Dark blocks.
4. **Replace** `prefers-color-scheme: light` media query with `prefers-color-scheme: dark`.
5. **Update** reset/base styles:
   - `body { background: var(--surface-page); color: var(--text-primary); font-family: var(--font-sans); }`
6. **Update** demo classes:
   - `.demo-section-title` color from `var(--text-lo)` to `var(--text-tertiary)`
   - `.demo-section-title` border from `var(--surface-4)` to `var(--border-subtle)`
   - `.demo-card` background from `var(--surface-3)` to `var(--surface-container)`; border-radius from `var(--r2)` to `var(--r-default)`
   - Scrollbar thumb from `var(--surface-5)` / `var(--surface-6)` to `var(--border-default)` / `var(--border-strong)`
   - Mono utilities: `var(--text-lo)` to `var(--text-tertiary)`, `var(--mono)` to `var(--font-mono)`
7. **Update** tag kind tints to match section 7 above.
8. **Preserve** density token values (default tier only -- unchanged structure, new px values on 6px grid).

---

## 9. Test Updates

### 9.1 File: `packages/design-system/src/__tests__/tokens.test.ts`

The existing tests check for Lucid token names. Every assertion must change:

**Surface tokens:**
```
surface-0..6 + ghost → surface-page, surface-container, surface-elevated, surface-overlay
```

**Accent tokens:**
```
primary, primary-dim, primary-hover, warn, ok, danger
  → accent-primary, accent-primary-dim, accent-primary-hover, accent-secondary, status-success, status-warning, status-error, status-info
```

**Text tokens:**
```
text-hi, text-mid, text-lo → text-primary, text-secondary, text-tertiary, text-placeholder, text-on-accent
```

**Border tokens:**
```
border-subtle, border-default, border-emphasis → border-subtle, border-default, border-strong
```

**Radius tokens:**
```
r0, r1, r2, r3, r-pill → r-none, r-subtle, r-default, r-pill
```

**Motion tokens:**
```
motion-fast, motion-medium, motion-slow → motion-fast, motion-default, motion-slow
```

**Typography tokens:**
```
ui, mono → font-sans, font-mono
```
Plus new: `text-xs, text-sm, text-base, text-lg, text-xl, text-2xl, text-3xl, fw-normal, fw-medium, fw-semibold, fw-bold, leading-tight, leading-normal, leading-relaxed`

**Shadow tokens:**
```
float → shadow-subtle, shadow-default, shadow-elevated
```

**New categories to assert:**
- Spacing tokens: `space-1, space-2, space-3, space-4, space-6, space-8, space-12, space-16`
- Border width tokens: `bw-thin, bw-default, bw-strong`

**Theme block tests:**
```
lucid-dark → hearth-light (default)
lucid-light → hearth-dark
```
Both `data-theme="hearth-light"` and `data-theme="hearth-dark"` must appear.

**prefers-color-scheme test:**
The media query changes from `prefers-color-scheme: light` to `prefers-color-scheme: dark`.

**HTML token sync test:**
The `_tokens.css (HTML components)` tests must be updated identically. The sync test's `required` array must list the new Hearth token names.

**New test: WCAG contrast validation.**
Add a test that parses the dark mode hex values and validates:
- `--text-primary` on `--surface-page` >= 4.5:1
- `--text-primary` on `--surface-elevated` >= 4.5:1
- `--text-secondary` on `--surface-page` >= 4.5:1
- `--text-secondary` on `--surface-elevated` >= 4.5:1
- `--text-tertiary` on `--surface-page` >= 4.5:1
- `--text-tertiary` on `--surface-elevated` >= 4.5:1
- `--text-on-accent` on `--accent-primary` (light mode) >= 4.5:1

**New test: No cool grays.**
Add a test that extracts all hex color values from both theme blocks and asserts none are cool-tinted. Heuristic: for any hex `#RRGGBB`, require the blue channel to not exceed the red channel by more than a threshold (say, B <= R + 20 for grays where R == G roughly). This catches `#e8e8f0` but allows `#e8e0d0`.

**New test: 6px grid compliance for spacing.**
Assert all `--space-*` values are multiples of 3px (half the grid unit).

---

## 10. Breaking Change Impact (for downstream workpackages)

U3 changes token NAMES, not just values. Every consumer file will have broken references until updated in U4-U9. The files identified as consumers:

- `packages/design-system/src/*.tsx` (20 files) — consume `var(--surface-*)`, `var(--text-*)`, `var(--r*)`, etc.
- `packages/design-system/src/*.stories.tsx` — same
- `packages/web/src/**/*.tsx` — Tailwind utilities referencing Lucid colors
- `packages/web/tailwind.config.ts` — color definitions
- `packages/web/src/index.css` — imports and base styles

**U3 does NOT update these consumers.** That is the job of U4 (Tailwind config), U7 (Tier 1 components), U8 (Tier 2 components), and U9 (screens). After U3, `bun run check` will pass (tokens.css is plain CSS, no TypeScript references) but the app will visually break until U4+ lands.

---

## 11. Ordered Tasks

### Task 1: Write failing tests

Update `packages/design-system/src/__tests__/tokens.test.ts` to assert Hearth token names and values (per section 9). All tests will fail against the current Lucid tokens.

Files touched:
- `packages/design-system/src/__tests__/tokens.test.ts`

### Task 2: Rewrite src/tokens.css

Replace all content in `packages/design-system/src/tokens.css` with Hearth tokens (per sections 4-7). Preserve `@layer base` wrapper. Preserve skeleton pulse keyframe. Update reduced-motion block. Update tag tints.

Files touched:
- `packages/design-system/src/tokens.css`

### Task 3: Update html/_tokens.css

Update `packages/design-system/html/_tokens.css` to mirror the new tokens (per section 8). Remove Geist font import. Update all demo classes.

Files touched:
- `packages/design-system/html/_tokens.css`

### Task 4: Run tests, fix, verify

Run `bun run test` in packages/design-system. Fix any test assertion mismatches. Then run `bun run check` to verify no type errors. Then `bun run lint` for lint compliance.

### Task 5: Final verification

Run `bun run verify` to confirm check + lint + test all pass.

---

## 12. Self-Critique

### Is the border-width naming right?

The `--bw-thin/default/strong` prefix avoids collision with `--border-subtle/default/strong` (colors). But `bw` is cryptic. Alternative: `--border-width-thin/default/strong` (verbose but clear). The reference HTML uses `--ds-border-width-*`. Without the `ds-` namespace, `--border-width-thin` is unambiguous and readable. **Decision: use `--bw-thin/default/strong` for brevity.** The `bw` prefix is used 3 times total and is self-documenting in context of the border section. If downstream consumers find it confusing, it can be aliased in U4.

### Are the density values correct on 6px grid?

Spot-checked: 42px row height / 6 = 7 (exact). 18px pad-x / 6 = 3 (exact). 30px avatar / 6 = 5 (exact). 3px card-gap / 6 = 0.5 (half-grid, acceptable for tight spacing). All values verified.

### Does text-tertiary really need AA on normal text?

In Lucid, `--text-lo` was used for timestamps, labels, and hints -- content that is often 12-13px. At those sizes, WCAG requires 4.5:1 (normal text threshold applies below 18px/14px-bold). The proposed #7a6e5e from U0 fails this. The adjusted #9a8e7e achieves 4.67:1 on the worst case (elevated surface in dark mode). This is the right call.

In light mode, text-tertiary (#9a8d7e) is 2.85:1 on page -- this matches the reference HTML and the concept. The light mode text-tertiary is intended for decorative hints and large labels only. The builder should add a `@lore` note about this distinction.

### Will consumers break immediately?

Yes, but harmlessly. CSS custom properties that reference `var(--surface-0)` will fall through to the property's fallback or initial value. The app will look wrong but won't crash. TypeScript compilation (`bun run check`) will still pass because CSS variable names aren't typed. The breakage is visual, contained, and expected -- it's fixed in U4-U9.

### Does the HTML _tokens.css really need updating in U3?

Yes. The test file `tokens.test.ts` has a sync test that checks HTML tokens match src tokens. If only src/tokens.css is updated, the sync test fails. Both files must move together.

### Is the accent-primary dark mode value (#2eaa7a) too different from light (#16764f)?

#2eaa7a is a lighter, more saturated green. The hue angle is preserved (~155 deg). The perceptual shift is comparable to how Material Design lightens primary colors for dark themes. The alternative -- keeping #16764f in dark mode -- fails text contrast (3.23:1 on page). For button backgrounds where text-on-accent (#fff) sits on top, use `--accent-primary` (dark mode's #2eaa7a) which gives white-on-green at 3.32:1 -- AA for large text (buttons are typically >= 14px bold). For small text on accent backgrounds, use the dark mode's `--accent-primary-hover` (#20a070) as the bg, which gives 3.32:1 with white. This is the standard tradeoff in dark-mode design systems.

**Better approach for buttons in dark mode:** Buttons should use a separate token or the light-mode value (#16764f) as bg with white text (5.62:1 -- AA pass). The accent-primary token in dark mode serves as the TEXT color for inline accents (links, badges, status text). This dual-role is a standard pattern (see GitHub Primer, which has `fg.accent` and `bg.accent` using different values). U3 defines the tokens; U4/U7 wire them to the right contexts.
