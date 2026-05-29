# Improvements — Knowledge Layer

Cross-cutting improvement notes for the knowledge layer (Knowledge Items, Curation, Fabric).

## 1. Knowledge Fabric sync performance

The fabric watcher triggers a full re-derivation on every file change. A diff-based approach that only re-derives changed blocks would improve performance for large knowledge bases.

## 2. Block primitive integration

The Knowledge Detail view (`KnowledgeDetail.tsx`) should render the knowledge item body through the Block primitive (`deriveBlocks` from `packages/shared`). Currently the body is rendered as a raw markdown pre-block. Migrating to Block-level rendering enables:
- Per-block discussion threads (L26) anchored via `BlockAnchor`
- Block-level permalink URLs for sharing specific sections
- Consistent rendering across all prose surfaces (Bets, Knowledge, Artifacts)

The Block primitive is defined in `docs/blocks/` and its canonical type signatures are in `docs/blocks/canonical-shapes.md`.

## 3. Curation suggestions API

The `MOCK_CURATION_SUGGESTIONS` fixture in `packages/web/src/fixtures/knowledge-data.ts` is used by the Knowledge List page. This should be replaced with a real API endpoint that queries the database for AI-generated curation suggestions.

## 4. Knowledge search

Full-text search over knowledge items is not yet implemented. The fabric materialises block content that could feed a search index.

## 5. Block-level discussion on knowledge

Per-block discussion (L26) is the primary motivation for Block primitive adoption in the knowledge layer. Each `BlockAnchor` can be the attachment target for a thread, enabling focused discussion on specific paragraphs or sections.
