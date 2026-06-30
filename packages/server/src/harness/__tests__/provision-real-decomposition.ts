/**
 * AR5 — extractable test-support helper for harness integration tests that
 * drive a real agent through the production `runBetDecomposition` Branch 3
 * (`runRealPmTurn`).
 *
 * @lore AR5 — This helper builds `BetDecompositionDeps` and drives
 * `runBetDecomposition` **Branch 3** (`runRealPmTurn`), NOT
 * `provisionSession`/`runThroughHarness`. The production decomposition turn
 * does NOT flow through `provisionSession` — `runRealPmTurn`
 * (bet-decomposition.ts:522) calls `adapterPool.select()` directly on a
 * scratch `tools:[]` PM turn. Driving `provisionSession` here would prove
 * "a real agent ran a *session*," not "a real agent *decomposed a bet*" —
 * the exact false-adjacency Track AR exists to kill. Do NOT collapse this
 * into `runThroughHarness`; that would silently weaken the proof to the
 * wrong seam. The AK2 session-completion files correctly DO use
 * `runThroughHarness` because there the thing under test genuinely is a
 * session running to completion.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus, ResolvedModel } from "@hyperidle/shared";
import type { BetDecompositionDeps } from "../../services/bet-decomposition.js";
import { AdapterPool, CLAUDE_CLI_CONFIG, CLI_TOOL_CONFIGS } from "../adapter-pool.js";
import { BuiltinHarnessAdapter } from "../builtin-harness-adapter.js";
import { type CliAdapterConfig, CliHarnessAdapter } from "../cli-harness-adapter.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import type { HarnessLane } from "./provision-real-session.js";
import {
	CLAUDE_LANE_MODEL,
	CODEX_LANE_MODEL,
	DEFAULT_OPENROUTER_MODEL,
	initGitRepo,
	OPENCODE_MODEL,
	provisionClaudeSandbox,
	provisionCodexHome,
	provisionOpencodeHome,
} from "./provision-real-session.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

/**
 * Context for a decomposition run. Consumers provide the live db + eventBus
 * (from vitest fixtures), a fresh tmpDir, and optionally an overriding resolveModel.
 *
 * The decomposition scratch dir is created under `ctx.tmpDir/decomp-<betId>/`
 * by `runBetDecomposition` itself — callers assert on DB rows, not sandbox files
 * (decomposition persists to the DB; tasks are DB rows, not sandbox artifacts).
 */
export interface DecompositionRunCtx {
	readonly db: HyperIdleDb;
	readonly eventBus: EventBus;
	/** Per-test scratch directory — caller creates and cleans up. */
	readonly tmpDir: string;
}

/**
 * Build a `BetDecompositionDeps` object for the given harness lane, wiring a
 * real `AdapterPool` with the lane's adapter and performing per-harness auth
 * prep. Omits `runDecompositionTurn` so `runBetDecomposition` falls through to
 * Branch 3 (`runRealPmTurn`) — the real PM agent decomposes the bet.
 *
 * Per-harness adapter setup mirrors `SUPPORTED_HARNESS_LANES` in
 * `provision-real-session.ts` but returns `BetDecompositionDeps` (not
 * `ProvisionSessionParams`) because the decomposition turn entry point is
 * `runBetDecomposition`, not `provisionSession`.
 *
 * @lore AR5 — The `HarnessRunCtx.bridge` (MCP bridge) used in
 * `runThroughHarness` is intentionally absent here. The PM decomposition turn
 * uses `tools:[]` (AC5 User Sovereignty) so there is no MCP tool surface —
 * no bridge server is needed. The adapter still needs per-harness auth (codex
 * home, opencode home, claude sandbox) for binary invocation.
 */
