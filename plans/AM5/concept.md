# AM5 — One base-primitive set; Artifact/Review/Block compose it — Concept

**Level:** Per-workpackage concept (AM5). Inherits Track AM's load-bearing distinction (conversation = deliberate messages; session = lower-level surface) as a fixed input; AM5 is orthogonal to it — it governs *what view opens when you open a reference, from any surface*, and *which renderer renders the thing once it opens*.

**Mode:** Autonomous. Founder foundation decision (2026-06-26) — transcribed, not re-litigated.

---

## The locked foundation decision (2026-06-26 — grounded in verified code)

Two layers in the codebase render content. AM5 picks the canonical one and collapses the other.

- **The established, thoroughly-designed, well-wired layer is the BLOCK-PAYLOAD layer** — `packages/design-system/src/block/*Payload.tsx` + `inline.tsx` + `render-payload.tsx` + `Block.tsx`. Shipped 2026-04-29, **16 docs** in `docs/blocks/`, a full primitive: anchors, cross-refs, inline nodes (`strong·emphasis·inlineCode·link·break`), HTML sanitization, prose grammar (`heading·paragraph·list·quote·divider`), `table`, fenced `code`, `image`, `html`, `unknown` fallback. It is the real, documented content-rendering foundation.
- **The kind-renderer layer is RECENT, thin, undocumented, and a DUPLICATE** — `packages/design-system/src/kinds/*-renderer.tsx` (2026-06-12, AE6). It re-renders the same content types (`text·code·image·data·html·url`) a second way, with its own payload shapes and its own selection registry, sharing no basis with the block layer.

**DECISION: the block-payload layer IS the canonical base-primitive set. Extract it up as THE foundation. The AE6 `kinds/*-renderer.tsx` layer COLLAPSES onto these primitives — it is REMOVED, not purified.** Artifact (single) composes the base primitives directly — the same ones Block (mixed) already uses. There is **one** family of content renderers, not two parallel ones.

This **supersedes the prior "purify the kind renderers" framing** (and its "Kind × Representation" vocabulary). The prior concept treated `kinds/*-renderer.tsx` as the canonical `single` base layer to be cleaned; the founder decision inverts this: that layer is the duplicate, the block layer is canonical, and `single` is the block primitives composed standalone — there is no separate kind-renderer family to purify.

**Three founder reshape directions (2026-06-26) folded into this concept (carried, restated over the base-primitive vocabulary):**
1. **Base primitives are FOUNDATIONS in the design system; all three compositions COMPOSE them** — at the type/composition level, not merely the vocabulary level (K0 / K2b). The diff core moves LOW (into `design-system`), Review composes it; the "two-home" framing is retracted.
2. **Pre-alpha PURGE** — no DB data exists; the `code` schema correction is a clean rewrite, NO migration / NO back-compat / NO preview-drop (K4b).
3. **Cleanup of empty artifact/block-render scaffolding is IN SCOPE** — wire or remove every dead "render later" hook across chat/task/knowledge (Phase 5).

---

## Required reading (downstream `/architecture`, `/pipeline` must read these)

- `.pipeline/work-packages/TRACK-AM.md` § AM5 — the spec, ACs, design axes, contracts.
- `docs/process-layer/artifact-primitive.md` — L3 Artifact; reconciled by this concept: an Artifact (single) **composes a base primitive**, the same primitive Block composes.
- `docs/human-interface-layer/open-contract.md` — the open/routing contract; its destination half renders a base-primitive composition (Artifact / Review / Block).
- `docs/blocks/` (16 docs) — the canonical content primitive. `what-a-block-is-not.md` (§2 not a chat message, §3 no per-block key), `blockkind-the-closed-vocabulary.md`, `where-blocks-render.md`. The block-payload layer is the **source** the base primitives extract up from. Block hard rules (no on-disk dialect, no per-block key, derived-not-stored) are honored.
- `docs/human-interface-layer/part-model.md` — `OpenTarget`, the resolved-path table, the closed Embed model; states **"Block-anchored navigation is deferred to AM5."**
- Code — the canonical source layer (KEEP, extract up):
  - `packages/design-system/src/block/{Paragraph,Heading,List,Quote,Divider}Payload.tsx` + `inline.tsx` — the **Text** family (prose primitives + inline nodes).
  - `packages/design-system/src/block/CodePayload.tsx` — the **Code** primitive (fenced, mono, collapse-over-20-lines). **No syntax highlighting yet — TODO (deferred, marked explicitly).**
  - `packages/design-system/src/block/ImagePayload.tsx` — the **Image** primitive.
  - `packages/design-system/src/block/HtmlPayload.tsx` — the **Html** primitive (sanitized rich content).
  - `packages/design-system/src/block/TablePayload.tsx` — the **Table** primitive (GFM table).
  - `packages/design-system/src/Block.tsx` + `render-payload.tsx` — the composition machinery (dispatches a `BlockPayload` to its primitive).
- Code — the DUPLICATE layer (COLLAPSE / remove):
  - `packages/design-system/src/kinds/*-renderer.tsx` (`text·code·image·data·html·url·fallback`) + `renderer-registry.ts` (`getRenderer(kind)`) — the AE6 duplicate. **Removed.** Its only genuinely-new presentational content (the **KPI headlines** display + the **`Sparkline()` SVG**, both buried inside `data-renderer.tsx`) is **EXTRACTED** as two standalone base primitives before the layer is removed.
  - `packages/shared/src/kinds/*.ts` + `registry.ts` (**ArtifactKind**, 6, OPEN) — the artifact preview schemas. `kinds/code.ts`'s `{file, hunks}` is diff-shaped (the structural bug); the diff belongs to Review, not the `code` primitive.
- Code — the Review (diff) layer:
  - `packages/web/src/pages/review/review-artifact.ts` + `canvas-registry.ts` — **ReviewCanvasKind** (9 canvases). The diff CORE moves LOW into `design-system`; review chrome stays in `web`.
- Code — the open contract + fold seams:
  - `packages/shared/src/part.ts` — `OpenTarget`/`OpenHandler`/`Embed`.
  - `packages/web/src/services/open-handler.ts` + `host-route.ts` — `createOpenHandler`, `resolveHostRoute` (two real route seams to fix, H5).
  - `packages/web/src/shell/Conversations.tsx` `SessionViewPanel` split + `pages/review/ReviewComposition.tsx` `ExaminePane` — the two hand-rolled splits the fold extracts from.

---

## The two-layer duplication (the problem AM5 fixes)

**Verified in code.** The same content types are rendered **twice**, by two parallel families that share no basis.

