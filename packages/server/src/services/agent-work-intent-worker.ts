import { randomUUID } from "node:crypto";
import { getMessageById } from "@hyperidle/conversation";
import {
	agentWorkIntents,
	explicitSessionStarts,
	type HyperIdleDb,
	knowledgeItems,
	proposedCalls,
	tailoredGrants,
	taskDispatchAttempts,
	teamMembers,
} from "@hyperidle/db";
import { getTeamMembersByTeamId } from "@hyperidle/org";
import * as routineService from "@hyperidle/routine";
import { listResolvedConfiguration } from "@hyperidle/settings";
import type { AgentSessionRequestInput, TriggerEventType } from "@hyperidle/shared";
import {
	createTriggeredAgentSessionRequest,
	type TriggerResolutionDeps,
} from "@hyperidle/trigger-resolution";
import { getUserById, getUserByIdScopedToTeam, listUsersByTeam } from "@hyperidle/users";
import * as work from "@hyperidle/work";
import { and, asc, eq, lt, or } from "drizzle-orm";
import { isAgentAtWipLimit, selectAgentByAppDefaults } from "./agent-selection.js";
import {
	createAgentSessionRequest,
	findAgentSessionRequestByIdempotencyKey,
} from "./agent-session-requests.js";

/**
 * @lore AU19 Increment 3a: `trigger-resolution`'s DI ports (Mechanism C),
 * wired here — the only real production call site. `settings`/`users`/`org`
 * are real, already-migrated packages. `sessionRequests` is INTERIM (real
 * behavior, just not yet packaged): `session-requests` migrates next in
 * Increment 3, at which point only this const's `sessionRequests` field
 * swaps its import source to `@hyperidle/session-requests` — the port shape
 * and every other field are unaffected.
 */
const triggerResolutionDeps: TriggerResolutionDeps = {
	sessionRequests: {
		findByIdempotencyKey: findAgentSessionRequestByIdempotencyKey,
		create: createAgentSessionRequest,
	},
	config: { listResolvedConfiguration },
	users: { getUserByIdScopedToTeam },
	teams: { getTeamMembersByTeamId },
};

export { executeAgentRunRequest as consumeAgentSessionRequest } from "./agent-run-boundary.js";
export { recordAgentWorkIntent } from "./agent-work-intents.js";

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 60_000;

export const AGENT_WORK_INTENT_FAILURE_CODES = [
	"INVALID_WORK_SOURCE",
	"TARGET_AGENT_MISSING",
	"TARGET_AGENT_INELIGIBLE",
	"TRIGGER_RESOLUTION_FAILED",
	"MAX_ATTEMPTS_EXCEEDED",
] as const;

export interface AgentWorkIntentWorkerOptions {
	readonly now?: () => Date;
	readonly leaseMs?: number;
	readonly maxAttempts?: number;
}

class InvalidAgentWorkSourceError extends Error {}

type Intent = typeof agentWorkIntents.$inferSelect;

function eventTypeFor(intent: Intent): TriggerEventType {
	switch (intent.kind) {
		case "assistant_turn":
			return "assistant.message";
		case "session_start":
		case "task_run":
			return "task.accepted";
		case "knowledge_action":
			return "knowledge.action";
		case "routine_run":
			return "routine.fire";
		case "bet_decomposition":
			return "work.decompose_requested";
		case "reengagement":
			return "proposed_call.granted";
		default:
			throw new InvalidAgentWorkSourceError(`Unknown intent kind ${intent.kind}`);
	}
}

async function requireRunnableActor(db: HyperIdleDb, actorId: string): Promise<void> {
	const actor = await getUserById(db, actorId);
	if (actor?.kind !== "ai" || !["active", "idle"].includes(actor.status)) {
		throw new InvalidAgentWorkSourceError(`Intent actor ${actorId} is not runnable`);
	}
}

/**
 * @lore AU9 C1: resolves the per-user individual Assistant agent for a thread's
 * human sender. `ast-<userId>` is the deterministic scaffold ID installed at
 * user registration (`persistScaffoldedAgents(..., idHint: ast-${id})`, see
 * `routes/users.ts` and `routes/assistant.ts`'s `assistantAgentIdForUser`) — the
 * SAME convention every assistant call site already relies on. Resolving it here
 * is not "templating an ID and trusting it": the ID is only a lookup key, and
 * `requireRunnableActor` below reloads the real `users` row and validates
 * kind==="ai" + an active/idle status before it can ever become execution
 * authority. This never targets the human sender.
 */
