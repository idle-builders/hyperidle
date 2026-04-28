# L3 — Artifact Primitive — Approved Design

**Step.** /design Phase 5 — final approved design.
**Pick.** Synthesis of Variant B + Variant C's first-class sub-primitives. See `synthesis.md`.

---

## 1. Component contract

The L3 Artifact primitive ships **eight new exports**:

### Tier 2 — four top-level layout components (one per closed view-family layout)

```ts
type ArtifactData = {
  id: string;                  // opaque, immutable
  producingTaskId: string;     // immutable
  producingTaskTitle: string;  // denormalised onto fetch response
  kind: ArtifactKind;          // 12 canonical + catch-all (architect closes)
  preview: ArtifactPreview | null;        // discriminated union by kind; null until rendered
  cost: { money: string | null; tokens: string | null };  // null until session settles
  createdAt: string;           // ISO
};

type ArtifactState = 'populated' | 'loading' | 'error';

interface ArtifactGalleryCardProps {
  data: ArtifactData;
  state?: ArtifactState;            // default 'populated'
  threadCount?: number;             // chip shown only when > 0
  onOpen: () => void;
}

interface ArtifactStackItemProps {
  data: ArtifactData;
  state?: ArtifactState;
  threadCount?: number;
  onOpen: () => void;
}

interface ArtifactPreviewProps {       // single_full_preview
  data: ArtifactData;
  state?: ArtifactState;
  discussion?: ReactNode;            // L11/L1 thread surface mounts here
  actions?: ReactNode;               // optional kebab/open-in-pane affordances
}

interface ArtifactEmbedProps {        // review_message_embed
  data: ArtifactData;
  state?: ArtifactState;
  onOpen: () => void;                // mounted to the → arrow only
}
```

### Tier 1 — four reusable sub-primitives

```ts
interface ArtifactKindBadgeProps { kind: ArtifactKind; }

interface ArtifactCostChipProps {
  cost: { money: string | null; tokens: string | null };
  variant?: 'full' | 'compact';      // 'full' shows tokens; 'compact' shows money only
}

interface ArtifactTimestampProps {
  value: string;                     // ISO
  format?: 'relative' | 'absolute';  // default 'relative'
}

interface ArtifactPreviewSurfaceProps {
  kind: ArtifactKind;
  preview: ArtifactPreview | null;   // null → renders PREVIEW PENDING placeholder
  size: 'gallery' | 'full';
}
```

The view family is closed at four top-level components. There is no `ArtifactWhatever` for any other layout. Adding one requires updating §4.5 of the concept doc *first*.

---

## 2. Visual specification (per layout)

### `ArtifactGalleryCard`

- Outer: `--surface-4` background, `--r2` (8px), `--density-card-pad` (12px default).
- Layout: flex column with `--density-card-gap` (8px) between sections.
  1. Header: `<ArtifactKindBadge>` + dot separator + `producingTaskTitle` (truncated, mono 11px `--text-mid`, `--tracking-caps`).
  2. Title: derived from `kind + preview` (e.g. file path for `code_diff`, subject for `drafted_email`). 15px / 500 weight / `--text-hi` / max 2 lines truncated.
  3. `<ArtifactPreviewSurface size="gallery" />` — fixed 96px tall, kind-specific render, `--surface-3` inner background.
  4. Footer: `<ArtifactCostChip variant="full" />` + dot + `<ArtifactTimestamp />` on the left; thread-count pill (`<span class="thread-pill">` rendering "N threads" or "N" when space-constrained) on the right when count > 0.
- Interaction: hover ramps `--surface-4 → --surface-5` via `--motion-fast`. Focus: `outline: 1px solid var(--primary); outline-offset: -1px`. Click anywhere on the card calls `onOpen`. Keyboard: `Enter` / `Space`.
- Width: not constrained by component; consumers use 240–320px columns.

### `ArtifactStackItem`

- Outer: NO background fill (parent `Stack` surface owns the surface). Height `--density-row-h` (44px default). Padding `--density-pad-x` horizontally.
- Single horizontal row:
  - Left cluster: `<ArtifactKindBadge>` + `producingTaskTitle` (mono 11px `--text-mid`, max-width 200px, truncated) + derived title (14px / 500 / `--text-hi`, flex-grow, truncated).
  - Right cluster: optional thread-count pill (compact, just the number) + `<ArtifactCostChip variant="compact" />` + dot + `<ArtifactTimestamp />`.
- Interaction: hover background `--surface-4`. Click anywhere on the row calls `onOpen`.
- No preview surface in this layout — the row is a list item; preview lives on the permalink.

### `ArtifactPreview` (single_full_preview)

