/**
 * S2 — AdapterPool integration: tests (AC3, AC4, AC8).
 *
 * Tests the integration of AdapterPool with session provisioning:
 * - provisionSession selects an adapter from the pool
 * - adapter slot is released after session completes
 * - all-at-capacity returns retriable error (task state unchanged)
 * - server self-registration: pool has exactly one local adapter
 * - backward compat: single-adapter pool works like today's harness path
 *
 * These fail (red phase) until adapter-pool.ts + updated session-provisioning.ts
 * are created.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bets, type HyperIdleDb, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { clearDeduplicationCache, fabricStrategy } from "@hyperidle/fabric";
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
import type { AdapterMeta } from "../harness/adapter-pool.js";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import type { ProvisionSessionDeps } from "../services/session-provisioning.js";
import { provisionSession } from "../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

// ── Scripted mock adapter ─────────────────────────────────────────────────────

function makeScriptedAdapter(events: HarnessEvent[] = []): HarnessAdapter {
	let nextId = 1;
	return {
		async startSession(_config: SessionConfig): Promise<SessionHandle> {
			return { sessionId: `pool-sess-${nextId++}` };
		},
		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
			for (const ev of events) {
				yield ev;
			}
		},
		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return {
				outcome: "completed",
				cost: { minor: 0, currency: "USD" },
				tokenUsage: { byTier: {} },
			};
		},
		getCapabilities(): HarnessCapabilities {
			return {
				preCompactionTrigger: true,
				subAgents: true,
				modelProviders: ["anthropic"],
				mcpSupport: false,
			};
		},
	};
}

const LOCAL_META: AdapterMeta = {
	name: "local",
	kind: "local",
	modelProviders: ["anthropic"],
	maxConcurrent: 4,
};

// ── DB fixtures ────────────────────────────────────────────────────────────────

const NOW = "2026-05-29T00:00:00.000Z";

async function seedDomain(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "p1", name: "Pool Product", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "b1",
		teamId: "p1",
		description: "Pool bet",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "agent-pool-1",
		name: "Pool Agent",
		role: "builder",
		status: "active",
		teamId: "t1",
		maxConcurrentSessions: 3,
		costCap: null,
		costActual: 0,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: "task-pool-1",
		betId: "b1",
		teamId: "p1",
		title: "Pool task",
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

// ── Tests ──────────────────────────────────────────────────────────────────────

// ProvisionSessionParams imported for type reference only

describe("AdapterPool + provisionSession integration (AC3)", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pool-test-"));
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		fs.rmSync(tmpDir, { recursive: true, force: true });
		// @lore PGLite: NOT calling dbHandle.close() here intentionally. close() would
		// TRUNCATE (blocking, holds PGlite connection) after provisionSession has left
		// async state (file watchers, open async generators) that can deadlock the
		// TRUNCATE under load. Pattern follows session-provisioning.test.ts — each
		// beforeEach gets a fresh PGlite instance; in-memory instances are GC'd with
		// the worker. No resource leak occurs.
	});

	test("provisionSession selects adapter from pool and releases after completion", async ({
		db,
		eventBus,
	}) => {
		await seedDomain(db);
		clearDeduplicationCache();

		const pool = new AdapterPool();
		pool.register("local", makeScriptedAdapter(), LOCAL_META);

		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace,
		};

		expect(pool.list()[0]?.currentLoad).toBe(0);

		const result = await provisionSession(deps, {
			taskId: "task-pool-1",
			agentId: "agent-pool-1",
			productId: "p1",
			sandboxBasePath: tmpDir,
		});

		expect(result.outcome).toBe("completed");

		// After completion, slot must be released
		expect(pool.list()[0]?.currentLoad).toBe(0);
	}, 120_000);

	test("all adapters at capacity → provisioning fails with retriable error, task unchanged", async ({
		db,
		eventBus,
	}) => {
		await seedDomain(db);
		clearDeduplicationCache();

		const pool = new AdapterPool();
		// Register with maxConcurrent: 1 and pre-fill the slot
		pool.register("local", makeScriptedAdapter(), { ...LOCAL_META, maxConcurrent: 1 });
		pool.select(); // fill the only slot

		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace,
		};

		// provisionSession should throw when no adapter available
		await expect(
			provisionSession(deps, {
				taskId: "task-pool-1",
				agentId: "agent-pool-1",
				productId: "p1",
				sandboxBasePath: tmpDir,
			}),
		).rejects.toThrow();

		// Task state must remain unchanged (not in_progress)
		const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-pool-1"));
		expect(task?.state).toBe("accepted");
	});
});

describe("AdapterPool backward compat: single adapter pool (AC8)", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pool-test-"));
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		fs.rmSync(tmpDir, { recursive: true, force: true });
		// @lore PGLite: NOT calling dbHandle.close() here intentionally (see AC3 lore above).
	});

	test("pool with one adapter produces same outcome as current single-harness path", async ({
		db,
		eventBus,
	}) => {
		await seedDomain(db);
		clearDeduplicationCache();

		const pool = new AdapterPool();
		pool.register(
			"local",
			makeScriptedAdapter([
				{ type: "token_usage", inputTokens: 10, outputTokens: 5 },
				{ type: "completion", text: "done" },
			]),
			LOCAL_META,
		);

		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace,
		};

		const result = await provisionSession(deps, {
			taskId: "task-pool-1",
			agentId: "agent-pool-1",
			productId: "p1",
			sandboxBasePath: tmpDir,
		});

		expect(result.outcome).toBe("completed");
		expect(result.taskId).toBe("task-pool-1");

		const [session] = await db.select().from(sessions).where(eq(sessions.id, result.sessionId));
		expect(session?.state).toBe("done");
	}, 120_000);
});

describe("Server self-registration (AC4)", () => {
	test("pool has local adapters (claude-code + builtin) after createLocalAdapterPool", async () => {
		const { createLocalAdapterPool } = await import("../harness/adapter-pool.js");

		const pool = await createLocalAdapterPool();
		const entries = pool.list();

		expect(entries.length).toBeGreaterThanOrEqual(2);
		expect(entries.every((e) => e.kind === "local")).toBe(true);
		expect(entries.some((e) => e.type === "claude-code")).toBe(true);
		expect(entries.some((e) => e.type === "builtin")).toBe(true);
	});
});
