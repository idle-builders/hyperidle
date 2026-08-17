/**
 * L8 — useConversationsThreads hook tests.
 *
 * Plan §3.6: hook fetches GET /api/threads?participant_id=<id>&limit=50,
 * exposes status/threads/error/retry, aborts on unmount.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConversationsThreads } from "../useConversationsThreads";

interface ListRow {
	id: string;
	hostKind: string;
	hostId: string;
	initiatorId: string;
	participants: string[];
	pinned: boolean;
	resolvedAt: string | null;
	lastActiveAt: string;
	createdAt: string;
	hasUnresolvedReview: boolean;
	/** L10 / T11a — optional wire field. */
	blocking?: boolean;
}

const NOW_ISO = "2026-04-30T12:00:00.000Z";

function row(overrides: Partial<ListRow> = {}): ListRow {
	return {
		id: overrides.id ?? "t1",
		hostKind: overrides.hostKind ?? "task",
		hostId: overrides.hostId ?? "host-1",
		initiatorId: overrides.initiatorId ?? "u-founder",
		participants: overrides.participants ?? ["u-founder", "agent-1"],
		pinned: overrides.pinned ?? false,
		resolvedAt: overrides.resolvedAt ?? null,
		lastActiveAt: overrides.lastActiveAt ?? NOW_ISO,
		createdAt: overrides.createdAt ?? NOW_ISO,
		hasUnresolvedReview: overrides.hasUnresolvedReview ?? false,
		// L10 T11a — forward optional `blocking` so the new assertion exercises
		// the wire-row → ThreadItem mapping. Omitted when not provided so the
		// existing tests keep their "no blocking field" payload shape.
		...(overrides.blocking !== undefined ? { blocking: overrides.blocking } : {}),
	};
}

describe("useConversationsThreads", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("transitions loading → ready and exposes mapped threads", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ threads: [row({ id: "t1" })], nextCursor: null }),
		});
		global.fetch = fetchMock as unknown as typeof fetch;

		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		expect(result.current.status).toBe("loading");

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});
		expect(result.current.threads.length).toBe(1);
		expect(result.current.threads[0]!.id).toBe("t1");
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const url = fetchMock.mock.calls[0]![0] as string;
		expect(url).toContain("/api/threads");
		expect(url).toContain("participant_id=u-founder");
		expect(url).toContain("limit=50");

		// NEW-21: snippet must be empty (not the thread type which duplicates the chip)
		expect(result.current.threads[0]!.snippet).toBe("");
		// NEW-21: avatars must be undefined (title-derived initials are meaningless)
		expect(result.current.threads[0]!.avatars).toBeUndefined();
	});

	it("surfaces error when fetch fails", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: () => Promise.resolve({ error: "boom" }),
		}) as unknown as typeof fetch;

		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		await waitFor(() => {
			expect(result.current.status).toBe("error");
		});
		expect(result.current.error).not.toBeNull();
		// NEW-22: error message must be user-facing, not a raw HTTP status code
		expect(result.current.error).not.toMatch(/HTTP \d+/i);
	});

	it("retry re-runs the fetch and restores ready", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce({
				ok: false,
				status: 500,
				json: () => Promise.resolve({ error: "boom" }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ threads: [row({ id: "t1" })], nextCursor: null }),
			});
		global.fetch = fetchMock as unknown as typeof fetch;

		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		await waitFor(() => {
			expect(result.current.status).toBe("error");
		});
		await act(async () => {
			result.current.retry();
		});
		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});
		expect(result.current.threads.length).toBe(1);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("surfaces error when network throws", async () => {
		global.fetch = vi
			.fn()
			.mockRejectedValue(new TypeError("Network down")) as unknown as typeof fetch;
		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		await waitFor(() => {
			expect(result.current.status).toBe("error");
		});
	});

	it("rapid retry — only the last fetch's setters run (abort/refetch race guard)", async () => {
		// Adversary B2: when retry() fires before the prior fetch's `await
		// res.json()` resolves, the closure must NOT call setters from the
		// stale cycle. We sequence two responses with controllable resolution
		// and assert only the second's threads land.
		let resolveFirst: (value: unknown) => void = () => {};
		const firstResponse = new Promise<unknown>((resolve) => {
			resolveFirst = resolve;
		});

		const fetchMock = vi
			.fn()
			.mockImplementationOnce(
				async () =>
					({
						ok: true,
						json: () => firstResponse,
					}) as unknown as Response,
			)
			.mockImplementationOnce(
				async () =>
					({
						ok: true,
						json: () => Promise.resolve({ threads: [row({ id: "second" })], nextCursor: null }),
					}) as unknown as Response,
			);
		global.fetch = fetchMock as unknown as typeof fetch;

		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		expect(result.current.status).toBe("loading");

		// Fire retry while the first fetch is still pending — this aborts it.
		await act(async () => {
			result.current.retry();
		});

		// Now resolve the first fetch's body. Its setters must NOT run because
		// the controller for that cycle has been aborted.
		await act(async () => {
			resolveFirst({ threads: [row({ id: "first" })], nextCursor: null });
		});

		await waitFor(() => {
			expect(result.current.status).toBe("ready");
		});
		// Only the second cycle's data is present.
		expect(result.current.threads.map((t) => t.id)).toEqual(["second"]);
	});

	it("L10 T11a — preserves a wire-row `blocking: true` when present (forwards-compatible)", async () => {
		// L10 plan §6: the server schema does NOT yet emit `blocking`. The
		// client guard accepts it as an optional field so Playwright fixtures
		// (and a future server emit) can drive `blocking=true` rows without a
		// schema break. When the field is absent the hook still returns
		// `blocking: false` (existing L8 behavior).
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					threads: [
						row({ id: "blk", blocking: true }),
						row({ id: "asy", blocking: false }),
						row({ id: "omit" }),
					],
					nextCursor: null,
				}),
		}) as unknown as typeof fetch;
		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		await waitFor(() => expect(result.current.status).toBe("ready"));

		const blk = result.current.threads.find((t) => t.id === "blk");
		const asy = result.current.threads.find((t) => t.id === "asy");
		const omit = result.current.threads.find((t) => t.id === "omit");
		expect(blk?.blocking).toBe(true);
		expect(asy?.blocking).toBe(false);
		expect(omit?.blocking).toBe(false);
	});

	it("maps hasUnresolvedReview from the list-row to the ThreadItem", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					threads: [
						row({ id: "rev", hasUnresolvedReview: true }),
						row({ id: "plain", hasUnresolvedReview: false }),
					],
					nextCursor: null,
				}),
		}) as unknown as typeof fetch;
		const { result } = renderHook(() => useConversationsThreads("u-founder"));
		await waitFor(() => expect(result.current.status).toBe("ready"));
		const rev = result.current.threads.find((t) => t.id === "rev");
		const plain = result.current.threads.find((t) => t.id === "plain");
		expect(rev?.hasUnresolvedReview).toBe(true);
		expect(plain?.hasUnresolvedReview).toBe(false);
	});
});
