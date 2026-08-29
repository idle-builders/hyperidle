# Artifact primitive (L3)

The function-agnostic, task-rooted record of something the team has produced. An Artifact roots on exactly one producing Task; Bet/Team/Portfolio surfaces aggregate Artifacts, they never own them.

This path is frozen — code cites it directly (`framework/domain-model/src/thread.ts`, `framework/conversation-parts/src/part.ts`).

## Canonical shape

The `artifacts` table (`framework/db/src/schema.ts`):

```
Artifact {
  id                  # opaque, stable, immutable
  producing_task_id   # the unique producing Task — required, immutable
                      # (notNull FK → tasks, onDelete restrict)
  kind                # fundamental content type determining the renderer.
                      # OPEN vocabulary (AE6), stored as text, normalised to
                      # ARTIFACT_KINDS at the API boundary. Initial 6:
                      # text | code | image | data | html | url
  label               # (AE6) optional business-domain tag (e.g. "contract",
                      # "email"). Context only; never affects rendering.
                      # Freeform lowercase_snake_case, max 64.
  preview_json        # short representation for gallery / stack rendering;
                      # null until populated; once populated, immutable
  created_at
}
```

**No cost columns.** O2 stripped `cost_money_micros` / `cost_tokens_*` from the kernel artifacts table — cost is a strategy concern (`schema.ts`). See §Cost.

**Preview is write-once.** `PATCH /:id/preview` succeeds only while `preview_json IS NULL` (race-safe conditional UPDATE); otherwise 409 `IMMUTABLE` (`layers/core-api/src/routes/artifacts.ts`). A null preview renders an explicit `NoPreviewText` placeholder — never a fake thumbnail (`ArtifactPreviewSurface.tsx`).

**Preview content is pure (AM5).** Per-kind preview schemas carry content only — the `code` preview is `{path, text, lang}` (`framework/domain-model/src/kinds/registry.ts`), just code, no diff. The diff belongs to the Review composition, built from two pure-`code` instances (see §Compositions).

## The fundamental kinds (AE6) and the base primitives they compose (AM5)

