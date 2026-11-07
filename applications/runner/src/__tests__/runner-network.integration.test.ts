/**
 * Network runner integration tests — the runner as a standalone program talking to a real
 * core-api server over HTTP and WebSocket.
 *
 * Tests:
 *  1. Runner connects to a real server and takes the person's agents.
 *  2. Restart reuses the persisted key (no new edit_user call).
 *  3. 401 from the server marks the agent moved-away; it isn't re-taken on the next sweep.
 *  4. An agent that already has a key (hasKey=true) is not taken.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentExecutionBoot } from "@hyperidle/agent-execution";
import type { HyperIdleDb } from "@hyperidle/db";
import { applyMigrations, teams, users, userTeams } from "@hyperidle/db";
import { createServer } from "@hyperidle/remote-server/create-server";
import { giveUserKey } from "@hyperidle/user";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { startRunner } from "../index.js";

// ---- Minimal agentExecutionBoot stub ----
// Tests that only exercise key-taking never trigger session execution,
// so all execution-path stubs are no-ops.
function makeStubExecutionBoot(): AgentExecutionBoot {
	const enforcementRegistry = {
		register: vi.fn(),
		get: vi.fn(),
		incrementForce: vi.fn(),
		unregister: vi.fn(),
	};
	return {
		mountMcpRouter: () => undefined,
		dispose: () => undefined,
		probeAgentLoginStatus: async () => ({ state: "unavailable" as const }),
		adapters: {
			pool: {
				select: () => null,
				release: vi.fn(),
				describeSelectFailure: () => "stub pool: no adapters",
			} as never,
			harnessRuntime: {
				enforcementRegistry,
				createReturnGate: () => ({ observe: vi.fn(), returned: false }),
				evaluateReturn: () => "not_returned" as const,
				provisionReturnHook: vi.fn(async () => undefined),
				writeCliMcpConfig: vi.fn(async () => ({})),
				writePluginStdioMcpEntries: vi.fn(() => []),
				openMcpBridge: vi.fn(async () => ({ token: "stub-token", url: "http://stub" })),
				closeMcpBridge: vi.fn(async () => undefined),
			} as never,
			returnStatusTool: { forRegistry: () => ({ name: "return_status" }) as never },
		},
	};
}

// Migrations folder for the core schema — resolved relative to this test file.
const CORE_MIGRATIONS_FOLDER = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../../framework/db/drizzle",
);

/** Create a migrated PGlite core DB in `<dataDir>/core-pg`. */
async function makeCorePgDb(dataDir: string): Promise<{ db: HyperIdleDb; close(): Promise<void> }> {
	const corePgDir = path.join(dataDir, "core-pg");
	await applyMigrations(corePgDir, CORE_MIGRATIONS_FOLDER);
	const { createPgliteDb } = await import("@hyperidle/db");
	return createPgliteDb(corePgDir);
}

// ---- Seed helpers ----

const PERSON_ID = "runner-integration-person";
const PERSON_KEY = "runner-integration-person-key";
const AGENT_ID = "runner-integration-agent";
const TEAM_ID = "runner-integration-team";

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: TEAM_ID, name: "Integration", createdAt: now });
	await db.insert(users).values([
		{
			id: PERSON_ID,
			kind: "human",
			name: "Person",
			role: "founder",
			status: "active",
			createdAt: now,
		},
		{
			id: AGENT_ID,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			ownerUserId: PERSON_ID,
			createdAt: now,
		},
	]);
	await db.insert(userTeams).values([
		{ userId: PERSON_ID, teamId: TEAM_ID },
		{ userId: AGENT_ID, teamId: TEAM_ID },
	]);
	await giveUserKey(db, PERSON_ID, PERSON_KEY);
}

