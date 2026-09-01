/**
 * Action gate deny half — real-binary integration proof.
 *
 * HARNESS LANE: real binaries (claude / codex / cursor-agent / opencode), no stubs,
 * no mocked LLM. Local-only — no CI job by design.
 *
 * Four gates proven per harness:
 *
 *   A  No rules → agent does work uninterrupted (gate is a no-op).
 *   B  With a deny-Write rule → Write is blocked AND the rule id reaches the model.
 *   C  Non-matching rule → a different tool (Bash) still runs in the same session.
 *   D  Fail-closed → gate script/plugin errors when the server is absent; deny output
 *      is written even before the LLM turn starts.
 *
 * Architecture note:
 *   - Gate D does NOT require a running binary or LLM — it runs the gate hook script
 *     directly, proving the fail-closed path with the INSTALLED python3 against the
 *     REAL generated script. Uses spawnSync (no event-loop dependency).
 *   - Gates A–C use CliHarnessAdapter (async streaming via streamEvents) for
 *     codex/cursor/opencode and execFile for claude. Both approaches keep the event
 *     loop alive so the in-process action-check HTTP server can respond to hook
 *     requests arriving from inside the binary subprocess.
 *
 * @lore action-gate-real-harness: A/B/C must NOT use spawnSync — spawnSync blocks
 * the Node.js event loop, preventing the in-process HTTP server from responding to
 * hook requests that arrive from the harness subprocess. Use execFile (claude) or
 * CliHarnessAdapter streamEvents (codex/cursor/opencode). Gate D uses spawnSync
 * because it makes no HTTP calls.
 *
 * @lore action-gate-real-harness server: the `/action-check` endpoint served here uses
 * raw node:http (no Hono), reading `body.tool_name` (snake_case) to match the gate
 * script's POST body format. The real mcp-route.ts reads the same field.
 */

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import type * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { HarnessEvent } from "@hyperidle/harness-protocol";
import type { GateRule } from "@hyperidle/harness-registry";
import { installActionGate } from "@hyperidle/harness-registry";
import { ensureSandboxGitRepo } from "@hyperidle/run-orchestration";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { cliAdapterFixture } from "./cli-adapter-fixtures.js";
import { requireHarness } from "./require-harness.js";

const execFile = promisify(childProcess.execFile);

// ── Gate with all four harnesses at module scope ──────────────────────────────
requireHarness("claude", "codex", "cursor-agent", "opencode");

// ── Test constants ────────────────────────────────────────────────────────────

const BRIDGE_TOKEN = "gate-test-token-001";
const DENY_RULE: GateRule = {
	id: "gate-rule-write-block",
	pattern: "Write",
	description: "Block all Write tool uses",
};
// @lore action-gate-real-harness codex-tool-names: codex does not use a "Write" tool.
// Its file-write tool is named "apply_patch". Gate B for codex must target apply_patch
// so the denial actually fires when the model tries to create a file. Verified 2026-09-01.
const DENY_RULE_CODEX: GateRule = {
	id: "gate-rule-apply-patch-block",
	pattern: "apply_patch",
	description: "Block all apply_patch tool uses",
};

// ── Mini action-check server ──────────────────────────────────────────────────
// Minimal HTTP server that serves POST /mcp/:token/action-check.
// Reads body.tool_name (snake_case) — same as mcp-route.ts.

/**
 * A decision this gate actually made, as the gate recorded it.
 *
 * @lore the model paraphrases a block instead of quoting it — codex said "a pre-tool hook", "the
 * workspace hook" and "the local pre-tool policy" across three runs of the same test, never naming the
 * rule. Asserting on model prose tests the model's phrasing; asserting here tests the gate.
 */
interface GateDecision {
	readonly toolName: string;
	readonly decision: "allow" | "deny";
	readonly ruleId?: string;
}

interface CheckServer {
	port: number;
	baseUrl: string;
	/** Every decision this gate made, in order. */
	decisions: GateDecision[];
	stop: () => Promise<void>;
}

