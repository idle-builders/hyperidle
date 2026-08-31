/**
 * AH2: GET /api/harnesses — returns the deduped list of registered harness types.
 * AM4: Adds POST /api/harnesses/redetect and POST /api/harnesses/:type/disabled.
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
 * sufficient — matches how agents.ts and all other founder-auth endpoints work.
 *
 * @lore AM4 CHANGE 3 (Seam 3): discovery.disabled is stamped in the ROUTE HANDLER,
 * not in the pool. listCapabilityDescriptors() is sync + DB-free — it cannot read
 * server_config. The handler reads readServerConfig(db).harnessDisabled and maps
 * discovery.disabled per descriptor by type. Every harness is disableable — the
 * built-in one was the only exemption, and it is gone.
 *
 * @lore AM4: POST /redetect spawns ~10 CLI probes (5 families x version+auth), each with a
 * 15s timeout. Its dedicated rate limiter was removed with the rest of the limiter in the AU20
 * delete pass; nothing throttles this route now.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { readServerConfig } from "@hyperidle/settings";
import { Hono } from "hono";
import type { HarnessCapabilityReader } from "../services/harness-capability-reader.js";

/** Helper: stamp discovery.disabled per descriptor based on harnessDisabled config. */
function stampDisabled(
	descriptors: HarnessCapabilityDescriptor[],
	harnessDisabled: readonly string[],
): HarnessCapabilityDescriptor[] {
	if (harnessDisabled.length === 0) return descriptors;
	return descriptors.map((d) => {
		if (!harnessDisabled.includes(d.type)) return d;
		return {
			...d,
			discovery: { ...d.discovery, disabled: true },
		};
	});
}

// @lore A second stamping pass used to sit here, correcting the built-in
// gateway's readiness against the credential table: its probe read `process.env`
// only, so a key entered through setup left the row saying "unauthenticated"
// while the runtime resolved it fine. No harness reports readiness from a stored
// credential any more — a CLI is ready when its binary is installed and logged
// in, which its own probe can see — so the pass has nothing left to correct.

/**
 * Create a Hono router that exposes the harness management endpoints.
 * Mounted at /api/harnesses by app.ts.
 *
 * AM4 CHANGE 3 (Seam 3): signature now includes db for readServerConfig access.
 *
 * @param onHarnessRedetect AU36 D5 — awaited alongside the discovery refresh
 * in POST /redetect (the inherited-reach re-probe, wired by the Application).
 * Plain `() => Promise<void>` on purpose: no cross-layer type import.
 */
export function createHarnessRoutes(
	pool: HarnessCapabilityReader,
	db: HyperIdleDb,
	onHarnessRedetect?: () => Promise<void>,
): Hono {
	const router = new Hono();

	// GET / — list all known harness descriptors with discovery.disabled stamped
	router.get("/", async (c) => {
		const { harnessDisabled } = await readServerConfig(db);
		const raw: HarnessCapabilityDescriptor[] = pool.describe();
		return c.json(stampDisabled(raw, harnessDisabled));
	});

	// POST /redetect — re-run discovery and return fresh descriptors (with disabled stamped).
	router.post("/redetect", async (c) => {
		// AU36 D5: the reach re-probe rides the SAME bounded moment — awaited
		// alongside the discovery refresh BEFORE responding.
		await Promise.all([pool.refresh(), onHarnessRedetect?.()]);
		const { harnessDisabled } = await readServerConfig(db);
		const raw: HarnessCapabilityDescriptor[] = pool.describe();
		return c.json(stampDisabled(raw, harnessDisabled));
	});

	return router;
}
