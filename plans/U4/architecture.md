# U4 Architecture: DaisyUI Theme + Tailwind Config Update

## Required Reading

- `packages/design-system/src/tokens.css` -- Hearth token definitions (U3, landed)
- `packages/web/tailwind.config.ts` -- current Tailwind/DaisyUI config
- `packages/web/src/hooks/useTheme.ts` -- theme persistence hook
- `packages/web/index.html` -- boot script with FOIT prevention
- `packages/design-system/THEMES.md` -- theme documentation (to be updated)
- `packages/design-system/DESIGN.md` -- design system reference (to be updated)
- `packages/design-system/html/themes/_switcher.js` -- HTML viewer theme switcher

---

## Plan Reconciliation: Spec vs Reality

| Spec Assumption | Reality | Resolution |
|---|---|---|
| U3 Hearth tokens exist in `tokens.css` | Confirmed: `tokens.css` has `hearth-light`/`hearth-dark` selectors, all Hearth token names | No gap |
| `tailwind.config.ts` has `lucid-dark`/`lucid-light` themes | Confirmed: lines 36-99 | Replace in-place |
| `extend.colors` has `surface-0..6`, `text-hi/mid/lo` | Confirmed: lines 13-23 | Replace with Hearth names |
| `extend.borderColor` has `border-subtle/default/emphasis` | Confirmed: lines 26-28. Hearth uses `border-subtle/default/strong` (NOT emphasis) | Rename `emphasis` to `strong` |
| `useTheme.ts` references `lucid-dark`/`lucid-light` | Confirmed: line 53-54 of `applyTheme()` | String replace |
| `index.html` boot script references `lucid-dark`/`lucid-light` | Confirmed: line 34. Also defaults to `"dark"` (line 19) | Change to `hearth-*`, default to `"light"` (Hearth is light-first) |
| Geist font import exists in `index.css` | Confirmed: line 1, Google Fonts URL | Remove entirely |
| `index.html` has `<link rel="preconnect">` for Google Fonts | Confirmed: lines 8-9 | Remove (no external fonts in Hearth) |
| Design-system viewer has its own `tailwind.config.ts` | Confirmed: identical Lucid config | Must mirror all changes |
| Design-system viewer `main.tsx` has `Theme` type as `lucid-dark`/`lucid-light` | Confirmed: line 51-71 | Update type + all references |
| Design-system viewer `index.html` defaults to `lucid-dark` | Confirmed: line 2 | Change to `hearth-light` |
| HTML theme files exist as `lucid-dark.css`/`lucid-light.css` | Confirmed in `html/themes/` | Rewrite as `hearth-dark.css`/`hearth-light.css`, delete old files |
| `_switcher.js` references `lucid-dark`/`lucid-light` throughout | Confirmed: 7 references | Full rewrite of theme IDs |
| `DESIGN.md` documents Lucid tokens extensively | Confirmed: surface-0..6, text-hi/mid/lo, Geist fonts, etc. | Update all token tables and theme references |
| `THEMES.md` documents Lucid system | Confirmed: entire file is Lucid-specific | Rewrite for Hearth |
| Test files assert Lucid values | Confirmed in `foundation.test.ts`, `useTheme.test.ts`, `theme-persistence.spec.ts`, `responsive-density.spec.ts`, `themes.test.ts`, `docs.test.ts`, `serve.test.ts` | Update all assertions |
| ~30 component files use old Tailwind utilities (`bg-surface-0`, `text-text-hi`) | Confirmed via grep | NOT fixed in U4 -- spec says "fixed in component workpackages" (U7-U9) |
| `.claude/rules/` files reference Lucid | Confirmed: `design-system.md` and `frontend.md` | Update rules files |

---

## Acceptance Criteria with Verification Methods

### AC-1: DaisyUI themes renamed from Lucid to Hearth

**Change:** In `packages/web/tailwind.config.ts`, replace the `lucid-dark` and `lucid-light` DaisyUI theme objects with `hearth-dark` and `hearth-light`.

