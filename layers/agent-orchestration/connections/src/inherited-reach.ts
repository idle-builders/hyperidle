/**
 * AU36 (D1) — inherited reach: the connections domain's own probe + cache for
 * the services the machine already holds auth for.
 *
 * The four probes moved VERBATIM from `layers/agent-execution/harness-registry/
 * src/harness-discovery.ts` (inspectClaudeTools / inspectCodexTools /
 * inspectOpenCodeTools / inspectInheritedTools) — same argv, same parsing,
 * same degrade-to-`[]` error handling, same timeouts, same AN1 lore. Their
 * small CLI-runner helpers (`runCommand` / `stripAnsi` / `failedCommandResult`)
 * are deliberately DUPLICATED here (~50 lines): the originals also serve the
 * harness-family probes that stay, and no cross-layer sharing is legal
 * (agent-orchestration may never import agent-execution).
 *
 * The one expressed change: facts carry `source` where the old
 * `InheritedToolDescriptor` carried `harness` (D2) — the VALUES are unchanged.
 *
 * No DB, no timers, no background work: `refresh` runs the four probes
 * concurrently and atomically swaps a frozen snapshot (the
 * `AdapterPool.discoveries` pattern). `refresh` never rejects — every probe
 * error degrades to `[]`, exactly as today.
 */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { InheritedConnectionFact, ServiceConnectionView } from "@hyperidle/domain-model";

const execFileAsync = promisify(execFile);

const ESC = String.fromCharCode(0x1b);
const ANSI_PATTERN = new RegExp(`${ESC}\\[[\\d;]*m`, "g");

function stripAnsi(value: string): string {
	return value.replace(ANSI_PATTERN, "");
}

/**
 * The injected-run/env/cwd seam, shaped exactly like harness-discovery's
 * `HarnessProbeDeps` minus `fetchModels` (D1). Production calls `refresh()`
 * absent; tests seed isolated homes through it.
 */
