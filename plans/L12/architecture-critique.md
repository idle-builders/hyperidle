# L12 — Architecture Critique

Reviewer: Phase 2 evaluation. Evaluated against `plans/L12/architecture.md`. Codebase verified: `useArtifacts.ts`, `useFetch.ts`, `WorkPortfolio.tsx`, `WorkProduct.tsx`, `WorkBet.tsx`, `TaskSheet.tsx`, `router.tsx`, `ds-attrs.ts`, all DS artifact components, `ArtifactThreadsSummary.tsx`, `packages/shared/src/types/artifact.ts`.

---

## Dimension Scores

### 1. Correctness — 8/10

The plan implements all ACs:
- AC: Consumes L3 Artifact primitive — ArtifactSection imports ArtifactGalleryCard, ArtifactStackItem, ArtifactPreview from design-system. Verified exports exist.
- AC: Artifacts root on tasks; higher surfaces aggregate — correctly delegated to the existing `/api/artifacts?axis=...` route via `useArtifacts`.
- AC: Portfolio→gallery, Product→stack, Bet→stack, Task→single — correct component-per-layout mapping confirmed against DS component API.
- AC: Fetch endpoint wired — `useArtifacts` with `buildUrl` already handles all four axes.
- AC: Zero hardcoded artifacts — the plan eliminates the placeholder `<section data-testid="product-artifact-slot">` and replaces it with the data-fetching `ArtifactSection`.
- AC: Click opens preview — `onOpen(() => navigate('/artifacts/${id}'))` pattern maps to the existing `artifacts/:id` route (confirmed at router.tsx line 63).

**One correctness issue:** The plan says `ArtifactSection` renders `ArtifactPreview data={items[0]}` for the `single` layout. But `ArtifactPreviewProps` (verified) takes `data: Artifact`, not a page item type — this is fine. However, the plan does not specify what happens when `items[0]` is undefined (i.e., `items` is empty but `isLoading === false`). The plan says "Empty (items.length === 0 and not loading and not error): if heading is undefined, render nothing (null)." This covers the TaskSheet case. But for `single` layout with a heading, it renders `EmptyState` — then who renders the component? When `items.length === 0` we never reach the populated render path, so `ArtifactPreview data={items[0]}` is only reached when `items.length > 0`. This is safe, but the plan does not make this guard condition explicit, which could confuse the builder.

**One correctness concern:** The plan states the WorkBet ArtifactSection goes `above ArtifactThreadsSummary`. Verified in `WorkBet.tsx`: `ArtifactThreadsSummary` appears at line 467 immediately after `HostThreadSection` (line 457). The plan's insertion point is between the tasks table and `ArtifactThreadsSummary`, which means the order becomes: Tasks → ArtifactSection → HostThreadSection → ArtifactThreadsSummary. But the plan's own "What Gets Built" section and the brief both state the intended order is: Tasks → Artifact stack → Artifact thread summary → Discussion. The actual code has `HostThreadSection` (Discussion) before `ArtifactThreadsSummary`. The plan says to insert `ArtifactSection` "above ArtifactThreadsSummary" — this would place it between Discussion and ArtifactThreadsSummary, not between Tasks and Discussion as the brief states. The builder needs a precise insertion point relative to both `HostThreadSection` and `ArtifactThreadsSummary`, not just "above ArtifactThreadsSummary."

**Score: 8** — all ACs covered; the WorkBet insertion ambiguity and missing `items[0]` undefined guard are the issues.

### 2. Simplicity — 9/10

The plan's key simplicity decision — `ArtifactSection` as a shared wrapper rather than inline duplication — is correct. The trade-off analysis (Option A vs B) is documented and well-reasoned. The component has a minimal interface: 5 props, all straightforward. The hook extension is a one-line change to `buildUrl`. No new routes, no new DS components, no new API endpoints.

Minor simplicity concern: `ArtifactSectionLayout` is a discriminated union of three strings. The plan maps this to three different render paths inside ArtifactSection. This is correct but the `single` layout's guard (`items[0]` in populated state) and the loading skeleton count (1 vs 2 vs 3) require internal branching on the layout value in three places. This is proportionate to the problem — there is no simpler representation that is still correct.

**Score: 9** — lean plan with well-justified abstraction.

### 3. Consistency — 9/10

