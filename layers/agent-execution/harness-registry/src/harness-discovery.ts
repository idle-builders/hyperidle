import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type {
	HarnessAuthActionDescriptor,
	HarnessModelDescriptor,
	HarnessReadinessState,
	HarnessRuntimeCapabilities,
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
			options: [],
		});
	}

	return models;
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
			options: [],
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
	readonly runtime?: Partial<HarnessRuntimeCapabilities>;
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

async function probeCodexCli(d?: HarnessProbeDeps): Promise<HarnessDiscoveryInput> {
	const versionResult = await runCommand(["codex", "--version"], d);
	if (versionResult.exitCode !== 0) {
		return {
			state: "missing",
			reason: "codex CLI is not installed or not on PATH.",
		};
	}

	const version = versionResult.stdout.trim().split("\n")[0]?.trim() ?? "";

	const authResult = await runCommand(["codex", "login", "status"], d);
	const authText = authResult.stdout.trim() || authResult.stderr.trim();
	if (authText.startsWith("Logged in using")) {
		return {
			state: "ready",
			version,
			authAction: {
				kind: "native_cli_login",
				label: "Log in to Codex",
				command: ["codex", "login"],
			},
			runtime: { fileEditing: true, toolUse: true },
		};
	}

	if (authText.startsWith("Not logged in") || authResult.exitCode !== 0) {
		return {
			state: "unauthenticated",
			version,
			reason: "codex CLI is installed but not authenticated. Run `codex login`.",
			authAction: {
				kind: "native_cli_login",
				label: "Log in to Codex",
				command: ["codex", "login"],
			},
		};
	}

	// Unknown auth output — report installed but readiness unclear.
	return {
		state: "installed",
		version,
		reason: `codex auth state could not be parsed. Observed stdout: ${authText.slice(0, 120)}`,
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Codex",
			command: ["codex", "login"],
		},
	};
}

export type { HarnessDiscoveryInput, HarnessDiscoveryResult, HarnessSessionProbeResult };

async function probeClaudeCodeCli(d?: HarnessProbeDeps): Promise<HarnessDiscoveryInput> {
	const versionResult = await runCommand(["claude", "--version"], d);
	if (versionResult.exitCode !== 0) {
		return {
			state: "missing",
			reason: "claude CLI is not installed or not on PATH.",
		};
	}

	const version = versionResult.stdout.trim().split("\n")[0]?.trim() ?? "";

	const authResult = await runCommand(["claude", "auth", "status"], d);
	if (authResult.exitCode !== 0) {
		return {
			state: "installed",
			version,
			reason: "claude CLI is installed but `claude auth status` failed.",
			authAction: {
				kind: "native_cli_login",
				label: "Log in to Claude Code",
				command: ["claude", "auth", "login"],
			},
		};
	}

	try {
		const parsed = JSON.parse(authResult.stdout) as { loggedIn?: boolean };
		if (parsed.loggedIn === true) {
			// AV2: also run `claude models` to discover available models.
			// ⚠️ UNVERIFIED — `claude models` exits 0 with the Markdown table shown above
			// (captured 2026-07-06 from /opt/homebrew/bin/claude models). Fallback to []
			// on parse failure or non-zero exit.
			let models: readonly HarnessModelDescriptor[] = [];
			try {
				const modelsResult = await runCommand(["claude", "models"], d);
				if (modelsResult.exitCode === 0 && modelsResult.stdout.trim()) {
					models = parseClaudeCatalog(modelsResult.stdout);
				}
			} catch {
				// degraded gracefully — models stays []
			}

			return {
				state: "ready",
				version,
				models,
				authAction: {
					kind: "native_cli_login",
					label: "Log in to Claude Code",
					command: ["claude", "auth", "login"],
				},
				runtime: { fileEditing: true, toolUse: true },
			};
		}
		if (parsed.loggedIn === false) {
			return {
				state: "unauthenticated",
				version,
				reason: "claude CLI is installed but not authenticated. Run `claude auth login`.",
				authAction: {
					kind: "native_cli_login",
					label: "Log in to Claude Code",
					command: ["claude", "auth", "login"],
				},
			};
		}
	} catch {
		// fall through
	}

	return {
		state: "installed",
		version,
		reason: "claude auth status returned unparsable output.",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Claude Code",
			command: ["claude", "auth", "login"],
		},
	};
}

