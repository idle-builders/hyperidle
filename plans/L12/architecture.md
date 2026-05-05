# L12 — Architecture: Artifact View Family Across Work Surfaces

## What Gets Built

Four surface mounts + one shared section container + hook extension. No new routes, no new DS components, no new API endpoints. Every piece reuses L3 infrastructure.

---

## Files to Create

### `packages/web/src/components/ArtifactSection.tsx`

Shared section wrapper used by all four Work surfaces. Encapsulates the loading/error/empty/populated state machine and section chrome.

```typescript
export type ArtifactSectionLayout = "gallery" | "stack" | "single";

export interface ArtifactSectionProps {
  filter: ArtifactFilterAxis;
  layout: ArtifactSectionLayout;
  // Per-surface limit; undefined means use hook default (no limit param sent)
  limit?: number;
  // Label for the section header. Undefined = no header rendered (TaskSheet use case).
  heading?: string;
  // onOpen callback receives the artifact id; caller decides navigation target.
  onOpen: (artifactId: string) => void;
}
```

Behavior:
- Calls `useArtifacts(filter, limit !== undefined ? { limit } : undefined)`.
- Renders a `<section aria-label="Artifacts">` wrapper with optional heading.
- Loading: shows SkeletonCard(s) appropriate to the layout (gallery=3, stack=2, single=1).
- Error: shows `<ErrorState title="Could not load artifacts" description={error} />`.
- Empty (items.length === 0 and not loading and not error):
  - If `heading` is defined: show `<EmptyState title="No artifacts yet" description="..." />`.
  - If `heading` is undefined (TaskSheet): render nothing (null).
- Populated: renders the list in the specified layout.
- Overflow: if `nextCursor !== null`, renders a plain `"View all →"` text row. Links to `/artifacts?axis=${filter.axis}&...` (TODO — no list page yet, builder adds comment).

Gallery layout: `div.grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--density-gap)]` wrapping `ArtifactGalleryCard` items.

Stack layout: `div.flex flex-col` wrapping `ArtifactStackItem` items.

Single layout: renders `ArtifactPreview data={items[0]}` directly (no wrapper ul/div for list).

### `packages/web/src/components/ArtifactSection.stories.tsx`

Stories file for the ArtifactSection component. Must render all states:
- gallery/populated with 3+ items
- gallery/loading
- gallery/empty
- stack/populated
- stack/empty
- single/populated (1 item)
- single/empty (renders nothing)

Uses msw or direct prop injection via the existing testing patterns (check how ArtifactThreadsSummary.stories.tsx does it).

---

## Files to Modify

### `packages/web/src/hooks/useArtifacts.ts`

Add optional `query?: Pick<ArtifactQuery, "limit">` parameter to `useArtifacts`.

```typescript
export function useArtifacts(
  filter: ArtifactFilterAxis,
  query?: Pick<ArtifactQuery, "limit">
): FetchState<ArtifactPage>
```

`buildUrl` appends `&limit=${query.limit}` when provided. The `ArtifactQuery` type is already imported from `@hyperidle/shared`.

**Important:** `useArtifact` (singular, for the permalink) is unchanged.

### `packages/web/src/pages/WorkPortfolio.tsx`

Add an artifact section below the cycle stripe:

```tsx
<ArtifactSection
  filter={{ axis: "portfolio" }}
  layout="gallery"
  limit={12}
  heading="ARTIFACTS"
  onOpen={(id) => navigate(`/artifacts/${encodeURIComponent(id)}`)}
/>
```

Section goes after the `data-testid="cycle-stripe"` div. The `navigate` call from `useNavigate()` is already in scope.

### `packages/web/src/pages/WorkProduct.tsx`

Replace the empty `<section data-testid="product-artifact-slot" aria-label="Artifact aggregation" />` placeholder at the bottom of `WorkProductLoaded` with:

