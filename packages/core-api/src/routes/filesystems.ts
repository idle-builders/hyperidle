// AO1 — Hono router for /api/filesystems.
// Registry CRUD + per-bot injection wiring.
// Source of truth: plans/AO1/architecture.md §3 + §v2 (Reachability rework v2).

import * as crypto from "node:crypto";
import type { ServiceConnectionResolver } from "@hyperidle/connections";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	deleteFilesystemById,
	deleteFilesystemInjection,
	type FilesystemInjectionRow,
	type FilesystemRow,
	getFilesystemById,
	getFilesystemInjection,
	insertFilesystem,
	insertFilesystemInjection,
	inspectLocalPath,
	listFilesystemIdsByAgent,
	listFilesystemsByIds,
	listFilesystemsByTeamId,
	NoopAuthResolver,
	resolveFilesystemState,
	ServiceConnectionResolverAdapter,
	updateFilesystemState,
} from "@hyperidle/filesystems";
import { createGitRunner } from "@hyperidle/git-export";
import { getTeamMembersById } from "@hyperidle/org";
import type {
	EventBus,
	Filesystem,
	FilesystemAuthResolver,
	FilesystemInjection,
} from "@hyperidle/shared";
import { FILESYSTEM_KINDS, WRITEBACK_MODES } from "@hyperidle/shared";
import { getUserById } from "@hyperidle/users";
import { Hono } from "hono";
import { z } from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { createBodyLimit } from "../middleware/body-limit.js";
import { validateBody } from "../middleware/validate.js";

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

