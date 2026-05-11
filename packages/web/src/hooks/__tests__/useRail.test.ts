/**
 * M3 RED — useRail hook: fetches /api/rail, returns typed response (C1).
 *
 * These tests FAIL until:
 *  - packages/web/src/hooks/useRail.ts is created
 *  - The hook fetches GET /api/rail and returns { data, status, error, retry }
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRail } from "../../hooks/useRail";

type RailResponse = {
	bets: Array<{
		id: string;
		title: string;
		status: string;
		progress: { done: number; total: number };
	}>;
	blockers: Array<{
		taskId: string;
		title: string;
		owner: string | null;
		durationBlockedMs: number;
	}>;
	awaitingOrdering: Array<{ id: string; title: string; createdAt: string }>;
	costBurnRate: {
		todaySpend: { minor: number; currency: string } | null;
		todayCap: { minor: number; currency: string } | null;
		weekSpend: { minor: number; currency: string } | null;
		weekCap: { minor: number; currency: string } | null;
		weekTokens: number | null;
	};
};

const FIXTURE_RAIL: RailResponse = {
	bets: [
		{ id: "b1", title: "User auth flow", status: "in_progress", progress: { done: 2, total: 5 } },
	],
	blockers: [
		{
			taskId: "t-blocked-1",
			title: "Waiting for API",
			owner: "agent-1",
			durationBlockedMs: 7200000,
		},
	],
	awaitingOrdering: [],
	costBurnRate: {
		todaySpend: { minor: 1000, currency: "USD" },
		todayCap: { minor: 5000, currency: "USD" },
		weekSpend: { minor: 8000, currency: "USD" },
		weekCap: null,
		weekTokens: null,
	},
};

function makeOkResponse(data: RailResponse): Response {
	return new Response(JSON.stringify(data), { status: 200 });
}

function makeErrorResponse(status: number): Response {
	return new Response(JSON.stringify({ error: "Server Error" }), { status });
}

describe("useRail (M3 C1)", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("starts in loading state", () => {
		fetchSpy.mockImplementation(() => new Promise(() => {}));

		const { result } = renderHook(() => useRail());

		expect(result.current.status).toBe("loading");
		expect(result.current.data).toBeNull();
	});

	it("returns typed rail data on success", async () => {
		fetchSpy.mockResolvedValueOnce(makeOkResponse(FIXTURE_RAIL));

		const { result } = renderHook(() => useRail());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		expect(result.current.data).not.toBeNull();
		expect(result.current.data?.bets).toHaveLength(1);
		expect(result.current.data?.bets[0].id).toBe("b1");
		expect(result.current.data?.bets[0].progress).toEqual({ done: 2, total: 5 });
		expect(result.current.data?.blockers[0].taskId).toBe("t-blocked-1");
		expect(result.current.data?.blockers[0].durationBlockedMs).toBe(7200000);
	});

	it("fetches /api/rail endpoint", async () => {
		fetchSpy.mockResolvedValueOnce(makeOkResponse(FIXTURE_RAIL));

		renderHook(() => useRail());

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalled();
		});

		const [url] = fetchSpy.mock.calls[0] as [string];
		expect(url).toContain("/api/rail");
	});

	it("returns error status on non-ok response", async () => {
		fetchSpy.mockResolvedValueOnce(makeErrorResponse(500));

		const { result } = renderHook(() => useRail());

		await waitFor(() => {
			expect(result.current.status).toBe("error");
		});

		expect(result.current.data).toBeNull();
		expect(result.current.error).not.toBeNull();
	});

	it("retry() function is exposed", async () => {
		fetchSpy.mockResolvedValueOnce(makeOkResponse(FIXTURE_RAIL));

		const { result } = renderHook(() => useRail());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		expect(typeof result.current.retry).toBe("function");
	});

	it("bets use progress field (not product field)", async () => {
		// Contract 3: BetItem.product is removed, BetItem.progress is added
		fetchSpy.mockResolvedValueOnce(makeOkResponse(FIXTURE_RAIL));

		const { result } = renderHook(() => useRail());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		const bet = result.current.data?.bets[0];
		// progress must be present
		expect(bet?.progress).toBeDefined();
		expect(typeof bet?.progress.done).toBe("number");
		expect(typeof bet?.progress.total).toBe("number");
		// product field must NOT be present (removed in M3)
		// @ts-expect-error — testing that product was removed
		expect((bet as Record<string, unknown>)?.product).toBeUndefined();
	});

	it("blockers use taskId + durationBlockedMs (not id + severity)", async () => {
		// Contract 3: BlockerItem renamed fields
		fetchSpy.mockResolvedValueOnce(makeOkResponse(FIXTURE_RAIL));

		const { result } = renderHook(() => useRail());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		const blocker = result.current.data?.blockers[0];
		expect(blocker?.taskId).toBeDefined();
		expect(typeof blocker?.durationBlockedMs).toBe("number");
		// severity must NOT be present (removed in M3, derived client-side instead)
		// @ts-expect-error — testing that severity was removed
		expect((blocker as Record<string, unknown>)?.severity).toBeUndefined();
	});

	it("costBurnRate fields are nullable", async () => {
		// Contract 3: CostInfo fields become nullable
		fetchSpy.mockResolvedValueOnce(makeOkResponse(FIXTURE_RAIL));

		const { result } = renderHook(() => useRail());

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});

		// weekCap was null in the fixture — must survive through the hook
		expect(result.current.data?.costBurnRate.weekCap).toBeNull();
	});
});
