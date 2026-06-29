/**
 * Session Provisioning — AC2 integration test (real claude CLI adapter).
 *
 * Harness-facing: drives the REAL installed `claude` binary via
 * `CliHarnessAdapter(CLAUDE_CLI_CONFIG)` (the claude CLI uses inherited keychain
 * login — NO API key). The test is gated by `requireHarness("claude")`, which
 * HARD-FAILS (never skips) when the binary is absent: a missing harness means the
 * work is not done, not that the suite passes.
 *
 * It proves AC2 of D5:
 *   "Claude integration test: provision real session → agent runs → session
 *    completes."
 *
 * It uses `CliHarnessAdapter(CLAUDE_CLI_CONFIG)` (the claude CLI adapter)
 * and `LocalSandboxAdapter` (D3).
 *
 * @lore claude-cli-adapter: Previously used ClaudeAgentSdkAdapter (now deleted).
 * The claude CLI adapter spawns the `claude` binary directly. Gate the binary
 * with requireHarness("claude") — never a key proxy (AR1).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { serve } from "@hono/node-server";
import {
	bets,
	type HyperIdleDb,
	knowledgeItems,
	messages,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { clearDeduplicationCache, fabricStrategy } from "@hyperidle/fabric";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { requireHarness } from "../harness/__tests__/require-harness.js";
import { AdapterPool, CLAUDE_CLI_CONFIG } from "../harness/adapter-pool.js";
import { CliHarnessAdapter } from "../harness/cli-harness-adapter.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import { enforcementRegistry } from "../harness/return-enforcement-registry.js";
import { createMcpBridgeRegistry, type McpBridgeRegistry } from "../mcp/mcp-bridge-registry.js";
import { createMcpRoute } from "../routes/mcp-route.js";
import { type ProvisionSessionDeps, provisionSession } from "../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

/**
 * Stand up a real Hono server serving the PRODUCTION MCP route at /api, mirroring
 * server-factory.ts:299-300,386-391. provisionSession writes a `.mcp.json` into the
 * sandbox pointing at `${mcpBaseUrl}/api/mcp/<token>`; the spawned real claude binary
 * connects to THIS server to reach the session-scoped HyperIdle tool registry.
 *
 * @lore AR1 session-provisioning-bridge: Without `mcpBridgeRegistry`/`mcpBaseUrl` in
 * deps, provisionSession writes NO `.mcp.json` (the `if (mcpBridgeRegistry && mcpBaseUrl)`
 * guard at session-provisioning.ts:767 is skipped), yet CLAUDE_CLI_CONFIG.args
 * UNCONDITIONALLY pass `--mcp-config .mcp.json --strict-mcp-config` — so the real
 * claude spawn crashes "MCP config file not found." Wiring the production bridge into
 * the test deps (same as AL7 + the server factory) makes `.mcp.json` exist so the real
 * run completes. The unconditional-args latent production bug is AR2's (lore'd at
 * adapter-pool.ts CLAUDE_CLI_CONFIG.args). The enforcementRegistry passed to
 * createMcpRoute is the same process singleton provisionSession registers into.
 */
