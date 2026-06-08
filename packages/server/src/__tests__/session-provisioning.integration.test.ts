/**
 * Session Provisioning — AC2 integration test (real Claude Agent SDK).
 *
 * This test is skipped unless `ANTHROPIC_API_KEY` is present in the environment
 * (e.g. in CI with secrets configured). It proves AC2 of D5:
 *   "Claude integration test: provision real session → agent runs → session
 *    completes."
 *
 * It uses `ClaudeAgentSdkAdapter` (D2) and `LocalWorkspaceAdapter` (D3).
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
import { clearDeduplicationCache } from "@hyperidle/fabric";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { ClaudeAgentSdkAdapter } from "../harness/claude-agent-sdk-adapter.js";
import { LocalWorkspaceAdapter } from "../harness/local-workspace-adapter.js";
import { type ProvisionSessionDeps, provisionSession } from "../services/session-provisioning.js";
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
		layer: "L4",
		kind: "principle",
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
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "d5-integration-"));
		clearDeduplicationCache();
	});

	afterEach(() => {
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	test.skipIf(!process.env.ANTHROPIC_API_KEY)(
		"provisions a real Claude session and completes with cost > 0",
		async ({ db, eventBus }) => {
			await seedDomain(db);
			const workspace = new LocalWorkspaceAdapter();
			const adapterPool = new AdapterPool();
			adapterPool.register("local", new ClaudeAgentSdkAdapter(), {
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
				workspaceBasePath: tmpDir,
			});

			expect(result.outcome).toBe("completed");
			expect(result.totalCostCents).toBeGreaterThan(0);

			const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));
			expect(session?.state).toBe("done");
			expect(session?.cost ?? 0).toBeGreaterThan(0);
		},
		120_000,
	);
});
