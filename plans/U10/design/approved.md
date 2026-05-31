# U10 Approved Design -- Hearth Aesthetic Rules

**Status:** Approved
**Date:** 2026-05-31
**Source of truth:** `packages/design-system/03-hearth.html` (the founding Hearth vision)

---

## 1. Hearth Design Principles (for PRINCIPLES.md)

The Seven Universals are not wrong -- they are universal. Hearth does not replace them. Instead, Hearth adds a **Hearth-Specific** section that sits ABOVE the universals as the product's aesthetic stance. The universals remain as the underlying theory; the Hearth principles are the opinionated application.

### The Four Hearth Principles

These come directly from 03-hearth.html and are non-negotiable:

**1. Warmth signals trust.**
Cream surfaces, warm shadows, and earthy tones create an inviting atmosphere. Software used all day should feel like a place you want to be, not a sterile tool. Every color is tinted warm -- no cool grays, no blue-gray neutrals, no slate.

**2. Status through content.**
Colored dots, pill badges, and text color carry meaning -- not thick structural borders. Cards stay structurally uniform. Status is communicated through what is inside the card, not welded to its edges. The exception: toasts use a thin left-border accent (1.5px) as the only structural status signal.

**3. Generous rounding.**
16px default radius and pill-shaped buttons create a soft, approachable feel. Containers hold content gently, not boxing it in. Even small elements get 10px radius. The radius scale is deliberately sparse: none (0), subtle (10px), default (16px), pill (9999px). There is no 4px or 8px step.

**4. Mixed hierarchy.**
Shadows AND borders AND tints work together. Different elements use different strategies depending on their role -- no single dogmatic approach. Cards get shadow-default. Flat cards use border + container background. Toast uses left-border accent. This variety is the signature, not inconsistency.

### Updates to the Seven Universals

Most universals stand unchanged. Specific Hearth overrides:

- **Universal 2 (Hierarchy Through Weight):** The "levers in priority order" list gets a Hearth amendment. Borders and shadows are NOT last resort in Hearth -- mixed hierarchy means they participate equally. Update the lever list to: "1. Font size and weight, 2. Text color/opacity, 3. Spacing and proximity, 4. Background contrast / shadow / border (used flexibly per element role)."
- **Universal 3 (Restraint):** The "one accent color for interaction" rule stands -- forest green is the accent. Amber is a SECONDARY accent, not a status color (it doubles as status-warning, but its role as accent-secondary for attention-drawing elements like budget badges is an accent role).

### Updates to Surprise Principles

- **S2 (Three Variables Generate an Entire Theme):** Still true. Hearth's three variables: warm cream base (#f5f0e6), forest green accent (#16764f), warm earth text (#2c241a). Everything derives from these.
- **S4 (Warm Neutrals for Long Sessions):** This IS Hearth. Upgrade from a "surprise" to a core principle. Hearth is the materialization of S4.

### Updates to the AI Aesthetic Blacklist

The AI Aesthetic Blacklist section in PRINCIPLES.md should remain a pointer to the canonical catalog in AESTHETICS.md. No change needed beyond updating the cross-reference.

### Updates to Color Beyond Contrast Ratios

- Remove the sentence "In dark mode, avoid pure black (#000) backgrounds -- they cause 'halation' where bright text appears to bleed. Lucid Dark uses #111113." Replace with: "In dark mode, avoid pure black (#000) backgrounds. Hearth Dark uses #1a1510 -- a warm earth base that avoids halation while maintaining the warm palette."
- Remove the sentence about monochrome status. Hearth uses chromatic status: green success, amber warning, red error, blue info.

---

## 2. Aesthetic Quality Rules (for aesthetic-quality.md)

### Rules that CHANGE

**AQ-001 -- Off-grid spacing.**
- OLD: "Padding/gap/margin must be a 4px multiple from the closed allowlist; 2px is reserved for chip/icon internals only."
- NEW: "Padding/gap/margin must use values from the 6px grid: {3, 6, 9, 12, 18, 24, 36, 48}. These correspond to `--space-1` through `--space-16`. Values outside this set are off-grid. 2px is NOT on the grid -- use 3px (--space-1) for the smallest increment."
- LINT: The spacing allowlist in `util.ts` changes from `{0, 4, 8, 12, 16, 20, 24, 32, 40, 48}` to `{0, 3, 6, 9, 12, 18, 24, 36, 48}`.
- NOTE: The 2px sub-grid allowance for chips is removed. Hearth's smallest increment is 3px.

