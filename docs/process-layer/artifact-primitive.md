# Artifact primitive (L3)

The function-agnostic, task-rooted record of something the team has produced. Defined in `docs/human-interface-layer/the-three-views-the-rail.md` §4.7; producer rule in this folder's process-layer docs §3. Implementation stories L11 (rich review messages) and L12 (Work surfaces) consume this contract directly. <!-- @lore AD8a: historical — Rail removed in U6 -->

## Canonical shape

```
Artifact {
  id                  # opaque, stable, immutable
  producing_task_id   # the unique producing Task — required, immutable
  kind                # fundamental content type determining the renderer.
                      # OPEN vocabulary (AE6): text | code | image | data | html | url
                      # are the initial 6; more can be added via Kind Definitions.
                      # See §Kind extensibility below.
  label               # (AE6) optional business-domain tag (e.g. "contract",
                      # "email", "dashboard"). Provides context; does NOT
                      # determine rendering. Freeform lowercase_snake_case.
  preview             # short representation for gallery / stack rendering;
                      # null until populated; once populated, immutable.
                      # Schema is per-kind (defined by the Kind Definition) and
                      # PURE CONTENT (AM5): the code preview is {path, text, lang}
                      # — just code, NO diff. (Legacy bug: {file, hunks} put a
                      # diff inside the content; the diff is the Review
                      # composition, built from two pure-code instances. See
                      # §Base primitives × the three compositions × placement.)
                      # AM5 purifies this schema
                      # as a CLEAN REWRITE — pre-alpha, no DB data, so NO
                      # migration / NO back-compat read-normalization / NO
                      # preview-drop handling; the server's `code_diff→code`
                      # read-normalization is DELETED, not preserved.
  cost_from_session   # money + tokens contributed by the producing session(s);
                      # null until session settles; once populated, immutable
  created_at
}
```

## The fundamental kinds (AE6) and the base primitives they compose (AM5)

Kind answers "what format did the agent produce?" — not "what business domain is this about?" That's what labels are for. Each kind renders by **composing a base primitive** (AM5) — the same primitive the Block subsystem composes. The base primitives are sourced from the established block-payload layer (`packages/design-system/src/block/*`).

| Kind (pure content) | What the agent produced | Base primitive(s) it composes (AM5) | Review experience (the **Review** composition / diff) |
|---|---|---|---|
| `text` | Markdown/prose | **Text family** (Paragraph/Heading/List/Quote/Divider + inline) | Content preview — read and approve prose (the same Text family rendered before→after) |
| `code` | **Source code as a file** — `{path, text, lang}` (pure code, NO diff) | **Code** (`CodePayload`; syntax highlighting = TODO, deferred) | Diff viewer — Review builds a line-by-line comparison from two pure-`code` instances |
| `image` | Visual asset (screenshot, design, diagram) | **Image** (`ImagePayload`) | Visual comparison — see what was produced |
| `data` | Structured metrics/tables/charts | **Table + KPI + Graph** (the `data` kind composes all three — AM5 splits it) | Metrics/table view — scan numbers and results |
| `html` | Rich rendered content (dashboards, visualizations) | **Html** (`HtmlPayload`, sandboxed) | Rendered preview — see output as the user would |
| `url` | Reference to something external (deployed service, PR, page) | **Link** (the inline link node) | Action summary — check status of deployed/created thing |

`html` is the universal escape hatch — LLMs are good at generating HTML, and anything rich that doesn't fit the others renders as HTML.

**The `data` kind splits into three base primitives (AM5).** `data` is not one renderer — it is a table, headline metrics, and sparkline charts fused together. AM5 splits it into **Table** (exists as `TablePayload`), **KPI / Stat** (extracted from the headlines display in the old `data` renderer), and **Graph / Sparkline** (extracted from the `Sparkline()` SVG in the old `data` renderer). A `data` artifact composes all three.

## Base primitives × the three compositions × placement (AM5)

An artifact view is selected by **the base primitive it composes, the composition, and its placement** — three orthogonal concerns. AM5 picks the **canonical content-rendering foundation** and collapses the duplicate: the established **block-payload layer** (`packages/design-system/src/block/*` — shipped 2026-04-29, 16 docs) IS the base-primitive set; the recent, thin, undocumented `kinds/*-renderer.tsx` layer (2026-06-12, AE6) is a **duplicate that collapses onto it (removed, not purified)**.

