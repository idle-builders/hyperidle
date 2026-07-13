/**
 * Barrel for @hyperidle/knowledge (core-api Layer, SQL-owning Service).
 *
 * Typed functions only. This barrel MUST NOT re-export the raw `knowledgeItems`
 * pgTable object — that would let a consumer obtain the table transitively and
 * defeat Table ACL (Mechanism A). Consumers get typed functions; the table stays
 * private to this Service.
 */

export type { KnowledgeScope } from "./knowledge-reader.js";
export { list } from "./knowledge-reader.js";
