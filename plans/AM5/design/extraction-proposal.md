# AM5 — Extraction proposal: the one base-primitive set + the Artifact/Review/Block matrix

`DESIGN-CLASS: novel` — AM5 picks the canonical content-rendering foundation and collapses the duplicate. The established **block-payload layer** (`packages/design-system/src/block/*` — shipped 2026-04-29, 16 docs) IS the **base-primitive set**; the recent `kinds/*-renderer.tsx` layer (2026-06-12, AE6) is a thin undocumented **duplicate that collapses onto it (removed, not purified)**. Three **compositions** build on the base primitives: **Artifact (single)**, **Review (diff)**, **Block (mixed)**. **Purity (K0):** a base primitive carries NO diff, NO comparison, NO empty/error/loading state; the diff is the Review composition; states are the composition's, for all primitives. The design output is the **base-primitive × composition matrix** + the **inventory** (each primitive: EXISTS/EXTRACT/NEW + source + reviewable story route) + the real net-new work: the **`data` split → Table + KPI + Graph**, the two **EXTRACT** primitives (KPI, Graph), and the shared **fold/`SplitView`**.

This **supersedes the prior "purify the kind renderers / Kind × Representation" proposal.** There are no kind renderers to purify — they collapse onto the base primitives. This is design intent for the architect: a **structure** (the matrix + the inventory), not an implementation.

---

## 1. The base-primitive × composition matrix (the design)

A renderer is a base primitive composed by Artifact (one instance), Review (two + delta), or Block (many). The duplicate kind-renderer layer is removed; the base primitives are the established block payloads. Each cell names the base primitive that fills it.

| Base primitive (pure content) | `(Artifact / single)` — compose one instance | `(Review / diff)` — compose two instances + delta | `(Block / mixed)` — compose many in a body |
|---|---|---|---|
| **Text family** `{body}` → Paragraph/Heading/List/Quote/Divider + inline | a `text` artifact composes the Text family (`deriveBlocks(body)` + the prose primitives) — the flat `text-renderer.tsx` div is **removed** (K5) | `ReviewRenderedInContext` (rendered prose before→after, shared with Html) | `block/{Paragraph,Heading,Quote,List,Divider}Payload` + `inline.tsx` |
| **Code** `{path,text,lang}` | a `code` artifact composes Code (`block/CodePayload`, file listing) — pure `{path,text,lang}` | Review of two Code instances (`code_diff`; the old `code-renderer.tsx` hunks render relocates here) | `block/CodePayload` (fenced, already pure ✓) |
| **Image** `{alt,url,title}` | a `image` artifact composes Image | Review of two Image (`visual_diff`) | `block/ImagePayload` |
| **Link** `{href}` (inline) | a `url`/link artifact composes the inline Link | Review of two Link (`action_operation`·`browser_preview`) | `block/inline.tsx` link node |
| **Html** `{raw}` | a `html` artifact composes Html (sandboxed) | `ReviewRenderedInContext` (`rendered_in_context`) | `block/HtmlPayload` |
| **Table** `{align,header,rows}` | part of a `data` artifact (split) | Review of two Table (`field_change_set`) | `block/TablePayload` |
| **KPI / Stat** `{label,value}[]` | part of a `data` artifact (split) | Review of two KPI (`metrics_moved`) | (future: a KPI block) |
| **Graph / Sparkline** `{label,values}` | part of a `data` artifact (split) | Review of two Graph (`metrics_moved` trend) | (future: a graph block) |
| **unknown** | content fallback (`block/UnknownPayload`) — K1 | `ReviewUnknownCanvas` | `block/UnknownPayload` |

### 1a. The inventory (each base primitive: EXISTS/EXTRACT/NEW + source + reviewable story route)