**AQ-003 -- Density tier ladder.**
- OLD: "Compact = default x 0.75; comfortable = default x 1.25 (designer-call)."
- NEW: "Compact = default x 0.75; comfortable = default x 1.5 (designer-call). See AESTHETICS.md Spacing & Density for K9 re-tier rationale." (This was already partially updated by K9 but the rule text still said 1.25.)

**AQ-011 -- Closed radius scale.**
- OLD: "`--r0`/`--r1`/`--r2`/`--r3` + `--r-pill`. `rounded-2xl`/`rounded-3xl` are screenshot-detectable AI tells."
- NEW: "`--r-none` (0) / `--r-subtle` (10px) / `--r-default` (16px) / `--r-pill` (9999px). This is a 4-value scale with no 4px or 8px step. The old `--r0..r3` naming is replaced. `rounded-2xl` (16px) is now ON-scale because `--r-default` IS 16px. `rounded-3xl` (24px) remains off-scale."
- LINT: Radius allowlist in `util.ts` changes from `{0, 4, 8, 12, 999}` to `{0, 10, 16, 9999}`. Named Tailwind mapping must be updated: `rounded-none` (0) = allowed, `rounded` (4px) = OFF-scale, `rounded-sm` (2px) = OFF-scale, `rounded-md` (6px) = OFF-scale, `rounded-lg` (8px) = OFF-scale, `rounded-xl` (12px) = OFF-scale, `rounded-2xl` (16px) = ALLOWED (maps to --r-default), `rounded-3xl` (24px) = off-scale, `rounded-full` (9999px) = allowed. NOTE: This is a significant reversal -- `rounded-2xl` was previously an AI-aesthetic tell and is now the default Hearth card radius.

**AQ-012 -- Shadow restriction.**
- OLD: "Heavy shadow (`shadow-lg`/`xl`/`2xl`) restricted to overlay surfaces (`Modal`/`Dialog`/`Popover`/`Tooltip`). Cards use the surface ladder, not shadow."
- NEW: "Cards use `--shadow-default` (warm-tinted `0 4px 12px rgba(44,36,26,0.08)`). This is a Hearth signature -- shadows give cards tactile weight. `--shadow-elevated` (`0 8px 24px`) is reserved for floating surfaces (modals, popovers). `--shadow-subtle` (`0 1px 4px`) is for subtle elevation. Tailwind's `shadow-lg`/`shadow-xl`/`shadow-2xl` are still off-limits because they use cool-tinted shadows -- use Hearth shadow tokens instead."
- RATIONALE: Hearth's mixed-hierarchy principle means cards earn their shadow. The 03-hearth.html reference puts `box-shadow: var(--ds-shadow-default)` on every `.card`, `.philosophy-item`, `.bet-card`, `.component-cell`, `.toast`, `.type-specimen`, `.spacing-scale`, and `.material-strip`.

**AQ-013 -- Motion values.**
- OLD: "Motion durations from `--motion-fast/medium/slow`. No bare `duration-[Nms]`. Easing curve = `cubic-bezier(0.2, 0, 0, 1)` (designer-call)."
- NEW: "Motion durations from `--motion-fast` (120ms) / `--motion-default` (240ms) / `--motion-slow` (450ms). No bare `duration-[Nms]`. Easing curve = `cubic-bezier(0.25, 0.1, 0.25, 1)` (CSS `ease`) stored in `--motion-ease`. Hearth also defines an expressive easing `cubic-bezier(0.34, 1.56, 0.64, 1)` for spring-like micro-interactions (toggle thumb)."
- LINT: Motion allowlist changes from `{80, 150, 250}` to `{120, 240, 450}`. Easing regex changes.

### Rules that are DELETED

