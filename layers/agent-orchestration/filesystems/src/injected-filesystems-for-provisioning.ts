/**
 * AU26 F2 — the session-launch-time injected-filesystem read, in-layer.
 *
 * This replaces AU21 §9 Increment 12's bake-at-emit mechanism outright. That
 * bake froze the agent's injected-filesystem list onto every emitted intent,
 * because `filesystems` / `filesystem_injections` still lived in core-api and
 * `run-orchestration` was forbidden to read them. The snapshot went stale
 * between emit and drain: a filesystem assigned to the agent in that window
 * never reached the sandbox, silently.
 *
 * The founder's 2026-08-04 ruling ("remove that knowledge filesystem scope and
 * move the filesystem completely to the orchestration") moved the record into
 * this Layer, so the spawn reads it live and the staleness window closes —
 * exactly what E3 did for held connections, proved with the same shape of test
 * (`filesystems-added-after-emit.integration.test.ts`).
 *
 * @lore AU26 F2: taking an `agentId` is NOT a core-api read. It arrives on the
 * drained request, which core put there. Orchestration stays a blind,
 * request-driven executor — it is TOLD which agent is spawning, then reads its
 * OWN two tables to answer "what does that agent get mounted". Contrast E3's
 * connections reader, which takes nothing at all because a held connection
 * carries its own owner.
 */

import type { WriteExecutor } from "@hyperidle/db";
import { listFilesystems } from "./filesystem-registry.js";

/**
 * One injected filesystem's provisioning-relevant fields — `resourceRef`
 * already parsed, mirroring `routes/filesystems.ts`'s `rowToFilesystem` so the
 * mount step sees exactly the shape it has always seen.
 */
export interface InjectedFilesystemForProvisioning {
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
 * Read every filesystem injected into `agentId` (`filesystem_injections` joined
 * to `filesystems`), live, for one session spawn. Both tables are this Layer's
 * own since F2, so the join stays a single query — the two-owner decomposition
 * §D-I anticipated never has to happen.
 *
 * An agent with no injections resolves `[]`, never a throw.
 */
export async function listInjectedFilesystemsForProvisioning(
	exec: WriteExecutor,
	agentId: string,
): Promise<readonly InjectedFilesystemForProvisioning[]> {
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
