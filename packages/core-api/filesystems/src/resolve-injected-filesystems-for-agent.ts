/**
 * AU21 §9 Increment 12 follow-up (F2 gap closure).
 *
 * Decision H3 already established the pattern: core bakes everything a
 * session needs into the request AT EMIT TIME, keyed off the resolved
 * agentId, so run-orchestration never reads core-api back at provisioning
 * time. Decision F2 (Increment 8) left ONE seam call standing that H3's
 * later, more complete principle should have superseded but never revisited:
 * `CoreApiPort.filesystems.listFilesystemsByAgent(agentId)`, backed by
 * `GET /filesystems?agentUserId=` (`routes/filesystems.ts`), which resolves
 * `sessions.agentId -> filesystem_injections -> filesystems` via
 * `listFilesystems(db, {agentId})` + that route's own `rowToFilesystem`
 * mapping (parsed `resourceRef`).
 *
 * This function is the shared, intra-layer (core-api-owned, same package)
 * helper every per-kind emit-time resolver calls to bake the agent's injected
 * filesystem list onto its request payload — the SAME precedent
 * `assembleSessionKnowledge`/`requireRunnableAgent` set (ordinary same-layer
 * DI where the calling package already owns the domain, plain Mechanism-C
 * injection where it doesn't). It reproduces `rowToFilesystem`'s exact
 * mapping (parsed `resourceRef`, same field set) so a caller baking this
 * output gets byte-for-byte the same shape the old seam route returned.
 */

import type { WriteExecutor } from "@hyperidle/db";
import { listFilesystems } from "./filesystem-registry.js";

/** One injected filesystem's provisioning-relevant fields — `resourceRef` already parsed, mirroring `routes/filesystems.ts`'s `rowToFilesystem`. */
export interface InjectedFilesystemForAgent {
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
 * Resolve every filesystem injected into `agentId` (`filesystem_injections`
 * joined to `filesystems`), in the exact shape the OLD
 * `GET /filesystems?agentUserId=` seam route returned. An agent with no
 * injections resolves `[]`, never a throw.
 */
export async function resolveInjectedFilesystemsForAgent(
	exec: WriteExecutor,
	agentId: string,
): Promise<readonly InjectedFilesystemForAgent[]> {
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
