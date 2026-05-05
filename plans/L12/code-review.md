# L12 — Code Review

Reviewer: Phase 4. Evaluated against `plans/L12/architecture.md`, `plans/L12/architecture-critique.md`, `plans/L12/design/approved.md`, and `plans/work-packages/TRACK-L.md §L12`.

---

## Diff Scope

Changed files (excluding plans/):
- `packages/web/e2e/L12-artifact-surfaces.spec.ts` (new, 319 lines)
- `packages/web/src/__tests__/TaskSheet.test.tsx` (mock addition)
- `packages/web/src/__tests__/WorkBet.task-sheet.test.tsx` (mock addition)
- `packages/web/src/components/ArtifactSection.stories.tsx` (new, 190 lines)
- `packages/web/src/components/ArtifactSection.tsx` (new, 219 lines)
- `packages/web/src/components/__tests__/ArtifactSection.test.tsx` (new, 354 lines)
- `packages/web/src/hooks/useArtifacts.ts` (extended)
- `packages/web/src/pages/WorkBet.tsx` (ArtifactSection inserted)
- `packages/web/src/pages/WorkPortfolio.tsx` (ArtifactSection inserted)
- `packages/web/src/pages/WorkProduct.tsx` (ArtifactSection inserted)
- `packages/web/src/pages/__tests__/WorkBet.artifact-section.test.tsx` (new)
- `packages/web/src/pages/__tests__/WorkPortfolio.artifact-section.test.tsx` (new)
- `packages/web/src/pages/__tests__/WorkProduct.artifact-section.test.tsx` (new)
- `packages/web/src/shell/TaskSheet.tsx` (ArtifactSection inserted)
- `packages/web/src/shell/__tests__/TaskSheet.artifact-section.test.tsx` (new)
- `packages/web/src/shell/__tests__/TaskSheet.thread.test.tsx` (mock addition)

---

## Lens 1: Architecture

### B-1 (WorkBet insertion order) — APPLIED CORRECTLY

Architecture-critique required ArtifactSection to appear BEFORE `HostThreadSection` (Discussion), not merely above `ArtifactThreadsSummary`. The implementation in `WorkBet.tsx` places ArtifactSection at line 456, followed by `HostThreadSection` at line 468, followed by `ArtifactThreadsSummary` at line 478. Order confirmed correct: Tasks → ArtifactSection → HostThreadSection → ArtifactThreadsSummary.

### B-2 (E2E selector) — APPLIED CORRECTLY

All E2E selectors use `[data-ds-component='ArtifactGalleryCard']`, `[data-ds-component='ArtifactStackItem']`, `[data-ds-component='ArtifactPreview']` — correct per `ds-attrs.ts`.

### B-3 (View all overflow) — APPLIED CORRECTLY

The overflow affordance is rendered as `<span data-testid="artifact-section-view-all">View all</span>` — a non-interactive span with a lore comment marking the TODO. Not an anchor or button. Verified in both implementation and E2E test.

### B-4 (items[0] guard) — APPLIED WITH APPROPRIATE LORE

The empty check runs before the populated branch. The `ArtifactPreview data={items[0]}` access is guarded. A `@lore` comment documents this invariant explicitly.

### Layer integrity — PASS

`ArtifactSection` lives in `packages/web/src/components/` (Human Interface layer), imports DS components from `@hyperidle/design-system` (downward), and calls `useArtifacts` (same layer). No layer violations.

### API contract — PASS

`useArtifacts` extension adds the optional `query?: Pick<ArtifactQuery, "limit">` parameter and correctly appends `&limit=N` to the URL via `buildUrl`. The `ArtifactQuery` type is imported from `@hyperidle/shared`. The portfolio axis (no filter ID) is correctly handled by the existing discriminated union — `{ axis: "portfolio" }` has no extra field.

### WorkPortfolio placement deviation — WARNING

The architecture plan (`architecture.md`) and the approved design (`design/approved.md`) both specify that ArtifactSection should appear **below** the cycle stripe (after `data-testid="cycle-stripe"`). The implementation places it **above** the cycle stripe (lines 164-171 in `WorkPortfolio.tsx`, before line 173 where `cycle-stripe` begins). This is a direct contradiction of the approved design's position table: "Below cycle-stripe."

The visual impact is significant: artifacts appear between the product cards and the cycle context stripe, rather than below it. No test validates the position relative to the cycle stripe.

### TaskSheet placement deviation — WARNING

The architecture plan specifies: "Add an artifact section between the task summary block and the Discussion section — after `<div className='px-4 py-3 border-b ...'>` and **before** the Discussion `<div className='border-b ...'>`."

The implementation places ArtifactSection **after** the Discussion section (after `HostThreadSection` at line 301-302, at line 306-308). The actual order is: Task summary → Discussion (inline thread) → ArtifactSection → Request section.

