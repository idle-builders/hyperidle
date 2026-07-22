/**
 * I0c: unit test for preloadedAgent short-circuit in buildSessionContextData.
 *
 * Asserts that when a caller supplies preloadedAgent, the users.getUserById
 * port is NOT called — eliminating the duplicate agent read in the
 * session-provisioning → buildSessionContextData chain.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createContextAssembler } from "../context.js";

// Minimal HyperIdleDb stand-in — stubs never use the db object.
const fakeDb = {} as Parameters<
	ReturnType<typeof createContextAssembler>["buildSessionContextData"]
>[0];

const baseConfig = {
	sessionId: "s1",
	taskId: "task-1",
	agentId: "agent-1",
	agentRole: "builder",
	productId: "team-1",
};

function makeCountingPorts(): {
	ports: Pick<Parameters<typeof createContextAssembler>[0], "work" | "users" | "org">;
	getUserByIdCallCount: () => number;
} {
	let callCount = 0;

	const ports: Pick<Parameters<typeof createContextAssembler>[0], "work" | "users" | "org"> = {
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
		const assembler = createContextAssembler(
			ports as unknown as Parameters<typeof createContextAssembler>[0],
		);

		const preloadedAgent = { id: "agent-1", name: "Ada", role: "builder" };

		const result = await assembler.buildSessionContextData(fakeDb, baseConfig, preloadedAgent);

		// The port must not have been called.
		expect(getUserByIdCallCount()).toBe(0);

		// The returned agent data must come from preloadedAgent.
		expect(result.agent).toEqual({ id: "agent-1", name: "Ada", role: "builder" });
	});

	it("DOES call users.getUserById once when preloadedAgent is absent", async () => {
		const { ports, getUserByIdCallCount } = makeCountingPorts();
		const assembler = createContextAssembler(
			ports as unknown as Parameters<typeof createContextAssembler>[0],
		);

		await assembler.buildSessionContextData(fakeDb, baseConfig);

		expect(getUserByIdCallCount()).toBe(1);
	});

	it("throws if preloadedAgent is absent and getUserById returns undefined", async () => {
		const { ports } = makeCountingPorts();
		const nullUserPorts: typeof ports = {
			...ports,
			users: { getUserById: async () => undefined },
		};
		const assembler = createContextAssembler(
			nullUserPorts as unknown as Parameters<typeof createContextAssembler>[0],
		);

		await expect(assembler.buildSessionContextData(fakeDb, baseConfig)).rejects.toThrow(
			"Agent agent-1 not found",
		);
	});
});

describe("assembled workspace contract", () => {
	let sandboxPath: string | undefined;
	afterEach(() => {
		if (sandboxPath) fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	it("creates context, knowledge, work, and .fabric roots through assembly behavior", async () => {
		sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "run-orchestration-context-"));
		const { ports } = makeCountingPorts();
		const assembler = createContextAssembler({
			...ports,
			knowledge: {
				list: async () => [],
				rankAndBudget: async (_db: unknown, items: never[]) => items,
				countTokens: () => 0,
			},
		} as unknown as Parameters<typeof createContextAssembler>[0]);

		await assembler.assembleContext(fakeDb, { ...baseConfig, sandboxPath });

		for (const root of ["context", "knowledge", "work", ".fabric"]) {
			expect(fs.statSync(path.join(sandboxPath, root)).isDirectory()).toBe(true);
		}
		expect(fs.existsSync(path.join(sandboxPath, "context/session.toon"))).toBe(true);
		expect(fs.existsSync(path.join(sandboxPath, ".fabric/manifest.json"))).toBe(true);
	});
});
