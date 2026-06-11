/**
 * I2 — Security tests for ClaudeAgentSdkAdapter (S1, S2, S3).
 *
 * Red phase. These tests assert the env allow-list and the
 * `HYPERIDLE_UNSAFE_AGENT_MODE` gate that I2 introduces. They will fail
 * against the current adapter implementation, which:
 *   1. spreads `...process.env` into the agent subprocess (S1 fails),
 *   2. unconditionally passes `allowDangerouslySkipPermissions: true`
 *      and `permissionMode: "bypassPermissions"` (S2 fails),
 *   3. has no env-gated branch (S3 fails).
 */

import type { Query, SDKMessage, query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import type { SessionConfig } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeAgentSdkAdapter } from "../claude-agent-sdk-adapter.js";

const TEST_CONFIG: SessionConfig = {
	workspacePath: "/workspace/test",
	sessionId: "test-session",
	soulPromptPath: "/workspace/prompts/builder.md",
	composedPrompt: "",
	modelTier: "workhorse",
	tools: ["Read", "Write", "Bash"],
};

/** A hollow Query object that satisfies the SDK type without doing IO. */
function createNoopQuery(): Query {
	async function* generate(): AsyncGenerator<SDKMessage, void> {
		// no messages
	}
	const q = generate() as unknown as Query;
	q.interrupt = vi.fn(async () => {});
	q.close = vi.fn();
	// Scaffolding — the adapter under test never reads this response. Match the
	// sibling mocks' `({}) as ReturnType<...>` idiom (file-local convention).
	q.getContextUsage = vi.fn(async () => ({}) as Awaited<ReturnType<Query["getContextUsage"]>>);
	q.setPermissionMode = vi.fn(async () => {});
	q.setModel = vi.fn(async () => {});
	q.setMaxThinkingTokens = vi.fn(async () => {});
	q.applyFlagSettings = vi.fn(async () => {});
	q.initializationResult = vi.fn(async () => ({}) as ReturnType<Query["initializationResult"]>);
	q.supportedCommands = vi.fn(async () => []);
	q.supportedModels = vi.fn(async () => []);
	q.supportedAgents = vi.fn(async () => []);
	q.mcpServerStatus = vi.fn(async () => []);
	q.reloadPlugins = vi.fn(async () => ({}) as ReturnType<Query["reloadPlugins"]>);
	q.accountInfo = vi.fn(async () => ({}) as ReturnType<Query["accountInfo"]>);
	q.rewindFiles = vi.fn(async () => ({}) as ReturnType<Query["rewindFiles"]>);
	q.reconnectMcpServer = vi.fn(async () => {});
	q.toggleMcpServer = vi.fn(async () => {});
	q.setMcpServers = vi.fn(async () => ({}) as ReturnType<Query["setMcpServers"]>);
	q.streamInput = vi.fn(async () => {});
	q.stopTask = vi.fn(async () => {});
	return q;
}

