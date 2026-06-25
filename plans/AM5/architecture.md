# AM5 — Architecture: base primitives in DS, Artifact composes them, kind layer COLLAPSED, KPI/Graph extracted, diff-core, fold, pre-alpha purge, cleanup

The technical plan that realizes `plans/AM5/design/approved.md` (LOCKED) within `plans/AM5/concept.md` (LOCKED, hard rules **H1–H5 / K0–K6 / K2b / K2c / K4b / F1–F5**). Concept + design are FIXED — not re-litigated. This plan decides the layer split, exact TS shapes, the new-vs-edited-vs-DELETED file list, and the ordered task list.

**This document SUPERSEDES the entire prior `architecture.md` body** (the "purify the kind renderers / `Representation`-over-the-kind-registry / `getRenderer(kind,representation)`" plan). That plan predates the **foundation decision (2026-06-26)** which RETRACTED "purify the kind renderers." The structural core is now:

1. **The block-payload layer IS the base-primitive set; it is extracted up as THE foundation.** The recent `kinds/*-renderer.tsx` layer + `renderer-registry.ts` (`getRenderer(kind)`) **COLLAPSE — removed, not purified.** **Artifact (single) composes the base primitives directly** — the same `block/*Payload` primitives `Block` (mixed) uses. There is **one** content-renderer family.
2. **KPI + Graph are EXTRACTED** from the collapsing `data-renderer.tsx` into standalone DS base primitives (`KpiStat.tsx`, `Sparkline.tsx`). The monolithic `data` renderer **splits into Table + KPI + Graph** (K2c); a `data` artifact composes all three.
3. **The diff core is a DS foundation** (K2b): `code-renderer.tsx`'s hunks render relocates into `design-system/src/diff/` as the `(code, diff)` core, restructured to expose the **per-line slot seam** the review chrome fills. Review chrome in `web` composes the DS diff core downward; **no parallel kind/canvas content family.**
4. **The `code` content is purified** (`{file,hunks}` → `{path,text,lang}`) with a **pre-alpha PURGE** (clean rewrite, NO migration — DELETE the `artifacts.ts` `code_diff→code` normalization branch, K4b).
5. The shared **`SplitView`/fold** primitive (already extracted into `design-system/src/SplitView.tsx`) + the open-contract plumbing (block-anchor, H5 seams).
6. **Cleanup** of dead artifact/block-render scaffolding (concept Phase 5 / design §6b).

The §CARRY-vs-RETRACT section states exactly what is mined forward from the prior plan and what the foundation decision invalidates. **Read it to understand the delta** — the biggest RETRACT is: the kind renderers are NOT purified-and-kept; they are REMOVED, and the single-cell renderers (`CodeSingleRenderer`, the edited `text-renderer.tsx`, etc.) do NOT exist — Artifact composes the block payloads.

---

## Required reading (the engineer reads ONLY these before implementing)

