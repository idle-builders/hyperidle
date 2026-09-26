/**
 * The session/harness-streaming
 * gateway: forwards `session_started`/`session_ended`/`tool_call_recorded`
 * off the EventBus as a `session:<id>` NUDGE onto the browser's one
 * websocket.
 *
 * @lore AU26 J3 (founder, verbatim): *"core should not know about this
 * session live stuff at all."* That ruling is superseded now — the browser
 * holds ONE socket, owned by core-api, and this gateway is its only writer
 * of session content. What it writes is content-FREE: the envelope
 * `document-actions.ts`'s `pushChanges` already uses,
 * `{type:"update", topic:"session:<id>", kind:"session.activity",
 * data:{sessionId}}` — a signal to re-read, never the event itself. Core
 * still learns nothing about a session beyond "something on this id
 * changed"; this Layer keeps sole ownership of what actually happened.
 * `push` is a bare `(topic, envelope) => void` — never `WsConnectionHub`,
 * which would be an `agent-orchestration -> core-api` edge the composition-
 * edge anti-regrowth guard forbids. `boot.ts` binds it to a thunk the
 * Application supplies, byte-identical to core's own `wsHub.broadcast`
 * binding (`core-api/src/app.ts`).
 *
 * CONFUSION (flagged for reviewer sign-off, carried from the RED phase): the
 * forward stays EventBus-driven — the SAME `session_started`/`session_ended`/
 * `tool_call_recorded` events that also feed the relocated
 * `SessionActivityBuffer` (AU31 §2.7: this Layer's own
 * `session-activity-buffer.js`) — rather than
 * literally re-reading through the buffer's stored entries per event. The
 * buffer's job is serving a point-in-time REST snapshot for a late-joining
 * client (`AgentOrchestrationPort.sessions.getRecentActivity`); this gateway
 * is an independent live tee of the same underlying event stream. Piping the
 * live forward through `buffer.getActivity()` would add a per-event
 * full-buffer re-read for no behavioral gain and would couple two
 * independently useful reads.
 */

import type { EventBus } from "@hyperidle/event-bus";

/**
 * Push a single `{topic, envelope}` frame onto the one websocket. Satisfied
 * by `coreApi.wsHub.broadcast(topic, JSON.stringify(envelope))`, bound once
 * per Application (`create-server.ts`) — this Layer never sees the hub
 * itself, only this narrow function.
 */
export type SessionActivityPush = (topic: string, envelope: unknown) => void;

function sessionTopic(sessionId: string): string {
	return `session:${sessionId}`;
}

/** The content-free nudge every session event collapses to on the wire. */
function activityNudge(sessionId: string): {
	readonly type: "update";
	readonly topic: string;
	readonly kind: "session.activity";
	readonly data: { readonly sessionId: string };
} {
	const topic = sessionTopic(sessionId);
	return { type: "update", topic, kind: "session.activity", data: { sessionId } };
}

/**
 * Subscribes to the three session/harness-streaming event types and pushes a
 * `session:<sessionId>` nudge for each, unchanged in shape across all three.
 * Returns an unregister function that stops all forwarding.
 */
export function registerSessionActivityGateway(
	eventBus: EventBus,
	push: SessionActivityPush,
): () => void {
	const unsubscribers = [
		eventBus.on("session_started", (event) => {
			push(sessionTopic(event.sessionId), activityNudge(event.sessionId));
		}),
		eventBus.on("session_ended", (event) => {
			push(sessionTopic(event.sessionId), activityNudge(event.sessionId));
		}),
		eventBus.on("tool_call_recorded", (event) => {
			push(sessionTopic(event.sessionId), activityNudge(event.sessionId));
		}),
	];

	return (): void => {
		for (const unsub of unsubscribers) {
			unsub();
		}
	};
}