async function startMcpBridgeServer(): Promise<{
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

const NOW = "2026-04-16T00:00:00.000Z";

async function seedDomain(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "p1", name: "Integration Product", phase: "build", createdAt: NOW });

	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });

	await db.insert(bets).values({
		id: "b1",
		teamId: "p1",
		description: "Integration bet",
		appetite: "small",
		status: "active",
		// A concrete done condition that the agent satisfies in one turn by reporting
		// its result via send_message. This steers the return-enforcement Stop hook
		// toward send_message (which exits the process naturally → the terminal
		// total_cost_usd line is captured) rather than handoff_to/submit_review, which
		// abort the session (SIGTERM, exit 143) BEFORE the cost line is emitted.
		// @lore AR1 cost-capture: handoff-protocol.ts:339 aborts the run on handoff —
		// the killed process never prints its result line, so totalCostCents would be 0.
		// send-message.ts has no abort, so the run completes and cost is recorded.
		doneCondition:
			"Report the answer to the human owner (id 'owner-1') by calling send_message " +
			"with to='owner-1'. Do not hand off or submit a review.",
		createdAt: NOW,
	});

	await db.insert(users).values({
		id: "agent-1",
		name: "Integration Agent",
		role: "builder",
		status: "active",
		teamId: "t1",
		maxConcurrentSessions: 1,
		costCap: null,
		createdAt: NOW,
	});

	// A human recipient the agent can send_message to (the non-aborting return path).
	await db.insert(users).values({
		id: "owner-1",
		name: "Integration Owner",
		role: "founder",
		status: "active",
		teamId: "t1",
		maxConcurrentSessions: 1,
		costCap: null,
		createdAt: NOW,
	});

	await db.insert(tasks).values({
		id: "task-1",
		betId: "b1",
		teamId: "p1",
		title: "Answer a trivial question and report it",
		description:
			"Compute 2 + 2 and report the result to the human owner (id 'owner-1') by " +
			"calling send_message with to='owner-1' and body containing the answer. " +
			"This completes the task — do NOT hand off or submit a review.",
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});

	await db.insert(knowledgeItems).values({
		id: "ki-seed-1",
		title: "Integration Principle",
		body: "Integration body.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "system",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("Session Provisioning — Claude integration (D5/AC2)", () => {
	requireHarness("claude");

	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "d5-integration-"));
		clearDeduplicationCache();
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test("provisions a real Claude session and completes with cost > 0", async ({ db, eventBus }) => {
		await seedDomain(db);
		const workspace = new LocalSandboxAdapter();
		const adapterPool = new AdapterPool();
		adapterPool.register("local", new CliHarnessAdapter(CLAUDE_CLI_CONFIG), {
			name: "local",
			kind: "local",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		// Stand up the production MCP bridge + route so provisionSession writes a real
		// `.mcp.json` the spawned claude binary connects to. Without this the CLI config's
		// unconditional `--mcp-config .mcp.json` crashes the real run (see startMcpBridgeServer).
		const bridge = await startMcpBridgeServer();
		try {
			const deps: ProvisionSessionDeps = {
				db,
				eventBus,
				adapterPool,
				workspace,
				mcpBridgeRegistry: bridge.mcpBridgeRegistry,
				mcpBaseUrl: bridge.mcpBaseUrl,
			};
			const result = await provisionSession(deps, {
				taskId: "task-1",
				agentId: "agent-1",
				productId: "p1",
				sandboxBasePath: tmpDir,
				// The claude CLI authenticates via keychain (envMap:{}), so apiKey/baseUrl
				// are unused by this path — but `--model {{model}}` MUST resolve to a real
				// catalog id (an empty model crashes the spawn). haiku = cheapest catalog
				// model, matching the AL6 real-harness test.
				resolvedModel: {
					provider: "anthropic" as const,
					model: "claude-haiku-4-5",
					apiKey: "keychain-auth-unused",
					baseUrl: "https://api.anthropic.com",
				},
			});

			// HARD ASSERTIONS — a genuinely completed real claude session, proven by
			// the side-effects only a real end-to-end run produces:
			//
			//  (1) real cost: the terminal `total_cost_usd` line from the real claude
			//      binary was parsed and accumulated (a stub/echo run produces 0).
			//  (2) real persisted completion: the session row reached state="done".
			//  (3) real agent output: the agent connected to the provisioned MCP bridge,
			//      called the namespaced HyperIdle return tool `mcp__hyperidle__send_message`,
			//      and that tool wrote a real `messages` row from agent-1 to owner-1. This
			//      is the load-bearing proof the agent reached the bridge and did real work
			//      — it cannot be faked by a stubbed harness.
			expect(result.totalCostCents).toBeGreaterThan(0);

			const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));
			expect(session?.state).toBe("done");
			// @lore AR1 dead-assertion-removed: the prior test asserted `session.cost > 0`,
			// but `cost` was stripped from the sessions table (O2/AF4) — the column no
			// longer exists, so the cast read `undefined ?? 0` ALWAYS yielded 0. The
			// assertion only ever "passed" because the test was skipIf-gated on the absent
			// ANTHROPIC_API_KEY and never ran (the exact false-green AR1 kills). Cost now
			// lives on the run result and is asserted above via `totalCostCents`. Removing
			// a check against a removed column is not a weakening — it removes dead code.

			// (3) The agent's MCP return call landed a real message from agent-1.
			const agentMessages = await db
				.select()
				.from(messages)
				.where(eq(messages.senderId, "agent-1"));
			expect(agentMessages.length).toBeGreaterThan(0);

			// @lore AR2-latent-bug return-action-mcp-namespace: `result.outcome` is the
			// AL6 return-VERDICT. For a real claude session the ONLY return tools available
			// are the MCP-bridge ones, so the agent calls `mcp__hyperidle__send_message`.
			// But `isReturnAction` (shared/harness/return-actions.ts) matches the BARE name
			// `send_message` and does NOT strip the `mcp__<server>__` prefix, so the return
			// gate never registers the return → endSession persists outcome="not_returned"
			// even though the agent genuinely returned (proven by the real message row above).
			// This is a latent PRODUCTION bug AR1's honest test surfaced (same class as the
			// unconditional `--mcp-config` one): a real CLI+MCP session can NEVER be verdicted
			// "completed" until isReturnAction strips the MCP namespace. AR2 (the
			// provisionSession-seam WP) owns the fix; NOT in AR1 scope (test-honesty only —
			// AR1 must not change production behavior to make a test pass). We assert the
			// honest current verdict so a regression (or the AR2 fix flipping it to
			// "completed") is caught here.
			expect(result.outcome).toBe("not_returned");
		} finally {
			await bridge.close();
		}
		// 240s: a real claude session that returns via the MCP send_message tool can run
		// long once the return-enforcement re-prompt loop (AL6) is in play — because the
		// MCP-namespace return-action bug (lored above) prevents the gate from recognizing
		// the first send_message, so the Stop hook re-prompts up to the AL6 force budget,
		// adding turns. Observed live: 40-140s. The session genuinely completes (real cost,
		// real message row); it is just slow. Once AR2 fixes isReturnAction this drops to
		// one turn. Generous ceiling keeps the honest run from flaking on a slow LLM day.
	}, 240_000);
});
