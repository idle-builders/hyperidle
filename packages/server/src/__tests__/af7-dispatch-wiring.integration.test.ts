/**
 * AF7 §1 / AC1 — Dispatcher boot-wiring (RED phase).
 *
 * Acceptance criterion (TRACK-AF.md AF7 AC1):
 *   "A task reaching the ready state results in an automatically provisioned
 *    session without manual triggering, visible in the dispatch surface."
 * Validation scenario:
 *   "Given a task transitioned to ready, when the dispatcher is running, then
 *    a session is provisioned for it automatically and appears in the
 *    queue/surface."
 *
 * Root cause being closed (Z8-004 / dispatch-half of Z8-010): production
 * `createServer` calls `bootstrapFabric` with ONLY `readAlertPreferences` — it
 * never passes `dispatcherDeps`, and `setProvisionSessionFn(provisionSession)`
 * is never called outside tests. So the dispatcher never registers, the queue
 * is always empty, and a ready task never gets a session.
 *
 * This test boots the REAL production path via `createServer(0, deps?)`, where
 * `deps` is the test-only DI override (plan §1, §14.3) that injects a stub
 * adapter pool (no real LLM). It asserts the wire end-to-end:
 *   - `setProvisionSessionFn` was called by createServer (dispatch can run), and
 *   - `dispatcherDeps` was forwarded to bootstrapFabric (dispatcher registers),
 * so a task transitioned to `accepted` is auto-provisioned and a `sessions`
 * row appears.
 *
 * RED expectation: `createServer` has signature `(port: number)` today — the
 * second `deps` param does not exist, and even if it did, the body never wires
 * `setProvisionSessionFn` / `dispatcherDeps`. The test fails for the right
 * reason: the production boot path does not wire the dispatcher.
 *
 * Pre-green failure SYMPTOM: because `createServer` ignores the injected
 * `deps.db` and builds its OWN unmigrated DB, the first query hits
 * `relation "factory_settings" does not exist`. That error is the deterministic
 * signature of the missing `deps.db` seam (part of this AC's wiring change). The
 * green phase honours `deps.db` (the migrated fixture DB), at which point the
 * test proceeds to the real wiring assertions below (session row + harness
 * started). Do NOT "fix" this by migrating createServer's throwaway DB — the
 * correct green change is the `deps.db` override.
 *
 * @lore AF7: This file deliberately resets the provision registry in setup so
 * the assertion "createServer wired it" is not satisfied by a leaked
 * registration from AD2-task-dispatcher.integration.test.ts (which calls
 * setProvisionSessionFn at module load). Per §13, vitest isolates per file, but
 * we clear explicitly to make the dependency on createServer's own wiring
 * unambiguous.
 */

import * as fs from "node:fs";
import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { bets, sessions, tasks, teamMembers, teams, threads, users } from "@hyperidle/db";
import { clearProvisionSessionFn } from "@hyperidle/fabric";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import { createServer } from "../server-factory.js";
import { test } from "../test-fixtures.js";

const TEST_API_KEY = "test-key-af7-dispatch";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/** Stub adapter: records startSession, completes immediately, no real LLM. */
class StubHarnessAdapter implements HarnessAdapter {
	public readonly capturedConfigs: SessionConfig[] = [];

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		this.capturedConfigs.push(config);
		return { sessionId: `af7-stub-${this.capturedConfigs.length}` };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		// completes immediately
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
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			mcpSupport: false,
			hasNativeReturnHook: false,
			canReEngage: true,
		};
	}
}

function makeStubPool(adapter: HarnessAdapter): AdapterPool {
	const pool = new AdapterPool();
	pool.register("builtin-local", adapter, {
		name: "builtin-local",
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 4,
	});
	return pool;
}

const NOW = new Date().toISOString();

