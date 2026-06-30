import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
	HarnessAuthActionDescriptor,
	HarnessModelDescriptor,
	HarnessReadinessState,
	HarnessRuntimeCapabilities,
	InheritedToolDescriptor,
} from "@hyperidle/shared";

const execFileAsync = promisify(execFile);

const ESC = String.fromCharCode(0x1b);
const ANSI_PATTERN = new RegExp(`${ESC}\\[[\\d;]*m`, "g");

function stripAnsi(value: string): string {
	return value.replace(ANSI_PATTERN, "");
}

/**
 * AC5 result of the harmless real one-shot session probe.
 * `runtimeFromDiscovery` only sets fileEditing/toolUse `true` when
 * `sessionProbe?.ok === true` — auth status alone proves login, NOT launchability.
 */
export interface HarnessSessionProbeResult {
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
export interface HarnessDiscoveryInput {
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
	/**
	 * AN1: identity-only enumeration of tools this harness/environment is already
	 * configured with. Names and liveness only — no token values, no env, no command.
	 * Absent ⇒ empty (default []).
	 */
	readonly inheritedTools?: readonly InheritedToolDescriptor[];
}

export interface HarnessDiscoveryResult {
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
	) => Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }>;
	/** Environment used for built-in credential checks and passed to real binary executions. */
	readonly env?: NodeJS.ProcessEnv;
	/**
	 * Working directory for real binary invocations (e.g. to pick up a project .mcp.json
	 * for `claude mcp list`). Ignored when `run` is injected. Defaults to process.cwd().
	 *
	 * @lore AN1: claude mcp list reads .mcp.json from the working directory (project scope).
	 * Integration tests set this to a temp dir seeded with a known .mcp.json.
	 */
	readonly cwd?: string;
}

