/**
 * App runtime knowledge status vocabulary.
 *
 * @lore nested-knowledge-items: `KnowledgeLayer` and `KnowledgeKind` are
 * DELETED — a knowledge item's place in the tree says what it is about now,
 * not a flat layer/kind vocabulary. `KnowledgeStatus` re-exports
 * `@hyperidle/domain-model`'s `KNOWLEDGE_STATUSES` (the two status
 * vocabularies collapsed into one), kept as a local re-export so existing
 * `../types.js` imports in this package do not need to change their
 * specifier.
 */
export { KNOWLEDGE_STATUSES, type KnowledgeStatus } from "@hyperidle/domain-model";
