/**
 * AdapterPool: registration, selection (capacity, model providers, harness
 * type, disabled types, pause/resume), failure reporting, capability lookup,
 * and the createLocalAdapterPool factory's hermetic behavior.
 *
 * Real-binary discovery lives in adapter-pool-real-discovery.integration.test.ts.
 */

import type {
	AdapterMeta,
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/harness-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdapterPool, createLocalAdapterPool } from "../adapter-pool.js";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import type { HarnessDiscoveryInput } from "../harness-discovery.js";
import * as harnessDiscovery from "../harness-discovery.js";

function makeAdapter(caps?: Partial<HarnessCapabilities>): HarnessAdapter {
	const capabilities: HarnessCapabilities = {
		preCompactionTrigger: caps?.preCompactionTrigger ?? true,
		subAgents: caps?.subAgents ?? true,
		modelProviders: caps?.modelProviders ?? ["anthropic"],
		mcpSupport: caps?.mcpSupport ?? false,
		returnEnforcement: caps?.returnEnforcement ?? "none",
	};
	return {
		async startSession(_config: SessionConfig): Promise<SessionHandle> {
			return { sessionId: "stub" };
		},
		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {},
		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return { outcome: "completed", tokenUsage: { byTier: {} } };
		},
		getCapabilities(): HarnessCapabilities {
			return capabilities;
		},
	};
}

const LOCAL_META: AdapterMeta = {
	name: "local",
	kind: "local",
	modelProviders: ["anthropic"],
	maxConcurrent: 4,
};

const REMOTE_META: AdapterMeta = {
	name: "remote-1",
	kind: "remote",
	modelProviders: ["anthropic"],
	maxConcurrent: 2,
};

describe("AdapterPool register/unregister", () => {
	it("starts empty", () => {
		const pool = new AdapterPool();
		expect(pool.size).toBe(0);
		expect(pool.has("any")).toBe(false);
	});

	it("register adds an entry visible via has() and size", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		expect(pool.size).toBe(1);
		expect(pool.has("local")).toBe(true);
	});

	it("register multiple adapters", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		pool.register("remote-1", makeAdapter(), REMOTE_META);
		expect(pool.size).toBe(2);
	});

	it("unregister removes entry from pool", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		pool.register("remote-1", makeAdapter(), REMOTE_META);
		pool.unregister("remote-1");
		expect(pool.size).toBe(1);
		expect(pool.has("remote-1")).toBe(false);
	});

	it("unregister on unknown id is a no-op", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		pool.unregister("nonexistent");
		expect(pool.size).toBe(1);
	});
});

describe("AdapterPool select — capacity and load balancing", () => {
	it("returns null when pool is empty", () => {
		const pool = new AdapterPool();
		expect(pool.select()).toBeNull();
	});

	it("returns the only adapter when one is registered", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		expect(pool.select()?.meta.name).toBe("local");
	});

	it("returns null once capacity is exhausted", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), { ...LOCAL_META, maxConcurrent: 1 });
		pool.select();
		expect(pool.select()).toBeNull();
	});

	it("picks the least-loaded adapter", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), LOCAL_META);
		pool.register("remote-1", makeAdapter(), REMOTE_META);
		pool.select(); // local=1 (tied at 0, pick first)
		pool.select(); // remote-1=1 (0 < 1)
		pool.select(); // tied at 1; pick first → local=2
		expect(pool.select()?.meta.name).toBe("remote-1"); // 1 < 2
	});

	it("returns the non-full adapter when the other is at capacity", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), { ...LOCAL_META, maxConcurrent: 1 });
		pool.register("remote-1", makeAdapter(), REMOTE_META);
		pool.select(); // fills local
		expect(pool.select()?.meta.name).toBe("remote-1");
	});

	it("release frees a slot so the adapter becomes selectable again", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), { ...LOCAL_META, maxConcurrent: 1 });
		pool.select();
		expect(pool.select()).toBeNull();
		pool.release("local");
		expect(pool.select()).not.toBeNull();
	});

	it("release does not go below zero", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), { ...LOCAL_META, maxConcurrent: 1 });
		pool.release("local");
		expect(pool.select()).not.toBeNull();
	});

	it("release on unknown id is a no-op", () => {
		const pool = new AdapterPool();
		expect(() => pool.release("nonexistent")).not.toThrow();
	});
});

