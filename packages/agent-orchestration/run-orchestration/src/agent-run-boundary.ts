import type { AgentSessionRequest, HyperIdleDb } from "@hyperidle/db";
import type { AgentSessionRequestStatus, AgentSessionSourceKind } from "@hyperidle/shared";
import {
	type ConsumeAgentSessionRequestOptions,
	consumeAgentSessionRequest,
	recoverRunningAgentSessionRequests,
} from "./agent-session-runtime.js";
import type {
	RunOrchestrationPorts,
	RunOrchestrationProvisionDeps,
	RunOrchestrationProvisionResult,
} from "./ports.js";

/**
 * @lore AU19 Increment 3c: real cut-over — moved here from
 * `packages/server/src/services/agent-run-boundary.ts` (behavior-preserving
 * move). `getAgentRunLifecycle`/`listAgentRunLifecycleBySource` raw-read
 * `agentSessionRequests` (`session-requests`-owned) directly pre-migration —
 * converted to `ports.sessionRequests`'s `findAgentSessionRequestById`/
 * `listAgentSessionRequestsBySource` (see `ports.ts`'s top `@lore`).
 */

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
	deps: RunOrchestrationProvisionDeps,
	request: AgentSessionRequest,
	options: ConsumeAgentSessionRequestOptions,
	ports: RunOrchestrationPorts,
): Promise<RunOrchestrationProvisionResult> {
	return consumeAgentSessionRequest(deps, request, options, ports);
}

export async function getAgentRunLifecycle(
	db: HyperIdleDb,
	requestId: string,
	ports: RunOrchestrationPorts,
): Promise<AgentRunLifecycle | null> {
	const row = await ports.sessionRequests.findAgentSessionRequestById(db, requestId);
	return row ? rowToLifecycle(row) : null;
}

export async function listAgentRunLifecycleBySource(
	db: HyperIdleDb,
	sourceKind: AgentSessionSourceKind,
	sourceId: string,
	ports: RunOrchestrationPorts,
): Promise<AgentRunLifecycle[]> {
	const rows = await ports.sessionRequests.listAgentSessionRequestsBySource(
		db,
		sourceKind,
		sourceId,
	);
	return rows.map(rowToLifecycle);
}
