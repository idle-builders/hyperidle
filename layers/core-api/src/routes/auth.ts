/**
 * Authentication helper routes. The current user is `open_user` with no id —
 * there is no identity route here.
 *
 * `POST /api/auth/ws-token` mints a one-shot upgrade token that the client
 * uses to open the `/api/ws` WebSocket. The route itself is protected by
 * the standard auth middleware; successful issuance proves the caller is
 * authenticated, so handing out a derived, single-use credential is safe.
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
 * /ws-token is only mounted when tokenStore is non-null. In shared mode its
 * identity is the authenticated caller (`c.get("userId")`), never the
 * X-Identity header.
 */

import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { UpgradeTokenStore } from "@hyperidle/user";
import { Hono } from "hono";

export function createAuthRoutes(
	store: UpgradeTokenStore | null,
	sharedMode: boolean = false,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// POST /ws-token — only mounted when WebSocket support is active.
	if (store) {
		router.post("/ws-token", (c) => {
			// Clients compute remaining seconds from `expiresAt` themselves; emitting
			// a server-derived `expiresInSec` adds a clock-skew footgun for no value.
			// @lore S1: In shared mode, identity comes from the auth middleware context
			// (already authenticated via the API key). In local mode, we
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
	router.post("/worker-token", (c) => {
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

	return router;
}
