/**
 * AL5 FIX-2 — SettingsReviewSurfaces teamId URL threading tests.
 *
 * Mirrors the ReviewPage.loader.test.ts pattern (FIX-1) for the Settings surface.
 *
 * Bug: SettingsReviewSurfaces called /api/surface-adoptions without ?teamId=,
 * causing the server to return 400, so the adopt UI could never load adoptions,
 * adopt, or swap surfaces. Same class of bug as FIX-1 in ReviewPage.
 *
 * These tests prove that:
 * 1. GET /api/surface-adoptions is called WITH ?teamId= when teamId is available.
 * 2. GET is skipped (no 400 spam) when teamId is not yet loaded.
 * 3. POST /api/surface-adoptions body includes teamId.
 * 4. DELETE /api/surface-adoptions/:id is called WITH ?teamId= for scoped isolation.
 * 5. Loaded adoptions are rendered in the UI.
 *
 * @lore AL5 FIX-2: Coverage gap — the bug existed in both ReviewPage (FIX-1) and
 * SettingsReviewSurfaces. FIX-1 closed ReviewPage; these tests close the Settings
 * surface gap so the same bug cannot ship again without failing.
 */

import type { AdoptionView, SurfaceManifest } from "@hyperidle/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsReviewSurfaces } from "../SettingsReviewSurfaces.js";

// ---------------------------------------------------------------------------
// Mock useCurrentUser — controls teamId availability in tests
// ---------------------------------------------------------------------------

const mockUseCurrentUser = vi.fn();

vi.mock("../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => mockUseCurrentUser(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_ADOPTION: AdoptionView = {
	id: "sa-test-1",
	tool: "stripe",
	kind: "action_operation",
	surfaceId: "stripe-refund-review",
	pinnedVersion: "1.0.0",
	provenance: "first-party",
	trustTier: "vetted",
	surfaceTitle: "Stripe Refund Review",
	baseCanvas: "action_operation",
};

const MOCK_MANIFEST: SurfaceManifest = {
	id: "stripe-refund-review",
	title: "Stripe Refund Review",
	description: "A review surface for Stripe refund operations.",
	version: "1.0.0",
	baseCanvas: "action_operation",
	layering: "wrap",
	provenance: "first-party",
	trustTier: "vetted",
	author: "HyperIdle <hi@hyperidle.com>",
	sampleFixture: "stripe-refund",
	situations: [{ tool: "stripe", kind: "action_operation" }],
};

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

/**
 * Capture all fetch calls so we can assert on URLs.
 */
function mockFetchWithTeam(
	teamId: string,
	adoptions: AdoptionView[] = [],
	manifests: SurfaceManifest[] = [],
): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		if (url.includes("/api/surface-adoptions") && !url.includes("/")) {
			// GET /api/surface-adoptions?teamId=...
			return Promise.resolve({
				ok: true,
				status: 200,
				json: async () => adoptions,
			});
		}
		if (url.includes(`/api/surface-adoptions?teamId=${teamId}`)) {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: async () => adoptions,
			});
		}
		if (url.includes("/api/surface-registry")) {
			return Promise.resolve({
				ok: true,
				status: 200,
				json: async () => manifests,
			});
		}
		if (url.includes("/api/surface-adoptions")) {
			// POST or GET — handle both
			return Promise.resolve({
				ok: true,
				status: 201,
				json: async () => MOCK_ADOPTION,
			});
		}
		return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

// ---------------------------------------------------------------------------
// Tests: GET includes ?teamId=
// ---------------------------------------------------------------------------

describe("AL5 SettingsReviewSurfaces — GET /api/surface-adoptions includes ?teamId=", () => {
	beforeEach(() => {
		mockUseCurrentUser.mockReturnValue({
			user: {
				id: "u-founder",
				name: "Founder",
				email: "f@example.com",
				avatarUrl: null,
				teamId: "team-abc",
			},
			status: "ready",
			error: null,
		});
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls /api/surface-adoptions?teamId= when teamId is available", async () => {
		const fetchMock = mockFetchWithTeam("team-abc");

		render(<SettingsReviewSurfaces />);

		await waitFor(() => {
			const calls = (fetchMock.mock.calls as [string][]).map((c) => c[0]);
			const adoptionCalls = calls.filter(
				(u) => u.includes("surface-adoptions") && !u.includes("/sa-"),
			);
			expect(adoptionCalls.length).toBeGreaterThanOrEqual(1);
			const hasTeamId = adoptionCalls.some((u) => u.includes("teamId=team-abc"));
			expect(hasTeamId).toBe(true);
		});
	});

	it("does NOT call /api/surface-adoptions when teamId is absent", async () => {
		mockUseCurrentUser.mockReturnValue({
			user: { id: "u-founder", name: "Founder", email: "f@example.com", avatarUrl: null },
			status: "ready",
			error: null,
		});

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => [],
		});
		vi.stubGlobal("fetch", fetchMock);

		render(<SettingsReviewSurfaces />);

		// Wait for the component to settle
		await waitFor(() => {
			expect(screen.getByText(/review surfaces/i)).toBeInTheDocument();
		});

		// Must not have called /api/surface-adoptions (would 400)
		const calls = (fetchMock.mock.calls as [string][]).map((c) => c[0]);
		const adoptionCalls = calls.filter((u) => u.includes("surface-adoptions"));
		expect(adoptionCalls).toHaveLength(0);
	});

	it("renders loaded adoptions in the 'Adopted' section", async () => {
		mockFetchWithTeam("team-abc", [MOCK_ADOPTION], [MOCK_MANIFEST]);

		render(<SettingsReviewSurfaces />);

		await waitFor(() => {
			// The adoption row shows tool · kind
			expect(screen.getByText(/stripe · action_operation/i)).toBeInTheDocument();
		});
	});
});

