/**
 * Unit tests for sessionRunRegistry deliver and deliverToConversation.
 */

import { describe, expect, it } from "vitest";
import { sessionRunRegistry } from "../session-run-registry.js";

describe("sessionRunRegistry — deliver", () => {
	it("calls the session's deliver fn and returns its result", async () => {
		const deliverFn = async (_text: string) => "delivered" as const;
		sessionRunRegistry.register("s1", {
			signalAbort: () => {},
			handle: { sessionId: "s1" },
			adapter: {
				startSession: async () => ({ sessionId: "" }),
				streamEvents: async function* () {},
				stopSession: async () => ({
					outcome: "completed" as const,
					tokenUsage: { byTier: {} },
					metrics: undefined,
				}),
				getCapabilities: () => ({
					preCompactionTrigger: false,
					subAgents: false,
					modelProviders: [],
					mcpSupport: false,
					returnEnforcement: "none" as const,
				}),
			},
			deliver: deliverFn,
		});

		const result = await sessionRunRegistry.deliverToSession("s1", "hello");
		expect(result).toBe("delivered");
		sessionRunRegistry.deregister("s1");
	});

	it("returns not_found for missing session", async () => {
		const result = await sessionRunRegistry.deliverToSession("no-such-session", "hello");
		expect(result).toBe("not_found");
	});

	it("returns unsupported when session has no deliver fn", async () => {
		sessionRunRegistry.register("s2", {
			signalAbort: () => {},
			handle: { sessionId: "s2" },
			adapter: {
				startSession: async () => ({ sessionId: "" }),
				streamEvents: async function* () {},
				stopSession: async () => ({
					outcome: "completed" as const,
					tokenUsage: { byTier: {} },
					metrics: undefined,
				}),
				getCapabilities: () => ({
					preCompactionTrigger: false,
					subAgents: false,
					modelProviders: [],
					mcpSupport: false,
					returnEnforcement: "none" as const,
				}),
			},
		});

		const result = await sessionRunRegistry.deliverToSession("s2", "hello");
		expect(result).toBe("unsupported");
		sessionRunRegistry.deregister("s2");
	});
});

describe("sessionRunRegistry — deliverToConversation", () => {
	it("resolves via secondary index and delivers", async () => {
		const deliverFn = async (_text: string) => "delivered" as const;
		sessionRunRegistry.register("s3", {
			signalAbort: () => {},
			handle: { sessionId: "s3" },
			adapter: {
				startSession: async () => ({ sessionId: "" }),
				streamEvents: async function* () {},
				stopSession: async () => ({
					outcome: "completed" as const,
					tokenUsage: { byTier: {} },
					metrics: undefined,
				}),
				getCapabilities: () => ({
					preCompactionTrigger: false,
					subAgents: false,
					modelProviders: [],
					mcpSupport: false,
					returnEnforcement: "none" as const,
				}),
			},
			deliver: deliverFn,
			agentId: "agent-1",
			threadId: "thread-1",
		});

		const result = await sessionRunRegistry.deliverToConversation("agent-1", "thread-1", "ping");
		expect(result).toBe("delivered");
		sessionRunRegistry.deregister("s3");
	});

	it("returns not_found when no session for that conversation", async () => {
		const result = await sessionRunRegistry.deliverToConversation("agent-x", "thread-x", "ping");
		expect(result).toBe("not_found");
	});

	it("cleans up secondary index on deregister", async () => {
		const deliverFn = async (_text: string) => "delivered" as const;
		sessionRunRegistry.register("s4", {
			signalAbort: () => {},
			handle: { sessionId: "s4" },
			adapter: {
				startSession: async () => ({ sessionId: "" }),
				streamEvents: async function* () {},
				stopSession: async () => ({
					outcome: "completed" as const,
					tokenUsage: { byTier: {} },
					metrics: undefined,
				}),
				getCapabilities: () => ({
					preCompactionTrigger: false,
					subAgents: false,
					modelProviders: [],
					mcpSupport: false,
					returnEnforcement: "none" as const,
				}),
			},
			deliver: deliverFn,
			agentId: "agent-2",
			threadId: "thread-2",
		});
		sessionRunRegistry.deregister("s4");

		const result = await sessionRunRegistry.deliverToConversation("agent-2", "thread-2", "ping");
		expect(result).toBe("not_found");
	});
});
