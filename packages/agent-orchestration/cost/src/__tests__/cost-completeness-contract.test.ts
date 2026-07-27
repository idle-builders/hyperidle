import type { HyperIdleDb } from "@hyperidle/db";
import { EventBus } from "@hyperidle/shared";
import { describe, expect, it, vi } from "vitest";
import { type CostDeps, createCostOps } from "../index.js";

const db = {} as HyperIdleDb;

interface HarnessState {
	users: Map<
		string,
		{ id: string; costActual: number; costCap: number | null; costCapMinor: number | null }
	>;
	teams: Map<
		string,
		{ id: string; costActual: number; costCap: number | null; costCapMinor: number | null }
	>;
	betCosts: Map<string, number>;
	betCurrencies: Map<string, string>;
	reviewItems: Array<{ kind: string; blocking: boolean }>;
	sentinelLevel: "ok" | "warning" | "breach" | null;
}

function makeHarness(): { deps: CostDeps; state: HarnessState } {
	const state: HarnessState = {
		users: new Map([
			["agent-1", { id: "agent-1", costActual: 0, costCap: null, costCapMinor: 100 }],
		]),
		teams: new Map([["team-1", { id: "team-1", costActual: 0, costCap: null, costCapMinor: 200 }]]),
		betCosts: new Map(),
		betCurrencies: new Map(),
		reviewItems: [],
		sentinelLevel: null,
	};

	const deps: CostDeps = {
		users: {
			getUserById: async (_db, id) => state.users.get(id),
			incrementUserCost: async (_db, id, delta) => {
				const user = state.users.get(id);
				if (user) user.costActual += delta;
			},
			resetAllUserCost: async () => {
				for (const user of state.users.values()) user.costActual = 0;
			},
			sumAllUserCost: async () =>
				[...state.users.values()].reduce((total, user) => total + user.costActual, 0),
			updateUser: async (_db, id, patch) => {
				const user = state.users.get(id);
				if (user) user.costActual = patch.costActual;
			},
		},
		org: {
			getTeamMembersById: async (_db, id) => state.teams.get(id),
			incrementTeamMembersCost: async (_db, id, delta) => {
				const team = state.teams.get(id);
				if (team) team.costActual += delta;
			},
			resetTeamMembersCost: async (_db, id) => {
				const team = state.teams.get(id);
				if (team) team.costActual = 0;
			},
			resetAllTeamMembersCost: async () => {
				for (const team of state.teams.values()) team.costActual = 0;
			},
		},
		work: {
			getTaskById: async (_db, id) => (id === "task-1" ? { betId: "bet-1" } : undefined),
			incrementBetCost: async (_db, id, delta, currency) => {
				state.betCosts.set(id, (state.betCosts.get(id) ?? 0) + delta);
				state.betCurrencies.set(id, currency);
			},
			createItem: async (_db, item) => {
				state.reviewItems.push({ kind: item.kind, blocking: item.blocking });
			},
		},
		settings: {
			readServerConfig: async () => ({
				cost: { capMinor: 100 },
				internal: { costSentinelLastLevel: state.sentinelLevel },
			}),
			updateServerConfig: async (_db, patch) => {
				state.sentinelLevel = patch.internal?.costSentinelLastLevel ?? state.sentinelLevel;
			},
		},
	};

	return { deps, state };
}

