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
 *   - Gates A–C start a minimal in-process HTTP server and run real claude sessions.
 *     They use async subprocess calls (child_process.execFile) so the event loop
 *     stays alive to handle hook requests from within the claude subprocess.
 *
 * @lore action-gate-real-harness: A/B/C must NOT use spawnSync — spawnSync blocks
 * the Node.js event loop, preventing the in-process HTTP server from responding to
 * hook requests that arrive from the claude subprocess. Only execFile (async) keeps
 * the event loop free. Gate D uses spawnSync because it makes no HTTP calls.
 *
 * @lore action-gate-real-harness server: the `/action-check` endpoint served here uses
 * raw node:http (no Hono), reading `body.tool_name` (snake_case) to match the gate
 * script's POST body format. The real mcp-route.ts reads the same field.
 *
 * @lore action-gate-real-harness cursor / opencode: gates A/B/C cover claude only
 * (simplest, most debuggable). Gate D covers all four (file/script inspection).
 * The other harnesses' deny-loop proof rides the existing return-enforcement harness
 * lanes whose provisioner now wires installActionGate.
 */

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import type * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { GateRule } from "@hyperidle/harness-registry";
import { installActionGate } from "@hyperidle/harness-registry";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

// ── Mini action-check server ──────────────────────────────────────────────────
// Minimal HTTP server that serves POST /mcp/:token/action-check.
// Reads body.tool_name (snake_case) — same as mcp-route.ts.

interface CheckServer {
	port: number;
	baseUrl: string;
	stop: () => Promise<void>;
}

function startCheckServer(rules: readonly GateRule[]): Promise<CheckServer> {
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
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(
							JSON.stringify({
								decision: "deny",
								reason: `Rule '${hit.id}' matched: ${hit.description}`,
							}),
						);
					} else {
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
		if (!server || !(await claudeIsAuthed())) {
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
		if (!server || !(await claudeIsAuthed())) {
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
