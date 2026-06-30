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
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus, HarnessAdapter } from "@hyperidle/shared";
import { Hono } from "hono";
import { createMcpBridgeRegistry, type McpBridgeRegistry } from "../../mcp/mcp-bridge-registry.js";
import { createMcpRoute } from "../../routes/mcp-route.js";
import type {
	BeforeTeardownContext,
	ProvisionSessionDeps,
	ProvisionSessionParams,
	ProvisionSessionResult,
} from "../../services/session-provisioning.js";
import { provisionSession } from "../../services/session-provisioning.js";
import { AdapterPool, CLAUDE_CLI_CONFIG, CLI_TOOL_CONFIGS } from "../adapter-pool.js";
import { BuiltinHarnessAdapter } from "../builtin-harness-adapter.js";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import { enforcementRegistry } from "../return-enforcement-registry.js";
import {
	type HarnessName,
	harnessTestResolvedModel,
	type ResolvedTestModel,
	type SupportedHarnessName,
} from "./require-harness.js";

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
 * Provision a per-session opencode data directory into `<sandbox>/.opencode-data/`.
 * Returns true if auth.json was found, false if opencode auth is unavailable.
 *
 * @lore AR2 opencode-xdg-isolation: opencode uses a single global SQLite DB at
 * `~/.local/share/opencode/opencode.db`. When multiple opencode processes run
 * concurrently or in rapid succession, the second process hangs on the SQLite
 * write-lock. The fix: set XDG_DATA_HOME per-session (via CLI_TOOL_CONFIGS.opencode
 * envMap `XDG_DATA_HOME: "{{sandbox}}/.opencode-data"`) so each subprocess has its
 * own DB. This function provisions the per-session data dir with the credentials
 * opencode needs to make LLM calls. WITHOUT this, the opencode process either hangs
 * (DB lock) or fails auth (no credentials in the isolated data dir).
 *
 * Copy ONLY auth.json — NOT the SQLite DB files (they are session state, not credentials).
 * Verified opencode 1.17.11: `XDG_DATA_HOME` is respected; credentials are read from
 * `$XDG_DATA_HOME/opencode/auth.json`.
 */
