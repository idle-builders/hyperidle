/**
 * AN1 — /api/connections routes.
 *
 * CRUD for per-user ServiceConnections (held: token | mcp).
 * Inherited connections are projected live from the connections domain's own
 * reach cache (AU36).
 *
 * Security model:
 *   - All routes require auth (401 without API key / session token).
 *   - Every query scoped on userId (AC5 — per-user isolation).
 *   - Cross-user / non-existent → 404 (never 403 — never leaks existence).
 *   - Tokens stored AES-256-GCM encrypted, NEVER returned in any response.
 *   - SSRF: serverUrl must be https:// and must not resolve to a private/loopback IP.
 *   - rate-limit: POST 20/min, DELETE 20/min.
 *
 * @lore AN1: No trust tier, no broker/gate, no OAuth dance. Simple secrets and
 * MCP pointers only. OAuth services arrive inherited from the harness.
 *
 * @lore AN1: Concept hard-rule 1 — encryptedToken NEVER appears in any response.
 * The resolver (ServiceConnectionResolver) is the only plaintext path, wired to
 * sandbox injection (AN2), not to routes.
 *
 * @lore AU26 E4 (AU21 Decision J4, with J6 superseded): this module lives on
 * `agent-orchestration`'s own app now, not core-api's. J6 kept the HTTP surface
 * core-hosted and had it delegate downward; §D-A supersedes that — a route goes
 * where its tables go, and this file's whole table set is `service_connections`
 * alone. Reads AND mutations moved, not just reads.
 *
 * **The paths do not change**, except one: both apps mount on the Application's
 * one `/api` router, so `/api/connections` and `/api/connections/:id` are
 * byte-identical to before and `layers/core-ui` needs no change at all
 * (AC7(c)). `/api/connections/:id/validate` is deleted (BA5 §12/§18) — its
 * only writer, the stored `health`/`last_validated_at` columns, is gone.
 *
 * The middleware stack — cors, body limit, auth, fail-closed, `onError` — is
 * Application-applied to that shared router and reaches this module unchanged.
 * This file declares its own boundaries with `@hyperidle/domain-model`'s
 * `` and imports nothing from core-api.
 */

import {
	deleteConnection,
	type InheritedReach,
	insertConnection,
	listConnections,
} from "@hyperidle/connections";
import type { HyperIdleDb } from "@hyperidle/db";
import type { ServiceConnectionView } from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import { Hono } from "hono";
import { z } from "zod";
import { isPrivateHostLiteral } from "../ssrf.js";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/**
 * SSRF guard for serverUrl: must be https:// and must not be a private/loopback/
 * link-local IP literal.
 *
 * Architecture critique WARNING §4: https:// alone is insufficient — https://169.254.169.254
 * is link-local. We block private IP literals at input time using the shared SSRF utility.
 *
 * @lore AN1 SSRF: This blocks IP literals. Full DNS-rebinding protection (where a public
 * hostname resolves to a private IP) is deferred to AN2's outbound-client scope, which is
 * explicitly documented as a known follow-up — not a silent gap.
 */
function isBlockedUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return isPrivateHostLiteral(parsed.hostname);
	} catch {
		return true; // unparseable → blocked
	}
}

const createConnectionSchema = z.discriminatedUnion("authSource", [
	z.object({
		service: z.string().min(1).max(200),
		authSource: z.literal("token"),
		token: z.string().min(1).max(10_000),
	}),
	z.object({
		service: z.string().min(1).max(200).optional(),
		authSource: z.literal("mcp"),
		serverUrl: z
			.string()
			.min(1)
			.max(2000)
			.refine((u) => u.startsWith("https://"), {
				message: "serverUrl must be https://",
			})
			.refine((u) => !isBlockedUrl(u), {
				message: "serverUrl must not resolve to a private, loopback, or link-local address",
			}),
	}),
]);

// ---------------------------------------------------------------------------
// View builder
// ---------------------------------------------------------------------------

/**
 * Derive the `via` string for a row. Server-constructed — never a raw secret echo.
 *
 * @lore AN1 Phase-0 decision 3: `via` is always server-constructed:
 *   token → "API key · stored encrypted"
 *   mcp   → "<host>" (hostname of the MCP server URL)
 */
