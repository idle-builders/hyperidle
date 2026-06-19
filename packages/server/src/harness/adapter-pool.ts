/**
 * S2: AdapterPool — registry of HarnessAdapter instances (local and remote).
 *
 * Maintains a map of adapter entries keyed by stable ID. select() returns the
 * least-loaded eligible adapter and increments its active session count.
 * release() decrements the count when a session ends.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { HarnessAdapter, HarnessCapabilityDescriptor } from "@hyperidle/shared";
import { BuiltinHarnessAdapter } from "./builtin-harness-adapter.js";
import { ClaudeAgentSdkAdapter } from "./claude-agent-sdk-adapter.js";
import { type CliAdapterConfig, CliHarnessAdapter } from "./cli-harness-adapter.js";
import {
	describeRegisteredHarness,
	missingKnownHarnessDescriptors,
} from "./harness-capability-descriptors.js";

/** Descriptor for a registered adapter. */
export interface AdapterMeta {
	readonly name: string;
	readonly kind: "local" | "remote";
	/** X3: Harness type for agent preference matching (e.g. "claude-code", "aider"). */
	readonly type?: string;
	readonly modelProviders: readonly string[];
	readonly maxConcurrent: number;
}

/** Public view of a pool entry (used by GET /api/workers). */
export interface AdapterInfo {
	readonly id: string;
	readonly name: string;
	readonly kind: "local" | "remote";
	/** X3: Harness type for agent preference matching. */
	readonly type?: string;
	readonly modelProviders: readonly string[];
	readonly currentLoad: number;
	readonly maxConcurrent: number;
	readonly connectedSince: string;
	/** S4: true when the worker has sent a pause message — skipped by select(). */
	readonly paused: boolean;
}

/** Internal pool entry. */
interface PoolEntry {
	readonly adapter: HarnessAdapter;
	readonly meta: AdapterMeta;
	currentLoad: number;
	/** S4: marks this entry as paused — select() skips paused entries. */
	paused: boolean;
	readonly connectedSince: string;
}

/** Optional requirements for adapter selection. */
export interface SelectRequirements {
	/** If present, only adapters supporting ALL listed providers are eligible. */
	readonly modelProviders?: readonly string[];
	/** X3: If set, only adapters with matching type are eligible. */
	readonly harnessType?: string;
}

/** A selected adapter entry (returned from select()). */
export interface SelectedEntry {
	readonly id: string;
	readonly adapter: HarnessAdapter;
	readonly meta: AdapterMeta;
}

export class AdapterPool {
	private readonly entries = new Map<string, PoolEntry>();

	/** Number of registered adapters. */
	get size(): number {
		return this.entries.size;
	}

	/**
	 * Register an adapter with a stable ID and metadata.
	 * Replaces any existing entry with the same ID.
	 */
	register(id: string, adapter: HarnessAdapter, meta: AdapterMeta): void {
		this.entries.set(id, {
			adapter,
			meta,
			currentLoad: 0,
			paused: false,
			connectedSince: new Date().toISOString(),
		});
	}

	/** Remove an adapter from the pool. No-op if ID is unknown. */
	unregister(id: string): void {
		this.entries.delete(id);
	}

	/** Returns true if an adapter is registered under the given id. */
	has(id: string): boolean {
		return this.entries.has(id);
	}

	/** List all registered adapters as AdapterInfo (snapshot). */
	list(): AdapterInfo[] {
		return Array.from(this.entries.entries()).map(([id, entry]) => ({
			id,
			name: entry.meta.name,
			kind: entry.meta.kind,
			type: entry.meta.type,
			modelProviders: entry.meta.modelProviders,
			currentLoad: entry.currentLoad,
			maxConcurrent: entry.meta.maxConcurrent,
			connectedSince: entry.connectedSince,
			paused: entry.paused,
		}));
	}

	/**
	 * S4: Mark an adapter as paused — select() will skip it.
	 * No-op if the ID is unknown.
	 */
	pause(id: string): void {
		const entry = this.entries.get(id);
		if (entry) {
			entry.paused = true;
		}
	}

	/**
	 * S4: Clear the paused flag — select() will consider it again.
	 * No-op if the ID is unknown.
	 */
	resume(id: string): void {
		const entry = this.entries.get(id);
		if (entry) {
			entry.paused = false;
		}
	}

