# Research: AI-Aesthetic Anti-Patterns

## Question set

- Catalog of LLM-generated UI tells from 2024-2026.
- DOM/class signatures for each tell.
- How shadcn/ui prompts and the v0 system prompt counter them.
- Predictive rubric design.

## Sources surveyed

- shadcn/ui — Themes / docs: https://ui.shadcn.com/themes
- shadcn/ui — Tailwind components conventions: https://ui.shadcn.com/docs
- Tailwind CSS — Border Radius (rounded-2xl etc.): https://tailwindcss.com/docs/border-radius
- Tailwind CSS — Box Shadow: https://tailwindcss.com/docs/box-shadow
- Tailwind CSS — Padding: https://tailwindcss.com/docs/padding
- Refactoring UI (book / blog): https://www.refactoringui.com/
- Smashing Magazine — recent AI/UI articles index: https://www.smashingmagazine.com/category/design/
- Maggie Appleton — public site/blog: https://maggieappleton.com/
- Material 3 — shape & expressive surfaces: https://m3.material.io/styles/shape
- IBM Carbon — productive vs expressive themes: https://carbondesignsystem.com/elements/color/overview/

## Catalog of tells

Each row: visual signature + DOM/class signature + recommended replacement + regex hint.

### 1. `rounded-2xl` everywhere

- Visual: 16px+ corner radius on every card, button, badge.
- DOM: `class*="rounded-2xl"`, `class*="rounded-3xl"`.
- Replacement: closed productivity radius scale `rounded-[0|4|8|12]px` or design-system `r0-r3` tokens.
- Regex: `\brounded-(2xl|3xl)\b`.

### 2. Indigo / purple gradient backgrounds

- Visual: linear-gradient from indigo-500 to purple-500 as hero/card background.
- DOM: `bg-gradient-to-r from-indigo-500 to-purple-500`, `bg-gradient-to-br from-violet-`, `from-fuchsia-`.
- Replacement: flat surface tokens; reserve gradients for specific hero treatments.
- Regex: `bg-gradient-(to|from|via)-(indigo|purple|violet|fuchsia|pink)`.

### 3. `p-8` / `p-12` oversized padding

- Visual: cards with 32-48px internal padding regardless of content density.
- DOM: `class*="p-8"`, `class*="p-12"`, `class*="p-16"`.
- Replacement: density token `--density-pad-y` / `--density-pad-x`.
- Regex: `\b(p|px|py|pt|pb|pl|pr)-(8|10|12|14|16)\b`.

### 4. Hero sections in productivity tools

- Visual: full-width section with oversized centered title, subtitle, two CTAs.
- DOM: `<section>` containing `text-5xl` or larger + `mx-auto` + `text-center` + button group.
- Replacement: there are no heroes in productivity UIs; remove or convert to ToolbarHeader.
- Regex: `text-(4xl|5xl|6xl|7xl|8xl|9xl)`.

### 5. Emoji used as iconography

- Visual: leading emoji in nav items, status chips, button labels.
- DOM: text node containing single emoji at the start of a button/link/list item.
- Replacement: real SVG icons (Lucide / Tabler / system).
- Regex: `>\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*<` (Unicode emoji ranges).

### 6. Centered everything

- Visual: every container uses `mx-auto` + `text-center` regardless of content.
- DOM: page-level `<main class="text-center">` or every `<div class="flex justify-center items-center">`.
- Replacement: left-align text and content; center only when semantically justified (modal title bar, empty state).
- Regex: `\btext-center\b` flagged outside known centered contexts (EmptyState, modal headers).

### 7. Glass morphism / frosted glass

- Visual: `backdrop-blur` on every card; `bg-white/30` or `bg-black/20`.
- DOM: `class*="backdrop-blur"`, `class*="bg-(white|black)/[0-9]"`.
- Replacement: solid surfaces from the surface ladder.
- Regex: `\bbackdrop-(blur|filter)\b` and `bg-(white|black)/\d+`.

### 8. Inter / system-ui as the only font

