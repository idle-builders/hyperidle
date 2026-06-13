/**
 * AH2: GET /api/harnesses — returns the deduped list of registered harness types.
 *
 * Auth: founder-level auth via the global /api/* middleware (Bearer in shared mode,
 * X-API-Key in local mode). The public-data boundary confirms the authenticated
 * principal may read non-secret data. No in-route key check — see @lore below.
 * Response shape: { type: string; name: string; modelProviders: string[] }[]
 * Deduped by type — when multiple adapters share a type, only the first is returned.
 *
 * @lore AH2: This route exists so the SettingsAgents UI can populate the Harness
 * <select> from the live registry rather than a hardcoded list. The closed set
 * right now is ["builtin", "claude-code"] but the route stays registry-driven
 * so CLI adapters (aider, goose, opencode) appear automatically if installed.
 *
 * @lore AH2: Do NOT add an in-route X-API-Key check here. The plan explicitly
 * rejected that pattern (architecture.md:39 — wrong boundary for the Settings UI).
 * In shared mode the founder authenticates via Bearer (no X-API-Key sent), so an
 * in-route key check would 401 every Settings page load. The global /api/* middleware
 * handles both auth strategies; requireBoundary({ kind: "public-data" }) is
 * sufficient — matches how agents.ts and all other founder-auth endpoints work.
 */

import { Hono } from "hono";
import type { AdapterPool } from "../harness/adapter-pool.js";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";

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
