/**
 * X5 — BuiltinHarnessAdapter unit tests.
 *
 * Originally verified stub behavior (X5). Updated for X6 real implementation:
 * session methods now require resolvedModel and registry setup.
 * getCapabilities still returns the declared values.
 */

import { describe, expect, it } from "vitest";
import { BuiltinHarnessAdapter } from "../../harness/builtin-harness-adapter.js";

function makeHandle() {
	return { sessionId: "builtin-test-session" };
}

function makeSessionConfig() {
	return {
		sandboxPath: "/workspace/test",
		sessionId: "test-session",
		systemPromptPath: "",
		assembledPrompt: "Do the task.",
		modelTier: "workhorse" as const,
		tools: ["Read"],
	};
}

// ── X6: session methods require resolvedModel ────────────────────────────────

describe("BuiltinHarnessAdapter — session methods require setup", () => {
	it("startSession throws when resolvedModel is missing", async () => {
		const adapter = new BuiltinHarnessAdapter();
		await expect(adapter.startSession(makeSessionConfig())).rejects.toThrow(/resolvedModel/i);
	});

	it("streamEvents throws for unknown session", async () => {
		const adapter = new BuiltinHarnessAdapter();
		const gen = adapter.streamEvents(makeHandle());
		await expect(gen[Symbol.asyncIterator]().next()).rejects.toThrow(/unknown session/i);
	});

	it("stopSession throws for unknown session", async () => {
		const adapter = new BuiltinHarnessAdapter();
		await expect(adapter.stopSession(makeHandle())).rejects.toThrow(/unknown session/i);
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
