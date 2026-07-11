import type { AgentSessionRequest, HyperIdleDb } from "@hyperidle/db";
import { agentSessionRequests } from "@hyperidle/db";
import type { AgentSessionRequestStatus, AgentSessionSourceKind } from "@hyperidle/shared";
import { and, asc, eq } from "drizzle-orm";
import {
	type ConsumeAgentSessionRequestOptions,
	consumeAgentSessionRequest,
	recoverRunningAgentSessionRequests,
} from "./agent-session-runtime.js";
import type { ProvisionSessionDeps, ProvisionSessionResult } from "./session-provisioning.js";

/** @lore AU6 boundary: the composition root reaches recovery only through this file. */
export { recoverRunningAgentSessionRequests };

export type AgentRunLifecycleState = "requested" | "running" | "completed" | "failed" | "cancelled";

export interface AgentRunLifecycle {
	readonly requestId: string;
	readonly sourceKind: AgentSessionSourceKind;
	readonly sourceId: string;
	readonly streamId: string;
	readonly agentId: string;
	readonly sessionId: string | null;
	readonly state: AgentRunLifecycleState;
	readonly error: { readonly code: string | null; readonly message: string | null } | null;
}

function requestStatusToLifecycleState(status: AgentSessionRequestStatus): AgentRunLifecycleState {
	switch (status) {
		case "pending":
		case "claimed":
			return "requested";
		case "running":
			return "running";
		case "completed":
			return "completed";
		case "failed":
			return "failed";
		case "cancelled":
			return "cancelled";
	}
}

function rowToLifecycle(row: AgentSessionRequest): AgentRunLifecycle {
	const state = requestStatusToLifecycleState(row.status as AgentSessionRequestStatus);
	return {
		requestId: row.id,
		sourceKind: row.sourceKind as AgentSessionSourceKind,
		sourceId: row.sourceId,
		streamId: row.streamId,
		agentId: row.agentId,
		sessionId: row.sessionId,
		state,
		error:
			state === "failed"
				? {
						code: row.errorCode,
						message: row.errorMessage,
					}
				: null,
	};
}

export function executeAgentRunRequest(
	deps: ProvisionSessionDeps,
	request: AgentSessionRequest,
	options: ConsumeAgentSessionRequestOptions,
): Promise<ProvisionSessionResult> {
	return consumeAgentSessionRequest(deps, request, options);
}

export async function getAgentRunLifecycle(
	db: HyperIdleDb,
	requestId: string,
): Promise<AgentRunLifecycle | null> {
	const [row] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.id, requestId))
		.limit(1);
	return row ? rowToLifecycle(row) : null;
}

export async function listAgentRunLifecycleBySource(
	db: HyperIdleDb,
	sourceKind: AgentSessionSourceKind,
	sourceId: string,
): Promise<AgentRunLifecycle[]> {
	const rows = await db
		.select()
		.from(agentSessionRequests)
		.where(
			and(
				eq(agentSessionRequests.sourceKind, sourceKind),
				eq(agentSessionRequests.sourceId, sourceId),
			),
		)
		.orderBy(asc(agentSessionRequests.createdAt), asc(agentSessionRequests.id));
	return rows.map(rowToLifecycle);
}
