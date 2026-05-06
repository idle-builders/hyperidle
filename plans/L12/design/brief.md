# L12 — Design Brief (Approved)

## Summary

Mount the L3 Artifact view family onto four Work surfaces using the existing DS components. All four surfaces navigate to /artifacts/:id on click. No new components, no modal layer.

## Surface Mounts

### WorkPortfolio
Position: Below the cycle stripe (the existing bottom section), above any future footer.
Layout: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--density-gap)]`
Component per item: `ArtifactGalleryCard` with `onOpen={() => navigate('/artifacts/${id}')}`
Limit: 12 (`limit=12` in the API call)
Section header: `"ARTIFACTS"` — same style as existing portfolio h1 (`text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]`)
Loading: 3× `SkeletonCard` in the same grid
Empty: `EmptyState` with title "No artifacts yet" and description "Artifacts appear here as agents complete tasks."
Error: `ErrorState` with "Could not load artifacts"
Overflow: Plain text row `"View all artifacts →"` — rendered only when `nextCursor !== null` — currently links nowhere (builder adds TODO comment)

### WorkProduct
Position: Last section, below Roster (`aria-label="Artifact aggregation"` replacing the existing placeholder `<section data-testid="product-artifact-slot">`)
Layout: `flex flex-col` (stack)
Component per item: `ArtifactStackItem` with `onOpen={() => navigate('/artifacts/${id}')}`
Limit: 10
Section header: `"ARTIFACTS"` — same h2 style as other product page sections
Loading: 2× `SkeletonCard` at row height
Empty: `EmptyState` title "No artifacts yet" description "Artifacts appear as agents complete tasks for this product."
Error: `ErrorState`
Overflow: `"View all (more) →"` link — rendered only when `nextCursor !== null`

### WorkBet
Position: Between the Tasks table and `ArtifactThreadsSummary` (i.e., insert before line 467 in WorkBet.tsx where ArtifactThreadsSummary is). This gives the order: BetPitch → Tasks → Artifact stack → Artifact thread summary → Discussion.
Layout: `flex flex-col` (stack)
Component per item: `ArtifactStackItem` with `onOpen={() => navigate('/artifacts/${id}')}`
Limit: default 50 (no cap — bets have bounded task sets)
Section header: `"ARTIFACTS"` same h2 style
Loading: 2× SkeletonCard
Empty: `EmptyState` title "No artifacts yet" description "Artifacts appear as agents complete tasks on this bet."
Error: `ErrorState`
Overflow: none (show all)

### TaskSheet
Position: Between the task summary block and the Discussion section header (before the `HostThreadSection` border-b div).
Layout: single `ArtifactPreview` (most recent artifact only)
Component: `ArtifactPreview data={items[0]}`
Limit: 1 (`limit=1`)
Section header: `"ARTIFACT"` — same uppercase mono style as "REQUEST" header in TaskSheet
Loading: 1× SkeletonCard
Empty: section entirely hidden (no header, no EmptyState) — reduces drawer noise
Error: section entirely hidden — same reason
Overflow: If `items.length > 1` (shouldn't happen with limit=1 + nextCursor), ignore. If `nextCursor !== null`, show `"(+ more)"` plain text next to the section header.
Note: ArtifactPreview's 2-column grid (`[@media(min-width:1024px)]:grid-cols-[1fr_320px]`) will render single-column inside the 640px drawer. This is correct behavior — no override needed.

## Navigation Pattern

Every `onOpen` callback:
```
onOpen={() => navigate(`/artifacts/${encodeURIComponent(artifact.id)}`)}
```

Use `useNavigate` from react-router-dom. This is already the pattern in WorkPortfolio (for product cards) and WorkProduct (for bet rows).

## Shared Section Wrapper

A lightweight `ArtifactSection` wrapper component lives in `packages/web/src/components/ArtifactSection.tsx`. It owns the section header, loading/error/empty states, and the scroll container. The page components pass `filter` and `layout` props. This avoids duplicating the loading/error/empty/header logic four times.

This component does NOT count against the 19-component budget — it is a web-package-level container, not a DS component. It is categorized as a page-level composition helper (analogous to `ArtifactThreadsSummary`).

## Component Budget Check

New DS components introduced: 0
DS components reused: ArtifactGalleryCard, ArtifactStackItem, ArtifactPreview, EmptyState, ErrorState, SkeletonCard, SkeletonList
Budget status: Compliant
