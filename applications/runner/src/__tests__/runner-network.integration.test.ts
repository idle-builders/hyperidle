/**
 * Network runner integration tests — the runner as a standalone program talking to a real
 * core-api server over HTTP and WebSocket.
 *
 * Tests:
 *  1. Runner connects to a real server and takes the person's agents.
 *  2. Restart reuses the persisted key (no new edit_user call).
 *  3. takeAgent from a second runner (move-here) invalidates the first runner's key; it marks the agent moved-away and doesn't re-take it.
 *  4. An agent that already has a key (hasKey=true) is not taken.
 *  5. Message sent while runner A is busy is answered by runner B after taking the agent.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentExecutionBoot } from "@hyperidle/agent-execution";
import { createCoreDoor } from "@hyperidle/agent-orchestration";
import type { HyperIdleDb } from "@hyperidle/db";
import { applyMigrations, messages, teams, users, userTeams } from "@hyperidle/db";
import { createServer } from "@hyperidle/remote-server/create-server";
import { giveUserKey } from "@hyperidle/user";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { startRunner } from "../index.js";
import { answersPong, makeScriptedBoot, type RunScript } from "./agent-runner-test-support.js";

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
				agentExecution: makeStubExecutionBoot(),
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
				agentExecution: makeStubExecutionBoot(),
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
				agentExecution: makeStubExecutionBoot(),
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

	test("takeAgent from a second runner invalidates the key; first runner marks agent moved-away (move-here)", async () => {
		const r2DataDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-integration-r2-"));
		const dbHandle = await makeCorePgDb(tempDataDir);
		const db = dbHandle.db;
		await seedBase(db);
		const server = await bootTestServer(db);
		try {
			// R1 takes the agent via the normal sweep.
			const runner1 = await startRunner({
				serverUrl: server.url,
				personKey: PERSON_KEY,
				dataDir: tempDataDir,
				agentExecution: makeStubExecutionBoot(),
				sweepMs: 300,
			});
			await runner1.start();
			try {
				await waitFor("R1 takes agent", async () => {
					return runner1.heldAgentIds().includes(AGENT_ID) || undefined;
				});

				// R2 "Move here": explicitly takes the agent with a fresh runner-db.
				// takeAgent calls edit_user { key: "new" } with the person key — it always
				// issues a new key regardless of hasKey — so R1's key becomes stale.
				const runner2 = await startRunner({
					serverUrl: server.url,
					personKey: PERSON_KEY,
					dataDir: r2DataDir,
					agentExecution: makeStubExecutionBoot(),
					sweepMs: 300,
				});
				await runner2.start();
				try {
					await runner2.takeAgent(AGENT_ID);
					// R2 immediately holds the agent.
					expect(runner2.heldAgentIds()).toContain(AGENT_ID);
					expect(runner2.movedAwayAgentIds()).not.toContain(AGENT_ID);

					// R1's next inbox pass uses its now-stale key → server returns 401 →
					// DoorError(401) → markMovedAway + dropAgent.
					await waitFor(
						"R1 marks agent moved-away after 401",
						async () => runner1.movedAwayAgentIds().includes(AGENT_ID) || undefined,
						10_000,
					);
					expect(runner1.movedAwayAgentIds()).toContain(AGENT_ID);
					expect(runner1.heldAgentIds()).not.toContain(AGENT_ID);

					// Extra sweep — R1 stays moved-away; only an explicit takeAgent can reclaim.
					await new Promise((r) => setTimeout(r, 400));
					expect(runner1.movedAwayAgentIds()).toContain(AGENT_ID);
					expect(runner1.heldAgentIds()).not.toContain(AGENT_ID);
				} finally {
					await runner2.stop();
					fs.rmSync(r2DataDir, { recursive: true, force: true });
				}
			} finally {
				await runner1.stop();
			}
		} finally {
			await server.dispose();
			await dbHandle.close();
		}
	}, 25_000);

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
				agentExecution: makeStubExecutionBoot(),
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

	test("message sent while runner A is busy is answered by runner B after taking the agent", async () => {
		const r2DataDir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-two-msg-r2-"));
		const dbHandle = await makeCorePgDb(tempDataDir);
		const db = dbHandle.db;
		await seedBase(db);
		const server = await bootTestServer(db);

		let resolveBuilderStarted!: () => void;
		const builderStarted = new Promise<void>((r) => {
			resolveBuilderStarted = r;
		});
		let releaseBuilderRun: (() => void) | undefined;

		const blockingScript: RunScript = async (run) => {
			if (run.index === 0) {
				resolveBuilderStarted();
				await new Promise<void>((r) => {
					releaseBuilderRun = r;
				});
				return;
			}
			await run.call("send_message", { text: "pong" });
		};

		const runsA: string[] = [];
		const door = createCoreDoor(fetch, `${server.url}/api`);

		try {
			const runner1 = await startRunner({
				serverUrl: server.url,
				personKey: PERSON_KEY,
				dataDir: tempDataDir,
				agentExecution: makeScriptedBoot(blockingScript, runsA),
				sweepMs: 100,
			});
			await runner1.start();
			try {
				await waitFor("R1 takes agent", async () =>
					runner1.heldAgentIds().includes(AGENT_ID) || undefined,
				);

				// Trigger a blocking run so the agent's session slot is occupied.
				await door.call(PERSON_KEY, "send_message", {
					recipients: [AGENT_ID],
					text: "Start blocking",
				});

				// Wait until the blocking run is active (slot occupied).
				await builderStarted;

				// Send the message runner B should answer. With the slot occupied,
				// runner A's actOnMessage sees an active session and throws NotYet —
				// the row stays unread for runner B to pick up.
				const sentMsg = await door.call<{ thread: { id: string } }>(PERSON_KEY, "send_message", {
					recipients: [AGENT_ID],
					text: "ping while busy",
				});
				if (!sentMsg.ok) throw new Error(`send_message: ${JSON.stringify(sentMsg.problems)}`);
				const thread2Id = sentMsg.data.thread.id;

				// Give runner A time to drain and get NotYet on the row.
				await new Promise((r) => setTimeout(r, 300));

				// Runner B takes the agent.
				const runsB: string[] = [];
				const runner2 = await startRunner({
					serverUrl: server.url,
					personKey: PERSON_KEY,
					dataDir: r2DataDir,
					agentExecution: makeScriptedBoot(answersPong, runsB),
					sweepMs: 100,
				});
				await runner2.start();
				try {
					await runner2.takeAgent(AGENT_ID);

					// Runner B must answer the message runner A could not.
					await waitFor("runner B's pong in second thread", async () => {
						const rows = await db
							.select()
							.from(messages)
							.where(and(eq(messages.senderId, AGENT_ID), eq(messages.threadId, thread2Id)));
						const pong = rows.find(
							(m) => (JSON.parse(m.payload) as { text?: unknown }).text === "pong",
						);
						return pong ?? undefined;
					});

					// Release blocking run so runner A's session completes cleanly.
					releaseBuilderRun?.();
					releaseBuilderRun = undefined;
					await new Promise((r) => setTimeout(r, 300));

					// Only one pong in the second thread: runner A never answered it.
					const pongsInThread2 = (
						await db
							.select()
							.from(messages)
							.where(and(eq(messages.senderId, AGENT_ID), eq(messages.threadId, thread2Id)))
					).filter((m) => (JSON.parse(m.payload) as { text?: unknown }).text === "pong");
					expect(pongsInThread2).toHaveLength(1);
				} finally {
					await runner2.stop();
					fs.rmSync(r2DataDir, { recursive: true, force: true });
				}
			} finally {
				releaseBuilderRun?.();
				await runner1.stop();
			}
		} finally {
			await server.dispose();
			await dbHandle.close();
		}
	}, 25_000);
});
