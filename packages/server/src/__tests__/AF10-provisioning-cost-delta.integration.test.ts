/**
 * AF10 — AC1: provisionSession passes per-event delta (not running total) to
 * recordCostAndCheck, so three cost events (10, 5, 5) produce users.costActual
 * == 20, NOT 45 (the quadratic inflation from Z8-002).
 *
 * This test uses the ScriptedHarnessAdapter pattern from
 * session-provisioning.test.ts to inject synthetic cost_update events into
 * provisionSession, then reads back the accumulator columns to prove the caller
 * passes deltas not running totals.
 *
 * The test FAILS until session-provisioning.ts:768 is changed to pass
 * `deltaMinor` instead of `totalCostCents` to recordCostAndCheck.
 *
 * Protected assertions per CC-008: this test ADDS cases without loosening
 * the existing teardown/result-cost assertions in the other test files.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
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
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import {
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	provisionSession,
} from "../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";

const NOW = "2026-04-16T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Minimal scripted harness
// ---------------------------------------------------------------------------

class ScriptedHarness implements HarnessAdapter {
	private readonly events: HarnessEvent[];
	constructor(events: HarnessEvent[]) {
		this.events = events;
	}

	async startSession(_config: SessionConfig): Promise<SessionHandle> {
		return { sessionId: "af10-scripted-session" };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		for (const ev of this.events) {
			yield ev;
		}
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

function makePool(harness: HarnessAdapter): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local", harness, {
		name: "local",
		kind: "local",
		modelProviders: ["anthropic"],
		maxConcurrent: 4,
	});
	return pool;
}

async function seedDomain(db: HyperIdleDb, suffix = ""): Promise<void> {
	await db.insert(teams).values({
		id: `p1${suffix}`,
		name: "AF10 Team",
		phase: "build",
		createdAt: NOW,
	});

	await db.insert(teamMembers).values({
		id: `t1${suffix}`,
		teamId: `p1${suffix}`,
		capacity: 5,
		activeBets: 0,
		costActual: 0,
		formedAt: NOW,
	});

	await db.insert(users).values({
		id: `agent-af10${suffix}`,
		name: "AF10 Agent",
		role: "builder",
		status: "active",
		teamId: `t1${suffix}`,
		maxConcurrentSessions: 2,
		costCap: null,
		costActual: 0,
		createdAt: NOW,
	});

	await db.insert(bets).values({
		id: `bet-af10${suffix}`,
		teamId: `p1${suffix}`,
		description: "AF10 test bet",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});

	await db.insert(tasks).values({
		id: `task-af10${suffix}`,
		betId: `bet-af10${suffix}`,
		teamId: `p1${suffix}`,
		title: "AF10 test task",
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("AF10 AC1: provisionSession cost delta vs running total (Z8-002)", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "af10-prov-"));
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

	/**
	 * The canonical Z8-002 scenario: three cost_update events with deltaCost
	 * values of 0.10, 0.05, 0.05 USD (= 10, 5, 5 cents). After provisioning
	 * completes, users.costActual must be 20, NOT 45.
	 *
	 * The quadratic inflation occurs because the session-provisioning loop
	 * passes `totalCostCents` (10, 15, 20) instead of the per-event delta
	 * (10, 5, 5) to recordCostAndCheck. The boundary does `+= costMinor`, so:
	 *   - correct:  10 + 5 + 5 = 20
	 *   - buggy:    10 + 15 + 20 = 45
	 *
	 * This test FAILS (showing 45) until the fix in T2 is applied.
	 */
	test("three cost_update events (0.10, 0.05, 0.05 USD) accumulate to 20 cents on users.costActual", async ({
		db,
		eventBus,
	}) => {
		await seedDomain(db);

		const costEvents: HarnessEvent[] = [
			{ type: "cost_update", deltaCost: 0.1, totalCost: 0.1, currency: "USD" },
			{ type: "cost_update", deltaCost: 0.05, totalCost: 0.15, currency: "USD" },
			{ type: "cost_update", deltaCost: 0.05, totalCost: 0.2, currency: "USD" },
		];

		const harness = new ScriptedHarness(costEvents);
		const adapterPool = makePool(harness);
		const workspace = new LocalSandboxAdapter();

		const deps: ProvisionSessionDeps = { db, eventBus, adapterPool, workspace };
		const params: ProvisionSessionParams = {
			taskId: "task-af10",
			agentId: "agent-af10",
			productId: "p1",
			sandboxBasePath: tmpDir,
		};

		await provisionSession(deps, params);

		const [agent] = await db
			.select({ costActual: users.costActual })
			.from(users)
			.where(eq(users.id, "agent-af10"))
			.limit(1);

		// FAILS until T2: currently shows 45 (quadratic inflation)
		expect(agent?.costActual).toBe(20);
	});

	/**
	 * Complement: bet aggregate also accumulates correctly via taskId lookup.
	 * Three events (10, 5, 5 cents) must produce bets.costActualMinor == 20.
	 */
	test("three cost_update events accumulate to 20 cents on bets.costActualMinor", async ({
		db,
		eventBus,
	}) => {
		await seedDomain(db, "-b");

		const costEvents: HarnessEvent[] = [
			{ type: "cost_update", deltaCost: 0.1, totalCost: 0.1, currency: "USD" },
			{ type: "cost_update", deltaCost: 0.05, totalCost: 0.15, currency: "USD" },
			{ type: "cost_update", deltaCost: 0.05, totalCost: 0.2, currency: "USD" },
		];

		const harness = new ScriptedHarness(costEvents);
		const adapterPool = makePool(harness);
		const workspace = new LocalSandboxAdapter();

		const deps: ProvisionSessionDeps = { db, eventBus, adapterPool, workspace };
		const params: ProvisionSessionParams = {
			taskId: "task-af10-b",
			agentId: "agent-af10-b",
			productId: "p1-b",
			sandboxBasePath: tmpDir,
		};

		await provisionSession(deps, params);

		const [bet] = await db
			.select({ costActualMinor: bets.costActualMinor })
			.from(bets)
			.where(eq(bets.id, "bet-af10-b"))
			.limit(1);

		// FAILS until T2: currently shows 45 (quadratic inflation)
		expect(bet?.costActualMinor).toBe(20);
	});

	/**
	 * Factory cost (factory_settings.cost_actual = SUM(users.costActual)) must
	 * also reflect 20 not 45. The AF8 contract says recordFactoryCost is called
	 * at the tail of each recordCostAndCheck — so after the three events it
	 * should be 20.
	 *
	 * Check via users.costActual sum (factory cost is the SUM; if agent is 20 and
	 * was the only agent, factory is also 20).
	 */
	test("team.costActual accumulates to 20 cents (not 45) after three cost events", async ({
		db,
		eventBus,
	}) => {
		await seedDomain(db, "-c");

		const costEvents: HarnessEvent[] = [
			{ type: "cost_update", deltaCost: 0.1, totalCost: 0.1, currency: "USD" },
			{ type: "cost_update", deltaCost: 0.05, totalCost: 0.15, currency: "USD" },
			{ type: "cost_update", deltaCost: 0.05, totalCost: 0.2, currency: "USD" },
		];

		const harness = new ScriptedHarness(costEvents);
		const adapterPool = makePool(harness);
		const workspace = new LocalSandboxAdapter();

		const deps: ProvisionSessionDeps = { db, eventBus, adapterPool, workspace };
		const params: ProvisionSessionParams = {
			taskId: "task-af10-c",
			agentId: "agent-af10-c",
			productId: "p1-c",
			sandboxBasePath: tmpDir,
		};

		await provisionSession(deps, params);

		const [member] = await db
			.select({ costActual: teamMembers.costActual })
			.from(teamMembers)
			.where(eq(teamMembers.id, "t1-c"))
			.limit(1);

		// FAILS until T2: currently shows 45
		expect(member?.costActual).toBe(20);
	});
});
