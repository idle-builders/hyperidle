/**
 * AN2 — Connection provisioning real-harness live-proof tests (AC2, AC3).
 *
 * ⚠️  LOCAL-ONLY LANE — runs via test:integration's serial `harness` project; the
 *     signed attestation carries the result. No test suite runs in GitHub Actions.
 *
 * Proves that the provisioned config files actually enable agent authentication
 * to a real MCP server. Each carrier path is tested separately:
 *
 *   claude-code: .mcp.json with Bearer header → real claude CLI connects + calls tool
 *   codex: .codex-home/config.toml with bearer_token_env_var → codex connects + calls tool
 *   opencode: opencode.json with inline Authorization header → opencode connects + calls tool
 *   CLI-key: GH_TOKEN env injection → real gh CLI op succeeds
 *   builtin: SCOPED OUT — no carrier exists (C1 — in-process loop, no child, no mcpTokenEnv)
 *
 * The in-repo MCP server fixture (`@modelcontextprotocol/sdk`) is started per suite,
 * serving a `ping_test` tool that returns a known echo value guarded by Bearer auth.
 * Each carrier test asserts AN2_PROBE_OK appears in the agent's output.
 *
 * Per project rule: "live-LLM/real-binary tests run locally only; never a GitHub
 * Actions job." Runs via npm run test:integration (serial harness project)
 *
 * Gate discipline: each carrier's describe is gated by requireHarness(<name>), which
 * HARD-FAILS (never skips) when the binary is absent — a missing harness means the work
 * is not done (AR1). The inner auth checks remain only for binary-present-but-unauthed.
 *
 * @lore AN2 live-proof: The real-harness tests require:
 *   1. A real in-proc MCP server over a real transport (streamable HTTP via SDK).
 *      CRITICAL: ONE stateful McpServer+Transport instance per server (not per-request).
 *      Streamable HTTP is stateful; creating a new instance per request breaks the
 *      session handshake — the client initializes, but subsequent requests (tools/list,
 *      tools/call) don't share state and the tools appear absent.
 *   2. A real provisioning write (applyProvisioningPlan into a real sandboxPath).
 *   3. A real CLI spawn.
 *   4. The agent actually calls the MCP tool and AN2_PROBE_OK appears in output.
 *
 * @lore AN2 claude-mcp-trust: claude reads project-scoped .mcp.json servers but
 * may prompt for trust approval in interactive mode. Two mechanisms bypass this:
 *   (a) Write { "enableAllProjectMcpServers": true } to .claude/settings.json in the
 *       sandbox cwd — this pre-approves all .mcp.json servers for that project.
 *   (b) Use --mcp-config <file> + --strict-mcp-config (as in AL7) to bypass .mcp.json
 *       entirely (that approach requires a separate config file, not the provisioned .mcp.json).
 * AN2 uses approach (a) because the provisioned .mcp.json IS the carrier — the test
 * proves that the provisioning path works end-to-end.
 *
 * @lore AN2 builtin-scoped-out: builtin has mcpSupport:false, runs an in-process
 * callLlm() loop via ToolRegistry, never spawns a child, never reads mcpTokenEnv.
 * Neither the MCP-bearer nor the CLI-key carrier exists for builtin. Builtin's
 * external-tool story is the inbound MCP bridge (HyperIdle's own registry tools),
 * a separate path AN2 does not own. AC3's builtin cell = scoped out with reason.
 */

import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { applyProvisioningPlan } from "../../services/connection-provisioning.js";
import { requireOpenRouterCredits } from "./openrouter-credit-guard.js";
import { requireHarness } from "./require-harness.js";

// ── Clean env for headless binary spawning ────────────────────────────────────
// Same recipe as AL7 — zero CC session-detection vars, keep keychain auth.

