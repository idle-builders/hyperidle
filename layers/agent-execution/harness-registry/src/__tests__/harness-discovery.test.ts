import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessAdapter, HarnessCapabilities } from "@hyperidle/harness-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdapterPool } from "../adapter-pool.js";
import { discoverLocalHarnesses } from "../harness-discovery.js";

const CLAUDE_MODELS = `Current Claude models:

| Model | ID | Context | In $/1M | Out $/1M |
|---|---|---|---|---|
| **Fable 5** | \`claude-fable-5\` | 1M | $10 | $50 |
| **Haiku 4.5** | \`claude-haiku-4-5\` | 200K | $1 | $5 |
| Decimal | \`claude-decimal\` | 1.5M | $1 | $5 |
| Numeric | \`claude-numeric\` | 128000 | $1 | $5 |
`;

const OPENCODE_MODELS = `opencode/bad
{ bad json
opencode/good
{"id":"good","providerID":"openrouter","name":"Good","limit":{"context":200000}}`;

const response = (stdout = "", exitCode = 0, stderr = "") => ({ stdout, stderr, exitCode });
const temporaryDirectories: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), prefix));
	temporaryDirectories.push(path);
	return path;
}

afterEach(async () => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

function discoveryRunner(overrides: Readonly<Record<string, ReturnType<typeof response>>> = {}) {
	const defaults: Readonly<Record<string, ReturnType<typeof response>>> = {
		"codex --version": response("codex-cli 1.2.3"),
		"codex login status": response("Logged in using ChatGPT"),
		"claude --version": response("2.0.0"),
		"claude auth status": response('{"loggedIn":true}'),
		"claude models": response(CLAUDE_MODELS),
		"claude mcp list": response(
			"github: https://example.invalid - ✓ Connected\nbroken: local - ✗ Failed\nwaiting: local - pending",
		),
		"opencode --version": response("1.0.0"),
		"opencode providers list": response("1 credentials"),
		"opencode models --verbose": response(OPENCODE_MODELS),
		"cursor-agent --version": response("", 1),
		"codex mcp list": response("", 1),
		"gh --version": response("", 1),
		"stripe --version": response("", 1),
	};
	return async (args: readonly string[]) => {
		const key = args.join(" ");
		return overrides[key] ?? defaults[key] ?? response("", 1);
	};
}

describe("discoverLocalHarnesses cohesive discovery", () => {
	it("parses the captured Claude table, context forms, and MCP health end to end", async () => {
		const result = await discoverLocalHarnesses({ run: discoveryRunner(), env: {} });
		const claude = result["claude-code"];

		expect(claude.state).toBe("ready");
		expect(claude.models).toEqual([
			expect.objectContaining({ id: "claude-fable-5", label: "Fable 5", contextWindow: 1_000_000 }),
			expect.objectContaining({
				id: "claude-haiku-4-5",
				label: "Haiku 4.5",
				contextWindow: 200_000,
			}),
			expect.objectContaining({ id: "claude-decimal", contextWindow: 1_500_000 }),
			expect.objectContaining({ id: "claude-numeric", contextWindow: 128_000 }),
		]);
		expect(claude.inheritedTools).toEqual([
			expect.objectContaining({ name: "broken", health: "needs-attention" }),
			expect.objectContaining({ name: "github", health: "working" }),
			expect.objectContaining({ name: "waiting", health: "needs-attention" }),
		]);
	});

	it("reports honest none for Codex and skips malformed OpenCode blocks", async () => {
		const result = await discoverLocalHarnesses({ run: discoveryRunner(), env: {} });
		expect(result.codex).toMatchObject({ state: "ready", version: "codex-cli 1.2.3" });
		expect(result.codex.models).toBeUndefined();
		expect(result.opencode.models).toEqual([
			expect.objectContaining({ id: "good", label: "Good", contextWindow: 200_000 }),
		]);
	});

	it("returns empty OpenCode models for empty and wholly malformed output", async () => {
		for (const stdout of ["", "opencode/bad\n{ definitely not json"]) {
			const result = await discoverLocalHarnesses({
				run: discoveryRunner({ "opencode models --verbose": response(stdout) }),
				env: {},
			});
			expect(result.opencode.models).toEqual([]);
		}
	});

	it("maps Claude auth failures and unparsable health without inventing readiness", async () => {
		const failed = await discoverLocalHarnesses({
			run: discoveryRunner({ "claude auth status": response("denied", 1, "denied") }),
			env: {},
		});
		expect(failed["claude-code"]).toMatchObject({
			state: "installed",
			reason: expect.stringContaining("failed"),
		});

		const malformed = await discoverLocalHarnesses({
			run: discoveryRunner({ "claude auth status": response("not-json") }),
			env: {},
		});
		expect(malformed["claude-code"]).toMatchObject({
			state: "installed",
			reason: expect.stringContaining("unparsable"),
		});
	});

	it("retains cwd MCP identity when Claude discovery finishes after the obsolete five-second race", async () => {
		vi.useFakeTimers();
		const cwd = await temporaryDirectory("an1-claude-delayed-");
		await writeFile(
			join(cwd, ".mcp.json"),
			JSON.stringify({
				mcpServers: {
					"slow-project": {
						command: "node",
						env: { SECRET_SENTINEL: "must-not-escape" },
					},
				},
			}),
		);
		const base = discoveryRunner();
		const pending = discoverLocalHarnesses({
			cwd,
			env: {},
			run: async (args) => {
				if (args.join(" ") === "claude mcp list") {
					return new Promise((resolve) =>
						setTimeout(() => resolve(response("", 1, "health check timed out")), 5_100),
					);
				}
				return base(args);
			},
		});
		await vi.advanceTimersByTimeAsync(5_100);
		const tools = (await pending)["claude-code"].inheritedTools;
		expect(tools).toEqual([
			{
				name: "slow-project",
				kind: "mcp-server",
				harness: "claude-code",
				health: "unknown",
			},
		]);
		expect(JSON.stringify(tools)).not.toContain("SECRET_SENTINEL");
		expect(JSON.stringify(tools)).not.toContain("must-not-escape");
	});

	it.each([
		["non-zero", response("", 1, "failed")],
		["zero-empty", response("")],
		["zero-unusable", response("Checking MCP server health…\nnot a server row")],
	])("retains configured identity for %s Claude list output", async (_label, cliResult) => {
		const cwd = await temporaryDirectory("an1-claude-fallback-");
		await writeFile(
			join(cwd, ".mcp.json"),
			JSON.stringify({ mcpServers: { configured: { command: "secret-command" } } }),
		);
		const tools = (
			await discoverLocalHarnesses({
				cwd,
				env: {},
				run: discoveryRunner({ "claude mcp list": cliResult }),
			})
		)["claude-code"].inheritedTools;
		expect(tools).toEqual([
			{
				name: "configured",
				kind: "mcp-server",
				harness: "claude-code",
				health: "unknown",
			},
		]);
	});

	it("parses only final Claude status suffixes and applies conservative duplicate precedence", async () => {
		const stdout = [
			"spoof: node connected ✘ failed.js - Mystery state",
			"auth: https://example.invalid - ! Needs authentication",
			"connected: local - ✔ Connected",
			"duplicate: local - ✔ Connected",
			"duplicate: local - ✘ Failed to connect",
			"pending: local - ⏸ Pending approval",
		].join("\n");
		const result = await discoverLocalHarnesses({
			env: {},
			run: discoveryRunner({ "claude mcp list": response(stdout) }),
		});
		expect(result["claude-code"].inheritedTools).toEqual([
			{ name: "auth", kind: "mcp-server", harness: "claude-code", health: "needs-attention" },
			{ name: "connected", kind: "mcp-server", harness: "claude-code", health: "working" },
			{
				name: "duplicate",
				kind: "mcp-server",
				harness: "claude-code",
				health: "needs-attention",
			},
			{ name: "pending", kind: "mcp-server", harness: "claude-code", health: "needs-attention" },
			{ name: "spoof", kind: "mcp-server", harness: "claude-code", health: "unknown" },
		]);
	});

	it("merges CLI and config identities into the exact closed descriptor shape", async () => {
		const cwd = await temporaryDirectory("an1-claude-merge-");
		await writeFile(
			join(cwd, ".mcp.json"),
			JSON.stringify({
				mcpServers: {
					alpha: { command: "secret-alpha", env: { TOKEN: "secret-token" } },
					zeta: { url: "https://secret.invalid" },
				},
			}),
		);
		const tools = (
			await discoverLocalHarnesses({
				cwd,
				env: {},
				run: discoveryRunner({
					"claude mcp list": response(
						"global: https://example.invalid/connected - ✘ Failed\nalpha: node secret-alpha - ✔ Connected",
					),
				}),
			})
		)["claude-code"].inheritedTools;
		expect(tools).toEqual([
			{ name: "alpha", kind: "mcp-server", harness: "claude-code", health: "working" },
			{
				name: "global",
				kind: "mcp-server",
				harness: "claude-code",
				health: "needs-attention",
			},
			{ name: "zeta", kind: "mcp-server", harness: "claude-code", health: "unknown" },
		]);
		for (const tool of tools ?? []) {
			expect(Object.keys(tool).sort()).toEqual(["harness", "health", "kind", "name"]);
		}
		expect(JSON.stringify(tools)).not.toMatch(/secret-alpha|secret-token|secret\.invalid|TOKEN/);
	});

	it("uses only readable cwd MCP server keys across malformed and symlink path states", async () => {
		const targetDirectory = await temporaryDirectory("an1-claude-config-target-");
		const target = join(targetDirectory, "servers.json");
		await writeFile(
			target,
			JSON.stringify({
				mcpServers: {
					"linked-project": {
						command: "secret-command",
						// biome-ignore lint/style/useNamingConvention: external MCP header fixture.
						headers: { Authorization: "Bearer secret-token" },
					},
				},
			}),
		);
		const linkedCwd = await temporaryDirectory("an1-claude-linked-");
		await symlink(target, join(linkedCwd, ".mcp.json"));
		const failedCli = discoveryRunner({ "claude mcp list": response("", 1) });
		const linkedTools = (await discoverLocalHarnesses({ cwd: linkedCwd, env: {}, run: failedCli }))[
			"claude-code"
		].inheritedTools;
		expect(linkedTools).toEqual([
			{
				name: "linked-project",
				kind: "mcp-server",
				harness: "claude-code",
				health: "unknown",
			},
		]);
		expect(JSON.stringify(linkedTools)).not.toMatch(/secret-command|Authorization|secret-token/);

		for (const setup of [
			async (_cwd: string) => undefined,
			async (cwd: string) => writeFile(join(cwd, ".mcp.json"), "{ malformed"),
			async (cwd: string) => writeFile(join(cwd, ".mcp.json"), JSON.stringify({ theme: "dark" })),
			async (cwd: string) =>
				writeFile(join(cwd, ".mcp.json"), JSON.stringify({ mcpServers: "invalid" })),
			async (cwd: string) =>
				writeFile(join(cwd, ".mcp.json"), JSON.stringify({ mcpServers: ["invalid"] })),
			async (cwd: string) =>
				writeFile(
					join(cwd, ".mcp.json"),
					JSON.stringify({ mcpServers: { "": { command: "node" }, "   ": { command: "node" } } }),
				),
			async (cwd: string) => {
				const path = join(cwd, ".mcp.json");
				await writeFile(path, JSON.stringify({ mcpServers: { unreadable: { command: "node" } } }));
				await chmod(path, 0o000);
			},
			async (cwd: string) => mkdir(join(cwd, ".mcp.json")),
			async (cwd: string) => symlink(join(cwd, "missing.json"), join(cwd, ".mcp.json")),
		]) {
			const cwd = await temporaryDirectory("an1-claude-invalid-");
			await setup(cwd);
			const tools = (await discoverLocalHarnesses({ cwd, env: {}, run: failedCli }))["claude-code"]
				.inheritedTools;
			expect(tools).toEqual([]);
		}
	});

	it.each([
		["success", response("configured: local - ✔ Connected"), false],
		["failure", response("", 1, "failed"), false],
		["timeout", undefined, true],
	] as const)(
		"owns and cleans the Claude command deadline on %s",
		async (_label, cliResult, timesOut) => {
			vi.useFakeTimers();
			const initialTimerCount = vi.getTimerCount();
			const cwd = await temporaryDirectory("an1-claude-lifetime-");
			await writeFile(
				join(cwd, ".mcp.json"),
				JSON.stringify({ mcpServers: { configured: { command: "node" } } }),
			);
			const base = discoveryRunner();
			let invocations = 0;
			let aborts = 0;
			let completions = 0;
			let capturedSignal: AbortSignal | undefined;
			let listenersAdded = 0;
			let listenersRemoved = 0;
			const addListener = vi
				.spyOn(AbortSignal.prototype, "addEventListener")
				.mockImplementation(function (this: AbortSignal, ...args) {
					listenersAdded += 1;
					return EventTarget.prototype.addEventListener.apply(this, args);
				});
			const removeListener = vi
				.spyOn(AbortSignal.prototype, "removeEventListener")
				.mockImplementation(function (this: AbortSignal, ...args) {
					listenersRemoved += 1;
					return EventTarget.prototype.removeEventListener.apply(this, args);
				});
			const pending = discoverLocalHarnesses({
				cwd,
				env: {},
				run: async (
					args,
					context?: { readonly signal: AbortSignal },
				): Promise<ReturnType<typeof response>> => {
					if (args.join(" ") !== "claude mcp list") return base(args);
					invocations += 1;
					capturedSignal = context?.signal;
					if (context?.signal.aborted) aborts += 1;
					if (cliResult) {
						completions += 1;
						return cliResult;
					}
					return new Promise(() => undefined);
				},
			});
			if (timesOut) await vi.advanceTimersByTimeAsync(15_001);
			const tools = (await pending)["claude-code"].inheritedTools;
			if (capturedSignal?.aborted) aborts += 1;
			expect({ invocations, aborts, completions }).toEqual({
				invocations: 1,
				aborts: timesOut ? 1 : 0,
				completions: timesOut ? 0 : 1,
			});
			expect(vi.getTimerCount() - initialTimerCount).toBe(timesOut ? 0 : 2);
			expect(listenersAdded - listenersRemoved).toBe(0);
			expect(tools).toContainEqual(expect.objectContaining({ name: "configured" }));
			addListener.mockRestore();
			removeListener.mockRestore();
		},
	);

	it.each(["resolve", "reject"] as const)(
		"returns once and ignores a late runner %s after timeout",
		async (lateOutcome) => {
			vi.useFakeTimers();
			const cwd = await temporaryDirectory("an1-claude-late-");
			await writeFile(
				join(cwd, ".mcp.json"),
				JSON.stringify({ mcpServers: { configured: { command: "node" } } }),
			);
			const base = discoveryRunner();
			let terminalCount = 0;
			let lateSettlements = 0;
			let capturedSignal: AbortSignal | undefined;
			const unhandled: unknown[] = [];
			const onUnhandled = (reason: unknown) => unhandled.push(reason);
			process.on("unhandledRejection", onUnhandled);
			try {
				const pending = discoverLocalHarnesses({
					cwd,
					env: {},
					run: async (args, context?: { readonly signal: AbortSignal }) => {
						if (args.join(" ") !== "claude mcp list") return base(args);
						capturedSignal = context?.signal;
						return new Promise<ReturnType<typeof response>>((resolve, reject) =>
							setTimeout(() => {
								lateSettlements += 1;
								if (lateOutcome === "resolve") resolve(response("late: local - ✔ Connected"));
								else reject(new Error("late rejection sentinel"));
							}, 20_000),
						);
					},
				}).then((result) => {
					terminalCount += 1;
					return result;
				});
				await vi.advanceTimersByTimeAsync(15_001);
				const result = await pending;
				const returned = result["claude-code"].inheritedTools;
				const snapshot = JSON.stringify(returned);
				expect(terminalCount).toBe(1);
				await vi.advanceTimersByTimeAsync(5_000);
				await Promise.resolve();
				expect({ terminalCount, lateSettlements, unhandled }).toEqual({
					terminalCount: 1,
					lateSettlements: 1,
					unhandled: [],
				});
				expect(JSON.stringify(result["claude-code"].inheritedTools)).toBe(snapshot);
				expect(capturedSignal).toBeInstanceOf(AbortSignal);
				expect(capturedSignal?.aborted).toBe(true);
				expect(returned).toContainEqual(expect.objectContaining({ name: "configured" }));
			} finally {
				process.off("unhandledRejection", onUnhandled);
			}
		},
	);
});

const capabilities: HarnessCapabilities = {
	accessMode: "api-gateway",
	preCompactionTrigger: false,
	subAgents: false,
	mcpSupport: false,
	modelProviders: ["openrouter"],
	fileEditing: false,
	toolUse: false,
	discovery: { state: "ready" },
	returnEnforcement: "none",
};

const adapter = { getCapabilities: () => capabilities } as HarnessAdapter;

describe("AdapterPool capability catalog merge", () => {
	it("prefers discovered models for registered builtin and retains known missing families", () => {
		const pool = new AdapterPool({
			builtin: {
				state: "ready",
				models: [
					{
						id: "openrouter/discovered",
						label: "Discovered",
						provider: "openrouter",
						contextWindow: 128_000,
						selectable: true,
						inheritedFromGateway: true,
						options: [],
					},
				],
			},
			codex: { state: "missing" },
			"claude-code": { state: "missing" },
			opencode: { state: "missing" },
			"cursor-agent": { state: "missing" },
		});
		pool.register("builtin", adapter, {
			type: "builtin",
			name: "Builtin",
			kind: "local",
			modelProviders: ["openrouter"],
			maxConcurrent: 1,
		});

		const catalog = pool.describe();
		expect(
			catalog.find((entry) => entry.type === "builtin")?.models.map((model) => model.id),
		).toEqual(["openrouter/discovered"]);
		expect(catalog.find((entry) => entry.type === "codex")?.discovery.state).toBe("missing");
	});
});