**Verification:** Unit test in `foundation.test.ts` imports `tailwind.config.ts`, finds `hearth-dark` and `hearth-light` theme entries in `daisyui.themes`, asserts `lucid-dark` and `lucid-light` do NOT exist.

### AC-2: DaisyUI theme variables mapped to Hearth values

**Change:** Map DaisyUI's named color slots to Hearth token values:

hearth-light theme:
```
primary: "#16764f"        (forest green -- accent-primary)
primary-content: "#ffffff"
secondary: "#d97706"      (accent-secondary)
secondary-content: "#ffffff"
accent: "#6b5d4d"         (text-secondary as neutral accent)
accent-content: "#ffffff"
neutral: "#ede7db"         (surface-container)
neutral-content: "#2c241a" (text-primary)
base-100: "#f5f0e6"        (surface-page)
base-200: "#ede7db"        (surface-container)
base-300: "#e8e0d0"        (border-subtle -- visual step down)
base-content: "#2c241a"    (text-primary)
info: "#2e7dba"            (status-info)
info-content: "#ffffff"
success: "#16764f"         (status-success)
success-content: "#ffffff"
warning: "#d97706"         (status-warning)
warning-content: "#ffffff"
error: "#dc4a3a"           (status-error)
error-content: "#ffffff"
--rounded-box: "16px"      (r-default)
--rounded-btn: "9999px"    (pill)
--rounded-badge: "9999px"  (pill)
```

hearth-dark theme:
```
primary: "#2eaa7a"         (accent-primary dark)
primary-content: "#ffffff"
secondary: "#d97706"       (accent-secondary)
secondary-content: "#ffffff"
accent: "#a89880"          (text-secondary dark)
accent-content: "#1a1510"
neutral: "#231e16"         (surface-container dark)
neutral-content: "#ede5d8" (text-primary dark)
base-100: "#1a1510"        (surface-page dark)
base-200: "#231e16"        (surface-container dark)
base-300: "#3d342a"        (border-subtle dark)
base-content: "#ede5d8"    (text-primary dark)
info: "#4498d4"            (status-info dark)
info-content: "#ffffff"
success: "#2eaa7a"         (status-success dark)
success-content: "#ffffff"
warning: "#d97706"         (status-warning)
warning-content: "#ffffff"
error: "#ee6a5a"           (status-error dark)
error-content: "#ffffff"
--rounded-box: "16px"
--rounded-btn: "9999px"
--rounded-badge: "9999px"
```

**Verification:** Unit test in `foundation.test.ts` asserts:
- `hearth-light.primary === "#16764f"`
- `hearth-light["base-100"] === "#f5f0e6"`
- `hearth-light["--rounded-box"] === "16px"`
- `hearth-light["--rounded-btn"] === "9999px"`
- `hearth-light["--rounded-badge"] === "9999px"`
- `hearth-light.error === "#dc4a3a"`
- `hearth-light.success === "#16764f"`
- `hearth-light.warning === "#d97706"`
- `hearth-light.info === "#2e7dba"`
- `hearth-dark.primary === "#2eaa7a"`
- `hearth-dark["base-100"] === "#1a1510"`
- `hearth-dark.error === "#ee6a5a"`
- E2E validation: `btn btn-primary` element has `background-color` resolving to forest green and `border-radius: 9999px`.

### AC-3: Tailwind extend.colors updated to Hearth names

**Change:** Replace:
```ts
// OLD
"surface-0": "var(--surface-0)",
...
"surface-6": "var(--surface-6)",
"surface-ghost": "var(--surface-ghost)",
"text-hi": "var(--text-hi)",
"text-mid": "var(--text-mid)",
"text-lo": "var(--text-lo)",

// NEW
"surface-page": "var(--surface-page)",
"surface-container": "var(--surface-container)",
"surface-elevated": "var(--surface-elevated)",
"surface-overlay": "var(--surface-overlay)",
"text-primary": "var(--text-primary)",
"text-secondary": "var(--text-secondary)",
"text-tertiary": "var(--text-tertiary)",
```