export interface InheritedProbeDeps {
	/** Environment passed to real binary executions and read for config paths. */
	readonly env?: NodeJS.ProcessEnv;
	/**
	 * Working directory for real binary invocations (e.g. to pick up a project
	 * .mcp.json for `claude mcp list`).
	 * Defaults to process.cwd().
	 *
	 * @lore AN1: claude mcp list reads .mcp.json from the working directory
	 * (project scope). Integration tests set this to a temp dir seeded with a
	 * known .mcp.json.
	 */
	readonly cwd?: string;
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
	d?: InheritedProbeDeps,
): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }> {
	const env = d?.env ?? process.env;
	const cwd = resolve(d?.cwd ?? process.cwd());
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const command = execFileAsync(args[0] ?? "", args.slice(1), {
			cwd,
			env,
			signal: controller.signal,
		})
			.then(({ stdout, stderr }) => ({
				stdout: stripAnsi(stdout),
				stderr: stripAnsi(stderr),
				exitCode: 0 as const,
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
async function inspectClaudeTools(
	d?: InheritedProbeDeps,
): Promise<readonly InheritedConnectionFact[]> {
	const cwd = resolve(d?.cwd ?? process.cwd());
	const byName = new Map<string, InheritedConnectionFact["health"]>();
	try {
		const parsed = JSON.parse(readFileSync(resolve(cwd, ".mcp.json"), "utf8")) as unknown;
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			const servers = (parsed as { mcpServers?: unknown }).mcpServers;
			if (typeof servers === "object" && servers !== null && !Array.isArray(servers)) {
				for (const rawName of Object.keys(servers)) {
					if (rawName.trim()) byName.set(rawName, "unknown");
				}
			}
		}
	} catch {
		// Missing, malformed, unreadable, directory, and broken-symlink configs
		// honestly degrade to CLI-only discovery.
	}

	const result = await runCommand(["claude", "mcp", "list"], d);
	if (result.exitCode === 0 && result.stdout.trim()) {
		const cliHealth = new Map<string, InheritedConnectionFact["health"]>();
		const precedence: Readonly<Record<InheritedConnectionFact["health"], number>> = {
			unknown: 0,
			working: 1,
			"needs-attention": 2,
		};
		for (const line of result.stdout.split("\n")) {
			const trimmed = stripAnsi(line).trim();
			const colonIndex = trimmed.indexOf(":");
			if (colonIndex <= 0) continue;
			const name = trimmed.slice(0, colonIndex).trim();
			if (!name) continue;
			const suffixIndex = trimmed.lastIndexOf(" - ");
			const suffix = suffixIndex > colonIndex ? trimmed.slice(suffixIndex + 3).trim() : "";
			const lowerSuffix = suffix.toLowerCase();
			let health: InheritedConnectionFact["health"] = "unknown";
			if (
				suffix.includes("✘") ||
				suffix.includes("✗") ||
				suffix.includes("⏸") ||
				suffix.includes("!") ||
				lowerSuffix.includes("failed") ||
				lowerSuffix.includes("rejected") ||
				lowerSuffix.includes("pending") ||
				lowerSuffix.includes("needs authentication")
			) {
				health = "needs-attention";
			} else if (
				suffix.includes("✔") ||
				suffix.includes("✓") ||
				lowerSuffix.includes("connected")
			) {
				health = "working";
			}
			const current = cliHealth.get(name);
			if (current === undefined || precedence[health] > precedence[current]) {
				cliHealth.set(name, health);
			}
		}
		for (const [name, health] of cliHealth) byName.set(name, health);
	}

	return [...byName]
		.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
		.map(([name, health]) => ({
			name,
			kind: "mcp-server",
			source: "claude-code",
			health,
		}));
}

/** Parse tools from `codex mcp list` table output. Returns null if no table found. */
function parseCodexMcpListOutput(stdout: string): readonly InheritedConnectionFact[] | null {
	const lines = stdout.split("\n");
	const hasTableHeader = lines.some((l) => stripAnsi(l).trimStart().startsWith("Name "));
	if (!hasTableHeader) return null;
	const tools: InheritedConnectionFact[] = [];
	for (const line of lines) {
		const clean = stripAnsi(line).trim();
		if (!clean) continue;
		const name = clean.split(/\s+/)[0]?.trim();
		if (!name || name === "Name" || name.startsWith("#")) continue;
		tools.push({ name, kind: "mcp-server", source: "codex", health: "unknown" });
	}
	return tools.length > 0 ? tools : null;
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
async function inspectCodexTools(
	d?: InheritedProbeDeps,
): Promise<readonly InheritedConnectionFact[]> {
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
		// @lore AN1: we parse config.toml directly rather than relying solely on
		// codex mcp list (whose output columns/format vary across codex versions);
		// we never read token values. mcp list is tried first as a fast path.
		if (result.exitCode === 0 && result.stdout.trim()) {
			const tools = parseCodexMcpListOutput(result.stdout);
			if (tools) return tools;
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
		const codexHome = env.CODEX_HOME ?? join(os.homedir(), ".codex");
		const toml = await readFile(join(codexHome, "config.toml"), "utf-8");
		const tools: InheritedConnectionFact[] = [];
		// Match [mcp_servers.NAME] table headers
		const serverNameRe = /^\[mcp_servers\.([^\]]+)\]/gm;
		let match: RegExpExecArray | null;
		// biome-ignore lint/suspicious/noAssignInExpressions: standard RegExp iteration pattern
		while ((match = serverNameRe.exec(toml)) !== null) {
			const name = match[1]?.trim();
			if (name) {
				tools.push({ name, kind: "mcp-server", source: "codex", health: "unknown" });
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
async function inspectOpenCodeTools(
	d?: InheritedProbeDeps,
): Promise<readonly InheritedConnectionFact[]> {
	try {
		const { readFile } = await import("node:fs/promises");
		const { join } = await import("node:path");
		const os = await import("node:os");
		const env = d?.env ?? process.env;

		// Respect XDG_CONFIG_HOME for config dir isolation (used in tests).
		const configBase = env.XDG_CONFIG_HOME ?? join(os.homedir(), ".config");
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

		const mcp = parsed.mcp;
		if (!mcp || typeof mcp !== "object" || Array.isArray(mcp)) return [];

		const tools: InheritedConnectionFact[] = [];
		for (const name of Object.keys(mcp as Record<string, unknown>)) {
			if (name) {
				tools.push({ name, kind: "mcp-server", source: "opencode", health: "unknown" });
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
async function inspectInheritedTools(
	d?: InheritedProbeDeps,
): Promise<readonly InheritedConnectionFact[]> {
	const tools: InheritedConnectionFact[] = [];

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
							source: "environment",
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
 * AU36 (D1) — the reach cache face. Built by `bootAgentOrchestration` (always)
 * and read by `/api/connections`' inherited projection; refreshed at the boot
 * and redetect moments through composition-root wiring (D4/D5).
 *
 * @lore AU44 batch2: list() now returns ServiceConnectionView[] directly —
 * projectInheritedConnections folded in here so the route no longer needs a
 * separate projection call. The InheritedConnectionFact snapshot is internal.
 */
export interface InheritedReach {
	/**
	 * Run the four probes concurrently and atomically swap the frozen snapshot.
	 * Never rejects: every probe error degrades to `[]` exactly as today —
	 * worst case is an empty inherited group.
	 */
	refresh(deps?: InheritedProbeDeps): Promise<void>;
	/**
	 * The current frozen snapshot, projected to ServiceConnectionView[].
	 * Empty until the first refresh.
	 *
	 * @lore AU44 batch2: projectInheritedConnections logic inlined here so the
	 * route receives ready-to-serve views, not raw facts.
	 */
	list(): ServiceConnectionView[];
}

function projectFacts(facts: readonly InheritedConnectionFact[]): ServiceConnectionView[] {
	const seen = new Set<string>();
	const result: ServiceConnectionView[] = [];
	for (const fact of facts) {
		if (seen.has(fact.name)) continue;
		seen.add(fact.name);
		result.push({
			id: `inherited:${fact.source}:${fact.name}`,
			service: fact.name,
			via: `${fact.source} · ${fact.name}`,
			authSource: "inherited",
			health: fact.health === "needs-attention" ? "needs-attention" : "working",
			removable: false,
		});
	}
	return result;
}

export function createInheritedReach(): InheritedReach {
	let snapshot: readonly InheritedConnectionFact[] = Object.freeze([] as InheritedConnectionFact[]);

	async function refresh(deps?: InheritedProbeDeps): Promise<void> {
		try {
			const [claudeFacts, environmentFacts, codexFacts, opencodeFacts] = await Promise.all([
				inspectClaudeTools(deps),
				inspectInheritedTools(deps),
				inspectCodexTools(deps),
				inspectOpenCodeTools(deps),
			]);
			// AU36 D6: fixed source order — reproduces today's display order for
			// every real configuration (see architecture.md §4 D6 for the one
			// documented edge this deliberately does not reproduce).
			snapshot = Object.freeze([
				...claudeFacts,
				...environmentFacts,
				...codexFacts,
				...opencodeFacts,
			]);
		} catch {
			// @lore AU36: the probes catch their own errors (degrade-to-[]), so
			// this branch is belt-and-braces only. If the unexpected still
			// happens, refresh keeps its contract — never reject — and reports an
			// honest empty reach, exactly as a fully-failed probe set would.
			snapshot = Object.freeze([] as InheritedConnectionFact[]);
		}
	}

	return {
		refresh,
		list: () => projectFacts(snapshot),
	};
}
