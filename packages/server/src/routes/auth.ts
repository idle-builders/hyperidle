/**
 * Authentication helper routes.
 *
 * `POST /api/auth/ws-token` mints a one-shot upgrade token that the client
 * uses to open the `/api/ws` WebSocket. The route itself is protected by
 * the standard `authMiddleware` (X-API-Key); successful issuance proves
 * the caller already has the master key, so handing out a derived,
 * single-use credential is safe.
 *
 * @lore I2 A3: this endpoint is the only legitimate source of WS upgrade
 * tokens. The WS handler MUST NOT accept the master HYPERIDLE_API_KEY
 * passed via `?token=` — only tokens minted here.
 *
 * @lore I2 review A1: the minted token must travel in the WS upgrade URL
 * (`?token=...`) because browsers cannot set Authorization headers on the
 * WebSocket handshake. We accept that residual risk because:
 *   (1) tokens are 32-byte random (256 bits) — unguessable,
 *   (2) TTL is 60s — replay window is bounded,
 *   (3) consumption is single-shot — the first reader wins,
 *   (4) the token authorizes session establishment ONLY — every
 *       subsequent WS message is gated by the established connection.
 * Future work: switch to `Sec-WebSocket-Protocol` subprotocol header
 * (RFC 6455 §1.9) so the token never enters URL space.
 */

import { Hono } from "hono";
import type { UpgradeTokenStore } from "../auth/upgrade-token-store.js";

export function createAuthRoutes(store: UpgradeTokenStore): Hono {
	const router = new Hono();

	router.post("/ws-token", (c) => {
		// Clients compute remaining seconds from `expiresAt` themselves; emitting
		// a server-derived `expiresInSec` adds a clock-skew footgun for no value.
		// L1 step9 (Adv-C1): bind the authenticated identity to the upgrade
		// token so the WS subscribe-authz path can check participant
		// membership. The header may be absent in legacy clients — in that
		// case the token still authenticates but per-thread subscriptions
		// fall back to "forbidden" (the broadcaster has no identity to
		// match against `thread.participants`).
		const identityId = c.req.header("X-Identity") ?? undefined;
		const { token, expiresAt } = store.issue(identityId);
		return c.json({ token, expiresAt });
	});

	return router;
}
