// Gateway: forwards session events off the EventBus as content-free nudges onto the
// browser's websocket. A start or end nudges `session:<id>` and `task:<id>`. A queued
// request nudges `thread:<id>` so the waiting-line appears without polling.

import type { EventBus } from "@hyperidle/event-bus";

// Push a {topic, envelope} frame onto the websocket — satisfied by wsHub.broadcast(topic, JSON.stringify(envelope)).
export type SessionActivityPush = (topic: string, envelope: unknown) => void;

function queueNudge(streamId: string): {
	readonly type: "update";
	readonly topic: string;
	readonly kind: "session.queue";
	readonly data: { readonly streamId: string };
} {
	return { type: "update", topic: streamId, kind: "session.queue", data: { streamId } };
}

function sessionTopic(sessionId: string): string {
	return `session:${sessionId}`;
}

// The content-free nudge every session event collapses to on the wire.
function activityNudge(
	sessionId: string,
	topic: string = sessionTopic(sessionId),
): {
	readonly type: "update";
	readonly topic: string;
	readonly kind: "session.activity";
	readonly data: { readonly sessionId: string };
} {
	return { type: "update", topic, kind: "session.activity", data: { sessionId } };
}

// Subscribe to session events and push a nudge for each. Returns unregister function.
export function registerSessionActivityGateway(
	eventBus: EventBus,
	push: SessionActivityPush,
): () => void {
	const startOrEnd = (event: { sessionId: string; taskId: string | null }): void => {
		push(sessionTopic(event.sessionId), activityNudge(event.sessionId));
		if (event.taskId) {
			const topic = `task:${event.taskId}`;
			push(topic, activityNudge(event.sessionId, topic));
		}
	};
	const unsubscribers = [
		eventBus.on("session_started", startOrEnd),
		eventBus.on("session_ended", startOrEnd),
		eventBus.on("tool_call_recorded", (event) => {
			push(sessionTopic(event.sessionId), activityNudge(event.sessionId));
		}),
		eventBus.on("session_request_queued", (event) => {
			if (event.streamId.startsWith("thread:")) {
				push(event.streamId, queueNudge(event.streamId));
			}
		}),
	];

	return (): void => {
		for (const unsub of unsubscribers) {
			unsub();
		}
	};
}
