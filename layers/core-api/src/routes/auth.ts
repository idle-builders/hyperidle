/**
 * @lore: ws-token — only source of WS upgrade tokens; must not accept master API key via ?token=; token in upgrade URL (browsers cannot set Authorization on WS)
 */

import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { UpgradeTokenStore } from "@hyperidle/user";
import { Hono } from "hono";

export function createAuthRoutes(
	store: UpgradeTokenStore | null,
	sharedMode: boolean = false,
): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	if (store) {
		router.post("/ws-token", (c) => {
			// In shared mode, identity comes from auth middleware (authenticated via API key).
			// In local mode, fall back to X-Identity header — trusted because local mode requires the master API key.
			const identityId = sharedMode
				? c.get("userId")
				: (c.req.header("X-Identity") ?? c.get("userId"));
			const { token, expiresAt } = store.issue(identityId);
			return c.json({ token, expiresAt });
		});
	}

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