export function provisionOpencodeHome(sandboxPath: string): boolean {
	const opencodePer = path.join(sandboxPath, ".opencode-data", "opencode");
	fs.mkdirSync(opencodePer, { recursive: true });
	const globalOpencode = path.join(os.homedir(), ".local", "share", "opencode");
	const authSrc = path.join(globalOpencode, "auth.json");
	if (!fs.existsSync(authSrc)) return false;
	fs.copyFileSync(authSrc, path.join(opencodePer, "auth.json"));
	return true;
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

// ────────────────────────────────────────────────────────────────────────────
// SUPPORTED_HARNESS_LANES + runThroughHarness (M-1: AC4 matrix deliverable)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Shared runtime context passed to `runThroughHarness`. Consumers provide
 * the live db + eventBus (from vitest fixtures), a fresh tmpDir, and the
 * optional MCP bridge (CLI lanes need it; the builtin lane does not).
 *
 * The capture handle is created internally by `runThroughHarness` — callers
 * read `.files` from the returned object.
 *
 * @lore AR2 M-1 (AC4): This context type plus the lane table is the
 * "extractable matrix helper" the plan named as AC4's deliverable. AR3–AR6
 * import `SUPPORTED_HARNESS_LANES` and call `runThroughHarness(lane, ctx)`
 * for each lane — no hand-rebuilt 4-lane describe wiring.
 */
export interface HarnessRunCtx {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/** Per-test scratch directory — caller creates and cleans up. */
	readonly tmpDir: string;
	/**
	 * Live MCP bridge from `startMcpBridgeServer()`. Required for CLI lanes;
	 * optional for builtin (which doesn't spawn an external process).
	 */
	readonly bridge?: {
		readonly mcpBridgeRegistry: McpBridgeRegistry;
		readonly mcpBaseUrl: string;
		readonly close: () => Promise<void>;
	};
}

/**
 * Per-lane provisioning parameters that `runThroughHarness` assembles into
 * `ProvisionSessionDeps` + `ProvisionSessionParams`. Each lane carries its
 * own adapter setup + per-harness prep logic, so a consumer iterating the
 * table gets all four gates + [harness:X] tags for free.
 *
 * `prepFn` runs synchronously before `provisionSession` — it provisions
 * per-harness auth (codex home, opencode home, git repo init, etc.) and
 * returns the `ProvisionSessionParams` for this lane. The capture seam
 * (`cap`) is threaded into `ProvisionSessionDeps.onBeforeTeardown`.
 */
export interface HarnessLane {
	/**
	 * Harness name — pass to `requireHarness(lane.harnessName)` at describe scope.
	 * Also used as the `[harness:X]` attestation tag suffix.
	 */
	readonly harnessName: HarnessName;
	/**
	 * Describe-title prefix including the mechanical attestation tag.
	 * Usage: `describe(\`\${lane.describeTag} MyTest suite\`, () => { … })`.
	 * The tag drives the per-harness executed-count bucket in check-attestation.
	 *
	 * @lore AR2 M-2 (mitigated by M-1): when the lane table exists, the tag is
	 * DERIVED from `harnessName` — a typo in `harnessName` misroutes the bucket
	 * but at least the tag and the gate stay consistent. The previous hand-typed
	 * shape required consistent edits in two places.
	 */
	readonly describeTag: string;
	/**
	 * Build the adapter + provision params for this lane.
	 * `ctx.tmpDir` is the per-test sandbox root. `ctx.bridge` is the MCP bridge
	 * (CLI lanes throw if absent; the builtin lane ignores it).
	 *
	 * Returns the `ProvisionSessionParams` the runner should pass to
	 * `provisionSession`, the assembled `AdapterPool`, and any per-harness
	 * capture paths (empty = capture all).
	 */
	readonly prepFn: (ctx: HarnessRunCtx) => {
		readonly pool: AdapterPool;
		readonly params: ProvisionSessionParams;
		readonly capturePaths?: readonly string[];
	};
}

/**
 * AR7 — construct the real harness adapter for `harness`, paired with its LOCKED
 * resolved model from `HARNESS_TEST_MODELS`. The factory bakes the locked model so
 * a test using it does not choose a model; the guard removes the import/construction
 * override paths (`cli-harness-adapter` / `builtin-harness-adapter` / `llm-client` /
 * `new (Cli|Builtin)HarnessAdapter` are banned in harness-facing integration tests).
 * A hand-written raw `resolvedModel` object literal passed directly to `provisionSession`
 * is an accepted residual gap — catching it would require brittle model-id string-matching
 * (rejected). It is an obvious isolated red flag in code review absent any imported model
 * source.
 *
 * @lore AR7: The seam owns the import of the concrete adapter classes. A
 * harness-facing integration test must NOT import `cli-harness-adapter` /
 * `builtin-harness-adapter` / `llm-client` directly nor `new` a `*HarnessAdapter`
 * — `honest-harness-guard` fails the build for that. Routing every adapter
 * construction through here is the load-bearing structural lock; string-matching
 * model ids is explicitly NOT done (brittle on rename, evadable via variable).
 */
export function lockedHarnessAdapter(harness: SupportedHarnessName): {
	adapter: HarnessAdapter;
	resolvedModel: ResolvedTestModel;
} {
	const resolvedModel = harnessTestResolvedModel(harness);
	switch (harness) {
		case "builtin":
			return {
				adapter: new BuiltinHarnessAdapter({ maxIterations: 8, maxOutputTokens: 1024 }),
				resolvedModel,
			};
		case "claude":
			return { adapter: new CliHarnessAdapter(CLAUDE_CLI_CONFIG), resolvedModel };
		case "codex": {
			const codexConfig = CLI_TOOL_CONFIGS.codex;
			if (!codexConfig) throw new Error("CLI_TOOL_CONFIGS.codex is not defined");
			return { adapter: new CliHarnessAdapter(codexConfig), resolvedModel };
		}
		case "opencode": {
			const opencodeConfig = CLI_TOOL_CONFIGS.opencode;
			if (!opencodeConfig) throw new Error("CLI_TOOL_CONFIGS.opencode is not defined");
			return { adapter: new CliHarnessAdapter(opencodeConfig), resolvedModel };
		}
	}
}

/**
 * The canonical four-harness lane table. Each lane's model is LOCKED in
 * `HARNESS_TEST_MODELS` (require-harness.ts) and baked in via `lockedHarnessAdapter`
 * — a lane consumer cannot pick a model. Importing this and iterating
 * `for (const lane of SUPPORTED_HARNESS_LANES)` is AC4's deliverable for AR3–AR6:
 * each lane carries its own `requireHarness` gate name, `[harness:X]` tag,
 * adapter setup, and per-harness prep — the consumer gets all four gates by
 * construction, no hand-rebuilding.
 *
 * @lore AR2 M-1: The plan §4 explicitly names this export + `runThroughHarness`
 * as the "extractable matrix helper". AR3–AR6 adopt: import SUPPORTED_HARNESS_LANES,
 * run: `for (const lane of SUPPORTED_HARNESS_LANES) { requireHarness(lane.harnessName); … }`
 *
 * @lore AR2 W-2 (honest floor, round-3): builtin + claude fire the MCP return tool
 * (send_message) → outcome "completed". codex + opencode do REAL billable work on a
 * file-write task but do NOT call the MCP return tool → outcome reliably "not_returned".
 * Forcing "completed" for CLI lanes triggers the return-gate re-prompt loop until the
 * 240s ceiling → timeout. Honest floor: "completed"|"not_returned" (FAIL on "crashed")
 * + seam-captured file (best-effort). Stub-distinguishing: a stub/crashed run has no
 * sandbox → seam can't fire → no file captured; a real run ends non-crash + may write.
 *
 * @lore AR2 codex-cost-zero: codex emits `turn.completed` with a `usage` block, NOT the
 * claude-stream-json `result` event with `total_cost_usd`. The cli-harness-adapter cost
 * extraction only fires on `type === "result"` → totalCostCents is always 0 for codex.
 * The `costField: "total_cost_usd"` in CLI_TOOL_CONFIGS.codex is vestigial and never
 * fires. Asserting `totalCostCents > 0` for codex always fails — don't do it.
 */
export const SUPPORTED_HARNESS_LANES: readonly HarnessLane[] = [
	{
		harnessName: "builtin",
		describeTag: "[harness:builtin]",
		prepFn: (ctx) => {
			const { adapter, resolvedModel } = lockedHarnessAdapter("builtin");
			const pool = new AdapterPool();
			pool.register("builtin-local", adapter, {
				name: "builtin-local",
				kind: "local",
				modelProviders: ["openai-compatible"],
				maxConcurrent: 1,
			});
			return {
				pool,
				params: {
					taskId: `ar-builtin-task-${Date.now()}`,
					agentId: `ar-builtin-agent-${Date.now()}`,
					productId: "p1",
					sandboxBasePath: ctx.tmpDir,
					resolvedModel,
				},
			};
		},
	},
	{
		harnessName: "claude",
		describeTag: "[harness:claude]",
		prepFn: (ctx) => {
			if (!ctx.bridge)
				throw new Error("claude lane requires a live MCP bridge from startMcpBridgeServer()");
			const { adapter, resolvedModel } = lockedHarnessAdapter("claude");
			const pool = new AdapterPool();
			pool.register("local-claude", adapter, {
				name: "local-claude",
				kind: "local",
				modelProviders: ["anthropic"],
				maxConcurrent: 4,
			});
			return {
				pool,
				params: {
					taskId: `ar-claude-task-${Date.now()}`,
					agentId: `ar-claude-agent-${Date.now()}`,
					productId: "p1",
					sandboxBasePath: ctx.tmpDir,
					resolvedModel,
				},
				capturePaths: ["answer.txt"],
			};
		},
	},
	{
		harnessName: "codex",
		describeTag: "[harness:codex]",
		prepFn: (ctx) => {
			if (!ctx.bridge)
				throw new Error("codex lane requires a live MCP bridge from startMcpBridgeServer()");
			initGitRepo(ctx.tmpDir);
			const authFound = provisionCodexHome(ctx.tmpDir);
			if (!authFound) {
				throw new Error("codex lane: auth.json not found in ~/.codex — install codex and log in.");
			}
			const { adapter, resolvedModel } = lockedHarnessAdapter("codex");
			const pool = new AdapterPool();
			pool.register("local-codex", adapter, {
				name: "local-codex",
				kind: "local",
				modelProviders: ["openai-compatible"],
				maxConcurrent: 2,
			});
			return {
				pool,
				params: {
					taskId: `ar-codex-task-${Date.now()}`,
					agentId: `ar-codex-agent-${Date.now()}`,
					productId: "p1",
					sandboxBasePath: ctx.tmpDir,
					resolvedModel,
				},
				capturePaths: ["answer.txt"],
			};
		},
	},
	{
		harnessName: "opencode",
		describeTag: "[harness:opencode]",
		prepFn: (ctx) => {
			if (!ctx.bridge)
				throw new Error("opencode lane requires a live MCP bridge from startMcpBridgeServer()");
			if (!process.env.OPENROUTER_API_KEY)
				throw new Error("opencode lane: OPENROUTER_API_KEY not set.");
			provisionOpencodeHome(ctx.tmpDir);
			const { adapter, resolvedModel } = lockedHarnessAdapter("opencode");
			const pool = new AdapterPool();
			pool.register("local-opencode", adapter, {
				name: "local-opencode",
				kind: "local",
				modelProviders: ["openai-compatible"],
				maxConcurrent: 2,
			});
			return {
				pool,
				params: {
					taskId: `ar-opencode-task-${Date.now()}`,
					agentId: `ar-opencode-agent-${Date.now()}`,
					productId: "p1",
					sandboxBasePath: ctx.tmpDir,
					resolvedModel,
				},
				capturePaths: ["answer.txt"],
			};
		},
	},
];

/**
 * Run a single harness lane through production `provisionSession()`.
 *
 * 1. Calls `lane.prepFn(ctx)` to build the adapter pool + ProvisionSessionParams.
 * 2. Creates a `SandboxCapture` for the paths the lane declared.
 * 3. Assembles `ProvisionSessionDeps` (including MCP bridge when the lane needs it).
 * 4. Calls `await provisionSession(deps, params)` and returns the result +
 *    the populated capture handle.
 *
 * **Reference usage (AR3–AR6):**
 * ```ts
 * for (const lane of SUPPORTED_HARNESS_LANES) {
 *   describe(`${lane.describeTag} Suite name`, () => {
 *     requireHarness(lane.harnessName);
 *     test("real session runs", async ({ db, eventBus }) => {
 *       await seedDomain(db, { taskId, agentId, taskDescription, doneCondition });
 *       const { result, cap } = await runThroughHarness(lane, { db, eventBus, tmpDir, bridge });
 *       expect(result.outcome).toBe("completed");
 *     });
 *   });
 * }
 * ```
 *
 * @lore AR2 M-1: `runThroughHarness` is AC4's "loop runner" export. AR3–AR6 adopt
 * by importing this function; they never hand-build adapter + deps again.
 */
export async function runThroughHarness(
	lane: HarnessLane,
	ctx: HarnessRunCtx,
): Promise<{ result: ProvisionSessionResult; cap: SandboxCapture }> {
	const { pool, params, capturePaths } = lane.prepFn(ctx);
	const cap = createSandboxCapture(capturePaths ? { paths: capturePaths } : undefined);

	const deps: ProvisionSessionDeps = {
		db: ctx.db,
		eventBus: ctx.eventBus,
		adapterPool: pool,
		workspace: new LocalSandboxAdapter(),
		...(ctx.bridge
			? {
					mcpBridgeRegistry: ctx.bridge.mcpBridgeRegistry,
					mcpBaseUrl: ctx.bridge.mcpBaseUrl,
				}
			: {}),
		onBeforeTeardown: cap.onBeforeTeardown,
	};

	const result = await provisionSession(deps, params);
	return { result, cap };
}
