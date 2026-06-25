/**
 * AL5 — resolveSurface() unit tests.
 *
 * Covers:
 *   AC1/AC2 — adopted surface renders instead of base (invariant #1)
 *   AC3 — no adoption → base canvas (invariant #1)
 *   Scenario: version pin degrade "version-mismatch"
 *   Scenario: missing surfaceId → "missing-surface" degrade
 *   Invariant #2: at-most-one adoption is structural (unique constraint — tested at integration level)
 *   Invariant #5: surface is lens, never decision (resolveSurface never mutates artifact or adoption)
 *   Invariant #7: provenance + TrustTier on the manifest
 *   Invariant #6: adoption isolation by teamId (tested at integration level)
 *
 * RED PHASE: imports from modules that do not exist yet.
 */

import { describe, expect, it } from "vitest";
import type { ReviewCanvasComponent } from "../../review-artifact.js";
import type { AdoptionView, SurfaceSituation } from "@hyperidle/shared";
import { resolveSurface } from "../resolve-surface.js";
import { getSurfaceEntry, listSurfaces } from "../surface-registry.js";

// ── helpers ───────────────────────────────────────────────────────────────────

/** A minimal stub canvas component for tests — never renders. */
const BaseCanvasStub: ReviewCanvasComponent = () => null;
BaseCanvasStub.displayName = "BaseCanvasStub";

const SurfaceCanvasStub: ReviewCanvasComponent = () => null;
SurfaceCanvasStub.displayName = "SurfaceCanvasStub";

const SITUATION: SurfaceSituation = { tool: "stripe", kind: "action_operation" };

function makeAdoption(overrides?: Partial<AdoptionView>): AdoptionView {
	return {
		id: "sa-test-1",
		tool: "stripe",
		kind: "action_operation",
		surfaceId: "stripe-refund-review",
		pinnedVersion: "1.0.0",
		provenance: "first-party",
		trustTier: "vetted",
		surfaceTitle: "Stripe Refund Review",
		baseCanvas: "action_operation",
		...overrides,
	};
}

// ── AC3 / invariant #1 — no adoption → base canvas ────────────────────────────

describe("AL5 resolveSurface — AC3: no adoption → base canvas", () => {
	it("returns source:'base' and the base component when adoption is undefined", () => {
		// Invariant #1: with no adoption, returns the base canvas — the floor always works.
		const result = resolveSurface(SITUATION, undefined, BaseCanvasStub);
		expect(result.source).toBe("base");
		expect(result.component).toBe(BaseCanvasStub);
		expect(result.manifest).toBeUndefined();
		expect(result.degraded).toBeUndefined();
	});

	it("returns the base canvas for a non-stripe situation with no adoption", () => {
		const githubSituation: SurfaceSituation = { tool: "github", kind: "action_operation" };
		// Floor proof (§6 step 6): github has no adoption → base canvas.
		const result = resolveSurface(githubSituation, undefined, BaseCanvasStub);
		expect(result.source).toBe("base");
		expect(result.component).toBe(BaseCanvasStub);
	});
});

// ── AC1/AC2 / invariant #1 — adopted surface resolves (happy path) ─────────────

describe("AL5 resolveSurface — AC1/AC2: adopted surface wins over base", () => {
	it("returns source:'adopted' with the surface component when adoption names a known surfaceId", () => {
		// The registry must have "stripe-refund-review" registered.
		// This will fail until surface-registry.ts registers StripeRefundReview.
		const adoption = makeAdoption({ surfaceId: "stripe-refund-review" });
		const result = resolveSurface(SITUATION, adoption, BaseCanvasStub);
		expect(result.source).toBe("adopted");
		expect(result.component).not.toBe(BaseCanvasStub);
		expect(result.manifest).toBeDefined();
		expect(result.manifest?.id).toBe("stripe-refund-review");
	});

	it("returns the manifest with correct provenance and trustTier (invariant #7)", () => {
		// Invariant #7: provenance + TrustTier on the surface manifest.
		const adoption = makeAdoption();
		const result = resolveSurface(SITUATION, adoption, BaseCanvasStub);
		expect(result.manifest?.provenance).toBe("first-party");
		expect(result.manifest?.trustTier).toBe("vetted");
	});

	it("deterministic lookup: given two calls with same adoption, same component returned (invariant #1 — pure lookup)", () => {
		// Invariant #1: NO runtime auto-apply/scoring — pure Map lookup.
		const adoption = makeAdoption();
		const r1 = resolveSurface(SITUATION, adoption, BaseCanvasStub);
		const r2 = resolveSurface(SITUATION, adoption, BaseCanvasStub);
		// Same component reference — Map lookup is stable.
		expect(r1.component).toBe(r2.component);
	});
});

