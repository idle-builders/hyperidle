/**
 * AR2 — extractable test-support helper for harness integration tests that
 * drive a real agent through the production `provisionSession()`.
 *
 * **Canonical four-step recipe (reuse in AR3–AR6):**
 * 1. `requireHarness(<name>)` at describe scope (hard-fail, never skip).
 * 2. Seed domain rows; `setActiveStrategy(fabricStrategy)`; register the real
 *    adapter in an `AdapterPool`; `LocalSandboxAdapter`; (CLI only) `startMcpBridgeServer()`.
 * 3. `const cap = createSandboxCapture()`; pass `onBeforeTeardown: cap.onBeforeTeardown`
 *    into `ProvisionSessionDeps`; call `await provisionSession(...)`.
 * 4. Assert on `cap.files` (real bytes the real agent wrote, captured before
 *    teardown deleted the sandbox) and/or DB rows and/or `result`.
 *
 * @lore AR2: The `createSandboxCapture` helper observes the session sandbox at
 * the `onBeforeTeardown` seam — after the agent's turn completes and the sandbox
 * is fully written, but before `endSession`'s `fs.promises.rm` (session-lifecycle.ts:341)
 * deletes it. The captured bytes are the ONLY observation channel for files that
 * live solely in the sandbox (no DB row, deleted at teardown). This is what
 * makes the seam load-bearing for AC2.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createMcpBridgeRegistry, type McpBridgeRegistry } from "../../mcp/mcp-bridge-registry.js";
import { createMcpRoute } from "../../routes/mcp-route.js";
import type { BeforeTeardownContext } from "../../services/session-provisioning.js";
import { enforcementRegistry } from "../return-enforcement-registry.js";

// ────────────────────────────────────────────────────────────────────────────
// createSandboxCapture
// ────────────────────────────────────────────────────────────────────────────

export interface SandboxCaptureOptions {
	/**
	 * Specific relative paths to read from the sandbox on teardown.
	 * When absent, ALL files in the sandbox directory are read recursively
	 * and stored by their path relative to `sandboxPath`.
	 */
	readonly paths?: readonly string[];
}

export interface SandboxCapture {
	/**
	 * Pass this as `onBeforeTeardown` in `ProvisionSessionDeps`.
	 * When the seam fires it populates `files` with the sandbox contents
	 * (relative path → UTF-8 content). Errors are NOT swallowed here —
	 * they propagate back to `runSession`'s try/catch which logs and swallows
	 * them, making the capture a silent no-op (the test assertion then fails
	 * cleanly: expected bytes absent, not an unexpected error).
	 */
	readonly onBeforeTeardown: (ctx: BeforeTeardownContext) => Promise<void>;
	/**
	 * Populated after `provisionSession` resolves. Maps relative file path →
	 * UTF-8 content for every file captured from the sandbox.
	 */
	readonly files: Map<string, string>;
}

/**
 * Create a sandbox capture handle. Pass `.onBeforeTeardown` into
 * `ProvisionSessionDeps`; after `provisionSession` resolves, read `.files`.
 *
 * @lore AR2: `createSandboxCapture` is guard-clean against the AR1
 * `honest-harness-guard`: it returns `{ onBeforeTeardown, files }` (not a
 * HarnessAdapter), constructs no adapter, and mocks nothing. The word
 * "capture" in this name is NOT the "CapturingHarnessAdapter" pattern the
 * guard rejects. A future rename to anything containing "Adapter"/"Harness"
 * in the class position WOULD trip the guard — don't do that.
 */
export function createSandboxCapture(opts?: SandboxCaptureOptions): SandboxCapture {
	const files = new Map<string, string>();

	const onBeforeTeardown = async (ctx: BeforeTeardownContext): Promise<void> => {
		const { sandboxPath } = ctx;
		if (opts?.paths) {
			// Read only the specified relative paths.
			for (const relPath of opts.paths) {
				const abs = path.join(sandboxPath, relPath);
				try {
					const content = fs.readFileSync(abs, "utf-8");
					files.set(relPath, content);
				} catch {
					// File not found / unreadable — leave it absent from the map.
					// The test assertion will fail: "expected file not captured".
				}
			}
		} else {
			// Recursively read all files in the sandbox.
			readDirRecursive(sandboxPath, sandboxPath, files);
		}
	};

	return { onBeforeTeardown, files };
}