function resolveAssistantAgentIdForSender(senderId: string): string {
	return `ast-${senderId}`;
}

/** Reloads domain truth; the intent's actor is only a correlation hint, never sufficient authority. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: explicit family switch is the audit surface for all seven eligibility contracts.
export async function resolveAuthoritativeInput(db: HyperIdleDb, intent: Intent) {
	const eventType = eventTypeFor(intent);
	const common = {
		eventType,
		idempotencyKey: intent.idempotencyKey,
	};

	switch (intent.kind) {
		case "assistant_turn": {
			const message = await getMessageById(db, intent.sourceId);
			if (!message || message.deletedAt || message.redactedAt)
				throw new InvalidAgentWorkSourceError("Assistant source message is unavailable");
			const targetAgentId = resolveAssistantAgentIdForSender(message.senderId);
			await requireRunnableActor(db, targetAgentId);
			return {
				...common,
				defaultAgentId: targetAgentId,
				sourceKind: "assistant" as const,
				sourceId: message.id,
				streamId: `thread:${message.threadId}`,
				userId: message.senderId,
				sourceCorrelation: {
					threadId: message.threadId,
					messageId: message.id,
					userId: message.senderId,
					assistantAgentId: targetAgentId,
				},
			};
		}
		case "session_start": {
			const [start] = await db
				.select()
				.from(explicitSessionStarts)
				.where(eq(explicitSessionStarts.id, intent.sourceId))
				.limit(1);
			if (!start || start.status !== "requested")
				throw new InvalidAgentWorkSourceError("Explicit session start is unavailable");
			await requireRunnableActor(db, start.requestedAgentId);
			const task = await work.getTaskById(db, start.taskId);
			if (!task) throw new InvalidAgentWorkSourceError("Explicit session task is unavailable");
			return {
				...common,
				defaultAgentId: start.requestedAgentId,
				sourceKind: "task" as const,
				sourceId: task.id,
				streamId: `task:${task.id}`,
				taskId: task.id,
				teamId: task.teamId,
				sourceCorrelation: { taskId: task.id, teamId: task.teamId },
			};
		}
		case "task_run": {
			const [attempt] = await db
				.select()
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.id, intent.sourceId))
				.limit(1);
			if (!attempt || attempt.status !== "requested")
				throw new InvalidAgentWorkSourceError("Task dispatch attempt is unavailable");
			const task = await work.getTaskById(db, attempt.taskId);
			if (!(task && ["ready", "accepted", "in_progress"].includes(task.state)))
				throw new InvalidAgentWorkSourceError("Task is not eligible for agent work");
			if (task.ownerAgentId && task.ownerAgentId !== attempt.agentId)
				throw new InvalidAgentWorkSourceError("Task owner changed after intent creation");
			await requireRunnableActor(db, attempt.agentId);
			return {
				...common,
				defaultAgentId: attempt.agentId,
				sourceKind: "task" as const,
				sourceId: task.id,
				streamId: `task:${task.id}`,
				taskId: task.id,
				teamId: task.teamId,
				sourceCorrelation: { taskId: task.id, teamId: task.teamId },
			};
		}
		case "knowledge_action": {
			const itemId = intent.sourceId.replace(/^knowledge:/, "");
			const [item] = await db
				.select()
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, itemId))
				.limit(1);
			if (!item || item.status === "archived")
				throw new InvalidAgentWorkSourceError("Knowledge item is unavailable");
			await requireRunnableActor(db, item.updatedBy);
			return {
				...common,
				defaultAgentId: item.updatedBy,
				sourceKind: "knowledge" as const,
				sourceId: intent.sourceId,
				streamId: `knowledge:${item.id}`,
				sourceCorrelation: {
					knowledgeItemId: item.id,
					action: "review" as const,
					...(item.scopeId ? { scopeId: item.scopeId } : {}),
				},
			};
		}
		case "routine_run": {
			const run = await routineService.getRoutineRunById(db, intent.sourceId);
			if (!run || run.outcome !== "running")
				throw new InvalidAgentWorkSourceError("Routine run is unavailable");
			const routine = await routineService.getRoutineById(db, run.routineId);
			if (!routine || routine.deletedAt || !routine.active || routine.state !== "active")
				throw new InvalidAgentWorkSourceError("Routine is not eligible to run");
			// AU15 §4b: owner-WIP evaluation + delegate resolution moved here from
			// the (now-removed) fire-time `checkAndFireRoutine` block — drain-time
			// is closest to execution, matching the family-standard shape
			// (`bet_decomposition` also selects at drain). `isAgentAtWipLimit` +
			// `selectAgentByAppDefaults` are imported from the agent-owned
			// `agent-selection.ts` — agent→agent, same layer, no boundary crossing.
			let selectedAgentId = routine.ownerAgentId;
			if (await isAgentAtWipLimit(db, routine.ownerAgentId)) {
				if (routine.delegationAllowed && routine.skillId) {
					const { agentId } = await selectAgentByAppDefaults({
						db,
						surface: "routine_delegate",
						teamId: null,
						workKey: routine.id,
						candidates: [],
						roleHint: null,
						spreadIndex: null,
						excludeAgentId: routine.ownerAgentId,
						skillId: routine.skillId,
					});
					// No delegate found → keep the owner. Provision-time WIP
					// (session-provisioning.ts's ConcurrencyLimitError) defers and
					// retries the request rather than erroring terminally (§2d).
					if (agentId) selectedAgentId = agentId;
				}
			}
			await requireRunnableActor(db, selectedAgentId);
			const runId = run.id;
			return {
				...common,
				defaultAgentId: selectedAgentId,
				sourceKind: "routine" as const,
				// @lore AU9: sourceId is the routine RUN id, not the routine id — the
				// terminal fact this produces correlates through `routine-lifecycle`'s
				// `WHERE routineRuns.id = sourceId AND outcome='running'`, and a routine
				// fires repeatedly, so its repeatable occasion is the run, not the routine.
				sourceId: runId,
				streamId: `routine:${routine.id}`,
				teamId: routine.teamId,
				taskId: null,
				sourceCorrelation: { routineId: routine.id, routineRunId: runId, teamId: routine.teamId },
			};
		}
		case "bet_decomposition": {
			const bet = await work.getBetById(db, intent.sourceId);
			if (bet?.status !== "active" || bet.decompositionStatus !== "running")
				throw new InvalidAgentWorkSourceError("Bet decomposition is no longer eligible");
			const [membership] = await db
				.select({
					id: teamMembers.id,
					members: teamMembers.members,
					leadAgentId: teamMembers.leadAgentId,
				})
				.from(teamMembers)
				.where(eq(teamMembers.teamId, bet.teamId))
				.limit(1);
			const memberIds = membership?.members
				? (JSON.parse(membership.members) as unknown[]).filter(
						(memberId): memberId is string => typeof memberId === "string",
					)
				: [];
			const persistedMemberIds = membership ? await listUsersByTeam(db, membership.id) : [];
			const candidates = await Promise.all(
				[
					...new Set([
						...(membership?.leadAgentId ? [membership.leadAgentId] : []),
						...memberIds,
						...persistedMemberIds.map((member) => member.id),
					]),
				].map(async (id) => {
					return getUserById(db, id);
				}),
			);
			const runnableCandidates = candidates.filter(
				(candidate): candidate is NonNullable<typeof candidate> =>
					candidate?.kind === "ai" && candidate.status === "active",
			);
			const targetAgentId =
				runnableCandidates.find((candidate) => candidate.role === "product_manager")?.id ??
				runnableCandidates[0]?.id;
			if (!targetAgentId)
				throw new InvalidAgentWorkSourceError("Bet decomposition has no runnable target");
			await requireRunnableActor(db, targetAgentId);
			return {
				...common,
				defaultAgentId: targetAgentId,
				sourceKind: "decomposition" as const,
				sourceId: bet.id,
				streamId: `bet:${bet.id}:decomposition`,
				teamId: bet.teamId,
				sourceCorrelation: {
					betId: bet.id,
					teamId: bet.teamId,
					decomposerAgentId: targetAgentId,
				},
			};
		}
		case "reengagement": {
			const [row] = await db
				.select({ call: proposedCalls, grant: tailoredGrants })
				.from(proposedCalls)
				.innerJoin(tailoredGrants, eq(tailoredGrants.proposedCallId, proposedCalls.id))
				.where(eq(proposedCalls.id, intent.sourceId))
				.limit(1);
			if (row?.call.status !== "granted")
				throw new InvalidAgentWorkSourceError("Proposed call grant is not eligible");
			await requireRunnableActor(db, row.grant.agentScope);
			const task = await work.getTaskById(db, row.grant.taskScope);
			if (!task) throw new InvalidAgentWorkSourceError("Proposed call task is unavailable");
			return {
				...common,
				defaultAgentId: row.grant.agentScope,
				sourceKind: "proposed_call" as const,
				sourceId: row.call.id,
				streamId: `task:${task.id}`,
				taskId: task.id,
				teamId: task.teamId,
				sourceCorrelation: {
					taskId: task.id,
					proposedCallId: row.call.id,
					grantedAgentId: row.grant.agentScope,
				},
			};
		}
		default:
			throw new InvalidAgentWorkSourceError(`Unknown intent kind ${intent.kind}`);
	}
}

/**
 * @lore AU9 R1: the single intent claim/reclaim writer. `drainAgentWorkIntents`
 * is the only caller. Selects one candidate (pending, or claimed-but-expired),
 * then CASes it claimed with a predicate that includes every value the SELECT
 * observed. The expired branch's predicate is the load-bearing fix: the prior
 * weak `claim()` CASed on `id + status='claimed'` only — since a reclaim never
 * changes the row's status away from "claimed", two concurrent reclaimers both
 * matched that predicate and both won. Including the *observed* `claimToken` +
 * `claimExpiresAt` means the first winner's UPDATE changes those columns, so the
 * second reclaimer's WHERE no longer matches and its UPDATE affects zero rows.
 */
