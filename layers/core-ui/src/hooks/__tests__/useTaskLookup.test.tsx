/**
 * BA6 fix-round RED — useTaskLookup: resolving a pre-existing dependency's
 * title must not depend on render timing.
 *
 * Regression: `knownRef` used to mark an id "known" the instant its fetch
 * *started*, not when it resolved. React StrictMode double-invokes effects
 * in dev (mount, cleanup/abort, mount again); the cleanup aborted the first
 * fetch and the id was already marked known, so the second mount saw
 * nothing missing and never retried — the title was lost for good. This is
 * the exact shape the maintainer observed live on `WorkTaskPage`: one
 * `GET /api/tasks?ids=…` succeeding, a second aborted, and the chip falling
 * back to the raw UUID.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import { useTaskLookup } from "../useTaskLookup.js";

describe("useTaskLookup — BA6 fix round", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("resolves the title even when the first attempt is aborted before it settles", async () => {
		let callCount = 0;
		fetchSpy.mockImplementation((_url: string, opts?: RequestInit) => {
			callCount += 1;
			if (callCount === 1) {
				// Mirrors a real aborted fetch: the promise never resolves on its
				// own, it only rejects once its signal is aborted — exactly what
				// StrictMode's immediate cleanup does to the first mount's request.
				return new Promise<Response>((_resolve, reject) => {
					opts?.signal?.addEventListener("abort", () =>
						reject(new DOMException("Aborted", "AbortError")),
					);
				});
			}
			return Promise.resolve(
				new Response(JSON.stringify([{ id: "task-real", title: "Design the schema" }]), {
					status: 200,
				}),
			);
		});

		const { result } = renderHook(() => useTaskLookup(["task-real"]), { wrapper: StrictMode });

		await waitFor(() => expect(result.current["task-real"]).toBe("Design the schema"));
		// Proves the second attempt actually happened — not a fluke of the first
		// call resolving late.
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});
});