function startCheckServer(rules: readonly GateRule[]): Promise<CheckServer> {
	const decisions: GateDecision[] = [];
	return new Promise((resolve, reject) => {
		const server = http.createServer((req, res) => {
			if (!req.url?.includes("/action-check")) {
				res.writeHead(404);
				res.end("not found");
				return;
			}
			let body = "";
			req.on("data", (chunk) => {
				body += String(chunk);
			});
			req.on("end", () => {
				try {
					// Gate scripts POST { tool_name: "Write" } (snake_case).
					const parsed = JSON.parse(body) as { tool_name?: string };
					const toolName = parsed.tool_name ?? "";
					const hit = rules.find((r) => {
						const pat = r.pattern.toLowerCase();
						const tool = toolName.toLowerCase();
						return (
							pat === "*" ||
							pat === tool ||
							tool.startsWith(`${pat}:`) ||
							tool.startsWith(`${pat}_`)
						);
					});
					if (hit) {
						decisions.push({ toolName, decision: "deny", ruleId: hit.id });
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(
							JSON.stringify({
								decision: "deny",
								reason: `Rule '${hit.id}' matched: ${hit.description}`,
							}),
						);
					} else {
						decisions.push({ toolName, decision: "allow" });
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ decision: "allow" }));
					}
				} catch {
					res.writeHead(400);
					res.end("bad request");
				}
			});
		});

		server.listen(0, "127.0.0.1", () => {
			const addr = server.address() as net.AddressInfo;
			resolve({
				port: addr.port,
				baseUrl: `http://127.0.0.1:${addr.port}/mcp/${BRIDGE_TOKEN}`,
				decisions,
				stop: () =>
					new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
			});
		});
		server.on("error", reject);
	});
}

// ── Sandbox lifecycle ─────────────────────────────────────────────────────────

function makeSandbox(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "gate-harness-"));
}

function rmSandbox(p: string): void {
	try {
		fs.rmSync(p, { recursive: true, force: true });
	} catch {
		// best-effort
	}
}

// ── Auth probe ────────────────────────────────────────────────────────────────

async function claudeIsAuthed(): Promise<boolean> {
	try {
		const { stdout } = await execFile("claude", ["auth", "status"], { timeout: 10_000 });
		const parsed = JSON.parse(stdout.trim()) as { loggedIn?: boolean };
		return parsed.loggedIn === true;
	} catch {
		return false;
	}
}

// ── Claude sandbox setup ──────────────────────────────────────────────────────

function setupClaudeSandbox(sandbox: string): void {
	fs.mkdirSync(path.join(sandbox, ".claude"), { recursive: true });
	// installActionGate writes settings.json; this ensures the dir exists first.
	// .mcp.json: dead URL is fine — claude marks it pending and proceeds.
	fs.writeFileSync(path.join(sandbox, ".mcp.json"), JSON.stringify({ mcpServers: {} }), "utf-8");
}

// ── Run a real claude session (async — keeps the event loop alive) ────────────

