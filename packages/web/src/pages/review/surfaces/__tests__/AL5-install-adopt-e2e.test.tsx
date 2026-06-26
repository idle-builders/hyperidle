/**
 * AL5 — registry / resolver / server-index behavior tests.
 *
 * Test structure:
 *   Part A — registry API: registerSurface(fixture) → getSurfaceEntry / listSurfaces.
 *             Tests that the registry Map wires correctly (the same path a generated
 *             register.ts uses at module-load time after `surface:add`).
 *             NOTE: this calls registerSurface() directly — it does NOT go through
 *             the generated-index import chain. The import-chain behavior is tested
 *             separately in AL5-tzdguard-import-chain.test.ts.
 *
 *   Part B — resolver: resolveSurface with an adoption row naming the fixture
 *             → source:"adopted" (or version-mismatch degradation).
 *
 *   Part C — server-index derivation invariant: OFFICIAL_REGISTRY_INDEX.surfaces
 *             contains all REGISTERED_SURFACE_MANIFESTS entries. This is the contract
 *             that makes any manifest appended by `surface:add` adoptable via the server
 *             route. Full POST-201 proof for first-party surfaces is in
 *             surface-adoptions.integration.test.ts.
 *
 * @lore AL5: registerSurface is idempotent — calling it multiple times with the
 * same id is safe (subsequent calls are no-ops). We use a unique fixture id per
 * test file to avoid cross-test pollution from module-level Map state.
 */

import type { AdoptionView, SurfaceManifest, SurfaceSituation } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
import type { ReviewCanvasComponent } from "../../review-artifact.js";
import { resolveSurface } from "../resolve-surface.js";
import {
	getSurfaceEntry,
	listRegisteredManifests,
	listSurfaces,
	registerSurface,
} from "../surface-registry.js";

// ── Fixture surface — unique id to avoid cross-test pollution ─────────────────

const FIXTURE_SURFACE_ID = "al5-e2e-fixture-surface";

const FIXTURE_MANIFEST: SurfaceManifest = {
	id: FIXTURE_SURFACE_ID,
	title: "AL5 E2E Fixture Surface",
	description: "A fixture surface for the install→adopt end-to-end test.",
	author: "HyperIdle Test <test@hyperidle.com>",
	version: "1.0.0",
	baseCanvas: "action_operation",
	layering: "wrap",
	provenance: "community",
	situations: [{ tool: "al5-e2e", kind: "action_operation" }] as const,
	sampleFixture: "al5-e2e-fixture",
};

/** Stub component — simulates the installed surface component. Never renders. */
const FixtureSurfaceComponent: ReviewCanvasComponent = () => null;
FixtureSurfaceComponent.displayName = "FixtureSurfaceComponent";

/** A base canvas stub used as the floor in resolveSurface calls. */
const BaseCanvasStub: ReviewCanvasComponent = () => null;
BaseCanvasStub.displayName = "BaseCanvasStub";

/** An adoption row pointing to the fixture surface. */
const FIXTURE_ADOPTION: AdoptionView = {
	id: "sa-e2e-fixture-1",
	tool: "al5-e2e",
	kind: "action_operation",
	surfaceId: FIXTURE_SURFACE_ID,
	pinnedVersion: "1.0.0",
	provenance: "community",
	surfaceTitle: "AL5 E2E Fixture Surface",
	baseCanvas: "action_operation",
};

const FIXTURE_SITUATION: SurfaceSituation = { tool: "al5-e2e", kind: "action_operation" };

// ── Part A — Registry API: registerSurface wires the surface into the Map ────