	/**
	 * Select the least-loaded eligible adapter and increment its active session count.
	 * Returns null if no eligible adapter with remaining capacity exists.
	 *
	 * @lore S2: "least-loaded" means lowest ratio of currentLoad/maxConcurrent.
	 * Filtering happens first (capacity + modelProviders), then min-load selection.
	 */
	select(requirements?: SelectRequirements): SelectedEntry | null {
		let best: { id: string; entry: PoolEntry } | null = null;

		for (const [id, entry] of this.entries) {
			// S4: skip paused adapters
			if (entry.paused) continue;

			// Capacity filter
			if (entry.currentLoad >= entry.meta.maxConcurrent) continue;

			// modelProviders filter — ALL required providers must be in adapter's list
			if (requirements?.modelProviders) {
				const adapterProviders = entry.meta.modelProviders;
				const allMatch = requirements.modelProviders.every((p) => adapterProviders.includes(p));
				if (!allMatch) continue;
			}

			// X3: harnessType filter — adapter type must match when specified.
			// An adapter without a type (type: undefined) does NOT match a specific
			// harnessType requirement (backward compat: old workers without type can
			// still be selected when harnessType is unspecified/undefined).
			if (requirements?.harnessType) {
				if (entry.meta.type !== requirements.harnessType) continue;
			}

			// Least-loaded selection
			if (best === null || entry.currentLoad < best.entry.currentLoad) {
				best = { id, entry };
			}
		}

		if (best === null) return null;

		best.entry.currentLoad++;
		return { id: best.id, adapter: best.entry.adapter, meta: best.entry.meta };
	}

	/**
	 * AB1: Return the HarnessCapabilities for the first adapter matching the given
	 * harnessType. When harnessType is null, returns capabilities from any adapter
	 * (useful when the agent has no preference — any adapter will do).
	 * Returns null when no matching adapter is registered.
	 *
	 * @lore AB1: Capabilities are read via adapter.getCapabilities() at query time,
	 * not cached. This avoids stale capability data if adapters reconnect with
	 * different features. The overhead is trivial (O(n) map scan, no I/O).
	 */
	getCapabilitiesByType(
		harnessType: string | null,
	): import("@hyperidle/shared").HarnessCapabilities | null {
		for (const entry of this.entries.values()) {
			if (harnessType === null || entry.meta.type === harnessType) {
				return entry.adapter.getCapabilities();
			}
		}
		return null;
	}

	listCapabilityDescriptors(options?: {
		readonly includeKnownMissing?: boolean;
	}): HarnessCapabilityDescriptor[] {
		const includeKnownMissing = options?.includeKnownMissing ?? true;
		const descriptors: HarnessCapabilityDescriptor[] = [];
		const seen = new Set<string>();

		for (const entry of this.entries.values()) {
			if (!entry.meta.type) continue;
			if (seen.has(entry.meta.type)) continue;
			seen.add(entry.meta.type);
			descriptors.push(describeRegisteredHarness(entry.meta, entry.adapter.getCapabilities()));
		}

		if (includeKnownMissing) {
			descriptors.push(...missingKnownHarnessDescriptors(seen));
		}

		return descriptors;
	}

	getCapabilityDescriptorByType(harnessType: string | null): HarnessCapabilityDescriptor | null {
		const descriptors = this.listCapabilityDescriptors({ includeKnownMissing: false });
		if (harnessType === null) {
			return descriptors[0] ?? null;
		}
		return descriptors.find((descriptor) => descriptor.type === harnessType) ?? null;
	}

	/**
	 * Release one session slot for the given adapter ID.
	 * No-op if ID is unknown or load is already 0.
	 */
	release(id: string): void {
		const entry = this.entries.get(id);
		if (!entry) return;
		if (entry.currentLoad > 0) {
			entry.currentLoad--;
		}
	}
}

/**
 * Well-known CLI tool configurations.
 * Each tool registers with its own harnessType (binary name) so agents can
 * express a preference: harnessType: "aider" routes to the Aider adapter.
 *
 * @lore X5: CLI tool flags are provisional — they reflect the best-known
 * invocation at the time of writing. Validate during X7 (E2E evals) or
 * manual testing. Prefer --no-interactive / headless flags where supported.
 */
const CLI_TOOL_CONFIGS: Record<string, CliAdapterConfig> = {
	aider: {
		binary: "aider",
		args: ["--no-auto-commits", "--no-git", "{{workspace}}"],
		envMap: {
			ANTHROPIC_API_KEY: "{{apiKey}}",
			OPENAI_API_KEY: "{{apiKey}}",
		},
		eventFormat: "text",
		envAllowlist: ["PATH", "HOME", "LANG"],
	},
	goose: {
		binary: "goose",
		args: ["session", "--workspace", "{{workspace}}"],
		envMap: {
			ANTHROPIC_API_KEY: "{{apiKey}}",
		},
		eventFormat: "text",
		envAllowlist: ["PATH", "HOME", "LANG"],
	},
	opencode: {
		binary: "opencode",
		args: ["--dir", "{{workspace}}"],
		envMap: {
			ANTHROPIC_API_KEY: "{{apiKey}}",
		},
		eventFormat: "text",
		envAllowlist: ["PATH", "HOME", "LANG"],
	},
};

/**
 * Register CLI adapters for any well-known tools that are available on PATH.
 * Silently skips tools whose binary is not found — no error thrown.
 *
 * @lore X5: Each CLI tool gets its own harnessType (the binary name) so an
 * agent's harnessType: "aider" selection is unambiguous. A generic "cli" type
 * was considered but rejected — the founder chose a specific tool for a reason.
 */