- `plans/AM5/concept.md` — the locked nouns, closure reads, hard rules **H1–H5 / K0–K6 / K2b / K2c / K4b / F1–F5**, the rejection lists, the vocabulary lock. **K0/K0b (purity + the gate), K2 (kind-renderer collapse), K2b (base primitives + diff core are DS foundations), K2c (the data split), K5 (the collapse) are the load-bearing rules.**
- `plans/AM5/design/approved.md` — the base-primitive × {Artifact/Review/Block} matrix (§1), the inventory + per-primitive individual foundation stories (§1a/§6a), the data split + collapse dispositions (§1b), the open contract delegation (§2), the fold/`SplitView` extraction (§3/§3a), the named gaps (§4), the composition-owned state layer (§5/§5a), the embodiment stories (§6), the cleanup table (§6b), the architect open questions O1–O9 (§8).
- `plans/AM5/design/extraction-proposal.md` — the same matrix + the surface-by-surface KEEP/REMOVE/SPLIT table (§4) + the delta-vs-architecture table (§7). **NOTE:** its §1a "Link/Html have no standalone story" rows are superseded by `approved.md §1a/§6a` (each primitive is now its own individual foundation story). The architecture follows `approved.md`.
- `docs/human-interface-layer/open-contract.md` — the contract doc; its route table + H1–H5 / F1–F5 are ground truth.
- `docs/process-layer/artifact-primitive.md` §Kind purity; `docs/blocks/blockkind-the-closed-vocabulary.md` + `docs/blocks/where-blocks-render.md`.
- Code seams (read the symbol, not the whole file):
  - **REMOVE:** `packages/design-system/src/kinds/{text,code,image,data,html,url,fallback}-renderer.tsx` + `renderer-registry.ts` (+ their `.stories.tsx`).
  - **KEEP / compose:** `packages/design-system/src/block/{CodePayload,ImagePayload,HtmlPayload,TablePayload,Heading,Paragraph,List,Quote,Divider,Unknown}Payload.tsx` + `inline.tsx` + `render-payload.tsx` + `Block.tsx`; `packages/shared/src/blocks/derive-blocks.ts` (`deriveBlocks`); `packages/web/src/pages/knowledge/KnowledgeBody.tsx`.
  - **EXTRACT:** `packages/design-system/src/kinds/data-renderer.tsx` (KPI flex-grid `~71-83`; `Sparkline()` SVG `~28-58`) → `KpiStat.tsx` + `Sparkline.tsx` (stories already inline the target markup: `KpiStat.stories.tsx`, `Sparkline.stories.tsx`).
  - **EDIT:** `packages/design-system/src/ArtifactPreviewSurface.tsx` (the gate's `full`-path dispatch only); `packages/design-system/src/index.ts` (barrel). **NB `ArtifactPreview.tsx`/`ArtifactGalleryCard.tsx` need NO edit** — they pass `kind`/`preview` to `ArtifactPreviewSurface`; the gallery path uses `getKindDefinition().summarize()`, NOT `getRenderer`, so it is unaffected by the collapse.
  - **PURGE:** `packages/shared/src/kinds/code.ts`; the 15 code consumers (§4); `packages/server/src/schemas/artifact-preview.ts` + `packages/server/src/routes/artifacts.ts` (DELETE only the `code_diff→code` re-inject *branch*; the shared `OLD_KIND_MAP` STAYS).
  - **REVIEW:** `packages/web/src/pages/review/{review-artifact.ts,canvas-registry.ts,ReviewComposition.tsx,ReviewCodeDiff.tsx,ReviewVisualDiff.tsx,ReviewMetricsMoved.tsx,ReviewFieldChangeSet.tsx,ReviewRenderedInContext.tsx,ReviewActionOperation.tsx,ReviewBrowserPreview.tsx,ReviewOutcomeSummary.tsx,ReviewBatch.tsx,ReviewUnknownCanvas.tsx}`.
  - **CONTRACT/FOLD:** `packages/shared/src/part.ts`; `packages/web/src/services/{open-handler,host-route}.ts`; `packages/web/src/pages/{Conversations,KnowledgeDetail}.tsx`; `packages/design-system/src/SplitView.tsx` (already extracted) + `UnifiedSplitView.stories.tsx`.
  - **DELETE:** `packages/web/src/shell/ArtifactView.tsx` (+ `.stories.tsx`, `ArtifactView.test.tsx`, `ArtifactView.metadata.test.tsx`, `shell/__fixtures__/artifact-view-family.ts`).
  - **CLEANUP:** `ArtifactSection.tsx:212`, `KnowledgeBody.tsx:44/103/139`, `AssistantOverlay.tsx:188-204` + `BlockRefEmbed.tsx`, `TaskSheet.tsx:80-97/201-204/338-366` + caller `WorkBet.tsx:1666`.

---

## Plan reconciliation (spec ⇆ reality) — every named symbol verified against source on this branch

| Concept/design assumption | Reality found (verified) | Plan handles |
|---|---|---|
| The block-payload layer is the canonical base-primitive set; the kind-renderer layer is a duplicate | **Confirmed.** `block/*Payload.tsx` (10 payloads + `inline.tsx` + `render-payload.tsx` + `Block.tsx`) is the full, documented primitive; `kinds/*-renderer.tsx` (7 files) + `renderer-registry.ts` re-renders the same content types. `text-renderer.tsx`'s `@lore AE6` literally says "swap this div for [a Block primitive] when one lands." | Task 3 — REMOVE the kind layer; Artifact composes the block payloads (§1). |
| `getRenderer(kind)` is the artifact single-cell selector, lives in DS | **Confirmed** `renderer-registry.ts:47`. **Production callers (only two):** `ArtifactPreviewSurface.tsx:81` (the single gate) + `ArtifactView.tsx:106` (the shell, DELETED). Plus the barrel re-exports each kind renderer + `getRenderer`. | Task 3 — replace `getRenderer(kind)` in the gate with `composeArtifactBody(kind,preview)` over the block payloads (§2). |
| `ArtifactPreviewSurface.renderBody` is the single composition gate (K0b) | **Confirmed.** `:76-88` — `size==="full"` → `if (preview == null) return <NoPreviewText/>` THEN `getRenderer(kind)` in `RendererErrorBoundary`. The gate ALREADY guarantees content before dispatch. | Task 3 — the gate STAYS; only its dispatch target changes (kind renderer → block-payload composition). |
| `data` renderer fuses headlines + rows-table + sparklines | **Confirmed** `data-renderer.tsx`: headlines flex-grid (`:71-83`), a `rows` table (`:85-101`), `Sparkline()` charts (`:28-58`,`:102-113`). `Sparkline()` is NOT exported. | Tasks 2/5 — EXTRACT `KpiStat`+`Sparkline`; `data` composes Table+KPI+Graph (§3). |
| `KpiStat.tsx` / `Sparkline.tsx` components exist | **They do NOT** — only `KpiStat.stories.tsx` + `Sparkline.stories.tsx` exist (each inlines the target component locally). They are NOT in the barrel. The stories ARE the design artifact; the components are the EXTRACT build target. | Task 5 — author `KpiStat.tsx`+`Sparkline.tsx`; stories import them. |
| `data` `rows` shape vs `TablePayload` | **MISMATCH (⚠️-DATA).** `data.ts` `rows: Record<string,string>[]`; `TablePayload` takes `header: InlineNode[][]`, `rows: InlineNode[][][]`. The two are NOT prop-compatible. | §3 — the data `rows` table is NOT a drop-in of `TablePayload`; flagged (⚠️-DATA). |
| `code` preview is diff-shaped (the K0 SHAPE violation) | **Confirmed.** `code.ts:18-22` `codePreviewSchema = {kind:"code", file, hunks}`. `displayTitle`→`file`; `summarize`→`file (+adds -dels)`. | Task 3 — purify to `{path,lang,text}`; relocate the diff render to the DS `(code,diff)` core. |
| The kind renderers each carry an `if(!preview)`/empty STATE branch | **Confirmed** (text `:24`, code `:47/:51`, image `:16`, data `:61`, html `:21`, url `:26`, fallback's TWO are the K1 content fallback). **All go with the layer** — the composition (the gate) already owns absence. | Task 3 — removed by deletion, not by editing. |
| `code-renderer.tsx` declares its OWN local `{file,hunks}` type | **Confirmed** `:16-20` — NOT imported from `@hyperidle/shared`. So purifying `code.ts` does NOT break the diff render. | Task 2 — relocate `code-renderer.tsx` as the DS `(code,diff)` core (local type stays). |
| The review canvases are deeply chrome-entangled, NOT thin two-content cells | **Confirmed.** `ReviewCodeDiff.tsx` (≈800 LOC) interleaves the hunks delta with `useReviewAnchors`/`InlineComposer`/`AnchoredThreadCard`/PR header/CI checks/relevance bands. The DS `(code,diff)` core is a NEW extraction exposing a **per-line slot seam**, NOT a file-move. | §4 — the DS diff-core extraction; per-canvas partition; S2 staging (`code` first). |
| `getReviewCanvas` is web-local; `ReviewCanvasProps = { artifact: ReviewArtifact }` | **Confirmed** `canvas-registry.ts` + `review-artifact.ts`. 9 canvases incl. `outcome_summary`+`batch`. | §4 — `getReviewCanvas` stays as the review-CHROME registry; composes the DS diff core. `ReviewArtifact` stays in `web`. |
| `SplitView.tsx` location | **Already extracted into `packages/design-system/src/SplitView.tsx`** (barrel-exported `:158-159`; imported by `SplitView.stories.tsx` + `UnifiedSplitView.stories.tsx`). The design phase placed it in DS, NOT `web`. | §5 — `SplitView` is DS-owned (content-agnostic, no `web` import); `web` surfaces compose it. Prior plan's "relocate to `web`" RETRACTED. |
| H5 routes: `artifact → /artifacts/:id`; `task → via parent bet` | **Confirmed.** `host-route.ts:18` 2-arg, no `betId`; today `artifact → /work/artifact/:id` (`:27`, DEAD), `task → /work/task/:id` (`:23`, DEAD). Real artifact route `/artifacts/:id`. | §5 — `artifact → /artifacts/:id`; `task → null` (BLOCKER-1). |
| `OpenTarget.host` carries no `blockId` | **Confirmed** `part.ts:204` host variant `{route:"host",hostKind,hostId}`; `inlineRefToEmbed` block case (`:273-276`) drops `ref.blockId`. | §5 block-anchor — optional `blockId` + thread it + `#block-<id>` + scroll. |
| `Block` renders `data-block-id`; `KnowledgeBody`/`text-blocks-renderer.stories` derive via `deriveBlocks` | **Confirmed.** `Block.tsx:109` `data-block-id={id}`; `text-blocks-renderer.stories.tsx` proves `deriveBlocks(body,{kind:"artifact",id})` + `Block`. | Task 3 reuses for `text` artifact; Task 7 scrolls to the derived block by id. |
| Hand-rolled splits exist | **Confirmed — THREE.** Chat dial-in + session-open (`Conversations.tsx`, `flex-[3]`/`flex-[2]`, `border-r`); review `ExaminePane` (`ReviewComposition.tsx`, `w-[620px]`+`border-l`). None resizes/full-screens. | Task 6 — reconcile all three onto `SplitView`. |
| `ArtifactView.tsx` shell is a second `getRenderer(kind)` dispatcher | **Confirmed** `:106`. **No production code constructs `<ArtifactView>`** (`ArtifactEmbed.tsx` documents a `viewSlot?` typed to it, but `viewSlot=` grep is EMPTY — `viewSlot ?? summary` always falls to summary). Its `data-component='ArtifactView'` is referenced by E2E specs (local-only). | Task 3 — DELETE shell+story+2 tests; update `ArtifactEmbed.tsx` lore comment; re-point the two `[data-component='ArtifactView']` E2E specs + DELETE `AI6-renderer-parity.spec.ts` (local-only). |
| `closed-view-family.test.ts` allows exactly 8 `Artifact*` names | **Confirmed** `:18-28`. The kind-layer removal does NOT touch this allowlist (kind renderers are not `Artifact*`); `ArtifactView` is a `web/shell` file, not a DS `Artifact*` — its deletion does not change the DS allowlist. | Task 3 — `closed-view-family.test.ts` stays green. |

**Net-new symbols:** the pure `code` preview schema (`{path,lang,text}`); `KpiStat.tsx` + `Sparkline.tsx` (EXTRACT base primitives, barrel-exported); `composeArtifactBody(kind, preview)` (the single-home Artifact composition over the block payloads — REPLACES `getRenderer(kind)`); a `data`-artifact composition (Table + KPI + Graph); the DS `(code,diff)` diff core (`design-system/src/diff/code-delta-renderer.tsx` + `DiffLineRef`/`CodeDeltaProps` per-line slots) + `getDiffRenderer(kind)` + `UnknownDiff`; one optional `OpenTarget.blockId` field; one `open-handler` fragment; one `KnowledgeDetail` scroll effect; two `host-route.ts` edits; a `useUiPreference` ratio hook for `SplitView`. **DELETED symbols:** the 7 kind renderers + `renderer-registry.ts` + `getRenderer` + their barrel exports + their stories; the `ArtifactView` shell. Purifying `code` re-shapes the shared schema AND the **server ingest validator** (Meta-layer contract delta). **Pre-alpha (K4b): NO migration — the `artifacts.ts` `code_diff→code` re-inject *branch* is DELETED; the shared `OLD_KIND_MAP` (13 legacy kinds) STAYS.** No new API.

---

## BLOCKERs & ⚠️ UNVERIFIED (scrutinize in critique / human-design-review)

- **BLOCKER-1 — concept-H5 `task` clause deviation. FOUNDER SIGN-OFF REQUIRED (O1).** Concept **H5** prescribes `task → /work/bet/:betId/task/:taskId`. That route exists but `resolveHostRoute(hostKind, hostId)` has **no `betId` in scope** and a task `host` `OpenTarget` carries no `betId`. **Resolution: `resolveHostRoute("task") → null`** (documented no-op, identical to `user`/`factory`) — satisfies H5's operative invariant ("no reference resolves to a non-existent route") + H3. **No AM5 AC requires task navigation** (verified `TRACK-AM.md §AM5` — ACs cover artifact/block/review only). 🚩 Founder chooses: **(a)** accept the no-op (H5's literal "via parent bet" deferred to a future `betId`-on-task-ref WP); or **(b)** schedule that WP now. CARRIED.

- **⚠️-DATA — the `data` `rows` table is NOT a drop-in onto `TablePayload`.** `data.ts` `rows: Record<string,string>[]` (a free-form key/value grid, no header/align); `TablePayload` takes `header: InlineNode[][]` + `rows: InlineNode[][][]` (a GFM table of inline nodes). They are **not prop-compatible**. The K2c "data composes Table" is the *content-type* split, not a literal `TablePayload` reuse for this freeform-rows shape. **Disposition:** the `data` artifact composes (a) **KPI** (the headlines, via the new `KpiStat`), (b) **Graph** (the charts, via the new `Sparkline`), and (c) the **rows table rendered by the data composition itself** (the existing `data-renderer.tsx` rows-table markup `:85-101`, lifted into the data composition — it is a plain freeform table, not GFM). `TablePayload` is the base primitive a *block* `table` and a GFM artifact table compose; the freeform `data.rows` grid is a different table shape that does NOT route through `TablePayload`. The concept's "Table (EXISTS)" cell for `data` is satisfied by the lifted rows-table markup, NOT by forcing `data.rows` through `TablePayload`. **🚩 The critique confirms this reading** (alternative: convert `data.rows` → `InlineNode[][][]` to genuinely reuse `TablePayload` — higher cost, a content-shape change beyond AM5 scope; rejected here). ⚠️ flagged.

- **⚠️ EXTRACTION — the DS diff-core extraction is the biggest ⚠️ (carried from the prior plan, unchanged by the foundation decision).** The review canvases are deeply chrome-entangled; the DS `(code,diff)` core is a NEW extraction exposing a **per-line slot seam** (§4.3), NOT a file-move. The §4.3 slot seam preserves the AL1/AL2 review DOM. S2 (extract `code` first, stage the rest) recommended. **🚩 The critique judges S1-vs-S2 scope.** CARRIED.

- **⚠️ UNVERIFIED — the relocated `(code,diff)` core's prop contract.** `code-renderer.tsx` declares its OWN local `{file,hunks}` type (`:16-20`, NOT shared) — so purifying `code.ts` does NOT break it. It is RECLASSIFIED as the DS `(code,diff)` core; the review's `ReviewCodeDiff` (`CodeDiffPayload` in `review-artifact.ts`) becomes the chrome wrapper that fills its slots. The DS core takes `{ delta: CodeDelta }` + per-line slots — NOT `{ artifact: ReviewArtifact }` (no `Artifact`/`ReviewArtifact` merge). **Verify at build.** CARRIED.

- **⚠️ UNVERIFIED — React 18 scroll-on-mount timing for block-anchored open.** Scroll runs in a `useEffect` after `KnowledgeBody` renders. **Reuse the `scrollIntoView?.()` optional-call guard** (jsdom leaves it undefined; precedent `HostThreadSection.tsx`, `WorkBet.tsx`). The AC2 test flushes rAF under `act()`. Cite https://react.dev/reference/react/useEffect. CARRIED.

- **⚠️ The K0b enforcer is the scoped ESLint gate, NOT the type system — but it is now LIGHTER.** Because the kind renderers are DELETED (not edited to be pure), there is no `if(!preview)` early-return to forbid inside a `kinds/*-renderer.tsx` that no longer exists. The K0b property to enforce is **negative existence**: no `kinds/*-renderer.tsx` + no `getRenderer` export survive. That is a `npm run check`/`knip` + a targeted test asserting the barrel no longer exports `getRenderer`/`*Renderer` — not a `no-restricted-syntax` body rule. The composition (`composeArtifactBody`) is pure by construction (the gate guarantees content before it). **The K0b "non-optional content prop" is documentation; the structural gate is the deletion + the negative-existence test.** CARRIED-MODIFIED (the prior plan's `no-restricted-syntax`-in-kind-renderers rule is RETRACTED — the files are gone).

- **⚠️ DOMPurify-in-DS for the `text` artifact composition (Task 3).** A `text` artifact composes the Text family via `deriveBlocks(body)` + `Block`; `Block`/`render-payload` downgrades `html` blocks to `UnknownPayload` when `sanitizeHtml` is absent. The Artifact composition must supply `sanitizeHtml`. **Confirm DOMPurify is already a `design-system` dependency before importing it there** — else thread `sanitizeHtml` IN as it is for `KnowledgeBody` (route it from the artifact host in `web`, or via a DS-level injected default). Build-time hard gate for Task 3. CARRIED.

---

## Layer / file split

AM5 keeps its internal `shared`(types/schemas) → `design-system`(base primitives + composition + diff core) → `web`(pages/contract/review chrome) discipline; no upward dep (`design-system ↛ web`). **The foundation decision HONORS the boundary cleanly:** the base primitives, the Artifact composition, the diff core, and `SplitView` all live in `design-system` (below the boundary); `web` review chrome imports the diff core DOWNWARD. **One declared cross-layer consequence:** purifying the shared `code` schema re-shapes the **server (Meta-layer) ingest/read validator** — a clean pre-alpha rewrite (K4b), NOT a leak past a neighbor (`shared` is the source both layers consume).

### Layer A — base primitives + the Artifact composition + the gate (`packages/design-system` + `packages/shared`)

| File | New/Edit/DELETE | Change |
|---|---|---|
| `packages/design-system/src/kinds/{text,code,image,data,html,url,fallback}-renderer.tsx` | **DELETE (Task 3)** | The kind-renderer duplicate (K5). EXTRACT KPI + Graph out of `data-renderer.tsx` FIRST (Task 1); relocate `code-renderer.tsx`'s hunks render to the DS diff core (Task 2) BEFORE deleting it. |
| `packages/design-system/src/kinds/renderer-registry.ts` | **DELETE** | `getRenderer(kind)` is removed (K5). Replaced by `composeArtifactBody` (the Artifact composition). |
| `packages/design-system/src/kinds/{text,code,data,html,url,fallback,image,code-single,text-blocks}-renderer.stories.tsx` | **DELETE** | The kind-renderer stories retire with the layer (`#Kinds/*`). The replacement reviewable surfaces are the individual foundation stories (`#Heading … #Link`, `#KpiStat`, `#Sparkline`) + `#Artifacts › ArtifactPreview`. |
| `packages/design-system/src/kinds/compose-artifact-body.tsx` | **New** | `composeArtifactBody(kind: string, preview: unknown): JSX.Element` — the single-home Artifact (single) composition. Dispatches per kind to the matching base primitive(s): `text`→`deriveBlocks(body)`+`Block` stream; `code`→`CodePayload`; `image`→`ImagePayload`; `html`→`HtmlPayload` (+ `sanitizeHtml`); `url`→inline `Link` (via `renderInline`); `data`→KPI+rows-table+Graph composition; unknown→`UnknownPayload` (K1). Pure of states (the gate guarantees content). Exported from `index.ts`. (§2) |
| `packages/design-system/src/KpiStat.tsx` | **New (EXTRACT)** | The KPI/Stat base primitive — the headlines flex-grid lifted from `data-renderer.tsx:71-83` (mono caps label + tabular-nums value, existing tokens, no new chrome). `KpiStat.stories.tsx` imports it (today inlines it). Barrel-export `KpiStat` + `KpiStatProps`. |
| `packages/design-system/src/Sparkline.tsx` | **New (EXTRACT)** | The Graph/Sparkline base primitive — the `Sparkline()` SVG lifted from `data-renderer.tsx:28-58` (80×24 polyline over `--accent-primary`, auto-scaled, no new tokens). `Sparkline.stories.tsx` imports it. Barrel-export `Sparkline` + `SparklineProps`. |
| `packages/shared/src/kinds/code.ts` | **Edit (in Task 3)** | **Purify (K0/K4/K5).** Replace `codePreviewSchema` (`{file,hunks}`) with pure `{kind:"code", path, lang, text}`. `displayTitle`→`path`; `summarize`→a content one-liner (first line / `path`, NO `+adds/-dels`). The diff `{file,hunks}` leaves the Kind. **Purified INSIDE Task 3 (folded from Task 4)** so `composeArtifactBody`'s `code` arm references the pure shape at Task-3 time (critique CRITICAL — Task 3/4 ordering). |
| `packages/design-system/src/ArtifactPreviewSurface.tsx` | **Edit** | The gate (K0b) STAYS. Replace `getRenderer(kind)` + `<Renderer preview kind/>` (`:81-86`) with `composeArtifactBody(kind, preview)`. `preview == null → NoPreviewText` + `RendererErrorBoundary` unchanged (the composition's owned states). Drop the `getRenderer` import. |
| `packages/design-system/src/index.ts` | **Edit** | Remove the kind-renderer barrel block (`:101-117` — `CodeRenderer`/`DataRenderer`/`FallbackRenderer`/`HtmlRenderer`/`ImageRenderer`/`TextRenderer`/`UrlRenderer`/`RendererComponent`/`RendererProps`/`getRenderer`). Add `KpiStat`/`Sparkline`/`composeArtifactBody` exports. Keep `SplitView`/`FoldMode` (`:158-159`). |

### Layer B — the DS diff core (`packages/design-system/src/diff/`) — the foundation extraction

| File | New/Edit/relocate | Change |
|---|---|---|
| `packages/design-system/src/kinds/code-renderer.tsx` → `packages/design-system/src/diff/code-delta-renderer.tsx` | **relocate + restructure (the per-line slot seam, §4.3)** | The DS `(code,diff)` delta renderer — the hunks STRUCTURE (hunk headers + per-line add/del/ctx tints + `data-diff-type`) rendered via per-line render-prop slots (`renderLineGutter`/`renderLineAffordance`/`renderLineBelow`/`renderTrailing`). Local `{file,hunks}` `CodeDelta` type stays (NOT shared). NO empty/error/no-changes branch ("no changes" is owned one level up). NOT a drop-in for the review DOM — the slot seam is what lets the review compose it without DOM regression. |
| `packages/design-system/src/diff/{image,html,data}-delta-renderer.tsx` | **New (scoped — S2 staging)** | Compose-two-base-primitive-instances delta renderers: `image` before→after, `html` rendered before→after, `data` trend/sparkline + per-field delta. Pure (no chrome, no state). **S2: stage these after `code`.** |
| `packages/design-system/src/diff/select-diff.ts` | **New** | `getDiffRenderer(kind): DiffRendererComponent` + per-kind fallback (K1) → an `UnknownDiff` delta fallback. The `diff`-composition selector, DS-owned. Exported from `index.ts`. |

### Layer C — review CHROME (`packages/web/src/pages/review`) — composes the DS diff core

| File | New/Edit | Change |
|---|---|---|
| `packages/web/src/pages/review/canvas-registry.ts` | **Edit (intent) / no-code-move** | `getReviewCanvas` stays as the review-CHROME registry. Each canvas composes the DS diff core for its kind's delta. `ReviewCanvasKind` is documented as a mapping onto `(kind, diff)` (`code_diff→(code,diff)`, `visual_diff→(image,diff)`, `metrics_moved`·`field_change_set→(data,diff)`, `rendered_in_context→(html,diff)`/`(text,diff)`, `action_operation`·`browser_preview→(url,diff)`); `outcome_summary`+`batch` stay composition scaffolding (K2). |
| `packages/web/src/pages/review/ReviewCodeDiff.tsx` | **Edit (S2 — first canvas)** | Composes the DS `(code,diff)` core, FILLS the four §4.3 per-line slots with its dual gutter / `+` button / `InlineComposer` / `AnchoredThreadCard` / orphan pass so the review DOM is byte-preserved. The chrome (PR header, file bands, relevance ordering, reviewed checkboxes, `CanvasSourceHeader`) stays. |
| `packages/web/src/pages/review/Review{VisualDiff,MetricsMoved,FieldChangeSet,RenderedInContext,ActionOperation,BrowserPreview}.tsx` | **Edit (S2 fast-follow)** | Stage per §4.2 — each composes its DS delta core; the richest (`action_operation`/`browser_preview`) keep more chrome (status polling, operation timeline, live iframe). |
| `packages/web/src/pages/review/review-artifact.ts` | **No change** | `ReviewArtifact` + per-family `*Payload` types stay in `web` (review-chrome data shapes; NOT a kind vocabulary). No `Artifact`/`ReviewArtifact` merge. |

### Layer D — base-primitive individual foundation stories (DS — design artifacts, builder re-blesses)

| File | New/Edit | Change |
|---|---|---|
| `packages/design-system/src/block/{Heading,Paragraph,List,Quote,Divider,Code,Image,Table,Html}.stories.tsx` (+ a `Link` story) | **New (thin wrappers, per `approved.md §1a/§6a`)** | Ten individual foundation stories (`#Heading … #Link`), each a thin wrapper over the shipped `block/*Payload.tsx` (+ `renderInline` for the inline `Link`). Barrel-export each payload + `renderInline` from `index.ts`. **Design phase verified these render; the builder authors/wires + re-blesses.** Populated state only. (NB: `KpiStat.stories.tsx`/`Sparkline.stories.tsx` already exist — Task 5 backs them with the extracted components.) |

> **Scope note (designer vs builder).** The individual foundation stories + `KpiStat.stories.tsx` + `Sparkline.stories.tsx` + `SplitView.stories.tsx` + `UnifiedSplitView.stories.tsx` are the design artifacts (some already authored). The DESIGNER's job ended at "a story that renders." The BUILDER authors the missing `*.stories.tsx` wrappers, extracts `KpiStat.tsx`/`Sparkline.tsx`, wires the production composition, and re-blesses the snapshot net + recomputes BOTH enumeration guard floors (`:73` → 52, `:223` → 51; net enumerated delta −9, see §1.3 — the new `src/block/*.stories.tsx` wrappers are NOT in the net's flat-root glob, so they do not raise the count).

### Layer E — open contract + fold + block anchor (`packages/shared` + `packages/web`)

| File | New/Edit | Change |
|---|---|---|
| `packages/web/src/services/host-route.ts` | **Edit** | **H5:** `artifact → /artifacts/:id` (was `/work/artifact/:id`, `:27`); `task → null` (BLOCKER-1, was `/work/task/:id`, `:23`). Other cases unchanged. |
| `packages/shared/src/part.ts` | **Edit** | Add optional `readonly blockId?: string` to the `host` `OpenTarget` variant (`:204`); `inlineRefToEmbed` block case (`:273-276`) threads `ref.blockId`. Route set stays CLOSED `host\|artifact\|review\|session`. |
| `packages/web/src/services/open-handler.ts` | **Edit** | `case "host"` (`:61-65`): when `target.blockId` present, navigate `${path}#block-<encodeURIComponent(id)>`. No new route discriminant. |
| `packages/design-system/src/SplitView.tsx` | **Edit (props finalize) — already extracted** | The shared fold primitive ALREADY lives here (content-agnostic, draggable divider, modes `fold-back\|split\|full`). Finalize: add `surfaceKey: string` to `SplitViewProps` for per-surface ratio persistence; confirm `data-ds-component="split-view"`. Stays in DS (NO `web` import — F4). |
| `packages/web/src/hooks/useUiPreference.ts` | **New (or reuse)** | `useUiPreference(surfaceKey, defaultRatio)` → `[ratio, setRatio]`, `localStorage`-backed (`hyperidle.split.<surfaceKey>`), clamp 0.2–0.8, NaN-safe. **Grep for an existing preferences store FIRST.** Lives in `web` (the persistence + page-context concern); `SplitView` itself stays presentational (props in). |
| `packages/web/src/pages/Conversations.tsx` | **Edit** | Reconcile BOTH chat splits onto `SplitView`: dial-in (`surfaceKey="conversation.dial-in"`) + session-open (`surfaceKey="conversation.session"`). |
| `packages/web/src/pages/review/ReviewComposition.tsx` | **Edit** | Reconcile `ExaminePane` onto `SplitView`: drop fixed-`w-[620px]` + `border-l`, keep canvas content + `Esc`-close + row-toggle; `surfaceKey="review"`. |
| `packages/web/src/pages/KnowledgeDetail.tsx` | **Edit** | Read `useLocation().hash`, parse `#block-<id>`, scroll the matching DERIVED block (`blocks.find(b=>b.id===decoded)`) into view after render (rAF + `scrollIntoView?.()` guard). No selector concat. |

### Layer F — DELETE + cleanup (lands ATOMICALLY inside its task, not as a terminal sweep)

| File | New/Edit/DELETE | Change |
|---|---|---|
| `packages/web/src/shell/ArtifactView.tsx` (+ `.stories.tsx`, `ArtifactView.test.tsx`, `ArtifactView.metadata.test.tsx`, `shell/__fixtures__/artifact-view-family.ts`) | **DELETE (Task 3)** | Retire the redundant shell dispatcher (the second `getRenderer` caller). No runtime mount (`viewSlot=` grep empty). Delete atomically with the kind-layer removal. Update the `viewSlot` lore comment in **`packages/design-system/src/ArtifactEmbed.tsx`**. Re-point the two `[data-component='ArtifactView']` E2E specs (`L11-rich-messages.spec.ts`, `R9-action-prominence.spec.ts`) — local-only, builder re-points when the spec next runs. |
| `packages/web/e2e/AI6-renderer-parity.spec.ts` | **DELETE (Task 3)** | The kind↔block renderer-parity E2E (navigates `#Kinds%2FImageRenderer`/`#Kinds%2FCodeRenderer`). The collapse 404s those routes AND voids the parity premise (no kind layer to compare). DELETE, not re-point (critique WARNING). Local-only lane. |
| Cleanup sites (Task 8) | Edit/Wire/Remove | `ArtifactSection.tsx:212` (WIRE), `KnowledgeBody.tsx:44/103/139` (WIRE), `AssistantOverlay.tsx:188-204` + `BlockRefEmbed.tsx` (WIRE), `TaskSheet.tsx:80-97` (VERIFY-THEN-REMOVE — props LIVE at `:201-204`/`:338-366`) + `WorkBet.tsx:1666` caller. |

---

## Key type shapes (the contracts the implementation must match)

```ts
// 1. PURE code Kind preview (packages/shared/src/kinds/code.ts — REPLACES the diff schema, K0/K5)
export const codePreviewSchema = z.object({
  kind: z.literal("code"),
  path: z.string(),
  lang: z.string().nullable(),
  text: z.string(),
});
export type CodePreview = z.infer<typeof codePreviewSchema>; // pure single content

// 2. The Artifact (single) composition — REPLACES getRenderer(kind) (K2/K5)
//    packages/design-system/src/kinds/compose-artifact-body.tsx (NEW)
//    Composes the matching base primitive(s) per kind, directly — the SAME block
//    payloads Block (mixed) composes. Pure of states (the gate guarantees content).
export function composeArtifactBody(
  kind: string,
  preview: unknown,             // guaranteed non-null by ArtifactPreviewSurface's gate (K0b)
  sanitizeHtml?: (raw: string) => string,
): JSX.Element;
// PER-KIND FIELD MAPPING (verified against the REAL Kind preview schemas on this branch —
//   url.ts/html.ts/image.ts/code.ts + ImagePayload.tsx + inline.tsx). composeArtifactBody
//   ADAPTS each preview's schema fields to its base-primitive's prop names; the field names
//   below are the SOURCE schema fields, the props are the TARGET primitive props.
//   text  → deriveBlocks(preview.body, host).blocks.map(b => <Block payload={b.payload} sanitizeHtml/>)   (Text family)
//   code  → <CodePayload lang={preview.lang} text={preview.text} />                 // (pure shape — Task 4; see ordering note)
//   image → <ImagePayload url={preview.url} alt={preview.alt ?? ""} title={preview.title ?? null} />
//             // image.ts: {url, width, height, alt?} — NO `title`. ImagePayloadProps requires
//             // alt:string + title:string|null (both non-optional) → COALESCE: alt ?? "", title ?? null.
//   html  → <HtmlPayload raw={preview.html} sanitizeHtml={…} />                      // html.ts field is `html`; HtmlPayload PROP is `raw`. (or UnknownPayload when sanitizeHtml absent)
//   url   → renderInline([{type:"link", href: preview.url, children:[{type:"text", value: preview.url}]}])
//             // url.ts field is `url` (NOT `href`); the inline `link` NODE field IS `href`.
//             // renderInline takes an InlineNode[] ARRAY; `link` requires non-empty `children`.
//   data  → <section><KpiStat metrics={headlines}/> {rows-table} {charts.map(Sparkline)}</section>
//   else  → <UnknownPayload raw={…} reason="unrecognised-kind" />                   (K1)

// 3. KPI / Stat base primitive (packages/design-system/src/KpiStat.tsx — NEW, EXTRACT)
export interface KpiStatProps { metrics: ReadonlyArray<{ label: string; value: string }>; }
export function KpiStat(props: KpiStatProps): JSX.Element;        // no state branch (K0)

// 4. Graph / Sparkline base primitive (packages/design-system/src/Sparkline.tsx — NEW, EXTRACT)
export interface SparklineProps { values: ReadonlyArray<number>; label: string; }
export function Sparkline(props: SparklineProps): JSX.Element;    // no state branch (K0)

// 5. The DS diff core — owned LOW in design-system (K2b). Per-line slots preserve the
//    AL1/AL2 review DOM (§4.3). Delta type stays local ({file,hunks}); NOT a ReviewArtifact.
export interface DiffLineRef {
  readonly hunkIndex: number; readonly lineIndex: number;
  readonly kind: "add" | "del" | "ctx";
  readonly oldNo: number | null; readonly newNo: number | null; readonly text: string;
}
export interface CodeDeltaProps {
  readonly delta: CodeDelta;                                 // local {file,hunks}
  readonly renderLineGutter?: (ref: DiffLineRef) => ReactNode;
  readonly renderLineAffordance?: (ref: DiffLineRef) => ReactNode;
  readonly renderLineBelow?: (ref: DiffLineRef) => ReactNode;
  readonly renderTrailing?: () => ReactNode;
}
export type DiffRendererComponent = ComponentType<{ readonly delta: unknown; readonly kind: string }>;
export function getDiffRenderer(kind: string): DiffRendererComponent; // per-kind fallback → UnknownDiff

// 6. OpenTarget block anchor (packages/shared/src/part.ts — host variant only)
| { readonly route: "host"; readonly hostKind: BlockHostKind; readonly hostId: string; readonly blockId?: string }

// 7. SplitView (packages/design-system/src/SplitView.tsx — already extracted; finalize props)
export type FoldMode = "fold-back" | "split" | "full";        // CLOSED (F5)
export interface SplitViewProps {
  origin: JSX.Element;
  destination: JSX.Element;
  mode: FoldMode;
  dividerRatio: number;                                       // 0.2..0.8 origin share in `split`
  onModeChange?: (mode: FoldMode) => void;
  onRatioChange?: (ratio: number) => void;
  surfaceKey?: string;                                        // per-surface ratio persistence (O2)
}
```

No schema migration (pre-alpha purge), no API endpoint, no DB change. The pure `code` preview, `OpenTarget.blockId`, `FoldMode` are in-memory / render-time; the only persisted value is the `localStorage` divider ratio.

**Why there is NO `Representation` type now (RETRACTED).** The prior plan introduced `Representation = single|diff|mixture` + `getRenderer(kind, representation)` over a 3-registry merge. The foundation decision RETRACTS this: there is no kind-renderer registry to key, and Artifact/Review/Block are not a runtime selection axis over one renderer — they are three *distinct composition entry points* (`composeArtifactBody` / `getReviewCanvas`-composes-`getDiffRenderer` / `renderPayload`), each composing the same base primitives. The "composition" is the call site, not a runtime enum. (Concept: composition is CLOSED at three, but it is structural, not a `Representation` literal threaded through a registry.)

---

## 1. The kind-renderer collapse (K2/K5 — the load-bearing core)

**The rule (K5):** the AE6 `kinds/*-renderer.tsx` layer + `renderer-registry.ts` is **removed, not purified.** Artifact (single) composes the base primitives (block payloads) directly. Before removal: **EXTRACT KPI + Graph** (Task 1) and **relocate `code-renderer.tsx`'s hunks render** to the DS diff core (Task 2). The collapse itself + the `code.ts` purify are Task 3.

### 1.1 Disposition per removed file (verified)

| Removed file | Replacement (where its content goes) |
|---|---|
| `text-renderer.tsx` (flat `whitespace-pre-wrap` div, `:30-36`) | `composeArtifactBody("text",…)` → `deriveBlocks(body)` + `Block` stream (the Text family). The flat div is insufficient (its own `@lore AE6` asked for this). §2. |
| `code-renderer.tsx` (hunks, local `{file,hunks}`) | hunks render **relocates** to the DS `(code,diff)` core (Layer B, §4.3, Task 2); `code` artifact composes `CodePayload` (Task 3). |
| `image-renderer.tsx` | `composeArtifactBody("image",…)` → `ImagePayload`. |
| `data-renderer.tsx` | **EXTRACT KPI + Graph first** (Task 1), then removed (Task 3); `composeArtifactBody("data",…)` → KPI + rows-table + Graph (§3, Task 5). |
| `html-renderer.tsx` | `composeArtifactBody("html",…)` → `HtmlPayload` (+ `sanitizeHtml`). |
| `url-renderer.tsx` (status card) | `composeArtifactBody("url",…)` → inline `Link` (`renderInline`). The status card was a different concern (collapsed). |
| `fallback-renderer.tsx` | `composeArtifactBody`'s default → `UnknownPayload` (K1 content fallback). The fallback's two absence branches become `UnknownPayload`'s. |
| `renderer-registry.ts` (`getRenderer`) | DELETED — `composeArtifactBody` replaces it. |

### 1.2 The composition gate (K0b) — who owns absence (UNCHANGED by the collapse)

- **Artifact (single):** `ArtifactPreviewSurface.renderBody:76-88` already gates `preview == null → NoPreviewText` BEFORE dispatch + error-boundaries it. With the kind layer removed, the gate dispatches to `composeArtifactBody` instead of `getRenderer`. `ArtifactPermalink` `Loading…`/`EmptyState`/`ErrorState`; `ArtifactPreview` `state="populated"|"loading"|"error"`. No new gate.
- **Review (diff):** review canvases own "no changes"/diff-error + `ReviewUnknownCanvas`. The relocated `code-delta-renderer`'s old `hunks.length===0` "no changes" is decided one level up by the review chrome.
- **Block (mixed):** `Block`/`KnowledgeBody` own empty-body + `UnknownPayload`.

### 1.3 Story / snapshot consequence (builder re-blesses; designer does NOT)

The kind-renderer `#Kinds/*` stories retire with the layer. The replacement reviewable surfaces are the individual foundation stories (`#Heading … #Link`, `#KpiStat`, `#Sparkline` — `approved.md §6a`) + `#Artifacts › ArtifactPreview` (carries the Artifact composition + its state stories) + the review-canvas stories. The builder re-blesses (`npm run ds:bless`) and recomputes the enumeration guard floor.

**Snapshot enumeration-guard recomputation (critique CRITICAL — both floors, verified against the real glob + inventory on this branch).** The net enumerates via TWO globs (`catalog-snapshot.test.tsx:51,54`): `../*.stories.tsx` (flat `src/` root ONLY — **NOT recursive**, so `src/block/*.stories.tsx` is NOT enumerated) + `../kinds/*.stories.tsx`. There are TWO guards: `:73` `toBeGreaterThanOrEqual(61)` (primary) and `:223` `toBeGreaterThanOrEqual(60)` (secondary). **Current actual on disk: 70 flat-root + 9 kinds = 79 modules** (both floors are conservative, ~18–19 below actual). The collapse's net delta on the ENUMERATED set:

  - **−9 kinds stories** (all of `kinds/*-renderer.stories.tsx` are deleted in Task 3 — `{text,code,data,html,url,fallback,image,code-single,text-blocks}-renderer.stories.tsx`, verified 9 on disk).
  - **+0 from the EXTRACT/fold/split stories** — `KpiStat.stories.tsx`, `Sparkline.stories.tsx`, `SplitView.stories.tsx`, `UnifiedSplitView.stories.tsx` **already exist at flat `src/` root** (verified) → they are re-pointed (Tasks 1/6), not new files; they are ALREADY counted in the 70.
  - **+0 from the 10 individual foundation stories** — they land in `src/block/*.stories.tsx` (per Layer D / `approved.md §1a`), which the `../*.stories.tsx` flat glob does **NOT** enumerate. ⚠️ They do NOT raise this net's count. (They ARE rendered in the live viewer at `:8098`, which globs `src/` recursively + the block dir, but they do not move THIS guard.)

  **Net enumerated delta = −9.** **New floors:** `:73` → `toBeGreaterThanOrEqual(52)` (61 − 9); `:223` → `toBeGreaterThanOrEqual(51)` (60 − 9). Post-collapse actual = 70 flat + 0 kinds = **70 modules**, so both new floors stay conservatively below actual (no spurious red, no vacuous weakening). **Recomputation RULE the builder applies (in case the flat-root count shifts before build):** `newFloor = currentFloor − (kinds stories deleted) + (NEW flat-`src/`-root stories added) + (NEW `src/kinds/` stories added)`. With this WP: `−9 + 0 + 0`. Update BOTH guard lines (`:73` and `:223`) in the same commit as the `.snap` re-bless. **If the builder MOVES any foundation story into the flat `src/` root** (instead of `src/block/`), add it to the `+NEW flat-root` term accordingly.

---

## 2. Artifact composes the base primitives directly (§2 — REPLACES `getRenderer(kind)`)

`composeArtifactBody(kind, preview, sanitizeHtml?)` is the single-home Artifact (single) composition. It dispatches per kind to the matching base primitive(s) — the SAME block payloads `Block` (mixed) and `renderPayload` use. It is pure of states (the `ArtifactPreviewSurface` gate guarantees `preview != null` and error-boundaries it).

| kind | composes | base primitive (verified source) |
|---|---|---|
| `text` | `deriveBlocks(preview.body, host).blocks.map(b => <Block payload={b.payload} sanitizeHtml/>)` | the Text family — same as `text-blocks-renderer.stories.tsx` proves; `host = { kind:"artifact", id }` (constant id ok — `host.id` lands in provenance only, not the DOM). §3-text. |
| `code` | `<CodePayload lang={preview.lang} text={preview.text} />` | `block/CodePayload.tsx` (already pure `{lang,text}`). Pure `code` content — **purified in Task 3** (the `code.ts` purification folds INTO Task 3; see ordering resolution §8). |
| `image` | `<ImagePayload url={preview.url} alt={preview.alt ?? ""} title={preview.title ?? null} />` | `block/ImagePayload.tsx`. **Adapter (verified `image.ts:8-14` / `ImagePayload.tsx:7-11`):** schema is `{url, width, height, alt?}` — there is **NO `title`** on the image schema; `ImagePayloadProps` requires `alt: string` + `title: string \| null` (both non-optional). COALESCE: `alt: preview.alt ?? ""`, `title: preview.title ?? null` (the schema has no `title`, so this is always `null` until/unless `image.ts` grows one). |
| `html` | `<HtmlPayload raw={preview.html} sanitizeHtml={…} />` (or `UnknownPayload` when `sanitizeHtml` absent) | `block/HtmlPayload.tsx`. **Field map (verified `html.ts:8-12`):** the schema field is **`html`**, the `HtmlPayload` PROP is **`raw`** → `raw={preview.html}`. (There is no `raw` field on the schema.) |
| `url` | `renderInline([{ type:"link", href: preview.url, children:[{ type:"text", value: preview.url }] }])` | `block/inline.tsx` link node (via the exported `renderInline`). **Field map (verified `url.ts:8-13` / `inline.tsx:5,34-44`):** the schema field is **`url`** (there is **NO `href`** on the url schema); the inline `link` NODE field IS `href` → `href: preview.url`. `renderInline` takes an **`InlineNode[]` ARRAY** (wrap the single node); the `link` node requires a non-empty **`children`** (use the url text). |
| `data` | the data composition (§3) — `<KpiStat metrics={headlines}/>` + rows-table + `charts.map(c => <Sparkline values={c.values} label={c.label}/>)` | `KpiStat`+`Sparkline` (EXTRACT) + the lifted rows-table markup (⚠️-DATA). |
| unknown | `<UnknownPayload raw={…} reason="unrecognised-kind" />` | `block/UnknownPayload.tsx` (K1 content fallback). |

**`text` host-id decision (a) — CARRIED from the prior plan.** `deriveBlocks(body, host)` needs a `host` `{kind,id}`; the artifact id is the natural source, but `host.id` only lands in `block.source.hostId` (provenance), NOT the DOM (`Block` renders `payload`, not `source`; `blockId` keys on content — `derive-blocks.ts`). A constant/derived id (`"artifact-text"`) is sufficient and lowest blast-radius; thread the real id only if provenance is later required. `text-blocks-renderer.stories.tsx` uses a constant `"story-text"` and renders correctly.

**Convergence (AC4).** `composeArtifactBody("text",…)` and `KnowledgeBody`'s `mixture` render both run `deriveBlocks` + `Block` — Artifact (single) and Block (mixed) of `text` SHARE the Text family; the difference is the composition wrapper, not the renderer. Same for `code` (both compose `CodePayload`), `image`, `html`. This is the concept's "Artifact and Block converge on the same base primitive."

---

## 3. The data split (K2c) + KPI/Graph extraction (Task 5)

The monolithic `data-renderer.tsx` fuses three content types. AM5 splits it:

- **KPI / Stat (EXTRACT).** `data-renderer.tsx:71-83` headlines flex-grid → `KpiStat.tsx` (`KpiStat.stories.tsx` already inlines the exact markup — lift it into the real component; the story imports it). Props `{ metrics: {label,value}[] }`. Existing tokens, no new chrome. Used in 2+ contexts: the `data` artifact (Task 2/§2) + the `metrics_moved` review delta (Task 4).
- **Graph / Sparkline (EXTRACT).** `data-renderer.tsx:28-58` `Sparkline()` SVG → `Sparkline.tsx` (`Sparkline.stories.tsx` already inlines it). Props `{ values: number[]; label: string }`. 80×24 polyline over `--accent-primary`, no new tokens. Used in the `data` artifact + the `metrics_moved` trend delta.
- **Table (the rows grid — ⚠️-DATA).** `data.rows: Record<string,string>[]` is a freeform key/value grid, NOT GFM. It does **NOT** route through `TablePayload` (which takes `InlineNode[][]`). The `data` composition lifts `data-renderer.tsx`'s rows-table markup (`:85-101`) verbatim. `TablePayload` is the base primitive that `block` `table` + a GFM artifact table compose — a different table shape. (Concept's "Table EXISTS for data" is the content-type split, satisfied by the lifted rows-table.)

A `data` artifact (`composeArtifactBody("data",…)`) composes all three. The review `metrics_moved` canvas composes the Review-diff of KPI + Graph (Task 4). Future chart types (bar/line/multi-series) extend off the `Sparkline` seam — noted, not scoped.

---

## 4. The DS diff-core extraction + the per-line slot seam (K2b — the foundation move)

**Concept read (K2b):** the diff core is a DS foundation; the review chrome in `web` composes it downward. The diff `(code,diff)` core is a NEW extraction exposing a per-line slot seam, NOT a file-move.

### 4.1 The `diff` selector (DS-owned)

`packages/design-system/src/diff/select-diff.ts`: `getDiffRenderer(kind): DiffRendererComponent` + a per-kind fallback (K1) → `UnknownDiff`. The `web` review chrome (`getReviewCanvas`) composes `getDiffRenderer(kind)` DOWNWARD (`web → design-system`, allowed) and adds anchors/composer/PR-header/bands/status. **No `Artifact`/`ReviewArtifact` merge** — the DS core takes `{ delta, kind }`; `ReviewArtifact` stays in `web`.

### 4.2 Per-canvas (DS diff-core delta renderer | web review chrome) PARTITION

| Canvas | Kind cell | DS diff core (moves DOWN) | Web review chrome (stays UP) | Feasibility |
|---|---|---|---|---|
| `code_diff` (`ReviewCodeDiff.tsx`) | `(code, diff)` | hunks delta STRUCTURE via the per-line slot seam (§4.3) | `CanvasSourceHeader`, PR header, file bands, reviewed checkboxes, AND (into the slot) `useReviewAnchors`/`InlineComposer`/`AnchoredThreadCard` | **Slot-seam (§4.3)** preserves DOM. |
| `visual_diff` (`ReviewVisualDiff.tsx`) | `(image, diff)` | before→after image compare (two `ImagePayload`) | `CanvasSourceHeader`, `ToolLogo`, compare-mode toggle, region chips | DS-ownable, clean. |
| `rendered_in_context` (`ReviewRenderedInContext.tsx`) | `(html,diff)`/`(text,diff)` | rendered before→after document compare | inbox-row chrome, render-mode flags, source header | DS-ownable. |
| `metrics_moved` (`ReviewMetricsMoved.tsx`) | `(data, diff)` | two-`data` delta (prior→current + trend arrows/Sparkline) | tie-out reconciliation, exceptions list, period chrome | DS-ownable (comparison is DS; reconciliation is chrome). |
| `field_change_set` (`ReviewFieldChangeSet.tsx`) | `(data, diff)` | per-field old→new change rows | record label, provenance, needs-you, unchanged-count | DS-ownable. |
| `action_operation` (`ReviewActionOperation.tsx`) | `(url, diff)` | thin proposed→effected compare | most stays chrome (status polling, operation timeline, irreversibility) | Partially DS — thin core (concept §Feasibility caveat). |
| `browser_preview` (`ReviewBrowserPreview.tsx`) | `(url, diff)` | thin `url` compare | most stays chrome (live iframe + status) | Partially DS — chrome-heavy. |
| `outcome_summary` / `batch` | — (NOT a cell, K2) | none | all stays — review composition scaffolding | not a content cell. |

### 4.3 The `code_diff` per-line slot seam (resolves the composition-preserves-behavior contradiction)

The DS `code-renderer.tsx` DOM (single `<pre>`, one gutter) ≠ the review `ReviewCodeDiff.FileDiff` DOM (dual old/new gutter + hover `+` button + `InlineComposer` + `AnchoredThreadCard` per line). **Resolution — the DS `(code,diff)` core owns the diff STRUCTURE (hunk loop, tints, `data-diff-type`, prefix glyph, per-line `<code>`) and exposes per-line render-prop slots; the review fills them with its chrome JSX verbatim.** This single-sources the structure in DS (K2b) while preserving the AL1/AL2 review DOM. Slot contract in §Key-type-shapes #5 (`CodeDeltaProps` + `DiffLineRef`).

- **Default (no slots):** the standalone `(code,diff)` delta render (the AC5 `getDiffRenderer('code')` fallback proof + the diff story) — a plain chrome-free diff.
- **Review (`ReviewCodeDiff`):** supplies all four slots → composed output is byte-for-byte the current `FileDiff` DOM (the chrome JSX moves into the slot callbacks unchanged).
- **Boundary:** `DiffLineRef` is pure data; `lineBlockId`/`InlineComposer`/`AnchoredThreadCard`/`useReviewAnchors` stay in `web`, passed DOWN. The DS core imports nothing from `web`.

**Pinned test:** `ReviewCodeDiff.test.tsx` + `ReviewCodeDiff.anchored.test.tsx` assert the composed output is unchanged (snapshots byte-identical). Inverse proof: reverting the slot wiring (core renders its default chrome-free line) makes them RED.

### 4.4 Staging — S2 RECOMMENDED

- **(S1)** Extract ALL canvas diff cores now — high blast radius across 7 web files; the richest yield a thin core.
- **(S2 — RECOMMENDED)** Extract the `code` diff core first (via §4.3), wire the `getReviewCanvas`-composes-`getDiffRenderer` pattern for `code_diff`, stage the remaining canvases as a fast-follow each composing the same pattern. The K2b STRUCTURE (DS-owned diff core, review composes downward, no parallel kind family) lands on the cleanest case; the kind vocabulary is single-sourced from day one. **🚩 The critique confirms S1-vs-S2.**

### 4.5 Per-kind fallback in every composition (K1 / AC5)

- Artifact: `composeArtifactBody`'s default → `UnknownPayload`.
- diff: `getDiffRenderer(kind)` → `UnknownDiff`; review chrome `getReviewCanvas` → `ReviewUnknownCanvas`.
- Block: `renderPayload` → `UnknownPayload` (`render-payload.tsx:47`).

K1 (unknown kind) ≠ composition absence ("unknown kind" ≠ "no content").

---

## 5. Open contract / fold wiring (Layer E details)

### Block-anchored open (H2 / AC2)

```ts
// part.ts — extend ONLY the host variant
| { readonly route: "host"; readonly hostKind: BlockHostKind; readonly hostId: string; readonly blockId?: string }

// inlineRefToEmbed block case (part.ts:273-276) — thread blockId
return { kind: "block", title: ref.blockId,
  target: { route: "host", hostKind: ref.hostKind, hostId: ref.hostId, blockId: ref.blockId } };

// open-handler.ts case "host" (:61-65)
const path = resolveHostRoute(target.hostKind, target.hostId);
if (path === null) return;   // user/factory/task no-op (H3/H5)
navigate(target.blockId ? `${path}#block-${encodeURIComponent(target.blockId)}` : path);

// KnowledgeDetail.tsx — scroll-to-DERIVED-block-by-id (rAF + scrollIntoView?.() guard; id-match, NO querySelector concat)
```

**Block-id equality precondition (the AC2 hinge):** `BlockRef.blockId` must EQUAL the `data-block-id` the target node renders. The **AC2 component test asserts scroll fires on the SPECIFIC node whose `data-block-id === decoded`** (capture call target; mount ≥2 blocks). A bare "scrollIntoView called" is INSUFFICIENT.

### The two H5 seam fixes

```ts
// host-route.ts
case "artifact": return `/artifacts/${hostId}`; // H5: was dead /work/artifact/:id (:27)
case "task":     return null;                    // H5/BLOCKER-1: no betId in scope; documented no-op (:23)
```

Route set stays CLOSED `OpenTarget.route ∈ {host|artifact|review|session}` (`npm run check`).

### The shared fold / `SplitView` + reconcile ALL THREE splits (O2–O7, F1–F5)

- **O7 naming:** the existing DS `Fold.tsx` is an unrelated disclosure component (kept). The split primitive = **`SplitView`** (already extracted into `design-system/src/SplitView.tsx`). CARRIED.
- **O5b placement (CHANGED from the prior plan):** `SplitView` is **DS-owned** (the design phase placed it there; content-agnostic, no `web` import, F4). The `web` surfaces compose it and own `{mode,destination}` + the `useUiPreference` persistence. The prior plan's "relocate `SplitView.stories.tsx` to `web/`" is RETRACTED — it stays in DS.
- **O2 resize+persist:** `SplitView` wires the pointer-events ratio drag clamped 0.2–0.8 (presentational); `web` adds `useUiPreference(surfaceKey, defaultRatio)` (`localStorage`). Per-surface. **Grep for an existing store first.**
- **O3 full + replace-not-nest:** `full` via `onModeChange('full')`; closed mode set `fold-back|split|full` (F5). One active fold pane per origin; a new open REPLACES `destination`, never nests.
- **O4 per-route presentation:** every reference opens its destination as `split` by default; full-page nav IS the `full` terminal (F2). `session`→`SessionViewPanel`; `review`→the `ExaminePane` canvas; `artifact`/`host(artifact)`→`ArtifactPreview` (`full` === today's `/artifacts/:id`). AM5 converts the 3 surfaces that split today (chat ×2 + review); the rest keep `navigate` (= `full` terminal) until adopted.
- **O6 reconcile THREE splits (distinct `surfaceKey`s):** chat dial-in (`conversation.dial-in`), chat session-open (`conversation.session`), review `ExaminePane` (`review`, drops `w-[620px]`/`border-l`). `UnifiedSplitView.stories.tsx` is the canonical demonstration (the same fold filled with real content across all three surfaces — design-verified, the builder's wiring target).

---

## 6. Cleanup of dead artifact/block-render scaffolding (Phase 5 / §6b — IN SCOPE)

Every loose end gets a disposition; no surface left with a dead "render later" hook; deferrals decided.

| Loose end (verified) | Disposition | Detail |
|---|---|---|
| `ArtifactSection.tsx:212` "View all" — non-interactive `<span>`, `@lore L12 (B-3)` | **WIRE** | Replace the dead span with a real affordance routing through the open contract (the `/artifacts/:id` route now exists). |
| `KnowledgeBody.tsx:44/103/139` `onOpenBlockActions` threaded but unwired; `@lore L18` names AM5 | **WIRE** | Via the unified open contract (block-anchored open, H2). |
| `AssistantOverlay.tsx:188-204` `renderRefEmbedsForAssistant`→`BlockRefEmbed` — renders block content, no open-on-click | **WIRE** (default) / REMOVE if the overlay should not host block refs post-AM1 | Reconcile onto the unified open path (block-anchored open). Architect/builder confirms; default = WIRE. |
| `TaskSheet.tsx:80-97` `resolveThreadId`/`postRequest`/`onNavigateToThread` — `@deprecated L18` | **VERIFY-THEN-REMOVE (⚠️ — corrects the prior plan AND the stale concept Phase-6 line).** **Props are LIVE:** `:201-204` says `resolveThreadId`/`onNavigateToThread` ARE used by "Open thread", `postRequest` (`:338-366`) by the request-form path. Remove ONLY genuinely-unreferenced props; for live props DROP the `@deprecated` tag (they are not dead). Update `WorkBet.tsx:1666` + `TaskSheet.stories.tsx`. A blind remove regresses "Open thread" + the request form. |
| Composer "+" `InsertMenu` (`ConversationSurface.tsx:221-252`) | **DEFER (explicit)** | Draft-mutation/rich-compose is a composer concern, out of AM5's artifact-rendering scope. Affordance stays visible; recorded (`@lore`). |
| `QuestionnairePart.tsx:53-65` answer chips | **DEFER (explicit)** | Answering is an interaction/verdict concern, out of AM5 scope. Recorded with reason. |
| Unknown-kind embeds, mention embeds (non-navigating), story `console.info` | **STAY AS-IS** | The contract's documented no-op/fallback (H3). |

**Note for the founder:** the LOCKED `concept.md` Phase-5 row for `TaskSheet` already says VERIFY-THEN-REMOVE (corrected). The earlier "blind REMOVE" wording is gone in the locked concept — the architecture matches it.

---

## 7. Acceptance criteria → verification method (each provable)

AC source: `TRACK-AM.md §AM5`. Runtime → test; static property → lint/type.

| # | Acceptance criterion | Verification method | Task |
|---|---|---|---|
| AC1 | Opening an artifact reference from any surface lands in the same recognizable view for that kind. | **Unit** (`open-handler.test.ts`): `host(artifact)` → `nav("/artifacts/<id>")` (H5 fix). **Component:** `composeArtifactBody(kind, preview)` composes the matching base primitive for each kind (`code`→`CodePayload`, `text`→`Block` stream, `image`→`ImagePayload`, `html`→`HtmlPayload`, `url`→inline `Link`, `data`→KPI+rows+Sparkline); the SAME composition renders from the inline embed + `/artifacts/:id`. | 1,2,3,5,6 |
| AC2 | Opening a block reference lands in Knowledge positioned at that block. | **Unit:** `host` with `blockId` → `nav("/knowledge/<id>#block-<id>")`; without → bare path. **Component:** mount at hash, spy `scrollIntoView`, assert it fires on the SPECIFIC node whose `data-block-id === decoded` (≥2 blocks); no hash → no scroll. | 7 |
| AC3 | Opening a review reference lands in the review experience. | **Unit:** `createOpenHandler(spyNav,{betId})` on `{route:"review",betId,reviewId}` → `nav("/work/bet/<betId>/review/<reviewId>")` (regression-guard). | 6 |
| AC4 | An artifact reads consistently between its inline reference and its opened view. | **Component:** render the inline composition + `/artifacts/:id` `ArtifactPreview` with the SAME fixture; assert both call `composeArtifactBody(kind, preview)` (same body). For `text`/`code` assert convergence with the `mixture` block render (same `CodePayload`/`Block` stream). | 1,2,3,5 |
| AC5 | A reference whose target kind/view is unknown opens a clear fallback (no blank/crash). | **Component, per composition:** `composeArtifactBody("mystery",…)` → `UnknownPayload`; `getDiffRenderer("mystery")` → `UnknownDiff`; `getReviewCanvas("mystery")` → `ReviewUnknownCanvas`; `renderPayload({kind:"unknown"})` → `UnknownPayload` — none throw. **K0b sub-proof:** `ArtifactPreviewSurface` `preview=null` → `NoPreviewText` (the composition's absence, not the primitive's). | 1,4 |
| AC6 | The same artifact/block/review opens identically regardless of which surface the reference appeared on. | **Unit:** drive `createOpenHandler` with the identical `OpenTarget` from two synthetic page contexts; assert the path + block anchor are identical. | 6,7 |
| AC-DATA-SPLIT (NEW, K2c) | A `data` artifact renders headline metrics, a rows table, and trend charts as composed base primitives. | **Component:** `composeArtifactBody("data", fixture)` renders a `KpiStat` (the headlines), the rows table, and `Sparkline`(s) — each a standalone primitive; `KpiStat`/`Sparkline` render populated content with no state branch. | 5 |
| AC-COLLAPSE (NEW, K5) | No kind-renderer family survives; `getRenderer`/`renderer-registry`/`kinds/*-renderer.tsx` are removed. | **Static (test + knip + check):** the DS barrel no longer exports `getRenderer`/`*Renderer`/`RendererComponent` (assertion test on `Object.keys(Ds)`); `knip`/`check` clean with the files deleted; `composeArtifactBody` is the sole Artifact dispatcher. | 1 |
| AC-CLEANUP (NEW, §6b) | No surface is left with a dead artifact/block-render hook; deferrals are decided. | **Component/lint:** `ArtifactSection` "View all" interactive + calls the open handler; `KnowledgeBody.onOpenBlockActions` routes through the open contract; `AssistantOverlay` `BlockRefEmbed` opens on click OR is removed; `TaskSheet` live props keep working + genuinely-dead ones gone (existing TaskSheet test stays green; `@deprecated` removed from live props). Composer "+" + QuestionnairePart deferrals recorded (`@lore`, no test). | 8 |

### Static properties (lint/type, not tests)

- **K5 collapse (negative existence)** — `npm run check` + `knip` clean after deleting `kinds/*-renderer.tsx` + `renderer-registry.ts`; a targeted test asserting the barrel no longer exports `getRenderer`/`*Renderer`. (The prior plan's `no-restricted-syntax`-in-kind-renderers K0b rule is RETRACTED — the files are gone; purity is structural via the deletion + the gate.)
- **Route set CLOSED** — `OpenTarget.route` discriminated union (`npm run check`).
- **K2b — diff core is DS-owned; no `web` import in `design-system`.** Scoped `no-restricted-imports` in **`eslint.config.ts`** (NEW flat-config block scoped `files: ["packages/design-system/src/diff/**"]`, alongside the existing `no-restricted-imports` blocks at `:348`/`:400`/`:458`/`:492`/`:595`) forbidding `ReviewArtifact`/`getReviewCanvas`/any `@hyperidle/web` import. Prove by adding a forbidden import → lint red. Task 2 gate (lands with the diff-core relocate).
- **H1 — no hand-rolled navigate to a viewer.** `no-restricted-syntax` in **`eslint.config.ts`** (NEW block scoped `packages/web/src/**`, exempting `services/open-handler.ts`) flagging `navigate(` string-concat to viewer routes outside the open handler. Prove by adding a forbidden navigate → lint red. Task 6 gate.
- **K2 — `outcome_summary`/`batch` are not Kinds.** They stay `ReviewCanvasKind`, never in `ARTIFACT_KINDS`. `npm run check` + `closed-view-family.test.ts`.

### Route checklist (grep the impl against this in critique)

| `OpenTarget` | Resolved destination | File:case |
|---|---|---|
| `host(knowledge_item, id)` | `/knowledge/:id` | `host-route.ts` |
| `host(knowledge_item, id, blockId)` | `/knowledge/:id#block-<blockId>` | `host-route.ts` + `open-handler.ts` |
| `host(bet, id)` | `/work/bet/:id` | `host-route.ts` |
| `host(task, id)` | **null (no-op, H5/BLOCKER-1)** | `host-route.ts` |
| `host(artifact, id)` | `/artifacts/:id` **(H5 fix)** | `host-route.ts` |
| `host(agent, id)` | `/work/agent/:id` | `host-route.ts` |
| `host(team, id)` | `/work/team/:id` | `host-route.ts` |
| `host(user\|factory)` | null (no-op, unchanged) | `host-route.ts` |
| `artifact(id)` | `/artifacts/:id` | `open-handler.ts` |
| `review(betId, reviewId)` | `/work/bet/:betId/review/:reviewId` (no-op w/o betId) | `open-handler.ts` |
| `session(id)` | `onOpenSession(id)` callback | `open-handler.ts` |

Fold mode (`fold-back|split|full`) is the PRESENTATION of a resolved destination, NOT a route.

---

## 8. Security & abuse cases

- **No endpoint, no mutation** — pure client routing + rendering + a `localStorage` UI preference. The `code` ingest re-shape is server-side but adds NO new endpoint (the existing POST/PATCH validator tightens).
- **Input-trust boundary (agent-authored fields):** `blockId`/`hostId` flow into a URL fragment `#block-<id>` + a block lookup. **Selector-injection mitigation:** `blocks.find(b => b.id === decoded)` then refs the element — NO `querySelector` string-concat. Fragment uses `encodeURIComponent`. Cite https://developer.mozilla.org/en-US/docs/Web/API/CSS/escape (fallback if a selector path is ever used).
- **XSS:** the hash is matched against known block ids, never `innerHTML`'d. `code` text renders into `CodePayload`'s text node. The `text`/`html` composition passes DOMPurify-sanitized html (or downgrades to `UnknownPayload` when `sanitizeHtml` is absent).
- **`localStorage` divider ratio:** a clamped number (0.2–0.8), parsed defensively, falls back on NaN/out-of-range.

---

## protectedTests (assertions must NOT change)

- `packages/web/src/pages/review/__tests__/canvas-registry.test.ts` — the 9-canvas chrome registry + `ReviewUnknownCanvas` fallback stay green (chrome REUSED; the diff-core extraction must not change the canvas's external output for existing fixtures).
- `packages/web/src/pages/review/__tests__/ReviewCodeDiff.test.tsx` + `ReviewCodeDiff.anchored.test.tsx` — the composed `code_diff` canvas OUTPUT is **unchanged** for existing fixtures BECAUSE the §4.3 slot seam moves the chrome JSX verbatim into the per-line slots. Snapshots byte-identical. **Inverse proof:** reverting the slot wiring → RED. For the OTHER canvases (S2 fast-follow), same discipline; re-bless only where the composed DOM genuinely changes, with the diff inspected.
- `packages/web/src/__tests__/KnowledgeDetail*.test.tsx` — block-anchor scroll is ADDITIVE; the AC2 test asserts node identity (`data-block-id === decoded`, ≥2 blocks).
- `packages/web/src/services/*open-handler*.test.ts` — `review`/`session`/`host(knowledge/bet/agent/team)` stay green; ONLY `artifact` (→ `/artifacts/:id`) + `task` (→ null) expectations change.
- `packages/design-system/src/__tests__/closed-view-family.test.ts` — the 8 `Artifact*` allowlist stays closed (the kind-layer removal does not touch `Artifact*` names; `ArtifactView` is a `web/shell` file).
- `packages/shared/src/__tests__/thread.test.ts` — `HOST_KINDS` stays 8.
- `packages/shared/src/__tests__/AE6-kind-registry.test.ts` — `OLD_KIND_MAP` (13 legacy kinds incl. `:407` `code_diff→{kind:"code"}`) + `code_diff` not a kind (`:27,63`) stay green; it tests the MAP, not the deleted normalization.
- **CHANGED, not protected (intended churn):** `AE6-kind-renderers.test.tsx` (the kind-renderer dispatch/empty-copy tests — the layer is DELETED, so this test is rewritten to assert `composeArtifactBody` dispatch + the negative-existence of `getRenderer`); the kind-renderer `*.test.tsx` + `*.stories.tsx` (DELETED with the layer); `ArtifactView.*.test.tsx` (DELETED); `AI6-renderer-parity.spec.ts` (DELETED — the kind↔block parity E2E whose `#Kinds%2F*` routes the collapse 404s; local-only); the `code`-purge fixtures (§4); the two eval scenarios.

---

## Migrations (renamed/moved/removed symbols → every call site)

- **`code.ts` `codePreviewSchema` `{file,hunks}` → `{path,lang,text}`** (purify). Consumer set = the grep-verified §4 enumeration (15 consumers). Pre-alpha (K4b): clean rewrite, NO migration. **DELETE only the `artifacts.ts` `code_diff→code` re-inject branch; the shared `OLD_KIND_MAP` STAYS.**
- **`getRenderer` + `renderer-registry.ts` + 7 `kinds/*-renderer.tsx` + their `.stories.tsx` + the barrel block (`index.ts:101-117`)** — DELETED (K5). Replaced by `composeArtifactBody`. Production callers: `ArtifactPreviewSurface.tsx:81` (re-pointed) + `ArtifactView.tsx:106` (deleted). `AE6-kind-renderers.test.tsx` rewritten.
- **`resolveHostRoute(artifact)` `/work/artifact/:id` → `/artifacts/:id`**; **`resolveHostRoute(task)` `/work/task/:id` → `null`** (BLOCKER-1). Update `host-route`/`open-handler` tests asserting the old strings.
- **`ArtifactView` shell + story + 2 tests + `artifact-view-family.ts`** — DELETE (Task 3, atomic with the kind-layer removal). Update the `viewSlot` lore comment in `packages/design-system/src/ArtifactEmbed.tsx`. Re-point the two `[data-component='ArtifactView']` E2E specs (`L11-rich-messages.spec.ts`, `R9-action-prominence.spec.ts` — local-only).
- **`packages/web/e2e/AI6-renderer-parity.spec.ts`** — **DELETE (not re-point)** (critique WARNING). This E2E navigates `/designsystem#Kinds%2FImageRenderer` + `#Kinds%2FCodeRenderer` and asserts the `kinds/*` renderer renders the SAME treatment as `block/*Payload` — a renderer-PARITY test. The collapse 404s those story routes AND voids the test's entire premise (there is no kind layer left to compare against the block payloads). It is an unhandled casualty, NOT a re-point. DELETE it in Task 3 with the kind-layer removal (local-only lane). Verified present on this branch.
- **`packages/design-system/viewer/__tests__/discovery.test.ts:93` — NO ACTION (false alarm).** It passes a kind-story path (`"../src/kinds/code-renderer.stories.tsx"`) as a literal STRING arg to `deriveGroup()` (path-classification logic); it does NOT import the deleted file. Deleting the story does NOT break it. Recorded so the builder does not chase it as a phantom break.
- **`data-renderer.tsx`** — EXTRACT `KpiStat.tsx`+`Sparkline.tsx` FIRST, then DELETE. The `data` artifact composition (§3) lifts the rows-table markup.
- **`SplitView.tsx`** — STAYS in `design-system` (already extracted); finalize `surfaceKey` prop. (Prior plan's "relocate to `web/`" RETRACTED.)
- **No data migration, no schema-migration, no API.** Pre-alpha purge.

### The `code` purge — full grep-verified consumer enumeration (15, CARRIED from the prior plan)

**Family A — `{kind:"code",file,hunks}` preview-shape consumers (re-shape to `{path,lang,text}`):**

| # | Consumer (verified) | Disposition |
|---|---|---|
| A1 | `packages/shared/src/types/artifact.ts` — `CodePreview` re-export + `ArtifactPreview` union member; `DiffHunk` public re-export (`index.ts:438`) | Union member `{file,hunks}`→`{path,lang,text}`. KEEP the `DiffHunk` export (the diff core still uses it); its meaning relocates to the `(code,diff)` delta. |
| A2 | `packages/server/src/schemas/artifact-preview.ts` — `artifactPreviewSchema` (server INGEST validator) | Re-shapes the accept/reject contract: `{kind:"code",file,hunks}` now rejected; only `{path,lang,text}` validates. Meta-layer contract change. Pre-alpha: no legacy ingest. |
| A3 | `packages/server/src/routes/artifacts.ts` — the `code_diff→code` read-time re-inject branch (`@lore` claims `{file,hunks}` "compatible with new code schema") | **DELETE only the re-inject branch (K4b).** The shared `OLD_KIND_MAP` STAYS. NO migration/back-compat/preview-drop. |
| A4 | `packages/server/src/routes/__tests__/artifacts.routes.integration.test.ts` + `packages/server/src/__tests__/AE6-artifact-normalization.integration.test.ts` (+ `artifacts-route.integration.test.ts`) | POST/read round-trip red under `test:integration`. Rewrite fixtures to pure-`code` or the `(code,diff)` review path. Verify none assert the now-DELETED re-inject. |
| A5 | `packages/shared/src/__tests__/artifact-types.test.ts` (`{kind:"code",file,hunks:[]}`) | red under `test`. Rewrite to `{kind:"code",path,lang,text}`; assert `displayTitle` returns `path`. |
| A6 | `packages/eval/src/scenarios/create-artifact.ts` (`{kind:"code_diff",file,hunks}`) AND `packages/eval/src/scenarios/submit-review.ts` (artifactRef `{kind:"code_diff"}`) | Update both eval scenarios (pure-`code` for create; the `(code,diff)` review path for submit-review). |
| A7 | `packages/server/src/tools/__tests__/create-artifact.test.ts` (`hunks` + `code_diff`) | Rewrite to the pure shape (its ingest path is the A2 validator). |
| A8 | `packages/design-system/src/ArtifactStackItem.stories.tsx` — `preview:{kind:"code",file,hunks:[]}` | Rewrite to `{kind:"code",path,lang,text}`. Builder re-blesses. |
| A9 | `packages/web/src/components/ArtifactSection.stories.tsx` + `__tests__/ArtifactSection.test.tsx` | Rewrite both fixtures to pure-`code`; the section renders the `code` artifact composition. Re-bless. |
| A10 | `packages/web/src/pages/__tests__/ArtifactPermalink.thread.test.tsx` — `preview:{kind:"code",file,hunks:[]}` | Rewrite to pure-`code`; the permalink composes `ArtifactPreview`. |
| A11 | `packages/web/src/pages/review/__tests__/review-canvas.test.ts` + `review-canvas.tsx` — `ReviewArtifact<CodeDiffPayload>` w/ `file`/`hunks` | **KEEP the `{file,hunks}` shape** (the diff delta, not the kind — it composes the DS diff core). Verify the test still exercises the composed canvas after the §4.3 extraction; re-bless only if the slot seam changes output. |

**Family B — orphaned `"code_diff"` kind-STRING fixtures (re-point to `code`; no `file`/`hunks` re-shape):**

| # | Consumer (verified) | Disposition |
|---|---|---|
| B1 | `packages/db/src/__tests__/artifacts.integration.test.ts` — inserts/asserts `kind:"code_diff"` | Re-point to `code`. Pre-alpha: no DB rows to honor. |
| B2 | `packages/server/src/__tests__/R6-events-and-broadcaster.test.ts` — event `kind:"code_diff"` | Re-point to `code`. |
| B3 | `packages/shared/src/__tests__/thread-payload.test.ts` — `artifactKind:"code_diff"` | Re-point to `code`. |
| B4 | `packages/server/src/routes/__tests__/bets.artifact-thread-summary.integration.test.ts` — `kind="code_diff"` | Re-point to `code`. |

**Plus** the `code_diff`/`{file,hunks}` review-chrome fixtures that STAY (the diff delta, not the kind): `review-artifact.ts`, `review-composition.fixture.ts`, `review-subject.ts`, `ReviewCodeDiff.stories.tsx`, `ReviewComposition.test.tsx`, `canvas-registry.test.ts`, `ReviewCodeDiff.test.tsx`/`.anchored.test.tsx`, `ArtifactThreadsSummary.test.tsx`, `useArtifactThreadSummary.test.tsx`, `ArtifactKindBadge.test.tsx`, `ArtifactStackItem.test.tsx` — verify each: if it carries the diff delta (review path) it STAYS; if it asserts a pure-`code` artifact it re-shapes. E2E specs (`artifact-*.spec.ts`, `L12-artifact-surfaces.spec.ts`, `bet-artifact-thread-summary.spec.ts`) are local-only — builder re-points when next run. **STAY (do NOT delete):** `OLD_KIND_MAP` (13 mappings) + `AE6-kind-registry.test.ts`.

---

## Ordered task list (each maps to ACs + a planned test; red precedes code)

**Order (brief):** extract KPI/Graph + relocate the code-diff core (the two pieces that must lift OUT of `data`/`code` renderers before deletion) → collapse the kind layer **+ purify `code`** + delete the shell + re-point the gate to `composeArtifactBody` → propagate the `code` purge across consumers → `text`-via-blocks + data composition → DS diff selector + the per-canvas partition → `SplitView` finalize + reconcile 3 splits → H5 + block-anchor → cleanup wiring. **NB the `code.ts` purification is folded INTO Task 3 (not deferred to Task 4)** so `composeArtifactBody`'s `code` arm type-checks at Task-3 time (critique CRITICAL — Task 3/4 ordering).

**Task 1 — EXTRACT KPI + Graph (Layer A — K2c/K5 prerequisite).** Author `KpiStat.tsx` + `Sparkline.tsx` (lift `data-renderer.tsx:71-83` / `:28-58`); point `KpiStat.stories.tsx`/`Sparkline.stories.tsx` at the real components; barrel-export. *Proves:* AC-DATA-SPLIT (KPI/Graph render populated, no state branch). *Tests:* `KpiStat` renders a figure grid; `Sparkline` renders an 80×24 polyline; neither has a `!values`/`!metrics` branch. *Depends:* none. *Builder:* re-bless the two stories' `.snap`.

**Task 2 — Relocate the `(code,diff)` core into DS with the per-line slot seam (Layer B — K2b prerequisite).** Move `code-renderer.tsx` → `design-system/src/diff/code-delta-renderer.tsx`; restructure to expose `CodeDeltaProps` + `DiffLineRef` slots (§4.3); remove its `!preview`/`hunks.length===0` branches. Add `diff/select-diff.ts` (`getDiffRenderer` + `UnknownDiff`). Wire `ReviewCodeDiff` to compose the DS core, filling the four slots (DOM byte-preserved). *Proves:* AC5 (`getDiffRenderer` fallback), AC1 (review path). *Tests:* the default (no slots) renders a chrome-free diff; `ReviewCodeDiff` composed output unchanged (snapshots byte-identical) — INVERSE-proven by reverting the slot wiring → RED. *Static GATE (K2b):* scoped `no-restricted-imports` on `design-system/src/diff/**` (no `ReviewArtifact`/`@hyperidle/web`). *Depends:* none (the local `{file,hunks}` type is unaffected by the `code` purge). **🚩 S1-vs-S2 confirmed in critique.**

**Task 3 — Collapse the kind layer + purify `code` + DELETE the shell + re-point the gate ATOMICALLY (Layer A/F — K2/K5 core + K0/K4/K4b).** **ORDERING RESOLUTION (critique CRITICAL): the `code.ts` purification — formerly Task 4 — FOLDS INTO Task 3 (resolution (a)).** The `code` arm of `composeArtifactBody` (`<CodePayload lang={preview.lang} text={preview.text} />`) references the **pure** `{path,lang,text}` shape, but `code.ts` is `{file,hunks}` until purified (verified `code.ts:18-22`, no `lang`/`text`). So `composeArtifactBody` cannot type-check — and Task 3's own red tests cannot be written — unless the pure shape exists at Task-3 time. Therefore: **purify `code.ts` → `{kind,path,lang,text}` (update `displayTitle`→`path` / `summarize`→content one-liner, NO `+adds/-dels`) AS PART OF Task 3, BEFORE adding `composeArtifactBody`.** Then: add `composeArtifactBody.tsx` (the Artifact composition over the block payloads; §2). Re-point `ArtifactPreviewSurface.renderBody` from `getRenderer(kind)` to `composeArtifactBody(kind, preview, sanitizeHtml?)`. DELETE the 9 `kinds/*-renderer.stories.tsx` + 7 `kinds/*-renderer.tsx` + `renderer-registry.ts` + the barrel block (`index.ts:101-117`). Same task (atomic): DELETE the `ArtifactView` shell + story + 2 tests + `artifact-view-family.ts`; update `ArtifactEmbed.tsx` lore; **DELETE `packages/web/e2e/AI6-renderer-parity.spec.ts`** (the kind↔block parity E2E — the collapse 404s its `#Kinds%2F*` routes and voids its premise; DELETE not re-point — critique WARNING). The diff render is already safely relocated in Task 2 (its local `{file,hunks}` type is unaffected by the `code.ts` purify), so the purify breaks nothing that Task 2 hasn't already lifted out. *Proves:* AC1/AC4/AC5 (composition + fallback + `code` artifact), AC-COLLAPSE (negative existence). *Tests:* `composeArtifactBody(kind)` composes the right primitive per kind; `("mystery")`→`UnknownPayload`; the gate returns `NoPreviewText` for null; the barrel no longer exports `getRenderer`/`*Renderer`; `code.ts` title/summarize over the pure `{path,lang,text}` shape; `closed-view-family.test.ts` + suite green; `AE6-kind-renderers.test.tsx` rewritten to the composition. *Static GATE:* `knip`/`check` clean post-deletion. *Depends:* Tasks 1–2 (KPI/Graph + the diff core must lift out before `data`/`code` renderers are deleted). *Builder:* re-bless kind `.snap` removals + recompute the snapshot floor (§1.3).

**Task 4 — PRE-ALPHA PURGE — convert the `code`-consumer set (Layer A/server — K4/K4b).** `code.ts` is ALREADY purified in Task 3; Task 4 propagates that re-shape across every consumer. **DELETE only the `artifacts.ts` `code_diff→code` re-inject branch (K4b); the `OLD_KIND_MAP` + `AE6-kind-registry.test.ts` STAY green.** Convert the §4 consumer set (Family A A1–A11 + Family B B1–B4). NO `previewIsDiff`. *Proves:* AC1 (`code` artifact round-trip), AC4, AC5. *Tests:* server POST `{file,hunks}` rejects / `{path,lang,text}` validates (integration); the §4 fixture re-shapes go green. *Depends:* Task 3 (the pure `code.ts` shape + the relocated `{file,hunks}` diff render both land in Task 3). 

**Task 5 — `text`-via-blocks + the `data` composition (Layer A — K6/K2c).** `composeArtifactBody("text",…)` runs `deriveBlocks(body, {kind:"artifact",id})` + `Block` (host-id decision (a)); confirm DOMPurify is a DS dep or thread `sanitizeHtml`. `composeArtifactBody("data",…)` composes `KpiStat` + the lifted rows-table (⚠️-DATA) + `Sparkline`(s). *Proves:* AC1 (`text`/`data` artifacts), AC4 (text converges with `mixture`), AC-DATA-SPLIT. *Tests:* `text` renders a block stream (heading+paragraph+list+quote+code+table), NOT a flat div; `data` renders KPI + rows + Sparkline. *Depends:* Tasks 1,3.

**Task 6 — `SplitView` finalize + reconcile ALL THREE splits (Layer E — net-new container).** Add `surfaceKey` to `SplitViewProps`; add `useUiPreference` (grep for a store first). Reconcile chat dial-in / chat session-open / review `ExaminePane` onto `SplitView` with distinct `surfaceKey`s. *Proves:* F1–F5. *Tests:* the 3 modes render; divider drag clamps + persists; chat/review render content in the destination half. *Depends:* none structural (parallel with 1–5). *Builder:* re-bless DS `.snap` (`UnifiedSplitView` + `SplitView` prop change).

**Task 7 — H5 route-seam fixes + H1 lint (Layer E — routing).** `host-route.ts`: `artifact → /artifacts/:id`; `task → null`. Land the H1 `no-restricted-syntax` lint. *Proves:* AC1 (artifact path), AC3 (review regression), AC6. *Tests:* `open-handler`/`host-route` unit — update `artifact`/`task`, keep others green. *Depends:* none. *Lore:* `task` no-op + BLOCKER-1.

**Task 8 — Block-anchored open (Layer E — H2/AC2).** Optional `blockId` on the `host` `OpenTarget`; thread `ref.blockId` through `inlineRefToEmbed`; `open-handler` host case appends `#block-<id>`; `KnowledgeDetail` reads the hash, matches `blocks.find(b=>b.id===decoded)`, scrolls (rAF + `scrollIntoView?.()` guard). **Precondition:** `BlockRef.blockId == data-block-id`. **Test caveat:** flush rAF under `act()`. *Proves:* AC2, AC6. *Tests:* unit (`#block-<id>`; without → bare path); component (scroll on the SPECIFIC node; no hash → no scroll). *Depends:* Task 7 (same files).

**Task 9 — Cleanup wiring/removals (Layer F / §6b — AC-CLEANUP).** WIRE `ArtifactSection` "View all" + `KnowledgeBody.onOpenBlockActions` + `AssistantOverlay` `BlockRefEmbed` onto the open contract. VERIFY-THEN-REMOVE the `TaskSheet` props (⚠️ LIVE at `:201-204`/`:338-366` — remove only genuinely-unreferenced; drop `@deprecated` from live ones; update `WorkBet.tsx:1666` + `TaskSheet.stories.tsx`). Record the composer "+" + QuestionnairePart DEFERRALS (`@lore`). *Proves:* AC-CLEANUP. *Tests:* component (View-all click routes; `onOpenBlockActions` routes; `BlockRefEmbed` opens or is absent); existing `TaskSheet` test stays green. *Depends:* Tasks 7–8.

**Order rationale:** Tasks 1–2 lift KPI/Graph + the code-diff core OUT before the layer is deleted (else the deletion loses their content). Task 3 = the collapse + **the `code.ts` purify** + the shell deletion + the gate re-point as ONE atomic step (no half-removed registry; the pure `{path,lang,text}` shape exists the moment `composeArtifactBody`'s `code` arm references it — the forward-reference the critique flagged is eliminated). Task 4 then propagates that purified `code` shape across the §4 consumer set (server validator, fixtures, evals) — it no longer owns the schema change, only its fan-out. Task 5 finishes the composition spine. Tasks 6–8 are independent (fold + routing). Task 9 wires cleanup onto the now-live open contract. No task lands on a red `check`; the red phase is writable at every step (no forward-reference to a not-yet-existing shape). Red tests precede code.

---

## CARRY vs RETRACT (vs the prior `architecture.md` + its critique)

### CARRIED forward (still-valid plumbing)

| Item | Why it survives the foundation decision |
|---|---|
| Block-anchored open (`OpenTarget.blockId` + adapter pass-through + `#block-<id>` + scroll-to-derived-block + `scrollIntoView?.()` guard + the block-id-equality precondition + the node-identity AC2 test) | Orthogonal to the rendering foundation — pure routing/contract plumbing. Unchanged. |
| The two H5 `resolveHostRoute` seam fixes (`artifact → /artifacts/:id`; `task → null`) + BLOCKER-1 | Orthogonal — routing. Unchanged. |
| The closed `OpenTarget.route` discipline + the route checklist (8 host cases incl. `team`) | Unchanged. |
| `SplitView` vs `Fold.tsx` naming (O7); resize+persist (O2); replace-not-nest (O3); per-route fold presentation (O4); the THREE-not-two splits + distinct `surfaceKey`s; `UnifiedSplitView` as the canonical demo | Unchanged — **except O5b placement: `SplitView` is DS-owned (RETRACTED the "relocate to web" decision).** |
| `ArtifactView` shell absorption — the only second `getRenderer` caller, ATOMIC inside the collapse task | Unchanged in intent; the `viewSlot=` grep is empty → deletion safe; update the lore comment in `packages/design-system/src/ArtifactEmbed.tsx`. |
| The atomic shell-delete + gate re-point ordering | Unchanged. |
| The per-line slot-seam for the `(code,diff)` core (§4.3) — preserves the AL1/AL2 review DOM | Unchanged — the diff core's home is now firmly DS (K2b), but the slot-seam contract is identical. |
| The full `code`-purge consumer enumeration (15: Family A A1–A11 + Family B B1–B4); `OLD_KIND_MAP` STAYS; `AE6-kind-registry.test.ts` stays green; only the `artifacts.ts` re-inject branch deleted | Unchanged — pre-alpha purge (K4b). |
| No `Artifact`/`ReviewArtifact` merge; `outcome_summary`/`batch` stay composition scaffolding (K2); `ReviewArtifact` payload types stay in `web` | Unchanged — strengthened by K2b. |
| The diff core is a DS foundation; review chrome composes it downward (K2b); the per-canvas partition + S2 staging | Unchanged — this was already round-3-correct; the foundation decision only changes the *single-cell* (Artifact), not the diff core. |

### RETRACTED (the foundation decision invalidates)

| Prior plan decision | Why retracted |
|---|---|
| **"Purify the kind renderers — keep `text/code/image/data/html/url-renderer.tsx` as the pure `single` cells; remove only their `if(!preview)` branches; props non-optional"** | **RETRACTED (K2/K5).** The kind renderers are REMOVED, not purified. Artifact (single) composes the block payloads directly via `composeArtifactBody`. There are no kind renderers to make pure — there is one content-renderer family (the block payloads). |
| **`CodeSingleRenderer.tsx` as the `(code,single)` cell; `renderer-registry.ts` swap `code single → CodeSingleRenderer`** | **RETRACTED.** A `code` artifact composes `block/CodePayload` directly (the same Block uses). No separate single-code renderer. |
| **`text-renderer.tsx` EDITED to render via `deriveBlocks`+`Block`** | **RETRACTED (mechanism).** `text-renderer.tsx` is DELETED; the `deriveBlocks`+`Block` render moves into `composeArtifactBody("text",…)`. Same render, different home (the composition, not a kept-and-edited kind renderer). |
| **`Representation = single\|diff\|mixture` type + `REPRESENTATIONS` + `getRenderer(kind, representation)` overloaded façade + `select-renderer.ts` over the kind registry** | **RETRACTED.** There is no kind registry to key; composition is three distinct call sites (`composeArtifactBody` / `getReviewCanvas`-composes-`getDiffRenderer` / `renderPayload`), not a runtime `Representation` enum threaded through one registry. The `single`/`diff`/`mixture` selection façade is removed. |
| **`renderer-registry.ts` / `getRenderer` KEPT (re-pointed to `getRenderer(kind,'single')`)** | **RETRACTED.** `renderer-registry.ts` + `getRenderer` are DELETED (K5). |
| **The K0b enforcer = scoped `no-restricted-syntax` forbidding `if(!preview)` inside `kinds/*-renderer.tsx`** | **RETRACTED (the files are gone).** K0b purity is now structural — the deletion of the kind layer + the composition gate. The enforcer is `knip`/`check` + a negative-existence test on the barrel. |
| **`SplitView.stories.tsx` relocate to `web/`; `SplitView.tsx` lives in `web`** | **RETRACTED.** The design phase extracted `SplitView.tsx` into `design-system` (content-agnostic, no `web` import). It stays in DS; `web` composes it. |
| (Already-retracted) "two-home / diff stays web-local"; `previewIsDiff`; `ArtifactViewFamily`/`QuickLook`/`Dialog.placement`; the `approved.md §1b` migrate/back-compat block | Stays retracted. |

---

## Risks / ambiguities (scrutinize in critique)

1. **BLOCKER-1 (task no-op) — concept-H5 deviation, founder sign-off (O1).** CARRIED.
2. **⚠️-DATA — the `data` `rows` grid is NOT `TablePayload`-compatible** (`Record<string,string>[]` vs `InlineNode[][][]`). The `data` composition lifts the rows-table markup; `TablePayload` serves GFM/block tables. 🚩 critique confirms the reading (vs the higher-cost `data.rows`→`InlineNode` conversion, rejected).
3. **⚠️ EXTRACTION — the DS diff-core extraction (§4) — the biggest ⚠️.** Per-line slot seam (§4.3) preserves the review DOM; S2 recommended. 🚩 critique judges S1-vs-S2.
4. **The `code` purge blast radius (§4) — crosses into Meta/server; pre-alpha PURGE (delete, no migration).** 15 consumers (A1–A11 + B1–B4); only the `artifacts.ts` re-inject branch deleted; `OLD_KIND_MAP` + `AE6-kind-registry.test.ts` STAY green.
5. **⚠️ DOMPurify-in-DS for the `text`/`html` composition.** Confirm DOMPurify is a DS dep before importing; else thread `sanitizeHtml` from the host. Build-time gate for Task 5.
6. **`composeArtifactBody` is pure of states by construction** (the gate guarantees content). The negative-existence test (no `getRenderer`/`*Renderer` in the barrel) is the K5 proof.
7. **`KpiStat`/`Sparkline` components do NOT exist yet** — the stories inline them. Task 1 authors the real components; the stories import them. Component-budget: each used in 2+ contexts (data artifact + `metrics_moved` review).
8. **`useUiPreference` may not exist.** Task 6 greps first. CARRIED.
9. **⚠️ React 18 scroll-on-mount timing.** rAF + guard; flush under `act()`. CARRIED.
10. **⚠️ TaskSheet cleanup — NOT all props are dead** (`:201-204`/`:338-366` LIVE). Verify-then-remove; drop `@deprecated` from live props. CARRIED.

---

## What this plan does NOT do (scope discipline)

No `Artifact`/`Block`/`ReviewArtifact` data-shape change (A4/K4) beyond purifying the `code` preview — which DOES re-shape the server ingest validator (§4) AND deletes the `code_diff→code` normalization (K4b, pre-alpha, no migration). No new artifact Kind. No new placement layout (closed at 4). No `Representation` runtime enum (RETRACTED — composition is structural, three call sites). No BlockKind merge into the content-type set. No second router / parallel route table. No `Dialog`/overlay/peek (the open presentation is the in-place fold). No verdict/review-decision logic. No color/token change. No code syntax-highlighting (TODO, deferred — K6). No new content-rendering family — the base primitives are the established block payloads; KPI + Graph are EXTRACTED from existing code; the diff core is the relocated hunks render. **No web-local kind/canvas content vocabulary survives** (K2b). **No kind renderer survives** (K2/K5 — the layer is REMOVED, not purified).
