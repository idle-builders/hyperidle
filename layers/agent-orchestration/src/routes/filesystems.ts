// AO1 — Hono router for /api/filesystems.
// Registry CRUD + per-bot injection wiring.
// Source of truth: plans/AO1/architecture.md §3 + §v2 (Reachability rework v2).
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

import type { HyperIdleDb } from "@hyperidle/db";
import {
	deleteFilesystem,
	deleteInjection,
	type FilesystemRow,
	type FilesystemsServiceConnectionResolver,
	getFilesystem,
	inspectLocalPath,
	listFilesystems,
	resolveFilesystemState,
	saveFilesystem,
	updateFilesystemState,
} from "@hyperidle/filesystems";
import type { Filesystem, FilesystemAuthResolver } from "@hyperidle/shared";
import { FILESYSTEM_KINDS, WRITEBACK_MODES } from "@hyperidle/shared";
import { createGitRunner } from "@hyperidle/shared/git";
import {
	createBodyLimit,
	type HyperIdleEnv,
	requireBoundary,
	validateBody,
} from "@hyperidle/shared/http";
import { Hono } from "hono";
import { z } from "zod";

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
	// Kind constrained to FILESYSTEM_KINDS at create time (SoRs rejected here).
	kind: z.enum(FILESYSTEM_KINDS),
	connectionId: z.string().nullable().optional(),
	resourceRef: resourceRefSchema,
	writeback: z.enum(WRITEBACK_MODES),
	// Optional hint: when the NoopAuthResolver can't derive source, the caller may supply it.
	// The route trusts it only when the resolver yields null (architecture §3, open Q7).
	sourceHint: z.string().optional(),
});

const FILESYSTEM_BODY_LIMIT = { maxSize: 8 * 1024 }; // 8 KB (resourceRef is tiny)

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
 * Build the FilesystemAuthResolver for a specific request.
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
 *
 * @lore AU20 R-filesystems: NoopAuthResolver and ServiceConnectionResolverAdapter
 * classes deleted from @hyperidle/filesystems barrel — caller-site inline objects
 * satisfy the structural FilesystemAuthResolver interface from @hyperidle/shared.
 * ServiceConnectionResolver.resolve(userId, connectionId) is the only plaintext
 * path; sourceOf always returns null (service name derivation not needed here —
 * falls through to body.sourceHint ?? "unknown").
 */
function buildAuthResolver(
	connectionResolver: FilesystemsServiceConnectionResolver | undefined,
	userId: string,
): FilesystemAuthResolver {
	if (connectionResolver) {
		return {
			canResolve: async (connectionId: string) =>
				(await connectionResolver.resolve(userId, connectionId)) != null,
			sourceOf: (_connectionId: string) => null,
			resolve: async (_connectionId: string) => null,
			resolveToken: (connectionId: string) => connectionResolver.resolve(userId, connectionId),
		};
	}
	return {
		canResolve: (_connectionId: string) => false,
		sourceOf: (_connectionId: string) => null,
		resolve: async (_connectionId: string) => null,
		resolveToken: async (_connectionId: string) => null,
	};
}

// ─── Reachability helper (mutates stored state) ───────────────────────────────

/**
 * Run a live reachability probe and persist any state transition.
 * Only call this on single-row paths (GET /:id, POST register).
 * The LIST route MUST NOT call this — use stored state only (perf constraint:
 * one ls-remote per list row makes team-list latency-bound on the forge).
 *
 * @lore AO1 v2: list = cached state; inspect/register = live probe.
 */
