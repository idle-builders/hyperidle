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
// CLI model parsers
// ---------------------------------------------------------------------------

/**
 * The models claude can run, from claude's own `/model` command.
 *
 * `claude -p "/model" --output-format json` is answered locally by the CLI: the
 * captured response carries `total_cost_usd: 0`, `duration_api_ms: 0` and an
 * empty `modelUsage`, so listing costs nothing and needs no key. Its `result`
 * text names the current model and then the names `--model` accepts:
 *
 *   Current model: Opus 5 (1M context) (effort: high)
 *   Usage: /model <name>. Available: sonnet, opus, haiku, fable, best,
 *   sonnet[1m], opus[1m], fable[1m], opusplan, default, or a full model ID.
 *
 * @lore: claude model probe — `claude` has no `models` subcommand; `/model` answered locally; `default` dropped; every failure degrades to no models
 */
function parseClaudeModelCommand(output: string): HarnessModelDescriptor[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(output);
	} catch {
		return [];
	}
	if (typeof parsed !== "object" || parsed === null) return [];
	const result = (parsed as { result?: unknown }).result;
	if (typeof result !== "string") return [];

	// "… Available: a, b, c, or a full model ID." — the trailing prose after the
	// last comma is claude telling the reader a raw id also works, not a name.
	const available = /Available:\s*([^.]*)/.exec(result);
	const list = available?.[1];
	if (!list) return [];

	const seen = new Set<string>();
	const models: HarnessModelDescriptor[] = [];
	for (const raw of list.split(",")) {
		const name = raw.trim();
		if (!name) continue;
		if (name.includes(" ")) continue; // "or a full model ID"
		if (name === "default") continue;
		if (seen.has(name)) continue;
		seen.add(name);
		models.push({
			id: name,
			label: name,
			provider: "anthropic",
			// claude publishes no per-model context window here. Zero means unknown,
			// the same value the codex reader uses when its cache omits one.
			contextWindow: 0,
			selectable: true,
			options: [CLAUDE_EFFORT_OPTION],
		});
	}
	return models;
}

/**
 * The models cursor-agent can run, from `cursor-agent --list-models`.
 *
 * The answer is account-scoped and plain text — `--list-models` ignores
 * `--output-format`, so there is no JSON form to prefer:
 *
 *   Available models
 *
 *   auto - Auto (default)
 *   composer-2.5 - Composer 2.5
 *   gpt-5.2 - GPT-5.2 (current)
 *   …
 *   Tip: use --model <id> …
 *
 * The ` (current)` / ` (default)` suffix moves between probes and is stripped from the label.
 * `auto` is dropped (hands choice back to harness). Cursor publishes no machine-readable option list.
 * Verified 2026-08-27 against a signed-in account.
 */
function parseCursorModelList(output: string): HarnessModelDescriptor[] {
	const models: HarnessModelDescriptor[] = [];
	const seen = new Set<string>();
	for (const rawLine of output.split("\n")) {
		const line = rawLine.trim();
		const match = /^([^\s]+)\s+-\s+(.+)$/.exec(line);
		if (!match) continue;
		const id = match[1];
		const rawLabel = match[2];
		if (!(id && rawLabel)) continue;
		if (id === "auto") continue;
		if (seen.has(id)) continue;
		const label = rawLabel.replace(/\s*\((?:current|default)\)\s*$/, "").trim();
		if (!label) continue;
		seen.add(id);
		models.push({
			id,
			label,
			contextWindow: 0,
			selectable: true,
			options: [],
		});
	}
	return models;
}

/**
 * The effort levels `claude --effort` accepts, from `claude --help` (2.1.220).
 *
 * A compile-time list, unlike every other harness here: claude's `/model` answer
 * names models and nothing else, and the flag is session-level rather than
 * per-model, so every discovered claude model declares the same set.
 *

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
 * @lore: opencode variant option — opencode silently ignores an unknown --variant (unlike claude, which names the flag back); evidence is weaker but accepted
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
	// @lore: opencode providerID — multi-provider aggregator; HarnessModelDescriptor.provider is a closed union; map known values, omit unknown
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
 * @lore: opencode models --verbose — one JSON block per model, prefixed with a "provider/id" header line; real format captured 2026-07-06
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

/**
 * Result of the harmless real one-shot session probe.
 * `runtimeFromDiscovery` only sets fileEditing/toolUse `true` when
 * `sessionProbe?.ok === true` — auth status alone proves login, NOT launchability.
 */
