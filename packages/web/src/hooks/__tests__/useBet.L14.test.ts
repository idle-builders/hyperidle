/**
 * L14 — useBet hook: refresh mechanism (T9, AC-9/AC-12 plumbing).
 *
 * The existing useBet tests (useBet.test.ts) are protected — not changed here.
 * These tests are ADDITIVE: they assert the new `refresh()` return value.
 *
 * @lore api-typesafety S4: Migrated from mocking apiFetch to mocking apiClient
 * (same pattern as useBet.test.ts). The hook now uses the typed hono/client.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetDetail } from "../../types/bet";

// Mock the typed API client so tests focus on refresh() behaviour, not transport.
vi.mock("../../api/client.js", () => ({
	apiClient: {
		bets: {
			":id": {
				$get: vi.fn(),
			},
		},
	},
}));

import { useBet } from "../useBet";

const MOCK_BET: BetDetail = {
	id: "b1",
	title: "Auth flow",
	product: "Alpha",
	team: "t1",
	status: "in_progress",
	progress: { done: 1, total: 3 },
	pitch: "# Problem\n\nAuth is broken.\n",
	costAppetite: null,
	tokenAppetite: null,
	costActual: null,
	tokensActual: null,
	tasks: [],
};

const UPDATED_BET: BetDetail = {
	...MOCK_BET,
	status: "paused",
};

describe("L14 — useBet refresh", () => {
	let getBetSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiClient } = await import("../../api/client.js");
		getBetSpy = vi.mocked(
			(apiClient as { bets: { ":id": { $get: ReturnType<typeof vi.fn> } } }).bets[":id"].$get,
		);
		getBetSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("UseBetResult includes a refresh function", async () => {
		getBetSpy.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(MOCK_BET),
		});
		const { result } = renderHook(() => useBet("b1"));

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(typeof result.current.refresh).toBe("function");
	});

	it("calling refresh() triggers a new fetch", async () => {
		getBetSpy
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(MOCK_BET),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(UPDATED_BET),
			});

		const { result } = renderHook(() => useBet("b1"));

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.data?.status).toBe("in_progress");

		// Trigger refresh
		result.current.refresh();

		await waitFor(() => expect(result.current.data?.status).toBe("paused"));
		expect(getBetSpy).toHaveBeenCalledTimes(2);
	});

	it("refresh fetches with the same bet id", async () => {
		getBetSpy.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(MOCK_BET),
		});

		const { result } = renderHook(() => useBet("b1"));
		await waitFor(() => expect(result.current.loading).toBe(false));

		result.current.refresh();

		await waitFor(() => expect(getBetSpy).toHaveBeenCalledTimes(2));
		expect(getBetSpy).toHaveBeenNthCalledWith(2, { param: { id: "b1" } });
	});
});