**Verification:** Unit test asserts the `extend.colors` keys are exactly `surface-page`, `surface-container`, `surface-elevated`, `surface-overlay`, `text-primary`, `text-secondary`, `text-tertiary`. Asserts old keys (`surface-0`, `text-hi`) do NOT exist.

### AC-4: Tailwind extend.borderColor updated to Hearth tokens

**Change:** Replace:
```ts
// OLD
"border-subtle": "var(--border-subtle)",
"border-default": "var(--border-default)",
"border-emphasis": "var(--border-emphasis)",

// NEW
"border-subtle": "var(--border-subtle)",
"border-default": "var(--border-default)",
"border-strong": "var(--border-strong)",
```

**Verification:** Unit test asserts `border-strong` exists in `extend.borderColor`, `border-emphasis` does NOT exist.

### AC-5: Font family updated from Geist to system-ui

**Change:** Replace:
```ts
// OLD
sans: ["Geist", "Inter", "system-ui", "sans-serif"],
heading: ["Geist Mono", "ui-monospace", "monospace"],

// NEW
sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
mono: ["ui-monospace", "SF Mono", "Cascadia Code", "monospace"],
```

Note: The `heading` family is renamed to `mono` to match Hearth's `--font-mono` token. The values match `tokens.css` `--font-sans` and `--font-mono`.

**Verification:** Unit test asserts `fontFamily.sans[0] === "system-ui"`, asserts no entry contains "Geist". Asserts `fontFamily.mono` exists (replaces `heading`).

### AC-6: index.css updated -- Geist import removed

**Change:** Remove line 1 (`@import url("https://fonts.googleapis.com/css2?family=Geist...")`). The `@import "@hyperidle/design-system/tokens.css"` stays unchanged.

Also remove the Google Fonts `<link rel="preconnect">` tags from `packages/web/index.html` (lines 8-9).

**Verification:** Unit test reads `index.css` content, asserts it does NOT contain `fonts.googleapis.com` and does NOT contain `Geist`. Asserts it still contains `@import "@hyperidle/design-system/tokens.css"`. File inspection of `index.html` confirms no preconnect links for Google Fonts.

### AC-7: Theme persistence hook updated

**Change:** In `useTheme.ts`, `applyTheme()` function (line 52-55): change `"lucid-dark"` to `"hearth-dark"` and `"lucid-light"` to `"hearth-light"`.

In `index.html` boot script (line 34): same change. Also change default from `"dark"` to `"light"` (line 19) because Hearth is light-first.

**Verification:** Unit test in `useTheme.test.ts`:
- When theme is "dark", `document.documentElement.dataset.theme` is `"hearth-dark"` (not `"lucid-dark"`).
- When theme is "light", `document.documentElement.dataset.theme` is `"hearth-light"`.
- When theme is "system" and OS prefers dark, `dataset.theme` is `"hearth-dark"`.
- E2E test: Settings appearance panel switch persists `hearth-light`/`hearth-dark`.

### AC-8: npm run check passes

**Verification:** Run `npm run check` and assert zero errors. Note: Tailwind CSS utility classes are strings in JSX -- renaming config keys does NOT cause TypeScript errors. The old utility classes like `bg-surface-0` become no-ops (Tailwind ignores unknown classes), which is the expected state for U4. Component cleanup happens in U7-U9.

---

## Ordered Task List

### Task 1: Update Tailwind config (web)
**File:** `packages/web/tailwind.config.ts`
**Changes:**
1. Replace `fontFamily.sans` array: `["system-ui", "-apple-system", "Segoe UI", "sans-serif"]`
2. Rename `fontFamily.heading` to `fontFamily.mono`: `["ui-monospace", "SF Mono", "Cascadia Code", "monospace"]`
3. Replace `extend.colors`: remove `surface-0..6`, `surface-ghost`, `text-hi`, `text-mid`, `text-lo`; add `surface-page`, `surface-container`, `surface-elevated`, `surface-overlay`, `text-primary`, `text-secondary`, `text-tertiary`
4. Replace `extend.borderColor`: rename `border-emphasis` to `border-strong` (pointing to `var(--border-strong)`)
5. Replace `daisyui.themes`: remove `lucid-dark` and `lucid-light` objects; add `hearth-light` and `hearth-dark` objects with values from AC-2 above
**Depends on:** Nothing
**Test proves it:** `foundation.test.ts` (updated in Task 7)