// ── Degrade scenarios ──────────────────────────────────────────────────────────

describe("AL5 resolveSurface — degrade: missing surfaceId", () => {
	it("returns source:'base' and degraded:'missing-surface' when surfaceId is not in registry", () => {
		// Architecture §7: adoption names a missing/unbuilt surfaceId → base + degrade.
		const adoption = makeAdoption({ surfaceId: "nonexistent-surface-xyz" });
		const result = resolveSurface(SITUATION, adoption, BaseCanvasStub);
		expect(result.source).toBe("base");
		expect(result.component).toBe(BaseCanvasStub);
		expect(result.degraded).toBe("missing-surface");
	});
});

describe("AL5 resolveSurface — degrade: version pin mismatch", () => {
	it("returns source:'adopted' with degraded:'version-mismatch' when pinnedVersion doesn't match registry", () => {
		// Architecture §7: version pin ≠ registry version → render entry but note mismatch (informational AL5).
		const adoption = makeAdoption({ pinnedVersion: "0.0.1-old" });
		const result = resolveSurface(SITUATION, adoption, BaseCanvasStub);
		// Still renders the entry (not degraded to base) — informational at AL5.
		expect(result.source).toBe("adopted");
		expect(result.degraded).toBe("version-mismatch");
		expect(result.component).not.toBe(BaseCanvasStub);
	});

	it("does NOT degrade when pinnedVersion matches registry version", () => {
		// Happy path: no version mismatch.
		const adoption = makeAdoption({ pinnedVersion: "1.0.0" });
		const result = resolveSurface(SITUATION, adoption, BaseCanvasStub);
		expect(result.degraded).toBeUndefined();
	});
});

// ── Invariant #5 — lens, never the decision ───────────────────────────────────

describe("AL5 resolveSurface — invariant #5: lens, never the decision", () => {
	it("never mutates the adoption object", () => {
		const adoption = makeAdoption();
		const adoptionCopy = { ...adoption };
		resolveSurface(SITUATION, adoption, BaseCanvasStub);
		// Pure function: adoption is unchanged.
		expect(adoption).toEqual(adoptionCopy);
	});

	it("never mutates the situation object", () => {
		const situation = { ...SITUATION };
		const situationCopy = { ...SITUATION };
		resolveSurface(situation, undefined, BaseCanvasStub);
		expect(situation).toEqual(situationCopy);
	});
});

// ── Registry: getSurfaceEntry / listSurfaces ───────────────────────────────────

describe("AL5 surface-registry — getSurfaceEntry", () => {
	it("returns the stripe-refund-review entry for that id", () => {
		const entry = getSurfaceEntry("stripe-refund-review");
		expect(entry).toBeDefined();
		expect(entry?.manifest.id).toBe("stripe-refund-review");
		expect(entry?.manifest.baseCanvas).toBe("action_operation");
		expect(entry?.manifest.provenance).toBe("first-party");
		expect(entry?.manifest.trustTier).toBe("vetted");
	});

	it("returns undefined for an unknown id", () => {
		expect(getSurfaceEntry("nonexistent-xyz")).toBeUndefined();
	});
});

describe("AL5 surface-registry — listSurfaces", () => {
	it("returns at least one entry (stripe-refund-review)", () => {
		const entries = listSurfaces();
		expect(entries.length).toBeGreaterThanOrEqual(1);
		const stripeEntry = entries.find(
			(e: { manifest: { id: string } }) => e.manifest.id === "stripe-refund-review",
		);
		expect(stripeEntry).toBeDefined();
	});

	it("every entry has a manifest with id, baseCanvas, provenance, trustTier", () => {
		const entries = listSurfaces();
		for (const entry of entries) {
			expect(entry.manifest.id).toBeTruthy();
			expect(entry.manifest.baseCanvas).toBeTruthy();
			expect(entry.manifest.provenance).toBeTruthy();
			expect(entry.manifest.trustTier).toBeTruthy();
		}
	});
});
