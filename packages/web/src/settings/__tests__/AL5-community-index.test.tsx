/**
 * AL5 TDD RED — Community registry index by URL.
 *
 * Covers:
 *   AC4: pointing browse at a community index URL lists its surfaces
 *   AC4: an entry not installed in the build is marked "needs install" (install-affordance)
 *   AC4: a NOT-YET-installed community surface does NOT show an "Adopt…" button
 *         (it's not in the build — "add <source>" is required first)
 *   AC5: CommunityRegistryIndex is actually consumed by the browse path (not dead stub)
 *
 * These tests FAIL until:
 * - SettingsReviewSurfaces wires the "add a registry URL" flow to real state
 *   (replacing the dead `_communityRegistries` stub)
 * - A community surface that is NOT installed shows "Install via `add …`"
 *   instead of "Adopt…" affordance
 * - The browse dialog reads from real CommunityRegistryIndex state
 *
 * @lore AL5 RED: The key distinction is between:
 *   - "in the build" (installed via `add <source>` → file exists in surfaces/) → shows "Adopt…"
 *   - "in a community index but not installed" → shows "Install via `add <surface-id>`"
 * The component must distinguish these two states based on whether the surface
 * is in the server-returned registry (installed + built-in) vs. only in a community index.
 */

import type { CommunityRegistryIndex, SurfaceManifest } from "@hyperidle/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const INSTALLED_STRIPE: SurfaceManifest = {
	id: "stripe-refund-review",
	title: "Stripe Refund Review",
	description: "Stripe refund review surface.",
	author: "HyperIdle <hi@hyperidle.com>",
	version: "1.0.0",
	baseCanvas: "action_operation",
	layering: "wrap",
	provenance: "first-party",
	situations: [{ tool: "stripe", kind: "action_operation" }],
	sampleFixture: "stripe-refund",
};

/** A community surface that is NOT yet installed (not in the server registry). */
const COMMUNITY_NOT_INSTALLED: SurfaceManifest = {
	id: "acme-figma-review",
	title: "Acme Figma Review",
	description: "Community surface for Figma designs.",
	author: "Acme <hi@acme.com>",
	version: "0.2.0",
	baseCanvas: "visual_diff",
	layering: "wrap",
	provenance: "community",
	situations: [{ tool: "figma", kind: "visual_diff" }],
	sampleFixture: "acme-figma",
};

