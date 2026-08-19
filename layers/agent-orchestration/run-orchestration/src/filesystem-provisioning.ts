/**
 * AO2 — Mount injected filesystems into a spawned session's sandbox.
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
 */

import type { Filesystem, MountResult } from "@hyperidle/domain-model";

/** Structural mounter port — run-orchestration declares the shape it needs (Mechanism C). */
export interface FilesystemMounterPort {
	mount(input: { filesystem: Filesystem; sandboxPath: string }): Promise<MountResult>;
	captureBack(input: {
		filesystem: Filesystem;
		sandboxPath: string;
		sessionId: string;
	}): Promise<unknown>;
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
	readonly writeback: string;
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
}

/**
 * AO2: Mount every filesystem currently injected into this agent, read LIVE at
 * spawn for this session.
 *
 * Called in admitSession Phase 4.5 (AFTER sandbox spawn, BEFORE context assembly).
 * Returns the list of successfully-mounted Filesystem records — stored on AdmittedSession
 * so the teardown helper (Hook B) can capture them without a second DB query.
 *
 * Mount failures are best-effort: a failed mount logs a warning and is EXCLUDED from
 * the returned list. The session continues without that filesystem (degrade-to-today).
 *
 * @lore AO2 §9: Mount BEFORE context assembly so .git/info/exclude is written before
 * assembly drops scaffolding into the directory. A filesystem-less session → empty list,
 * no mounts, no capture rows — purely non-breaking for existing sessions.
 */
export async function mountFilesystemsForAgent(params: {
	readonly agentId: string;
	readonly filesystems?: InjectedFilesystemsReaderPort;
	readonly sandboxPath: string;
	readonly mounter: FilesystemMounterPort;
}): Promise<Filesystem[]> {
	const { agentId, filesystems, sandboxPath, mounter } = params;

	if (!filesystems) return [];
	const rows = await filesystems.listInjectedForProvisioning(agentId);

	if (rows.length === 0) return [];

	// The reader already parses resourceRef — pass the record's fields through.
	const fsList: Filesystem[] = rows.map((row) => ({
		id: row.id,
		teamId: row.teamId,
		source: row.source as Filesystem["source"],
		kind: row.kind as Filesystem["kind"],
		connectionId: row.connectionId ?? null,
		resourceRef: row.resourceRef as Filesystem["resourceRef"],
		writeback: row.writeback as Filesystem["writeback"],
		state: row.state as Filesystem["state"],
		createdAt: row.createdAt,
	}));

	// Mount each filesystem; collect the ones that succeed.
	const mounted: Filesystem[] = [];
	for (const filesystem of fsList) {
		try {
			const result = await mounter.mount({ filesystem, sandboxPath });
			if (result.success) {
				mounted.push(filesystem);
			} else {
				// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
				console.warn(
					`[session-provisioning] AO2 mount failed for filesystem ${filesystem.id}: ${result.error ?? "unknown"}`,
				);
			}
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn(
				`[session-provisioning] AO2 mount threw for filesystem ${filesystem.id}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	return mounted;
}
