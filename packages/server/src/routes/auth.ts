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
 */

import { Hono } from "hono";
import type { UpgradeTokenStore } from "../services/upgrade-token-store.js";

export function createAuthRoutes(store: UpgradeTokenStore): Hono {
	const router = new Hono();

	router.post("/ws-token", (c) => {
		// Clients compute remaining seconds from `expiresAt` themselves; emitting
		// a server-derived `expiresInSec` adds a clock-skew footgun for no value.
		const { token, expiresAt } = store.issue();
		return c.json({ token, expiresAt });
	});

	return router;
}
