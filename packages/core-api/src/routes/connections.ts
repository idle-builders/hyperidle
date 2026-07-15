/**
 * AN1 — /api/connections routes.
 *
 * CRUD for per-user ServiceConnections (held: token | mcp).
 * Inherited connections are projected live from cached harness descriptors.
 *
 * Security model:
 *   - All routes require auth (401 without API key / session token).
 *   - Every query scoped on userId (AC5 — per-user isolation).
 *   - Cross-user / non-existent → 404 (never 403 — never leaks existence).
 *   - Tokens stored AES-256-GCM encrypted, NEVER returned in any response.
 *   - SSRF: serverUrl must be https:// and must not resolve to a private/loopback IP.
 *   - rate-limit: POST 20/min, DELETE 20/min, validate 3/min.
 *
 * @lore AN1: No trust tier, no broker/gate, no OAuth dance. Simple secrets and
 * MCP pointers only. OAuth services arrive inherited from the harness.
 *
 * @lore AN1: Concept hard-rule 1 — encryptedToken NEVER appears in any response.
 * The resolver (ServiceConnectionResolver) is the only plaintext path, wired to
 * sandbox injection (AN2), not to routes.
 */

import {
	encryptCredentialValue,
	projectInheritedConnections,
	requireServerSecret,
} from "@hyperidle/connections";
import { type HyperIdleDb, serviceConnections } from "@hyperidle/db";
import type { ConnectionHealth, ServiceConnectionView } from "@hyperidle/shared";
import { isPrivateHostLiteral, resolveUrlForSSRF } from "@hyperidle/shared/net";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rate-limit.js";
import {
	type HarnessCapabilityReader,
	harnessCapabilityDescriptors,
} from "../services/harness-capability-read-model.js";

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
 * Cast a raw DB health string to the closed 2-set.
 * Falls back to "needs-attention" for any unrecognised value.
 */
function toHealth(raw: string): ConnectionHealth {
	if (raw === "working" || raw === "needs-attention") return raw;
	return "needs-attention";
}

/**
 * Build the public ServiceConnectionView from a DB row.
 * NEVER includes encryptedToken or serverUrl.
 */
