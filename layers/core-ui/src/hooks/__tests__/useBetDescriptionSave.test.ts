/**
 * useBetDescriptionSave hook — unit tests (T3 red phase).
 *
 * Covers:
 *   - Debounces multiple rapid save calls into one PATCH
 *   - Sends correct payload { field: "description", value, reason: "Edited by user" }
 *   - Sends PATCH to correct URL /api/bets/${betId}
 *   - Status transitions: idle -> saving -> saved -> idle (after 3s)
 *   - Calls onSaved callback on success
 *   - Handles non-200 response: status=error
 *   - Handles network error: status=error
 *   - Cleans up timers on unmount (no state updates after unmount)
 *   - Does NOT have a conflict state (bets have no version column)
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import type { UseBetDescriptionSaveOptions } from "../useBetDescriptionSave";
import { useBetDescriptionSave } from "../useBetDescriptionSave";

const BET_ID = "bet-test-1";
const DEFAULT_OPTS: UseBetDescriptionSaveOptions = {
	betId: BET_ID,
};

describe("useBetDescriptionSave", () => {
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
		const { result } = renderHook(() => useBetDescriptionSave(DEFAULT_OPTS));
		expect(result.current.status).toBe("idle");
	});

	it("debounces multiple rapid save calls into one PATCH", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 }));

		const { result } = renderHook(() =>
			useBetDescriptionSave({ ...DEFAULT_OPTS, debounceMs: 1500 }),
		);

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

	it("sends correct payload: { field: 'description', value, reason: 'Edited by user' }", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 }));

		const { result } = renderHook(() => useBetDescriptionSave(DEFAULT_OPTS));

		act(() => {
			result.current.save("my content");
		});

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledWith(`/api/bets/${BET_ID}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					field: "description",
					value: "my content",
					reason: "Edited by user",
				}),
			});
		});
	});

	it("sends PATCH to correct URL /api/bets/:betId", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 }));
		const customBetId = "custom-bet-42";

		const { result } = renderHook(() => useBetDescriptionSave({ betId: customBetId }));

		act(() => {
			result.current.save("content");
		});

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledWith(
				`/api/bets/${customBetId}`,
				expect.objectContaining({ method: "PATCH" }),
			);
		});
	});

	it("transitions status: idle -> saving -> saved", async () => {
		let resolveResponse!: (r: Response) => void;
		const pendingResponse = new Promise<Response>((res) => {
			resolveResponse = res;
		});
		fetchSpy.mockReturnValueOnce(pendingResponse);

		const { result } = renderHook(() => useBetDescriptionSave(DEFAULT_OPTS));

		act(() => {
			result.current.save("content");
		});

		// Status stays idle before debounce
		expect(result.current.status).toBe("idle");

		// After debounce, status becomes saving
		act(() => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(result.current.status).toBe("saving");
		});

		// Resolve the fetch
		await act(async () => {
			resolveResponse(new Response("{}", { status: 200 }));
		});

		await waitFor(() => {
			expect(result.current.status).toBe("saved");
		});
	});

	it("transitions from saved -> idle after 3 seconds", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 }));

		const { result } = renderHook(() => useBetDescriptionSave(DEFAULT_OPTS));

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

	it("calls onSaved callback on successful save", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 }));

		const onSaved = vi.fn();
		const { result } = renderHook(() => useBetDescriptionSave({ ...DEFAULT_OPTS, onSaved }));

		act(() => {
			result.current.save("content");
		});

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(onSaved).toHaveBeenCalledTimes(1);
		});
	});

	it("sets status to error on non-200 response (e.g. 400 status not mutable)", async () => {
		const errorBody = JSON.stringify({
			error: "Field 'description' is not mutable in status 'completed'",
			code: "VALIDATION_ERROR",
		});
		fetchSpy.mockResolvedValueOnce(new Response(errorBody, { status: 400 }));

		const { result } = renderHook(() => useBetDescriptionSave(DEFAULT_OPTS));

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

	it("sets status to error on 500 server error", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("Server Error", { status: 500 }));

		const { result } = renderHook(() => useBetDescriptionSave(DEFAULT_OPTS));

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

	it("sets status to error on network failure", async () => {
		fetchSpy.mockRejectedValueOnce(new Error("Network error"));

		const { result } = renderHook(() => useBetDescriptionSave(DEFAULT_OPTS));

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

		const { result, unmount } = renderHook(() => useBetDescriptionSave(DEFAULT_OPTS));

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

	it("does not have a conflict status — bets have no version column", () => {
		// BetSaveStatus type must not include 'conflict'.
		// We verify this at the type level by checking the status values the hook can produce.
		const { result } = renderHook(() => useBetDescriptionSave(DEFAULT_OPTS));

		// The status starts idle — valid values are: idle, saving, saved, error.
		// 'conflict' is NOT a valid status for this hook.
		expect(result.current.status).toBe("idle");

		// TypeScript compile-time check: if BetSaveStatus included "conflict", this
		// assignment would be valid. The fact that there is no 'conflict' branch in the
		// hook's status machine is the actual verification.
		// Runtime check: confirm status is one of the expected values (not "conflict")
		const validStatuses = ["idle", "saving", "saved", "error"];
		expect(validStatuses).toContain(result.current.status);
		expect(result.current.status).not.toBe("conflict");
	});

	it("uses default debounce of 1500ms when debounceMs is not specified", async () => {
		fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 }));

		const { result } = renderHook(() => useBetDescriptionSave({ betId: BET_ID }));

		act(() => {
			result.current.save("content");
		});

		// Should NOT fire after 1400ms
		await act(async () => {
			vi.advanceTimersByTime(1400);
		});
		expect(fetchSpy).not.toHaveBeenCalled();

		// Should fire after 1500ms
		await act(async () => {
			vi.advanceTimersByTime(100);
		});

		await waitFor(() => {
			expect(fetchSpy).toHaveBeenCalledTimes(1);
		});
	});
});
