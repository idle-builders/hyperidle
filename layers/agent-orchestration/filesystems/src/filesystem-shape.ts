/**
 * The Filesystem wire/domain type.
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
