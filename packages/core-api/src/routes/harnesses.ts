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
 * handles both auth strategies; requireBoundary({ kind: "public-data" }) is
 * sufficient — matches how agents.ts and all other founder-auth endpoints work.
 *
 * @lore AM4 CHANGE 3 (Seam 3): discovery.disabled is stamped in the ROUTE HANDLER,
 * not in the pool. listCapabilityDescriptors() is sync + DB-free — it cannot read
 * server_config. The handler reads readServerConfig(db).harnessDisabled and maps
 * discovery.disabled per descriptor by type. "builtin" is exempt even if wrongly
 * in the persisted list (belt-and-suspenders with the select() exemption, CHANGE 2).
 *
 * @lore AM4 Security: POST /redetect spawns ~10 CLI probes (5 families × version+auth)
 * each with a 15s timeout. The global 300/min limiter does NOT protect this. A dedicated
 * route-scoped limiter (1 req / 5s per identity) is mounted ONLY on this route.
 * POST /:type/disabled is a single DB write — global 300/min is acceptable (no amplification).
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import type { HarnessCapabilityDescriptor } from "@hyperidle/shared";
import {
	type HarnessCapabilityReader,
	harnessCapabilityDescriptors,
	refreshHarnessDiscoveries,
} from "@hyperidle/shared";
import { requireBoundary } from "@hyperidle/shared/http";
import { Hono } from "hono";
import { createRateLimiter } from "../middleware/rate-limit.js";

/**
 * Helper: stamp discovery.disabled per descriptor based on harnessDisabled config.
 * "builtin" is ALWAYS exempt — guarded here independently of the persisted list.
 */
function stampDisabled(
	descriptors: HarnessCapabilityDescriptor[],
	harnessDisabled: readonly string[],
): HarnessCapabilityDescriptor[] {
	if (harnessDisabled.length === 0) return descriptors;
	return descriptors.map((d) => {
		// builtin is hard-exempt — never stamp disabled=true regardless of config
		const isDisabled = d.type !== "builtin" && harnessDisabled.includes(d.type);
		if (!isDisabled) return d;
		return {
			...d,
			discovery: { ...d.discovery, disabled: true },
		};
	});
}

/**
 * Create a Hono router that exposes the harness management endpoints.
 * Mounted at /api/harnesses by app.ts.
 *
 * AM4 CHANGE 3 (Seam 3): signature now includes db for readServerConfig access.
 */
export function createHarnessRoutes(pool: HarnessCapabilityReader, db: HyperIdleDb): Hono {
	const router = new Hono();

	// AM4: Dedicated rate limiter for POST /redetect — created per router instance so
	// test apps each get an independent bucket (avoids cross-test rate-limit bleed).
	// 1 call per 5s per identity — discoverLocalHarnesses() spawns ~10 execFile probes
	// with 15s timeout each; the global 300/min limiter alone allows a local fork-bomb. (WARNING 3)
	const redetectRateLimiter = createRateLimiter({ limit: 1, windowMs: 5_000 });

	// GET / — list all known harness descriptors with discovery.disabled stamped
	router.get("/", requireBoundary({ kind: "public-data" }), async (c) => {
		const { harnessDisabled } = await readServerConfig(db);
		const raw: HarnessCapabilityDescriptor[] = harnessCapabilityDescriptors(pool);
		const entries = stampDisabled(raw, harnessDisabled);
		return c.json(entries);
	});

	// POST /redetect — re-run discovery and return fresh descriptors (with disabled stamped)
	// requireBoundary must come before the rate-limiter so AF11 assertion sees it declared
	// even when the rate-limiter returns 429. The dedicated rate-limiter is route-scoped
	// (fork-bomb guard — WARNING 3): 1 call / 5s per identity.
	router.post(
		"/redetect",
		requireBoundary({ kind: "public-data" }),
		redetectRateLimiter,
		async (c) => {
			await refreshHarnessDiscoveries(pool);
			const { harnessDisabled } = await readServerConfig(db);
			const raw: HarnessCapabilityDescriptor[] = harnessCapabilityDescriptors(pool);
			const entries = stampDisabled(raw, harnessDisabled);
			return c.json(entries);
		},
	);

	// POST /:type/disabled — persist enable/disable for a specific harness type (Seam 4)
	// Global 300/min rate-limit (from app.ts middleware) — acceptable: single DB write, no CLI spawns.
	router.post("/:type/disabled", requireBoundary({ kind: "public-data" }), async (c) => {
		const harnessType = c.req.param("type");

		// Validate :type against the known descriptor list (400 on unknown)
		const allDescriptors = harnessCapabilityDescriptors(pool);
		const isKnown = allDescriptors.some((d) => d.type === harnessType);
		if (!isKnown) {
			return c.json({ error: "Unknown harness type", code: "UNKNOWN_HARNESS_TYPE" }, 400);
		}

		// Parse body
		let disabled: boolean;
		try {
			const body = (await c.req.json()) as { disabled?: unknown };
			if (typeof body.disabled !== "boolean") {
				return c.json({ error: "Body must be { disabled: boolean }", code: "INVALID_BODY" }, 400);
			}
			disabled = body.disabled;
		} catch {
			return c.json({ error: "Invalid JSON body", code: "INVALID_BODY" }, 400);
		}

		// Builtin-reject: {disabled:true} for "builtin" is forbidden (CHANGE 4 / Seam 2 write boundary)
		// {disabled:false} for builtin is allowed — enabling the always-on fallback is a harmless no-op.
		if (harnessType === "builtin" && disabled === true) {
			return c.json(
				{
					error: "Built-in harness cannot be disabled — it is the always-present fallback",
					code: "BUILTIN_NOT_DISABLEABLE",
				},
				409,
			);
		}

		// Read-modify-write: update the harnessDisabled list
		const current = await readServerConfig(db);
		const currentDisabled = current.harnessDisabled;
		let nextDisabled: string[];
		if (disabled) {
			// Add type if not already present
			nextDisabled = currentDisabled.includes(harnessType)
				? currentDisabled
				: [...currentDisabled, harnessType];
		} else {
			// Remove type (enable)
			nextDisabled = currentDisabled.filter((t) => t !== harnessType);
		}

		await updateServerConfig(db, { harnessDisabled: nextDisabled });

		// Return fresh descriptor list with discovery.disabled re-stamped
		const raw: HarnessCapabilityDescriptor[] = harnessCapabilityDescriptors(pool);
		const entries = stampDisabled(raw, nextDisabled);
		return c.json(entries);
	});

	return router;
}
