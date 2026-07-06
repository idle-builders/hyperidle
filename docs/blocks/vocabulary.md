## 7. Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Block** | The content primitive defined in this document — a derived, addressable region of a markdown body. Always capitalised when used in this sense. | section, node, chunk, fragment, segment, slice, partial, snippet |
| **BlockKind** | The closed enum of block shapes (§6). | block-type, block-shape, block-class |
| **BlockId** | The stable identifier of a Block (§8). | block-key, block-uid, block-hash (hash is the algorithm, not the term) |
| **BlockAnchor** | A `{ blockId }` reference exposed by a Block as the attachment key for external surfaces. | block-link, block-target, block-marker, block-pin |
| **BlockDerivation** | The deterministic function that turns a markdown body into an ordered list of Blocks. Sometimes "derivation" alone in context. | parsing, ingestion (those are larger pipelines that *contain* derivation) |
| **block-derivation cache** | The optional `(body_sha, parser_version) → Block[]` cache. Lower-case to mark it as infrastructure, not the primitive. | block store, block table |

**Disambiguation against existing vocabulary.** Three collisions exist; all three are in active use elsewhere in the codebase, and all three must stay distinct from the Block primitive:

- **`block` (verb) / `blocked` (state) / `blocking` (adjective).** Always lower-case. Refer to the workflow states defined in `PROCESS_LAYER.md` (the 8-state task lifecycle: …`hold`, `blocked`…) and to blocking review threads in `HUMAN_INTERFACE_LAYER.md`. Never collapse with the Block primitive in code: a status field is `taskStatus` or `reviewBlocking`, never `block`.
- **"Tier 2 — Blocks" in `UI_DESIGN.md`.** Refers to a tier of design-system *components* (ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow). These are React widgets, not Block primitives. When the L2 implementation adds renderer components for the Block primitive (e.g. `HeadingBlockView`, `ParagraphBlockView`), those are still UI components in the design system; they happen to *render* a Block. The two senses are kept apart by capitalisation in prose ("Block primitive" vs. "Tier 2 Blocks") and by naming in code (the renderer suffix `*BlockView` belongs to the UI layer; the data type `Block` belongs to the content layer).

---
