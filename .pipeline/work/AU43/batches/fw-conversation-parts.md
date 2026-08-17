# Delete batch — `fw-conversation-parts`

8 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `deriveComposerPills` | function · UI: SessionView composer only | A3: the per-message composer-pill path dies; option concept moves to agent config. Kills the package's only harness-capability dependency and SessionView's pill block. |
| 2 | `PartKind` | type · none (PartList mention is a comment) | Stands: exported to nobody; internal use inlines into the union. |
| 3 | `PartId` | type · none | Stands: alias of string, zero consumers. |
| 4 | `ReviewTarget` | interface · none outside package | Stands: internal-only; inline the shape; betId is always "" at the only construction site. |
| 5 | `FoldDescriptor` | interface · DEAD | Stands: zero references anywhere, not even inside its own package. Pure corpse. |
| 6 | `EmbedKind` | type · DEAD | Stands: zero references outside its own derivation line. |
| 7 | `PART_KINDS` | const · TEST-ONLY externally; internal type derivation | Stands: no runtime production reader; inline the union literals. |
| 8 | `EMBED_KINDS` | const · TEST-ONLY | Stands: only readers are the package's own tests asserting the const equals itself. |