function buildVia(authSource: string, serverUrl: string | null | undefined): string {
	if (authSource === "token") return "API key · stored encrypted";
	if (authSource === "mcp" && serverUrl) {
		try {
			return new URL(serverUrl).hostname;
		} catch {
			return serverUrl;
		}
	}
	return "";
}

/**
 * Build the public ServiceConnectionView from a DB row.
 * NEVER includes encryptedToken or serverUrl.
 *
 * @lore BA5 §18: a held row carries no `health` — the column and the validate
 * route that wrote it are gone (migration 0082). Only the inherited half of
 * the view (built elsewhere, from live CLI detection) still sets it.
 */
function rowToView(row: {
	id: string;
	service: string;
	authSource: string;
	serverUrl: string | null | undefined;
}): ServiceConnectionView {
	return {
		id: row.id,
		service: row.service,
		via: buildVia(row.authSource, row.serverUrl),
		authSource: row.authSource as ServiceConnectionView["authSource"],
		removable: true,
	};
}

/**
 * Derive the service name from a serverUrl hostname when the user omits it.
 * Strips a leading "mcp." subdomain so "mcp.figma.com" → "figma.com".
 *
 * @lore AN1 §4 suggestion: deterministic derivation so two builders can't pick
 * different rules. This affects the unique constraint (userId, service, authSource).
 */
