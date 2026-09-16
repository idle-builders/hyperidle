/**
 * useTaskLookup: resolving a pre-existing dependency's
 * title must not depend on render timing.
 *
 * Regression: `knownRef` used to mark an id "known" the instant its fetch
 * *started*, not when it resolved. React StrictMode double-invokes effects
 * in dev (mount, cleanup/abort, mount again); the cleanup aborted the first
 * fetch and the id was already marked known, so the second mount saw
 * nothing missing and never retried — the title was lost for good. This is
 * the exact shape the maintainer observed live on `WorkTaskPage`: one
 * `search_tasks` call succeeding, a first attempt whose effect cleanup ran
 * before it settled, and the chip falling back to the raw UUID.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/call.js", () => ({
	call: vi.fn(),
}));

import { useTaskLookup } from "../useTaskLookup.js";

describe("useTaskLookup", () => {
	let callSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { call } = await import("../../services/call.js");
		callSpy = vi.mocked(call);
		callSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("resolves the title even when the first attempt's effect is cleaned up before it settles", async () => {
		let invocationCount = 0;
		callSpy.mockImplementation(() => {
			invocationCount += 1;
			if (invocationCount === 1) {
				// Mirrors StrictMode's immediate mount/cleanup/mount: the first
				// attempt's promise never settles at all — the cleanup marks it
				// "not settled" (see `useTaskLookup`'s `knownRef` release) before it
				// ever would, so the id is retried by the second mount.
				return new Promise(() => undefined);
			}
			return Promise.resolve({ ok: true, data: [{ id: "task-real", title: "Design the schema" }] });
		});

		const { result } = renderHook(() => useTaskLookup(["task-real"]), { wrapper: StrictMode });

		await waitFor(() => expect(result.current["task-real"]).toBe("Design the schema"));
		// Proves the second attempt actually happened — not a fluke of the first
		// call resolving late.
		expect(callSpy).toHaveBeenCalledTimes(2);
	});
});
