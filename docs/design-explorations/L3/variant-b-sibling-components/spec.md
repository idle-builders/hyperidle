# Variant B — Artifact: four sibling components + four sub-primitives

**Identity.** Four top-level components, one per layout. They share four small sub-primitives.

```tsx
// Top-level layout components (Tier 2)
<ArtifactGalleryCard data={...} threadCount={...} onOpen={...} state="..."/>
<ArtifactStackItem   data={...} threadCount={...} onOpen={...} state="..."/>
<ArtifactPreview     data={...} discussionSlot={...} state="..."/>
<ArtifactEmbed       data={...} onOpen={...} state="..."/>

// Internal sub-primitives (Tier 1, package-private — not exported to the catalog)
<ArtifactKindBadge kind="code_diff" />
<ArtifactCostChip cost={{ money: '$0.42', tokens: '3.2k' }} />
<ArtifactTimestamp value="2026-04-28T15:31:00Z" relative />
<ArtifactPreviewSurface kind="code_diff" preview={...} size="gallery|full" />
```

**Density philosophy.** This variant goes hardest on per-layout fit. The gallery card breathes more (because it sits in a grid that itself has gutters). The stack row stays tight (because density-row-h sets the rhythm). The preview page actually breathes (because it's a permalink). The embed is silent (because it's a guest). Each component owns its own density story — we do NOT force one cadence across all four.

**Motion register.** Layout-specific.
- gallery card: `--motion-fast` hover surface ramp + 1px border glow on focus.
- stack item: `--motion-fast` hover surface ramp; no scale, no shift.
- preview page: no chrome motion; sub-elements own their own (diff-line hovers, KPI tabular-nums increment).
- embed: zero motion contributed by the embed itself.

**Copy register.** Each component has its own copy register. Gallery card uses derived titles ("Round to 4 decimals on margin"). Stack item uses task-task names ("ship-pricing-engine-v1.4.2"). Preview page uses both — a path hierarchy header plus a derived title. Embed shows the kind label and producing-task only.

---

## Sub-primitive specs

### ArtifactKindBadge
Mono uppercase Tag, 11px, `--surface-ghost` background, `--text-mid` color. Variants per kind purely cosmetic — same chrome, label changes. (No per-kind color: the Lucid principle is "color reserved for danger".) Tabular-nums inside is irrelevant — kinds are text labels.

### ArtifactCostChip
Compact mono inline element: `$0.42 · 3.2k`. Money first, dot, token count with `k` suffix above 1000. `font-variant-numeric: tabular-nums`. When `cost === null`, renders `—` (em-dash, not `$0.00`). On hover (gallery card only), tooltip expands to the full breakdown: `$0.42 (prompt: 1.8k @ tier-2 + completion: 1.4k @ tier-2)`.

### ArtifactTimestamp
Relative time (`2h ago`, `yesterday`, `Apr 21`). Mono 11px `--text-lo`. Absolute time on hover via `<time title>`. Tabular-nums.

### ArtifactPreviewSurface
The preview-rendering switch lives ONLY here. Two sizes: `gallery` (88px tall, fixed) and `full` (no fixed height, full width). The same kind-renderer table from variant-A's spec applies, but here it's a dedicated component so consumers can't accidentally re-implement it. When `preview === null`, this component renders the placeholder; consumers don't know about the placeholder. Single source of truth.

---

## Top-level layout specs

### ArtifactGalleryCard

- Outer: `--surface-4`, `--r2`, `--density-card-pad` 12px, flex column `--density-card-gap` 8px.
- Header row: `<ArtifactKindBadge>` + dot + producing-task name (truncated, mono 11px `--text-mid`).
- Title row: derived title, body 15px medium, `--text-hi`, max 2 lines.
- `<ArtifactPreviewSurface size="gallery" />` (88px tall).
- Footer: `<ArtifactCostChip>` + dot + `<ArtifactTimestamp>` on the left; thread-count chip on the right when > 0.
- Hover: `--surface-4 → --surface-5` via `--motion-fast`.
- Focus: 1px primary outline.
- Click: `onOpen`.
- Width: not constrained by the component; gallery layout uses 280px columns at default density.

### ArtifactStackItem

