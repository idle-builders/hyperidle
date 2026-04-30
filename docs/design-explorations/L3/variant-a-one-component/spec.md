# Variant A — Artifact: one component, layout prop

**Identity.** A single `<Artifact>` component that switches its rendering via a `layout` prop. One file, one TSX module, one HTML reference page.

```tsx
<Artifact
  layout="gallery_card" | "stack_item" | "single_full_preview" | "review_message_embed"
  data={ArtifactData}
  state="populated" | "loading" | "error"   // optional, default "populated"
  threadCount={number | undefined}           // surfaced on gallery + stack only
  onOpen={() => void}                        // open-permalink handler
/>
```

**Density philosophy.** This variant goes hardest on density. Every layout consumes density tokens (no literal pad except the 64×40 gallery preview tile, which is geometric not breathing). The four layouts are deliberately tuned to *the same* visual rhythm so a designer scanning them knows it is one component family.

**Motion register.** All chrome animates on `--motion-fast` (80ms) for hover, `--motion-medium` (150ms) for state transitions. The embed is motion-quiet — it is a guest in someone else's chrome.

**Copy register.** Sparse, mono uppercase for labels (CODE DIFF, COST, etc.). Body weight only for content (the producing-task title, the preview's first line). Never sentence-case marketing.

---

## Layout 1 — gallery_card

**Geometry.**
- Outer: `--surface-4` background, `--r2` (8px), `--density-card-pad` (12px default), flex column with `--density-card-gap` (8px) between sections.
- Width: card; designer call on grid is the consumer's. The card itself does not impose a max-width; gallery surfaces commonly use a 240–320 px column.
- Sections, top to bottom:
  1. **Header row** (mono, 11px): kind `Tag` (left) + producing-task title (truncated, `--text-mid`, `font-mono` 11px after dot separator).
  2. **Title row** (body weight, `--density-text` 15px, `--text-hi`, max 2 lines truncated): the artifact's own title — for code_diff, the file path; for deck, the deck title; for drafted_email, the subject; for decision, the claim. (This is the artifact's most-recognizable handle; it is derived from `kind + preview` by the renderer.)
  3. **Preview surface** (kind-aware, fixed 88px tall): see §Preview surfaces.
  4. **Footer row** (mono, 11px, `--text-lo`): cost (`$0.42 · 3.2k` — money-dot-tokens) on the left, dot separator, relative timestamp (`2h ago`), thread-count chip on the right when > 0 (`12 thread`-style — singular/plural).

**Hover.** `--surface-4 → --surface-5` on the whole card via `--motion-fast`.
**Focus.** `outline: 1px solid var(--primary); outline-offset: -1px`.

---

## Layout 2 — stack_item

**Geometry.**
- Outer: NO background fill. List zebra is owned by the parent `Stack` surface. The Artifact contributes `--density-row-h` (44px default, 32 compact, 56 comfortable) of height with `--density-pad-x` horizontal pad and `--density-pad-y` vertical pad.
- Single horizontal row (no wrap):
  - **Left cluster (40% of width):** kind `Tag` + dot + producing-task title (truncated, `--text-mid` mono 11px) + dot + the artifact's own derived title (truncated, `--text-hi` body 14–15px, `font-medium`).
  - **Center spacer.**
  - **Right cluster (mono, 11px, `--text-lo`):** thread count (when > 0) + dot + cost + dot + relative timestamp.
- No preview tile in stack_item. The stack list is a *list of artifacts living among other items*; the preview is reached via click.

**Hover.** `background: var(--surface-3)` on the row only via `--motion-fast`.

---

## Layout 3 — single_full_preview

**Geometry.**
- This is a page surface, not a card. `--density-page-gutter` (16px default) and `--surface-3` background.
- Sections:
  1. **Header.** Two rows.
     - Row 1: kind `Tag` + dot + producing-task title (link to task) + cost + relative timestamp + ID truncated (`art_a1b2c3…`, mono `--text-lo`).
     - Row 2: artifact's own derived title at `--density-text-h2` (20px default, `font-semibold` 600).
  2. **Preview body.** Full-width preview surface, no fixed height. For kinds whose preview maps cleanly onto an `ArtifactView` shape (code_diff → text_diff, deck → content_preview, dashboard → data_metrics, screenshot/design → visual_comparison, decision/contract/comm_draft/drafted_email → action_summary or content_preview), this layout DELEGATES rendering to `ArtifactView`. For kinds outside that mapping, it renders a kind-specific extended preview using the same vocabulary as the gallery preview surface but at full width.
  3. **Discussion sidebar (right, 360px).** L1 thread surface mounted to this artifact's ID. Out of scope for L3 implementation; this layout reserves the column.

**Hover.** None on the page itself; sub-elements (preview lines, thread items) own their hover.
**Focus.** Skip-link target on the title.

---

## Layout 4 — review_message_embed

**Geometry — minimal, by design.**
- NO outer background. NO border. NO radius. NO padding contributed by the embed itself — the surrounding review-message container owns that chrome.
- The embed contributes:
  1. **Identity strip** (single row, mono 11px, `--text-lo`): kind `Tag` + dot + producing-task title + dot + cost + dot + relative timestamp. Optionally: a small `→` (chevron) on the right that opens the artifact permalink.
  2. **Preview area:** delegates 100% to `ArtifactView` with the appropriate shape derived from `kind + preview`. No other chrome.
- A 4px (--density-card-gap compact) gap separates the identity strip from the ArtifactView preview.

**Why this matters.** The embed is a guest in the review message's chrome. Adding a frame would create double-chrome (review-message border + embed border). The identity strip is the *only* artifact-specific UI; everything else is the ArtifactView render the user already knows.

