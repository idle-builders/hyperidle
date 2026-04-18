import * as crypto from "node:crypto";
import { type HyperIdleDb, agents, items, messages, sessions, tasks, threads } from "@hyperidle/db";
import type { EventBus, TaskState } from "@hyperidle/shared";
import { and, eq, ne } from "drizzle-orm";
import type { SessionContext } from "./session-lifecycle.js";
import { transitionTask } from "./task-state-machine.js";

export interface HandoffMetadata {
	context_id: string;
	status: "completed" | "failed" | "blocked" | "in_progress";
	reason: string;
	artifacts: string[];
	remaining_work: string[];
	error?: string;
}

export interface HandoffParams {
	sessionContext: SessionContext;
	toAgent?: string;
	toRole?: string;
	toHuman?: boolean;
	metadata: HandoffMetadata;
}

export interface HandoffResult {
	status: "success" | "escalated";
	targetAgentId?: string;
	escalationItemId?: string;
}

/**
 * Hand off a task from one agent to another (or to a human).
 *
 * Flow:
 * 1. End current session
 * 2. Resolve target agent (by ID, role, or human)
 * 3. Update task ownership
 * 4. Create thread message with structured handoff metadata
 * 5. Log handoff in task audit trail
 */
export async function handoff(
	db: HyperIdleDb,
	eventBus: EventBus,
	params: HandoffParams,
): Promise<HandoffResult> {
	const { sessionContext, metadata } = params;
	const now = new Date().toISOString();

	// Validate task exists
	const task = db.select().from(tasks).where(eq(tasks.id, sessionContext.taskId)).get();
	if (!task) {
		throw new Error(`Task not found: ${sessionContext.taskId}`);
	}

	// 1. End current session
	db.update(sessions)
		.set({ state: "done", endedAt: now, cost: 0 })
		.where(eq(sessions.id, sessionContext.sessionId))
		.run();

	// 2. Resolve target and perform handoff-type-specific logic
	let result: HandoffResult;

	if (params.toHuman) {
		result = handleToHuman(db, eventBus, task.id, sessionContext, metadata, now);
	} else if (params.toAgent) {
		result = handleToAgent(db, task.id, params.toAgent, now);
	} else if (params.toRole) {
		result = handleToRole(db, task.id, task.teamId, sessionContext, params.toRole, metadata, now);
	} else {
		throw new Error("One of toAgent, toRole, or toHuman must be specified");
	}

	// 4. Create thread message with structured handoff metadata
	if (task.threadId) {
		const messageBody: Record<string, unknown> = {
			type: "handoff",
			context_id: metadata.context_id,
			status: metadata.status,
			reason: metadata.reason,
			artifacts: metadata.artifacts,
			remaining_work: metadata.remaining_work,
		};
		if (metadata.error !== undefined) {
			messageBody.error = metadata.error;
		}

		db.insert(messages)
			.values({
				id: crypto.randomUUID(),
				senderId: sessionContext.agentId,
				recipientId: result.targetAgentId ?? sessionContext.agentId,
				threadId: task.threadId,
				subject: "handoff",
				body: JSON.stringify(messageBody),
				createdAt: now,
			})
			.run();
	}

	// 5. Log handoff in task audit trail
	// Re-read task to get latest notes (transitionTask may have appended entries)
	const freshTask = db.select().from(tasks).where(eq(tasks.id, sessionContext.taskId)).get();
	const existingAudit: unknown[] = freshTask?.notes ? JSON.parse(freshTask.notes) : [];
	const auditEntry = {
		type: "handoff",
		fromAgent: sessionContext.agentId,
		toAgent: result.targetAgentId,
		toHuman: params.toHuman,
		reason: metadata.reason,
		timestamp: now,
	};
	existingAudit.push(auditEntry);

	db.update(tasks)
		.set({
			notes: JSON.stringify(existingAudit),
			updatedAt: now,
		})
		.where(eq(tasks.id, sessionContext.taskId))
		.run();

	return result;
}

function handleToAgent(
	db: HyperIdleDb,
	taskId: string,
	targetAgentId: string,
	now: string,
): HandoffResult {
	// Validate target agent exists
	const targetAgent = db.select().from(agents).where(eq(agents.id, targetAgentId)).get();
	if (!targetAgent) {
		throw new Error(`Agent not found: ${targetAgentId}`);
	}

	// Set new owner
	db.update(tasks)
		.set({ ownerAgentId: targetAgentId, updatedAt: now })
		.where(eq(tasks.id, taskId))
		.run();

	return { status: "success", targetAgentId };
}

function handleToRole(
	db: HyperIdleDb,
	taskId: string,
	teamId: string,
	sessionContext: SessionContext,
	role: string,
	metadata: HandoffMetadata,
	now: string,
): HandoffResult {
	// Find available agent with matching role on same team, excluding the current agent
	const availableAgent = db
		.select()
		.from(agents)
		.where(
			and(
				eq(agents.role, role),
				eq(agents.teamId, teamId),
				eq(agents.status, "active"),
				ne(agents.id, sessionContext.agentId),
			),
		)
		.get();

	if (availableAgent) {
		db.update(tasks)
			.set({ ownerAgentId: availableAgent.id, updatedAt: now })
			.where(eq(tasks.id, taskId))
			.run();

		return { status: "success", targetAgentId: availableAgent.id };
	}

	// No agent available -- create escalation item
	const threadId = crypto.randomUUID();
	db.insert(threads).values({ id: threadId, kind: "escalation", createdAt: now }).run();

	const escalationItemId = crypto.randomUUID();
	db.insert(items)
		.values({
			id: escalationItemId,
			sourceAgentId: sessionContext.agentId,
			kind: "escalation",
			title: `No available ${role} agent for task ${taskId}`,
			body: JSON.stringify({
				taskId,
				requestedRole: role,
				reason: metadata.reason,
				metadata,
			}),
			threadId,
			createdAt: now,
		})
		.run();

	return { status: "escalated", escalationItemId };
}

function handleToHuman(
	db: HyperIdleDb,
	eventBus: EventBus,
	taskId: string,
	sessionContext: SessionContext,
	metadata: HandoffMetadata,
	now: string,
): HandoffResult {
	// Transition task to blocked via the state machine (validates the transition)
	transitionTask(db, eventBus, taskId, "blocked" as TaskState);

	// Create review item
	const reviewThreadId = crypto.randomUUID();
	db.insert(threads).values({ id: reviewThreadId, kind: "review", createdAt: now }).run();

	db.insert(items)
		.values({
			id: crypto.randomUUID(),
			sourceAgentId: sessionContext.agentId,
			kind: "review",
			title: `Human review requested for task ${taskId}`,
			body: JSON.stringify({
				taskId,
				reason: metadata.reason,
				metadata,
			}),
			threadId: reviewThreadId,
			createdAt: now,
		})
		.run();

	return { status: "success" };
}
