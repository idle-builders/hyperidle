---
paths:
  - "layers/core-ui/**/*.tsx"
  - "layers/core-ui/**/*.ts"
---

# Aesthetic Quality

The values these rules police live in `layers/core-ui/src/ds/tokens.css`; the components they police
live in `layers/core-ui/src/ds/`. There is no `AESTHETICS.md`, `PRINCIPLES.md` or `DESIGN.md` — that
package was dissolved by AU44 and those files went with it. This file is the hard rules; the token
file is the values; nothing else is required reading.

Rule IDs map 1:1 onto the `design/*` ESLint rules in `tools/eslint-plugin-design/`.

## What actually blocks you today

Read this before trusting a rule to catch anything.

- Severity is decided per scope in `tools/eslint-plugin-design/src/hearth-config.ts`
  (`RULE_SEVERITY`): `ds/**` is where the system is BUILT, everything else in `layers/core-ui/src` is
  code that USES it, and a rule can be `error` in one and `warn` or `off` in the other.
- `npm run lint` runs ESLint with `--quiet`, which **drops every warn-level rule**. Anything wired at
  `warn` produces no output there and cannot fail the build.
- `npm run lint:design` runs the design rule set standalone with warnings included. It currently
  reports 0 errors and 182 warnings — that is the population no gate is stopping. Run it before
  claiming a surface is clean.
- A rule that is `off` in both scopes has a dedicated narrower block in `eslint.config.ts`; the
  totality test in the plugin fails if a rule is wired nowhere at all.

## Hard rules

- **AQ-001** Authored composition gaps/margins use the numeric Hearth vocabulary `{0, 3, 6, 9, 12, 18, 24, 36, 48}` px, whether written as a supported Tailwind alias, arbitrary pixel class, or `--space-*` token. Values outside it are errors. Semantics are guidance ranges, not lint endpoints: close relations `3–9px` (normally `6–9px`), related groups `12–18px`, major vertical sections `24–36px`, and `48px` only exceptionally; horizontal guidance is `3–9 / 9–12 / 18–24 / 36–48px` as relation breadth increases. Density, typography, borders, surface changes, wrapping, and viewport choose the endpoint. Padding/control internals, fixed geometry, optical offsets, canvas coordinates, negative overlap, resets, and subject-authored content are separate narrow cases; never disable the rule for a whole surface. (lint: `design/no-off-grid-spacing`).
- ~~**AQ-002**~~ Removed in W2. Density tokens stripped. Use literal Hearth grid values instead.
- ~~**AQ-003**~~ Removed in W2. One size per component — there is no density system. AESTHETICS.md AQ-003 rewritten.
- **AQ-004** Every authored typography declaration consumes one complete semantic profile: `label`, `metadata`, `small`, `copy`, `control`, `input`, `avatar-initial`, `subheading`, `lead`, `title`, `display`, `metric`, `data`, or `inline-code`. Raw family/size/weight/line-height/tracking definitions are legal only in the central registry. Inherited text with no authored field is valid. (lint: `design/typography-profile-only`).
- **AQ-005** The `input` profile resolves to 16px on input/textarea/select controls at viewport ≤768px to prevent iOS zoom. No raw responsive size escape.
- **AQ-006** `metric` includes tabular numerals. Use it for KPI values; use `data` for compact structured values.
- **AQ-007** Uppercase structural captions use the complete `label` profile. Ordinary details, timestamps, and avatar initials use their own roles.
- **AQ-008** No hardcoded colors. No hex, no `rgb()`, no raw Tailwind palette (`text-indigo-500`, `bg-slate-800`, …). Use semantic tokens. (lints: `design/no-hardcoded-color`, `design/no-raw-tailwind-color`).
- **AQ-009** Pure black (`#000` / `#000000`) is forbidden as a background; halation guard uses `--surface-*`.
- **AQ-010** Text contrast ≥ 4.5:1 against the surface it sits on.
- **AQ-011** Closed Hearth radius scale only: `--r-none` (0) / `--r-subtle` (10px) / `--r-default` (16px) / `--r-pill` (9999px). **One spelling per value** (AZ7): the only permitted non-zero spelling is a `--r-*` token — `rounded-full`, named Tailwind radii (`rounded-lg`, `rounded-2xl`, …), and arbitrary pixel radii (`rounded-[Npx]`) are all lint errors, even when the pixel value lands on the scale. Zero radius may be `rounded-none`. **EXEMPTION:** Form control chrome (checkboxes, radio buttons, toggles) may use off-scale radii — DaisyUI manages these via `.checkbox`, `.radio`, `.toggle` classes, and the hand-built `Checkbox`/`Toggle` primitives are exempted by filename in the rule itself. (lints: `design/radius-token-only`, `design/no-ai-aesthetic`).
- **AQ-012** Shipping Hearth chrome uses only `none`, `--shadow-subtle`, `--shadow-default`, and `--shadow-elevated`. Subtle is active/lightly lifted chrome, default is tactile cards/panels, and elevated is floating overlays or deliberate hover escalation. Raw Tailwind and arbitrary elevation shadows are errors. Focus/validation/selection rings are state, not elevation, and subject-authored preview content is not Hearth chrome; both exceptions remain narrow. (lint: `design/shadow-token-only`).
- **AQ-013** Authored motion uses exactly one purpose profile: `feedback` (opacity/filter, 120ms), `move` (transform, 240ms), `spring` (transform, 240ms expressive), `enter` (120ms once), `activity` (1.4s pulse), `loading` (1.8s skeleton), or `busy` (750ms rotation). Color/background/border/shadow/width/max-width snap. (lint: `design/motion-profile-only`).
- **AQ-014** Under `prefers-reduced-motion: reduce`, animation and transition are `none !important` and scroll behavior is `auto !important` globally, including foreign previews. WAAPI and smooth-scroll calls are forbidden.
- **AQ-015** Touch targets ≥ 44 CSS px on every interactive element at viewport ≤ 1024 px. (lints: `design/require-touch-target-min`).
- ~~**AQ-016**~~ Removed in W2. Auto-density removed. Hearth uses one size per component at all viewports.
- ~~**AQ-017**~~ Removed in W2. Density-aware/static partitioning removed with the density system.
- **AQ-018** No cool grays. All neutral surfaces, text, and borders must be warm-tinted. Specifically: no Tailwind `slate`, `gray`, `zinc`, `neutral` palette classes. No hex values with blue undertones in neutral positions. Surface tokens use warm cream/earth tones; text tokens use warm brown/cream tones; border tokens use warm tan tones. The warm tint is verifiable: in OKLCH space, the hue channel of all neutral tokens falls in the 40-80 range (warm yellow-orange). (lints: `design/no-raw-tailwind-color` with enhanced message for cool-gray classes).
- **AQ-019** System fonts only. Use `--font-sans` (system-ui, -apple-system, Segoe UI, sans-serif) and `--font-mono` (ui-monospace, SF Mono, Cascadia Code, monospace). No imports of Geist, Inter, or other web fonts. No `@font-face` declarations. No Google Fonts links.
- **AQ-020** Authored border widths use only `--bw-thin` (1px), `--bw-default` (1.5px), or `--bw-strong` (2px). Preserve normal outlines and separators; Toast's default-width left rail is the only structural status border. (lint: `design/border-width-profile-only`).

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

## How these get checked

`/design` on every UI change, `/visual-polish` when a reference story exists. Token and scale
violations are caught by `eslint-plugin-design` — subject to the severity reality above. How a visual
change is proven at all: `.pipeline/rules/visual-regression.md`.
