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
	createTestDb,
	type HyperIdleDb,
	knowledgeItems,
	products,
	sessions,
	tasks,
	teams,
	users,
} from "@hyperidle/db";
import { clearDeduplicationCache } from "@hyperidle/fabric";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaudeAgentSdkAdapter } from "../harness/claude-agent-sdk-adapter.js";
import { LocalWorkspaceAdapter } from "../harness/local-workspace-adapter.js";
// Imported from a not-yet-written module. Until the green phase creates
// session-provisioning.ts this suite fails with a module-not-found error.
import { type ProvisionSessionDeps, provisionSession } from "../services/session-provisioning.js";

const NOW = "2026-04-16T00:00:00.000Z";

function seedDomain(db: HyperIdleDb): void {
	db.insert(products)
		.values({ id: "p1", name: "Integration Product", phase: "build", createdAt: NOW })
		.run();
	db.insert(teams)
		.values({ id: "t1", productId: "p1", capacity: 5, activeBets: 0, formedAt: NOW })
		.run();
	db.insert(bets)
		.values({
			id: "b1",
			productId: "p1",
			teamId: "t1",
			pitch: "Integration bet",
			appetite: "small",
			status: "committed",
			createdAt: NOW,
		})
		.run();
	db.insert(users)
		.values({
			id: "agent-1",
			name: "Integration Agent",
			role: "builder",
			status: "active",
			teamId: "t1",
			maxConcurrentSessions: 1,
			costCap: null,
			createdAt: NOW,
		})
		.run();
	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "b1",
			productId: "p1",
			teamId: "t1",
			title: "Integration task",
			state: "accepted",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.run();
	db.insert(knowledgeItems)
		.values({
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
		})
		.run();
}

describe("Session Provisioning — Claude integration (D5/AC2)", () => {
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let tmpDir: string;

	beforeEach(() => {
		db = createTestDb();
		eventBus = new EventBus();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "d5-integration-"));
		clearDeduplicationCache();
		seedDomain(db);
	});

	afterEach(() => {
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it.skipIf(!process.env.ANTHROPIC_API_KEY)(
		"provisions a real Claude session and completes with cost > 0",
		async () => {
			const harness = new ClaudeAgentSdkAdapter();
			const workspace = new LocalWorkspaceAdapter();

			const deps: ProvisionSessionDeps = { db, eventBus, harness, workspace };
			const result = await provisionSession(deps, {
				taskId: "task-1",
				agentId: "agent-1",
				productId: "p1",
				workspaceBasePath: tmpDir,
			});

			expect(result.outcome).toBe("completed");
			expect(result.totalCostCents).toBeGreaterThan(0);

			const session = db.select().from(sessions).where(eq(sessions.id, result.sessionId)).get();
			expect(session?.state).toBe("done");
			expect(session?.cost ?? 0).toBeGreaterThan(0);
		},
		120_000,
	);
});