describe("AdapterPool select — modelProviders requirement", () => {
	it("selects the adapter matching required modelProviders", () => {
		const pool = new AdapterPool();
		pool.register("anthropic-worker", makeAdapter(), {
			...LOCAL_META,
			modelProviders: ["anthropic"],
		});
		pool.register("openai-worker", makeAdapter(), {
			...REMOTE_META,
			name: "openai-worker",
			modelProviders: ["openai"],
		});
		expect(pool.select({ modelProviders: ["openai"] })?.meta.name).toBe("openai-worker");
	});

	it("returns null when no adapter matches", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), { ...LOCAL_META, modelProviders: ["anthropic"] });
		expect(pool.select({ modelProviders: ["google"] })).toBeNull();
	});

	it("returns null when the matching adapter is at capacity", () => {
		const pool = new AdapterPool();
		pool.register("local", makeAdapter(), {
			...LOCAL_META,
			maxConcurrent: 1,
			modelProviders: ["anthropic"],
		});
		pool.select({ modelProviders: ["anthropic"] });
		expect(pool.select({ modelProviders: ["anthropic"] })).toBeNull();
	});

	it("requires ALL listed providers to be present", () => {
		const pool = new AdapterPool();
		pool.register("multi-provider", makeAdapter(), {
			...LOCAL_META,
			name: "multi-provider",
			modelProviders: ["anthropic", "openai"],
		});
		expect(pool.select({ modelProviders: ["anthropic", "openai"] })?.meta.name).toBe(
			"multi-provider",
		);
	});

	it("does not select an adapter missing one of the required providers", () => {
		const pool = new AdapterPool();
		pool.register("anthropic-only", makeAdapter(), {
			...LOCAL_META,
			modelProviders: ["anthropic"],
		});
		expect(pool.select({ modelProviders: ["anthropic", "openai"] })).toBeNull();
	});
});

describe("AdapterPool select — harnessType filter", () => {
	it("selects the adapter matching harnessType", () => {
		const pool = new AdapterPool();
		pool.register("claude-code-1", makeAdapter(), {
			...LOCAL_META,
			name: "claude-code-1",
			type: "claude-code",
		});
		pool.register("aider-1", makeAdapter(), { ...REMOTE_META, name: "aider-1", type: "aider" });
		expect(pool.select({ harnessType: "aider" })?.meta.name).toBe("aider-1");
	});

	it("returns null when no adapter of that type is registered", () => {
		const pool = new AdapterPool();
		pool.register("claude-code-1", makeAdapter(), {
			...LOCAL_META,
			name: "claude-code-1",
			type: "claude-code",
		});
		expect(pool.select({ harnessType: "aider" })).toBeNull();
	});

	it("returns null when the matching type exists but is at capacity", () => {
		const pool = new AdapterPool();
		pool.register("aider-1", makeAdapter(), {
			...REMOTE_META,
			name: "aider-1",
			type: "aider",
			maxConcurrent: 1,
		});
		pool.select({ harnessType: "aider" });
		expect(pool.select({ harnessType: "aider" })).toBeNull();
	});

	it("harnessType stacks with modelProviders", () => {
		const pool = new AdapterPool();
		pool.register("aider-openai", makeAdapter(), {
			...REMOTE_META,
			name: "aider-openai",
			type: "aider",
			modelProviders: ["openai"],
		});
		pool.register("aider-anthropic", makeAdapter(), {
			...REMOTE_META,
			name: "aider-anthropic",
			type: "aider",
			modelProviders: ["anthropic"],
		});
		expect(pool.select({ harnessType: "aider", modelProviders: ["anthropic"] })?.meta.name).toBe(
			"aider-anthropic",
		);
	});

	it("an adapter registered without a type is only selectable when no harnessType is requested", () => {
		const pool = new AdapterPool();
		pool.register("old-worker", makeAdapter(), { ...REMOTE_META, name: "old-worker" });
		expect(pool.select()?.meta.name).toBe("old-worker");
		expect(pool.select({ harnessType: "claude-code" })).toBeNull();
	});
});

