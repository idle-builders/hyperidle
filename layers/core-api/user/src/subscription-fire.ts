/**
 * `registerSubscriptionFire` — the nine object events wake the subscriptions
 * written against them. Architecture.md §4/§0.13.
 *
 * Registered in `app.ts` beside the dependency watcher, post commit, over
 * the SAME `ObjectChangeEvent`s `task`/`thread`/`document`/`user` already
 * emit once per appended `changes` row (architecture.md §3) — this module
 * adds no new event, no new table write on the object side, and does its
 * own DB work in a `void` async handler exactly like `dependency-watcher`'s
 * own `eventBus.on("task.changed", ...)` registration in `app.ts` (PGlite's
 * one connection is free once the emitting module's own transaction has
 * committed).
 *
 * Per event: `listSubscriptions({event, paused:false})`, minus the change's
 * own actor (never self-wake). For each remaining subscriber, reach is
 * computed the same way `search_*` itself would answer — `search_tasks`/
 * `search_threads`/`search_documents` (the last two called AS the
 * subscriber, so a subscriber's reach never bumps `readCount`, and never
 * `open_*`) — then an agent is woken through the intent door a mention
 * uses, a person gets an inbox row and a `user:<id>` nudge.
 */
import type { HyperIdleDb, User } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { AgentWorkIntentRecorderFn, ChangeRow, Problem } from "@hyperidle/domain-model";
import { OBJECT_EVENTS } from "@hyperidle/domain-model";
import type { EventBus, ObjectChangeEvent } from "@hyperidle/event-bus";
import type { ActionContext, SearchDocumentsRunFn } from "./action-types.js";
import { AgentNotRunnableError } from "./runnable-agent.js";
import type { SubscriptionWakeDeps } from "./subscription-wake.js";
import { resolveSubscriptionWakeRequest } from "./subscription-wake.js";
import { insertInboxRow, listSubscriptions } from "./subscriptions-store.js";
import { findUser } from "./user-store.js";

const logger = createLogger({ pkg: "user.subscription-fire" });

/** Structural mirror of `@hyperidle/task`'s `TaskListItem`, narrowed to what reach needs. */
interface TaskReachRow {
	readonly id: string;
	readonly teamId: string;
	readonly ownerAgentId: string | null;
}

/** `search_tasks({ids})`, structurally — `@hyperidle/user` may not import `@hyperidle/task`. */
export type SearchTasksReachFn = (
	ctx: ActionContext,
	input: { readonly ids: readonly string[] },
) => Promise<
	| { readonly ok: true; readonly data: readonly TaskReachRow[] }
	| { readonly ok: false; readonly problems: readonly Problem[] }
>;

/** `search_threads({ids})` run AS the subscriber — existence alone answers reach. */
export type SearchThreadsReachFn = (
	ctx: ActionContext,
	input: { readonly ids: readonly string[] },
) => Promise<
	| { readonly ok: true; readonly data: readonly { readonly id: string }[] }
	| { readonly ok: false; readonly problems: readonly Problem[] }
>;

export interface SubscriptionFireDeps extends SubscriptionWakeDeps {
	readonly agentWorkIntentRecorder: AgentWorkIntentRecorderFn;
	/** Reach for a `task.*` event — called once per event, never per subscriber. */
	readonly searchTasks: SearchTasksReachFn;
	/** Reach for a `thread.*` event — called once per subscriber, as that subscriber. */
	readonly searchThreads: SearchThreadsReachFn;
	/** Reach for a `document.*` event — same shape as `searchDocuments` above, called as the subscriber. */
	readonly searchDocuments: SearchDocumentsRunFn;
	/** The WS nudge for a person's inbox row. Absent → no push (no WS wired). */
	readonly wsPush?: (topic: string, envelope: unknown) => void;
}

function actionContextFor(
	db: HyperIdleDb,
	eventBus: EventBus,
	actor: string,
	now: string,
): ActionContext {
	return { actor, db, eventBus, now, internal: true };
}

/** Own team, else the owner's, else "every team" (a factory-wide user, F2). */
async function teamsOf(db: HyperIdleDb, user: User): Promise<ReadonlySet<string> | "all"> {
	if (user.teamId) return new Set([user.teamId]);
	if (user.ownerUserId) {
		const owner = await findUser(db, { id: user.ownerUserId });
		if (owner?.teamId) return new Set([owner.teamId]);
	}
	return "all";
}

/** The changed row's own effective team — own, else its owner's, else `null`. */
async function effectiveTeamIdOf(db: HyperIdleDb, user: User): Promise<string | null> {
	if (user.teamId) return user.teamId;
	if (user.ownerUserId) {
		const owner = await findUser(db, { id: user.ownerUserId });
		if (owner?.teamId) return owner.teamId;
	}
	return null;
}

/**
 * Whether `subscriber` reaches the changed object — the same rule
 * `search_*` itself applies, never `open_*` (architecture.md §4 step 2).
 */
