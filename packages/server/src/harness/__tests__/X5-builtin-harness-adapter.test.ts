/**
 * X5 — BuiltinHarnessAdapter unit tests (red phase).
 *
 * Verifies the stub behavior: startSession/streamEvents/stopSession throw
 * "not yet implemented", and getCapabilities returns the declared values.
 */

import { describe, expect, it } from "vitest";
import { BuiltinHarnessAdapter } from "../../harness/builtin-harness-adapter.js";

function makeHandle() {
	return { sessionId: "builtin-test-session" };
}

function makeSessionConfig() {
	return {
		workspacePath: "/workspace/test",
		soulPromptPath: "",
		composedPrompt: "Do the task.",
		modelTier: "workhorse" as const,
		tools: ["Read"],
	};
}

// ── stub behavior ─────────────────────────────────────────────────────────────

describe("BuiltinHarnessAdapter — stub methods throw", () => {
	it("startSession throws 'not yet implemented'", async () => {
		const adapter = new BuiltinHarnessAdapter();
		await expect(adapter.startSession(makeSessionConfig())).rejects.toThrow(
			/not yet implemented/i,
		);
	});

	it("startSession error message references X6", async () => {
		const adapter = new BuiltinHarnessAdapter();
		await expect(adapter.startSession(makeSessionConfig())).rejects.toThrow(/X6/);
	});

	it("streamEvents throws 'not yet implemented'", async () => {
		const adapter = new BuiltinHarnessAdapter();
		const gen = adapter.streamEvents(makeHandle());
		// AsyncIterable — must call next() to trigger the throw
		await expect(gen[Symbol.asyncIterator]().next()).rejects.toThrow(/not yet implemented/i);
	});

	it("stopSession throws 'not yet implemented'", async () => {
		const adapter = new BuiltinHarnessAdapter();
		await expect(adapter.stopSession(makeHandle())).rejects.toThrow(/not yet implemented/i);
	});
});

// ── getCapabilities ───────────────────────────────────────────────────────────

describe("BuiltinHarnessAdapter getCapabilities", () => {
	it("returns mcpSupport: false (builtin calls tool registry directly)", () => {
		const adapter = new BuiltinHarnessAdapter();
		expect(adapter.getCapabilities().mcpSupport).toBe(false);
	});

	it("returns preCompactionTrigger: true", () => {
		const adapter = new BuiltinHarnessAdapter();
		expect(adapter.getCapabilities().preCompactionTrigger).toBe(true);
	});

	it("returns subAgents: false", () => {
		const adapter = new BuiltinHarnessAdapter();
		expect(adapter.getCapabilities().subAgents).toBe(false);
	});

	it("returns modelProviders with anthropic, openrouter, openai-compatible", () => {
		const adapter = new BuiltinHarnessAdapter();
		const providers = adapter.getCapabilities().modelProviders;
		expect(providers).toContain("anthropic");
		expect(providers).toContain("openrouter");
		expect(providers).toContain("openai-compatible");
	});
});
