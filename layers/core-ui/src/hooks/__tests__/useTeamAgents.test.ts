/**
 * useTeamAgents: filters the full agent catalog down to a team's roster.
 *
 * @lore useTeamAgents is a filter over useAgents' single fetch, not a second
 * fetch — WorkTeam tests only ever assert on `agents`/`refetch`, so a
 * regression where the filter is dropped and every agent is returned still
 * leaves every WorkTeam test green. This test asserts on the filter itself.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/api-fetch.js", () => ({
	apiFetch: vi.fn(),
}));

import { useTeamAgents } from "../useTeamAgents.js";

const ALL_AGENTS = [
	{ id: "agent-a", name: "Alpha" },
	{ id: "agent-b", name: "Bravo" },
	{ id: "agent-c", name: "Charlie" },
];

describe("useTeamAgents", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		const { apiFetch } = await import("../../services/api-fetch.js");
		fetchSpy = vi.mocked(apiFetch);
		fetchSpy.mockReset();
		fetchSpy.mockResolvedValue(new Response(JSON.stringify(ALL_AGENTS), { status: 200 }));
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
