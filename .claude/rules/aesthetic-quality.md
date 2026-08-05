---
paths:
  - "layers/core-ui/**/*.tsx"
  - "layers/core-ui/**/*.ts"
  - "framework/design-system/src/**/*.tsx"
---

# Aesthetic Quality Rules

Required reading before any UI change: `framework/design-system/AESTHETICS.md` (canonical research + recommendations tables), `PRINCIPLES.md` (the Hearth principles + seven universals), `DESIGN.md` (token reference). Values live there; this file lists hard rules only. Rule IDs map 1:1 to the U10/K6 ESLint plugin (`design/no-*`).

## Hard rules

- **AQ-001** Off-grid spacing forbidden. Padding/gap/margin must use values from the Hearth 6px grid: `{3, 6, 9, 12, 18, 24, 36, 48}` px — these correspond to `--space-1` through `--space-16`. Values outside this set are off-grid. 2px is NOT on the grid — use 3px (`--space-1`) for the smallest increment. **EXEMPTION:** Vertical padding inside buttons (10px, 7px) and inputs (10px) is optically tuned to line-height and font metrics, not to the layout grid. Sub-element gaps inside badges (4px) and toggle label stacks (2px) are similarly exempt. Use a `// hearth-internal-padding` file-level directive in component definition files. → see AESTHETICS.md § Spacing & Density U10 changelog (lints: `design/no-off-grid-spacing`).
- ~~**AQ-002**~~ Removed in W2. Density tokens stripped. Use literal Hearth grid values instead.
- ~~**AQ-003**~~ Removed in W2. One size per component — there is no density system. AESTHETICS.md AQ-003 rewritten.
- **AQ-004** Type scale is closed. No `text-[Npx]` outside the Hearth allowlist `{9,10,11,12,13,14,15,16,17,18,20,24,30}`; no font-weight outside `{400,500,600,700}`. Note: 9px is for numeric count badges only (type scale floor); 10px is for micro-typography (badge-agent labels, avatar initials); 700 is for page titles and brand headings. → see AESTHETICS.md § Typography U10 changelog (lints: `design/no-off-scale-font-size`).
- **AQ-005** Mobile inputs ≥ 16px font-size at viewport ≤ 768px (iOS Safari zoom mitigation). → see AESTHETICS.md § Typography + § Mobile & Touch (lints: `design/require-mobile-input-size`).
- **AQ-006** Tabular numerals on numeric KeyValue and table cells (`font-variant-numeric: tabular-nums`). → see AESTHETICS.md § Typography.
- **AQ-007** Uppercase labels (StatusChip / Tag) carry `var(--tracking-caps)` (0.08em) tracking. Smaller uppercase labels (subtitles, sidebar categories) use `var(--tracking-caps-sm)` (0.06em). → see AESTHETICS.md § Typography U10 changelog.
- **AQ-008** No hardcoded colors. No hex, no `rgb()`, no raw Tailwind palette (`text-indigo-500`, `bg-slate-800`, …). Use semantic tokens. → see AESTHETICS.md § Color & Dark Mode (lints: `design/no-hardcoded-color`, `design/no-raw-tailwind-color`).
- **AQ-009** Pure black (`#000` / `#000000`) is forbidden as a background; halation guard uses `--surface-*`. → see AESTHETICS.md § Color & Dark Mode.
- **AQ-010** Text contrast ≥ 4.5:1 against the surface it sits on. → see AESTHETICS.md § Color & Dark Mode (WCAG 2.1 AA).
- **AQ-011** Closed Hearth radius scale only: `--r-none` (0) / `--r-subtle` (10px) / `--r-default` (16px) / `--r-pill` (9999px). The old `--r0/--r1/--r2/--r3` naming is replaced. `rounded-2xl` (16px) is on-scale — it maps to `--r-default`. `rounded-3xl` (24px) is off-scale. **EXEMPTION:** Form control chrome (checkboxes, radio buttons, toggles) may use off-scale radii — DaisyUI manages these via `.checkbox`, `.radio`, `.toggle` classes. → see AESTHETICS.md § Borders/Radii/Shadows U10 changelog (lints: `design/no-off-scale-radius`, `design/no-ai-aesthetic`).
- **AQ-012** Cards use `--shadow-default` (warm-tinted `0 4px 12px rgba(44,36,26,0.08)`). This is a Hearth signature — shadows give cards tactile weight. `--shadow-elevated` is reserved for floating surfaces (modals, popovers). Tailwind's `shadow-lg`/`shadow-xl`/`shadow-2xl` are off-limits because they use cool-tinted shadows — use Hearth shadow tokens instead. → see AESTHETICS.md § Borders/Radii/Shadows U10 changelog.
- **AQ-013** Motion durations from `--motion-fast` (120ms) / `--motion-default` (240ms) / `--motion-slow` (450ms). No bare `duration-[Nms]`. Easing curve = `cubic-bezier(0.25, 0.1, 0.25, 1)` (CSS `ease`) stored in `--motion-ease`. Hearth also defines an expressive easing `cubic-bezier(0.34, 1.56, 0.64, 1)` for spring-like micro-interactions (toggle thumb). → see AESTHETICS.md § Motion U10 changelog (lints: `design/no-off-scale-motion`).
- **AQ-014** Honor `prefers-reduced-motion`. Animate only `transform`, `opacity`, `filter`, `backdrop-filter`. No layout-property transitions. → see AESTHETICS.md § Motion.
- **AQ-015** Touch targets ≥ 44 CSS px on every interactive element at viewport ≤ 1024 px. → see AESTHETICS.md § Mobile & Touch (lints: `design/require-touch-target-min`).
- ~~**AQ-016**~~ Removed in W2. Auto-density removed. Hearth uses one size per component at all viewports.
- ~~**AQ-017**~~ Removed in W2. Density-aware/static partitioning removed with the density system.
- **AQ-018** No cool grays. All neutral surfaces, text, and borders must be warm-tinted. Specifically: no Tailwind `slate`, `gray`, `zinc`, `neutral` palette classes. No hex values with blue undertones in neutral positions. Surface tokens use warm cream/earth tones; text tokens use warm brown/cream tones; border tokens use warm tan tones. The warm tint is verifiable: in OKLCH space, the hue channel of all neutral tokens falls in the 40-80 range (warm yellow-orange). → see AESTHETICS.md § Color & Dark Mode U10 changelog (lints: `design/no-raw-tailwind-color` with enhanced message for cool-gray classes).
- **AQ-019** System fonts only. Use `--font-sans` (system-ui, -apple-system, Segoe UI, sans-serif) and `--font-mono` (ui-monospace, SF Mono, Cascadia Code, monospace). No imports of Geist, Inter, or other web fonts. No `@font-face` declarations. No Google Fonts links. → see AESTHETICS.md § Typography U10 changelog.

