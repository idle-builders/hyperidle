/**
 * Low-level accessors for `knowledgeItems`/`knowledgeAppProjection`/
 * `knowledgeAccessLog` supporting `packages/core-api/src`'s
 * `routes/{threads,search,knowledge}.ts` — NOT the general CRUD surface
 * (see `knowledge-repository.ts`). Same idiom as `git-export-store.ts`/
 * `portfolio-retro-store.ts`.
 *
 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, knowledge
 * sub-item): these three route files queried `knowledgeItems`/
 * `knowledgeAppProjection`/`knowledgeAccessLog` (all `knowledge`-owned,
 * `TABLE_OWNER` since Increment 1a) directly — legal while they lived in
 * the unguarded `packages/server` composition root, a Table ACL violation
 * now that `table-ownership-guard.ts`'s scan is scheduled to widen to
 * `core-api/src` (per architecture.md §12's RESUME PLAN). No new
 * cross-Service edges: `core-api/src -> core-api/knowledge` is an ordinary
 * downward edge, already real (both real migrated packages).
 */
import {
	type HyperIdleDb,
	knowledgeAccessLog,
	knowledgeAppProjection,
	knowledgeItems,
} from "@hyperidle/db";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";

/** Batched title lookup by id — mirrors `@hyperidle/work`'s `listBetsByIds`/`listTasksByIds` shape. */
export function listTitlesByIds(
	db: HyperIdleDb,
	ids: readonly string[],
): Promise<ReadonlyArray<{ id: string; title: string }>> {
	if (ids.length === 0) return Promise.resolve([]);
	return db
		.select({ id: knowledgeItems.id, title: knowledgeItems.title })
		.from(knowledgeItems)
		.where(inArray(knowledgeItems.id, ids as string[]));
}

export interface SearchVisibleKnowledgeRow {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly updatedAt: string;
	readonly layer: string | null;
	readonly kind: string | null;
}

/**
 * `routes/search.ts` (AD7) — ILIKE title/body match, LEFT JOIN app
 * projection for layer/kind, `scope_kind != 'user' OR updated_by =
 * viewerUserId` auth boundary, ordered `updatedAt DESC, id ASC` (stable),
 * capped at `limit`. `pattern` is the caller's already wildcard-escaped
 * `%<query>%` LIKE pattern (same convention as `@hyperidle/work`'s
 * `searchBetsByText`).
 */
export function searchVisibleByText(
	db: HyperIdleDb,
	opts: { pattern: string; viewerUserId: string; limit: number },
): Promise<SearchVisibleKnowledgeRow[]> {
	return db
		.select({
			id: knowledgeItems.id,
			title: knowledgeItems.title,
			status: knowledgeItems.status,
			updatedAt: knowledgeItems.updatedAt,
			layer: knowledgeAppProjection.layer,
			kind: knowledgeAppProjection.kind,
		})
		.from(knowledgeItems)
		.leftJoin(knowledgeAppProjection, eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id))
		.where(
			and(
				or(ne(knowledgeItems.scopeKind, "user"), eq(knowledgeItems.updatedBy, opts.viewerUserId)),
				or(
					sql`${knowledgeItems.title} ILIKE ${opts.pattern} ESCAPE '\\'`,
					sql`${knowledgeItems.body} ILIKE ${opts.pattern} ESCAPE '\\'`,
				),
			),
		)
		.orderBy(desc(knowledgeItems.updatedAt), knowledgeItems.id)
		.limit(opts.limit);
}

export interface RecordKnowledgeAccessInput {
	readonly itemId: string;
	readonly accessorKind: string;
	readonly accessorId: string;
	readonly accessedAt: string;
}

/**
 * `routes/knowledge.ts` `GET /:id` (L22) — best-effort access-log append.
 * Caller keeps the try/catch (never break the read on log-write failure).
 */
export async function recordKnowledgeAccess(
	db: HyperIdleDb,
	input: RecordKnowledgeAccessInput,
): Promise<void> {
	await db.insert(knowledgeAccessLog).values({
		id: crypto.randomUUID(),
		itemId: input.itemId,
		accessorKind: input.accessorKind,
		accessorId: input.accessorId,
		accessedAt: input.accessedAt,
	});
}
