/**
 * useTaskSearch: the picker's search door.
 *
 * The action itself (`search_tasks`) is proven by
 * `task-search.integration.test.ts` (title match, non-root findable).
 * This hook test covers passing `text`/`excludeIds`/`excludeKilled` through
 * to `call("search_tasks", …)` and the debounce/retry status machine.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DEBOUNCE_MS = 200;

vi.mock("../../services/call.js", () => ({
	call: vi.fn(),
}));

import { useTaskSearch } from "../useTaskSearch.js";

// `excludeIds` is a `search_tasks` input now — a stable reference is required
// (the hook, like its real caller `TaskDependencyField`, expects the array to
// be memoized). An inline `[]` at the `renderHook` call site is a NEW array
// every render, which re-triggers the search effect on every state update
// the hook itself causes — an infinite render loop.
const NO_EXCLUDE: readonly string[] = [];
const SOME_EXCLUDE: readonly string[] = ["t-self", "t-picked"];

describe("useTaskSearch", () => {
	let callSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { call } = await import("../../services/call.js");
		callSpy = vi.mocked(call);
		callSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("stays idle and does not call while the query is empty", () => {
		const { result } = renderHook(() => useTaskSearch("", NO_EXCLUDE));
		expect(result.current.status).toBe("idle");
		expect(callSpy).not.toHaveBeenCalled();
	});

	it("searches by title via search_tasks, excludeKilled always true", async () => {
		callSpy.mockResolvedValueOnce({ ok: true, data: [{ id: "t-1", title: "Ship the picker" }] });

		const { result } = renderHook(() => useTaskSearch("picker", NO_EXCLUDE));

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(callSpy).toHaveBeenCalledWith("search_tasks", {
			text: "picker",
			excludeIds: NO_EXCLUDE,
			excludeKilled: true,
		});
		expect(result.current.results).toEqual([{ id: "t-1", title: "Ship the picker" }]);
	});

	it("passes excludeIds through to search_tasks for server-side exclusion", async () => {
		callSpy.mockResolvedValueOnce({ ok: true, data: [{ id: "t-new", title: "A fresh match" }] });

		const { result } = renderHook(() => useTaskSearch("task", SOME_EXCLUDE));

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(callSpy).toHaveBeenCalledWith("search_tasks", {
			text: "task",
			excludeIds: SOME_EXCLUDE,
			excludeKilled: true,
		});
		expect(result.current.results.map((r) => r.id)).toEqual(["t-new"]);
	});

	// A rejection during a server restart set the error, then the user
	// backspaced and retyped "FINAL" fast enough that the debounced value
	// never actually changed (it started at "FINAL" and settled back on
	// "FINAL") — so a naive debounced-value-keyed effect never re-fires and
	// the error is stuck forever.
	it("retries the same query after a failed call, once the query is retyped", async () => {
		vi.useFakeTimers();
		try {
			callSpy.mockResolvedValueOnce({
				ok: false,
				problems: [{ code: "server_error", message: "Search failed" }],
			});
			callSpy.mockResolvedValueOnce({ ok: true, data: [{ id: "t-final", title: "Final push" }] });

			const { result, rerender } = renderHook(({ q }) => useTaskSearch(q, NO_EXCLUDE), {
				initialProps: { q: "FINAL" },
			});

			await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
			await vi.waitFor(() => expect(result.current.status).toBe("error"));
			expect(callSpy).toHaveBeenCalledTimes(1);

			// Backspace + retype "FINAL" fast — each keystroke re-renders with a
			// new raw query, but the debounce timer never settles on anything
			// but "FINAL" again (no pause long enough to commit an intermediate
			// value).
			rerender({ q: "FINA" });
			rerender({ q: "FINAL" });

			await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
			await vi.waitFor(() => expect(result.current.status).toBe("ready"));
			expect(callSpy).toHaveBeenCalledTimes(2);
			expect(result.current.results).toEqual([{ id: "t-final", title: "Final push" }]);
		} finally {
			vi.useRealTimers();
		}
	});
});