- Outer: `--surface-3` background, `--r2`, 24px page-gutter padding.
- Two-column grid: 1fr / 320px. Discussion sidebar drops below body at viewport < 1024px.
- Header (full-width):
  - Meta row: `<ArtifactKindBadge>` + dot + producing-task title + `<ArtifactCostChip>` + `<ArtifactTimestamp>` + ID truncated (mono `--text-lo`, right-aligned).
  - Title row: derived title at `--density-text-h2` (20px default) / 600 / `--text-hi` / `--leading-heading`.
- Body (left column): `<ArtifactPreviewSurface size="full" />` — for kinds whose preview maps cleanly to an `ArtifactView` shape (code_diff → text_diff, dashboard → data_metrics, deck → content_preview, etc.), this delegates internally to `ArtifactView`. For other kinds, renders a kind-specific preview at full width.
- Discussion (right column): `discussion` slot. L1 thread surface from L11 mounts here. Renders an empty state ("No threads") when slot is undefined.
- Interaction: no chrome motion; sub-elements own their own.

### `ArtifactEmbed`

- Outer: NO background, NO border, NO radius, NO padding contributed by the embed itself. The surrounding review-message container owns the chrome.
- Two parts, separated by 4px gap:
  1. Identity strip (single line, mono 11px `--text-lo`, `--tracking-caps`, wrapping at the natural width):
     - `<ArtifactKindBadge>` + dot + producing-task title + dot + `<ArtifactCostChip>` + dot + `<ArtifactTimestamp>` + (right-aligned) `→` open arrow with `aria-label="Open artifact"`, `role="button"`.
  2. Delegated `<ArtifactView>` mount with shape derived from `getArtifactViewProps(artifact)`.
- Interaction: identity strip is non-interactive (the `→` arrow is the only affordance); arrow click calls `onOpen`. ArtifactView owns its preview hover state.
- Lint guard (eventual): `ArtifactEmbed` root className must not contain `bg-`, `border-`, `rounded-`, `shadow-`.

---

## 3. States — every layout, every state

| Layout | Populated | Loading (skeleton) | Error | No-preview placeholder | Cost-pending |
|---|---|---|---|---|---|
| `ArtifactGalleryCard` | Default render. | Full card silhouette: header skeleton (16px), title 2-line skeleton, 96px preview-surface skeleton, footer skeleton (1 line). All `skeleton-pulse`. | Header + title render. PreviewSurface renders inline error block: `--text-mid` 13px "Preview unavailable" + small text-button "Retry". Footer renders. | PreviewSurface renders the placeholder. | Cost-chip renders `—`. |
| `ArtifactStackItem` | Default render. | Single-row skeleton at `--density-row-h`. | Renders normally; no preview means no fallback. Error is silent on stack items. | n/a (no preview). | Cost-chip renders `—`. |
| `ArtifactPreview` | Default render. | Header skeleton (2 rows) + body skeleton (5 lines). | Header renders; body shows large error block with retry button. | PreviewSurface renders the full-size placeholder (≥240px tall). | Cost-chip renders `—`. |
| `ArtifactEmbed` | Default render. | Identity-strip skeleton + ArtifactView's own skeleton. | Identity strip renders; ArtifactView shows its own error. | Identity strip renders; ArtifactView shows its own placeholder, OR (when ArtifactView itself has no preview) ArtifactPreviewSurface placeholder is rendered as fallback. | Cost-chip renders `—`. |