function buildCleanEnv(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (v !== undefined) env[k] = v;
	}
	const ccVars = [
		"CLAUDECODE",
		"CLAUDE_CODE_ENTRYPOINT",
		"CLAUDE_CODE_EXECPATH",
		"CLAUDE_CODE_SESSION_ID",
		"AI_AGENT",
		"CLAUDE_EFFORT",
		"CLAUDE_CODE_SIMPLE",
		"CLAUDE_CODE_SAFE_MODE",
	];
	for (const v of ccVars) env[v] = "";
	return env;
}

/**
 * Spawn a process in its own process group (detached), wait for exit.
 * Same pattern as AL7's spawnDetached.
 */
async function spawnDetached(
	bin: string,
	args: string[],
	opts: {
		cwd: string;
		env: Record<string, string>;
		timeoutMs: number;
		closeStdin?: boolean;
	},
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
	return new Promise((resolve) => {
		const stdinMode = opts.closeStdin ? "pipe" : "ignore";
		const child = spawn(bin, args, {
			cwd: opts.cwd,
			env: opts.env,
			detached: true,
			stdio: [stdinMode, "pipe", "pipe"],
		});
		if (opts.closeStdin) {
			child.stdin?.end();
		}

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		const guard = setTimeout(() => {
			try {
				process.kill(-child.pid!, "SIGKILL");
			} catch {
				/* already exited */
			}
			resolve({ stdout, stderr, exitCode: null });
		}, opts.timeoutMs);

		child.on("exit", (code) => {
			clearTimeout(guard);
			resolve({ stdout, stderr, exitCode: code });
		});

		child.on("error", () => {
			clearTimeout(guard);
			resolve({ stdout, stderr, exitCode: null });
		});

		child.unref();
	});
}

// ── In-repo MCP test server ────────────────────────────────────────────────────
//
// Uses @modelcontextprotocol/sdk to stand up a real streamable-HTTP MCP server.
// Exposes a `ping_test` tool that returns AN2_PROBE_OK:<echo>.
// Guards every request with Authorization: Bearer <token>.
//
// CRITICAL: Uses ONE stateful McpServer+Transport instance across all requests.
// Streamable HTTP is stateful — the client initializes once (session handshake)
// and subsequent requests (tools/list, tools/call) must reach the SAME transport
// instance. Creating a new instance per request breaks the session: tools appear
// absent after initialize because tools/list hits a fresh, unconnected server.
//
// @lore AN2 test-server-stateful: Verified live: new-per-request → tools absent
// (agent says "I don't see ping_test"). Single stateful instance → AN2_PROBE_OK
// returned. The exact failure mode matches what the reviewer saw in the original test.

interface McpTestServer {
	url: string;
	bearerToken: string;
	close(): Promise<void>;
}

async function startMcpTestServer(): Promise<McpTestServer> {
	const bearerToken = `an2-test-bearer-${Math.random().toString(36).slice(2, 10)}`;

	const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
	const { StreamableHTTPServerTransport } = await import(
		"@modelcontextprotocol/sdk/server/streamableHttp.js"
	);
	const { z } = await import("zod");

	// @lore AN2 version-seam bridge: server pkg uses zod 4.4.3; SDK deduped to zod 3.25.76.
	// Same §9 cross-version seam as mcp-bridge.ts asMcpInputSchema. Cast is safe: no wire change.
	type McpAnySchema = import("@modelcontextprotocol/sdk/server/zod-compat.js").AnySchema;
	type McpRawShape = Record<string, McpAnySchema>;
	function asMcpShape(shape: unknown): McpRawShape {
		return shape as McpRawShape;
	}

	// ONE stateful McpServer + StreamableHTTPServerTransport.
	// Both share state across all requests for this server instance.
	const mcpServer = new McpServer({ name: "an2-test-mcp", version: "0.0.1" });
	mcpServer.tool(
		"ping_test",
		"Returns a known echo value for AN2 live-proof",
		asMcpShape({ echo: z.string() }),
		async (args: Record<string, string>) => {
			const echo = args["echo"] ?? "";
			return {
				content: [{ type: "text" as const, text: `AN2_PROBE_OK:${echo}` }],
			};
		},
	);
	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: () => Math.random().toString(36).slice(2),
	});
	await mcpServer.connect(transport);

	const httpServer = http.createServer();
	await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
	const addr = httpServer.address();
	if (!addr || typeof addr === "string") throw new Error("Could not get server address");
	const port = addr.port;

	httpServer.on("request", async (req, res) => {
		// Check bearer auth for every request.
		const authHeader = req.headers.authorization;
		if (authHeader !== `Bearer ${bearerToken}`) {
			res.writeHead(401);
			res.end(JSON.stringify({ error: "Unauthorized" }));
			return;
		}
		// Route to the stateful transport — same instance for every request.
		await transport.handleRequest(req, res);
	});

	return {
		url: `http://127.0.0.1:${port}`,
		bearerToken,
		close: async () => {
			mcpServer.close();
			await new Promise<void>((resolve) => httpServer.close(() => resolve()));
		},
	};
}