The approved design table says "Between task summary and Discussion." The implementation puts it after Discussion, not before it. No test verifies the position relative to the Discussion section.

### onOpen contract deviation — OBSERVATION

The architecture plan specifies `onOpen: (artifactId: string) => void` as a **required** prop on `ArtifactSectionProps`. The implementation made it **optional** (`onOpen?: (artifactId: string) => void`) and added an internal `useNavigate` fallback. The approved design says all surfaces provide `onOpen`. The implementation's choice is reasonable (TaskSheet doesn't need to pass `useNavigate` explicitly), and the builder added a `@lore` comment documenting the rationale. This is an acceptable deviation — the contract is met from the caller's perspective.

---

## Lens 2: Design

### States — PASS (mostly)

Loading, error, empty, and populated states are all present and functional. Skeleton counts per layout (gallery=3, stack=2, single=1) match the plan. `SkeletonCard` for gallery/single, `SkeletonList` for stack.

### Error state in TaskSheet — WARNING (design deviation)

The approved design specifies: "Error: ErrorState (or hidden for TaskSheet)." The implementation renders `ErrorState` for all surfaces unconditionally when `error !== null`, regardless of whether `heading` is provided. In TaskSheet (which omits `heading`), a fetch error surfaces an `ErrorState` inside the compact drawer with no heading context. The approved design explicitly permits suppressing the error in TaskSheet.

### Empty state copy — WARNING (design deviation)

The approved design specifies surface-specific empty state descriptions:
- Portfolio: "Artifacts appear here as agents complete tasks."
- Product: "Artifacts appear as agents complete tasks for this product."
- Bet: "Artifacts appear as agents complete tasks on this bet."

The implementation uses a single generic description for all surfaces: "Artifacts will appear here once agents produce output for this context." `ArtifactSection` has no `description` prop to allow surface-specific copy. The approved design was not honored here.

### Stories file — SLOP (significant)

`packages/web/src/components/ArtifactSection.stories.tsx` is named for `ArtifactSection` but does **not import or render `ArtifactSection`**. The stories bypass the component entirely and directly construct layouts using raw DS subcomponents (`ArtifactGalleryCard`, `ArtifactStackItem`, `ArtifactPreview`, `SkeletonCard`, etc.). If a developer opens `/designsystem`, they see manually constructed layouts — not `ArtifactSection`'s actual state machine.

This means the stories do not verify that `ArtifactSection`'s loading/error/empty/populated state machine works — they only show the DS subcomponents in isolation. The architecture plan requirement for stories that show ArtifactSection's states is unmet.

Missing stories per architecture plan:
- `StackEmpty` (EmptyState via stack layout)
- `StackError`
- `SingleEmpty` (renders null — important to document)

### Token compliance — PASS

No hardcoded colors, no off-grid spacing. `var(--density-gap)`, `var(--density-card-pad)`, `var(--text-lo)`, `var(--surface-2)`, `var(--r1)`, `var(--r2)` used throughout. No `rounded-2xl`, no hex colors, no `p-8`.

### Accessibility — PASS

`<section aria-label="...">` wraps all states. `<h2>` heading present when `heading` prop is defined. `SkeletonCard` and `SkeletonList` have `ariaLabel` props set. Focus management is inherited from DS components.

---

## Lens 3: Security

No new API endpoints, no new data writes, no auth boundaries introduced. All data flows through the pre-existing `GET /api/artifacts?axis=...` route. `encodeURIComponent(id)` is correctly applied in the `handleOpen` fallback and `useArtifactOpen`. No `dangerouslySetInnerHTML`, no `eval`, no innerHTML.

The `onOpen` callback receives artifact IDs from server responses — no XSS risk as these are passed to `navigate()`, not rendered as HTML.

---

## Lens 4: Adversarial

### The Saboteur

- ArtifactSection mounts in TaskSheet **after** the Discussion section. The drawer's scroll container (`flex-1 overflow-y-auto` on the Request section) is below ArtifactSection, but ArtifactSection itself is in a `<div className="px-4 py-2">` that is not inside the scrollable region. If ArtifactPreview has content, it renders between Discussion and Request with no scroll — users on small screens may not see it without scrolling the entire dialog, which has `max-h-[85vh]`. This is a layout risk given TaskSheet's compact format.

- `useArtifactOpen` is exported from `ArtifactSection.tsx` alongside `ArtifactSection`. It duplicates the navigate behavior already embedded in `ArtifactSection`'s `onOpen` fallback. The function is called in `WorkPortfolio`, `WorkProduct`, and `WorkBet` via `useArtifactOpen()`, then passed as `onOpen={onOpenArtifact}`. This redundantly creates a navigate callback when `ArtifactSection` already has an internal navigate fallback. Not a bug, but a confusing dual-mechanism.

### The New Hire

