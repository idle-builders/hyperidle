# L12 — Design Critique

Reviewer: Phase 2 evaluation. Evaluated against `plans/L12/design/variants.md` and `plans/L12/design/brief.md`. Codebase verified: `useArtifacts.ts`, `WorkPortfolio.tsx`, `WorkProduct.tsx`, `WorkBet.tsx`, `TaskSheet.tsx`, `router.tsx`, all DS artifact components.

---

## Dimension Scores

### 1. Hierarchy — 9/10

Visual weight distribution is correct across all four surfaces. Gallery card (portfolio) carries the highest information density with preview surface + cost + timestamp. Stack item (product/bet) is deliberately compact at 44px row height. Single preview (task) is the heaviest representation and appears only in the most specific context. Section headers use the established uppercase mono chrome style (`text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)]`) consistent with every other section on the same pages. The one minor issue: the brief specifies `"ARTIFACT"` (singular) for TaskSheet but does not render the heading at all when empty — the heading-suppression logic is sound but the inconsistent singular/plural between surfaces (ARTIFACT vs ARTIFACTS) is a minor coherence gap, not a hierarchy problem.

**Score: 9** — hierarchy logic is correctly matched to surface context.

### 2. Spacing — 9/10

The design reuses `var(--density-gap)` for the gallery grid and `flex flex-col` (gap-free, height-driven) for stack items, which matches the AQ-002 density token mandate. The ArtifactSection wrapper component introduces no new spacing values — it delegates to the DS component itself. The 3× SkeletonCard and 2× SkeletonCard loading states match the visual density of populated states (3-col gallery, 2-row stack). No hardcoded pixel values introduced in the surface mounts themselves.

**Score: 9** — compliant with AQ-002; no off-grid values introduced.

### 3. Typography — 10/10

Zero new typography decisions. Section headers reuse the established uppercase mono style already in WorkPortfolio (`text-sm font-heading font-semibold uppercase tracking-wider`). All inner type is provided by ArtifactGalleryCard, ArtifactStackItem, ArtifactPreview — DS components that were already typographically reviewed in L3. ArtifactSection adds no new font-size, weight, or tracking values.

**Score: 10** — entirely delegated to existing DS components.

### 4. Color — 10/10

No new color values. The design specifies `EmptyState`, `ErrorState`, and `SkeletonCard` — all existing DS components. The overflow "View all →" link is plain text at `text-[var(--text-lo)]` — same treatment as other secondary links in the codebase. No hex, no RGB, no raw Tailwind palette colors introduced.

**Score: 10** — fully token-compliant.

### 5. Coherence — 8/10

The navigation pattern is consistent: every `onOpen` maps to `navigate('/artifacts/${encodeURIComponent(id)}')`. The section header style is consistent across all four surfaces. The shared `ArtifactSection` wrapper enforces the loading/error/empty/populated state machine in one place. The gap: the overflow affordance takes three different forms — "View all artifacts →" (portfolio), "View all (more) →" (product, without count), no overflow (bet), and "(+ more)" plain text next to the header (TaskSheet). The brief documents rationale for each, but a user scanning across surfaces would see inconsistent overflow signals. This is a minor coherence issue; the design explains the differences defensibly.

**Score: 8** — overflow treatment is inconsistent across surfaces, though each divergence is explained.

### 6. States — 9/10

All required states are specified per surface:
- Loading: SkeletonCard(s) at the right count per layout
- Error: ErrorState with message
- Empty: EmptyState with surface-specific copy (or null for TaskSheet)
- Populated: correct DS component per layout
- Overflow: "View all →" affordance when `nextCursor !== null`

The one gap: the brief specifies TaskSheet error state as "section entirely hidden" (`render nothing`). This means an API failure on the task artifact fetch is silently swallowed — the user sees nothing and has no indication an artifact should exist. This is acceptable for a compact drawer (as the brief argues), but it is a deliberate omission worth flagging. The rationale is stated; the reviewer accepts it.