describe("AdapterPool select — disabledTypes gate", () => {
	const OPENCODE_META: AdapterMeta = {
		name: "OpenCode",
		kind: "local",
		type: "opencode",
		modelProviders: ["anthropic"],
		maxConcurrent: 8,
	};
	const CLAUDE_CODE_META: AdapterMeta = {
		name: "Claude Code",
		kind: "local",
		type: "claude-code",
		modelProviders: ["anthropic"],
		maxConcurrent: 4,
	};
	const CODEX_META: AdapterMeta = {
		name: "Codex",
		kind: "local",
		type: "codex",
		modelProviders: ["openai"],
		maxConcurrent: 4,
	};

	it("an empty disabledTypes list disables nothing", () => {
		const pool = new AdapterPool();
		pool.register("local-claude-code", makeAdapter(), CLAUDE_CODE_META);
		expect(pool.select({ disabledTypes: [], harnessType: "claude-code" })?.meta.type).toBe(
			"claude-code",
		);
	});

	it("never returns a disabled type, even when it's the only match", () => {
		const pool = new AdapterPool();
		pool.register("local-opencode", makeAdapter(), OPENCODE_META);
		pool.register("local-claude-code", makeAdapter(), CLAUDE_CODE_META);
		expect(pool.select({ harnessType: "claude-code", disabledTypes: ["claude-code"] })).toBeNull();
	});

	it("falls back to a non-disabled adapter when no harnessType is requested", () => {
		const pool = new AdapterPool();
		pool.register("local-opencode", makeAdapter(), OPENCODE_META);
		pool.register("local-claude-code", makeAdapter(), CLAUDE_CODE_META);
		expect(pool.select({ disabledTypes: ["claude-code"] })?.meta.type).toBe("opencode");
	});

	it("disabling multiple types skips all of them", () => {
		const pool = new AdapterPool();
		pool.register("local-opencode", makeAdapter(), OPENCODE_META);
		pool.register("local-claude-code", makeAdapter(), CLAUDE_CODE_META);
		pool.register("local-codex", makeAdapter(), CODEX_META);
		expect(pool.select({ disabledTypes: ["claude-code", "codex"] })?.meta.type).toBe("opencode");
	});

	// @lore the built-in harness used to be exempt from this gate — it was the
	// fallback everything leaned on. Every harness is now something the person
	// installed, so every one can be turned off, including the only one registered.
	it("a disabled harness is skipped even when it is the only one registered", () => {
		const pool = new AdapterPool();
		pool.register("local-claude-code", makeAdapter(), CLAUDE_CODE_META);
		expect(pool.select({ disabledTypes: ["claude-code"] })).toBeNull();
	});
});

describe("AdapterPool pause/resume", () => {
	const META: AdapterMeta = {
		name: "worker-1",
		kind: "remote",
		modelProviders: ["anthropic"],
		maxConcurrent: 4,
	};

	it("register initialises paused: false", () => {
		const pool = new AdapterPool();
		pool.register("w1", makeAdapter(), META);
		expect(pool.select()).not.toBeNull();
	});

	it("pause(id) makes the adapter unselectable even with capacity free", () => {
		const pool = new AdapterPool();
		pool.register("w1", makeAdapter(), META);
		pool.pause("w1");
		expect(pool.select()).toBeNull();
	});

	it("resume(id) makes the adapter selectable again", () => {
		const pool = new AdapterPool();
		pool.register("w1", makeAdapter(), META);
		pool.pause("w1");
		pool.resume("w1");
		expect(pool.select()?.id).toBe("w1");
	});

	it("pausing one adapter does not affect another", () => {
		const pool = new AdapterPool();
		pool.register("w1", makeAdapter(), META);
		pool.register("w2", makeAdapter(), { ...META, name: "worker-2" });
		pool.pause("w1");
		expect(pool.select()?.id).toBe("w2");
	});

	it("pause/resume on an unknown id is a no-op", () => {
		const pool = new AdapterPool();
		pool.register("w1", makeAdapter(), META);
		expect(() => pool.pause("nonexistent")).not.toThrow();
		expect(() => pool.resume("nonexistent")).not.toThrow();
		expect(pool.select()).not.toBeNull();
	});
});

