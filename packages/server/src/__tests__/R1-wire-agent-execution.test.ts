/**
 * R1 — Wire Agent Execution: RED phase tests.
 *
 * These tests prove the acceptance criteria for R1:
 *   AC2 — POST /api/sessions calls provisionSession (not bare DB insert)
 *   AC3 — End-to-end session execution via route
 *   AC4 — State transitions: done / crashed
 *   AC6 — Credential resolution (pre-flight check)
 *   AC7 — Missing credential returns clear error (no session row created)
 *
 * The tests reference new types/interfaces that don't exist yet
 * (`SessionRouteDeps`, `AppOptions.harnessAdapter`, etc.) — that's
 * intentional. The red phase writes the test that describes what SHOULD
 * happen; the green phase creates the implementation that makes it pass.
 *
 * Failure mode before implementation:
 *   - TypeScript type errors for new AppOptions fields.
 *   - Route returns 201 with bare session instead of 200 with provisionSession outcome.
 *   - Missing credential returns 201 instead of 500.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	createTestDb,
	type HyperIdleDb,
	knowledgeItems,
	sessions,
	type TestDbHandle,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { clearDeduplicationCache } from "@hyperidle/fabric";
import {
	type DomainEvent,
	EventBus,
	type HarnessAdapter,
	type HarnessCapabilities,
	type HarnessEvent,
	type SessionConfig,
	type SessionHandle,
	type SessionResult,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalWorkspaceAdapter } from "../harness/local-workspace-adapter.js";
import type { CredentialResolver } from "../services/credential-resolver.js";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-r1-wire";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

// --- Scripted mock harness ---------------------------------------------------
//
// Minimal scripted harness for route-level tests. Yields a fixed event
// sequence then stops. Uses the L17 SessionResult shape (WireMoney + TokenUsage).

interface ScriptedHarnessConfig {
	readonly events: readonly HarnessEvent[];
	readonly stopResult?: SessionResult;
	/** Number of events to yield before throwing (simulates crash). */
	readonly throwAfter?: number;
}

class ScriptedHarnessAdapter implements HarnessAdapter {
	public startedConfigs: SessionConfig[] = [];
	public stoppedHandles: SessionHandle[] = [];
	private nextId = 1;

	constructor(private readonly config: ScriptedHarnessConfig) {}

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		this.startedConfigs.push(config);
		return { sessionId: `scripted-r1-${this.nextId++}` };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		let yielded = 0;
		for (const ev of this.config.events) {
			yield ev;
			yielded++;
			if (this.config.throwAfter !== undefined && yielded >= this.config.throwAfter) {
				throw new Error("simulated harness crash");
			}
		}
	}

	async stopSession(handle: SessionHandle): Promise<SessionResult> {
		this.stoppedHandles.push(handle);
		return (
			this.config.stopResult ?? {
				outcome: "completed",
				cost: { minor: 0, currency: "USD" },
				tokenUsage: { byTier: {} },
			}
		);
	}

	getCapabilities(): HarnessCapabilities {
		return { preCompactionTrigger: false, subAgents: false, modelProviders: ["anthropic"] };
	}
}

// --- Helper: wrap a HarnessAdapter in a single-adapter pool ------------------

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

// --- Null credential resolver (simulates missing API key) -------------------

class NullCredentialResolver implements CredentialResolver {
	async resolve(_name: string): Promise<null> {
		return null;
	}
}

// --- Fixture builders --------------------------------------------------------

const NOW = "2026-05-29T00:00:00.000Z";

