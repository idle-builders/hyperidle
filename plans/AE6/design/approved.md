# AE6 Approved Design -- Artifact Extensibility

## Chosen direction: Direct Kind-Renderer Mapping

One variant explored. The existing 5 ArtifactView shapes already provide the review experiences needed for 5 of 6 kinds. The design adds one new renderer (sandboxed HTML preview), a fallback renderer, and label display in existing metadata surfaces.

---

## 1. Kind-to-Renderer Mapping

Each kind maps to exactly one renderer component. The renderer is a React component that receives the kind's preview data and renders the review experience.

| Kind | Renderer component | Review experience | Existing shape reused |
|---|---|---|---|
| `text` | `TextRenderer` | Prose content rendered as markdown via the Block primitive. Metadata strip shows label if present. | Evolves `content_preview` shape -- replaces raw `dangerouslySetInnerHTML` with Block rendering |
| `code` | `CodeRenderer` | Unified diff viewer with line-by-line additions/deletions/context. File path in header. | Direct reuse of `text_diff` shape |
| `image` | `ImageRenderer` | Single image display with dimensions. Before/after comparison when two URLs are provided. | Evolves `visual_comparison` shape -- primary mode is single image (before/after is secondary) |
| `data` | `DataRenderer` | Headline metrics grid + optional sparkline charts + optional table rows. | Direct reuse of `data_metrics` shape |
| `html` | `HtmlRenderer` | Sandboxed iframe rendering agent-produced HTML. Fixed-height container with resize handle. | **New.** No existing shape. |
| `url` | `UrlRenderer` | Link + status indicator + label. Clickable to open external resource. | Evolves `action_summary` shape -- simplified to single URL focus |

### Fallback renderer

When an artifact has an unregistered kind (no Kind Definition found), the `FallbackRenderer` activates:

- **Header:** Kind badge shows the raw kind string (e.g., "BLOG_POST") in the existing ArtifactKindBadge style
- **Body:** If preview data exists, render it as a formatted key-value list using the KeyValue design-system component. Each top-level field in the preview JSON becomes a row: field name as label, stringified value as value.
- **Empty state:** If no preview data, show: "Preview not available for kind: {kind}" in `text-[var(--text-tertiary)]` monospace.
- **Never crashes, never blanks.** Any valid JSON preview data renders as key-value pairs. Invalid data shows the empty state.

```
+--------------------------------------------------+
|  BLOG_POST  .  Task: Write Q4 blog post          |
+--------------------------------------------------+
|  title        Quarterly Update: AI-first Teams    |
|  wordCount    2,400                               |
|  status       draft                               |
|  tags         ["ai", "productivity", "roadmap"]   |
+--------------------------------------------------+
```

---

## 2. Label Display

Labels are optional business-domain tags. They appear in **two** places:

### 2a. ArtifactKindBadge area (gallery card, stack item, embed, preview header)

When a label is present, it appears as a secondary text element after the kind badge, separated by a centered dot. The label uses the same monospace styling as the producing task title but is not a badge -- it is inline text.

```
  CODE  .  contract  .  Task: Draft services agreement
```

The kind badge remains the primary identifier. The label is secondary context. When no label is present, nothing changes -- the layout collapses to the current display.

### 2b. Metadata strip (ArtifactView review experience)

When present, the label appears as the first item in the MetadataStrip after the kind badge:

```
  TEXT  .  contract  .  status: pending  .  sla: 2h
```

### What labels do NOT do

- Labels do not change the renderer. A `text` artifact labeled `contract` and one labeled `email` both use the TextRenderer.
- Labels do not add extra UI affordances (no "email-specific" To/Subject fields in the renderer). That was considered and rejected -- see rejected directions below.
- Labels do not filter the artifact gallery (future feature, not AE6 scope).

---

## 3. Renderer Details per Kind

### 3a. TextRenderer

**Preview schema:** `{ kind: "text"; body: string; format?: "markdown" | "plain" }`

**Populated state:**
- Renders `body` as markdown using the Block primitive (already exists in design-system)
- Wraps in `prose prose-sm prose-invert max-w-none` for reading width
- Metadata: label (if present) in metadata strip

**Empty state:** "No content preview available" in `text-[var(--text-tertiary)]`

**Interaction:** Read-only. Scrollable if content exceeds container height.

### 3b. CodeRenderer

**Preview schema:** `{ kind: "code"; file: string; hunks: DiffHunk[] }`

Identical to the existing `TextDiffView` sub-component in ArtifactView.tsx. The `file` field renders as a monospace header above the diff hunks.

**Empty state:** "No diff available" (existing behavior)

### 3c. ImageRenderer

**Preview schema:** `{ kind: "image"; url: string; width: number; height: number; alt?: string }`

**Populated state:**
- Single image display at native aspect ratio, capped to container width
- Dimensions shown as `{width} x {height}` in monospace below the image
- `alt` text passed to `img` element

