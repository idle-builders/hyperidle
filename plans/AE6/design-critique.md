# AE6 Design Critique -- Artifact Extensibility

Reviewer: Phase 2 critique (producer/evaluator separation).

## Scoring

### 1. Concept alignment -- 9/10

The design faithfully implements the locked concept. Six fundamental kinds map 1:1 to renderers. Labels are metadata-only: they appear in the kind badge area and metadata strip but never influence renderer selection. The design explicitly documents "what labels do NOT do" (section 2), which mirrors concept hard rules 1-2. The fallback renderer handles unregistered kinds without crashing.

One minor gap: the concept says labels "may influence minor UI affordances (e.g., an email label on a text artifact could show To/Subject in a metadata strip)" but the design explicitly rejects this in section 10A ("Label-influenced renderers -- Rejected"). This is a defensible narrowing, not a violation, but it closes a door the concept left open. The design should note that this is a deliberate restriction relative to the concept's "may" language rather than ignoring it.

### 2. Completeness -- 9/10

All 6 kinds are specified with preview schemas, renderer descriptions, and wireframes/descriptions. The fallback renderer is fully specified with a wireframe (section 1). Label display is specified in two locations (badge area, metadata strip) with a clear "what labels do NOT do" list. The ArtifactKindBadge interface change is documented. The ArtifactPreviewSurface change is documented.

The one gap: the `data` kind's renderer adds "optional table rows" and "optional sparkline charts" to the existing `DataMetricsView` but the existing `DataMetricsView` in ArtifactView.tsx already handles sparkline charts. The design should be explicit about whether the `data` renderer extends the existing component or creates a new one, and what the table-row rendering looks like beyond the spec (font, alternating rows, row limit).

