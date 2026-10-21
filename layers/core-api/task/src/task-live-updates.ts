import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { EventBus, ObjectChangeEvent } from "@hyperidle/event-bus";
import { list, listAncestorIds } from "./task-service.js";

const logger = createLogger({ pkg: "task.live-updates" });

type Push = (topic: string, envelope: unknown) => void;

function nudge(push: Push, topic: string, event: ObjectChangeEvent): void {
	push(topic, {
		type: "update",
		topic,
		kind: event.type,
		data: {
			id: event.change.id,
			object: event.change.object,
			objectId: event.change.objectId,
			actor: event.change.actor,
			at: event.change.at,
		},
	});
}

/** The task and every task above it: a change below moves the parents' status counts too. */
async function nudgeChain(
	db: HyperIdleDb,
	push: Push,
	taskId: string,
	event: ObjectChangeEvent,
): Promise<void> {
	for (const id of [taskId, ...(await listAncestorIds(db, taskId))])
		nudge(push, `task:${id}`, event);
}

/**
 * Live updates for Work: a task change nudges `tasks` and the task with everything above it; a
 * message in a task's own thread nudges the same chain, because a question or review there
 * changes the task's need and its parents' open counts. Clients refetch on a nudge.
 */
export function registerTaskLiveUpdates(
	db: HyperIdleDb,
	eventBus: EventBus,
	push: Push,
): () => void {
	const failed = (event: ObjectChangeEvent) => (error: unknown) =>
		logger.error("task nudge failed", { changeId: event.change.id, error: String(error) });
	const onTask = (event: ObjectChangeEvent): void => {
		nudge(push, "tasks", event);
		void nudgeChain(db, push, event.change.objectId, event).catch(failed(event));
	};
	const onThread = (event: ObjectChangeEvent): void => {
		void list(db, "task", { threadId: event.change.objectId })
			.then(async ([host]) => {
				if (host) await nudgeChain(db, push, host.id, event);
			})
			.catch(failed(event));
	};
	const unsubscribers = [
		eventBus.on("task.created", onTask),
		eventBus.on("task.changed", onTask),
		eventBus.on("thread.message", onThread),
		eventBus.on("thread.changed", onThread),
	];
	return () => {
		for (const unsubscribe of unsubscribers) unsubscribe();
	};
}