/** Recursively walk `dir`, storing file contents relative to `root`. */
function readDirRecursive(dir: string, root: string, out: Map<string, string>): void {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return; // directory gone or unreadable
	}
	for (const entry of entries) {
		const abs = path.join(dir, entry.name);
		const rel = path.relative(root, abs);
		if (entry.isDirectory()) {
			readDirRecursive(abs, root, out);
		} else if (entry.isFile()) {
			try {
				out.set(rel, fs.readFileSync(abs, "utf-8"));
			} catch {
				// binary / unreadable — skip
			}
		}
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Per-harness sandbox/auth prep helpers (lifted from cli-adapter-real-binary.
// integration.test.ts so both test files share one source — AR2 §4)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Provision the sandbox files that CLAUDE_CLI_CONFIG args reference.
 *
 * @lore AR2: In the AR2 integration test we use `startMcpBridgeServer()` which
 * writes a live `.mcp.json`; for cli-adapter-real-binary (which only tests the
 * CliHarnessAdapter directly, not provisionSession) a dead URL is fine. Here we
 * write a placeholder `.mcp.json` + the required `.claude/settings.json` so
 * both call-sites share the same sandbox setup. The live `.mcp.json` from
 * `startMcpBridgeServer` overwrites the placeholder if called after this.
 */
export function provisionClaudeSandbox(sandboxPath: string): void {
	// --mcp-config .mcp.json: placeholder — startMcpBridgeServer overwrites this
	// with a live URL when used through provisionSession.
	fs.writeFileSync(
		path.join(sandboxPath, ".mcp.json"),
		JSON.stringify({
			mcpServers: { hyperidle: { type: "http", url: "http://localhost:9/api/mcp/x" } },
		}),
		"utf-8",
	);
	// --settings .claude/settings.json: empty object = no Stop hook → no re-prompt loop.
	fs.mkdirSync(path.join(sandboxPath, ".claude"), { recursive: true });
	fs.writeFileSync(path.join(sandboxPath, ".claude", "settings.json"), JSON.stringify({}), "utf-8");
}

/**
 * Copy codex auth (auth.json + config.toml only, NOT SQLite files) into .codex-home/.
 * Returns true if auth.json was found, false if codex auth is unavailable.
 *
 * @lore AR2: SQLite files (.db) lock and cause codex to exit before making an LLM call.
 * Copy ONLY auth.json + config.toml. The adapter auto-detects .codex-home/ and sets
 * CODEX_HOME. Codex also requires a git repo in the sandbox cwd — call `git init` +
 * empty commit before running the adapter.
 */
export function provisionCodexHome(sandboxPath: string): boolean {
	const codexHomeDir = path.join(sandboxPath, ".codex-home");
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
	return authFound;
}

/**
 * Initialize a git repo in the sandbox (required by codex exec).
 *
 * @lore AR2: `codex exec` fails with "not a git repository" unless the cwd is
 * a git repo. We create an empty initial commit so codex finds a valid HEAD.
 */
export function initGitRepo(sandboxPath: string): void {
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
}

// ────────────────────────────────────────────────────────────────────────────
// startMcpBridgeServer
// ────────────────────────────────────────────────────────────────────────────

/**
 * Stand up the production MCP route on an ephemeral port.
 *
 * Required by CLI lanes whose `CliAdapterConfig.args` unconditionally pass
 * `--mcp-config .mcp.json --strict-mcp-config`. Without a real bridge,
 * `provisionSession` skips writing `.mcp.json` (the `if (mcpBridgeRegistry &&
 * mcpBaseUrl)` guard at session-provisioning.ts:767) and the spawned claude
 * binary crashes "MCP config file not found."
 *
 * @lore AR2: Lifted verbatim from the inline copy in
 * `session-provisioning.integration.test.ts:68–97` (AR1 baseline). AR6 owns
 * the deduplication of those inline copies; AR2 exports the authoritative
 * version. The inline copies are NOT removed here — that is AR6's scope.
 *
 * @lore AR2: `enforcementRegistry` is the process-wide singleton (same instance
 * `provisionSession` registers into). Threading the same instance into
 * `createMcpRoute` ensures the Stop hook and the MCP return tools share state.
 */
export async function startMcpBridgeServer(): Promise<{
	mcpBridgeRegistry: McpBridgeRegistry;
	mcpBaseUrl: string;
	close: () => Promise<void>;
}> {
	const mcpBridgeRegistry = createMcpBridgeRegistry();
	const app = new Hono();
	const api = new Hono();
	api.route("/", createMcpRoute(mcpBridgeRegistry, enforcementRegistry));
	app.route("/api", api);

	let resolvePort: (port: number) => void;
	const portPromise = new Promise<number>((resolve) => {
		resolvePort = resolve;
	});
	const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => {
		resolvePort(info.port);
	});
	const port = await portPromise;

	return {
		mcpBridgeRegistry,
		mcpBaseUrl: `http://127.0.0.1:${port}`,
		close: async () => {
			await new Promise<void>((resolve, reject) => {
				server.close((err) => (err ? reject(err) : resolve()));
			});
		},
	};
}
