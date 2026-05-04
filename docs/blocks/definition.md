## 1. Definition

**A Block is a derived, addressable, renderable region of a markdown body.** It is a *projection* — the output of running a deterministic, GitHub-flavoured-markdown parser over a stored markdown body and grouping the resulting AST into one of a closed set of **BlockKind** shapes. Each block carries a stable **BlockId**, the structural data needed to render it (the parsed AST node, normalised), and an **anchor** affordance that lets external surfaces attach to it (a comment, a link target, a hover popover).

Body-level metadata (front matter, etc.) is **not** a Block. It rides alongside the block list as a sibling field on the derivation result (see §6 and §10) — addressable for diagnostics, but not part of the renderable block stream.

Blocks live entirely on the read path. The on-disk format is plain markdown. The database stores plain markdown. The Knowledge Fabric watches plain markdown. The user sees, comments on, and links to Blocks.

---