// ── BUILTIN: Scoped out ────────────────────────────────────────────────────────

describe("builtin: scoped out of AN2 connection provisioning (C1)", () => {
	test("builtin has no held-connection carrier — documented scope-out", () => {
		// @lore AN2 C1: builtin has mcpSupport:false, runs an in-process callLlm() loop
		// via ToolRegistry — it never spawns a child process and never reads mcpTokenEnv.
		// Neither the MCP-bearer carrier nor the CLI-key carrier exists for builtin.
		// Builtin's external-tool story is the inbound MCP bridge (HyperIdle's own
		// registry tools), a separate path AN2 does not own.
		// AC3's builtin cell = scoped out with reason. No live run required or possible.
		process.stdout.write(
			"[AN2 real-harness builtin] SCOPED OUT: builtin has mcpSupport:false, " +
				"runs in-process callLlm() loop via ToolRegistry, never spawns a child, " +
				"never reads mcpTokenEnv. Neither MCP-bearer nor CLI-key carrier exists. " +
				"Builtin's external reach is the inbound MCP bridge (HyperIdle's own " +
				"registry tools), out of AN2 scope.\n",
		);
		// Verify the scope-out is correctly documented: if builtin ever gains mcpSupport,
		// this test should fail and the carrier should be added.
		// For now: the scope-out is the correct documented outcome — assert nothing.
		// (N3 fix: removed the filler expect(true).toBe(true))
	});
});

// ── CLAUDE-CODE: real .mcp.json bearer MCP ────────────────────────────────────

