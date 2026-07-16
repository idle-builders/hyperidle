/**
 * X5 — Multi-adapter pool registration and selection tests (red phase).
 *
 * Tests:
 * - createLocalAdapterPool registers claude-code adapter
 * - createLocalAdapterPool registers builtin adapter
 * - Pool selects correct adapter by harnessType
 * - Pool returns null for unknown harnessType
 * - AC7: new adapters can be registered and selected without changing pool code
 */

import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { describe, expect, it, vi } from "vitest";
import { AdapterPool, createLocalAdapterPool } from "../adapter-pool.js";
import { BuiltinHarnessAdapter } from "../builtin-harness-adapter.js";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";

// ── Stub adapter helper ───────────────────────────────────────────────────────

function makeStubAdapter(mcpSupport = false): HarnessAdapter {
	return {
		async startSession(_config: SessionConfig): Promise<SessionHandle> {
			return { sessionId: "stub-session" };
		},
		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
			// no events
		},
		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return {
				outcome: "completed",
				cost: { minor: 0, currency: "USD" },
				tokenUsage: { byTier: {} },
			};
		},
		getCapabilities(): HarnessCapabilities {
			return {
				preCompactionTrigger: false,
				subAgents: false,
				modelProviders: [],
				mcpSupport,
				returnEnforcement: "none",
			};
		},
	};
}

// ── createLocalAdapterPool registration ──────────────────────────────────────

describe("createLocalAdapterPool — registration", () => {
	it("registers a claude-code adapter", async () => {
		const pool = await createLocalAdapterPool();
		const entries = pool.list();
		const claudeCodeEntry = entries.find((e) => e.type === "claude-code");
		expect(claudeCodeEntry).toBeDefined();
		expect(claudeCodeEntry?.kind).toBe("local");
	});

	it("registers a builtin adapter", async () => {
		const pool = await createLocalAdapterPool();
		const entries = pool.list();
		const builtinEntry = entries.find((e) => e.type === "builtin");
		expect(builtinEntry).toBeDefined();
		expect(builtinEntry?.kind).toBe("local");
	});

	it("registers at least two adapters (claude-code and builtin)", async () => {
		const pool = await createLocalAdapterPool();
		expect(pool.size).toBeGreaterThanOrEqual(2);
	});

	it("claude-code adapter has id 'local-claude-code'", async () => {
		const pool = await createLocalAdapterPool();
		const entries = pool.list();
		const entry = entries.find((e) => e.id === "local-claude-code");
		expect(entry).toBeDefined();
	});

	it("builtin adapter has id 'local-builtin'", async () => {
		const pool = await createLocalAdapterPool();
		const entries = pool.list();
		const entry = entries.find((e) => e.id === "local-builtin");
		expect(entry).toBeDefined();
	});
});

// ── Pool selection by harnessType ─────────────────────────────────────────────

describe("AdapterPool selection by harnessType", () => {
	it("selects claude-code adapter when harnessType is 'claude-code'", async () => {
		const pool = await createLocalAdapterPool();
		const entry = pool.select({ harnessType: "claude-code" });
		expect(entry).not.toBeNull();
		expect(entry?.meta.type).toBe("claude-code");
	});

	it("selects builtin adapter when harnessType is 'builtin'", async () => {
		const pool = await createLocalAdapterPool();
		const entry = pool.select({ harnessType: "builtin" });
		expect(entry).not.toBeNull();
		expect(entry?.meta.type).toBe("builtin");
	});

	it("returns null for unknown harnessType", async () => {
		const pool = await createLocalAdapterPool();
		const entry = pool.select({ harnessType: "totally-unknown-harness-xyz" });
		expect(entry).toBeNull();
	});
});

// ── AC7: New adapters via register, no orchestrator changes ───────────────────

describe("AC7 — new adapters can be added via register() only", () => {
	it("a new adapter registered with a custom type is selectable by that type", () => {
		const pool = new AdapterPool();

		// Register a custom adapter (simulating what X5 does for CLI tools)
		const customAdapter = makeStubAdapter(true);
		pool.register("my-custom-adapter", customAdapter, {
			name: "My Custom Tool",
			kind: "local",
			type: "my-custom-tool",
			modelProviders: [],
			maxConcurrent: 2,
		});

		const entry = pool.select({ harnessType: "my-custom-tool" });
		expect(entry).not.toBeNull();
		expect(entry?.id).toBe("my-custom-adapter");
		expect(entry?.meta.type).toBe("my-custom-tool");
	});

	it("the new adapter is selectable without modifying existing adapter entries", () => {
		const pool = new AdapterPool();

		// First register an existing adapter
		pool.register("existing-adapter", makeStubAdapter(), {
			name: "Existing",
			kind: "local",
			type: "existing-type",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		// Then add a new one without touching the existing
		pool.register("new-adapter", makeStubAdapter(true), {
			name: "New Tool",
			kind: "local",
			type: "new-type",
			modelProviders: [],
			maxConcurrent: 2,
		});

		// Both are selectable
		const existingEntry = pool.select({ harnessType: "existing-type" });
		const newEntry = pool.select({ harnessType: "new-type" });
		expect(existingEntry?.id).toBe("existing-adapter");
		expect(newEntry?.id).toBe("new-adapter");
	});

	it("a CliHarnessAdapter can be registered in the pool and selected by type", () => {
		const spawnSpy = vi.fn();
		const pool = new AdapterPool();

		// Using opencode as the representative CLI harness (one of the two supported CLI tools)
		const cliAdapter = new CliHarnessAdapter(
			{
				binary: "opencode",
				args: ["--dir", "{{sandbox}}"],
				envMap: { ANTHROPIC_API_KEY: "{{apiKey}}" },
				eventFormat: "text",
				envAllowlist: ["PATH", "HOME"],
			},
			{ spawnFn: spawnSpy },
		);

		pool.register("local-cli-opencode", cliAdapter, {
			name: "CLI: opencode",
			kind: "local",
			type: "opencode",
			modelProviders: [],
			maxConcurrent: 2,
		});

		const entry = pool.select({ harnessType: "opencode" });
		expect(entry).not.toBeNull();
		expect(entry?.id).toBe("local-cli-opencode");
		expect(entry?.meta.type).toBe("opencode");
	});

	it("a BuiltinHarnessAdapter can be registered and selected", () => {
		const pool = new AdapterPool();
		const builtinAdapter = new BuiltinHarnessAdapter();

		pool.register("local-builtin", builtinAdapter, {
			name: "Built-in Harness",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 4,
		});

		const entry = pool.select({ harnessType: "builtin" });
		expect(entry).not.toBeNull();
		expect(entry?.id).toBe("local-builtin");
	});
});
