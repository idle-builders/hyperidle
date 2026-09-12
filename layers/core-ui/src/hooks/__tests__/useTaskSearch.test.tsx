/**
 * useTaskSearch: the picker's search door.
 *
 * The route itself (`GET /api/tasks?q=`) is proven by
 * `task-search.integration.test.ts` (title match, non-root findable).
 * This hook test covers the client-side half: excluding the task being
 * edited and tasks already in the dependency list from the results the
 * picker offers.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DEBOUNCE_MS = 200;

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import { useTaskSearch } from "../useTaskSearch.js";

describe("useTaskSearch", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("stays idle and does not fetch while the query is empty", () => {
		const { result } = renderHook(() => useTaskSearch("", []));
		expect(result.current.status).toBe("idle");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("searches by title via GET /api/tasks?q=", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify([{ id: "t-1", title: "Ship the picker" }]), { status: 200 }),
		);

		const { result } = renderHook(() => useTaskSearch("picker", []));

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/api/tasks?q=picker"));
		expect(result.current.results).toEqual([{ id: "t-1", title: "Ship the picker" }]);
	});

	it("excludes the current task and already-picked tasks from the results", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response(
				JSON.stringify([
					{ id: "t-self", title: "The task being edited" },
					{ id: "t-picked", title: "Already a dependency" },
					{ id: "t-new", title: "A fresh match" },
				]),
				{ status: 200 },
			),
		);

		const { result } = renderHook(() => useTaskSearch("task", ["t-self", "t-picked"]));

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current.results.map((r) => r.id)).toEqual(["t-new"]);
	});

	// A 502 during a server restart set the error, then the user backspaced
	// and retyped "FINAL" fast enough that the debounced value never actually
	// changed (it started at "FINAL" and settled back on "FINAL") — so a
	// naive url-keyed fetch never re-fires and the error is stuck forever.
	it("retries the same query after a failed fetch, once the query is retyped", async () => {
		vi.useFakeTimers();
		try {
			fetchSpy.mockResolvedValueOnce(new Response(null, { status: 502 }));
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify([{ id: "t-final", title: "Final push" }]), { status: 200 }),
			);

			const { result, rerender } = renderHook(({ q }) => useTaskSearch(q, []), {
				initialProps: { q: "FINAL" },
			});

			await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
			await vi.waitFor(() => expect(result.current.status).toBe("error"));
			expect(fetchSpy).toHaveBeenCalledTimes(1);

			// Backspace + retype "FINAL" fast — each keystroke re-renders with a
			// new raw query, but the debounce timer never settles on anything
			// but "FINAL" again (no pause long enough to commit an intermediate
			// value).
			rerender({ q: "FINA" });
			rerender({ q: "FINAL" });

			await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
			await vi.waitFor(() => expect(result.current.status).toBe("ready"));
			expect(fetchSpy).toHaveBeenCalledTimes(2);
			expect(result.current.results).toEqual([{ id: "t-final", title: "Final push" }]);
		} finally {
			vi.useRealTimers();
		}
	});
});