| Content type | Block-payload layer (CANONICAL — established, 16 docs) | Kind-renderer layer (DUPLICATE — recent, undocumented) |
|---|---|---|
| prose | `Heading·Paragraph·List·Quote·Divider Payload` + `inline.tsx` | `text-renderer.tsx` (flat `whitespace-pre-wrap` div — insufficient; its own `@lore AE6` says "swap this div for a Block primitive when one lands") |
| code | `CodePayload` (fenced, `{lang,text}` — pure ✓) | `code-renderer.tsx` (`{file, hunks}` — a **diff**, the structural bug) |
| image | `ImagePayload` (`{alt,url,title}`) | `image-renderer.tsx` |
| table | `TablePayload` (`{align,header,rows}`) | — (subsumed by the `data` renderer) |
| html | `HtmlPayload` (`{raw}` + sanitize) | `html-renderer.tsx` |
| KPI / metrics | — (genuinely new; not in the block layer) | hardcoded headlines flex-grid **inside** `data-renderer.tsx` |
| graph / sparkline | — (genuinely new; not in the block layer) | hand-rolled `Sparkline()` SVG **inside** `data-renderer.tsx` (not exported) |
| link | `inline.tsx` link node (`{href, children}`) | `url-renderer.tsx` (a status card, a different concern) |

The bug is not "two subsystems exist." It is that the recent kind-renderer layer **reinvented** content rendering the established block layer already owns — a thin, undocumented duplicate of a thoroughly-designed, well-wired primitive. **AM5 keeps the canonical block layer, extracts it up as the base-primitive set, and collapses the duplicate onto it.** Two pieces of the duplicate are *not* duplicates — the KPI headlines display and the `Sparkline()` SVG are genuinely-new content the block layer never had; those are **extracted up** as standalone base primitives before the kind-renderer layer is removed.

---

## The ONE complete base-primitive set (the model)

A **base primitive** (a.k.a. **element**) is a presentational, "almost just style" renderer for one irreducible content type. It takes *real content of one type* and renders it — nothing else. The base primitives are owned LOW in `packages/design-system` (sourced from the established block-payload layer). The three compositions (Artifact / Review / Block) build on them.

### The eight base primitives

| # | Base primitive | What it renders | Source component(s) | Status |
|---|---|---|---|---|
| 1 | **Text** (family) | prose — Paragraph, Heading (h1–h6), List, Quote, Divider + inline (`strong·emphasis·inlineCode·link·break`) | `block/{Paragraph,Heading,List,Quote,Divider}Payload.tsx` + `inline.tsx` | **EXISTS** |
| 2 | **Code** | fenced code, mono, collapse-over-N-lines | `block/CodePayload.tsx` | **EXISTS** — syntax highlighting = **TODO (deferred)** |
| 3 | **Image** | a single image (`{alt, url, title}`) | `block/ImagePayload.tsx` | **EXISTS** |
| 4 | **Link** | external / reference link | `block/inline.tsx` link node | **EXISTS** (inline) — standalone surfacing optional (see note) |
| 5 | **Html** | sanitized rich content (`{raw}` + sanitize) | `block/HtmlPayload.tsx` | **EXISTS** |
| 6 | **Table** | GFM table (`{align, header, rows}`) | `block/TablePayload.tsx` | **EXISTS** |
| 7 | **KPI / Stat** | headline metric(s) — one or more `{label, value}` figures | EXTRACT from `kinds/data-renderer.tsx` headlines flex-grid (today only bare `KeyValue.tsx` exists) | **EXTRACT** |
| 8 | **Graph / Sparkline** | a small inline trend chart | EXTRACT from the hand-rolled `Sparkline()` SVG buried in `kinds/data-renderer.tsx` (not exported) | **EXTRACT** |

**Text is a family**, not a single primitive — it is the prose sub-primitives (Paragraph, Heading, List, Quote, Divider) plus the inline grammar (`strong·emphasis·inlineCode·link·break`). A `text` body's richness IS this family composed; there is no separate "rich text renderer" — the Text family **is** it.

**Link note.** Link exists today only as an inline node inside `inline.tsx` (it renders inside prose, table cells, etc.). A *standalone* `Link` base primitive (a reference card / link-as-block) is worth surfacing only if a standalone link surface materializes (e.g. a `url`-kind artifact rendered as a link). The inline link suffices for the prose/table/composition use; AM5 does **not** author a new standalone `Link` component speculatively — it notes the inline node as the Link primitive and defers a standalone surfacing to a genuine 2nd-context need. (The AE6 `url-renderer.tsx` "status card" is a *different* concern — a deploy/PR status summary, not a link — and collapses with the rest of the kind layer; if a `url` artifact needs rendering, it composes the inline Link primitive, not a reinvented status card.)

**Code highlighting is a TODO, deferred (marked explicitly).** `CodePayload` renders plain mono text with no syntax highlighting. AM5 does **not** add a highlighting engine — it is out of scope, recorded here so it is a decided deferral, not a forgotten gap. A future WP adds a highlighter behind the existing `CodePayload` surface (no token/chrome change).

### The data split — `data` → three primitives

The old monolithic `data` kind (`kinds/data-renderer.tsx`) is **not** one primitive. It is three different content types fused into one renderer: a table, headline metrics, and sparkline charts. AM5 **splits `data` into three base primitives**:

- **Table** (#6) — EXISTS as `TablePayload`. The `data` renderer's `rows` table folds onto it.
- **KPI / Stat** (#7) — EXTRACT. The `data` renderer's `headlines` flex-grid (the `{label, value}` figures) becomes a standalone KPI primitive.
- **Graph / Sparkline** (#8) — EXTRACT. The `data` renderer's `Sparkline()` SVG becomes a standalone Graph primitive.

A "data" artifact is then a **composition** of these three base primitives (a KPI row + a Table + Graphs), not a monolithic renderer. Further chart types (bar, line, multi-series) are future/NEW — noted, not scoped now; the extracted Graph primitive is the seam they extend.

### The three compositions build on the base primitives

| Composition | = | Builds on the base primitives by… |
|---|---|---|
| **Artifact** | **single** — one base-primitive instance, one version, standalone | composing **the matching base primitive**: a `text` artifact → the Text family; `code` → Code; `image` → Image; `html` → Html; `link/url` → Link; `data` → Table + KPI + Graph. Replaces the collapsing `kinds/*-renderer.tsx` — the Artifact view composes the SAME base primitives Block uses. |
| **Review** | **diff** — two base-primitive instances compared | composing **the matching base primitive twice + a delta**. The DS diff core is the generic "compare two base-primitive instances + delta presentation" (per-line slot seam carried — review chrome fills it). Review chrome (PR header, file bands, approve affordances) layers on top in `web`. |
| **Block** | **mixed** — a body of many base-primitive instances | composing **many base primitives** in a stream (`deriveBlocks(body)` + the primitives via `Block`/`render-payload`). This already IS the block system. |

**Artifact (single) and Block (mixed) converge on the SAME base primitives.** A `text` artifact (single) renders through the Text family — the same Paragraph/Heading/List/Quote primitives a Block body composes. The difference between Artifact and Block is the *composition wrapper* (one instance standalone vs many in a body, and who owns the states — see K0b), **not the renderer**. There is one set of renderers; the compositions differ in how many instances they compose and what chrome/states they wrap around them.

### K0 — base primitives are pure content; the compositions own states (the load-bearing hard rule)

A **base primitive is pure, irreducible content** plus a renderer that, given *real content of that type*, renders it — and **nothing else**. A base primitive carries:

- **no diff / no comparison** — Code is *just code* (`{path, text, lang}`), Image is *just an image*, Table is *just a table*, Text is *just prose*. A primitive is *never* "maybe a diff." The diff is built BY the **Review** composition FROM two base-primitive instances. (`kinds/code.ts`'s `{file, hunks}` is the exact violation — a diff smuggled into the `code` content shape. The pure `code` content is `{path, text, lang}`; the diff is Review's.)
- **no empty / error / loading / no-content state** — a base primitive only ever renders actual content. "No content / empty / error / loading / no-changes" are owned by the **composition** that wraps the primitive. This is true for **all** primitives.

A base primitive renderer is therefore *total over present content and silent on absence* — it assumes it was handed real content and renders it. Whoever might NOT have content (the Artifact that failed to load, the Review with no changes, the Block body with no members) is the composition's problem, not the primitive's.

### K0b — the gate contract (the structural rule that makes K0 enforceable)

**The composition guarantees present content BEFORE it ever invokes a base primitive.** A base primitive's content prop is therefore **non-optional** (never `null`) and it has **NO** empty/error/loading/no-content branch whatsoever — it renders content, full stop. The decision "is there content?" is made by the **composition**, not the primitive:

- **Artifact (single)** (`ArtifactPreview` / `ArtifactPreviewSurface` / `ArtifactPermalink`) owns *no content / loading / error*. It gates: content present → call the pure base primitive with guaranteed content; absent → render its OWN absence state (`NoPreviewText`, the permalink's `Loading…`/`EmptyState`/`ErrorState`).
- **Review (diff)** owns *no changes / diff error*. It gates whether two instances differ; only on a real change does it render.
- **Block (mixed)** (`Block` / `KnowledgeBody`) owns *empty body / absence*. It gates whether the body has members before rendering any.
- The **`unknown` content fallback (K1) survives** — but it is "I don't recognize this content, here is the raw form," NOT "there is no content." Unrecognized-content is the primitive layer's fallback; absence is the composition's. A renderer that branches on `!content` to print "No X available" has put the composition's job inside the primitive — the defect K0b forbids.

Verified-in-code: `ArtifactPreviewSurface.renderBody` already gates `preview == null → NoPreviewText` and error-boundaries the renderer *before* it selects a renderer — the single composition is already the gate; the kind renderers' own `if(!preview)` branches are dead under it and are removed with the layer.

### K2b — foundation placement (base primitives + diff core are DS foundations)

**The base primitives, the generic compare-two-instances `diff` core + per-primitive delta renderers, and the `mixed` block composition all live LOW in `packages/design-system`.** All three compositions **compose the base primitives**:
- **Artifact (single)** is the base primitive composed standalone.
- **Review (diff)** composes two base-primitive instances via the DS-owned compare-two machinery; the **review experience in `web` USES the DS `diff` foundation** and adds only review *chrome* (PR header, file bands, approve affordances, file navigation) — **no parallel kind/canvas family**.
- **Block (mixed)** composes many (already DS).

The prior "two-home (diff stays web-local, a `ReviewArtifact` parallel family) is the honest end state" framing is **RETRACTED**. The `design-system ↛ web` boundary was the *signal the foundation was mis-placed* (the diff core sat too high, in `web`) — not a reason to split. The fix is to move the foundation **low**: `web` review chrome imports the DS diff foundation downward; DS imports nothing from `web`. The boundary is honored *because the foundation now sits below it*.

**Feasibility caveat (richer review canvases).** Where a canvas exceeds "base primitive × 2 + delta" — `metrics_moved`'s trend arrows/sparklines (now the **Graph** primitive), `browser_preview`'s live iframe-with-status, `action_operation`'s operation timeline — the **per-primitive delta renderer in DS owns the comparison view** (the two instances + the delta), and the **review chrome in `web` layers the surrounding workflow** (file navigation, approve bar, status polling). The split: *the comparison-of-two-base-primitive-instances is the foundation; the review workflow around it is chrome.* No canvas keeps a content vocabulary in `web`.

### Closure / contract reads to lock

- **Base primitive set** — the eight above. **OPEN at the content-type layer via AE6 Kind Definitions** (a new artifact content type maps to a base primitive, or adds one). The prose sub-grammar (Text family) and BlockKind stay **CLOSED** AST vocabularies (`heading·paragraph·list·quote·code·table·divider·image·html·unknown`) — not merged into the artifact content-type set; a BlockKind member renders through its matching base primitive. **A base primitive is PURE content** (K0): no diff, no comparison, no empty/error/loading inside it.
- **Composition axis** — **CLOSED** at `Artifact (single) | Review (diff) | Block (mixed)`. The founder enumerated exactly these three; a fourth needs a concept-doc update. Compositions **layer comparison + states on top of pure base primitives**.
- **Renderer selection** — a renderer is selected by **the content type + the composition**: Artifact composes one base primitive, Review composes two + delta, Block composes many. Artifact and Block of one content type **share the underlying base primitive** (a `code` artifact and a fenced-code block both render through Code). The **unknown-content fallback (K1)** renders a generic content fallback (label + raw content), never crashes, never blanks — distinct from a composition's absence states (Artifact owns empty/error/loading; Review owns "no changes"; Block owns absence).
- **The base-primitive set is a DS FOUNDATION.** All three compositions compose it; the diff core is DS-owned; the review experience in `web` USES the DS diff foundation and adds only chrome. No parallel family survives in `web`.

---

## Phase 0 — The nouns

AM5 has **two central nouns** (Open contract; the base-primitive set + its three compositions) plus two connecting nouns (Openable reference; Open presentation / the fold). None is a brand-new primitive — all already exist *partially*; AM5 reshapes them into one locked, universal contract over one canonical foundation.

| Noun | Working definition | Class |
|---|---|---|
| **Open contract** | The single, surface-agnostic seam that resolves WHERE an openable reference opens (target → destination) AND commits that destination to present via the fold. Its destination half **delegates rendering to the resolved composition** (Artifact / Review / Block), which composes the base primitives. | **Reshaped** — exists as `OpenTarget`/`OpenHandler`/`createOpenHandler`, wired only through the conversation. AM5 elevates it to *the* contract every surface uses, fixes its route seams, binds it to the fold. |
| **Base-primitive set + the three compositions** | The one canonical foundation: eight presentational base primitives (Text family, Code, Image, Link, Html, Table, KPI, Graph), owned LOW in `design-system`, sourced from the established block-payload layer; composed by **Artifact (single) / Review (diff) / Block (mixed)**, which own the states. The duplicate `kinds/*-renderer.tsx` layer collapses onto the base primitives. | **The load-bearing reshape.** Replaces the prior "Kind × Representation, purify the kind renderers" framing. The block layer is canonical; the kind-renderer layer is removed; `data` splits into Table/KPI/Graph; KPI + Graph are extracted up. |
| **Openable reference** | An inline pointer to a thing that can be opened — an artifact, a block, a review, a session, or another entity. | **Reshaped** — exists as `InlineRef`/`Embed`/`ArtifactRef`; AM5 locks the term and the one-reference→one-destination model. |
| **Open presentation (the fold)** | *How* a resolved destination presents: a foldable, resizable split of the current surface — fold forward (destination opens in a split pane; expand to full), fold back (close, return), drag to resize. One standardized behavior every transition uses. The destination half renders whatever composition the open contract resolved. | **Reshaped/extracted** — the split already exists twice, hand-rolled and divergent (chat `SessionViewPanel`; review `ExaminePane`). AM5 extracts ONE reusable behavior; resize + fold-forward/full-screen are the genuine gaps. |

**Stable inputs (no concept work):** the Block primitive (`docs/blocks/`, 16 docs — the canonical source), the review experience (AL1–AL2), Session (AM3). AM5 changes none of their *data shapes* — it extracts the block layer up as the shared base-primitive set and collapses the kind-renderer duplicate onto it (no on-disk format change; Block hard rules honored).

**Reuse directive (founder):** "the review already has many of these types defined. we don't need to reinvent. reuse and scope clever for reuse." Every renderer that survives is the canonical block primitive; the kind-renderer duplicate is removed (its KPI + Graph content extracted up first). AM5 reinvents nothing — the base primitives ARE the established block payloads.

**Human-design-review forecast:** `Yes` — AM5 reshapes the base/primitive rendering family used app-wide, and authors two new base primitives (KPI, Graph). Authoritative `DESIGN-CLASS` is set at `/design` time.

---

## Phase 1 — Essence

### Noun 1 — Open contract

1. **Identity.** A **resolution seam**, not a router and not a view. It resolves both **WHERE** (an openable reference's `OpenTarget` — a typed routing intent — to one existing destination) **AND HOW** (it commits that destination to present through the one standardized **fold** — Noun 4 — not a bespoke per-surface panel). It does not render — it **delegates the viewing to the resolved composition** (Artifact / Review / Block) and the presentation to the fold.
2. **Essential properties.** Surface-agnostic; deterministic (same target → same destination, presented the same way, from anywhere); total (every target resolves or documented no-op — never a crash or dead URL); pure of viewing (it routes; it never renders); context-completed at the page seam (`betId`, `onOpenSession`, fold mount).
3. **Rejection list** (see Phase 2).
4. **Composition.** Consumes an openable reference's `OpenTarget`; delegates host routing to `resolveHostRoute`; **delegates rendering to the resolved composition** at the destination (which composes the base primitives); delegates presentation to the **fold**.
5. **Lifecycle.** Stateless per call: reference → `OpenTarget` → resolve → (navigate | callback | no-op). No persisted state.
6. **Authority.** Types in `packages/shared` (`OpenTarget`/`OpenHandler`); resolver in `packages/web/src/services` (`createOpenHandler`/`resolveHostRoute`). Each **page** binds it once and supplies page-only context.
7. **Vocabulary collision.** Canonical: **open contract**, **open target**, **openable reference**. Avoids "Block"/"blocked" (track hard rule).

### Noun 2 — The base-primitive set + the three compositions

1. **Identity.** The **one canonical content-rendering foundation** — eight presentational **base primitives** (a.k.a. **elements**) sourced from the established block-payload layer, owned LOW in `design-system` — plus the **three compositions** (`Artifact` = single, `Review` = diff, `Block` = mixed) that build on them and own the states. A renderer is selected by *content type + composition*; the base primitive is **pure** (no diff, no state); the composition layers comparison + states. The **kind-renderer duplicate** (`kinds/*-renderer.tsx`) collapses onto the base primitives (removed). The monolithic `data` renderer splits into **Table + KPI + Graph**.
2. **Essential properties.** Eight base primitives, pure of states/diff (K0); three compositions, closed; the compositions compose the base primitives (Artifact one, Review two + delta, Block many); **Artifact and Block of one content type share the underlying base primitive** (a `code` artifact and a fenced-code block both render through Code); states owned by the composition for all primitives (K0b); the diff core + base primitives are DS foundations (K2b); the unknown-content fallback is the primitive layer's, distinct from a composition's absence.
3. **Rejection list** (see Phase 2).
4. **Composition.** A composition never stands alone — it always composes one (Artifact), two (Review), or many (Block) base-primitive instances. Each composition **additionally composes its own state surfaces** (Artifact's empty/error/loading; Review's no-changes/error; Block's absence) around the pure base-primitive render — the base primitive contributes none. KPI and Graph are **extracted** from `data-renderer.tsx` before that file is removed; the data artifact then composes Table + KPI + Graph.
5. **Lifecycle.** The base primitives are render-time renderers, no persisted state. Content type + composition are selection coordinates, evaluated at render and discarded. No on-disk field.
6. **Authority.** The base-primitive set is owned LOW in `packages/design-system` (extracted up from `block/*`). The artifact content-type vocabulary is owned by AE6 (`packages/shared/src/kinds`). No subsystem (artifact/block/review) owns a private content vocabulary — the kind-renderer duplicate is removed.
7. **Vocabulary collision.** Canonical: **base primitive** / **element** (the eight), **Text family** (the prose sub-primitives + inline grammar), **composition** (`Artifact` / `Review` / `Block`). Aliases NOT to use: *kind renderer* (the removed duplicate layer), *representation* (the retired prior-framing axis word — superseded by "composition"; `single|diff|mixture` map onto Artifact/Review/Block), *view* (a view is the rendered result, not the primitive). The existing **`placement`** axis (the closed 4-layout WHERE) stays a separate, distinct word.

### Noun 3 — Openable reference

1. **Identity.** An inline pointer to an openable thing. Subtypes: artifact ref, block ref, review ref, session ref, entity ref, mention (non-navigating).
2. **Essential properties.** Carries enough to resolve exactly one `OpenTarget`; renders inline as a compact embed/chip, never a bare link; degrades to a non-navigating `unknown` embed when no destination exists.
3. **Rejection list.** A reference is **not** the thing it points at; **not** a view (it opens one); a **mention** is not navigable.
4. **Composition.** Maps 1:1 to one `Embed` carrying one `OpenTarget`. When opened, the destination renders the matching composition (which composes the base primitives).
5. **Lifecycle.** Resolved fresh on render; no state.
6. **Authority.** Reference data shapes (`InlineRef`, `ArtifactRef`) in `packages/shared`; the `InlineRef`→`Embed`→`OpenTarget` adapter is the one place that knows the source shape.
7. **Vocabulary collision.** Canonical **reference**. "Chip"/"embed" name the *rendering*, not the reference.

### Noun 4 — Open presentation (the fold)

1. **Identity.** The **one standardized way a resolved destination presents itself**: it *folds open* — splits the current surface and renders the destination in the new half, in place, without leaving the origin. The origin stays visible and live on one side; the destination occupies the other. The destination half renders whatever composition the open contract resolved.
2. **Essential properties.** Origin-preserving; in-place (a split, not a route swap, not a floating layer); resizable (draggable divider); expandable (fold-forward → `full`); reversible (fold-back); one primitive (every surface uses the same container + controls).
3. **Rejection list** (see Phase 2).
4. **Composition.** A **fold** wraps two slots — *origin* and *destination* — plus a divider and a mode control. The destination slot is filled by **the resolved composition** (Artifact's base-primitive render, Review's diff, Block's body). The fold owns only the split container and its controls; it never owns the renderers.
5. **Lifecycle.** `folded-back` → fold-forward → `split` (divider draggable) → fold-forward/expand → `full` → fold-back. A new open while one is forward *replaces* the destination — it does not nest a second fold.
6. **Authority.** The fold primitive is owned once in `packages/web` (the genuine gap). Each **page** mounts it at the seam. The two existing splits are reconciled onto it.
7. **Vocabulary collision.** Canonical: **fold** + **open presentation**. Modes: **fold-back** / **split** / **fold-forward (full)**. Aliases NOT to use: peek, drawer, panel-as-noun, modal, overlay, dialog. Fold **modes** are distinct from content **compositions**.

---

## Phase 2 — Rejection lists (load-bearing)

### The open contract is NOT…

1. **…a new router or parallel route table.** Builds on React Router + `resolveHostRoute`.
2. **…a per-surface viewer-opener.** No surface hand-rolls navigation or its own open logic.
3. **…a data-shape change.** Adds no field to Artifact/Block/Message and no on-disk format.
4. **…a destination/viewer itself.** It resolves to destinations; it never becomes a viewing surface.
5. **…anything named "Block"/"blocked".** Track hard rule.

### The base-primitive set / the compositions are NOT…

1. **…two parallel renderer families.** There is ONE set of content renderers — the base primitives, sourced from the established block-payload layer. The recent `kinds/*-renderer.tsx` duplicate is **removed** (its KPI + Graph content extracted up first), not kept alongside. *Why:* the founder's decision — the block layer is canonical, the kind layer is a thin undocumented duplicate of a thoroughly-designed primitive. Two families IS the bug.
2. **…purified kind renderers.** AM5 does **not** "purify the kind renderers." The prior framing is superseded: there are no kind renderers to purify — they collapse onto the base primitives. Artifact (single) composes the base primitives directly. *Why:* purifying a duplicate keeps the duplicate; collapsing removes it.
3. **…a monolithic `data` renderer.** `data` is not one primitive. It splits into **Table + KPI + Graph**; a data artifact composes all three. *Why:* a table, a headline metric, and a sparkline are three different content types fused by accident in `data-renderer.tsx` — splitting them yields three reusable base primitives.
4. **…a holder of a diff.** A base primitive is pure content (Code = `{path, text, lang}`); the diff is the **Review** composition, built from two base-primitive instances. *Why:* `kinds/code.ts`'s `{file, hunks}` is the exact bug — a diff baked into a content shape.
5. **…an owner of empty/error/loading/no-content states.** A base primitive renders only present content; absence is owned by the composition. *Why:* a base primitive that renders its own empty state forces every composition to inherit the wrong absence semantics (Review's "no changes" ≠ Artifact's "failed to load").
6. **…a fourth registry / parallel vocabulary.** The composition axis is a closed three-value coordinate (`Artifact|Review|Block`), not its own AE6-style kind set. *Why:* a fourth registry recreates the duplication AM5 collapses.
7. **…owned by one subsystem.** Neither artifact, block, nor review owns a private content vocabulary; the base primitives are the shared DS foundation. *Why:* the removed `kinds/*-renderer.tsx` was exactly a subsystem privately re-rendering content the block layer already owned.
8. **…a standalone `Link` component authored speculatively.** Link is the inline node today; a standalone Link primitive is surfaced only on a genuine 2nd-context need. *Why:* component budget — don't author a new component for one hypothetical surface.

### The open presentation (the fold) is NOT…

1. **…a modal / overlay / dialog.** It splits in place; the origin stays live beside the destination.
2. **…a separate route per pane.** The origin keeps its route/state; `full` is the same fold, not a swap.
3. **…a peek that vanishes on blur.** The destination persists until folded back.
4. **…a reinvented widget.** Extracted from the two existing splits; only resize + fold-forward/full are net-new.
5. **…a new viewer.** It renders nothing of its own; the destination half is the resolved composition.

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases not to use |
|---|---|---|
| **Open contract** | The single surface-agnostic seam resolving an openable reference's target to its destination, presented via the fold. | router, route table, navigation service, viewer-opener |
| **Open target** | The typed routing intent a reference carries. Code: `OpenTarget`. | route descriptor, link |
| **Openable reference** / **reference** | An inline pointer to an openable thing. Code: `InlineRef`, `ArtifactRef`. | link, chip, embed (those name the *rendering*) |
| **Base primitive** / **element** | A presentational, pure-content renderer for one irreducible content type, owned LOW in `design-system`, sourced from the block-payload layer. The eight: Text family, Code, Image, Link, Html, Table, KPI, Graph. Carries NO diff, NO state. | kind renderer (the removed duplicate), kind (the artifact content-type string is the *kind*, the renderer is the base primitive) |
| **Text family** | The prose base primitives (Paragraph, Heading, List, Quote, Divider) + inline grammar (`strong·emphasis·inlineCode·link·break`). The rich-text renderer IS this family composed. | rich text renderer (it is the family), text-renderer (the removed flat duplicate) |
| **Composition** | How base primitives are presented + the owner of states: **Artifact** (single — one instance) \| **Review** (diff — two instances + delta) \| **Block** (mixed — many in a body). The content type + composition selects the renderer; the composition owns empty/error/loading/no-changes. | representation (superseded prior-framing word; `single/diff/mixture` map onto these), mode (collides with fold modes), view |
| **KPI / Stat** (base primitive) | Headline metric(s) — one or more `{label, value}` figures. EXTRACT from `data-renderer.tsx` headlines. | metric card, stat block (informal ok) |
| **Graph / Sparkline** (base primitive) | A small inline trend chart. EXTRACT from `Sparkline()` in `data-renderer.tsx`. | chart (a chart family is future), data viz |
| **Placement layout** | Where an artifact view sits: `gallery_card \| stack_item \| single_full_preview \| review_message_embed` (L3, closed). The WHERE axis — orthogonal to the composition. | view shape, variant |
| **Block-anchored open** | Opening a block reference into the Knowledge view positioned at that block (the AM5 addition). | block viewer, block page |
| **Open presentation** / **fold** | The one standardized way a resolved destination presents: an origin-preserving, resizable in-place split. Code: the shared fold primitive (`packages/web`). | peek, drawer, panel, modal, overlay, dialog |
| **Fold modes** | `fold-back \| split \| full`. Distinct from content compositions. | peek/full-screen/minimized |

---

## Phase 4 — Contracts

### Open contract

- **Cardinality.** One openable reference → exactly one open target → exactly one destination *or* one documented no-op.
- **Closure.** `OpenTarget.route ∈ { host | artifact | review | session }` — CLOSED. The `Embed` target-kind set is closed.
- **Mutability.** The resolver is a pure, stateless function of `(target, page-context)`.
- **Identity.** A target identifies its destination by `{route discriminant + id(s)}`; resolution is deterministic and surface-independent.
- **Hard rules.**
  - **H1.** Every openable reference, from *any* surface, resolves through the one open contract. No surface hand-rolls navigation.
  - **H2.** A block reference opens its host surface **positioned at the block** (block-anchored open). Never a standalone block viewer.
  - **H3.** A target with no destination yields a documented **no-op or fallback** — never a crash, never a dead URL.
  - **H4.** The contract resolves to destinations only; it delegates rendering to the resolved composition (which composes the base primitives).
  - **H5.** The two `resolveHostRoute` seams (artifact → `/work/artifact/:id`; task → `/work/task/:id`) are **reconciled** to real routes (artifact → `/artifacts/:id`; task → via its parent bet) — no reference resolves to a non-existent route.

### The base-primitive set + the three compositions

- **Cardinality.** A content type + a composition → exactly one renderer (the base primitive, composed once/twice/many), plus one **unknown-content fallback** for unregistered content. Artifact and Block of one content type share the underlying base primitive.
- **Closure.**
  - **Base-primitive content types are OPEN** at the artifact layer via AE6 Kind Definitions (the initial set maps to the eight base primitives + `unknown`). The prose sub-grammar (Text family) and BlockKind stay **CLOSED** AST vocabularies — not merged into the artifact content-type set.
  - **Composition axis is CLOSED** at `Artifact (single) | Review (diff) | Block (mixed)`.
- **Mutability.** Content type + composition are render-time selection coordinates — **derived-not-stored**, never persisted, no on-disk dialect, no per-block key (Block hard rules carried). **A base primitive is pure of states** (no empty/error/loading branch) — states are the composition's.
- **Identity.** An artifact reads consistently between its inline reference and its opened view. Artifact (single) and Block (mixed) of one content type are two compositions of one base primitive. `kinds/code.ts`'s `{file,hunks}` tangle is untangled by making the `code` content pure (`{path,text,lang}`) and relocating the diff to the **Review** composition.
- **Hard rules.**
  - **K0 (purity — the load-bearing hard rule).** A base primitive is pure content; its renderer renders only present content — NO diff, NO comparison, NO empty/error/loading/no-content state. The diff is the Review composition's; states are the composition's. Violation = `kinds/code.ts`'s `{file,hunks}` + the kind renderers' `if(!preview)` branches (both removed with the layer).
  - **K0b (gate contract).** The composition guarantees present content BEFORE invoking a base primitive. A base primitive's content prop is **non-optional**; it has **NO** empty/error/loading branch. Artifact gates its empty/error/loading; Review gates "no changes"; Block gates absence. The unknown-content fallback (K1) survives — "unrecognized content" ≠ "no content."
  - **K1.** A renderer is selected by *content type + composition*. **Unknown content** → a generic content fallback (label + raw content), never crash, never blank. Distinct from a composition's absence states.
  - **K2 (one canonical foundation).** No subsystem maintains a private content-renderer family. The **block-payload layer is canonical**; the recent `kinds/*-renderer.tsx` duplicate **collapses onto it (removed)**. The KPI headlines display and the `Sparkline()` SVG are **extracted up** as the KPI + Graph base primitives before the file is removed. The review diff *canvases* are the **Review composition** (built from two base-primitive instances), not a separate content vocabulary: `code_diff`→Review of Code, `visual_diff`→Review of Image, `metrics_moved`·`field_change_set`→Review of (Table/KPI/Graph), `rendered_in_context`→Review of (Text/Html), `action_operation`·`browser_preview`→Review of Link. `outcome_summary`/`batch` are **review composition scaffolding, not content** — they stay in the review experience.
  - **K2b (foundation placement).** The base primitives AND the generic compare-two-instances `diff` core + per-primitive delta renderers AND the `mixed` block composition are FOUNDATIONS owned in `packages/design-system`. The review experience in `web` USES the DS `diff` foundation and adds only review *chrome* — **no parallel content family**. The "two-home / diff stays web-local" framing is RETRACTED: the foundation moves LOW, the boundary was the mis-placement signal.
  - **K2c (the data split).** The monolithic `data` renderer splits into **Table (EXISTS) + KPI (EXTRACT) + Graph (EXTRACT)**. A data artifact composes all three. The `data` content type is no longer one renderer.
  - **K3 (reuse, do not reinvent).** Every renderer that survives is the canonical block primitive. The KPI + Graph primitives are *extracted* from existing `data-renderer.tsx` code, not authored from scratch (their content already renders today — AM5 lifts it into standalone primitives). AM5 authors no new content vocabulary.
  - **K4 (no data-shape change beyond the `code` correction).** No new on-disk format; no field added to Artifact/Block/Message; Block AST vocabulary unchanged. The **one** structural shape change is making the `code` content pure (`{path,text,lang}` — removing `{file,hunks}` and relocating the diff to Review).
  - **K4b (PRE-ALPHA PURGE).** The `code` schema correction needs **NO migration, NO back-compat read-normalization, NO preview-drop.** Change the schema everywhere it appears — the server ingest validator (`packages/server/src/schemas/artifact-preview.ts`) and the `code_diff→code` read-normalization at `packages/server/src/routes/artifacts.ts:84-130` (**DELETE it**, with `OLD_KIND_MAP` usage). No legacy `{file,hunks}` rows to honor. The full blast radius (shared union + `DiffHunk` export, server ingest validator, the deleted normalization, two server integration tests, `shared/artifact-types.test.ts`, the eval scenario) still all change, as a **clean rewrite**, not a migration.
  - **K5 (the kind-renderer collapse).** The AE6 `kinds/*-renderer.tsx` layer + `renderer-registry.ts` (`getRenderer(kind)`) is **removed**, not purified. Artifact (single) composes the base primitives directly (the same Block uses). Before removal: **extract KPI + Graph** (the two genuinely-new pieces buried in `data-renderer.tsx`) up into standalone base primitives. The `text-renderer.tsx` flat `whitespace-pre-wrap` div is removed — a `text` artifact composes the **Text family** (the same prose primitives Block uses, the rich render its own `@lore AE6` already asked for). The `url-renderer.tsx` status card collapses — a `url`/`link` artifact composes the inline **Link** primitive.
  - **K6 (Code highlighting — TODO, deferred).** `CodePayload` renders plain mono text, no syntax highlighting. AM5 does NOT add a highlighter — out of scope, marked explicitly. A future WP adds one behind the existing `CodePayload` surface (no token/chrome change). Recorded so it is a decided deferral, not a forgotten gap.

#### K0 applied per content type (the per-type read)

| Content type | base primitive (composed by Artifact/Block) | pure shape (no diff)? | state branch in the removed kind renderer (relocates to composition) |
|---|---|---|---|
| **text** | **Text family** (Paragraph/Heading/List/Quote/Divider + inline) — NOT a flat div | ✓ a markdown body → the Text family | `if (!preview)` → "No content preview available." |
| **code** | **Code** (`CodePayload`, `{path,text,lang}`) | ✗ `{file,hunks}` was a **diff** (the K0 shape violation) | `if(!preview)`/`hunks===[]` → "No diff available." |
| **image** | **Image** (`ImagePayload`) | ✓ `{alt,url,title}` | `if(!(preview&&url))` → "Image pending." |
| **data** | **Table + KPI + Graph** (split — K2c) | ✓ each pure | `if(!preview\|\|empty)` → "No metrics available." |
| **html** | **Html** (`HtmlPayload`) | ✓ `{raw}` | `if(!preview)` → "HTML preview pending." |
| **url / link** | **Link** (inline node) | ✓ `{href}` | `if(!preview)` → "No URL available." |

Two consequences for `/architecture`/the builder: **(a)** the K0 **shape** violation is `code`-only — only `code`'s schema is purified (`{file,hunks}`→`{path,text,lang}`, K4); every other content type already maps to a pure base primitive. **(b)** the K0 **state** violation was **uniform across the removed kind renderers** — every one carried a null/empty `if(!preview)` branch; all are removed with the layer, their absence owned by the composition.

### Open presentation (the fold)

- **Cardinality.** One origin surface → **one active fold pane**. Expandable to `full`, collapsible to `folded-back`. A new open *replaces* the destination — no nesting.
- **Closure.** Modes CLOSED at `fold-back | split | full`. Distinct from content compositions.
- **Mutability.** Divider width user-adjustable within `split` (drag-to-resize); width **persists per surface** (a UI preference, not domain data). The fold owns only `{ mode, dividerRatio }`.
- **Identity.** A fold is identified by its origin surface + `{ mode, destination }`. The destination is the open contract's resolved composition.
- **Hard rules.**
  - **F1.** Every reference, from any surface, presents through the one fold. No surface hand-rolls its own split/panel/overlay. (H1 extended from *where* to *how*.)
  - **F2.** Full-page open is the fully-folded-forward `full` terminal state — one continuum: `back ⇄ split ⇄ full`.
  - **F3.** One shared primitive (`packages/web`); no per-surface reimplementation. The two existing splits reconcile onto it.
  - **F4.** The fold reuses the resolved composition for its destination half; it authors no renderer and no new view shape.
  - **F5.** The only net-new affordances are drag-to-resize and fold-forward/full-screen.

---

## Phase 5 — Cleanup of empty artifact/block-render scaffolding (IN SCOPE — founder, 2026-06-26)

Founder: *"part of this story is to connect cleanup all the empty references… many things in chats, tasks… were built to later render artifacts and we need to cleanup all of those."* AM5 lands the unified open contract + base-primitive rendering, so the dead "render later" / "wire later" hooks earlier WPs left for *exactly this* surface are AM5's to resolve. **No surface is left with a dead artifact/block-render hook.** Each loose end: **WIRE** (onto the open contract / resolved composition), **REMOVE** (dead prop/stub, after callers checked), or **DEFER** (explicitly out of scope, with a reason — never silently left).

| Loose end (verified in code) | What it is | Disposition | Rationale |
|---|---|---|---|
| `ArtifactSection.tsx:205-214` | "View all" — non-interactive `<span>`, `@lore L12 (B-3)` "target page doesn't exist yet" | **WIRE** | The unified artifact open/list now exists. Route through the open contract. Artifact-render hook on an artifact surface — in scope. |
| `KnowledgeBody.tsx:44,103,139` | `onOpenBlockActions` threaded but unwired; `@lore L18` "added to wire the AM5 unified block surface" | **WIRE** | Lore names AM5. Wire via the unified open contract (block-anchored open, H2). |
| `AssistantOverlay.tsx:188-204` (`BlockRefEmbed`) | Legacy block-ref embeds that render block content but have **no open-on-click** | **WIRE** (reconcile onto the unified open path) — or REMOVE if the overlay should not host block refs post-AM1 | Per H1/H2 every reference opens through the one contract. Default = WIRE (block-anchored open); architect confirms wire-vs-remove. |
| `TaskSheet.tsx:80-97` (`resolveThreadId`/`postRequest`/`onNavigateToThread`) | Three `@deprecated L18` props. ⚠️ architecture verified currently LIVE via `WorkBet.tsx:1666` + used at `TaskSheet.tsx:201-204`/`:330` | **VERIFY-THEN-REMOVE** (only genuinely-unreferenced props) | Confirm before removing; drop the `@deprecated` tag from live ones. The prior blind-REMOVE wording is superseded. |
| Composer "+" menu (`InsertMenu`, `ConversationSurface.tsx:221-252`) | `@lore AM1 §12.6` menu items are visible affordances that do NOT mutate the draft | **DEFER (explicit)** | Draft-mutation/rich-compose is a *composer* concern, NOT artifact rendering or the open contract. Affordance stays visible; wiring is a later composer WP. Recorded, not forgotten. |
| `QuestionnairePart.tsx:53-65` (answer chips) | `@lore DES-1` static non-interactive chips | **DEFER (explicit)** | Answering is an *interaction/verdict* concern, not artifact rendering. Recorded with reason. |
| By-design fallbacks: unknown-content embeds, mention embeds (non-navigating), story `console.info` | Intentional no-ops (H3) | **STAY AS-IS** | The contract's documented absence behavior, not dead hooks. |

**Scope note / AC.** AM5 **wires or removes** the empty artifact/block-render references across chat/task/knowledge so **no surface is left with a dead "render later" hook**. The composer "+" menu and `QuestionnairePart` chips are **explicitly deferred** (composer/interaction concerns) — recorded so they are decided, not forgotten. By-design fallbacks stay.

---

## Rationale

The founder hit this **while designing AM1**: a referenced block opened a bespoke panel instead of the Knowledge view, and "we don't have standardized artifact views figured out." Probing it surfaced the structural state: **two layers render content** — the established, 16-doc, well-wired **block-payload layer** (the real primitive) and a **recent, thin, undocumented kind-renderer layer** (a duplicate of it). The founder's decision (2026-06-26): the block layer is canonical; extract it up as THE base-primitive set; collapse the kind-renderer duplicate onto it (removed, not purified). This supersedes the prior "purify the kind renderers / Kind × Representation" framing.

Three facts shape this concept:

1. **One canonical foundation: eight base primitives, composed by Artifact/Review/Block.** The base primitives are the established block payloads (Text family, Code, Image, Link, Html, Table) extracted up, plus two **extracted** from `data-renderer.tsx` (KPI, Graph). A base primitive is **pure content** — no diff, no state (K0); the diff is the **Review** composition (built from two instances); states are the composition's. The monolithic `data` renderer **splits into Table + KPI + Graph** (K2c). Artifact (single) and Block (mixed) of one content type **share the underlying base primitive** — the difference is the composition wrapper, not the renderer. The kind-renderer duplicate collapses onto the base primitives (removed). Code syntax highlighting is a **TODO, deferred** (K6). This is consolidation onto the canonical layer + the data split — **reuse, not reinvention** (the base primitives ARE the established block payloads; KPI + Graph are lifted from existing code).

2. **The contract is already half-built.** AM1 shipped `OpenTarget`/`OpenHandler`/`createOpenHandler`/`resolveHostRoute`, wired only through the conversation; `part-model.md` deferred block-anchored navigation and full standardization to AM5. AM5 *elevates* the nascent seam into the universal contract, fixes its two route bugs, binds its destination half to the resolved composition.

3. **The fold is the standardized open presentation, extracted not invented.** Every page-to-page transition opens as a fold. This already exists *twice* (chat's `SessionViewPanel`, review's `ExaminePane`), hand-rolled and divergent. AM5 extracts ONE primitive; the genuine gaps are drag-resize and fold-forward/full.

`/architecture` splits this into the routing/contract layer + the base-primitive foundation in DS (extract the block layer up, collapse the kind-renderer duplicate, split `data` into Table/KPI/Graph, extract KPI + Graph, purify the `code` schema + relocate its diff to Review, the composition-owned state layer, review chrome composes the DS diff) + the shared fold primitive (the one genuine new component) + the cleanup wiring.

---

## Phase 6 — Self-critique (tight, 1 round — foundation decision + base-primitive coherence)

- **Is the established block-payload layer the right canonical source?** Yes — verified in code. It shipped 2026-04-29 with **16 docs** in `docs/blocks/` and is a full primitive (anchors, cross-refs, inline grammar, sanitization, prose grammar, table, code, image, html, unknown). The `kinds/*-renderer.tsx` layer shipped 2026-06-12 (AE6), is thin (one file per type, no anchors/cross-refs/inline grammar), undocumented (no `docs/` coverage), and re-renders the same content types a second way. The block layer's own `@lore AE6` on `text-renderer.tsx` ("swap this div for a Block primitive when one lands") is the codebase already pointing at the block layer as canonical. Picking the block layer as the foundation and removing the duplicate is the correct, code-grounded call. ✓
- **No remaining "two parallel families"?** Yes. The kind-renderer layer is **removed** (K5), not kept alongside — that is the whole point of "collapse, not purify." Artifact (single) composes the base primitives directly (the same Block uses). The Review diff *canvases* are the **Review composition** built from two base-primitive instances, not a third content family (K2/K2b). The diff core moves LOW into DS; review chrome stays in `web`. There is one content-renderer family — the base primitives. ✓
- **Is the Text family coherent?** Yes. A `text` artifact's content is a markdown body; a body's richness IS the prose grammar (headings/paragraphs/lists/quotes/dividers) + inline grammar — exactly the block layer's `{Paragraph,Heading,List,Quote,Divider}Payload` + `inline.tsx`. Calling them a **family** (not one primitive) is honest: they are five sub-primitives + inline nodes that compose. Artifact (single) and Block (mixed) both compose the Text family — the rich-text renderer IS the family, removing the need for the flat `text-renderer.tsx` div. ✓
- **Is the data split coherent?** Yes. `data-renderer.tsx` verifiably fuses three independent content types: a headlines flex-grid (`{label,value}` figures), a `rows` table, and `Sparkline()` charts. Table already exists as a base primitive (`TablePayload`); the headlines display and the `Sparkline()` SVG are genuinely-new content the block layer never had — so they are **EXTRACT** (lifted from existing code into standalone primitives KPI + Graph), and a data artifact composes Table + KPI + Graph. This is a clean, code-grounded split, and it gives the review `metrics_moved` canvas a real per-primitive delta renderer to compose (the Graph primitive). ✓
- **Do KPI + Graph clear the component budget?** Yes. Each is used in 2+ contexts: a data **Artifact** (single) and a `metrics_moved` **Review** (diff) compose both; KPI is also the headline of many surfaces. Both are *extracted from existing rendered code*, not net-new shapes — they replace the monolithic `data-renderer.tsx`, not add alongside it. ✓
- **Do the open-contract + fold + reference nouns survive the reframe?** Yes — unchanged. The open contract still resolves to a composition (now: Artifact/Review/Block composing the base primitives); the fold still presents one; references still map to one destination. Only the rendering foundation is restated (base primitives, not "Kind × Representation / purified kind renderers"). ✓

**Concept LOCKED.** Two central nouns — **open contract** (where) and **the base-primitive set + its three compositions** (what renders). The foundation decision (2026-06-26): **the established block-payload layer IS the canonical base-primitive set; extract it up as THE foundation; the recent `kinds/*-renderer.tsx` layer COLLAPSES onto it (removed, not purified); Artifact (single) composes the base primitives directly, the same ones Block (mixed) uses.** The eight base primitives: **Text family (EXISTS) · Code (EXISTS, highlighting TODO) · Image (EXISTS) · Link (EXISTS, inline) · Html (EXISTS) · Table (EXISTS) · KPI (EXTRACT) · Graph (EXTRACT)**. The monolithic `data` renderer **splits into Table + KPI + Graph**. K0 purity, K0b gate, K2b foundation-in-DS, the open-contract + fold nouns all carried — restated over the base-primitive vocabulary. Pre-alpha purge for the `code` schema (K4b); cleanup of empty render-hooks in scope (Phase 5). `/architecture` splits it into the routing/contract layer + the base-primitive foundation in DS (extract up + collapse the duplicate + data split + extract KPI/Graph + purify `code` + composition-owned states + DS diff core) + the shared fold + the cleanup wiring. **Supersedes** the prior "purify the kind renderers / Kind × Representation" framing and the "two-home / diff stays web-local" framing.