- Visual: every UI uses Inter; no monospace differentiation.
- DOM: CSS `font-family: Inter, system-ui, sans-serif` with no mono family declared.
- Replacement: HyperIdle ships Geist + Geist Mono; mono signals data/IDs/timestamps.
- Regex: file declares only `Inter`/`system-ui` and no `mono` family.

### 9. 3-column card grid

- Visual: `grid-cols-3` of identical cards regardless of content variance.
- DOM: `<div class="grid grid-cols-1 md:grid-cols-3 gap-8">` with mapped identical children.
- Replacement: real component layouts (List, Kanban, Board) tuned to the data shape.
- Regex: `grid-cols-3.*gap-(6|8|10|12)` near `.map(`.

### 10. `shadow-lg` / `shadow-xl` on cards

- Visual: every surface lifts heavily.
- DOM: `class*="shadow-lg"`, `class*="shadow-xl"`, `class*="shadow-2xl"`.
- Replacement: tonal layering via surface ladder; reserve heavy shadow for the `--float` token.
- Regex: `\bshadow-(lg|xl|2xl)\b`.

### 11. Lorem ipsum / generic placeholder text

- Visual: "Lorem ipsum...", "Click here", "Submit".
- DOM: text content matching common placeholders.
- Replacement: realistic content matching the actual use case.
- Regex: `\b(Lorem ipsum|Click here|Lorem|consectetur)\b`.

### 12. "Effortless" / "Seamless" / "Powerful" marketing copy

- Visual: marketing-language headings on internal tools.
- DOM: heading text matching marketing patterns.
- Replacement: literal task labels ("Pitch review", "Threads", "Knowledge").
- Regex: `>\s*(Effortless|Seamless|Powerful|Beautiful|Stunning|Game-changing)\b`.

### 13. Gradient-on-text

- Visual: page titles or hero headings filled with a linear-gradient via `bg-clip-text text-transparent`.
- DOM: `class*="bg-clip-text"` AND `class*="text-transparent"` (often paired with `bg-gradient-to-r`).
- Replacement: solid `--text-hi`. Gradient-on-text is decoration without information; productivity tools do not use it.
- Regex: `\bbg-clip-text\b[^"]*\btext-transparent\b`.

### 14. Full-bleed colored accent navigation

- Visual: nav rail <!-- @lore AD8a: "Rail" as HyperIdle UI concept deleted in U6; "nav rail" here is a generic UI pattern term --> or sidebar painted with a brand/accent color (purple/indigo/teal/violet) covering the entire column.
- DOM: `<aside>` or NavRail root with `class*="bg-(indigo|purple|teal|violet|emerald|sky)-(400|500|600|700)"`.
- Replacement: neutral surface (`--surface-1`) for the rail; accent color goes on the selected-item indicator only.  <!-- @lore AD8a: historical research (Rail deleted in U6) -->
- Regex: navigation root className matching `bg-(indigo|purple|teal|violet|emerald|sky)-\d{3}`.

### 15. Over-iconification

- Visual: every list row carries a leading Lucide icon, every chip carries a leading icon, every label carries a trailing chevron — icons as decoration rather than information.
- DOM: list-row primitives that always render `<Icon />` even when no semantic icon is supplied; default to a generic placeholder (Circle, Dot, ChevronRight).
- Replacement: row primitives must accept `icon` as optional and render zero-icon variants by default; icons only when they carry information.
- Regex: hard to express as a regex; AST: list-row primitive component must not render placeholder icon when `icon` prop is undefined.

## How leading AI design agents counter these

