/**
 * Test-only `RunOrchestrationPorts` builder for this package's own unit
 * tests. `sessionRequests` wires to REAL `@hyperidle/session-requests`
 * exports (same-layer, real target — Mechanism C exempts `__tests__/` from
 * source-import scanning, but these tests want REAL durable-write behavior
 * to assert against, not a stub). `sessionLifecycle`'s
 * `transitionAgentRunLifecycle` is reproduced directly against
 * `@hyperidle/session-requests`'s own `transitionSessionRequest` (the
 * same durable write used by the real implementation). These tests never set
 * a termination reason, so precedence behavior is not exercised here.
 * `sessionProvisioner`/`crashSession`/`requestAgentTermination`/
 * `recoverRequestedTerminations` are `vi.fn()` stubs — overridden per test
 * where behavior matters (matching the pre-move tests' own
 * `vi.mock("../session-provisioning.js")` stand-in for the same harness-
 * execution edge).
 *
 * @lore AU20 Ag3b: `findAgentSessionRequestById`, `findAgentWorkIntentSourceByRequestId`,
 * `isAgentSessionRequestClaimActive`, `markRequestRunning`, and
 * `terminalizeAgentSessionRequest` are no longer barrel-exported. Replaced by
 * `findSessionRequest` + `transitionSessionRequest`. `testTerminalize` updated to
 * call the new unified API; the `{state}` field in its callers becomes `{to}`.
 */
import type { AgentSessionRequest, HyperIdleDb } from "@hyperidle/db";
import {
	claimSessionRequest,
	drainIntents,
	findSessionRequest,
	listSessionRequests,
	reapExpired,
	releaseClaim,
	renewClaim,
	transitionSessionRequest,
} from "@hyperidle/session-requests";
import type { AgentSessionSourceKind, EventBus } from "@hyperidle/shared";
import { vi } from "vitest";
import type { RuntimePorts } from "../contracts.js";

type RunOrchestrationPorts = RuntimePorts;
type RunOrchestrationSessionLifecycleRuntime = RuntimePorts["sessionLifecycle"];

/** `transitionSessionRequest` terminal — AU20 B1a: no deps needed (table owned directly). */
export async function testTerminalize(
	db: HyperIdleDb,
	input: Extract<
		Parameters<RunOrchestrationPorts["sessionRequests"]["transitionSessionRequest"]>[1],
		{ readonly precondition: string }
	>,
): Promise<AgentSessionRequest | null> {
	const row = await transitionSessionRequest(db, input);
	return row && typeof row === "object" && "id" in row ? row : null;
}

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
			sourceKind: row.sourceKind as AgentSessionSourceKind,
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
		sessionRequests: {
			claimSessionRequest,
			findSessionRequest,
			listSessionRequests,
			releaseClaim,
			renewClaim,
			transitionSessionRequest: async (exec, transition) => {
				return await transitionSessionRequest(exec, transition);
			},
			drainIntents,
			reapExpired,
		},
		sessionLifecycle: realSessionLifecyclePort,
		sessionProvisioner: {
			admitSession: vi.fn(),
			runSession: vi.fn(),
		},
	};
}
