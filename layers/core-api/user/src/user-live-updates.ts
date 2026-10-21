import type { EventBus, ObjectChangeEvent } from "@hyperidle/event-bus";

type Push = (topic: string, envelope: unknown) => void;

/**
 * Live updates for people's pages: a user made or changed nudges `users` (every list of people)
 * and `user:<id>` (their own page). Clients refetch on a nudge.
 */
export function registerUserLiveUpdates(eventBus: EventBus, push: Push): () => void {
	const nudge = (event: ObjectChangeEvent): void => {
		for (const topic of ["users", `user:${event.change.objectId}`])
			push(topic, {
				type: "update",
				topic,
				kind: event.type,
				data: { id: event.change.id, objectId: event.change.objectId, at: event.change.at },
			});
	};
	const unsubscribers = [eventBus.on("user.created", nudge), eventBus.on("user.changed", nudge)];
	return () => {
		for (const unsubscribe of unsubscribers) unsubscribe();
	};
}
