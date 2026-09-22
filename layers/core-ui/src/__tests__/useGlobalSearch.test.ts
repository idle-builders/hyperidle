import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGlobalSearch } from "../hooks/useGlobalSearch";

const mockConversations = [
	{
		id: "c1",
		title: "Deploy review",
		snippet: "Reviewing the deploy pipeline...",
		timestamp: "2 min ago",
		kind: "review" as const,
	},
];

// @lore BB1: work items are now tasks — `state` replaces `status` + `appetite`.
const mockWork = [
	{
		id: "w1",
		title: "Mobile App V2",
		team: "HyperIdle",
		state: "in_progress" as const,
	},
];

const mockDocuments = [
	{
		id: "k1",
		title: "Rate Limiting",
		status: "active" as const,
		timestamp: "1 hour ago",
	},
];

// @lore BC4: the raw fetch payload keeps the `knowledge` wire key (owned by
// layers/core-api/src/routes/search.ts) — only the parsed local shape is `documents`.
const mockSearchResults = {
	conversations: mockConversations,
	work: mockWork,
	knowledge: mockDocuments,
};

// The raw `/api/search` fetch payload — kept on the `knowledge` wire key (§ above).
const emptyResults = {
	conversations: [],
	work: [],
	knowledge: [],
};

// The hook's own parsed shape — asserted against `result.current.results`.
const emptyParsedResults = {
	conversations: [],
	work: [],
	documents: [],
};