**AQ-112 -- Nav rail background.**
- OLD: "Nav rail background is `--surface-1`; no full-bleed accent colors on the rail."
- NEW: Deleted. The Hearth shell uses a Sidebar (`--surface-container`), not an IconRail + separate Submenu. The rule referenced a component that no longer exists. The underlying principle (no full-bleed accent colors on navigation chrome) is already covered by the AI-aesthetic blacklist item #14.

### Rules that are ADDED

**AQ-018 -- No cool grays.**
- "No cool-tinted gray values anywhere in the UI. All neutral surfaces, text, and borders must be warm-tinted. Specifically: no Tailwind `slate`, `gray`, `zinc`, `neutral` palette classes. No hex values with blue undertones in neutral positions. Surface tokens use warm cream/earth tones; text tokens use warm brown/cream tones; border tokens use warm tan tones. The warm tint is verifiable: in OKLCH space, the hue channel of all neutral tokens must fall in the 40-80 range (warm yellow-orange), never in the 220-280 range (cool blue)."
- LINT: This is partially covered by the existing `no-raw-tailwind-color` rule (which blocks all raw palette classes). Add a specific check: the `RAW_TAILWIND_PALETTE` in util.ts should specifically call out `slate`, `gray`, `zinc`, `neutral` as "cool gray" violations with a more specific error message.

**AQ-019 -- System fonts only.**
- "No external font dependencies. Use `--font-sans` (system-ui, -apple-system, Segoe UI, sans-serif) and `--font-mono` (ui-monospace, SF Mono, Cascadia Code, monospace). No imports of Geist, Inter, or other web fonts. No `@font-face` declarations. No Google Fonts links."
- LINT: New rule or extension of existing rule that flags `@import` or `<link>` to font CDNs, `@font-face` declarations, or explicit `font-family: "Geist"` / `font-family: "Inter"` references.

### Rules that STAY (with minor wording updates)

- **AQ-002** -- Density tokens: stays, but update example token names from `--density-pad-*` etc. (unchanged).
- **AQ-004** -- Type scale: stays. Update the allowlist to include the Hearth sizes. The 03-hearth.html type scale is: 12px (xs), 13px (sm), 15px (base), 17px (lg), 20px (xl), 24px (2xl), 30px (3xl). The allowlist becomes `{11, 12, 13, 14, 15, 16, 17, 18, 20, 24, 30}`. Note: 14px stays allowed (compact density body), 17px and 30px are added.
- **AQ-005** through **AQ-010** -- stay unchanged. Update wording from "Lucid" to "Hearth" where referenced.
- **AQ-014** through **AQ-017** -- stay unchanged.
- **AQ-101** -- No `rounded-2xl`/`rounded-3xl`: MUST BE UPDATED. `rounded-2xl` (16px) is now on-scale per Hearth. Change to: "No `rounded-3xl` (24px). `rounded-2xl` (16px) is permitted -- it maps to `--r-default`."
- **AQ-103** -- Oversized padding: update the threshold. Hearth's `--space-16` is 48px, which is the maximum grid value. `p-8` in Tailwind is 32px, which maps between `--space-12` (36px) and `--space-8` (24px). The rule should flag padding values that exceed `--space-16` (48px), not `p-8` (32px). However, we should flag any padding above `--space-8` (24px) for component internals -- 36px and 48px are for page-level section separation only.

---

## 3. Frontend Rules (for frontend.md)

Current state is already mostly Hearth-aware. Updates:

- Remove "8-12px padding default" -- Hearth's default component padding is `--space-6` (18px) for cards and `--space-4` (12px) for smaller elements. State it as: "Use Hearth spacing tokens (`--space-*`) for all padding. Card padding: `--space-6` (18px). Small element padding: `--space-4` (12px)."
- The aesthetic description is already updated to reference Hearth. Verify: "HyperIdle uses the Hearth design system -- warm earth tones, forest green accent, system-ui fonts." This is correct.
- Update component count reference if needed (verify current count).
- Ensure "Avoid the AI Aesthetic" section references Hearth, not Lucid.

---

## 4. Design System Rules (for design-system.md)

Updates:
- Theme variants line already says "Hearth Dark + Hearth Light" -- correct.
- Token source of truth already references `DESIGN.md` and `tokens.css` -- correct.
- Ensure no Lucid references remain.

---

