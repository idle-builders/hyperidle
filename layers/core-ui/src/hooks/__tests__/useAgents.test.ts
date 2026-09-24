/**
 * useAgents — the shared agent-catalog fetch.
 *
 * @lore BC5 T9: door swap — `call("search_users", { kind: "ai" })` replaces
 * `apiFetch("/api/agents")`.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

import { useAgents } from "../useAgents.js";

const AGENT_ROWS = [
	{
		id: "agent-a",
		kind: "ai",
		name: "Alpha",
		role: "builder",
		status: "active",
		ownerUserId: null,
		agentCategory: "team",
	},
	{
		id: "agent-b",
		kind: "ai",
		name: "Bravo",
		role: "reviewer",
		status: "idle",
		ownerUserId: "u-1",
		agentCategory: "individual",
	},
];

describe("useAgents", () => {
	beforeEach(() => {
		callMock.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls search_users with kind: ai", async () => {
		callMock.mockResolvedValueOnce({ ok: true, data: AGENT_ROWS });
		renderHook(() => useAgents());
		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("search_users", { kind: "ai" });
		});
	});

	it("maps rows to AgentConfig, id/name/role/ownerUserId preserved", async () => {
		callMock.mockResolvedValueOnce({ ok: true, data: AGENT_ROWS });
		const { result } = renderHook(() => useAgents());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.agents).toHaveLength(2);
		expect(result.current.agents[1]).toMatchObject({
			id: "agent-b",
			name: "Bravo",
			role: "reviewer",
			ownerUserId: "u-1",
		});
	});

	it("surfaces an error when the action fails", async () => {
		callMock.mockResolvedValueOnce({
			ok: false,
			problems: [{ code: "server_error", message: "Boom" }],
		});
		const { result } = renderHook(() => useAgents());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.agents).toEqual([]);
	});

	it("refetch() re-issues search_users", async () => {
		callMock.mockResolvedValue({ ok: true, data: AGENT_ROWS });
		const { result } = renderHook(() => useAgents());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});
		callMock.mockClear();
		result.current.refetch();

		await waitFor(() => {
			expect(callMock).toHaveBeenCalledWith("search_users", { kind: "ai" });
		});
	});
});