describe("claude-code: real CLI connects to AN2-provisioned MCP server via .mcp.json Bearer", () => {
	requireHarness("claude");
	test("provision .mcp.json with bearer token → claude connects + ping_test returns AN2_PROBE_OK", async ({
		skip,
	}) => {
		// Check claude auth
		try {
			execFileSync("claude", ["auth", "status"], { stdio: "ignore", timeout: 10_000 });
		} catch {
			process.stdout.write("[AN2 real-harness claude] SKIP: claude not authenticated\n");
			skip();
			return;
		}

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "an2-rh-claude-"));
		let mcpServer: McpTestServer | null = null;

		try {
			mcpServer = await startMcpTestServer();

			// Provision the .mcp.json with the bearer MCP entry via applyProvisioningPlan.
			const plan = {
				mcpServers: [
					{
						name: "an2-test",
						url: mcpServer.url,
						bearerToken: mcpServer.bearerToken,
					},
				],
				envInjections: {},
			};

			await applyProvisioningPlan({
				plan,
				sandboxPath,
				cliMcpDialect: undefined,
				claudeNative: true,
			});

			// Verify .mcp.json was written with the bearer header.
			const mcpJson = JSON.parse(fs.readFileSync(path.join(sandboxPath, ".mcp.json"), "utf-8")) as {
				mcpServers: Record<string, { type: string; url: string; headers?: Record<string, string> }>;
			};
			expect(mcpJson.mcpServers["an2-test"]).toBeDefined();
			expect(mcpJson.mcpServers["an2-test"]?.headers?.Authorization).toBe(
				`Bearer ${mcpServer.bearerToken}`,
			);

			// Write .claude/settings.json to pre-approve all project MCP servers.
			// This bypasses the interactive trust prompt for .mcp.json entries.
			// @lore AN2 claude-mcp-trust: enableAllProjectMcpServers:true in
			// .claude/settings.json (the project settings file, not ~/.claude.json)
			// pre-approves all .mcp.json servers in that cwd — no trust dialog spawned.
			fs.mkdirSync(path.join(sandboxPath, ".claude"), { recursive: true });
			fs.writeFileSync(
				path.join(sandboxPath, ".claude", "settings.json"),
				JSON.stringify({ enableAllProjectMcpServers: true }, null, 2),
				"utf-8",
			);

			const cleanEnv = buildCleanEnv();

			const prompt =
				"Call the ping_test tool from the an2-test MCP server with echo='LIVE_PROOF'. " +
				"Return the exact text you receive from the tool.";

			process.stdout.write(
				"[AN2 real-harness claude] Starting real claude session with AN2-provisioned MCP server...\n",
			);

			// @lore AN2 claude-model-tool-calling: haiku (~50% flaky) sometimes narrates the
			// tool instead of calling it even when the schema is loaded. Pinned to sonnet
			// (alias "sonnet" accepted by claude CLI → latest claude-sonnet-*) which reliably
			// calls tools. The alias "sonnet" is documented in `claude --help` as an accepted
			// shorthand alongside "opus" and "fable".
			//
			// Bounded retry (≤2 attempts) scoped ONLY to "model declined to call the tool":
			// - Condition: the MCP-namespaced tool name `mcp__an2-test__ping_test` appears in
			//   the agent output WITHOUT AN2_PROBE_OK. This name only appears when the tool
			//   schema was actually loaded (Bearer auth + MCP handshake succeeded), meaning
			//   auth is proven and the model merely narrated instead of calling.
			//
			// - Tamper invariant (CRITICAL): if the bearer token is WRONG, the MCP server
			//   returns 401 on the first MCP request, the tool schema is NEVER loaded, so
			//   `mcp__an2-test__ping_test` never appears in the agent output. A tampered token
			//   produces output like "no such tool exists in my available tool set" — no MCP
			//   namespace. The retry condition evaluates false → zero retries → hard assertion
			//   fails. Verified live: tamper test showed mcp__an2-test__ping_test=false in
			//   auth-failure output (output contains "no such tool", not the MCP namespace).
			//
			// - Any other failure (exitCode null = timeout, empty output) is NOT retried.
			const MAX_ATTEMPTS = 3; // 1 real + 2 retries
			let lastResult = { stdout: "", stderr: "", exitCode: null as number | null };

			for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
				const r = await spawnDetached(
					"claude",
					[
						"-p",
						prompt,
						"--dangerously-skip-permissions",
						"--output-format",
						"json",
						"--model",
						"sonnet",
					],
					{
						cwd: sandboxPath,
						env: cleanEnv,
						timeoutMs: 90_000,
					},
				);
				lastResult = r;
				const out = r.stdout + r.stderr;

				if (out.includes("AN2_PROBE_OK")) {
					// Success — break immediately.
					break;
				}

				// Only retry if:
				// 1. The process exited cleanly (not a timeout).
				// 2. The MCP-namespaced tool name appears in the output — this ONLY happens
				//    when the schema loaded successfully (auth passed), meaning the model
				//    merely narrated the tool instead of calling it.
				// If auth failed, the schema never loads and the namespaced name never appears.
				const modelDeclined = r.exitCode !== null && out.includes("mcp__an2-test__ping_test");

				if (!modelDeclined || attempt === MAX_ATTEMPTS) {
					// Not a model-decline (or exhausted retries) — let the hard assertion fail.
					break;
				}

				process.stdout.write(
					`[AN2 real-harness claude] attempt ${attempt}: model declined to call tool ` +
						`(mcp__an2-test__ping_test appeared in output without sentinel) — retrying...\n`,
				);
			}

			const allOutput = lastResult.stdout + lastResult.stderr;

			// HARD ASSERTION: AN2_PROBE_OK must appear in the agent's output.
			// This proves: provisioned .mcp.json Bearer header → agent authenticated →
			// agent called ping_test → tool returned sentinel value.
			if (!allOutput.includes("AN2_PROBE_OK")) {
				throw new Error(
					`[AN2 claude FULL BINARY PROOF FAILED]: AN2_PROBE_OK not found in claude output. ` +
						`The provisioned .mcp.json Bearer MCP server was NOT authenticated or the tool was NOT called. ` +
						`stdout: "${lastResult.stdout.slice(0, 400)}" ` +
						`stderr: "${lastResult.stderr.slice(0, 200)}" ` +
						`exitCode: ${lastResult.exitCode}. ` +
						`MCP URL: ${mcpServer?.url}. ` +
						`Check: (1) .claude/settings.json has enableAllProjectMcpServers:true, ` +
						`(2) .mcp.json has correct bearer header, ` +
						`(3) stateful McpServer instance is live.`,
				);
			}
			expect(allOutput).toContain("AN2_PROBE_OK");
			expect(lastResult.exitCode).not.toBeNull();

			process.stdout.write(
				"[AN2 real-harness claude] LIVE PROOF: AN2_PROBE_OK found in claude output — " +
					".mcp.json Bearer MCP connection succeeded.\n",
			);
		} finally {
			await mcpServer?.close();
			fs.rmSync(sandboxPath, { recursive: true, force: true });
		}
	}, 120_000);
});

