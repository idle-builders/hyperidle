# AM5 — Approved design (one base-primitive set; Artifact/Review/Block compose it)

`DESIGN-CLASS: novel  canonical=<the established block-payload layer>  collapse=<kinds/*-renderer.tsx>  new=KPI+Graph(extract)+SplitView/fold`

The locked design (foundation decision 2026-06-26) = the **one base-primitive set** (the established **block-payload layer**, extracted up as THE foundation) + the **base-primitive × {Artifact/Review/Block} matrix** + the **collapse** of the recent `kinds/*-renderer.tsx` duplicate (removed, not purified) + the **`data` split → Table + KPI + Graph** + the two genuinely-new **EXTRACT** primitives (KPI, Graph) + the shared **fold/`SplitView`** + the open contract delegating its destination half to the resolved composition. **Purity (K0):** a base primitive is pure content — NO diff, NO state inside it; the diff is the Review composition built from two instances; states belong to the composition, for all primitives. Honors concept hard rules H1–H5, K0–K6, F1–F5, the vocabulary, and every rejection list. **Supersedes** the prior "purify the kind renderers / Kind × Representation" framing.

---

## 1. The base-primitive × composition matrix (locked — design intent for the architect)

A renderer is a base primitive composed by Artifact (one instance), Review (two + delta), or Block (many). The duplicate kind-renderer layer is removed; the base primitives are the established block payloads. **Foundation placement (K2b):** the base primitives, the generic compare-two-instances `diff` core + per-primitive delta renderers, and the `mixed` block composition are **DS foundations owned LOW in `packages/design-system`**. The review experience in `web` USES the DS `diff` core and adds only review chrome (PR header / file-bands / approve affordances). No parallel content family.

