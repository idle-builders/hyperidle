import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
	HarnessAuthActionDescriptor,
	HarnessModelDescriptor,
	HarnessReadinessState,
	HarnessRuntimeCapabilities,
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
	/** Environment used for built-in credential checks. */
	readonly env?: NodeJS.ProcessEnv;
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
		const { stdout, stderr } = await execFileAsync(args[0] ?? "", args.slice(1), {
			timeout: 15_000,
			env: process.env,
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
	const [builtin, codex, claudeCode, opencode, cursorAgent] = await Promise.all([
		probeBuiltinGateway(d),
		probeCodexCli(d),
		probeClaudeCodeCli(d),
		probeOpenCodeCli(d),
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
