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
export const SUBSTRATE_STATES = ["attached", "reachable", "needs_attention"] as const;
export type FilesystemState = (typeof SUBSTRATE_STATES)[number];

/** The SOURCE TYPE — open vocabulary, derived from the Connection at register-time (or 'local').
 *  Surfaced prominently in the registry UI. Distinct from `kind`.
 *  @lore AO1 Q6: Stored (not computed on read) so the registry displays it without resolving
 *  a possibly-absent Connection. Open vocab — a new source never needs a migration. */
export const FILESYSTEM_SOURCES = ["local", "github", "gdrive", "obsidian"] as const;
export type FilesystemSource = (typeof FILESYSTEM_SOURCES)[number] | (string & {});

/** Discriminated resource selector (the `resourceRef` JSON payload), keyed by kind. */
export type ResourceRef =
	| { kind: "code"; repo: string; branch: string } // GitHub-style "owner/repo" or clone URL + branch
	| { kind: "doc_set"; folder: string }; // absolute folder path (local or connection-relative)

/** The Filesystem wire/domain type. A REGISTERED, team-scoped file source — NOT owned by one agent.
 *  Mirrors docs/process-layer/canonical-shapes.md §Filesystem. */
export interface Filesystem {
	id: string; // opaque, stable
	teamId: string; // FK → teams.id. The REGISTRY scope. Required.
	source: FilesystemSource; // source type, derived from the Connection (or 'local'). Shown prominently.
	kind: FilesystemKind; // open vocab; create constrained to FILESYSTEM_KINDS.
	connectionId: string | null; // reference to a Connection (AN). null → bare local path.
	resourceRef: ResourceRef; // parsed selector (stored as JSON text in DB).
	writeback: WriteBack;
	state: FilesystemState;
	createdAt: string; // ISO 8601
	// NOTE: no `agentUserId` — per-bot wiring is the FilesystemInjection mapping below.
}

/** Per-bot INJECTION wiring. Which registered filesystems are injected into a given bot.
 *  Mirrors docs/process-layer/canonical-shapes.md §FilesystemInjection.
 *  UNIQUE (agentUserId, filesystemId).
 *  @lore AO1 Q1: FK is users.id (the runtime agent identity = sessions.agentId, schema.ts:252-254).
 *  NOT team_members.id (one row per team, U1 1:1, no per-agent identity). */
export interface FilesystemInjection {
	agentUserId: string; // FK → users.id (the bot/agent = sessions.agentId)
	filesystemId: string; // FK → filesystems.id
	createdAt: string; // ISO 8601
}

// ─── Connection seam (AO1 ⟂ AN) ────────────────────────────────────────────

/** Opaque auth handle the resolver yields — never the raw token. AO1 never inspects it;
 *  it is provisioned INTO the sandbox by AO2. */
export interface FilesystemAuth {
	readonly connectionId: string;
	/** How AO2 should make this auth usable in the sandbox. Discriminated; open. */
	readonly provision:
		| { mode: "git-credential"; remote: string } // git asks via a credential helper / env
		| { mode: "env"; vars: Record<string, string> } // e.g. GH_TOKEN — AO2 writes to sandbox env
		| { mode: "none" }; // local-first, no auth needed
}

/** The seam. AN provides the real implementation; AO1 ships a NoopAuthResolver that
 *  reports every connectionId unresolvable (→ needs_attention) until AN merges.
 *  @lore AO1 §4: plain text connection_id (not a DB FK) because service_connections
 *  was merged (0036) then reverted (0038, AN reset). AN may add the FK in its own migration. */
export interface FilesystemAuthResolver {
	/** Cheap structural check used by the reachability path (AO1, no network). */
	canResolve(connectionId: string): boolean | Promise<boolean>;
	/** The SOURCE TYPE of a connection ('github' | 'gdrive' | …), used by the register route
	 *  to derive `filesystems.source`. Returns null when the connection is absent/unknown. */
	sourceOf(connectionId: string): string | null | Promise<string | null>;
	/** Full resolution used by AO2 at mount to provision auth into the sandbox.
	 *  Returns null when the connection is absent/unauthenticated. */
	resolve(connectionId: string): Promise<FilesystemAuth | null>;
	/**
	 * Resolve the RAW decrypted credential string for git env injection (AO1 reachability probe).
	 * Returns null when the connection is absent, unresolvable, or produces no token.
	 * Unlike resolve(), this bypasses the FilesystemAuth wrapper so the caller can inject
	 * directly into GIT_CONFIG_VALUE_n without a second round-trip.
	 *
	 * @lore AO1 v2: resolveFilesystemState needs the raw token for GIT_CONFIG injection.
	 * Adding resolveToken() to the seam eliminates the instanceof ServiceConnectionResolverAdapter
	 * downcast and the double-decrypt (resolve() was called only to check non-null, then resolveToken()
	 * decrypted again). NoopAuthResolver returns null (no credential); real adapter delegates to
	 * ServiceConnectionResolver.resolve() once.
	 */
	resolveToken(connectionId: string): Promise<string | null>;
}

// ─── AO2 mount seam ───────────────────────────────────────────────

/** Outcome of a mount call. */
export interface MountResult {
	success: boolean;
	sandboxPath: string;
	error?: string;
}

/** Outcome of a captureBack call. */
export interface CaptureResult {
	success: boolean;
	captured: boolean; // false = writeback:'none', no-op
	error?: string;
}

/** The contract AO2 implements. AO1 ships the type only — no implementation.
 *  Hooks into session-provisioning.ts Phase 4.5 (mount) + teardown (captureBack).
 *  @lore AO1 §5 / AO2 §9: Mount AFTER sandbox spawn (Phase 4) and BEFORE context
 *  assembly (Phase 6) so .git/info/exclude is written before scaffolding lands.
 *  captureBack runs BEFORE each endSession/crashSession call (endSession holds the
 *  rm -rf at session-lifecycle.ts:341; workspace.destroy is adapter-map cleanup only). */
export interface FilesystemMounter {
	/** Place the filesystem's working set into the session sandbox at its branch/folder.
	 *  auth is null for local/inherited sessions (no Connection needed). Idempotent per sandbox. */
	mount(input: {
		filesystem: Filesystem;
		sandboxPath: string;
		auth: FilesystemAuth | null; // from FilesystemAuthResolver.resolve (null → local-first/none)
	}): Promise<MountResult>;

	/** Capture authored changes back out of the sandbox after the session.
	 *  git → commit (+ push/PR is a LANDING op, AL7/AO3, not here); file → write/snapshot; none → no-op.
	 *  @param sessionId — written into filesystem_captures for provenance. */
	captureBack(input: {
		filesystem: Filesystem;
		sandboxPath: string;
		sessionId: string;
	}): Promise<CaptureResult>;
}
