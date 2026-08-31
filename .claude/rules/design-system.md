---
paths:
  - "layers/core-ui/src/ds/**"
  - "layers/core-ui/src/shell/*.stories.tsx"
---

# Design System

Components live in `layers/core-ui/src/ds/` — 57 component files, re-exported from
`layers/core-ui/src/ds/index.ts` (components plus their prop types and helpers). Shell and region components stay in `layers/core-ui/src/shell/`.
There is no `framework/design-system` package; AU44 dissolved it into `ds/`, and
`design-source.test.ts` fails if it ever comes back.

**Single source of truth.** Each component has exactly one `.tsx` (production, Tailwind). TSX is the
design source of truth — there are no `.html` reference files, and the `.stories.tsx` story IS the
design artifact. Every custom component must have a story; it is a deliverable, not documentation.

**Story format.** Default export `{ title: "Name", group?: GroupName }`; named exports are React
components, one variant each. `group` is optional — most stories classify from their path; use it only
for area-less page stories with no folder signal (e.g. `group: "Work"`).

## Reuse before build (CRITICAL)

Before adding any component, hook or helper, read `layers/core-ui/src/ds/index.ts` (and the
`@hyperidle/domain-model` registry + `utils/`). If an existing export already does the job, **adopt or
extend it — never fork a polished parallel copy.** A new thing whose job an existing design-system
export, shared registry or util already does is a CRITICAL review finding; the fix is adoption or
extension, not a nicer fork. A deliberate exception needs a `@lore` comment naming the reason.

## Component budget & promotion

- **Budget.** Only what is already exported from `ds/index.ts`. Any addition needs a written reason.
- **Promotion.** A component consumed by 2+ pages belongs in `ds/`, not page-local.

## Tokens

- **Source of truth:** `layers/core-ui/src/ds/tokens.css` — the Crème Lemon palette on Hearth
  geometry. Two theme modes (`hearth-dark` / `hearth-light`), light-first, default `hearth-light`;
  with no `data-theme` set, `prefers-color-scheme` decides.
- Every `var(--…)` a component references MUST exist in `tokens.css`. A dangling token renders as
  silent breakage — CRITICAL.
- The hard token rules and what the linter actually enforces: `.claude/rules/aesthetic-quality.md`.

## Two lint scopes, and they are not the same

The design rule set splits `layers/core-ui/src` in two: `ds/**` is where the design system is BUILT,
everything else is code that USES it. Rules are wired per scope in
`tools/eslint-plugin-design/src/hearth-config.ts` — a rule can be `error` inside `ds/` and `warn` or
`off` outside it, or the reverse. Read that table before assuming a rule covers the file you are in.

## Data attributes

`data-ds-component` (shell components use `data-ds-shell`), `data-ds-tier`, `data-uses`,
`data-daisyui`, `data-used-by` on the outermost element; inner sub-components also carry
`data-ds-component` + `data-ds-tier`. These DOM markers carry component identity and drive the design
viewer's annotation overlay, and they are what a review cites when a claim about the render needs a
number behind it.

**Layout** must match the approved design and the app-shell structure in `docs/information-architecture/`.

For how a visual change is proven, see `.pipeline/rules/visual-regression.md`.
