/**
 * The Filesystem wire/domain type.
 * Moved here from @hyperidle/filesystem-contract when that package dissolved.
 *
 * All auxiliary named types (FilesystemKind, WriteBack, ResourceRef, FilesystemState)
 * are inlined — their single consumers use the literals directly.
 *
 * @lore AU44 b2: FILESYSTEM_KINDS and WRITEBACK_MODES inlined into the route's
 * Zod enum where they are used; FilesystemState declared in filesystem-reachability.ts
 * next to the function that returns it.
 */

/** A REGISTERED, team-scoped file source — NOT owned by one agent.
 *  Mirrors docs/process-layer/canonical-shapes.md §Filesystem. */
export interface Filesystem {
	id: string;
	teamId: string;
	source: string;
	/** Open vocabulary — closed for writes by the Zod enum on POST. */
	kind: string;
	connectionId: string | null;
	resourceRef: { kind: "code"; repo: string; branch: string } | { kind: "doc_set"; folder: string };
	writeback: "git" | "file" | "none";
	state: "attached" | "reachable" | "needs_attention";
	createdAt: string;
}