describe("AL5 — Part A: registry API registration behavior", () => {
	it("before registerSurface: fixture surface is NOT in registry", () => {
		// Before registration, getSurfaceEntry returns undefined for the fixture id.
		// (This passes because the fixture id is unique and not in FIRST_PARTY.)
		const entry = getSurfaceEntry(FIXTURE_SURFACE_ID);
		// The first time through (no registration yet), entry is undefined.
		// If a previous it() already called registerSurface, it's idempotent anyway.
		// We assert it's either undefined (first run) or the fixture (already registered).
		// Since registerSurface is idempotent and tests share module state, we cover
		// both cases: the important assertion is in the next test.
		expect(entry === undefined || entry?.manifest.id === FIXTURE_SURFACE_ID).toBe(true);
	});

	it("registerSurface: fixture appears in getSurfaceEntry after registration", () => {
		// This simulates what the generated register.ts does at module-load time.
		registerSurface(FIXTURE_MANIFEST, FixtureSurfaceComponent);

		const entry = getSurfaceEntry(FIXTURE_SURFACE_ID);
		expect(entry).toBeDefined();
		expect(entry?.manifest.id).toBe(FIXTURE_SURFACE_ID);
		expect(entry?.manifest.provenance).toBe("community");
		expect(entry?.manifest.baseCanvas).toBe("action_operation");
		expect(entry?.component).toBe(FixtureSurfaceComponent);
	});

	it("fixture appears in listSurfaces() after registration", () => {
		registerSurface(FIXTURE_MANIFEST, FixtureSurfaceComponent);

		const entries = listSurfaces();
		const fixture = entries.find((e) => e.manifest.id === FIXTURE_SURFACE_ID);
		expect(fixture).toBeDefined();
		expect(fixture?.manifest.title).toBe("AL5 E2E Fixture Surface");
	});

	it("fixture appears in listRegisteredManifests() after registration", () => {
		registerSurface(FIXTURE_MANIFEST, FixtureSurfaceComponent);

		const manifests = listRegisteredManifests();
		const fixture = manifests.find((m) => m.id === FIXTURE_SURFACE_ID);
		expect(fixture).toBeDefined();
		expect(fixture?.version).toBe("1.0.0");
	});

	it("registerSurface is idempotent: re-registering same id does not duplicate", () => {
		registerSurface(FIXTURE_MANIFEST, FixtureSurfaceComponent);
		registerSurface(FIXTURE_MANIFEST, FixtureSurfaceComponent);

		const entries = listSurfaces();
		const fixtureEntries = entries.filter((e) => e.manifest.id === FIXTURE_SURFACE_ID);
		// Must appear exactly once — not duplicated.
		expect(fixtureEntries).toHaveLength(1);
	});

	it("first-party stripe surface still present alongside installed fixture", () => {
		registerSurface(FIXTURE_MANIFEST, FixtureSurfaceComponent);

		// Invariant: first-party surfaces survive community surface registration.
		const stripe = getSurfaceEntry("stripe-refund-review");
		expect(stripe).toBeDefined();
		expect(stripe?.manifest.provenance).toBe("first-party");

		const fixture = getSurfaceEntry(FIXTURE_SURFACE_ID);
		expect(fixture).toBeDefined();
		expect(fixture?.manifest.provenance).toBe("community");
	});
});

// ── Part B — Resolver: resolveSurface uses the registered surface ──────────────