## 5. DESIGN.md Rewrite

DESIGN.md is already substantially Hearth-native (it was updated in earlier U-track work). Verify and update:

### Spacing section
- Grid description must say "6px baseline grid" not "4px baseline grid." Currently says "4px baseline grid" at line 154. MUST CHANGE.
- Common spacing values table must use Hearth values: 3px (tight), 6px (default gap), 9px (small padding), 12px (default padding), 18px (card padding/section gap), 24px (major section), 36px (large section), 48px (page margin).

### Radii section
- Currently correct: `--r-none` (0), `--r-subtle` (10px), `--r-default` (16px), `--r-pill` (9999px).
- DaisyUI overrides: `--rounded-btn: 9999px`, `--rounded-box: 16px`, `--rounded-badge: 9999px`. Correct.

### Motion section
- Currently shows Hearth values: 120/240/450ms with CSS ease. Correct.

### Shadow section
- Currently shows warm-tinted shadows. Correct.

### Typography section
- Currently references allowlist `{11, 12, 13, 14, 15, 16, 18, 20, 24}`. Must add 17px (lg) and 30px (3xl) from the Hearth reference.
- Font families currently say `--font-sans` / `font-sans` | system-ui etc. Correct -- no Geist reference.

### Anti-Patterns section
- Must update: remove "`rounded-2xl` everywhere" since `rounded-2xl` (16px) IS the Hearth default. Replace with: "No `rounded-3xl` or arbitrary large radii beyond the 4-value scale."

---

## 6. THEMES.md Updates

Currently correct. The file already describes Hearth Light + Hearth Dark with correct token values. One fix:

- Shared Properties table says "Spacing grid | 4px baseline" -- MUST CHANGE to "Spacing grid | 6px baseline (values: 3, 6, 9, 12, 18, 24, 36, 48)".

---

## 7. AESTHETICS.md Updates

This is the largest and most delicate update. The K-track research infrastructure (citation discipline, recommendation table format, appendices) is valuable and stays. But every recommendation that Hearth contradicts must be updated with a "U10 Hearth override" note in the same format as the K9/K11/K13 changelogs.

### Section-by-section Hearth overrides:

#### Spacing & Density

**Grid base unit row:**
- OLD Recommended: "no change" (4px)
- NEW: "6px (Hearth designer-call). Hearth uses a 6px base grid with a 3px half-step. The allowlist becomes {3, 6, 9, 12, 18, 24, 36, 48}. The 4px grid is retired."
- Rationale: 03-hearth.html defines `--ds-space-*` on a 3px/6px grid. This is an explicit aesthetic choice -- the 6px grid produces wider spacing increments that match the generous-rounding philosophy.

**Sub-grid 2px allowance row:**
- OLD: "2px allowed only inside StatusChip and Tag"
- NEW: "Deleted. Hearth's smallest spacing is 3px (`--space-1`). There is no 2px value in the Hearth grid."

**Density tokens:** The density token values (pad-x, pad-y, gap, row-h) were updated by K9/K11. These need re-evaluation against the 6px grid -- values should snap to 6px multiples where possible. However, density tokens are implementation details that U10 does not change (the tokens themselves live in tokens.css, managed by U3). U10 only updates the documentation to reflect that the grid is 6px.

#### Typography

**Font families row:**
- OLD: "Geist + Geist Mono -- no change"
- NEW: "system-ui + ui-monospace (Hearth designer-call). Hearth eliminates external font dependencies. system-ui provides the native UI font on each platform (SF Pro on macOS, Segoe UI on Windows, Roboto on Android/ChromeOS). ui-monospace provides SF Mono / Cascadia Code / similar."

**Body size row:**
- OLD: "15px (designer-call)" (K9 override)
- NEW: "15px -- no change. Hearth's `--ds-font-size-base` is 0.9375rem = 15px. Confirmed."

**Type scale addenda:**
- Add 17px (Hearth `--text-lg` / `--ds-font-size-lg`) to the allowlist.
- Add 30px (Hearth `--text-3xl` / `--ds-font-size-3xl`) to the allowlist.
- The full Hearth type scale: 12, 13, 15, 17, 20, 24, 30. Plus 11px and 14px retained for compact density and data labels.

