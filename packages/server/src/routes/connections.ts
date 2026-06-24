/**
 * AN1 — External Connections API routes.
 *
 * POST /api/connections — create a token or mcp-oauth connection (201 view, no secret echo)
 * GET  /api/connections — list stored + harness-projected connections for the user
 * DELETE /api/connections/:id — delete own connection (cross-user → 404)
 * POST /api/connections/:id/validate — set health on a connection
 *
 * @lore AN1: requireBoundary({kind:"enforced"}) on every route. Per AF11 R2, the
 * pending flag must be cleared by calling authorizeRead (GET/validate) or
 * authorizeWrite (POST/DELETE). The actual per-user isolation is enforced at the
 * DB query level (userId-scoped queries); authorizeRead/Write clears the boundary
 * flag with the principal as the resource participant (self-access pattern).
 *
 * @lore AN1: `via` is server-constructed (NIT-3) — never a raw URL echo.
 * For token: "API key · held in vault".
 * For mcp-oauth: "{host} · service OAuth" where host is extracted from serverUrl.
 * For harness (projected, not stored): "{harnessName} · {serverName}".
 *
 * @lore AN1: POST token inserts with health="needs-attention" (NIT-1) — a new
 * token has NOT been validated yet. The column default "needs-attention" handles
 * this. The validate endpoint can upgrade it to "usable".
 *
 * @lore AN1: SSRF guard — serverUrl must be https://. AN2 adds the full
 * block-private-IP guard when it performs the actual outbound connection.
 */

import { type HyperIdleDb, serviceConnections } from "@hyperidle/db";
import type { ServiceConnectionView } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { authorizeRead, authorizeWrite } from "../auth/authorize.js";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import { encryptCredentialValue, requireServerSecret } from "../services/credential-encryption.js";
import { projectHarnessConnections } from "../services/harness-connection-projection.js";

// Rate limiters: 20/min for mutations, 3/min for validate.
const mutateLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
const validateLimiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

/**
 * Detect PostgreSQL unique-constraint violations.
 * PGlite and postgres-js both surface the pg error code 23505 in the message or
 * as a `.code` property on the error object. We check both to be safe.
 *
 * @lore AN1 WARN-3: used to return 409 on duplicate (userId, service, authSource)
 * rather than propagating to the global 500 handler.
 */
function isUniqueConstraintViolation(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	// postgres-js surfaces the pg error code as a numeric property; PGlite includes
	// it in the message string. Both consistently include "23505" or "unique".
	const msg = err.message.toLowerCase();
	return (
		msg.includes("23505") ||
		msg.includes("unique constraint") ||
		msg.includes("uniqueconstraint") ||
		("code" in err && (err as Record<string, unknown>).code === "23505")
	);
}

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------

const createTokenConnectionSchema = z.object({
	service: z.string().min(1).max(200),
	authSource: z.literal("token"),
	token: z.string().min(1).max(10_000),
});

const createMcpConnectionSchema = z.object({
	service: z.string().min(1).max(200).optional(),
	authSource: z.literal("mcp-oauth"),
	serverUrl: z
		.string()
		.min(1)
		.max(2000)
		.refine((url) => url.startsWith("https://"), {
			message: "serverUrl must be an https:// URL",
		}),
});

const createConnectionSchema = z.discriminatedUnion("authSource", [
	createTokenConnectionSchema,
	createMcpConnectionSchema,
]);

// ---------------------------------------------------------------------------
// Response builder: view → ServiceConnectionView (never returns encryptedToken)
// ---------------------------------------------------------------------------

/**
 * Build a safe display `via` string from connection data.
 * @lore AN1 NIT-3: never echo the raw serverUrl into `via`. Extract the host only.
 */
function buildVia(authSource: "token" | "mcp-oauth", serverUrl: string | null | undefined): string {
	if (authSource === "token") {
		return "API key · held in vault";
	}
	// mcp-oauth: extract host from serverUrl, never return raw URL.
	if (serverUrl) {
		try {
			const { hostname } = new URL(serverUrl);
			return `${hostname} · service OAuth`;
		} catch {
			return "service OAuth";
		}
	}
	return "service OAuth";
}

