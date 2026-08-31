# Track T: Block Authoring & Reference

Rich authoring over the block model — WYSIWYG editing of knowledge and bet bodies, and moving blocks between the surfaces that discuss them.

**Shipped foundation.** T1 (the BodyEditor component), T2 (knowledge WYSIWYG editing), T3 (bet pitch WYSIWYG editing) and T5 (block discussion completion) are merged.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| T4 | Block reference: attach any block to any thread, with the block's content shown in full as an inline embed | frontend | M | — | unbuilt — carried from the legacy track file; the only T package that never shipped. Lets a reader bring specific content from a knowledge item or a bet pitch into a discussion without copy-pasting. **Not a from-scratch build** — the attach-button pattern, the overlay, and the inline-reference infrastructure all exist (see `docs/blocks/`); this extends them. Note the legacy spec names them with the pre-AD8a "Chief of Staff" vocabulary that the noun purge removed — map the names to their current equivalents before building. |

## Dependency graph

- `T4` depends on nothing: it extends the attach/overlay/inline-reference primitives already on `main`.
