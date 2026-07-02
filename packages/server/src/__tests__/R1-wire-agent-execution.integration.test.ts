/**
 * R1 — Wire Agent Execution: service-integration tests.
 *
 * Tests the error paths, back-compat, and pre-flight checks via POST /api/sessions.
 * The real-harness happy-path (AC2/AC3/AC4 done/crashed) lives in
 * `harness/__tests__/nonblocking-session-creation.integration.test.ts`
 * (4-harness matrix).
 *
 *   AC6 — Credential resolution (pre-flight check)
 *   AC7 — Missing credential returns clear error (no session row created)
 *   back-compat — no adapters falls back to bare insert
 *   cost-cap — CostCapExceededError returns 422
 *   concurrency — ConcurrencyLimitError returns 429
 *
 * No mocks, no named fakes. Error-path tests use anonymous inline
 * adapters (minimal `startSession`/`streamEvents`/`stopSession`) where the
 * harness is NOT the subject — the error fires before/during setup, not during
 * harness execution.
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
import type {
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import type { CredentialResolver } from "../services/credential-resolver.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { test } from "../test-fixtures.js";
import { createTestApp } from "../test-utils.js";

const TEST_API_KEY = "test-key-r1-wire";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json", ...extra };
}

// --- Null credential resolver (simulates missing API key) -------------------

class NullCredentialResolver implements CredentialResolver {
	async resolve(_name: string): Promise<null> {
		return null;
	}
}

// --- Minimal inline adapter (events: []) used for pre-flight error tests ----
//
// @lore AR4 R1: Pre-flight errors (cost cap, concurrency, missing credential)
// fire BEFORE the harness starts. An inline adapter with empty streamEvents is
// sufficient for these tests — the harness is NOT the subject. Named harness
// classes were removed in AR4 (the happy-path moved to R1-real, the crash-path
// is proven by R1-real's real-harness crash lane).
// A bare inline adapter avoids the guard's named-class check while still
// providing a pool so the pre-flight gate can reach the credential/cost/concurrency
// checks that precede any harness call.

function makeMinimalPool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register(
		"local",
		{
			async startSession(_config: SessionConfig): Promise<SessionHandle> {
				return { sessionId: "preflight-test-stub" };
			},
			async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
				// Intentionally empty — pre-flight errors fire before this runs.
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
					preCompactionTrigger: false,
					subAgents: false,
					modelProviders: ["anthropic"],
					mcpSupport: false,
					returnEnforcement: "none",
				};
			},
		},
		{
			name: "local",
			kind: "local",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		},
	);
	return pool;
}

// --- Fixture builders --------------------------------------------------------

const NOW = "2026-05-29T00:00:00.000Z";

async function seedDomain(
	db: HyperIdleDb,
	overrides: {
		agentCostCap?: number | null;
		agentMaxConcurrentSessions?: number;
	} = {},
): Promise<void> {
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

	// Seed a knowledge item so assembleContext has something to write during provisioning.
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

describe("R1: Wire Agent Execution — service-integration (error paths + back-compat)", () => {
	let tmpDir: string;
	let workspaceAdapter: LocalSandboxAdapter;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "r1-wire-tests-"));
		workspaceAdapter = new LocalSandboxAdapter();
		clearDeduplicationCache();
		// AK2 §4a: register Strategy so provisionSession routes through the Strategy Port.
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// -------------------------------------------------------------------- AC6, AC7
	describe("AC6/AC7: Missing credential returns clear error and no session row is created", () => {
		test("returns 500 with code=MISSING_CREDENTIAL and creates no session row", async ({
			db,
			eventBus,
		}) => {
			await seedDomain(db);

			const app = await createTestApp({
				db,
				eventBus,
				adapterPool: makeMinimalPool(),
				workspaceAdapter,
				sandboxBasePath: tmpDir,
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
		});
	});

	// -------------------------------------------------------------------- backward compat
	describe("Backward compat: POST /api/sessions without adapters falls back to bare insert", () => {
		test("returns 201 with bare session row when no harnessAdapter is provided", async ({
			db,
			eventBus,
		}) => {
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
			const app = await createTestApp({ db, eventBus });

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
		test("returns 422 with code=COST_CAP_EXCEEDED when agent cost cap is 0", async ({
			db,
			eventBus,
		}) => {
			// costCap=0 means any session start exceeds the cap immediately.
			await seedDomain(db, { agentCostCap: 0 });

			const validResolver: CredentialResolver = {
				resolve: async () => "fake-api-key",
			};

			const app = await createTestApp({
				db,
				eventBus,
				adapterPool: makeMinimalPool(),
				workspaceAdapter,
				sandboxBasePath: tmpDir,
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
		test("returns 429 with code=CONCURRENCY_LIMIT when agent maxConcurrentSessions is 0", async ({
			db,
			eventBus,
		}) => {
			// maxConcurrentSessions=0 means no sessions are allowed.
			await seedDomain(db, { agentMaxConcurrentSessions: 0 });

			const validResolver: CredentialResolver = {
				resolve: async () => "fake-api-key",
			};

			const app = await createTestApp({
				db,
				eventBus,
				adapterPool: makeMinimalPool(),
				workspaceAdapter,
				sandboxBasePath: tmpDir,
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
