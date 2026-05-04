## Block primitive

Cross-reference: `docs/BLOCKS.md` is the long-form concept doc. This section is a pointer for readers of HIL.

**A Block is a derived, addressable, renderable region of a markdown body.** Every structured-prose surface in the human interface layer renders through Blocks: the bet pitch on Bet detail (L16), the knowledge body on Knowledge/Detail (L23), and any future surface that wants to show prose. Conversations does NOT use Blocks — chat messages, review messages, and questionnaire messages are L1 message shapes, not Blocks.

The on-disk format remains GitHub-flavoured markdown. Agents writing into the materialised workspace continue writing GFM. The Knowledge Fabric continues watching plain markdown files. There is no HyperIdle-specific markdown dialect, no fenced JSON, no `<block>` tag. Blocks are *derived* during ingestion — the moment the markdown body becomes a thing the UI renders.

**Where Blocks render today:**

| Surface | Source body | Story |
|---|---|---|
| Bet pitch (`WorkBet`, replaces the `<pre>` fallback) | `bets.pitch` markdown | L16 |
| Knowledge body (`KnowledgeDetail`, replaces the `<pre>` block) | `knowledge_items.body` markdown | L23 |
| Per-block discussion on Knowledge | (anchored on L23's blocks) | L26 |

**Anchors and discussion.** Each Block exposes a `BlockAnchor` — its own `{ blockId }` reference — as the attachment key any other primitive uses to reference it. Per-block discussion (L26) attaches an L1 Thread to a Block via this anchor; there is no separate linking primitive (L24, deferred) involved, and no parallel "block comment" entity. Anchored threads survive the deletion of their target block as a "block deleted" indicator.

**Disambiguation.** "Block" with a capital B in this layer always means the content primitive defined in BLOCKS.md. Do not confuse with:
- the verb / state "blocked" / "blocking" (workflow states from `PROCESS_LAYER.md` — task on hold or blocked, blocking review threads);
- "Tier 2 — Blocks" above (a tier of design-system *components* like ThreadRow and BetCard — these are React widgets, not Block primitives, and the renderer components that materialise a Block on screen are named `*BlockView`).

For the kind set, the BlockId stability algorithm, the rejection list, and the contracts every consumer must respect, see `docs/BLOCKS.md`. The shared type signatures live in `plans/work-packages/SHARED.md` § "Block primitive".

See UI_DESIGN.md v0.2 for the full component tree and build order.
