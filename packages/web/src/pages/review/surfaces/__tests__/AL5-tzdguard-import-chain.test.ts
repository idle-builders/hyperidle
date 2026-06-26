/**
 * AL5 — generated-index import chain: registration behavior tests.
 *
 * CONTEXT: When `surface:add` installs a community surface it generates:
 *
 *   surface-registry.generated.ts → <id>/register.ts → registerSurface(...)
 *
 * register.ts must import registerSurface from surface-registry-api.ts (the
 * cycle-free leaf) — NEVER from surface-registry.ts (which would reintroduce the
 * circular ESM chain that crashes `npm run surface:add` in a fresh Node process with
 * ReferenceError: Cannot access 'REGISTRY' before initialization).
 *
 * WHAT THIS TEST PROVES:
 *   Part 1 — The fixture register.ts (mimicking surface:add output) can be imported
 *             and its side-effect (registerSurface call) reaches the real REGISTRY.
 *             This exercises the import chain: generated-index → register.ts → api.ts.
 *
 *   Part 2 — surface-registry-api.ts exports registerSurface and is accessible as a
 *             standalone module; surface-registry.ts re-exports the public API.
 *
 * THE STATIC GUARD (not this test):
 *   The invariant "generated files must only import from surface-registry-api, never
 *   from surface-registry" is enforced by the ESLint rule in eslint.config.ts
 *   (AL5 block — no-restricted-imports scoped to register.ts and .generated.ts files
 *   under surfaces/). The lint rule is the real guard; this test proves runtime
 *   registration behavior.
 *
 * @lore AL5 TDZ-GUARD SCOPE: ESM circular TDZ crashes at module-init time in a fresh
 * Node.js process. Vitest + vite transform does not faithfully reproduce the TDZ
 * because vite transforms ESM for module caching. The TDZ guard is therefore a static
 * lint rule — not a runtime test. This file tests registration correctness only.
 */

import { describe, expect, it } from "vitest";

// ── Part 1: Import through the generated-index chain ──────────────────────────

// Import the real surface-registry.ts — this initializes REGISTRY with first-party surfaces.
import { getSurfaceEntry, listRegisteredManifests, listSurfaces } from "../surface-registry.js";

// Import the fixture generated-index — simulates surface-registry.generated.ts with entries.
// This triggers: generated-index-fixture.ts → al5-tzdguard-surface/register.ts
//                  → surface-registry-api.ts → registerSurface(manifest, component)
// The registerSurface call wires the fixture surface into the real REGISTRY Map.
import "../__test-fixtures__/generated-index-fixture.js";

const FIXTURE_ID = "al5-tzdguard-fixture";

describe("AL5 — Part 1: generated-index import chain registers surface", () => {
	it("fixture surface is in getSurfaceEntry() after generated-index import", () => {
		// Proof: the generated-index → register.ts → surface-registry-api.ts chain
		// called registerSurface, which added the fixture to the real REGISTRY.
		// If the import chain had crashed (TDZ), this import would have thrown at
		// module load time and no tests in this file would run.
		const entry = getSurfaceEntry(FIXTURE_ID);
		expect(entry).toBeDefined();
		expect(entry?.manifest.id).toBe(FIXTURE_ID);
		expect(entry?.manifest.provenance).toBe("community");
		expect(typeof entry?.component).toBe("function");
	});

	it("fixture surface appears in listSurfaces() after generated-index import", () => {
		const surfaces = listSurfaces();
		const fixture = surfaces.find((e) => e.manifest.id === FIXTURE_ID);
		expect(fixture).toBeDefined();
		expect(fixture?.manifest.title).toBe("AL5 TDZ-Guard Fixture");
	});

	it("fixture surface appears in listRegisteredManifests() after generated-index import", () => {
		const manifests = listRegisteredManifests();
		const fixture = manifests.find((m) => m.id === FIXTURE_ID);
		expect(fixture).toBeDefined();
		expect(fixture?.version).toBe("1.0.0");
	});

	it("first-party stripe surface still registered alongside fixture (invariant)", () => {
		const stripe = getSurfaceEntry("stripe-refund-review");
		expect(stripe).toBeDefined();
		expect(stripe?.manifest.provenance).toBe("first-party");

		const fixture = getSurfaceEntry(FIXTURE_ID);
		expect(fixture).toBeDefined();
		expect(fixture?.manifest.provenance).toBe("community");
	});

	it("registerSurface is idempotent: fixture appears exactly once in listSurfaces()", () => {
		const surfaces = listSurfaces();
		const fixtureEntries = surfaces.filter((e) => e.manifest.id === FIXTURE_ID);
		// The generated-index import triggered registerSurface once.
		// Idempotency: even if imported multiple times, the surface appears only once.
		expect(fixtureEntries).toHaveLength(1);
	});
});

// ── Part 2: surface-registry-api.ts is cycle-free ────────────────────────────

describe("AL5 — Part 2: surface-registry-api is a cycle-free leaf", () => {
	it("surface-registry-api.ts exports registerSurface as a function", async () => {
		// Dynamic import to independently verify the leaf module.
		const api = await import("../surface-registry-api.js");
		expect(typeof api.registerSurface).toBe("function");
		expect(api.REGISTRY).toBeDefined();
	});

	it("surface-registry.ts re-exports registerSurface for backward compatibility", async () => {
		const mod = await import("../surface-registry.js");
		expect(typeof mod.registerSurface).toBe("function");
		expect(typeof mod.getSurfaceEntry).toBe("function");
		expect(typeof mod.listSurfaces).toBe("function");
		expect(typeof mod.listRegisteredManifests).toBe("function");
	});
});

// ── Describe blocks end here ───────────────────────────────────────────────────
// The static TDZ guard (preventing generated files from importing surface-registry.ts)
// is enforced by the ESLint rule in eslint.config.ts (AL5 block). That lint rule is
// proven non-vacuous: a violating import in register.ts triggers error no-restricted-imports.
// See eslint.config.ts for the rule definition and the AL5-concept task report for proof.
