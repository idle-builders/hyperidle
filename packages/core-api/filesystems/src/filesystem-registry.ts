/**
 * `filesystems` Service — the only module permitted to read or write
 * `filesystems`, `filesystem_injections`. Every real call site (previously
 * inline raw Drizzle queries in `packages/server/src/routes/filesystems.ts`,
 * `routes/knowledge.ts`, `services/session-provisioning.ts`) now routes
 * through one of these functions instead of a direct
 * `insert`/`update`/`delete`/`select` against the table objects.
 *
 * Mirrors `routine-service.ts`'s style / `WriteExecutor` executor-first param
 * (reused for reads too, same idiom).
 *
 * @lore AU19 Increment 2b: architecture §4 marked `filesystems` `⛁*`
 * ("confirm at migration") and listed only `filesystem/*`,
 * `services/file-watcher.ts`, `filesystem-reachability.ts`,
 * `inspect-local-path.ts`, `dependency-watcher.ts` as seed files — none of
 * which touch the `filesystems`/`filesystem_injections` tables (only
 * `capture-store.ts` does, for the separate `filesystem_captures` table).
 * The real CRUD for the registry tables lived inline in
 * `routes/filesystems.ts` (never factored into a seed file the way every
 * other Service's owned-table CRUD was — a seed-file gap, not a new edge).
 * Confirmed via repo-wide grep: `filesystems`/`filesystemInjections` are
 * genuinely this Service's tables (the `⛁*` marker's own name match), with
 * exactly three foreign-package consumers, all now converted. This file is
 * the missing registry layer; `TABLE_OWNER` rows added in
 * `scripts/table-ownership-guard.ts` for both tables.
 */
import {
	type FilesystemInjectionRow,
	type FilesystemRow,
	filesystemInjections,
	filesystems,
	type NewFilesystem,
	type NewFilesystemInjection,
	type WriteExecutor,
} from "@hyperidle/db";
import { and, eq, inArray } from "drizzle-orm";

export type { FilesystemInjectionRow, FilesystemRow, NewFilesystem, NewFilesystemInjection };

/** Insert a new filesystem registry row. */
export async function insertFilesystem(exec: WriteExecutor, values: NewFilesystem): Promise<void> {
	await exec.insert(filesystems).values(values);
}

/** Fetch one filesystem registry row by id. */
export async function getFilesystemById(
	exec: WriteExecutor,
	id: string,
): Promise<FilesystemRow | undefined> {
	const [row] = await exec.select().from(filesystems).where(eq(filesystems.id, id)).limit(1);
	return row;
}

/** List every filesystem registered for a team. */
export async function listFilesystemsByTeamId(
	exec: WriteExecutor,
	teamId: string,
): Promise<FilesystemRow[]> {
	return exec.select().from(filesystems).where(eq(filesystems.teamId, teamId));
}

/** List every filesystem row whose id is in `ids`. */
export async function listFilesystemsByIds(
	exec: WriteExecutor,
	ids: readonly string[],
): Promise<FilesystemRow[]> {
	if (ids.length === 0) return [];
	return exec.select().from(filesystems).where(inArray(filesystems.id, ids));
}

/** Persist a reachability-state transition (AO1 inspect/register live probe). */
export async function updateFilesystemState(
	exec: WriteExecutor,
	id: string,
	state: string,
): Promise<void> {
	await exec.update(filesystems).set({ state }).where(eq(filesystems.id, id));
}

/** Delete a filesystem registration. `filesystem_injections`/`filesystem_captures` cascade at the DB level. */
export async function deleteFilesystemById(exec: WriteExecutor, id: string): Promise<void> {
	await exec.delete(filesystems).where(eq(filesystems.id, id));
}

/** List the filesystem ids injected into a given agent. */
export async function listFilesystemIdsByAgent(
	exec: WriteExecutor,
	agentUserId: string,
): Promise<string[]> {
	const rows = await exec
		.select({ filesystemId: filesystemInjections.filesystemId })
		.from(filesystemInjections)
		.where(eq(filesystemInjections.agentUserId, agentUserId));
	return rows.map((r) => r.filesystemId);
}

/** Fetch one per-bot injection row (existence check). */
export async function getFilesystemInjection(
	exec: WriteExecutor,
	agentUserId: string,
	filesystemId: string,
): Promise<FilesystemInjectionRow | undefined> {
	const [row] = await exec
		.select()
		.from(filesystemInjections)
		.where(
			and(
				eq(filesystemInjections.agentUserId, agentUserId),
				eq(filesystemInjections.filesystemId, filesystemId),
			),
		)
		.limit(1);
	return row;
}

/** Insert a per-bot filesystem injection row. */
export async function insertFilesystemInjection(
	exec: WriteExecutor,
	values: NewFilesystemInjection,
): Promise<void> {
	await exec.insert(filesystemInjections).values(values);
}

/** Remove a per-bot filesystem injection row. */
export async function deleteFilesystemInjection(
	exec: WriteExecutor,
	agentUserId: string,
	filesystemId: string,
): Promise<void> {
	await exec
		.delete(filesystemInjections)
		.where(
			and(
				eq(filesystemInjections.agentUserId, agentUserId),
				eq(filesystemInjections.filesystemId, filesystemId),
			),
		);
}
