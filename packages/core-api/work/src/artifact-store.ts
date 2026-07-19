/**
 * `artifacts` table accessor — AU19 Increment 4 forcing function.
 *
 * `artifacts` is `work`'s owned table per architecture §4 (never previously
 * had a `TABLE_OWNER` row — `create-artifact.ts`, a tool file, wrote to it
 * directly via `@hyperidle/db`). Moving that tool into the guarded
 * `tool-handlers` nested package surfaces the violation for real; this file
 * is the concrete closure, mirroring every other table-ownership closure in
 * this WP.
 *
 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, work
 * sub-item): the paginated list/detail/preview-patch queries used by
 * `routes/artifacts.ts`, plus the bet-scoped artifact+task-title join used
 * by `routes/bets.ts`'s artifact-thread-summary endpoint, and the
 * single-row lookup used by `routes/reviews.ts`, all used to run raw
 * `artifacts`/`tasks` Drizzle access directly in `core-api/src`. Moved here
 * unchanged (byte-identical query shape) so `artifacts`/`tasks` stay
 * private to this Service.
 */

import { artifacts, tasks, type WriteExecutor } from "@hyperidle/db";
import { and, desc, eq, inArray, lt, or, type SQL } from "drizzle-orm";

export interface CreateArtifactInput {
	readonly id: string;
	readonly producingTaskId: string;
	readonly kind: string;
	readonly label: string | null;
	readonly previewJson: string | null;
	readonly createdAt: string;
}

/** Full `artifacts` row shape — same fields as `CreateArtifactInput`. */
export type ArtifactRow = CreateArtifactInput;

export interface ArtifactWithTaskTitle {
	readonly artifact: ArtifactRow;
	readonly taskTitle: string;
}

/**
 * Paginated `artifacts` list, joined to the producing task's title.
 * `routes/artifacts.ts` GET / — byte-identical query shape (optional
 * `taskIds` filter, optional `(createdAt, id)` composite cursor,
 * `limit + 1` over-fetch so the caller can detect a next page).
 */
export async function listArtifactsPage(
	db: WriteExecutor,
	params: {
		readonly taskIds: readonly string[] | null;
		readonly cursor: { readonly createdAt: string; readonly id: string } | null;
		readonly limit: number;
	},
): Promise<ArtifactWithTaskTitle[]> {
	if (params.taskIds !== null && params.taskIds.length === 0) return [];

	const cursorClause = params.cursor
		? or(
				lt(artifacts.createdAt, params.cursor.createdAt),
				and(eq(artifacts.createdAt, params.cursor.createdAt), lt(artifacts.id, params.cursor.id)),
			)
		: undefined;

	const filterClauses: Array<SQL | undefined> = [
		params.taskIds === null ? undefined : inArray(artifacts.producingTaskId, [...params.taskIds]),
		cursorClause,
	].filter((c): c is SQL => c !== undefined);
	const whereClause = filterClauses.length > 0 ? and(...filterClauses) : undefined;

	const baseQuery = db
		.select({ artifact: artifacts, taskTitle: tasks.title })
		.from(artifacts)
		.innerJoin(tasks, eq(tasks.id, artifacts.producingTaskId));

	return whereClause === undefined
		? await baseQuery.orderBy(desc(artifacts.createdAt), desc(artifacts.id)).limit(params.limit)
		: await baseQuery
				.where(whereClause)
				.orderBy(desc(artifacts.createdAt), desc(artifacts.id))
				.limit(params.limit);
}

/**
 * Single artifact + its producing task's title. `routes/artifacts.ts`
 * GET /:id.
 */
export async function getArtifactWithTaskTitleById(
	db: WriteExecutor,
	id: string,
): Promise<ArtifactWithTaskTitle | undefined> {
	const [row] = await db
		.select({ artifact: artifacts, taskTitle: tasks.title })
		.from(artifacts)
		.innerJoin(tasks, eq(tasks.id, artifacts.producingTaskId))
		.where(eq(artifacts.id, id))
		.limit(1);
	return row;
}

/** Single artifact row, no join. `routes/reviews.ts`'s proposed-call artifact lookup. */
export async function getArtifactById(
	db: WriteExecutor,
	id: string,
): Promise<ArtifactRow | undefined> {
	const [row] = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
	return row;
}

export interface ArtifactTaskSummaryRow {
	readonly artifactId: string;
	readonly artifactKind: string;
	readonly artifactPreviewJson: string | null;
	readonly taskTitle: string;
}

/**
 * Artifacts (+ producing task title) for a set of task ids. `routes/bets.ts`
 * GET /:id/artifact-thread-summary — feeds the per-bet artifact-thread
 * aggregate (conversation summaries merged in the route layer, out of this
 * Service's ownership).
 */
export async function listArtifactSummariesByTaskIds(
	db: WriteExecutor,
	taskIds: readonly string[],
): Promise<ArtifactTaskSummaryRow[]> {
	if (taskIds.length === 0) return [];
	return db
		.select({
			artifactId: artifacts.id,
			artifactKind: artifacts.kind,
			artifactPreviewJson: artifacts.previewJson,
			taskTitle: tasks.title,
		})
		.from(artifacts)
		.innerJoin(tasks, eq(tasks.id, artifacts.producingTaskId))
		.where(inArray(artifacts.producingTaskId, [...taskIds]));
}
