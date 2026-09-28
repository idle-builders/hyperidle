// Gateway: forwards session_started/session_ended/tool_call_recorded off the EventBus
// as a content-free `session:<id>` nudge onto the browser's websocket.

import type { EventBus } from "@hyperidle/event-bus";

// Push a {topic, envelope} frame onto the websocket — satisfied by wsHub.broadcast(topic, JSON.stringify(envelope)).
export type SessionActivityPush = (topic: string, envelope: unknown) => void;

function sessionTopic(sessionId: string): string {
	return `session:${sessionId}`;
}

// The content-free nudge every session event collapses to on the wire.
function activityNudge(sessionId: string): {
	readonly type: "update";
	readonly topic: string;
	readonly kind: "session.activity";
	readonly data: { readonly sessionId: string };
} {
	const topic = sessionTopic(sessionId);
	return { type: "update", topic, kind: "session.activity", data: { sessionId } };
}

// Subscribe to session events and push a nudge for each. Returns unregister function.
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
