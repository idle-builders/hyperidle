// AO1 — Hono router for /api/filesystems.
// Registry CRUD + per-bot injection wiring.
//
// @lore AU26 F2 (§D-A's placement rule + the founder's 2026-08-04 ruling): this
// module lives on `agent-orchestration`'s own app now, not core-api's — the
// same move E4 made for `/api/connections`. Once the `filesystem` knowledge
// scope was deleted, `filesystems` and `filesystem_injections` both became
// agent-orchestration-owned, so a route whose whole table set is those two has
// exactly one legal host and it is this Layer.
//
// **The paths do not change.** Both apps mount on the Application's one `/api`
// router, so `/api/filesystems`, `/api/filesystems/:id`,
// `/api/filesystems/inspect-path` and
// `/api/filesystems/:id/injections/:agentUserId` are byte-identical to before
// and `SettingsFilesystems.tsx` / `SettingsAgents.tsx` need no change at all.
//
// **One registration did NOT come with it:** `POST /:id/injections`. Its
// team-consistency gate reads `users` and `team_members` — core-api tables —
// so its table set is two-sided and §D-A rule 3 gives it exactly one legal
// host, core-api. It stays in `layers/core-api/src/routes/filesystems.ts`
// with the gate intact and delegates `saveInjection` downward, exactly as
// §D-I item 2 designs. Moving it would make this Layer read core-api state,
// which AU21 Decision L forbids with no carve-out.
//
// The middleware stack — cors, body limit, auth, fail-closed, `onError` — is
// Application-applied to that shared router and reaches this module unchanged.

import type { FilesystemRow, HyperIdleDb } from "@hyperidle/db";
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

/**
 * Structural port: the shape of the service-connection resolver this route
 * needs to build per-request token resolvers. Declared here so this module
 * does not import across the Layer boundary.
 *
 * @lore AU43: formerly exported from `@hyperidle/filesystems` as
 * `FilesystemsServiceConnectionResolver`; deleted there as a dead re-export,
 * declared inline here where it is the only consumer.
 */
export interface FilesystemsServiceConnectionResolver {
	resolve(userId: string, connectionId: string): Promise<string | null>;
}

import { type HyperIdleEnv, validateBody } from "@hyperidle/domain-model/http";
import { Hono } from "hono";
import { z } from "zod";
import { createGitRunner } from "../git-runner.js";

// ─── Validation schemas ───────────────────────────────────────────────────────

const codeRefSchema = z.object({
	kind: z.literal("code"),
	repo: z.string().min(1),
	branch: z.string().min(1),
});
const docSetRefSchema = z.object({ kind: z.literal("doc_set"), folder: z.string().min(1) });
const resourceRefSchema = z.discriminatedUnion("kind", [codeRefSchema, docSetRefSchema]);

/** Register body: `source` is NOT client-supplied — derived from the Connection (or 'local'). */
const registerFilesystemSchema = z.object({
	teamId: z.string().min(1),
	// Kind constrained to committed kinds at create time (SoRs rejected here).
	// @lore AU44 b2: inlined from FILESYSTEM_KINDS constant (dissolved with filesystem-contract).
	kind: z.enum(["code", "doc_set"]),
	connectionId: z.string().nullable().optional(),
	resourceRef: resourceRefSchema,
	// @lore AU44 b2: inlined from WRITEBACK_MODES constant (dissolved with filesystem-contract).
	writeback: z.enum(["git", "file", "none"]),
	// Optional hint: when the NoopAuthResolver can't derive source, the caller may supply it.
	// The route trusts it only when the resolver yields null (architecture §3, open Q7).
	sourceHint: z.string().optional(),
});

// ─── Row → wire mappers ───────────────────────────────────────────────────────

