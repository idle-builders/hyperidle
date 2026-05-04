# Artifact primitive (L3)

The function-agnostic, task-rooted record of something the team has produced. Defined in `docs/human-interface-layer/the-three-views-the-rail.md` §4.7; producer rule in this folder's process-layer docs §3. Implementation stories L11 (rich review messages) and L12 (Work surfaces) consume this contract directly.

## Canonical shape

```
Artifact {
  id                  # opaque, stable, immutable
  producing_task_id   # the unique producing Task — required, immutable
  kind                # function-agnostic type label (code diff, deck, contract,
                      # dashboard, screenshot, drafted email, design, data analysis,
                      # decision with rationale, running service, communication draft,
                      # test/verification result, ...) — illustrative, not enumerated
                      # at this layer; closure decided in /architecture
  preview             # short representation for gallery / stack rendering;
                      # null until populated; once populated, immutable
  cost_from_session   # money + tokens contributed by the producing session(s);
                      # null until session settles; once populated, immutable
  created_at
}
```

## View family (CLOSED — adding a layout requires a concept-doc update first)

1. `gallery_card` — used in collection surfaces (Bet detail, Product page, Portfolio gallery).
2. `stack_item` — used in vertical lists where Artifacts live alongside other items.
3. `single_full_preview` — used on the Artifact's own detail surface.
4. `review_message_embed` — used inside review messages in Conversations; internally consumes the five `ArtifactView` shapes (text_diff / content_preview / visual_comparison / action_summary / data_metrics) for its preview rendering.

## ArtifactView shapes (5)

`text_diff`, `content_preview`, `visual_comparison`, `action_summary`, `data_metrics`.

## Fetching contract

The system can fetch Artifacts filtered by Task, by Bet (aggregated from Tasks), by Product (aggregated from Bets), or by Portfolio (aggregated from Products). The shape returned is the canonical Artifact above.

## Hard rules

- Artifacts root on Tasks. Bet/Product/Portfolio surfaces aggregate; they never own.
- Threads (L1) attach to Artifacts via the universal cross-area attachment contract.
- The view family is closed at four layouts.
- No fake thumbnails — when `preview` is null, render an explicit placeholder.
- The pre-existing `ArtifactView` (component) is the renderer engine inside the `review_message_embed` layout — not a synonym for the Artifact primitive.

## Aliases NOT to use for the primitive

Output, File, Deliverable, Result, Asset, Document.

## Cost shape (L3 publishes / L4 adopts)

L3 publishes `ArtifactCostFromSession = { money: string | null; tokens: string | null }` — a pre-formatted display proxy. The DB stores precision-safe integers (`cost_money_micros`, `cost_tokens_input`, `cost_tokens_output`) and the server collapses these to display strings via `formatArtifactCost`. When L4 ships `Money` and `TokenUsage`, the `money` and `tokens` fields adopt those richer types directly without a re-migration: the formatter is the single chokepoint that absorbs the swap, and the DS components consume the wire shape unchanged.