function rowToView(row: {
	id: string;
	service: string;
	authSource: string;
	health: string;
	serverUrl: string | null | undefined;
}): ServiceConnectionView {
	return {
		id: row.id,
		service: row.service,
		via: buildVia(row.authSource, row.serverUrl),
		authSource: row.authSource as ServiceConnectionView["authSource"],
		health: toHealth(row.health),
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
 * @param adapterPool — used to read cached harness descriptors for inherited projection
 */
export function createConnectionRoutes(
	db: HyperIdleDb,
	adapterPool?: HarnessCapabilityReader,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// Per-router-instance rate limiters (one bucket per identity, reset per app lifecycle).
	const mutateLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });
	const validateLimiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

	// ── GET / ─────────────────────────────────────────────────────────────────
	/**
	 * List all connections for the authenticated user.
	 * Returns: held rows (from DB) ∪ inherited projections (from cached descriptors).
	 * NEVER includes encryptedToken or any secret value.
	 *
	 * @lore AN1 critique WARNING §7: reads CACHED descriptors via
	 * `pool.listCapabilityDescriptors()` (sync + DB-free). Never re-probes per request.
	 */
	router.get("/", requireBoundary({ kind: "principal-self" }), async (c) => {
		const userId = c.get("userId");

		// Held connections from DB
		const rows = await db
			.select()
			.from(serviceConnections)
			.where(eq(serviceConnections.userId, userId));

		const storedViews = rows.map(rowToView);

		// Inherited projections from cached harness descriptors (no spawn per request)
		const descriptors = harnessCapabilityDescriptors(adapterPool);
		const inheritedViews = projectInheritedConnections(descriptors);

		// Inherited first (the first-class signal), then held
		return c.json([...inheritedViews, ...storedViews]);
	});

	// ── POST / ────────────────────────────────────────────────────────────────
	/**
	 * Create a new held connection.
	 *
	 * token path: encrypt the token, store health:"needs-attention".
	 * mcp path: store serverUrl, no token.
	 * On unique violation (user × service × authSource): 409.
	 */
	router.post("/", requireBoundary({ kind: "principal-self" }), mutateLimiter, async (c) => {
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
					health: "needs-attention",
					lastValidatedAt: null,
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
				await db.insert(serviceConnections).values({
					id,
					userId,
					service,
					authSource: "mcp",
					encryptedToken: null,
					serverUrl: body.serverUrl,
					health: "needs-attention",
					lastValidatedAt: null,
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
		const [row] = await db
			.select()
			.from(serviceConnections)
			.where(eq(serviceConnections.id, id))
			.limit(1);

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
	router.delete("/:id", requireBoundary({ kind: "principal-self" }), mutateLimiter, async (c) => {
		const userId = c.get("userId");
		const id = c.req.param("id");

		// inherited: ids are sentinels with no DB row — always 404
		if (id.startsWith("inherited:")) {
			return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
		}

		// SELECT first (userId-scoped) to confirm ownership before deleting
		const [existing] = await db
			.select({ id: serviceConnections.id })
			.from(serviceConnections)
			.where(and(eq(serviceConnections.id, id), eq(serviceConnections.userId, userId)))
			.limit(1);

		if (!existing) {
			return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
		}

		await db
			.delete(serviceConnections)
			.where(and(eq(serviceConnections.id, id), eq(serviceConnections.userId, userId)));

		return c.body(null, 204);
	});

	// ── POST /:id/validate ────────────────────────────────────────────────────
	/**
	 * Probe health of a held connection and write back the result.
	 *
	 * token: presence + decrypt-OK → "working"; else → "needs-attention".
	 * mcp: AN1 reports "needs-attention" without a live network call
	 *   (AN2 upgrades to a real tool-call probe; the endpoint is the write-back seam).
	 *
	 * @lore AN1 critique WARNING §4 SSRF: the validate endpoint does NOT make
	 * outbound HTTP calls in AN1. token → presence/decrypt only; mcp → "needs-attention"
	 * without any network call. This eliminates the SSRF surface for AN1.
	 * AN2 adds the live MCP reachability probe with full SSRF protection.
	 */
	router.post(
		"/:id/validate",
		requireBoundary({ kind: "principal-self" }),
		validateLimiter,
		async (c) => {
			const userId = c.get("userId");
			const id = c.req.param("id");

			const [row] = await db
				.select()
				.from(serviceConnections)
				.where(and(eq(serviceConnections.id, id), eq(serviceConnections.userId, userId)))
				.limit(1);

			if (!row) {
				return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
			}

			let health: ConnectionHealth;

			if (row.authSource === "token") {
				// token: check presence + decrypt-OK
				if (!row.encryptedToken) {
					health = "needs-attention";
				} else {
					let serverSecret: string | null;
					try {
						serverSecret = requireServerSecret();
					} catch {
						serverSecret = null;
					}
					if (!serverSecret) {
						health = "needs-attention";
					} else {
						const { decryptCredentialValue } = await import("@hyperidle/connections");
						const plaintext = decryptCredentialValue(row.encryptedToken, serverSecret);
						health = plaintext ? "working" : "needs-attention";
					}
				}
			} else {
				// mcp: AN2 live MCP reachability probe.
				// resolveUrlForSSRF → pin the resolved IP → attempt HTTP reach.
				// This is the ONE path where AN2 owns the connect and can pin the IP
				// to guard against DNS rebinding (W3 in the architecture critique).
				//
				// @lore AN2 validate-SSRF: Only /validate pins the resolved IP because
				// AN2 owns the connect here. The provisioned-config path (spawn-time
				// SSRF check in buildProvisioningPlan) is check-only, not pinned,
				// because the harness owns the subsequent connect.
				health = await probeMcpReachability(row.serverUrl);
			}

			const now = new Date().toISOString();
			await db
				.update(serviceConnections)
				.set({ health, lastValidatedAt: now, updatedAt: now })
				.where(eq(serviceConnections.id, id));

			return c.json({ health });
		},
	);

	return router;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * AN2 — Live MCP reachability probe for mcp connections.
 *
 * Resolves the URL via resolveUrlForSSRF (SSRF check + pinned IP), then attempts
 * an HTTP GET to the MCP endpoint to verify it is reachable.
 *
 * This is the ONLY AN2 path that is genuinely DNS-rebinding-guarded: AN2 owns
 * the connect here and pins the resolved IP (unlike the provisioned-config path
 * where the harness owns the connect and AN2 cannot pin).
 *
 * Returns "working" if the server responds (2xx or MCP-typical 4xx like 405/404),
 * "needs-attention" if SSRF check fails, DNS resolution fails, or the server is
 * unreachable within the timeout.
 *
 * @lore AN2 validate-SSRF: Uses resolveUrlForSSRF + pinned IP for the fetch.
 * "Pinned" means we use the IP from the DNS resolution result rather than the
 * hostname, preventing a DNS rebinding attack between check and connect.
 * This guard applies ONLY here (AN2 owns the connect). The provisioned-config
 * path is check-only (harness owns the connect, pinning is impossible without
 * proxying — concept hard-rule 6).
 */
async function probeMcpReachability(
	serverUrl: string | null | undefined,
): Promise<ConnectionHealth> {
	if (!serverUrl) return "needs-attention";

	const ssrfResult = await resolveUrlForSSRF(serverUrl, { label: "mcp serverUrl" });
	if (!ssrfResult.ok) return "needs-attention";

	// Pin the resolved IP to guard against DNS rebinding (only possible here because
	// AN2 owns this connect — unlike the provisioned-config path).
	try {
		const parsed = new URL(serverUrl);
		const pinnedAddress = ssrfResult.addresses[0];
		if (!pinnedAddress) return "needs-attention";

		// Build the fetch URL with the pinned IP.
		// For https, we must send the Host header with the original hostname.
		const pinnedUrl = new URL(serverUrl);
		pinnedUrl.hostname =
			pinnedAddress.family === 6 ? `[${pinnedAddress.address}]` : pinnedAddress.address;

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 5_000);

		try {
			const response = await fetch(pinnedUrl.toString(), {
				method: "GET",
				headers: { Host: parsed.hostname },
				signal: controller.signal,
			});
			clearTimeout(timer);

			// MCP servers respond to GET / with various status codes (200, 404, 405).
			// Any HTTP response means the server is reachable.
			// Only network-level failure (no response) or SSRF blockage → needs-attention.
			if (response.status > 0) {
				return "working";
			}
			return "needs-attention";
		} catch {
			clearTimeout(timer);
			return "needs-attention";
		}
	} catch {
		return "needs-attention";
	}
}

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
