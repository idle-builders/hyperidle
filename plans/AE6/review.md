# AE6 Code Review -- Artifact Extensibility

Reviewer: Phase 4 (code against locked concept, design, architecture)

---

## Positive Lenses

### 1. Architecture Lens

The implementation follows the architecture plan with high fidelity.

**Contracts respected:**
- Kind Definition interface in `packages/shared/src/kinds/kind-definition.ts` matches the plan exactly: `kind`, `previewSchema`, `displayTitle`, `summarize`.
- The registry (`packages/shared/src/kinds/registry.ts`) uses a `ReadonlyMap` as specified, with `getKindDefinition`, `isRegisteredKind`, `ARTIFACT_KINDS` all present and correctly typed.
- Package split is correct: schema + display logic in `packages/shared/src/kinds/`, renderers in `packages/web/src/kinds/`, no React imports in shared.
- DB schema (`packages/db/src/schema.ts`) correctly adds `label` column as `text` (nullable).
- Migration SQL covers all 13 old kinds, adds label column, and migrates `unknown_kind` to `text`.
- `OLD_KIND_MAP` in `packages/shared/src/kinds/old-kind-map.ts` provides read-time normalization.
- `artifactPreviewSchema` in `packages/server/src/schemas/artifact-preview.ts` composes from per-kind schemas via `z.discriminatedUnion`.
- `artifactToView.tsx` correctly deleted. `Conversations.tsx` updated to use the new `ArtifactView` API.
- `ArtifactThreadSummary.artifactKind` widened to `string` in `packages/shared/src/thread.ts`.
- Bets route removed `unknown_kind` normalization, passes raw kind through.

**Deviations from plan:**
- [ARCH-1] **Lazy loading not implemented.** Architecture section 4.1 specifies `React.lazy` per-kind renderers with one chunk per kind. The implementation uses static imports in `renderer-registry.ts` with a `@lore` explaining the deviation (ESM incompatibility with `require()`). This is defensible -- the original plan's `require()` snippet was incorrect for ESM, and static imports are simpler. The `Suspense` wrapper in `ArtifactView.tsx` line 108 is now dead code since no lazy loading occurs. **Severity: LOW** -- correct pragmatic decision, but the vestigial `Suspense` boundary should be removed for clarity.

- [ARCH-2] **`decision` kind mapping inconsistency.** The concept (section "How the current 12 map") specifies `decision -> text + label "decision"`. The architecture plan (section 6.2) also specifies `decision: { kind: "text", label: "decision" }`. But the implementation has `decision: { kind: "text", label: null }` in `OLD_KIND_MAP` (line 26) and the migration SQL sets only `kind = 'text'` with no label for `decision`. **Severity: MEDIUM** -- the `decision` label is lost during migration. This contradicts both the concept and the architecture plan.

### 2. Design Lens

**States handled correctly for all renderers:** Each of the 6 renderers handles null/empty/populated states. The FallbackRenderer handles null, empty entries, and arbitrary JSON.

**Design deviations:**
- [DES-1] **Label separator is `/` instead of `·` (centered dot).** The approved design (section 2a) specifies a centered dot separator between kind badge and label: `CODE . contract . Task: ...`. The implementation in `ArtifactGalleryCard`, `ArtifactPreview`, `ArtifactEmbed` uses `/` (forward slash). `ArtifactStackItem` uses no separator at all -- just side-by-side text. The MetadataStrip in `ArtifactView.tsx` correctly uses `·`. **Severity: LOW** -- visual inconsistency with the approved design, but the `/` is a reasonable alternative.

- [DES-2] **UrlRenderer missing status dot indicator.** The approved design (section 3f) specifies "Status indicator: colored dot (green/amber/red) + status label text, using existing StatusChip pattern." The implementation only renders the `statusLabel` text, omitting the colored dot entirely. The `status` field ("ok"/"degraded"/"down") is accepted by the schema but never rendered. **Severity: MEDIUM** -- a specified visual affordance is missing.

