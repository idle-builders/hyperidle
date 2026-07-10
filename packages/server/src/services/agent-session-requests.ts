import { randomUUID } from "node:crypto";
import {
	type AgentSessionRequest,
	agentSessionRequests,
	type HyperIdleDb,
	triggerResolutionHistory,
} from "@hyperidle/db";
import {
	type AgentSessionRequestInput,
	type AgentSessionRequestStatus,
	agentSessionRequestInputSchema,
} from "@hyperidle/shared";
import { and, asc, eq, lt, or } from "drizzle-orm";

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
	const expires = new Date(options.now.getTime() + options.leaseMs).toISOString();
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

	const updated = await db
		.update(agentSessionRequests)
		.set({
			status: "claimed",
			claimedBy: workerId,
			claimedAt: now,
			claimExpiresAt: expires,
			updatedAt: now,
		})
		.where(
			and(
				eq(agentSessionRequests.id, candidate.id),
				or(
					eq(agentSessionRequests.status, "pending"),
					and(
						eq(agentSessionRequests.status, "claimed"),
						lt(agentSessionRequests.claimExpiresAt, now),
					),
				),
			),
		)
		.returning();
	return updated[0] ? rowToRequest(updated[0]) : null;
}

export async function claimAgentSessionRequestById(
	db: HyperIdleDb,
	requestId: string,
	workerId: string,
	options: ClaimRequestOptions,
): Promise<AgentSessionRequest | null> {
	const now = options.now.toISOString();
	const expires = new Date(options.now.getTime() + options.leaseMs).toISOString();
	const updated = await db
		.update(agentSessionRequests)
		.set({
			status: "claimed",
			claimedBy: workerId,
			claimedAt: now,
			claimExpiresAt: expires,
			updatedAt: now,
		})
		.where(
			and(
				eq(agentSessionRequests.id, requestId),
				or(
					eq(agentSessionRequests.status, "pending"),
					and(
						eq(agentSessionRequests.status, "claimed"),
						lt(agentSessionRequests.claimExpiresAt, now),
					),
				),
			),
		)
		.returning();
	return updated[0] ? rowToRequest(updated[0]) : null;
}

export async function markRequestRunning(
	db: HyperIdleDb,
	requestId: string,
	sessionId: string,
): Promise<void> {
	await db
		.update(agentSessionRequests)
		.set({
			status: "running",
			sessionId,
			updatedAt: nowIso(),
		})
		.where(eq(agentSessionRequests.id, requestId));
	await db
		.update(triggerResolutionHistory)
		.set({ sessionId })
		.where(eq(triggerResolutionHistory.requestId, requestId));
}

export async function releaseRequestClaim(db: HyperIdleDb, requestId: string): Promise<void> {
	await db
		.update(agentSessionRequests)
		.set({
			status: "pending",
			claimedBy: null,
			claimedAt: null,
			claimExpiresAt: null,
			updatedAt: nowIso(),
		})
		.where(eq(agentSessionRequests.id, requestId));
}

export async function markRequestTerminal(
	db: HyperIdleDb,
	requestId: string,
	status: Extract<AgentSessionRequestStatus, "completed" | "failed" | "cancelled">,
	error?: { code?: string; message?: string },
): Promise<void> {
	await db
		.update(agentSessionRequests)
		.set({
			status,
			errorCode: error?.code ?? null,
			errorMessage: error?.message ?? null,
			updatedAt: nowIso(),
		})
		.where(eq(agentSessionRequests.id, requestId));
}