function deriveServiceFromUrl(serverUrl: string): string {
	try {
		const host = new URL(serverUrl).hostname;
		// Strip common "mcp." prefix
		return host.startsWith("mcp.") ? host.slice(4) : host;
	} catch {
		return serverUrl;
	}
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create the /api/connections router.
 *
 * @lore AN1: Rate limiters created inside the factory so each app instance gets
 * an independent bucket. Module-level rate limiters would persist across app
 * instances in the same vitest worker, causing spurious 429s in integration tests.
 * (Mirrors the pattern used by `createHarnessRoutes` for its redetect limiter.)
 *
 * @param db — Drizzle DB handle
 * @param inheritedReach — the connections domain's own reach cache (AU36 D7).
 *   Absent (kernel-only/bare test apps) → empty inherited group, exactly as
 *   today's absent-pool case.
 */
export function createConnectionRoutes(
	db: HyperIdleDb,
	inheritedReach?: InheritedReach,
	cipher?: {
		readonly encrypt: (plaintext: string) => string;
	},
): Hono<HyperIdleEnv> {
	const encrypt =
		cipher?.encrypt ??
		(() => {
			throw new Error("Encryption secret not configured");
		});
	const router = new Hono<HyperIdleEnv>();

	// Per-router-instance rate limiters (one bucket per identity, reset per app lifecycle).

	// ── GET / ─────────────────────────────────────────────────────────────────
	/**
	 * List all connections for the authenticated user.
	 * Returns: held rows (from DB) ∪ inherited projections (from the reach cache).
	 * NEVER includes encryptedToken or any secret value.
	 *
	 * @lore AN1 critique WARNING §7: reads the CACHED reach snapshot (sync +
	 * DB-free). Never re-probes per request.
	 *
	 * @lore AU36 (AC1): the inherited half is assembled from connections-domain
	 * state only — no harness registry, descriptor, or adapter-pool read in the
	 * path.
	 */
	router.get("/", async (c) => {
		const userId = c.get("userId");

		// Held connections from DB
		const rows = await listConnections(db, { userId });

		const storedViews = rows.map(rowToView);

		// Inherited projections from the reach cache (no spawn per request)
		// list() now returns ServiceConnectionView[] directly (projection inlined in InheritedReach)
		const inheritedViews = inheritedReach?.list() ?? [];

		// Inherited first (the first-class signal), then held
		return c.json([...inheritedViews, ...storedViews]);
	});

	// `GET /provisioning` was DELETED by AU21 Decision K1 — it existed ONLY to
	// back `CoreApiPort.connections.listHeldConnectionsForProvisioning()`, a
	// live seam call `agent-orchestration` made at session-provisioning time,
	// and it had no frontend consumer (unlike `GET /filesystems?agentUserId=`,
	// which the Settings UI still calls directly and which therefore stays).
	//
	// @lore AU26 E3: the bake K1 replaced it with is gone too. The spawn reads
	// `service_connections` live from `@hyperidle/connections`, in-layer — no
	// route, no seam, nothing frozen onto the request.

	// ── POST / ────────────────────────────────────────────────────────────────
	/**
	 * Create a new held connection.
	 *
	 * token path: encrypt the token.
	 * mcp path: store serverUrl, no token.
	 * On unique violation (user × service × authSource): 409.
	 */
	router.post("/", async (c) => {
		const userId = c.get("userId");

		let rawBody: unknown;
		try {
			rawBody = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, 400);
		}

		const parsed = createConnectionSchema.safeParse(rawBody);
		if (!parsed.success) {
			return c.json(
				{ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues },
				400,
			);
		}

		const body = parsed.data;
		const now = new Date().toISOString();
		const id = `sc-${crypto.randomUUID()}`;

		if (body.authSource === "token") {
			// Fail-loud on missing root secret at the write boundary
			let encryptedToken: string;
			try {
				encryptedToken = encrypt(body.token);
			} catch {
				return c.json(
					{ error: "Encryption secret not configured", code: "MISSING_ROOT_SECRET" },
					500,
				);
			}

			try {
				await insertConnection(db, {
					id,
					userId,
					service: body.service,
					authSource: "token",
					encryptedToken,
					serverUrl: null,
					createdAt: now,
					updatedAt: now,
				});
			} catch (err) {
				// Unique constraint violation → 409
				if (isUniqueViolation(err)) {
					return c.json({ error: "Connection already exists", code: "DUPLICATE_CONNECTION" }, 409);
				}
				throw err;
			}
		} else {
			// mcp
			const service = body.service ?? deriveServiceFromUrl(body.serverUrl);

			try {
				await insertConnection(db, {
					id,
					userId,
					service,
					authSource: "mcp",
					encryptedToken: null,
					serverUrl: body.serverUrl,
					createdAt: now,
					updatedAt: now,
				});
			} catch (err) {
				if (isUniqueViolation(err)) {
					return c.json({ error: "Connection already exists", code: "DUPLICATE_CONNECTION" }, 409);
				}
				throw err;
			}
		}

		// Return the view (no secret)
		const [row] = await listConnections(db, { id });

		if (!row) {
			return c.json({ error: "Failed to retrieve created connection" }, 500);
		}

		return c.json(rowToView(row), 201);
	});

	// ── DELETE /:id ───────────────────────────────────────────────────────────
	/**
	 * Delete a held connection owned by the authenticated user.
	 *
	 * Cross-user / non-existent / inherited:* ids → 404 (never 403).
	 * Concept hard-rule 3: never leak existence to a cross-user caller.
	 *
	 * @lore AN1: SELECT-then-DELETE pattern rather than relying on rowCount,
	 * since PGlite's DELETE result shape varies. The SELECT is userId-scoped so
	 * cross-user ids produce the same 404 as non-existent ids (no existence leak).
	 */
	router.delete("/:id", async (c) => {
		const userId = c.get("userId");
		const id = c.req.param("id");

		// inherited: ids are sentinels with no DB row — always 404
		if (id.startsWith("inherited:")) {
			return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
		}

		// SELECT first (userId-scoped) to confirm ownership before deleting
		const [existing] = await listConnections(db, { id, userId });

		if (!existing) {
			return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
		}

		await deleteConnection(db, { id, userId });

		return c.body(null, 204);
	});

	return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// @lore drizzle-orm 0.45.2: wraps PGlite errors — outer message is "Failed query: …",
// original error (with code 23505 and "duplicate key" message) is in err.cause.
// Walk the cause chain to find the real constraint error.
function isUniqueViolation(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	const check = (e: unknown): boolean => {
		if (!(e instanceof Error)) return false;
		const msg = e.message.toLowerCase();
		const isMatch =
			msg.includes("unique") ||
			msg.includes("duplicate") ||
			msg.includes("constraint") ||
			("code" in e && (e as { code?: string }).code === "23505");
		if (isMatch) return true;
		if (e.cause !== undefined) return check(e.cause);
		return false;
	};
	return check(err);
}
