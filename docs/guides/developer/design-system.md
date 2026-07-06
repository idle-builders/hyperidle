## Design System

Each component's `.stories.tsx` is the design source of truth — the story renders the component's key states, and every component under `packages/design-system/src/` or `packages/web/src/components/` must have one (enforced by the `require-stories-sibling` lint rule). There is no bundled story browser in the repo (the old in-app `/designsystem` route and the `ds:serve` standalone viewer were both removed as redundant). Stories are rendered for design review during the agent pipeline's `/pipeline:human-concept-review` phase; nothing in the app or build depends on a viewer being installed.

Component behavior is covered directly by vitest + Testing Library tests (`*.test.tsx` beside each component). Design and visual fidelity are guarded by the token guard, `eslint-plugin-design`, and type-check, plus the human concept review — see [`../../../.claude/rules/visual-regression.md`](../../../.claude/rules/visual-regression.md). There is no story-rendering snapshot net.

### Catalog groups (AJ6)

Stories are organized into two axes:

**Tier groups** (domain-agnostic reuse vocabulary, shown first):
- **Foundation** — atoms: Button, Input, Avatar, Toggle, Checkbox, Select, SearchField, LiveDot, Progress, Breadcrumb, Skeleton, Menu, Tokens
- **Primitives** — small composed: StatusChip, Tag, NavItem, KeyValue
- **Blocks** — domain-agnostic composed: Row, ItemList, EmptyState, ErrorState, TabBar, Toast, ScopePicker, Block, BodyEditor, Dialog family

**Domain groups** (product areas, shown after the divider):
- **Work** — BetCard, TaskCard, work pages
- **Knowledge** — KnowledgeRow, knowledge pages
- **Conversations** — ThreadRow, Composer, ThreadShell, conversation pages
- **Artifacts** — Artifact* family
- **Settings** — settings panels
- **System** — AppShell layout, Sidebar, kind renderers

Classification is derived from source path. A `group` field in a story's default export is the escape hatch for area-less stories.

### Viewing Components

Stories are the design-review surface. The pipeline component viewer — rendered by `/pipeline:design` and `/pipeline:human-concept-review` — discovers and renders stories from `packages/design-system` as configured in `pipeline.config.yml` (`designSystem.path: packages/design-system`).

### Creating Stories

Every custom component must have a `.stories.tsx` file. Stories are auto-discovered via `import.meta.glob` from:

- `packages/design-system/src/*.stories.tsx` — Foundation/Primitives/Blocks/domain components
- `packages/web/src/components/*.stories.tsx` — web composites (classified by registry)
- `packages/web/src/shell/*.stories.tsx` — shells (System group)
- `packages/web/src/pages/*.stories.tsx` — flat pages (classified from title: `Page: Work/*` → Work)
- `packages/web/src/pages/*/*.stories.tsx` — nested pages (classified from folder: `pages/work/` → Work)
- `packages/web/src/settings/*.stories.tsx` — settings panels (Settings group)
- `packages/web/src/layouts/*.stories.tsx` — AppShell layout (System group)

Story format (CSF3-style):

```tsx
// MyComponent.stories.tsx
import { MyComponent } from "./MyComponent";

export default {
  title: "Components/MyComponent",
  // group is optional — set only for area-less stories that can't be derived from path/title
  // group: "Work",
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

### Testing components

Component behavior is tested directly with vitest + Testing Library: render the component, assert on its DOM. End-to-end flows are tested against the real app with Playwright (`packages/web/e2e/`), reserved for the most relevant user interactions. Neither test layer targets a design-system viewer — the viewer does not exist in the repo.

### Design variants are TSX stories

`/design` authors UX/UI variants as isolated `.stories.tsx` stories — not HTML mockups. One story = prototype = annotation surface = design artifact. A page/data/context variant mounts via `MockProviders` (above). Visual fidelity is guarded by lint (`eslint-plugin-design`), the token guard, type-check, and the human concept review (see [`../../../.claude/rules/visual-regression.md`](../../../.claude/rules/visual-regression.md)) — a `npx playwright screenshot` of a variant is a looked-at artifact for critique, never a screenshot-baseline regression gate.

---

### Design Rules

- **limited custom components** — everything else uses DaisyUI primitives directly
- **Tailwind CSS + DaisyUI** with the `factory-dark` theme
- **Avoid the "AI Aesthetic"**: no excessive gradients, no `rounded-2xl`, no `p-8`/`p-12` oversized padding. Think Bloomberg terminal, not marketing landing page
- 8-12px padding default, dense information display
