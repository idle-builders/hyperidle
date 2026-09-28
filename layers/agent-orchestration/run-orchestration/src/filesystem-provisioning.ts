import type { Filesystem, MountResult } from "./mounter.js";

/** Structural mounter port — run-orchestration declares the shape it needs. */
export interface FilesystemMounterPort {
	mount(input: { filesystem: Filesystem; sandboxPath: string }): Promise<MountResult>;
}

/** Structural mirror of @hyperidle/filesystems' InjectedFilesystemForProvisioning; Application wires them. */
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

/** Application-composed from @hyperidle/filesystems. Absent → no filesystems mounted (not a read failure). */
export interface InjectedFilesystemsReaderPort {
	listInjectedForProvisioning(agentId: string): Promise<readonly FilesystemForProvisioning[]>;
}

/**
 * Mount every filesystem currently injected into this agent, read LIVE at
 * spawn for this session.
 *
 * Called in admitSession Phase 4.5 (AFTER sandbox spawn, BEFORE context assembly).
 * Returns the list of successfully-mounted Filesystem records — stored on AdmittedSession
 * so the teardown helper (Hook B) can capture them without a second DB query.
 *
 * Mount failures are best-effort: a failed mount logs a warning and is EXCLUDED from
 * the returned list. The session continues without that filesystem (degrade-to-today).
 *
 * @lore: filesystem-provisioning — mount BEFORE context assembly so .git/info/exclude is written before scaffolding drops; filesystem-less session → empty list
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
					`[session-provisioning] mount failed for filesystem ${filesystem.id}: ${result.error ?? "unknown"}`,
				);
			}
		} catch (err) {
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn(
				`[session-provisioning] mount threw for filesystem ${filesystem.id}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	return mounted;
}