describe("cost service completeness contract", () => {
	it("checks agent, team, then factory caps and otherwise allows work", async () => {
		const { deps, state } = makeHarness();
		const ops = createCostOps(deps);
		const bus = new EventBus();

		state.users.get("agent-1")!.costActual = 100;
		expect(await ops.check(db, bus, { agentId: "agent-1", teamId: "team-1" })).toMatchObject({
			allowed: false,
			level: "agent",
		});
		state.users.get("agent-1")!.costActual = 0;
		state.teams.get("team-1")!.costActual = 200;
		expect(await ops.check(db, bus, { agentId: "agent-1", teamId: "team-1" })).toMatchObject({
			allowed: false,
			level: "team",
		});
		state.teams.get("team-1")!.costActual = 0;
		expect(
			await ops.check(db, bus, {
				agentId: "agent-1",
				factoryCap: 300,
				factorySpend: 300,
			}),
		).toMatchObject({ allowed: false, level: "factory" });
		expect(await ops.check(db, bus, { agentId: "agent-1" })).toEqual({ allowed: true });
	});

	it("records concurrent deltas atomically at agent, team, and bet scopes", async () => {
		const { deps, state } = makeHarness();
		const ops = createCostOps(deps);
		const bus = new EventBus();
		state.users.get("agent-1")!.costCapMinor = 10_000;
		state.teams.get("team-1")!.costCapMinor = 10_000;

		await Promise.all(
			Array.from({ length: 20 }, (_, index) =>
				ops.record(db, bus, {
					sessionId: `session-${index}`,
					agentId: "agent-1",
					teamId: "team-1",
					taskId: "task-1",
					costMinor: 5,
					currency: "CHF",
				}),
			),
		);

		expect(state.users.get("agent-1")!.costActual).toBe(100);
		expect(state.teams.get("team-1")!.costActual).toBe(100);
		expect(state.betCosts.get("bet-1")).toBe(100);
		expect(state.betCurrencies.get("bet-1")).toBe("CHF");
	});

	it("emits warning and breach once per session and creates one blocking review", async () => {
		const { deps, state } = makeHarness();
		const ops = createCostOps(deps);
		const bus = new EventBus();
		const emitted: string[] = [];
		bus.on("cost_cap_warning", () => emitted.push("warning"));
		bus.on("cost_cap_breached", () => emitted.push("breach"));

		await ops.record(db, bus, {
			sessionId: "session-1",
			agentId: "agent-1",
			costMinor: 100,
			reviewThreadId: "thread-1",
		});
		await ops.record(db, bus, {
			sessionId: "session-1",
			agentId: "agent-1",
			costMinor: 1,
			reviewThreadId: "thread-1",
		});

		expect(emitted).toEqual(["breach", "warning"]);
		expect(state.reviewItems).toEqual([{ kind: "cost_cap_breach", blocking: true }]);
	});

	it("reads and resets every supported spend scope", async () => {
		const { deps, state } = makeHarness();
		const ops = createCostOps(deps);
		state.users.get("agent-1")!.costActual = 30;
		state.teams.get("team-1")!.costActual = 40;

		expect(await ops.spend(db, { level: "agent", id: "agent-1" })).toBe(30);
		expect(await ops.spend(db, { level: "team", id: "team-1" })).toBe(40);
		expect(await ops.spend(db, { level: "factory" })).toBe(30);
		await ops.reset(db, { level: "agent", id: "agent-1" });
		await ops.reset(db, { level: "team", id: "team-1" });
		expect(await ops.spend(db, { level: "factory" })).toBe(0);
		state.users.get("agent-1")!.costActual = 10;
		state.teams.get("team-1")!.costActual = 20;
		await ops.reset(db, { level: "factory" });
		expect(state.users.get("agent-1")!.costActual).toBe(0);
		expect(state.teams.get("team-1")!.costActual).toBe(0);
	});

	it("sentinel emits only on level transitions and lifecycle releases session dedup", async () => {
		vi.useFakeTimers();
		try {
			const { deps, state } = makeHarness();
			const ops = createCostOps(deps);
			const bus = new EventBus();
			const emitted: string[] = [];
			bus.on("cost_cap_warning", () => emitted.push("warning"));
			bus.on("cost_cap_breached", () => emitted.push("breach"));

			state.users.get("agent-1")!.costActual = 80;
			await ops.runCostSentinelCheck(db, bus);
			await ops.runCostSentinelCheck(db, bus);
			state.users.get("agent-1")!.costActual = 100;
			await ops.runCostSentinelCheck(db, bus);
			expect(emitted).toEqual(["warning", "breach"]);

			await ops.record(db, bus, { sessionId: "session-1", agentId: "agent-1", costMinor: 1 });
			expect(ops._testHooks.getDedupSize()).toBe(1);
			const stop = ops.startSentinel(db, bus);
			bus.emit({
				type: "session_ended",
				streamId: "session-1",
				sessionId: "session-1",
				agentId: "agent-1",
				taskId: null,
				outcome: "completed",
				timestamp: 1,
			});
			expect(ops._testHooks.getDedupSize()).toBe(0);
			stop();
		} finally {
			vi.useRealTimers();
		}
	});
});
