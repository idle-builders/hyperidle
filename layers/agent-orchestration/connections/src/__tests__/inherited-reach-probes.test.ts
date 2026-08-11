/**
 * AU36 — inherited-reach probe behavior tests, MOVED from
 * `layers/agent-execution/harness-registry/src/__tests__/harness-discovery.test.ts`
 * (architecture.md §7.1 / §8 step 6: the claude suffix/precedence/duplicate/
 * symlink/malformed cases, re-expressed against the moved entry with the same
 * stubbed-`run` + temp-dir technique).
 *
 * The assertions are the AN1 originals with two mechanical changes: the entry
 * is `createInheritedReach().refresh(...)` instead of `discoverLocalHarnesses`,
 * and facts carry `source` where the old descriptor carried `harness`.
 */

import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInheritedReach } from "../inherited-reach.js";

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
	await Promise.all(
		temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
	);
});

/**
 * The reach probes exec only three commands; everything else fails by default.
 * (The family-probe defaults the old discoveryRunner carried are gone with the
 * family probes.)
 */
function reachRunner(overrides: Readonly<Record<string, ReturnType<typeof response>>> = {}) {
	const defaults: Readonly<Record<string, ReturnType<typeof response>>> = {
		"claude mcp list": response(
			"github: https://example.invalid - ✓ Connected\nbroken: local - ✗ Failed\nwaiting: local - pending",
		),
		"codex mcp list": response("", 1),
		"gh auth status --json hosts": response("", 1),
	};
	return async (args: readonly string[]) => {
		const key = args.join(" ");
		return overrides[key] ?? defaults[key] ?? response("", 1);
	};
}

/** The claude slice of the current snapshot. */
function claudeFactsOf(list: ReturnType<ReturnType<typeof createInheritedReach>["list"]>) {
	return list.filter((fact) => fact.source === "claude-code");
}

describe("inherited reach probe behavior (moved from harness-discovery)", () => {
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
		const base = reachRunner();
		const reach = createInheritedReach();
		const pending = reach.refresh({
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
		await pending;
		const tools = claudeFactsOf(reach.list());
		expect(tools).toEqual([
			{
				name: "slow-project",
				kind: "mcp-server",
				source: "claude-code",
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
		const reach = createInheritedReach();
		await reach.refresh({
			cwd,
			env: {},
			run: reachRunner({ "claude mcp list": cliResult }),
		});
		expect(claudeFactsOf(reach.list())).toEqual([
			{
				name: "configured",
				kind: "mcp-server",
				source: "claude-code",
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
		const reach = createInheritedReach();
		await reach.refresh({
			env: {},
			run: reachRunner({ "claude mcp list": response(stdout) }),
		});
		expect(claudeFactsOf(reach.list())).toEqual([
			{ name: "auth", kind: "mcp-server", source: "claude-code", health: "needs-attention" },
			{ name: "connected", kind: "mcp-server", source: "claude-code", health: "working" },
			{
				name: "duplicate",
				kind: "mcp-server",
				source: "claude-code",
				health: "needs-attention",
			},
			{ name: "pending", kind: "mcp-server", source: "claude-code", health: "needs-attention" },
			{ name: "spoof", kind: "mcp-server", source: "claude-code", health: "unknown" },
		]);
	});

	it("merges CLI and config identities into the exact closed fact shape", async () => {
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
		const reach = createInheritedReach();
		await reach.refresh({
			cwd,
			env: {},
			run: reachRunner({
				"claude mcp list": response(
					"global: https://example.invalid/connected - ✘ Failed\nalpha: node secret-alpha - ✔ Connected",
				),
			}),
		});
		const tools = claudeFactsOf(reach.list());
		expect(tools).toEqual([
			{ name: "alpha", kind: "mcp-server", source: "claude-code", health: "working" },
			{
				name: "global",
				kind: "mcp-server",
				source: "claude-code",
				health: "needs-attention",
			},
			{ name: "zeta", kind: "mcp-server", source: "claude-code", health: "unknown" },
		]);
		for (const tool of tools) {
			expect(Object.keys(tool).sort()).toEqual(["health", "kind", "name", "source"]);
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
		const failedCli = reachRunner({ "claude mcp list": response("", 1) });
		const linkedReach = createInheritedReach();
		await linkedReach.refresh({ cwd: linkedCwd, env: {}, run: failedCli });
		const linkedTools = claudeFactsOf(linkedReach.list());
		expect(linkedTools).toEqual([
			{
				name: "linked-project",
				kind: "mcp-server",
				source: "claude-code",
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
			const reach = createInheritedReach();
			await reach.refresh({ cwd, env: {}, run: failedCli });
			expect(claudeFactsOf(reach.list())).toEqual([]);
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
			const base = reachRunner();
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
			const reach = createInheritedReach();
			const pending = reach.refresh({
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
			await pending;
			// @lore AU36: the two surviving timers on the non-timeout path are the
			// codex and gh five-second probe races (unchanged from the AN1
			// original, where the same two races outlived discovery).
			if (capturedSignal?.aborted) aborts += 1;
			expect({ invocations, aborts, completions }).toEqual({
				invocations: 1,
				aborts: timesOut ? 1 : 0,
				completions: timesOut ? 0 : 1,
			});
			expect(vi.getTimerCount() - initialTimerCount).toBe(timesOut ? 0 : 2);
			expect(listenersAdded - listenersRemoved).toBe(0);
			expect(claudeFactsOf(reach.list())).toContainEqual(
				expect.objectContaining({ name: "configured" }),
			);
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
			const base = reachRunner();
			let terminalCount = 0;
			let lateSettlements = 0;
			let capturedSignal: AbortSignal | undefined;
			const unhandled: unknown[] = [];
			const onUnhandled = (reason: unknown) => unhandled.push(reason);
			process.on("unhandledRejection", onUnhandled);
			try {
				const reach = createInheritedReach();
				const pending = reach
					.refresh({
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
					})
					.then((result) => {
						terminalCount += 1;
						return result;
					});
				await vi.advanceTimersByTimeAsync(15_001);
				await pending;
				const returned = claudeFactsOf(reach.list());
				const snapshot = JSON.stringify(returned);
				expect(terminalCount).toBe(1);
				await vi.advanceTimersByTimeAsync(5_000);
				await Promise.resolve();
				expect({ terminalCount, lateSettlements, unhandled }).toEqual({
					terminalCount: 1,
					lateSettlements: 1,
					unhandled: [],
				});
				expect(JSON.stringify(claudeFactsOf(reach.list()))).toBe(snapshot);
				expect(capturedSignal).toBeInstanceOf(AbortSignal);
				expect(capturedSignal?.aborted).toBe(true);
				expect(returned).toContainEqual(expect.objectContaining({ name: "configured" }));
			} finally {
				process.off("unhandledRejection", onUnhandled);
			}
		},
	);
});