async function runCommand(
	args: readonly string[],
	d?: HarnessProbeDeps,
): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }> {
	const runner = d?.run;
	if (runner) {
		const { stdout, stderr, exitCode } = await runner(args);
		return { stdout: stripAnsi(stdout), stderr: stripAnsi(stderr), exitCode };
	}

	try {
		// Use injected env/cwd if provided (allows tests to set CODEX_HOME, XDG_CONFIG_HOME,
		// and cwd for real-binary isolation without touching the developer's actual config).
		const env = d?.env ?? process.env;
		const { stdout, stderr } = await execFileAsync(args[0] ?? "", args.slice(1), {
			timeout: 15_000,
			env,
			...(d?.cwd ? { cwd: d.cwd } : {}),
		});
		return { stdout: stripAnsi(stdout), stderr: stripAnsi(stderr), exitCode: 0 };
	} catch (err) {
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
			return {
				state: "ready",
				version,
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

async function probeOpenCodeCli(d?: HarnessProbeDeps): Promise<HarnessDiscoveryInput> {
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
		return {
			state: "ready",
			version,
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
	const pathResult = await runCommand(["which", "cursor-agent"], d);
	if (pathResult.exitCode === 0) {
		return {
			state: "installed",
			version: pathResult.stdout.trim().split("\n")[0]?.trim() ?? "",
			reason: "cursor-agent binary found; auth/readiness not yet probed.",
			authAction: {
				kind: "native_cli_login",
				label: "Log in to Cursor",
				command: ["cursor-agent", "login"],
			},
		};
	}

	const cursorResult = await runCommand(["which", "cursor"], d);
	if (cursorResult.exitCode === 0) {
		return {
			state: "unavailable",
			reason:
				"cursor IDE is present but Cursor Agent does not expose a documented headless local CLI surface that HyperIdle can drive.",
			authAction: {
				kind: "native_cli_login",
				label: "Log in to Cursor",
				command: ["cursor-agent", "login"],
			},
		};
	}

	return {
		state: "unavailable",
		reason:
			"cursor / cursor-agent CLI is not installed or not on PATH and no documented headless local CLI surface exists.",
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
 */
function probeBuiltinGateway(d?: HarnessProbeDeps): HarnessDiscoveryInput {
	const env = d?.env ?? process.env;

	// Ordered set of gateway-usable credentials (priority: Anthropic → OpenAI-compatible → OpenRouter)
	const credentialCandidates: Array<{ envKey: string; credentialName: string; label: string }> = [
		{
			envKey: "ANTHROPIC_API_KEY",
			credentialName: "anthropic_api_key",
			label: "Enter Anthropic API key",
		},
		{
			envKey: "OPENAI_API_KEY",
			credentialName: "openai_compatible_api_key",
			label: "Enter OpenAI-compatible API key",
		},
		{
			envKey: "OPENROUTER_API_KEY",
			credentialName: "openrouter_api_key",
			label: "Enter OpenRouter API key",
		},
	];

	const matched = credentialCandidates.find((c) => Boolean(env[c.envKey]));

	if (matched) {
		return {
			state: "ready",
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

/** Per-probe timeout for MCP list / CLI auth-status probes (AN1). */
const INHERITED_PROBE_TIMEOUT_MS = 5_000;

/**
 * AN1: Probe Claude Code's configured MCP servers (identity only, no token values).
 *
 * Runs `claude mcp list` and parses each output line:
 *   "<name>: <command|url> - <status>"
 * Status token mapping: "✓ Connected" → working; anything else → needs-attention.
 * On non-zero exit, timeout, or empty output → [] (omit, don't fabricate).
 *
 * @lore AN1 hard-rule 4: `claude mcp list` output contains only MCP server names
 * and liveness status — env vars / tokens are never in the list output.
 * We parse names only; the status suffix determines health.
 */
export async function probeClaudeCodeMcpList(
	d?: HarnessProbeDeps,
): Promise<readonly InheritedToolDescriptor[]> {
	try {
		const result = await Promise.race([
			runCommand(["claude", "mcp", "list"], d),
			new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) =>
				setTimeout(
					() => resolve({ stdout: "", stderr: "", exitCode: 1 }),
					INHERITED_PROBE_TIMEOUT_MS,
				),
			),
		]);
		if (result.exitCode !== 0 || !result.stdout.trim()) return [];

		const tools: InheritedToolDescriptor[] = [];
		for (const line of result.stdout.split("\n")) {
			const trimmed = stripAnsi(line).trim();
			if (!trimmed) continue;
			// Format: "<name>: <rest> - <status>"
			const colonIdx = trimmed.indexOf(":");
			if (colonIdx <= 0) continue;
			const name = trimmed.slice(0, colonIdx).trim();
			if (!name) continue;
			const rest = trimmed.slice(colonIdx + 1);
			// Determine health from status token
			let health: InheritedToolDescriptor["health"] = "unknown";
			if (rest.includes("✓") || rest.toLowerCase().includes("connected")) {
				health = "working";
			} else if (
				rest.includes("✗") ||
				rest.includes("⏸") ||
				rest.toLowerCase().includes("failed") ||
				rest.toLowerCase().includes("rejected") ||
				rest.toLowerCase().includes("pending")
			) {
				health = "needs-attention";
			}
			tools.push({ name, kind: "mcp-server", harness: "claude-code", health });
		}
		return tools;
	} catch {
		return [];
	}
}

/**
 * AN1: Probe Codex's configured MCP servers (identity only).
 *
 * Tries `codex mcp list`; on failure, parses `~/.codex/config.toml` for
 * `[mcp_servers.<name>]` table keys. Health is always "unknown" (list shows
 * config, not live status).
 *
 * @lore AN1: Never reads env/command values from config.toml — names only.
 */
export async function probeCodexMcpList(
	d?: HarnessProbeDeps,
): Promise<readonly InheritedToolDescriptor[]> {
	try {
		const result = await Promise.race([
			runCommand(["codex", "mcp", "list"], d),
			new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) =>
				setTimeout(
					() => resolve({ stdout: "", stderr: "", exitCode: 1 }),
					INHERITED_PROBE_TIMEOUT_MS,
				),
			),
		]);
		if (result.exitCode === 0 && result.stdout.trim()) {
			// `codex mcp list` outputs a whitespace-aligned table when servers exist:
			//   Name           Command  Args  Env  Cwd  Status   Auth
			//   test-mcp-tool  node     ...
			// When no servers: "No MCP servers configured yet. Try `codex mcp add ...`"
			// We detect the table by looking for a header row starting with "Name ";
			// if absent, stdout is a message (no servers) → fall through to config.toml.
			// @lore AN1: we parse config.toml directly rather than relying solely on
			// codex mcp list (whose output columns/format vary across codex versions);
			// we never read token values. mcp list is tried first as a fast path.
			const lines = result.stdout.split("\n");
			const hasTableHeader = lines.some((l) => stripAnsi(l).trimStart().startsWith("Name "));
			if (hasTableHeader) {
				const tools: InheritedToolDescriptor[] = [];
				for (const line of lines) {
					const clean = stripAnsi(line).trim();
					if (!clean) continue;
					const name = clean.split(/\s+/)[0]?.trim();
					// Skip table header row and comment lines
					if (!name || name === "Name" || name.startsWith("#")) continue;
					tools.push({ name, kind: "mcp-server", harness: "codex", health: "unknown" });
				}
				if (tools.length > 0) return tools;
			}
		}
	} catch {
		// fall through to config.toml parse
	}

	// Fallback: read ~/.codex/config.toml (or $CODEX_HOME/config.toml), extract [mcp_servers.<name>] keys.
	// Names only — never env/command values.
	// @lore AN1: CODEX_HOME overrides the default ~/.codex path. We respect it here (via
	// injected env) so integration tests can seed an isolated config.toml without touching
	// the developer's real ~/.codex.
	try {
		const { readFile } = await import("node:fs/promises");
		const { join } = await import("node:path");
		const os = await import("node:os");
		const env = d?.env ?? process.env;
		const codexHome = env["CODEX_HOME"] ?? join(os.homedir(), ".codex");
		const toml = await readFile(join(codexHome, "config.toml"), "utf-8");
		const tools: InheritedToolDescriptor[] = [];
		// Match [mcp_servers.NAME] table headers
		const serverNameRe = /^\[mcp_servers\.([^\]]+)\]/gm;
		let match: RegExpExecArray | null;
		// biome-ignore lint/suspicious/noAssignInExpressions: standard RegExp iteration pattern
		while ((match = serverNameRe.exec(toml)) !== null) {
			const name = match[1]?.trim();
			if (name) {
				tools.push({ name, kind: "mcp-server", harness: "codex", health: "unknown" });
			}
		}
		return tools;
	} catch {
		return [];
	}
}

/**
 * AN1: Probe OpenCode's configured MCP servers (identity only).
 *
 * Reads `~/.config/opencode/opencode.jsonc` (or `$XDG_CONFIG_HOME/opencode/opencode.jsonc`)
 * and extracts the `mcp` object's top-level keys as server names.
 *
 * We parse the config file directly rather than running `opencode mcp list` because the
 * list command emits box-drawing characters and ANSI sequences that are fragile to parse
 * and require a live connection attempt (which would time out for each server).
 *
 * Names only — never reads url/env/token values. Health always "unknown"
 * (no live connection attempted).
 *
 * @lore AN1: opencode config is JSONC at `$XDG_CONFIG_HOME/opencode/opencode.jsonc`
 * (defaults to `~/.config/opencode/opencode.jsonc`). The `mcp` key holds a record of
 * server-name → { type, url, ... }. We extract only the keys — never the values.
 * We use XDG_CONFIG_HOME env var for isolation in tests.
 */
export async function probeOpencodeMcpList(
	d?: HarnessProbeDeps,
): Promise<readonly InheritedToolDescriptor[]> {
	try {
		const { readFile } = await import("node:fs/promises");
		const { join } = await import("node:path");
		const os = await import("node:os");
		const env = d?.env ?? process.env;

		// Respect XDG_CONFIG_HOME for config dir isolation (used in tests).
		const configBase = env["XDG_CONFIG_HOME"] ?? join(os.homedir(), ".config");
		const configPath = join(configBase, "opencode", "opencode.jsonc");

		const raw = await readFile(configPath, "utf-8");
		// Strip JSONC single-line comments: only lines whose non-whitespace content starts
		// with `//`. We MUST NOT strip `//` inside string values (e.g. URLs like https://...).
		// A full JSONC parser is avoided to keep zero-dependency policy; line-level stripping
		// is safe because opencode.jsonc only uses `//` at the start of comment lines.
		// @lore AN1: naive `replace(/\/\/[^\n]*/g, "")` breaks URLs inside string values.
		const stripped = raw
			.split("\n")
			.filter((line) => !line.trimStart().startsWith("//"))
			.join("\n");
		const parsed = JSON.parse(stripped) as Record<string, unknown>;

		const mcp = parsed["mcp"];
		if (!mcp || typeof mcp !== "object" || Array.isArray(mcp)) return [];

		const tools: InheritedToolDescriptor[] = [];
		for (const name of Object.keys(mcp as Record<string, unknown>)) {
			if (name) {
				tools.push({ name, kind: "mcp-server", harness: "opencode", health: "unknown" });
			}
		}
		return tools;
	} catch {
		return [];
	}
}

/**
 * AN1: Probe the PATH-level environment for logged-in CLIs.
 *
 * Currently checks `gh auth status --json hosts` (GitHub CLI).
 * gh always exits 0; the JSON hosts list shows which accounts are logged in.
 * Never passes --show-token (hard-rule 4).
 *
 * Returns health:"working" when an account is found for a host.
 * Extensible to other CLIs (stripe, vercel, etc.) by the same evidence-first shape.
 *
 * @lore AN1 hard-rule 4: `gh auth status --json hosts` never returns token values —
 * only host names and account metadata.
 */
export async function probeEnvironmentClis(
	d?: HarnessProbeDeps,
): Promise<readonly InheritedToolDescriptor[]> {
	const tools: InheritedToolDescriptor[] = [];

	// GitHub CLI
	try {
		const result = await Promise.race([
			runCommand(["gh", "auth", "status", "--json", "hosts"], d),
			new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) =>
				setTimeout(
					() => resolve({ stdout: "", stderr: "", exitCode: 0 }),
					INHERITED_PROBE_TIMEOUT_MS,
				),
			),
		]);
		// `gh auth status --json hosts` always exits 0 and outputs JSON
		if (result.stdout.trim()) {
			try {
				const parsed = JSON.parse(result.stdout) as unknown;
				// Shape: { "github.com": { ... account ... } }
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
					const hosts = Object.keys(parsed as Record<string, unknown>);
					if (hosts.length > 0) {
						tools.push({
							name: "github",
							kind: "cli",
							harness: "environment",
							health: "working",
						});
					}
				}
			} catch {
				// non-JSON output → gh not available or different format → omit
			}
		}
	} catch {
		// gh not installed → omit
	}

	return tools;
}

/**
 * Probe the local environment for the first-class harness families AM2 cares about.
 *
 * @lore AM2: This probes public, non-destructive commands only (version, auth status,
 *  providers list). It never reads provider credential files and never starts an agent
 *  session.
 */
export async function discoverLocalHarnesses(
	d?: HarnessProbeDeps,
): Promise<HarnessDiscoveryResult> {
	// Run probes concurrently — they are independent filesystem probes.
	const [
		builtin,
		codex,
		claudeCode,
		opencode,
		cursorAgent,
		claudeMcpTools,
		codexMcpTools,
		opencodeMcpTools,
		envTools,
	] = await Promise.all([
		probeBuiltinGateway(d),
		probeCodexCli(d),
		probeClaudeCodeCli(d),
		probeOpenCodeCli(d),
		probeCursorAgentCli(d),
		probeClaudeCodeMcpList(d),
		probeCodexMcpList(d),
		probeOpencodeMcpList(d),
		probeEnvironmentClis(d),
	]);

	// Merge inherited tool probes into each harness's discovery input.
	// @lore AN1: inheritedTools are attached here (post-probe merge) so that
	// `describeRegisteredHarness` can read them from `discoveries?.[type]?.inheritedTools`.
	// Environment-level CLIs (gh, stripe, etc.) attach to "builtin" since they are
	// available regardless of which CLI harness is active.
	return {
		builtin: { ...builtin, inheritedTools: envTools },
		codex: { ...codex, inheritedTools: codexMcpTools },
		"claude-code": { ...claudeCode, inheritedTools: claudeMcpTools },
		opencode: { ...opencode, inheritedTools: opencodeMcpTools },
		"cursor-agent": cursorAgent,
	};
}