export function decompositionDepsForLane(
	lane: HarnessLane,
	ctx: DecompositionRunCtx,
): BetDecompositionDeps {
	// Delegate to the lane-specific setup, building only the pool + auth prep
	// (no MCP bridge needed for tools:[] decomposition turn).
	const { pool, resolveModel, prepSandbox } = buildPoolForLane(lane, ctx.tmpDir);

	return {
		db: ctx.db,
		eventBus: ctx.eventBus,
		adapterPool: pool,
		sandbox: new LocalSandboxAdapter(),
		sandboxBasePath: ctx.tmpDir,
		resolveModel,
		// Deliberately no runDecompositionTurn override → forces Branch 3 (runRealPmTurn).
		// @lore AR5: prepSandbox provisions CLI harness config into the SCRATCH sandbox
		// (decomp-<betId>/) AFTER it is created by runBetDecomposition. CLI harnesses
		// (claude/codex/opencode) need config files (.mcp.json, .codex-home/, etc.)
		// in their cwd (= scratchSandboxPath), not in ctx.tmpDir. buildPoolForLane
		// does general one-time setup (git init, global provisioning) in ctx.tmpDir;
		// prepSandbox handles the per-invocation scratch-sandbox provisioning.
		prepSandbox,
	};
}

// ---------------------------------------------------------------------------
// Per-harness pool + resolveModel factory
// ---------------------------------------------------------------------------

interface PoolSetup {
	readonly pool: AdapterPool;
	readonly resolveModel: (tier: string) => Promise<ResolvedModel | undefined>;
	/**
	 * Optional hook to provision harness-specific files into the scratch sandbox
	 * (decomp-<betId>/) created by runBetDecomposition. CLI harnesses (claude/codex/opencode)
	 * need config files in their cwd; this hook fires after mkdirSync(scratchSandboxPath).
	 *
	 * @lore AR5: buildPoolForLane does general one-time setup (git init, global codex auth)
	 * in ctx.tmpDir. This hook handles per-invocation scratch-sandbox provisioning — it is
	 * called with the actual scratch sandbox path so files land in the right cwd.
	 */
	readonly prepSandbox?: (sandboxPath: string) => Promise<void>;
}

/**
 * Per-lane adapter metadata for the PM agent seed.
 * The PM agent's harnessType/modelProvider columns must match the adapter
 * registration so `adapterPool.select(harnessType, modelProviders)` finds it.
 *
 * @lore AR5: `runRealPmTurn` calls `adapterPool.select({ harnessType: pm.harnessType ?? "builtin",
 * modelProviders: [pm.modelProvider ?? "anthropic"] })`. The adapter registered in the pool
 * must carry the matching `type` and `modelProviders` or `select` returns null → "No eligible
 * harness adapter" → blocked/failed. Seed the PM agent with these values so the select
 * matches the lane's adapter.
 */
export interface DecompositionLaneMeta {
	/** Value to store in `users.harnessType` for the PM agent. */
	readonly harnessType: string;
	/** Value to store in `users.modelProvider` for the PM agent. */
	readonly modelProvider: string;
}

/**
 * Returns the harnessType and modelProvider the PM agent must carry for the
 * given lane so that `adapterPool.select` finds the lane's adapter.
 */
export function decompositionLaneMeta(lane: HarnessLane): DecompositionLaneMeta {
	switch (lane.harnessName) {
		case "builtin":
			return { harnessType: "builtin", modelProvider: "openai-compatible" };
		case "claude":
			return { harnessType: "claude", modelProvider: "anthropic" };
		case "codex":
			return { harnessType: "codex", modelProvider: "openai-compatible" };
		case "opencode":
			return { harnessType: "opencode", modelProvider: "openai-compatible" };
		default:
			throw new Error(`Unsupported harness for decomposition meta: ${lane.harnessName}`);
	}
}