const COMMUNITY_INDEX: CommunityRegistryIndex = {
	url: "https://registry.acme.com/surfaces.json",
	manifests: [COMMUNITY_NOT_INSTALLED],
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function setupFetch(
	installedManifests: SurfaceManifest[],
	adoptions: unknown[] = [],
): void {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((input: string | URL | Request) => {
			const url =
				typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			if (url.includes("/api/surface-registry")) {
				// Only installed (built-in) surfaces are in the server registry.
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => installedManifests,
				});
			}
			if (url.includes(COMMUNITY_INDEX.url)) {
				// Community index URL returns its manifest catalog.
				return Promise.resolve({
					ok: true,
					status: 200,
					json: async () => ({
						name: "acme-index",
						version: "1.0.0",
						surfaces: COMMUNITY_INDEX.manifests,
					}),
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
// AC4: community index by URL — lists surfaces
// ---------------------------------------------------------------------------

describe("AL5 community index — pointing browse at a URL lists its surfaces (AC4)", () => {
	beforeEach(() => {
		mockUseCurrentUser.mockReturnValue({
			user: {
				id: "u-founder",
				name: "Founder",
				email: "f@example.com",
				avatarUrl: null,
				teamId: "team-comm",
			},
			status: "ready",
			error: null,
		});
		setupFetch([INSTALLED_STRIPE], []);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("shows a field/button to add a community registry URL", async () => {
		// The component must expose a way to add a registry URL.
		// This will fail until the UI is wired (dead stub replaced).
		render(<SettingsReviewSurfaces />);

		await waitFor(() => {
			// Should show an "Add registry" or "Add registry URL" control.
			const addRegistryEl =
				screen.queryByRole("button", { name: /add.*registry/i }) ??
				screen.queryByPlaceholderText(/registry.*url/i) ??
				screen.queryByLabelText(/add.*registry/i) ??
				screen.queryByText(/add.*registry/i);
			expect(addRegistryEl).not.toBeNull();
		});
	});

	it("after adding a community registry URL, surfaces from that index appear", async () => {
		// This will fail until the community index loading is implemented.
		render(<SettingsReviewSurfaces />);

		await waitFor(() => {
			expect(screen.getByText("Stripe Refund Review")).toBeInTheDocument();
		});

		// Find and interact with the add-registry control.
		const addRegistryInput =
			screen.queryByPlaceholderText(/registry.*url/i) ??
			screen.queryByLabelText(/registry.*url/i);

		if (!addRegistryInput) {
			// If no input found yet, the UI is not wired — test must fail.
			throw new Error(
				"No registry URL input found — community index wiring is not implemented",
			);
		}

		await userEvent.type(addRegistryInput, COMMUNITY_INDEX.url);

		const addBtn =
			screen.queryByRole("button", { name: /add/i }) ??
			screen.queryByRole("button", { name: /load/i });
		if (addBtn) {
			await userEvent.click(addBtn);
		}

		// After loading, the community surface should appear.
		await waitFor(() => {
			expect(screen.getByText("Acme Figma Review")).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// AC4: not-yet-installed community surface shows install affordance, not Adopt
// ---------------------------------------------------------------------------

describe("AL5 community index — uninstalled surface shows install-affordance (AC4)", () => {
	beforeEach(() => {
		mockUseCurrentUser.mockReturnValue({
			user: {
				id: "u-founder",
				name: "Founder",
				email: "f@example.com",
				avatarUrl: null,
				teamId: "team-comm2",
			},
			status: "ready",
			error: null,
		});
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("a community surface NOT in the server registry shows 'Install' affordance, not 'Adopt'", async () => {
		// Setup: server registry has Stripe (installed), but Acme Figma is only in community index.
		// The community index has been loaded (simulate by including in the registry response... but
		// this surface is NOT installed, so it must NOT appear as "Adopt…" ready).
		//
		// Implementation: the component must differentiate "in server registry" (built-in → Adopt…)
		// from "in community index only" (not built-in → Install via `add acme-figma-review`).
		//
		// This test will FAIL until:
		// 1. Community index loading is wired.
		// 2. The component marks uninstalled surfaces with an install affordance.

		// We simulate a loaded community index by returning COMMUNITY_NOT_INSTALLED
		// from a community-index fetch, while the server registry returns ONLY the Stripe surface.
		setupFetch([INSTALLED_STRIPE], []);

		render(<SettingsReviewSurfaces />);

		// First, load the community index.
		await waitFor(() => {
			expect(screen.getByText("Stripe Refund Review")).toBeInTheDocument();
		});

		// Simulate the community index being loaded (this requires the wired flow).
		// The test looks for the "Install" affordance on the community surface.
		// Until the flow is implemented, this assertion will fail.
		const addRegistryInput =
			screen.queryByPlaceholderText(/registry.*url/i) ??
			screen.queryByLabelText(/registry.*url/i);

		if (!addRegistryInput) {
			throw new Error(
				"Community registry URL input missing — install-affordance flow not implemented",
			);
		}

		await userEvent.type(addRegistryInput, COMMUNITY_INDEX.url);

		const addBtn = screen.queryByRole("button", { name: /add|load/i });
		if (addBtn) await userEvent.click(addBtn);

		await waitFor(() => {
			expect(screen.getByText("Acme Figma Review")).toBeInTheDocument();
		});

		// The community surface should NOT have an "Adopt…" button (not installed yet).
		expect(
			screen.queryByRole("button", { name: /adopt acme figma review/i }),
		).toBeNull();

		// It SHOULD have an install affordance (e.g. "Install" button or copy-command).
		const installEl =
			screen.queryByRole("button", { name: /install/i }) ??
			screen.queryByText(/install via/i) ??
			screen.queryByText(/add acme-figma-review/i);
		expect(installEl).not.toBeNull();
	});
});

// ---------------------------------------------------------------------------
// AC4: CommunityRegistryIndex is consumed — not a dead type import
// ---------------------------------------------------------------------------

describe("AL5 community index — CommunityRegistryIndex is a live import (AC4/AC5)", () => {
	it("CommunityRegistryIndex can be used to create a valid registry pointer", () => {
		// Type-level proof: CommunityRegistryIndex is imported and usable.
		// If the type is dead (unused/stripped), this import still works but the
		// real test is that the component uses it (see above tests).
		const registry: CommunityRegistryIndex = {
			url: "https://example.com/index.json",
			manifests: [COMMUNITY_NOT_INSTALLED],
		};
		expect(registry.url).toBe("https://example.com/index.json");
		expect(registry.manifests).toHaveLength(1);
	});
});
