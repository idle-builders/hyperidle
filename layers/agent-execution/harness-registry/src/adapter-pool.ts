/**
 * AdapterPool — registry of HarnessAdapter instances (local and remote).
 *
 * Maintains a map of adapter entries keyed by stable ID. select() returns the
 * least-loaded eligible adapter and increments its active session count.
 * release() decrements the count when a session ends.
 */

import type { HarnessType } from "@hyperidle/domain-model";
import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import type { AdapterInfo, AdapterMeta, HarnessAdapter } from "@hyperidle/harness-protocol";
import {
	type CliAdapterConfig,
	type CliAvailabilityDeps,
	CliHarnessAdapter,
} from "./cli-harness-adapter.js";
import { CodexAppServerAdapter } from "./codex-app-server-adapter.js";
import type { EnforcementRegistry } from "./enforcement-registry.js";
import {
	describeHarnessCapability,
	missingHarnessCapabilities,
} from "./harness-capability-descriptors.js";
import type { HarnessDiscoveryInput, HarnessProbeDeps } from "./harness-discovery.js";
import { discoverLocalHarnesses, type HarnessDiscoveryResult } from "./harness-discovery.js";
import { OpenCodeServeAdapter } from "./opencode-serve-adapter.js";

/** Internal pool entry. */
interface PoolEntry {
	readonly adapter: HarnessAdapter;
	readonly meta: AdapterMeta;
	currentLoad: number;
	/** marks this entry as paused — select() skips paused entries. */
	paused: boolean;
	readonly connectedSince: string;
}

/** Optional requirements for adapter selection. */
export interface SelectRequirements {
	/** If present, only adapters supporting ALL listed providers are eligible. */
	readonly modelProviders?: readonly string[];
	/** If set, only adapters with matching type are eligible. */
	readonly harnessType?: string;
}

export interface AdapterFilter {
	readonly type?: string;
	readonly kind?: AdapterInfo["kind"];
	readonly includeKnownMissing?: boolean;
}

/** A selected adapter entry (returned from select()). */
export class AdapterPool {
	private readonly entries = new Map<string, PoolEntry>();
	/**
	 */
	private discoveries?: Readonly<Record<string, HarnessDiscoveryInput>>;

	constructor(
		discoveries?: HarnessDiscoveryResult | Readonly<Record<string, HarnessDiscoveryInput>>,
	) {
		if (discoveries) {
			this.discoveries = Object.freeze(
				Object.fromEntries(
					Object.entries(discoveries).map(([k, v]) => [k, v as HarnessDiscoveryInput]),
				) as Readonly<Record<string, HarnessDiscoveryInput>>,
			);
		}
	}

	/**
	 * Re-run discoverLocalHarnesses() and replace the discovery snapshot.
	 * Refreshes readiness/version/auth state — does NOT run the session probe
	 * (same probe-gating as boot; runtime caps stay false).
	 *
	 * `discoveryDeps` is the same injectable command-runner discoverLocalHarnesses
	 * already takes — a unit test passes a stub here so refresh() never spawns a
	 * real binary; production never passes it, so real discovery runs unchanged.
	 */
	async refresh(discoveryDeps?: HarnessProbeDeps): Promise<void> {
		const fresh = await discoverLocalHarnesses(discoveryDeps);
		this.discoveries = Object.freeze(
			Object.fromEntries(
				Object.entries(fresh).map(([k, v]) => [k, v as HarnessDiscoveryInput]),
			) as Readonly<Record<string, HarnessDiscoveryInput>>,
		);
	}

	/** Number of registered adapters. */
	get size(): number {
		return this.entries.size;
	}

