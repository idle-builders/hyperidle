# L12 — Design Approved

Variant: "Surface-Appropriate Mounts with Route Navigation" (single variant, Tier-1 routine classification).

Approved by Reviewer after design-critique (all 9 dimensions >= 7/10).

## What is Approved

### Surface Mounts

| Surface | Position | Layout | DS Component | Limit |
|---------|----------|--------|-------------|-------|
| WorkPortfolio | Below cycle-stripe | 3-col gallery | ArtifactGalleryCard | 12 |
| WorkProduct | Replace placeholder section | Vertical stack | ArtifactStackItem | 10 |
| WorkBet | Before HostThreadSection (Discussion) | Vertical stack | ArtifactStackItem | default (50) |
| TaskSheet | Between task summary and Discussion | Single preview | ArtifactPreview | 1 |

**WorkBet clarification (from architecture-critique B-1):** ArtifactSection goes BEFORE `<HostThreadSection>`, not merely "above ArtifactThreadsSummary." The intended page order is: BetCard → BetPitch → Tasks → ArtifactSection → HostThreadSection (Discussion) → ArtifactThreadsSummary.

### Navigation Pattern

All surfaces: `onOpen={(id) => navigate('/artifacts/${encodeURIComponent(id)}')}`

### Shared Component

`ArtifactSection` wrapper in `packages/web/src/components/ArtifactSection.tsx` — not a DS component, not counted against the 19-component budget.

### States

- Loading: SkeletonCard(s) — 3/gallery, 2/stack, 1/single
- Error: ErrorState (or hidden for TaskSheet)
- Empty: EmptyState with surface-specific copy (or hidden for TaskSheet)
- Overflow: plain text row "View all →" — rendered as non-interactive (see below)

### Overflow Treatment (amended)

Per design-critique and architecture-critique: the "View all →" overflow affordance must NOT be rendered as a live anchor pointing to a non-existent page. Render it as a non-interactive `<span>` or disabled element with a TODO comment marking it for when the artifacts list page ships.

### Empty State Copy

| Surface | Title | Description |
|---------|-------|-------------|
| Portfolio | "No artifacts yet" | "Artifacts appear here as agents complete tasks." |
| Product | "No artifacts yet" | "Artifacts appear as agents complete tasks for this product." |
| Bet | "No artifacts yet" | "Artifacts appear as agents complete tasks on this bet." |
| Task | (hidden) | (hidden) |

### Accessibility

- `<section aria-label="Artifacts">` on ArtifactSection — builder may use surface-specific labels (e.g., "Portfolio artifacts") to avoid landmark collision with ArtifactThreadsSummary's "Artifact discussion" section on WorkBet.
- All DS components carry focus rings via `focus:outline focus:outline-2 focus:outline-[var(--primary)]`

## What is Not Approved

- Any modal or drawer alternative to route navigation
- Horizontal carousel (DaisyUI "NOT used" list)
- Artifact count badge on product cards (future story scope)
- Collapsible sections (future refinement)
- A live overflow link to a non-existent page

## Critique Scores

| Dimension | Score |
|-----------|-------|
| Hierarchy | 9/10 |
| Spacing | 9/10 |
| Typography | 10/10 |
| Color | 10/10 |
| Coherence | 8/10 |
| States | 9/10 |
| Accessibility | 8/10 |
| Anti-slop | 10/10 |
| Premium Polish | 8/10 |
