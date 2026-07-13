/**
 * Knowledge Service — scope-based read used by `context-assembly`'s
 * `KnowledgeReader` port. Reads the kernel `knowledgeItems` table only via
 * this function; the barrel exports it, never the raw `knowledgeItems`
 * object (Table ACL, Mechanism A).
 *
 * @lore AU19 Increment 0/1a: this is the real cross-Service edge the minimal
 * slice proved — `context-assembly` (agent-orchestration) consumes
 * `listByScope` as its injected `KnowledgeReader` port, wired by the
 * agent-orchestration Layer. Named `listByScope` (not `list`) to avoid
 * colliding with `knowledge-repository.ts`'s `list(db, filters: ListFilters)`
 * — the real production listing function used by `routes/knowledge.ts` /
 * `context-assembly.ts`, which filters on kernel `topic` + projection
 * `layer`/`scopeId`/`kind` and has no `scopeKind` filter. `listByScope` is a
 * distinct, narrower query (kernel `scopeKind`+`scopeId` only) — reconciling
 * the two under one name would either change `list()`'s production filter
 * semantics or silently drop `listByScope`'s scopeKind filter. Kept as two
 * named functions instead (§7.3 Increment 1a builder note).
 */
import { type HyperIdleDb, type KnowledgeItem, knowledgeItems } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";

/** Structural scope selector — kept structural so the consuming port need not
 * import a knowledge type (Mechanism C: no Service-to-Service type coupling). */
export interface KnowledgeScope {
	readonly scopeKind: string;
	readonly scopeId?: string | null;
}

/** List canonical knowledge items in a scope, newest first. */
export async function listByScope(
	db: HyperIdleDb,
	scope: KnowledgeScope,
): Promise<KnowledgeItem[]> {
	const conditions = [eq(knowledgeItems.scopeKind, scope.scopeKind)];
	if (scope.scopeId != null) {
		conditions.push(eq(knowledgeItems.scopeId, scope.scopeId));
	}
	const rows = await db
		.select()
		.from(knowledgeItems)
		.where(and(...conditions));
	return rows;
}
