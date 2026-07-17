/**
 * I0c: unit test for preloadedAgent short-circuit in buildSessionContextData.
 *
 * Asserts that when a caller supplies preloadedAgent, the users.getUserById
 * port is NOT called — eliminating the duplicate agent read in the
 * session-provisioning → buildSessionContextData chain.
 */
import { describe, expect, it } from "vitest";
import type { ContextAssemblyPorts } from "../ports.js";
import type { SessionContextConfig } from "../session-context.js";
import { buildSessionContextData } from "../session-context.js";

// Minimal HyperIdleDb stand-in — stubs never use the db object.
const fakeDb = {} as Parameters<typeof buildSessionContextData>[0];

const baseConfig: SessionContextConfig = {
	sessionId: "s1",
	taskId: "task-1",
	agentId: "agent-1",
	agentRole: "builder",
	productId: "team-1",
};

function makeCountingPorts(): {
	ports: Pick<ContextAssemblyPorts, "work" | "users" | "org">;
	getUserByIdCallCount: () => number;
} {
	let callCount = 0;

	const ports: Pick<ContextAssemblyPorts, "work" | "users" | "org"> = {
		work: {
			getTaskById: async (_db, _id) =>
				({
					id: "task-1",
					betId: "bet-1",
					title: "Do the thing",
					description: "Details",
					state: "in_progress",
					// biome-ignore lint/suspicious/noExplicitAny: test stub minimal shape
				}) as any,
			getBetById: async (_db, _id) =>
				({
					id: "bet-1",
					description: "Ship fast",
					appetite: "small",
					doneCondition: null,
					tokensActualJson: null,
					// biome-ignore lint/suspicious/noExplicitAny: test stub minimal shape
				}) as any,
		},
		users: {
			getUserById: async (_db, _id) => {
				callCount++;
				return {
					id: "agent-1",
					name: "Ada",
					role: "builder",
					// biome-ignore lint/suspicious/noExplicitAny: test stub minimal shape
				} as any;
			},
		},
		org: {
			getTeamById: async (_db, _id) =>
				({
					id: "team-1",
					name: "Alpha",
					// biome-ignore lint/suspicious/noExplicitAny: test stub minimal shape
				}) as any,
		},
	};

	return { ports, getUserByIdCallCount: () => callCount };
}

describe("buildSessionContextData — preloadedAgent short-circuit (I0c)", () => {
	it("does NOT call users.getUserById when preloadedAgent is supplied", async () => {
		const { ports, getUserByIdCallCount } = makeCountingPorts();

		const preloadedAgent = { id: "agent-1", name: "Ada", role: "builder" };

		const result = await buildSessionContextData(fakeDb, baseConfig, ports, preloadedAgent);

		// The port must not have been called.
		expect(getUserByIdCallCount()).toBe(0);

		// The returned agent data must come from preloadedAgent.
		expect(result.agent).toEqual({ id: "agent-1", name: "Ada", role: "builder" });
	});

	it("DOES call users.getUserById once when preloadedAgent is absent", async () => {
		const { ports, getUserByIdCallCount } = makeCountingPorts();

		await buildSessionContextData(fakeDb, baseConfig, ports);

		expect(getUserByIdCallCount()).toBe(1);
	});

	it("throws if preloadedAgent is absent and getUserById returns undefined", async () => {
		const { ports } = makeCountingPorts();
		const nullUserPorts: typeof ports = {
			...ports,
			users: { getUserById: async () => undefined },
		};

		await expect(buildSessionContextData(fakeDb, baseConfig, nullUserPorts)).rejects.toThrow(
			"Agent agent-1 not found",
		);
	});
});
