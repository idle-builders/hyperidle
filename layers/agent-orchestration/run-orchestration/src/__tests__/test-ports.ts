/**
 * Test-only `RunOrchestrationPorts` builder for this package's own unit
 * tests. `sessionRequests` wires to REAL `@hyperidle/session-requests`
 * exports (same-layer, real target — Mechanism C exempts `__tests__/` from
 * source-import scanning, but these tests want REAL durable-write behavior
 * to assert against, not a stub). `sessionLifecycle.transitionAgentRunLifecycle`
 * calls the package's own real `transitionRun` — never a hand-rewritten
 * duplicate of its logic — so a field this Service's real composition drops
 * (the composition once silently dropped `errorMessage` for months) fails
 * here too, instead of a parallel reimplementation quietly forwarding it
 * while production doesn't.
 * `sessionProvisioner`/`crashSession`/`requestAgentTermination`/
 * `recoverRequestedTerminations` are `vi.fn()` stubs — overridden per test
 * where behavior matters (matching the pre-move tests' own
 * `vi.mock("../session-provisioning.js")` stand-in for the same harness-
 * execution edge).
 */
import type { AgentSessionRequest } from "@hyperidle/db";
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
import { vi } from "vitest";
import type { RuntimePorts } from "../contracts.js";
import { transitionRun } from "../transition-run.js";

type RunOrchestrationSessionLifecycleRuntime = RuntimePorts["sessionLifecycle"];

const realSessionLifecyclePort: RunOrchestrationSessionLifecycleRuntime = {
	requestAgentTermination: vi.fn(async () => "accepted" as const),
	recoverRequestedTerminations: vi.fn(async () => 0),
	async transitionAgentRunLifecycle(db, eventBus, input) {
		await transitionRun(
			{
				db,
				eventBus,
				ports: {
					sessionRequests: {
						findSessionRequest,
						listSessionRequests,
						transitionSessionRequest: async (exec, transition) =>
							(await transitionSessionRequest(exec, transition)) as AgentSessionRequest | null,
						// The live-runtime registry ops (`stopSessionRun`/registration) —
						// `transitionAgentRunLifecycle` never calls these; only the
						// terminalize path above does.
						abortSessionRun: () => {
							throw new Error("abortSessionRun: not exercised by transitionAgentRunLifecycle");
						},
						registerSessionRun: () => undefined,
						deregisterSessionRun: () => undefined,
					},
				},
			},
			{
				target: "request",
				intent: "terminalize",
				requestId: input.requestId,
				state: input.state,
				sessionId: input.sessionId,
				claimToken: input.claimToken,
				failureCode: input.failureCode,
				errorMessage: input.errorMessage,
			},
		);
	},
	crashSession: vi.fn(async () => {
		/* no-op */
	}),
};

export function buildTestPorts(): RuntimePorts {
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
			abortSessionRun: vi.fn(async () => false),
		},
		sessionLifecycle: realSessionLifecyclePort,
		sessionProvisioner: {
			admitSession: vi.fn(),
			runSession: vi.fn(),
		},
	};
}