describe("AdapterPool.describeSelectFailure", () => {
	function meta(overrides: Partial<AdapterMeta> = {}): AdapterMeta {
		return {
			name: "local",
			kind: "local",
			type: "claude",
			modelProviders: ["anthropic"],
			maxConcurrent: 1,
			...overrides,
		};
	}

	it("says the pool is empty rather than blaming capacity", () => {
		const pool = new AdapterPool();
		expect(pool.describeSelectFailure()).toMatch(/no harness adapters/i);
		expect(pool.describeSelectFailure()).not.toMatch(/capacity/i);
	});

	it("names the requested harness type and what was actually available", () => {
		const pool = new AdapterPool();
		pool.register("a", makeAdapter(), meta({ type: "claude" }));
		const reason = pool.describeSelectFailure({ harnessType: "codex" });
		expect(reason).toContain("codex");
		expect(reason).toContain("claude");
	});

	it("says so when every eligible adapter is disabled", () => {
		const pool = new AdapterPool();
		pool.register("a", makeAdapter(), meta({ type: "claude" }));
		expect(pool.describeSelectFailure({ disabledTypes: ["claude"] })).toMatch(/disabled/i);
	});

	it("says so when every adapter is paused", () => {
		const pool = new AdapterPool();
		pool.register("a", makeAdapter(), meta());
		pool.pause("a");
		expect(pool.describeSelectFailure()).toMatch(/paused/i);
	});

	it("still reports capacity when capacity really is the problem", () => {
		const pool = new AdapterPool();
		pool.register("a", makeAdapter(), meta({ maxConcurrent: 1 }));
		pool.select();
		expect(pool.describeSelectFailure()).toMatch(/capacity/i);
	});
});

describe("AdapterPool.describe — capability lookup by type", () => {
	const BASE_META: AdapterMeta = {
		name: "test-adapter",
		kind: "local",
		modelProviders: ["anthropic"],
		maxConcurrent: 4,
	};

	function capabilitiesFor(pool: AdapterPool, type: string | undefined) {
		return pool.describe({ type, includeKnownMissing: false })[0] ?? null;
	}

	it.each([
		["an unknown type", "nonexistent-type"],
		["no type at all", undefined],
	])("returns null for %s when the pool is empty", (_label, type) => {
		const pool = new AdapterPool();
		expect(capabilitiesFor(pool, type)).toBeNull();
	});

	it("returns capabilities for a known type", () => {
		const pool = new AdapterPool();
		pool.register("local-claude-code", makeAdapter({ mcpSupport: true }), {
			...BASE_META,
			name: "Claude Code",
			type: "claude-code",
		});
		const result = capabilitiesFor(pool, "claude-code");
		expect(result?.type).toBe("claude-code");
		expect(result?.returnEnforcement).toBeDefined();
	});

	it("returns the matching type's capabilities when multiple types are registered", () => {
		const pool = new AdapterPool();
		pool.register("local-claude-code", makeAdapter({ mcpSupport: true }), {
			...BASE_META,
			name: "Claude Code",
			type: "claude-code",
		});
		pool.register("local-aider", makeAdapter({ mcpSupport: false }), {
			...BASE_META,
			name: "Aider",
			type: "aider",
		});
		expect(capabilitiesFor(pool, "claude-code")?.type).toBe("claude-code");
		expect(capabilitiesFor(pool, "aider")?.type).toBe("aider");
	});

	it("returns the only registered adapter's descriptor when no type filter is given", () => {
		const pool = new AdapterPool();
		pool.register("local-generic", makeAdapter({ subAgents: false }), {
			...BASE_META,
			type: "generic",
		});
		expect(capabilitiesFor(pool, undefined)?.type).toBe("generic");
	});
});

