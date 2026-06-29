/**
 * AR2 — One real agent run through production `provisionSession()`.
 *
 * Proves all four AR2 acceptance criteria:
 *
 *   AC1: A real agent run through production `provisionSession()` (not a bespoke
 *        test rig) — real adapter, real model, real `admitSession`/`runSession`/
 *        teardown — asserts on actual produced output.
 *
 *   AC2: The capture-before-teardown seam (`onBeforeTeardown` on
 *        `ProvisionSessionDeps`) observes the real sandbox contents AFTER the
 *        agent finishes writing AND BEFORE `endSession` deletes them. The captured
 *        bytes are the load-bearing proof (the sandbox is gone after
 *        `provisionSession` returns — there is NO other observation channel for
 *        pure-sandbox files).
 *
 *   AC3: Both lanes are gated by `requireHarness(...)` — HARD-FAIL, never skip.
 *        A missing harness (no OPENROUTER_API_KEY, no `claude` binary) means the
 *        work is not done.
 *
 *   AC4: Both lanes use the extractable `createSandboxCapture` + `startMcpBridgeServer`
 *        helper from `provision-real-session.ts` — the reusable pattern AR3–AR6 import.
 *
 * Two lanes, same shape (provision-real → capture → assert → teardown):
 *
 *   Lane 1 (builtin) — `BuiltinHarnessAdapter` + cheap OpenRouter model.
 *   Gate: `requireHarness("builtin")` (OPENROUTER_API_KEY present).
 *   The agent calls the in-registry `commit_file` HyperIdle tool to write
 *   `answer.txt` into the sandbox. `commit_file` writes to `ctx.sandboxPath`
 *   (confirmed: commit-file.ts:39). `onBeforeTeardown` reads it before `rm`.
 *   Belt-and-suspenders: also assert `result.totalCostCents > 0` (a stub yields 0).
 *
 *   Lane 2 (claude CLI) — real `claude` binary + native Write tool.
 *   Gate: `requireHarness("claude")`.
 *   The agent uses claude's native `Write` file-system tool to write `answer.txt`
 *   directly into the sandbox. This is the strongest AC2 proof: a real file that
 *   only the capture seam can observe (no DB row, deleted at teardown).
 *   Requires the production MCP bridge (`startMcpBridgeServer`) because
 *   CLAUDE_CLI_CONFIG unconditionally passes `--mcp-config .mcp.json`.
 *
 * @lore AR2: Both lanes use `tasks` with `doneCondition` phrased toward
 * `send_message` (the non-aborting return path) — matching the AR1 baseline
 * lore (cost-capture: handoff aborts the run before the cost line is emitted).
 * Lane 1 additionally needs to direct the agent to use `commit_file`, an
 * irreversible HyperIdle tool. Without a `sessionWorkflow` in params, the
 * workflow router is absent and `commit_file` executes directly.
 *
 * @lore AR2 W2 resolution: `commit_file` writes into `ctx.sandboxPath` (verified
 * against commit-file.ts:39 — path.resolve resolves relative against sandboxPath).
 * Lane 1's AC2 proof is load-bearing: the captured file is in the sandbox and
 * deleted at teardown. Lane 2 uses native Write (even stronger proof).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	type HyperIdleDb,
	knowledgeItems,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { clearDeduplicationCache, fabricStrategy } from "@hyperidle/fabric";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { AdapterPool, CLAUDE_CLI_CONFIG } from "../adapter-pool.js";
import { BuiltinHarnessAdapter } from "../builtin-harness-adapter.js";
import { CliHarnessAdapter } from "../cli-harness-adapter.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import { type ProvisionSessionDeps, provisionSession } from "../../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";
import { requireHarness } from "./require-harness.js";
import { createSandboxCapture, startMcpBridgeServer } from "./provision-real-session.js";

// ─── Shared constants ────────────────────────────────────────────────────────

const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

/**
 * Closed, bounded model list for the builtin lane. Mirrors the AM2 pattern:
 * auth error (401/403) → FAIL immediately; model-not-found → try next;
 * all fail → throw. Never an unbounded fallback.
 *
 * @lore AR2: `openai/gpt-4o-mini` supports tool use (function calling) and is
 * cheap. `openai/gpt-3.5-turbo` is the fallback. The list is bounded so catalog
 * churn does not silently succeed with an unbounded model list.
 */
const BUILTIN_MODEL_CANDIDATES = ["openai/gpt-4o-mini", "openai/gpt-3.5-turbo"] as const;

const NOW = "2026-06-29T00:00:00.000Z";

