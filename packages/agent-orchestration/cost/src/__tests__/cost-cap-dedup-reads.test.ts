/**
 * I0b: Eliminate duplicate DB reads in checkCostCap / recordCostAndCheck.
 *
 * Both functions previously called getUserById 2× and getTeamMembersById 2×:
 * once to load the row for cap resolution, then again via getAgentSpend /
 * getTeamSpend which re-queried the same unchanged row. These tests assert
 * each helper is called EXACTLY ONCE per top-level function invocation.
 *
 * RED before I0b implementation (counts are 2); GREEN after (counts are 1).
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { checkCostCap, clearDeduplicationCache, recordCostAndCheck } from "../cost-cap.js";
import type { CostDeps, CostTeamRow, CostUserRow } from "../ports.js";

// ────────────────────────────────────────────────────────────────────────────
// Stub factory
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns a CostDeps stub with call counters for the two methods under test.
 * The agent row has costCap set so the redundant-read code-path is exercised
 * (the helpers are only called when a cap is non-null).
 */
function makeCountingDeps(): {
	deps: CostDeps;
	getUserByIdCount: () => number;
	getTeamMembersByIdCount: () => number;
} {
	let userCalls = 0;
	let teamCalls = 0;

	// Caps must be non-null so the agentCap / teamCap branches are entered and
	// the redundant getAgentSpend / getTeamSpend calls are triggered.
	const agentRow: CostUserRow = {
		id: "agent-1",
		costActual: 100,
		costCap: 5000,
		costCapMinor: null,
	};

	const teamRow: CostTeamRow = {
		id: "team-1",
		costActual: 200,
		costCap: 10000,
		costCapMinor: null,
	};

	const deps: CostDeps = {
		users: {
			getUserById: async (_db, _id) => {
				userCalls++;
				return agentRow;
			},
			incrementUserCost: async () => {},
			resetAllUserCost: async () => {},
			sumAllUserCost: async () => 0,
			updateUser: async () => {},
		},
		org: {
			getTeamMembersById: async (_db, _id) => {
				teamCalls++;
				return teamRow;
			},
			incrementTeamMembersCost: async () => {},
			resetTeamMembersCost: async () => {},
			resetAllTeamMembersCost: async () => {},
		},
		work: {
			getTaskById: async () => undefined,
			incrementBetCost: async () => {},
			createItem: async () => {},
		},
		settings: {
			readServerConfig: async () => ({
				cost: { capMinor: 100_000 },
				internal: { costSentinelLastLevel: null },
			}),
			updateServerConfig: async () => {},
		},
	};

	return {
		deps,
		getUserByIdCount: () => userCalls,
		getTeamMembersByIdCount: () => teamCalls,
	};
}

// Stub db — never touched by the counting stubs
const db = {} as HyperIdleDb;

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe("I0b: no duplicate DB reads", () => {
	beforeEach(() => {
		clearDeduplicationCache();
	});

	describe("checkCostCap", () => {
		it("calls getUserById exactly once (not 2×)", async () => {
			const { deps, getUserByIdCount } = makeCountingDeps();
			const bus = new EventBus();

			await checkCostCap(deps, db, bus, {
				agentId: "agent-1",
				teamId: "team-1",
			});

			expect(getUserByIdCount()).toBe(1);
		});

		it("calls getTeamMembersById exactly once (not 2×)", async () => {
			const { deps, getTeamMembersByIdCount } = makeCountingDeps();
			const bus = new EventBus();

			await checkCostCap(deps, db, bus, {
				agentId: "agent-1",
				teamId: "team-1",
			});

			expect(getTeamMembersByIdCount()).toBe(1);
		});
	});

	describe("recordCostAndCheck", () => {
		it("calls getUserById exactly once after increment (not 2×)", async () => {
			const { deps, getUserByIdCount } = makeCountingDeps();
			const bus = new EventBus();

			await recordCostAndCheck(deps, db, bus, {
				sessionId: "sess-1",
				agentId: "agent-1",
				teamId: "team-1",
				costMinor: 10,
			});

			expect(getUserByIdCount()).toBe(1);
		});

		it("calls getTeamMembersById exactly once after increment (not 2×)", async () => {
			const { deps, getTeamMembersByIdCount } = makeCountingDeps();
			const bus = new EventBus();

			await recordCostAndCheck(deps, db, bus, {
				sessionId: "sess-1",
				agentId: "agent-1",
				teamId: "team-1",
				costMinor: 10,
			});

			expect(getTeamMembersByIdCount()).toBe(1);
		});
	});
});
