/**
 * AO2 — Mount injected filesystems into a spawned session's sandbox.
 *
 * AU21 §9 Increment 8, Decision F2: this module is the RELOCATED, EXPORTED
 * entry point for what was previously `provisioner.ts`'s private
 * `mountFilesystemsForAgent` — only its DB-reading PREAMBLE was wrong-side-
 * of-the-seam (it called the composition-bundle's two-step
 * `listFilesystemIdsByAgent`/`listFilesystemsByIds` ports, which core-api's
 * `run-orchestration-composition.ts` implemented by calling
 * `@hyperidle/filesystems`'s `listFilesystems` directly with a raw `db`
 * handle). This collapses that two-step port dance into the ONE seam call
 * `CoreApiPort.filesystems.listFilesystemsByAgent(agentId)` already supports
 * (reusing `GET /filesystems?agentUserId=` verbatim — see that route's own
 * `@lore AU20 R-filesystems`) — no `db` parameter at all.
 *
 * `resourceRef` arrives ALREADY PARSED (the backing route's own
 * `rowToFilesystem` parses it) — this function must NOT re-`JSON.parse` it.
 */

import type { Filesystem, FilesystemMounter } from "@hyperidle/shared";

/** One filesystem's provisioning-relevant fields — mirrors `CoreApiPort.filesystems.listFilesystemsByAgent`'s record shape (`resourceRef` already parsed). */
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

/** The `filesystems` seam reader this function depends on — backed by `CoreApiPort.filesystems.listFilesystemsByAgent` at the real composition root. */
export interface FilesystemsProvisioningReader {
	listFilesystemsByAgent(agentId: string): Promise<readonly FilesystemForProvisioning[]>;
}

/**
 * AO2: Mount every filesystem injected into `agentId` for this spawned session.
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
	readonly filesystems: FilesystemsProvisioningReader;
	readonly agentId: string;
	readonly sandboxPath: string;
	readonly mounter: FilesystemMounter;
}): Promise<Filesystem[]> {
	const { filesystems, agentId, sandboxPath, mounter } = params;

	// Resolve injected filesystems in ONE seam call (sessions.agentId → filesystem_injections → filesystems).
	const rows = await filesystems.listFilesystemsByAgent(agentId);

	if (rows.length === 0) return [];

	// The seam's backing route already parses resourceRef — pass the record's fields through.
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
			const result = await mounter.mount({ filesystem, sandboxPath, auth: null });
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