**Before/after mode:** Not in AE6 scope. The existing `visual_comparison` shape with two images is available as a future extension when the preview schema includes `beforeUrl`.

**Empty state:** Placeholder surface with "IMAGE PENDING" text (matches existing ArtifactPreviewSurface pattern)

### 3d. DataRenderer

**Preview schema:** `{ kind: "data"; headlines: Array<{ label: string; value: string }>; rows?: Array<Record<string, string>>; charts?: SparklineChart[] }`

Reuses the existing `DataMetricsView` sub-component for headlines and charts. Adds optional `rows` for tabular data rendered as a simple HTML table:

- Table uses `font-mono text-[11px]` for values
- Alternating row backgrounds: transparent / `color-mix(in oklab, var(--text-secondary) 3%, transparent)`
- Max 20 rows displayed; overflow shows "{n} more rows" in tertiary text

**Empty state:** "No metrics available" (existing behavior)

### 3e. HtmlRenderer (new)

**Preview schema:** `{ kind: "html"; html: string; title?: string }`

**Populated state:**
- Renders in a sandboxed `<iframe>` with `sandbox="allow-scripts"` (no allow-same-origin, no allow-forms, no allow-popups)
- The iframe `srcdoc` contains the HTML string
- Fixed container height: 400px with a subtle drag handle at the bottom for manual resize
- Container background: `var(--surface-container)` with `rounded-[var(--r-subtle)]` border
- Loading indicator: standard skeleton matching iframe dimensions until load event fires
- If `title` is present, shown as a header above the iframe in `text-[13px] font-medium text-[var(--text-secondary)]`

**Security:** The iframe sandbox attribute prevents the HTML from accessing the parent page. No cookies, no storage access, no navigation of the parent. The `allow-scripts` permission enables interactive content (charts, visualizations) while maintaining isolation.

**Empty state:** Surface with "HTML PREVIEW PENDING" in monospace tertiary text

### 3f. UrlRenderer

**Preview schema:** `{ kind: "url"; url: string; status?: "ok" | "degraded" | "down"; statusLabel?: string }`

**Populated state:**
- URL displayed as a clickable link in `text-[var(--accent-primary)]` with underline-on-hover
- Status indicator: colored dot (green/amber/red) + status label text, using existing StatusChip pattern
- Opens in new tab (`target="_blank" rel="noopener noreferrer"`)
- If no status fields, just the URL link

**Empty state:** "No URL available" in tertiary text

---

## 4. ArtifactKindBadge Changes

The ArtifactKindBadge component currently types its `kind` prop as `ArtifactKind` (the closed enum). After AE6:

- **Props:** `kind: string` -- accepts any string, not just the enum
- **Display:** `kind.replace(/_/g, " ").toUpperCase()` (existing logic, unchanged)
- **Styling:** Unchanged. The same monospace uppercase pill badge.

This is the only design-system component that changes its TypeScript interface. All other design-system components (ArtifactGalleryCard, ArtifactStackItem, ArtifactPreview, ArtifactEmbed) already pass `Artifact` data objects -- they'll work once the `Artifact` type is updated.

---

## 5. ArtifactPreviewSurface Changes

ArtifactPreviewSurface currently has an inline `renderBody` switch over all 12 old kinds. After AE6:

- The switch becomes a lookup into the Kind Definition registry
- Each Kind Definition provides a `summarize(preview)` function that returns the one-line summary string
- The fallback: kind string + "preview not available" for unregistered kinds
- The component's external interface (props, styling, sizing) does not change

---

## 6. Migration UX

Users see no migration. Old artifacts with kinds like `contract` render as `text` artifacts with label `contract`. The content is the same; the renderer may actually improve (from no renderer or generic summary to the TextRenderer with Block-based markdown rendering).

The migration is a DB-level operation + read-time normalization:

1. A DB migration maps old kinds to new kinds + labels (e.g., `contract` -> kind=`text`, label=`contract`)
2. Read-time normalization handles any un-migrated rows by applying the same mapping
3. The `unknown_kind` sentinel is retired -- replaced by the registered/unregistered kind partition

The ArtifactKindBadge now shows the fundamental kind (`TEXT`) rather than the business domain (`CONTRACT`). The label provides the domain context nearby.

---

## 7. States Across All Surfaces

### Gallery card (ArtifactGalleryCard)

| State | Behavior |
|---|---|
| Loading | SkeletonCard (existing) |
| Error | ErrorState (existing) |
| Empty (no artifacts) | EmptyState (existing) |
| Populated, registered kind | Kind badge + label + title + preview summary + footer |
| Populated, unregistered kind | Kind badge shows raw kind + title + "preview not available" in preview surface |

### Stack item (ArtifactStackItem)

Same state matrix. The label appears inline after the kind badge when present.

### Full preview (ArtifactPreview)

Same state matrix. The renderer occupies the main content area. Label appears in the header meta line.

### Embed (ArtifactEmbed)

