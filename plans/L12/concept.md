# L12 — Concept: Artifact View Family Across Work Surfaces

## What L12 Is

L12 is a consumer story. The Artifact primitive (DB schema, types, API, DS components, hooks) exists and is complete from L3. L12 answers a single question: **where on each Work surface does the artifact section go, and what does it look like?**

It is not a new primitive. It does not invent new layouts. It mounts existing L3 components (ArtifactGalleryCard, ArtifactStackItem, ArtifactPreview) onto four existing surfaces (Portfolio, Product, Bet, TaskSheet) using existing hooks (useArtifacts) and routes (/artifacts/:id).

---

## Concept Gaps Probed

### 1. What is "aggregation" at each level?

The AC says "artifacts root on tasks; higher-level surfaces aggregate from tasks." This is already implemented at the API layer: `GET /api/artifacts?axis=bet&betId=X` fans out through tasks on the server. The UI does not need to know the join strategy — it calls the hook with the right axis.

**Resolution:** No concept gap. The aggregation contract is the hook's filter axis. The builder calls:
- Portfolio: `useArtifacts({ axis: "portfolio" })`
- Product: `useArtifacts({ axis: "product", productId })`
- Bet: `useArtifacts({ axis: "bet", betId })`
- Task: `useArtifacts({ axis: "task", taskId })`

### 2. How many artifacts does Portfolio show?

The AC says Portfolio shows "artifact aggregation." The API defaults to 50 items. A Portfolio may have hundreds of artifacts across all tasks across all products. Showing all is noisy. Showing zero by default defeats the purpose.

**Decision:** Portfolio shows the 12 most recent artifacts (default limit=12 call), displayed as a gallery grid (2-3 columns depending on viewport). A "View all" link navigates to a future /artifacts list page (out of scope for L12 — the link is omitted if no such route exists, or we link to `/artifacts?axis=portfolio`). This limit is set via the `limit` query param — `useArtifacts` already passes it through `ArtifactQuery`.

Wait — checking `useArtifacts`: the hook calls `buildUrl(filter)` which does NOT accept a limit param yet. The hook's FetchState does not forward ArtifactQuery. This is a gap: the builder must add limit support to `useArtifacts` or accept the 50-item default. Given Portfolio needs a visual cap at 12, the builder should pass `limit=12` for portfolio and product surfaces. The cleanest approach is to add an optional `query` param to `useArtifacts`.

**Resolution:** `useArtifacts(filter, query?)` — builder adds optional `ArtifactQuery` to the hook signature and passes `limit` in the URL. This is a small hook extension, not a new primitive.

### 3. Is the click-through a route (/artifacts/:id) or a drawer/modal?

**The route already exists.** `ArtifactPermalink` is mounted at `/artifacts/:id` and already renders `ArtifactPreview` + `HostThreadSection`. The router is wired. The `ArtifactGalleryCard` and `ArtifactStackItem` already accept an `onOpen: () => void` callback.

**Decision: Use the existing route.** `onOpen` navigates to `/artifacts/${artifact.id}` via React Router's `useNavigate`. This keeps state out of the page components, avoids a modal layer, and reuses existing permalink infrastructure. A modal/drawer would require a new component (violating the 19-component budget) and would duplicate the ArtifactPreview rendering context.

**Rejection list for click-through:**
- NOT a modal — no new component, no portal management, no focus-trap duplication.
- NOT a slide-over drawer — same reasons. TaskSheet exists as a drawer; adding a second is scope creep.
- NOT an inline expand — the preview surface is large (24px padding, 2-column grid); inline expand inside a gallery card breaks the grid.

**Confirmation:** ArtifactThreadsSummary already uses `<Link to={/artifacts/${summary.artifactId}}>` for the same navigation intent. This is the established pattern.

### 4. How does TaskSheet surface the artifact?

