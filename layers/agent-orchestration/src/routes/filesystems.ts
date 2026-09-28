// /api/filesystems — one plumbing route: `POST /inspect-path`.
// The rest of the folder logic is called directly by `AgentOrchestrationPort`'s folder seam.

import type { FilesystemRow, HyperIdleDb } from "@hyperidle/db";
import { type HyperIdleEnv, validateBody } from "@hyperidle/domain-model/http";
import type { Filesystem } from "@hyperidle/filesystems";
import {
	deleteFilesystem,
	deleteInjection,
	type FilesystemTokenResolver,
	getFilesystem,
	inspectLocalPath,
	listFilesystems,
	refreshFilesystemState,
	saveFilesystem,
} from "@hyperidle/filesystems";
import { Hono } from "hono";
import { z } from "zod";
import { createGitRunner } from "../git-runner.js";

// ─── Row → wire mappers ───────────────────────────────────────────────────────

function rowToFilesystem(row: FilesystemRow): Filesystem {
	// resourceRef is always valid JSON (only written via JSON.stringify); letting parse throw on corruption is correct.
	const resourceRef = JSON.parse(row.resourceRef) as Filesystem["resourceRef"];

	return {
		id: row.id,
		teamId: row.teamId,
		source: row.source as Filesystem["source"],
		kind: row.kind as Filesystem["kind"],
		connectionId: row.connectionId ?? null,
		resourceRef,
		writeback: row.writeback as Filesystem["writeback"],
		state: row.state as Filesystem["state"],
		createdAt: row.createdAt,
	};
}

// ─── Reachability helper (mutates stored state) ───────────────────────────────

// list = cached state; inspect/register = live probe; delegates to refreshFilesystemState.
function checkAndPersistState(
	db: HyperIdleDb,
	row: FilesystemRow,
	authResolver: FilesystemTokenResolver,
): Promise<FilesystemRow> {
	return refreshFilesystemState(db, row, {
		authResolver,
		// `createGitRunner` comes from `@hyperidle/host-process`.
		gitRunnerFactory: createGitRunner,
	});
}

// ─── Extracted logic — called through `AgentOrchestrationPort`'s folder seam ────────────────

// `folders.list` — a team's own folders, or the folders given to one agent.
export type ListFoldersQuery = { readonly teamId: string } | { readonly agentUserId: string };

export async function listFolders(db: HyperIdleDb, query: ListFoldersQuery): Promise<Filesystem[]> {
	const rows =
		"teamId" in query
			? await listFilesystems(db, { teamId: query.teamId })
			: await listFilesystems(db, { agentId: query.agentUserId });
	return rows.map(rowToFilesystem);
}

/** Mirrors `edit_user`'s `folders.add` body, minus `teamId` — that is taken separately. */
export interface RegisterFolderInput {
	readonly kind: "code" | "doc_set";
	readonly connectionId?: string | null;
	readonly resourceRef: Filesystem["resourceRef"];
	readonly writeback: "git" | "file" | "none";
	readonly sourceHint?: string;
}

export type RegisterFolderResult =
	| { readonly ok: true; readonly folder: Filesystem }
	| { readonly ok: false; readonly code: "TEAM_NOT_FOUND" };

// `folders.add` — insert + live-probe. authResolver defaults to Noop (seam call has no acting user).
export async function registerFolder(
	db: HyperIdleDb,
	teamId: string,
	body: RegisterFolderInput,
	authResolver: FilesystemTokenResolver = { resolveToken: async () => null },
): Promise<RegisterFolderResult> {
	const connectionId = body.connectionId ?? null;
	const source = connectionId == null ? "local" : (body.sourceHint ?? "unknown");
	const id = crypto.randomUUID();
	const now = new Date().toISOString();

	try {
		await saveFilesystem(db, {
			id,
			teamId,
			source,
			kind: body.kind,
			connectionId,
			resourceRef: JSON.stringify(body.resourceRef),
			writeback: body.writeback,
			state: "attached",
			createdAt: now,
		});
	} catch (err) {
		// @lore drizzle-orm 0.45.2: wraps PGlite errors — walk cause chain to find FK message.
		const errMsg = (e: unknown): string => {
			if (!(e instanceof Error)) return String(e);
			const own = e.message;
			if (own.includes("filesystems_team_id_teams_id_fk") || own.includes("foreign key"))
				return own;
			return e.cause !== undefined ? errMsg(e.cause) : own;
		};
		const msg = errMsg(err);
		if (msg.includes("filesystems_team_id_teams_id_fk") || msg.includes("foreign key")) {
			return { ok: false, code: "TEAM_NOT_FOUND" };
		}
		throw err;
	}

	const inserted = await getFilesystem(db, id);
	if (inserted == null) throw new Error("Filesystem disappeared after insert");

	const probed = await checkAndPersistState(db, inserted, authResolver);
	return { ok: true, folder: rowToFilesystem(probed) };
}

export type RemoveFolderResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly code: "NOT_FOUND" };

// `folders.remove` — cascades filesystem_injections at the DB level.
export async function removeFolder(db: HyperIdleDb, id: string): Promise<RemoveFolderResult> {
	const existing = await getFilesystem(db, id);
	if (existing == null) return { ok: false, code: "NOT_FOUND" };
	await deleteFilesystem(db, id);
	return { ok: true };
}

// `folders.take` — ejects a running agent's injection.
export async function takeFolder(
	db: HyperIdleDb,
	filesystemId: string,
	agentUserId: string,
): Promise<RemoveFolderResult> {
	const deleted = await deleteInjection(db, agentUserId, filesystemId);
	return deleted ? { ok: true } : { ok: false, code: "NOT_FOUND" };
}

// ─── createFilesystemRoutes ───────────────────────────────────────────────────

export function createFilesystemRoutes(): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// POST /api/filesystems/inspect-path — probe a local path before adding it as a folder
	router.post("/inspect-path", validateBody(z.object({ path: z.string().min(1) })), async (c) => {
		const { path } = c.req.valid("json");
		const info = await inspectLocalPath(path, { gitRunnerFactory: createGitRunner });
		return c.json(info, 200);
	});

	return router;
}
