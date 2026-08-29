/**
 * useThreadDetail — empty threadId skip.
 *
 * `ReviewPage` calls `useThreadDetail(subject?.threadId ?? "")` before the
 * review subject has loaded. Without a skip for the empty id, the hook fires
 * `GET /api/threads/` (a malformed request) and subscribes to a bogus
 * `thread:` WS topic on every mount. Mirrors `useHostThread`'s existing
 * empty-hostId skip.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThreadDetail } from "../useThreadDetail.js";

describe("useThreadDetail — empty threadId skip", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("never fetches and stays in loading status when threadId is empty", async () => {
		const { result } = renderHook(() => useThreadDetail(""));

		// Give any accidental async fetch a tick to have fired.
		await waitFor(() => {
			expect(result.current.status).toBe("loading");
		});

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(result.current.data).toBeNull();
		expect(result.current.error).toBeNull();
	});
});