## AI-aesthetic blacklist (canonical 15-item catalog in AESTHETICS.md § AI-Aesthetic Anti-Patterns)

Lints under `design/no-ai-aesthetic`. Three or more screenshot-detectable tells in a single frame fails the screenshot rubric.

- **AQ-101** No `rounded-3xl` (24px). `rounded-2xl` (16px) IS permitted — it maps to `--r-default` (the Hearth default card radius). `rounded-full` is always allowed for pills.
- **AQ-102** No indigo/purple/violet/fuchsia/pink gradient backgrounds.
- **AQ-103** No oversized padding (`p-8`/`p-10`/`p-12`/`p-14`/`p-16`) outside hero/expressive contexts. Hearth's maximum layout grid value is `--space-16` (48px); padding above 24px is for page-level section separation only.
- **AQ-104** No hero sections in `layers/core-ui/src/pages/work/**`.
- **AQ-105** No emoji as iconography in `Button`/`NavItem`/`StatusChip` text.
- **AQ-106** No page-level `text-center` / `mx-auto` on body content (allow inside `EmptyState`/`Modal`/`Dialog`/`Toast`).
- **AQ-107** No glass morphism (`backdrop-blur`, translucent card chrome) in productivity components.
- **AQ-108** No 3-column identical card grid (`grid-cols-3` + `.map(` over identical children) outside known dashboard contexts.
- **AQ-109** No Lorem ipsum or `Click here` placeholder copy in committed source.
- **AQ-110** No marketing superlatives (`Effortless`/`Seamless`/`Powerful`/`Beautiful`/`Stunning`/`Game-changing`) in product chrome.
- **AQ-111** No gradient-on-text (`bg-clip-text text-transparent` over a gradient) on product headings.
- **AQ-113** Over-iconification: list-row primitives must accept `icon` as optional and not render a placeholder when omitted.

## Skills triggered

`/design-critique` (every UI change — includes cross-component checks formerly in `/design-lint`), `/visual-polish` (when a reference mockup exists). Token/scale violations are caught by `npm run lint` via `eslint-plugin-design` (K6/U10).
