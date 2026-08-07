/**
 * L14 — useBet hook: refresh mechanism (T9, AC-9/AC-12 plumbing).
 *
 * The existing useBet tests (useBet.test.ts) are protected — not changed here.
 * These tests are ADDITIVE: they assert the new `refresh()` return value.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetDetail } from "../../types/bet";

// Mock apiFetch so tests are not sensitive to fetch() call argument count.
// Header injection is covered by api-fetch.test.ts; these tests focus on
// refresh() behaviour.
vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import { useBet } from "../useBet";

const MOCK_BET: BetDetail = {
	id: "b1",
	title: "Auth flow",
	team: "Alpha Core",
	status: "active",
	atRisk: false,
	tokenAppetite: null,
	tokensActual: null,
	progress: { done: 1, total: 3 },
	description: "# Problem\n\nAuth is broken.\n",
	tasks: [],
};

const UPDATED_BET: BetDetail = {
	...MOCK_BET,
	status: "completed",
};

describe("L14 — useBet refresh", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("UseBetResult includes a refresh function", async () => {
		fetchSpy.mockResolvedValue(new Response(JSON.stringify(MOCK_BET), { status: 200 }));
		const { result } = renderHook(() => useBet("b1"));

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(typeof result.current.refresh).toBe("function");
	});

	it("calling refresh() triggers a new fetch", async () => {
		fetchSpy
			.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_BET), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(UPDATED_BET), { status: 200 }));

		const { result } = renderHook(() => useBet("b1"));

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.data?.status).toBe("active");

		// Trigger refresh
		result.current.refresh();

		await waitFor(() => expect(result.current.data?.status).toBe("completed"));
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("refresh fetches from the same URL", async () => {
		fetchSpy.mockResolvedValue(new Response(JSON.stringify(MOCK_BET), { status: 200 }));

		const { result } = renderHook(() => useBet("b1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		result.current.refresh();

		await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
		expect(fetchSpy).toHaveBeenNthCalledWith(2, "/api/bets/b1");
	});
});