**No-preview placeholder spec:** `--surface-3` filled box at the same dimensions as the populated preview. Centered mono uppercase 11px `--text-lo` text "PREVIEW PENDING" (gallery) or "PREVIEW NOT YET RENDERED" (single_full_preview). No icon, no shimmer, no gradient. (Hard rule #4: no fake thumbnails.)

**Cost-pending spec:** Em-dash `—` displayed in the cost slot. Never `$0.00`. Aligns with L4's "render — not a fake number" discipline.

---

## 4. Behavior, motion, keyboard, focus

- **Click-to-open.** GalleryCard / StackItem: clickable everywhere. Embed: only the `→` arrow.
- **Hover.** Card and row use `--surface-4 → --surface-5` (card) or transparent → `--surface-4` (row) via `--motion-fast` (80ms). Embed has no hover state on the identity strip; ArtifactView owns preview hover.
- **Focus ring.** `outline: 1px solid var(--primary); outline-offset: -1px` per `BetCard.html` precedent.
- **Keyboard.**
  - `Enter` / `Space` opens the focused gallery card or stack item.
  - `J`/`K` row navigation: delegated to the parent list (Stack, Kanban) — not Artifact's responsibility.
  - Embed `→` arrow: focusable, `Enter` / `Space` activates.
- **Motion tokens.** Every transition uses `--motion-fast/medium/slow` + `--motion-ease`. Skeleton uses the existing `skeleton-pulse` keyframe. No bare `duration-[Nms]`.
- **Reduced motion.** Inherits the `prefers-reduced-motion` block in `tokens.css`.
- **Animated properties.** `transform`, `opacity`, `background` only (per AQ-014).

---

## 5. Mobile adaptation

| Layout | < 1024px (auto-density flips to comfortable) | < 640px | < 480px |
|---|---|---|---|
| `ArtifactGalleryCard` | pad 12→16px; title font scales | parent grid drops to 1 column; card is full-bleed | thread-pill drops to footer right edge; cost-chip stays inline |
| `ArtifactStackItem` | row 44→56px; pad scales | – | right cluster wraps two-line: timestamp under cost |
| `ArtifactPreview` | discussion sidebar drops below body | header meta row wraps | – |
| `ArtifactEmbed` | inherits review-message container | inherits | inherits |

Touch targets satisfy AQ-015 (≥ 44 CSS px) at every viewport.

---

## 6. The `kind` enum and per-kind preview render

Twelve canonical kinds + catch-all. ArtifactPreviewSurface dispatches by kind:

| kind id | Display label | Preview surface |
|---|---|---|
| `code_diff` | CODE DIFF | mono diff: file path + 3–5 hunks; `+` lines on `color-mix(--ok 14% transparent)`; `−` lines on `color-mix(--danger 14% transparent)`; ctx in `--text-mid` |
| `deck` | DECK | mono first line `Slide 1 of N · M sections`; body 13px deck title |
| `contract` | CONTRACT | mono first line: parties; body 13px contract title |
| `dashboard` | DASHBOARD | 3-row mini-KPI list; mono uppercase label left, tabular-nums value right |
| `screenshot` | SCREENSHOT | image when populated; else placeholder |
| `drafted_email` | DRAFTED EMAIL | mono `To` / `Subj` / `Body` 3-row excerpt |
| `design` | DESIGN | image when populated; else placeholder |
| `data_analysis` | DATA ANALYSIS | 3 finding bullets (body 13px, truncated) |
| `decision` | DECISION | claim (body 14px / 500 / `--text-hi`) + 1-line rationale (body 12px / 400 / `--text-mid`) |
| `running_service` | RUNNING SVC | URL line (mono 11px) + status dot + status label |
| `comm_draft` | COMM DRAFT | mono channel line + first message line (body 13px) |
| `verification` | VERIFICATION | "228 / 230 passing" with tabular-nums; suite name below in mono uppercase |
| (catch-all) | uppercased kind id | `--text-mid` 12px "no preview renderer for this kind" |

**No emojis. No per-kind color** (verification uses `--ok` only on the pass count and `--danger` only on the fail count — same Lucid principle). **No per-kind iconography.** Kind is a mono uppercase text label inside a Tag.

---

## 7. Component mapping

### New components (8)

| Tier | Component | Composes | Used by |
|---|---|---|---|
| 2 | `ArtifactGalleryCard` | sub-primitives 1–4 | Bet detail aggregation; Product page; Portfolio gallery; L12 work surfaces |
| 2 | `ArtifactStackItem` | sub-primitives 1–3 (no PreviewSurface) | Bet detail vertical stacks; Task detail siblings list |
| 2 | `ArtifactPreview` | sub-primitives 1–4 + L11 thread slot | Artifact permalink page |
| 2 | `ArtifactEmbed` | sub-primitives 1–3 + delegated `ArtifactView` | L11 rich review messages |
| 1 | `ArtifactKindBadge` | nothing | NotificationRow (artifact mention); search-result rows |
| 1 | `ArtifactCostChip` | nothing | Cost tally on bet detail; session cost summaries |
| 1 | `ArtifactTimestamp` | nothing | Generic relative-time renderer wherever artifacts are referenced |
| 1 | `ArtifactPreviewSurface` | dispatches by kind; delegates to `ArtifactView` for kinds that map | Knowledge-row that links to artifact; notification-row preview area |

### Existing components reused (unchanged)

- `Tag` — base of `ArtifactKindBadge`'s appearance (kind-badge has fixed kind-specific labels but inherits Tag's chrome — pill shape, mono caps, `--surface-ghost`, `--text-mid`).
- `ArtifactView` (existing Tier 3) — composed inside `ArtifactEmbed` and inside `ArtifactPreviewSurface` for the kinds that map to a review-shape.

### Components NOT created

- No "ArtifactCard" generic alias (would suggest layouts are interchangeable).
- No per-kind component (e.g. no `ArtifactCodeDiffCard`). Per-kind is a render concern, not a component identity.
- No "ArtifactList" or "ArtifactGrid" wrapper (consumers use the existing list/grid utilities; the artifact components are the items, not the containers).

---

## 8. Open questions for the architect (Step 3)

