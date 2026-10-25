/**
 * One agent at its session limit must not hold up work for other agents.
 * Drives the real composition root and the real drain; only the execution
 * adapters (harness pool, workspace) are stand-ins.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	agentSessionRequests,
	type HyperIdleDb,
	sessions,
	teams,
	users,
	userTeams,
} from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { afterEach, describe, vi } from "vitest";
import {
	buildRunOrchestrationComposition,
	type ProvisionSessionDeps,
} from "../services/run-orchestration-composition.js";

const BUSY = "agent-busy";
const IDLE = "agent-idle";
const TEAM = "team-drain";

const sandboxDirs: string[] = [];
afterEach(() => {
	for (const dir of sandboxDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function buildDeps(db: HyperIdleDb, eventBus: EventBus): ProvisionSessionDeps {
	return {
		db,
		eventBus,
		adapterPool: {
			select: () => ({
				id: "fake-adapter",
				adapter: {
					startSession: async (config: { sessionId: string }) => ({ sessionId: config.sessionId }),
					streamEvents: () => ({ async *[Symbol.asyncIterator]() {} }),
					stopSession: async () => ({ outcome: "completed", tokenUsage: { byTier: {} } }),
					getCapabilities: () => ({
						preCompactionTrigger: false,
						subAgents: false,
						modelProviders: [],
						mcpSupport: false,
						returnEnforcement: "none",
					}),
				},
				meta: { name: "Fake", kind: "local", modelProviders: [], maxConcurrent: 5 },
			}),
			release: () => {},
			describeSelectFailure: () => "test pool selected nothing",
		},
		workspace: {
			spawn: async () => {
				const dir = fs.mkdtempSync(path.join(os.tmpdir(), "concurrency-drain-"));
				sandboxDirs.push(dir);
				return { sandboxId: path.basename(dir), path: dir };
			},
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			adopt: async (dir: string) => ({ sandboxId: "sb-adopted", path: dir }),
			destroy: async () => {},
		},
	} as unknown as ProvisionSessionDeps;
}

function startRuntime(db: HyperIdleDb, eventBus: EventBus) {
	const composition = buildRunOrchestrationComposition({
		harnessRuntime: {
			enforcementRegistry: {
				register: vi.fn(),
				get: vi.fn(),
				incrementForce: vi.fn(),
				unregister: vi.fn(),
			},
			createReturnGate: vi.fn(() => ({ observe: () => {}, returned: false })),
			evaluateReturn: vi.fn(() => "returned"),
			provisionReturnHook: vi.fn(async () => {}),
			writeCliMcpConfig: vi.fn(),
			writePluginStdioMcpEntries: vi.fn(),
			openMcpBridge: vi.fn(async () => ({ token: "t", url: "u" })),
			closeMcpBridge: vi.fn(async () => {}),
		} as never,
		returnStatusTool: { forRegistry: vi.fn(() => ({ name: "return_status" })) } as never,
	});
	const base = composition.runtimeDeps(db, eventBus);
	return composition.startRuntime(
		composition.runtimeDeps(db, eventBus, {
			runtime: buildDeps(db, eventBus),
			composition: {
				...base.composition,
				writeback: { db, document: {} as never },
				worker: { pool: {} as never, adapterFactory: {} as never },
			},
		}),
	);
}

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: id,
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	await db.insert(userTeams).values({ userId: id, teamId: TEAM });
}

async function seedRequest(
	db: HyperIdleDb,
	id: string,
	agentId: string,
	status: "pending" | "running",
	createdAt: string,
): Promise<void> {
	await db.insert(agentSessionRequests).values({
		id,
		sourceKind: "subscription",
		sourceId: `fire-${id}`,
		streamId: `subscription:fire-${id}`,
		agentId,
		teamId: TEAM,
		promptMode: "subscription",
		idempotencyKey: id,
		sourceCorrelationJson: JSON.stringify({ subscriptionId: `sub-${id}`, teamId: TEAM }),
		payloadJson: JSON.stringify({
			agentConfig: { kind: "ai", status: "active", role: "builder", teamId: TEAM },
		}),
		status,
		...(status === "running" ? { sessionId: `session-${id}` } : {}),
		createdAt,
		updatedAt: createdAt,
	});
}

async function requestRow(db: HyperIdleDb, id: string) {
	const [row] = await db.select().from(agentSessionRequests).where(eq(agentSessionRequests.id, id));
	return row;
}

describe("drain with one agent at its session limit", () => {
	test("a request for another agent is admitted, and the waiting one runs once a slot frees", async ({
		db,
	}) => {
		await db.insert(teams).values({ id: TEAM, name: "Drain", createdAt: new Date().toISOString() });
		await seedAgent(db, BUSY);
		await seedAgent(db, IDLE);
		const eventBus = new EventBus();
		const runtime = await startRuntime(db, eventBus);
		try {
			// The busy agent's one slot is taken by a run already in flight.
			await seedRequest(db, "busy-running", BUSY, "running", "2026-10-01T00:00:00.000Z");
			await db.insert(sessions).values({
				id: "session-busy-running",
				requestId: "busy-running",
				agentId: BUSY,
				modelTier: "workhorse",
				startedAt: "2026-10-01T00:00:00.000Z",
				state: "active",
			});
			// Oldest pending first: the busy agent's request sits ahead of the idle one's.
			await seedRequest(db, "busy-waiting", BUSY, "pending", "2026-10-01T00:00:01.000Z");
			await seedRequest(db, "idle-new", IDLE, "pending", "2026-10-01T00:00:02.000Z");

			// A request carries a session id only once admission let it run.
			await vi.waitFor(
				async () =>
					expect((await requestRow(db, "idle-new"))?.sessionId).toEqual(expect.any(String)),
				{ timeout: 5_000, interval: 100 },
			);
			expect(await requestRow(db, "busy-waiting")).toMatchObject({
				status: "pending",
				sessionId: null,
			});

			await db
				.update(sessions)
				.set({ state: "done", outcome: "completed", endedAt: new Date().toISOString() })
				.where(eq(sessions.id, "session-busy-running"));
			await vi.waitFor(
				async () =>
					expect((await requestRow(db, "busy-waiting"))?.sessionId).toEqual(expect.any(String)),
				{ timeout: 5_000, interval: 100 },
			);
		} finally {
			await runtime.dispose();
		}
	});
});