### Task 2: Update Tailwind config (design-system viewer)
**File:** `packages/design-system/viewer/tailwind.config.ts`
**Changes:** Mirror all Task 1 changes exactly. Both configs must stay in sync.
**Depends on:** Nothing (parallel with Task 1)
**Test proves it:** Manual inspection (viewer config is not unit-tested independently -- it inherits from the same token system)

### Task 3: Update index.css and index.html (web)
**Files:** `packages/web/src/index.css`, `packages/web/index.html`
**Changes in index.css:**
1. Remove line 1 (Geist Google Fonts import)
**Changes in index.html:**
1. Remove `<link rel="preconnect" href="https://fonts.googleapis.com" />` (line 8)
2. Remove `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />` (line 9)
3. In boot script: change default from `"dark"` to `"light"` (line 19: `let resolved = "light"`)
4. In boot script: change `"lucid-dark"` to `"hearth-dark"` and `"lucid-light"` to `"hearth-light"` (line 34)
5. Update boot script comment from "K3" to "K3/U4" and mention Hearth
**Depends on:** Nothing (parallel with Tasks 1-2)
**Test proves it:** `foundation.test.ts` (Task 7), `theme-persistence.spec.ts` (Task 8)

### Task 4: Update useTheme hook
**File:** `packages/web/src/hooks/useTheme.ts`
**Changes:**
1. In `applyTheme()`: change `"lucid-dark"` to `"hearth-dark"` and `"lucid-light"` to `"hearth-light"`
2. Update JSDoc comment to reference Hearth instead of Lucid
**Depends on:** Nothing (parallel with Tasks 1-3)
**Test proves it:** `useTheme.test.ts` (Task 7)

### Task 5: Update design-system viewer theme handling
**Files:** `packages/design-system/viewer/main.tsx`, `packages/design-system/viewer/index.html`
**Changes in main.tsx:**
1. Change `type Theme = "lucid-dark" | "lucid-light"` to `type Theme = "hearth-dark" | "hearth-light"`
2. Update `useTheme()`: change all `"lucid-dark"`/`"lucid-light"` string literals to `"hearth-dark"`/`"hearth-light"`. Change default from `"lucid-dark"` to `"hearth-light"` (Hearth is light-first).
3. Update toolbar button active comparisons (lines 379, 386)
**Changes in index.html:**
1. Change `data-theme="lucid-dark"` to `data-theme="hearth-light"` (line 2)
**Depends on:** Nothing (parallel with Tasks 1-4)
**Test proves it:** Manual verification via design system viewer

### Task 6: Update HTML theme files and switcher
**Files:**
- `packages/design-system/html/themes/lucid-dark.css` -- DELETE
- `packages/design-system/html/themes/lucid-light.css` -- DELETE
- `packages/design-system/html/themes/hearth-dark.css` -- CREATE
- `packages/design-system/html/themes/hearth-light.css` -- CREATE
- `packages/design-system/html/themes/_switcher.js` -- UPDATE

**hearth-light.css contents:** CSS file with `[data-theme="hearth-light"]` selector containing all Hearth light-mode token values (surfaces, text, accents, status, borders, shadows). Token names match `tokens.css`. Must include `color-scheme: light`.

**hearth-dark.css contents:** CSS file with `[data-theme="hearth-dark"]` selector containing all Hearth dark-mode token values. Must include `color-scheme: dark`.

