/**
 * useAgents — the shared agent-catalog fetch.
 *
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
		discipline: "builder",
		status: "active",
		ownerUserId: null,
		agentCategory: "team",
	},
	{
		id: "agent-b",
		kind: "ai",
		name: "Bravo",
		discipline: "reviewer",
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

	it("maps rows to AgentConfig, id/name/discipline/ownerUserId preserved", async () => {
		callMock.mockResolvedValueOnce({ ok: true, data: AGENT_ROWS });
		const { result } = renderHook(() => useAgents());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.agents).toHaveLength(2);
		expect(result.current.agents[1]).toMatchObject({
			id: "agent-b",
			name: "Bravo",
			discipline: "reviewer",
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

	it("refetch() re-fetches and replaces the agent list", async () => {
		callMock.mockResolvedValueOnce({ ok: true, data: AGENT_ROWS });
		const { result } = renderHook(() => useAgents());

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});
		expect(result.current.agents).toHaveLength(2);

		callMock.mockResolvedValueOnce({ ok: true, data: [AGENT_ROWS[0]] });
		result.current.refetch();

		await waitFor(() => {
			expect(result.current.agents).toHaveLength(1);
		});
	});
});
