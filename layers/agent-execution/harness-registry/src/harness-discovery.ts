import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type {
	HarnessAuthActionDescriptor,
	HarnessModelDescriptor,
	HarnessModelOptionDescriptor,
	HarnessReadinessState,
} from "@hyperidle/harness-capability";

const execFileAsync = promisify(execFile);

const ESC = String.fromCharCode(0x1b);
const ANSI_PATTERN = new RegExp(`${ESC}\\[[\\d;]*m`, "g");

function stripAnsi(value: string): string {
	return value.replace(ANSI_PATTERN, "");
}

// ---------------------------------------------------------------------------
// AV2 — CLI model parsers
// ---------------------------------------------------------------------------

/**
 * Parse `claude models` Markdown table output into HarnessModelDescriptors.
 *
 * Real-captured format (2026-07-06, /opt/homebrew/bin/claude models):
 *   | Model | ID | Context | In $/1M | Out $/1M |
 *   |---|---|---|---|---|
 *   | **Fable 5** | `claude-fable-5` | 1M | $10 | $50 |
 *
 * Columns: Model (friendly label) | ID (backtick-wrapped) | Context | ...
 * Context values: "1M" → 1_000_000, "200K" → 200_000, numeric string → parseInt.
 *
 * @lore AV2: The claude CLI's `models` subcommand outputs a Markdown table with
 * the harness's OWN bundled catalog. This is honest discovery (the harness tells
 * us what models it supports), NOT a relabelling of MODEL_CATALOG.
 * Real output captured 2026-07-06 from /opt/homebrew/bin/claude models.
 */