1. **Base primitives** (WHAT renders — the one canonical foundation): eight presentational, pure-content renderers, owned LOW in `packages/design-system`, sourced from the block-payload layer — **Text family** (Paragraph/Heading/List/Quote/Divider + inline `strong·emphasis·inlineCode·link·break`), **Code**, **Image**, **Link** (inline), **Html**, **Table**, **KPI / Stat** (extracted from the old `data` renderer), **Graph / Sparkline** (extracted from the old `data` renderer). **Purity (hard rule, AM5):** a base primitive is pure, irreducible content — `code`=`{path,text,lang}`, `image`=`{alt,url}` — and renders only present content. It carries **NO diff, NO comparison, NO empty/error/loading state**. The diff is the **Review** composition's construction from two instances; states are the composition's. (Legacy bug: `kinds/code.ts`'s `{file,hunks}` baked a diff into the `code` content — AM5 evicts it.) Code **syntax highlighting is a TODO, deferred** (a future WP adds it behind `CodePayload`).
2. **Composition** (HOW base primitives are presented, AND the owner of states) — CLOSED at `Artifact (single) | Review (diff) | Block (mixed)`:
   - **Artifact (single)** — one base-primitive instance, one version, standalone. (This document's primitive.) Composes the matching base primitive (`text`→Text family, `code`→Code, `image`→Image, `html`→Html, `url`→Link, `data`→Table+KPI+Graph). Owns its empty/error/loading states.
   - **Review (diff)** — **a comparison the review BUILDS from two base-primitive instances**. The review proof-canvases ARE the Review composition — **not a separate content family, and not a base-primitive shape**: `code_diff`→two Code instances, `visual_diff`→two Image, `metrics_moved`·`field_change_set`→two (Table/KPI/Graph), `rendered_in_context`→two (Text/Html), `action_operation`·`browser_preview`→two Link. Owns "no changes"/diff-error states. (`outcome_summary`/`batch` are review *composition* scaffolding, not content.)
   - **Block (mixed)** — many base-primitive instances composed into one body (`deriveBlocks(body)` + the primitives via `Block`). BlockKind stays its own closed AST vocabulary but renders through the **same** base primitives Artifact composes. Owns its absence/empty-body states.
   - **Artifact (single) and Block (mixed) of one content type share the underlying base primitive** — a `code` artifact and a fenced-code block both render through Code; a `text` artifact and a Block body both render through the Text family. The difference is the composition wrapper (one instance vs many, who owns the states), **not the renderer**. There is ONE content-renderer family — the base primitives — not two. The legacy `kinds/code.ts` `{file,hunks}` is the bug AM5 fixes by purifying the `code` content and relocating the diff to the Review composition, not by keeping a parallel renderer. Every surface reaches a composition through the one **open contract** (`docs/human-interface-layer/open-contract.md`), never a per-surface viewer; the resolved composition presents through the **open presentation (the fold)** — see `open-contract.md`.

**Base primitives are FOUNDATIONS; all three compositions COMPOSE them (AM5).** The base primitives, the generic compare-two-instances `diff` core + per-primitive delta renderers, and the `mixed` block composition are **foundations owned in `packages/design-system`**. The **review experience (`packages/web`) USES the DS `diff` foundation** and adds only review *chrome* — the PR header, the per-file bands, the approve/reject affordances, the file-navigation — it maintains **no parallel content family**. The earlier "two-home" framing (a `ReviewArtifact` parallel vocabulary staying web-local, the `design-system ↛ web` boundary cited as making unification impossible) is **retracted**: the boundary was the signal the foundation was mis-placed (sitting too high, in `web`), not a reason to split — move the foundation **low**, so `web` review chrome imports the DS diff foundation downward and DS imports nothing from `web`. Where a review canvas is richer than "base primitive × 2 + delta" (`metrics_moved` sparklines — now the Graph primitive, `browser_preview` live-status), the **per-primitive delta renderer in DS owns the comparison view** and the **review chrome in `web` layers the surrounding workflow**.
3. **Placement layout** (WHERE on screen the view sits) — CLOSED; adding a layout requires a concept-doc update first. **Orthogonal** to the composition — an Artifact view can sit in any of these four:
   1. `gallery_card` — collection surfaces (Bet detail, Product page, Portfolio gallery).
   2. `stack_item` — vertical lists where Artifacts live alongside other items.
   3. `single_full_preview` — the Artifact's own detail surface. (NB: "single" here is a *placement* word, **not** the Artifact *composition*.)
   4. `review_message_embed` — inside review messages in Conversations.

**The kind-renderer duplicate collapses (AM5).** The AE6 `kinds/*-renderer.tsx` layer + `renderer-registry.ts` is **removed, not purified**. Before removal, the two genuinely-new pieces buried inside `data-renderer.tsx` — the KPI headlines display and the `Sparkline()` SVG — are **extracted up** as the KPI and Graph base primitives. The `text-renderer.tsx` flat `whitespace-pre-wrap` div is removed (a `text` artifact composes the Text family — the rich render its own `@lore AE6` already asked for). The `url-renderer.tsx` status card collapses (a `url` artifact composes the inline Link primitive). Because base primitives are pure content, the `code` content is `{path, text, lang}` and the Artifact (single) composition renders it "as a file." The earlier framing of `(code, single)` as "the one genuinely-missing gap cell" is **retracted**: pure `code` is the content itself; the *added* thing is the **diff**, which the Review composition builds from two `code` instances. The legacy `kinds/code.ts` `{file,hunks}` is mis-shaped as a diff; AM5 makes the `code` content pure and moves the diff into the Review composition. It is **not a new content type** — it is purifying existing content and relocating its diff.

## Fetching contract

The system can fetch Artifacts filtered by Task, by Bet (aggregated from Tasks), by Product (aggregated from Bets), or by Portfolio (aggregated from Products). The shape returned is the canonical Artifact above.

## Hard rules

- Artifacts root on Tasks. Bet/Product/Portfolio surfaces aggregate; they never own.
- Threads (L1) attach to Artifacts via the universal cross-area attachment contract.
- Placement layouts are closed at four (base primitive × composition × placement — AM5; see §Base primitives × the three compositions × placement).
- No fake thumbnails — when `preview` is null, render an explicit placeholder.
- (AM5) **Base-primitive purity.** A base primitive is pure, irreducible content; its preview schema and renderer carry **no diff, no comparison, no empty/error/loading state**. The diff is the **Review** composition (built from two instances); states are the composition's (Artifact owns empty/error/loading; Review owns no-changes; Block owns absence). A diff or a state branch inside a base primitive breaks the concept. (`kinds/code.ts`'s `{file,hunks}` is the legacy violation AM5 fixes.)
- (AM5) **One canonical content-renderer family.** The established block-payload layer IS the base-primitive set; the recent `kinds/*-renderer.tsx` layer is a duplicate and is **removed (collapsed onto the base primitives), not purified**. Artifact (single) composes the base primitives directly — the same ones Block (mixed) composes. The `data` kind splits into Table + KPI + Graph.
- (AE6) Kind determines which base primitive is composed. Labels MUST NOT affect renderer selection.
- (AE6) Adding a new artifact kind MUST NOT require editing any file outside the new kind's own definition module(s).
- (AE6/AM5) **Unknown content** MUST render a sensible *content* fallback (label + raw content) — never crash, never blank. This is distinct from a composition's **absence** states (empty/error/loading/no-changes), owned by the composition, not by the fallback. "Unknown content" ≠ "no content."
- (AE6) Kind Definitions are the ONLY mechanism for registering kinds. No ad-hoc per-kind logic in core files.

## Kind extensibility (AE6)

The artifact kind vocabulary is **open**. Any `lowercase_snake_case` string is valid at the data layer (DB stores `text`). The initial 6 fundamental kinds (`text`, `code`, `image`, `data`, `html`, `url`) cover 90%+ of agent output. New kinds can be added via **Kind Definitions** — static configuration modules discovered at build time.

This contrasts with BlockKind, which is **closed** — blocks decompose prose into renderable regions (the kind set IS the AST vocabulary), while artifact kinds classify output format (the set of things agents produce is diverse and growing). AM5 reconciles the two without merging them: BlockKind stays its own closed AST vocabulary but **composes the same base primitives** an Artifact composes (`table`→Table, prose grammar→the Text family, fenced `code`/`image`/`html`→Code/Image/Html). The base primitives are the shared rendering foundation; BlockKind is the AST vocabulary that composes them.

**Kind Definition** — a static configuration module at a conventional path that binds a kind string to:
- A Zod preview schema (**pure content only** — AM5: no diff, no comparison, no state field; e.g. `code` = `{path, text, lang}`)
- The base primitive(s) it composes (e.g. `data` → Table + KPI + Graph)
- A display-title extractor
- A summary function

Kind Definitions are code modules, not database entities. They are discovered at build time — no runtime registry. The 6 initial kinds each have a Kind Definition. Adding a kind = creating a Kind Definition module.

**Artifact Label** — optional business-domain tag on an artifact. Freeform `lowercase_snake_case` string. Labels like `contract`, `email`, `dashboard`, `test-results` provide context for the reviewer without changing how the artifact renders. Labels are not enumerated — any string is valid.

**Unregistered (unknown) kinds** render a generic *content* fallback (kind label + raw preview content). Never crash, never blank. The previous `unknown_kind` sentinel is retired; the registered/unregistered partition generalises its purpose. (AM5) This unknown-content fallback is **not** an empty/error/loading state — those are owned by the **composition** (Artifact's empty/error/loading, Review's no-changes, Block's absence), not by the content or its fallback.

| Term | Aliases not to use |
|---|---|
| Artifact Kind | artifact type, artifact category, artifact class |
| Artifact Label | artifact tag (to avoid confusion with a tagging system) |
| Kind Definition | kind plugin, kind extension, kind registration |
| Registered Kind | known kind, supported kind, built-in kind |
| Unregistered Kind | unknown kind (retired sentinel), unsupported kind |

## Aliases NOT to use for the primitive

Output, File, Deliverable, Result, Asset, Document.

## Cost shape (L3 publishes / L4 adopts)

L3 publishes `ArtifactCostFromSession = { money: string | null; tokens: string | null }` — a pre-formatted display proxy. The DB stores precision-safe integers (`cost_money_micros`, `cost_tokens_input`, `cost_tokens_output`) and the server collapses these to display strings via `formatArtifactCost`. When L4 ships `Money` and `TokenUsage`, the `money` and `tokens` fields adopt those richer types directly without a re-migration: the formatter is the single chokepoint that absorbs the swap, and the DS components consume the wire shape unchanged.
