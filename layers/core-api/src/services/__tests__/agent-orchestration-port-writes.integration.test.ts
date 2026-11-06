/**
 * The WRITE side of `AgentOrchestrationPort`: `runConfig` reaches its real
 * backing route through a real in-process transport, both layers' apps composed
 * via the `app` fixture.
 */

import { users } from "@hyperidle/db";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
import {
	buildAgentOrchestrationPort,
	createInProcessAgentOrchestrationTransport,
} from "../agent-orchestration-port-composition.js";

const NOW = "2026-08-08T00:00:00.000Z";

describe("AgentOrchestrationPort — write side (contract-test harness)", () => {
	test("runConfig.write then runConfig.read round-trips through the real route", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-runconfig");
		await db.insert(users).values({
			id: "aopw-rc-agent",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "idle",
			createdAt: NOW,
		});
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		await port.runConfig.write("aopw-rc-agent", {
			harnessType: "claude-code",
			maxConcurrentSessions: 2,
		});
		const config = await port.runConfig.read("aopw-rc-agent");

		expect(config.harnessType).toBe("claude-code");
		expect(config.maxConcurrentSessions).toBe(2);
	});

	test("runConfig.readBatch reads multiple agents in one call, defaulting an unwritten agent", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-runconfig-batch");
		await db.insert(users).values([
			{
				id: "aopw-rcb-agent-1",
				kind: "ai",
				name: "Agent1",
				role: "builder",
				status: "idle",
				createdAt: NOW,
			},
			{
				id: "aopw-rcb-agent-2",
				kind: "ai",
				name: "Agent2",
				role: "builder",
				status: "idle",
				createdAt: NOW,
			},
		]);
		const port = buildAgentOrchestrationPort(createInProcessAgentOrchestrationTransport(app));

		await port.runConfig.write("aopw-rcb-agent-1", { harnessType: "codex" });
		const configs = await port.runConfig.readBatch(["aopw-rcb-agent-1", "aopw-rcb-agent-2"]);

		expect(configs.get("aopw-rcb-agent-1")?.harnessType).toBe("codex");
		expect(configs.get("aopw-rcb-agent-2")?.harnessType).toBeNull();
	});

	test("auth/boundary middleware genuinely ran — a raw call with no credentials is rejected", async ({
		requestWithoutAuth,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "aop-write-key-auth-boundary");
		// The assertion is about the auth middleware, not this specific route —
		// any GET on the same mount proves it.
		const res = await requestWithoutAuth("/api/agent-orchestration/run-config/agent-1");
		expect(res.status).not.toBe(200);
	});
});
