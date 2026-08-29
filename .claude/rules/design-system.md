---
paths:
  - "layers/core-ui/src/ds/**"
  - "layers/core-ui/src/shell/*.stories.tsx"
---

# Design System

Components live in `layers/core-ui/src/ds/` (57 components today). Shell / region components stay in `layers/core-ui/src/shell/`.

**Single source of truth.** Each component has exactly one `.tsx` (production, Tailwind). TSX is the design source of truth — there are no `.html` reference files; the `.tsx` story IS the design artifact. Every custom component must have a `.stories.tsx` — stories are a required deliverable, not optional documentation.

**Story format.** default export `{ title: "Name", group?: GroupName }`; named exports are React components, one variant each. `group` is optional — most stories classify automatically from their path; use it only for area-less page stories that have no folder signal (e.g. `group: "Work"`).

## Reuse before build (CRITICAL)

Before adding any component, hook, or helper, read `layers/core-ui/src/ds/index.ts` (and the `@hyperidle/domain-model` registry + `utils/`). If an existing export already does the job, **adopt or extend it — never fork a polished parallel copy.** A new thing whose job an existing design-system export, shared registry, or util already does is a CRITICAL review finding; the fix is adoption or extension, not a nicer fork. A deliberate exception needs a `@lore` comment naming the reason.

## Component budget & promotion

- **Budget.** Only the components already exported from `layers/core-ui/src/ds/index.ts`. Any addition needs a written reason.
- **Promotion.** A component consumed by 2+ pages belongs in `layers/core-ui/src/ds/`, not page-local.

## Tokens

- **Source of truth:** `layers/core-ui/src/ds/tokens.css`. Two theme modes (`hearth-dark` / `hearth-light`), light-first, default `hearth-light`; with no `data-theme` set, `prefers-color-scheme` decides.
- Every `var(--…)` a component references MUST exist in `tokens.css`. A dangling token reference renders as silent breakage — CRITICAL.
- **Design principles:** `.claude/rules/aesthetic-quality.md`.

## Visual review & annotation

Live story rendering and browser annotation come from the design viewer that ships with `/design` (`skills/design/viewer/launch.mjs`). For a high-stakes change the founder annotates the live render there and the real TSX is revised until approval. The nine design dimensions — hierarchy, spacing, typography, color, coherence, states, a11y, anti-slop, premium polish — are the bar `/design` works to; see `aesthetic-quality.md`. For the visual-regression policy, see `visual-regression.md`.

**Data attributes** on components — `data-ds-component` (shell components use `data-ds-shell`), `data-ds-tier`, `data-uses`, `data-daisyui`, `data-used-by` on the outermost element; inner sub-components also carry `data-ds-component` + `data-ds-tier`. These DOM markers carry component identity and drive the skill's annotation overlay.

**Layout** must match the approved design and the app-shell structure in `docs/information-architecture/`.
