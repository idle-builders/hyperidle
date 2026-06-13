/**
 * AH2: GET /api/harnesses — returns the deduped list of registered harness types.
 *
 * Auth: requires X-API-Key header matching HYPERIDLE_API_KEY env var (founder-level).
 * Response shape: { type: string; name: string; modelProviders: string[] }[]
 * Deduped by type — when multiple adapters share a type, only the first is returned.
 *
 * @lore AH2: This route exists so the SettingsAgents UI can populate the Harness
 * <select> from the live registry rather than a hardcoded list. The closed set
 * right now is ["builtin", "claude-code"] but the route stays registry-driven
 * so CLI adapters (aider, goose, opencode) appear automatically if installed.
 */

import { Hono } from "hono";
import type { AdapterPool } from "../harness/adapter-pool.js";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import { constantTimeStringEqual } from "../middleware/timing-safe.js";

export interface HarnessEntry {
	readonly type: string;
	readonly name: string;
	readonly modelProviders: readonly string[];
}

/**
 * Create a Hono router that exposes GET / → HarnessEntry[].
 * Mounted at /api/harnesses by app.ts.
 */
export function createHarnessRoutes(pool: AdapterPool): Hono {
	const router = new Hono();

	router.get("/", requireBoundary({ kind: "public-data" }), (c) => {
		const expectedKey = process.env.HYPERIDLE_API_KEY;
		const providedKey = c.req.header("X-API-Key");

		if (!(expectedKey && providedKey && constantTimeStringEqual(providedKey, expectedKey))) {
			return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
		}

		// Deduplicate by type — take the first adapter of each type.
		// Adapters without a type (e.g. remote workers with no type set) are excluded
		// from the harness selector since they can't be addressed by type.
		const seen = new Set<string>();
		const entries: HarnessEntry[] = [];

		for (const adapter of pool.list()) {
			if (!adapter.type) continue;
			if (seen.has(adapter.type)) continue;
			seen.add(adapter.type);
			entries.push({
				type: adapter.type,
				name: adapter.name,
				modelProviders: adapter.modelProviders,
			});
		}

		return c.json(entries);
	});

	return router;
}
