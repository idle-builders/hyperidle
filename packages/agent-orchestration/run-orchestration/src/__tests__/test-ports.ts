/**
 * Test-only `RunOrchestrationPorts` builder for this package's own unit
 * tests. `sessionRequests` wires to REAL `@hyperidle/session-requests`
 * exports (same-layer, real target — Mechanism C exempts `__tests__/` from
 * source-import scanning, but these tests want REAL durable-write behavior
 * to assert against, not a stub). `sessionLifecycle`'s
 * `transitionAgentRunLifecycle` is reproduced directly against
 * `@hyperidle/session-requests`'s own `transitionSessionRequest` (the
 * same durable write `session-lifecycle.ts`'s real implementation ultimately
 * delegates to) — these tests never set a termination reason, so the
 * termination-reason-precedence branch `session-lifecycle.ts`'s real
 * implementation adds on top is never exercised either way.
 * `sessionProvisioner`/`dispatch`/`crashSession`/`requestAgentTermination`/
 * `recoverRequestedTerminations` are `vi.fn()` stubs — overridden per test
 * where behavior matters (matching the pre-move tests' own
 * `vi.mock("../session-provisioning.js")` stand-in for the same harness-
 * execution edge).
 *
 * @lore AU20 Ag3b: `findAgentSessionRequestById`, `findAgentWorkIntentSourceByRequestId`,
 * `isAgentSessionRequestClaimActive`, `markRequestRunning`, and
 * `terminalizeAgentSessionRequest` are no longer barrel-exported. Replaced by
 * `findSessionRequest` + `transitionSessionRequest`. `testMarkRequestRunning`
 * and `testTerminalize` updated to call the new unified API; the `{state}` field
 * in `testTerminalize`'s callers becomes `{to}`.
 */
import type { AgentSessionRequest, HyperIdleDb } from "@hyperidle/db";
import {
	claimAgentSessionRequestById,
	claimNextAgentSessionRequest,
	findSessionRequest,
	listAgentSessionRequestsBySource,
	listRunningAgentSessionRequests,
	releaseRequestClaim,
	renewAgentSessionRequestLease,
	type SessionRequestTerminalTransition,
	transitionSessionRequest,
} from "@hyperidle/session-requests";
import type { EventBus } from "@hyperidle/shared";
import { vi } from "vitest";
import type {
	RunOrchestrationPorts,
	RunOrchestrationSessionLifecycleRuntime,
	RunOrchestrationSessionRequestsPort,
} from "../ports.js";

const noopLifecycleInboxWriter = {
	insertIfAbsent: async () => {
		/* no-op */
	},
};
const noopTriggerHistoryWriter = {
	recordSessionForResolutionHistory: async () => {
		/* no-op */
	},
};

/** `transitionSessionRequest({to:'running',...})` with a no-op trigger-history writer. */
export function testMarkRequestRunning(
	db: HyperIdleDb,
	requestId: string,
	sessionId: string,
	claimToken?: string,
): Promise<void> {
	return transitionSessionRequest(
		db,
		{ to: "running", requestId, sessionId, claimToken },
		{ triggerHistory: noopTriggerHistoryWriter },
	);
}

/** `transitionSessionRequest` terminal with a no-op lifecycle-inbox writer. */
export function testTerminalize(
	db: HyperIdleDb,
	input: SessionRequestTerminalTransition,
): Promise<AgentSessionRequest | null> {
	return transitionSessionRequest(db, input, { lifecycleInbox: noopLifecycleInboxWriter });
}

const realSessionRequestsPort: RunOrchestrationSessionRequestsPort = {
	findAgentSessionRequestById: (db, id) => findSessionRequest(db, { by: "id", requestId: id }),
	listAgentSessionRequestsBySource,
	listRunningAgentSessionRequests,
	isAgentSessionRequestClaimActive: (db, input) =>
		findSessionRequest(db, {
			by: "claimActive",
			requestId: input.requestId,
			claimToken: input.claimToken,
			now: input.now,
		}),
	claimNextAgentSessionRequest,
	claimAgentSessionRequestById,
	releaseRequestClaim,
	renewAgentSessionRequestLease,
	markRequestRunning: testMarkRequestRunning,
	findAgentWorkIntentSourceByRequestId: (db, requestId) =>
		findSessionRequest(db, { by: "intentSource", requestId }),
	drainAgentWorkIntents: vi.fn(async () => {
		/* no-op */
	}),
	reapTerminalAgentWorkIntents: vi.fn(async () => ({
		inbox: 0,
		intents: 0,
		explicitStarts: 0,
		taskAttempts: 0,
	})),
	findExplicitSessionStartById: (db, id) =>
		findSessionRequest(db, { by: "explicitStart", startId: id }),
	markExplicitSessionStartAdmitted: vi.fn(async () => {
		/* no-op */
	}),
	markExplicitSessionStartFailed: vi.fn(async () => {
		/* no-op */
	}),
};

const realSessionLifecyclePort: RunOrchestrationSessionLifecycleRuntime = {
	requestAgentTermination: vi.fn(async () => "accepted" as const),
	recoverRequestedTerminations: vi.fn(async () => 0),
	async transitionAgentRunLifecycle(
		db: HyperIdleDb,
		eventBus: EventBus,
		input: {
			readonly requestId: string;
			readonly state: "completed" | "failed" | "cancelled";
			readonly sessionId?: string;
			readonly claimToken?: string;
			readonly failureCode?: string;
			readonly errorMessage?: string;
		},
	): Promise<void> {
		const row = input.sessionId
			? await testTerminalize(db, {
					requestId: input.requestId,
					precondition: "running",
					sessionId: input.sessionId,
					to: input.state,
					failureCode: input.failureCode,
					errorMessage: input.errorMessage,
				})
			: await testTerminalize(db, {
					requestId: input.requestId,
					precondition: "claimed",
					claimToken: input.claimToken ?? "",
					to: "failed",
					failureCode: input.failureCode,
					errorMessage: input.errorMessage,
				});
		if (!row) throw new Error(`Unknown agent request ${input.requestId}`);
		eventBus.emit({
			type: "agent_run_lifecycle_changed",
			streamId: row.streamId,
			requestId: row.id,
			sourceKind: row.sourceKind as never,
			sourceId: row.sourceId,
			state: row.status as "completed" | "failed" | "cancelled",
			sessionId: row.sessionId ?? undefined,
			timestamp: Date.now(),
		});
	},
	crashSession: vi.fn(async () => {
		/* no-op */
	}),
};

export function buildTestPorts(): RunOrchestrationPorts {
	return {
		sessionRequests: realSessionRequestsPort,
		sessionLifecycle: realSessionLifecyclePort,
		sessionProvisioner: {
			admitSession: vi.fn(),
			runSession: vi.fn(),
		},
		dispatch: {
			executeAssistantRequest: vi.fn(async () => {
				/* no-op */
			}),
		},
	};
}