**Score: 9** — all states covered; TaskSheet silent-error is a known, accepted trade-off.

### 7. Accessibility — 8/10

Positive findings:
- `<section aria-label="Artifacts">` wrapper on ArtifactSection
- All DS components (ArtifactGalleryCard, ArtifactStackItem) have focus rings via `focus:outline focus:outline-2 focus:outline-[var(--primary)]`
- Navigation uses `navigate()` which produces real `<a>` elements via react-router
- `useNavigate` in TaskSheet is a safe addition — TaskSheet already renders inside AppShell which provides the router context

Gap: The architecture specifies `<section aria-label="Artifacts">` as a static label across all four surfaces. A screen reader navigating WorkBet, which already has `<section aria-label="Artifact discussion">` (ArtifactThreadsSummary), will encounter two artifact-related landmark sections with related but different labels ("Artifacts" vs "Artifact discussion"). This is manageable but not ideal. A more specific label per surface (e.g., "Bet artifacts") would be better for screen reader landmark menus.

Gap: The overflow link ("View all →") targets a not-yet-built page. The brief says the builder adds a TODO comment. A disabled or `aria-disabled` affordance would be more accessible than a live link to `/404`. The design accepts this as a v1 limitation.

**Score: 8** — accessibility is mostly solid; static `aria-label="Artifacts"` on section and dead overflow links are the main gaps.

### 8. Anti-slop — 10/10

No purple gradients, no hero sections, no decorative icons, no oversized padding. The design is compositional rather than inventive — it mounts existing DS components with the minimum necessary wrapper. The "View all →" overflow link is plain text, not a styled button or pill. This is precisely the "precision instrument aesthetic" mandated by the design system.

**Score: 10** — clean, no AI-aesthetic tells.

### 9. Premium Polish — 8/10

The design is functionally complete and consistent. The lower score reflects two limitations:

1. The overflow affordance for WorkProduct says "View all (more) →" without an actual count. The brief acknowledges the API does not return a total count; the fallback copy is honest but less useful than a count would be. This is a backend limitation, not a design failure, but it affects perceived polish.

2. The `TaskSheet` "ARTIFACT" section heading with `(+ more)` plain text next to it is not the cleanest treatment for a multi-artifact task. The design argues tasks should have at most one artifact (limit=1), so this case should rarely occur, but the visual treatment of `"(+ more)"` is not polished.

3. The "View all →" link targeting a non-existent page is a forward-looking affordance that will confuse users who click it in v1. The brief documents this; it is a deliberate trade-off.

**Score: 8** — polish is high on the happy path; the deferred affordances reduce it.

---

## Verdict

| Dimension | Score | Pass? |
|-----------|-------|-------|
| Hierarchy | 9/10 | Yes |
| Spacing | 9/10 | Yes |
| Typography | 10/10 | Yes |
| Color | 10/10 | Yes |
| Coherence | 8/10 | Yes |
| States | 9/10 | Yes |
| Accessibility | 8/10 | Yes |
| Anti-slop | 10/10 | Yes |
| Premium Polish | 8/10 | Yes |

**All 9 dimensions pass (>=7). Design advances to implementation.**

---

## Items for Builder to Note

1. The overflow "View all →" link must have a TODO comment noting the target page does not exist in L12 — do not render as a live anchor; render as a disabled/inert affordance or omit it.
2. The `aria-label="Artifacts"` on the section wrapper should ideally be surface-specific (e.g., "Portfolio artifacts", "Bet artifacts") to prevent landmark collision with ArtifactThreadsSummary's "Artifact discussion" section on WorkBet.
3. TaskSheet: the `(+ more)` overflow text is intentionally plain — do not elevate it to a link.
4. The `useNavigate` import added to TaskSheet is safe — TaskSheet renders inside the router-provided AppShell tree.
