import type { EventBus, SessionEndedEvent, SessionStartedEvent } from "@hyperidle/event-bus";

type Push = (topic: string, envelope: unknown) => void;

/**
 * An agent starting or stopping work for a message in a conversation nudges `thread:<id>`, so the
 * conversation can show that it is working. A session sent by a task says so on the task instead.
 */
export function registerThreadSessionLiveUpdates(eventBus: EventBus, push: Push): () => void {
	const nudge = (event: SessionStartedEvent | SessionEndedEvent): void => {
		const threadId = (event.sourceCorrelation as { threadId?: unknown } | undefined)?.threadId;
		if (typeof threadId !== "string") return;
		const topic = `thread:${threadId}`;
		push(topic, {
			type: "update",
			topic,
			kind: event.type,
			data: { sessionId: event.sessionId, agentId: event.agentId },
		});
	};
	const unsubscribers = [
		eventBus.on("session_started", nudge),
		eventBus.on("session_ended", nudge),
	];
	return () => {
		for (const unsubscribe of unsubscribers) unsubscribe();
	};
}
