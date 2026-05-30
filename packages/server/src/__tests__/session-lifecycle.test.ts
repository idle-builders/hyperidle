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
import {
	ConcurrencyLimitError,
	EventBus,
	type SessionEndedEvent,
	type SessionStartedEvent,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	type CreateSessionParams,
	crashSession,
	createSession,
	endSession,
	type SessionContext,
} from "../services/session-lifecycle.js";

async function seedAll(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();

	db.insert(teams).values({ id: "p1", name: "Test Product", phase: "build", createdAt: now }).run();

	db.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: now })
		.run();

	db.insert(bets)
		.values({
			id: "b1",
			teamId: "p1",
			description: "Test bet",
			appetite: "small",
			status: "active",
			createdAt: now,
		})
		.run();

	db.insert(tasks)
		.values({
			id: "task-1",
			betId: "b1",
			teamId: "p1",
			title: "Test task",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		})
		.run();

	await db.insert(users).values({
		id: "agent-1",
		name: "Builder Agent",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 1,
		createdAt: now,
	});

	// Seed a knowledge item so materialization has content
	await db.insert(knowledgeItems).values({
		id: "ki-1",
		layer: "L4",
		kind: "principle",
		title: "Test Principle",
		body: "This is a test principle.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "system",
		createdAt: now,
		updatedAt: now,
	});
}

function makeParams(basePath: string): CreateSessionParams {
	return {
		taskId: "task-1",
		agentId: "agent-1",
		agentRole: "builder",
		productId: "p1",
		modelTier: "workhorse",
		workspaceBasePath: basePath,
	};
}

describe("Session Lifecycle", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	let eventBus: EventBus;
	let tmpDir: string;
	const cleanupContexts: SessionContext[] = [];

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		eventBus = new EventBus();
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-lifecycle-"));
		await seedAll(db);
	});

	afterEach(async () => {
		// Clean up any leftover workspace dirs
		for (const ctx of cleanupContexts) {
			if (fs.existsSync(ctx.workspacePath)) {
				fs.rmSync(ctx.workspacePath, { recursive: true, force: true });
			}
		}
		cleanupContexts.length = 0;
		if (fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	// AC1: Create session -> active, workspace exists, materialized files present, watcher running
	it("creates session with active state, workspace, materialized files, and watcher", async () => {
		const params = makeParams(tmpDir);
		const ctx = await createSession(db, eventBus, params);
		cleanupContexts.push(ctx);

		// Session row exists with state=active
		const [session] = await db.select().from(sessions).where(eq(sessions.id, ctx.sessionId));
		expect(session).toBeDefined();
		expect(session?.state).toBe("active");

		// Workspace directory exists
		expect(fs.existsSync(ctx.workspacePath)).toBe(true);

		// Materialized files present (manifest written by materialize)
		const manifestPath = path.join(ctx.workspacePath, ".fabric/manifest.json");
		expect(fs.existsSync(manifestPath)).toBe(true);

		// Watcher is running (has a stop method)
		expect(typeof ctx.watcher.stop).toBe("function");

		// Clean up
		ctx.watcher.stop();
	});

	// AC2: End session -> done, watcher stopped, final pass complete, session_ended event fires
	it("ends session with done state and emits session_ended event", async () => {
		const params = makeParams(tmpDir);
		const ctx = await createSession(db, eventBus, params);
		cleanupContexts.push(ctx);

		const endedEvents: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (e) => endedEvents.push(e));

		await endSession(db, eventBus, ctx, 0);

		const [session] = await db.select().from(sessions).where(eq(sessions.id, ctx.sessionId));
		expect(session?.state).toBe("done");
		expect(session?.endedAt).toBeTruthy();

		expect(endedEvents).toHaveLength(1);
		expect(endedEvents[0].sessionId).toBe(ctx.sessionId);
		expect(endedEvents[0].agentId).toBe("agent-1");
		expect(endedEvents[0].taskId).toBe("task-1");
	});

	// AC3: Crash session -> crashed, watcher stopped, final pass complete, knowledge preserved
	it("crashes session with crashed state and preserves knowledge in DB", async () => {
		const params = makeParams(tmpDir);
		const ctx = await createSession(db, eventBus, params);
		cleanupContexts.push(ctx);

		await crashSession(db, eventBus, ctx, 0);

		const [session] = await db.select().from(sessions).where(eq(sessions.id, ctx.sessionId));
		expect(session?.state).toBe("crashed");
		expect(session?.outcome).toBe("crashed");
		expect(session?.endedAt).toBeTruthy();

		// Knowledge still in DB
		const [ki] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, "ki-1"));
		expect(ki).toBeDefined();
		expect(ki?.body).toBe("This is a test principle.");
	});

	// AC4: Session cost is a strategy concern (O2: cost column stripped from sessions).
	// The session ends cleanly even when a cost value is passed.
	it("ends session cleanly (cost is a strategy concern, not kernel)", async () => {
		const params = makeParams(tmpDir);
		const ctx = await createSession(db, eventBus, params);
		cleanupContexts.push(ctx);

		// costInCents param is accepted for API compat but no longer written to DB.
		await endSession(db, eventBus, ctx, 15);

		const [session] = await db.select().from(sessions).where(eq(sessions.id, ctx.sessionId));
		expect(session?.state).toBe("done");
		expect(session?.endedAt).toBeTruthy();
	});

	// AC5: Creating session at max_concurrent_sessions -> ConcurrencyLimitError
	it("throws ConcurrencyLimitError when at max concurrent sessions", async () => {
		const params = makeParams(tmpDir);

		// Agent has maxConcurrentSessions=1, create first session
		const ctx1 = await createSession(db, eventBus, params);
		cleanupContexts.push(ctx1);

		// Second session should fail
		await expect(createSession(db, eventBus, params)).rejects.toThrow(ConcurrencyLimitError);

		// Clean up
		ctx1.watcher.stop();
	});

	// AC6: Session workspace_snapshot contains path to workspace
	it("stores workspace path in workspace_snapshot", async () => {
		const params = makeParams(tmpDir);
		const ctx = await createSession(db, eventBus, params);
		cleanupContexts.push(ctx);

		const [session] = await db.select().from(sessions).where(eq(sessions.id, ctx.sessionId));
		expect(session?.workspaceSnapshot).toBe(ctx.workspacePath);

		ctx.watcher.stop();
	});

	// AC7: After session end, workspace cleaned up (deleted)
	it("deletes workspace directory after endSession", async () => {
		const params = makeParams(tmpDir);
		const ctx = await createSession(db, eventBus, params);
		cleanupContexts.push(ctx);

		expect(fs.existsSync(ctx.workspacePath)).toBe(true);

		await endSession(db, eventBus, ctx, 0);

		expect(fs.existsSync(ctx.workspacePath)).toBe(false);
	});

	// AC1 supplement: session_started event fires on create
	it("emits session_started event on create", async () => {
		const startedEvents: SessionStartedEvent[] = [];
		eventBus.on("session_started", (e) => startedEvents.push(e));

		const params = makeParams(tmpDir);
		const ctx = await createSession(db, eventBus, params);
		cleanupContexts.push(ctx);

		expect(startedEvents).toHaveLength(1);
		expect(startedEvents[0].sessionId).toBe(ctx.sessionId);
		expect(startedEvents[0].agentId).toBe("agent-1");
		expect(startedEvents[0].taskId).toBe("task-1");

		ctx.watcher.stop();
	});
});
