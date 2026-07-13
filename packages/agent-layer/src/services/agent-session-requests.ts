import { randomUUID } from "node:crypto";
import {
	type AgentSessionRequest,
	agentLifecycleInbox,
	agentSessionRequests,
	type HyperIdleDb,
	triggerResolutionHistory,
} from "@hyperidle/db";
import {
	type AgentSessionRequestInput,
	type AgentSessionRequestStatus,
	agentSessionRequestInputSchema,
} from "@hyperidle/shared";
import { and, asc, eq, lt, or, sql } from "drizzle-orm";

export interface ClaimRequestOptions {
	readonly now: Date;
	readonly leaseMs: number;
}

function nowIso(): string {
	return new Date().toISOString();
}

function rowToRequest(row: AgentSessionRequest): AgentSessionRequest {
	return row;
}

export async function createAgentSessionRequest(
	db: HyperIdleDb,
	input: AgentSessionRequestInput,
): Promise<AgentSessionRequest> {
	const parsed = agentSessionRequestInputSchema.parse(input) as AgentSessionRequestInput;
	const existing = await db
		.select()
		.from(agentSessionRequests)
		.where(
			and(
				eq(agentSessionRequests.sourceKind, parsed.sourceKind),
				eq(agentSessionRequests.sourceId, parsed.sourceId),
				eq(agentSessionRequests.idempotencyKey, parsed.idempotencyKey),
			),
		)
		.limit(1);
	if (existing[0]) return rowToRequest(existing[0]);

	const ts = nowIso();
	const id = randomUUID();
	const values = {
		id,
		sourceKind: parsed.sourceKind,
		sourceId: parsed.sourceId,
		streamId: parsed.streamId,
		taskId: parsed.taskId ?? null,
		agentId: parsed.agentId,
		teamId: parsed.teamId ?? null,
		userId: parsed.userId ?? null,
		promptMode: parsed.promptMode,
		payloadJson: parsed.payloadJson ?? null,
		sourceCorrelationJson: JSON.stringify(parsed.sourceCorrelation),
		idempotencyKey: parsed.idempotencyKey,
		status: "pending" satisfies AgentSessionRequestStatus,
		createdAt: ts,
		updatedAt: ts,
	};
	const inserted = await db
		.insert(agentSessionRequests)
		.values(values)
		.onConflictDoNothing({
			target: [
				agentSessionRequests.sourceKind,
				agentSessionRequests.sourceId,
				agentSessionRequests.idempotencyKey,
			],
		})
		.returning();
	const insertedRow = inserted[0];
	if (insertedRow) return rowToRequest(insertedRow);

	const [racedExisting] = await db
		.select()
		.from(agentSessionRequests)
		.where(
			and(
				eq(agentSessionRequests.sourceKind, parsed.sourceKind),
				eq(agentSessionRequests.sourceId, parsed.sourceId),
				eq(agentSessionRequests.idempotencyKey, parsed.idempotencyKey),
			),
		)
		.limit(1);
	if (!racedExisting) throw new Error("Failed to create agent session request");
	return rowToRequest(racedExisting);
}

export async function claimNextAgentSessionRequest(
	db: HyperIdleDb,
	workerId: string,
	options: ClaimRequestOptions,
): Promise<AgentSessionRequest | null> {
	const now = options.now.toISOString();
	const candidates = await db
		.select()
		.from(agentSessionRequests)
		.where(
			or(
				eq(agentSessionRequests.status, "pending"),
				and(
					eq(agentSessionRequests.status, "claimed"),
					lt(agentSessionRequests.claimExpiresAt, now),
				),
			),
		)
		.orderBy(asc(agentSessionRequests.createdAt))
		.limit(1);
	const candidate = candidates[0];
	if (!candidate) return null;

	return claimAgentSessionRequestById(db, candidate.id, workerId, options);
}

export async function claimAgentSessionRequestById(
	db: HyperIdleDb,
	requestId: string,
	workerId: string,
	options: ClaimRequestOptions,
): Promise<AgentSessionRequest | null> {
	const now = options.now.toISOString();
	const expires = new Date(options.now.getTime() + options.leaseMs).toISOString();
	const token = randomUUID();
	const [observed] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.id, requestId))
		.limit(1);
	if (!observed) return null;
	const updated = await db
		.update(agentSessionRequests)
		.set({
			status: "claimed",
			claimedBy: workerId,
			claimedAt: now,
			claimExpiresAt: expires,
			claimToken: token,
			updatedAt: now,
		})
		.where(
			and(
				eq(agentSessionRequests.id, requestId),
				observed.status === "pending"
					? and(
							eq(agentSessionRequests.status, "pending"),
							eq(agentSessionRequests.updatedAt, observed.updatedAt),
						)
					: and(
							eq(agentSessionRequests.status, "claimed"),
							eq(agentSessionRequests.claimToken, observed.claimToken ?? ""),
							eq(agentSessionRequests.claimExpiresAt, observed.claimExpiresAt ?? ""),
							lt(agentSessionRequests.claimExpiresAt, now),
						),
			),
		)
		.returning();
	return updated[0] ? rowToRequest(updated[0]) : null;
}

