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
// **The paths do not change** except one: `GET /:id` is deleted
// — its only job was the live reachability probe, which is gone with the
// write-back axis. `/api/filesystems`, `/api/filesystems/inspect-path` and
// `/api/filesystems/:id/injections/:agentUserId` are byte-identical to
// before.
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
//
// @lore BA5 §2.7/§7/§12 (L4): the old live reachability probe
// (`refreshFilesystemState`/`checkAndPersistState`, the per-request
// `buildAuthResolver`, `sourceHint`) is replaced wholesale by `checkFilesystem`
// (`@hyperidle/run-orchestration`) — run once on registration and again on
// demand through the new `POST /:id/check`. Both write through
// `recordFilesystemNeedsAttention`/`markFilesystemReachable`, never a direct
// state write here.

import type { FilesystemRow, HyperIdleDb } from "@hyperidle/db";
import { type HyperIdleEnv, validateBody } from "@hyperidle/domain-model/http";
import type { EventBus } from "@hyperidle/event-bus";
import type { Filesystem } from "@hyperidle/filesystems";
import {
	deleteFilesystem,
	deleteInjection,
	getFilesystem,
	inspectLocalPath,
	listFilesystems,
	markFilesystemReachable,
	saveFilesystem,
} from "@hyperidle/filesystems";
import {
	checkFilesystem,
	type FilesystemCheckResult,
	forgetKeptCopy,
	isLocalRepoPath,
} from "@hyperidle/run-orchestration";
import { Hono } from "hono";
import { z } from "zod";
import { ghAuthStatus } from "../cli-status.js";
import { recordFilesystemNeedsAttention } from "../filesystem-attention.js";
import { createGitRunner } from "../git-runner.js";

// ─── Ports this route needs from the connections domain ──────────────────────
// Declared structurally (Mechanism C idiom already used across this Layer's
// routes, e.g. `routes/connections.ts`'s own inline types) so this module
// never imports `@hyperidle/connections` — the Application composes both.

/** Resolve a token connection's plaintext, as the connection's OWNER. */
interface CredentialResolverPort {
	resolve(connectionId: string): Promise<string | null>;
}

/** Enough of a held connection row to validate a POST's `connectionId`. */
interface ConnectionLookupPort {
	lookup(connectionId: string): Promise<{ service: string; authSource: string } | null>;
}

export interface FilesystemRoutesDeps {
	readonly eventBus?: EventBus;
	/** Where a remote git filesystem's kept copy lives; absent → DELETE has nothing to forget. */
	readonly keptCopiesRoot?: string;
	readonly resolveCredential?: CredentialResolverPort["resolve"];
	readonly lookupConnection?: ConnectionLookupPort["lookup"];
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const codeRefSchema = z.object({
	kind: z.literal("code"),
	repo: z.string().min(1),
	branch: z.string().min(1),
});
const docSetRefSchema = z.object({ kind: z.literal("doc_set"), folder: z.string().min(1) });
const resourceRefSchema = z.discriminatedUnion("kind", [codeRefSchema, docSetRefSchema]);

/** `writeback` and `sourceHint` are both gone — source is always derived, never client-supplied. */
const registerFilesystemSchema = z.object({
	teamId: z.string().min(1),
	// @lore AU44 b2: inlined from FILESYSTEM_KINDS constant (dissolved with filesystem-contract).
	kind: z.enum(["code", "doc_set"]),
	connectionId: z.string().nullable().optional(),
	resourceRef: resourceRefSchema,
});

const GITHUB_HTTPS_REPO = /^https:\/\/github\.com\//i;
/** A branch is a plain ref name — no shell metacharacters, no leading `-` (an argv flag). */
const BRANCH_NAME = /^[A-Za-z0-9._/-]+$/;

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
		state: row.state as Filesystem["state"],
		attentionReason: row.attentionReason ?? null,
		createdAt: row.createdAt,
	};
}

/**
 * POST's `source` derivation — display only, never client-supplied.
 * A `connectionId` is only accepted (see the handler's validation) when it
 * already names a github.com repo, so it always yields `"github"`.
 */
function deriveSource(body: z.infer<typeof registerFilesystemSchema>): string {
	if (body.connectionId != null) return "github";
	if (body.resourceRef.kind !== "code") return "local";
	if (isLocalRepoPath(body.resourceRef)) return "local";
	return GITHUB_HTTPS_REPO.test(body.resourceRef.repo) ? "github" : "git";
}

/**
 * POST rules, everything Zod's shape checks cannot express:
 * - a `code` URL may never carry userinfo (credentials belong in a connection);
 * - `branch` is a plain ref name;
 * - `connectionId`, when given, must name a `token` connection whose `service`
 *   is `github`, and the repo must already be an `https://github.com/` URL.
 * Returns the 400 message, or null when the body is valid.
 */
