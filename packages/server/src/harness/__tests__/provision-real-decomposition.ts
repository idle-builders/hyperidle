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
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import type { HarnessLane } from "./provision-real-session.js";
import {
	initGitRepo,
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
	const { pool, resolveModel } = buildPoolForLane(lane, ctx.tmpDir);

	return {
		db: ctx.db,
		eventBus: ctx.eventBus,
		adapterPool: pool,
		sandbox: new LocalSandboxAdapter(),
		sandboxBasePath: ctx.tmpDir,
		resolveModel,
		// Deliberately no runDecompositionTurn override → forces Branch 3 (runRealPmTurn).
	};
}

// ---------------------------------------------------------------------------
// Per-harness pool + resolveModel factory
// ---------------------------------------------------------------------------

interface PoolSetup {
	readonly pool: AdapterPool;
	readonly resolveModel: (tier: string) => Promise<ResolvedModel | undefined>;
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
					modelProviders: ["openai-compatible"],
					maxConcurrent: 1,
				},
			);
			const resolveModel = async (_tier: string): Promise<ResolvedModel | undefined> => ({
				provider: "openai-compatible",
				model: "openai/gpt-4o-mini",
				apiKey,
				baseUrl: OPENROUTER_BASE_URL,
			});
			return { pool, resolveModel };
		}

		case "claude": {
			// Claude CLI needs a placeholder .mcp.json + .claude/settings.json for
			// CLAUDE_CLI_CONFIG args. The decomposition turn is tools:[] so no live
			// MCP bridge is needed — the placeholder dead URL suffices.
			provisionClaudeSandbox(sandboxDir);
			const pool = new AdapterPool();
			pool.register("local-claude", new CliHarnessAdapter(CLAUDE_CLI_CONFIG), {
				name: "local-claude",
				kind: "local",
				modelProviders: ["anthropic"],
				maxConcurrent: 4,
			});
			const resolveModel = async (_tier: string): Promise<ResolvedModel | undefined> => ({
				provider: "anthropic",
				model: "claude-haiku-4-5",
				apiKey: "keychain-auth-unused",
				baseUrl: "https://api.anthropic.com",
			});
			return { pool, resolveModel };
		}

		case "codex": {
			initGitRepo(sandboxDir);
			const authFound = provisionCodexHome(sandboxDir);
			if (!authFound) {
				throw new Error("codex lane: auth.json not found in ~/.codex — install codex and log in.");
			}
			const codexConfig = CLI_TOOL_CONFIGS.codex;
			if (!codexConfig) throw new Error("CLI_TOOL_CONFIGS.codex is not defined");
			const pool = new AdapterPool();
			pool.register("local-codex", new CliHarnessAdapter(codexConfig), {
				name: "local-codex",
				kind: "local",
				modelProviders: ["openai-compatible"],
				maxConcurrent: 2,
			});
			const resolveModel = async (_tier: string): Promise<ResolvedModel | undefined> => ({
				provider: "openai-compatible",
				model: "codex-mini-latest",
				apiKey: "",
				baseUrl: "https://api.openai.com",
			});
			return { pool, resolveModel };
		}

		case "opencode": {
			const apiKey = process.env.OPENROUTER_API_KEY;
			if (!apiKey) throw new Error("opencode lane: OPENROUTER_API_KEY not set.");
			provisionOpencodeHome(sandboxDir);
			const opencodeConfig = CLI_TOOL_CONFIGS.opencode;
			if (!opencodeConfig) throw new Error("CLI_TOOL_CONFIGS.opencode is not defined");
			const pool = new AdapterPool();
			pool.register("local-opencode", new CliHarnessAdapter(opencodeConfig), {
				name: "local-opencode",
				kind: "local",
				modelProviders: ["openai-compatible"],
				maxConcurrent: 2,
			});
			const resolveModel = async (_tier: string): Promise<ResolvedModel | undefined> => ({
				provider: "openai-compatible",
				model: "openrouter/openai/gpt-4o-mini",
				apiKey,
				baseUrl: "https://openrouter.ai/api",
			});
			return { pool, resolveModel };
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

