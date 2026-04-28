import * as crypto from "node:crypto";
import { agents, type HyperIdleDb, items, messages, sessions, tasks, threads } from "@hyperidle/db";
import type { DomainEvent, EventBus, TaskState, TaskStateChangedEvent } from "@hyperidle/shared";
import { and, eq, ne } from "drizzle-orm";
import { releaseSessionDedup } from "./cost-cap.js";
import type { SessionContext } from "./session-lifecycle.js";
import type { HandoffAuditEntry, TaskAuditEntry } from "./task-audit.js";
import { InvalidTransitionError, VALID_TRANSITIONS } from "./task-state-machine.js";

export interface HandoffMetadata {
	// biome-ignore lint/style/useNamingConvention: agent handoff protocol wire format uses snake_case
	context_id: string;
	status: "completed" | "failed" | "blocked" | "in_progress";
	reason: string;
	artifacts: string[];
	// biome-ignore lint/style/useNamingConvention: agent handoff protocol wire format uses snake_case
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
 * All DB mutations — session UPDATE, task UPDATE (ownership + auditTrail),
 * optional thread messages INSERT, optional escalation/review items INSERT —
 * commit inside a single `db.transaction((tx) => {...})`. Events emit AFTER
 * the transaction commits, in the order:
 *   1. task_state_changed (only when the handoff transitioned the task)
 *   2. item_created (only when an escalation or review item was created)
 *
 * If any mutation throws inside the tx, the entire handoff rolls back:
 * session stays active, ownership unchanged, auditTrail untouched, no
 * partial messages or items persisted.
 *
 * @lore I1 adversary-M2 / security-M3: before I1, handoff's mutations were
 * sequential bare writes. A mid-flight failure (e.g. a messages INSERT
 * rejected by a FK) left the session ended but the task untouched, or the
 * auditTrail re-written without a matching thread message. Transactional
 * boundary + post-commit emit gives atomic "all or nothing" handoff.
 */
export async function handoff(
	db: HyperIdleDb,
	eventBus: EventBus,
	params: HandoffParams,
): Promise<HandoffResult> {
	const { sessionContext, metadata } = params;
	const now = new Date().toISOString();

	// Pre-transaction reads + validation (safe to do outside the tx: these
	// reads do not mutate state, and the tx callback below re-reads any row
	// it updates to avoid stale snapshots on concurrent handoffs).
	const task = db.select().from(tasks).where(eq(tasks.id, sessionContext.taskId)).get();
	if (!task) {
		throw new Error(`Task not found: ${sessionContext.taskId}`);
	}

	// Pre-validate toAgent exists so the tx never rolls back on a
	// predictable "not found" (keeps error semantics identical to the
	// pre-transactional implementation).
	if (params.toAgent) {
		const targetAgent = db.select().from(agents).where(eq(agents.id, params.toAgent)).get();
		if (!targetAgent) {
			throw new Error(`Agent not found: ${params.toAgent}`);
		}
	}

	if (!(params.toHuman || params.toAgent || params.toRole)) {
		throw new Error("One of toAgent, toRole, or toHuman must be specified");
	}

	// Events captured inside the tx and emitted AFTER commit. Order:
	//   1. task_state_changed (toHuman only, via the inlined transition)
	//   2. item_created       (escalation or review-item paths)
	// `session_ended` is NOT emitted here — handoff does not record a
	// session's cost-delta outcome, so subscribers like
	// `session-review-creator` must not fire on handoff.
	let taskStateChangedEvent: TaskStateChangedEvent | null = null;
	let itemCreatedEvent: Extract<DomainEvent, { type: "item_created" }> | null = null;

	const result: HandoffResult = db.transaction((tx): HandoffResult => {
		// 1. End current session (state + endedAt). Cost is preserved —
		// downstream cost-cap + digest routines depend on it.
		tx.update(sessions)
			.set({ state: "done", endedAt: now })
			.where(eq(sessions.id, sessionContext.sessionId))
			.run();

		// 2. Perform the handoff-type-specific mutations + capture the
		// post-commit event shapes.
		let txResult: HandoffResult;
		if (params.toHuman) {
			// Inline the state-machine transition so the mutation is in-tx
			// and the `task_state_changed` event defers to post-commit.
			const fromState = task.state as TaskState;
			const allowed = VALID_TRANSITIONS[fromState];
			if (!allowed.includes("blocked")) {
				throw new InvalidTransitionError(task.id, fromState, "blocked");
			}
			const existingStateAudit: TaskAuditEntry[] = task.auditTrail
				? (JSON.parse(task.auditTrail) as TaskAuditEntry[])
				: [];
			existingStateAudit.push({ from: fromState, to: "blocked", timestamp: now });
			tx.update(tasks)
				.set({
					state: "blocked",
					auditTrail: JSON.stringify(existingStateAudit),
					updatedAt: now,
				})
				.where(eq(tasks.id, task.id))
				.run();
			taskStateChangedEvent = {
				type: "task_state_changed",
				streamId: task.id,
				taskId: task.id,
				fromState,
				toState: "blocked",
				timestamp: Date.now(),
			};

			// Review thread + item
			const reviewThreadId = crypto.randomUUID();
			tx.insert(threads)
				.values({
					id: reviewThreadId,
					hostKind: "task",
					hostId: task.id,
					initiatorId: sessionContext.agentId,
					participants: JSON.stringify([sessionContext.agentId]),
					lastActiveAt: now,
					createdAt: now,
				})
				.run();
			const reviewItemId = crypto.randomUUID();
			tx.insert(items)
				.values({
					id: reviewItemId,
					sourceAgentId: sessionContext.agentId,
					kind: "review",
					title: `Human review requested for task ${task.id}`,
					body: JSON.stringify({ taskId: task.id, reason: metadata.reason, metadata }),
					threadId: reviewThreadId,
					createdAt: now,
				})
				.run();
			itemCreatedEvent = {
				type: "item_created",
				streamId: reviewItemId,
				itemId: reviewItemId,
				conversationId: reviewThreadId,
				kind: "review",
				timestamp: Date.now(),
			};
			txResult = { status: "success" };
		} else if (params.toAgent) {
			tx.update(tasks)
				.set({ ownerAgentId: params.toAgent, updatedAt: now })
				.where(eq(tasks.id, task.id))
				.run();
			txResult = { status: "success", targetAgentId: params.toAgent };
		} else if (params.toRole) {
			const availableAgent = tx
				.select()
				.from(agents)
				.where(
					and(
						eq(agents.role, params.toRole),
						eq(agents.teamId, task.teamId),
						eq(agents.status, "active"),
						ne(agents.id, sessionContext.agentId),
					),
				)
				.get();

			if (availableAgent) {
				tx.update(tasks)
					.set({ ownerAgentId: availableAgent.id, updatedAt: now })
					.where(eq(tasks.id, task.id))
					.run();
				txResult = { status: "success", targetAgentId: availableAgent.id };
			} else {
				const escalationThreadId = crypto.randomUUID();
				tx.insert(threads)
					.values({
						id: escalationThreadId,
						hostKind: "task",
						hostId: task.id,
						initiatorId: sessionContext.agentId,
						participants: JSON.stringify([sessionContext.agentId]),
						lastActiveAt: now,
						createdAt: now,
					})
					.run();

				const escalationItemId = crypto.randomUUID();
				tx.insert(items)
					.values({
						id: escalationItemId,
						sourceAgentId: sessionContext.agentId,
						kind: "escalation",
						title: `No available ${params.toRole} agent for task ${task.id}`,
						body: JSON.stringify({
							taskId: task.id,
							requestedRole: params.toRole,
							reason: metadata.reason,
							metadata,
						}),
						threadId: escalationThreadId,
						createdAt: now,
					})
					.run();
				itemCreatedEvent = {
					type: "item_created",
					streamId: escalationItemId,
					itemId: escalationItemId,
					conversationId: escalationThreadId,
					kind: "escalation",
					timestamp: Date.now(),
				};
				txResult = { status: "escalated", escalationItemId };
			}
		} else {
			// Pre-validated above, but TypeScript's narrowing loses the
			// guarantee across the transaction closure.
			throw new Error("One of toAgent, toRole, or toHuman must be specified");
		}

		// 3. Thread message with structured handoff metadata (if the task
		// has a thread). Runs AFTER the ownership mutation so the recipient
		// in the message matches the persisted owner.
		if (task.threadId) {
			// L1a: messages now carry `type` + `payload` instead of subject/body.
			// Handoff metadata is a structured payload with type='handoff'.
			const handoffPayload: Record<string, unknown> = {
				type: "handoff",
				context_id: metadata.context_id,
				status: metadata.status,
				reason: metadata.reason,
				artifacts: metadata.artifacts,
				remaining_work: metadata.remaining_work,
			};
			if (metadata.error !== undefined) {
				handoffPayload.error = metadata.error;
			}
			const messageId = crypto.randomUUID();
			tx.insert(messages)
				.values({
					id: messageId,
					senderId: sessionContext.agentId,
					threadId: task.threadId,
					type: "handoff",
					payload: JSON.stringify(handoffPayload),
					clientKey: messageId,
					createdAt: now,
				})
				.run();
		}

		// 4. Log the handoff in tasks.auditTrail. Re-read via `tx` so we
		// observe the state-transition entry appended above (toHuman path).
		const freshTask = tx.select().from(tasks).where(eq(tasks.id, task.id)).get();
		const existingAudit: TaskAuditEntry[] = freshTask?.auditTrail
			? (JSON.parse(freshTask.auditTrail) as TaskAuditEntry[])
			: [];
		const handoffEntry: HandoffAuditEntry = {
			type: "handoff",
			fromAgent: sessionContext.agentId,
			toAgent: txResult.targetAgentId,
			toHuman: params.toHuman,
			reason: metadata.reason,
			timestamp: now,
		};
		tx.update(tasks)
			.set({
				auditTrail: JSON.stringify([...existingAudit, handoffEntry]),
				updatedAt: now,
			})
			.where(eq(tasks.id, task.id))
			.run();

		return txResult;
	});

	// Post-commit emission — task_state_changed first, then item_created.
	if (taskStateChangedEvent) {
		eventBus.emit(taskStateChangedEvent);
	}
	if (itemCreatedEvent) {
		eventBus.emit(itemCreatedEvent);
	}

	// I3 review C1 / arch H-1: handoff sets `state: "done"` on the session
	// directly inside the transaction above and intentionally does NOT emit
	// `session_ended` (handoff is not a cost-attribution event — see lines
	// 85-87). The cost-cap dedup map subscribes to session_ended through
	// `registerCostCapDedupReleaser`, so handoff would otherwise leak the
	// per-session entry. Release it explicitly here, post-commit, so the
	// release happens exactly when the session row's state has flipped.
	releaseSessionDedup(sessionContext.sessionId);

	return result;
}