The plan follows established patterns:
- `useArtifacts` extension mirrors how `useBet`, `useProduct`, `useProducts` work — a `useFetch` wrapper with a URL builder.
- `ArtifactSection` in `packages/web/src/components/` follows the same pattern as `ArtifactThreadsSummary`.
- Stories file alongside the component follows every existing component in the codebase.
- `overrideBet` / `overrideData` pattern for test injection mirrors WorkBet and WorkProduct.
- Navigation uses `useNavigate` + `encodeURIComponent` — exactly matching WorkPortfolio line 124 and WorkProduct line 218.

**Score: 9** — consistent with all established patterns.

### 4. Safety — 9/10

The plan introduces no new API endpoints, no new data writes, no new auth boundaries. All data flows through the existing `GET /api/artifacts` route. `encodeURIComponent(id)` is correctly specified on all navigation calls. No user input is accepted; all `onOpen` callbacks receive server-provided artifact IDs.

One minor safety concern: the overflow links (`/artifacts?axis=portfolio`, `/artifacts?axis=product&productId=...`) are constructed by string interpolation in the plan examples. If the builder follows this literally for the WorkProduct overflow, `productId` is a URL parameter value that comes from `product.id` — a server-generated UUID. No sanitization risk. But the plan should note that `productId` should also be `encodeURIComponent`-wrapped in the overflow link if it ever contains non-ASCII characters (unlikely for UUIDs, but the pattern in the codebase is to always encode).

**Score: 9** — no meaningful security gaps; the overflow link encoding omission is cosmetic.

### 5. Testability — 8/10

The test plan is comprehensive:
- Unit tests per ArtifactSection state × layout combination (8 scenarios listed)
- Per-surface Vitest tests for each page mount
- Playwright e2e for the three key ACs (click-through, aggregation, TaskSheet artifact)

**One testability gap:** The plan specifies the Playwright test should look for `[data-component="ArtifactGalleryCard"]`. This attribute name is wrong. The actual attribute (verified in `ds-attrs.ts` and confirmed in `artifact-aggregation.spec.ts`) is `data-ds-component="ArtifactGalleryCard"`. The existing e2e tests use `[data-ds-component='ArtifactGalleryCard']` (artifact-aggregation.spec.ts line 61). If the builder copies the plan's selector literally, the tests will silently fail to find the elements.

**One testability gap:** The plan says to "check how existing e2e tests seed" data. The existing artifact e2e tests (`artifact-aggregation.spec.ts`) use `page.route()` mock interception — not DB seeding. The plan says "These require seeded data" and then says to "use page.goto('/work/portfolio'), look for `[data-component="ArtifactGalleryCard"]`." These two approaches (seeded DB vs API mock) are in tension. The builder must decide: mock the API (simpler, consistent with existing e2e) or seed the DB (heavier, also valid). The plan doesn't resolve this.

**Score: 8** — test coverage is complete; the wrong selector string and seeding ambiguity are the gaps.

### 6. Performance — 9/10

The plan adds four hook calls (one per surface) — each independently fetches on mount. This is correct because:
- WorkPortfolio, WorkProduct, WorkBet, TaskSheet are different pages/components that mount independently
- There is no case where all four mount simultaneously
- Each call uses the existing `useFetch` pattern which cancels in-flight requests on unmount

The `limit` parameter (12/10/1/default) prevents over-fetching. No N+1 risks — the `axis` parameter fans out to a server-side aggregation that was already built in L3.

Minor concern: WorkPortfolio already calls `useProducts()`, and the new ArtifactSection will call `useArtifacts({ axis: "portfolio" })`. That's two simultaneous fetches on page load. This is acceptable — both are independent resources and browsers parallelize these natively.

**Score: 9** — no performance anti-patterns.

### 7. Maintainability — 9/10

Clear ownership:
- `ArtifactSection` is co-located with `ArtifactThreadsSummary` in `packages/web/src/components/` — same pattern, easy to find.
- The `@lore` candidates listed at the end of the plan are well-chosen and explain non-obvious decisions.
- The `heading?: string` prop as the TaskSheet "collapse when empty" contract is clean but subtle — the lore annotation is appropriate.

One maintainability concern: the plan deprecates the "View all →" link by noting it goes nowhere (TODO comment). Linking to a 404 in production is worse than omitting the link. The plan says the builder should add a TODO — but a TODO comment does not prevent a broken link from shipping. The design-critique flagged this too. A stronger recommendation: render the overflow row as a non-interactive `<span>` with `data-testid="artifact-overflow-todo"` rather than an `<a>` tag.

**Score: 9** — maintainability is good; the dead-link overflow is the one rough edge.

### 8. Dependencies — 10/10