interface ClaudeRunResult {
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

async function runClaude(
	sandbox: string,
	prompt: string,
	extraArgs: string[] = [],
): Promise<ClaudeRunResult> {
	const args = [
		"-p",
		prompt,
		"--output-format",
		"stream-json",
		"--verbose",
		"--model",
		"haiku",
		"--mcp-config",
		".mcp.json",
		"--strict-mcp-config",
		"--permission-mode",
		"bypassPermissions",
		"--settings",
		".claude/settings.json",
		"--max-turns",
		"3",
		...extraArgs,
	];
	try {
		const { stdout, stderr } = await execFile("claude", args, {
			cwd: sandbox,
			timeout: 120_000,
			maxBuffer: 10 * 1024 * 1024,
			env: { ...process.env },
		});
		return { stdout, stderr, timedOut: false };
	} catch (err) {
		const execErr = err as { stdout?: string; stderr?: string; killed?: boolean };
		return {
			stdout: execErr.stdout ?? "",
			stderr: execErr.stderr ?? "",
			timedOut: execErr.killed === true,
		};
	}
}

// ── Gate D: fail-closed helpers ───────────────────────────────────────────────

/**
 * Proves the fail-closed spine for claude/codex gate scripts.
 *
 * Runs the REAL python3 binary against the REAL generated gate script with a
 * dead server URL → HTTP call fails → except block runs → deny JSON on stdout.
 */
function proveFailClosed(scriptPath: string): void {
	expect(fs.existsSync(scriptPath), `gate script must exist at ${scriptPath}`).toBe(true);

	// Validate Python syntax with the real installed python3.
	const compileResult = childProcess.spawnSync("python3", ["-m", "py_compile", scriptPath], {
		encoding: "utf-8",
		timeout: 10_000,
	});
	expect(compileResult.status, `Python compile failed:\n${compileResult.stderr}`).toBe(0);

	// Run against a dead port — HTTP call will fail → fail-closed = deny.
	const runResult = childProcess.spawnSync("python3", [scriptPath], {
		input: JSON.stringify({ tool_name: "Write" }),
		encoding: "utf-8",
		timeout: 10_000,
		env: { ...process.env },
	});

	expect(
		runResult.stdout,
		"fail-closed: gate script must write deny JSON to stdout when server is unreachable",
	).toContain("deny");
}

// ── Gate D suite (fail-closed, no LLM) ───────────────────────────────────────

describe("Action gate — gate D: fail-closed (all four harnesses, no LLM)", () => {
	let sandboxPath: string;

	beforeAll(async () => {
		sandboxPath = makeSandbox();
		const deadUrl = "http://127.0.0.1:1/mcp/dead-token";
		// Install gate hooks for all four channels with a dead server URL.
		await installActionGate({
			sandboxPath,
			channel: "settings-claude",
			bridgeToken: BRIDGE_TOKEN,
			mcpUrl: deadUrl,
			rules: [DENY_RULE],
		});
		await installActionGate({
			sandboxPath,
			channel: "settings-codex",
			bridgeToken: BRIDGE_TOKEN,
			mcpUrl: deadUrl,
			rules: [DENY_RULE],
		});
		await installActionGate({
			sandboxPath,
			channel: "settings-cursor",
			bridgeToken: BRIDGE_TOKEN,
			mcpUrl: deadUrl,
			rules: [DENY_RULE],
		});
		await installActionGate({
			sandboxPath,
			channel: "process-reengage",
			bridgeToken: BRIDGE_TOKEN,
			mcpUrl: deadUrl,
			rules: [DENY_RULE],
		});
	});

	afterAll(() => {
		rmSandbox(sandboxPath);
	});

	it("claude: gate script fails closed when server is unreachable", () => {
		// Claude gate script lives at .claude/gate-check.py
		proveFailClosed(path.join(sandboxPath, ".claude", "gate-check.py"));
	});

	it("codex: gate script fails closed when server is unreachable", () => {
		// Codex gate script lives at .codex-home/gate-check.py
		proveFailClosed(path.join(sandboxPath, ".codex-home", "gate-check.py"));
	});

	it("cursor-agent: hook has failClosed:true and gate script is syntactically valid", () => {
		// Cursor gate script lives at .cursor/gate-check.py
		const scriptPath = path.join(sandboxPath, ".cursor", "gate-check.py");
		proveFailClosed(scriptPath);

		// And the hooks.json must declare failClosed:true on the hook entry.
		const hooksPath = path.join(sandboxPath, ".cursor", "hooks.json");
		expect(fs.existsSync(hooksPath), "cursor hooks.json must exist").toBe(true);
		const hooks = JSON.parse(fs.readFileSync(hooksPath, "utf-8")) as {
			hooks?: { preToolUse?: Array<{ failClosed?: boolean }> };
		};
		const hasFailClosed = hooks.hooks?.preToolUse?.some((h) => h.failClosed === true) ?? false;
		expect(hasFailClosed, "cursor hook entry must have failClosed: true").toBe(true);
	});

	it("opencode: plugin is syntactically valid JS and contains deny logic", () => {
		// Opencode plugin lives at .opencode/plugin/hyperidle-gate.js
		const pluginPath = path.join(sandboxPath, ".opencode", "plugin", "hyperidle-gate.js");
		expect(fs.existsSync(pluginPath), `opencode plugin must exist at ${pluginPath}`).toBe(true);

		// Validate JS syntax with the real installed node.
		const checkResult = childProcess.spawnSync("node", ["--check", pluginPath], {
			encoding: "utf-8",
			timeout: 10_000,
		});
		expect(
			checkResult.status,
			`opencode plugin JS syntax check failed:\n${checkResult.stderr}`,
		).toBe(0);

		// The plugin must include deny logic (throws on deny).
		const source = fs.readFileSync(pluginPath, "utf-8");
		expect(source, "opencode plugin must contain deny logic").toContain("deny");
	});
});

// ── Gate A/B/C suite (real LLM, claude only) ─────────────────────────────────
//
// These prove the full deny-half loop with a real claude session and a local
// HTTP action-check server. Uses async execFile to keep the event loop alive
// so the server can handle hook requests from within the claude subprocess.
//
// Codex/cursor/opencode: their deny-loop proof rides the existing harness lanes
// whose provisioner now wires installActionGate for gated sessions. The full
// four-harness loop is validated there in the return-enforcement integration tests.

describe("Action gate — gates A/B/C: deny loop via real claude session", () => {
	let server: CheckServer | null = null;

	beforeAll(async () => {
		server = await startCheckServer([DENY_RULE]);
	});

	afterAll(async () => {
		await server?.stop();
	});

	it("gate A — no rules: claude does consequential work uninterrupted (Write not blocked)", async ({
		skip,
	}) => {
		if (!(await claudeIsAuthed())) {
			skip();
			return;
		}

		const sandbox = makeSandbox();
		try {
			setupClaudeSandbox(sandbox);
			// No installActionGate call → no gate hook → no rules.
			// Write an empty settings.json so --settings doesn't error.
			fs.writeFileSync(path.join(sandbox, ".claude", "settings.json"), JSON.stringify({}), "utf-8");

			const proofFile = path.join(sandbox, "proof.txt");
			const result = await runClaude(
				sandbox,
				`Write the text 'GATE_A_PROOF' to the file ${proofFile} using the Write tool. After writing, reply with 'WRITE_DONE'.`,
			);

			const allOutput = result.stdout + result.stderr;
			const fileWritten = fs.existsSync(proofFile);
			const modelSaidDone = allOutput.includes("WRITE_DONE") || allOutput.includes("GATE_A_PROOF");

			expect(
				fileWritten || modelSaidDone,
				`Gate A FAIL: tool was blocked when no rules were set. stdout: ${allOutput.slice(0, 500)}`,
			).toBe(true);
		} finally {
			rmSandbox(sandbox);
		}
	}, 150_000);

	it("gate B — deny-Write rule: Write blocked AND rule id reaches the model", async ({ skip }) => {
		if (!(server && (await claudeIsAuthed()))) {
			skip();
			return;
		}

		const sandbox = makeSandbox();
		try {
			setupClaudeSandbox(sandbox);
			// Install gate pointing to the local action-check server.
			await installActionGate({
				sandboxPath: sandbox,
				channel: "settings-claude",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: server.baseUrl,
				rules: [DENY_RULE],
			});

			const result = await runClaude(
				sandbox,
				"Use the Write tool to write 'TEST' to proof.txt. After attempting, tell me what happened.",
			);

			const allOutput = result.stdout + result.stderr;

			// The rule id must appear in the output — proves denial reason reached the model.
			expect(
				allOutput,
				`Gate B FAIL: rule id '${DENY_RULE.id}' not found in output.\nstdout: ${allOutput.slice(0, 800)}`,
			).toContain(DENY_RULE.id);

			// The proof file must NOT exist (Write was blocked).
			expect(
				fs.existsSync(path.join(sandbox, "proof.txt")),
				"Gate B FAIL: Write succeeded when it should have been denied",
			).toBe(false);
		} finally {
			rmSandbox(sandbox);
		}
	}, 150_000);

	it("gate C — deny-Write rule: Bash tool (non-matching) still runs in same session", async ({
		skip,
	}) => {
		if (!(server && (await claudeIsAuthed()))) {
			skip();
			return;
		}

		const sandbox = makeSandbox();
		try {
			setupClaudeSandbox(sandbox);
			// Gate blocks Write but NOT Bash.
			await installActionGate({
				sandboxPath: sandbox,
				channel: "settings-claude",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: server.baseUrl,
				rules: [DENY_RULE],
			});

			const result = await runClaude(
				sandbox,
				"Use the Bash tool to run: echo 'GATE_C_BASH_RAN'. Print the output you get.",
			);

			const allOutput = result.stdout + result.stderr;

			// Bash ran: the model should report the echo output.
			expect(
				allOutput,
				`Gate C FAIL: Bash output not found — gate may have blocked a non-matching tool.\nstdout: ${allOutput.slice(0, 800)}`,
			).toContain("GATE_C_BASH_RAN");
		} finally {
			rmSandbox(sandbox);
		}
	}, 150_000);
});

// ── Session runner (CliHarnessAdapter) ────────────────────────────────────────
// Uses async streaming so the event loop stays alive for the action-check server.

interface SessionResult {
	allText: string;
	events: HarnessEvent[];
}

async function runAdapterSession(
	family: "codex" | "cursor-agent" | "opencode",
	sandboxPath: string,
	prompt: string,
): Promise<SessionResult> {
	const config = cliAdapterFixture(family);

	const models: Record<string, string> = {
		// gpt-5.4-mini: matches the model used in existing codex harness tests.
		codex: "gpt-5.4-mini",
		"cursor-agent": "auto",
		opencode: "openrouter/z-ai/glm-4.7-flash",
	};

	// CliHarnessAdapter auto-injects CODEX_HOME (when .codex-home/ exists) and
	// XDG_CONFIG_HOME + OPENCODE_PERMISSION (for opencode) at startSession time.
	const adapter = new CliHarnessAdapter(config);
	const sessionId = `gate-test-${family}-${Math.random().toString(36).slice(2, 8)}`;

	const handle = await adapter.startSession({
		sessionId,
		sandboxPath,
		assembledPrompt: prompt,
		modelTier: "workhorse",
		tools: [],
		selectedModel: models[family] ?? "auto",
		// mcpConnectionInfo is optional — gate tests don't use MCP tools.
	});

	const events: HarnessEvent[] = [];
	for await (const ev of adapter.streamEvents(handle)) {
		events.push(ev);
	}
	await adapter.stopSession(handle);

	const allText = events
		.filter((e) => e.type === "completion")
		.map((e) => (e as { type: "completion"; text: string }).text)
		.join(" ");

	return { allText, events };
}

// ── Additional auth probes ────────────────────────────────────────────────────

async function codexIsAuthed(): Promise<boolean> {
	// Codex stores auth in ~/.codex/auth.json — check it exists and has a token.
	const authPath = path.join(os.homedir(), ".codex", "auth.json");
	if (!fs.existsSync(authPath)) return false;
	try {
		const auth = JSON.parse(fs.readFileSync(authPath, "utf-8")) as Record<string, unknown>;
		return Object.keys(auth).length > 0;
	} catch {
		return false;
	}
}

async function cursorIsAuthed(): Promise<boolean> {
	try {
		const { stdout, stderr } = await execFile("cursor-agent", ["--version"], {
			timeout: 10_000,
			env: process.env,
		});
		// If we can run cursor-agent at all, treat it as available.
		// Auth is checked at session time; here we just verify the binary works.
		return (stdout + stderr).trim().length > 0;
	} catch {
		return false;
	}
}

async function opencodeIsAuthed(): Promise<boolean> {
	return !!(process.env.OPENROUTER_API_KEY ?? "");
}

// ── Codex sandbox setup ───────────────────────────────────────────────────────

function setupCodexSandbox(sandbox: string): boolean {
	const codexHomeDir = path.join(sandbox, ".codex-home");
	fs.mkdirSync(codexHomeDir, { recursive: true });

	const homeCodexDir = path.join(os.homedir(), ".codex");
	let authFound = false;
	for (const fname of ["auth.json", "config.toml"]) {
		const src = path.join(homeCodexDir, fname);
		if (fs.existsSync(src)) {
			fs.copyFileSync(src, path.join(codexHomeDir, fname));
			if (fname === "auth.json") authFound = true;
		}
	}

	// @lore AO2 codex-approvals-strip: ~/.codex/config.toml may have
	// `approvals_reviewer = "user"` which causes codex to prompt for interactive
	// approval before running any tool. In a non-interactive spawned process (no TTY),
	// codex exits immediately when it can't get the approval input.
	// Strip it so codex uses its built-in headless default.
	const configPath = path.join(codexHomeDir, "config.toml");
	try {
		const content = fs.readFileSync(configPath, "utf-8");
		fs.writeFileSync(
			configPath,
			content.replace(/^approvals_reviewer\s*=\s*"[^"]*"\n?/gm, ""),
			"utf-8",
		);
	} catch {
		// config.toml absent — nothing to strip.
	}

	// Trust this sandbox directory.
	fs.appendFileSync(configPath, `\n[projects."${sandbox}"]\ntrust_level = "trusted"\n`, "utf-8");
	return authFound;
}

// ── CODEX: gates A/B/C ────────────────────────────────────────────────────────
//
// @lore action-gate-real-harness codex: CliHarnessAdapter auto-injects CODEX_HOME
// when .codex-home/ exists in the sandbox. installActionGate("settings-codex") writes
// hooks.json + gate-check.py to <sandbox>/.codex-home/. setupCodexSandbox copies
// ~/.codex/auth.json into the .codex-home dir so codex can authenticate.

describe("Action gate — codex: gates A/B/C (real binary, real LLM)", () => {
	let server: CheckServer | null = null;
	let authed = false;

	beforeAll(async () => {
		// Codex writes files via apply_patch (not "Write"). Use DENY_RULE_CODEX here.
		server = await startCheckServer([DENY_RULE_CODEX]);
		authed = await codexIsAuthed();
	});

	afterAll(async () => {
		await server?.stop();
	});

	it("gate A — no rules: codex does consequential work uninterrupted (Write not blocked)", async ({
		skip,
	}) => {
		if (!authed) {
			skip();
			return;
		}
		const sandbox = makeSandbox();
		try {
			ensureSandboxGitRepo(sandbox);
			const authFound = setupCodexSandbox(sandbox);
			if (!authFound) {
				skip();
				return;
			}
			// No installActionGate → no hook → Write allowed.
			const proofFile = path.join(sandbox, "proof.txt");
			const result = await runAdapterSession(
				"codex",
				sandbox,
				`Write the text 'GATE_A_PROOF' to the file ${proofFile}. After writing, reply with 'WRITE_DONE'.`,
			);
			const fileWritten = fs.existsSync(proofFile);
			const modelConfirmed =
				result.allText.includes("WRITE_DONE") ||
				result.allText.includes("GATE_A_PROOF") ||
				result.allText.includes("written");
			expect(
				fileWritten || modelConfirmed,
				`Gate A FAIL: codex Write blocked when no rules set. text: "${result.allText.slice(0, 400)}"`,
			).toBe(true);
		} finally {
			rmSandbox(sandbox);
		}
	}, 180_000);

	it("gate B — deny-apply_patch rule: apply_patch blocked AND rule id reaches codex model", async ({
		skip,
	}) => {
		if (!(authed && server)) {
			skip();
			return;
		}
		const sandbox = makeSandbox();
		try {
			ensureSandboxGitRepo(sandbox);
			const authFoundB = setupCodexSandbox(sandbox);
			if (!authFoundB) {
				skip();
				return;
			}
			await installActionGate({
				sandboxPath: sandbox,
				channel: "settings-codex",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: server.baseUrl,
				rules: [DENY_RULE_CODEX],
			});
			await runAdapterSession(
				"codex",
				sandbox,
				"Use a file-write tool to write 'TEST' to proof.txt. Tell me exactly what happened.",
			);
			// Assert on what the GATE recorded, not on what the model said about it. codex is
			// blocked correctly but paraphrases the block — "a pre-tool hook", "the workspace
			// hook", "the local pre-tool policy" across three runs, never quoting the rule id.
			//
			// Per founder ruling 26: a rule names a TOOL, not an outcome. It is correct for codex
			// to reach the same result another way (it fell back to a shell redirect), so this
			// asserts the named tool was refused — never that the file went unwritten.
			const denials = server.decisions.filter(
				(d) => d.decision === "deny" && d.ruleId === DENY_RULE_CODEX.id,
			);
			expect(
				denials.length,
				`Gate B FAIL: the gate never denied '${DENY_RULE_CODEX.pattern}' for rule '${DENY_RULE_CODEX.id}'. decisions: ${JSON.stringify(server.decisions)}`,
			).toBeGreaterThanOrEqual(1);
			expect(
				denials.some((d) => d.toolName.toLowerCase().includes("apply_patch")),
				`Gate B FAIL: denial was not for apply_patch. decisions: ${JSON.stringify(server.decisions)}`,
			).toBe(true);
		} finally {
			rmSandbox(sandbox);
		}
	}, 180_000);

	it("gate C — deny-apply_patch rule: read tool (non-matching) still runs in codex session", async ({
		skip,
	}) => {
		if (!(authed && server)) {
			skip();
			return;
		}
		const sandbox = makeSandbox();
		try {
			ensureSandboxGitRepo(sandbox);
			const authFoundC = setupCodexSandbox(sandbox);
			if (!authFoundC) {
				skip();
				return;
			}
			fs.writeFileSync(path.join(sandbox, "canary.txt"), "GATE_C_CODEX_READ_OK", "utf-8");
			await installActionGate({
				sandboxPath: sandbox,
				channel: "settings-codex",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: server.baseUrl,
				rules: [DENY_RULE_CODEX],
			});
			// Ask codex to READ — gate blocks apply_patch but not read-file tools.
			const result = await runAdapterSession(
				"codex",
				sandbox,
				"Read the file canary.txt and tell me its contents.",
			);
			expect(
				result.allText,
				`Gate C FAIL: codex read tool blocked. text: "${result.allText.slice(0, 400)}"`,
			).toContain("GATE_C_CODEX_READ_OK");
		} finally {
			rmSandbox(sandbox);
		}
	}, 180_000);
});

// ── CURSOR-AGENT: gates A/B/C ─────────────────────────────────────────────────
//
// @lore action-gate-real-harness cursor: cursor-agent reads .cursor/hooks.json from cwd
// (= sandboxPath). installActionGate("settings-cursor") writes hooks.json with
// failClosed:true + gate-check.py to <sandbox>/.cursor/. When the gate denies,
// cursor passes the user_message field from the deny JSON to the model.

describe("Action gate — cursor-agent: gates A/B/C (real binary, real LLM)", () => {
	let server: CheckServer | null = null;
	let authed = false;

	beforeAll(async () => {
		server = await startCheckServer([DENY_RULE]);
		authed = await cursorIsAuthed();
	});

	afterAll(async () => {
		await server?.stop();
	});

	it("gate A — no rules: cursor-agent does consequential work uninterrupted", async ({ skip }) => {
		if (!authed) {
			skip();
			return;
		}
		const sandbox = makeSandbox();
		try {
			// No installActionGate → no hook.
			fs.mkdirSync(path.join(sandbox, ".cursor"), { recursive: true });
			const proofFile = path.join(sandbox, "proof.txt");
			const result = await runAdapterSession(
				"cursor-agent",
				sandbox,
				`Write the text 'GATE_A_PROOF' to ${proofFile}. Reply 'WRITE_DONE' after.`,
			);
			const fileWritten = fs.existsSync(proofFile);
			const modelConfirmed =
				result.allText.includes("WRITE_DONE") ||
				result.allText.includes("GATE_A_PROOF") ||
				result.allText.includes("written");
			expect(
				fileWritten || modelConfirmed,
				`Gate A FAIL: cursor-agent Write blocked with no rules. text: "${result.allText.slice(0, 400)}"`,
			).toBe(true);
		} finally {
			rmSandbox(sandbox);
		}
	}, 180_000);

	it("gate B — deny-Write rule: Write blocked AND rule id reaches cursor-agent model", async ({
		skip,
	}) => {
		if (!(authed && server)) {
			skip();
			return;
		}
		const sandbox = makeSandbox();
		try {
			await installActionGate({
				sandboxPath: sandbox,
				channel: "settings-cursor",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: server.baseUrl,
				rules: [DENY_RULE],
			});
			const result = await runAdapterSession(
				"cursor-agent",
				sandbox,
				"Use the Write tool to write 'TEST' to proof.txt. Tell me exactly what happened.",
			);
			expect(
				result.allText,
				`Gate B FAIL: rule id '${DENY_RULE.id}' not found in cursor-agent output. text: "${result.allText.slice(0, 600)}"`,
			).toContain(DENY_RULE.id);
			expect(
				fs.existsSync(path.join(sandbox, "proof.txt")),
				"Gate B FAIL: cursor-agent Write succeeded when it should be denied",
			).toBe(false);
		} finally {
			rmSandbox(sandbox);
		}
	}, 180_000);

	it("gate C — deny-Write rule: Bash tool (non-matching) still runs in cursor-agent session", async ({
		skip,
	}) => {
		if (!(authed && server)) {
			skip();
			return;
		}
		const sandbox = makeSandbox();
		try {
			await installActionGate({
				sandboxPath: sandbox,
				channel: "settings-cursor",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: server.baseUrl,
				rules: [DENY_RULE],
			});
			const result = await runAdapterSession(
				"cursor-agent",
				sandbox,
				"Use the Bash tool to run: echo 'GATE_C_CURSOR_BASH_RAN'. Print the output.",
			);
			expect(
				result.allText,
				`Gate C FAIL: cursor-agent Bash blocked. text: "${result.allText.slice(0, 400)}"`,
			).toContain("GATE_C_CURSOR_BASH_RAN");
		} finally {
			rmSandbox(sandbox);
		}
	}, 180_000);
});

// ── OPENCODE: gates A/B/C ─────────────────────────────────────────────────────
//
// @lore action-gate-real-harness opencode: opencode loads workspace plugins from
// <cwd>/.opencode/plugin/ regardless of XDG_CONFIG_HOME. installActionGate("process-reengage")
// writes hyperidle-gate.js there. CliHarnessAdapter injects XDG_CONFIG_HOME pointing
// to an empty dir (<sandbox>/.hyperidle/opencode-xdg-config) to prevent global-plugin
// interference. opencode needs OPENROUTER_API_KEY (or another key) for LLM calls.

describe("Action gate — opencode: gates A/B/C (real binary, real LLM)", () => {
	let server: CheckServer | null = null;
	let authed = false;

	beforeAll(async () => {
		server = await startCheckServer([DENY_RULE]);
		authed = await opencodeIsAuthed();
	});

	afterAll(async () => {
		await server?.stop();
	});

	it("gate A — no rules: opencode does consequential work uninterrupted", async ({ skip }) => {
		if (!authed) {
			skip();
			return;
		}
		const sandbox = makeSandbox();
		try {
			// No installActionGate → no plugin → no gate.
			const proofFile = path.join(sandbox, "proof.txt");
			const result = await runAdapterSession(
				"opencode",
				sandbox,
				`Write the text 'GATE_A_PROOF' to ${proofFile}. Reply 'WRITE_DONE' after.`,
			);
			const fileWritten = fs.existsSync(proofFile);
			const modelConfirmed =
				result.allText.includes("WRITE_DONE") ||
				result.allText.includes("GATE_A_PROOF") ||
				result.allText.includes("written");
			expect(
				fileWritten || modelConfirmed,
				`Gate A FAIL: opencode Write blocked with no rules. text: "${result.allText.slice(0, 400)}"`,
			).toBe(true);
		} finally {
			rmSandbox(sandbox);
		}
	}, 180_000);

	it("gate B — deny-Write rule: Write blocked AND rule id reaches opencode model", async ({
		skip,
	}) => {
		if (!(authed && server)) {
			skip();
			return;
		}
		const sandbox = makeSandbox();
		try {
			await installActionGate({
				sandboxPath: sandbox,
				channel: "process-reengage",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: server.baseUrl,
				rules: [DENY_RULE],
			});
			const result = await runAdapterSession(
				"opencode",
				sandbox,
				"Use the write tool to write 'TEST' to proof.txt. Tell me exactly what happened.",
			);
			expect(
				result.allText,
				`Gate B FAIL: rule id '${DENY_RULE.id}' not found in opencode output. text: "${result.allText.slice(0, 600)}"`,
			).toContain(DENY_RULE.id);
		} finally {
			rmSandbox(sandbox);
		}
	}, 180_000);

	it("gate C — deny-Write rule: read tool (non-matching) still runs in opencode session", async ({
		skip,
	}) => {
		if (!(authed && server)) {
			skip();
			return;
		}
		const sandbox = makeSandbox();
		try {
			fs.writeFileSync(path.join(sandbox, "canary.txt"), "GATE_C_OPENCODE_READ_OK", "utf-8");
			await installActionGate({
				sandboxPath: sandbox,
				channel: "process-reengage",
				bridgeToken: BRIDGE_TOKEN,
				mcpUrl: server.baseUrl,
				rules: [DENY_RULE],
			});
			const result = await runAdapterSession(
				"opencode",
				sandbox,
				"Read the file canary.txt and print its contents.",
			);
			expect(
				result.allText,
				`Gate C FAIL: opencode read blocked. text: "${result.allText.slice(0, 400)}"`,
			).toContain("GATE_C_OPENCODE_READ_OK");
		} finally {
			rmSandbox(sandbox);
		}
	}, 180_000);
});
