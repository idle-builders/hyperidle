---
paths:
  - "packages/web/**/*.tsx"
  - "packages/web/**/*.ts"
  - "packages/design-system/src/**/*.tsx"
---

# Aesthetic Quality Rules

Required reading before any UI change: `packages/design-system/AESTHETICS.md` (canonical research + recommendations tables), `PRINCIPLES.md` (the seven universals), `DESIGN.md` (token reference). Values live there; this file lists hard rules only. Rule IDs map 1:1 to the K6 ESLint plugin (`design/no-*`).

## Hard rules

- **AQ-001** Off-grid spacing forbidden. Padding/gap/margin must be a 4px multiple from the closed allowlist; 2px is reserved for chip/icon internals only. → see AESTHETICS.md § Spacing & Density (lints: `design/no-off-grid-spacing`).
- **AQ-002** Density tokens for component internals. Use `var(--density-pad-*)`, `var(--density-gap)`, `var(--density-row-h)`, `var(--density-text)`. No hardcoded `p-[Npx]` / `gap-[Npx]`. → see AESTHETICS.md § Spacing & Density.
- **AQ-003** Density tier ladder is coherent. Compact = default × 0.75; comfortable = default × 1.25 (designer-call). Do not edit `tokens.css` density blocks ad-hoc. → see AESTHETICS.md § Spacing & Density.
- **AQ-004** Type scale is closed. No `text-[Npx]` outside the allowlist; no font-weight outside `{400,500,600}`. → see AESTHETICS.md § Typography (lints: `design/no-off-scale-font-size`).
- **AQ-005** Mobile inputs ≥ 16px font-size at viewport ≤ 768px (iOS Safari zoom mitigation). → see AESTHETICS.md § Typography + § Mobile & Touch (lints: `design/require-mobile-input-size`).
- **AQ-006** Tabular numerals on numeric KeyValue and table cells (`font-variant-numeric: tabular-nums`). → see AESTHETICS.md § Typography.
- **AQ-007** Uppercase labels (StatusChip / Tag) carry `+0.02em` tracking. → see AESTHETICS.md § Typography.
- **AQ-008** No hardcoded colors. No hex, no `rgb()`, no raw Tailwind palette (`text-indigo-500`, `bg-slate-800`, …). Use semantic tokens. → see AESTHETICS.md § Color & Dark Mode (lints: `design/no-hardcoded-color`, `design/no-raw-tailwind-color`).
- **AQ-009** Pure black (`#000` / `#000000`) is forbidden as a background; halation guard uses `--surface-*`. → see AESTHETICS.md § Color & Dark Mode.
- **AQ-010** Text contrast ≥ 4.5:1 against the surface it sits on. → see AESTHETICS.md § Color & Dark Mode (WCAG 2.1 AA).
- **AQ-011** Closed radius scale only: `--r0`/`--r1`/`--r2`/`--r3` + `--r-pill`. `rounded-2xl`/`rounded-3xl` are screenshot-detectable AI tells. → see AESTHETICS.md § Borders/Radii/Shadows + § AI-Aesthetic Anti-Patterns (lints: `design/no-off-scale-radius`, `design/no-ai-aesthetic`).
- **AQ-012** Heavy shadow (`shadow-lg`/`xl`/`2xl`) restricted to overlay surfaces (`Modal`/`Dialog`/`Popover`/`Tooltip`). Cards use the surface ladder, not shadow. → see AESTHETICS.md § Borders/Radii/Shadows.
- **AQ-013** Motion durations from `--motion-fast/medium/slow`. No bare `duration-[Nms]`. Easing curve = `cubic-bezier(0.2, 0, 0, 1)` (designer-call). → see AESTHETICS.md § Motion (lints: `design/no-off-scale-motion`).
- **AQ-014** Honor `prefers-reduced-motion`. Animate only `transform`, `opacity`, `filter`, `backdrop-filter`. No layout-property transitions. → see AESTHETICS.md § Motion.
- **AQ-015** Touch targets ≥ 44 CSS px on every interactive element at viewport ≤ 1024 px. → see AESTHETICS.md § Mobile & Touch (lints: `design/require-touch-target-min`).
- **AQ-016** Auto-density: at viewport ≤ 1024 px and Settings preference `auto`, AppShell sets `[data-density="comfortable"]`. Density preference is a tri-state (`auto`/`default`/`compact`/`comfortable`). → see AESTHETICS.md § Mobile & Touch.
- **AQ-017** Density-aware components must consume `var(--density-*)` tokens for the axes K10's audit prescribes; density-static components must not consume any density token. A component is in exactly one bucket (density-aware OR density-static); the opt-out manifest at `packages/eslint-plugin-design/density-allowlist.json` is the arbiter. → see `packages/design-system/research/density-audit.md` and AESTHETICS.md Appendix D (lints: `design/use-density-tokens`, `design/no-density-tokens`).

## AI-aesthetic blacklist (canonical 15-item catalog in AESTHETICS.md § AI-Aesthetic Anti-Patterns)

Lints under `design/no-ai-aesthetic`. Three or more screenshot-detectable tells in a single frame fails the screenshot rubric.

- **AQ-101** No `rounded-2xl`/`rounded-3xl` (allow `rounded-full` for pills).
- **AQ-102** No indigo/purple/violet/fuchsia/pink gradient backgrounds.
- **AQ-103** No oversized padding (`p-8`/`p-10`/`p-12`/`p-14`/`p-16`) outside hero/expressive contexts.
- **AQ-104** No hero sections in `packages/web/src/pages/work/**`.
- **AQ-105** No emoji as iconography in `Button`/`NavItem`/`StatusChip` text.
- **AQ-106** No page-level `text-center` / `mx-auto` on body content (allow inside `EmptyState`/`Modal`/`Dialog`/`Toast`).
- **AQ-107** No glass morphism (`backdrop-blur`, translucent card chrome) in productivity components.
- **AQ-108** No 3-column identical card grid (`grid-cols-3` + `.map(` over identical children) outside known dashboard contexts.
- **AQ-109** No Lorem ipsum or `Click here` placeholder copy in committed source.
- **AQ-110** No marketing superlatives (`Effortless`/`Seamless`/`Powerful`/`Beautiful`/`Stunning`/`Game-changing`) in product chrome.
- **AQ-111** No gradient-on-text (`bg-clip-text text-transparent` over a gradient) on product headings.
- **AQ-112** Nav rail background is `--surface-1`; no full-bleed accent colors on the rail.
- **AQ-113** Over-iconification: list-row primitives must accept `icon` as optional and not render a placeholder when omitted.

## Skills triggered

`/design-critique` (every UI change — includes cross-component checks formerly in `/design-lint`), `/visual-polish` (when a reference mockup exists). Token/scale violations are caught by `npm run lint` via `eslint-plugin-design` (K6).