describe("I2 S1/S2/S3 — ClaudeAgentSdkAdapter security", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		// Set the credential the adapter needs; also seed env with a "leaky"
		// secret so we can prove it is NOT forwarded into the agent env.
		process.env.ANTHROPIC_API_KEY = "ant-test-key";
		process.env.HYPERIDLE_API_KEY = "hi-test-master-key";
		process.env.DATABASE_URL = "sqlite:///tmp/test.db";
		process.env.SMTP_PASSWORD = "smtp-leak-canary";
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	// --------------------------------------------------------------- S1
	describe("S1 — env allow-list contains only PATH/HOME/LANG/ANTHROPIC_API_KEY", () => {
		it("does NOT forward HYPERIDLE_API_KEY into the agent subprocess", async () => {
			const queryFn = vi.fn<typeof sdkQuery>(() => createNoopQuery());
			const adapter = new ClaudeAgentSdkAdapter({ queryFn });

			await adapter.startSession(TEST_CONFIG);

			expect(queryFn).toHaveBeenCalledTimes(1);
			const call = queryFn.mock.calls[0]![0] as { options?: { env?: Record<string, string> } };
			const env = call.options?.env ?? {};
			expect(env.HYPERIDLE_API_KEY).toBeUndefined();
		});

		it("does NOT forward DATABASE_URL into the agent subprocess", async () => {
			const queryFn = vi.fn<typeof sdkQuery>(() => createNoopQuery());
			const adapter = new ClaudeAgentSdkAdapter({ queryFn });

			await adapter.startSession(TEST_CONFIG);

			const call = queryFn.mock.calls[0]![0] as { options?: { env?: Record<string, string> } };
			const env = call.options?.env ?? {};
			expect(env.DATABASE_URL).toBeUndefined();
		});

		it("does NOT forward SMTP_PASSWORD into the agent subprocess", async () => {
			const queryFn = vi.fn<typeof sdkQuery>(() => createNoopQuery());
			const adapter = new ClaudeAgentSdkAdapter({ queryFn });

			await adapter.startSession(TEST_CONFIG);

			const call = queryFn.mock.calls[0]![0] as { options?: { env?: Record<string, string> } };
			const env = call.options?.env ?? {};
			expect(env.SMTP_PASSWORD).toBeUndefined();
		});

		it("env keys are a subset of the allow-list", async () => {
			const queryFn = vi.fn<typeof sdkQuery>(() => createNoopQuery());
			const adapter = new ClaudeAgentSdkAdapter({ queryFn });

			await adapter.startSession(TEST_CONFIG);

			const call = queryFn.mock.calls[0]![0] as { options?: { env?: Record<string, string> } };
			const env = call.options?.env ?? {};
			const ALLOWED = new Set(["PATH", "HOME", "LANG", "ANTHROPIC_API_KEY"]);
			const extras = Object.keys(env).filter((k) => !ALLOWED.has(k));
			expect(extras).toEqual([]);
		});

		it("forwards ANTHROPIC_API_KEY (the only credential the agent actually needs)", async () => {
			const queryFn = vi.fn<typeof sdkQuery>(() => createNoopQuery());
			const adapter = new ClaudeAgentSdkAdapter({ queryFn });

			await adapter.startSession(TEST_CONFIG);

			const call = queryFn.mock.calls[0]![0] as { options?: { env?: Record<string, string> } };
			const env = call.options?.env ?? {};
			expect(env.ANTHROPIC_API_KEY).toBe("ant-test-key");
		});
	});

	// --------------------------------------------------------------- S2
	describe("S2 — allowDangerouslySkipPermissions removed by default", () => {
		it("does NOT pass allowDangerouslySkipPermissions when HYPERIDLE_UNSAFE_AGENT_MODE is unset", async () => {
			process.env.HYPERIDLE_UNSAFE_AGENT_MODE = undefined;
			const queryFn = vi.fn<typeof sdkQuery>(() => createNoopQuery());
			const adapter = new ClaudeAgentSdkAdapter({ queryFn });

			await adapter.startSession(TEST_CONFIG);

			const call = queryFn.mock.calls[0]![0] as {
				options?: { allowDangerouslySkipPermissions?: boolean; permissionMode?: string };
			};
			const opts = call.options ?? {};
			// either omitted entirely or explicitly false
			expect(opts.allowDangerouslySkipPermissions).not.toBe(true);
		});

		it("uses permissionMode: 'default' when unsafe mode is unset", async () => {
			process.env.HYPERIDLE_UNSAFE_AGENT_MODE = undefined;
			const queryFn = vi.fn<typeof sdkQuery>(() => createNoopQuery());
			const adapter = new ClaudeAgentSdkAdapter({ queryFn });

			await adapter.startSession(TEST_CONFIG);

			const call = queryFn.mock.calls[0]![0] as {
				options?: { permissionMode?: string };
			};
			expect(call.options?.permissionMode).toBe("default");
		});
	});

	// --------------------------------------------------------------- S3
	describe("S3 — HYPERIDLE_UNSAFE_AGENT_MODE=true enables bypass mode", () => {
		it("passes allowDangerouslySkipPermissions: true when env flag is 'true'", async () => {
			process.env.HYPERIDLE_UNSAFE_AGENT_MODE = "true";
			const queryFn = vi.fn<typeof sdkQuery>(() => createNoopQuery());
			const adapter = new ClaudeAgentSdkAdapter({ queryFn });

			await adapter.startSession(TEST_CONFIG);

			const call = queryFn.mock.calls[0]![0] as {
				options?: { allowDangerouslySkipPermissions?: boolean; permissionMode?: string };
			};
			expect(call.options?.allowDangerouslySkipPermissions).toBe(true);
		});

		it("does NOT enable bypass for non-'true' values (defence against typos)", async () => {
			process.env.HYPERIDLE_UNSAFE_AGENT_MODE = "1";
			const queryFn = vi.fn<typeof sdkQuery>(() => createNoopQuery());
			const adapter = new ClaudeAgentSdkAdapter({ queryFn });

			await adapter.startSession(TEST_CONFIG);

			const call = queryFn.mock.calls[0]![0] as {
				options?: { allowDangerouslySkipPermissions?: boolean };
			};
			expect(call.options?.allowDangerouslySkipPermissions).not.toBe(true);
		});
	});
});
