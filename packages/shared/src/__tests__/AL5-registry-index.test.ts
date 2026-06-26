/**
 * AL5 TDD RED — Registry index format + loader.
 *
 * Covers:
 *   AC1: a function that loads a registry index (JSON catalog) and returns its surfaces
 *   AC1: the curated official index parses and contains the Stripe surface
 *   AC1: an index can be loaded from a URL (fetch-based)
 *   AC4: community index by URL — loadRegistryIndex(url) returns surfaces from that URL
 *
 * These tests import from modules that do not yet exist:
 *   @hyperidle/shared — loadRegistryIndex, OFFICIAL_REGISTRY_INDEX, RegistryIndex type
 *
 * They will fail with "module not found" or "not exported" — the correct RED reason.
 *
 * @lore AL5 RED: The loader lives in shared (server + web both consume it).
 * The official index is a constant catalog in shared; community indexes are
 * fetched by URL at runtime. The loader normalises fetch/import.meta differences.
 */

import { describe, expect, it, vi } from "vitest";

// These imports will FAIL until the modules are implemented (RED phase).
import {
	loadRegistryIndex,
	OFFICIAL_REGISTRY_INDEX,
	type RegistryIndex,
} from "../registry-index.js";

// ── AC1: Official index is a valid RegistryIndex with the Stripe surface ─────

describe("AL5 registry-index — OFFICIAL_REGISTRY_INDEX constant", () => {
	it("is defined and has the required RegistryIndex shape", () => {
		// Must have name, version, surfaces array.
		expect(OFFICIAL_REGISTRY_INDEX).toBeDefined();
		expect(typeof OFFICIAL_REGISTRY_INDEX.name).toBe("string");
		expect(typeof OFFICIAL_REGISTRY_INDEX.version).toBe("string");
		expect(Array.isArray(OFFICIAL_REGISTRY_INDEX.surfaces)).toBe(true);
	});

	it("contains the stripe-refund-review surface as a first-party entry", () => {
		const stripe = OFFICIAL_REGISTRY_INDEX.surfaces.find(
			(s: { id: string }) => s.id === "stripe-refund-review",
		);
		expect(stripe).toBeDefined();
		expect(stripe?.baseCanvas).toBe("action_operation");
		expect(stripe?.provenance).toBe("first-party");
	});

	it("every surface entry has the required SurfaceManifest fields", () => {
		for (const surface of OFFICIAL_REGISTRY_INDEX.surfaces) {
			expect(surface.id).toBeTruthy();
			expect(surface.title).toBeTruthy();
			expect(surface.baseCanvas).toBeTruthy();
			expect(surface.provenance).toBeTruthy();
			expect(surface.version).toBeTruthy();
			expect(Array.isArray(surface.situations)).toBe(true);
		}
	});
});

// ── AC1: loadRegistryIndex — parses a JSON catalog from a URL ─────────────────

describe("AL5 registry-index — loadRegistryIndex(url)", () => {
	it("returns a RegistryIndex when the URL serves valid JSON", async () => {
		// Arrange: stub fetch to return a well-formed RegistryIndex JSON.
		const indexPayload: RegistryIndex = {
			name: "community-test-index",
			version: "0.1.0",
			surfaces: [
				{
					id: "acme-widget-review",
					title: "Acme Widget Review",
					description: "A review surface for Acme widgets.",
					author: "Acme <hi@acme.com>",
					version: "1.0.0",
					baseCanvas: "action_operation",
					layering: "wrap",
					provenance: "community",
					situations: [{ tool: "acme", kind: "action_operation" }],
					sampleFixture: "acme-widget",
				},
			],
		};

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => indexPayload,
			}),
		);

		const result = await loadRegistryIndex("https://example.com/registry.json");

		expect(result.name).toBe("community-test-index");
		expect(result.surfaces).toHaveLength(1);
		expect(result.surfaces[0]?.id).toBe("acme-widget-review");

		vi.unstubAllGlobals();
	});

	it("throws when the URL is unreachable (fetch fails)", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

		await expect(loadRegistryIndex("https://unreachable.invalid/registry.json")).rejects.toThrow();

		vi.unstubAllGlobals();
	});

	it("throws when the response is not ok (e.g. 404)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				json: async () => ({ error: "not found" }),
			}),
		);

		await expect(loadRegistryIndex("https://example.com/not-found.json")).rejects.toThrow();

		vi.unstubAllGlobals();
	});

	it("throws when the JSON payload is missing required fields", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({ invalid: true }),
			}),
		);

		await expect(loadRegistryIndex("https://example.com/bad-index.json")).rejects.toThrow();

		vi.unstubAllGlobals();
	});

	it("can load any URL (url-agnostic: user-supplied community URL works)", async () => {
		// The loader is URL-agnostic — it works for any user-supplied community URL.
		// OFFICIAL_REGISTRY_INDEX_URL was removed (pointed at non-existent host, never fetched).
		// This test proves the loader handles an arbitrary HTTPS URL correctly.
		const communityUrl = "https://community.example.com/registry.json";
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					name: "community-url-test",
					version: "1.0.0",
					surfaces: [],
				}),
			}),
		);

		const result = await loadRegistryIndex(communityUrl);
		expect(result.name).toBe("community-url-test");
		vi.unstubAllGlobals();
	});
});

// ── AC1: RegistryIndex type shape ─────────────────────────────────────────────

describe("AL5 registry-index — RegistryIndex type", () => {
	it("RegistryIndex is exported and can be used as a type annotation", () => {
		// TypeScript-level proof: if this compiles, the type is exported.
		const index: RegistryIndex = {
			name: "test",
			version: "1.0.0",
			surfaces: [],
		};
		expect(index.name).toBe("test");
		expect(index.surfaces).toHaveLength(0);
	});
});