---

## Preview surfaces (gallery_card / single_full_preview only)

The preview surface is a fixed-geometry container that renders kind-specific content. For Variant A, the renderer is a single switch in the same component file.

| kind | Preview content (gallery, 88px tall) | Notes |
|---|---|---|
| `code_diff` | Mono 11px, 4 lines max: file path top, then 3 hunks. `+` lines on `color-mix(--ok 14% transparent)`, `−` lines on `color-mix(--danger 14% transparent)`. | Real diff sample, not synthetic. |
| `deck` | Mono 11px first line: `Slide 1 of 12`. Body 13px next 1–2 lines: deck title. `--surface-3` inner box. | No fake thumbnail. |
| `contract` | Mono 11px first line: parties (`Party A · Party B`). Body 13px: contract title. | |
| `dashboard` | 3-row mini-KPI list. Each row: mono uppercase label (left, `--text-lo`) + tabular-nums value (right, `--text-hi`). | Tabular nums per AQ-006. |
| `screenshot` | Image (when populated). When NOT populated: see no-preview placeholder. | Real image asset, no fake. |
| `drafted_email` | Mono 11px: `To: …` + `Subject: …` + 1 body line truncated. | |
| `design` | Image (when populated). When NOT populated: placeholder. | Same as screenshot. |
| `data_analysis` | 3 finding bullets, body 13px, truncated. | |
| `decision` | 1 line claim (body 14px, `--text-hi`) + 1 line rationale (body 13px, `--text-mid`). | |
| `running_service` | URL line (mono 11px) + status dot (`--ok`/`--warn`/`--danger`) + status label. | |
| `comm_draft` | Mono 11px: `[channel]` + first message line. | |
| `verification` | `12 / 12 passing` (tabular nums) + suite name. | |
| (catch-all) | `kind` uppercased + small `--text-mid` "no preview renderer for this kind". | Should never ship without a renderer; this is the safety net. |

**No-preview placeholder.** `--surface-3` filled box at the same 88px height (gallery) or full width × 200px (single_full_preview), with mono uppercase 11px `--text-lo` text "PREVIEW PENDING" centered. No icon, no shimmer, no gradient.

---

## States, by layout

| Layout | Loading | Error | No-preview |
|---|---|---|---|
| gallery_card | Card silhouette: header skeleton (16px tall), title skeleton (2 lines), preview surface skeleton (88px), footer skeleton (1 line). All `skeleton-pulse` keyframe. | Identity rows render normally. Preview area replaced with `--text-mid` 13px "Preview unavailable — retry" + small text-button. | Preview area replaced with PREVIEW PENDING placeholder. |
| stack_item | Single row skeleton at `--density-row-h`. | Row renders normally; preview not surfaced anyway. The error-state on a stack_item is invisible because there's nothing to fall back to. | Not applicable — stack_item has no preview surface. |
| single_full_preview | Header skeleton (2 rows) + body skeleton (5 rows). | Header renders normally; body shows large "Preview unavailable" with retry button. | Body shows large PREVIEW PENDING placeholder (200px tall). |
| review_message_embed | Identity-strip skeleton (1 row) + delegated `ArtifactView` skeleton. | Identity strip renders; preview area shows ArtifactView's own error state. | Identity strip renders; preview area shows ArtifactView's own placeholder. |

---

## Behavior

- Click anywhere on `gallery_card` / `stack_item` → calls `onOpen` (which routes to the artifact permalink).
- Click on the embed identity strip's `→` chevron → opens permalink in a new pane (left thread, right artifact).
- Keyboard: `Enter`/`Space` on the focused gallery_card / stack_item.
- Hover: surface-ramp via `--motion-fast`. The embed has no hover (it inherits the review-message hover).
- Touch targets: gallery card and stack_item satisfy AQ-015 (≥44 CSS px) at default density.

---

## Mobile adaptation

- **gallery_card:** at viewport <640px, the gallery layout drops to 1 column. The Artifact card itself doesn't change geometry; only its container does. Density auto-flips to comfortable per AQ-016 — the card grows from 12px to 16px pad. Preview surface stays 88px.
- **stack_item:** at <480px, the right cluster collapses — thread count and timestamp survive; cost moves to a second line in `--text-lo` mono. Touch target is fine because density-row-h grows to 56px.
- **single_full_preview:** the discussion sidebar drops below the preview body at <1024px. Header rows stack.
- **review_message_embed:** inherits the chat-message container's mobile layout. The identity strip wraps if it overflows; chevron stays right-aligned.

---

## Component-budget impact

- **+1 net component:** `Artifact` (Tier 2 — composes StatusChip, Tag, KeyValue, ArtifactView; no new Tier 1 primitives needed).
- Reuses: `Tag` (for kind), no `KeyValue` needed (cost rendering is a single inline mono span — not a label/value pair on its own row), `ArtifactView` (delegated to inside embed and inside single_full_preview's preview body when kind maps).

---

## Tradeoffs / risks

- **Pro:** smallest possible API surface; one import, one component, one mental model.
- **Pro:** preview-renderer switch lives in one place — easy to extend when a new kind ships.
- **Con:** as state matrices grow, the prop interface widens (e.g. `state="loading"` + `loading-skeleton-variant="..."`). Mitigated by keeping state to the small enum above.
- **Con:** the four layouts share one TSX file — bundle cost for callers who only need one layout. Acceptable for an internal design system.
- **Con:** layout switching makes per-layout overrides (e.g. customizing gallery_card chrome) awkward — callers who need that fall back to composing primitives directly.