/** Wait for `probe()` to return a truthy value, polling every 25ms until `timeoutMs`. */
async function waitFor<T>(
	what: string,
	probe: () => Promise<T | false | undefined | null>,
	timeoutMs = 8_000,
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const v = await probe();
		if (v) return v;
		if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}`);
		await new Promise((r) => setTimeout(r, 25));
	}
}

// ---- Server boot ----

const SERVER_KEY = "runner-integration-server-internal-key";

interface TestServer {
	readonly url: string;
	readonly db: HyperIdleDb;
	dispose(): Promise<void>;
}

async function bootTestServer(db: HyperIdleDb): Promise<TestServer> {
	vi.stubEnv("HYPERIDLE_API_KEY", SERVER_KEY);
	const handle = await createServer(0, { db });
	const address = handle.httpServer.address();
	if (!address || typeof address === "string") throw new Error("server did not bind TCP");
	const url = `http://127.0.0.1:${address.port}`;
	return {
		url,
		db,
		async dispose() {
			await handle.dispose();
		},
	};
}

// ---- Setup ----

let tempDataDir: string;
beforeEach(() => {
	tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-integration-"));
});
afterEach(() => {
	vi.unstubAllEnvs();
	try {
		fs.rmSync(tempDataDir, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

// ---- Tests ----

describe("runner network integration", () => {
	test("runner takes the person's agents over real HTTP", async () => {
		const dbHandle = await makeCorePgDb(tempDataDir);
		const db = dbHandle.db;
		await seedBase(db);
		const server = await bootTestServer(db);
		try {
			const runner = await startRunner({
				serverUrl: server.url,
				personKey: PERSON_KEY,
				dataDir: tempDataDir,
				agentExecutionBoot: makeStubExecutionBoot(),
				sweepMs: 300,
			});
			await runner.start();
			try {
				await waitFor("agent to be taken", async () => {
					return runner.heldAgentIds().includes(AGENT_ID) || undefined;
				});
				expect(runner.heldAgentIds()).toContain(AGENT_ID);
				expect(runner.movedAwayAgentIds()).not.toContain(AGENT_ID);
			} finally {
				await runner.stop();
			}
		} finally {
			await server.dispose();
			await dbHandle.close();
		}
	}, 15_000);

	test("restart reuses the persisted agent key", async () => {
		const dbHandle = await makeCorePgDb(tempDataDir);
		const db = dbHandle.db;
		await seedBase(db);
		const server = await bootTestServer(db);
		try {
			// First run: runner takes the agent.
			const runner1 = await startRunner({
				serverUrl: server.url,
				personKey: PERSON_KEY,
				dataDir: tempDataDir,
				agentExecutionBoot: makeStubExecutionBoot(),
				sweepMs: 300,
			});
			await runner1.start();
			await waitFor("agent taken (run 1)", async () => {
				return runner1.heldAgentIds().includes(AGENT_ID) || undefined;
			});
			const keyHashAfterFirstRun = await db
				.select({ keyHash: users.keyHash })
				.from(users)
				.where(eq(users.id, AGENT_ID))
				.then(([row]) => row?.keyHash);
			expect(keyHashAfterFirstRun).toBeTruthy();
			await runner1.stop();

			// Second run: runner reloads the persisted key — no new edit_user call.
			const runner2 = await startRunner({
				serverUrl: server.url,
				personKey: PERSON_KEY,
				dataDir: tempDataDir,
				agentExecutionBoot: makeStubExecutionBoot(),
				sweepMs: 300,
			});
			await runner2.start();
			try {
				await waitFor("agent active (run 2)", async () => {
					return runner2.heldAgentIds().includes(AGENT_ID) || undefined;
				});
				const keyHashAfterSecondRun = await db
					.select({ keyHash: users.keyHash })
					.from(users)
					.where(eq(users.id, AGENT_ID))
					.then(([row]) => row?.keyHash);
				// Key hash must be unchanged — no new key was issued.
				expect(keyHashAfterSecondRun).toBe(keyHashAfterFirstRun);
			} finally {
				await runner2.stop();
			}
		} finally {
			await server.dispose();
			await dbHandle.close();
		}
	}, 20_000);

	test("401 response marks agent moved-away; not re-taken on next sweep", async () => {
		const dbHandle = await makeCorePgDb(tempDataDir);
		const db = dbHandle.db;
		await seedBase(db);
		let shouldReturn401 = false;
		const server = await bootTestServer(db);
		try {
			// Inject a fetch interceptor: once armed, door calls return 401.
			// We achieve this by invalidating the agent's key in the DB
			// (the server will then reject calls that use the stale key).
			const runner = await startRunner({
				serverUrl: server.url,
				personKey: PERSON_KEY,
				dataDir: tempDataDir,
				agentExecutionBoot: makeStubExecutionBoot(),
				sweepMs: 300,
			});
			await runner.start();
			try {
				await waitFor("agent taken", async () => {
					return runner.heldAgentIds().includes(AGENT_ID) || undefined;
				});

				// Invalidate the agent's key: change the keyHash in the DB to something
				// else. The runner still thinks it holds the old key, but the server
				// will reject it (401). We also change the key so it effectively
				// "moved away" from this runner's perspective.
				shouldReturn401 = true;
				await db
					.update(users)
					.set({ keyHash: "invalid-hash-to-trigger-401" })
					.where(eq(users.id, AGENT_ID));

				// Wait for the runner to detect the 401 (via inbox drain or next sweep).
				// The runner's sweep will drain the inbox with the stale key → 401 → moved-away.
				// We poll the in-memory set rather than the runner-db (which is internal to the runner).
				await waitFor(
					"agent moved away",
					async () => {
						return runner.movedAwayAgentIds().includes(AGENT_ID) || undefined;
					},
					10_000,
				);
				expect(runner.movedAwayAgentIds()).toContain(AGENT_ID);
				expect(runner.heldAgentIds()).not.toContain(AGENT_ID);

				// Extra sweep — agent should stay moved-away (not re-taken).
				await new Promise((r) => setTimeout(r, 400));
				expect(runner.movedAwayAgentIds()).toContain(AGENT_ID);
				expect(runner.heldAgentIds()).not.toContain(AGENT_ID);
			} finally {
				await runner.stop();
				void shouldReturn401; // suppress unused var lint
			}
		} finally {
			await server.dispose();
			await dbHandle.close();
		}
	}, 20_000);

	test("agent with hasKey=true is not taken (held by another runner)", async () => {
		const dbHandle = await makeCorePgDb(tempDataDir);
		const db = dbHandle.db;
		await seedBase(db);

		// Add a second agent that already has a key (simulates: held by another runner).
		const AGENT2_ID = "runner-integration-agent2-held";
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: AGENT2_ID,
			kind: "ai",
			name: "Held Agent",
			role: "builder",
			status: "active",
			ownerUserId: PERSON_ID,
			createdAt: now,
		});
		await db.insert(userTeams).values({ userId: AGENT2_ID, teamId: TEAM_ID });
		// Give AGENT2 a key — this sets hasKey=true on the UserRow the runner reads.
		await giveUserKey(db, AGENT2_ID, "other-runner-key");

		const server = await bootTestServer(db);
		try {
			const runner = await startRunner({
				serverUrl: server.url,
				personKey: PERSON_KEY,
				dataDir: tempDataDir,
				agentExecutionBoot: makeStubExecutionBoot(),
				sweepMs: 300,
			});
			await runner.start();
			try {
				await waitFor("free agent taken", async () => {
					return runner.heldAgentIds().includes(AGENT_ID) || undefined;
				});
				// The free agent was taken; the held agent was not.
				expect(runner.heldAgentIds()).toContain(AGENT_ID);
				expect(runner.heldAgentIds()).not.toContain(AGENT2_ID);
				// Wait one more sweep to confirm AGENT2 stays un-taken.
				await new Promise((r) => setTimeout(r, 400));
				expect(runner.heldAgentIds()).not.toContain(AGENT2_ID);
			} finally {
				await runner.stop();
			}
		} finally {
			await server.dispose();
			await dbHandle.close();
		}
	}, 15_000);
});