// ---------------------------------------------------------------------------
// Tests: POST body includes teamId
// ---------------------------------------------------------------------------

describe("AL5 SettingsReviewSurfaces — POST /api/surface-adoptions body includes teamId", () => {
	beforeEach(() => {
		mockUseCurrentUser.mockReturnValue({
			user: {
				id: "u-founder",
				name: "Founder",
				email: "f@example.com",
				avatarUrl: null,
				teamId: "team-xyz",
			},
			status: "ready",
			error: null,
		});
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("sends teamId in POST body when adopting a surface", async () => {
		const postCalls: { url: string; body: unknown }[] = [];

		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((input: string, init?: RequestInit) => {
				const url = typeof input === "string" ? input : "";
				const method = ((init?.method ?? "GET") as string).toUpperCase();

				if (url.includes("/api/surface-adoptions") && method === "POST") {
					const body = init?.body ? (JSON.parse(init.body as string) as unknown) : null;
					postCalls.push({ url, body });
					return Promise.resolve({
						ok: true,
						status: 201,
						json: async () => MOCK_ADOPTION,
					});
				}
				if (url.includes("/api/surface-adoptions")) {
					return Promise.resolve({ ok: true, status: 200, json: async () => [] });
				}
				if (url.includes("/api/surface-registry")) {
					return Promise.resolve({ ok: true, status: 200, json: async () => [MOCK_MANIFEST] });
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);

		render(<SettingsReviewSurfaces />);

		// Wait for Available section to render with the manifest
		await waitFor(() => {
			expect(screen.getByText("Stripe Refund Review")).toBeInTheDocument();
		});

		// Click "Adopt…" on the available row
		const adoptBtn = screen.getByRole("button", { name: /adopt stripe refund review/i });
		await userEvent.click(adoptBtn);

		// Dialog opens — click the "Adopt for …" button
		await waitFor(() => {
			const adoptForBtn = screen.getByRole("button", { name: /adopt for/i });
			expect(adoptForBtn).toBeInTheDocument();
		});
		const adoptForBtn = screen.getByRole("button", { name: /adopt for/i });
		await userEvent.click(adoptForBtn);

		// Assert: POST body includes teamId
		await waitFor(() => {
			expect(postCalls).toHaveLength(1);
		});
		const body = postCalls[0]?.body as Record<string, unknown>;
		expect(body?.teamId).toBe("team-xyz");
		expect(body?.surfaceId).toBe("stripe-refund-review");
	});
});

// ---------------------------------------------------------------------------
// Tests: DELETE includes ?teamId=
// ---------------------------------------------------------------------------

describe("AL5 SettingsReviewSurfaces — DELETE /api/surface-adoptions/:id includes ?teamId=", () => {
	beforeEach(() => {
		mockUseCurrentUser.mockReturnValue({
			user: {
				id: "u-founder",
				name: "Founder",
				email: "f@example.com",
				avatarUrl: null,
				teamId: "team-del",
			},
			status: "ready",
			error: null,
		});
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("includes ?teamId= in DELETE URL when resetting an adoption", async () => {
		const deleteCalls: string[] = [];

		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation((input: string, init?: RequestInit) => {
				const url = typeof input === "string" ? input : "";
				const method = ((init?.method ?? "GET") as string).toUpperCase();

				if (url.includes("/api/surface-adoptions/") && method === "DELETE") {
					deleteCalls.push(url);
					return Promise.resolve({ ok: true, status: 204, json: async () => null });
				}
				if (url.includes("/api/surface-adoptions")) {
					return Promise.resolve({ ok: true, status: 200, json: async () => [MOCK_ADOPTION] });
				}
				if (url.includes("/api/surface-registry")) {
					return Promise.resolve({ ok: true, status: 200, json: async () => [] });
				}
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			}),
		);

		render(<SettingsReviewSurfaces />);

		// Wait for the adopted row to render
		await waitFor(() => {
			expect(screen.getByText(/stripe · action_operation/i)).toBeInTheDocument();
		});

		// Open the actions menu for the adopted row
		const actionsBtn = screen.getByRole("button", {
			name: /actions for stripe · action_operation/i,
		});
		await userEvent.click(actionsBtn);

		// Click "Reset to base canvas"
		await waitFor(() => {
			expect(screen.getByText(/reset to base canvas/i)).toBeInTheDocument();
		});
		await userEvent.click(screen.getByText(/reset to base canvas/i));

		// Confirm the destructive action
		await waitFor(() => {
			expect(screen.getByRole("button", { name: /confirm reset/i })).toBeInTheDocument();
		});
		await userEvent.click(screen.getByRole("button", { name: /confirm reset/i }));

		// Assert: DELETE URL includes ?teamId=team-del
		await waitFor(() => {
			expect(deleteCalls).toHaveLength(1);
		});
		expect(deleteCalls[0]).toMatch(/\/api\/surface-adoptions\/sa-test-1\?teamId=team-del/);
	});
});
