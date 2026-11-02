/**
 * @lore: ws-token — only source of WS upgrade tokens; must not accept master API key via ?token=; token in upgrade URL (browsers cannot set Authorization on WS)
 */

import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import type { UpgradeTokenStore } from "@hyperidle/user";
import { Hono } from "hono";

export function createAuthRoutes(store: UpgradeTokenStore | null): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	if (store) {
		router.post("/ws-token", (c) => {
			const { token, expiresAt } = store.issue(c.get("userId"));
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