> **UPDATE (2026-06-26, founder — authoritative inventory is now `approved.md §1a/§6a`):** the base primitives are no longer reviewed only under the single `#Block` page. **Each base primitive is now its own INDIVIDUAL foundation component+story** (`#Heading … #Link`), barrel-exported, each a thin wrapper over the shipped `block/*Payload.tsx` (+ `renderInline` for the inline Link). The prior "Link / Html have no standalone story" rows below are **superseded** — `#Link` and `#Html` are individual routes now. The `#Block` page persists as the compose-many surface. Route = `hash.slice(1)`; `route === title` (the `#` is the URL hash, not the title). See `approved.md §6a` for the verified per-primitive route table.
>
> **Route format (original note, verified 2026-06-26, `viewer/main.tsx:84,413`):** the viewer matches `decodeURIComponent(hash.slice(1)) === story.title`. There is **no `#Title/Variant` sub-route** — a story page renders all its variants stacked.

| Base primitive | Status | Source component | Reviewable story route (verified) |
|---|---|---|---|
| **Text family** (Paragraph/Heading/List/Quote/Divider + inline) | **EXISTS** | `block/{Paragraph,Heading,List,Quote,Divider}Payload.tsx` + `inline.tsx` | `#Block` (Heading/Paragraph/List/Quote/Divider variants) + `#Page: Knowledge/Body` (the family composed) |
| **Code** | **EXISTS** (highlighting = TODO) | `block/CodePayload.tsx` | `#Block` (Code variant) |
| **Image** | **EXISTS** | `block/ImagePayload.tsx` | `#Block` (Image variant) |
| **Link** | **EXISTS** (inline) | `block/inline.tsx` link node | **no standalone story** — rendered inline inside `#Block` (Paragraph / Table variants) and `#Page: Knowledge/Body`; a standalone surfacing is deferred to a genuine 2nd-context need |
| **Html** | **EXISTS** | `block/HtmlPayload.tsx` | **no standalone story** — the sanitized-html render is exercised composed via `#Page: Knowledge/Body` (MixedWithHtml / HostileHtml). A dedicated `#Block` Html variant could be added if the founder wants it isolated — cheap, same `Block` harness — but does not exist today. |
| **Table** | **EXISTS** | `block/TablePayload.tsx` | `#Block` (Table variant) |
| **KPI / Stat** | **EXTRACT** | extract from `kinds/data-renderer.tsx` headlines flex-grid | **`#KpiStat`** (`SingleMetric`, `MetricRow`) — authored + rendering ✓ |
| **Graph / Sparkline** | **EXTRACT** | extract from `Sparkline()` SVG in `kinds/data-renderer.tsx` | **`#Sparkline`** (`Trend`, `Flat`, `Volatile`) — authored + rendering ✓ |
| **unknown** (fallback) | **EXISTS** | `block/UnknownPayload.tsx` | `#Block` (Unknown variant) |

**Net:** six EXIST (block-payload layer), two EXTRACT (KPI, Graph), zero NEW from scratch. KPI + Graph are lifted from existing rendered code (`data-renderer.tsx`), not authored greenfield. Future chart types (bar/line/multi-series) are NEW off the Graph seam — noted, not scoped.

### 1b. The `data` split (K2c)

The monolithic `data` kind (`kinds/data-renderer.tsx`) verifiably fuses three content types:
- a **headlines flex-grid** (`{label, value}` figures) → **KPI / Stat** (EXTRACT).
- a **`rows` table** → **Table** (EXISTS, `TablePayload`).
- **`Sparkline()` charts** → **Graph / Sparkline** (EXTRACT).

A `data` artifact composes all three (a KPI row + a Table + Graphs). The review `metrics_moved` canvas composes the Review-diff of KPI + Graph. This split is the design's central structural move alongside the kind-renderer collapse.

### 1c. The kind-renderer collapse (K5)

The AE6 `kinds/*-renderer.tsx` layer + `renderer-registry.ts` (`getRenderer(kind)`) is **removed, not purified**. Disposition per file:

| Removed file | What happens |
|---|---|
| `kinds/text-renderer.tsx` | **removed** — a `text` artifact composes the Text family (`deriveBlocks` + prose primitives), the rich render its own `@lore AE6` already asked for. |
| `kinds/code-renderer.tsx` (hunks, `{file,hunks}`) | the hunks render **relocates** into the Review composition (`code_diff`); the `code` content shape is purified `{file,hunks}`→`{path,text,lang}`; Artifact composes `block/CodePayload`. |
| `kinds/image-renderer.tsx` | **removed** — `image` artifact composes `block/ImagePayload`. |
| `kinds/data-renderer.tsx` | **EXTRACT KPI + Graph first** (the genuinely-new pieces), then **removed** — `data` artifact composes Table + KPI + Graph. |
| `kinds/html-renderer.tsx` | **removed** — `html` artifact composes `block/HtmlPayload`. |
| `kinds/url-renderer.tsx` (status card) | **removed** — `url`/link artifact composes the inline Link primitive (the status card was a different concern). |
| `kinds/fallback-renderer.tsx` | **removed** — `block/UnknownPayload` is the content fallback (K1). |
| `kinds/renderer-registry.ts` (`getRenderer`) | **removed** — Artifact (single) composes the base primitive per kind directly (architect designs the per-kind→base-primitive selection that replaces it, O6). |

---

## 2. The selection shape (Artifact composes the base primitive directly)

Today three live entry points: `getRenderer(kind)` (the removed kind-renderer registry) + `getReviewCanvas(kind)` (Review) + `renderPayload(payload)` (Block). AM5:

- **Artifact (single)** composes the matching base primitive per kind (`text`→Text family, `code`→Code, `image`→Image, `html`→Html, `url`→Link, `data`→Table+KPI+Graph). This **replaces** the removed `getRenderer(kind)` — Artifact resolves a base primitive, the same one Block composes, not a parallel kind renderer.
- **Review (diff)** composes two instances + delta; the review chrome (PR header / file-bands / approve) composes the DS diff core downward.
- **Block (mixed)** composes many via `render-payload` (dispatched by BlockKind).

**Conceptual shape (design intent — the architect implements):**

```
Artifact(single):  kind → base primitive(s)  (text→Text family, code→Code, …, data→Table+KPI+Graph)
Review(diff):       compose(base primitive ×2, delta)  + review chrome
Block(mixed):       deriveBlocks(body) → many base primitives
unknown content →   the content fallback for that composition  (UnknownPayload / ReviewUnknownCanvas)  — never blank, never crash
```

- Artifact and Block of one content type **share the underlying base primitive** — a `code` artifact and a fenced-code block both render `block/CodePayload`. This untangles `kinds/code.ts` (which smuggles a diff into the `code` content): purify the content (`{path,text,lang}`), relocate the diff to the Review composition. The prior `previewIsDiff`-discriminant-inside-the-kind is **retracted** — content is never "maybe a diff."
- The **unknown-content fallback** is a *content* fallback ("unrecognized content, raw form"), **not** an empty/error/loading state — those are the composition's.
- BlockKind stays its **own closed AST vocabulary** — not merged into the artifact content-type set; it *composes the same base primitives* via the fixed mapping.

**Foundation placement (K2b):** the base primitives, the generic compare-two-instances `diff` core + per-primitive delta renderers, and the `mixed` block composition are all **DS foundations** owned LOW in `packages/design-system`. The **review experience in `web` USES the DS `diff` foundation** and adds only review *chrome* — **no parallel content family.** The "two-home / `diff` stays web-local" framing is **retracted**: the `DS ↛ web` boundary was the *signal the foundation was mis-placed (too high, in `web`)*, not a reason to split.

**Open for the architect (O6):** the per-kind→base-primitive selection that replaces `renderer-registry.ts`; how the review chrome composes the DS diff core; which review-canvas files split into (DS per-primitive delta renderer | web chrome) — the richest (`metrics_moved`, `action_operation`, `browser_preview`) keep more in the DS delta renderer and push live-status/timeline workflow to web chrome.

---

## 3. The named gaps (the genuinely-new design work — scope tightly)

### 3.a — KPI / Stat (EXTRACT) and Graph / Sparkline (EXTRACT) — the two new base primitives

The two genuinely-new base primitives are **extracted** from the collapsing `data-renderer.tsx`, where they exist today as buried, non-exported code.