export async function claimAgentWorkIntent(
	db: HyperIdleDb,
	input: { readonly now: Date; readonly leaseMs: number; readonly workerId: string },
): Promise<Intent | null> {
	const nowIso = input.now.toISOString();
	const [candidate] = await db
		.select()
		.from(agentWorkIntents)
		.where(
			or(
				eq(agentWorkIntents.status, "pending"),
				and(eq(agentWorkIntents.status, "claimed"), lt(agentWorkIntents.claimExpiresAt, nowIso)),
			),
		)
		.orderBy(asc(agentWorkIntents.createdAt))
		.limit(1);
	if (!candidate) return null;
	const token = randomUUID();
	const expires = new Date(input.now.getTime() + input.leaseMs).toISOString();
	const predicate =
		candidate.status === "pending"
			? and(
					eq(agentWorkIntents.id, candidate.id),
					eq(agentWorkIntents.status, "pending"),
					eq(agentWorkIntents.updatedAt, candidate.updatedAt),
				)
			: and(
					eq(agentWorkIntents.id, candidate.id),
					eq(agentWorkIntents.status, "claimed"),
					eq(agentWorkIntents.claimToken, candidate.claimToken ?? ""),
					eq(agentWorkIntents.claimExpiresAt, candidate.claimExpiresAt ?? ""),
					lt(agentWorkIntents.claimExpiresAt, nowIso),
				);
	const [claimed] = await db
		.update(agentWorkIntents)
		.set({
			status: "claimed",
			claimToken: token,
			claimExpiresAt: expires,
			attempts: candidate.attempts + 1,
			updatedAt: nowIso,
		})
		.where(predicate)
		.returning();
	return claimed ?? null;
}