- Outer: NO background, height = `--density-row-h`, padding `--density-pad-x`.
- Single row: `<ArtifactKindBadge>` · producing-task · derived title · spacer · thread-count (when > 0) · `<ArtifactCostChip>` · `<ArtifactTimestamp>`.
- Hover: `background: var(--surface-4)`.
- No preview surface in this layout.

### ArtifactPreview (single_full_preview)

- Page-level surface, NOT a card. `--surface-3` at the page-gutter level.
- Two-column grid (1fr / 320px) for body + discussion sidebar; collapses below 1024px.
- Header: ID strip (mono `--text-lo`) + 2-row meta (kind + producing-task, cost + timestamp) + `<h1>` derived title at `--density-text-h2` 20px semibold.
- Body: `<ArtifactPreviewSurface size="full" />`. When kind maps to an `ArtifactView` shape, this delegates internally.
- Discussion: a slot. The L1 thread surface mounts here. Out of scope for L3 implementation.

### ArtifactEmbed

- Renders inside a review-message container. NO outer chrome.
- Two parts:
  1. Identity strip: `<ArtifactKindBadge>` + producing-task + `<ArtifactCostChip>` + `<ArtifactTimestamp>` + open-arrow icon.
  2. Delegated `<ArtifactView>` mount with shape derived from `kind + preview`.
- 4px gap between identity strip and ArtifactView mount.
- The component MUST refuse to render an outer background or border. Lint rule (eventual): `ArtifactEmbed` root className must not contain `bg-`, `border-`, `rounded-`, `shadow-`.

---

## States, by layout

| Layout | Loading | Error | No-preview |
|---|---|---|---|
| GalleryCard | Skeleton silhouette per the populated layout. Header skeleton, title 2-line skeleton, preview surface skeleton (88px), footer skeleton. | Header + title render. PreviewSurface renders an inline error-state with retry. | Handled inside PreviewSurface — placeholder. |
| StackItem | Single row skeleton at `--density-row-h`. | Renders normally; no preview means no fallback. Error is silent on stack items. | Not applicable (no preview surface). |
| Preview (full) | Header skeleton + body skeleton matching layout shape. | Header renders; body shows large error block with retry button. | PreviewSurface renders the full-size placeholder. |
| Embed | Identity-strip skeleton + ArtifactView's own skeleton. | Identity strip renders; ArtifactView shows its own error. | Identity strip renders; ArtifactView shows its own placeholder. |

---

## Behavior

- Gallery and stack: click anywhere triggers `onOpen` (artifact permalink). Keyboard: `Enter` / `Space`.
- Preview: no chrome interaction; sub-element interactions are owned by the renderer.
- Embed: click on the open-arrow → permalink in side pane. The identity strip itself is non-interactive (the arrow is the affordance).

---

## Mobile adaptation

- GalleryCard: density-comfortable kicks in at < 1024px (16px pad); column count drops to 1 < 640px.
- StackItem: at < 480px, the timestamp drops below the cost line (two-line right cluster).
- Preview: discussion sidebar drops below body at < 1024px.
- Embed: inherits review-message container.

---

## Component-budget impact

- **+4 top-level components:** ArtifactGalleryCard, ArtifactStackItem, ArtifactPreview, ArtifactEmbed.
- **+4 internal sub-primitives** (sealed/private to this package): ArtifactKindBadge, ArtifactCostChip, ArtifactTimestamp, ArtifactPreviewSurface. These do NOT count against the public budget because they are not exported as design-system primitives.
- Net public component count: +4.

---

## Tradeoffs / risks

- **Pro:** clearest per-layout contract — each component is a focused implementation. Reduces prop-explosion from variant A.
- **Pro:** sub-primitives are reusable inside the L3 family — no risk of inconsistent kind badges or cost rendering across layouts.
- **Pro:** the embed's "no chrome" rule is enforced at the type / lint level — a separate component cannot forget and add a card frame.
- **Con:** four components to import — heavier API surface; consumers need to know which to pick.
- **Con:** four implementations to maintain. The single-source-of-truth for kind rendering (PreviewSurface) softens this, but the stack/gallery/preview chrome still lives in three places.
- **Con:** if a fifth layout were ever added (it can't — the family is closed), this approach scales worse than variant A.