export async function renewAgentSessionRequestLease(
	db: HyperIdleDb,
	input: { requestId: string; claimToken: string; now: Date; leaseMs: number },
): Promise<boolean> {
	const expires = new Date(input.now.getTime() + input.leaseMs).toISOString();
	const renewed = await db
		.update(agentSessionRequests)
		.set({
			claimExpiresAt: expires,
			updatedAt: input.now.toISOString(),
		})
		.where(
			and(
				eq(agentSessionRequests.id, input.requestId),
				eq(agentSessionRequests.status, "claimed"),
				eq(agentSessionRequests.claimToken, input.claimToken),
			),
		)
		.returning({ id: agentSessionRequests.id });
	return renewed.length === 1;
}

export async function markRequestRunning(
	db: HyperIdleDb,
	requestId: string,
	sessionId: string,
	claimToken?: string,
): Promise<void> {
	const predicate = claimToken
		? and(
				eq(agentSessionRequests.id, requestId),
				eq(agentSessionRequests.status, "claimed"),
				eq(agentSessionRequests.claimToken, claimToken),
			)
		: eq(agentSessionRequests.id, requestId);
	const updated = await db
		.update(agentSessionRequests)
		.set({
			status: "running",
			sessionId,
			claimedBy: null,
			claimedAt: null,
			claimToken: null,
			claimExpiresAt: null,
			updatedAt: nowIso(),
		})
		.where(predicate)
		.returning({ id: agentSessionRequests.id });
	if (updated.length !== 1) throw new Error(`Lost request custody before admission: ${requestId}`);
	await db
		.update(triggerResolutionHistory)
		.set({ sessionId })
		.where(eq(triggerResolutionHistory.requestId, requestId));
}

export async function releaseRequestClaim(
	db: HyperIdleDb,
	requestId: string,
	claimToken?: string,
): Promise<void> {
	await db
		.update(agentSessionRequests)
		.set({
			status: "pending",
			claimedBy: null,
			claimedAt: null,
			claimExpiresAt: null,
			updatedAt: nowIso(),
		})
		.where(
			claimToken
				? and(
						eq(agentSessionRequests.id, requestId),
						eq(agentSessionRequests.claimToken, claimToken),
					)
				: eq(agentSessionRequests.id, requestId),
		);
}

/**
 * @lore AU9 R1: the single terminal writer. Every terminal transition — natural
 * completion/failure, detached-runtime failure, PATCH/handoff/shutdown/cost-cap
 * disposition, and running-recovery (post-admission), plus boot-admission-failure
 * and the pre-markRequestRunning synchronous exception (pre-admission) — routes
 * through this one function. A `running`-only CAS would silently no-op (zero rows,
 * no inbox row, lost failure) for the two pre-admission callers, which is exactly
 * the recurring silent-no-op bug this single writer exists to kill — hence the
 * discriminated `precondition` input covers both branches in one place.
 */
export type TerminalizeAgentSessionRequestInput =
	| {
			readonly requestId: string;
			readonly precondition: "running";
			readonly sessionId: string;
			readonly state: Extract<AgentSessionRequestStatus, "completed" | "failed" | "cancelled">;
			readonly failureCode?: string;
			/** Internal diagnostic only — never crosses the public API boundary. */
			readonly errorMessage?: string;
			/** Natural completion only: reject if a termination reason is already stored. */
			readonly requireNoTerminationReason?: boolean;
	  }
	| {
			readonly requestId: string;
			readonly precondition: "claimed";
			readonly claimToken: string;
			readonly state: "failed";
			readonly failureCode?: string;
			/** Internal diagnostic only — never crosses the public API boundary. */
			readonly errorMessage?: string;
	  };

/** Transaction-scoped write; callers already holding a `tx` compose through this. */
export async function terminalizeAgentSessionRequestInTx(
	tx: HyperIdleDb,
	input: TerminalizeAgentSessionRequestInput,
): Promise<AgentSessionRequest | null> {
	const now = nowIso();
	const baseSet = {
		status: input.state,
		errorCode: input.failureCode ?? null,
		errorMessage: input.errorMessage ?? null,
		claimToken: null,
		claimExpiresAt: null,
		claimedBy: null,
		claimedAt: null,
		updatedAt: now,
	};
	const predicate =
		input.precondition === "running"
			? and(
					eq(agentSessionRequests.id, input.requestId),
					eq(agentSessionRequests.status, "running"),
					eq(agentSessionRequests.sessionId, input.sessionId),
					input.requireNoTerminationReason
						? sql`${agentSessionRequests.terminationReason} is null`
						: sql`true`,
				)
			: and(
					eq(agentSessionRequests.id, input.requestId),
					eq(agentSessionRequests.status, "claimed"),
					eq(agentSessionRequests.claimToken, input.claimToken),
				);
	const [winner] = await tx
		.update(agentSessionRequests)
		.set(input.precondition === "running" ? { ...baseSet, sessionId: input.sessionId } : baseSet)
		.where(predicate)
		.returning();
	if (!winner) return null;
	await tx
		.insert(agentLifecycleInbox)
		.values({
			requestId: winner.id,
			sourceKind: winner.sourceKind,
			sourceId: winner.sourceId,
			state: input.state,
			sessionId: input.precondition === "running" ? input.sessionId : null,
			failureCode: input.failureCode ?? null,
			occurredAt: now,
		})
		.onConflictDoNothing();
	return winner;
}

/** Public entrypoint: opens its own transaction around {@link terminalizeAgentSessionRequestInTx}. */
export async function terminalizeAgentSessionRequest(
	db: HyperIdleDb,
	input: TerminalizeAgentSessionRequestInput,
): Promise<AgentSessionRequest | null> {
	return db.transaction((tx) => terminalizeAgentSessionRequestInTx(tx as HyperIdleDb, input));
}
