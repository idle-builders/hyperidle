# Design System — Developer Guide

Story format, catalog groups, and the component budget are owned by [`.claude/rules/design-system.md`](../../../.claude/rules/design-system.md). Visual gates and the TSX-single-source-of-truth rule are owned by [`.claude/rules/visual-regression.md`](../../../.claude/rules/visual-regression.md). Theme, tokens, and stack live in [`docs/ui-design/foundation.md`](../../ui-design/foundation.md). This guide keeps only what those don't: how stories are enforced and rendered here, and how to mount data-fed surfaces in isolation.

## Stories are the design artifact

Each component's `.stories.tsx` is the design source of truth. The `require-stories-sibling` lint rule enforces the sibling story — **error** in `framework/design-system/src/**` (eslint.config.ts:283), **warn** in `layers/core-ui/src/**` (eslint.config.ts:112).

There is **no story browser in the repo**. The old in-app `/designsystem` route and the `ds:serve` standalone viewer were both removed; nothing in the app or build depends on a viewer being installed. Stories are rendered by the pipeline plugin's component viewer during `/pipeline:design` and `/pipeline:human-concept-review`, which discovers `framework/design-system/src/**/*.stories.tsx` via `pipeline.config.yml` (`designSystem.path: "framework/design-system"`).

There is **no story-rendering snapshot net**. Visual fidelity is gated by `eslint-plugin-design` (`npm run lint` / `npm run lint:design`), type-check, and the human concept review — see [`.claude/rules/visual-regression.md`](../../../.claude/rules/visual-regression.md).

Themes are `hearth-light` / `hearth-dark`, light-first via `prefers-color-scheme` (`framework/design-system/src/tokens.css`); spacing is the 6px grid (`--space-N` = 3N px). See [`docs/ui-design/foundation.md`](../../ui-design/foundation.md).

## Rendering data-fed surfaces in isolation

A presentational story (props in, callbacks are noops) needs nothing extra. A **page-level or data-fed surface** — one that reaches for `useNavigate` / `useParams` / `useContext(AssistantContext)` — throws when mounted bare. Wrap it in the isolation harness so it renders in the viewer and in jsdom tests with **no server, no database, no real routing, no real data**.

The harness is `layers/core-ui/src/__preview__/MockProviders` — the thinnest shim that stops those hooks throwing: a `MemoryRouter` plus an `AssistantContext` default. It never boots the real app, router config, or data layer.

```tsx
// layers/core-ui/src/pages/WorkBetCreate.stories.tsx — the canonical example
import { MockProviders } from "../__preview__";
import { WorkTaskCreate } from "./WorkTaskCreate";

export function EmptyState() {
  return (
    <MockProviders route="/work/task/new">
      <WorkTaskCreate />
    </MockProviders>
  );
}
```

Rules:

- **Opt-in, thinnest shim.** Only wrap a surface that actually consumes router/context. `MockProviders` provides exactly two providers — router + assistant. A surface needing a route param wraps its children in `<Routes><Route path=… element=…/></Routes>` itself; the harness provides the router, the story provides the match.
- **Feed it fixtures, not fetches.** Pass an existing fixture from `layers/core-ui/src/pages/__fixtures__/` or `layers/core-ui/src/fixtures/` (or an `override*` prop that short-circuits the fetch). Seed a new fixture only if the surface has none — do not pre-build fixtures for surfaces you aren't rendering.
- **Never reach a backend.** An ESLint `no-restricted-imports` block scoped to `layers/core-ui/src/__preview__/**` forbids `@hyperidle/core-api` and `@hyperidle/db` (eslint.config.ts:900). The no-backend contract is lint-enforced.
- **One story, two jobs.** The same `.stories.tsx` is the design prototype and the annotation surface for `/pipeline:human-concept-review` — no parallel mockup medium. There is no catalog; the story browser was removed.

## Testing components

Component behavior is tested directly with vitest + Testing Library: `*.test.tsx` beside each component, render and assert on its DOM. End-to-end flows run against the real app with Playwright (`layers/core-ui/__e2e__/`), reserved for the most relevant user interactions. Neither layer targets a design-system viewer — the viewer does not exist in the repo. See [`testing.md`](testing.md).