	/**
	 * Register an adapter with a stable ID and metadata.
	 * Replaces any existing entry with the same ID.
	 */
	register(id: string, adapter: HarnessAdapter, meta: AdapterMeta): void {
		const existing = this.entries.get(id);
		this.entries.set(id, {
			adapter,
			meta,
			currentLoad: existing?.currentLoad ?? 0,
			paused: existing?.paused ?? false,
			connectedSince: existing?.connectedSince ?? new Date().toISOString(),
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

	/**
	 * Mark an adapter as paused — select() will skip it.
	 * No-op if the ID is unknown.
	 */
	pause(id: string): void {
		const entry = this.entries.get(id);
		if (entry) {
			entry.paused = true;
		}
	}

	/**
	 * Clear the paused flag — select() will consider it again.
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
	 */
	select(requirements?: SelectRequirements): {
		readonly id: string;
		readonly adapter: HarnessAdapter;
		readonly meta: AdapterMeta;
	} | null {
		let best: { id: string; entry: PoolEntry } | null = null;

		for (const [id, entry] of this.entries) {
			// skip paused adapters
			if (entry.paused) continue;

			// Capacity filter
			if (entry.currentLoad >= entry.meta.maxConcurrent) continue;

			// modelProviders filter — ALL required providers must be in adapter's list
			if (requirements?.modelProviders) {
				const adapterProviders = entry.meta.modelProviders;
				const allMatch = requirements.modelProviders.every((p) => adapterProviders.includes(p));
				if (!allMatch) continue;
			}

			// harnessType filter — adapter type must match when specified.
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
	 * Why `select(requirements)` would return null, in the caller's words.
	 *
	 * `select` has six distinct ways to reject every entry, and the pool is the
	 * only thing that can tell them apart.
	 *
	 * Ordered most-actionable first: an empty pool is a different problem from
	 * a filtered-out pool, which is a different problem from a full one.
	 */
	describeSelectFailure(requirements?: SelectRequirements): string {
		if (this.entries.size === 0) {
			// Covers both ways a pool ends up empty, because the pool cannot tell
			// them apart: a `local`-topology deployment discovered no CLI on this
			// host, and a `disabled`-topology one (the `remote-server`
			// Application) never discovers anything at all — it waits for remote
			// workers to register. Naming only the first would send a
			// remote-server operator hunting for a binary that was never meant to
			// be installed.
			return "no harness adapters are registered — no local harness was discovered on this host, and no remote worker has registered";
		}
		const live = [...this.entries.values()].filter((entry) => !entry.paused);
		if (live.length === 0) {
			return `every registered harness adapter is paused (${this.entries.size} total)`;
		}
		const availableTypes = [...new Set(live.map((entry) => entry.meta.type ?? "untyped"))];
		if (requirements?.harnessType) {
			const ofType = live.filter((entry) => entry.meta.type === requirements.harnessType);
			if (ofType.length === 0) {
				return `no harness adapter of type "${requirements.harnessType}" is available (available: ${availableTypes.join(", ")})`;
			}
		}
		if (requirements?.modelProviders) {
			const required = requirements.modelProviders;
			const matching = live.filter((entry) =>
				required.every((provider) => entry.meta.modelProviders.includes(provider)),
			);
			if (matching.length === 0) {
				return `no harness adapter supports the required model providers (${required.join(", ")})`;
			}
		}
		return `all harness adapters are at capacity (${live.length} available: ${availableTypes.join(", ")})`;
	}

	/**
	 * Return the HarnessCapabilities for the first adapter matching the given
	 * harnessType. When harnessType is null, returns capabilities from any adapter
	 * (useful when the agent has no preference — any adapter will do).
	 * Returns null when no matching adapter is registered.
	 */
	describe(filter?: AdapterFilter): HarnessCapabilityDescriptor[] {
		const includeKnownMissing = filter?.includeKnownMissing ?? true;
		const descriptors: HarnessCapabilityDescriptor[] = [];
		const seen = new Set<string>();

		for (const entry of this.entries.values()) {
			if (!entry.meta.type) continue;
			if (filter?.type && entry.meta.type !== filter.type) continue;
			if (filter?.kind && entry.meta.kind !== filter.kind) continue;
			if (seen.has(entry.meta.type)) continue;
			seen.add(entry.meta.type);
			descriptors.push(
				describeHarnessCapability(entry.meta, entry.adapter.getCapabilities(), this.discoveries),
			);
		}

		if (includeKnownMissing) {
			descriptors.push(...missingHarnessCapabilities(seen, this.discoveries));
		}

		return descriptors;
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
 * express a preference: harnessType: "opencode" routes to the OpenCode adapter.
 *
 * Only the binary name is needed: codex uses CodexAppServerAdapter and opencode
 * uses OpenCodeServeAdapter — neither goes through CliHarnessAdapter.
 */
export const CLI_TOOL_CONFIGS: Partial<Record<HarnessType, { readonly binary: string }>> = {
	// codex uses CodexAppServerAdapter — only the binary name is needed here for discovery.
	codex: { binary: "codex" },
	// opencode uses OpenCodeServeAdapter — only the binary name is needed here for discovery.
	opencode: { binary: "opencode" },
};

/**
 * CLI adapter config for the `claude` CLI (claude-code harness type).
 *
 * Key design decisions:
 * - No ANTHROPIC_API_KEY in envMap: claude uses its own installed auth (via HOME).
 *   Injecting our key would shadow the user's configured auth and break the
 *   intended "installed harness brings its own credentials" pattern (mirrors
 *   codex reading ~/.codex/auth.json — we don't inject OpenAI keys there either).
 */
export const CLAUDE_CLI_CONFIG: CliAdapterConfig = {
	binary: "claude",
	// `--input-format stream-json` + `--replay-user-messages` keeps stdin open so mid-run
	// deliver() calls write additional user messages while claude is running.
	// The first user message is written as a JSON line immediately after spawn.
	// `--output-format stream-json --verbose` emits one JSON object per line;
	// `--model {{model}}` sets the model; `--mcp-config .mcp.json` wires MCP;
	// `--strict-mcp-config` enforces MCP config (no auto-discovery from other dirs);
	// @lore: --mcp-config .mcp.json is unconditional — crashes "MCP config file not found" if no file; provisionSession always writes it
	args: [
		"--input-format",
		"stream-json",
		"--replay-user-messages",
		"--output-format",
		"stream-json",
		"--verbose",
		"--model",
		"{{model}}",
		"--mcp-config",
		".mcp.json",
		"--strict-mcp-config",
		"--permission-mode",
		"bypassPermissions",
		"--settings",
		".claude/settings.json",
	],
	stdinDelivery: "json-stream",
	// No API key injection — claude uses its own installed auth via HOME.
	envMap: {},
	eventFormat: "ndjson",
	// PATH + HOME needed for binary resolution and credential loading.
	// LANG for locale-sensitive output correctness.
	// @lore: USER + LOGNAME required on macOS — OAuth token in login Keychain; Security framework needs USER/LOGNAME; without them claude returns "Not logged in"
	envAllowlist: ["PATH", "HOME", "LANG", "USER", "LOGNAME"],
	// returnEnforcementChannel: settings-claude — provisionReturnHook writes
	// .claude/settings.json + return-check.sh Stop hook before session start.
	returnEnforcementChannel: "settings-claude",
	// Dialect tag — triggers preMapClaudeEvent in parseStdoutLine.
	eventDialect: "claude-stream-json",
};

/**
 * CLI adapter config for the `cursor-agent` binary (cursor-agent harness type).
 */
export const CURSOR_AGENT_CLI_CONFIG: CliAdapterConfig = {
	binary: "cursor-agent",
	args: [
		"-p",
		"{{prompt}}",
		"--print",
		"--output-format",
		"stream-json",
		"--model",
		"{{model}}",
		"--trust",
		"--approve-mcps",
	],
	envMap: {},
	eventFormat: "ndjson",
	envAllowlist: ["PATH", "HOME", "LANG", "USER", "LOGNAME"],
	returnEnforcementChannel: "none",
	eventDialect: "claude-stream-json",
	mcpConfig: { dialect: "cursor-json" },
};

/**
 * Register CLI adapters for any well-known tools that are available on PATH.
 * Silently skips tools whose binary is not found — no error thrown.
 */
async function registerCliAdaptersIfAvailable(
	pool: AdapterPool,
	availabilityDeps?: CliAvailabilityDeps,
): Promise<void> {
	const maxConcurrent = Number.parseInt(process.env.HYPERIDLE_LOCAL_MAX_CONCURRENT ?? "2", 10);

	for (const [name, config] of Object.entries(CLI_TOOL_CONFIGS)) {
		const available = await CliHarnessAdapter.checkAvailability(config.binary, availabilityDeps);
		if (available) {
			// codex uses CodexAppServerAdapter (JSON-RPC app-server protocol, supports mid-turn deliver)
			// opencode uses OpenCodeServeAdapter (HTTP serve API, supports mid-turn deliver)
			const adapter = name === "codex" ? new CodexAppServerAdapter() : new OpenCodeServeAdapter();
			pool.register(`local-cli-${name}`, adapter, {
				name: `CLI: ${name}`,
				kind: "local",
				type: name,
				modelProviders: [],
				maxConcurrent,
			});
		}
	}
}

/**
 * Create an AdapterPool pre-loaded with all available local adapters:
 * 1. claude-code (CliHarnessAdapter, binary `claude`) — registered if on PATH
 * 2. codex / opencode / cursor-agent — registered if their binary is on PATH
 */
export async function createLocalAdapterPool(opts?: {
	enforcement?: EnforcementRegistry;
	/**
	 * Injectable command-runner for binary discovery — the same seam
	 * discoverLocalHarnesses/checkAvailability already expose for tests. A unit
	 * test passes stubs here so createLocalAdapterPool never spawns a real CLI's
	 * `--version` or shells out to `which`; production never passes them, so real
	 * discovery runs unchanged.
	 */
	discoveryDeps?: HarnessProbeDeps;
	availabilityDeps?: CliAvailabilityDeps;
}): Promise<AdapterPool> {
	const discoveries = await discoverLocalHarnesses(opts?.discoveryDeps);
	const pool = new AdapterPool(discoveries);
	const maxConcurrent = Number.parseInt(process.env.HYPERIDLE_LOCAL_MAX_CONCURRENT ?? "4", 10);
	const enforcement = opts?.enforcement;
	const availabilityDeps = opts?.availabilityDeps;

	// 1. claude-code adapter (CliHarnessAdapter, registered only if `claude` binary is on PATH)
	if (await CliHarnessAdapter.checkAvailability(CLAUDE_CLI_CONFIG.binary, availabilityDeps)) {
		pool.register("local-claude-code", new CliHarnessAdapter(CLAUDE_CLI_CONFIG, { enforcement }), {
			name: "Claude Code",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent,
		});
	}

	// 1b. cursor-agent adapter (CliHarnessAdapter, registered only if binary is on PATH)
	if (await CliHarnessAdapter.checkAvailability(CURSOR_AGENT_CLI_CONFIG.binary, availabilityDeps)) {
		pool.register(
			"local-cursor-agent",
			new CliHarnessAdapter(CURSOR_AGENT_CLI_CONFIG, { enforcement }),
			{
				name: "Cursor Agent",
				kind: "local",
				type: "cursor-agent",
				modelProviders: [],
				maxConcurrent,
			},
		);
	}

	// 3. CLI adapters: registered dynamically when available
	await registerCliAdaptersIfAvailable(pool, availabilityDeps);

	return pool;
}