- `ArtifactSection` handles 4 states × 3 layouts in a single component with sequential `if` guards. The empty branch uses `!heading` to suppress output (TaskSheet pattern) without a dedicated prop. Someone maintaining this file needs to know the `heading === undefined` contract means "suppress everything" — this is documented via `@lore` comments, which is appropriate.

- `useArtifactOpen` vs. the `onOpen` prop defaulting to `useNavigate` internally: both mechanisms navigate to `/artifacts/:id`. The duplicate mechanisms will confuse future maintainers. The `useArtifactOpen` hook is rendered unnecessary by the internal fallback.

### The Auditor

- Builder claims B-1 through B-4 fixes applied — B-1, B-2, B-3, B-4 all confirmed applied.
- Builder claims `bun run verify` passes (3398 tests, 0 type errors, 0 lint errors) — not independently re-run; taken on faith given the scope.
- No `as` casts, no `any` types, no `@ts-ignore` in the new files.

---

## Lens 5: Simplification

### `useArtifactOpen` hook — REDUNDANT

`useArtifactOpen()` in `ArtifactSection.tsx` (lines 213-218) creates a `useNavigate` callback that calls `navigate('/artifacts/${encodeURIComponent(id)}')`. This is identical to the internal `handleOpen` fallback inside `ArtifactSection` itself. The hook is only useful if a caller wants to use the same navigation without passing it through `onOpen`. But all three consumers (`WorkPortfolio`, `WorkProduct`, `WorkBet`) could simply omit `onOpen` and rely on the internal fallback. The hook adds a second navigation path for no gain over the internal default.

### Duplicated heading `h2` in all three state branches — OBSERVATION

The `h2` heading block is rendered identically in the loading, error, and populated branches of `ArtifactSection`. Extracting it into a local variable or component would reduce duplication. Minor — the current form is readable.

---

## Lens 6: AI Slop

### Stories don't render the component — SLOP

The most significant slop finding: `ArtifactSection.stories.tsx` is a stories file for `ArtifactSection` but doesn't render it. This is a copy-paste-and-adapt pattern that produces a file that looks correct structurally but doesn't exercise the thing it names. A fresh reader opening `/designsystem → ArtifactSection` sees DS primitives, not `ArtifactSection`'s state machine.

### Comments restating code — OBSERVATION (minor)

```tsx
// Default open handler: navigate to /artifacts/:id.
const handleOpen = onOpen ?? ((id: string) => navigate(`/artifacts/${encodeURIComponent(id)}`));
```

The comment restates what the code does. Not blocking.

### `@lore` usage — PASS

The `@lore` annotations correctly document non-obvious decisions (B-3 View-all as span, B-4 items[0] guard, onOpen optional rationale). These are load-bearing comments, not filler.

---

## AC Completeness Audit

| Acceptance Criterion | Status | Evidence / Gap |
|----------------------|--------|----------------|
| Consumes L3 Artifact primitive | PASS | `ArtifactSection` imports `ArtifactGalleryCard`, `ArtifactStackItem`, `ArtifactPreview` from `@hyperidle/design-system`. Vitest confirms DS component selectors render. |
| Artifacts root on tasks; higher surfaces aggregate | PASS | No surface owns artifacts directly; all use `useArtifacts({ axis: ... })` which delegates aggregation to the server-side L3 route. |
| Portfolio → gallery card | PASS | `WorkPortfolio` mounts `ArtifactSection layout="gallery"`. Vitest and E2E confirm `ArtifactGalleryCard` renders. |
| Product → stack | PASS | `WorkProduct` (via `WorkProductLoaded`) mounts `ArtifactSection layout="stack"`. Vitest confirms. |
| Bet → stack item | PASS | `WorkBet` mounts `ArtifactSection layout="stack"` before `HostThreadSection`. Vitest and E2E confirm. |
| Task → single full preview | PASS | `TaskSheet` mounts `ArtifactSection layout="single" limit={1}`. Vitest and E2E confirm `ArtifactPreview` renders. |
| Fetch endpoint wired | PASS | `useArtifacts` hook wired to `GET /api/artifacts?axis=...&limit=N`. E2E uses `page.route` to intercept and confirm the URL pattern. |
| Real artifact data backed by persistence with cost | CONDITIONAL PASS | The component correctly fetches via the L3 endpoint. Cost field is part of the `Artifact` shape and flows through. Whether the server-side data is backed by real persistence with cost is an L3 concern, not L12. |
| Zero hardcoded artifacts on any Work surface | PASS | No `MOCK_ARTIFACT`, `FALLBACK_ARTIFACT` in any runtime page or component introduced by L12. |
| Clicking opens artifact preview | PARTIAL — E2E MISSING | The `onOpen` handler and `useNavigate` are wired. `ArtifactGalleryCard` calls `onClick={onOpen}`. The unit test verifies `mockNavigate` is called. **But the required E2E test is absent**: the spec requires "open Portfolio → click an artifact → preview opens" as a Playwright scenario. The E2E spec only verifies that cards render, not that clicking one navigates to `/artifacts/:id`. This is an explicit AC requirement (TRACK-L.md §L12) and an explicit E2E requirement from the architecture plan. |
| Vitest tests per surface + empty states | PASS | ArtifactSection.test.tsx covers all states and layouts. Per-surface tests in WorkPortfolio.artifact-section.test.tsx, WorkProduct.artifact-section.test.tsx, WorkBet.artifact-section.test.tsx, TaskSheet.artifact-section.test.tsx. |
| Playwright e2e: Portfolio→aggregation→click→preview | FAIL — click→preview step is missing | E2E verifies aggregation renders. Click-to-preview navigation is not tested. |
| Playwright e2e: Bet→aggregation | PASS | E2E test "WorkBet: ArtifactStackItem renders when artifacts exist" confirms. |
| Playwright e2e: Task→artifact | PASS | E2E test "TaskSheet: ArtifactPreview renders when task has artifacts" confirms. |
| bun run check + lint + test all green | PASS (builder-reported) | 3398 tests pass, 0 type errors, 0 lint errors per builder report. |