```tsx
<ArtifactSection
  filter={{ axis: "product", productId: product.id }}
  layout="stack"
  limit={10}
  heading="ARTIFACTS"
  onOpen={(id) => navigate(`/artifacts/${encodeURIComponent(id)}`)}
/>
```

The `navigate` call from `useNavigate()` is already in scope in `WorkProductLoaded`.

### `packages/web/src/pages/WorkBet.tsx`

Insert an artifact stack section between the tasks table and `<ArtifactThreadsSummary>`. In the JSX render of the bet's loaded content, find the `<ArtifactThreadsSummary betId={bet.id} />` line and insert above it:

```tsx
<ArtifactSection
  filter={{ axis: "bet", betId: bet.id }}
  layout="stack"
  heading="ARTIFACTS"
  onOpen={(id) => navigate(`/artifacts/${encodeURIComponent(id)}`)}
/>
```

No limit (uses default 50). `navigate` from `useNavigate` is already in scope.

### `packages/web/src/shell/TaskSheet.tsx`

Add an artifact section between the task summary block and the Discussion section. Inside the `return` block of TaskSheet, after the task summary `<div className="px-4 py-3 border-b ...">` and before the Discussion `<div className="border-b ...">`:

```tsx
<ArtifactSection
  filter={{ axis: "task", taskId: task.id }}
  layout="single"
  limit={1}
  onOpen={(id) => navigate(`/artifacts/${encodeURIComponent(id)}`)}
/>
```

No `heading` — TaskSheet collapses the section when empty. TaskSheet currently uses no navigation — need to import `useNavigate` from react-router-dom. This is a new import in TaskSheet.tsx. Acceptable — TaskSheet is a shell component that is already router-aware (it receives `onNavigateToThread` and uses Link indirectly via HostThreadSection).

---

## Files to Create (Tests)

### `packages/web/src/components/__tests__/ArtifactSection.test.tsx`

Vitest unit tests. Use `vi.mock('../hooks/useArtifacts')` or msw to stub the hook.

Coverage:
- gallery layout renders ArtifactGalleryCard items
- stack layout renders ArtifactStackItem items
- single layout renders ArtifactPreview for items[0]
- loading state renders SkeletonCard(s)
- error state renders ErrorState
- empty state with heading renders EmptyState
- empty state without heading renders null
- overflow renders "View all" when nextCursor is not null

### `packages/web/src/pages/__tests__/WorkPortfolio.artifact-section.test.tsx`

Vitest tests for WorkPortfolio artifact section mount:
- renders artifact section when data is available
- renders loading skeleton while fetching
- renders empty state when no artifacts

Mock `useArtifacts` hook return value for these tests.

### `packages/web/src/pages/__tests__/WorkProduct.artifact-section.test.tsx`

Vitest tests for WorkProduct artifact section mount:
- renders artifact stack when data is available
- renders loading skeleton
- renders empty state
- does not render when product data is loading/error (product data gate)

### `packages/web/src/pages/__tests__/WorkBet.artifact-section.test.tsx`

Vitest tests:
- renders artifact stack section between tasks table and ArtifactThreadsSummary
- renders empty state when no artifacts
- renders loading state

Check that the order in the DOM is: task rows → artifact section → artifact thread summary.

### `packages/web/src/shell/__tests__/TaskSheet.artifact-section.test.tsx`

Vitest tests:
- renders ArtifactPreview when task has an artifact
- renders nothing when task has no artifact (empty state collapsed)
- renders loading skeleton while fetching

### Playwright E2E Tests

`packages/web/e2e/L12-artifact-surfaces.spec.ts`

Three scenarios from AC:
1. Portfolio → see artifact aggregation → click → preview opens
2. Bet detail → see artifact aggregation (stack items present)
3. Task (via TaskSheet) → see its artifact