const injectFilesystemSchema = z.object({
	agentUserId: z.string().min(1),
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

function rowToInjection(row: FilesystemInjectionRow): FilesystemInjection {
	return {
		agentUserId: row.agentUserId,
		filesystemId: row.filesystemId,
		createdAt: row.createdAt,
	};
}

// ─── Per-request resolver factory ─────────────────────────────────────────────

/**
 * Build the FilesystemAuthResolver for a specific request.
 * When a real ServiceConnectionResolver is available, wraps it in the adapter
 * (which closes over the request userId). Falls back to NoopAuthResolver.
 *
 * @lore AO1 v2: The adapter MUST be constructed per-request — it closes over userId.
 * A singleton would bind to one userId across all requests.
 */
function buildAuthResolver(
	connectionResolver: ServiceConnectionResolver | undefined,
	userId: string,
): FilesystemAuthResolver {
	if (connectionResolver) {
		return new ServiceConnectionResolverAdapter(connectionResolver, userId);
	}
	return new NoopAuthResolver();
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
		// AU19 Increment 2c: `git-export` migrated — `createGitRunner` now
		// comes from `@hyperidle/git-export`, closing `filesystems`' Increment 2b
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
	_eventBus?: EventBus,
	/**
	 * Pass the real ServiceConnectionResolver for per-request adapter construction.
	 * When absent (tests without AN1 resolver, non-db contexts), falls back to NoopAuthResolver.
	 *
	 * @lore AO1 v2: The resolver is passed at route-creation time, but the adapter
	 * is constructed PER REQUEST (inside the handler) because it closes over userId
	 * from c.get("userId"). A process-singleton adapter would bind to one userId — wrong.
	 */
	connectionResolver?: ServiceConnectionResolver,
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
				await insertFilesystem(db, {
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
			const inserted = await getFilesystemById(db, id);
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
			// AU19 Increment 2c: `git-export` migrated — `createGitRunner` now
			// comes from `@hyperidle/git-export`. See `@hyperidle/filesystems`'
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
			rows = await listFilesystemsByTeamId(db, teamId);
		} else {
			// agentUserId: join filesystem_injections → filesystems
			// agentUserId is non-null here (we checked !(teamId || agentUserId) above and teamId is null in this branch)
			const fsIds = await listFilesystemIdsByAgent(db, agentUserId ?? "");

			if (fsIds.length === 0) {
				return c.json({ filesystems: [] }, 200);
			}

			rows = await listFilesystemsByIds(db, fsIds);
		}

		// LIST route: use STORED state (do NOT live-probe every row).
		// @lore AO1 v2: one ls-remote per list row makes team-list latency-bound on the forge.
		// The inspect (GET /:id) and register (POST /) paths trigger live probes.
		return c.json({ filesystems: rows.map(rowToFilesystem) }, 200);
	});

	// ── GET /api/filesystems/:id — Inspect one filesystem ─────────────────────
	router.get("/:id", requireBoundary({ kind: "public-data" }), async (c) => {
		const id = c.req.param("id");
		const row = await getFilesystemById(db, id);
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
		const existing = await getFilesystemById(db, id);
		if (existing == null) {
			return c.json({ error: "Filesystem not found", code: "NOT_FOUND" }, 404);
		}

		// CASCADE on filesystem_injections is DB-level (onDelete: cascade).
		await deleteFilesystemById(db, id);
		return new Response(null, { status: 204 });
	});

	// ── POST /api/filesystems/:id/injections — Inject filesystem into a bot ───
	router.post(
		"/:id/injections",
		requireBoundary({ kind: "public-data" }),
		createBodyLimit(FILESYSTEM_BODY_LIMIT),
		validateBody(injectFilesystemSchema),
		async (c) => {
			const fsId = c.req.param("id");
			const body = c.req.valid("json");

			// Check filesystem exists
			const fs = await getFilesystemById(db, fsId);
			if (fs == null) {
				return c.json({ error: "Filesystem not found", code: "NOT_FOUND" }, 404);
			}

			// Check agent exists
			const agent = await getUserById(db, body.agentUserId);
			if (agent == null) {
				return c.json({ error: "Agent user not found", code: "NOT_FOUND" }, 404);
			}

			// Team-consistency check: the bot's team must match the filesystem's teamId.
			// The bot's teamId points at team_members.id (schema.ts:47); we need the teams.id.
			// @lore AO1 §3: Route-level guard — no DB-level cross-table CHECK constraint.
			if (agent.teamId != null) {
				const tmRow = await getTeamMembersById(db, agent.teamId);
				const agentActualTeamId = tmRow?.teamId ?? null;
				if (agentActualTeamId !== fs.teamId) {
					return c.json(
						{ error: "Agent team does not match filesystem team", code: "TEAM_MISMATCH" },
						400,
					);
				}
			} else {
				// Bot has no team assignment — can't inject into a team-scoped filesystem.
				return c.json({ error: "Agent user has no team assignment", code: "TEAM_MISMATCH" }, 400);
			}

			const now = new Date().toISOString();

			try {
				await insertFilesystemInjection(db, {
					agentUserId: body.agentUserId,
					filesystemId: fsId,
					createdAt: now,
				});
			} catch (err) {
				// UNIQUE constraint violation (composite PK already exists) → 409
				// @lore drizzle-orm 0.45.2: wraps PGlite errors — walk cause chain to find constraint message.
				const constraintMsg = (e: unknown): string => {
					if (!(e instanceof Error)) return String(e);
					const own = e.message.toLowerCase();
					if (
						e.message.includes("filesystem_injections_agent_user_id_filesystem_id_pk") ||
						own.includes("duplicate key") ||
						own.includes("unique constraint")
					)
						return e.message;
					return e.cause !== undefined ? constraintMsg(e.cause) : e.message;
				};
				const msg = constraintMsg(err);
				if (
					msg.includes("filesystem_injections_agent_user_id_filesystem_id_pk") ||
					msg.toLowerCase().includes("duplicate key") ||
					msg.toLowerCase().includes("unique constraint")
				) {
					return c.json({ error: "Already injected", code: "CONFLICT" }, 409);
				}
				throw err;
			}

			// injected is defined — we just inserted it.
			const inserted2 = await getFilesystemInjection(db, body.agentUserId, fsId);
			if (inserted2 == null) throw new Error("Injection disappeared after insert");
			return c.json(rowToInjection(inserted2), 201);
		},
	);

	// ── DELETE /api/filesystems/:id/injections/:agentUserId — Eject ───────────
	router.delete(
		"/:id/injections/:agentUserId",
		requireBoundary({ kind: "public-data" }),
		async (c) => {
			const fsId = c.req.param("id");
			const agentUserId = c.req.param("agentUserId");

			const existing = await getFilesystemInjection(db, agentUserId, fsId);
			if (existing == null) {
				return c.json({ error: "Injection not found", code: "NOT_FOUND" }, 404);
			}

			await deleteFilesystemInjection(db, agentUserId, fsId);

			return new Response(null, { status: 204 });
		},
	);

	return router;
}