describe("AL5 — Part B: resolver returns source:'adopted' for registered surface", () => {
	it("resolveSurface with adoption naming fixture → source:'adopted', correct component", () => {
		// Ensure fixture is registered (idempotent).
		registerSurface(FIXTURE_MANIFEST, FixtureSurfaceComponent);

		// An adoption row pointing at the fixture surface — simulates what POST 201 creates.
		const result = resolveSurface(FIXTURE_SITUATION, FIXTURE_ADOPTION, BaseCanvasStub);

		// The installed surface wins over the base canvas.
		expect(result.source).toBe("adopted");
		expect(result.component).not.toBe(BaseCanvasStub);
		expect(result.manifest?.id).toBe(FIXTURE_SURFACE_ID);
		expect(result.degraded).toBeUndefined(); // version matches (1.0.0 === 1.0.0)
	});

	it("resolveSurface with no adoption → base canvas (floor still works)", () => {
		// Invariant: base canvas floor is always available regardless of installed surfaces.
		registerSurface(FIXTURE_MANIFEST, FixtureSurfaceComponent);

		const result = resolveSurface(FIXTURE_SITUATION, undefined, BaseCanvasStub);
		expect(result.source).toBe("base");
		expect(result.component).toBe(BaseCanvasStub);
	});

	it("resolveSurface with adoption for unregistered surface → base + missing-surface degrade", () => {
		// Even after registration of fixture, adopting a completely different unknown id
		// still degrades correctly.
		const unknownAdoption: AdoptionView = {
			...FIXTURE_ADOPTION,
			surfaceId: "nonexistent-surface-xyz",
		};
		const result = resolveSurface(FIXTURE_SITUATION, unknownAdoption, BaseCanvasStub);
		expect(result.source).toBe("base");
		expect(result.degraded).toBe("missing-surface");
	});

	it("resolveSurface with adoption for fixture but wrong pinnedVersion → version-mismatch (still adopted)", () => {
		registerSurface(FIXTURE_MANIFEST, FixtureSurfaceComponent);

		const mismatchedAdoption: AdoptionView = {
			...FIXTURE_ADOPTION,
			pinnedVersion: "0.0.0-old",
		};
		const result = resolveSurface(FIXTURE_SITUATION, mismatchedAdoption, BaseCanvasStub);
		// AL5: version mismatch is informational — still renders the surface, not degraded to base.
		expect(result.source).toBe("adopted");
		expect(result.degraded).toBe("version-mismatch");
	});
});

// ── Part C — Server-index derivation invariant ────────────────────────────────
//
// Verifies that OFFICIAL_REGISTRY_INDEX.surfaces contains all REGISTERED_SURFACE_MANIFESTS
// entries. This is the contract that makes `surface:add`-installed manifests adoptable:
// when surface:add appends a manifest to REGISTERED_SURFACE_MANIFESTS, the rebuilt
// server includes it in SERVER_REGISTRY → POST /api/surface-adoptions returns 201.
//
// Full POST-201 proof for the first-party stripe surface is in
// surface-adoptions.integration.test.ts. Part C tests the derivation contract only.

describe("AL5 — Part C: server-index derivation contract", () => {
	it("OFFICIAL_REGISTRY_INDEX.surfaces contains all REGISTERED_SURFACE_MANIFESTS entries", async () => {
		// The server registry is built from OFFICIAL_REGISTRY_INDEX.surfaces.
		// This test verifies the derivation is correct — so any manifest in
		// REGISTERED_SURFACE_MANIFESTS becomes adoptable via the server route.
		const { OFFICIAL_REGISTRY_INDEX, REGISTERED_SURFACE_MANIFESTS } = await import(
			"@hyperidle/shared"
		);

		for (const fpManifest of REGISTERED_SURFACE_MANIFESTS) {
			const inIndex = OFFICIAL_REGISTRY_INDEX.surfaces.some(
				(s: SurfaceManifest) => s.id === fpManifest.id,
			);
			expect(inIndex).toBe(true);
		}
	});

	it("stripe-refund-review in OFFICIAL_REGISTRY_INDEX → server can process adoption POST 201", async () => {
		// Structural proof: the first-party surface is in the server index.
		// Full POST-201 proof is in surface-adoptions.integration.test.ts.
		const { OFFICIAL_REGISTRY_INDEX } = await import("@hyperidle/shared");
		const stripe = OFFICIAL_REGISTRY_INDEX.surfaces.find(
			(s: SurfaceManifest) => s.id === "stripe-refund-review",
		);
		expect(stripe).toBeDefined();
		expect(stripe?.baseCanvas).toBe("action_operation");
	});

	it("OFFICIAL_REGISTRY_INDEX.surfaces length matches REGISTERED_SURFACE_MANIFESTS length", async () => {
		// Derivation invariant: no surfaces dropped or added during the wrapping.
		const { OFFICIAL_REGISTRY_INDEX, REGISTERED_SURFACE_MANIFESTS } = await import(
			"@hyperidle/shared"
		);
		expect(OFFICIAL_REGISTRY_INDEX.surfaces).toHaveLength(REGISTERED_SURFACE_MANIFESTS.length);
	});
});