Kind answers "what format did the agent produce?" — not "what business domain is this about?" (that's the label). Each kind renders by composing base primitives from the block-payload layer (`framework/design-system/src/block/*`) — the same primitives the Block subsystem composes. Dispatch lives in `design-system/src/kinds/compose-artifact-body.tsx`.

| Kind (pure content) | What the agent produced | Composes | Review experience (the Review composition) |
|---|---|---|---|
| `text` | Markdown/prose | Text family via `deriveBlocks(body)` + Block stream | Prose before→after |
| `code` | Source code as a file — `{path, text, lang}` | `CodePayload` (syntax highlighting still TODO) | Diff built from two pure-`code` instances |
| `image` | Visual asset (screenshot, design, diagram) | `ImagePayload` | Visual comparison |
| `data` | Structured metrics/tables/charts | `KpiStat` + a bespoke rows table + `Sparkline` | Metrics/table view |
| `html` | Rich rendered content (dashboards, visualizations) | `HtmlPayload` (sandboxed) | Rendered preview |
| `url` | Reference to something external (PR, deployed service, page) | inline Link primitive | Action summary / status |

`html` is the universal escape hatch — anything rich that doesn't fit the others renders as HTML.

**The `data` kind is NOT TablePayload.** `data.rows` is a freeform `Record<string,string>[]` key/value grid, incompatible with `TablePayload`'s GFM `InlineNode[][][]` shape; the composition uses a lifted bespoke rows table plus the extracted `KpiStat` and `Sparkline` primitives (`compose-artifact-body.tsx`).

## ArtifactRef — a review message's reference to a stored Artifact

`ARTIFACT_VIEW_SHAPES` — a pre-consolidation, five-value closed enum
(`text_diff | content_preview | visual_comparison | action_summary |
data_metrics`) that predated the six fundamental kinds above — is DELETED,
not migrated: it had zero overlap with the `ARTIFACT_KINDS` `create_artifact`
actually emits.

`ArtifactRef.kind` (`framework/domain-model/src/thread.ts`) now respells onto
that same six-value `ARTIFACT_KINDS` vocabulary at write time
(`reviewPayloadSchema`'s write arm, `layers/core-api/src/routes/threads-schema.ts`).
The type itself stays `kind?: string` — never a closed union — because
nothing that reads it trusts the value: `GET /api/reviews/:id`
(`layers/core-api/src/routes/reviews.ts`) re-reads the REAL kind off the
referenced artifact row instead. The read arm (`reviewPayloadSchemaRow`)
stays tolerant of a retired value a row already carries, so an existing
review persisted before this respell still reads back instead of taking out
the whole thread. `layers/core-ui/src/components/parts/part.ts`'s
`artifactRefToEmbed` renders both vocabularies: the retired `text_diff` (a
legacy row) and its current-vocabulary successor `code` both map to the diff
embed.

## Base primitives × compositions × placements (AM5)

An artifact view is selected by three orthogonal concerns.

1. **Base primitives** (WHAT renders) — the block-payload layer `framework/design-system/src/block/*` IS the one canonical content-renderer family: Text family (Paragraph/Heading/List/Quote/Divider + inline nodes), Code, Image, inline Link, Html, Table, plus `KpiStat` and `Sparkline` (extracted from the old `data` renderer). A base primitive is pure, irreducible content — no diff, no comparison, no empty/error/loading state. Documented in [docs/blocks/](../blocks/index.md).
2. **Compositions** (HOW primitives are presented; owner of states) — CLOSED at three:
   - **Artifact (single)** — one base-primitive instance, standalone: `composeArtifactBody`, pure of states; the `ArtifactPreviewSurface` gate owns empty/error/loading.
   - **Review (diff)** — a comparison BUILT from two base-primitive instances. The DS `diff/` foundation (`code-delta-renderer.tsx`, `select-diff.tsx`) sits low in `framework/design-system`; the review experience in `layers/core-ui/src/pages/review/` layers only chrome (header, bands, verdict affordances, file navigation) — no parallel content family. Review canvases are the review primitive's territory — see [review-primitive](../human-interface-layer/review-primitive.md).
   - **Block (mixed)** — many instances composed into one body via `deriveBlocks` + the same payloads. Owned by [docs/blocks/](../blocks/index.md).

   An Artifact (single) and a Block body of one content type share the same underlying primitive — the difference is the composition wrapper, not the renderer. Every surface reaches a composition through the one open contract — see [open-contract](../human-interface-layer/open-contract.md).
3. **Placements** (WHERE the view sits) — CLOSED at four; adding a layout requires a concept-doc update first:
   1. `gallery_card` — collection surfaces (`ArtifactGalleryCard`)
   2. `stack_item` — vertical lists alongside other items (`ArtifactStackItem`)
   3. `single_full_preview` — the Artifact's own detail surface (`ArtifactPreviewSurface`; "single" is a placement word, not the composition)
   4. `review_message_embed` — inside review messages (`ArtifactEmbed`; the ArtifactView shapes live here)

The AE6 `kinds/*-renderer.tsx` layer is deleted; a negative-existence test bans `getRenderer` / `*Renderer` re-exports (`web/src/__tests__/AE6-kind-renderers.test.tsx`).

## Kind extensibility (AE6)

The kind vocabulary is **open at the data layer** (any `lowercase_snake_case` string stores; reads are open) but **create-time is constrained** to the 6 registered fundamentals (`z.enum(ARTIFACT_KINDS)`, `routes/artifacts.ts`).

This contrasts with BlockKind, which is closed — blocks decompose prose into renderable regions (the kind set IS the AST vocabulary), while artifact kinds classify output format. Both compose the same base primitives; BlockKind is owned by [docs/blocks/canonical-shapes.md](../blocks/canonical-shapes.md).

**Kind Definition** — a static config module in `framework/domain-model/src/kinds/` binding a kind string to (`kind-definition.ts`):
- a Zod preview schema (pure content only — no diff, no comparison, no state field)
- a display-title extractor
- a summary function

A Kind Definition does NOT bind a renderer or base primitive — rendering dispatch is hardcoded in `compose-artifact-body.tsx`.

**Registration is a hand-maintained Map** (`registry.ts`). Adding a kind = create the Kind Definition module + one import + one Map entry. Build-time auto-discovery was rejected — `import.meta.glob` is Vite-only and breaks the Node server. Kind Definitions are code modules, not database entities, and the registry is the only registration mechanism.

**Unregistered kinds** render a generic *content* fallback — kind label + raw content via `UnknownPayload` — never crash, never blank. This fallback is not an empty/error/loading state; those belong to the composition. The old `unknown_kind` sentinel is retired.

**Legacy kind normalization is LIVE.** `rowToArtifact` applies `OLD_KIND_MAP` at read time — 13 legacy kinds (e.g. `code_diff` → `code`) map to a new kind+label pair (`routes/artifacts.ts`, `framework/domain-model/src/kinds/old-kind-map.ts`). Only the legacy `{file,hunks}` *preview-shape* normalization was deleted (AM5, pre-alpha clean rewrite — no migration); old code previews read as null.

## Fetching contract

`GET /api/artifacts?axis=task|bet|product|portfolio` (`routes/artifacts.ts`; `ArtifactFilterAxis` in `framework/domain-model/src/types/artifact.ts`). Bet/Product/Portfolio aggregate via task-id fan-out (capped at 1000). The product axis resolves `teamId` (U1 productId→teamId rename; both query params accepted).

## Permalinks

Every Artifact has a permalink page: route `artifacts/:id` → `ArtifactPermalink` (`web/src/router.tsx`, `web/src/pages/ArtifactPermalink.tsx`). It renders the full preview surface and the Artifact's thread.

## Cost

An artifact carries no cost. It never did as a stored column, and there is no longer an accumulator behind it either.

- `GET` returns `{money: null, tokens: null}` per artifact, and `PATCH /:id/cost` does not exist (`layers/core-api/src/routes/artifacts.ts`).
- The bet/agent/team cost accumulators the `POST` payload used to feed are deleted — the whole cost-accounting mechanism went with the cost cap. See [wip-and-cost-limits](wip-and-cost-limits.md), which records the deletion and why nothing replaced it: the real spend ceiling lives at the upstream provider account, not in HyperIdle.

## Hard rules

- Artifacts root on Tasks. Bet/Team/Portfolio surfaces aggregate; they never own. (The fetch API still accepts `axis=product` for wire compatibility — U1 productId→teamId rename.)
- Threads attach to Artifacts via the artifact→task chain (`routes/threads.ts`); thread grammar owned by [thread-primitive](../human-interface-layer/thread-primitive.md).
- Compositions closed at three; placements closed at four; ArtifactView shapes closed at five.
- No fake thumbnails — when `preview` is null, render an explicit placeholder.
- Base-primitive purity (AM5): a base primitive carries no diff, no comparison, no state branch. The diff is the Review composition; states belong to the composition (Artifact owns empty/error/loading; Review owns no-changes; Block owns absence).
- One canonical content-renderer family: the block-payload layer. Artifact (single) composes the same primitives Block (mixed) composes.
- Kind determines the composed primitives; labels MUST NOT affect renderer selection (`schema.ts`; dispatch is kind-only).
- Kind Definitions are the only mechanism for registering kinds; no ad-hoc per-kind logic in core files. Adding a kind touches the new module plus the single registry Map entry — nothing else.
- Unknown content renders the content fallback — never crash, never blank. "Unknown content" ≠ "no content".

## Vocabulary

| Term | Aliases not to use |
|---|---|
| Artifact | Output, File, Deliverable, Result, Asset, Document |
| Artifact Kind | artifact type, artifact category, artifact class |
| Artifact Label | artifact tag |
| Kind Definition | kind plugin, kind extension, kind registration |
| Registered Kind | known kind, supported kind, built-in kind |
| Unregistered Kind | unknown kind (retired sentinel), unsupported kind |
| ArtifactView | never a synonym for the Artifact primitive |
