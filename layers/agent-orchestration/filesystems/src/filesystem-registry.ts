import {
	type FilesystemRow,
	filesystemInjections,
	filesystems,
	type NewFilesystem,
	type NewFilesystemInjection,
	type WriteExecutor,
} from "@hyperidle/db";
import { and, eq } from "drizzle-orm";

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

export async function updateFilesystemState(
	exec: WriteExecutor,
	id: string,
	state: string,
): Promise<void> {
	await exec.update(filesystems).set({ state }).where(eq(filesystems.id, id));
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
