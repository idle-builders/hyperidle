/**
 * AL7 Task 7a — Claude canUseTool carrier: unit tests.
 *
 * Tests that ClaudeAgentSdkAdapter wires the route-to-review workflow into
 * `queryOptions.canUseTool` and `allowedTools`/`disallowedTools` when
 * `config.sessionWorkflow` is present.
 *
 * DONE matrix: Claude is green-now. The test exercises the REAL adapter code
 * with a mock queryFn (so no live LLM call is needed) but uses the real
 * @anthropic-ai/claude-agent-sdk types. The mock captures the queryOptions
 * that `startSession` would pass to the SDK, so we can assert the canUseTool
 * callback returns the correct PermissionResult.
 *
 * @lore AL7 Task 7a: canUseTool is the per-call native carrier on Claude.
 * It fires BEFORE the MCP bridge. deny = route to review; allow = proceed.
 * The actual capture/consume still happens at registry.invoke via the MCP bridge.
 *
 * @lore AL7 MEMORY mock-validation-trap: the test captures the REAL adapter's
 * canUseTool closure from the REAL queryFn invocation. It does NOT stub canUseTool
 * itself — it exercises the real code path from startSession → canUseTool build.
 */

import type {
	CanUseTool,
	PermissionResult,
	Query,
	SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { SessionConfig, SessionWorkflow } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeAgentSdkAdapter } from "../claude-agent-sdk-adapter.js";
import { enforcementRegistry } from "../return-enforcement-registry.js";

// ─────────────────────────────────────────────────────────────────────────────
// Mock queryFn that captures the options it receives (no subprocess spawned)
// ─────────────────────────────────────────────────────────────────────────────

interface CapturedOptions {
	canUseTool?: CanUseTool;
	allowedTools?: string[];
	disallowedTools?: string[];
	permissionMode?: string;
}

function createCapturingQueryFn(): {
	fn: (input: { prompt: string; options: Record<string, unknown> }) => Query;
	captured: CapturedOptions;
} {
	const captured: CapturedOptions = {};

	const fn = (input: { prompt: string; options: Record<string, unknown> }): Query => {
		const opts = input.options;
		captured.canUseTool = opts.canUseTool as CanUseTool | undefined;
		captured.allowedTools = opts.allowedTools as string[] | undefined;
		captured.disallowedTools = opts.disallowedTools as string[] | undefined;
		captured.permissionMode = opts.permissionMode as string | undefined;

		// Return a minimal mock Query (never iterated — just captured)
		const noop = vi.fn();
		const gen = (async function* (): AsyncGenerator<SDKMessage> {
			yield {
				type: "result",
				subtype: "success",
				is_error: false,
				result: "",
				session_id: "mock-session",
				duration_ms: 1,
				duration_api_ms: 1,
				num_turns: 1,
				total_cost_usd: 0,
				usage: {
					input_tokens: 1,
					output_tokens: 1,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 0,
				},
			} as SDKMessage;
		})();
		const query = gen as unknown as Query;
		query.interrupt = noop as unknown as Query["interrupt"];
		query.close = noop as unknown as Query["close"];
		query.getContextUsage = vi.fn(
			async () => ({}) as Awaited<ReturnType<Query["getContextUsage"]>>,
		);
		query.setPermissionMode = noop as unknown as Query["setPermissionMode"];
		query.setModel = noop as unknown as Query["setModel"];
		query.setMaxThinkingTokens = noop as unknown as Query["setMaxThinkingTokens"];
		query.applyFlagSettings = noop as unknown as Query["applyFlagSettings"];
		return query;
	};

	return { fn, captured };
}

const BASE_CONFIG: SessionConfig = {
	sandboxPath: "/workspace/test",
	sessionId: "test-session",
	systemPromptPath: "",
	assembledPrompt: "",
	modelTier: "workhorse",
	tools: ["commit_file", "read_inbox", "log_task"],
	resolvedModel: {
		model: "claude-opus-4-5",
		provider: "anthropic",
		apiKey: "test-key",
		baseUrl: "https://api.anthropic.com",
	},
};

const OPEN_WORK_WORKFLOW: SessionWorkflow = {
	routeToReview: ["irreversible"],
	sessionRole: "open-work",
};