- **KPI / Stat** — today the `data` renderer's headlines flex-grid (`data-renderer.tsx` lines ~71–83): a `flex flex-wrap gap-3` of `{label, value}` figures (mono caps label + tabular-nums value). EXTRACT it into a standalone base primitive. Reuse the existing tokens (`text-[11px] font-mono uppercase tracking-caps-sm text-tertiary` label + `text-base font-semibold tabular-nums text-primary` value) — no new chrome, no new tokens. NB: `KeyValue.tsx` is the closest existing analog but is NOT this (it is a bare inline label/value pair, not a headline metric figure grid); KPI is the figure-grid display.
  - **Embodiment (authored ✓):** `packages/design-system/src/KpiStat.stories.tsx` (`title: "KpiStat"`, group `Primitives`; variants `SingleMetric`, `MetricRow`). Viewer: `http://localhost:8098/#KpiStat` — confirmed rendering. Populated real state only.
- **Graph / Sparkline** — today the `Sparkline()` SVG buried in `data-renderer.tsx` (lines ~28–58, not exported): an 80×24 polyline over `--accent-primary`, min/max-normalized. EXTRACT it into a standalone base primitive. Reuse exactly — no new tokens, no new chrome.
  - **Embodiment (authored ✓):** `packages/design-system/src/Sparkline.stories.tsx` (`title: "Sparkline"`, group `Primitives`; variants `Trend`, `Flat`, `Volatile`). Viewer: `http://localhost:8098/#Sparkline` — confirmed rendering. Populated real state only.
- **The data artifact composes Table + KPI + Graph** — once both land, the architect/builder assembles the data Artifact view from the three primitives; the design proves each primitive standalone.
- **Open for the architect (O5):** where KPI + Graph live (`packages/design-system/src/`, exported via `index.ts`), the data-kind→Table+KPI+Graph composition, and the removal of `data-renderer.tsx` after extraction. The `code` content schema purification (`{file,hunks}`→`{path,text,lang}`) + diff relocation to the Review composition (the `previewIsDiff`-discriminant is retracted).

### 3.b — The shared fold / `SplitView` primitive (concept Noun 4 / F1–F5)

- **What's missing:** there is **no shared split component**. Chat (`SessionViewPanel` split, `flex-[3]`/`flex-[2]`, `border-r`, button-close, `D`) and review (`ExaminePane`, fixed `w-[620px]`, `border-l`, `Esc`/row-toggle) each hand-roll one, divergently. Neither has **drag-to-resize** or **fold-forward/full-screen** — the founder's two explicit asks.
- **Scope:** one content-agnostic `SplitView`/fold primitive: two slots (origin / destination), a **draggable divider** (resize; ratio persisted per surface), a **mode control** for the closed set `fold-back | split | full`. Standardize on chat's **proportional** model; review's `ExaminePane` converges (drops fixed-620 + `border-l`, keeps content + Esc). The fold owns ONLY the container + controls; the destination half is the reused composition (F4).
- **Embodiment (author):** `packages/design-system/src/SplitView.stories.tsx` (`title: "SplitView"`, group `System`; variants `Split` / `Full` / `FoldBack`). Viewer: `http://localhost:8098/#SplitView`. Placeholder labelled panes; draggable divider wired (pointer-events ratio drag, clamped 0.2–0.8).
- **Open for the architect:** divider-resize + per-surface persistence (O2); full-screen toggle + replace-not-nest cardinality (O3); how every `OpenTarget.route` presents through the fold (O4); global (`AppShell`) vs page-local mount (O5b); the chat/review reconcile mapping (O6b); `SplitView` vs the existing `Fold.tsx` naming (O7).

### 3.c — Plumbing gaps (no view shape — proven by tests, no story)