Actually, section 3d does specify: font-mono 11px, alternating rows with color-mix, max 20 rows. So this is adequately covered. Full marks minus one for the `data` kind preview schema listing `charts?: SparklineChart[]` without defining `SparklineChart` (it exists in ArtifactView.tsx but the design doesn't reference it).

### 3. State coverage -- 8/10

Section 7 provides a state matrix across all 5 surfaces (gallery card, stack item, full preview, embed, review experience) with loading, error, empty, populated states for each. Each renderer in section 3 specifies populated and empty states.

Gaps:
- **Loading states for individual renderers.** The HtmlRenderer specifies a loading state (skeleton until iframe load event). Other renderers do not specify per-renderer loading states, relying on the parent's loading state. This is reasonable for synchronous renderers but the ImageRenderer could have an image-loading state (before `onLoad` fires).
- **Error states for individual renderers.** What happens when the TextRenderer's markdown is malformed? When the CodeRenderer receives hunks with zero lines? When the ImageRenderer's URL 404s? The design specifies parent-level error states but not renderer-level error handling. The fallback renderer "never crashes, never blanks" but individual renderers lack this guarantee.
- **Disabled state** is N/A (artifacts are read-only). No concern there.

### 4. Consistency -- 9/10

The design follows existing Hearth patterns. Label display uses the same separator pattern (centered dot) already used in the ArtifactEmbed identity line. The fallback renderer uses KeyValue, which is an existing design-system component. The HtmlRenderer container uses `var(--surface-container)` and `rounded-[var(--r-subtle)]`, both on-token. Kind badge styling is unchanged. No new design-system components are introduced (component budget 19/19 unchanged).

Minor inconsistency: the MetadataStrip currently shows `shape` as the kind badge text (e.g., "text_diff"). After AE6, it will show the artifact kind (e.g., "TEXT"). The design should note this visual change is intentional and that the shape-to-kind rename in the badge is a UX improvement, not a regression.

### 5. Accessibility -- 7/10

Positive: The sandboxed iframe gets a `title` attribute ("HTML preview"). Existing keyboard interactions are preserved. No new interactive elements require keyboard handling. The image renderer passes `alt` text.

Gaps:
- **Iframe focus trap.** The design says "focus trapping is handled by the browser's native iframe focus boundary" -- this is correct but incomplete. The iframe with `allow-scripts` can create focusable elements inside it. Users tabbing through the page will enter the iframe and may get stuck if the HTML inside doesn't provide a way to tab out. The design should acknowledge this risk and note that it is inherent to iframe embeds.
- **Screen reader announcement for fallback.** When an unregistered kind renders the FallbackRenderer, there is no `aria-label` or heading to communicate to screen reader users that this is a fallback view rather than the primary renderer.
- **Contrast for the label text.** The label uses `text-[var(--text-tertiary)]` for the separator dot and presumably secondary text for the label itself, but the specific token for the label text is not stated. If it uses tertiary, contrast may be below 4.5:1 against some surfaces.

### 6. Simplicity -- 9/10

The design is appropriately scoped. It avoids over-design: no runtime plugin system, no kind-specific gallery card variants, no label-influenced renderers. The rejected directions (section 10) document five alternative approaches and provide clear reasons for rejection. The fallback renderer is simple (key-value pairs, not content-type heuristics).

The resize handle on the HtmlRenderer (section 3e: "subtle drag handle at the bottom for manual resize") is the only element that feels like scope creep. It requires implementing a drag interaction for a niche use case (agent-produced HTML that doesn't fit 400px). Consider whether this is AE6 scope or a future enhancement. However, it is a small detail and does not significantly increase complexity.

### 7. Migration UX -- 9/10

Section 6 addresses this directly: users see no migration. Old artifacts with business-domain kinds render with their fundamental kind's renderer, which may actually improve the experience (from no renderer to TextRenderer with markdown). The label preserves the business-domain context.

One UX concern: the ArtifactKindBadge changes from showing the business-domain kind ("CONTRACT") to the fundamental kind ("TEXT"). Users who have been seeing "CONTRACT" in their artifact gallery will now see "TEXT" with a smaller "contract" label next to it. The design acknowledges this ("section 6: ArtifactKindBadge now shows the fundamental kind rather than the business domain") but does not discuss whether this is a regression for users who identified artifacts by their old kind badge. The label mitigates this, but it is a visual hierarchy change worth noting.

### 8. Rejection list -- 10/10

Five rejected directions with clear rationale. Each rejection cites a specific cost or principle violation. The rejections cover the most likely alternative approaches (label-influenced renderers, per-kind gallery cards, runtime plugins, separate components, heuristic fallback). This is thorough.

### 9. Implementability -- 8/10

The design is largely implementable from the spec alone. Preview schemas are defined per kind. Renderer descriptions include populated and empty states. The component budget is explicit.

Gaps that would slow a builder:
- **HtmlRenderer resize handle:** The design says "subtle drag handle at the bottom for manual resize" but does not specify the drag interaction. Is it a CSS `resize` property? A custom drag handler? What is the minimum/maximum height?
- **TextRenderer Block primitive integration:** The design says "renders body as markdown using the Block primitive (already exists in design-system)" but does not specify how the Block primitive is invoked (import path, props interface, whether it handles raw markdown strings or parsed AST).
- **DataRenderer table rows:** The spec says "simple HTML table" but the design-system rules say "no hardcoded colors" and the alternating row background uses `color-mix` -- is this the existing pattern for tables in the design system, or a new pattern?
- **Seven open questions** (section 11) are explicitly deferred to architecture. This is correct architecture-level delegation, but the questions are critical enough that the design score depends on architecture resolving them cleanly.

---

## Summary

| Dimension | Score |
|---|---|
| 1. Concept alignment | 9 |
| 2. Completeness | 9 |
| 3. State coverage | 8 |
| 4. Consistency | 9 |
| 5. Accessibility | 7 |
| 6. Simplicity | 9 |
| 7. Migration UX | 9 |
| 8. Rejection list | 10 |
| 9. Implementability | 8 |
| **Average** | **8.7** |

**Verdict: PASS.** Average 8.7 exceeds the 7.0 threshold.

## Key findings for Phase 4 carry-forward

1. **Per-renderer error handling is unspecified.** When reviewing code, verify each renderer handles malformed/missing preview data gracefully (null checks, try-catch around parsing, image onError).
2. **Iframe accessibility risk.** Verify the HtmlRenderer iframe has appropriate ARIA attributes and that focus management is considered.
3. **Label contrast.** Verify the label text color token meets 4.5:1 contrast ratio.
4. **Resize handle scope.** If the builder implements the HtmlRenderer resize handle, verify it doesn't introduce complexity disproportionate to its value.
5. **Migration badge change.** Verify the transition from business-domain badge text to fundamental-kind badge text is smooth and the label provides adequate context.
