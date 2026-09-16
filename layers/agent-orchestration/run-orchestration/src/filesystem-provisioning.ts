/**
 * AO2 — Mount injected filesystems into a spawned session's workspace.
 *
 * AU21 §9 Increment 8, Decision F2 (historical): this module was originally
 * the RELOCATED, EXPORTED entry point for `provisioner.ts`'s private
 * `mountFilesystemsForAgent`, collapsing a two-step port dance into the ONE
 * seam call `CoreApiPort.filesystems.listFilesystemsByAgent(agentId)`.
 *
 * AU21 §9 Increment 12 follow-up (historical): that seam call was replaced by a
 * BAKE — the injected-filesystem list frozen onto the request at emit time. It
 * existed only because `filesystems` still sat in core-api, and it bought the
 * closed boundary at the price of a stale snapshot (a filesystem assigned
 * between emit and drain never reached the sandbox).
 *
 * AU26 F2 (founder ruling): the tables are agent-orchestration's own now, so the
 * bake is DELETED and the read is live and in-layer — `deps.filesystems`, one
 * injected port backed by `@hyperidle/filesystems`'
 * `listInjectedFilesystemsForProvisioning`. Not a seam: it is this Layer reading
 * this Layer's own tables. `run-orchestration` is itself a Service, so it takes
 * the reader as a port rather than importing that Service (Mechanism C); the
 * Application wires the two together. Exactly the shape E3 gave connections.
 *
 * `resourceRef` arrives ALREADY PARSED (the reader's own mapping mirrors the
 * route's `rowToFilesystem`) — this function must NOT re-`JSON.parse` it.
 *
 * @lore BA5 §4.2/§13 (L3 scope): a mount failure now THROWS instead of being
 * swallowed to `console.warn` and excluded from the result — the old
 * degrade-to-today behaviour silently ran an agent in an empty folder (plan
 * break #4).
 *
 * @lore BA5 §4.2/§13 (L5): the throw is now `FilesystemMountFailure` (this
 * file, below), not a plain `Error` — `admitSession`'s Phase 4.5 needs the
 * failing filesystem's id, the adapter's own reason text, the filesystem row
 * and credential (for a Check re-run's better-phrased reason), and every
 * filesystem THIS admission already placed (so it can unmount exactly those,
 * never an adopted resume's) before it runs the full hold: release the
 * adapter, destroy the workspace unless resuming, mark the filesystem
 * `needs_attention`, and only then throw `FilesystemUnavailableError` — the
 * task stays ready throughout (§4.2).
 */

import type { Filesystem, MountedFilesystem, MountInput, MountResult } from "./mounter.js";
import { SANDBOX_SCAFFOLDING_PATHS } from "./scaffolding-paths.js";

/** Structural mounter port — run-orchestration declares the shape it needs (Mechanism C). */
export interface FilesystemMounterPort {
	mount(input: MountInput): Promise<MountResult>;
}

/**
 * One filesystem's provisioning-relevant fields (`resourceRef` already parsed).
 * Structurally identical to `@hyperidle/filesystems`' own
 * `InjectedFilesystemForProvisioning` — the two are wired together by the
 * Application, so this Service names the shape without importing that one
 * (Mechanism C, same idiom as `HeldConnectionForProvisioning` beside it).
 */
export interface FilesystemForProvisioning {
	readonly id: string;
	readonly teamId: string;
	readonly source: string;
	readonly kind: string;
	readonly connectionId: string | null;
	readonly resourceRef: unknown;
	readonly state: string;
	readonly createdAt: string;
}

/**
 * AU26 F2 — the live, in-layer injected-filesystem read one spawn performs.
 * Application-composed from `@hyperidle/filesystems`. Absent means "this
 * deployment mounts no filesystems" (the graceful-degradation posture the
 * optional `mounter` already has), not "read failed".
 */
export interface InjectedFilesystemsReaderPort {
	listInjectedForProvisioning(agentId: string): Promise<readonly FilesystemForProvisioning[]>;
	/**
	 * BA5 §2.4/§13 (L4): the PAT resolved as the connection's OWNER (never a
	 * per-request user) — backed by `resolveConnectionToken`. Optional: an
	 * absent method, like an absent port entirely, mounts every connection-
	 * backed filesystem with `credential: null` — the same "no credential yet"
	 * shape a public remote already needs nothing for.
	 */
	resolveCredential?(connectionId: string): Promise<string | null>;
	/**
	 * BA5 §2.5/§4.1/§13 (L5): every agent currently held by a `needs_attention`
	 * filesystem — the drain's claim-time exclusion list (`start-runtime.ts`).
	 * Optional, like `resolveCredential`: absent excludes nobody, the same
	 * "no hold wired" posture an absent port entirely already gives.
	 */
	listHeldAgentIds?(): Promise<readonly string[]>;
	/**
	 * BA5 §4.2/§4.3/§13 (L5): placement failed — mark the filesystem
	 * `needs_attention` with this reason (and notify once, if it just entered).
	 * Optional: absent means a placement failure cannot record the hold, so
	 * `admitSession` still throws `FilesystemUnavailableError` but the
	 * filesystem's own row and the notice never happen — a test-fixture
	 * posture, never production (boot always wires this, §4.4).
	 */
	markNeedsAttention?(filesystemId: string, reason: string): Promise<void>;
}

