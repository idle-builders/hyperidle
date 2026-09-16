/**
 * The Filesystem wire/domain type.
 * Moved here from @hyperidle/filesystem-contract (AU44 batch 2 dissolution).
 *
 * All auxiliary named types (FilesystemKind, WriteBack, ResourceRef, FilesystemState)
 * are inlined — their single consumers use the literals directly.
 *
 * @lore AU44 b2: FILESYSTEM_KINDS and WRITEBACK_MODES inlined into the route's
 * Zod enum where they are used.
 * @lore BA5 §12: the write-back axis is gone (migration 0082); `state` is now
 * written by placement and by Check (`checkFilesystem`), never by a route
 * transition — the deleted `filesystem-reachability.ts`'s own probe.
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
	resourceRef:
		| { kind: "code"; repo: string; branch: string }
		| { kind: "doc_set"; folder: string }
		| { kind: "drive"; remote: string; path: string };
	state: "attached" | "reachable" | "needs_attention";
	/** What to fix, plain words, redacted. Set with state:"needs_attention"; null otherwise. */
	attentionReason: string | null;
	createdAt: string;
}
