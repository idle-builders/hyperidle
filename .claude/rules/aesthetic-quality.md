---
paths:
  - "layers/core-ui/**/*.tsx"
  - "layers/core-ui/**/*.ts"
  - "framework/design-system/src/**/*.tsx"
---

# Aesthetic Quality Rules

Required reading before any UI change: `framework/design-system/AESTHETICS.md` (canonical research + recommendations tables), `PRINCIPLES.md` (the Hearth principles + seven universals), `DESIGN.md` (token reference). Values live there; this file lists hard rules only. Rule IDs map 1:1 to the U10/K6 ESLint plugin (`design/no-*`).

## Hard rules

- **AQ-001** Authored composition gaps/margins use the numeric Hearth vocabulary `{0, 3, 6, 9, 12, 18, 24, 36, 48}` px, whether written as a supported Tailwind alias, arbitrary pixel class, or `--space-*` token. Values outside it are errors. Semantics are guidance ranges, not lint endpoints: close relations `3–9px` (normally `6–9px`), related groups `12–18px`, major vertical sections `24–36px`, and `48px` only exceptionally; horizontal guidance is `3–9 / 9–12 / 18–24 / 36–48px` as relation breadth increases. Density, typography, borders, surface changes, wrapping, and viewport choose the endpoint. Padding/control internals, fixed geometry, optical offsets, canvas coordinates, negative overlap, resets, and subject-authored content are separate narrow cases; never disable the rule for a whole surface. → see AESTHETICS.md § Spacing relationships (lint: `design/no-off-grid-spacing`).
- ~~**AQ-002**~~ Removed in W2. Density tokens stripped. Use literal Hearth grid values instead.
- ~~**AQ-003**~~ Removed in W2. One size per component — there is no density system. AESTHETICS.md AQ-003 rewritten.
- **AQ-004** Type scale is closed. No `text-[Npx]` outside the Hearth allowlist `{9,10,11,12,13,14,15,16,17,18,20,24,30}`; no font-weight outside `{400,500,600,700}`. Note: 9px is for numeric count badges only (type scale floor); 10px is for micro-typography (badge-agent labels, avatar initials); 700 is for page titles and brand headings. → see AESTHETICS.md § Typography U10 changelog (lints: `design/no-off-scale-font-size`).
- **AQ-005** Mobile inputs ≥ 16px font-size at viewport ≤ 768px (iOS Safari zoom mitigation). → see AESTHETICS.md § Typography + § Mobile & Touch (lints: `design/require-mobile-input-size`).
- **AQ-006** Tabular numerals on numeric KeyValue and table cells (`font-variant-numeric: tabular-nums`). → see AESTHETICS.md § Typography.
- **AQ-007** Uppercase labels (StatusChip / Tag) carry `var(--tracking-caps)` (0.08em) tracking. Smaller uppercase labels (subtitles, sidebar categories) use `var(--tracking-caps-sm)` (0.06em). → see AESTHETICS.md § Typography U10 changelog.
- **AQ-008** No hardcoded colors. No hex, no `rgb()`, no raw Tailwind palette (`text-indigo-500`, `bg-slate-800`, …). Use semantic tokens. → see AESTHETICS.md § Color & Dark Mode (lints: `design/no-hardcoded-color`, `design/no-raw-tailwind-color`).
- **AQ-009** Pure black (`#000` / `#000000`) is forbidden as a background; halation guard uses `--surface-*`. → see AESTHETICS.md § Color & Dark Mode.
- **AQ-010** Text contrast ≥ 4.5:1 against the surface it sits on. → see AESTHETICS.md § Color & Dark Mode (WCAG 2.1 AA).
- **AQ-011** Closed Hearth radius scale only: `--r-none` (0) / `--r-subtle` (10px) / `--r-default` (16px) / `--r-pill` (9999px). **One spelling per value** (AZ7): the only permitted non-zero spelling is a `--r-*` token — `rounded-full`, named Tailwind radii (`rounded-lg`, `rounded-2xl`, …), and arbitrary pixel radii (`rounded-[Npx]`) are all lint errors, even when the pixel value lands on the scale. Zero radius may be `rounded-none`. **EXEMPTION:** Form control chrome (checkboxes, radio buttons, toggles) may use off-scale radii — DaisyUI manages these via `.checkbox`, `.radio`, `.toggle` classes, and the hand-built `Checkbox`/`Toggle` primitives are exempted by filename in the rule itself. → see AESTHETICS.md § Borders/Radii/Shadows U10 changelog (lints: `design/radius-token-only`, `design/no-ai-aesthetic`).
- **AQ-012** Shipping Hearth chrome uses only `none`, `--shadow-subtle`, `--shadow-default`, and `--shadow-elevated`. Subtle is active/lightly lifted chrome, default is tactile cards/panels, and elevated is floating overlays or deliberate hover escalation. Raw Tailwind and arbitrary elevation shadows are errors. Focus/validation/selection rings are state, not elevation, and subject-authored preview content is not Hearth chrome; both exceptions remain narrow. → see DESIGN.md § Shadows (lint: `design/shadow-token-only`).
- **AQ-013** Motion durations from `--motion-fast` (120ms) / `--motion-default` (240ms) / `--motion-slow` (450ms). No bare `duration-[Nms]`. Easing curve = `cubic-bezier(0.25, 0.1, 0.25, 1)` (CSS `ease`) stored in `--motion-ease`. Hearth also defines an expressive easing `cubic-bezier(0.34, 1.56, 0.64, 1)` for spring-like micro-interactions (toggle thumb). → see AESTHETICS.md § Motion U10 changelog (lints: `design/no-off-scale-motion`).
- **AQ-014** Honor `prefers-reduced-motion`. Animate only `transform`, `opacity`, `filter`, `backdrop-filter`. No layout-property transitions. → see AESTHETICS.md § Motion.
- **AQ-015** Touch targets ≥ 44 CSS px on every interactive element at viewport ≤ 1024 px. → see AESTHETICS.md § Mobile & Touch (lints: `design/require-touch-target-min`).
- ~~**AQ-016**~~ Removed in W2. Auto-density removed. Hearth uses one size per component at all viewports.
- ~~**AQ-017**~~ Removed in W2. Density-aware/static partitioning removed with the density system.
- **AQ-018** No cool grays. All neutral surfaces, text, and borders must be warm-tinted. Specifically: no Tailwind `slate`, `gray`, `zinc`, `neutral` palette classes. No hex values with blue undertones in neutral positions. Surface tokens use warm cream/earth tones; text tokens use warm brown/cream tones; border tokens use warm tan tones. The warm tint is verifiable: in OKLCH space, the hue channel of all neutral tokens falls in the 40-80 range (warm yellow-orange). → see AESTHETICS.md § Color & Dark Mode U10 changelog (lints: `design/no-raw-tailwind-color` with enhanced message for cool-gray classes).
- **AQ-019** System fonts only. Use `--font-sans` (system-ui, -apple-system, Segoe UI, sans-serif) and `--font-mono` (ui-monospace, SF Mono, Cascadia Code, monospace). No imports of Geist, Inter, or other web fonts. No `@font-face` declarations. No Google Fonts links. → see AESTHETICS.md § Typography U10 changelog.

## AI-aesthetic blacklist (canonical 15-item catalog in AESTHETICS.md § AI-Aesthetic Anti-Patterns)

Lints under `design/no-ai-aesthetic`. Three or more screenshot-detectable tells in a single frame fails the screenshot rubric.

- **AQ-101** No `rounded-3xl` (24px). Neither `rounded-2xl` nor `rounded-full` is permitted as a spelling (AZ7 — AQ-011's "one spelling per value"): a 16px radius is `rounded-[var(--r-default)]`, a pill is `rounded-[var(--r-pill)]`.
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
