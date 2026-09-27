/**
 * useTeamAgents: filters the full agent catalog down to a team's roster.
 *
 * @lore useTeamAgents filters useAgents' single fetch — WorkTeam's own tests never assert on the filter, so this test covers it directly.
 *
 * @lore useAgents' internal fetch is call("search_users", …) — this test mocks call instead of apiFetch.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }));
vi.mock("../../services/call.js", () => ({ call: callMock }));

import { useTeamAgents } from "../useTeamAgents.js";

const ALL_AGENT_ROWS = [
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
		role: "builder",
		status: "active",
		ownerUserId: null,
		agentCategory: "team",
	},
	{
		id: "agent-c",
		kind: "ai",
		name: "Charlie",
		role: "builder",
		status: "active",
		ownerUserId: null,
		agentCategory: "team",
	},
];

describe("useTeamAgents", () => {
	beforeEach(() => {
		callMock.mockReset();
		callMock.mockResolvedValue({ ok: true, data: ALL_AGENT_ROWS });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns only the given team's agents, not the full catalog", async () => {
		const { result } = renderHook(() => useTeamAgents(["agent-a", "agent-c"]));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(Array.from(result.current.agents.keys()).sort()).toEqual(["agent-a", "agent-c"]);
		expect(result.current.agents.has("agent-b")).toBe(false);
	});

	it("returns an empty roster when given no ids", async () => {
		const { result } = renderHook(() => useTeamAgents([]));

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.agents.size).toBe(0);
	});
});