/**
 * BA5 §4.2/§13 (L5) — thrown by `mountFilesystemsForAgent` when a filesystem
 * cannot be placed. Carries what `admitSession`'s Phase 4.5 needs to run the
 * full hold: which filesystem broke, the mount adapter's own reason text (the
 * fallback the plan names for when a Check re-run unexpectedly passes), the
 * filesystem row and resolved credential (so a Check re-run can phrase a
 * better reason, §4.2), and every filesystem THIS admission had already
 * mounted before the failure. BA5 (no-teardown): nothing unmounts a partial
 * placement any more — a git worktree already cut belongs to the task, not
 * to this failed admission — so `mounted` is diagnostic only now.
 */
export class FilesystemMountFailure extends Error {
	constructor(
		public readonly filesystemId: string,
		public readonly reason: string,
		public readonly filesystem: Filesystem,
		public readonly credential: string | null,
		public readonly mounted: readonly MountedFilesystem[],
	) {
		super(`could not mount filesystem ${filesystemId}: ${reason}`);
		this.name = "FilesystemMountFailure";
	}
}

/** A path segment charset a folder name is reduced to (BA5 §5.3). */
function reduceToFolderChars(raw: string): string {
	const reduced = raw.replace(/[^A-Za-z0-9._-]/g, "-");
	return reduced.length > 0 ? reduced : "filesystem";
}

function baseFolderName(resourceRef: Filesystem["resourceRef"]): string {
	if (resourceRef.kind === "code") {
		const last = resourceRef.repo.replace(/\/+$/, "").split(/[/\\]/).pop() ?? resourceRef.repo;
		return reduceToFolderChars(last.replace(/\.git$/i, ""));
	}
	const last = resourceRef.folder.replace(/\/+$/, "").split(/[/\\]/).pop() ?? resourceRef.folder;
	return reduceToFolderChars(last);
}

/**
 * BA5 §5.3 — the subfolder name each filesystem gets inside a workspace: the
 * repo/folder basename, reduced to `[A-Za-z0-9._-]`, disambiguated with the
 * filesystem id's first 8 characters when it collides with a scaffolding path
 * or with another of this agent's own filesystems. Computed from the agent's
 * whole injected list so a resume gets the same names as long as the
 * injections have not changed.
 */
export function computeFolderNames(
	filesystems: readonly Filesystem[],
): ReadonlyMap<string, string> {
	const bases = filesystems.map((f) => baseFolderName(f.resourceRef));
	const counts = new Map<string, number>();
	for (const base of bases) counts.set(base, (counts.get(base) ?? 0) + 1);
	const result = new Map<string, string>();
	filesystems.forEach((f, i) => {
		const base = bases[i] as string;
		const collides =
			(SANDBOX_SCAFFOLDING_PATHS as readonly string[]).includes(base) ||
			(counts.get(base) ?? 0) > 1;
		result.set(f.id, collides ? `${base}-${f.id.slice(0, 8)}` : base);
	});
	return result;
}

function rowToFilesystem(row: FilesystemForProvisioning): Filesystem {
	return {
		id: row.id,
		teamId: row.teamId,
		source: row.source as Filesystem["source"],
		kind: row.kind as Filesystem["kind"],
		connectionId: row.connectionId ?? null,
		resourceRef: row.resourceRef as Filesystem["resourceRef"],
		state: row.state as Filesystem["state"],
		createdAt: row.createdAt,
	};
}

/**
 * AO2: Mount every filesystem currently injected into this agent, read LIVE at
 * spawn for this session.
 *
 * Called in admitSession Phase 4.5 (AFTER sandbox spawn, BEFORE context assembly).
 * Returns the placed `MountedFilesystem` records.
 *
 * @lore BA5 §4.2/§13: a mount failure throws — see this file's top-of-file
 * `@lore` for why that changed from the prior best-effort catch-and-skip.
 */
export async function mountFilesystemsForAgent(params: {
	readonly agentId: string;
	readonly sessionId: string;
	/** BA5 (no-teardown) §3 — keys a git filesystem's long-lived worktree home. */
	readonly taskId: string | null;
	readonly filesystems?: InjectedFilesystemsReaderPort;
	readonly workspacePath: string;
	readonly mounter: FilesystemMounterPort;
}): Promise<MountedFilesystem[]> {
	const { agentId, sessionId, taskId, filesystems, workspacePath, mounter } = params;

	if (!filesystems) return [];
	const rows = await filesystems.listInjectedForProvisioning(agentId);
	if (rows.length === 0) return [];

	const fsList = rows.map(rowToFilesystem);
	const folderNames = computeFolderNames(fsList);

	const mounted: MountedFilesystem[] = [];
	for (const filesystem of fsList) {
		const folderName = folderNames.get(filesystem.id) ?? filesystem.id;
		// @lore BA5 §2.4/§13 (L4): resolved as the connection's OWNER, never a
		// per-request user — a filesystem row has no user of its own. No
		// connectionId, or no `resolveCredential` wired at all, mounts with
		// `credential: null`, same as a public remote already needs.
		const credential =
			filesystem.connectionId != null && filesystems?.resolveCredential
				? await filesystems.resolveCredential(filesystem.connectionId)
				: null;
		const result = await mounter.mount({
			filesystem,
			workspacePath,
			sessionId,
			taskId,
			folderName,
			credential,
		});
		if (!result.ok) {
			throw new FilesystemMountFailure(
				filesystem.id,
				result.reason,
				filesystem,
				credential,
				mounted,
			);
		}
		mounted.push(result.mounted);
	}

	return mounted;
}