These require seeded data. Check how existing e2e tests seed — look at `packages/web/playwright.config.ts` and existing e2e spec files to follow the established pattern. The tests should use `page.goto('/work/portfolio')`, look for `[data-component="ArtifactGalleryCard"]`, click the first one, assert navigation to `/artifacts/...` and presence of `[data-component="ArtifactPreview"]`.

---

## Data Flow Per Surface

| Surface | Hook call | Filter axis | Limit | Component |
|---------|----------|-------------|-------|-----------|
| WorkPortfolio | `useArtifacts({ axis: "portfolio" }, { limit: 12 })` | portfolio | 12 | ArtifactGalleryCard |
| WorkProduct | `useArtifacts({ axis: "product", productId }, { limit: 10 })` | product | 10 | ArtifactStackItem |
| WorkBet | `useArtifacts({ axis: "bet", betId })` | bet | 50 (default) | ArtifactStackItem |
| TaskSheet | `useArtifacts({ axis: "task", taskId: task.id }, { limit: 1 })` | task | 1 | ArtifactPreview |

All hook calls go to `GET /api/artifacts?axis=...&...` — the existing L3 route.

---

## Routing

No new routes. Click-through uses `useNavigate` to push `/artifacts/${id}`. The route `/artifacts/:id` → `ArtifactPermalink` is already registered in `packages/web/src/router.tsx` (line 63).

---

## Type Signatures

```typescript
// In ArtifactSection.tsx
export type ArtifactSectionLayout = "gallery" | "stack" | "single";

export interface ArtifactSectionProps {
  filter: ArtifactFilterAxis;
  layout: ArtifactSectionLayout;
  limit?: number;
  heading?: string;
  onOpen: (artifactId: string) => void;
}

export function ArtifactSection(props: ArtifactSectionProps): JSX.Element | null;
```

```typescript
// Modified useArtifacts signature
export function useArtifacts(
  filter: ArtifactFilterAxis,
  query?: Pick<ArtifactQuery, "limit">
): FetchState<ArtifactPage>;
```

`FetchState<ArtifactPage>` already returns `{ data: ArtifactPage | null, error: string | null, isLoading: boolean }` — verified from `useArtifactThreadSummary` which uses the same shape from `useFetch`.

Wait — check the actual FetchState shape. `useArtifacts` uses `useFetch` which returns `FetchState<T>`. Looking at the hook: `const { data, error, isLoading } = useArtifact(id)` in ArtifactPermalink. And `const { data, error, isLoading } = useArtifactThreadSummary(betId)` in ArtifactThreadsSummary. But `useFetch` is in `packages/web/src/hooks/useFetch.ts` — FetchState was imported as `type FetchState` in useArtifacts.ts. The actual fields are `data`, `error`, `isLoading` (standard shape).

---

## Ordered Task List

1. **Extend `useArtifacts` hook** — add optional `query?: Pick<ArtifactQuery, "limit">` param and update `buildUrl`. Update the hook's `__tests__` if they exist.

2. **Build `ArtifactSection` component** — create `ArtifactSection.tsx` and `ArtifactSection.stories.tsx`.

3. **Write failing tests** — all Vitest test files listed above (red phase, per CLAUDE.md).

4. **Mount on WorkBet** — insert ArtifactSection above ArtifactThreadsSummary.

5. **Mount on WorkProduct** — replace placeholder section with ArtifactSection.

6. **Mount on WorkPortfolio** — add ArtifactSection below cycle stripe.

7. **Mount on TaskSheet** — add ArtifactSection inside the drawer, add `useNavigate` import.

8. **Write Playwright e2e spec** — seed data in beforeAll, run three scenarios.

9. **Run `bun run check && bun run lint && bun run test`** — fix any type or lint issues.

---

## Trade-offs Considered

**ArtifactSection component vs. inline duplication**

Option A: `ArtifactSection` component (chosen)
- Cost: one new web-package component file
- Benefit: loading/error/empty/populated logic written once, tested once
- Coupling: four pages depend on it — low risk (stable contract, no DS state)

