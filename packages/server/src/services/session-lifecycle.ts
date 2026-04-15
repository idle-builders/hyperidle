import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { type HyperIdleDb, agents, sessions } from "@hyperidle/db";
import {
	type FileWatcher,
	type FileWatcherConfig,
	materialize,
	startWatcher,
} from "@hyperidle/fabric";
import {
	type AgentRole,
	ConcurrencyLimitError,
	type EventBus,
	type ModelTier,
} from "@hyperidle/shared";
import { and, eq, sql } from "drizzle-orm";

export interface CreateSessionParams {
	taskId: string;
	agentId: string;
	agentRole: AgentRole;
	productId: string;
	modelTier: ModelTier;
	workspaceBasePath: string;
}

export interface SessionContext {
	sessionId: string;
	agentId: string;
	taskId: string;
	workspacePath: string;
	watcher: FileWatcher;
}

/**
 * Create a new agent session: check concurrency, set up workspace,
 * materialize knowledge, start file watcher, emit event.
 */
export async function createSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	params: CreateSessionParams,
): Promise<SessionContext> {
	// 1. Check concurrency limit
	const agent = db.select().from(agents).where(eq(agents.id, params.agentId)).get();

	if (!agent) {
		throw new Error(`Agent not found: ${params.agentId}`);
	}

	const activeCount = db
		.select({ count: sql<number>`count(*)` })
		.from(sessions)
		.where(and(eq(sessions.agentId, params.agentId), eq(sessions.state, "active")))
		.get();

	if ((activeCount?.count ?? 0) >= agent.maxConcurrentSessions) {
		throw new ConcurrencyLimitError(params.agentId, agent.maxConcurrentSessions);
	}

	// 2. Generate session ID and workspace path
	const sessionId = crypto.randomUUID();
	const workspacePath = path.join(params.workspaceBasePath, sessionId);
	fs.mkdirSync(workspacePath, { recursive: true });

	// 3. Insert session row
	const now = new Date().toISOString();
	db.insert(sessions)
		.values({
			id: sessionId,
			taskId: params.taskId,
			agentId: params.agentId,
			modelTier: params.modelTier,
			startedAt: now,
			state: "active",
			workspaceSnapshot: workspacePath,
			cost: 0,
		})
		.run();

	// 4. Materialize workspace
	await materialize(db, {
		workspacePath,
		sessionId,
		taskId: params.taskId,
		agentId: params.agentId,
		agentRole: params.agentRole,
		productId: params.productId,
	});

	// 5. Start file watcher
	const manifestPath = path.join(workspacePath, ".fabric/manifest.json");
	const watcherConfig: FileWatcherConfig = {
		db,
		workspacePath,
		sessionId,
		manifestPath,
	};
	const watcher = startWatcher(watcherConfig);

	// 6. Emit session_started event
	eventBus.emit({
		type: "session_started",
		streamId: sessionId,
		sessionId,
		agentId: params.agentId,
		taskId: params.taskId,
		timestamp: Date.now(),
	});

	// 7. Return SessionContext
	return {
		sessionId,
		agentId: params.agentId,
		taskId: params.taskId,
		workspacePath,
		watcher,
	};
}

/**
 * End a session gracefully: stop watcher, update DB, emit event, clean up workspace.
 */
export async function endSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	context: SessionContext,
	costInCents: number,
): Promise<void> {
	// 1. Stop watcher (final pass/flush)
	context.watcher.stop();

	// 2. Update session row
	const now = new Date().toISOString();
	db.update(sessions)
		.set({
			state: "done",
			cost: costInCents,
			endedAt: now,
		})
		.where(eq(sessions.id, context.sessionId))
		.run();

	// 3. Emit session_ended event
	eventBus.emit({
		type: "session_ended",
		streamId: context.sessionId,
		sessionId: context.sessionId,
		agentId: context.agentId,
		taskId: context.taskId,
		timestamp: Date.now(),
	});

	// 4. Delete workspace directory
	if (fs.existsSync(context.workspacePath)) {
		fs.rmSync(context.workspacePath, { recursive: true, force: true });
	}
}

/**
 * Crash a session: same as end but state=crashed, outcome=crashed,
 * with try-catch around watcher.stop().
 */
export async function crashSession(
	db: HyperIdleDb,
	eventBus: EventBus,
	context: SessionContext,
	costInCents: number,
): Promise<void> {
	// 1. Try to stop watcher (may fail in crash scenario)
	try {
		context.watcher.stop();
	} catch {
		// Watcher may already be in a bad state during crash
	}

	// 2. Update session row
	const now = new Date().toISOString();
	db.update(sessions)
		.set({
			state: "crashed",
			outcome: "crashed",
			cost: costInCents,
			endedAt: now,
		})
		.where(eq(sessions.id, context.sessionId))
		.run();

	// 3. Emit session_ended event
	eventBus.emit({
		type: "session_ended",
		streamId: context.sessionId,
		sessionId: context.sessionId,
		agentId: context.agentId,
		taskId: context.taskId,
		timestamp: Date.now(),
	});

	// Note: Do NOT delete workspace on crash -- knowledge is preserved in DB
	// and workspace may be needed for debugging
}
