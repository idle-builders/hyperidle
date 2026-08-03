/**
 * AO2 — Mount injected filesystems into a spawned session's sandbox.
 *
 * AU21 §9 Increment 8, Decision F2 (historical): this module was originally
 * the RELOCATED, EXPORTED entry point for `provisioner.ts`'s private
 * `mountFilesystemsForAgent`, collapsing a two-step port dance into the ONE
 * seam call `CoreApiPort.filesystems.listFilesystemsByAgent(agentId)`.
 *
 * AU21 §9 Increment 12 follow-up (F2 gap closure): that ONE seam call was
 * itself the gap H3's later, more complete "bake everything at emit time"
 * principle should have superseded but never revisited. It is now GONE — this
 * function takes the agent's injected-filesystems list already BAKED onto the
 * request (`params.injectedFilesystems`, resolved at emit time by every
 * per-kind resolver via `@hyperidle/filesystems`'s
 * `resolveInjectedFilesystemsForAgent`) instead of reading it back here. No
 * seam reader, no `agentId` parameter — this function is now pure mount logic
 * over an already-resolved list.
 *
 * `resourceRef` arrives ALREADY PARSED (the bake helper's own mapping mirrors
 * the former route's `rowToFilesystem`) — this function must NOT re-`JSON.parse` it.
 */

import type {
	BakedFilesystemForProvisioning,
	Filesystem,
	FilesystemMounter,
} from "@hyperidle/shared";

/**
 * One filesystem's provisioning-relevant fields — mirrors the emit-time bake
 * helper's record shape (`resourceRef` already parsed). Kept as a local alias
 * (not a re-declaration) of `@hyperidle/shared`'s `BakedFilesystemForProvisioning`
 * — the SAME shape every per-kind resolver bakes onto the request.
 */
export type FilesystemForProvisioning = BakedFilesystemForProvisioning;

/**
 * AO2: Mount every filesystem in the BAKED `injectedFilesystems` list for
 * this spawned session.
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
	readonly injectedFilesystems: readonly FilesystemForProvisioning[];
	readonly sandboxPath: string;
	readonly mounter: FilesystemMounter;
}): Promise<Filesystem[]> {
	const { injectedFilesystems: rows, sandboxPath, mounter } = params;

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