const GRANT_BEARING_WORKFLOW: SessionWorkflow = {
	routeToReview: ["irreversible"],
	sessionRole: "grant-bearing",
	approvedCall: {
		toolId: "commit_file",
		args: { path: "/workspace/out.txt", content: "approved" },
		argPinned: false,
	},
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getCanUseTool(workflow: SessionWorkflow): Promise<CanUseTool | undefined> {
	const { fn, captured } = createCapturingQueryFn();
	const adapter = new ClaudeAgentSdkAdapter({
		queryFn: fn as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query,
	});
	await adapter.startSession({ ...BASE_CONFIG, sessionWorkflow: workflow });
	return captured.canUseTool;
}

const STUB_OPTIONS = {
	signal: new AbortController().signal,
	toolUseID: "tool-use-id-stub",
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
	enforcementRegistry.register("test-session", {
		gate: { returned: false },
		forceCount: 0,
		exempt: true, // exempt so Stop hook never fires
	});
});

afterEach(() => {
	enforcementRegistry.unregister("test-session");
});

describe("AL7 Task 7a: Claude canUseTool carrier", () => {
	it("canUseTool is set when sessionWorkflow is present", async () => {
		const canUseTool = await getCanUseTool(OPEN_WORK_WORKFLOW);
		expect(canUseTool).toBeDefined();
		expect(typeof canUseTool).toBe("function");
	});

	it("canUseTool is NOT set when sessionWorkflow is absent", async () => {
		const { fn, captured } = createCapturingQueryFn();
		const adapter = new ClaudeAgentSdkAdapter({
			queryFn: fn as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query,
		});
		await adapter.startSession(BASE_CONFIG); // no sessionWorkflow
		expect(captured.canUseTool).toBeUndefined();
	});

	it("session-1 (open-work): canUseTool denies commit_file (irreversible)", async () => {
		const canUseTool = await getCanUseTool(OPEN_WORK_WORKFLOW);
		expect(canUseTool).toBeDefined();
		const result: PermissionResult = await canUseTool!(
			"commit_file",
			{ path: "/workspace/out.txt", content: "hi" },
			STUB_OPTIONS,
		);
		expect(result.behavior).toBe("deny");
	});

	it("session-1 (open-work): canUseTool allows read_inbox (reversible)", async () => {
		const canUseTool = await getCanUseTool(OPEN_WORK_WORKFLOW);
		expect(canUseTool).toBeDefined();
		const result: PermissionResult = await canUseTool!("read_inbox", { limit: 5 }, STUB_OPTIONS);
		expect(result.behavior).toBe("allow");
	});

	it("session-2 (grant-bearing): canUseTool allows commit_file (the approved op)", async () => {
		const canUseTool = await getCanUseTool(GRANT_BEARING_WORKFLOW);
		expect(canUseTool).toBeDefined();
		const result: PermissionResult = await canUseTool!(
			"commit_file",
			{ path: "/workspace/out.txt", content: "approved" },
			STUB_OPTIONS,
		);
		expect(result.behavior).toBe("allow");
	});

	it("session-2 (grant-bearing): canUseTool denies a DIFFERENT irreversible op", async () => {
		const canUseTool = await getCanUseTool(GRANT_BEARING_WORKFLOW);
		expect(canUseTool).toBeDefined();
		const result: PermissionResult = await canUseTool!(
			"github_merge_pr", // different irreversible op (not in approved)
			{ pr: 42, repo: "org/repo" },
			STUB_OPTIONS,
		);
		expect(result.behavior).toBe("deny");
	});

	it("allowedTools includes read_inbox (reversible) in session-1", async () => {
		const { fn, captured } = createCapturingQueryFn();
		const adapter = new ClaudeAgentSdkAdapter({
			queryFn: fn as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query,
		});
		await adapter.startSession({ ...BASE_CONFIG, sessionWorkflow: OPEN_WORK_WORKFLOW });
		expect(captured.allowedTools).toContain("read_inbox");
	});

	it("disallowedTools includes commit_file (irreversible) in session-1", async () => {
		const { fn, captured } = createCapturingQueryFn();
		const adapter = new ClaudeAgentSdkAdapter({
			queryFn: fn as unknown as typeof import("@anthropic-ai/claude-agent-sdk").query,
		});
		await adapter.startSession({ ...BASE_CONFIG, sessionWorkflow: OPEN_WORK_WORKFLOW });
		expect(captured.disallowedTools).toContain("commit_file");
	});
});