async function validateRegisterBody(
	body: z.infer<typeof registerFilesystemSchema>,
	lookupConnection: ConnectionLookupPort["lookup"] | undefined,
): Promise<string | null> {
	if (body.resourceRef.kind === "code") {
		const { repo, branch } = body.resourceRef;
		if (!BRANCH_NAME.test(branch) || branch.startsWith("-")) {
			return "branch must be a plain ref name";
		}
		if (/^https?:\/\//i.test(repo)) {
			let parsed: URL;
			try {
				parsed = new URL(repo);
			} catch {
				return "resourceRef.repo is not a valid URL";
			}
			if (parsed.username || parsed.password) {
				return "credentials belong in a connection, never in the URL";
			}
		}
	}

	if (body.connectionId == null) return null;

	if (body.resourceRef.kind !== "code" || !GITHUB_HTTPS_REPO.test(body.resourceRef.repo)) {
		return "connectionId is only valid for an https://github.com/ repository";
	}
	const connection = (await lookupConnection?.(body.connectionId)) ?? null;
	if (connection == null || connection.authSource !== "token" || connection.service !== "github") {
		return "connectionId must name a GitHub token connection";
	}
	return null;
}

// ─── Check — run and persist (registration + POST /:id/check share this) ────

async function runCheckAndPersist(
	db: HyperIdleDb,
	eventBus: EventBus | undefined,
	resolveCredential: CredentialResolverPort["resolve"] | undefined,
	filesystem: Filesystem,
): Promise<FilesystemCheckResult> {
	const credential =
		filesystem.connectionId != null && resolveCredential
			? await resolveCredential(filesystem.connectionId)
			: null;
	const check = await checkFilesystem(filesystem, {
		credential,
		gitRunnerFactory: createGitRunner,
		ghAuthStatus,
	});
	if (check.ok) {
		await markFilesystemReachable(db, filesystem.id);
	} else {
		await recordFilesystemNeedsAttention(
			db,
			eventBus,
			filesystem.id,
			check.reason ?? "unreachable",
		);
	}
	return check;
}

// ─── createFilesystemRoutes ───────────────────────────────────────────────────

export function createFilesystemRoutes(
	db: HyperIdleDb,
	deps: FilesystemRoutesDeps = {},
): Hono<HyperIdleEnv> {
	const { eventBus, keptCopiesRoot, resolveCredential, lookupConnection } = deps;
	const router = new Hono<HyperIdleEnv>();

	// ── POST /api/filesystems — Register a filesystem ──────────────────────────
	router.post("/", validateBody(registerFilesystemSchema), async (c) => {
		const body = c.req.valid("json");

		const validationError = await validateRegisterBody(body, lookupConnection);
		if (validationError) {
			return c.json({ error: validationError, code: "VALIDATION_ERROR" }, 400);
		}

		const connectionId = body.connectionId ?? null;
		const source = deriveSource(body);
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		try {
			await saveFilesystem(db, {
				id,
				teamId: body.teamId,
				source,
				kind: body.kind,
				connectionId,
				resourceRef: JSON.stringify(body.resourceRef),
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

		// Run Check on registration so the caller gets the real initial
		// state. A failing check enters `needs_attention` and sends the notice,
		// like any other entry.
		const check = await runCheckAndPersist(
			db,
			eventBus,
			resolveCredential,
			rowToFilesystem(inserted),
		);
		const persisted = (await getFilesystem(db, id)) ?? inserted;
		return c.json({ filesystem: rowToFilesystem(persisted), check }, 201);
	});

	// ── POST /api/filesystems/inspect-path — Probe a local path before register ─
	// Separate route justified by codeRefSchema.branch.min(1): the caller must know
	// the branch BEFORE registering a `code` fs. Folding into POST / would require
	// loosening that schema. @lore AV1: reuses createGitRunner (currentBranch verb).
	router.post("/inspect-path", validateBody(z.object({ path: z.string().min(1) })), async (c) => {
		const { path } = c.req.valid("json");
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

		// LIST route: STORED state only — never a live Check per row (latency-bound
		// on the forge otherwise). `POST /:id/check` is the on-demand path.
		return c.json({ filesystems: rows.map(rowToFilesystem) }, 200);
	});

	// ── POST /api/filesystems/:id/check — Run Check on demand ─────────────────
	router.post("/:id/check", async (c) => {
		const id = c.req.param("id");
		const row = await getFilesystem(db, id);
		if (row == null) {
			return c.json({ error: "Filesystem not found", code: "NOT_FOUND" }, 404);
		}
		const check = await runCheckAndPersist(db, eventBus, resolveCredential, rowToFilesystem(row));
		const persisted = (await getFilesystem(db, id)) ?? row;
		return c.json({ filesystem: rowToFilesystem(persisted), check }, 200);
	});

	// ── DELETE /api/filesystems/:id — Remove registration (cascades injections) ─
	router.delete("/:id", async (c) => {
		const id = c.req.param("id");

		// Check exists first
		const existing = await getFilesystem(db, id);
		if (existing == null) {
			return c.json({ error: "Filesystem not found", code: "NOT_FOUND" }, 404);
		}

		// CASCADE on filesystem_injections is DB-level (onDelete: cascade).
		await deleteFilesystem(db, id);
		// Forget the ONE remote kept copy, if any — never a local repo.
		await forgetKeptCopy(keptCopiesRoot, rowToFilesystem(existing));
		return new Response(null, { status: 204 });
	});

	// ── DELETE /api/filesystems/:id/injections/:agentUserId — Eject ───────────
	router.delete("/:id/injections/:agentUserId", async (c) => {
		const fsId = c.req.param("id");
		const agentUserId = c.req.param("agentUserId");

		const deleted = await deleteInjection(db, agentUserId, fsId);
		if (!deleted) {
			return c.json({ error: "Injection not found", code: "NOT_FOUND" }, 404);
		}

		return new Response(null, { status: 204 });
	});

	return router;
}
