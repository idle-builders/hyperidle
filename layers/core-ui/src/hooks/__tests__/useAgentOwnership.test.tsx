/**
 * useAgentOwnership — BC3. Fetches `GET /api/users?kind=ai` and exposes each
 * row's `id`/`ownerUserId` — the one fact `AssistantOverlay`/`SettingsAgents`
 * need to know which agent a user owns.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentOwnership } from "../useAgentOwnership.js";

describe("useAgentOwnership", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		global.fetch = fetchSpy as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("fetches /api/users?kind=ai and exposes id/ownerUserId rows, dropping malformed ones", async () => {
		fetchSpy.mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve([
					{ id: "agent-1", ownerUserId: "u-founder" },
					{ id: "agent-2", ownerUserId: null },
					{ ownerUserId: "u-founder" }, // no id — dropped
				]),
		});

		const { result } = renderHook(() => useAgentOwnership());
		expect(result.current.loading).toBe(true);

		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("/api/users?kind=ai"), expect.anything());
		expect(result.current.rows).toEqual([
			{ id: "agent-1", ownerUserId: "u-founder" },
			{ id: "agent-2", ownerUserId: null },
		]);
	});
});
