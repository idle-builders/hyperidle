/**
 * L14 — useBet hook: refresh mechanism (T9, AC-9/AC-12 plumbing).
 *
 * The existing useBet tests (useBet.test.ts) are protected — not changed here.
 * These tests are ADDITIVE: they assert the new `refresh()` return value.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetDetail } from "../../types/bet";
import { useBet } from "../useBet";

const MOCK_BET: BetDetail = {
	id: "b1",
	title: "Auth flow",
	product: "Alpha",
	team: "t1",
	status: "in_progress",
	appetite: "2 weeks",
	progress: { done: 1, total: 3 },
	pitch: "# Problem\n\nAuth is broken.\n",
	tasks: [],
};

const UPDATED_BET: BetDetail = {
	...MOCK_BET,
	status: "paused",
};

describe("L14 — useBet refresh", () => {
	beforeEach(() => {
		vi.spyOn(globalThis, "fetch");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("UseBetResult includes a refresh function", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(MOCK_BET), { status: 200 }));
		const { result } = renderHook(() => useBet("b1"));

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(typeof result.current.refresh).toBe("function");
	});

	it("calling refresh() triggers a new fetch", async () => {
		vi.mocked(fetch)
			.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_BET), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(UPDATED_BET), { status: 200 }));

		const { result } = renderHook(() => useBet("b1"));

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.data?.status).toBe("in_progress");

		// Trigger refresh
		result.current.refresh();

		await waitFor(() => expect(result.current.data?.status).toBe("paused"));
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("refresh fetches from the same URL", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(MOCK_BET), { status: 200 }));

		const { result } = renderHook(() => useBet("b1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		result.current.refresh();

		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
		// hc<BetsRoutes> passes a full options object alongside the URL;
		// assert only that the first argument is the expected URL.
		expect(fetch).toHaveBeenNthCalledWith(2, "/api/bets/b1", expect.any(Object));
	});
});
