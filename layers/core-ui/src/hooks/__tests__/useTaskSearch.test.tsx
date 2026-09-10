/**
 * BA6 RED — useTaskSearch: the picker's search door.
 *
 * The route itself (`GET /api/tasks?q=`) is proven by
 * `BA6-task-search.integration.test.ts` (title match, non-root findable).
 * This hook test covers the client-side half: excluding the task being
 * edited and tasks already in the dependency list from the results the
 * picker offers.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import { useTaskSearch } from "../useTaskSearch.js";

describe("useTaskSearch — BA6", () => {
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
		expect(fetchSpy).toHaveBeenCalledWith(
			expect.stringContaining("/api/tasks?q=picker"),
			expect.anything(),
		);
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
});
