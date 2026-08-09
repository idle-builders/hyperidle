/**
 * Authentication helper routes.
 *
 * `GET /api/auth/me` returns the authenticated user's identity from the users table.
 * Always mounted (regardless of WebSocket support).
 *
 * `POST /api/auth/ws-token` mints a one-shot upgrade token that the client
 * uses to open the `/api/ws` WebSocket. The route itself is protected by
 * the standard auth middleware; successful issuance proves the caller is
 * authenticated, so handing out a derived, single-use credential is safe.
 *
 * `POST /api/auth/invite` (shared mode only) creates an invite code.
 * Admin-only: requires authMethod === "api_key".
 *
 * `POST /api/auth/logout` (shared mode only) revokes the current LoginSession.
 * Requires authMethod === "login_session" (Bearer token auth).
 *
 * @lore I2 A3: the ws-token endpoint is the only legitimate source of WS
 * upgrade tokens. The WS handler MUST NOT accept the master HYPERIDLE_API_KEY
 * passed via `?token=...` — only tokens minted here.
 *
 * @lore I2 review A1: the minted token must travel in the WS upgrade URL
 * (`?token=...`) because browsers cannot set Authorization headers on the
 * WebSocket handshake. We accept that residual risk because:
 *   (1) tokens are 32-byte random (256 bits) — unguessable,
 *   (2) TTL is 60s — replay window is bounded,
 *   (3) consumption is single-shot — the first reader wins,
 *   (4) the token authorizes session establishment ONLY — every
 *       subsequent WS message is gated by the established connection.
 *
 * @lore M3 A4: createAuthRoutes now accepts an optional db parameter so
 * GET /api/auth/me can read the full founder profile from factorySettings.
 * The /me endpoint is ALWAYS mounted; /ws-token is only mounted when
 * tokenStore is non-null.
 *
 * @lore S1: createAuthRoutes signature gains a `sharedMode` parameter.
 * /invite and /logout are only mounted in shared mode. /ws-token identity
 * source changes from X-Identity header to c.get("userId") in shared mode.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { ApiErrorResponse } from "@hyperidle/domain-model";
import { API_ERROR_CODES, INVITE_ROLES } from "@hyperidle/domain-model";
import { type HyperIdleEnv, requireBoundary } from "@hyperidle/http-middleware";
import {
	createInvite,
	findUser,
	revokeLoginSession,
	type UpgradeTokenStore,
} from "@hyperidle/users";
import { Hono } from "hono";

export function createAuthRoutes(
	db: HyperIdleDb | null,
	store: UpgradeTokenStore | null,
	sharedMode: boolean = false,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET /me — returns the authenticated user's identity.
	// P2: reads from users table instead of factorySettings founder_name/founder_email.
	router.get("/me", requireBoundary({ kind: "principal-self" }), async (c) => {
		const userId = c.get("userId") ?? "u-founder";

		if (!db) {
			// No db — return minimal identity from context
			return c.json({
				id: userId,
				name: "Founder",
				email: "",
				avatarUrl: null,
			});
		}

		const userRow = await findUser(db, { id: userId });

		return c.json({
			id: userId,
			name: userRow?.name ?? "Founder",
			email: userRow?.email ?? "",
			avatarUrl: userRow?.avatarUrl ?? null,
		});
	});

	// POST /ws-token — only mounted when WebSocket support is active.
	if (store) {
		router.post("/ws-token", requireBoundary({ kind: "public-data" }), (c) => {
			// Clients compute remaining seconds from `expiresAt` themselves; emitting
			// a server-derived `expiresInSec` adds a clock-skew footgun for no value.
			// @lore S1: In shared mode, identity comes from the auth middleware context
			// (already authenticated via Bearer token or API key). In local mode, we
			// fall back to the X-Identity header for legacy client compatibility.
			// The X-Identity header is trusted in local mode because local mode requires
			// the master API key — the caller is already admin.
			const identityId = sharedMode
				? c.get("userId")
				: (c.req.header("X-Identity") ?? c.get("userId"));
			const { token, expiresAt } = store.issue(identityId);
			return c.json({ token, expiresAt });
		});
	}

	/**
	 * POST /worker-token — returns HYPERIDLE_WORKER_TOKEN to authenticated users.
	 *
	 * S4 Decision 1: Desktop worker clients authenticate to this endpoint with
	 * their shared_backend_key (X-API-Key) to obtain the worker WS token.
	 * Returns 404 if HYPERIDLE_WORKER_TOKEN is not configured on this server.
	 *
	 * @lore S4: Mirrors the ws-token pattern exactly. Authenticated endpoint so
	 * only legitimate users can obtain the WS token. Never logged or exposed in
	 * error messages.
	 */
	router.post("/worker-token", requireBoundary({ kind: "public-data" }), (c) => {
		const workerToken = process.env.HYPERIDLE_WORKER_TOKEN;
		if (!workerToken) {
			return c.json(
				{
					error: "Worker registration is not enabled on this server",
					code: "NOT_FOUND",
				},
				404,
			);
		}
		return c.json({ token: workerToken });
	});

	// Shared-mode-only routes
	if (sharedMode && db) {
		/**
		 * POST /api/auth/invite
		 *
		 * Admin-only: requires authMethod === "api_key" (admin key holders only).
		 * Body: { role?: "admin" | "member" }
		 * Response: { code: string, expiresAt: string } (201)
		 */
		router.post("/invite", requireBoundary({ kind: "public-data" }), async (c) => {
			// Admin key only — Bearer token users cannot create invites
			if (c.get("authMethod") !== "api_key") {
				const response: ApiErrorResponse = {
					error: "Invite creation requires admin key authentication",
					code: API_ERROR_CODES.FORBIDDEN,
				};
				return c.json(response, 403);
			}

			let data: unknown;
			try {
				data = await c.req.json();
			} catch {
				data = {};
			}

			const parsed = data as { role?: unknown } | null;
			const role =
				parsed && typeof parsed === "object" && "role" in parsed ? parsed.role : "member";

			if (role !== undefined && !INVITE_ROLES.includes(role as (typeof INVITE_ROLES)[number])) {
				const response: ApiErrorResponse = {
					error: `Invalid role. Must be one of: ${INVITE_ROLES.join(", ")}`,
					code: API_ERROR_CODES.VALIDATION_ERROR,
				};
				return c.json(response, 400);
			}

			const resolvedRole = (role as (typeof INVITE_ROLES)[number]) ?? "member";
			const createdBy = c.get("userId");

			const invite = await createInvite(db, createdBy, resolvedRole ?? "member");

			return c.json({ code: invite.code, expiresAt: invite.expiresAt }, 201);
		});

		/**
		 * POST /api/auth/logout
		 *
		 * Revokes the current LoginSession.
		 * Only valid for Bearer token auth (authMethod === "login_session").
		 * Returns 400 if called with API key (no session to revoke).
		 */
		router.post("/logout", requireBoundary({ kind: "public-data" }), async (c) => {
			const authMethod = c.get("authMethod");

			if (authMethod !== "login_session") {
				const response: ApiErrorResponse = {
					error:
						"Logout requires Bearer token authentication (no session to revoke for API key auth)",
					code: API_ERROR_CODES.VALIDATION_ERROR,
				};
				return c.json(response, 400);
			}

			const sessionId = c.get("loginSessionId");
			if (sessionId) {
				await revokeLoginSession(db, sessionId);
			}

			return c.json({ ok: true });
		});
	}

	return router;
}
