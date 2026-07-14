import { randomUUID } from "node:crypto";
import { type HyperIdleDb, sessions, taskDispatchAttempts } from "@hyperidle/db";
import type { DomainEvent, EventBus, TaskState, TaskStateChangedEvent } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { HandoffDeps, PolicySessionContext } from "./ports.js";
import { InvalidTransitionError, VALID_TRANSITIONS } from "./task-transitions.js";

/**
 * @lore AU19 Increment 2a: this is the real cut-over — moved here from
 * `packages/server/src/services/handoff-protocol.ts` (behavior-preserving
 * move). Every raw cross-Service call became an injected DI port
 * (Mechanism C, `ports.ts`):
 *  - `work`/`conversation`/`users` — ordinary same-layer core-api edges.
 *  - `org` (`teamMembers`) — ordinary same-layer edge; the raw multi-row
 *    select became `org`'s real `getTeamMembersByTeamId` (see `ports.ts`'s
 *    top `@lore`, census correction #1, for the 1:1-invariant equivalence).
 *  - `session-requests` (`agentSessionRequests` read, `recordAgentWorkIntent`
 *    write, `sessionRunRegistry.abort`) — §10.3 against-grain edge, ruled
 *    PERMANENT at Increment 3b (synchronous read-then-branch control flow;
 *    see `ports.ts`'s top `@lore`). `session-lifecycle`
 *    (`requestAgentTermination`) — §10.3 against-grain edge, still an interim
 *    DI port (`session-lifecycle` has not migrated yet, still deferred).
 *    `cost` (`releaseSessionDedup`) — §10.3 against-grain edge, INVERTED to
 *    an EventBus emission (`session_handoff_completed`) at Increment 3g (see
 *    below and `ports.ts`'s top `@lore`).
 *  - `InvalidTransitionError`/`VALID_TRANSITIONS` were a real VALUE import
 *    from `@hyperidle/work` pre-migration — converted to a local mirror
 *    (`task-transitions.ts`), consolidated with `lifecycle-propagation.ts`'s
 *    pre-existing inlined copy.
 *
 * `sessions`/`taskDispatchAttempts` stay direct `@hyperidle/db` imports —
 * both are in `table-ownership-guard.ts`'s `UNOWNED_SHARED_TABLES` exemption
 * (genuinely multi-owner-touched tables, confirmed unchanged by this
 * migration), so no port is needed for them.
 */

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
export function buildHandoff(
	deps: HandoffDeps,
): (db: HyperIdleDb, eventBus: EventBus, params: HandoffParams) => Promise<HandoffResult> {
	return async (db, eventBus, params) => {
		const { sessionContext, metadata } = params;
		const now = new Date().toISOString();

		// Pre-transaction reads + validation (safe to do outside the tx: these
		// reads do not mutate state, and the tx callback below re-reads any row
		// it updates to avoid stale snapshots on concurrent handoffs).
		if (!sessionContext.taskId) {
			throw new Error("Handoff requires a task-backed session");
		}
		const task = await deps.work.getTaskById(db, sessionContext.taskId);
		if (!task) {
			throw new Error(`Task not found: ${sessionContext.taskId}`);
		}

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
		const correlatedRequest = await deps.sessionRequests.findBySessionId(
			db,
			sessionContext.sessionId,
		);
		if (correlatedRequest)
			await deps.sessionLifecycle.requestTermination(db, {
				requestId: correlatedRequest.id,
				reason: "handoff",
				requestedBy: sessionContext.agentId,
			});

		// Events captured inside the tx and emitted AFTER commit. Order:
		//   1. task_state_changed (toHuman only, via the inlined transition)
		//   2. item_created       (escalation or review-item paths)
		// `session_ended` is NOT emitted here — handoff does not record a
		// session's cost-delta outcome, so subscribers like
		// `session-review-creator` must not fire on handoff.
		let taskStateChangedEvent: TaskStateChangedEvent | null = null;
		let itemCreatedEvent: Extract<DomainEvent, { type: "item_created" }> | null = null;

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: same transactional logic as pre-migration (toAgent/toRole/toHuman branches, escalation vs review-item paths, audit-trail append) — the `buildHandoff(deps)` factory-curry wrapper (Mechanism C) this migration introduced adds one nesting level around the whole function, pushing an already-complex-but-unchanged CAS transaction over the threshold.
		const result: HandoffResult = await db.transaction(async (tx): Promise<HandoffResult> => {
			// 1. End current session (state + endedAt). Cost is preserved —
			// downstream cost-cap + digest routines depend on it.
			await tx
				.update(sessions)
				.set({ state: "done", endedAt: now })
				.where(eq(sessions.id, sessionContext.sessionId));

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
				await deps.sessionRequests.record(tx, {
					kind: "task_run",
					sourceKind: "task_dispatch_attempt",
					sourceId: attemptId,
					requestedBy: txResult.targetAgentId,
					idempotencyKey: `task-dispatch:${attemptId}`,
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

		// I3 review C1 / arch H-1: handoff sets `state: "done"` on the session
		// directly inside the transaction above and intentionally does NOT emit
		// `session_ended` (handoff is not a cost-attribution event — see lines
		// 85-87). The cost-cap dedup map subscribes to session_ended through
		// `registerCostCapDedupReleaser`, so handoff would otherwise leak the
		// per-session entry.
		//
		// @lore AU19 Increment 3g: §10.3 against-grain inversion for
		// `policy ⚠ cost` — this used to be a direct `deps.cost.release(...)`
		// call through an interim `PolicyCostDedupReleaser` DI port
		// (Increment 2a). Atomicity check (§10.3 amendment): the call was
		// already POST-COMMIT and touches only `cost`'s in-memory dedup Map —
		// no DB write, no shared transaction an emit-after-commit split could
		// endanger (the "common case" pure-inversion shape, NOT the
		// `policy ⚠ session-requests` same-transaction exception below).
		// `cost`'s `registerCostCapDedupReleaser` now subscribes to this event
		// (see `@hyperidle/shared`'s `events.ts` top `@lore` on
		// `SessionHandoffCompletedEvent` and `@hyperidle/cost`'s `cost-cap.ts`).
		eventBus.emit({
			type: "session_handoff_completed",
			streamId: sessionContext.sessionId,
			sessionId: sessionContext.sessionId,
			timestamp: Date.now(),
		});

		// AF7 §5 (Z8-048): stop the prior session's tool access. The handoff set the
		// session row to 'done' in-tx but the prior agent's harness loop + tool
		// registry keep running. Abort it POST-COMMIT: for builtin this calls
		// stopSession → sets the internal `aborted` flag → halts runLoop/
		// executeToolCalls (where builtin tools actually run); for non-builtin it
		// breaks the provisioning loop so registry.invoke stops. Handoff NEVER emits
		// session_ended — abort drives stopSession + teardown, and the detached run's
		// teardown calls endSession on an already-'done' row, which the §4.3 CAS guard
		// makes a no-op (zero rows, no spurious session_ended). If no live runtime
		// entry exists (already torn down), abort is a no-op.
		await deps.sessionRequests.abort(sessionContext.sessionId);

		return result;
	};
}
