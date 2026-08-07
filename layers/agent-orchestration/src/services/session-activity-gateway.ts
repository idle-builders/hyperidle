/**
 * AU21 §6 Decision E / §9 Increment 7 — the (c) session/harness-streaming
 * gateway: forwards `session_started`/`session_ended`/`tool_call_recorded`
 * off the EventBus onto the `session:<id>` WS topic.
 *
 * Relocated OUT of `layers/core-api/realtime/src/ws-broadcaster.ts` (a
 * generic, domain-agnostic WS transport that must not carry any one
 * concern's forwarding logic — see `ws-broadcaster.no-session-forwarding
 * .test.ts`) INTO this core-api Application composition root, representing
 * agent-orchestration's own gateway/router role (architecture.md §6 Decision
 * E: "`agent-orchestration` as the gateway/router when executions are
 * distributed... it routes without owning the stream content"). Mirrors
 * `agent-orchestration-port-composition.ts`'s / `durable-agent-queue.ts`'s
 * existing precedent for where this kind of Application-layer wiring lives.
 *
 * CONFUSION (flagged for reviewer sign-off, carried from the RED phase): the
 * forward stays EventBus-driven — the SAME `session_started`/`session_ended`/
 * `tool_call_recorded` events that also feed the relocated
 * `SessionActivityBuffer` (`@hyperidle/agent-execution`) — rather than
 * literally re-reading through the buffer's stored entries per event. The
 * buffer's job is serving a point-in-time REST snapshot for a late-joining
 * client (`AgentOrchestrationPort.sessions.getRecentActivity`); this gateway
 * is an independent live tee of the same underlying event stream. Piping the
 * live forward through `buffer.getActivity()` would add a per-event
 * full-buffer re-read for no behavioral gain and would couple two
 * independently useful reads.
 */

import type { EventBus } from "@hyperidle/shared";

/**
 * The minimal shape this gateway needs from a broadcast sink.
 *
 * @lore AU26 J3: satisfied by this Layer's OWN `SessionStreamHub` now. It used
 * to be core-api's `WsConnectionHub`, injected by the Application — the tee
 * pointed at a socket another Layer hosted. Founder: *"core should not know
 * about this session live stuff at all."*
 */
export interface SessionActivityBroadcastTarget {
	broadcast(topic: string, data: string): void;
}

/**
 * Subscribes to the three session/harness-streaming event types and forwards
 * each, unchanged, to the `session:<sessionId>` topic on `target`. Returns an
 * unregister function that stops all forwarding.
 */
export function registerSessionActivityGateway(
	eventBus: EventBus,
	target: SessionActivityBroadcastTarget,
): () => void {
	const unsubscribers = [
		eventBus.on("session_started", (event) => {
			target.broadcast(`session:${event.sessionId}`, JSON.stringify(event));
		}),
		eventBus.on("session_ended", (event) => {
			target.broadcast(`session:${event.sessionId}`, JSON.stringify(event));
		}),
		eventBus.on("tool_call_recorded", (event) => {
			target.broadcast(`session:${event.sessionId}`, JSON.stringify(event));
		}),
	];

	return (): void => {
		for (const unsub of unsubscribers) {
			unsub();
		}
	};
}
