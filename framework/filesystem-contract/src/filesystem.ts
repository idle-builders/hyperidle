// AO1 — Filesystem primitive: types, constants, and seam interfaces.
// Source of truth: plans/AO1/architecture.md §1 (types) + §4 (Connection seam) + §5 (AO2 seam).

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
	| { kind: "code"; repo: string; branch: string } // GitHub-style "owner/repo" or clone URL + branch
	| { kind: "doc_set"; folder: string }; // absolute folder path (local or connection-relative)

/** The Filesystem wire/domain type. A REGISTERED, team-scoped file source — NOT owned by one agent.
 *  Mirrors docs/process-layer/canonical-shapes.md §Filesystem. */
export interface Filesystem {
	id: string; // opaque, stable
	teamId: string; // FK → teams.id. The REGISTRY scope. Required.
	source: string; // source type, derived from the Connection (or 'local'). Shown prominently.
	kind: FilesystemKind; // open vocab; create constrained to FILESYSTEM_KINDS.
	connectionId: string | null; // reference to a Connection (AN). null → bare local path.
	resourceRef: ResourceRef; // parsed selector (stored as JSON text in DB).
	writeback: WriteBack;
	state: FilesystemState;
	createdAt: string; // ISO 8601
	// NOTE: no `agentUserId` — per-bot wiring is the FilesystemInjection mapping below.
}

// ─── AO2 mount seam ───────────────────────────────────────────────

/** Outcome of a mount call. */
export interface MountResult {
	success: boolean;
	sandboxPath: string;
	error?: string;
}
