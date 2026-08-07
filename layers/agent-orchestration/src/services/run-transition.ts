/**
 * AU26 B1a — agent-orchestration's own `transitionRun` binding.
 *
 * `PATCH /api/sessions/:id` moved onto this Layer's app, and it drives the
 * durable request transition. In core-api that call went through
 * `src/services/run-orchestration-composition.ts` — an upward import for a
 * route that now lives here — so the wiring the moved handler needs is
 * composed in-layer instead: `run-orchestration` (the state machine) and
 * `session-requests` (the request store) are both agent-orchestration
 * Services, so wiring one to the other is ordinary within-layer composition,
 * no port and no cross-layer edge.
 *
 * Deliberately narrow: only the `sessionRequests` port `transitionRun` itself
 * declares (`TransitionPorts`). The runtime/provisioner half of core-api's
 * composition root (harness registry, tool provider, dispatch) is not
 * reachable from a route and is not duplicated here.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { transitionRun as transitionRunInternal } from "@hyperidle/run-orchestration";
import {
	findSessionRequest,
	listSessionRequests,
	sessionRunRegistry,
	transitionSessionRequest,
} from "@hyperidle/session-requests";
import type { EventBus } from "@hyperidle/shared";

type TransitionPorts = Parameters<typeof transitionRunInternal>[0]["ports"];

const transitionPorts: TransitionPorts = {
	sessionRequests: {
		findSessionRequest,
		listSessionRequests,
		transitionSessionRequest: async (exec, transition) => {
			const result = await transitionSessionRequest(exec, transition);
			return result === undefined ? undefined : result;
		},
		abortSessionRun: (sessionId) => sessionRunRegistry.abort(sessionId),
		registerSessionRun: (sessionId, control) => sessionRunRegistry.register(sessionId, control),
		deregisterSessionRun: (sessionId) => sessionRunRegistry.deregister(sessionId),
	},
};

export function transitionRun(
	db: HyperIdleDb,
	eventBus: EventBus,
	spec: Parameters<typeof transitionRunInternal>[1],
): ReturnType<typeof transitionRunInternal> {
	return transitionRunInternal({ db, eventBus, ports: transitionPorts }, spec);
}
