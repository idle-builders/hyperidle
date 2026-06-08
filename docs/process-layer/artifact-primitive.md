# Artifact primitive (L3)

The function-agnostic, task-rooted record of something the team has produced. Defined in `docs/human-interface-layer/the-three-views-the-rail.md` §4.7; producer rule in this folder's process-layer docs §3. Implementation stories L11 (rich review messages) and L12 (Work surfaces) consume this contract directly.

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
                      # Schema is per-kind (defined by the Kind Definition).
  cost_from_session   # money + tokens contributed by the producing session(s);
                      # null until session settles; once populated, immutable
  created_at
}
```

## The 6 fundamental kinds (AE6)

Kind answers "what format did the agent produce?" — not "what business domain is this about?" That's what labels are for.

| Kind | What the agent produced | Review experience |
|---|---|---|
| `text` | Markdown/prose | Content preview — read and approve prose (rendered via Block primitive) |
| `code` | Source code diff or file | Diff viewer — line-by-line code review |
| `image` | Visual asset (screenshot, design, diagram) | Visual comparison — see what was produced |
| `data` | Structured metrics/tables | Metrics/table view — scan numbers and results |
| `html` | Rich rendered content (dashboards, charts, visualizations) | Rendered preview — see output as the user would (sandboxed) |
| `url` | Reference to something external (deployed service, PR, page) | Action summary — check status of deployed/created thing |

`html` is the universal escape hatch — LLMs are good at generating HTML, and anything rich that doesn't fit the other 5 renders as HTML.

## View family (CLOSED — adding a layout requires a concept-doc update first)

1. `gallery_card` — used in collection surfaces (Bet detail, Product page, Portfolio gallery).
2. `stack_item` — used in vertical lists where Artifacts live alongside other items.
3. `single_full_preview` — used on the Artifact's own detail surface.
4. `review_message_embed` — used inside review messages in Conversations.

## Fetching contract

The system can fetch Artifacts filtered by Task, by Bet (aggregated from Tasks), by Product (aggregated from Bets), or by Portfolio (aggregated from Products). The shape returned is the canonical Artifact above.

## Hard rules

- Artifacts root on Tasks. Bet/Product/Portfolio surfaces aggregate; they never own.
- Threads (L1) attach to Artifacts via the universal cross-area attachment contract.
- The view family is closed at four layouts.
- No fake thumbnails — when `preview` is null, render an explicit placeholder.
- (AE6) Kind determines the renderer. Labels MUST NOT affect renderer selection.
- (AE6) Adding a new artifact kind MUST NOT require editing any file outside the new kind's own definition module(s).
- (AE6) Unregistered kinds MUST render a sensible fallback — never crash, never blank.
- (AE6) Kind Definitions are the ONLY mechanism for registering kinds. No ad-hoc per-kind logic in core files.

## Kind extensibility (AE6)

The artifact kind vocabulary is **open**. Any `lowercase_snake_case` string is valid at the data layer (DB stores `text`). The initial 6 fundamental kinds (`text`, `code`, `image`, `data`, `html`, `url`) cover 90%+ of agent output. New kinds can be added via **Kind Definitions** — static configuration modules discovered at build time.

This contrasts with BlockKind, which is **closed** — blocks decompose prose into renderable regions (the kind set IS the rendering vocabulary), while artifact kinds classify output format (the set of things agents produce is diverse and growing).

**Kind Definition** — a static configuration module at a conventional path that binds a kind string to:
- A Zod preview schema
- A renderer component (lazy-loadable)
- A display-title extractor
- A summary function

Kind Definitions are code modules, not database entities. They are discovered at build time — no runtime registry. The 6 initial kinds each have a Kind Definition. Adding a kind = creating a Kind Definition module.

**Artifact Label** — optional business-domain tag on an artifact. Freeform `lowercase_snake_case` string. Labels like `contract`, `email`, `dashboard`, `test-results` provide context for the reviewer without changing how the artifact renders. Labels are not enumerated — any string is valid.

**Unregistered kinds** render a generic fallback (kind label + raw preview data). Never crash, never blank. The previous `unknown_kind` sentinel is retired; the registered/unregistered partition generalises its purpose.

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