| Base primitive (pure content) | `(Artifact / single)` compose one (DS) | `(Review / diff)` DS compares two + delta; review chrome composes it | `(Block / mixed)` compose many (DS) |
|---|---|---|---|
| **Text family** `{body}` | a `text` artifact composes the Text family (`deriveBlocks(body)` + `block/{Paragraph,Heading,List,Quote,Divider}Payload` via `Block`, reusing `KnowledgeBody`'s derivation); the flat `text-renderer.tsx` div is **removed** (K5) | `ReviewRenderedInContext` (rendered prose, shared with Html) | `block/{Paragraph,Heading,Quote,List,Divider}Payload` + `inline.tsx` |
| **Code** `{path,text,lang}` | a `code` artifact composes `block/CodePayload` (file listing) | the old `kinds/code-renderer.tsx` (hunks) **relocates here** as the DS `(code, diff)` core · `ReviewCodeDiff` (`code_diff`) | `block/CodePayload` (pure ✓) |
| **Image** `{alt,url,title}` | a `image` artifact composes `block/ImagePayload` | `ReviewVisualDiff` (`visual_diff`) | `block/ImagePayload` |
| **Link** `{href}` (inline) | a `url`/link artifact composes the inline Link (`block/inline.tsx`) | `ReviewActionOperation` (`action_operation`) · `ReviewBrowserPreview` (`browser_preview`) | `block/inline.tsx` link node |
| **Html** `{raw}` | a `html` artifact composes `block/HtmlPayload` | `ReviewRenderedInContext` (`rendered_in_context`) | `block/HtmlPayload` |
| **Table** `{align,header,rows}` | part of a `data` artifact (split) | `ReviewFieldChangeSet` (`field_change_set`) | `block/TablePayload` |
| **KPI / Stat** `{label,value}[]` | part of a `data` artifact (split) | `ReviewMetricsMoved` (`metrics_moved`) | (future: a KPI block) |
| **Graph / Sparkline** `{label,values}` | part of a `data` artifact (split) | `ReviewMetricsMoved` (`metrics_moved` trend) | (future: a graph block) |
| **unknown** | `block/UnknownPayload` (content fallback, K1) | `ReviewUnknownCanvas` | `block/UnknownPayload` |

**Artifact (single) and Block (mixed) of one content type share the underlying base primitive** — a `code` artifact and a fenced-code block both render `block/CodePayload`; a `text` artifact and a Block body both render the Text family. The difference is the composition wrapper (one instance vs many, who owns the states), **not the renderer**. There is ONE content-renderer family — not two. **Text-diff:** `(text, diff)` is `ReviewRenderedInContext` (rendered prose before→after, shared with html) — NOT `ReviewOutcomeSummary` (which K2 classifies as review composition scaffolding, not a cell).

## 1a. The inventory (each base primitive: EXISTS/EXTRACT/NEW + source + reviewable story route)

> **Route format (verified 2026-06-26 against `viewer/main.tsx:84,413`):** the viewer route is `decodeURIComponent(window.location.hash.slice(1))` and matches `route === story.title` EXACTLY — the leading `#` is the URL hash, NOT part of the title. So a story titled `Heading` is reached at URL `#Heading`. There is **no `#Title/Variant` sub-route**; a story page renders ALL its variants stacked. The composed Text-family + sanitized-Html page is `#Page: Knowledge/Body`.
>
> **UPDATE (2026-06-26, founder):** the base primitives are no longer reviewed only under the single `#Block` page. **Every base primitive is now its own individual foundation component+story** with its own route, so each is individually reviewable as a foundation (founder: *"for the text to Link those are all foundations and they should be all their individual component and story in the design system. all based in foundations."*). The shared `#Block` page (one page, all variants) **still exists** as the composed-many review surface; the per-primitive routes below are the new individual-foundation surfaces. Each per-primitive story is a **thin wrapper** over the shipped `block/*Payload.tsx` (no duplicated logic). All payload components are now exported from the DS barrel (`packages/design-system/src/index.ts`) — first-class foundations, not internal-to-Block.

| # | Base primitive | Status | Source component | Individual foundation story route (verified) |
|---|---|---|---|---|
| 1 | **Heading** | **EXISTS** | `block/HeadingPayload.tsx` | **`#Heading`** (`Levels`, `WithInline`) — individual ✓ |
| 2 | **Paragraph** | **EXISTS** | `block/ParagraphPayload.tsx` | **`#Paragraph`** (`Plain`, `RichInline`) — individual ✓ |
| 3 | **List** | **EXISTS** | `block/ListPayload.tsx` | **`#List`** (`Unordered`, `Ordered`) — individual ✓ |
| 4 | **Quote** | **EXISTS** | `block/QuotePayload.tsx` | **`#Quote`** (`Single`, `MultiLine`) — individual ✓ |
| 5 | **Divider** | **EXISTS** | `block/DividerPayload.tsx` | **`#Divider`** (`Rule`) — individual ✓ |
| 6 | **Code** | **EXISTS** (highlighting = **TODO**) | `block/CodePayload.tsx` | **`#Code`** (`WithLang`, `NoLang`, `Collapsible`) — individual ✓ |
| 7 | **Image** | **EXISTS** | `block/ImagePayload.tsx` | **`#Image`** (`Captioned`, `WithTitle`) — individual ✓ |
| 8 | **Table** | **EXISTS** | `block/TablePayload.tsx` | **`#Table`** (`Populated`, `WithInline`) — individual ✓ |
| 9 | **Html** | **EXISTS** | `block/HtmlPayload.tsx` | **`#Html`** (`Rendered`, `ListMarkup`) — individual ✓ (story-only passthrough sanitiser over pre-safe fixture markup; the host sanitiser stays a host concern, AC-49) |
| 10 | **Link** | **EXISTS** (inline) | `block/inline.tsx` link node (via `renderInline`) | **`#Link`** (`Standalone`, `InProse`) — individual ✓ (Link is the one INLINE base primitive — no block payload of its own; the story renders the `link` inline node in isolation via the shipped `renderInline`) |
| 11 | **KPI / Stat** | **EXTRACT** (authored) | from `kinds/data-renderer.tsx` headlines flex-grid | **`#KpiStat`** (`SingleMetric`, `MetricRow`) — authored + rendering ✓ |
| 12 | **Graph / Sparkline** | **EXTRACT** (authored) | from `Sparkline()` SVG in `kinds/data-renderer.tsx` | **`#Sparkline`** (`Trend`, `Flat`, `Volatile`) — authored + rendering ✓ |
| — | **unknown** (fallback) | **EXISTS** | `block/UnknownPayload.tsx` | `#Block` (Unknown variant) — composed-fallback, not a standalone foundation |

**Headline:** ten EXIST base primitives (the block-payload layer + inline Link) now each have **their own individual foundation story** (`#Heading … #Link`), reviewable side-by-side; the composed `#Block` page and `#Page: Knowledge/Body` remain as the compose-many review surfaces. Two EXTRACT (KPI, Graph — the genuinely-new design work, **authored** as `#KpiStat` + `#Sparkline`), zero NEW from scratch. No primitive is now standalone-unreviewable — the prior "Link inline-only / Html composed-only, no standalone story" gap is **closed**: both `#Link` and `#Html` are individual routes. Future chart types (bar/line/multi-series) extend off the Graph seam — noted, not scoped.

**Decoupling note (builder spec, no refactor done here):** `List` and `Quote` payloads recurse through `renderPayload` for nested children, and `Html` takes a host-injected `sanitizeHtml` fn — both render standalone in their stories with fixture props (nested paragraph children for List/Quote; a passthrough sanitiser over pre-safe markup for Html). No payload was too coupled to `Block`/`render-payload` to render in isolation; **no decoupling refactor was required.** The stories pass props directly to the payload components.

## 1b. The data split (K2c) + the kind-renderer collapse (K5)

**The data split.** The monolithic `data` kind (`kinds/data-renderer.tsx`) fuses three content types: a **headlines flex-grid** (→ KPI, EXTRACT), a **`rows` table** (→ Table, EXISTS), and **`Sparkline()` charts** (→ Graph, EXTRACT). AM5 splits it. A `data` artifact composes Table + KPI + Graph; the review `metrics_moved` canvas composes the Review-diff of KPI + Graph.

**The kind-renderer collapse.** The AE6 `kinds/*-renderer.tsx` layer + `renderer-registry.ts` is **removed, not purified.** Disposition per file:

| Removed file | What happens | Snapshot/test churn (builder, not designer) |
|---|---|---|
| `kinds/text-renderer.tsx` | **removed** — `text` artifact composes the Text family (`deriveBlocks` + prose primitives) | retire `#Kinds/TextRenderer`; any `*.test.tsx` asserting the flat-prose DOM updates to Text-family/block output |
| `kinds/code-renderer.tsx` (hunks) | hunks render **relocates** into the DS `(code, diff)` core (Review); `code` content purified `{file,hunks}`→`{path,text,lang}` | reclassify `#Kinds/CodeRenderer` as the `(code, diff)` story; remove its single-cell role |
| `kinds/image-renderer.tsx` | **removed** — `image` artifact composes `block/ImagePayload` | retire `#Kinds/ImageRenderer` |
| `kinds/data-renderer.tsx` | **EXTRACT KPI + Graph first**, then **removed** — `data` artifact composes Table + KPI + Graph | retire `#Kinds/DataRenderer`; new `#KpiStat` + `#Sparkline` |
| `kinds/html-renderer.tsx` | **removed** — `html` artifact composes `block/HtmlPayload` | retire `#Kinds/HtmlRenderer` |
| `kinds/url-renderer.tsx` (status card) | **removed** — `url`/link artifact composes the inline Link | retire `#Kinds/UrlRenderer` |
| `kinds/fallback-renderer.tsx` | **removed** — `block/UnknownPayload` is the content fallback (K1) | retire `#Kinds/FallbackRenderer` |
| `kinds/renderer-registry.ts` (`getRenderer`) | **removed** — Artifact composes the base primitive per kind directly (O6) | n/a (logic) |

**Selection (replaces the removed registries):** Artifact (single) composes the matching base primitive per kind (`text`→Text family, `code`→Code, `image`→Image, `html`→Html, `url`→Link, `data`→Table+KPI+Graph). This replaces `getRenderer(kind)`. Review chrome composes the DS diff core (replacing `getReviewCanvas`'s renderer role with a chrome-over-DS-core role). Block composes via `render-payload` (dispatched by BlockKind). **Unknown-content fallback (K1)** per composition: `block/UnknownPayload` / `ReviewUnknownCanvas` — never blank/crash, distinct from a composition's absence states. Architect designs the per-kind→base-primitive selection (O6).

> **Foundation-composition model (K2b — RETRACTS "two-home"):** the base primitives, the generic compare-two-base-primitive-instances `diff` core + per-primitive delta renderers, and the `mixed` block composition all live LOW in `packages/design-system`. The review experience in `web` USES the DS `diff` foundation and adds only review *chrome* (PR header / file-bands / approve affordances / file-navigation). The `ReviewArtifact` parallel family is reconciled: the **diff CORE lives in DS and composes base primitives**; review chrome is a thin `web` composition. **No parallel content family.** The `DS ↛ web` boundary was the SIGNAL the foundation was mis-placed (put it LOW), not a reason to split.
>
> **RETRACTION (foundation decision):** the prior "purify the `kinds/*-renderer.tsx` layer as the `single` base" and "Kind × Representation" framing are RETRACTED. The block-payload layer is canonical; the kind-renderer layer is REMOVED; Artifact (single) composes the base primitives directly. The `previewIsDiff` discriminant and "keep `code` preview diff-shaped" are RETRACTED — `code` content is pure `{path,text,lang}`; the diff is the Review composition built from two instances.
>
> **[PRE-ALPHA PURGE].** Purifying the `code` schema (`{file,hunks}` → `{path,text,lang}`) is a **clean schema rewrite, NOT a migration.** No DB data — pre-alpha. **NO migration, NO back-compat read-normalization, NO preview-drop.** Change the schema everywhere it appears, including the server ingest validator (`packages/server/src/schemas/artifact-preview.ts`) and the `code_diff → code` read-normalization at `packages/server/src/routes/artifacts.ts:84-130` — **DELETE that normalization** (and `OLD_KIND_MAP` usage). The `{file,hunks}` payload moves into the Review composition. **The full blast radius still must all change** (clean rewrite, not migration):
> 1. shared `types/artifact.ts` union + `DiffHunk` export (kept; meaning relocates to the Review composition),
> 2. server `artifact-preview.ts` `artifactPreviewSchema` ingest validator (re-shapes; `{kind:"code",file,hunks}` now rejects, only `{path,lang,text}` validates),
> 3. server `artifacts.ts:84-130` `code_diff→code` read-normalization — **DELETED**,
> 4. the two server integration tests — fixtures rewritten to the pure shape (or to Review fixtures for the diff),
> 5. `shared/artifact-types.test.ts:198` — assertion rewritten to the pure shape,
> 6. the `eval/scenarios/create-artifact.ts` scenario — fixture rewritten to the pure shape.
>
> The prior "FOUNDER DECISION — existing diff-shaped `code` data" block is **removed**.

**Combined content-type set — confirmed:** `text · code · image · data · html · url` + `unknown` (AE6 set + fallback). Content types OPEN; compositions CLOSED at `Artifact (single) | Review (diff) | Block (mixed)`; BlockKind stays its own CLOSED AST vocabulary, composing the same base primitives — not merged.

## 2. The open contract (delegates to the resolved composition)

`createOpenHandler(navigate, ctx)` resolves every reference from every surface (H1). Closed route set `host|artifact|review|session`; page supplies `betId`/`onOpenSession` at the seam. Destination half delegates rendering to the resolved composition (H4) and presentation to the fold (F1).

| Reference | Routes into | Composition rendered |
|---|---|---|
| Artifact | `/artifacts/:id` → `ArtifactPermalink` → `ArtifactPreview` | **Artifact (single)** composing the base primitive |
| Artifact-as-host | `/artifacts/:id` (H5 fix) | **Artifact (single)** |
| Block | `/knowledge/:id` scrolled to block (H2 gap) | **Block (mixed)** via `KnowledgeBody`→`Block` |
| Review | `/work/bet/:betId/review/:reviewId` | **Review (diff)** composing the DS diff core |
| Session | fold destination half | `SessionViewPanel` content (AM3) |
| Unknown/unrouted | non-navigating `unknown` embed / documented no-op | — (H3) |

## 3. Open presentation (the fold) — the standardized open

Every transition opens as a **fold**: the surface splits in place, the destination renders in the new half, the origin stays live; **fold-back** closes, **fold-forward** expands to **full**, the **divider drags to resize**. Full-page is the fold's `full` mode (F2). The fold owns container + controls only; the destination half is the reused composition (F4).

**Extraction decision (2026-06-26 — the canonical split is chat's, not a fresh container).** The prior `SplitView.stories.tsx` was hand-authored as a NEW container — the founder flagged it (round-2: uneven panes + a stray separator above a pane; text mode-controls that "should be icon based"; a "fold to split" control showing even when already full). It is **rebuilt by extracting the more established of the two shipped splits, generalized**:

- **Canonical base = chat's split** (`Conversations.tsx ~447-505`): a real **proportional `flex-row`** split — origin `flex-[3] … border-r border-[var(--border-subtle)]`, destination `flex-[2]`, close button inside the destination panel. **Chosen because** (a) git-established — used in TWO call sites (dial-in + opened-session), (b) it is a true **ratio** split (the resizable-proportional model the fold needs), and (c) it has a **single clean separator** (the origin's `border-r`, generalized to the draggable divider).
- **Review's `ExaminePane`** (`ReviewComposition.tsx ~644`) is a **fixed `w-[620px]`** aside with `border-l` — not proportional, does not generalize to a draggable ratio. It **converges** onto the fold (drops fixed-620 + `border-l`, keeps content + Esc-close). Standardization noted: review gives up its fixed width and left-border for the proportional model + divider.
- **SplitView = chat's `flex-row` proportional split, generalized** to a content-agnostic `origin | divider | destination`, with chat's static `border-r` **replaced by the ONE draggable divider** (the net-new affordance) and the mode-controls floated over the destination half.

**Founder round-2 fixes applied (verified rendering `#SplitView` 2026-06-26):**
- **Even panes, one clean divider.** Default ratio 50/50; the divider is the ONLY separator. The old bordered control-bar (which read as a "border above" the destination pane) is removed — controls now **float top-right over** the destination content, so no stray separator/border above a pane.
- **Icon-based mode controls.** The text buttons ("Fold to split" / "Fold back" / "Expand to full") are replaced by **icon affordances** (expand-arrows / collapse-arrows / ✕), each a 28px pill icon-button with an `aria-label` + `title`.
- **Contextual control set (mode-dependent).** The controls live on the destination (right) half and depend on `mode`: in `split` → `[Expand to full, Fold back]`; in `full` → **only** `[Collapse to split]`. **No "fold to split" affordance is shown when already `full`** — the only sensible control when full is collapse-back.

**Founder round-3 fix — TWO FLOATING LAYERS, not a divided surface (verified `#UnifiedSplitView` + `#SplitView` 2026-06-26):** The founder annotated `UnifiedSplitView/ConversationToArtifact` round-3: *"instead of a seperator I would like this to be two seperat layers… essentially two rounded containers (bg white) floating on top of the normal background."* The split now reads as Hearth's established layering language — **two separate elevated rounded cards floating on the warm page canvas, with the gap between them as the draggable seam** — instead of two flush panes split by a divider stripe on one bordered surface:
- **Root = the page canvas, not a divided pane.** The `SplitView` outer container paints `--surface-page` (the warm canvas) with `p-[var(--space-3)]` margin and `gap-[var(--space-3)]` between the cards. No outer border, no single shared surface.
- **Origin pane + destination pane = two SEPARATE elevated rounded cards.** Each: `bg-[var(--surface-elevated)]` (the white card surface), `rounded-[var(--r-default)]` (16px), `shadow-[var(--shadow-default)]` (the warm card shadow — no border; the shadow gives the lift). Each scrolls its own content.
- **The gap IS the seam; the draggable handle lives in it.** The `--space-3` (9px) gap between the cards is the separator. The drag handle sits in that gap (transparent track over the canvas, centered grip pill — `--border-strong`, `--accent-primary` on hover/drag). **Same smooth pointer logic, just repositioned** (founder: *"I like the draggin that works smooth"* — KEPT). Negative `-mx-[var(--space-3)]` widens the hit area to the full gap without widening the layout.
- **Icon controls KEPT** (founder: *"I like how the icons make things work"*) — float top-right over the destination card, contextual per mode, unchanged.
- **`full` mode = the single card fills the canvas** (still a rounded elevated card on `--surface-page`).
- **Tokens used:** surface `--surface-elevated` (cards) on `--surface-page` (canvas); shadow `--shadow-default`; radius `--r-default` (on-scale, no `rounded-3xl`); gap/margin `--space-3`; grip `--border-strong` / `--accent-primary`; motion `--motion-fast` + `--motion-ease`. All token-only — no hardcoded colors, no off-grid spacing.

### 3a. The unified split view — the canonical demonstration of the open/fold unification (verified `#UnifiedSplitView` 2026-06-26)

The `#SplitView` story proves the *container* (placeholder boxes). The **`#UnifiedSplitView` story is the AM5 payoff** — the SAME fold, filled with REAL content, used across every surface, so opening any reference from anywhere lands in one consistent split. This is the canonical demonstration the architect/builder targets; `#SplitView` documents the bare primitive.

- **File / route.** `packages/design-system/src/UnifiedSplitView.stories.tsx` → `http://localhost:8098/#UnifiedSplitView` (group `System`).
- **Reuses the real primitives — no reinvention.** The fold is the **extracted shared `SplitView` component** (`packages/design-system/src/SplitView.tsx`, now imported by BOTH `SplitView.stories.tsx` and `UnifiedSplitView.stories.tsx` — the split logic, draggable divider, and icon/contextual controls live in ONE place). Every destination renders through the **real `Block` base primitive** (the (Kind,Representation) cell): text artifacts via heading/paragraph/list/code block payloads; the data artifact via KPI figures + Sparkline + a `Block` table.
- **Three variants — structurally identical, only content differs (that identity IS the proof):**
  1. **`ConversationToArtifact`** (`split`) — origin = a faithful conversation surface (message rows, Avatars, posted `ReferenceChip`s) · destination = the opened **text artifact** (Dual-auth window heading + paragraph + ordered list + code, all real `Block`s).
  2. **`ReviewToArtifact`** (`split`) — origin = a faithful review canvas (header + BLOCKED `StatusChip`, outcome prose, intent checklist, change `ReferenceChip`s) · destination = the opened **data artifact** (KPI figures + sparklines + `Block` table).
  3. **`KnowledgeToArtifact`** (`full`) — origin = a knowledge body of real `Block`s + a `Fold` disclosure · destination = the opened text artifact **folded fully forward** (the fold's `full` expand state is visible; the only control is collapse-back-to-split).
- **Origin-surface fixture decision (boundary, not laziness).** A design-system story must not import upward from `packages/web`; the production `ConversationSurface` / `ReviewComposition` / knowledge-body components live there, so importing them would invert the dependency boundary. Each origin therefore **reproduces the real surface's SHAPE from real design-system primitives** (`Block`, `ReferenceChip`, `Avatar`, `StatusChip`, `Fold`) rather than forking new chrome. The builder, wiring this in `packages/web`, swaps these faithful origin fixtures for the actual page surfaces — the destination half (real `Block` cell) and the fold container (real `SplitView`) carry over unchanged.
- **Verified (Playwright, `:8098`, 2026-06-26):** all three variants render, **0 error boundaries**, **3 `data-ds-component="split-view"` instances** (the one real primitive, thrice), **9 real `Block` instances**, even panes, one clean draggable divider, icon controls (2 expand + 1 collapse + 2 dividers across the split/full mix), real content on both sides.

## 4. The gaps (the genuinely-new work)

1. **KPI + Graph base primitives (EXTRACT).** The two genuinely-new base primitives, extracted from the collapsing `data-renderer.tsx`:
   - **KPI / Stat** — the headlines flex-grid (`data-renderer.tsx` ~71–83): `flex flex-wrap gap-3` of `{label, value}` figures (mono caps label + tabular-nums value). EXTRACT into a standalone base primitive reusing the existing figure tokens — no new chrome, no new tokens. (`KeyValue.tsx` is a bare inline pair, NOT this figure grid.) **Authored story** `#KpiStat`.
   - **Graph / Sparkline** — the `Sparkline()` SVG (`data-renderer.tsx` ~28–58, not exported): an 80×24 polyline over `--accent-primary`. EXTRACT into a standalone base primitive, reused exactly — no new tokens. **Authored story** `#Sparkline`.
   - The **data artifact composes Table + KPI + Graph** — architect/builder assembles it from the three primitives (O5).
2. **The kind-renderer collapse (K5).** Remove `kinds/*-renderer.tsx` + `renderer-registry.ts`; Artifact composes the base primitives directly. Relocate `code-renderer.tsx`'s hunks into the DS `(code, diff)` core. Architect: the per-kind→base-primitive selection (O6).
3. **The `code` content purification + diff relocation.** `code` content becomes pure `{path,text,lang}` (Artifact composes `block/CodePayload`); the diff relocates to the Review composition (DS diff core). `previewIsDiff` retracted. Pre-alpha purge (§1b). Architect: O5.
4. **The composition-owned state layer.** Empty/error/loading/no-changes are owned by the composition (Artifact owns empty/error/loading; Review owns "no changes"; Block owns absence). Base primitives render only present content. The host machines already own these (`ArtifactPreview`, review canvases, `Block`/`KnowledgeBody`); the work is removing the dead state branches with the kind-renderer layer.
5. **The shared fold / `SplitView` primitive — the ONE net-new container.** Two slots, draggable divider (ratio persisted per surface), mode control `fold-back|split|full`. Reconcile chat + review onto it. Content-agnostic; authors no renderer. **Authored story** `#SplitView`. Architect: O2–O7.
6. **Block-anchored open (H2 / AC2).** Optional `blockId` on `host` `OpenTarget`; adapter pass-through; `#block-<id>` fragment in `open-handler`; scroll-to-`[data-block-id]` in `KnowledgeDetail`. No view shape — proven by tests.
7. **H5 route seams.** `resolveHostRoute(artifact) → /artifacts/:id`; `resolveHostRoute(task) → null` (documented no-op; founder sign-off O1). No view shape.
8. **Cleanup of empty artifact/block-render scaffolding (§6b).** Wire/remove every dead "render later" hook across chat/task/knowledge; defer composer "+" menu + `QuestionnairePart` chips. No new view shape.
9. **Code syntax highlighting — TODO, deferred (K6).** `CodePayload` renders plain mono; AM5 adds no highlighter; a future WP adds one behind the surface. Recorded so it is decided, not forgotten. **Not in AM5 scope.**

## 5. States — COMPOSITION-owned (reuse existing host machines; remove dead state branches)

States (empty/error/loading/no-changes) belong to the **composition**, not the base primitive (K0). The host machines already own them; with the kind-renderer layer removed, the dead `if(!preview)` branches go with it. **This applies to all content types** (the round-2 founder annotation "true for all kinds"):

- **Artifact (single):** `ArtifactPreview` carries `populated|loading|error`; `ArtifactPermalink` loading/404/error; `ArtifactSection` full machine. Owns single's absence. Reused. (The removed kind-renderer null/empty branches go away with the layer.)
- **Review (diff):** review canvases own "no changes"/diff-error + `ReviewUnknownCanvas` content fallback. Reused. (The relocated `code-renderer.tsx` `hunks.length===0` "no changes" lands here.)
- **Block (mixed):** `Block`/`KnowledgeBody` own empty-body + `UnknownPayload` content fallback. Reused.
- Unknown-content fallback (K1/A1/H3/AC5): `ReviewUnknownCanvas`/`UnknownPayload` — never blank/crash. **Distinct from absence states** ("unknown content" ≠ "no content").
- **No new states authored** (initial designs render only the populated real state; the authored KPI/Graph/SplitView stories show populated only).

### 5a. K0b — the gate contract (locked)

The composition guarantees present content BEFORE invoking a base primitive. A base primitive's content prop is **non-optional**; it has **NO** empty/error/loading branch. Verified-in-code: `ArtifactPreviewSurface.renderBody` already gates `preview == null → NoPreviewText` and error-boundaries the body before selecting a renderer — the Artifact composition is already the gate; the removed kind renderers' `if(!preview)` branches were dead under it. With the kind-renderer layer removed, the gate stays at the composition (`ArtifactPreview`/`ArtifactPermalink` for Artifact; review canvases for Review; `Block`/`KnowledgeBody` for Block) — no new gate to build.

## 6. Embodiment — three authored stories + existing block-payload stories as the review artifacts

**Authored (the two EXTRACT primitives + the fold) — all three stories exist and render (verified 2026-06-26):**

| Embodiment | Story file (authored ✓) | Viewer route (verified) |
|---|---|---|
| **KPI / Stat** (the headline metric figure grid) | `packages/design-system/src/KpiStat.stories.tsx` (`KpiStat`, group `Primitives`: `SingleMetric`, `MetricRow`) | `http://localhost:8098/#KpiStat` |
| **Graph / Sparkline** (the inline trend chart) | `packages/design-system/src/Sparkline.stories.tsx` (`Sparkline`, group `Primitives`: `Trend`, `Flat`, `Volatile`) | `http://localhost:8098/#Sparkline` |
| **`SplitView`/fold** | `packages/design-system/src/SplitView.stories.tsx` (`SplitView`, group `System`: `Split`, `Full`, `FoldBack`) | `http://localhost:8098/#SplitView` |
| **Unified Split View (the payoff)** — the SAME fold filled with REAL (Kind,Representation) content across conversation/review/knowledge | `packages/design-system/src/UnifiedSplitView.stories.tsx` (`UnifiedSplitView`, group `System`: `ConversationToArtifact`, `ReviewToArtifact`, `KnowledgeToArtifact`) | `http://localhost:8098/#UnifiedSplitView` |

All presentational (props in, callbacks noop, local UI state). KPI renders the figure grid on existing figure tokens (mono caps label + tabular-nums value) — NO new chrome. Sparkline renders the polyline SVG on `--accent-primary` — NO new tokens. `SplitView` is now **extracted from chat's proportional split** (not a fresh container, §3) and renders the three closed modes + the ONE draggable divider with placeholder labelled panes (content-agnostic), with **icon-based, contextual** mode controls. The split component itself was **extracted out of the story into a real shared file** `packages/design-system/src/SplitView.tsx` (exported from `index.ts` as `SplitView` + `FoldMode`/`SplitViewProps`), so BOTH `SplitView.stories.tsx` (placeholder boxes) and `UnifiedSplitView.stories.tsx` (real content, §3a) import the SAME primitive — no duplicated split logic. It carries `data-ds-component="split-view"` for the annotation overlay + snapshot net. NB: existing screenshots in `plans/AM5/design/gaps/` (`code-single.png`, `splitview*.png`) are from the prior framing — both superseded (`code-single`: `code` composes `block/CodePayload`; `splitview*`: replaced by the chat-extracted rebuild).

**Individual base-primitive foundation stories (review at `:8098`) — the EXISTS base primitives, each now its own component+story** (the viewer matches `hash === title`; each route renders that primitive's variants stacked):
- `#Heading`, `#Paragraph`, `#List`, `#Quote`, `#Divider`, `#Code`, `#Image`, `#Table`, `#Html`, `#Link` — ten individual foundation stories, thin wrappers over the shipped `block/*Payload.tsx` (+ `renderInline` for Link), all barrel-exported, all verified rendering 2026-06-26.
- The shared `#Block` page still exists as the **compose-many** review surface (all variants stacked, incl. `Unknown`); `#Page: Knowledge/Body` is the composed Text-family + sanitized-Html page.
- Artifact (single) host: `#Artifacts › ArtifactPreview` (carries single's state stories `NoPreview`/`Loading`/`ErrorState`).
- Review (diff): `#Conversations › Review{CodeDiff,VisualDiff,MetricsMoved,FieldChangeSet,RenderedInContext,ActionOperation,BrowserPreview}` + `ReviewUnknownCanvas`.
- Block (mixed): `#Block`; the populated `#Page: Knowledge/Body`.

The plumbing gaps (block anchor, H5, the per-kind→base-primitive selection, the cleanup wiring) author no story — proven by tests.

### 6a. The reviewable story route per base primitive (for founder review — each individual)

**One INDIVIDUAL viewer route per base primitive** (founder 2026-06-26: each foundation gets its own component+story) so the set is reviewable side-by-side. Ten EXIST primitives each have their own story; two (KPI, Graph) are authored. **All routes verified-loading on the worktree viewer 2026-06-26** (route = `hash.slice(1)`; `route === title` match — the `#` is the URL hash, not the title). The shared `#Block` page remains as the compose-many surface.

| Base primitive | Individual foundation story (variants on the page) | Viewer route (verified) | Status |
|---|---|---|---|
| **Heading** | `Levels`, `WithInline` | `http://localhost:8098/#Heading` | EXISTS — individual ✓ |
| **Paragraph** | `Plain`, `RichInline` | `http://localhost:8098/#Paragraph` | EXISTS — individual ✓ |
| **List** | `Unordered`, `Ordered` | `http://localhost:8098/#List` | EXISTS — individual ✓ |
| **Quote** | `Single`, `MultiLine` | `http://localhost:8098/#Quote` | EXISTS — individual ✓ |
| **Divider** | `Rule` | `http://localhost:8098/#Divider` | EXISTS — individual ✓ |
| **Code** | `WithLang`, `NoLang`, `Collapsible` | `http://localhost:8098/#Code` | EXISTS (highlighting TODO) — individual ✓ |
| **Image** | `Captioned`, `WithTitle` | `http://localhost:8098/#Image` | EXISTS — individual ✓ |
| **Table** | `Populated`, `WithInline` | `http://localhost:8098/#Table` | EXISTS — individual ✓ |
| **Html** | `Rendered`, `ListMarkup` | `http://localhost:8098/#Html` | EXISTS — individual ✓ (story-only passthrough sanitiser) |
| **Link** | `Standalone`, `InProse` | `http://localhost:8098/#Link` | EXISTS (inline) — individual ✓ |
| **KPI / Stat** | **`#KpiStat`** (`SingleMetric`, `MetricRow`) | `http://localhost:8098/#KpiStat` | **EXTRACT — authored ✓** |
| **Graph / Sparkline** | **`#Sparkline`** (`Trend`, `Flat`, `Volatile`) | `http://localhost:8098/#Sparkline` | **EXTRACT — authored ✓** |
| **unknown** (fallback) | `#Block` Unknown variant (composed fallback, not a foundation) | `http://localhost:8098/#Block` | EXISTS |

**Builder hand-off (no decoupling refactor needed):** each individual story is a thin wrapper over the shipped payload component — `List`/`Quote` pass nested-paragraph fixture children (the payloads recurse through `renderPayload`, which renders standalone fine); `Html` passes a passthrough sanitiser over pre-safe fixture markup (production injects DOMPurify at the host); `Link` renders the `link` inline node via the shipped `renderInline`. All payload components + `renderInline` are now exported from `packages/design-system/src/index.ts`. **Snapshot net:** the builder re-blesses `catalog-snapshot.test.tsx.snap` (13 new/changed story modules: 10 primitives + the rebuilt SplitView net DOM change + the new `UnifiedSplitView` story; plus the `SplitView` story now imports the shared `SplitView.tsx`) and bumps the enumeration guard floor — designer scope is story-renders-only.

## 6b. Cleanup of empty artifact/block-render scaffolding (IN SCOPE — founder, 2026-06-26)

Founder: *"part of this story is to connect cleanup all the empty references… many things in chats, tasks… were built to later render artifacts and we need to cleanup all of those."* AM5 lands the unified open contract + base-primitive rendering, so the dead "render later" hooks earlier WPs left for *this* surface are AM5's to resolve. **No surface is left with a dead artifact/block-render hook; deferrals are decided, not forgotten.** (Concept Phase 5 mirrors this.)

| Loose end | What it is | Disposition | Detail for the architect |
|---|---|---|---|
| `ArtifactSection.tsx:205-214` | "View all" — non-interactive `<span>`, `@lore L12 (B-3)` | **WIRE** | Route through the open contract (artifact list / aggregated surface). |
| `KnowledgeBody.tsx:44,103,139` | `onOpenBlockActions` threaded but unwired; `@lore L18` names AM5 | **WIRE** | Via the unified open contract (block-anchored open, H2). |
| `AssistantOverlay.tsx:188-204` (`BlockRefEmbed`) | Block-ref embeds that render but have no open-on-click | **WIRE** (or REMOVE if the overlay should not host block refs post-AM1) | Reconcile onto the unified open path (block-anchored open). Default = WIRE; architect confirms. |
| `TaskSheet.tsx:80-97` (`resolveThreadId`/`postRequest`/`onNavigateToThread`) | Three `@deprecated L18` props — ⚠️ architecture verified currently LIVE via `WorkBet.tsx:1666` + used at `TaskSheet.tsx:201-204`/`:330` | **VERIFY-THEN-REMOVE** (only genuinely-unreferenced props) | Confirm before removing; drop the `@deprecated` tag from live ones. Prior blind-REMOVE wording superseded. |
| Composer "+" menu (`InsertMenu`, `ConversationSurface.tsx:221-252`) | `@lore AM1 §12.6` visible affordances that don't mutate the draft | **DEFER (explicit)** | Draft-mutation/rich-compose is a composer concern, not artifact rendering. Affordance stays; later composer WP. |
| `QuestionnairePart.tsx:53-65` (answer chips) | `@lore DES-1` static non-interactive chips | **DEFER (explicit)** | Answering is an interaction/verdict concern, not artifact rendering. |
| By-design fallbacks: unknown-content embeds, mention embeds (non-navigating), story `console.info` | Intentional no-ops (H3) | **STAY AS-IS** | The contract's documented absence behavior, not dead hooks. |

**AC (add):** AM5 wires or removes the empty artifact/block-render references across chat/task/knowledge; no surface is left with a dead "render later" hook. Composer "+" menu + `QuestionnairePart` chips explicitly deferred. The architect plans the wiring against the unified open contract.

## 7. Rejection list (carried)

No two parallel renderer families (the `kinds/*-renderer.tsx` duplicate is REMOVED, not kept); no "purify the kind renderers" (they collapse onto the base primitives); **no diff inside a base primitive (K0); no empty/error/loading inside a base primitive (K0) — states are composition-owned; no `previewIsDiff`-discriminant-inside-the-content (RETRACTED); no "two-home / diff stays web-local" parallel content family (RETRACTED — the diff core is a DS foundation; review composes it with chrome only)**; **no migration / back-compat / preview-drop for the `code` purification (pre-alpha purge; the `artifacts.ts` `code_diff→code` normalization is DELETED)**; **no surface left with a dead artifact/block-render hook (cleanup in scope, §6b)**; no standalone `Link` component authored speculatively; **code syntax highlighting deferred (TODO, K6)**; no Dialog/overlay peek; no `Artifact`/`ReviewArtifact` merge; no standalone block viewer; no BlockKind merge into the content-type set; no new content type / placement / composition; no renderer rewrite / reinvented diff viewer; no second router; no data-shape/on-disk change beyond purifying the `code` content; no color/token change; no verdict logic; no backend/API/schema change (beyond the pre-alpha `code` schema purge).

## 8. Open questions for the architect

1. **[FOUNDER SIGN-OFF] H5 task deviation.** `resolveHostRoute(task) → null` (documented no-op), not H5's literal "via parent bet" — resolver has no `betId`; no AM5 AC requires task nav. Accept the deferral or schedule a future betId-on-task-ref WP.
2. **[ARCHITECT — fold] Divider-resize + persistence.** Pointer-events ratio drag (clamped 0.2–0.8) → flex ratio. Where is the ratio persisted — local UI preference, **per surface** (concept read) or global?
3. **[ARCHITECT — fold] Full-screen toggle + cardinality.** Mechanism to collapse origin→full and restore; confirm closed mode set `fold-back|split|full` and **replace-not-nest**.
4. **[ARCHITECT — fold] How does every `OpenTarget.route` present through the fold?** State the rule that makes "every reference opens via the fold; full-page = fully-folded-forward terminal" concrete.
5. **[ARCHITECT — base primitives] KPI + Graph placement, the data composition, the `code` purification.** Where KPI + Graph live (`packages/design-system/src/`, exported via `index.ts`); the data-kind→Table+KPI+Graph composition; the removal of `data-renderer.tsx` after extraction. The `code` content schema purification (`{path,text,lang}`) + diff relocation to the Review composition (the `previewIsDiff` discriminant is RETRACTED). K0/A1/reuse-first hold.
5b. **[ARCHITECT — fold] Global vs page-local mount.** `AppShell` (one global split shell owning `<Outlet>`) vs page-local; quantify coupling cost.
6. **[ARCHITECT — selection] The per-kind→base-primitive selection + DS diff core.** What replaces `renderer-registry.ts` (`getRenderer(kind)`) — how Artifact (single) resolves a base primitive per kind (a small map kind→primitive, or per-Kind-Definition). How the review chrome composes the **DS-relocated `diff` core** (the compare-two-base-primitive-instances machinery + per-primitive delta renderers, MOVED from `web`'s `canvas-registry.ts`/`review-artifact.ts` into `design-system`). Quantify the move cost: which review-canvas files split into (DS per-primitive delta renderer | web chrome). The richest (`metrics_moved`, `action_operation`, `browser_preview`) keep more in the DS delta renderer; preserve K1 fallback. **Carry the prior per-line slot-seam decision** — the relocated `code-renderer.tsx` hunks core exposes a per-line slot the review chrome fills, preserving the AL1/AL2 review DOM.
6b. **[ARCHITECT — fold] Reconcile the two splits.** Map chat's `SessionViewPanel` split and review's `ExaminePane` onto `SplitView`.
7. **[ARCHITECT] `SplitView` vs `Fold.tsx` naming.** The existing DS `Fold.tsx` is an unrelated disclosure ("Show") component. Resolve the collision (`SplitView` proposed; or rename the disclosure component).
8. **[ARCHITECT/BUILDER] Absorb `ArtifactView`.** Retire the redundant shell dispatcher in favor of `ArtifactPreview`; confirm call sites before removal.
9. **[ARCHITECT] Architecture.md re-plan.** Drop the prior `ArtifactViewFamily`/`QuickLook`/`Dialog.placement`. **RETRACT "purify the kind renderers / Kind × Representation"** — the block-payload layer is canonical; the kind-renderer layer is REMOVED; Artifact (single) composes the base primitives. **RETRACT `previewIsDiff` + "keep `code` preview diff-shaped"** — `code` content is pure; the diff is the Review composition. **RETRACT "two-home / diff stays web-local"** — the diff core moves LOW into DS; review chrome composes it. Replace `approved.md §1b`'s prior "FOUNDER DECISION — existing diff-shaped code data" with the **pre-alpha purge** (DELETE the `artifacts.ts:84-130` normalization). Add: the **`data` split → Table + KPI + Graph**, the **two EXTRACT primitives (KPI, Graph)**, the **kind-renderer collapse**, the **composition-owned state layer**, the shared fold, the per-kind→base-primitive selection + DS diff core, and the **cleanup wiring** (§6b). Note **code highlighting = TODO, deferred**. Architect re-issues a task list against the base-primitive foundation.
