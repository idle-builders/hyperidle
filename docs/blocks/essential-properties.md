## 2. Essential properties

Every Block has:

- **`id: BlockId`** — a stable identifier derived from the block's normalised content plus its position in the document outline. Stable across re-parses with identical content; stable when neighbour blocks change but the block itself does not. (See §8 for the algorithm.)
- **`kind: BlockKind`** — one of the closed set in §6.
- **`source: { path, sha, range }`** — the markdown body it was derived from (the knowledge_items / pitch source), the SHA of the body the derivation ran against, and the byte range inside that body. Range is informational only — never load-bearing for identity.
- **`payload`** — the kind-specific structured shape the renderer needs (heading text + level; paragraph inline AST; list items; code language + text; table rows; etc.).
- **`anchor: BlockAnchor`** — the affordance the block exposes to non-content surfaces. The anchor is a `{ blockId }` reference that any consumer (a thread, a link, a hover preview) can use as its attachment key. The anchor is *not* a separate primitive; it is a property of the block itself.

That is the **essential** field set. Anything else (hover preview text, syntax-highlighted HTML, the rendered React node) is the renderer's job, not the block's shape.

### 2.1 Informational fields (debug / render-order only)

These ride alongside the essential fields but **never** carry identity. Consumers must not use them for thread attachment, link targets, or any persistent reference.

- **`order: number`** — the block's position in the document, 0-indexed. Useful for debug logging and stable render order. **Never identity.** Two re-derivations of the same body produce the same `order` for the same block, but a re-derivation after an edit will re-assign `order` based on document position — so `order` is structurally unstable across edits. Use `id` for identity, always.

---