Surfaced from Phase-0 §11 and synthesis. Each must be answered by `/architecture` before code is written.

1. **`preview` discriminated-union closure.** Per-kind shape: `code_diff: { file: string; hunks: Hunk[] }`; `deck: { slide_count: number; first_slide_title: string }`; etc. Architect closes the per-kind shapes.
2. **`kind` enum closure.** Closed TS literal union (12 kinds) vs open string with catch-all renderer. Design works either way.
3. **Producing-task title denormalisation.** Add `producing_task_title` to the canonical fetch response, OR expose a batched task-title fetch. Design assumes denormalisation.
4. **`getArtifactViewProps(artifact): { shape, payload }` helper location.** Shared package? L3 package? Architect decides.
5. **Thread-count fetching.** Denormalised on gallery/stack response, or per-artifact lookup. Design assumes denormalisation for hot paths.
6. **`cost_from_session` shape.** Align with L4's money + token-usage type when L4 lands. Design uses `{ money: string | null; tokens: string | null }` as a display proxy.
7. **`state` prop derivation.** Explicit prop on every layout vs derived from data shape (missing `preview` → loading; `error` field → error). Recommend explicit prop for testability.
8. **Storybook stories.** 8 new components × at least 4 variants each (populated, loading, error, no-preview). 32 stories minimum. Architect plans the build order.
9. **Lint rule for `ArtifactEmbed` chrome.** Add `design/no-embed-chrome` ESLint rule (K6 family) that forbids `bg-`/`border-`/`rounded-`/`shadow-` on `ArtifactEmbed`'s root className. Hard-rule enforcement.
10. **Aggregation fetching contracts.** `fetch_artifacts_by_task / by_bet / by_product / by_portfolio` — return shapes, pagination, sort order. Spec doesn't require a sort default; design recommends `created_at DESC`.

---

## 9. Final critique pass

**Score: 8.0 / 10**

(H:8 S:8 T:8 C:8 Co:9 St:7 A:8 AS:9 PP:7)

| Dimension | Score | Notes |
|---|---|---|
| Visual Hierarchy | 8 | Clean reading order in all four layouts. Identity strip discipline maintained. |
| Spacing & Density | 8 | Density tokens throughout; no hardcoded padding. |
| Typography | 8 | Geist + Geist Mono; 11/13/14/15/20 px scale; three weights only. |
| Color Usage | 8 | Monochrome + danger for diff `−`; ok for diff `+` and verification pass count; danger for verification fail count. Color = information. |
| Coherence | 9 | Shared sub-primitives across all four layouts. Embed enforced as a separate component, lintable. |
| States | 7 | Spec-complete (5 states × 4 layouts). One round of mockup state-rendering recommended in implementation, but the spec is unambiguous. |
| Accessibility | 8 | Tabindex, focus-visible, aria-labels on the embed arrow specified. Keyboard model documented. Touch targets satisfy AQ-015. |
| Anti-Slop | 9 | Zero AI-aesthetic tells. All AQ-101..AQ-113 cleared. |
| Premium Polish | 7 | Tabular-nums, letter-spacing, motion tokens, reduced-motion, halation guard, mobile-input-size, auto-density — all required, all specified. Could be 8 if the hover-pressed-disabled state matrix were drawn for every interactive element; deferred to implementation stories. |

**Above the threshold (≥7).** No further iteration required at the design phase.

---

## 10. Validation hooks for /architecture and /write-tests

The L3 spec's acceptance criteria become testable as follows:

- "Each layout renders correctly" → vitest `render` test per of the four layout components, asserting key DOM elements (kind badge text matches kind, cost-chip renders `—` when null, etc.).
- "Empty states render correctly" → vitest `render` with `preview === null` asserts placeholder text "PREVIEW PENDING".
- "Function-agnostic outputs surface enough to recognise" → vitest fixtures for all 12 kinds, snapshot the gallery card's title + preview content.
- "The fetching contract round-trips for each filter axis" → server-side test, not a design concern.
- "Playwright e2e: at least one of each layout renders against real data" → 4 e2e tests (one per layout).

Stories at `/designsystem` route are required deliverables (per `.claude/rules/design-system.md`). One stories file per component: `ArtifactGalleryCard.stories.tsx`, etc.

---

## 11. Cross-link

- Concept doc: `docs/concept/HUMAN_INTERFACE_LAYER.md` §4.5
- Shared contract: `docs/work-packages/SHARED.md` "Artifact primitive (L3)"
- Track story: `docs/work-packages/TRACK-L.md` L3
- Sibling stories that consume this primitive: L11 (rich review messages → uses `ArtifactEmbed`), L12 (Work surfaces → uses `ArtifactGalleryCard`, `ArtifactStackItem`, `ArtifactPreview`).
