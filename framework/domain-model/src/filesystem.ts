// Filesystem primitive: types, constants, and mount result.
// Moved from @hyperidle/filesystem-contract (dissolved in AU44 batch 2).

/** OPEN vocabulary. Initial committed kinds. Systems of record are categorically excluded.
 *  The create-route Zod enum constrains writes; reads stay open.
 *  @lore AO1 AC3: SoR kinds (inbox, crm, ticket_queue, …) are rejected at the API boundary
 *  (Zod enum on POST). Reads stay open-vocabulary for forward compat. */
export const FILESYSTEM_KINDS = ["code", "doc_set"] as const;
export type FilesystemKind = (typeof FILESYSTEM_KINDS)[number] | (string & {});

/** How authored changes leave the sandbox. Closed set — a capability axis, not a kind. */
export const WRITEBACK_MODES = ["git", "file", "none"] as const;
export type WriteBack = (typeof WRITEBACK_MODES)[number];

/** Reachability lifecycle.
 *  - attached: freshly registered (no check yet).
 *  - reachable: connection resolves.
 *  - needs_attention: unresolvable / unauthenticated connection. */
export type FilesystemState = "attached" | "reachable" | "needs_attention";

/** Discriminated resource selector (the `resourceRef` JSON payload), keyed by kind. */
export type ResourceRef =
	| { kind: "code"; repo: string; branch: string }
	| { kind: "doc_set"; folder: string };

/** The Filesystem wire/domain type. A REGISTERED, team-scoped file source — NOT owned by one agent.
 *  Mirrors docs/process-layer/canonical-shapes.md §Filesystem. */
export interface Filesystem {
	id: string;
	teamId: string;
	source: string;
	kind: FilesystemKind;
	connectionId: string | null;
	resourceRef: ResourceRef;
	writeback: WriteBack;
	state: FilesystemState;
	createdAt: string;
}

/** Outcome of a mount call. */
export interface MountResult {
	success: boolean;
	sandboxPath: string;
	error?: string;
}
