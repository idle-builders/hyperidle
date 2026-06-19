/**
 * AH2: GET /api/harnesses — returns the deduped list of registered harness types.
 *
 * Auth: founder-level auth via the global /api/* middleware (Bearer in shared mode,
 * X-API-Key in local mode). The public-data boundary confirms the authenticated
 * principal may read non-secret data. No in-route key check — see @lore below.
 * Response shape: HarnessCapabilityDescriptor[].
 * Legacy fields { type, name, modelProviders } stay top-level for existing selectors.
 * Deduped by type — when multiple adapters share a type, only the first descriptor is returned.
 *
 * @lore AH2/AM2: This route exists so the SettingsAgents UI can populate the
 * Harness <select> from the live registry, and AM2 extends it into the capability
 * descriptor surface for session dial-in/onboarding. Known first-class CLI
 * harnesses also appear as missing/readiness descriptors for guided setup.
 *
 * @lore AH2: Do NOT add an in-route X-API-Key check here. The plan explicitly
 * rejected that pattern (architecture.md:39 — wrong boundary for the Settings UI).
 * In shared mode the founder authenticates via Bearer (no X-API-Key sent), so an
 * in-route key check would 401 every Settings page load. The global /api/* middleware
 * handles both auth strategies; requireBoundary({ kind: "public-data" }) is
 * sufficient — matches how agents.ts and all other founder-auth endpoints work.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/shared";
import { Hono } from "hono";
import type { AdapterPool } from "../harness/adapter-pool.js";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";

export interface HarnessEntry {
	readonly type: string;
	readonly name: string;
	readonly modelProviders: readonly string[];
}

/**
 * Create a Hono router that exposes GET / → HarnessCapabilityDescriptor[].
 * Mounted at /api/harnesses by app.ts.
 */
export function createHarnessRoutes(pool: AdapterPool): Hono {
	const router = new Hono();

	router.get("/", requireBoundary({ kind: "public-data" }), (c) => {
		const entries: HarnessCapabilityDescriptor[] = pool.listCapabilityDescriptors();
		return c.json(entries);
	});

	return router;
}