describe("AdapterPool.refresh", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("re-runs discovery and replaces the stale snapshot", async () => {
		const fresh: Record<string, HarnessDiscoveryInput> = {
			opencode: { state: "ready", version: "fresh" },
		};
		const discoverSpy = vi
			.spyOn(harnessDiscovery, "discoverLocalHarnesses")
			// biome-ignore lint/suspicious/noExplicitAny: test mock requires partial shape
			.mockResolvedValue(fresh as any);
		const pool = new AdapterPool({ opencode: { state: "ready", version: "stale" } });

		await pool.refresh();

		expect(discoverSpy).toHaveBeenCalledOnce();
	});

	it("does not run the session probe — runtime caps stay unset after a refresh", async () => {
		const fresh: Record<string, HarnessDiscoveryInput> = {
			"claude-code": { state: "ready", version: "2.1.178" },
		};
		vi.spyOn(harnessDiscovery, "discoverLocalHarnesses")
			// biome-ignore lint/suspicious/noExplicitAny: test mock requires partial shape
			.mockResolvedValue(fresh as any);
		const pool = new AdapterPool();

		await pool.refresh();

		const claudeCode = pool.describe().find((d) => d.type === "claude-code");
		expect(claudeCode?.discovery.state).toBeDefined();
	});
});

describe("createLocalAdapterPool — hermetic behavior", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("returns null for an unknown harnessType", async () => {
		const pool = await createLocalAdapterPool();
		expect(pool.select({ harnessType: "totally-unknown-harness-xyz" })).toBeNull();
	});

	it("a manually registered adapter with a custom type is selectable, and existing entries are untouched", async () => {
		const pool = new AdapterPool();
		pool.register("existing-adapter", makeAdapter(), {
			name: "Existing",
			kind: "local",
			type: "existing-type",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});
		pool.register("new-adapter", makeAdapter({ mcpSupport: true }), {
			name: "New Tool",
			kind: "local",
			type: "new-type",
			modelProviders: [],
			maxConcurrent: 2,
		});
		expect(pool.select({ harnessType: "existing-type" })?.id).toBe("existing-adapter");
		expect(pool.select({ harnessType: "new-type" })?.id).toBe("new-adapter");
	});

	it("a CliHarnessAdapter registers and selects like any other adapter", () => {
		const pool = new AdapterPool();
		const cliAdapter = new CliHarnessAdapter(
			{
				binary: "opencode",
				args: ["--dir", "{{sandbox}}"],
				envMap: { ANTHROPIC_API_KEY: "{{apiKey}}" },
				eventFormat: "text",
				envAllowlist: ["PATH", "HOME"],
			},
			{ spawnFn: vi.fn() },
		);
		pool.register("local-cli-opencode", cliAdapter, {
			name: "CLI: opencode",
			kind: "local",
			type: "opencode",
			modelProviders: [],
			maxConcurrent: 2,
		});
		const entry = pool.select({ harnessType: "opencode" });
		expect(entry?.id).toBe("local-cli-opencode");
		expect(entry?.meta.type).toBe("opencode");
	});

	it("registers no id matching the retired isolation machinery", async () => {
		const pool = await createLocalAdapterPool();
		expect(pool.has("isolated-worker")).toBe(false);
		expect(pool.has("docker-worker")).toBe(false);
	});

	// @lore the isolation gate that used to warn on this env var is deleted, not
	// just silenced — this asserts there is no gate left to trigger, not merely
	// that it stayed quiet by chance.
	it("emits no isolation-gate warning even when HYPERIDLE_ENABLE_ISOLATED is set", async () => {
		vi.stubEnv("HYPERIDLE_ENABLE_ISOLATED", "1");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		await createLocalAdapterPool();

		const isolatedWarnings = warnSpy.mock.calls
			.map((args) => args.map(String).join(" "))
			.filter((line) => line.toLowerCase().includes("hyperidle_enable_isolated"));
		expect(isolatedWarnings).toHaveLength(0);
	});

	it("registers no adapter that is not a real CLI harness type", async () => {
		const pool = await createLocalAdapterPool();
		expect(pool.has("local-builtin")).toBe(false);
		for (const d of pool.describe({ includeKnownMissing: false })) {
			expect(["claude-code", "codex", "opencode", "cursor-agent"]).toContain(d.type);
		}
	});
});