Same state matrix. The `viewSlot` receives the kind's renderer component. When no renderer is available (unregistered kind), the embed falls back to `summarizePreview` output (existing behavior) or the fallback renderer's key-value display.

### Review experience (ArtifactView)

| State | Behavior |
|---|---|
| Loading | Skeleton matching renderer dimensions (existing) |
| Error | Error alert (existing) |
| Populated, registered kind | Full renderer for the kind |
| Populated, unregistered kind | FallbackRenderer with key-value preview display |
| Populated, no preview data | "Preview not yet rendered" placeholder (existing) |

---

## 8. Keyboard and Focus

No new keyboard interactions. Existing artifact interactions (click to open, tab to navigate) are unchanged. The sandboxed iframe (HtmlRenderer) receives focus via Tab like any iframe -- focus trapping is handled by the browser's native iframe focus boundary.

---

## 9. Mobile Adaptation

No changes to mobile layout. Artifacts appear in the Work tab (mobile three-tab layout). The renderers are naturally responsive:
- TextRenderer: prose wraps naturally
- CodeRenderer: horizontal scroll for long lines (existing behavior)
- ImageRenderer: image scales to container width
- DataRenderer: metrics grid collapses to single column at narrow widths
- HtmlRenderer: iframe scales to container width; height remains fixed at 400px
- UrlRenderer: URL truncates with ellipsis; status indicator remains

---

## 10. Rejected Directions

### A. Label-influenced renderers

Considered: labels could add contextual affordances (e.g., `email` label adds To/Subject fields above the text content, `contract` label adds a parties list). **Rejected** because it violates the concept's hard rule that labels MUST NOT affect renderer selection, and it creates an unbounded maintenance surface -- every new label string could demand custom UI.

### B. Kind-specific gallery card variants

Considered: each kind gets a visually distinct gallery card (code kind shows mini-diff in card, image kind shows thumbnail, html kind shows live mini-preview). **Rejected** because it would require new design-system components per kind, blowing the component budget, and because the ArtifactPreviewSurface already provides kind-specific summaries in a uniform container.

### C. Renderer plugins with runtime registration

Considered: a `registerRenderer(kind, component)` API at runtime instead of build-time Kind Definitions. **Rejected** because it adds runtime complexity (registry singleton, race conditions, SSR concerns) for a problem that doesn't need it -- the initial 6 kinds are the set, and new kinds are added by contributors editing code (build-time discovery via import).

### D. Separate ArtifactView components per kind

Considered: replacing the single ArtifactView with 6+ standalone components (TextArtifactView, CodeArtifactView, etc.). **Rejected** because it fragments the shared chrome (MetadataStrip, RelatedHistorySection, loading/error states) across 6 files, violating DRY and making the metadata strip inconsistent across kinds.

### E. Rich fallback with kind-specific heuristics

Considered: the fallback renderer could try to detect content type from preview data structure (e.g., if preview has a `url` field, render as link; if it has `body`, render as text). **Rejected** because it creates an unpredictable rendering path -- contributors would rely on heuristic fallback instead of writing proper Kind Definitions.

---

## 11. Open Questions for Architecture

1. **HTML sandbox policy:** What CSP headers should the iframe srcdoc carry? Should `allow-scripts` be opt-in per artifact or always-on for the html kind?

2. **Lazy loading boundary:** Where exactly does React.lazy split? One chunk per kind renderer, or one chunk for all 6?

3. **Preview schema validation at read time:** The server currently validates preview data against the hardcoded Zod discriminated union. With per-kind schemas, how does the server compose validation? Union of all registered schemas, or validate against the specific kind's schema?

4. **Migration SQL:** What's the exact migration SQL for the kind column transformation? Is it a single UPDATE with CASE/WHEN, or a migration script?

5. **Label column:** Is `label` a new column on the artifacts table, or stored in a JSON field?

6. **Kind Definition file convention:** What's the exact file path pattern and module interface?

7. **Agent guidance update:** The create-artifact tool schema needs updating from the 12-kind enum to the 6-kind set. How does the tool communicate label options?

---

## 12. Component Budget Impact

**New design-system components: 0.** All rendering happens in shell-tier components (ArtifactView sub-components) and the Block primitive.

**Modified design-system components:**
- `ArtifactKindBadge` -- `kind` prop widens from `ArtifactKind` to `string`
- `ArtifactPreviewSurface` -- internal `renderBody` switch replaced by Kind Definition lookup
- `ArtifactGalleryCard`, `ArtifactStackItem`, `ArtifactPreview`, `ArtifactEmbed` -- accept updated `Artifact` type (label field added)

**New shell-tier components:**
- `HtmlRenderer` -- sandboxed iframe for the html kind (sub-component of ArtifactView, not a design-system component)
- `FallbackRenderer` -- key-value display for unregistered kinds (sub-component of ArtifactView)

**Budget: 19/19 custom components, unchanged.**