async function checkAndPersistState(
	db: HyperIdleDb,
	row: FilesystemRow,
	authResolver: FilesystemAuthResolver,
): Promise<FilesystemRow> {
	const newState = await resolveFilesystemState(row, {
		authResolver,
		// AU26 A2/C1: `createGitRunner` comes from `@hyperidle/shared/git`; the
		// `git-export` package it used to live in is deleted. Closes `filesystems`' Increment 2b
		// `FilesystemsGitRunnerFactory` forward-reference. See
		// `@hyperidle/filesystems`' `ports.ts` top `@lore`.
		gitRunnerFactory: createGitRunner,
	});
	if (newState !== row.state) {
		await updateFilesystemState(db, row.id, newState);
		return { ...row, state: newState };
	}
	return row;
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
	router.post(
		"/",
		requireBoundary({ kind: "public-data" }),
		createBodyLimit(FILESYSTEM_BODY_LIMIT),
		validateBody(registerFilesystemSchema),
		async (c) => {
			const body = c.req.valid("json");
			const userId = c.get("userId");
			const authResolver = buildAuthResolver(connectionResolver, userId);

			// Derive source from the Connection (via resolver) or fallback.
			// NOTE: teamId FK validation is handled in the insert catch below (→ 404 on FK violation).
			// The old "FK guard before insert" block was a dead no-op — see M1 in the AO1 review.
			const connectionId = body.connectionId ?? null;
			let source: string;
			if (connectionId == null) {
				source = "local";
			} else {
				const derived = await authResolver.sourceOf(connectionId);
				source = derived ?? body.sourceHint ?? "unknown";
			}

			const id = crypto.randomUUID();
			const now = new Date().toISOString();

			// Insert with 'attached' state — probe below will update if different.
			try {
				await saveFilesystem(db, {
					id,
					teamId: body.teamId,
					source,
					kind: body.kind,
					connectionId,
					resourceRef: JSON.stringify(body.resourceRef),
					writeback: body.writeback,
					state: "attached",
					createdAt: now,
				});
			} catch (err) {
				// FK violation on teamId → 404
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
					return c.json({ error: "Team not found", code: "NOT_FOUND" }, 404);
				}
				throw err;
			}

			// Row must exist — we just inserted it.
			const inserted = await getFilesystem(db, id);
			if (inserted == null) throw new Error("Filesystem disappeared after insert");

			// Run live probe on register — persists result, returns the updated row.
			// @lore AO1 v2: probe on register so the caller gets the real initial state.
			const probed = await checkAndPersistState(db, inserted, authResolver);
			return c.json(rowToFilesystem(probed), 201);
		},
	);

	// ── POST /api/filesystems/inspect-path — Probe a local path before register ─
	// Separate route justified by codeRefSchema.branch.min(1): the caller must know
	// the branch BEFORE registering a `code` fs. Folding into POST / would require
	// loosening that schema. @lore AV1: reuses createGitRunner (currentBranch verb).
	router.post(
		"/inspect-path",
		requireBoundary({ kind: "public-data" }),
		createBodyLimit(FILESYSTEM_BODY_LIMIT),
		validateBody(z.object({ path: z.string().min(1) })),
		async (c) => {
			const { path } = c.req.valid("json");
			// AU26 A2/C1: `createGitRunner` comes from `@hyperidle/shared/git`; the
			// `git-export` package it used to live in is deleted. See `@hyperidle/filesystems`'
			// `ports.ts` top `@lore`.
			const info = await inspectLocalPath(path, { gitRunnerFactory: createGitRunner });
			return c.json(info, 200);
		},
	);

	// ── GET /api/filesystems?teamId= OR ?agentUserId= ─────────────────────────
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
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

		let rows: FilesystemRow[];

		if (teamId) {
			rows = await listFilesystems(db, { teamId });
		} else {
			// agentUserId: join filesystem_injections → filesystems in one query.
			// @lore AU20 R-filesystems: listFilesystems({agentId}) replaces the old
			// two-step listFilesystemIdsByAgent + listFilesystemsByIds with a single
			// innerJoin query, returning [] naturally when no injections exist.
			rows = await listFilesystems(db, { agentId: agentUserId ?? "" });
		}

		// LIST route: use STORED state (do NOT live-probe every row).
		// @lore AO1 v2: one ls-remote per list row makes team-list latency-bound on the forge.
		// The inspect (GET /:id) and register (POST /) paths trigger live probes.
		return c.json({ filesystems: rows.map(rowToFilesystem) }, 200);
	});

	// ── GET /api/filesystems/:id — Inspect one filesystem ─────────────────────
	router.get("/:id", requireBoundary({ kind: "public-data" }), async (c) => {
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
	router.delete("/:id", requireBoundary({ kind: "public-data" }), async (c) => {
		const id = c.req.param("id");

		// Check exists first
		const existing = await getFilesystem(db, id);
		if (existing == null) {
			return c.json({ error: "Filesystem not found", code: "NOT_FOUND" }, 404);
		}

		// CASCADE on filesystem_injections is DB-level (onDelete: cascade).
		await deleteFilesystem(db, id);
		return new Response(null, { status: 204 });
	});

	// ── DELETE /api/filesystems/:id/injections/:agentUserId — Eject ───────────
	router.delete(
		"/:id/injections/:agentUserId",
		requireBoundary({ kind: "public-data" }),
		async (c) => {
			const fsId = c.req.param("id");
			const agentUserId = c.req.param("agentUserId");

			const deleted = await deleteInjection(db, agentUserId, fsId);
			if (!deleted) {
				return c.json({ error: "Injection not found", code: "NOT_FOUND" }, 404);
			}

			return new Response(null, { status: 204 });
		},
	);

	return router;
}