function parseClaudeCatalog(output: string): HarnessModelDescriptor[] {
	const models: HarnessModelDescriptor[] = [];
	const lines = output.split("\n");

	// Find the table header line: | Model | ID | Context | ...
	let tableStarted = false;
	let headerSkipped = false;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line.startsWith("|")) continue;

		// Detect header row (contains "Model" and "ID" columns)
		if (!tableStarted) {
			if (/\|\s*Model\s*\|/.test(line) && /\|\s*ID\s*\|/.test(line)) {
				tableStarted = true;
			}
			continue;
		}

		// Skip separator row (|---|---|---|...)
		if (!headerSkipped) {
			if (/^\|[-\s|]+\|$/.test(line)) {
				headerSkipped = true;
			}
			continue;
		}

		// Skip empty or separator rows
		if (/^\|[-\s|]+\|$/.test(line)) continue;

		// Parse data row: | Model | `id` | Context | ... |
		const cells = line
			.split("|")
			.filter((_, i) => i > 0) // remove leading empty from split
			.slice(0, -1) // remove trailing empty
			.map((c) => c.trim());

		if (cells.length < 3) continue;

		// Column 0: friendly label (strip ** bold markers)
		const rawLabel = cells[0] ?? "";
		const label = rawLabel.replace(/\*\*/g, "").trim();
		if (!label) continue;

		// Column 1: model ID (strip backticks)
		const rawId = cells[1] ?? "";
		const id = rawId.replace(/`/g, "").trim();
		if (!id) continue;

		// Column 2: context window
		const rawContext = (cells[2] ?? "").trim();
		const contextWindow = parseContextWindow(rawContext);

		models.push({
			id,
			label,
			provider: "anthropic",
			contextWindow,
			selectable: true,
			inheritedFromGateway: false,
			options: [CLAUDE_EFFORT_OPTION],
		});
	}

	return models;
}

/**
 * The effort levels `claude --effort` accepts, from `claude --help` (2.1.220).
 *
 * A compile-time list, unlike every other harness here: `claude models` does not
 * publish per-model options, and the flag is session-level rather than
 * per-model, so every discovered claude model declares the same set.
 *
 * @lore An older `claude` treats `--effort` as an unknown option and exits
 * non-zero, which the adapter reports as a crashed session. The option is
 * offered unconditionally, so someone on an older binary is offered a control
 * that kills their runs. Accepted: an agent with nothing configured sends
 * nothing, so only an agent explicitly configured with an effort is exposed.
 */
const CLAUDE_EFFORT_OPTION: HarnessModelOptionDescriptor = {
	key: "effort",
	label: "Effort",
	helpText: "How much the model works before answering.",
	control: {
		kind: "select",
		choices: [
			{ value: "low", label: "low" },
			{ value: "medium", label: "medium" },
			{ value: "high", label: "high" },
			{ value: "xhigh", label: "xhigh" },
			{ value: "max", label: "max" },
		],
	},
	required: false,
};

/**
 * The variant option an opencode model declares.
 *
 * `opencode models --verbose` publishes a per-model `variants` map whose keys
 * are the selectable variant names and whose values are the provider config
 * each one applies. Verified live 2026-08-25: 146 of 363 models publish one, and
 * the lists genuinely differ per model.
 *
 * @lore opencode SILENTLY IGNORES an unknown `--variant`, so there is no way to
 * prove a bad value was rejected — unlike claude, whose binary names the flag
 * back. Its evidence is therefore weaker than the other harnesses', and that is
 * a fact about opencode rather than a gap in the tests.
 */
function opencodeModelOptions(
	parsed: Record<string, unknown>,
): readonly HarnessModelOptionDescriptor[] {
	const variants = parsed.variants;
	if (typeof variants !== "object" || variants === null || Array.isArray(variants)) return [];
	const names = Object.keys(variants);
	if (names.length === 0) return [];
	return [
		{
			key: "variant",
			label: "Variant",
			helpText: "The provider settings this model runs with.",
			control: { kind: "select", choices: names.map((name) => ({ value: name, label: name })) },
			required: false,
		},
	];
}

/** Map an opencode providerID string to a valid ModelProvider or undefined. */
function mapOpencodeProvider(
	raw: string,
): "anthropic" | "openrouter" | "openai-compatible" | undefined {
	// @lore AV2: opencode is a multi-provider aggregator; providerID values
	// like "opencode", "anthropic", "openrouter" etc. come from the JSON.
	// HarnessModelDescriptor.provider is a closed ModelProvider union —
	// only "anthropic"/"openrouter"/"openai-compatible" are valid. We map
	// known values and omit unknown ones (optional field).
	if (raw === "anthropic") return "anthropic";
	if (raw === "openrouter") return "openrouter";
	if (raw === "openai-compatible") return "openai-compatible";
	return undefined;
}

/** Parse a single opencode JSON blob into a HarnessModelDescriptor, or null if invalid. */
function parseOpencodeModelJson(raw: string): HarnessModelDescriptor | null {
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const id = typeof parsed.id === "string" ? parsed.id : undefined;
		const name = typeof parsed.name === "string" ? parsed.name : (id ?? "");
		if (!id) return null;
		const limitObj = parsed.limit as Record<string, unknown> | undefined;
		const contextWindow = typeof limitObj?.context === "number" ? limitObj.context : 0;
		const rawProvider = typeof parsed.providerID === "string" ? parsed.providerID : "";
		const provider = mapOpencodeProvider(rawProvider);
		return {
			id,
			label: name,
			...(provider !== undefined ? { provider } : {}),
			contextWindow,
			selectable: true,
			inheritedFromGateway: false,
			options: opencodeModelOptions(parsed),
		};
	} catch {
		return null;
	}
}

/**
 * Parse `opencode models --verbose` output into HarnessModelDescriptors.
 *
 * Real-captured format (2026-07-06):
 *   opencode/big-pickle\n{json}\nopencode/deepseek-v4-flash-free\n{json}\n...
 *
 * Each model: a "provider/id" header line followed by a JSON object.
 * The JSON has: id, name, limit.context (optional).
 *
 * @lore AV2: opencode models --verbose outputs one JSON block per model,
 * prefixed with a "provider/id" identifier line. The JSON body carries
 * the model's metadata. Real output captured 2026-07-06 from opencode models --verbose.
 */
function parseOpenCodeCatalog(output: string): HarnessModelDescriptor[] {
	const models: HarnessModelDescriptor[] = [];
	if (!output.trim()) return models;

	// Each model: header line "provider/id" followed by a JSON block
	// Strategy: find "word/word" header lines, then collect JSON until next header
	const headerRe = /^\S+\/\S+\s*$/;
	const lines = output.split("\n");

	let jsonLines: string[] = [];

	const flushJson = (): void => {
		if (jsonLines.length === 0) return;
		const raw = jsonLines.join("\n").trim();
		jsonLines = [];
		if (!raw) return;
		const descriptor = parseOpencodeModelJson(raw);
		if (descriptor) models.push(descriptor);
	};

	for (const line of lines) {
		const stripped = stripAnsi(line.trimEnd());
		if (headerRe.test(stripped)) {
			flushJson();
		} else if (stripped.startsWith("{") || jsonLines.length > 0) {
			jsonLines.push(stripped);
		}
	}
	flushJson();

	return models;
}

/** Parse a context window string like "1M", "200K", "128000" into an integer. */
function parseContextWindow(raw: string): number {
	const s = raw.trim().toUpperCase();
	if (s.endsWith("M")) {
		const n = Number.parseFloat(s.slice(0, -1));
		return Number.isNaN(n) ? 0 : Math.round(n * 1_000_000);
	}
	if (s.endsWith("K")) {
		const n = Number.parseFloat(s.slice(0, -1));
		return Number.isNaN(n) ? 0 : Math.round(n * 1_000);
	}
	const n = Number.parseInt(s, 10);
	return Number.isNaN(n) ? 0 : n;
}

/**
 * Timeout (ms) for the builtin /models network fetch.
 *
 * @lore AV2 Build Obligation 1: The fetch runs inside discoverLocalHarnesses's
 * Promise.all. A gateway reject/hang MUST degrade to models:[] without rejecting
 * the whole discovery batch. Wrap in AbortController with this timeout.
 */
const BUILTIN_MODELS_FETCH_TIMEOUT_MS = 10_000;

/**
 * AC5 result of the harmless real one-shot session probe.
 * `runtimeFromDiscovery` only sets fileEditing/toolUse `true` when
 * `sessionProbe?.ok === true` — auth status alone proves login, NOT launchability.
 */
interface HarnessSessionProbeResult {
	readonly ok: boolean;
	readonly family: "codex" | "claude-code" | "opencode";
	/** First captured usage-bearing event line; committed as a fixture for AC6. */
	readonly capturedLine?: string;
	/** Parsed native event type, e.g. "turn.completed" | "result". */
	readonly eventType?: string;
	/** Precise reason when ok === false (binary absent / not authed / launch failed). */
	readonly reason?: string;
}

/** @lore AM2: This type intentionally mirrors no shared type exactly; it is the
 *  private probe result that the descriptor builder maps into the public
 *  `HarnessDiscoveryStatus` / `HarnessCapabilityDescriptor`. Keeping it local
 *  prevents leaking discovery internals into the shared contract. */
interface HarnessDiscoveryInput {
	readonly state: HarnessReadinessState;
	readonly version?: string;
	readonly reason?: string;
	readonly authAction?: HarnessAuthActionDescriptor;
	readonly models?: readonly HarnessModelDescriptor[];
	/**
	 * AC5: result of the harmless real one-shot session probe. `runtimeFromDiscovery`
	 * only sets fileEditing/toolUse `true` when `sessionProbe?.ok === true` — auth status
	 * alone proves login, NOT launchability. Absent ⇒ no session probe ran ⇒ caps stay false.
	 */
	readonly sessionProbe?: HarnessSessionProbeResult;
}

interface HarnessDiscoveryResult {
	readonly builtin: HarnessDiscoveryInput;
	readonly codex: HarnessDiscoveryInput;
	readonly "claude-code": HarnessDiscoveryInput;
	readonly opencode: HarnessDiscoveryInput;
	readonly "cursor-agent": HarnessDiscoveryInput;
}

interface HarnessProbeDeps {
	/**
	 * Injected command runner. Defaults to `execFile`ing the first element with the
	 * rest as args. Tests provide a stub so unit tests never touch the filesystem.
	 */
	readonly run?: (
		args: readonly string[],
		context?: {
			readonly cwd: string;
			readonly env: NodeJS.ProcessEnv;
			readonly signal: AbortSignal;
		},
	) => Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }>;
	/** Environment used for built-in credential checks and passed to real binary executions. */
	readonly env?: NodeJS.ProcessEnv;
	/**
	 * Working directory for real binary invocations. Ignored when `run` is
	 * injected. Defaults to process.cwd().
	 *
	 * @lore AU36: the `.mcp.json`-for-`claude mcp list` example left with the
	 * reach probes (now `@hyperidle/connections`' `createInheritedReach`).
	 */
	readonly cwd?: string;
	/**
	 * AV2 Build Obligation 1: Injectable fetch for the builtin /models HTTP call.
	 * Real code uses `globalThis.fetch`; unit tests inject a stub.
	 * Signature compatible with the browser/Node Fetch API.
	 *
	 * @lore AV2: The fetch is isolated here so unit tests never need a live gateway.
	 * The production path uses the globally available fetch (Node 18+).
	 */
	readonly fetchModels?: (
		url: string,
		opts: { signal: AbortSignal },
	) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
	/**
	 * Injectable reader for codex's own model cache, so unit tests never read the
	 * real home directory. Returns the file's text, or null when there is none.
	 */
	readonly readCodexModelCache?: () => Promise<string | null>;
}

const HARNESS_COMMAND_TIMEOUT_MS = 15_000;

function failedCommandResult(err: unknown): {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
} {
	if (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		"stdout" in err &&
		"stderr" in err
	) {
		return {
			stdout: stripAnsi(String((err as { stdout?: unknown }).stdout ?? "")),
			stderr: stripAnsi(String((err as { stderr?: unknown }).stderr ?? "")),
			exitCode:
				typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1,
		};
	}
	return { stdout: "", stderr: stripAnsi(String(err)), exitCode: 1 };
}

async function runCommand(
	args: readonly string[],
	d?: HarnessProbeDeps,
): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }> {
	const env = d?.env ?? process.env;
	const cwd = resolve(d?.cwd ?? process.cwd());
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const runner = d?.run;
	try {
		const command = (
			runner
				? Promise.resolve(runner(args, { cwd, env, signal: controller.signal }))
				: execFileAsync(args[0] ?? "", args.slice(1), {
						cwd,
						env,
						signal: controller.signal,
					}).then(({ stdout, stderr }) => ({ stdout, stderr, exitCode: 0 }))
		)
			.then(({ stdout, stderr, exitCode }) => ({
				stdout: stripAnsi(stdout),
				stderr: stripAnsi(stderr),
				exitCode,
			}))
			.catch(failedCommandResult);
		const timeout = new Promise<{
			readonly stdout: string;
			readonly stderr: string;
			readonly exitCode: number;
		}>((resolveTimeout) => {
			timer = setTimeout(() => {
				controller.abort();
				resolveTimeout({ stdout: "", stderr: "Command timed out.", exitCode: 1 });
			}, HARNESS_COMMAND_TIMEOUT_MS);
		});
		return await Promise.race([command, timeout]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

export type { HarnessDiscoveryInput, HarnessDiscoveryResult, HarnessSessionProbeResult };

/**
 * The models codex can run, read from codex's own cache.
 *
 * Codex publishes no model list — no subcommand, nothing in its shell
 * completions, and `codex doctor` reports no server model. What it does keep is
 * `~/.codex/models_cache.json`, which it refreshes itself and scopes to the
 * signed-in account (it carries an etag). That file is the only enumeration
 * there is, and it is the reason codex can offer per-model options at all.
 *
 * @lore A hardcoded list was the obvious alternative and is simply WRONG, not
 * merely brittle: verified 2026-08-25, `gpt-5.4` accepts four reasoning levels
 * while `gpt-5.6-sol` accepts six including `ultra`. One flat list would offer
 * `max` on a model that rejects it and hide `ultra` on one that takes it.
 *
 * The cost, accepted deliberately: this reads another tool's private file whose
 * shape is not a contract and is version-dependent — the cache records the
 * client that wrote it, and codex refuses a cache written by a different
 * version. So EVERY failure here degrades to silence: no models, no options,
 * exactly the behaviour codex had before. There is deliberately no fallback
 * list, because a fallback is how a wrong list ships anyway.
 */
function parseCodexModelCache(raw: string): readonly HarnessModelDescriptor[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (typeof parsed !== "object" || parsed === null) return [];
	const models = (parsed as { models?: unknown }).models;
	if (!Array.isArray(models)) return [];

	return models.flatMap((entry) => {
		if (typeof entry !== "object" || entry === null) return [];
		const m = entry as Record<string, unknown>;
		const slug = typeof m.slug === "string" ? m.slug : undefined;
		if (!slug) return [];
		// The file's own two flags decide what a person may pick.
		if (m.visibility !== "list" || m.supported_in_api !== true) return [];

		const levels = Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels : [];
		const choices = levels.flatMap((level) => {
			if (typeof level !== "object" || level === null) return [];
			const effort = (level as Record<string, unknown>).effort;
			if (typeof effort !== "string") return [];
			return [{ value: effort, label: effort }];
		});
		const defaultLevel = m.default_reasoning_level;
		const options: HarnessModelOptionDescriptor[] =
			choices.length === 0
				? []
				: [
						{
							key: "model_reasoning_effort",
							label: "Reasoning effort",
							helpText: "How much the model thinks before answering.",
							control: { kind: "select", choices },
							required: false,
							...(typeof defaultLevel === "string" ? { defaultValue: defaultLevel } : {}),
						},
					];

		return [
			{
				id: slug,
				label: typeof m.display_name === "string" ? m.display_name : slug,
				contextWindow: typeof m.context_window === "number" ? m.context_window : 0,
				selectable: true,
				inheritedFromGateway: false,
				options,
			} satisfies HarnessModelDescriptor,
		];
	});
}

/** Read codex's model cache from disk. Any failure means no models. */
async function readCodexModelsFromDisk(): Promise<string | null> {
	try {
		return await fs.readFile(resolve(homedir(), ".codex", "models_cache.json"), "utf8");
	} catch {
		return null;
	}
}

/**
 * Per-harness config for the table-driven CLI probe.
 * Each entry carries the auth command, login descriptor, and per-harness
 * auth-output interpretation — the config that MUST differ per harness, not
 * four hand-written probe function bodies.
 *
 * @lore Row 9 SIMPLIFY: the four probe functions (probeCodexCli,
 * probeClaudeCodeCli, inspectOpenCode, probeCursorAgentCli) were copy-paste
 * variations of one pattern. The per-harness logic lives in the table; the
 * driver (`probeCli`) is a single loop body.
 */
interface CliProbeConfig {
	readonly cli: string;
	readonly loginLabel: string;
	readonly loginCmd: readonly string[];
	readonly authCmd: readonly string[];
	/** Interprets auth command output → final HarnessDiscoveryInput (version already known). */
	readonly interpretAuth: (
		stdout: string,
		stderr: string,
		exitCode: number,
		d: HarnessProbeDeps | undefined,
		version: string,
		authAction: HarnessAuthActionDescriptor,
	) => Promise<HarnessDiscoveryInput>;
}

const CLI_PROBE_CONFIGS: readonly [CliProbeConfig, CliProbeConfig, CliProbeConfig, CliProbeConfig] =
	[
		{
			cli: "codex",
			loginLabel: "Log in to Codex",
			loginCmd: ["codex", "login"],
			authCmd: ["codex", "login", "status"],
			async interpretAuth(stdout, stderr, exitCode, _d, version, authAction) {
				const authText = stdout.trim() || stderr.trim();
				if (authText.startsWith("Logged in using")) {
					const raw = await (_d?.readCodexModelCache ?? readCodexModelsFromDisk)();
					const models = raw === null ? [] : parseCodexModelCache(raw);
					return { state: "ready", version, models, authAction };
				}
				if (authText.startsWith("Not logged in") || exitCode !== 0) {
					return {
						state: "unauthenticated",
						version,
						reason: "codex CLI is installed but not authenticated. Run `codex login`.",
						authAction,
					};
				}
				return {
					state: "installed",
					version,
					reason: `codex auth state could not be parsed. Observed stdout: ${authText.slice(0, 120)}`,
					authAction,
				};
			},
		},
		{
			cli: "claude",
			loginLabel: "Log in to Claude Code",
			loginCmd: ["claude", "auth", "login"],
			authCmd: ["claude", "auth", "status"],
			async interpretAuth(stdout, _stderr, exitCode, d, version, authAction) {
				if (exitCode !== 0) {
					return {
						state: "installed",
						version,
						reason: "claude CLI is installed but `claude auth status` failed.",
						authAction,
					};
				}
				try {
					const parsed = JSON.parse(stdout) as { loggedIn?: boolean };
					if (parsed.loggedIn === true) {
						// AV2: run `claude models` to discover available models.
						// ⚠️ UNVERIFIED — `claude models` exits 0 with a Markdown table
						// (captured 2026-07-06 from /opt/homebrew/bin/claude models).
						let models: readonly HarnessModelDescriptor[] = [];
						try {
							const modelsResult = await runCommand(["claude", "models"], d);
							if (modelsResult.exitCode === 0 && modelsResult.stdout.trim()) {
								models = parseClaudeCatalog(modelsResult.stdout);
							}
						} catch {
							// degraded gracefully — models stays []
						}
						return { state: "ready", version, models, authAction };
					}
					if (parsed.loggedIn === false) {
						return {
							state: "unauthenticated",
							version,
							reason: "claude CLI is installed but not authenticated. Run `claude auth login`.",
							authAction,
						};
					}
				} catch {
					// fall through
				}
				return {
					state: "installed",
					version,
					reason: "claude auth status returned unparsable output.",
					authAction,
				};
			},
		},
		{
			cli: "opencode",
			loginLabel: "Log in to OpenCode",
			loginCmd: ["opencode", "providers", "login"],
			authCmd: ["opencode", "providers", "list"],
			/**
			 * @lore AV2: `opencode models --verbose` outputs one JSON block per model
			 * (real format captured 2026-07-06). Run when providers are configured.
			 * Failure degrades to models:[] — never throws.
			 */
			async interpretAuth(stdout, _stderr, exitCode, d, version, authAction) {
				if (exitCode !== 0) {
					return {
						state: "installed",
						version,
						reason: "opencode CLI is installed but `opencode providers list` failed.",
						authAction,
					};
				}
				const hasCredentials =
					/\d+\s+credentials/.test(stdout) || stdout.includes("environment variable");
				if (hasCredentials) {
					// AV2: run `opencode models --verbose` to discover available models.
					// ⚠️ UNVERIFIED — format captured 2026-07-06 from `opencode models --verbose`.
					let models: readonly HarnessModelDescriptor[] = [];
					try {
						const modelsResult = await runCommand(["opencode", "models", "--verbose"], d);
						if (modelsResult.exitCode === 0 && modelsResult.stdout.trim()) {
							models = parseOpenCodeCatalog(modelsResult.stdout);
						}
					} catch {
						// degraded gracefully — models stays []
					}
					return { state: "ready", version, models, authAction };
				}
				return {
					state: "unauthenticated",
					version,
					reason:
						"opencode CLI is installed but no providers are configured. Run `opencode providers login`.",
					authAction,
				};
			},
		},
		{
			cli: "cursor-agent",
			loginLabel: "Log in to Cursor",
			loginCmd: ["cursor-agent", "login"],
			authCmd: ["cursor-agent", "status"],
			async interpretAuth(stdout, stderr, exitCode, _d, version, authAction) {
				const authText = stdout.trim() || stderr.trim();
				if (authText.includes("Logged in")) return { state: "ready", version, authAction };
				if (exitCode !== 0 || authText.includes("Not logged in")) {
					return {
						state: "unauthenticated",
						version,
						reason:
							"cursor-agent CLI is installed but not authenticated. Run `cursor-agent login`.",
						authAction,
					};
				}
				return {
					state: "installed",
					version,
					reason: `cursor-agent auth state could not be parsed. Observed stdout: ${authText.slice(0, 120)}`,
					authAction,
				};
			},
		},
	];

/** Single driver for all CLI harness probes — config table above carries per-harness logic. */
async function probeCli(
	config: CliProbeConfig,
	d?: HarnessProbeDeps,
): Promise<HarnessDiscoveryInput> {
	const versionResult = await runCommand([config.cli, "--version"], d);
	if (versionResult.exitCode !== 0) {
		return { state: "missing", reason: `${config.cli} CLI is not installed or not on PATH.` };
	}
	const version = versionResult.stdout.trim().split("\n")[0]?.trim() ?? "";
	const authAction: HarnessAuthActionDescriptor = {
		kind: "native_cli_login",
		label: config.loginLabel,
		command: config.loginCmd,
	};
	const authResult = await runCommand(config.authCmd, d);
	return config.interpretAuth(
		authResult.stdout,
		authResult.stderr,
		authResult.exitCode,
		d,
		version,
		authAction,
	);
}

/**
 * @lore AM2 AC3/AC5 CRITICAL FIX: `probeBuiltinGateway` now checks the full
 * ordered gateway-usable credential set instead of only ANTHROPIC_API_KEY.
 * The gateway's callLlm() supports three provider paths:
 *   - "anthropic"         → ANTHROPIC_API_KEY (direct Anthropic Messages API)
 *   - "openai-compatible" → OPENAI_API_KEY / openai_compatible_api_key
 *   - "openrouter"        → OPENROUTER_API_KEY
 * On this machine OPENAI_API_KEY is present — the original single-key check
 * always returned `unauthenticated` here, breaking AC3/AC5 discovery.
 *
 * AV2: Now async — fetches the provider's /models endpoint when a key is present.
 * Build Obligation 1: the fetch is timeout-bounded (BUILTIN_MODELS_FETCH_TIMEOUT_MS)
 * and failure-isolated (try/catch → models:[]). `fetchModels` is injectable for
 * unit tests so no live HTTP hit is required in tests.
 *
 * ⚠️ UNVERIFIED endpoint response shapes — confirmed against:
 * - OpenRouter: https://openrouter.ai/docs/api-reference/list-available-models (no auth)
 * - Anthropic: https://docs.anthropic.com/en/api/models-list (x-api-key + anthropic-version)
 * - openai-compatible: standard OpenAI /v1/models (bearer auth, data[].id only)
 */
async function probeBuiltinGateway(d?: HarnessProbeDeps): Promise<HarnessDiscoveryInput> {
	const env = d?.env ?? process.env;

	// Ordered set of gateway-usable credentials (priority: Anthropic → OpenAI-compatible → OpenRouter)
	const credentialCandidates: Array<{
		envKey: string;
		credentialName: string;
		label: string;
		provider: "anthropic" | "openrouter" | "openai-compatible";
		fetchModels: (
			apiKey: string,
			fetchFn: HarnessProbeDeps["fetchModels"],
		) => Promise<readonly HarnessModelDescriptor[]>;
	}> = [
		{
			envKey: "ANTHROPIC_API_KEY",
			credentialName: "anthropic_api_key",
			label: "Enter Anthropic API key",
			provider: "anthropic",
			fetchModels: async (apiKey, fetchFn) => fetchAnthropicModels(apiKey, fetchFn),
		},
		{
			envKey: "OPENAI_API_KEY",
			credentialName: "openai_compatible_api_key",
			label: "Enter OpenAI-compatible API key",
			provider: "openai-compatible",
			fetchModels: async () => [],
		},
		{
			envKey: "OPENROUTER_API_KEY",
			credentialName: "openrouter_api_key",
			label: "Enter OpenRouter API key",
			provider: "openrouter",
			fetchModels: async (_apiKey, fetchFn) => fetchOpenRouterModels(fetchFn),
		},
	];

	const matched = credentialCandidates.find((c) => Boolean(env[c.envKey]));

	if (matched) {
		// AV2: failure-isolated model fetch (Build Obligation 1)
		let models: readonly HarnessModelDescriptor[] = [];
		try {
			const apiKey = env[matched.envKey] ?? "";
			models = await matched.fetchModels(apiKey, d?.fetchModels);
		} catch {
			// degraded gracefully — models stays []
		}

		return {
			state: "ready",
			models,
			authAction: {
				kind: "enter_api_key",
				label: matched.label,
				description: "Store a model gateway API key in HyperIdle.",
				credentialNames: [
					matched.credentialName,
					"openrouter_api_key",
					"openai_compatible_api_key",
				],
			},
		};
	}

	const checkedList = credentialCandidates.map((c) => c.envKey).join(", ");
	return {
		state: "unauthenticated",
		reason: `Built-in gateway has no usable credential. Checked: ${checkedList}.`,
		authAction: {
			kind: "enter_api_key",
			label: "Enter API key",
			description: "Store a model gateway API key in HyperIdle.",
			credentialNames: ["anthropic_api_key", "openai_compatible_api_key", "openrouter_api_key"],
		},
	};
}

/** AV2: Fetch Anthropic model list via GET https://api.anthropic.com/v1/models */
async function fetchAnthropicModels(
	_apiKey: string,
	fetchFn?: HarnessProbeDeps["fetchModels"],
): Promise<readonly HarnessModelDescriptor[]> {
	const doFetch = fetchFn ?? defaultFetch;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), BUILTIN_MODELS_FETCH_TIMEOUT_MS);
	try {
		const resp = await doFetch("https://api.anthropic.com/v1/models", {
			signal: controller.signal,
		});
		if (!resp.ok) return [];
		const body = await resp.json();
		const data = (body as { data?: unknown[] }).data;
		if (!Array.isArray(data)) return [];
		return data.flatMap((item) => {
			if (typeof item !== "object" || item === null) return [];
			const m = item as Record<string, unknown>;
			const id = typeof m.id === "string" ? m.id : undefined;
			if (!id) return [];
			const label = typeof m.display_name === "string" ? m.display_name : id;
			const contextWindow = typeof m.max_input_tokens === "number" ? m.max_input_tokens : 0;
			return [
				{
					id,
					label,
					provider: "anthropic" as const,
					contextWindow,
					selectable: true,
					inheritedFromGateway: true,
					options: [],
				} satisfies HarnessModelDescriptor,
			];
		});
	} finally {
		clearTimeout(timer);
	}
}

/** AV2: Fetch OpenRouter model list via GET https://openrouter.ai/api/v1/models (no auth) */
/**
 * The reasoning-effort option a model declares, from OpenRouter's own catalogue.
 *
 * The catalogue publishes each model's `reasoning.supported_efforts` and its
 * `reasoning.default_effort`. A model that publishes no efforts declares no
 * option — most do not — and the editor then shows nothing for it.
 *
 * @lore Verified live 2026-08-25: of 418 catalogued models, 143 publish
 * `reasoning_effort`. The value carries through to OpenRouter's native endpoint,
 * which rejects an invalid one with HTTP 400 naming the parameter — see
 * `builtin-model-options.integration.test.ts`.
 */
function openRouterModelOptions(
	model: Record<string, unknown>,
): readonly HarnessModelOptionDescriptor[] {
	const reasoning = model.reasoning as Record<string, unknown> | undefined;
	const efforts = reasoning?.supported_efforts;
	if (!Array.isArray(efforts) || efforts.length === 0) return [];
	const choices = efforts
		.filter((effort): effort is string => typeof effort === "string")
		.map((effort) => ({ value: effort, label: effort }));
	if (choices.length === 0) return [];
	const defaultEffort = reasoning?.default_effort;
	return [
		{
			key: "reasoning_effort",
			label: "Reasoning effort",
			helpText: "How much the model thinks before answering.",
			control: { kind: "select", choices },
			required: false,
			...(typeof defaultEffort === "string" ? { defaultValue: defaultEffort } : {}),
		},
	];
}

async function fetchOpenRouterModels(
	fetchFn?: HarnessProbeDeps["fetchModels"],
): Promise<readonly HarnessModelDescriptor[]> {
	const doFetch = fetchFn ?? defaultFetch;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), BUILTIN_MODELS_FETCH_TIMEOUT_MS);
	try {
		const resp = await doFetch("https://openrouter.ai/api/v1/models", {
			signal: controller.signal,
		});
		if (!resp.ok) return [];
		const body = await resp.json();
		const data = (body as { data?: unknown[] }).data;
		if (!Array.isArray(data)) return [];
		return data.flatMap((item) => {
			if (typeof item !== "object" || item === null) return [];
			const m = item as Record<string, unknown>;
			const id = typeof m.id === "string" ? m.id : undefined;
			if (!id) return [];
			const label = typeof m.name === "string" ? m.name : id;
			const contextWindow = typeof m.context_length === "number" ? m.context_length : 0;
			return [
				{
					id,
					label,
					provider: "openrouter" as const,
					contextWindow,
					selectable: true,
					inheritedFromGateway: true,
					options: openRouterModelOptions(m),
				} satisfies HarnessModelDescriptor,
			];
		});
	} finally {
		clearTimeout(timer);
	}
}

/** Default fetch implementation — uses globalThis.fetch (Node 18+). */
function defaultFetch(
	url: string,
	opts: { signal: AbortSignal },
): Promise<{ ok: boolean; json: () => Promise<unknown> }> {
	// @lore AV2: globalThis.fetch is Node 18+ built-in. We do not import node-fetch
	// to stay zero-new-dep. The injectable fetchModels in HarnessProbeDeps lets unit
	// tests avoid live HTTP without mocking globalThis.
	return globalThis.fetch(url, opts) as Promise<{ ok: boolean; json: () => Promise<unknown> }>;
}

/**
 * Probe the local environment for the first-class harness families AM2 cares about.
 *
 * @lore AM2: This probes public, non-destructive commands only (version, auth status,
 *  providers list). It never reads provider credential files and never starts an agent
 *  session.
 *
 * @lore AU36: the four inherited-reach probes (claude/codex/opencode MCP-config
 * readers + the `gh` CLI probe) and their post-probe merge are GONE from this
 * function — reach moved into the connections domain (`@hyperidle/connections`'
 * `createInheritedReach`), wired at the composition roots. Discovery keeps its
 * real job: harness readiness, version, auth state, models, runtime caps.
 */
export async function discoverLocalHarnesses(
	d?: HarnessProbeDeps,
): Promise<HarnessDiscoveryResult> {
	// Run probes concurrently — they are independent filesystem probes.
	const [builtin, codex, claudeCode, opencode, cursorAgent] = await Promise.all([
		probeBuiltinGateway(d),
		probeCli(CLI_PROBE_CONFIGS[0], d), // codex
		probeCli(CLI_PROBE_CONFIGS[1], d), // claude-code
		probeCli(CLI_PROBE_CONFIGS[2], d), // opencode
		probeCli(CLI_PROBE_CONFIGS[3], d), // cursor-agent
	]);

	return {
		builtin,
		codex,
		"claude-code": claudeCode,
		opencode,
		"cursor-agent": cursorAgent,
	};
}