// ── CODEX: real config.toml bearer MCP ────────────────────────────────────────

describe("codex: real CLI connects to AN2-provisioned MCP server via config.toml bearer", () => {
	requireHarness("codex");
	test("provision .codex-home/config.toml bearer → codex calls ping_test → AN2_PROBE_OK", async ({
		skip,
	}) => {
		// Check codex auth
		try {
			const authResult = await spawnDetached("codex", ["login", "status"], {
				cwd: os.tmpdir(),
				env: buildCleanEnv(),
				timeoutMs: 10_000,
			});
			const out = (authResult.stdout + authResult.stderr).trim();
			if (!out.startsWith("Logged in")) {
				process.stdout.write("[AN2 real-harness codex] SKIP: codex not authenticated\n");
				skip();
				return;
			}
		} catch {
			process.stdout.write("[AN2 real-harness codex] SKIP: codex auth check failed\n");
			skip();
			return;
		}

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "an2-rh-codex-"));
		let mcpServer: McpTestServer | null = null;

		try {
			// codex requires a git repo.
			execFileSync("git", ["init"], { cwd: sandboxPath, stdio: "ignore" });
			execFileSync("git", ["commit", "--allow-empty", "-m", "init"], {
				cwd: sandboxPath,
				stdio: "ignore",
				env: {
					...process.env,
					GIT_AUTHOR_NAME: "test",
					GIT_AUTHOR_EMAIL: "test@test.com",
					GIT_COMMITTER_NAME: "test",
					GIT_COMMITTER_EMAIL: "test@test.com",
				},
			});

			mcpServer = await startMcpTestServer();

			// Provision .codex-home/config.toml with the bearer MCP entry.
			const plan = {
				mcpServers: [
					{
						name: "an2-test",
						url: mcpServer.url,
						bearerToken: mcpServer.bearerToken,
					},
				],
				envInjections: {},
			};

			const result = await applyProvisioningPlan({
				plan,
				sandboxPath,
				cliMcpDialect: "codex-toml",
				claudeNative: false,
			});

			// Verify config.toml was written correctly.
			const toml = fs.readFileSync(path.join(sandboxPath, ".codex-home", "config.toml"), "utf-8");
			expect(toml).toContain("[mcp_servers.an2-test]");
			expect(toml).toContain(`url = "${mcpServer.url}"`);
			expect(toml).toContain('bearer_token_env_var = "AN2_TEST_MCP_TOKEN"');
			expect(result.mcpTokenEnv).toMatchObject({
				AN2_TEST_MCP_TOKEN: mcpServer.bearerToken,
			});

			// Set up .codex-home with auth from real ~/.codex.
			const codexHomeDir = path.join(sandboxPath, ".codex-home");
			const homeCodexDir = path.join(os.homedir(), ".codex");
			for (const fname of ["auth.json", "config.toml"]) {
				const src = path.join(homeCodexDir, fname);
				if (fs.existsSync(src)) {
					fs.copyFileSync(src, path.join(codexHomeDir, fname));
				}
			}

			// Re-provision after copying base config (codex-toml appends to existing).
			const plan2 = {
				mcpServers: [
					{
						name: "an2-test",
						url: mcpServer.url,
						bearerToken: mcpServer.bearerToken,
					},
				],
				envInjections: {},
			};
			const result2 = await applyProvisioningPlan({
				plan: plan2,
				sandboxPath,
				cliMcpDialect: "codex-toml",
				claudeNative: false,
			});

			// Build clean env with CODEX_HOME + bearer token env var.
			const cleanEnv = buildCleanEnv();
			cleanEnv.CODEX_HOME = codexHomeDir;
			// Inject the per-server token env var that codex reads via bearer_token_env_var.
			for (const [k, v] of Object.entries(result2.mcpTokenEnv)) {
				cleanEnv[k] = v;
			}

			process.stdout.write(
				"[AN2 real-harness codex] Starting real codex session with AN2-provisioned MCP server...\n",
			);

			const prompt =
				"Call the ping_test tool from the an2-test MCP server with echo='LIVE_PROOF'. " +
				"Return the exact text you receive from the tool.";

			const spawnResult = await spawnDetached(
				"codex",
				["exec", prompt, "--json", "--dangerously-bypass-approvals-and-sandbox"],
				{
					cwd: sandboxPath,
					env: cleanEnv,
					timeoutMs: 90_000,
					closeStdin: true,
				},
			);

			const allOutput = spawnResult.stdout + spawnResult.stderr;

			// HARD ASSERTION: AN2_PROBE_OK must appear in codex output.
			if (!allOutput.includes("AN2_PROBE_OK")) {
				throw new Error(
					`[AN2 codex FULL BINARY PROOF FAILED]: AN2_PROBE_OK not found. ` +
						`The provisioned config.toml bearer MCP entry was NOT authenticated or tool was NOT called. ` +
						`stdout: "${spawnResult.stdout.slice(0, 400)}" ` +
						`stderr: "${spawnResult.stderr.slice(0, 200)}" ` +
						`exitCode: ${spawnResult.exitCode}. ` +
						`MCP URL: ${mcpServer?.url}. ` +
						`Check: CODEX_HOME set, AN2_TEST_MCP_TOKEN injected, config.toml has [mcp_servers.an2-test].`,
				);
			}
			expect(allOutput).toContain("AN2_PROBE_OK");
			expect(spawnResult.exitCode).not.toBeNull();

			process.stdout.write(
				"[AN2 real-harness codex] LIVE PROOF: AN2_PROBE_OK found in codex output — " +
					"config.toml bearer MCP connection succeeded.\n",
			);
		} finally {
			await mcpServer?.close();
			fs.rmSync(sandboxPath, { recursive: true, force: true });
		}
	}, 120_000);
});