describe("AF7 AC1: production createServer wires the dispatcher", () => {
	let sandboxBasePath: string;
	let dbDir: string;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		// The booted server's dispatcher resolves the workhorse model via the real
		// model gateway (EnvCredentialResolver). The builtin agent requires a
		// resolved model, so the production wire legitimately needs a credential —
		// provide one so dispatch provisions the session via the stub adapter (no
		// real LLM is called; the stub ignores the resolved model).
		vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-af7-dispatch-test");
		// Point createServer's own DB at a throwaway tmp path. Until the green
		// phase adds the `deps.db` override, createServer builds this DB itself;
		// keeping it in tmp (not CWD) leaves the worktree clean.
		dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "af7-dispatch-db-"));
		vi.stubEnv("DATABASE_URL", path.join(dbDir, "pg"));
		clearProvisionSessionFn();
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "af7-dispatch-"));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		clearProvisionSessionFn();
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		fs.rmSync(dbDir, { recursive: true, force: true });
	});

	test("a task transitioned to accepted is auto-provisioned via the booted server", async ({
		db,
	}) => {
		// Seed a team, agent (builtin), bet, and an accepted task with ownerAgentId.
		await db.insert(teams).values({ id: "af7-team", name: "AF7", phase: "build", createdAt: NOW });
		await db
			.insert(teamMembers)
			.values({ id: "af7-tm", teamId: "af7-team", capacity: 5, activeBets: 0, formedAt: NOW });
		await db.insert(users).values({
			id: "af7-agent",
			kind: "ai",
			name: "AF7 Agent",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 4,
			teamId: "af7-tm",
			harnessType: "builtin",
			createdAt: NOW,
		});
		await db.insert(bets).values({
			id: "af7-bet",
			teamId: "af7-team",
			description: "AF7",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(threads).values({
			id: "af7-thread",
			hostKind: "task",
			hostId: "af7-task",
			initiatorId: "af7-agent",
			participants: JSON.stringify(["af7-agent"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "af7-task",
			betId: "af7-bet",
			teamId: "af7-team",
			title: "AF7 Task",
			state: "proposed",
			ownerAgentId: "af7-agent",
			threadId: "af7-thread",
			createdAt: NOW,
			updatedAt: NOW,
		});

		const stub = new StubHarnessAdapter();

		// Plan §1 / §14.3: createServer accepts an optional test-only `deps`
		// override of the adapter pool + workspace adapter + base path + db, so
		// the production wire runs against a stub pool (no real LLM, no real DB).
		// This param does NOT exist yet — RED.
		const server = await createServer(0, {
			db,
			adapterPool: makeStubPool(stub),
			workspaceAdapter: new LocalSandboxAdapter(),
			sandboxBasePath,
		});

		try {
			const addr = server.httpServer.address() as AddressInfo;
			const base = `http://127.0.0.1:${addr.port}`;

			// Drive the task to accepted through the running server — emits
			// task_state_changed(toState=accepted), the dispatcher's trigger. State
			// transitions go through the dedicated transition endpoint (PATCH /:id is
			// for field edits and does not carry `state`).
			const res = await fetch(`${base}/api/tasks/af7-task/transition`, {
				method: "POST",
				headers: authHeaders(),
				body: JSON.stringify({ state: "accepted" }),
			});
			expect(res.status).toBe(200);

			// AC1: the dispatcher (wired by createServer) provisions a session.
			await vi.waitFor(
				async () => {
					const rows = await db.select().from(sessions).where(eq(sessions.taskId, "af7-task"));
					expect(rows.length).toBeGreaterThanOrEqual(1);
				},
				{ timeout: 10_000 },
			);

			// The stub harness was actually started by the provisioning path.
			expect(stub.capturedConfigs.length).toBeGreaterThanOrEqual(1);

			// And the dispatch surface is reachable on the booted server.
			const queueRes = await fetch(`${base}/api/dispatch-queue`, { headers: authHeaders() });
			expect(queueRes.status).toBe(200);
			const snapshot = (await queueRes.json()) as { entries: unknown[] };
			expect(Array.isArray(snapshot.entries)).toBe(true);
		} finally {
			server.dispose();
		}
	});
});