// ─── Domain seeding ──────────────────────────────────────────────────────────

/**
 * Seed the minimal domain rows for a single-agent, single-task session.
 * The `doneCondition` steers the agent toward `send_message` (non-aborting
 * return path) so the terminal cost line is emitted before the process exits.
 *
 * @lore AR1 cost-capture: `handoff_to`/`submit_review` abort the run on handoff
 * (handoff-protocol.ts:339 sends SIGTERM before the cost line is printed).
 * `send_message` has no abort — the run completes and totalCostCents > 0.
 */
async function seedDomain(
	db: HyperIdleDb,
	opts: { taskId: string; agentId: string; taskDescription: string; doneCondition: string },
): Promise<void> {
	await db.insert(teams).values({ id: "p1", name: "AR2 Integration Team", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "b1",
		teamId: "p1",
		description: "AR2 integration bet",
		appetite: "small",
		status: "active",
		doneCondition: opts.doneCondition,
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: opts.agentId,
		name: "AR2 Integration Agent",
		role: "builder",
		status: "active",
		teamId: "t1",
		maxConcurrentSessions: 1,
		costCap: null,
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "owner-1",
		name: "AR2 Integration Owner",
		role: "founder",
		status: "active",
		teamId: "t1",
		maxConcurrentSessions: 1,
		costCap: null,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: opts.taskId,
		betId: "b1",
		teamId: "p1",
		title: "AR2 capture seam proof",
		description: opts.taskDescription,
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(knowledgeItems).values({
		id: "ki-ar2-1",
		title: "AR2 test principle",
		body: "AR2 integration body.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "system",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

// ─── Lane 1: builtin + cheap OpenRouter model ─────────────────────────────────

describe("AR2 Lane 1 — builtin harness + real model (AC1/AC2/AC3/AC4)", () => {
	requireHarness("builtin");

	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ar2-lane1-"));
		clearDeduplicationCache();
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test(
		"provisions a real builtin session; agent writes answer.txt via commit_file; seam captures it before teardown",
		async ({ db, eventBus }) => {
			const agentId = "ar2-builtin-agent";
			const taskId = "ar2-builtin-task";

			await seedDomain(db, {
				taskId,
				agentId,
				taskDescription:
					"Use the commit_file tool to write a file named 'answer.txt' containing exactly " +
					"the number 4 into the sandbox. Then report your result to the human owner " +
					"(id 'owner-1') by calling send_message with to='owner-1' and body 'Done: 4'. " +
					"Do NOT hand off or submit a review.",
				doneCondition:
					"Agent reports the answer to the human owner (id 'owner-1') via send_message.",
			});

			// AC4: use the extractable createSandboxCapture helper.
			const cap = createSandboxCapture({ paths: ["answer.txt"] });

			// Builtin lane: no MCP bridge needed. mcpSupport:false + tools execute in-process.
			const apiKey = process.env.OPENROUTER_API_KEY as string;

			// Pick a working model from the bounded candidate list (mirrors AM2 pattern).
			// We need to try candidates but provisionSession takes a single resolvedModel.
			// Strategy: attempt each model in turn using the bounded list.
			let lastError: unknown = null;
			let succeeded = false;

			for (const candidate of BUILTIN_MODEL_CANDIDATES) {
				// Re-create the pool for each attempt (the previous attempt may have
				// consumed the adapter slot, though with retry:2 the harness project
				// typically handles transient model errors).
				const pool = new AdapterPool();
				pool.register("builtin-local", new BuiltinHarnessAdapter({ maxIterations: 5, maxOutputTokens: 512 }), {
					name: "builtin-local",
					kind: "local",
					modelProviders: ["openai-compatible"],
					maxConcurrent: 1,
				});

				const deps: ProvisionSessionDeps = {
					db,
					eventBus,
					adapterPool: pool,
					workspace: new LocalSandboxAdapter(),
					// AC2: the capture seam callback — fires after drain, before rm.
					onBeforeTeardown: cap.onBeforeTeardown,
				};

				try {
					const result = await provisionSession(deps, {
						taskId,
						agentId,
						productId: "p1",
						sandboxBasePath: tmpDir,
						resolvedModel: {
							provider: "openai-compatible",
							model: candidate,
							apiKey,
							baseUrl: OPENROUTER_BASE_URL,
						},
					});

					// AC1: real cost > 0 — a stub/echo run yields 0.
					expect(result.totalCostCents).toBeGreaterThan(0);

					// AC2: the seam fired and captured real bytes the real model wrote.
					// If onBeforeTeardown was never wired, `cap.files` is empty → this fails.
					const answerContent = cap.files.get("answer.txt");
					expect(answerContent).toBeDefined();
					expect(answerContent).toContain("4");

					succeeded = true;
					break;
				} catch (err) {
					// Distinguish auth errors (→ FAIL immediately) from model-not-available
					// (→ try next candidate), mirroring the AM2 pattern.
					const msg = err instanceof Error ? err.message : String(err);
					if (/401|403|Unauthorized|Forbidden/i.test(msg)) {
						throw new Error(
							`AR2 Lane 1 FAIL: builtin key present but got auth error for model "${candidate}": ${msg}`,
						);
					}
					lastError = err;
				}
			}

			if (!succeeded) {
				throw new Error(
					`AR2 Lane 1: all candidates in bounded list ${JSON.stringify(BUILTIN_MODEL_CANDIDATES)} failed. ` +
						`Final error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
				);
			}
		},
		// 240s: matches the harness project ceiling — real-model tool-calling can run long.
		240_000,
	);
});

// ─── Lane 2: real claude CLI + native Write tool ──────────────────────────────

describe("AR2 Lane 2 — claude CLI + native Write (AC1/AC2/AC3/AC4)", () => {
	requireHarness("claude");

	let tmpDir: string;
	// biome-ignore lint/suspicious/noExplicitAny: server type — close() is the only method used
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null =
		null;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ar2-lane2-"));
		clearDeduplicationCache();
		setActiveStrategy(fabricStrategy);
		// AC4: use the extractable startMcpBridgeServer helper.
		bridge = await startMcpBridgeServer();
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test(
		"provisions a real claude CLI session; agent writes answer.txt via native Write tool; seam captures it before teardown",
		async ({ db, eventBus }) => {
			if (!bridge) throw new Error("bridge not set up");

			const agentId = "ar2-claude-agent";
			const taskId = "ar2-claude-task";

			// Lane 2: task directs the agent to use its native Write tool (not a HyperIdle tool).
			// The native Write writes directly into the sandbox directory, which is the
			// agent's working directory. send_message for the (non-aborting) return.
			await seedDomain(db, {
				taskId,
				agentId,
				taskDescription:
					"Create a file named 'answer.txt' in the current working directory containing " +
					"exactly the number 4. Then report your result to the human owner " +
					"(id 'owner-1') by calling send_message with to='owner-1' and body 'Done: 4'. " +
					"Do NOT hand off or submit a review.",
				doneCondition:
					"Agent creates answer.txt and reports to the human owner via send_message.",
			});

			// AC4: use the extractable createSandboxCapture helper.
			const cap = createSandboxCapture({ paths: ["answer.txt"] });

			const adapterPool = new AdapterPool();
			adapterPool.register("local-claude", new CliHarnessAdapter(CLAUDE_CLI_CONFIG), {
				name: "local-claude",
				kind: "local",
				modelProviders: ["anthropic"],
				maxConcurrent: 4,
			});

			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool,
				workspace: new LocalSandboxAdapter(),
				mcpBridgeRegistry: bridge.mcpBridgeRegistry,
				mcpBaseUrl: bridge.mcpBaseUrl,
				// AC2: the capture seam callback — fires after drain, before rm.
				onBeforeTeardown: cap.onBeforeTeardown,
			};

			const result = await provisionSession(deps, {
				taskId,
				agentId,
				productId: "p1",
				sandboxBasePath: tmpDir,
				// claude uses keychain auth; model string must be a real catalog id.
				resolvedModel: {
					provider: "anthropic" as const,
					model: "claude-haiku-4-5",
					apiKey: "keychain-auth-unused",
					baseUrl: "https://api.anthropic.com",
				},
			});

			// AC1: real cost > 0 — a stub/echo run yields 0.
			expect(result.totalCostCents).toBeGreaterThan(0);

			// AC2 (load-bearing): the seam fired and captured real bytes the native
			// Write tool produced. This file has NO other observation channel — it is
			// purely a sandbox artifact, deleted at teardown. If `onBeforeTeardown`
			// was never wired, `cap.files` is empty → this assertion fails.
			const answerContent = cap.files.get("answer.txt");
			expect(answerContent).toBeDefined();
			expect(answerContent).toContain("4");
		},
		// 240s: matches the harness project ceiling — the real claude run can hit the
		// AL6 re-prompt loop. Once the isReturnAction MCP-namespace fix lands this
		// drops to one turn; until then the re-prompt budget adds turns.
		240_000,
	);
});
