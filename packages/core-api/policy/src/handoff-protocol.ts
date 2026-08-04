import { randomUUID } from "node:crypto";
import { type HyperIdleDb, taskDispatchAttempts } from "@hyperidle/db";
import {
	canTransitionTaskState,
	type DomainEvent,
	type EventBus,
	TaskInvalidTransitionError,
	type TaskState,
	type TaskStateChangedEvent,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { PolicyDeps, PolicySessionContext } from "./ports.js";

type HandoffDeps = {
	work: Required<
		Pick<PolicyDeps["work"], "getTaskById" | "updateTaskById" | "claimTaskHandoff" | "createItem">
	>;
	conversation: Pick<PolicyDeps["conversation"], "insertMessage" | "insertThread">;
	users: Required<Pick<PolicyDeps["users"], "getUserById" | "findActiveTeammateByRole">>;
	org: NonNullable<PolicyDeps["org"]>;
	sessionRequests: NonNullable<PolicyDeps["sessionRequests"]>;
	taskRunResolver: NonNullable<PolicyDeps["taskRunResolver"]>;
	runOrchestration: NonNullable<PolicyDeps["runOrchestration"]>;
};

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
	sessionContext: PolicySessionContext;
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

/** Mirrors `@hyperidle/work`'s `task-audit.ts` `TaskAuditEntry` union (Mechanism C — local structural mirror). */
interface StateTransitionAuditEntry {
	readonly from: TaskState;
	readonly to: TaskState;
	readonly timestamp: string;
	readonly reason?: string;
}

interface HandoffAuditEntry {
	readonly type: "handoff";
	readonly fromAgent: string;
	readonly toAgent?: string;
	readonly toHuman?: boolean;
	readonly reason: string;
	readonly timestamp: string;
}

type TaskAuditEntry = StateTransitionAuditEntry | HandoffAuditEntry;

/** Atomic task handoff; events emit only after commit. */
export function buildHandoff(
	deps: HandoffDeps,
): (db: HyperIdleDb, eventBus: EventBus, params: HandoffParams) => Promise<HandoffResult> {
	return async (db, eventBus, params) => {
		const { sessionContext, metadata } = params;

		// This snapshot supplies the explicit updatedAt version for the in-tx CAS.
		// A competing handoff can mutate after this read, but then exactly one claim
		// matches and the loser transaction performs no partial effects.
		if (!sessionContext.taskId) {
			throw new Error("Handoff requires a task-backed session");
		}
		const task = await deps.work.getTaskById(db, sessionContext.taskId);
		if (!task) {
			throw new Error(`Task not found: ${sessionContext.taskId}`);
		}
		const now = new Date(Math.max(Date.now(), Date.parse(task.updatedAt) + 1)).toISOString();

		// Pre-validate toAgent exists so the tx never rolls back on a
		// predictable "not found" (keeps error semantics identical to the
		// pre-transactional implementation).
		if (params.toAgent) {
			const targetAgent = await deps.users.getUserById(db, params.toAgent);
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
		// session-end outcome, so subscribers like `session-review-creator`
		// must not fire on handoff. AU26 H1: that suppression now lives on the
		// side that owns the write (`run-orchestration`'s `endRunForHandoff`
		// takes no EventBus at all), so it is structural rather than a rule
		// this file has to keep remembering.
		let taskStateChangedEvent: TaskStateChangedEvent | null = null;
		let itemCreatedEvent: Extract<DomainEvent, { type: "item_created" }> | null = null;

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: same transactional logic as pre-migration (toAgent/toRole/toHuman branches, escalation vs review-item paths, audit-trail append) — the `buildHandoff(deps)` factory-curry wrapper (Mechanism C) this migration introduced adds one nesting level around the whole function, pushing an already-complex-but-unchanged CAS transaction over the threshold.
		const result: HandoffResult = await db.transaction(async (tx): Promise<HandoffResult> => {
			const claim = await deps.work.claimTaskHandoff(tx, {
				taskId: task.id,
				expectedUpdatedAt: task.updatedAt,
				claimedAt: now,
			});
			if (!claim.applied) throw new Error(`Task handoff conflict: ${task.id}`);

			// 1. End the current run (state + endedAt) — a downward call into
			// `agent-orchestration`, with THIS transaction's handle so the run is
			// terminal at the same commit as the task claim above. Unconditional:
			// it runs whether or not a matching `agentSessionRequests` row exists.
			await deps.runOrchestration.endRunForHandoff(tx, sessionContext.sessionId, now);

			// 2. Perform the handoff-type-specific mutations + capture the
			// post-commit event shapes.
			let txResult: HandoffResult;
			if (params.toHuman) {
				// Inline the state-machine transition so the mutation is in-tx
				// and the `task_state_changed` event defers to post-commit.
				const fromState = task.state as TaskState;
				if (!canTransitionTaskState(fromState, "blocked")) {
					throw new TaskInvalidTransitionError(task.id, fromState, "blocked");
				}
				const existingStateAudit: TaskAuditEntry[] = task.auditTrail
					? (JSON.parse(task.auditTrail) as TaskAuditEntry[])
					: [];
				existingStateAudit.push({ from: fromState, to: "blocked", timestamp: now });
				await deps.work.updateTaskById(tx, task.id, {
					state: "blocked",
					auditTrail: JSON.stringify(existingStateAudit),
					updatedAt: now,
				});
				taskStateChangedEvent = {
					type: "task_state_changed",
					streamId: task.id,
					taskId: task.id,
					fromState,
					toState: "blocked",
					timestamp: Date.now(),
				};

				// Review thread + item
				const reviewThreadId = randomUUID();
				await deps.conversation.insertThread(tx, {
					id: reviewThreadId,
					hostKind: "task",
					hostId: task.id,
					initiatorId: sessionContext.agentId,
					participants: JSON.stringify([sessionContext.agentId]),
					lastActiveAt: now,
					createdAt: now,
				});
				const reviewItemId = randomUUID();
				await deps.work.createItem(tx, {
					id: reviewItemId,
					sourceAgentId: sessionContext.agentId,
					kind: "review",
					title: `Human review requested for task ${task.id}`,
					body: JSON.stringify({ taskId: task.id, reason: metadata.reason, metadata }),
					threadId: reviewThreadId,
					createdAt: now,
				});
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
				await deps.work.updateTaskById(tx, task.id, {
					ownerAgentId: params.toAgent,
					updatedAt: now,
				});
				txResult = { status: "success", targetAgentId: params.toAgent };
			} else if (params.toRole) {
				// @lore U1: users.teamId references teamMembers.id (membership group),
				// but task.teamId references teams.id (domain entity). To find agents
				// for the same domain team, join through teamMembers.
				//
				// @lore AU19 Increment 2a (ports.ts census correction #1): `org`'s
				// `team_members` table is a confirmed 1:1-per-team invariant
				// (`loadTeamMembers` throws if a team doesn't have exactly one row)
				// — a single-row `getByTeamId` read is behaviorally identical to the
				// former raw multi-row select, which in practice only ever returned
				// 0 or 1 rows.
				const teamMembersRow = await deps.org.getByTeamId(tx, task.teamId);
				const memberGroupIds = teamMembersRow ? [teamMembersRow.id] : [];
				const availableAgent =
					memberGroupIds.length > 0
						? await deps.users.findActiveTeammateByRole(
								tx,
								params.toRole,
								memberGroupIds,
								sessionContext.agentId,
							)
						: undefined;

				if (availableAgent) {
					await deps.work.updateTaskById(tx, task.id, {
						ownerAgentId: availableAgent.id,
						updatedAt: now,
					});
					txResult = { status: "success", targetAgentId: availableAgent.id };
				} else {
					const escalationThreadId = randomUUID();
					await deps.conversation.insertThread(tx, {
						id: escalationThreadId,
						hostKind: "task",
						hostId: task.id,
						initiatorId: sessionContext.agentId,
						participants: JSON.stringify([sessionContext.agentId]),
						lastActiveAt: now,
						createdAt: now,
					});

					const escalationItemId = randomUUID();
					await deps.work.createItem(tx, {
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
					});
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
				const messageId = randomUUID();
				await deps.conversation.insertMessage(tx, {
					id: messageId,
					senderId: sessionContext.agentId,
					threadId: task.threadId,
					type: "handoff",
					payload: JSON.stringify(handoffPayload),
					clientKey: messageId,
					createdAt: now,
				});
			}

			// 4. Log the handoff in tasks.auditTrail. Re-read via `tx` so we
			// observe the state-transition entry appended above (toHuman path).
			// @lore AU13 addendum §A6: MUST stay `tx` (not pooled `db`) — re-reads the
			// task inside the handoff transaction after a prior in-tx update.
			const freshTask = await deps.work.getTaskById(tx, task.id);
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
			await deps.work.updateTaskById(tx, task.id, {
				auditTrail: JSON.stringify([...existingAudit, handoffEntry]),
				updatedAt: now,
			});

			if (txResult.targetAgentId) {
				const existing = await tx
					.select({ id: taskDispatchAttempts.id })
					.from(taskDispatchAttempts)
					.where(eq(taskDispatchAttempts.taskId, task.id));
				const attemptId = randomUUID();
				await tx.insert(taskDispatchAttempts).values({
					id: attemptId,
					taskId: task.id,
					occasion: "owner_handoff",
					agentId: txResult.targetAgentId,
					predecessorSessionId: sessionContext.sessionId,
					ordinal: existing.length + 1,
					status: "requested",
					createdAt: now,
					updatedAt: now,
				});
				// AU21 §6 Decision B: resolve + validate the task_run run AT EMIT
				// TIME (via the injected `work` resolver, since `policy` cannot
				// import `@hyperidle/work` directly — Mechanism C) and bake the
				// full request onto the intent.
				const bakedRequest = await deps.taskRunResolver.resolve(tx, attemptId);
				await deps.sessionRequests.record(tx, {
					kind: "task_run",
					sourceKind: "task_dispatch_attempt",
					sourceId: attemptId,
					requestedBy: txResult.targetAgentId,
					idempotencyKey: `task-dispatch:${attemptId}`,
					bakedRequest,
				});
			}

			return txResult;
		});

		// Post-commit emission — task_state_changed first, then item_created.
		if (taskStateChangedEvent) {
			eventBus.emit(taskStateChangedEvent);
		}
		if (itemCreatedEvent) {
			eventBus.emit(itemCreatedEvent);
		}

		eventBus.emit({
			type: "session_handoff_completed",
			streamId: sessionContext.sessionId,
			sessionId: sessionContext.sessionId,
			requestedBy: sessionContext.agentId,
			timestamp: Date.now(),
		});

		await deps.sessionRequests.abort(sessionContext.sessionId);

		return result;
	};
}