**Font-weight scale row:**
- OLD: "400 / 500 / 600 codified"
- NEW: "400 / 500 / 600 / 700. Hearth adds 700 (bold) for page titles and brand heading (03-hearth.html uses `--ds-font-weight-bold: 700` for the 30px page title). The tokens.css already defines `--fw-bold: 700`."

#### Color & Dark Mode

**Dark base surface row:**
- OLD: "#111113 -- no change"
- NEW: "#1a1510 (Hearth designer-call). Warm earth base, not cool neutral. All surface tokens are warm-tinted."

**Surface temperature row:**
- OLD: "hold cool-neutral (designer-call)"
- NEW: "warm (Hearth designer-call). All neutrals are warm-tinted. No cool grays anywhere."

**Status colors (warn/ok monochrome) row:**
- OLD: "gray -- no change" (monochrome status)
- NEW: "chromatic (Hearth designer-call). Hearth uses semantic chromatic status: green (#16764f light / #2eaa7a dark) for success, amber (#d97706) for warning, red (#dc4a3a light / #ee6a5a dark) for error, blue (#2e7dba light / #4498d4 dark) for info."

#### Borders/Radii/Shadows

**Radius scale row:**
- OLD: "0/4/8/12 + pill -- no change"
- NEW: "0/10/16/pill (Hearth designer-call). Four-value scale: none (0), subtle (10px), default (16px), pill (9999px). The 4/8/12 productivity sub-band is retired. Hearth's generous-rounding principle uses larger default radii."

**`rounded-2xl` and above row:**
- OLD: "K6 sub-rule blocks in component code"
- NEW: "`rounded-2xl` (16px) is ON-SCALE -- it maps to `--r-default`. `rounded-3xl` (24px) remains off-scale. The K6 sub-rule is updated to block only `rounded-3xl`."

**Dark-mode shadow tier row:**
- OLD: "`--float` only -- no change"
- NEW: "Three shadow tiers: `--shadow-subtle` (1px blur, 0.06 opacity), `--shadow-default` (4-12px blur, 0.08 opacity), `--shadow-elevated` (8-24px blur, 0.1 opacity). Cards use `--shadow-default`. Overlays use `--shadow-elevated`. The old `--float` token is renamed to `--shadow-elevated`."

**`shadow-lg`/`-xl` cards row:**
- OLD: "K6 sub-rule restricts to overlay surfaces"
- NEW: "Tailwind's `shadow-lg`/`shadow-xl`/`shadow-2xl` remain restricted because they use cool-tinted default shadows. Use Hearth shadow tokens (`--shadow-subtle`/`--shadow-default`/`--shadow-elevated`) instead."

**Border width:**
- ADD NEW ROW: "Border widths: `--bw-thin` (1px), `--bw-default` (1.5px), `--bw-strong` (2.5px). Hearth uses thicker, more visible borders than the Lucid era. The 1.5px default border is a signature -- it reads clearly in both light and dark modes."

#### Motion

**`--motion-fast` row:**
- OLD: "80ms -- no change"
- NEW: "120ms (Hearth designer-call). Hearth uses slower, gentler micro-interactions matching the warm aesthetic."

**`--motion-medium` row (renamed `--motion-default`):**
- OLD: "150ms -- no change"
- NEW: "240ms (Hearth designer-call). Renamed from `--motion-medium` to `--motion-default`."

**`--motion-slow` row:**
- OLD: "250ms -- no change"
- NEW: "450ms (Hearth designer-call). Hearth uses slower overlay transitions."

**Easing curve row:**
- OLD: "`cubic-bezier(0.2, 0, 0, 1)` (designer-call)"
- NEW: "`cubic-bezier(0.25, 0.1, 0.25, 1)` = CSS `ease` (Hearth designer-call). Softer, more organic feel than the Material standard curve. Additionally, Hearth defines an expressive easing `cubic-bezier(0.34, 1.56, 0.64, 1)` for spring-like micro-interactions (used on toggle thumb transitions)."

#### AI-Aesthetic Anti-Patterns

