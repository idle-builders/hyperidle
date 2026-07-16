/**
 * Low-level read accessor for `knowledgeItems`/`knowledgeAppProjection` —
 * NOT the general CRUD surface (see `knowledge-repository.ts`). Same idiom
 * as `git-export-store.ts`.
 *
 * @lore AU19 Increment 3h: `dispatch`'s `builtin-routine-handlers.ts`
 * (`runPortfolioRetro`) used to query `knowledgeItems`/`knowledgeAppProjection`
 * directly (both owned by `knowledge`, `TABLE_OWNER` since Increment 1a) —
 * legal while `builtin-routine-handlers.ts` still lived in the unguarded
 * `packages/server` composition root, but a Table ACL violation the moment
 * it becomes part of the `dispatch` Service package. A genuinely NEW
 * `dispatch -> knowledge` call site the architecture §10.2 census missed
 * entirely (raw table access wasn't a countable edge at original census
 * time — same "census undercount surfaced at migration time" shape as
 * every prior Increment's completeness-check discovery). Appended as a
 * census correction per ground-rule #10 — see `@hyperidle/dispatch`'s
 * `ports.ts` top `@lore`.
 */
import { type HyperIdleDb, knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import { and, eq, gte, inArray } from "drizzle-orm";

export interface RecentLayeredKnowledgeItemRow {
	readonly title: string;
	readonly updatedAt: string;
	readonly layer: string | null;
}

/**
 * Knowledge items whose projection `layer` is one of `layers` and whose
 * `updatedAt` is on/after `updatedSince`. Inner-joined so items with no
 * projection row (no layer assigned) are excluded automatically — same
 * shape as `listExportableKnowledgeItems`.
 */
export async function listRecentByLayers(
	db: HyperIdleDb,
	layers: readonly string[],
	updatedSince: string,
): Promise<readonly RecentLayeredKnowledgeItemRow[]> {
	const rows = await db
		.select({ item: knowledgeItems, fabric: knowledgeAppProjection })
		.from(knowledgeItems)
		.innerJoin(
			knowledgeAppProjection,
			eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
		)
		.where(
			and(
				inArray(knowledgeAppProjection.layer, layers as string[]),
				gte(knowledgeItems.updatedAt, updatedSince),
			),
		);
	return rows.map((r) => ({
		title: r.item.title,
		updatedAt: r.item.updatedAt,
		layer: r.fabric.layer,
	}));
}
