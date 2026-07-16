/**
 * Low-level read accessor for `knowledgeItems`/`knowledgeAppProjection` —
 * NOT the general CRUD surface (see `knowledge-repository.ts`).
 *
 * @lore AU19 Increment 2c: `@hyperidle/git-export`'s `computeExportPlan`
 * used to query `knowledgeItems`/`knowledgeAppProjection` directly (both
 * owned by `knowledge`, `TABLE_OWNER` since Increment 1a) — legal while
 * `git-export.ts` still lived in the unguarded `packages/server` composition
 * root, but a Table ACL violation the moment it becomes its own Service
 * package. This is a genuinely NEW `git-export -> knowledge` edge the
 * architecture §10.2 census missed entirely (`git-export`'s only listed
 * outbound edge was `-> settings`) — same "census undercount surfaced at
 * migration time" shape as every prior Increment's completeness-check
 * discovery (`policy`'s `org`, `notifications`' `teamMembers`, `filesystems`'
 * registry gap). Appended as a new census row per ground-rule #10.
 *
 * The layer/status filter set is `git-export`'s own business rule
 * (`EXPORTED_KINDS`/`EXPORTED_STATUSES`), not `knowledge`'s concern — the
 * caller supplies both allow-lists; this Service owns only the table access.
 * Dissolves the original query's redundant `notInArray` belt-and-braces
 * clause (logically implied by the positive `inArray(statuses)` filter —
 * a no-op simplification, not a behavior change).
 */
import { type HyperIdleDb, knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import { and, eq, inArray } from "drizzle-orm";

export interface KnowledgeItemProjectionRow {
	readonly layer: string | null;
	readonly kind: string | null;
}

/**
 * The updated item's projection `layer`/`kind` (or `null` if the item itself
 * no longer exists). `registerGitExportHandler`'s `knowledge_updated` event
 * listener uses this to decide whether an update is export-worthy before
 * scheduling a debounced full re-export.
 */
export async function findKnowledgeItemProjectionById(
	db: HyperIdleDb,
	itemId: string,
): Promise<KnowledgeItemProjectionRow | null> {
	const [row] = await db
		.select({ item: knowledgeItems, projection: knowledgeAppProjection })
		.from(knowledgeItems)
		.leftJoin(knowledgeAppProjection, eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id))
		.where(eq(knowledgeItems.id, itemId))
		.limit(1);
	if (!row) return null;
	return { layer: row.projection?.layer ?? null, kind: row.projection?.kind ?? null };
}

export interface ExportableKnowledgeItemRow {
	readonly id: string;
	readonly topic: string | null;
	readonly title: string;
	readonly body: string;
	readonly version: number;
	readonly layer: string | null;
	readonly kind: string | null;
	readonly scopeId: string | null;
}

export interface ExportableKnowledgeItemFilters {
	readonly layers: readonly string[];
	readonly statuses: readonly string[];
}

/**
 * Knowledge items whose projection `layer` is one of `filters.layers` and
 * whose kernel `status` is one of `filters.statuses`. Inner-joined so items
 * with no projection row (no layer assigned) are excluded automatically.
 */
export async function listExportableKnowledgeItems(
	db: HyperIdleDb,
	filters: ExportableKnowledgeItemFilters,
): Promise<readonly ExportableKnowledgeItemRow[]> {
	const rows = await db
		.select({ item: knowledgeItems, projection: knowledgeAppProjection })
		.from(knowledgeItems)
		.innerJoin(
			knowledgeAppProjection,
			eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
		)
		.where(
			and(
				inArray(knowledgeAppProjection.layer, filters.layers as string[]),
				inArray(knowledgeItems.status, filters.statuses as string[]),
			),
		);
	return rows.map((r) => ({
		id: r.item.id,
		topic: r.item.topic,
		title: r.item.title,
		body: r.item.body,
		version: r.item.version,
		layer: r.projection?.layer ?? null,
		kind: r.projection?.kind ?? null,
		scopeId: r.projection?.scopeId ?? null,
	}));
}
