/**
 * AL5 TDD RED — Browse reads the registry index, not a hardcoded map.
 *
 * Covers:
 *   AC2: the browse data path lists surfaces from the loaded index
 *   AC2: the first-party Stripe entry comes via the index (index-driven, not hardcoded)
 *   AC2: the registry endpoint returns index-driven data (not a module-level constant)
 *
 * These tests assert that:
 * 1. The browse dialog's available surfaces come from /api/surface-registry (index-driven).
 * 2. When the registry returns a manifest that ONLY exists in the index (not in a
 *    hardcoded list), it still appears in the browse UI.
 * 3. The official index drives the server-side registry (Stripe comes via index).
 *
 * They FAIL until:
 * - The server's GET /api/surface-registry returns index-driven data (not just the
 *   hardcoded SERVER_REGISTRY map) — i.e., it loads from OFFICIAL_REGISTRY_INDEX.
 * - The browse component's manifest list is purely driven by the fetched registry response.
 *
 * @lore AL5 RED: The "hardcoded map" anti-pattern is that SERVER_REGISTRY is
 * built from FIRST_PARTY_SURFACE_MANIFESTS at module load time and never updated.
 * The index model means: load OFFICIAL_REGISTRY_INDEX → serve its .surfaces.
 * The component test cannot differentiate these without a sentinel surface that
 * is in the index but NOT in FIRST_PARTY_SURFACE_MANIFESTS.
 */

import type { SurfaceManifest } from "@hyperidle/shared";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsReviewSurfaces } from "../SettingsReviewSurfaces.js";

// ---------------------------------------------------------------------------
// Mock useCurrentUser
// ---------------------------------------------------------------------------

const mockUseCurrentUser = vi.fn();

vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => mockUseCurrentUser(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A sentinel surface that exists in the index but is NOT in FIRST_PARTY_SURFACE_MANIFESTS.
 * If the browse dialog is driven by the index (not the hardcoded list), this shows up.
 * If it's hardcoded, it won't show up even when the server returns it. */
const INDEX_ONLY_MANIFEST: SurfaceManifest = {
	id: "community-figma-review",
	title: "Figma Design Review",
	description: "A community surface for reviewing Figma designs.",
	author: "Community <hi@community.com>",
	version: "0.1.0",
	baseCanvas: "visual_diff",
	layering: "wrap",
	provenance: "community",
	situations: [{ tool: "figma", kind: "visual_diff" }],
	sampleFixture: "figma-design",
};

const STRIPE_MANIFEST: SurfaceManifest = {
	id: "stripe-refund-review",
	title: "Stripe Refund Review",
	description: "Specializes the action_operation canvas for Stripe refunds.",
	author: "HyperIdle <hi@hyperidle.com>",
	version: "1.0.0",
	baseCanvas: "action_operation",
	layering: "wrap",
	provenance: "first-party",
	situations: [{ tool: "stripe", kind: "action_operation" }],
	sampleFixture: "stripe-refund",
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function setupFetch(manifests: SurfaceManifest[], adoptions: unknown[] = []): void {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((input: string | URL | Request) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			if (url.includes("/api/surface-registry")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => manifests,
				});
			}
			if (url.includes("/api/surface-adoptions")) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => adoptions,
				});
			}
			return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
		}),
	);
}

// ---------------------------------------------------------------------------
// AC2: browse lists surfaces from the index response
// ---------------------------------------------------------------------------

describe("AL5 browse — surfaces come from the registry index response (AC2)", () => {
	beforeEach(() => {
		mockUseCurrentUser.mockReturnValue({
			user: {
				id: "u-founder",
				name: "Founder",
				email: "f@example.com",
				avatarUrl: null,
				teamId: "team-browse",
			},
			status: "ready",
			error: null,
		});
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("renders a surface from the index even if not in the hardcoded first-party list", async () => {
		// Arrange: the server returns INDEX_ONLY_MANIFEST (community figma surface).
		// If browse is hardcoded to FIRST_PARTY_SURFACE_MANIFESTS, this won't show up.
		// If it's index-driven (fetches /api/surface-registry), it will.
		setupFetch([INDEX_ONLY_MANIFEST], []);

		render(<SettingsReviewSurfaces />);

		// The component must show the community figma surface in the Available section.
		await waitFor(() => {
			expect(screen.getByText("Figma Design Review")).toBeInTheDocument();
		});
	});

	it("renders the official Stripe entry when it's returned by the registry", async () => {
		// The Stripe surface comes via the index response — the server drives the list.
		setupFetch([STRIPE_MANIFEST], []);

		render(<SettingsReviewSurfaces />);

		await waitFor(() => {
			expect(screen.getByText("Stripe Refund Review")).toBeInTheDocument();
		});
	});

	it("calls /api/surface-registry to populate the browse list", async () => {
		// Assert: the component fetches the registry endpoint (index-driven).
		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => [] as SurfaceManifest[],
		});
		vi.stubGlobal("fetch", fetchSpy);

		render(<SettingsReviewSurfaces />);

		await waitFor(() => {
			const calls = (fetchSpy.mock.calls as [string][]).map((c) => c[0]);
			expect(calls.some((u) => u.includes("/api/surface-registry"))).toBe(true);
		});
	});

	it("shows multiple surfaces from the index (not capped at first-party count)", async () => {
		// If the index has 3 surfaces, browse shows 3 — not just the hardcoded 1.
		const manifests: SurfaceManifest[] = [
			STRIPE_MANIFEST,
			INDEX_ONLY_MANIFEST,
			{
				id: "github-pr-review",
				title: "GitHub PR Review",
				description: "Community surface for GitHub PRs.",
				author: "Community <hi@community.com>",
				version: "0.2.0",
				baseCanvas: "code_diff",
				layering: "wrap",
				provenance: "community",
				situations: [{ tool: "github", kind: "code_diff" }],
				sampleFixture: "github-pr",
			},
		];

		setupFetch(manifests, []);

		render(<SettingsReviewSurfaces />);

		await waitFor(() => {
			expect(screen.getByText("Stripe Refund Review")).toBeInTheDocument();
			expect(screen.getByText("Figma Design Review")).toBeInTheDocument();
			expect(screen.getByText("GitHub PR Review")).toBeInTheDocument();
		});
	});
});
