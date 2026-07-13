/**
 * Knowledge Service — read side. The SOLE `knowledgeItems` table path for this
 * Service (Table ACL, Mechanism A): every read routes through this function and
 * the barrel exports the function, never the raw `knowledgeItems` object.
 *
 * @lore AU19 Increment 0: this is the real cross-Service edge the minimal slice
 * proves — `context-assembly` (agent-orchestration) consumes `list` as its
 * injected `KnowledgeReader` port, wired by the agent-orchestration Layer. The
 * function owns the table so that dependency stays a downward DI port, not a
 * Service-to-Service import.
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
export async function list(db: HyperIdleDb, scope: KnowledgeScope): Promise<KnowledgeItem[]> {
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