function rowToFilesystem(row: FilesystemRow): Filesystem {
	// resourceRef is always valid JSON — it is only written via JSON.stringify(validatedBody.resourceRef).
	// Letting parse throw here is correct: a corrupt row is a real error, not a silent code-repo fake.
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

// ─── Per-request resolver factory ─────────────────────────────────────────────

/**
 * Build the token resolver for a specific request.
 * When a real ServiceConnectionResolver is available, creates an inline adapter
 * that closes over the request userId. Falls back to a noop resolver.
 *
 * @lore AO1 v2: The resolver MUST be constructed per-request — it closes over userId.
 * A singleton would bind to one userId across all requests.
 *
 * @lore AU26 F1 (AU21 Decision J8, bounded co-move): this route used to
 * type-import `ServiceConnectionResolver` from `@hyperidle/connections`, which
 * AU26 E2/E3 made an `agent-orchestration` Service — a core-api Layer file
 * type-importing across the Layer boundary. It now names the structural port
 * `FilesystemsServiceConnectionResolver` (`@hyperidle/filesystems`' own
 * `ports.ts`), which the concrete resolver satisfies. Zero behaviour change:
 * the Layer still composes the real resolver downward at construction.
 */
function buildAuthResolver(
	connectionResolver: FilesystemsServiceConnectionResolver | undefined,
	userId: string,
): FilesystemTokenResolver {
	if (connectionResolver) {
		return {
			resolveToken: (connectionId: string) => connectionResolver.resolve(userId, connectionId),
		};
	}
	return {
		resolveToken: async (_connectionId: string) => null,
	};
}

// ─── Reachability helper (mutates stored state) ───────────────────────────────

/**
 * @lore AO1 v2: list = cached state; inspect/register = live probe.
 * Delegates to refreshFilesystemState (probe + persist in one call).
 */
async function checkAndPersistState(
	db: HyperIdleDb,
	row: FilesystemRow,
	authResolver: FilesystemTokenResolver,
): Promise<FilesystemRow> {
	return refreshFilesystemState(db, row, {
		authResolver,
		// AU26 A2/C1: `createGitRunner` comes from `@hyperidle/host-process`.
		gitRunnerFactory: createGitRunner,
	});
}

// ─── Extracted logic (BC5 architecture.md §6, T4) ─────────────────────────────
//
// The read/write bodies both this route and `AgentOrchestrationPort`'s
// `folders` family call, so the two doors can never drift. The HTTP routes
// below are unchanged behaviour, now calling these instead of inlining them.

/** `folders.list` — a team's own folders, or the folders given to one agent. */
export type ListFoldersQuery = { readonly teamId: string } | { readonly agentUserId: string };

export async function listFolders(db: HyperIdleDb, query: ListFoldersQuery): Promise<Filesystem[]> {
	const rows =
		"teamId" in query
			? await listFilesystems(db, { teamId: query.teamId })
			: await listFilesystems(db, { agentId: query.agentUserId });
	return rows.map(rowToFilesystem);
}

/** Mirrors today's `POST /filesystems` body, minus `teamId` — `folders.add` takes it separately. */
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

/**
 * `folders.add` — same insert + live-probe sequence `POST /` always ran.
 * `authResolver` defaults to the Noop resolver (no held-token probe): the
 * seam call carries no acting user to scope a per-user token lookup by, the
 * same fallback the route itself already takes when no resolver is wired.
 */
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

/** `folders.remove` — cascades `filesystem_injections` at the DB level, same as the route. */
export async function removeFolder(db: HyperIdleDb, id: string): Promise<RemoveFolderResult> {
	const existing = await getFilesystem(db, id);
	if (existing == null) return { ok: false, code: "NOT_FOUND" };
	await deleteFilesystem(db, id);
	return { ok: true };
}

/** `folders.take` — the eject a running agent's injection undoes. */
export async function takeFolder(
	db: HyperIdleDb,
	filesystemId: string,
	agentUserId: string,
): Promise<RemoveFolderResult> {
	const deleted = await deleteInjection(db, agentUserId, filesystemId);
	return deleted ? { ok: true } : { ok: false, code: "NOT_FOUND" };
}

// ─── createFilesystemRoutes ───────────────────────────────────────────────────

export function createFilesystemRoutes(
	db: HyperIdleDb,
	/**
	 * Pass the real ServiceConnectionResolver for per-request adapter construction.
	 * When absent (tests without AN1 resolver, non-db contexts), falls back to NoopAuthResolver.
	 *
	 * @lore AO1 v2: The resolver is passed at route-creation time, but the adapter
	 * is constructed PER REQUEST (inside the handler) because it closes over userId
	 * from c.get("userId"). A process-singleton adapter would bind to one userId — wrong.
	 */
	connectionResolver?: FilesystemsServiceConnectionResolver,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// ── POST /api/filesystems — Register a filesystem ──────────────────────────
	router.post("/", validateBody(registerFilesystemSchema), async (c) => {
		const body = c.req.valid("json");
		const userId = c.get("userId");
		const authResolver = buildAuthResolver(connectionResolver, userId);

		const result = await registerFolder(db, body.teamId, body, authResolver);
		if (!result.ok) {
			return c.json({ error: "Team not found", code: "NOT_FOUND" }, 404);
		}
		return c.json(result.folder, 201);
	});

	// ── POST /api/filesystems/inspect-path — Probe a local path before register ─
	// Separate route justified by codeRefSchema.branch.min(1): the caller must know
	// the branch BEFORE registering a `code` fs. Folding into POST / would require
	// loosening that schema. @lore AV1: reuses createGitRunner (currentBranch verb).
	router.post("/inspect-path", validateBody(z.object({ path: z.string().min(1) })), async (c) => {
		const { path } = c.req.valid("json");
		// AU26 A2/C1: `createGitRunner` comes from `@hyperidle/host-process`; the
		// `git-export` package it used to live in is deleted. See `@hyperidle/filesystems`'
		// `ports.ts` top `@lore`.
		const info = await inspectLocalPath(path, { gitRunnerFactory: createGitRunner });
		return c.json(info, 200);
	});

	// ── GET /api/filesystems?teamId= OR ?agentUserId= ─────────────────────────
	router.get("/", async (c) => {
		const teamId = c.req.query("teamId");
		const agentUserId = c.req.query("agentUserId");

		if (!(teamId || agentUserId)) {
			return c.json({ error: "Provide teamId or agentUserId", code: "INVALID_QUERY" }, 400);
		}
		if (teamId && agentUserId) {
			return c.json(
				{ error: "Provide only one of teamId or agentUserId", code: "INVALID_QUERY" },
				400,
			);
		}

		// LIST route: use STORED state (do NOT live-probe every row).
		// @lore AO1 v2: one ls-remote per list row makes team-list latency-bound on the forge.
		// The inspect (GET /:id) and register (POST /) paths trigger live probes.
		const folders = await listFolders(db, teamId ? { teamId } : { agentUserId: agentUserId ?? "" });
		return c.json({ filesystems: folders }, 200);
	});

	// ── GET /api/filesystems/:id — Inspect one filesystem ─────────────────────
	router.get("/:id", async (c) => {
		const id = c.req.param("id");
		const row = await getFilesystem(db, id);
		if (row == null) {
			return c.json({ error: "Filesystem not found", code: "NOT_FOUND" }, 404);
		}

		const userId = c.get("userId");
		const authResolver = buildAuthResolver(connectionResolver, userId);
		const refreshed = await checkAndPersistState(db, row, authResolver);
		return c.json(rowToFilesystem(refreshed), 200);
	});

	// ── DELETE /api/filesystems/:id — Remove registration (cascades injections) ─
	router.delete("/:id", async (c) => {
		const result = await removeFolder(db, c.req.param("id"));
		if (!result.ok) {
			return c.json({ error: "Filesystem not found", code: result.code }, 404);
		}
		return new Response(null, { status: 204 });
	});

	// ── DELETE /api/filesystems/:id/injections/:agentUserId — Eject ───────────
	router.delete("/:id/injections/:agentUserId", async (c) => {
		const result = await takeFolder(db, c.req.param("id"), c.req.param("agentUserId"));
		if (!result.ok) {
			return c.json({ error: "Injection not found", code: result.code }, 404);
		}
		return new Response(null, { status: 204 });
	});

	return router;
}