Both files must define all tokens that `themes.test.ts` checks: `--surface-page`, `--surface-container`, `--surface-elevated`, `--surface-overlay`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-placeholder`, `--text-on-accent`, `--accent-primary`, `--accent-primary-dim`, `--accent-primary-hover`, `--accent-secondary`, `--status-success`, `--status-warning`, `--status-error`, `--status-info`, `--border-subtle`, `--border-default`, `--border-strong`, `--shadow-subtle`, `--shadow-default`, `--shadow-elevated`, `--r-none`, `--r-subtle`, `--r-default`, `--r-pill`, `--motion-fast`, `--motion-default`, `--motion-slow`, `--font-sans`, `--font-mono`.

**_switcher.js changes:**
1. Replace `THEMES` array: `[{id: "hearth-light", label: "Light", file: "themes/hearth-light.css"}, {id: "hearth-dark", label: "Dark", file: "themes/hearth-dark.css"}]`
2. Change default theme from `"lucid-dark"` to `"hearth-light"` in all fallback locations
3. Update inline styles for active/inactive buttons to use Hearth tokens instead of Lucid (`var(--accent-primary)` instead of `var(--primary)`, `var(--text-secondary)` instead of `var(--text-mid)`, `var(--surface-elevated)` instead of `var(--surface-3)`)
4. Update comment header to say "Hearth" not "Lucid"

**Depends on:** Nothing (parallel with Tasks 1-5)
**Test proves it:** `themes.test.ts` (Task 7), `serve.test.ts` (Task 7)

### Task 7: Update unit tests
**Files:**
- `packages/web/src/__tests__/foundation.test.ts`
- `packages/web/src/hooks/__tests__/useTheme.test.ts`
- `packages/design-system/src/__tests__/themes.test.ts`
- `packages/design-system/src/__tests__/docs.test.ts`
- `packages/design-system/src/__tests__/serve.test.ts`

**foundation.test.ts changes:**
- Section a: Replace `lucid-dark` theme tests with `hearth-dark` tests. Assert new DaisyUI values (primary=#2eaa7a, base-100=#1a1510, --rounded-box=16px, --rounded-btn=9999px, --rounded-badge=9999px, error=#ee6a5a).
- Replace `lucid-light` theme tests with `hearth-light` tests. Assert new DaisyUI values (primary=#16764f, base-100=#f5f0e6, error=#dc4a3a, etc.).
- Section e (font families): Change "Geist" assertions to "system-ui". Change "Geist Mono"/"heading" assertions to "ui-monospace"/"mono".
- Section b (index.css): Add assertion that index.css does NOT contain `fonts.googleapis.com`.

**useTheme.test.ts changes:**
- All `"lucid-dark"` string assertions become `"hearth-dark"`
- All `"lucid-light"` string assertions become `"hearth-light"`
- Affected lines: 102, 124, 130, 131, 149, 164, 165

**themes.test.ts changes:**
- Change `THEME_FILES` from `["lucid-dark.css", "lucid-light.css"]` to `["hearth-dark.css", "hearth-light.css"]`
- Change `REQUIRED_TOKENS` list from Lucid token names (`--surface-0..6`, `--text-hi/mid/lo`, `--primary`, `--warn`, `--ok`, `--danger`, `--float`, `--r0..r3`, `--motion-medium`, `--ui`, `--mono`) to Hearth token names (`--surface-page/container/elevated/overlay`, `--text-primary/secondary/tertiary`, `--accent-primary`, `--accent-secondary`, `--status-success/warning/error/info`, `--shadow-subtle/default/elevated`, `--r-none/subtle/default/pill`, `--motion-fast/default/slow`, `--font-sans`, `--font-mono`, `--border-subtle/default/strong`)

**docs.test.ts changes:**
- Line 14-17: Change "Lucid" assertions to "Hearth", `lucid-dark`/`lucid-light` to `hearth-dark`/`hearth-light`
- Lines 25-26: Change `--surface-0`/`--surface-6` to `--surface-page`/`--surface-overlay`
- Lines 30-34: Change accent token assertions from `--primary`/`--warn`/`--ok`/`--danger` to `--accent-primary`/`--accent-secondary`/`--status-success`/`--status-error`
- Lines 37-39: Change border assertions from `--border-emphasis` to `--border-strong`
- Lines 42-43: Change "Geist" assertions to "system-ui"
- Lines 112-113: Change `lucid-dark.css`/`lucid-light.css` to `hearth-dark.css`/`hearth-light.css`

**serve.test.ts changes:**
- Line 61: Change `["lucid-dark", "lucid-light"]` to `["hearth-dark", "hearth-light"]`

**Depends on:** Tasks 1-6 (must change source before tests match)
**Test proves it:** `npm run test` (all green)

### Task 8: Update E2E tests
**Files:**
- `packages/web/e2e/theme-persistence.spec.ts`
- `packages/web/e2e/responsive-density.spec.ts`

**theme-persistence.spec.ts changes:**
- Line 49: `"lucid-dark"` -> `"hearth-dark"`
- Line 65: `"lucid-light"` -> `"hearth-light"`
- Line 94: `"lucid-dark"` -> `"hearth-dark"`
- Line 104: `"lucid-dark"` -> `"hearth-dark"`
- Line 128: `"lucid-light"` -> `"hearth-light"`
- Line 135: `"lucid-dark"` -> `"hearth-dark"`

**responsive-density.spec.ts changes:**
- Line 446: `"lucid-dark"` -> `"hearth-dark"`
- Line 451: `"lucid-dark"` -> `"hearth-dark"`
- Line 456: `"lucid-dark"` -> `"hearth-dark"`
- Line 462: `"lucid-dark"` -> `"hearth-dark"`

**Depends on:** Tasks 3-4 (boot script and hook must be updated first)
**Test proves it:** `npx playwright test`

### Task 9: Update documentation
**Files:**
- `packages/design-system/DESIGN.md`
- `packages/design-system/THEMES.md`
- `.claude/rules/design-system.md`
- `.claude/rules/frontend.md`

**DESIGN.md changes:**
- Theme Switching section: Replace "Lucid" with "Hearth", `lucid-dark`/`lucid-light` with `hearth-dark`/`hearth-light`, base surfaces from `#111113`/`#fafaf9` to `#1a1510`/`#f5f0e6`
- Color section: Replace surface-0..6 tables with surface-page/container/elevated/overlay tables using Hearth values
- Replace accent tokens: `--primary` -> `--accent-primary`, `--warn` -> `--status-warning`, `--ok` -> `--status-success`, `--danger` -> `--status-error`
- Replace text tokens: `--text-hi/mid/lo` -> `--text-primary/secondary/tertiary`
- Replace border tokens: `--border-emphasis` -> `--border-strong`, change from alpha-based to solid warm tones
- Typography: Replace "Geist" with "system-ui" font stack
- Radii section: Update DaisyUI overrides to `--rounded-btn: 9999px`, `--rounded-box: 16px`, `--rounded-badge: 9999px`
- Motion section: `--motion-medium` -> `--motion-default` (240ms), `--motion-fast` -> 120ms, `--motion-slow` -> 450ms

