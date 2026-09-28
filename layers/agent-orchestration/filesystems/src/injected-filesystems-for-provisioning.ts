/**
 * Session-launch-time injected-filesystem read, in-layer.
 * Reads filesystem injections live so a filesystem assigned after emit still reaches the sandbox.
 *
 */

import type { WriteExecutor } from "@hyperidle/db";
import { listFilesystems } from "./filesystem-registry.js";

/**
 * Read every filesystem injected into `agentId` (`filesystem_injections` joined
 * to `filesystems`), live, for one session spawn. Both tables are this Layer's
 * own, so the join stays a single query — the two-owner decomposition
 * never has to happen.
 *
 * An agent with no injections resolves `[]`, never a throw.
 */
export async function listInjectedFilesystemsForProvisioning(exec: WriteExecutor, agentId: string) {
	const rows = await listFilesystems(exec, { agentId });
	return rows.map((row) => ({
		id: row.id,
		teamId: row.teamId,
		source: row.source,
		kind: row.kind,
		connectionId: row.connectionId ?? null,
		resourceRef: JSON.parse(row.resourceRef) as unknown,
		writeback: row.writeback,
		state: row.state,
		createdAt: row.createdAt,
	}));
}