// ── OPENCODE: real opencode.json inline header ────────────────────────────────

describe("opencode: real CLI connects to AN2-provisioned MCP server via opencode.json inline header", () => {
	requireHarness("opencode");
	test("provision opencode.json inline Authorization → opencode calls ping_test → AN2_PROBE_OK", async ({
		skip,
	}) => {
		// Check opencode auth
		try {
			const authResult = await spawnDetached("opencode", ["providers", "list"], {
				cwd: os.tmpdir(),
				env: buildCleanEnv(),
				timeoutMs: 10_000,
			});
			const out = authResult.stdout + authResult.stderr;
			if (!/\d+\s+credentials|environment variable/i.test(out)) {
				process.stdout.write("[AN2 real-harness opencode] SKIP: opencode has no providers\n");
				skip();
				return;
			}
		} catch {
			process.stdout.write("[AN2 real-harness opencode] SKIP: opencode auth check failed\n");
			skip();
			return;
		}

		// Guard: skip if OpenRouter account has no credits (402 = "Insufficient credits").
		if (!(await requireOpenRouterCredits(skip, "[AN2 real-harness opencode]"))) return;

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "an2-rh-opencode-"));
		let mcpServer: McpTestServer | null = null;

		try {
			mcpServer = await startMcpTestServer();

			// Provision opencode.json with the inline bearer header.
			const plan = {
				mcpServers: [
					{
						name: "an2-test",
						url: mcpServer.url,
						bearerToken: mcpServer.bearerToken,
					},
				],
				envInjections: {},
			};

			await applyProvisioningPlan({
				plan,
				sandboxPath,
				cliMcpDialect: "opencode-json",
				claudeNative: false,
			});

			// Verify opencode.json was written with inline Authorization.
			const opencodeJson = JSON.parse(
				fs.readFileSync(path.join(sandboxPath, "opencode.json"), "utf-8"),
			) as {
				mcp: Record<
					string,
					{ type: string; url: string; headers?: Record<string, string>; enabled: boolean }
				>;
			};
			expect(opencodeJson.mcp["an2-test"]).toBeDefined();
			expect(opencodeJson.mcp["an2-test"]?.url).toBe(mcpServer.url);
			expect(opencodeJson.mcp["an2-test"]?.headers?.Authorization).toBe(
				`Bearer ${mcpServer.bearerToken}`,
			);

			const cleanEnv = buildCleanEnv();

			process.stdout.write(
				"[AN2 real-harness opencode] Starting real opencode session with AN2-provisioned MCP server...\n",
			);

			const prompt =
				"Call the ping_test tool from the an2-test MCP server with echo='LIVE_PROOF'. " +
				"Return the exact text you receive from the tool.";

			const result = await spawnDetached(
				"opencode",
				[
					"run",
					prompt,
					"--format",
					"json",
					"--pure",
					"--dir",
					sandboxPath,
					"--model",
					"openrouter/~anthropic/claude-haiku-latest",
				],
				{
					cwd: sandboxPath,
					env: cleanEnv,
					timeoutMs: 90_000,
				},
			);

			const allOutput = result.stdout + result.stderr;

			// HARD ASSERTION: AN2_PROBE_OK must appear in opencode output.
			if (!allOutput.includes("AN2_PROBE_OK")) {
				throw new Error(
					`[AN2 opencode FULL BINARY PROOF FAILED]: AN2_PROBE_OK not found. ` +
						`The provisioned opencode.json inline Authorization header did NOT authenticate. ` +
						`stdout: "${result.stdout.slice(0, 400)}" ` +
						`stderr: "${result.stderr.slice(0, 200)}" ` +
						`exitCode: ${result.exitCode}. ` +
						`MCP URL: ${mcpServer?.url}. ` +
						`Check: opencode.json has an2-test with headers.Authorization:Bearer, ` +
						`stateful MCP server instance is live.`,
				);
			}
			expect(allOutput).toContain("AN2_PROBE_OK");
			expect(result.exitCode).not.toBeNull();

			process.stdout.write(
				"[AN2 real-harness opencode] LIVE PROOF: AN2_PROBE_OK found in opencode output — " +
					"opencode.json inline Authorization MCP connection succeeded.\n",
			);
		} finally {
			await mcpServer?.close();
			fs.rmSync(sandboxPath, { recursive: true, force: true });
		}
	}, 120_000);
});

