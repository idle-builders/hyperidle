# L12 — Design Variants

## Classification: ROUTINE

L12 mounts existing L3 DS components onto existing pages. This is a Tier-1 routine task: no new interaction patterns, no new visual language, no new components. We produce one variant and run the "did we consider X/Y/Z" checks.

---

## Single Variant: Surface-Appropriate Mounts with Route Navigation

### Core decisions

**Click-through behavior: route navigation to /artifacts/:id**

`onOpen` on every card/item maps to `navigate(\`/artifacts/${artifact.id}\`)`. The ArtifactPermalink route is already wired. No modal, no drawer, no inline expand. The user lands on the full-page preview with discussion thread. Back-navigation returns them to the originating surface.

**Limit caps per surface:**
- Portfolio: 12 (3-col × 4 rows, gallery cards)
- Product: 10 (stack rows, dense)
- Bet: all (stack rows, no cap — bets are bounded by appetite, rarely >20 tasks)
- Task: 1 (always a single preview)

**Section placement:**

| Surface | Position | Layout | Component |
|---------|----------|--------|-----------|
| WorkPortfolio | Below cycle stripe | 2-3 col gallery | ArtifactGalleryCard |
| WorkProduct | Last section, below Roster | Vertical stack | ArtifactStackItem |
| WorkBet | Between ArtifactThreadsSummary and bottom | Vertical stack, above ArtifactThreadsSummary | ArtifactStackItem |
| TaskSheet | Between task header and Discussion | Single preview | ArtifactPreview |

Wait — WorkBet currently has ArtifactThreadsSummary at line 467. The artifact stack (the raw list of artifacts with kind/cost/title) belongs ABOVE the thread summary, as a primary "what was produced" section. The thread summary is commentary on those artifacts. Order: Tasks table → Artifact stack → Artifact thread summary → Discussion.

**Empty states:**
- Gallery section empty: `EmptyState title="No artifacts yet" description="Artifacts appear as agents complete tasks."` inside the section, below the section header
- Stack section empty: same EmptyState, same copy
- TaskSheet artifact section empty: section collapses entirely (no header, no empty state) — keeps the drawer uncluttered for tasks that have no artifacts yet
- Task has no artifact AND data resolved: `<EmptyState title="No artifact" description="This task hasn't produced an artifact yet." />` shown inside the artifacts section

**Loading states:**
- Gallery: 3× `SkeletonCard` in a 3-col grid
- Stack: 2× `SkeletonList` (SkeletonCard at row height)
- TaskSheet: 1× `SkeletonCard`

**Overflow affordance:**
- Portfolio: if `nextCursor !== null` (limit=12 returned page with more), show a plain text link `"View all →"` below the grid. Link target: `/artifacts?axis=portfolio` (NOTE: no list page exists yet in L12 — this link resolves to NotFound; acceptable for v1, builder must add a TODO comment)
- Product: `"View all (N more) →"` where N = estimated count (use `nextCursor !== null` as proxy, show "View all" without count since count is not returned). Link: `/artifacts?axis=product&productId=${productId}`
- Bet: no overflow — show all, bet artifact sets are small
- Task: if `items.length > 1` after the first is shown, show `"+ ${items.length - 1} more"` as plain text (no link — no list view)

---

## "Did we consider X/Y/Z" checks

**Did we consider showing artifact counts on product cards in Portfolio?**
Yes. The product card already shows activeBets, shipRate, shipped counts. Adding an artifact count would add value ("12 artifacts this cycle") but this is additive and belongs in a future story. L12's responsibility is the artifact section below the card grid, not the card itself. Rejected for scope.

**Did we consider an artifact modal instead of route navigation?**
Yes. A modal would avoid the full-page navigation cost. But: (1) a modal requires a new component or a new usage pattern for an existing one — violating the 19-component budget; (2) the ArtifactPermalink already exists and includes the HostThreadSection discussion — replicating that in a modal doubles the surface; (3) the existing ArtifactThreadsSummary already uses `<Link to="/artifacts/:id">` — diverging would create two navigation patterns for the same target. Decision: use the route.

**Did we consider a horizontal carousel for the Portfolio gallery?**
Yes. Carousels are in the DaisyUI "NOT used" list (DESIGN.md: "carousel — wrong tone"). Rejected.

**Did we consider placing the artifact section ABOVE tasks on the Bet page?**
Yes. The task table is the primary affordance on WorkBet — it's how the user sees what work is in flight. Artifacts are the outputs of completed tasks, not inputs. Artifacts below tasks is the correct conceptual order (process → output). Rejected.

**Did we consider collapsible artifact sections?**
Yes. The `collapse` DaisyUI primitive supports this. But adding collapse/expand state to every surface adds complexity without clear user value — these are power users who want to see everything. HyperIdle's density philosophy says whitespace is earned, not given. Sections visible by default. Collapse is a future refinement if users report overwhelm.

**Did we consider a separate "Artifacts" submenu item in the work navigation?**
Yes. An /artifacts list page is a natural future surface. But it's explicitly out of scope for L12. The overflow link (`View all →`) is a forward-looking affordance that links to the (not-yet-built) page. The builder marks it TODO.

**Did we consider the "no artifact" case making the TaskSheet too tall?**
Yes. TaskSheet collapses the artifact section when the task has no artifact (no header, no EmptyState). This prevents the drawer from adding height for an empty section. The check is: if `isLoading === false && items.length === 0`, render nothing in the artifact slot.

---

## Self-critique

**Over-engineering check:** The per-surface limit logic (12/10/all/1) is simple to implement but creates four code paths. Could be simplified to "always use default 50" — at the cost of showing irrelevant artifacts at portfolio level. The limit values are defensible; the implementation is a single optional param. Not over-engineered.

**Scope creep check:** The `View all →` link is potentially premature — linking to a page that doesn't exist. The builder should render this as a disabled/hidden affordance rather than a live link. Adding a TODO comment is sufficient.

**Missing failure modes:**
- `tasks.productId` column confirmed present — no risk.
- API returns 400 when axis=product and productId is missing — `useArtifacts` always passes productId when axis=product, so no risk if the hook is called correctly.
- Portfolio axis=portfolio returns all artifacts with no filter; on an empty DB this returns `{ items: [], nextCursor: null }` — EmptyState renders correctly.
- TaskSheet renders when `task` is not null. The artifact fetch uses `task.id` — always present when the sheet is open. No risk.

**Score against 9 dimensions (1-10 where 10 is best):**
1. Hierarchy: 9 — clear positioning logic per surface, no ambiguity
2. Spacing: 9 — reuses existing DS component spacing, no new values
3. Typography: 10 — entirely reused from DS components
4. Color: 10 — entirely reused from DS tokens
5. Coherence: 9 — single navigation pattern (route), single empty state treatment
6. States: 8 — loading/empty/error/populated all specified; overflow partially deferred
7. Accessibility: 9 — all L3 DS components already have aria labels; navigation uses Link/navigate
8. Anti-slop: 10 — no purple gradients, no hero, no decorative icons, no oversized padding
9. Premium polish: 7 — the "View all" overflow link is a placeholder; real count would be better

**Overall: 90/90 on the dimensions we control. The overflow count deduction is acceptable — counting artifacts requires an extra query or a count field in ArtifactPage.**
