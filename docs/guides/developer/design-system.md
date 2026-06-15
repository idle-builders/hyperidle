## Design System

HyperIdle uses a built-in design system browser instead of Storybook.

### Viewing Components

Start the dev server and navigate to [http://localhost:5173/designsystem](http://localhost:5173/designsystem). This route is dev-only and stripped in production.

### Creating Stories

Every custom component must have a `.stories.tsx` file. Stories are auto-discovered via `import.meta.glob` from:

- `packages/web/src/components/*.stories.tsx`
- `packages/web/src/shell/*.stories.tsx`
- `packages/web/src/pages/*.stories.tsx`
- `packages/web/src/layouts/*.stories.tsx`

Story format (CSF3-style):

```tsx
// MyComponent.stories.tsx
import { MyComponent } from "./MyComponent";

export default {
  title: "Components/MyComponent",
};

export function Default() {
  return <MyComponent>Hello</MyComponent>;
}

export function WithError() {
  return <MyComponent error>Something went wrong</MyComponent>;
}
```

### Rendering data-fed surfaces in isolation

A presentational story (props in, callbacks are noops) needs nothing extra. A **page-level or data-fed surface** — one that reaches for `useNavigate` / `useParams` / `useContext(AssistantContext)` — throws when mounted bare. Wrap it in the isolation harness so it renders in the viewer and in jsdom tests with **no server, no database, no real routing, no real data**.

The harness is `packages/web/src/preview/MockProviders` — the thinnest shim that stops those hooks throwing: a `MemoryRouter` plus an `AssistantContext` default. It never boots the real app, router config, or data layer.

```tsx
// packages/web/src/pages/WorkBetCreate.stories.tsx — the canonical example
import { MockProviders } from "../preview";
import { WorkBetCreate } from "./WorkBetCreate";

export function EmptyState() {
  return (
    <MockProviders route="/work/bet/new">
      <WorkBetCreate />
    </MockProviders>
  );
}
```

Rules:

- **Opt-in, thinnest shim.** Only wrap a surface that actually consumes router/context. `MockProviders` provides exactly two providers — router + assistant. A surface needing a route param wraps its children in `<Routes><Route path=… element=…/></Routes>` itself; the harness provides the router, the story provides the match.
- **Feed it fixtures, not fetches.** Pass an existing fixture from `packages/web/src/pages/__fixtures__/` or `packages/web/src/fixtures/` (or an `override*` prop that short-circuits the fetch). Seed a new fixture only if the surface has none — do not pre-build fixtures for surfaces you aren't rendering.
- **Never reach a backend.** An ESLint `no-restricted-imports` block scoped to `packages/web/src/preview/**` forbids `@hyperidle/server` and `@hyperidle/db`. The no-backend contract is lint-enforced.
- **One story, three jobs.** The same `.stories.tsx` is the design prototype, the annotation surface for `/human-design-review`, and (post-build) the catalog entry — no parallel mockup medium.

### Design variants are TSX stories

`/design` authors UX/UI variants as isolated `.stories.tsx` stories rendered live in the viewer — not HTML mockups. One story = prototype = annotation surface = catalog entry. A page/data/context variant mounts via `MockProviders` (above). Visual regression is the [DOM-snapshot net](../../../.claude/rules/visual-regression.md), not a screenshot baseline — a `npx playwright screenshot` of a variant is a looked-at artifact for critique, never the regression gate.

### Design Rules

- **limited custom components** — everything else uses DaisyUI primitives directly
- **Tailwind CSS + DaisyUI** with the `factory-dark` theme
- **Avoid the "AI Aesthetic"**: no excessive gradients, no `rounded-2xl`, no `p-8`/`p-12` oversized padding. Think Bloomberg terminal, not marketing landing page
- 8-12px padding default, dense information display