async function seedDomain(
	db: HyperIdleDb,
	overrides: {
		agentCostCap?: number | null;
		agentMaxConcurrentSessions?: number;
	} = {},
): void {
	await db.insert(teams).values({ id: "p1", name: "R1 Product", phase: "build", createdAt: NOW });

	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });

	// @lore U1: bets.teamId and tasks.teamId reference `teams` (domain entity "p1"), not teamMembers.
	await db.insert(bets).values({
		id: "b1",
		teamId: "p1",
		description: "R1 bet",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});

	await db.insert(users).values({
		id: "agent-r1",
		name: "R1 Builder Agent",
		role: "builder",
		status: "active",
		teamId: "t1",
		maxConcurrentSessions: overrides.agentMaxConcurrentSessions ?? 1,
		costCap: overrides.agentCostCap === undefined ? null : overrides.agentCostCap,
		costActual: 0,
		createdAt: NOW,
	});

	await db.insert(tasks).values({
		id: "task-r1",
		betId: "b1",
		teamId: "p1",
		title: "R1 test task",
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});

	// Seed a knowledge item so materialize has something to write during provisioning.
	await db.insert(knowledgeItems).values({
		id: "ki-r1",
		title: "R1 Seed Principle",
		body: "R1 seeded body.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "system",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

// --- Suite -------------------------------------------------------------------

describe("R1: Wire Agent Execution (route-level)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let tmpDir: string;
	let workspaceAdapter: LocalWorkspaceAdapter;
	let app: Hono;

	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "r1-wire-tests-"));
		workspaceAdapter = new LocalWorkspaceAdapter();
		clearDeduplicationCache();
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
		await handle?.close();
	});

	// -------------------------------------------------------------------- AC2, AC3, AC4
	describe("AC2/AC3/AC4: POST /api/sessions calls provisionSession and returns completed session", () => {
		it("returns 200 with state=done and outcome=completed, task transitions to in_progress", async () => {
			await seedDomain(db);

			const harness = new ScriptedHarnessAdapter({
				events: [
					{ type: "cost_update", totalCost: 0.01, deltaCost: 0.01 },
					{ type: "completion", text: "done" },
				],
				stopResult: {
					outcome: "completed",
					cost: { minor: 1, currency: "USD" },
					tokenUsage: { byTier: { workhorse: { prompt: 50, completion: 20 } } },
				},
			});

			// NB: credentialResolver returns a valid key so pre-flight passes.
			const validResolver: CredentialResolver = {
				resolve: async () => "fake-api-key",
			};

			app = await createTestApp({
				db,
				eventBus,
				// These new AppOptions fields don't exist yet — TypeScript will
				// error here until the green phase adds them to AppOptions.
				adapterPool: makePool(harness),
				workspaceAdapter,
				workspaceBasePath: tmpDir,
				credentialResolver: validResolver,
			});

			const emitted: DomainEvent[] = [];
			eventBus.on("session_started", (e) => emitted.push(e));
			eventBus.on("session_ended", (e) => emitted.push(e));

			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					agentId: "agent-r1",
					taskId: "task-r1",
					modelTier: "workhorse",
				}),
			});

			// After provisionSession, the session is complete — return 200 not 201.
			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.id).toBeTruthy();
			expect(body.state).toBe("done");
			expect(body.outcome).toBe("completed");
			expect(body.taskId).toBe("task-r1");
			expect(body.agentId).toBe("agent-r1");

			// Task must have been transitioned to in_progress during provisioning.
			const [task] = await db.select().from(tasks).where(eq(tasks.id, "task-r1")).limit(1);
			// After a completed session task may be done/in_progress — at minimum
			// it must have been transitioned away from accepted.
			expect(task?.state).not.toBe("accepted");

			// Both session_started and session_ended events must have been emitted.
			const types = emitted.map((e) => e.type);
			expect(types).toContain("session_started");
			expect(types).toContain("session_ended");

			// The harness must have been started exactly once.
			expect(harness.startedConfigs.length).toBe(1);
		});
	});

	// -------------------------------------------------------------------- AC6, AC7
	describe("AC6/AC7: Missing credential returns clear error and no session row is created", () => {
		it("returns 500 with code=MISSING_CREDENTIAL and creates no session row", async () => {
			await seedDomain(db);

			const harness = new ScriptedHarnessAdapter({ events: [] });

			app = await createTestApp({
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspaceAdapter,
				workspaceBasePath: tmpDir,
				// NullCredentialResolver: resolve() always returns null.
				credentialResolver: new NullCredentialResolver(),
			});

			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					agentId: "agent-r1",
					taskId: "task-r1",
					modelTier: "workhorse",
				}),
			});

			expect(res.status).toBe(500);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code).toBe("MISSING_CREDENTIAL");
			expect(typeof body.error).toBe("string");
			// Error message must mention the credential name.
			expect((body.error as string).toLowerCase()).toContain("anthropic_api_key");

			// Pre-flight must reject before provisionSession — no session row.
			const sessionRows = await db.select().from(sessions);
			expect(sessionRows.length).toBe(0);

			// Harness must never have been started (pre-flight fires before orchestrator).
			expect(harness.startedConfigs.length).toBe(0);
		});
	});

	// -------------------------------------------------------------------- AC4 (crash path)
	describe("AC4: Crashed harness returns crashed session", () => {
		it("returns 200 with state=crashed when the harness throws during streaming", async () => {
			await seedDomain(db);

			// throwAfter: 1 — yields one event then throws, simulating a crash.
			const harness = new ScriptedHarnessAdapter({
				events: [{ type: "cost_update", totalCost: 0.0, deltaCost: 0.0 }],
				throwAfter: 1,
			});

			const validResolver: CredentialResolver = {
				resolve: async () => "fake-api-key",
			};

			app = await createTestApp({
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspaceAdapter,
				workspaceBasePath: tmpDir,
				credentialResolver: validResolver,
			});

			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					agentId: "agent-r1",
					taskId: "task-r1",
					modelTier: "workhorse",
				}),
			});

			expect(res.status).toBe(200);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.state).toBe("crashed");
			expect(body.outcome).toBe("crashed");
		});
	});

	// -------------------------------------------------------------------- backward compat
	describe("Backward compat: POST /api/sessions without adapters falls back to bare insert", () => {
		it("returns 201 with bare session row when no harnessAdapter is provided", async () => {
			// Seed only the minimum needed for the bare insert path.
			await db
				.insert(teams)
				.values({ id: "p-bare", name: "Bare Product", phase: "build", createdAt: NOW });

			await db
				.insert(teamMembers)
				.values({ id: "t-bare", teamId: "p-bare", capacity: 3, activeBets: 0, formedAt: NOW });

			await db.insert(users).values({
				id: "agent-bare",
				name: "Bare Agent",
				role: "builder",
				status: "idle",
				teamId: "t-bare",
				createdAt: NOW,
			});

			// @lore U1: bets.teamId and tasks.teamId reference `teams` (domain entity), not teamMembers.
			await db.insert(bets).values({
				id: "b-bare",
				teamId: "p-bare",
				description: "Bare bet",
				appetite: "small",
				status: "active",
				createdAt: NOW,
			});

			await db.insert(tasks).values({
				id: "task-bare",
				betId: "b-bare",
				teamId: "p-bare",
				title: "Bare task",
				state: "in_progress",
				createdAt: NOW,
				updatedAt: NOW,
			});

			// No harnessAdapter/workspaceAdapter — existing behavior (bare insert).
			app = await createTestApp({ db, eventBus });

			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					agentId: "agent-bare",
					taskId: "task-bare",
					modelTier: "workhorse",
				}),
			});

			// Existing behavior: 201 with the bare session row.
			expect(res.status).toBe(201);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.agentId).toBe("agent-bare");
			expect(body.taskId).toBe("task-bare");
			expect(body.state).toBe("active");
		});
	});

	// -------------------------------------------------------------------- 422 cost cap
	describe("Error handling: CostCapExceededError returns 422", () => {
		it("returns 422 with code=COST_CAP_EXCEEDED when agent cost cap is 0", async () => {
			// costCap=0 means any session start exceeds the cap immediately.
			await seedDomain(db, { agentCostCap: 0 });

			const harness = new ScriptedHarnessAdapter({ events: [] });
			const validResolver: CredentialResolver = {
				resolve: async () => "fake-api-key",
			};

			app = await createTestApp({
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspaceAdapter,
				workspaceBasePath: tmpDir,
				credentialResolver: validResolver,
			});

			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					agentId: "agent-r1",
					taskId: "task-r1",
					modelTier: "workhorse",
				}),
			});

			expect(res.status).toBe(422);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code).toBe("COST_CAP_EXCEEDED");
		});
	});

	// -------------------------------------------------------------------- 429 concurrency
	describe("Error handling: ConcurrencyLimitError returns 429", () => {
		it("returns 429 with code=CONCURRENCY_LIMIT when agent maxConcurrentSessions is 0", async () => {
			// maxConcurrentSessions=0 means no sessions are allowed.
			await seedDomain(db, { agentMaxConcurrentSessions: 0 });

			const harness = new ScriptedHarnessAdapter({ events: [] });
			const validResolver: CredentialResolver = {
				resolve: async () => "fake-api-key",
			};

			app = await createTestApp({
				db,
				eventBus,
				adapterPool: makePool(harness),
				workspaceAdapter,
				workspaceBasePath: tmpDir,
				credentialResolver: validResolver,
			});

			const res = await app.request("/api/sessions", {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({
					agentId: "agent-r1",
					taskId: "task-r1",
					modelTier: "workhorse",
				}),
			});

			expect(res.status).toBe(429);

			const body = (await res.json()) as Record<string, unknown>;
			expect(body.code).toBe("CONCURRENCY_LIMIT");
		});
	});
});