- shadcn/ui ships with a configurable `--radius` token that defaults to `0.625rem` (10px) per the manual `globals.css` install template (https://ui.shadcn.com/docs/installation/manual, verified 2026-04-25), explicitly within the productivity scale, not 16px+.
- shadcn/ui's component primitives use Radix under the hood and inherit Radix's accessibility defaults rather than introducing new chrome.
- v0.dev's documentation pushes users toward shadcn/ui primitives instead of bespoke generations.
- Refactoring UI consistently warns against centered hero patterns on internal tools (https://www.refactoringui.com/).

## Predictive rubric

Given a screenshot of an LLM-generated dashboard, predict which of the 12 tells above are present by checking the corresponding visual signal:

- Heavy corner-rounding on small primitives -> Tell #1.
- Indigo-to-purple background -> Tell #2.
- White space inside cards exceeding 24px on each side -> Tell #3.
- Centered oversized title at the top -> Tell #4.
- Leading emoji in any button/nav item -> Tell #5.
- Page-level center alignment of body content -> Tell #6.
- Translucent / blurred card backgrounds -> Tell #7.
- No mono type for IDs/timestamps -> Tell #8.
- 3 identical cards across the viewport -> Tell #9.
- Strong drop shadow on cards -> Tell #10.
- "Lorem" or "Click here" text -> Tell #11.
- Marketing-superlative headings -> Tell #12.

A typical v0-generated dashboard exhibits Tells #1, #2, #3, #4, #6, #7, #9, #10 simultaneously. Three or more present is the threshold for the predictive checklist to flag the artifact as AI-aesthetic.

## Disagreements

- Some critics defend `rounded-2xl` as a deliberate aesthetic; productivity-tool design systems (Carbon productive theme) disagree. The recommendation locks to productivity defaults.
- Glass morphism has legitimate uses (overlay materials in macOS); HyperIdle is web-only and chooses solid surfaces.

## Draft recommendations rows

| Token | Current | Recommended | Rationale | Sources | Lintable | Lint hint |
|---|---|---|---|---|---|---|
| `rounded-2xl`/`-3xl` | not blocked | block in `layers/web/src/**/*.tsx` and `framework/design-system/src/**/*.tsx` | Productivity-tool defaults reserve >=16px radii for expressive surfaces; AI-aesthetic critique consensus https://m3.material.io/styles/shape https://carbondesignsystem.com/elements/color/overview/ https://ui.shadcn.com/themes | Material 3, Carbon, shadcn/ui | yes | regex: `\brounded-(2xl\|3xl)\b` |
| Indigo/purple gradients | not blocked | block in component files | All three sources flag indigo-purple gradient as AI-default https://tailwindcss.com/docs/box-shadow https://www.refactoringui.com/ https://ui.shadcn.com/themes | Tailwind, Refactoring UI, shadcn/ui | yes | regex: `bg-gradient-(to\|from\|via)-(indigo\|purple\|violet\|fuchsia\|pink)` |
| `p-8`/`p-12` oversized padding | not blocked | restrict to hero/expressive contexts | Productivity defaults sit at 8-16px https://carbondesignsystem.com/elements/spacing/overview/ https://atlassian.design/foundations/spacing https://m3.material.io/foundations/layout/applying-layout/window-size-classes | Carbon, Atlassian, Material 3 | yes | regex: `\bp-(8\|10\|12\|14\|16)\b` |
| Hero section pattern | not blocked | forbid in `layers/web/src/pages/work/**` | Productivity tools have no heroes per three sources https://www.refactoringui.com/ https://carbondesignsystem.com/elements/color/overview/ https://m3.material.io/styles/shape | Refactoring UI, Carbon, Material 3 | partial | ast: `<section>` with `text-(4xl\|5xl\|6xl)` + `text-center` |
| Emoji as icon | not blocked | forbid in NavItem / Button / StatusChip text nodes | Productivity systems use vector icon sets https://carbondesignsystem.com/guidelines/typography/overview/ https://m3.material.io/styles/typography/type-scale-tokens https://www.refactoringui.com/ | Carbon, Material 3, Refactoring UI | partial | regex: text-node leading Unicode emoji range U+1F300-U+1FAFF |
| `shadow-lg`/`-xl` cards | not blocked | restrict to `--float` overlay surfaces | Three sources reserve heavy shadow for overlays only https://m3.material.io/styles/elevation/overview https://atlassian.design/foundations/elevation https://tailwindcss.com/docs/box-shadow | Material 3, Atlassian, Tailwind | yes | regex: `\bshadow-(lg\|xl\|2xl)\b` outside modal/overlay components |
