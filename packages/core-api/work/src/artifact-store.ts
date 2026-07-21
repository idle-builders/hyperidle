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

interface CreateArtifactInput {
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

export interface ArtifactTaskSummaryRow {
	readonly artifactId: string;
	readonly artifactKind: string;
	readonly artifactPreviewJson: string | null;
	readonly taskTitle: string;
}

export type { CreateArtifactInput };
