/**
 * S2: AdapterPool — registry of HarnessAdapter instances (local and remote).
 *
 * Maintains a map of adapter entries keyed by stable ID. select() returns the
 * least-loaded eligible adapter and increments its active session count.
 * release() decrements the count when a session ends.
 */

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import type { AdapterInfo, AdapterMeta, HarnessAdapter } from "@hyperidle/harness-protocol";
import { BuiltinHarnessAdapter } from "./builtin-harness-adapter.js";
import { type CliAdapterConfig, CliHarnessAdapter } from "./cli-harness-adapter.js";
import type { EnforcementRegistry } from "./enforcement-registry.js";
import {
	describeHarnessCapability,
	missingHarnessCapabilities,
} from "./harness-capability-descriptors.js";
import type { HarnessDiscoveryInput } from "./harness-discovery.js";
import { discoverLocalHarnesses, type HarnessDiscoveryResult } from "./harness-discovery.js";

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
	/**
	 * AM4 CHANGE 1: Caller-supplied list of disabled harness types (pool is DB-free and
	 * select() is synchronous — cannot read server_config itself). The caller (admitSession)
	 * reads harnessDisabled from readServerConfig(db) and passes it here.
	 * Paired with the builtin hard-exemption (CHANGE 2) — "builtin" is NEVER skipped
	 * even if present in this list (back-stop against hand-edited/stale config).
	 *
	 * @lore AM4: Real persisted control backed by server_config.harnessDisabled + this
	 * caller-supplied gate (AM4 R1 reversal, founder review + AC2). The pool stays a
	 * pure in-memory registry (preserves the AM2 immutability lore).
	 */
	readonly disabledTypes?: readonly string[];
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
	 * @lore AM4: `readonly` dropped to allow refreshDiscoveries() to reassign the snapshot.
	 * The freeze() is still applied to each new assignment so callers reading the snapshot
	 * see a stable (frozen) map. Reassignment is atomic in JS single-thread; the await in
	 * refreshDiscoveries() completes before the reassign so no concurrent read sees a partial map.
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
	 * AM4: Re-run discoverLocalHarnesses() and replace the discovery snapshot.
	 * Refreshes readiness/version/auth state — does NOT run the session probe
	 * (same probe-gating as boot; runtime caps stay false until AM3).
	 *
	 * @lore AM4: Called by POST /api/harnesses/redetect. The pool is DB-free so
	 * the caller (route handler) stamps discovery.disabled separately from readServerConfig.
	 */
	async refresh(): Promise<void> {
		const fresh = await discoverLocalHarnesses();
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
	select(requirements?: SelectRequirements): {
		readonly id: string;
		readonly adapter: HarnessAdapter;
		readonly meta: AdapterMeta;
	} | null {
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

			// AM4 CHANGE 1+2: disabledTypes gate with builtin hard-exemption.
			// The caller (admitSession) passes harnessDisabled from server_config here.
			// "builtin" is HARD-EXEMPT regardless of the persisted list — back-stop
			// against stale config stranding the always-present fallback.
			//
			// @lore AM4: showsToggle(builtin) === false is the front-door guard (UI);
			// this exemption is the back-stop (selection). Both are required (CHANGE 2).
			if (
				requirements?.disabledTypes &&
				requirements.disabledTypes.length > 0 &&
				entry.meta.type &&
				entry.meta.type !== "builtin" && // CHANGE 2: builtin hard-exempt
				requirements.disabledTypes.includes(entry.meta.type)
			) {
				continue;
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
 * @lore X5: CLI tool flags are provisional — they reflect the best-known
 * invocation at the time of writing. Validate during X7 (E2E evals) or
 * manual testing. Prefer --no-interactive / headless flags where supported.
 *
 * @lore X5: codex session-spawn invocation is `codex exec <prompt> --json`
 * (proven by probeCodexSession in harness-session-probe.ts and the committed
 * fixture packages/server/src/harness/__tests__/fixtures/codex-exec.jsonl).
 * {{sandbox}} is the working directory; codex is invoked from cwd:sandboxPath
 * so no explicit --dir flag is needed — codex picks up the cwd automatically.
 * Event format is "ndjson" because codex emits JSONL turn.completed lines
 * normalised by normalizeNativeHarnessEvent("codex", ...).
 */
/**
 * Exported so integration tests can verify the per-session prompt-carrier
 * mechanism is wired (the codex args template must include a seed-prompt carrier slot).
 *
 * @lore CLI_TOOL_CONFIGS is exported (was unexported) so the real-harness
 * test can assert that codex config has a {{prompt}} or {{seed}} template arg. Without
 * a per-session prompt carrier codex sessions get a generic system prompt only.
 */
const CLI_TOOL_CONFIGS: Record<string, CliAdapterConfig> = {
	codex: {
		binary: "codex",
		// @lore X5: `codex exec` runs a single-turn headless session; --json emits
		// JSONL event lines including turn.completed with usage fields. stdin is not
		// needed (no interactive prompt). The task prompt is injected via AGENTS.md
		// written to sandboxPath before startSession is called.
		//
		// @lore "proceed" was a placeholder that caused codex to wait
		// on stdin for the actual prompt (stdin-wait hang). Replaced with {{prompt}}
		// template var, resolved to the seed prompt at startSession time. When no
		// seed prompt is provided, "proceed" is used as the default so codex runs with
		// the system prompt context from AGENTS.md. The CODEX_HOME injection (see
		// CliHarnessAdapter.startSession) also appends --dangerously-bypass-hook-trust.
		//
		// @lore AR7: `--model {{model}}` passes the gateway-resolved model to codex
		// (`codex exec -m/--model <MODEL>`), making codex consistent with claude and
		// opencode (all three receive the model as an explicit CLI argument from
		// config.resolvedModel?.model, cli-harness-adapter.ts:365). This is a
		// deliberate production-adapter change: codex runs now pass the locked model
		// from HARNESS_TEST_MODELS explicitly rather than relying on the inherited
		// CODEX_HOME config default. The {{prompt}} / AGENTS.md / stdin-wait lore
		// above remains valid — only the model is newly argument-enforced.
		//
		// @lore AO2 codex-workspace-write: `--sandbox workspace-write` allows codex's
		// shell tool to write files in the working directory (the mounted worktree).
		// Without this flag, codex defaults to `read-only` sandbox mode and refuses
		// ALL file writes (including `printf > FILE.txt`). The worktree IS the
		// sandboxPath — codex must be able to write into it. This is a production fix:
		// a codex agent that cannot write its mounted filesystem is useless.
		// Verified against codex-cli: `codex exec --help` lists three values:
		// read-only (default), workspace-write, danger-full-access.
		// workspace-write = writable within the cwd tree; no full-disk access.
		args: ["exec", "--sandbox", "workspace-write", "--model", "{{model}}", "{{prompt}}", "--json"],
		envMap: {
			OPENAI_API_KEY: "{{apiKey}}",
		},
		eventFormat: "ndjson",
		envAllowlist: ["PATH", "HOME", "LANG"],
		// Explicit channel — avoids relying on deriveCliChannel binary-string matching.
		// @lore Prefer explicit returnEnforcementChannel over binary-name inference.
		// deriveCliChannel("codex") → "settings-codex" is a fallback; explicit is authoritative.
		returnEnforcementChannel: "settings-codex",
		// Per-session seed prompt carrier for Codex.
		// "positional" means the {{prompt}} template arg in args[] carries the message.
		// CliHarnessAdapter resolves {{prompt}} to the seed prompt before spawning.
		// @lore Without this field, re-engage runs would use the
		// same generic "proceed" prompt regardless of the forcing message.
		seedPrompt: "positional",
		// AL7 delta: codex reads MCP server from .codex-home/config.toml;
		// the token is delivered via HYPERIDLE_MCP_TOKEN env var (bearer_token_env_var).
		mcpConfig: { dialect: "codex-toml" },
		// @lore AR2 codex-stderr-ignore: codex emits informational messages to stderr
		// throughout a session (startup "Reading additional input from stdin...",
		// progress lines, debug output). ALL are benign — real failures manifest as
		// non-zero exit code (→ buildResult outcome:"crashed") or JSONL error events
		// in stdout. Silencing all codex stderr prevents false crash-on-informational-line.
		// Verified codex-cli 0.141.x: the process exits 0 on success regardless of
		// how much stderr it emits.
		stderrIgnorePatterns: [/.*/],
	},
	opencode: {
		binary: "opencode",
		// AL7 delta: opencode headless `run` form (was ["--dir","{{sandbox}}"] which
		// launches the interactive TUI, never completing a headless turn).
		// - `run <prompt>` delivers the seed prompt.
		// - `--dir {{sandbox}}` sets cwd for config resolution (opencode.json).
		// - `--format json` emits JSONL per-event output (eventFormat: "ndjson").
		// - `--pure` disables TUI / interactive fallback.
		// - `--model {{model}}` requires provider-prefixed id (e.g. openrouter/~anthropic/claude-haiku-latest).
		// @lore AL7 W4: {{model}} resolves from config.resolvedModel?.model (cli-harness-adapter.ts:303).
		// opencode run requires a provider-prefixed model id; a bare id fails. The model resolution
		// for opencode agents must produce the provider-prefixed form.
		// @lore AK1: {{sandbox}} is the renamed template var (was {{workspace}}).
		args: [
			"run",
			"{{prompt}}",
			"--dir",
			"{{sandbox}}",
			"--format",
			"json",
			"--pure",
			"--model",
			"{{model}}",
		],
		envMap: {
			ANTHROPIC_API_KEY: "{{apiKey}}",
		},
		// AL7 delta: changed from "text" → "ndjson" because opencode --format json emits JSONL.
		// @lore AL7 W3: opencode JSONL events (step_finish, tool) may normalize to `unknown` via
		// normalizeHarnessEvent until the opencode pre-map is added (T6 verify). The router capture
		// (captured>=1) is on the MCP router path and does NOT depend on event normalization.
		eventFormat: "ndjson",
		// @lore AR2 opencode-env: OPENROUTER_API_KEY is included for OpenRouter-routed models.
		// XDG_DATA_HOME is included so callers can set a per-session data directory to isolate
		// opencode's SQLite database (avoids lock contention when multiple processes run in
		// rapid succession). Without XDG_DATA_HOME isolation, concurrent opencode processes
		// hang on the global ~/.local/share/opencode/opencode.db write-lock.
		// See provisionOpencodeHome() in provision-real-session.ts for the isolation pattern.
		envAllowlist: ["PATH", "HOME", "LANG", "OPENROUTER_API_KEY", "XDG_DATA_HOME"],
		// Explicit channel — avoids relying on deriveCliChannel binary-string matching.
		// @lore Prefer explicit returnEnforcementChannel over binary-name inference.
		// deriveCliChannel("opencode") → "process-reengage" is a fallback; explicit is authoritative.
		returnEnforcementChannel: "process-reengage",
		// Per-session re-engage carrier for OpenCode (process-reengage channel).
		// "run-arg" passes the forcing message as a positional arg to `opencode run <msg>`.
		// @lore Without this, re-engage re-invocations would not carry
		// the forcing message and the agent would not know it needs to return.
		reEngageCarrier: "run-arg",
		// AL7 delta: opencode reads MCP server from opencode.json in the sandbox cwd;
		// the token is inline in headers.Authorization (no tokenEnv needed).
		mcpConfig: { dialect: "opencode-json" },
		// @lore AR2 opencode-stderr-ignore: opencode emits informational progress messages
		// to stderr (model selection, run status, debug output). ALL are benign — real
		// failures manifest as non-zero exit code (→ buildResult outcome:"crashed") or
		// JSONL error events in stdout. Silencing all opencode stderr prevents false
		// crash-on-informational-line (same reasoning as codex).
		stderrIgnorePatterns: [/.*/],
	},
};

/**
 * CLI adapter config for the `claude` CLI (claude-code harness type).
 *
 * Key design decisions:
 * - No ANTHROPIC_API_KEY in envMap: claude uses its own installed auth (via HOME).
 *   Injecting our key would shadow the user's configured auth and break the
 *   intended "installed harness brings its own credentials" pattern (mirrors
 *   codex reading ~/.codex/auth.json — we don't inject OpenAI keys there either).
 * @lore claude-cli-adapter: envMap is empty intentionally — claude authenticates
 * via ~/.claude/ credentials installed by `claude login`. Injecting ANTHROPIC_API_KEY
 * would shadow the user's configured auth, potentially breaking enterprise/SSO setups.
 * - returnEnforcementChannel: "settings-claude" — provisionReturnHook writes
 *   .claude/settings.json + return-check.sh Stop hook before the subprocess starts.
 * - eventDialect: "claude-stream-json" — triggers preMapClaudeEvent pre-map in
 *   parseStdoutLine so assistant/result/system lines become canonical events.
 * - --mcp-config .mcp.json: session-provisioning.ts writes this file in claude-native
 *   format ({mcpServers:{hyperidle:{type:"http",url}}}) for every MCP session.
 *   No dialect entry in writeCliMcpConfig needed — claude uses its own format.
 */
const CLAUDE_CLI_CONFIG: CliAdapterConfig = {
	binary: "claude",
	// @lore claude-cli-adapter: `-p <prompt>` is the headless prompt flag;
	// `--output-format stream-json --verbose` emits one JSON object per line;
	// `--model {{model}}` sets the model; `--mcp-config .mcp.json` wires MCP;
	// `--strict-mcp-config` enforces MCP config (no auto-discovery from other dirs);
	// @lore AR2-latent-bug: `--mcp-config .mcp.json --strict-mcp-config` is passed
	// UNCONDITIONALLY — claude crashes "MCP config file not found" whenever no
	// `.mcp.json` was written (i.e. a session provisioned with NO MCP bridge).
	// Production masks this because server-factory always supplies a bridge so
	// provisionSession always writes `.mcp.json`. A no-bridge session would crash
	// identically. AR2 (the provisionSession-seam WP) owns the fix: make these args
	// conditional on a bridge being provisioned, or always write a (possibly empty)
	// `.mcp.json`. NOT fixed in AR1 (test-honesty scope only). This surfaced when
	// AR1 un-skipped session-provisioning.integration.test.ts, which now wires the
	// bridge into its deps so `.mcp.json` exists and the real claude run completes.
	// `--permission-mode bypassPermissions` allows all tool calls without prompts;
	// `--settings .claude/settings.json` loads the session-provisioned settings
	// (which includes the return-check.sh Stop hook).
	args: [
		"-p",
		"{{prompt}}",
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
	// No API key injection — claude uses its own installed auth via HOME.
	envMap: {},
	eventFormat: "ndjson",
	// PATH + HOME needed for binary resolution and credential loading.
	// LANG for locale-sensitive output correctness.
	// @lore claude-cli-adapter macos-keychain-auth: USER + LOGNAME are REQUIRED for
	// claude's claude.ai OAuth (the default Max/Pro login). On macOS the token lives in
	// the login Keychain, not a file; the Security framework needs USER/LOGNAME to
	// resolve the keychain user. With only [PATH,HOME,LANG] the real binary returns
	// `authentication_failed — "Not logged in"`. PROVEN via live smoke against
	// claude 2.1.170: adding USER+LOGNAME → real turn completes (total_cost_usd>0).
	envAllowlist: ["PATH", "HOME", "LANG", "USER", "LOGNAME"],
	// returnEnforcementChannel: settings-claude — provisionReturnHook writes
	// .claude/settings.json + return-check.sh Stop hook before session start.
	returnEnforcementChannel: "settings-claude",
	// Dialect tag — triggers preMapClaudeEvent in parseStdoutLine.
	eventDialect: "claude-stream-json",
};

/**
 * CLI adapter config for the `cursor-agent` binary (cursor-agent harness type).
 *
 * @lore AW1: cursor-agent exposes headless `--print --output-format stream-json`
 * with the same event shapes as claude (assistant/result/system). Auth is inherited
 * via Cursor login — no API key in envMap. `--trust` + `--approve-mcps` allow
 * headless workspace + MCP without interactive prompts.
 */
const CURSOR_AGENT_CLI_CONFIG: CliAdapterConfig = {
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
 *
 * @lore X5: Each CLI tool gets its own harnessType (the binary name) so an
 * agent's harnessType: "opencode" selection is unambiguous. A generic "cli" type
 * was considered but rejected — the founder chose a specific tool for a reason.
 */
async function registerCliAdaptersIfAvailable(
	pool: AdapterPool,
	enforcement?: EnforcementRegistry,
): Promise<void> {
	const maxConcurrent = Number.parseInt(process.env.HYPERIDLE_LOCAL_MAX_CONCURRENT ?? "2", 10);

	for (const [name, config] of Object.entries(CLI_TOOL_CONFIGS)) {
		const available = await CliHarnessAdapter.checkAvailability(config.binary);
		if (available) {
			const adapter = new CliHarnessAdapter(config, { enforcement });
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
 * 1. claude-code (CliHarnessAdapter, binary `claude`) — registered if on PATH
 * 2. builtin (BuiltinHarnessAdapter stub) — always registered (X6 fills in)
 * 3. codex / opencode — registered if their binary is on PATH
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
 *
 * @lore AM2: `discoverLocalHarnesses` intentionally does NOT run the session
 * probe in production discovery yet. CLI capabilities (fileEditing, toolUse)
 * therefore stay gated to `false` until AM3 wires the probe into the discovery
 * pipeline. This is intentional substrate scoping — not a bug. AM3 will call
 * `probeHarnessSession` per family and merge the probe result into the
 * HarnessCapabilityDescriptor before pool registration.
 *
 * @lore claude-cli-adapter: modelProviders is set to ["anthropic"] in the
 * registration metadata (not from getCapabilities().modelProviders which returns
 * []). AdapterPool.select() reads entry.meta.modelProviders — the registration
 * info — so anthropic-provider sessions correctly select the claude adapter.
 */
export async function createLocalAdapterPool(opts?: {
	enforcement?: EnforcementRegistry;
}): Promise<AdapterPool> {
	const discoveries = await discoverLocalHarnesses();
	const pool = new AdapterPool(discoveries);
	const maxConcurrent = Number.parseInt(process.env.HYPERIDLE_LOCAL_MAX_CONCURRENT ?? "4", 10);
	const enforcement = opts?.enforcement;

	// 1. claude-code adapter (CliHarnessAdapter, registered only if `claude` binary is on PATH)
	if (await CliHarnessAdapter.checkAvailability(CLAUDE_CLI_CONFIG.binary)) {
		pool.register("local-claude-code", new CliHarnessAdapter(CLAUDE_CLI_CONFIG, { enforcement }), {
			name: "Claude Code",
			kind: "local",
			type: "claude-code",
			// @lore claude-cli-adapter: modelProviders here is registration metadata read
			// by AdapterPool.select() — not the adapter's getCapabilities().modelProviders
			// (which returns []). Setting ["anthropic"] allows anthropic-provider sessions
			// to select this adapter via the modelProviders filter.
			modelProviders: ["anthropic"],
			maxConcurrent,
		});
	}

	// 1b. cursor-agent adapter (CliHarnessAdapter, registered only if binary is on PATH)
	if (await CliHarnessAdapter.checkAvailability(CURSOR_AGENT_CLI_CONFIG.binary)) {
		pool.register("local-cursor-agent", new CliHarnessAdapter(CURSOR_AGENT_CLI_CONFIG, { enforcement }), {
			name: "Cursor Agent",
			kind: "local",
			type: "cursor-agent",
			modelProviders: [],
			maxConcurrent,
		});
	}

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
	await registerCliAdaptersIfAvailable(pool, enforcement);

	return pool;
}