**Item #1 (`rounded-2xl` everywhere):**
- OLD: "Avoid: 16px+ corner radius on cards/buttons/badges."
- NEW: "RETIRED for Hearth. 16px IS the Hearth default card radius (`--r-default`). The concern remains valid for radii ABOVE 16px: `rounded-3xl` (24px) and arbitrary large values are still AI-aesthetic tells. Pill shapes (9999px) are intentional for buttons and badges."

**Item #10 (`shadow-lg`/`shadow-xl` on cards):**
- OLD: "Avoid: heavy drop shadow on every card."
- NEW: "Updated for Hearth. Cards DO receive shadow (`--shadow-default`). The distinction: use Hearth warm-tinted shadow tokens, not Tailwind's cool default `shadow-lg`/`shadow-xl`. The concern shifts from 'no shadow on cards' to 'no COOL shadow on cards'."

---

## 8. ESLint Plugin Updates

### `packages/eslint-plugin-design/src/util.ts`

**SPACING_ALLOWLIST:**
```typescript
// OLD: {0, 4, 8, 12, 16, 20, 24, 32, 40, 48}
// NEW: Hearth 6px grid
export const SPACING_ALLOWLIST: ReadonlySet<number> = new Set([
  0, 3, 6, 9, 12, 18, 24, 36, 48,
]);
```

**SUB_GRID_VALUE:**
- DELETE this constant. Hearth has no 2px sub-grid.

**RADIUS_ALLOWLIST:**
```typescript
// OLD: {0, 4, 8, 12, 999}
// NEW: Hearth radius scale
export const RADIUS_ALLOWLIST: ReadonlySet<number> = new Set([0, 10, 16, 9999]);
```

**FONT_SIZE_ALLOWLIST:**
```typescript
// OLD: {11, 12, 13, 14, 15, 16, 18, 20, 24}
// NEW: Hearth type scale (add 17, 30; keep 11, 14 for density)
export const FONT_SIZE_ALLOWLIST: ReadonlySet<number> = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 20, 24, 30,
]);
```

**ALLOWED_NAMED_RADIUS:**
Must be updated to reflect Hearth scale. The mapping of named Tailwind radii to px:
- `rounded-none` (0px) -- ALLOWED
- `rounded-sm` (2px) -- OFF-SCALE
- `rounded` (4px) -- OFF-SCALE
- `rounded-md` (6px) -- OFF-SCALE
- `rounded-lg` (8px) -- OFF-SCALE
- `rounded-xl` (12px) -- OFF-SCALE
- `rounded-2xl` (16px) -- ALLOWED (maps to --r-default)
- `rounded-3xl` (24px) -- OFF-SCALE
- `rounded-full` (9999px) -- ALLOWED (maps to --r-pill)

**Comment updates:**
- Change all references from "Lucid semantic token set" to "Hearth semantic token set."
- Update the header comment source references.

### `packages/eslint-plugin-design/src/rules/no-off-grid-spacing.ts`

- Update docs description from "4px grid" to "6px grid."
- Update error messages to reference `{3, 6, 9, 12, 18, 24, 36, 48}` instead of `{4, 8, 12, 16, 20, 24, 32, 40, 48}`.
- Remove the 2px sub-grid handling (the `subGrid` messageId and the `SUB_GRID_VALUE` check).

### `packages/eslint-plugin-design/src/rules/no-off-scale-radius.ts`

- Update docs description and header comment from `--r0:0 --r1:4px --r2:8px --r3:12px` to `--r-none:0 --r-subtle:10px --r-default:16px --r-pill:9999px`.
- Update error messages to reference `{0, 10, 16, 9999}`.
- Update the named-radius allowed set: `rounded-none` and `rounded-2xl` and `rounded-full` are now allowed; everything else is off-scale.

### `packages/eslint-plugin-design/src/rules/no-off-scale-font-size.ts`

- Update the allowlist reference to include 17px and 30px.

### Tests

All test files in `packages/eslint-plugin-design/src/rules/__tests__/` must be updated:
- Spacing tests: change valid/invalid cases for 6px grid.
- Radius tests: change valid/invalid cases for Hearth scale.
- Font size tests: add 17px and 30px as valid.

---

## 9. docs/ Files Referencing Lucid/Rail/Pitch/Product

Files that need updates (from grep results):