export async function renewAgentWorkIntentLease(
	db: HyperIdleDb,
	input: {
		readonly id: string;
		readonly claimToken: string;
		readonly now: Date;
		readonly leaseMs: number;
	},
): Promise<boolean> {
	const rows = await db
		.update(agentWorkIntents)
		.set({ claimExpiresAt: new Date(input.now.getTime() + input.leaseMs).toISOString() })
		.where(
			and(
				eq(agentWorkIntents.id, input.id),
				eq(agentWorkIntents.status, "claimed"),
				eq(agentWorkIntents.claimToken, input.claimToken),
			),
		)
		.returning({ id: agentWorkIntents.id });
	return rows.length === 1;
}

export const reconcileAgentWorkIntents = drainAgentWorkIntents;

async function failOrRelease(
	db: HyperIdleDb,
	intent: Intent,
	error: unknown,
	options: AgentWorkIntentWorkerOptions,
) {
	if (!intent.claimToken) throw new Error(`Claimed intent ${intent.id} has no claim token`);
	const now = (options.now ?? (() => new Date()))();
	const terminal =
		error instanceof InvalidAgentWorkSourceError ||
		intent.attempts >= (options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
	const delay = Math.min(1_000 * 2 ** Math.max(0, intent.attempts - 1), MAX_BACKOFF_MS);
	// @lore AU9 durable-rows: status='failed' requires a stable last_error_code —
	// the closed AGENT_WORK_INTENT_FAILURE_CODES union, never the raw error class.
	const lastErrorCode = terminal
		? error instanceof InvalidAgentWorkSourceError
			? "INVALID_WORK_SOURCE"
			: "MAX_ATTEMPTS_EXCEEDED"
		: null;
	await db
		.update(agentWorkIntents)
		.set({
			status: terminal ? "failed" : "pending",
			claimToken: null,
			claimExpiresAt: null,
			lastError: error instanceof Error ? error.message : String(error),
			lastErrorCode,
			updatedAt: terminal ? now.toISOString() : new Date(now.getTime() + delay).toISOString(),
		})
		.where(
			and(eq(agentWorkIntents.id, intent.id), eq(agentWorkIntents.claimToken, intent.claimToken)),
		);

	// AU15 §4c (W3): a routine_run intent that goes terminal `failed` here is a
	// PRE-hand-off failure — no request/session ever existed, so no lifecycle
	// fact fires and `projectRoutine` never runs. Without this, the run stays
	// `running` forever with no session for the AF6 reaper to key on, and the
	// unified fire-time coalescing guard (AU15 §4a) bricks the routine
	// permanently. `updateRoutineRunIfRunning` is a `WHERE outcome='running'`
	// no-op if the run is already terminal, so this is race-safe against a
	// concurrent `projectRoutine` finalize (post-hand-off intents are
	// `handed_off` and never re-enter `failOrRelease`, so this never touches
	// the legitimate retryable-defer path).
	if (terminal && intent.kind === "routine_run") {
		await routineService.updateRoutineRunIfRunning(db, intent.sourceId, {
			outcome: "error",
			endedAt: now.toISOString(),
			errorMessage: lastErrorCode,
		});
	}
}

export async function drainAgentWorkIntents(
	db: HyperIdleDb,
	options: AgentWorkIntentWorkerOptions = {},
): Promise<void> {
	for (;;) {
		const now = (options.now ?? (() => new Date()))();
		const intent = await claimAgentWorkIntent(db, {
			now,
			leaseMs: options.leaseMs ?? DEFAULT_LEASE_MS,
			workerId: "drain",
		});
		if (!intent) return;
		if (!intent.claimToken) throw new Error(`Claimed intent ${intent.id} has no claim token`);
		const claimToken = intent.claimToken;
		try {
			const input = await resolveAuthoritativeInput(db, intent);
			await db.transaction(async (tx) => {
				const { request } = await createTriggeredAgentSessionRequest(
					tx,
					input as AgentSessionRequestInput &
						Parameters<typeof createTriggeredAgentSessionRequest>[1],
					triggerResolutionDeps,
				);
				const checkpoint = await tx
					.update(agentWorkIntents)
					.set({
						status: "handed_off",
						requestId: request.id,
						claimToken: null,
						claimExpiresAt: null,
						lastError: null,
						updatedAt: (options.now ?? (() => new Date()))().toISOString(),
					})
					.where(
						and(eq(agentWorkIntents.id, intent.id), eq(agentWorkIntents.claimToken, claimToken)),
					)
					.returning({ id: agentWorkIntents.id });
				if (checkpoint.length !== 1) throw new Error(`Lost intent custody ${intent.id}`);
			});
		} catch (error) {
			await failOrRelease(db, intent, error, options);
		}
	}
}