The plan respects the three-layer dependency direction:
- `ArtifactSection` is in `packages/web/src/components/` (Human Interface layer) and imports from `@hyperidle/design-system` (downward) and calls `useArtifacts` (same layer) — correct.
- No layer reaches past its neighbor.
- No circular imports: `ArtifactSection` → `useArtifacts` → `useFetch` (all in `packages/web/src/hooks/`).
- `TaskSheet` adding `useNavigate` from `react-router-dom` is safe — it is already router-aware (it is rendered inside AppShell which provides the router context).

The plan notes that `ArtifactSection` does not count against the 19-component DS budget — it is a web-package-level composition helper analogous to `ArtifactThreadsSummary`. This categorization is correct based on where the file lives (`packages/web/src/components/`, not `packages/design-system/src/`).

**Score: 10** — clean dependency graph.

### 9. Completeness — 8/10

The plan covers all happy paths, loading, error, and empty states. The AC mapping table covers all 12 ACs. The ordered task list provides a clear implementation sequence. The `@lore` candidates are well-chosen.

**Three gaps:**

1. **WorkBet insertion ambiguity** (same as Correctness finding): The current WorkBet render order is `HostThreadSection` (Discussion) → `ArtifactThreadsSummary`. The plan says to insert `ArtifactSection` "above `ArtifactThreadsSummary`." The brief says the intended order is Tasks → Artifact stack → Artifact thread summary → Discussion. These two specifications produce different orderings. The plan needs to clarify the target line in WorkBet.tsx (currently line 457: `<HostThreadSection>`) and specify that `ArtifactSection` goes BEFORE `HostThreadSection`, not just before `ArtifactThreadsSummary`.

2. **Playwright selector error** (same as Testability finding): `[data-component="ArtifactGalleryCard"]` should be `[data-ds-component="ArtifactGalleryCard"]`. The correct attribute is verified in `ds-attrs.ts` and used in existing e2e tests.

3. **`useArtifacts` hook memoization**: The plan's `buildUrl` function will construct a new URL string on every render if the filter object is reconstructed per render (e.g., `{ axis: "portfolio" }` is a new object reference each time). `useFetch` depends on the URL string — since strings are compared by value in JavaScript, this is actually safe: the same string will not trigger a new fetch. But the plan does not comment on this, and a builder might wonder why there's no `useMemo` on the filter. A note clarifying that `buildUrl` produces a stable string for a given filter is worth adding.

**Score: 8** — complete coverage of ACs; the WorkBet insertion ordering ambiguity and Playwright selector error are the issues that need fixing before the builder can implement without confusion.

---

## Verdict

| Dimension | Score | Pass? |
|-----------|-------|-------|
| Correctness | 8/10 | Yes |
| Simplicity | 9/10 | Yes |
| Consistency | 9/10 | Yes |
| Safety | 9/10 | Yes |
| Testability | 8/10 | Yes |
| Performance | 9/10 | Yes |
| Maintainability | 9/10 | Yes |
| Dependencies | 10/10 | Yes |
| Completeness | 8/10 | Yes |

**All 9 dimensions pass (>=7). Architecture advances to implementation.**

---

## Required Fixes for Builder

The architecture passes but the builder must address these before implementation to avoid introducing defects:

**B-1 (Correctness/Completeness — High):** The WorkBet insertion point is ambiguous. The plan says "insert above ArtifactThreadsSummary" but the brief's intended order (Tasks → Artifact stack → Artifact thread summary → Discussion) requires inserting `ArtifactSection` BEFORE `<HostThreadSection>` (line 457 in WorkBet.tsx), not between `HostThreadSection` and `ArtifactThreadsSummary`. Clarify the target insertion line in the plan or verify directly against WorkBet.tsx before coding.

**B-2 (Testability — High):** The Playwright e2e spec description says to look for `[data-component="ArtifactGalleryCard"]`. The actual attribute is `data-ds-component="ArtifactGalleryCard"` — verified in `ds-attrs.ts` and used correctly in `packages/web/e2e/artifact-aggregation.spec.ts` line 61. Use `[data-ds-component='ArtifactGalleryCard']` in L12 e2e tests.

**B-3 (Maintainability — Medium):** The overflow "View all →" link should not be rendered as a live `<a>` tag when it targets a non-existent page. Render it as a non-interactive element (e.g., a `<span>` or a disabled button) with a `data-testid` and a TODO comment, rather than an anchor that navigates to a 404.

**B-4 (Completeness — Low):** Add a note in `ArtifactSection`'s implementation that `items[0]` access in the `single` layout is only reached when `items.length > 0` — the empty guard runs before the populated render path, so this is safe. A comment prevents future maintainers from adding a redundant undefined check or, conversely, removing the empty check.
