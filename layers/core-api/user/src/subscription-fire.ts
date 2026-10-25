import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type {
	AgentWorkIntentRecorderFn,
	ChangeRow,
	PersonReason,
	Problem,
} from "@hyperidle/domain-model";
import { OBJECT_EVENTS } from "@hyperidle/domain-model";
import type { EventBus, ObjectChangeEvent } from "@hyperidle/event-bus";
import type { ActionContext, SearchDocumentsRunFn } from "./action-types.js";
import { AgentNotRunnableError } from "./runnable-agent.js";
import type { SubscriptionWakeDeps } from "./subscription-wake.js";
import { resolveSubscriptionWakeRequest } from "./subscription-wake.js";
import { insertInboxRow, insertSubscription, listSubscriptions } from "./subscriptions-store.js";
import { findUser, type UserWithTeams } from "./user-store.js";

const logger = createLogger({ pkg: "user.subscription-fire" });

/** Structural mirror of `@hyperidle/task`'s `TaskListItem`, narrowed to what reach needs. */
interface TaskReachRow {
	readonly id: string;
	readonly teamId: string;
	readonly ownerAgentId: string | null;
	readonly startedBy: string | null;
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
	| {
			readonly ok: true;
			readonly data: readonly { readonly id: string; readonly members: readonly string[] }[];
	  }
	| { readonly ok: false; readonly problems: readonly Problem[] }
>;

export interface SubscriptionFireDeps extends SubscriptionWakeDeps {
	readonly agentWorkIntentRecorder: AgentWorkIntentRecorderFn;
	/** Reach for a `task.*` event — called once per subscriber, as that subscriber. */
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

/** A user's teams, or "every team" for a factory-wide user in none. */
function teamsOf(user: UserWithTeams): ReadonlySet<string> | "all" {
	return user.teamIds.length > 0 ? new Set(user.teamIds) : "all";
}

/**
 * Whether `subscriber` reaches the changed object — the same rule
 * `search_*` itself applies, never `open_*`.
 */
async function reaches(
	db: HyperIdleDb,
	eventBus: EventBus,
	subscriber: UserWithTeams,
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
		const teams = teamsOf(subscriber);
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
	if (row.teamIds.length === 0) return false;
	const teams = teamsOf(subscriber);
	return teams === "all" || row.teamIds.some((teamId) => teams.has(teamId));
}

async function wakeAgent(
	db: HyperIdleDb,
	eventBus: EventBus,
	sub: { readonly id: string; readonly event: string | null; readonly schedule: string | null },
	agent: UserWithTeams,
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
	person: UserWithTeams,
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

/** What a change says about one message or one task, read without trusting its shape. */
function field(row: Record<string, unknown> | null, key: string): unknown {
	return row === null ? undefined : row[key];
}

/**
 * The people a change concerns, each with the reason: a review raised for them (named, or anyone
 * in the thread but its sender), a mention of them, or a task they started ending done or stuck.
 */
async function concerned(
	db: HyperIdleDb,
	eventBus: EventBus,
	change: ChangeRow,
	deps: Pick<SubscriptionFireDeps, "searchTasks" | "searchThreads">,
): Promise<Array<readonly [PersonReason, string]>> {
	const ctx = actionContextFor(db, eventBus, change.actor, change.at);
	if (change.object === "thread" && change.kind === "message" && change.before === null) {
		const type = field(change.after, "type");
		const payload = field(change.after, "payload") as Record<string, unknown> | undefined;
		if (type === "review") {
			const reviewer = payload?.reviewer;
			if (typeof reviewer === "string") return [["review.raised_for_me", reviewer]];
			const found = await deps.searchThreads(ctx, { ids: [change.objectId] });
			const members = found.ok ? (found.data[0]?.members ?? []) : [];
			return members.map((id) => ["review.raised_for_me", id] as const);
		}
		if (type === "plain" && Array.isArray(payload?.refs)) {
			return (payload.refs as Array<{ kind?: unknown; identityId?: unknown }>).flatMap((ref) =>
				ref.kind === "mention" && typeof ref.identityId === "string"
					? [["mention.of_me", ref.identityId] as const]
					: [],
			);
		}
		return [];
	}
	if (change.object === "task" && change.kind === "changed") {
		const state = field(change.after, "state");
		if ((state !== "done" && state !== "blocked") || field(change.before, "state") === state)
			return [];
		const found = await deps.searchTasks(ctx, { ids: [change.objectId] });
		const startedBy = found.ok ? found.data[0]?.startedBy : null;
		return startedBy ? [["started.done_or_stuck", startedBy]] : [];
	}
	return [];
}

/** A person's reasons: each one the change concerns tells them, once. */
async function tellPeople(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: ObjectChangeEvent,
	deps: SubscriptionFireDeps,
): Promise<void> {
	const change = event.change;
	for (const [reason, userId] of await concerned(db, eventBus, change, deps)) {
		if (userId === change.actor) continue;
		const [sub] = await listSubscriptions(db, { userId, event: reason, paused: false });
		if (!sub || sub.createdAt >= change.at) continue;
		const person = await findUser(db, { id: userId });
		if (person?.kind !== "human") continue;
		if (!(await reaches(db, eventBus, person, change, deps))) continue;
		await notifyPerson(db, person, change, deps.wsPush);
	}
}

async function fireForEvent(
	db: HyperIdleDb,
	eventBus: EventBus,
	event: ObjectChangeEvent,
	deps: SubscriptionFireDeps,
): Promise<void> {
	const change = event.change;
	await tellPeople(db, eventBus, event, deps);
	const subs = await listSubscriptions(db, { event: event.type, paused: false });
	if (subs.length === 0) return;
	const woke = new Set(event.woke ?? []);
	// @lore: subscription filter — createdAt < change.at blocks self-wake on agent.created; woke set prevents double-wake when change already started this agent
	const candidates = subs.filter(
		(s) =>
			s.userId !== change.actor &&
			!woke.has(s.userId) &&
			s.createdAt < change.at &&
			(s.objectId === null || s.objectId === change.objectId),
	);
	for (const sub of candidates) {
		const subscriber = await findUser(db, { id: sub.userId });
		if (!subscriber) continue;
		const reached = await reaches(db, eventBus, subscriber, change, deps);
		if (!reached) continue;
		if (subscriber.kind === "ai") {
			await wakeAgent(db, eventBus, sub, subscriber, change, deps);
		} else if (sub.objectId === null || (await hearsFollows(db, subscriber.id))) {
			await notifyPerson(db, subscriber, change, deps.wsPush);
		}
	}
}

/** A person hears what they follow only while "Something I follow changes" is on. */
async function hearsFollows(db: HyperIdleDb, userId: string): Promise<boolean> {
	const on = await listSubscriptions(db, { userId, event: "followed.changed", paused: false });
	return on.length > 0;
}

/** A person follows the task they start, so what happens to it reaches them. */
async function followWhatTheyStart(db: HyperIdleDb, event: ObjectChangeEvent): Promise<void> {
	const change = event.change;
	const starter = await findUser(db, { id: change.actor });
	if (starter?.kind !== "human") return;
	await insertSubscription(db, {
		id: crypto.randomUUID(),
		userId: starter.id,
		event: "task.changed",
		objectId: change.objectId,
		schedule: null,
		paused: false,
		nextRunAt: null,
		createdAt: change.at,
		updatedAt: change.at,
	});
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
	unsubscribers.push(
		eventBus.on("task.created", (event) => {
			void followWhatTheyStart(db, event).catch((error) => {
				logger.error("follow on start failed", {
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
