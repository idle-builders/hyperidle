/**
 * AL5 (simplified) — defaultLoader unit tests.
 *
 * The loader now only fetches /api/reviews/:id — no adoptions fetch.
 * Surface selection uses artifact.surface (set by the agent at create_artifact
 * time), not DB adoptions.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultLoader } from "../ReviewPage.js";
import { REVIEW_COMPOSITION_SUBJECT } from "../review-composition.fixture.js";

const { apiFetchMock } = vi.hoisted(() => ({
	apiFetchMock: vi.fn(),
}));

vi.mock("../../../services/api-fetch.js", () => ({
	apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// ReviewPage imports React hooks at module level — mock to prevent import errors.
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

describe("defaultLoader — simplified (AL5)", () => {
	it("fetches /api/reviews/:id and returns subject", async () => {
		apiFetchMock.mockImplementation((url: string) => {
			if (url.startsWith("/api/reviews/")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(REVIEW_COMPOSITION_SUBJECT),
				});
			}
			return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
		});

		const result = await defaultLoader({ betId: "bet-test", reviewId: "rev-test" });

		expect(result.subject).toBeDefined();
		expect(result.subject.id).toBe(REVIEW_COMPOSITION_SUBJECT.id);
	});

	it("does NOT fetch surface-adoptions (removed in AL5 simplification)", async () => {
		apiFetchMock.mockImplementation((url: string) => {
			if (url.startsWith("/api/reviews/")) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve(REVIEW_COMPOSITION_SUBJECT),
				});
			}
			return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
		});

		await defaultLoader({ betId: "bet-test", reviewId: "rev-test", teamId: "team-abc" });

		const allCalls = apiFetchMock.mock.calls as [string][];
		const adoptionCalls = allCalls.filter((args) => args[0].includes("surface-adoptions"));
		expect(adoptionCalls).toHaveLength(0);
	});

	it("throws when the reviews fetch fails", async () => {
		apiFetchMock.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });

		await expect(defaultLoader({ betId: "bet-test", reviewId: "rev-test" })).rejects.toThrow(
			"Could not load review",
		);
	});
});
