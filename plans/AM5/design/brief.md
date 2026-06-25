# AM5 — Design brief (one base-primitive set; Artifact/Review/Block compose it)

`DESIGN-CLASS: novel  canonical=<the established block-payload layer + review diff canvases + the two chat/review splits>  source=block-payload-layer  new=KPI+Graph(extract)+SplitView/fold`

The concept is **LOCKED** (`plans/AM5/concept.md`, foundation decision 2026-06-26): the established **block-payload layer** (`packages/design-system/src/block/*` — shipped 2026-04-29, 16 docs) IS the canonical **base-primitive set**. The recent, thin, undocumented `kinds/*-renderer.tsx` layer (2026-06-12, AE6) is a **duplicate that collapses onto it (removed, not purified)**. Three **compositions** build on the base primitives: **Artifact (single)** composes one, **Review (diff)** composes two + delta, **Block (mixed)** composes many. **Purity (K0):** a base primitive carries NO diff, NO comparison, NO empty/error/loading state; the diff is the Review composition; states are the composition's, for all primitives.

This **supersedes the prior "purify the kind renderers / Kind × Representation" framing.** There are no kind renderers to purify — they collapse onto the base primitives. Artifact (single) composes the SAME base primitives Block (mixed) uses.

The design = the **base-primitive × composition matrix** (which base primitive fills each cell, sourced from the canonical block layer) + the **inventory** (each primitive: EXISTS / EXTRACT / NEW + source + reviewable story route) + the genuinely-new work:
- **The `data` split → Table + KPI + Graph.** The monolithic `data` renderer is three content types fused; AM5 splits it. Table EXISTS (`TablePayload`); KPI + Graph are **EXTRACT** (lifted from the headlines display + the `Sparkline()` SVG buried in `data-renderer.tsx`).
- **The two EXTRACT primitives — KPI + Graph — are the genuinely-new design work.** They get authored/spec'd reviewable stories. Everything else points at an existing block-payload story.
- **The fold / `SplitView`** — the shared origin-preserving split primitive, **extracted from the more-established of the two hand-rolled splits (chat's proportional `flex-row` split, `Conversations.tsx`)** and generalized to a content-agnostic `origin | divider | destination`. Review's fixed-`w-[620px]` `ExaminePane` converges onto it. Founder round-2 fixes applied: even 50/50 panes + one clean draggable divider (no stray separator above a pane); **icon-based** mode controls (not text); **contextual** control set (split → expand + fold-back; full → collapse-only; no "fold to split" when already full). See `approved.md §3`.

> **UPDATE (2026-06-26, founder — authoritative inventory is now `approved.md §1a/§6a`):** the ten EXISTS base primitives (`Heading`/`Paragraph`/`List`/`Quote`/`Divider`/`Code`/`Image`/`Table`/`Html`/`Link`) are now **each its own individual foundation component+story** (barrel-exported thin wrappers over the shipped payloads), reviewable side-by-side — not only stacked under `#Block`. The prior "reviewable via the existing block-payload story" / "Link inline-only, Html composed-only" framing is superseded.

**Code syntax highlighting = TODO, deferred** (K6) — `CodePayload` renders plain mono; AM5 adds no highlighter; a future WP adds one behind the surface. Marked explicitly so it is decided, not forgotten.

---

## Phase 0a — Classify

`DESIGN-CLASS: novel`. AM5 reshapes the base/primitive content-rendering family used app-wide AND authors two new base primitives (KPI, Graph). That clears the `novel` bar (a new essential/base component + a large reframe) — the founder reviews the rendered KPI + Graph variants and the matrix in the viewer. The EXISTS primitives are pure-reuse of the established block-payload stories (no variants drawn); KPI + Graph are tightly-scoped authored stories (extract from existing rendered code, reuse tokens + the existing mono/figure chrome).

## Phase 0b — Reuse inventory (the base-primitive set IS this inventory)

Every content-rendering element AM5 needs is a base primitive sourced from the canonical block-payload layer. Six EXIST there; two are EXTRACTED from the collapsing `data-renderer.tsx`. The matrix (the design's central output) is the reuse inventory.

| Base primitive | Source (canonical layer) | Status | `(Artifact / single)` | `(Review / diff)` | `(Block / mixed)` |
|---|---|---|---|---|---|
| **Text family** (Paragraph/Heading/List/Quote/Divider + inline) | `block/{Paragraph,Heading,List,Quote,Divider}Payload.tsx` + `inline.tsx` | **EXISTS** | a `text` artifact composes the Text family (`deriveBlocks(body)` + the prose primitives) — the flat `text-renderer.tsx` div is removed | `ReviewRenderedInContext` (rendered prose before→after, shared with Html) | the prose sub-grammar in a Block body |
| **Code** | `block/CodePayload.tsx` | **EXISTS** (highlighting = TODO) | a `code` artifact composes Code (`{path,text,lang}` file listing) | Review of two Code instances (`code_diff`) | fenced `code` block |
| **Image** | `block/ImagePayload.tsx` | **EXISTS** | a `image` artifact composes Image | Review of two Image (`visual_diff`) | `image` block |
| **Link** | `block/inline.tsx` link node | **EXISTS** (inline) | a `url`/link artifact composes the inline Link | Review of two Link (`action_operation`·`browser_preview`) | inline link in prose/cells |
| **Html** | `block/HtmlPayload.tsx` | **EXISTS** | a `html` artifact composes Html (sandboxed) | `ReviewRenderedInContext` (`rendered_in_context`) | `html` block |
| **Table** | `block/TablePayload.tsx` | **EXISTS** | part of a `data` artifact (split) | Review of two Table (`field_change_set`) | `table` block |
| **KPI / Stat** | EXTRACT from `kinds/data-renderer.tsx` headlines flex-grid | **EXTRACT** | part of a `data` artifact (split) | Review of two KPI (`metrics_moved`) | (future: a KPI block) |
| **Graph / Sparkline** | EXTRACT from `Sparkline()` SVG in `kinds/data-renderer.tsx` | **EXTRACT** | part of a `data` artifact (split) | Review of two Graph (`metrics_moved` trend) | (future: a graph block) |
| **unknown** (content fallback) | `block/UnknownPayload.tsx` | **EXISTS** | the content fallback (K1) | `ReviewUnknownCanvas` | `unknown` block |

**The data split (K2c).** `data` is not one base primitive — `data-renderer.tsx` fuses a headlines flex-grid, a `rows` table, and `Sparkline()` charts. AM5 splits it: **Table (EXISTS) + KPI (EXTRACT) + Graph (EXTRACT)**. A `data` artifact composes all three. This is the seam future chart types (bar/line/multi-series — NEW, not scoped) extend off the Graph primitive.

**The kind-renderer collapse (K5).** The AE6 `kinds/*-renderer.tsx` layer + `renderer-registry.ts` is **removed**. Before removal, extract KPI + Graph up. The flat `text-renderer.tsx` div is removed (text → Text family). The `url-renderer.tsx` status card collapses (url → inline Link). The `code-renderer.tsx` hunks render moves into the **Review** composition (`code_diff`), and the `code` content shape is purified `{file,hunks}`→`{path,text,lang}`.

**States are COMPOSITION-level, not primitive-level (K0/K0b).** The composition guarantees present content before invoking a base primitive — so base primitives render pure populated content only, with NO empty/error/loading branch. Absence is demonstrated where it belongs: Artifact (single) → `ArtifactPreview`/`ArtifactPreviewSurface`/`ArtifactPermalink`; Review (diff) → review-canvas "no changes"; Block (mixed) → `Block`/`KnowledgeBody` absence. The unknown-content fallback (`UnknownPayload`/`ReviewUnknownCanvas`) is distinct and KEPT — "unknown content" ≠ "no content." (Initial designs render only the populated real state.)

`outcome_summary` and `batch` are **NOT cells** — review *composition* scaffolding (`ReviewOutcomeSummary` frame lead, `ReviewBatch` per-item container). They stay in the review experience.

## Phase 0c — The selection function shape (design intent for the architect)

The map collapses today's selectors into ONE keyed by (content type, composition):

- today: `getRenderer(kind)` (the removed kind-renderer registry) + `getReviewCanvas(kind)` (Review) + `renderPayload(payload)` (Block, dispatched by BlockKind).
- AM5 intent: a renderer is selected by the content type + composition. Artifact composes the matching base primitive; Review composes two + delta; Block composes many. The kind-renderer registry is **removed** — Artifact (single) composes the base primitives directly (the same path Block uses). Per-content fallback (K1) holds in every composition: unknown content → its content fallback (`UnknownPayload` / `ReviewUnknownCanvas`), never blank/crash.

This is a **structure**, not an implementation. The architect designs how Artifact-single resolves a base primitive per kind (replacing the removed `renderer-registry.ts`), how the Review chrome composes the DS diff core, and where the function lives (open question O6).

**Foundation placement (K2b):** base primitives are **foundations in `packages/design-system`**; all three compositions **compose** them. The base primitives, the generic compare-two-instances `diff` core + per-primitive delta renderers, and the `mixed` block composition all live LOW in DS. The **review experience in `web` USES the DS `diff` foundation** and adds only review chrome (PR header / file-bands / approve affordances) — **no parallel content family.** The "two-home / `diff` stays web-local" framing is **retracted**.

## Phase 0d — Surfaces surveyed (Search Before Building)

| # | Surface (file) | Live story | Role |
|---|---|---|---|
| 1 | `block/*Payload.tsx` + `inline.tsx` + `render-payload.tsx` + `Block.tsx` | `#Block` (ONE page, all variants: Heading/Paragraph/List/Quote/Code/Table/Divider/Image/Unknown) + `#Page: Knowledge/Body` (Text family + sanitized Html composed) | The **canonical base-primitive set** — the source AM5 extracts up. EXISTS, verified-loading routes. (Viewer matches `hash === title`; no `#Block/Variant` sub-routes.) |
| 2 | `kinds/*-renderer.tsx` + `renderer-registry.ts` | `#Kinds/*` (7) | The **duplicate** — REMOVED (collapses onto the base primitives). KPI + Graph extracted up from `data-renderer.tsx` first. |
| 3 | `kinds/data-renderer.tsx` (headlines + `Sparkline()`) | `#Kinds/DataRenderer` (`WithHeadlines`/`WithCharts`/`WithRows`) | The **EXTRACT source** for KPI + Graph (and the data split). |
| 4 | `KeyValue.tsx` | `#KeyValue` | Bare label/value — the closest existing analog to KPI, but NOT the headline metric display; KPI is extracted from `data-renderer.tsx`'s figure grid, not `KeyValue`. |
| 5 | `Review*.tsx` + `canvas-registry.ts` (`getReviewCanvas`) | `#Conversations › Review*` | The **Review (diff)** composition — diff core moves DOWN into DS; review chrome stays in `web`. |
| 6 | `ArtifactPreview.tsx` (DS) | `#Artifacts › ArtifactPreview` | The Artifact (single) **host** — header + body composing the base primitive + `discussion` slot. Owns single's states. |
| 7 | `OpenTarget`/`createOpenHandler`/`resolveHostRoute` | n/a (logic) | The open contract — destination half delegates to the resolved composition. Two route seams to fix (H5). |
| 8 | `Conversations.tsx` `SessionViewPanel` split | `#Conversations › Conversations` | Existing split #1 — the proportional model the fold standardizes on. |
| 9 | `review/ReviewComposition.tsx` `ExaminePane` (`w-[620px]`) | `#Conversations › Review*` | Existing split #2 — converges onto the fold. |

**Conclusion:** the canonical content-renderer family already ships as the **block-payload layer** (six base primitives + inline + the unknown fallback, reviewable via the single `#Block` page + the composed `#Page: Knowledge/Body`). The kind-renderer layer is a removable duplicate. The genuinely-new design work is **KPI + Graph (extracted from `data-renderer.tsx`)** and the **fold/`SplitView`**. The authored stories below embody KPI, Graph, and the fold; everything else points at an existing block-payload story. (Link has no standalone story — inline only; Html is reviewed only composed in `#Page: Knowledge/Body`.)

## The authored / spec'd stories (the genuinely-new work)

| Embodiment | Story file (authored ✓) | Viewer route (verified rendering) | Source |
|---|---|---|---|
| **KPI / Stat** base primitive (headline metric figures) | `packages/design-system/src/KpiStat.stories.tsx` (`title: "KpiStat"`, group `Primitives`; variants `SingleMetric`, `MetricRow`) | `http://localhost:8098/#KpiStat` | EXTRACT from `data-renderer.tsx` headlines flex-grid |
| **Graph / Sparkline** base primitive (inline trend chart) | `packages/design-system/src/Sparkline.stories.tsx` (`title: "Sparkline"`, group `Primitives`; variants `Trend`, `Flat`, `Volatile`) | `http://localhost:8098/#Sparkline` | EXTRACT from `Sparkline()` SVG in `data-renderer.tsx` |
| `SplitView` / fold container | `packages/design-system/src/SplitView.stories.tsx` (`title: "SplitView"`, group `System`; variants `Split`, `Full`, `FoldBack`) | `http://localhost:8098/#SplitView` | extract from chat `SessionViewPanel` + review `ExaminePane` |

All presentational (props in, callbacks noop, local UI state). KPI renders the figure grid (`{label, value}`, mono caps label + tabular-nums value) on existing tokens, no new chrome. Sparkline renders the polyline SVG on `--accent-primary`, no new tokens. `SplitView` renders the three closed modes + a wired draggable divider with placeholder labelled panes (content-agnostic).

**The data artifact composes Table + KPI + Graph** — reviewable as a composition once KPI + Graph land (the architect/builder assembles the data Artifact view from the three primitives; the design proves each primitive standalone).

Naming collision flagged: the existing DS `Fold.tsx` is an unrelated disclosure ("Show") component — NOT this split primitive. `SplitView` vs `Fold` naming is open question O7.