function rowToView(row: {
	id: string;
	service: string;
	authSource: string;
	serverUrl: string | null;
	trustTier: string;
	health: string;
}): ServiceConnectionView {
	// @lore AN1: cast string columns to closed-set types — validated at insert time.
	return {
		id: row.id,
		service: row.service,
		via: buildVia(row.authSource as "token" | "mcp-oauth", row.serverUrl),
		authSource: row.authSource as ServiceConnectionView["authSource"],
		health: row.health as ServiceConnectionView["health"],
		trustTier: row.trustTier as ServiceConnectionView["trustTier"],
		toolCount: null, // null until AN2 connects out
		removable: true,
	};
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function createConnectionRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// -------------------------------------------------------------------------
	// GET /api/connections — list stored rows + harness projection for the user
	// -------------------------------------------------------------------------
	router.get("/", requireBoundary({ kind: "enforced" }), async (c) => {
		const userId = c.get("userId");

		// AF11: clear the pending boundary flag (self-access — user reads their own connections).
		const deny = authorizeRead(c, {
			hostKind: "user",
			hostId: userId,
			participants: [userId],
		});
		if (deny) return deny;

		const rows = await db
			.select()
			.from(serviceConnections)
			.where(eq(serviceConnections.userId, userId));

		const storedViews = rows.map(rowToView);

		// @lore AN1 WARN-1 (Phase-4 review, scope amendment): the harness live-enumeration
		// intentionally passes null here. HarnessCapabilityDescriptor (shared/src/harness/)
		// currently exposes only `mcpSupport: boolean`, not the per-server {name, url, health}
		// list that projectHarnessConnections() needs. The per-server enumeration is an AN2
		// capability — the outbound MCP client built in AN2 enriches the descriptor with real
		// server data. AN1 ships the projection seam + UI group (the "Inherited from your
		// environment" section renders and is discoverable), but the group is empty in the
		// live route until AN2 fills the descriptor. The projection itself is fully verified
		// by a unit test (AN1-harness-projection.test.ts) covering both null and with-servers
		// cases — so when AN2 supplies real data, the seam is proven.
		const harnessViews = projectHarnessConnections(null);

		const allViews: ServiceConnectionView[] = [...harnessViews, ...storedViews];
		return c.json(allViews);
	});

	// -------------------------------------------------------------------------
	// POST /api/connections — create a token or mcp-oauth connection
	// -------------------------------------------------------------------------
	router.post("/", requireBoundary({ kind: "enforced" }), mutateLimiter, async (c) => {
		const userId = c.get("userId");

		// AF11: clear the pending boundary flag.
		const deny = authorizeWrite(c, {
			hostKind: "user",
			hostId: userId,
			participants: [userId],
		});
		if (deny) return deny;

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
			// @lore AN1 NIT-1 (Phase-4 review fix): collapsed to a single secret check.
			// requireServerSecret() already fails loudly when no key is configured; the
			// earlier explicit credKey check was redundant. Note: requireServerSecret()
			// falls back to HYPERIDLE_API_KEY when HYPERIDLE_CREDENTIAL_KEY is absent —
			// the "dedicated key" comment was overstating the behavior. We simply require
			// any configured secret; the operator is responsible for key strength.
			let serverSecret: string;
			try {
				serverSecret = requireServerSecret();
			} catch {
				return c.json(
					{ error: "Encryption secret not configured", code: "MISSING_ROOT_SECRET" },
					500,
				);
			}

			const encryptedToken = encryptCredentialValue(body.token, serverSecret);

			try {
				await db.insert(serviceConnections).values({
					id,
					userId,
					service: body.service,
					authSource: "token",
					encryptedToken,
					serverUrl: null,
					trustTier: "community",
					health: "needs-attention", // @lore AN1 NIT-1: new token is unvalidated
					lastValidatedAt: null,
					createdAt: now,
					updatedAt: now,
				});
			} catch (err) {
				// @lore AN1 WARN-3 (Phase-4 review fix): catch unique-index violation
				// (service_connections_user_service_source_idx) and return 409 instead of
				// propagating to the global 500 handler. No secret or stack leak — the
				// constraint message is not forwarded to the client.
				if (isUniqueConstraintViolation(err)) {
					return c.json({ error: "Connection already exists", code: "CONFLICT" }, 409);
				}
				throw err;
			}
		} else {
			// mcp-oauth: store serverUrl + trust tier (no token stored by HyperIdle)
			const service =
				body.service ??
				(() => {
					try {
						return new URL(body.serverUrl).hostname;
					} catch {
						return body.serverUrl;
					}
				})();

			try {
				await db.insert(serviceConnections).values({
					id,
					userId,
					service,
					authSource: "mcp-oauth",
					encryptedToken: null,
					serverUrl: body.serverUrl,
					trustTier: "community",
					health: "needs-attention", // @lore AN1 NIT-1: new connection is unvalidated
					lastValidatedAt: null,
					createdAt: now,
					updatedAt: now,
				});
			} catch (err) {
				// @lore AN1 WARN-3 (Phase-4 review fix): same 409 guard for mcp-oauth.
				if (isUniqueConstraintViolation(err)) {
					return c.json({ error: "Connection already exists", code: "CONFLICT" }, 409);
				}
				throw err;
			}
		}

		const [row] = await db
			.select()
			.from(serviceConnections)
			.where(eq(serviceConnections.id, id))
			.limit(1);

		if (!row) {
			return c.json({ error: "Failed to create connection", code: "INTERNAL_ERROR" }, 500);
		}

		return c.json(rowToView(row), 201);
	});

	// -------------------------------------------------------------------------
	// DELETE /api/connections/:id — delete own connection (cross-user → 404)
	// -------------------------------------------------------------------------
	router.delete("/:id", requireBoundary({ kind: "enforced" }), mutateLimiter, async (c) => {
		const userId = c.get("userId");
		const connectionId = c.req.param("id");

		// AF11: clear the pending boundary flag.
		const deny = authorizeWrite(c, {
			hostKind: "user",
			hostId: userId,
			participants: [userId],
		});
		if (deny) return deny;

		// @lore AN1: userId-scoped delete — cross-user → 0 rows deleted → 404.
		// Never 403 (don't leak existence of another user's connection).
		// Use .returning() for reliable row-count detection across Drizzle backends
		// (PGlite and postgres-js both return results via .returning(); rowCount is
		// implementation-dependent and unreliable in tests).
		const deleted = await db
			.delete(serviceConnections)
			.where(and(eq(serviceConnections.id, connectionId), eq(serviceConnections.userId, userId)))
			.returning({ id: serviceConnections.id });

		if (deleted.length === 0) {
			return c.json({ error: "Connection not found", code: "NOT_FOUND" }, 404);
		}

		return c.body(null, 204);
	});

	// -------------------------------------------------------------------------
	// POST /api/connections/:id/validate — set health on a connection (AN2 write-back seam)
	// -------------------------------------------------------------------------
	router.post(
		"/:id/validate",
		requireBoundary({ kind: "enforced" }),
		validateLimiter,
		async (c) => {
			const userId = c.get("userId");
			const connectionId = c.req.param("id");

			// AF11: clear the pending boundary flag.
			const deny = authorizeWrite(c, {
				hostKind: "user",
				hostId: userId,
				participants: [userId],
			});
			if (deny) return deny;

			const [row] = await db
				.select()
				.from(serviceConnections)
				.where(and(eq(serviceConnections.id, connectionId), eq(serviceConnections.userId, userId)))
				.limit(1);

			if (!row) {
				return c.json({ error: "Connection not found", code: "NOT_FOUND" }, 404);
			}

			// AN1 sets health to "needs-attention" (no external validation at this layer).
			// AN2's broker will upgrade to "usable" or "expired" when it performs the call.
			// The validate endpoint is the AN2 write-back seam: AN2 calls this after
			// a live tool call to record the result. At AN1, we set needs-attention.
			const health: ServiceConnectionView["health"] = "needs-attention";
			const now = new Date().toISOString();

			await db
				.update(serviceConnections)
				.set({ health, lastValidatedAt: now, updatedAt: now })
				.where(eq(serviceConnections.id, connectionId));

			return c.json({ health });
		},
	);

	return router;
}