/**
 * Probe the OpenCode CLI for version, auth state, and available models.
 *
 * AV2: Exported so the integration test `AV2-opencode-models.integration.test.ts`
 * can call it directly against the real binary (requireHarness('opencode')).
 *
 * @lore AV2: `opencode models --verbose` outputs one JSON block per model
 * (real format captured 2026-07-06). We run it when providers are configured
 * (state=ready). Failure degrades to models:[] — never throws.
 */
async function inspectOpenCode(d?: HarnessProbeDeps): Promise<HarnessDiscoveryInput> {
	const versionResult = await runCommand(["opencode", "--version"], d);
	if (versionResult.exitCode !== 0) {
		return {
			state: "missing",
			reason: "opencode CLI is not installed or not on PATH.",
		};
	}

	const version = versionResult.stdout.trim().split("\n")[0]?.trim() ?? "";

	const authResult = await runCommand(["opencode", "providers", "list"], d);
	if (authResult.exitCode !== 0) {
		return {
			state: "installed",
			version,
			reason: "opencode CLI is installed but `opencode providers list` failed.",
			authAction: {
				kind: "native_cli_login",
				label: "Log in to OpenCode",
				command: ["opencode", "providers", "login"],
			},
		};
	}

	const hasCredentials =
		/\d+\s+credentials/.test(authResult.stdout) ||
		authResult.stdout.includes("environment variable");

	if (hasCredentials) {
		// AV2: run `opencode models --verbose` to discover available models.
		// ⚠️ UNVERIFIED — format captured 2026-07-06 from `opencode models --verbose`.
		// Degrades to models:[] on non-zero exit or parse failure.
		let models: readonly HarnessModelDescriptor[] = [];
		try {
			const modelsResult = await runCommand(["opencode", "models", "--verbose"], d);
			if (modelsResult.exitCode === 0 && modelsResult.stdout.trim()) {
				models = parseOpenCodeCatalog(modelsResult.stdout);
			}
		} catch {
			// degraded gracefully — models stays []
		}

		return {
			state: "ready",
			version,
			models,
			authAction: {
				kind: "native_cli_login",
				label: "Log in to OpenCode",
				command: ["opencode", "providers", "login"],
			},
			// AM2: OpenCode supports these capabilities per CLI help, but no real
			// session event fixture has been captured yet, so tool/file capabilities
			// are left conservative until proven.
			runtime: { fileEditing: false, toolUse: false },
		};
	}

	return {
		state: "unauthenticated",
		version,
		reason:
			"opencode CLI is installed but no providers are configured. Run `opencode providers login`.",
		authAction: {
			kind: "native_cli_login",
			label: "Log in to OpenCode",
			command: ["opencode", "providers", "login"],
		},
	};
}

async function probeCursorAgentCli(d?: HarnessProbeDeps): Promise<HarnessDiscoveryInput> {
	const versionResult = await runCommand(["cursor-agent", "--version"], d);
	if (versionResult.exitCode !== 0) {
		return {
			state: "missing",
			reason: "cursor-agent CLI is not installed or not on PATH.",
		};
	}

	const version = versionResult.stdout.trim().split("\n")[0]?.trim() ?? "";

	const authResult = await runCommand(["cursor-agent", "status"], d);
	const authText = authResult.stdout.trim() || authResult.stderr.trim();
	if (authText.includes("Logged in")) {
		return {
			state: "ready",
			version,
			authAction: {
				kind: "native_cli_login",
				label: "Log in to Cursor",
				command: ["cursor-agent", "login"],
			},
			runtime: { fileEditing: true, toolUse: true },
		};
	}

	if (authResult.exitCode !== 0 || authText.includes("Not logged in")) {
		return {
			state: "unauthenticated",
			version,
			reason: "cursor-agent CLI is installed but not authenticated. Run `cursor-agent login`.",
			authAction: {
				kind: "native_cli_login",
				label: "Log in to Cursor",
				command: ["cursor-agent", "login"],
			},
		};
	}

	return {
		state: "installed",
		version,
		reason: `cursor-agent auth state could not be parsed. Observed stdout: ${authText.slice(0, 120)}`,
		authAction: {
			kind: "native_cli_login",
			label: "Log in to Cursor",
			command: ["cursor-agent", "login"],
		},
	};
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
			runtime: { fileEditing: true, toolUse: true },
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
					options: [],
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
		probeCodexCli(d),
		probeClaudeCodeCli(d),
		inspectOpenCode(d),
		probeCursorAgentCli(d),
	]);

	return {
		builtin,
		codex,
		"claude-code": claudeCode,
		opencode,
		"cursor-agent": cursorAgent,
	};
}
