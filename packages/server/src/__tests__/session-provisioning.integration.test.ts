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
import {
	bets,
	type HyperIdleDb,
	knowledgeItems,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { clearDeduplicationCache, fabricStrategy } from "@hyperidle/fabric";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { requireHarness } from "../harness/__tests__/require-harness.js";
import { AdapterPool, CLAUDE_CLI_CONFIG } from "../harness/adapter-pool.js";
import { CliHarnessAdapter } from "../harness/cli-harness-adapter.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import { type ProvisionSessionDeps, provisionSession } from "../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

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

	await db.insert(tasks).values({
		id: "task-1",
		betId: "b1",
		teamId: "p1",
		title: "Integration task",
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

		const deps: ProvisionSessionDeps = { db, eventBus, adapterPool, workspace };
		const result = await provisionSession(deps, {
			taskId: "task-1",
			agentId: "agent-1",
			productId: "p1",
			sandboxBasePath: tmpDir,
		});

		expect(result.outcome).toBe("completed");
		expect(result.totalCostCents).toBeGreaterThan(0);

		const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));
		expect(session?.state).toBe("done");
		// @lore AF4: `cost` was stripped from the sessions table (O2) — cost now
		// lives on the run result (asserted above via totalCostCents). Type-bridge
		// the removed column so this legacy assertion compiles unchanged.
		expect((session as { cost?: number } | undefined)?.cost ?? 0).toBeGreaterThan(0);
	}, 120_000);
});