interface HarnessSessionProbeResult {
	readonly ok: boolean;
	readonly family: "codex" | "claude-code" | "opencode";
	/** First captured usage-bearing event line; committed as a test fixture. */
	readonly capturedLine?: string;
	/** Parsed native event type, e.g. "turn.completed" | "result". */
	readonly eventType?: string;
	/** Precise reason when ok === false (binary absent / not authed / launch failed). */
	readonly reason?: string;
}

/** @lore: HarnessDiscoveryInput — private probe result; intentionally mirrors no shared type; maps to HarnessCapabilityDescriptor at the descriptor builder */
interface HarnessDiscoveryInput {
	readonly state: HarnessReadinessState;
	readonly version?: string;
	readonly reason?: string;
	readonly authAction?: HarnessAuthActionDescriptor;
	readonly models?: readonly HarnessModelDescriptor[];
	/**
	 * Result of the harmless real one-shot session probe. `runtimeFromDiscovery`
	 * only sets fileEditing/toolUse `true` when `sessionProbe?.ok === true` — auth status
	 * alone proves login, NOT launchability. Absent ⇒ no session probe ran ⇒ caps stay false.
	 */
	readonly sessionProbe?: HarnessSessionProbeResult;
}

interface HarnessDiscoveryResult {
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

	 */
	readonly cwd?: string;
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

export type {
	HarnessDiscoveryInput,
	HarnessDiscoveryResult,
	HarnessProbeDeps,
	HarnessSessionProbeResult,
};

/**
 * The models codex can run, read from codex's own cache.
 *
 * Codex publishes no model list — no subcommand, nothing in its shell
 * completions, and `codex doctor` reports no server model. What it does keep is
 * `~/.codex/models_cache.json`, which it refreshes itself and scopes to the
 * signed-in account (it carries an etag). That file is the only enumeration
 * there is, and it is the reason codex can offer per-model options at all.
 *
 * @lore: codex model cache — reads ~/.codex/models_cache.json (not a contract); hardcoded list wrong (reasoning levels differ); failures degrade to no models
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
						// Ask claude itself what it accepts. `/model` is answered locally —
						// no tokens, no cost, no key — see `parseClaudeModelCommand`.
						let models: readonly HarnessModelDescriptor[] = [];
						try {
							const modelsResult = await runCommand(
								["claude", "-p", "/model", "--output-format", "json"],
								d,
							);
							if (modelsResult.exitCode === 0 && modelsResult.stdout.trim()) {
								models = parseClaudeModelCommand(modelsResult.stdout);
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
			 * @lore: opencode model discovery — `opencode models --verbose` run when providers are configured; failure degrades to models:[]; format captured 2026-07-06
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
			async interpretAuth(stdout, stderr, exitCode, d, version, authAction) {
				const authText = stdout.trim() || stderr.trim();
				if (authText.includes("Logged in")) {
					let models: readonly HarnessModelDescriptor[] = [];
					try {
						const modelsResult = await runCommand(["cursor-agent", "--list-models"], d);
						if (modelsResult.exitCode === 0 && modelsResult.stdout.trim()) {
							models = parseCursorModelList(modelsResult.stdout);
						}
					} catch {
						// degraded gracefully — models stays []
					}
					return { state: "ready", version, models, authAction };
				}
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
 * Probe the local environment for the first-class harness families HyperIdle supports.
 * Probes public, non-destructive commands only (version, auth status, providers list).
 * Never reads provider credential files and never starts an agent session.
 */
export async function discoverLocalHarnesses(
	d?: HarnessProbeDeps,
): Promise<HarnessDiscoveryResult> {
	// Run probes concurrently — they are independent filesystem probes.
	const [codex, claudeCode, opencode, cursorAgent] = await Promise.all([
		probeCli(CLI_PROBE_CONFIGS[0], d), // codex
		probeCli(CLI_PROBE_CONFIGS[1], d), // claude-code
		probeCli(CLI_PROBE_CONFIGS[2], d), // opencode
		probeCli(CLI_PROBE_CONFIGS[3], d), // cursor-agent
	]);

	return {
		codex,
		"claude-code": claudeCode,
		opencode,
		"cursor-agent": cursorAgent,
	};
}
