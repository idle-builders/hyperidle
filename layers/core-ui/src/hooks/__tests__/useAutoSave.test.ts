/**
 * useAutoSave hook — unit tests.
 *
 * Covers:
 *   - Debounces multiple rapid save calls into one `save()` call
 *   - Calls the caller-supplied `save(content)` door with the raw content
 *   - Status transitions: idle -> saving -> saved -> idle (after 3s)
 *   - Calls onSaved with the action's output
 *   - A `stale` problem: status=conflict, calls onConflict with the problems
 *   - Any other refusal or a thrown error: status=error
 *   - Cleans up timer on unmount (no state updates after unmount)
 *   - Resets status via reset()
 */

import type { ActionResult } from "@hyperidle/domain-model";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutoSave } from "../useAutoSave";

describe("useAutoSave", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("starts in idle status", () => {
		const saveFn = vi.fn();
		const { result } = renderHook(() => useAutoSave({ save: saveFn }));
		expect(result.current.status).toBe("idle");
	});

	it("debounces multiple rapid save calls into one call to save()", async () => {
		const saveFn = vi.fn<(content: string) => Promise<ActionResult<{ version: number }>>>(() =>
			Promise.resolve({ ok: true, data: { version: 2 } }),
		);
		const { result } = renderHook(() => useAutoSave({ save: saveFn, debounceMs: 1500 }));

		act(() => {
			result.current.save("draft 1");
			result.current.save("draft 2");
			result.current.save("draft 3");
		});

		expect(saveFn).not.toHaveBeenCalled();

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(saveFn).toHaveBeenCalledTimes(1);
		});
	});

	it("calls save() with the raw content string", async () => {
		const saveFn = vi.fn<(content: string) => Promise<ActionResult<{ version: number }>>>(() =>
			Promise.resolve({ ok: true, data: { version: 2 } }),
		);
		const { result } = renderHook(() => useAutoSave({ save: saveFn }));

		act(() => {
			result.current.save("my content");
		});

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(saveFn).toHaveBeenCalledWith("my content");
		});
	});

	it("transitions status: idle -> saving -> saved", async () => {
		let resolveSave!: (r: ActionResult<{ version: number }>) => void;
		const pending = new Promise<ActionResult<{ version: number }>>((res) => {
			resolveSave = res;
		});
		const saveFn = vi.fn().mockReturnValueOnce(pending);

		const { result } = renderHook(() => useAutoSave({ save: saveFn }));

		act(() => {
			result.current.save("content");
		});

		expect(result.current.status).toBe("saving");

		act(() => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(result.current.status).toBe("saving");
		});

		await act(async () => {
			resolveSave({ ok: true, data: { version: 2 } });
		});

		await waitFor(() => {
			expect(result.current.status).toBe("saved");
		});
	});

	it("transitions from saved -> idle after 3 seconds", async () => {
		const saveFn = vi.fn().mockResolvedValueOnce({ ok: true, data: { version: 2 } });
		const { result } = renderHook(() => useAutoSave({ save: saveFn }));

		act(() => {
			result.current.save("content");
		});

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(result.current.status).toBe("saved");
		});

		act(() => {
			vi.advanceTimersByTime(3000);
		});

		await waitFor(() => {
			expect(result.current.status).toBe("idle");
		});
	});

	it("calls onSaved with the action's output", async () => {
		const saveFn = vi.fn().mockResolvedValueOnce({ ok: true, data: { version: 7 } });
		const onSaved = vi.fn();
		const { result } = renderHook(() => useAutoSave({ save: saveFn, onSaved }));

		act(() => {
			result.current.save("content");
		});

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(onSaved).toHaveBeenCalledWith({ version: 7 });
		});
	});

	it("sets status to conflict on a `stale` problem and calls onConflict with the problems", async () => {
		const staleProblems = [
			{
				code: "stale",
				message: "The document changed since you read it — open it again and retry.",
			},
		];
		const saveFn = vi.fn().mockResolvedValueOnce({ ok: false, problems: staleProblems });

		const onConflict = vi.fn();
		const { result } = renderHook(() => useAutoSave({ save: saveFn, onConflict }));

		act(() => {
			result.current.save("content");
		});

		await act(async () => {
			vi.advanceTimersByTime(1500);
		});

		await waitFor(() => {
			expect(result.current.status).toBe("conflict");
			expect(onConflict).toHaveBeenCalledWith(staleProblems);
		});
	});

	it("sets status to error on a non-stale refusal", async () => {
		const saveFn = vi.fn().mockResolvedValueOnce({
			ok: false,
			problems: [{ code: "title_required", message: "A document needs a title." }],
		});

		const { result } = renderHook(() => useAutoSave({ save: saveFn }));

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

	it("sets status to error when save() rejects", async () => {
		const saveFn = vi.fn().mockRejectedValueOnce(new Error("Network error"));

		const { result } = renderHook(() => useAutoSave({ save: saveFn }));

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
		const saveFn = vi.fn(() => new Promise<ActionResult<{ version: number }>>(() => {}));
		const { result, unmount } = renderHook(() => useAutoSave({ save: saveFn }));

		act(() => {
			result.current.save("content");
		});

		// Unmount BEFORE the debounce fires
		unmount();

		await act(async () => {
			vi.advanceTimersByTime(2000);
		});

		// No assertion on state (component is unmounted); the test passes if no
		// "Can't perform a React state update on an unmounted component" error
		expect(saveFn).not.toHaveBeenCalled();
	});

	it("resets status to idle via reset()", async () => {
		const saveFn = vi.fn().mockRejectedValueOnce(new Error("fail"));

		const { result } = renderHook(() => useAutoSave({ save: saveFn }));

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