The AC says: "Task detail (TaskSheet) → single full preview." The TaskSheet is a right-anchored drawer (~640px max). It currently has: task header, discussion (HostThreadSection), and request form. The artifact section goes between the task header and the discussion, as a scrollable section.

The layout must fit inside the drawer's `flex-col overflow-y-auto` scroll container. `ArtifactPreview` renders at `p-[24px]` in a 2-column grid at viewport >= 1024px. Inside a 640px drawer, it will be single-column. This is fine — the ArtifactPreview component uses responsive grid (`[@media(min-width:1024px)]:grid-cols-[1fr_320px]`), so inside the narrower drawer it degrades gracefully to 1 column.

**Decision:** TaskSheet gets an "Artifacts" section between the task header and the discussion. It shows at most 1 artifact using `ArtifactPreview` (the task's most recent artifact, since tasks typically produce 0 or 1 artifacts). If the task has more than 1, show a "N more" count with a link. `useArtifacts({ axis: "task", taskId: task.id })` — use the first item from the page.

**Rejection:** Do NOT use `ArtifactStackItem` inside TaskSheet — the stack is for bet-level aggregate lists. The task surface should show the full preview, per the AC spec.

### 5. What is an "artifact section" on a surface that has zero artifacts?

Empty state is specified in AC: "a clear placeholder shows; never a fake thumbnail." The existing `EmptyState` component handles this. The section header should NOT render when there are zero artifacts AND the loading state is past — it should either show the EmptyState, or hide entirely (designer call in design phase). Given HyperIdle's density philosophy, hiding the section when empty is the more purposeful choice (no whitespace placeholder sections).

**Decision:** The artifact section renders only when data is loaded. During loading, a SkeletonCard shows. On empty, the section header shows with an EmptyState message. On error, ErrorState shows. The section is always present as a DOM node (for test assertions) but visually minimal in the empty case.

### 6. Does the Product page use gallery or stack?

The AC says "gallery or stack" for the Product page. Gallery (ArtifactGalleryCard in a 2-3 col grid) is consistent with what Portfolio uses. Stack (ArtifactStackItem in a vertical list) is denser, better for a surface that already has a lot of content (roster, bets, burn). The Product page is content-dense. The stack layout is the better fit — it uses less vertical space and the page already uses vertical sections.

**Decision:** Product page uses stack (ArtifactStackItem) for the artifact section, capped at 10 items with a link for overflow. This is more coherent with the "dense, purposeful" aesthetic.

---

## What L12 Is NOT

- Not a new primitive
- Not a new DS component (all four views already exist)
- Not an artifact list page (/artifacts) — that is out of scope
- Not a "show all" infinite scroll — pagination is a future story
- Not a modal/drawer for artifact preview — route already exists
- Not an artifact creation UI — artifacts are agent-produced

---

## Vocabulary

- **Surface mount**: the section on a page that renders an artifact view family component
- **Filter axis**: the `ArtifactFilterAxis` discriminant (`task | bet | product | portfolio`) that parameterises the API call
- **Aggregation**: the server-side fan-out from bets/products/portfolio down to tasks, transparent to the UI
- **Gallery section**: a component that renders ArtifactGalleryCard items in a 2-3 column grid
- **Stack section**: a component that renders ArtifactStackItem rows in a vertical list
- **Limit cap**: the per-surface upper bound on how many artifacts to show before overflow affordance

---

## Open Risks

1. `useArtifacts` does not currently accept a `query` object for `limit`. The builder must extend the hook signature (1-line change) or the default 50-item response will render on every surface. Risk: low — trivial fix.
2. TaskSheet does not accept `taskId` as a typed param for triggering the artifact fetch — the task object has `task.id` already available. Risk: none.
3. The `tasks.productId` column on the server side (used by axis=product) must be populated. If tasks don't have a productId foreign key in the DB schema, the product aggregation will always return empty. This is an L3/L13 data-model dependency that should be verified by the builder before writing tests.
