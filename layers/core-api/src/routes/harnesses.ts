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
 * discovery.disabled per descriptor by type. "builtin" is exempt even if wrongly
 * in the persisted list (belt-and-suspenders with the select() exemption, CHANGE 2).
 *
 * @lore AM4: POST /redetect spawns ~10 CLI probes (5 families x version+auth), each with a
 * 15s timeout. Its dedicated rate limiter was removed with the rest of the limiter in the AU20
 * delete pass; nothing throttles this route now.
 */

import { readCredentials } from "@hyperidle/credentials";
import type { HyperIdleDb } from "@hyperidle/db";
import type { ModelGatewayConfig } from "@hyperidle/domain-model";
import { credentialNameForProvider } from "@hyperidle/domain-model";
import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import type { HarnessCapabilityReader } from "@hyperidle/harness-protocol";
import { readServerConfig } from "@hyperidle/settings";
import { Hono } from "hono";

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
 * Helper: correct the built-in gateway's readiness against stored credentials.
 *
 * `probeBuiltinGateway` reads `process.env` only — it cannot see the credential
 * table. A key entered through setup or the Credentials tab therefore leaves the
 * built-in row reporting "unauthenticated" while the runtime resolves it fine,
 * telling the user to add a key they already added.
 *
 * Readiness here means what it means at call time (`resolveProvider`): every
 * provider the tiers point at has a credential stored. A partially-configured
 * gateway stays unauthenticated, because a session on the uncovered tier would
 * still fail.
 *
 * @lore AW1: stamped in the ROUTE, not the pool — same seam and same reason as
 * `stampDisabled`. The pool is sync + DB-free by design (AM4 CHANGE 3).
 */
async function stampBuiltinCredential(
	descriptors: HarnessCapabilityDescriptor[],
	db: HyperIdleDb,
	modelGateway: ModelGatewayConfig,
): Promise<HarnessCapabilityDescriptor[]> {
	const builtin = descriptors.find((d) => d.type === "builtin");
	// Only an unauthenticated gateway can be upgraded — a probe that already found
	// an env credential is right, and no stored key can make a "missing" harness present.
	if (builtin?.discovery.state !== "unauthenticated") return descriptors;

	const required = new Set(
		Object.values(modelGateway).map((tier) => credentialNameForProvider(tier.provider)),
	);
	const stored = await readCredentials(db);
	const present = new Set(stored.filter((c) => c.validationState !== "absent").map((c) => c.name));
	const covered = [...required].every((name) => present.has(name));
	if (!covered) return descriptors;

	return descriptors.map((d) =>
		d.type === "builtin"
			? { ...d, discovery: { ...d.discovery, state: "ready", reason: undefined } }
			: d,
	);
}

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
		const { harnessDisabled, modelGateway } = await readServerConfig(db);
		const raw: HarnessCapabilityDescriptor[] = pool.describe();
		const entries = await stampBuiltinCredential(
			stampDisabled(raw, harnessDisabled),
			db,
			modelGateway,
		);
		return c.json(entries);
	});

	// POST /redetect — re-run discovery and return fresh descriptors (with disabled stamped).
	router.post("/redetect", async (c) => {
		// AU36 D5: the reach re-probe rides the SAME bounded moment — awaited
		// alongside the discovery refresh BEFORE responding.
		await Promise.all([pool.refresh(), onHarnessRedetect?.()]);
		const { harnessDisabled, modelGateway } = await readServerConfig(db);
		const raw: HarnessCapabilityDescriptor[] = pool.describe();
		const entries = await stampBuiltinCredential(
			stampDisabled(raw, harnessDisabled),
			db,
			modelGateway,
		);
		return c.json(entries);
	});

	return router;
}