---

## Summary of Findings

### BLOCKING

**F-1 — E2E click-through test missing (AC: "clicking opens artifact preview")**

The spec's exact AC: "Playwright e2e: open Portfolio → see the artifact aggregation → click an artifact → preview opens." The E2E spec (`L12-artifact-surfaces.spec.ts`) has no test where a `ArtifactGalleryCard` (or `ArtifactStackItem`) is clicked and the resulting URL / `ArtifactPreview` element is asserted. The click path IS wired in code (Vitest unit test verifies `mockNavigate` is called) but the E2E scenario is required by the AC and absent.

File: `/packages/web/e2e/L12-artifact-surfaces.spec.ts`
AC source: `TRACK-L.md §L12`, `architecture.md §Playwright E2E Tests`

### WARNINGS (advisory — not blocking for merge but should be fixed)

**W-1 — WorkPortfolio ArtifactSection above cycle stripe (design deviation)**

Approved design and architecture plan both specify placement below `data-testid="cycle-stripe"`. Implementation places it above. No test verifies position relative to cycle stripe.

File: `/packages/web/src/pages/WorkPortfolio.tsx` lines 164-171

**W-2 — TaskSheet ArtifactSection after Discussion (design deviation)**

Architecture plan specifies placement "between task summary and Discussion." Implementation places it after Discussion (after `HostThreadSection`). The approved design table confirms "Between task summary and Discussion."

File: `/packages/web/src/shell/TaskSheet.tsx` lines 304-308

**W-3 — Error state not suppressed in TaskSheet (design deviation)**

Approved design: "Error: ErrorState (or hidden for TaskSheet)." When `heading` is undefined (TaskSheet), `ErrorState` still renders. The empty check suppresses output for empty data but not for errors.

File: `/packages/web/src/components/ArtifactSection.tsx` lines 116-130

**W-4 — Empty state copy is generic, not surface-specific (design deviation)**

Approved design specifies three different description strings for Portfolio, Product, and Bet. All surfaces receive "Artifacts will appear here once agents produce output for this context." `ArtifactSection` has no `description` prop.

File: `/packages/web/src/components/ArtifactSection.tsx` lines 144-146

**W-5 — Stories bypass ArtifactSection entirely (slop)**

`ArtifactSection.stories.tsx` imports DS subcomponents directly and constructs layouts manually without rendering `ArtifactSection`. The stories document the DS primitives, not the wrapper's state machine. Missing: `StackEmpty`, `StackError`, `SingleEmpty` stories.

File: `/packages/web/src/components/ArtifactSection.stories.tsx`

### OBSERVATIONS (no action required)

**O-1 — `useArtifactOpen` is redundant**

The hook and the internal `onOpen` fallback in `ArtifactSection` are identical. Three callers could omit `onOpen` entirely and get the same behavior. `useArtifactOpen` adds a second navigation path without benefit over the default.

**O-2 — Heading `h2` duplicated across state branches**

Minor readability issue; not a correctness problem.

---

## Verdict

**NOT DONE**

Blocking finding: **F-1** — The required Playwright E2E test for "click artifact → preview opens" is absent. This is an explicit AC requirement from TRACK-L.md §L12 and from the architecture plan's E2E section.

All other findings are warnings and observations. After F-1 is fixed, the warnings (W-1 through W-5) should be addressed: placement deviations (W-1, W-2) affect information hierarchy; error/empty state deviations (W-3, W-4) affect the UX in edge cases; the stories issue (W-5) leaves the component undocumented at `/designsystem`.