Option B: inline the logic in each page
- Cost: ~80 lines duplicated × 4 = ~320 lines, four test surfaces for the same logic
- Benefit: no shared component (simpler dependency graph)
- Verdict: rejected — duplication cost is too high, the logic is not trivially simple (5 states × 3 layouts)

**Limit parameter via hook vs. via component prop**

Option A: limit is a component prop on ArtifactSection, passed to useArtifacts (chosen)
- Benefit: each surface declaratively states its limit
- Cost: hook signature change (minimal)

Option B: hardcode limits inside ArtifactSection based on layout
- Benefit: no hook change
- Cost: hides a per-surface decision inside a shared component; makes it impossible to override in tests
- Verdict: rejected

**taskId availability in TaskSheet**

TaskSheet receives `task: KanbanTask | null` — `KanbanTask` has `id: string`. The artifact fetch uses `task.id` which is always available when the sheet is open (`task && open` guard). No additional prop is needed.

**`useNavigate` in TaskSheet**

TaskSheet is a shell component (`packages/web/src/shell/`). Shell components can use React Router hooks — they are rendered inside the AppShell which is router-provided. This is safe and already the pattern in WorkBet, WorkProduct etc. Adding `useNavigate` to TaskSheet is a one-import change.

---

## Empty State Copy

Per surface:
- Portfolio: "No artifacts yet" / "Artifacts appear here as agents complete tasks."
- Product: "No artifacts yet" / "Artifacts appear as agents complete tasks for this product."
- Bet: "No artifacts yet" / "Artifacts appear as agents complete tasks on this bet."
- Task (TaskSheet): section hidden — no copy needed

---

## Acceptance Criteria Mapping

| AC | Verification method |
|----|-------------------|
| Consumes L3 Artifact primitive | Vitest: ArtifactSection imports from @hyperidle/design-system (ArtifactGalleryCard etc.) |
| Artifacts root on tasks; higher surfaces aggregate | Verified by API: axis=bet, product, portfolio all work via server-side fan-out (existing L3 route) |
| Portfolio → gallery card | Vitest: WorkPortfolio.artifact-section.test → ArtifactGalleryCard renders |
| Product → stack | Vitest: WorkProduct.artifact-section.test → ArtifactStackItem renders |
| Bet → stack | Vitest: WorkBet.artifact-section.test → ArtifactStackItem renders |
| Task → single preview | Vitest: TaskSheet.artifact-section.test → ArtifactPreview renders |
| Fetch endpoint wired | Playwright e2e: real API called, real data returned |
| Zero hardcoded artifacts | Code review: no hardcoded artifact arrays on any page |
| Clicking opens preview | Playwright e2e: click ArtifactGalleryCard → URL becomes /artifacts/:id |
| Vitest tests per surface | All test files listed in ordered task list |
| Playwright e2e three scenarios | e2e spec with three describe blocks |
| bun run check + lint + test green | CI gate |

---

## @lore Candidates for Builder

- `@lore L12: ArtifactSection lives in packages/web/src/components/ not shell/ — it has no shell-level state (no focus management, no keyboard trap). It is a data-fetch composition component analogous to ArtifactThreadsSummary.`
- `@lore L12: useArtifacts optional query param — the limit param is per-surface (12 portfolio, 10 product, 1 task, default 50 bet). Do not remove it; each surface has a different information density contract.`
- `@lore L12: TaskSheet artifact section collapses when empty (renders null) — this is intentional. TaskSheet is a compact drawer; showing a section header + EmptyState for a not-yet-producing task adds noise. The heading="undefined" pattern is the contract.`
- `@lore L12: onOpen in ArtifactSection calls navigate() with the artifact id — the handler is passed by the page component, not embedded in ArtifactSection, because ArtifactSection does not know what route to navigate to (it is layout-agnostic).`