- **Block-anchored open (H2 / AC2):** optional `blockId` on the `host` `OpenTarget`; adapter pass-through; `#block-<id>` fragment in `open-handler`; scroll-to-`[data-block-id]` in `KnowledgeDetail`.
- **H5 route seams (Gap B):** `resolveHostRoute(artifact) → /artifacts/:id`; `resolveHostRoute(task) → null` documented no-op (resolver has no `betId`; deviates from H5's literal "via parent bet" — founder sign-off, O1).

---

## 4. What each surface absorbs / drops

| Surface | Action | Detail |
|---|---|---|
| `block/*Payload.tsx` + `inline.tsx` + `render-payload.tsx` + `Block.tsx` | **KEEP — the canonical base-primitive set.** | Extract up as THE foundation; Artifact (single) and Block (mixed) both compose these. No on-disk dialect, no per-block key (Block hard rules). |
| `kinds/*-renderer.tsx` + `renderer-registry.ts` | **REMOVE — the duplicate (collapse onto the base primitives).** | Extract KPI + Graph up from `data-renderer.tsx` first; relocate `code-renderer.tsx`'s hunks into the Review composition; remove the rest. See §1c. |
| `kinds/data-renderer.tsx` | **SPLIT then REMOVE.** | → Table (EXISTS) + KPI (EXTRACT) + Graph (EXTRACT). Data artifact composes all three. |
| `ArtifactPreview` (DS) | **KEEP — the Artifact (single) host; owns single's states.** | Header + body composing the base primitive + `discussion` slot. Pure of routing. Replaces the removed kind-renderer dispatch with base-primitive composition. |
| `ArtifactView` (shell) | **Absorb → drop the redundant dispatcher.** | A second renderer dispatcher already covered by `ArtifactPreview`. Re-point callers; builder confirms (likely only its own story). |
| `Review*.tsx` + `getReviewCanvas` | **KEEP — review CHROME that COMPOSES the DS diff core (K2b).** | The `diff` CORE (compare-two-base-primitive-instances + delta) moves DOWN into `design-system`; `getReviewCanvas` becomes the review-CHROME registry composing the DS diff downward (PR header, file bands, anchors/composer/threads, status polling). `code-renderer.tsx`'s hunks render is the DS `(code, diff)` core, restructured to expose a per-line slot seam the review chrome fills (carry the prior per-line slot-seam decision). No `Artifact`/`ReviewArtifact` type merge. No parallel content family in `web`. |
| `OpenTarget`/`createOpenHandler`/`resolveHostRoute` | **KEEP + universalize + fix H5 + carry block anchor.** | One contract every surface routes through (H1); destination half delegates to the resolved composition (H4). |
| chat `SessionViewPanel` split + review `ExaminePane` | **Reconcile onto the shared fold.** | The extraction source for `SplitView`. |

---

## 5. Combined content-type set — confirmed

`text · code · image · data · html · url` + `unknown` (the AE6 set + fallback) — each maps to base primitive(s): `text`→Text family, `code`→Code, `image`→Image, `data`→Table+KPI+Graph, `html`→Html, `url`→Link, `unknown`→the content fallback. Block `table`→Table, prose grammar→the Text family, fenced `code`/`image`/`html`→Code/Image/Html — BlockKind composes the **same** base primitives. Review `code_diff`/`visual_diff`/`metrics_moved`·`field_change_set`/`rendered_in_context`/`action_operation`·`browser_preview` → the Review composition of the matching base primitive(s). `outcome_summary` + `batch` → review composition scaffolding, NOT content, not cells.

Content types stay **OPEN** (AE6 Kind Definitions). The base primitives are **PURE** (no diff, no state inside them). Compositions stay **CLOSED** at `Artifact (single) | Review (diff) | Block (mixed)` and **own the states**. BlockKind stays its own **CLOSED** AST vocabulary, composing the shared base primitives — not merged.

---

## 6. Explicit "NOT changing" list

- **No two parallel renderer families.** ONE content-renderer family — the base primitives (the block-payload layer). The `kinds/*-renderer.tsx` duplicate is REMOVED (KPI + Graph extracted up first), not kept.
- **No "purify the kind renderers."** They collapse onto the base primitives; there is nothing to purify. (Supersedes the prior framing.)
- **No type merge.** `Artifact` and `ReviewArtifact` stay separate; review canvases are review chrome composing the DS diff core.
- **No standalone block viewer.** A block opens its host Knowledge body positioned at the block (H2). BlockKind composes the base primitives, not merged into the content-type set.
- **No new content type, no new placement layout, no new composition.** Content types = open AE6 set; placements = closed 4; compositions = closed `Artifact|Review|Block`.
- **No renderer rewrite, no reinvented diff viewer.** The base primitives are the established block payloads; KPI + Graph are *extracted* from existing code; the diff core is the reclassified hunks render. The one structural shape change is purifying the `code` content (`{file,hunks}`→`{path,text,lang}`).
- **No data-shape / on-disk change beyond the `code` correction — done as a PRE-ALPHA PURGE.** Content type + composition are derived-not-stored. NO migration, NO back-compat read-normalization, NO preview-drop; the server `artifacts.ts:84-130` `code_diff→code` normalization is DELETED.
- **No standalone `Link` component authored speculatively.** Link is the inline node; a standalone surfacing is deferred to a genuine 2nd-context need.
- **Code syntax highlighting = TODO, deferred.** `CodePayload` renders plain mono; AM5 adds no highlighter; a future WP adds one behind the surface.
- **No surface left with a dead artifact/block-render hook.** Cleanup in scope (`approved.md §6b`).
- **No Dialog/overlay peek.** The open presentation is the in-place fold.
- **No color/token change. No verdict/review-decision logic. No backend/API/schema/credential change** (beyond the pre-alpha `code` schema purge).

---

## 7. Delta vs the existing `architecture.md`

The existing `architecture.md` is valid for the contract/routing plumbing (block anchor + H5) but its rendering surface must be re-pointed to the base-primitive foundation:

| architecture.md / prior design proposes | Correction |
|---|---|
| "purify the `kinds/*-renderer.tsx` layer as the `single` base" | **RETRACTED.** The block-payload layer is canonical; the kind-renderer layer is REMOVED (collapsed onto the base primitives). Artifact (single) composes the base primitives directly. |
| "Kind × Representation" model + `getRenderer(kind, representation)` over a 3-registry merge | **Re-pointed.** The model is base primitives × {Artifact/Review/Block}. The kind-renderer registry is removed; Artifact composes the base primitive per kind; Review chrome composes the DS diff core; Block composes via `render-payload`. |
| keep the monolithic `data` renderer | **RETRACTED.** `data` splits into Table + KPI + Graph (K2c). |
| `previewIsDiff` discriminant / "keep `code` preview diff-shaped" | **RETRACTED.** `code` content is pure `{path,text,lang}`; the diff is the Review composition built from two instances. |
| "two-home / `diff` stays web-local / `ReviewArtifact` parallel family permanent" | **RETRACTED.** Base primitives + the diff core are DS foundations; review chrome in `web` composes the DS diff cell — no parallel content family. |
| `approved.md §1b` "FOUNDER DECISION — existing diff-shaped code data" (migrate/accept-drop/back-compat) | **REMOVED.** Pre-alpha purge — clean schema rewrite, NO migration; DELETE the `artifacts.ts:84-130` `code_diff→code` normalization. Six consumers still all change. |
| (NEW) **KPI + Graph base primitives (EXTRACT)** | **Add** (§3.a) — extracted from `data-renderer.tsx`; the data split's two new primitives. |
| (NEW) **the kind-renderer collapse** | **Add** (§1c) — remove `kinds/*-renderer.tsx` + `renderer-registry.ts`; Artifact composes the base primitives. |
| (NEW) the shared fold/`SplitView` primitive | **Add** (§3.b) — the ONE net-new container. |
| (NEW) **cleanup of empty artifact/block-render scaffolding** | **Add** (`approved.md §6b`) — wire/remove every dead "render later" hook; defer composer "+" menu + `QuestionnairePart` chips. |
| Block anchor + H5 plumbing | **Keep.** |

**Net footprint:** extract the block-payload layer up as the base-primitive set + collapse the kind-renderer duplicate (remove `kinds/*-renderer.tsx` + `renderer-registry.ts`) + **split `data` into Table + KPI + Graph** + **extract the KPI + Graph base primitives** + purify the `code` content (`{file,hunks}`→`{path,text,lang}`) + relocate its diff to the Review composition (DS diff core) + the composition-owned state layer + the shared fold/`SplitView` + chat/review reconcile + 2 `host-route.ts` edits + 1 optional `OpenTarget.blockId` + `open-handler` fragment + 1 `KnowledgeDetail` scroll effect + the `ArtifactView` shell absorption + the cleanup wiring. **Net-new component shapes: KPI, Graph, `SplitView`. Code highlighting = TODO, deferred.**