async function registerCliAdaptersIfAvailable(pool: AdapterPool): Promise<void> {
	const maxConcurrent = Number.parseInt(process.env.HYPERIDLE_LOCAL_MAX_CONCURRENT ?? "2", 10);

	for (const [name, config] of Object.entries(CLI_TOOL_CONFIGS)) {
		const available = await CliHarnessAdapter.checkAvailability(config.binary);
		if (available) {
			const adapter = new CliHarnessAdapter(config);
			pool.register(`local-cli-${name}`, adapter, {
				name: `CLI: ${name}`,
				kind: "local",
				// X5: Each CLI tool registers with its own type (the tool name) so
				// agents can select a specific tool via harnessType.
				type: name,
				modelProviders: [],
				maxConcurrent,
			});
		}
	}
}

/**
 * Create an AdapterPool pre-loaded with all available local adapters:
 * 1. claude-code (ClaudeAgentSdkAdapter) — always registered
 * 2. builtin (BuiltinHarnessAdapter stub) — always registered (X6 fills in)
 * 3. aider / goose / opencode — registered if their binary is on PATH
 *
 * @lore S2 AC4: this factory keeps server-factory.ts clean — it just calls
 * createLocalAdapterPool() instead of knowing about adapter internals.
 *
 * @lore X5: The function is now async because CLI adapter registration checks
 * binary availability via `which`. The server-factory.ts call site is already
 * async so the signature change is local.
 *
 * @lore X5: The adapter ID for the Claude Code adapter changed from "local"
 * to "local-claude-code" to make room for multiple local adapters. The old
 * "local" ID was only referenced inside this factory and tests that use
 * pool.list() — not hardcoded elsewhere.
 */
export async function createLocalAdapterPool(): Promise<AdapterPool> {
	const pool = new AdapterPool();
	const maxConcurrent = Number.parseInt(process.env.HYPERIDLE_LOCAL_MAX_CONCURRENT ?? "4", 10);

	// 1. Claude Code adapter (existing)
	const claudeAdapter = new ClaudeAgentSdkAdapter();
	pool.register("local-claude-code", claudeAdapter, {
		name: "Claude Code",
		kind: "local",
		type: "claude-code",
		modelProviders: ["anthropic"],
		maxConcurrent,
	});

	// 2. X6: Built-in harness adapter — supports direct API calls to all providers
	const builtinAdapter = new BuiltinHarnessAdapter();
	pool.register("local-builtin", builtinAdapter, {
		name: "Built-in Harness",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: Number.parseInt(process.env.HYPERIDLE_BUILTIN_MAX_CONCURRENT ?? "8", 10),
	});

	// 3. CLI adapters: registered dynamically when available
	await registerCliAdaptersIfAvailable(pool);

	// 4. AF7 §8 (Z8-050): docker/isolated adapters are experimental and OFF by
	// default. They were previously instantiated only in tests — never reachable
	// in production — a silent dead path. Make them explicitly gated, not deleted:
	// they register only when their env flag is set AND their runtime prerequisite
	// is available; a flag-set-but-prereq-missing case logs a warning and SKIPS
	// (never throws, never registers a broken adapter).
	//
	// @lore Z8-050: DockerSandboxAdapter is a SandboxAdapter (workspace
	// lifecycle), NOT a HarnessAdapter — it cannot live in this HarnessAdapter
	// pool. It is selected via the workspace-adapter wiring in server-factory, not
	// here. We document the flag (HYPERIDLE_ENABLE_DOCKER) at its construction site;
	// this pool factory governs only the harness adapters.
	//
	// @lore Z8-050: IsolatedHarnessAdapter forks isolated-session-worker.js and
	// requires a CredentialResolver + IsolationConfig that this local-pool factory
	// does not receive (it builds a credential-free local pool). Until that wiring
	// exists, we gate on HYPERIDLE_ENABLE_ISOLATED and check the worker script's
	// availability, logging a clear warning when enabled-but-unwireable instead of
	// failing silently. This is coherence (reachable iff enabled + available), not
	// removal — the adapter keeps its passing tests and a future wiring path.
	if (process.env.HYPERIDLE_ENABLE_ISOLATED === "1") {
		const workerScript = path.join(
			path.dirname(new URL(import.meta.url).pathname),
			"isolated-session-worker.js",
		);
		if (!fs.existsSync(workerScript)) {
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn(
				"[adapter-pool] HYPERIDLE_ENABLE_ISOLATED=1 but isolated-session-worker.js is not present; skipping isolated adapter registration.",
			);
		} else {
			// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
			console.warn(
				"[adapter-pool] HYPERIDLE_ENABLE_ISOLATED=1: isolated harness is experimental and requires a CredentialResolver + IsolationConfig that the local pool factory does not provide; not registered. Wire it explicitly in server-factory if needed.",
			);
		}
	}

	return pool;
}