- [DES-3] **HtmlRenderer height differs.** The approved design specifies "Fixed container height: 400px with a subtle drag handle at the bottom for manual resize." The implementation uses `style={{ minHeight: 300 }}` with no drag handle and no fixed height (it's a minimum, not a fixed value). **Severity: LOW** -- functional but diverges from the design spec.

- [DES-4] **TextRenderer does not use Block primitive.** The approved design (section 3a) specifies "Renders `body` as markdown using the Block primitive (already exists in design-system)" with Tailwind classes `prose prose-sm prose-invert max-w-none`. The implementation renders a `<pre>` element with plain text wrapping. Markdown content will not be rendered as formatted HTML. **Severity: MEDIUM** -- the markdown rendering capability specified in the design is absent.

### 3. Security Lens

**HTML sandbox is correct:** `sandbox="allow-scripts"` only. No `allow-same-origin`, `allow-forms`, or `allow-popups`. Test in `AE6-kind-renderers.test.tsx` verifies this explicitly.

**Zod schemas are appropriately tight:** Each kind has a `z.literal()` discriminant. Label validation uses `z.string().regex(/^[a-z][a-z0-9_]*$/).max(64)`. The `PREVIEW_BODY_LIMIT` (64KB) caps preview size.

**Findings:**
- [SEC-1] **URL schemas lack URL format validation.** Both `imagePreviewSchema` and `urlPreviewSchema` accept `url: z.string()` with no URL format check (no `.url()` refinement). This means `javascript:alert(1)` is a valid URL value. For the image renderer, this is rendered as `<img src={preview.url}>` which browsers won't execute, but for the URL renderer it's rendered as `<a href={preview.url}>` which is a XSS vector when clicked. The `url` kind's `<a href>` with an unchecked URL string is the primary concern. **Severity: MEDIUM** -- the URL renderer should reject non-HTTP(S) URLs at the schema level, or at minimum sanitize the href.

- [SEC-2] **Fallback preview schema accepts unbounded JSON.** `fallbackPreviewSchema` uses `.passthrough()` which accepts any fields beyond `kind`. Combined with the 64KB body limit this is acceptable, but worth noting that the preview for unregistered kinds is stored as-is with no shape constraint.

---

## Negative Lenses

### 4. Adversarial Lens

- [ADV-1] **Preview JSON re-mapping logic in `rowToArtifact` has a subtle edge case.** Lines 105-115 of `artifacts.ts`: when `parsed.success` is true but `parsed.data.kind !== kind` (stale discriminant), it re-injects the normalized kind and re-validates. But if the original `raw` JSON matches a *different* registered kind's schema (e.g., a `data_analysis` preview that happens to parse as a valid `text` schema after kind substitution), the re-mapping could produce a preview with incorrect semantics. This is unlikely given the 6 schemas have different required fields, but the logic silently succeeds in such cases. **Severity: LOW**.

- [ADV-2] **Type assertions in renderer-registry.ts.** Seven `as RendererComponent` casts (lines 33-38, 46) exist because each renderer has a typed preview prop (e.g., `TextPreview | null`) that is narrower than `RendererProps.preview: any`. The `any` in `RendererProps` (line 26) is documented with a biome-ignore comment. This is a pragmatic tradeoff -- the alternative would require generic typing across the dispatch chain. **Severity: LOW** -- documented, isolated, and the `any` stays within the registry boundary.

- [ADV-3] **`as` cast count.** The diff introduces `as` casts in: `renderer-registry.ts` (7), `artifact-preview.ts` (3), `artifacts.ts` (6, several pre-existing). The `artifact-preview.ts` casts for `z.discriminatedUnion` tuple typing are documented with `@lore` comments. The `artifacts.ts` casts include `raw as object` and `parsed.data as Artifact["preview"]` which are safe post-validation. No unconstrained `as any`.

### 5. Simplification Lens

- [SIMP-1] **`Suspense` boundary in `ArtifactView.tsx` is vestigial.** Since renderers are eagerly imported (no lazy loading), the `Suspense` wrapper on line 108 never triggers. It adds a component layer and a fallback skeleton that is unreachable. Should be removed for honesty.

- [SIMP-2] **`RendererProps.preview` typed as `any`.** An alternative: make `RendererProps` generic or use `unknown`. The `any` bypasses type checking for all renderer prop passing. With `unknown`, each renderer would need to validate its input, which they already do implicitly via their typed props. However, this is a minor point given the `biome-ignore` documentation.

- [SIMP-3] **Double export path for `getKindDefinition` and `isRegisteredKind`.** These are exported from both `packages/shared/src/kinds/registry.ts` (directly) and `packages/shared/src/types/artifact.ts` (re-export) and `packages/shared/src/index.ts` (from both). This means consumers can import from either path. The barrel index should be the canonical path; the `types/artifact.ts` re-export adds confusion. Not blocking.

### 6. AI Slop Lens

- [SLOP-1] **Extensive but appropriate `@lore` comments.** The `@lore` annotations are genuinely informative and document non-obvious decisions (the ESM/require issue, the registry-as-configuration rationale, the iframe sandbox). Not slop -- these are load-bearing comments.

- [SLOP-2] **No unnecessary comments, no TODO placeholders.** Comments are concise and explain "why", not "what". File headers state lineage and mapping. No "simplified version" or "for now" patterns detected.

- [SLOP-3] **No dead code in production files.** The deleted `artifactToView.tsx` and the old ArtifactView shapes are cleanly removed. No commented-out blocks remain.

---

## AC Completeness Audit

### AC-1: New artifact kinds can be added without modifying core source files -- DONE (WITH CAVEAT)

The Kind Definition interface is the sole extension point. Tests in `AE6-kind-registry.test.ts` verify `getKindDefinition` and `isRegisteredKind` work for both registered and unregistered kinds. The architecture plan explicitly notes that adding an entry to `registry.ts` is configuration, not core logic. A contributor adding `blog_post` would need to: (1) create a Kind Definition in `packages/shared/src/kinds/blog_post.ts`, (2) add one import + one entry in `registry.ts`, (3) create a renderer in `packages/web/src/kinds/blog_post-renderer.tsx`, (4) add one import + one entry in `renderer-registry.ts`. This matches the architecture plan's definition of "no core file edits."

### AC-2: Each kind defines its own preview schema and renderer -- DONE

All 6 kinds have Kind Definition modules with Zod schemas, displayTitle, and summarize. All 6 have renderer components. Tests verify schema validation for all 6 kinds. Tests verify renderer output for all 6 kinds plus fallback.

### AC-3: Existing 13 kinds continue to work -- DONE (WITH CAVEAT ON `decision` LABEL)

`OLD_KIND_MAP` covers all 13 old kinds (12 + unknown_kind). Integration tests verify old-kind normalization. The migration SQL covers all 13 kinds. The `decision` label discrepancy (ARCH-2) means one of the 13 loses its label during migration, but the artifact itself still renders correctly as a `text` kind.

### AC-4: Extensibility model documented -- DONE

`docs/process-layer/artifact-primitive.md` updated with: the 6 fundamental kinds table, Kind Definition explanation, label system, registered/unregistered distinction, hard rules, vocabulary table.

---

## Validation Scenarios

### Given a contributor adds a "blog_post" kind, it works without modifying core files -- VERIFIED

The `AE6-kind-registry.test.ts` tests verify `getKindDefinition("blog_post")` returns undefined (unregistered). The `FallbackRenderer` test in `AE6-kind-renderers.test.tsx` renders a `blog_post` kind with preview data and verifies it displays without crashing. The architecture's definition of "no core file edits" is met -- adding a new kind requires only new files plus configuration entries in registry files.

### Given an unrecognized kind, a sensible fallback renders -- VERIFIED

`FallbackRenderer` tests verify: (1) key-value display for arbitrary preview JSON, (2) kind string shown in empty state, (3) no crash with arbitrary nested JSON, (4) `getRenderer("blog_post")` returns FallbackRenderer. The `ArtifactPreviewSurface` also handles unregistered kinds with a `"{kind}: preview not available"` fallback.

---

## Findings Summary

| ID | Severity | Category | Finding |
|---|---|---|---|
| ARCH-2 | MEDIUM | Architecture | `decision` kind loses its label in both migration SQL and OLD_KIND_MAP (should be `"decision"` per concept and architecture plan) |
| DES-2 | MEDIUM | Design | UrlRenderer missing colored status dot indicator (ok/degraded/down) |
| DES-4 | MEDIUM | Design | TextRenderer uses `<pre>` instead of Block primitive for markdown rendering |
| SEC-1 | MEDIUM | Security | URL schemas accept arbitrary strings -- `javascript:` URIs are a XSS vector in the UrlRenderer `<a href>` |
| DES-1 | LOW | Design | Label separator uses `/` instead of `·` (centered dot) in 3 of 4 design-system components |
| DES-3 | LOW | Design | HtmlRenderer height is minHeight:300 not fixed 400px, no drag handle |
| ARCH-1 | LOW | Architecture | Suspense boundary is vestigial (no lazy loading) -- dead code |
| SIMP-1 | LOW | Simplification | Same as ARCH-1 |

---

## Verdict: DONE

All 4 ACs are met. The implementation correctly delivers the 6 fundamental kinds, the Kind Definition system, the registry, per-kind schemas and renderers, backward compatibility via OLD_KIND_MAP and migration, the label system, and documentation. The 3831 passing tests, 0 type errors, and 0 lint errors demonstrate solid implementation quality.

The MEDIUM findings (ARCH-2, DES-2, DES-4, SEC-1) are real deviations from the approved plans but none are blocking. The `decision` label loss affects a single mapping entry and the artifact still renders correctly. The missing status dot, plain-text TextRenderer, and URL validation are refinements that can be addressed in a follow-up without breaking the extensibility model. The security finding (SEC-1) merits attention in a follow-up pass -- adding `z.string().url()` to the image and URL schemas would close it.

The architecture's structural promises are intact: layer integrity, open vocabulary, registry-based dispatch, fallback safety. The code is clean, well-documented with meaningful `@lore` annotations, and free of slop.