**THEMES.md changes:**
- Full rewrite: "Lucid Theme System" -> "Hearth Theme System"
- Replace all Lucid-specific content (philosophy, token tables, file references) with Hearth equivalents
- Reference `hearth-dark.css`/`hearth-light.css` instead of `lucid-dark.css`/`lucid-light.css`
- Update code examples to use `data-theme="hearth-light"`/`hearth-dark`

**.claude/rules/design-system.md changes:**
- Line about theme variants: change "Lucid Dark + Lucid Light" to "Hearth Dark + Hearth Light", `lucid-dark.css`/`lucid-light.css` to `hearth-dark.css`/`hearth-light.css`

**.claude/rules/frontend.md changes:**
- Change "Lucid theme tokens" to "Hearth theme tokens"
- Change "Lucid design system" to "Hearth design system" in the AI Aesthetic avoidance note

**Depends on:** Nothing (parallel with all tasks -- docs don't block code)
**Test proves it:** `docs.test.ts` assertions (updated in Task 7)

### Task 10: Verify
**Command:** `npm run check && npm run lint && npm run test`
**Depends on:** Tasks 1-9
**Test proves it:** Zero errors across all three commands

---

## Type Signatures / Schemas

No new types or schemas are introduced. The only type change is in the design-system viewer:

```ts
// packages/design-system/viewer/main.tsx
// BEFORE
type Theme = "lucid-dark" | "lucid-light";
// AFTER
type Theme = "hearth-dark" | "hearth-light";
```

The `useTheme` hook in `packages/web/src/hooks/useTheme.ts` keeps its existing types unchanged:
```ts
type Theme = "light" | "dark" | "system";  // unchanged
type ResolvedTheme = "light" | "dark";      // unchanged
```

The hook's public API does not expose DaisyUI theme names -- it maps internally.

---

## DaisyUI Theme Value Derivation

All DaisyUI color values are derived from Hearth tokens in `tokens.css`. The mapping logic:

| DaisyUI slot | Hearth light source | Hearth dark source |
|---|---|---|
| `primary` | `--accent-primary` (#16764f) | `--accent-primary` (#2eaa7a) |
| `primary-content` | #ffffff (text-on-accent) | #ffffff |
| `secondary` | `--accent-secondary` (#d97706) | `--accent-secondary` (#d97706) |
| `secondary-content` | #ffffff | #ffffff |
| `accent` | `--text-secondary` (#6b5d4d) | `--text-secondary` (#a89880) |
| `accent-content` | #ffffff | `--surface-page` (#1a1510) |
| `neutral` | `--surface-container` (#ede7db) | `--surface-container` (#231e16) |
| `neutral-content` | `--text-primary` (#2c241a) | `--text-primary` (#ede5d8) |
| `base-100` | `--surface-page` (#f5f0e6) | `--surface-page` (#1a1510) |
| `base-200` | `--surface-container` (#ede7db) | `--surface-container` (#231e16) |
| `base-300` | `--border-subtle` (#e8e0d0) | `--border-subtle` (#3d342a) |
| `base-content` | `--text-primary` (#2c241a) | `--text-primary` (#ede5d8) |
| `info` | `--status-info` (#2e7dba) | `--status-info` (#4498d4) |
| `success` | `--status-success` (#16764f) | `--status-success` (#2eaa7a) |
| `warning` | `--status-warning` (#d97706) | `--status-warning` (#d97706) |
| `error` | `--status-error` (#dc4a3a) | `--status-error` (#ee6a5a) |
| `--rounded-box` | 16px (--r-default) | 16px |
| `--rounded-btn` | 9999px (--r-pill) | 9999px |
| `--rounded-badge` | 9999px (--r-pill) | 9999px |

---

## Migration: Symbol Rename Manifest

### Tailwind utility class renames (config-level, NOT component-level)

| Old Tailwind utility | New Tailwind utility | Migration |
|---|---|---|
| `bg-surface-0` through `bg-surface-6` | `bg-surface-page`, `bg-surface-container`, `bg-surface-elevated`, `bg-surface-overlay` | Config rename. Component files NOT updated in U4. |
| `bg-surface-ghost` | (removed -- no equivalent) | Config rename. |
| `text-text-hi` | `text-text-primary` | Config rename. |
| `text-text-mid` | `text-text-secondary` | Config rename. |
| `text-text-lo` | `text-text-tertiary` | Config rename. |
| `border-border-emphasis` | `border-border-strong` | Config rename. |
| `font-heading` | `font-mono` | Config rename. |

### Theme name renames (applied in all files)

| Old value | New value | Files affected |
|---|---|---|
| `"lucid-dark"` | `"hearth-dark"` | useTheme.ts, index.html, viewer/main.tsx, viewer/index.html, _switcher.js, all test files |
| `"lucid-light"` | `"hearth-light"` | useTheme.ts, index.html, viewer/main.tsx, _switcher.js, all test files |

### File renames

| Old path | New path | Action |
|---|---|---|
| `html/themes/lucid-dark.css` | `html/themes/hearth-dark.css` | Delete old, create new with Hearth values |
| `html/themes/lucid-light.css` | `html/themes/hearth-light.css` | Delete old, create new with Hearth values |

---

## Risks and Ambiguities

### R1: Component visual breakage (ACCEPTED)
~30+ component files use old Tailwind utility classes that will become no-ops after U4. This means components will lose some of their styling (backgrounds, text colors, borders). This is explicitly accepted by the spec: "type errors from renamed utilities are expected to surface -- those are fixed in component workpackages." The app will be visually broken until U7-U9 complete.

**Mitigation:** U4 is a dependency for U5-U9. The visual breakage window is bounded by the track's execution order.

### R2: DaisyUI base-300 as border-subtle
Using `--border-subtle` (#e8e0d0 light / #3d342a dark) for `base-300` is a judgment call. DaisyUI uses `base-300` for borders on some components (inputs, dividers). Mapping it to the border-subtle token means DaisyUI's auto-derived borders will match our border system. The alternative (using surface-elevated=#ffffff) would make `base-300` lighter than `base-200`, which breaks DaisyUI's expected lightness gradient.

**Decision:** Use border-subtle. It preserves the lightness ladder and aligns DaisyUI borders with Hearth borders.

### R3: Boot script default change (light-first)
Changing the boot script default from `"dark"` to `"light"` means first-time visitors on browsers with blocked localStorage see the light theme. This is correct for Hearth (light-first design). Existing users with persisted preferences are unaffected -- their stored value of `"dark"` or `"light"` or `"system"` still works identically; only the `data-theme` attribute value changes from `lucid-*` to `hearth-*`.

**Edge case:** Users who previously stored `"dark"` will see `hearth-dark` on reload. Users who stored `"system"` will get the OS-appropriate mode. No migration needed for localStorage values because useTheme stores `"light"/"dark"/"system"`, not theme names.

### R4: Design-system viewer localStorage key collision
The viewer uses `"ds-theme"` localStorage key (separate from the app's `"hyperidle-theme"`). Old stored values like `"lucid-dark"` will fail the `saved === "hearth-light"` check and fall through to the default. This is the correct behavior -- users get the new default theme.

---

## Security and Abuse Cases

| Check | Applicability | Notes |
|---|---|---|
| Rate-limit on POST/PATCH | N/A | No API endpoints changed |
| Input-trust boundary | N/A | No user input processed |
| Secret-handling | N/A | No credentials surface |
| Path-traversal | N/A | No path inputs |
| SSRF | N/A | No outbound URLs (Geist font import is being REMOVED) |
| XSS via theme injection | N/A | `data-theme` attribute is set from a closed set of string literals, not user input |

U4 is a pure configuration change with no attack surface.

---

## Protected Tests

Tests that MUST NOT have their assertions weakened (they may be updated to reflect new values, but the verification rigor must not decrease):

```
protectedTests:
  - packages/design-system/src/__tests__/tokens.test.ts  # U3 token assertions -- do NOT modify
  - packages/web/e2e/theme-persistence.spec.ts           # theme name values change, test structure stays
  - packages/web/src/hooks/__tests__/useTheme.test.ts    # theme name values change, test structure stays
```

`tokens.test.ts` is fully protected -- U4 does NOT modify this file. It already asserts Hearth token names and values from U3.

---

## Design-it-Twice: DaisyUI `secondary` Mapping

**Decision point:** What Hearth value maps to DaisyUI's `secondary` slot?

**Option A: Map to `--accent-secondary` (#d97706 amber/orange)**
DaisyUI secondary is used for `btn-secondary`, `badge-secondary`. Mapping to accent-secondary gives these a warm amber tone that contrasts with the forest green primary. Trade-off: amber buttons are distinctive but unusual. Reason to choose: Hearth has exactly two accent colors and secondary maps naturally.

**Option B: Map to `--text-secondary` (#6b5d4d warm brown)**
DaisyUI secondary becomes a muted warm brown. Trade-off: subtle and professional, but `btn-secondary` becomes almost invisible against warm surfaces. Reason to reject: secondary buttons need to be visually distinct from the background.

**Decision:** Option A. DaisyUI's `secondary` maps to `--accent-secondary` (#d97706). The amber tone is intentional in Hearth's design language (it's the accent-secondary color) and provides clear visual distinction for secondary actions. `accent` (the DaisyUI slot, not our token) maps to `--text-secondary` for the rare cases where a third color tier is needed.
