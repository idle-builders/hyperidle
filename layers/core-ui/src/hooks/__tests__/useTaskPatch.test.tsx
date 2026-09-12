/**
 * AC5's UI half: `useTaskPatch` currently discards the response
 * body on a non-2xx (`status="error"` and nothing else), so a cycle
 * rejection's message never reaches the person who triggered it. This test
 * asserts the hook surfaces that message instead.
 *
 * Mirrors `useAutoSave.test.ts`'s `apiFetch` mock pattern.
 *
 * @lore BA6: `errorMessage` does not exist yet on `UseTaskPatchResult` — this
 * is the intended shape (mirrors `useAutoSave`'s `onConflict` details plumbing,
 * the closest sibling pattern in this file's directory). Referencing it here
 * is deliberate: this file is red until the green phase adds it.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import { useTaskPatch } from "../useTaskPatch";

describe("useTaskPatch — AC5: surfaces the response body on failure", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("surfaces a 409 cycle rejection's message instead of discarding it", async () => {
		const cycleBody = JSON.stringify({
			error: "Task task-cycle-a cannot be a child of task-cycle-b: that would form a cycle",
			code: "TASK_CYCLE",
		});
		fetchSpy.mockResolvedValueOnce(new Response(cycleBody, { status: 409 }));

		const { result } = renderHook(() => useTaskPatch());

		act(() => {
			result.current.patch("task-1", { dependencies: ["task-cycle-b"] });
		});

		await waitFor(() => {
			expect(result.current.status).toBe("error");
		});

		expect((result.current as { errorMessage?: string | null }).errorMessage).toBe(
			"Task task-cycle-a cannot be a child of task-cycle-b: that would form a cycle",
		);
	});
});
