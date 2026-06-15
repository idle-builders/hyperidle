/**
 * AK2 — Minimal Strategy end-to-end integration tests (RED phase).
 *
 * AC1: A task can be dispatched and run end-to-end under a minimal Strategy
 *      that performs no context assembly, relevance, or attention work.
 *
 * Scenario 1 (from the WP validation scenarios):
 *   Given the minimal Strategy is active, when a task is dispatched (stub/echo
 *   harness), then a session runs to completion AND:
 *   - no knowledge/ files exist in the sandbox
 *   - no .fabric/manifest.json with items (empty manifest written by scaffold)
 *   - no knowledge_items rows created for this sessionId (no writeback)
 *
 * These tests FAIL until:
 *   1. packages/shared/src/strategy-port.ts exists (types — done in red phase)
 *   2. packages/server/src/services/strategy-registry.ts exists (green #2)
 *   3. packages/strategy-minimal exists with minimalStrategy exported (green #3)
 *   4. Both Kernel provisioning paths (session-provisioning.ts + session-lifecycle.ts)
 *      route through getActiveStrategy() instead of hard-importing assembleContext/
 *      startWatcher from @hyperidle/fabric (green #5a, #5b)
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
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import {
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	provisionSession,
} from "../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// ---------------------------------------------------------------------------
// Echo harness — completes immediately with zero cost
// ---------------------------------------------------------------------------

class EchoHarnessAdapter implements HarnessAdapter {
	async startSession(_config: SessionConfig): Promise<SessionHandle> {
		return { sessionId: "echo-session" };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		yield { type: "completion", text: "Echo: done." };
	}

	async stopSession(_handle: SessionHandle): Promise<SessionResult> {
		return {
			outcome: "completed",
			cost: { minor: 0, currency: "USD" },
			tokenUsage: { byTier: {} },
		};
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: ["anthropic"],
			mcpSupport: false,
		};
	}
}

function makePool(adapter: HarnessAdapter): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local", adapter, {
		name: "local",
		kind: "local",
		modelProviders: ["anthropic"],
		maxConcurrent: 4,
	});
	return pool;
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const NOW = "2026-06-15T00:00:00.000Z";

async function seedDomain(db: HyperIdleDb): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "p-ak2", name: "AK2 Test Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "tm-ak2", teamId: "p-ak2", capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "b-ak2",
		teamId: "p-ak2",
		description: "AK2 test bet",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-ak2",
		name: "AK2 Builder",
		role: "builder",
		status: "active",
		teamId: "tm-ak2",
		maxConcurrentSessions: 2,
		costActual: 0,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-ak2",
		betId: "b-ak2",
		teamId: "p-ak2",
		title: "AK2 Test Task",
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});

	// Seed a knowledge item — under minimal Strategy this must NOT appear in the
	// sandbox knowledge/ dir (context assembly is inert).
	await db.insert(knowledgeItems).values({
		id: "ki-ak2",
		title: "AK2 Principle",
		body: "This should NOT be assembled by minimal strategy.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "system",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

function baseParams(basePath: string): ProvisionSessionParams {
	return {
		taskId: "task-ak2",
		agentId: "agent-ak2",
		productId: "p-ak2",
		sandboxBasePath: basePath,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AK2 — Minimal Strategy: dispatch with no context assembly work", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak2-minimal-integration-"));
	});

	afterEach(() => {
		clearActiveStrategy();
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// AC1 / Scenario 1 main assertion: session reaches `completed` under minimal.
	test("session runs to completion (state=done, outcome=completed) under minimal Strategy", async ({
		db,
	}) => {
		// Import minimalStrategy from the (not-yet-existing) strategy-minimal package.
		// This import itself will fail until green phase #3 — the right failure reason.
		const { minimalStrategy } = await import("@hyperidle/strategy-minimal");

		await seedDomain(db);
		setActiveStrategy(minimalStrategy);

		const deps: ProvisionSessionDeps = {
			db,
			eventBus: { emit: () => {}, on: () => {}, off: () => {} } as never,
			adapterPool: makePool(new EchoHarnessAdapter()),
			workspace: new LocalSandboxAdapter(),
		};

		const result = await provisionSession(deps, baseParams(tmpDir));

		const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));

		expect(session?.state).toBe("done");
		expect(session?.outcome).toBe("completed");
	});

	// AC1 / Scenario 1: no knowledge files written under knowledge/ dir.
	test("no files written under knowledge/ when minimal Strategy is active", async ({ db }) => {
		const { minimalStrategy } = await import("@hyperidle/strategy-minimal");

		await seedDomain(db);
		setActiveStrategy(minimalStrategy);

		const deps: ProvisionSessionDeps = {
			db,
			eventBus: { emit: () => {}, on: () => {}, off: () => {} } as never,
			adapterPool: makePool(new EchoHarnessAdapter()),
			workspace: new LocalSandboxAdapter(),
		};

		const result = await provisionSession(deps, baseParams(tmpDir));

		// Find the session's sandbox path.
		const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));

		const sandboxPath = session?.sandboxSnapshot;
		expect(sandboxPath).toBeTruthy();

		// knowledge/ directory exists (scaffold) but is empty — no knowledge
		// injection happened from the seeded knowledge_items.
		const knowledgeDir = path.join(sandboxPath!, "knowledge");
		if (fs.existsSync(knowledgeDir)) {
			// Walk recursively — assert no files (dirs are ok for scaffold).
			function countFiles(dir: string): number {
				const entries = fs.readdirSync(dir, { withFileTypes: true });
				return entries.reduce((acc, e) => {
					if (e.isDirectory()) return acc + countFiles(path.join(dir, e.name));
					return acc + 1;
				}, 0);
			}
			expect(countFiles(knowledgeDir)).toBe(0);
		}
	});

	// AC1 / Scenario 1: .fabric/manifest.json exists but has zero items.
	test(".fabric/manifest.json has zero items when minimal Strategy is active", async ({ db }) => {
		const { minimalStrategy } = await import("@hyperidle/strategy-minimal");

		await seedDomain(db);
		setActiveStrategy(minimalStrategy);

		const deps: ProvisionSessionDeps = {
			db,
			eventBus: { emit: () => {}, on: () => {}, off: () => {} } as never,
			adapterPool: makePool(new EchoHarnessAdapter()),
			workspace: new LocalSandboxAdapter(),
		};

		const result = await provisionSession(deps, baseParams(tmpDir));

		const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));

		const sandboxPath = session?.sandboxSnapshot;
		const manifestPath = path.join(sandboxPath!, ".fabric", "manifest.json");
		expect(fs.existsSync(manifestPath)).toBe(true);

		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
			items?: unknown[];
		};
		// Minimal assembleContext writes an empty scaffold manifest — zero items.
		expect(manifest.items ?? []).toHaveLength(0);
	});

	// AC1 / Scenario 1: no new knowledge_items rows created (no writeback).
	// The Fabric's writeback path creates knowledge_items when the FileWatcher
	// flushes. Under minimal Strategy the IngestionHandle.dispose() is a no-op,
	// so the total row count stays at exactly the seeded count (1 row seeded above).
	test("no new knowledge_items rows created (no writeback) when minimal Strategy is active", async ({
		db,
	}) => {
		const { minimalStrategy } = await import("@hyperidle/strategy-minimal");

		await seedDomain(db);

		// Count seeded rows before dispatch.
		const before = await db.select().from(knowledgeItems);
		const beforeCount = before.length;

		setActiveStrategy(minimalStrategy);

		const deps: ProvisionSessionDeps = {
			db,
			eventBus: { emit: () => {}, on: () => {}, off: () => {} } as never,
			adapterPool: makePool(new EchoHarnessAdapter()),
			workspace: new LocalSandboxAdapter(),
		};

		await provisionSession(deps, baseParams(tmpDir));

		// @lore AK2: knowledge_items rows are created by the Fabric's writeback
		// path. Under minimal Strategy the IngestionHandle.dispose() is a no-op
		// so no rows are written — total count stays at seeded count.
		const after = await db.select().from(knowledgeItems);
		expect(after).toHaveLength(beforeCount);
	});
});
