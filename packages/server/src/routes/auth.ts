/**
 * Authentication helper routes.
 *
 * `GET /api/auth/me` returns the authenticated user's identity from factorySettings.
 * Always mounted (regardless of WebSocket support).
 *
 * `POST /api/auth/ws-token` mints a one-shot upgrade token that the client
 * uses to open the `/api/ws` WebSocket. The route itself is protected by
 * the standard `authMiddleware` (X-API-Key); successful issuance proves
 * the caller already has the master key, so handing out a derived,
 * single-use credential is safe.
 *
 * @lore I2 A3: this endpoint is the only legitimate source of WS upgrade
 * tokens. The WS handler MUST NOT accept the master HYPERIDLE_API_KEY
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
 * Future work: switch to `Sec-WebSocket-Protocol` subprotocol header
 * (RFC 6455 §1.9) so the token never enters URL space.
 *
 * @lore M3 A4: createAuthRoutes now accepts an optional db parameter so
 * GET /api/auth/me can read the full founder profile from factorySettings.
 * The /me endpoint is ALWAYS mounted; /ws-token is only mounted when
 * tokenStore is non-null. The restructuring ensures /me is available in
 * all deployments, not just those with WebSocket support.
 */

import { factorySettings, type HyperIdleDb } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { UpgradeTokenStore } from "../auth/upgrade-token-store.js";
import type { HyperIdleEnv } from "../middleware/auth.js";

export function createAuthRoutes(
	db: HyperIdleDb | null,
	store: UpgradeTokenStore | null,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// GET /me — returns the authenticated founder's identity.
	// M3 A4: always available, reads from factorySettings when db is present.
	router.get("/me", (c) => {
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

		const nameRow = db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, "founder_name"))
			.get();
		const emailRow = db
			.select()
			.from(factorySettings)
			.where(eq(factorySettings.key, "founder_email"))
			.get();

		return c.json({
			id: userId,
			name: nameRow?.value ?? "Founder",
			email: emailRow?.value ?? "",
			avatarUrl: null,
		});
	});

	// POST /ws-token — only mounted when WebSocket support is active.
	if (store) {
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
	}

	return router;
}
