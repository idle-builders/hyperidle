# Block Primitive (HIL Pointer)

The Block primitive is owned by [`docs/blocks/`](../blocks/index.md) — definition, the closed kind vocabulary, BlockId stability, and consumer contracts all live there. Type contracts: [`docs/blocks/canonical-shapes.md`](../blocks/canonical-shapes.md). This page keeps only what a reader of the human-interface layer needs.

## What it is, in one line

A Block is a **derived, addressable, renderable region of a markdown body**. Bodies stay plain GitHub-flavoured markdown on disk — no HyperIdle dialect, no fenced JSON, no `<block>` tag. Blocks are derived at render time on the client (pure `deriveBlocks`, see `packages/web/src/pages/knowledge/KnowledgeBody.tsx`), never stored. Full derivation model: [`docs/blocks/derivation-and-rendering.md`](../blocks/derivation-and-rendering.md).

## Where Blocks render in this layer

| Surface | Source body |
|---|---|
| Bet description (`WorkBet.tsx`) | `bets.description` markdown |
| Knowledge body (`KnowledgeBody.tsx`) | `knowledge_items.body` markdown |
| Review canvas artifact bodies (`review-canvas.tsx:79`) | artifact body markdown |
| Per-block discussion | threads anchored on the surfaces above |

Conversations does **not** use Blocks — chat, review, and questionnaire messages are message shapes on the Thread primitive ([thread-primitive.md](thread-primitive.md)), not Blocks.

## Anchors and discussion

Each Block exposes a `BlockAnchor` — `{ blockId }` (`packages/shared/src/blocks/types.ts:47`) — as the sole attachment key other primitives use to reference it. Per-block discussion attaches a Thread to a Block via this anchor; there is no separate "block comment" entity. What happens when an anchored block disappears is a consumer contract owned by [`docs/blocks/contracts.md`](../blocks/contracts.md).

## Naming disambiguation

Capital-B **Block** in this layer always means the content primitive from `docs/blocks/`. Do not confuse with:

- **blocked / blocking** — workflow states from the process layer (task on hold or blocked, blocking review threads);
- **design-system components** — Tier-2 React widgets like ThreadRow and BetCard. The renderer for the primitive is the `<Block />` component from `@hyperidle/design-system`. Component-tier naming (`*Payload` components + `<Block />`) is owned by [`docs/ui-design/our-components.md`](../ui-design/our-components.md).
