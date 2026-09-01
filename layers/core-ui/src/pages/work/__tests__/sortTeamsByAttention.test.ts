/**
 * AD9 — sortTeamsByAttention unit tests (AC3).
 *
 * Pure helper: rank blocked(0) → behind(1) → healthy(2); tie-break name asc only.
 * No agent-health tie-break (removed per founder design-review; AU26 J1 then
 * deleted the `agentHealthWarning` field from the wire type outright).
 */

import type { TeamListItem } from "@hyperidle/domain-model";
import { describe, expect, it } from "vitest";
import { sortTeamsByAttention } from "../sortTeamsByAttention.js";

const BASE: Omit<TeamListItem, "id" | "name" | "status"> = {
	phase: "build",
	leadAgentId: null,
	tasksInProgress: 0,
	tasksDone: 0,
	shipRate: "—",
	progress: { done: 0, total: 0 },
	routineCount: 0,
	agentCount: 0,
};

function team(id: string, name: string, status: TeamListItem["status"]): TeamListItem {
	return { ...BASE, id, name, status };
}

describe("sortTeamsByAttention", () => {
	it("blocked → behind → healthy ordering", () => {
		const input = [
			team("h", "Healthy Team", "healthy"),
			team("b", "Blocked Team", "blocked"),
			team("e", "Behind Team", "behind"),
		];
		const result = sortTeamsByAttention(input);
		expect(result.map((t) => t.status)).toEqual(["blocked", "behind", "healthy"]);
	});

	it("returns only blocked when all blocked (preserves input order within rank — name asc)", () => {
		const input = [team("b2", "Zeta Team", "blocked"), team("b1", "Alpha Team", "blocked")];
		const result = sortTeamsByAttention(input);
		expect(result.map((t) => t.id)).toEqual(["b1", "b2"]);
	});

	it("within same rank, tie-breaks by name ascending", () => {
		const input = [
			team("3", "Zebra", "healthy"),
			team("1", "Apple", "healthy"),
			team("2", "Mango", "healthy"),
		];
		const result = sortTeamsByAttention(input);
		expect(result.map((t) => t.name)).toEqual(["Apple", "Mango", "Zebra"]);
	});

	it("mixed ranks + ties: blocked before behind before healthy, names asc within rank", () => {
		const input = [
			team("h2", "Zeta Health", "healthy"),
			team("e1", "Alpha Behind", "behind"),
			team("b1", "Bravo Block", "blocked"),
			team("h1", "Alpha Health", "healthy"),
			team("e2", "Beta Behind", "behind"),
			team("b2", "Alpha Block", "blocked"),
		];
		const result = sortTeamsByAttention(input);
		expect(result.map((t) => t.id)).toEqual(["b2", "b1", "e1", "e2", "h1", "h2"]);
	});

	it("single team returns array with same team", () => {
		const input = [team("x", "Only Team", "behind")];
		const result = sortTeamsByAttention(input);
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("x");
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
