/**
 * FIX-1: defaultLoader teamId URL threading tests.
 *
 * Isolated in its own file because vi.mock("api-fetch") at module level affects
 * ALL tests in a file. The ReviewPage.test.tsx component tests use the real
 * apiFetch (through loader mocks) and would silently break if api-fetch were
 * mocked there.
 *
 * @lore AL5 FIX-1: The live page bug was: defaultLoader fetched
 * /api/surface-adoptions WITHOUT ?teamId= which made the server return 400,
 * causing adoptions to silently fall back to [] and the base canvas to always
 * render (surface adoption had zero live effect). These tests prove the fix.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultLoader } from "../ReviewPage.js";
import { REVIEW_COMPOSITION_SUBJECT } from "../review-composition.fixture.js";

// vi.hoisted ensures apiFetchMock is declared before vi.mock's factory runs.
// vi.mock is hoisted to top of the file; without vi.hoisted the factory closes
// over the variable in its TDZ and silently returns undefined for all calls.
const { apiFetchMock } = vi.hoisted(() => ({
	apiFetchMock: vi.fn(),
}));

vi.mock("../../../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// ReviewPage imports useCurrentUser, useHostThread, useNavigate, useParams —
// none of these are called by defaultLoader directly (it's a plain async fn),
// but they're imported at module level. Mock them to prevent import errors.
vi.mock("../../../hooks/useCurrentUser.js", () => ({
	useCurrentUser: () => ({ user: null, status: "loading", error: null }),
}));
vi.mock("../../../hooks/useHostThread.js", () => ({
	useHostThread: () => ({ data: null, error: null, isLoading: true, refresh: vi.fn() }),
}));
vi.mock("../../../services/host-threads.js", () => ({
	postPlainHostMessage: vi.fn(),
	postVerdictHostMessage: vi.fn(),
	resolveOrCreateHostThread: vi.fn(),
}));

afterEach(() => {
	apiFetchMock.mockReset();
});

describe("defaultLoader — teamId URL threading (FIX-1)", () => {
	it("calls /api/surface-adoptions?teamId= when teamId is provided", async () => {
		// Arrange: mock the review fetch and the adoptions fetch
		apiFetchMock.mockImplementation((url: string) => {
			if (url.startsWith("/api/reviews/")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(REVIEW_COMPOSITION_SUBJECT),
				});
			}
			if (url.includes("/api/surface-adoptions")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve([]),
				});
			}
			return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
		});

		// Act
		await defaultLoader({ betId: "bet-test", reviewId: "rev-test", teamId: "team-abc" });

		// Assert: the adoptions URL includes ?teamId=team-abc
		const allCalls = apiFetchMock.mock.calls as [string][];
		const adoptionCalls = allCalls.filter((args) => args[0].includes("surface-adoptions"));
		expect(adoptionCalls).toHaveLength(1);
		const adoptionUrl = (adoptionCalls[0] as [string])[0];
		expect(adoptionUrl).toBe("/api/surface-adoptions?teamId=team-abc");
	});

	it("does NOT call /api/surface-adoptions when teamId is absent", async () => {
		// Arrange: only the review fetch is needed
		apiFetchMock.mockImplementation((url: string) => {
			if (url.startsWith("/api/reviews/")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(REVIEW_COMPOSITION_SUBJECT),
				});
			}
			return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({}) });
		});

		// Act
		const result = await defaultLoader({ betId: "bet-test", reviewId: "rev-test" });

		// Assert: no adoptions call was made; result degrades to empty adoptions (base canvas)
		const allCalls = apiFetchMock.mock.calls as [string][];
		const adoptionCalls = allCalls.filter((args) => args[0].includes("surface-adoptions"));
		expect(adoptionCalls).toHaveLength(0);
		expect(result.adoptions).toEqual([]);
	});

	it("returns adoptions array from the server response when teamId is provided", async () => {
		const mockAdoption = {
			id: "sa-1",
			tool: "stripe",
			kind: "action_operation",
			surfaceId: "stripe-refund-review",
			pinnedVersion: "1.0.0",
			provenance: "first-party",
			trustTier: "vetted",
			surfaceTitle: "Stripe Refund Review",
			baseCanvas: "action_operation",
		};

		apiFetchMock.mockImplementation((url: string) => {
			if (url.startsWith("/api/reviews/")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(REVIEW_COMPOSITION_SUBJECT),
				});
			}
			if (url.includes("/api/surface-adoptions")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve([mockAdoption]),
				});
			}
			return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
		});

		const result = await defaultLoader({
			betId: "bet-test",
			reviewId: "rev-test",
			teamId: "team-xyz",
		});

		expect(result.adoptions).toHaveLength(1);
		expect(result.adoptions[0]).toEqual(mockAdoption);
	});

	it("degrades to empty adoptions when adoptions fetch fails", async () => {
		apiFetchMock.mockImplementation((url: string) => {
			if (url.startsWith("/api/reviews/")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(REVIEW_COMPOSITION_SUBJECT),
				});
			}
			if (url.includes("/api/surface-adoptions")) {
				// Server returns 400 (as it did before FIX-1 when teamId was missing)
				return Promise.resolve({
					ok: false,
					status: 400,
					json: () => Promise.resolve({ error: "teamId query parameter required" }),
				});
			}
			return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
		});

		// Still provide a teamId so the call IS made (testing 4xx response degradation)
		const result = await defaultLoader({
			betId: "bet-test",
			reviewId: "rev-test",
			teamId: "team-abc",
		});

		// A non-ok response degrades to empty adoptions (base canvas — safe fallback)
		expect(result.adoptions).toEqual([]);
	});
});
