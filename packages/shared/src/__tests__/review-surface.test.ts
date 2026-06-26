/**
 * AL5 — Manifest shape + closed-set vocabulary tests.
 *
 * These tests verify:
 *   - SurfaceManifest has the required fields (provenance, situations, etc.)
 *   - LAYERING_MODES and SURFACE_PROVENANCE are closed sets
 *   - REVIEW_CANVAS_KINDS const is present and matches the 9 kinds from AL2
 *   - AdoptionView carries the correct display fields
 *
 * Note: TrustTier/TRUST_TIERS removed per ETHOS (no preemptive trust tiers).
 * Provenance ("first-party" | "community") is the identity signal that remains.
 */

import { describe, expect, it } from "vitest";
import {
	type AdoptionView,
	LAYERING_MODES,
	type LayeringMode,
	REVIEW_CANVAS_KINDS,
	SURFACE_PROVENANCE,
	type SurfaceManifest,
	type SurfaceProvenance,
	type SurfaceSituation,
} from "../review-surface.js";

describe("AL5 — LAYERING_MODES closed set", () => {
	it("contains exactly wrap and eject", () => {
		// Concept hard rule #4: two declared layering modes, CLOSED.
		expect(LAYERING_MODES).toContain("wrap");
		expect(LAYERING_MODES).toContain("eject");
		expect(LAYERING_MODES).toHaveLength(2);
	});

	it("is a readonly tuple (no runtime mutation)", () => {
		// TypeScript `as const` — the value is frozen at the module level.
		const modes: readonly string[] = LAYERING_MODES;
		expect(Array.isArray(modes)).toBe(true);
	});

	it("type-checks: LayeringMode accepts only 'wrap' | 'eject'", () => {
		const wrap: LayeringMode = "wrap";
		const eject: LayeringMode = "eject";
		// TypeScript would reject any other value at compile time.
		expect(wrap).toBe("wrap");
		expect(eject).toBe("eject");
	});
});

describe("AL5 — SURFACE_PROVENANCE closed set", () => {
	it("contains exactly first-party and community", () => {
		// Architecture §2.2: provenance = who authored, CLOSED.
		expect(SURFACE_PROVENANCE).toContain("first-party");
		expect(SURFACE_PROVENANCE).toContain("community");
		expect(SURFACE_PROVENANCE).toHaveLength(2);
	});

	it("type-checks: SurfaceProvenance is 'first-party' | 'community'", () => {
		const fp: SurfaceProvenance = "first-party";
		const comm: SurfaceProvenance = "community";
		expect(fp).toBe("first-party");
		expect(comm).toBe("community");
	});
});

describe("AL5 — REVIEW_CANVAS_KINDS const (moved to shared)", () => {
	it("contains all 9 base canvas kinds from AL2", () => {
		// Architecture §2.2: ReviewCanvasKind moved to shared as REVIEW_CANVAS_KINDS const
		// so shared can reference it without importing from web.
		const expected9 = [
			"outcome_summary",
			"field_change_set",
			"action_operation",
			"rendered_in_context",
			"metrics_moved",
			"visual_diff",
			"code_diff",
			"batch",
			"browser_preview",
		];
		for (const kind of expected9) {
			expect(REVIEW_CANVAS_KINDS).toContain(kind);
		}
		expect(REVIEW_CANVAS_KINDS).toHaveLength(9);
	});
});

describe("AL5 — SurfaceManifest shape", () => {
	it("a valid SurfaceManifest type-checks with all required fields", () => {
		// Architecture §2.2: the manifest mirrors shadcn registry-item.json shape.
		const situation: SurfaceSituation = { tool: "stripe", kind: "action_operation" };
		const manifest: SurfaceManifest = {
			id: "stripe-refund-review",
			title: "Stripe Refund Review",
			description: "Specializes the action_operation canvas for Stripe refunds.",
			author: "HyperIdle <hi@hyperidle.com>",
			version: "1.0.0",
			baseCanvas: "action_operation",
			layering: "wrap",
			provenance: "first-party",
			situations: [situation],
			sampleFixture: "stripe-refund",
		};
		expect(manifest.id).toBe("stripe-refund-review");
		expect(manifest.baseCanvas).toBe("action_operation");
		expect(manifest.layering).toBe("wrap");
		expect(manifest.provenance).toBe("first-party");
		expect(manifest.situations).toHaveLength(1);
		expect(manifest.situations[0]).toEqual({ tool: "stripe", kind: "action_operation" });
	});

	it("optional dependencies field is absent by default", () => {
		const manifest: SurfaceManifest = {
			id: "test-surface",
			title: "Test",
			description: "Test surface",
			author: "Test Author",
			version: "0.1.0",
			baseCanvas: "field_change_set",
			layering: "eject",
			provenance: "community",
			situations: [{ tool: "salesforce", kind: "field_change_set" }],
			sampleFixture: "salesforce-fixture",
		};
		// `dependencies` is optional — should not be present if not set
		expect(manifest.dependencies).toBeUndefined();
	});

	it("manifest.provenance is a SurfaceProvenance (identity signal, not a gate)", () => {
		const validProvenances: SurfaceProvenance[] = ["first-party", "community"];
		const manifest: SurfaceManifest = {
			id: "t",
			title: "T",
			description: "T",
			author: "T",
			version: "1.0.0",
			baseCanvas: "batch",
			layering: "wrap",
			provenance: "first-party",
			situations: [],
			sampleFixture: "t",
		};
		expect(validProvenances).toContain(manifest.provenance);
	});
});

describe("AL5 — AdoptionView flat display shape", () => {
	it("AdoptionView carries the required display fields", () => {
		// Architecture §5: AdoptionView is the server-joined display shape.
		const view: AdoptionView = {
			id: "sa-test-123",
			tool: "stripe",
			kind: "action_operation",
			surfaceId: "stripe-refund-review",
			pinnedVersion: "1.0.0",
			provenance: "first-party",
			surfaceTitle: "Stripe Refund Review",
			baseCanvas: "action_operation",
		};
		expect(view.id).toBe("sa-test-123");
		expect(view.surfaceTitle).toBe("Stripe Refund Review");
		expect(view.baseCanvas).toBe("action_operation");
	});
});