async function reaches(
	db: HyperIdleDb,
	eventBus: EventBus,
	subscriber: User,
	change: ChangeRow,
	deps: Pick<SubscriptionFireDeps, "searchTasks" | "searchThreads" | "searchDocuments">,
): Promise<boolean> {
	const now = new Date().toISOString();
	if (change.object === "task") {
		const result = await deps.searchTasks(actionContextFor(db, eventBus, subscriber.id, now), {
			ids: [change.objectId],
		});
		const row = result.ok ? result.data[0] : undefined;
		if (!row) return false;
		if (row.ownerAgentId === subscriber.id) return true;
		const teams = await teamsOf(db, subscriber);
		return teams === "all" || teams.has(row.teamId);
	}
	if (change.object === "thread") {
		const result = await deps.searchThreads(actionContextFor(db, eventBus, subscriber.id, now), {
			ids: [change.objectId],
		});
		return result.ok && result.data.length > 0;
	}
	if (change.object === "document") {
		const result = await deps.searchDocuments(actionContextFor(db, eventBus, subscriber.id, now), {
			ids: [change.objectId],
		});
		return result.ok && result.data.length > 0;
	}
	// change.object === "user"
	const row = await findUser(db, { id: change.objectId });
	if (!row) return false;
	if (row.id === subscriber.id || row.ownerUserId === subscriber.id) return true;
	const rowTeamId = await effectiveTeamIdOf(db, row);
	if (rowTeamId === null) return false;
	const teams = await teamsOf(db, subscriber);
	return teams === "all" || teams.has(rowTeamId);
}

async function wakeAgent(
	db: HyperIdleDb,
	eventBus: EventBus,
	sub: { readonly id: string; readonly event: string | null; readonly schedule: string | null },
	agent: User,
	change: ChangeRow,
	deps: SubscriptionFireDeps,
): Promise<void> {
	const sourceId = `${sub.id}:${change.id}`;
	try {
		const bakedRequest = await resolveSubscriptionWakeRequest(
			actionContextFor(db, eventBus, change.actor, new Date().toISOString()),
			{
				subscription: { id: sub.id, event: sub.event, schedule: sub.schedule },
				agentId: agent.id,
				change,
				sourceId,
			},
			deps,
		);
		await deps.agentWorkIntentRecorder({
			kind: "subscription_run",
			sourceKind: "subscription",
			sourceId,
			requestedBy: change.actor,
			idempotencyKey: `subscription:${sub.id}:${change.id}`,
			bakedRequest,
		});
	} catch (error) {
		// A bake failure (e.g. a deactivated agent) drops that one wake — the
		// change stays committed and the other subscribers are unaffected —
		// but the drop must be LOGGED, never silent (thread-actions.ts's mention
		// wake idiom).
		logger.error("subscription wake failed", {
			subscriptionId: sub.id,
			agentId: agent.id,
			changeId: change.id,
			error:
				error instanceof AgentNotRunnableError
					? error.message
					: error instanceof Error
						? error.message
						: String(error),
		});
	}
}

async function notifyPerson(
	db: HyperIdleDb,
	person: User,
	change: ChangeRow,
	wsPush: SubscriptionFireDeps["wsPush"],
): Promise<void> {
	const inserted = await insertInboxRow(db, {
		userId: person.id,
		changeId: change.id,
		seenAt: null,
		readAt: null,
	});
	if (inserted && wsPush) {
		wsPush(`user:${person.id}`, {
			type: "update",
			topic: `user:${person.id}`,
			kind: "inbox",
			data: { changeId: change.id },
		});
	}
}

async function fireForEvent(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: ObjectChangeEvent,
	deps: SubscriptionFireDeps,
): Promise<void> {
	const change = event.change;
	const subs = await listSubscriptions(db, { event: event.type, paused: false });
	if (subs.length === 0) return;
	const candidates = subs.filter((s) => s.userId !== change.actor);
	for (const sub of candidates) {
		const subscriber = await findUser(db, { id: sub.userId });
		if (!subscriber) continue;
		const reached = await reaches(db, eventBus, subscriber, change, deps);
		if (!reached) continue;
		if (subscriber.kind === "ai") {
			await wakeAgent(db, eventBus, sub, subscriber, change, deps);
		} else {
			await notifyPerson(db, subscriber, change, deps.wsPush);
		}
	}
}

/** Unsubscribe every registered listener — the app's own disposer shape. */
export type SubscriptionFireDisposer = () => void;

/**
 * Register the fire mechanism on the nine object events. Mirrors
 * `app.ts`'s own dependency-watcher registration: one `eventBus.on` per
 * event type, a `void` async handler, errors logged and never thrown back
 * onto the emitting module's own commit path.
 */
export function registerSubscriptionFire(
	db: HyperIdleDb,
	eventBus: EventBus,
	deps: SubscriptionFireDeps,
): SubscriptionFireDisposer {
	const unsubscribers = OBJECT_EVENTS.map((eventType) =>
		eventBus.on(eventType, (event) => {
			void fireForEvent(db, eventBus, event, deps).catch((error) => {
				logger.error("subscription fire failed", {
					eventType,
					changeId: event.change.id,
					error: error instanceof Error ? error.message : String(error),
				});
			});
		}),
	);
	return () => {
		for (const unsubscribe of unsubscribers) unsubscribe();
	};
}
