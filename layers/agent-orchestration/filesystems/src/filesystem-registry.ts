import {
	type FilesystemRow,
	filesystemInjections,
	filesystems,
	type NewFilesystem,
	type NewFilesystemInjection,
	type WriteExecutor,
} from "@hyperidle/db";
import { and, eq, ne } from "drizzle-orm";

export interface FilesystemFilter {
	readonly teamId?: string;
	readonly agentId?: string;
}

export async function saveFilesystem(exec: WriteExecutor, values: NewFilesystem): Promise<void> {
	await exec.insert(filesystems).values(values);
}

export async function getFilesystem(
	exec: WriteExecutor,
	id: string,
): Promise<FilesystemRow | undefined> {
	const [row] = await exec.select().from(filesystems).where(eq(filesystems.id, id)).limit(1);
	return row;
}

export async function listFilesystems(
	exec: WriteExecutor,
	filter: FilesystemFilter,
): Promise<FilesystemRow[]> {
	if (filter.agentId != null) {
		const joined = await exec
			.select({ filesystem: filesystems })
			.from(filesystemInjections)
			.innerJoin(filesystems, eq(filesystemInjections.filesystemId, filesystems.id))
			.where(eq(filesystemInjections.agentUserId, filter.agentId));
		return joined.map((r) => r.filesystem);
	}
	if (filter.teamId != null) {
		return exec.select().from(filesystems).where(eq(filesystems.teamId, filter.teamId));
	}
	return exec.select().from(filesystems);
}

/**
 * Mark a filesystem `needs_attention`, whatever the cause (a placement
 * failure, a failing Check, a failing check at registration). The `WHERE
 * state<>'needs_attention'` clause is the once-per-episode guarantee (BA5
 * §4.5): a row returns only on the transition INTO the state, and only then
 * does the caller know to publish the notice. A failure on a row already
 * there only refreshes the reason — same shape, no row back, `entered:false`.
 * Returns `null` when the filesystem does not exist.
 */
export async function markFilesystemNeedsAttention(
	exec: WriteExecutor,
	id: string,
	reason: string,
): Promise<{ entered: boolean; agentIds: string[] } | null> {
	const entering = await exec
		.update(filesystems)
		.set({ state: "needs_attention", attentionReason: reason })
		.where(and(eq(filesystems.id, id), ne(filesystems.state, "needs_attention")))
		.returning({ id: filesystems.id });

	if (entering.length > 0) {
		const injected = await exec
			.select({ agentUserId: filesystemInjections.agentUserId })
			.from(filesystemInjections)
			.where(eq(filesystemInjections.filesystemId, id));
		return { entered: true, agentIds: injected.map((row) => row.agentUserId) };
	}

	const refreshed = await exec
		.update(filesystems)
		.set({ attentionReason: reason })
		.where(eq(filesystems.id, id))
		.returning({ id: filesystems.id });
	if (refreshed.length === 0) return null;
	return { entered: false, agentIds: [] };
}

/** Check passed: leave `needs_attention` (or confirm `reachable` again). Clears the reason. */
export async function markFilesystemReachable(exec: WriteExecutor, id: string): Promise<void> {
	await exec
		.update(filesystems)
		.set({ state: "reachable", attentionReason: null })
		.where(eq(filesystems.id, id));
}

export async function deleteFilesystem(exec: WriteExecutor, id: string): Promise<void> {
	await exec.delete(filesystems).where(eq(filesystems.id, id));
}

export async function saveInjection(
	exec: WriteExecutor,
	values: NewFilesystemInjection,
): Promise<void> {
	await exec.insert(filesystemInjections).values(values);
}

export async function deleteInjection(
	exec: WriteExecutor,
	agentUserId: string,
	filesystemId: string,
): Promise<boolean> {
	const deleted = await exec
		.delete(filesystemInjections)
		.where(
			and(
				eq(filesystemInjections.agentUserId, agentUserId),
				eq(filesystemInjections.filesystemId, filesystemId),
			),
		)
		.returning({ agentUserId: filesystemInjections.agentUserId });
	return deleted.length > 0;
}
