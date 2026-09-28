/**
 * AD9 — sortTeamsByAttention unit tests (AC3).
 *
 * Pure helper: rank blocked(0) → healthy(1); tie-break name asc only.
 * No agent-health tie-break (removed per founder design-review; AU26 J1 then
 * deleted the `agentHealthWarning` field from the wire type outright).
 *
 */

import { describe, expect, it } from "vitest";
import type { TeamsListItem } from "../../../hooks/useTeams.js";
import { sortTeamsByAttention } from "../sortTeamsByAttention.js";

function team(id: string, name: string, status: TeamsListItem["status"]): TeamsListItem {
	return { id, name, status, tasksInProgress: 0 };
}

describe("sortTeamsByAttention", () => {
	it("ranks blocked before healthy, and breaks ties by name ascending", () => {
		const input = [
			team("h2", "Zeta Health", "healthy"),
			team("b1", "Bravo Block", "blocked"),
			team("h1", "Alpha Health", "healthy"),
			team("b2", "Alpha Block", "blocked"),
		];
		const result = sortTeamsByAttention(input);
		expect(result.map((t) => t.id)).toEqual(["b2", "b1", "h1", "h2"]);
	});

	it("empty array returns empty array", () => {
		expect(sortTeamsByAttention([])).toEqual([]);
	});

	it("does not mutate the input array", () => {
		const input = [team("h", "Healthy", "healthy"), team("b", "Blocked", "blocked")];
		const copy = [...input];
		sortTeamsByAttention(input);
		expect(input.map((t) => t.id)).toEqual(copy.map((t) => t.id));
	});
});