function buildPoolForLane(lane: HarnessLane, sandboxDir: string): PoolSetup {
	switch (lane.harnessName) {
		case "builtin": {
			const apiKey = process.env.OPENROUTER_API_KEY as string;
			const pool = new AdapterPool();
			pool.register(
				"builtin-local",
				new BuiltinHarnessAdapter({ maxIterations: 8, maxOutputTokens: 1024 }),
				{
					name: "builtin-local",
					kind: "local",
					// type must match pm.harnessType so adapterPool.select() finds this adapter.
					type: "builtin",
					modelProviders: ["openai-compatible"],
					maxConcurrent: 1,
				},
			);
			const resolveModel = async (_tier: string): Promise<ResolvedModel | undefined> => ({
				provider: "openai-compatible",
				model: DEFAULT_OPENROUTER_MODEL,
				apiKey,
				baseUrl: OPENROUTER_BASE_URL,
			});
			return { pool, resolveModel };
		}

		case "claude": {
			// Claude CLI needs a placeholder .mcp.json + .claude/settings.json for
			// CLAUDE_CLI_CONFIG args (--mcp-config .mcp.json --settings .claude/settings.json
			// are resolved relative to cwd = scratchSandboxPath). The decomposition turn is
			// tools:[] so no live MCP bridge is needed — the placeholder dead URL suffices.
			//
			// @lore AR5: provisionClaudeSandbox is called via prepSandbox (NOT here) because
			// the files must land in the SCRATCH sandbox cwd (scratchSandboxPath = decomp-<betId>/)
			// created by runBetDecomposition AFTER buildPoolForLane runs. Provisioning into
			// sandboxDir (ctx.tmpDir) was the pre-AR5 bug: claude's cwd is scratchSandboxPath,
			// not sandboxDir, so --mcp-config .mcp.json could not find the file → crash.
			const pool = new AdapterPool();
			pool.register("local-claude", new CliHarnessAdapter(CLAUDE_CLI_CONFIG), {
				name: "local-claude",
				kind: "local",
				// type must match pm.harnessType so adapterPool.select() finds this adapter.
				type: "claude",
				modelProviders: ["anthropic"],
				maxConcurrent: 4,
			});
			const resolveModel = async (_tier: string): Promise<ResolvedModel | undefined> => ({
				provider: "anthropic",
				model: CLAUDE_LANE_MODEL,
				apiKey: "keychain-auth-unused",
				baseUrl: "https://api.anthropic.com",
			});
			const prepSandbox = async (scratchPath: string): Promise<void> => {
				provisionClaudeSandbox(scratchPath);
			};
			return { pool, resolveModel, prepSandbox };
		}

		case "codex": {
			// Git repo init lives in sandboxDir (ctx.tmpDir) — git traverses parent dirs so
			// codex exec in scratchSandboxPath (a subdirectory) finds the repo.
			// provisionCodexHome is called via prepSandbox because the adapter looks for
			// .codex-home/ at config.sandboxPath (= scratchSandboxPath), not sandboxDir.
			//
			// @lore AR5: The cli-harness-adapter injects CODEX_HOME=path.join(config.sandboxPath,
			// ".codex-home"). That path is scratchSandboxPath/.codex-home — so auth must be
			// provisioned there (not in ctx.tmpDir/.codex-home). Check auth in sandboxDir
			// first to give a clear error if codex isn't installed/logged in.
			initGitRepo(sandboxDir);
			const authFound = provisionCodexHome(sandboxDir); // preliminary check only
			if (!authFound) {
				throw new Error("codex lane: auth.json not found in ~/.codex — install codex and log in.");
			}
			const codexConfig = CLI_TOOL_CONFIGS.codex;
			if (!codexConfig) throw new Error("CLI_TOOL_CONFIGS.codex is not defined");
			const pool = new AdapterPool();
			pool.register("local-codex", new CliHarnessAdapter(codexConfig), {
				name: "local-codex",
				kind: "local",
				// type must match pm.harnessType so adapterPool.select() finds this adapter.
				type: "codex",
				modelProviders: ["openai-compatible"],
				maxConcurrent: 2,
			});
			const resolveModel = async (_tier: string): Promise<ResolvedModel | undefined> => ({
				provider: "openai-compatible",
				model: CODEX_LANE_MODEL,
				apiKey: "",
				baseUrl: "https://api.openai.com",
			});
			const prepSandbox = async (scratchPath: string): Promise<void> => {
				// Initialize git repo in scratch sandbox too (codex exec requires git).
				// The parent sandboxDir already has git, but codex may not traverse past
				// the scratch dir boundary depending on its git-detection implementation.
				initGitRepo(scratchPath);
				provisionCodexHome(scratchPath); // writes .codex-home/ into cwd
			};
			return { pool, resolveModel, prepSandbox };
		}

		case "opencode": {
			// @lore AR5: provisionOpencodeHome is called via prepSandbox so auth lands in
			// scratchSandboxPath/.opencode-data/opencode/auth.json — matching the XDG_DATA_HOME
			// pattern used by the adapter. Provisioning in sandboxDir (ctx.tmpDir) would put
			// auth in the wrong place relative to the scratch sandbox cwd.
			//
			// XDG_DATA_HOME isolation via envMap override (not process.env):
			// The base CLI_TOOL_CONFIGS.opencode has XDG_DATA_HOME in the envAllowlist —
			// forwarded from process.env at spawn time. But this test never sets
			// process.env.XDG_DATA_HOME (unlike AK2 which sets it in beforeEach). Without
			// XDG_DATA_HOME pointing at scratchPath/.opencode-data, the subprocess uses the
			// global ~/.local/share/opencode/ instead of the isolated dir where auth.json was
			// provisioned. Fix: override envMap to inject XDG_DATA_HOME = "{{sandbox}}/.opencode-data"
			// (resolves to scratchSandboxPath/.opencode-data at session start). envMap entries
			// are applied AFTER the allowlist so they override any process.env value.
			//
			// @lore AR5 opencode-xdg-decomposition: Unlike the AK2 session lane (which sets
			// process.env.XDG_DATA_HOME in beforeEach), the decomposition lane has no beforeEach
			// cleanup frame. Using the {{sandbox}} template var is safer: it always resolves to
			// the exact scratch sandbox cwd, is per-invocation-isolated, and requires no cleanup.
			const apiKey = process.env.OPENROUTER_API_KEY;
			if (!apiKey) throw new Error("opencode lane: OPENROUTER_API_KEY not set.");
			const baseOpencodeConfig = CLI_TOOL_CONFIGS.opencode;
			if (!baseOpencodeConfig) throw new Error("CLI_TOOL_CONFIGS.opencode is not defined");
			// Override envMap to inject XDG_DATA_HOME via {{sandbox}} template var.
			const opencodeConfig: CliAdapterConfig = {
				...baseOpencodeConfig,
				envMap: {
					...baseOpencodeConfig.envMap,
					// XDG_DATA_HOME resolves to scratchSandboxPath/.opencode-data at session
					// start — the exact dir provisionOpencodeHome(scratchPath) writes auth to.
					XDG_DATA_HOME: "{{sandbox}}/.opencode-data",
				},
			};
			const pool = new AdapterPool();
			pool.register("local-opencode", new CliHarnessAdapter(opencodeConfig), {
				name: "local-opencode",
				kind: "local",
				// type must match pm.harnessType so adapterPool.select() finds this adapter.
				type: "opencode",
				modelProviders: ["openai-compatible"],
				maxConcurrent: 2,
			});
			const resolveModel = async (_tier: string): Promise<ResolvedModel | undefined> => ({
				provider: "openai-compatible",
				model: `openrouter/${OPENCODE_MODEL}`,
				apiKey,
				baseUrl: "https://openrouter.ai/api",
			});
			const prepSandbox = async (scratchPath: string): Promise<void> => {
				provisionOpencodeHome(scratchPath);
			};
			return { pool, resolveModel, prepSandbox };
		}

		default: {
			// "gh" is a tool, not an agent harness — not in SUPPORTED_HARNESS_LANES.
			// This branch is unreachable in practice (the loop only iterates
			// SUPPORTED_HARNESS_LANES which contains builtin/claude/codex/opencode).
			throw new Error(`Unsupported harness for decomposition: ${lane.harnessName}`);
		}
	}
}

/**
 * Create a fresh per-test tmpDir under os.tmpdir(), returning the path.
 * Caller is responsible for cleanup (rmSync in afterEach).
 *
 * @lore AR5: Decomposition uses `sandboxBasePath/decomp-<betId>` as the scratch
 * sandbox internally. The outer tmpDir is the container — we pass it as
 * `sandboxBasePath`. runBetDecomposition creates the `decomp-*` subdirectory
 * itself and cleans it up in its `finally` block.
 */
export function makeTmpDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
