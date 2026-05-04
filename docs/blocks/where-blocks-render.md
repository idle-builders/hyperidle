## 9. Where Blocks render

| Surface | Source body | When it ships | Notes |
|---|---|---|---|
| Bet pitch (`WorkBet`) | `bets.pitch` (markdown) | L16 | Replaces the current `<pre>` fallback at `WorkBet.tsx:262-267`. |
| Knowledge body (`KnowledgeDetail`) | `knowledge_items.body` (markdown) | L23 | Replaces the `<pre>` block at `KnowledgeDetail.tsx:301-307`. |
| Knowledge per-block discussion | (uses the anchor of L23's blocks) | L26 | Anchors L1 Threads to the block. |
| Future structured-prose surfaces (task notes, retro templates, etc.) | future markdown bodies | future stories | Compose this primitive without re-implementing it. |

Conversations does **not** render Blocks. Chat messages, review messages, and questionnaire messages are L1 message shapes — they have nothing to do with this primitive.

---
