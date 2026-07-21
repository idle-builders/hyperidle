/**
 * `filesystems` Service — sole module permitted to read or write
 * `filesystems`, `filesystem_injections`, `filesystem_captures`.
 *
 * AU20 R-filesystems: three list-variant methods collapsed into one
 * `listFilesystems(filter)`. Capture-store functions (`writeCapture`,
 * `listCaptures`, `FilesystemCaptureInput`) merged here from
 * `capture-store.ts` (deleted). All exports formerly on the separated module
 * now live here, removing the intra-package split between table owners.
 *
 * @lore AU20 R-filesystems: `FilesystemFilter.agentId` collapses the old
 * two-step `listFilesystemIdsByAgent` + `listFilesystemsByIds` into a single
 * JOIN query, returning full rows directly. Callers at the composition root
 * can still satisfy the old `SessionLifecycleFilesystemsReader` port shape by
 * wrapping `listFilesystems` — zero run-orchestration package change required.
 */
import {
	type FilesystemCaptureRow,
	type FilesystemInjectionRow,
	type FilesystemRow,
	filesystemCaptures,
	filesystemInjections,
	filesystems,
	type NewFilesystem,
	type NewFilesystemInjection,
	type WriteExecutor,
} from "@hyperidle/db";
import { and, eq, inArray } from "drizzle-orm";

export type {
	FilesystemCaptureRow,
	FilesystemInjectionRow,
	FilesystemRow,
	NewFilesystem,
	NewFilesystemInjection,
};

// ── Filter type ─────────────────────────────────────────────────────────────

/**
 * Unified filter for filesystem queries. At most one field is active per call.
 * New query shapes = new fields here, never new functions.
 */
export interface FilesystemFilter {
	readonly teamId?: string;
	readonly agentId?: string;
	readonly ids?: readonly string[];
}

// ── Capture input type (merged from capture-store.ts) ───────────────────────

/**
 * Input for persisting a filesystem capture row.
 *
 * @lore AO2: A capture is a filesystem op record, NOT an L3 Artifact. Kept
 * separate so AO3 can locate captures without touching the artifacts table.
 */
export interface FilesystemCaptureInput {
	readonly id: string;
	readonly sessionId: string;
	readonly filesystemId: string;
	readonly writeback: string;
	readonly capturePath: string;
	readonly commitSha?: string;
	readonly createdAt: string;
}

// ── filesystem CRUD ─────────────────────────────────────────────────────────

/** Insert a new filesystem registry row. */
export async function saveFilesystem(exec: WriteExecutor, values: NewFilesystem): Promise<void> {
	await exec.insert(filesystems).values(values);
}

/** Fetch one filesystem registry row by id. */
export async function getFilesystem(
	exec: WriteExecutor,
	id: string,
): Promise<FilesystemRow | undefined> {
	const [row] = await exec.select().from(filesystems).where(eq(filesystems.id, id)).limit(1);
	return row;
}

/**
 * Unified filesystem list. One filter field active at a time:
 *   teamId  → all filesystems for a team
 *   agentId → join filesystem_injections and return full rows for that agent
 *   ids     → filesystems with these exact ids
 *   (none)  → all filesystems (use with caution)
 */
export async function listFilesystems(
	exec: WriteExecutor,
	filter: FilesystemFilter,
): Promise<FilesystemRow[]> {
	if (filter.agentId != null) {
		// Single JOIN: filesystem_injections ⇒ filesystems, returns full rows.
		const joined = await exec
			.select({ filesystem: filesystems })
			.from(filesystemInjections)
			.innerJoin(filesystems, eq(filesystemInjections.filesystemId, filesystems.id))
			.where(eq(filesystemInjections.agentUserId, filter.agentId));
		return joined.map((r) => r.filesystem);
	}
	if (filter.ids != null) {
		if (filter.ids.length === 0) return [];
		return exec.select().from(filesystems).where(inArray(filesystems.id, filter.ids));
	}
	if (filter.teamId != null) {
		return exec.select().from(filesystems).where(eq(filesystems.teamId, filter.teamId));
	}
	return exec.select().from(filesystems);
}

/** Persist a reachability-state transition. */
export async function updateFilesystemState(
	exec: WriteExecutor,
	id: string,
	state: string,
): Promise<void> {
	await exec.update(filesystems).set({ state }).where(eq(filesystems.id, id));
}

/**
 * Delete a filesystem registration.
 * `filesystem_injections`/`filesystem_captures` cascade at the DB level.
 */
export async function deleteFilesystem(exec: WriteExecutor, id: string): Promise<void> {
	await exec.delete(filesystems).where(eq(filesystems.id, id));
}

// ── filesystem_injections CRUD ───────────────────────────────────────────────

/** Fetch one per-agent injection row (existence check). */
export async function getInjection(
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

/** Insert a per-agent filesystem injection row. */
export async function saveInjection(
	exec: WriteExecutor,
	values: NewFilesystemInjection,
): Promise<void> {
	await exec.insert(filesystemInjections).values(values);
}

/** Remove a per-agent filesystem injection row. */
export async function deleteInjection(
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

// ── filesystem_captures CRUD ─────────────────────────────────────────────────

/**
 * Persist a filesystem capture row. Idempotent-by-id (duplicate insert will
 * fail loudly — never silently dropped).
 *
 * @lore AO2: Called by RegistryFilesystemMounter.captureBack after the adapter
 * returns a successful capture result. AO3 reads this to locate the durable
 * artifact (bundle / snapshot dir).
 *
 * @lore AU20 R-filesystems: merged from capture-store.ts (deleted).
 * `writeFilesystemCapture` renamed to `writeCapture` for brevity.
 */
export async function writeCapture(
	exec: WriteExecutor,
	input: FilesystemCaptureInput,
): Promise<void> {
	await exec.insert(filesystemCaptures).values({
		id: input.id,
		sessionId: input.sessionId,
		filesystemId: input.filesystemId,
		writeback: input.writeback,
		capturePath: input.capturePath,
		commitSha: input.commitSha,
		createdAt: input.createdAt,
	});
}

/**
 * List filesystem capture rows. Used by AO3 to locate durable artifacts.
 * Ownership: `filesystem_captures` belongs exclusively to this service
 * (reads AND writes route here).
 */
export async function listCaptures(
	exec: WriteExecutor,
	filter: { sessionId?: string; filesystemId?: string },
): Promise<FilesystemCaptureRow[]> {
	const conditions = [];
	if (filter.sessionId != null) {
		conditions.push(eq(filesystemCaptures.sessionId, filter.sessionId));
	}
	if (filter.filesystemId != null) {
		conditions.push(eq(filesystemCaptures.filesystemId, filter.filesystemId));
	}
	if (conditions.length === 0) {
		return exec.select().from(filesystemCaptures);
	}
	return exec
		.select()
		.from(filesystemCaptures)
		.where(conditions.length === 1 ? conditions[0] : and(...conditions));
}