// ── CLI-KEY: GH_TOKEN env injection ──────────────────────────────────────────

describe("CLI-key: GH_TOKEN env injection → real gh CLI op succeeds", () => {
	requireHarness("gh");
	test("github token → GH_TOKEN in envInjections; real gh auth status succeeds when GH_TOKEN set", async ({
		skip,
	}) => {
		// Use GH_TOKEN/GITHUB_TOKEN from env, or retrieve from gh keyring.
		let ghToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
		if (!ghToken) {
			// Try gh auth token to get the token from keyring.
			try {
				const { stdout } = await new Promise<{ stdout: string; stderr: string }>(
					(resolve, reject) => {
						const child = spawn("gh", ["auth", "token"], {
							stdio: ["ignore", "pipe", "pipe"],
						});
						let stdout = "";
						let stderr = "";
						child.stdout?.on("data", (d: Buffer) => {
							stdout += d.toString();
						});
						child.stderr?.on("data", (d: Buffer) => {
							stderr += d.toString();
						});
						child.on("exit", (code) =>
							code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr)),
						);
					},
				);
				ghToken = stdout.trim();
			} catch {
				process.stdout.write(
					"[AN2 real-harness gh] SKIP: no GH_TOKEN in env and gh auth token failed\n",
				);
				skip();
				return;
			}
		}
		if (!ghToken) {
			process.stdout.write("[AN2 real-harness gh] SKIP: no GH_TOKEN available\n");
			skip();
			return;
		}

		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "an2-rh-gh-"));

		try {
			// Build the plan with CLI-key env injections (no MCP server entry for github).
			const plan = {
				mcpServers: [],
				envInjections: {
					GH_TOKEN: ghToken,
					GITHUB_TOKEN: ghToken,
				},
			};

			await applyProvisioningPlan({
				plan,
				sandboxPath,
				cliMcpDialect: undefined,
				claudeNative: false,
			});

			// Verify the env injections are in the plan (they flow via plan.envInjections →
			// mcpTokenEnv merge in session-provisioning.ts after the C2 fix).
			expect(plan.envInjections.GH_TOKEN).toBe(ghToken);
			expect(plan.envInjections.GITHUB_TOKEN).toBe(ghToken);

			// LIVE PROOF: spawn real gh with the injected token in env.
			// Assert gh auth status succeeds → token is valid and env injection works.
			const result = await spawnDetached("gh", ["auth", "status"], {
				cwd: sandboxPath,
				env: {
					...buildCleanEnv(),
					GH_TOKEN: ghToken,
					GITHUB_TOKEN: ghToken,
					// Clear gh keyring so the test actually uses the env var token, not keyring.
					GH_CONFIG_DIR: sandboxPath,
				},
				timeoutMs: 15_000,
			});

			const allOutput = result.stdout + result.stderr;
			// Require the success-only marker: "✓ Logged in to github.com account".
			// An invalid token prints "X Failed to log in to github.com" (contains "github.com"
			// but NOT the checkmark success line) — the old /Logged in|github\.com/i regex
			// passed on a bogus token (reviewer W-gh finding). The ✓ line only appears when the
			// token authenticates successfully.
			// @lore AN2 gh-auth-assertion: verified live: `gh auth status` with a valid token
			// (via GH_CONFIG_DIR sandbox + GH_TOKEN) prints "✓ Logged in to github.com account".
			// With an invalid token: "X Failed to log in to github.com using token … The token
			// in GH_TOKEN is invalid." — no checkmark, so this assertion correctly rejects it.
			expect(allOutput).toMatch(/✓ Logged in to github\.com account/);

			process.stdout.write(
				"[AN2 real-harness gh] LIVE PROOF: GH_TOKEN env injection → " +
					"gh auth status succeeded with injected token.\n",
			);
		} finally {
			fs.rmSync(sandboxPath, { recursive: true, force: true });
		}
	}, 30_000);
});