describe("useGlobalSearch", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		global.fetch = vi.fn();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("starts with empty query", () => {
		const { result } = renderHook(() => useGlobalSearch());
		expect(result.current.query).toBe("");
	});

	it("starts with empty results", () => {
		const { result } = renderHook(() => useGlobalSearch());
		expect(result.current.results).toEqual(emptyParsedResults);
	});

	it("starts with loading false", () => {
		const { result } = renderHook(() => useGlobalSearch());
		expect(result.current.loading).toBe(false);
	});

	it("starts with hasResults false", () => {
		const { result } = renderHook(() => useGlobalSearch());
		expect(result.current.hasResults).toBe(false);
	});

	it("starts with totalCount 0", () => {
		const { result } = renderHook(() => useGlobalSearch());
		expect(result.current.totalCount).toBe(0);
	});

	it("starts with error null", () => {
		const { result } = renderHook(() => useGlobalSearch());
		expect(result.current.error).toBeNull();
	});

	it("setQuery updates the query string", () => {
		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("deploy");
		});
		expect(result.current.query).toBe("deploy");
	});

	it("debounces fetch by 150ms after setQuery", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("deploy");
		});

		// Before debounce fires, fetch should not have been called
		expect(global.fetch).not.toHaveBeenCalled();

		// Advance past debounce
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("/api/search?q=deploy"),
			expect.anything(),
		);
	});

	it("does not fetch when query is empty", async () => {
		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("");
		});
		await act(async () => {
			vi.advanceTimersByTime(200);
		});
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("sets loading true while fetching", async () => {
		let resolvePromise: (value: unknown) => void;
		const pendingPromise = new Promise((resolve) => {
			resolvePromise = resolve;
		});
		(global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(pendingPromise);

		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("test");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		expect(result.current.loading).toBe(true);

		await act(async () => {
			resolvePromise?.({
				ok: true,
				json: () => Promise.resolve(emptyResults),
			});
		});
	});

	it("populates results after successful fetch", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("deploy");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(result.current.results.conversations).toHaveLength(1);
			expect(result.current.results.work).toHaveLength(1);
			expect(result.current.results.documents).toHaveLength(1);
		});
	});

	it("hasResults is true when results exist", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("deploy");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(result.current.hasResults).toBe(true);
		});
	});

	it("totalCount sums all result groups", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("deploy");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(result.current.totalCount).toBe(3);
		});
	});

	it("clear() resets query and results", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("deploy");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});
		await waitFor(() => {
			expect(result.current.hasResults).toBe(true);
		});

		act(() => {
			result.current.clear();
		});

		expect(result.current.query).toBe("");
		expect(result.current.results).toEqual(emptyParsedResults);
		expect(result.current.hasResults).toBe(false);
		expect(result.current.totalCount).toBe(0);
	});

	it("cancels in-flight request when query changes", async () => {
		const abortSpy = vi.spyOn(AbortController.prototype, "abort");
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(emptyResults),
		});

		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("first");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		act(() => {
			result.current.setQuery("second");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		expect(abortSpy).toHaveBeenCalled();
		abortSpy.mockRestore();
	});

	it("sets loading false and sets error after fetch error", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("fail");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
			expect(result.current.error).toBe("Network error");
		});
	});

	it("ignores AbortError without setting error state", async () => {
		const abortError = new DOMException("The operation was aborted", "AbortError");
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(abortError);

		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("abort-test");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		// Give the catch handler time to run
		await act(async () => {
			vi.advanceTimersByTime(0);
		});

		expect(result.current.error).toBeNull();
	});

	it("clears error on clear()", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("fail");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});
		await waitFor(() => {
			expect(result.current.error).toBe("Network error");
		});

		act(() => {
			result.current.clear();
		});

		expect(result.current.error).toBeNull();
	});

	it("validates response data structure", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ conversations: "not-an-array", unexpected: true }),
		});

		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("malformed");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Should have safely defaulted invalid fields to empty arrays
		expect(result.current.results.conversations).toEqual([]);
		expect(result.current.results.work).toEqual([]);
		expect(result.current.results.documents).toEqual([]);
	});

	it("clears stale results when query becomes empty", async () => {
		// I4 N2: spec validation scenario — "given search results showing,
		// when query cleared character by character, then results clear".
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockSearchResults),
		});

		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("foo");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});
		await waitFor(() => {
			expect(result.current.hasResults).toBe(true);
		});

		act(() => {
			result.current.setQuery("fo");
		});
		act(() => {
			result.current.setQuery("f");
		});
		act(() => {
			result.current.setQuery("");
		});

		// After the final setQuery(""), the hook must synchronously reset
		// results (no pending fetch, no in-flight stale data).
		expect(result.current.query).toBe("");
		expect(result.current.results).toEqual(emptyParsedResults);
		expect(result.current.hasResults).toBe(false);
		expect(result.current.totalCount).toBe(0);
	});

	it("aborts in-flight fetch on unmount", async () => {
		const abortSpy = vi.spyOn(AbortController.prototype, "abort");
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(emptyResults),
		});

		const { result, unmount } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("unmount-test");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		unmount();
		expect(abortSpy).toHaveBeenCalled();
		abortSpy.mockRestore();
	});

	it("surfaces an error when every row in non-empty buckets is malformed (adversary C4)", async () => {
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		// Server returns non-empty buckets but every row is missing required fields.
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					conversations: [{ foo: "no-id-here" }, { bar: "also-bad" }],
					work: [{ unrelated: true }],
					knowledge: [],
				}),
		});

		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("schema-drift");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
			expect(result.current.error).not.toBeNull();
		});
		// Results must remain empty; no stale data.
		expect(result.current.results).toEqual(emptyParsedResults);
		// The hook logged the diagnostic with its prefix.
		const hasLog = errSpy.mock.calls
			.map((c) => c.join(" "))
			.some((c) => c.includes("[useGlobalSearch]"));
		expect(hasLog).toBe(true);
		errSpy.mockRestore();
	});

	it("clear() aborts any in-flight fetch (adversary W7)", async () => {
		const abortSpy = vi.spyOn(AbortController.prototype, "abort");
		// Pending fetch so the controller is in-flight when clear() is called.
		(global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

		const { result } = renderHook(() => useGlobalSearch());
		act(() => {
			result.current.setQuery("inflight");
		});
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		abortSpy.mockClear();
		act(() => {
			result.current.clear();
		});

		expect(abortSpy).toHaveBeenCalled();
		expect(result.current.loading).toBe(false);
		abortSpy.mockRestore();
	});
});
