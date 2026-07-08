/**
 * AR5 — extractable test-support helper for harness integration tests that
 * drive a real agent through the production `runBetDecomposition` runtime path.
 *
 * @lore AR5/AU1 — This helper builds `BetDecompositionDeps` for the
 * AgentSessionRequest runtime path. The proof stays anchored at
 * `runBetDecomposition`: request creation, runtime consumption, task writeback,
 * and terminal bet status must all happen there.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus, ResolvedModel } from "@hyperidle/shared";
import type { BetDecompositionDeps } from "../../services/bet-decomposition.js";
import { AdapterPool } from "../adapter-pool.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import {
	type HarnessLane,
	initGitRepo,
	lockedHarnessAdapter,
	provisionClaudeSandbox,
	provisionCodexHome,
	provisionOpencodeHome,
} from "./provision-real-session.js";

// @lore AR5/AR7: models + adapters come ONLY from the locked seam
// (`lockedHarnessAdapter`, which reads `HARNESS_TEST_MODELS`). This file constructs
// no adapter and imports no raw model-caller — required by the tightened
// honest-harness-guard (AR7). The per-harness model is founder-locked in
// `HARNESS_TEST_MODELS` (require-harness.ts); a test cannot pick or override it.

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
 * prep. Omits `runDecompositionTurn` so `runBetDecomposition` enters the
 * runtime request path — the real PM agent decomposes the bet.
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
		// Deliberately no runDecompositionTurn override → use runtime request path.
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
 * @lore AR5/AU1: The runtime adapter selected for the PM agent must match the
 * lane's registered adapter metadata. Seed the PM agent with these values so
 * the request runs on the intended lane.
 */
export interface DecompositionLaneMeta {
	/** Value to store in `users.harnessType` for the PM agent. */
	readonly harnessType: string;
	/** Value to store in `users.modelProvider` for the PM agent. */
	readonly modelProvider: string;
}

/**
 * Returns the harnessType and modelProvider the PM agent must carry for the
 * given lane so runtime selection finds the lane's adapter.
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
			// Adapter + locked model come from the sanctioned seam (HARNESS_TEST_MODELS).
			const { adapter, resolvedModel } = lockedHarnessAdapter("builtin");
			const pool = new AdapterPool();
			pool.register("builtin-local", adapter, {
				name: "builtin-local",
				kind: "local",
				// type must match pm.harnessType so runtime selection finds this adapter.
				type: "builtin",
				modelProviders: ["openai-compatible"],
				maxConcurrent: 1,
			});
			const resolveModel = async (_tier: string): Promise<ResolvedModel | undefined> =>
				resolvedModel;
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
			// created by runBetDecomposition AFTER buildPoolForLane runs.
			const { adapter, resolvedModel } = lockedHarnessAdapter("claude");
			const pool = new AdapterPool();
			pool.register("local-claude", adapter, {
				name: "local-claude",
				kind: "local",
				// type must match pm.harnessType so runtime selection finds this adapter.
				type: "claude",
				modelProviders: ["anthropic"],
				maxConcurrent: 4,
			});
			const resolveModel = async (_tier: string): Promise<ResolvedModel | undefined> =>
				resolvedModel;
			const prepSandbox = async (scratchPath: string): Promise<void> => {
				provisionClaudeSandbox(scratchPath);
			};
			return { pool, resolveModel, prepSandbox };
		}

		case "codex": {
			// Git repo init lives in sandboxDir (ctx.tmpDir) — git traverses parent dirs so
			// codex exec in scratchSandboxPath (a subdirectory) finds the repo. The adapter
			// injects CODEX_HOME=path.join(config.sandboxPath, ".codex-home") = scratchSandboxPath/
			// .codex-home, so auth is provisioned there via prepSandbox. Check auth in sandboxDir
			// first to give a clear error if codex isn't installed/logged in.
			initGitRepo(sandboxDir);
			const authFound = provisionCodexHome(sandboxDir); // preliminary check only
			if (!authFound) {
				throw new Error("codex lane: auth.json not found in ~/.codex — install codex and log in.");
			}
			const { adapter, resolvedModel } = lockedHarnessAdapter("codex");
			const pool = new AdapterPool();
			pool.register("local-codex", adapter, {
				name: "local-codex",
				kind: "local",
				// type must match pm.harnessType so runtime selection finds this adapter.
				type: "codex",
				modelProviders: ["openai-compatible"],
				maxConcurrent: 2,
			});
			const resolveModel = async (_tier: string): Promise<ResolvedModel | undefined> =>
				resolvedModel;
			const prepSandbox = async (scratchPath: string): Promise<void> => {
				// Initialize git repo in scratch sandbox too (codex exec requires git).
				initGitRepo(scratchPath);
				provisionCodexHome(scratchPath); // writes .codex-home/ into cwd
			};
			return { pool, resolveModel, prepSandbox };
		}

		case "opencode": {
			// @lore AR5/AR7: the adapter comes from the locked seam (stock opencode config),
			// so XDG_DATA_HOME isolation can NOT be injected via a custom envMap (the guard
			// forbids constructing a custom-config adapter here). Instead — exactly like the
			// AK2 session lanes — the TEST sets `process.env.XDG_DATA_HOME` in beforeEach to
			// `<tmpDir>/.opencode-data` (the stock opencode config forwards XDG_DATA_HOME from
			// the env allowlist). Auth is provisioned into that same dir here. opencode reads
			// XDG_DATA_HOME from the env regardless of its cwd (= scratch sandbox), so auth is
			// found. See bet-decomposition-real-agent.integration.test.ts beforeEach/afterEach.
			if (!process.env.OPENROUTER_API_KEY) {
				throw new Error("opencode lane: OPENROUTER_API_KEY not set.");
			}
			provisionOpencodeHome(sandboxDir);
			const { adapter, resolvedModel } = lockedHarnessAdapter("opencode");
			const pool = new AdapterPool();
			pool.register("local-opencode", adapter, {
				name: "local-opencode",
				kind: "local",
				// type must match pm.harnessType so runtime selection finds this adapter.
				type: "opencode",
				modelProviders: ["openai-compatible"],
				maxConcurrent: 2,
			});
			const resolveModel = async (_tier: string): Promise<ResolvedModel | undefined> =>
				resolvedModel;
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