1. `docs/human-interface-layer/decisions.md` -- "Tailwind CSS + DaisyUI + custom Lucid theme" -> "Tailwind CSS + DaisyUI + Hearth theme"
2. `docs/ui-design/build-order.md` -- "Install Tailwind + DaisyUI, author Lucid themes, load fonts" -> update for Hearth
3. `docs/ui-design/index.md` -- "Dark / Light / System (Lucid theme)" -> "Light / Dark / System (Hearth theme)"
4. `docs/ui-design/foundation.md` -- "configured with two custom themes `lucid-dark` and `lucid-light`" -> "`hearth-light` and `hearth-dark`"
5. `docs/architecture/the-human-interface-the-factory.md` -- "custom Lucid theme" -> "Hearth theme"
6. `docs/human-interface-layer/three-views-the-rail.md` -- references "the Rail" extensively. Note: this file may be largely superseded by the Hearth sidebar model, but updating its content is out of U10 scope if it involves architectural changes. Flag for review.
7. `packages/design-system/PRINCIPLES.md` line 179 -- "Lucid Dark uses #111113" -> "Hearth Dark uses #1a1510"

---

## 10. Material Palette -- The Hearth Signature

The material palette from 03-hearth.html is the emotional core of Hearth. It should be documented in DESIGN.md as a first-class section:

| Material | Name | Hex | Role |
|----------|------|-----|------|
| Paper | Surface Page | #f5f0e6 | App chrome, body background |
| Linen | Surface Container | #ede7db | Sidebar, nav backgrounds |
| Card | Surface Elevated | #ffffff | Cards, panels, elevated content |
| Forest | Accent Primary | #16764f | Links, selection, active indicators |
| Amber | Accent Secondary | #d97706 | Attention, budget, secondary accent |
| Earth | Text Primary | #2c241a | Titles, values, primary text |

These names (Paper, Linen, Card, Forest, Amber, Earth) should appear in DESIGN.md and PRINCIPLES.md as the vocabulary for discussing the Hearth palette. They are not token names -- they are design vocabulary.

---

## 11. Rejected Directions

These decisions were made and should not be re-litigated:

1. **Keep the 4px grid alongside the 6px grid:** Rejected. One grid system. The 6px grid is the Hearth vision.
2. **Keep Geist fonts as an option:** Rejected. System fonts only. No external dependencies.
3. **Keep monochrome status:** Rejected. Hearth uses chromatic status. The monochrome philosophy was a Lucid-specific stance.
4. **Keep the old radius scale 0/4/8/12:** Rejected. Hearth's generous-rounding uses 0/10/16/pill.
5. **Keep 80/150/250ms motion timings:** Rejected. Hearth's gentler timings (120/240/450ms) match the warm aesthetic.
6. **Keep the Material easing curve:** Rejected. CSS ease matches Hearth better.
7. **Dual Lucid+Hearth rules:** Rejected. Lucid is dead. Clean break.
8. **Create new AESTHETICS-HEARTH.md:** Rejected. One authoritative file with Hearth overrides in the same format as K9/K11/K13 changelogs.

---

## Open Questions for Architecture

1. **Density token values vs 6px grid:** The existing density tokens use values from the 4px grid (e.g., `--density-pad-y: 0.75rem = 12px`, `--density-gap: 0.75rem = 12px`). 12px IS on the 6px grid (12 = 2 x 6). But some density values may be off the 6px grid (e.g., 8px compact values). The architect must decide: (a) snap all density values to the 6px grid, or (b) accept that density tokens are exempt from the spacing grid rule because they existed before the 6px grid. Recommendation: (b) -- density tokens are their own system.
2. **Test file updates scope:** How many test files need updating? The architect should enumerate them.
3. **docs/ files with Rail/Pitch references:** Some docs reference architectural concepts (Rail, IconRail, Submenu, Pitch) that are superseded by the Hearth/U-track redesign. Updating these is technically in scope per the AC ("docs/ files referencing products, pitches, rail, or Lucid updated") but the changes go beyond just "find/replace Lucid->Hearth" -- they require understanding the new navigation model. The architect should scope which docs get a full rewrite vs a targeted Lucid->Hearth find/replace.
