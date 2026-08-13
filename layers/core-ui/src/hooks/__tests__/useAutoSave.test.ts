/**
 * useAutoSave hook — unit tests (T2 red phase).
 *
 * Covers:
 *   - Debounces multiple rapid save calls into one PATCH
 *   - Sends correct payload { body, version, updatedBy }
 *   - Status transitions: idle -> saving -> saved -> idle (after 3s)
 *   - Calls onSaved with new version from response
 *   - Handles 409 conflict: status=conflict, calls onConflict
 *   - Handles network error: status=error
 *   - Cleans up timer on unmount (no state updates after unmount)
 *   - Resets status via reset()
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import type { UseAutoSaveOptions } from "../useAutoSave";
import { useAutoSave } from "../useAutoSave";

const ENDPOINT = "/api/knowledge/k1";
const DEFAULT_OPTS: UseAutoSaveOptions = {
	endpoint: ENDPOINT,
	version: 1,
	updatedBy: "user-1",
};

describe("useAutoSave", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.useFakeTimers();
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("starts in idle status", () => {
		const { result } = renderHook(() => useAutoSave(DEFAULT_OPTS));
		expect(result.current.status).toBe("idle");
	});

	it("debounces multiple rapid save calls into one PATCH", async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ version: 2 }), { status: 200 }));

		const { result } = renderHook(() => useAutoSave({ ...DEFAULT_OPTS, debounceMs: 1500 }));

		// Fire three rapid saves
		act(() => {
			result.current.save("draft 1");
			result.current.save("draft 2");
			result.current.save("draft 3");
		});

		// Before debounce elapses, no fetch
		expect(fetchSpy).not.toHaveBeenCalled();

		// Advance past debounce
		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		});
	});

	it("sends correct payload: { body, version, updatedBy }", async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ version: 2 }), { status: 200 }));

		const { result } = renderHook(() =>
			useAutoSave({ ...DEFAULT_OPTS, version: 5, updatedBy: "alice" }),
		);

		act(() => {
			result.current.save("my content");
		});

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledWith(ENDPOINT, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ body: "my content", version: 5, updatedBy: "alice" }),
			});
		});
	});

	it("transitions status: idle -> saving -> saved", async () => {
		let resolveResponse!: (r: Response) => void;
		const pendingResponse = new Promise<Response>((res) => {
			resolveResponse = res;
		});
		fetchSpy.mockReturnValueOnce(pendingResponse);

		const { result } = renderHook(() => useAutoSave(DEFAULT_OPTS));

		act(() => {
			result.current.save("content");
		});

		expect(result.current.status).toBe("saving");

		// After debounce, status becomes saving
		act(() => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(result.current.status).toBe("saving");
		});

		// Resolve the fetch
		await act(async () => {
			resolveResponse(new Response(JSON.stringify({ version: 2 }), { status: 200 }));
		});

		await waitFor(() => {
			expect(result.current.status).toBe("saved");
		});
	});

	it("transitions from saved -> idle after 3 seconds", async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ version: 2 }), { status: 200 }));

		const { result } = renderHook(() => useAutoSave(DEFAULT_OPTS));

		act(() => {
			result.current.save("content");
		});

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(result.current.status).toBe("saved");
		});

		// Advance 3 seconds for the saved -> idle transition
		act(() => {
			vi.advanceTimersByTime(3000);
		});

		await waitFor(() => {
			expect(result.current.status).toBe("idle");
		});
	});

	it("calls onSaved with new version number from response", async () => {
		fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ version: 7 }), { status: 200 }));

		const onSaved = vi.fn();
		const { result } = renderHook(() => useAutoSave({ ...DEFAULT_OPTS, onSaved }));

		act(() => {
			result.current.save("content");
		});

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(onSaved).toHaveBeenCalledWith(7);
		});
	});

	it("sets status to conflict on 409 response and calls onConflict", async () => {
		const conflictBody = JSON.stringify({
			error: "Version conflict",
			code: "CONFLICT",
			details: { currentVersion: 5 },
		});
		fetchSpy.mockResolvedValueOnce(new Response(conflictBody, { status: 409 }));

		const onConflict = vi.fn();
		const { result } = renderHook(() => useAutoSave({ ...DEFAULT_OPTS, onConflict }));

		act(() => {
			result.current.save("content");
		});

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(result.current.status).toBe("conflict");
			expect(onConflict).toHaveBeenCalledWith({ currentVersion: 5 });
		});
	});

	it("sets status to error on network failure", async () => {
		fetchSpy.mockRejectedValueOnce(new Error("Network error"));

		const { result } = renderHook(() => useAutoSave(DEFAULT_OPTS));

		act(() => {
			result.current.save("content");
		});

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(result.current.status).toBe("error");
		});
	});

	it("sets status to error on non-200, non-409 response", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("Server Error", { status: 500 }));

		const { result } = renderHook(() => useAutoSave(DEFAULT_OPTS));

		act(() => {
			result.current.save("content");
		});

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(result.current.status).toBe("error");
		});
	});

	it("cleans up debounce timer on unmount — no state update after unmount", async () => {
		// Never resolves — in-flight fetch
		fetchSpy.mockImplementation(() => new Promise(() => {}));

		const { result, unmount } = renderHook(() => useAutoSave(DEFAULT_OPTS));

		act(() => {
			result.current.save("content");
		});

		// Unmount BEFORE the debounce fires
		unmount();

		// Timer advances after unmount — should not cause state update errors
		await act(async () => {
			vi.advanceTimersByTime(2000);
		});

		// No assertion on state (component is unmounted); the test passes if no
		// "Can't perform a React state update on an unmounted component" error
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("resets status to idle via reset()", async () => {
		fetchSpy.mockRejectedValueOnce(new Error("fail"));

		const { result } = renderHook(() => useAutoSave(DEFAULT_OPTS));

		act(() => {
			result.current.save("content");
		});

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(result.current.status).toBe("error");
		});

		act(() => {
			result.current.reset();
		});

		expect(result.current.status).toBe("idle");
	});
});
