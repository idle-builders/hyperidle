/**
 * `registerSubscriptionFire` — architecture.md §4/§0.13. Real PGlite via the
 * `{ db }` fixture, a real `EventBus()` (this package has no `{db,eventBus}`
 * fixture of its own — the same precedent this package's own
 * `user-actions.integration.test.ts` already set), and the REAL
 * `@hyperidle/document` action list for document reach (never a stub of the
 * integration point under test — reach itself). Task/thread reach reads the
 * seeded rows directly and applies the same exported pure predicate
 * (`canReadThread`) the real `search_threads` action applies — this package
 * may not import `@hyperidle/task`/`@hyperidle/thread` in production, so the
 * fire module's own `searchTasks`/`searchThreads` deps are hand-typed doors;
 * this test wires them the same shape `app.ts` does, minus the action-list
 * ceremony neither package's own test suite is what's under test here.
 */
import {
	type Change,
	changes,
	documents,
	type HyperIdleDb,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { createDocumentActions, type DocumentActionsDeps } from "@hyperidle/document";
import { canReadThread, type HostKind } from "@hyperidle/domain-model";
import { EventBus, objectEvent } from "@hyperidle/event-bus";
import { eq, inArray } from "drizzle-orm";
import type { Action } from "../action-types.js";
import { registerSubscriptionFire, type SubscriptionFireDeps } from "../subscription-fire.js";
import { insertSubscription, listInboxRows } from "../subscriptions-store.js";

const TS = "2026-01-01T00:00:00.000Z";

async function seedTeam(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(teams).values({ id, name: id, createdAt: TS });
}

async function seedUser(
	db: HyperIdleDb,
	id: string,
	overrides: Partial<typeof users.$inferInsert> = {},
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "human",
		name: id,
		role: "member",
		status: "active",
		createdAt: TS,
		...overrides,
	});
}

/** A task needs a real thread (`tasks.thread_id` is `NOT NULL`). */
async function seedTaskWithThread(
	db: HyperIdleDb,
	id: string,
	teamId: string,
	ownerAgentId: string | null,
): Promise<void> {
	const threadId = `${id}-thread`;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "u-founder",
		participants: JSON.stringify([]),
		lastActiveAt: TS,
		createdAt: TS,
	});
	await db.insert(tasks).values({
		id,
		teamId,
		ownerAgentId,
		title: id,
		state: "in_progress",
		threadId,
		createdAt: TS,
		updatedAt: TS,
	});
}

async function insertChangeRow(
	db: HyperIdleDb,
	id: string,
	object: "task" | "thread" | "document" | "user",
	objectId: string,
	actor: string,
): Promise<Change> {
	const [row] = await db
		.insert(changes)
		.values({ id, object, objectId, kind: "changed", actor, before: null, after: "{}", at: TS })
		.returning();
	if (!row) throw new Error("insertChangeRow: insert returned no row");
	return row;
}

/** Real document actions, raw-drizzle wired — the same idiom
 * `user-actions.integration.test.ts`'s own `realDocumentActions()` uses. */
function realDocumentActions(): readonly Action[] {
	const deps: DocumentActionsDeps = {
		changes: {
			appendChange: async (exec, row) => {
				await exec.insert(changes).values(row);
			},
		},
		users: {
			getUserById: async (exec, id) => {
				const [row] = await exec.select().from(users).where(eq(users.id, id)).limit(1);
				return row;
			},
			listOwnedBy: async (exec, ownerId) =>
				exec.select().from(users).where(eq(users.ownerUserId, ownerId)),
		},
		org: {
			getTeam: async (exec, q) => {
				const [row] = await exec.select().from(teams).where(eq(teams.id, q.id)).limit(1);
				return row;
			},
		},
		openParent: () => {
			throw new Error("subscription-fire test: openParent is unreachable");
		},
		systemParentExists: async () => false,
		onBodyChanged: async () => undefined,
	};
	return createDocumentActions(deps) as readonly Action[];
}

/** Structural doors `app.ts` binds through `runnerFor` on the real action
 * list — here, `search_documents`'s own runner extracted the same way, plus
 * a raw drizzle read (task) or a real-predicate read (thread). */
function buildDeps(
	db: HyperIdleDb,
	overrides: Partial<SubscriptionFireDeps> = {},
): SubscriptionFireDeps {
	const documentActions = realDocumentActions();
	const searchDocumentsAction = documentActions.find(
		(a) => a.declaration.name === "search_documents",
	);
	if (!searchDocumentsAction) throw new Error('no "search_documents" action in the bag');
	const searchDocuments =
		searchDocumentsAction.run as import("../action-types.js").SearchDocumentsRunFn;
	return {
		agentWorkIntentRecorder: async (input) => ({
			id: "intent-noop",
			idempotencyKey: input.idempotencyKey,
		}),
		searchTasks: async (_ctx, input) => {
			const rows = await db
				.select({ id: tasks.id, teamId: tasks.teamId, ownerAgentId: tasks.ownerAgentId })
				.from(tasks)
				.where(inArray(tasks.id, Array.from(input.ids)));
			return { ok: true, data: rows };
		},
		searchThreads: async (ctx, input) => {
			const rows = await db
				.select()
				.from(threads)
				.where(inArray(threads.id, Array.from(input.ids)));
			const readable = rows.filter((r) =>
				canReadThread(ctx.actor, {
					hostKind: r.hostKind as HostKind,
					members: JSON.parse(r.participants) as string[],
				}),
			);
			return { ok: true, data: readable.map((r) => ({ id: r.id })) };
		},
		searchDocuments,
		...overrides,
	};
}

function fire(db: HyperIdleDb, eventBus: EventBus, deps: SubscriptionFireDeps): () => void {
	return registerSubscriptionFire(db, eventBus, deps);
}

describe("registerSubscriptionFire — task reach (team rule)", () => {
	test("task.changed in team A wakes the A-team agent, not the B-team agent", async ({ db }) => {
		const eventBus = new EventBus();
		await seedTeam(db, "team-a");
		await seedTeam(db, "team-b");
		await seedUser(db, "actor", { teamId: "team-a" });
		await seedUser(db, "agent-a", { kind: "ai", teamId: "team-a", status: "active" });
		await seedUser(db, "agent-b", { kind: "ai", teamId: "team-b", status: "active" });
		await seedTaskWithThread(db, "task-1", "team-a", null);
		await insertSubscription(db, {
			id: "sub-a",
			userId: "agent-a",
			event: "task.changed",
			schedule: null,
			paused: false,
			nextRunAt: null,
			createdAt: TS,
			updatedAt: TS,
		});
		await insertSubscription(db, {
			id: "sub-b",
			userId: "agent-b",
			event: "task.changed",
			schedule: null,
			paused: false,
			nextRunAt: null,
			createdAt: TS,
			updatedAt: TS,
		});
		const calls: string[] = [];
		const deps = buildDeps(db, {
			agentWorkIntentRecorder: async (input) => {
				calls.push((input as { readonly requestedBy?: string }).requestedBy ?? "");
				if (input.kind === "subscription_run") calls.push(`woke:${input.sourceId}`);
				return { id: "intent-1", idempotencyKey: input.idempotencyKey };
			},
		});
		const unsub = fire(db, eventBus, deps);
		try {
			const change = await insertChangeRow(db, "c1", "task", "task-1", "actor");
			eventBus.emit(objectEvent(change));
			await new Promise((r) => setTimeout(r, 50));
		} finally {
			unsub();
		}
		expect(calls).toContain("woke:sub-a:c1");
		expect(calls).not.toContain("woke:sub-b:c1");
	});

	test("a factory-wide agent (no team, no owner) hears a task change in either team", async ({
		db,
	}) => {
		const eventBus = new EventBus();
		await seedTeam(db, "team-a");
		await seedUser(db, "actor", { teamId: "team-a" });
		await seedUser(db, "librarian", { kind: "ai", status: "active" });
		await seedTaskWithThread(db, "task-2", "team-a", null);
		await insertSubscription(db, {
			id: "sub-lib",
			userId: "librarian",
			event: "task.changed",
			schedule: null,
			paused: false,
			nextRunAt: null,
			createdAt: TS,
			updatedAt: TS,
		});
		const woken: string[] = [];
		const deps = buildDeps(db, {
			agentWorkIntentRecorder: async (input) => {
				if (input.kind === "subscription_run") woken.push(input.sourceId);
				return { id: "intent-1", idempotencyKey: input.idempotencyKey };
			},
		});
		const unsub = fire(db, eventBus, deps);
		try {
			const change = await insertChangeRow(db, "c2", "task", "task-2", "actor");
			eventBus.emit(objectEvent(change));
			await new Promise((r) => setTimeout(r, 50));
		} finally {
			unsub();
		}
		expect(woken).toContain("sub-lib:c2");
	});

	test("never wakes the subscriber that made the change itself", async ({ db }) => {
		const eventBus = new EventBus();
		await seedTeam(db, "team-a");
		await seedUser(db, "agent-a", { kind: "ai", teamId: "team-a", status: "active" });
		await seedTaskWithThread(db, "task-3", "team-a", null);
		await insertSubscription(db, {
			id: "sub-self",
			userId: "agent-a",
			event: "task.changed",
			schedule: null,
			paused: false,
			nextRunAt: null,
			createdAt: TS,
			updatedAt: TS,
		});
		const woken: string[] = [];
		const deps = buildDeps(db, {
			agentWorkIntentRecorder: async (input) => {
				if (input.kind === "subscription_run") woken.push(input.sourceId);
				return { id: "intent-1", idempotencyKey: input.idempotencyKey };
			},
		});
		const unsub = fire(db, eventBus, deps);
		try {
			const change = await insertChangeRow(db, "c3", "task", "task-3", "agent-a");
			eventBus.emit(objectEvent(change));
			await new Promise((r) => setTimeout(r, 50));
		} finally {
			unsub();
		}
		expect(woken).toHaveLength(0);
	});

	test("a paused subscription never wakes", async ({ db }) => {
		const eventBus = new EventBus();
		await seedTeam(db, "team-a");
		await seedUser(db, "actor", { teamId: "team-a" });
		await seedUser(db, "agent-a", { kind: "ai", teamId: "team-a", status: "active" });
		await seedTaskWithThread(db, "task-4", "team-a", null);
		await insertSubscription(db, {
			id: "sub-paused",
			userId: "agent-a",
			event: "task.changed",
			schedule: null,
			paused: true,
			nextRunAt: null,
			createdAt: TS,
			updatedAt: TS,
		});
		const woken: string[] = [];
		const deps = buildDeps(db, {
			agentWorkIntentRecorder: async (input) => {
				if (input.kind === "subscription_run") woken.push(input.sourceId);
				return { id: "intent-1", idempotencyKey: input.idempotencyKey };
			},
		});
		const unsub = fire(db, eventBus, deps);
		try {
			const change = await insertChangeRow(db, "c4", "task", "task-4", "actor");
			eventBus.emit(objectEvent(change));
			await new Promise((r) => setTimeout(r, 50));
		} finally {
			unsub();
		}
		expect(woken).toHaveLength(0);
	});
});

describe("registerSubscriptionFire — a person subscriber", () => {
	test("gets one inbox row and one user:<id> nudge", async ({ db }) => {
		const eventBus = new EventBus();
		await seedTeam(db, "team-a");
		await seedUser(db, "actor", { teamId: "team-a" });
		await seedUser(db, "person", { teamId: "team-a" });
		await seedTaskWithThread(db, "task-5", "team-a", null);
		await insertSubscription(db, {
			id: "sub-person",
			userId: "person",
			event: "task.changed",
			schedule: null,
			paused: false,
			nextRunAt: null,
			createdAt: TS,
			updatedAt: TS,
		});
		const pushes: Array<{ topic: string; envelope: unknown }> = [];
		const deps = buildDeps(db, {
			wsPush: (topic, envelope) => {
				pushes.push({ topic, envelope });
			},
		});
		const unsub = fire(db, eventBus, deps);
		try {
			const change = await insertChangeRow(db, "c5", "task", "task-5", "actor");
			eventBus.emit(objectEvent(change));
			await new Promise((r) => setTimeout(r, 50));
		} finally {
			unsub();
		}
		const rows = await listInboxRows(db, { userId: "person" });
		expect(rows).toHaveLength(1);
		expect(rows[0]?.changeId).toBe("c5");
		expect(pushes).toHaveLength(1);
		expect(pushes[0]?.topic).toBe("user:person");
	});
});

describe("registerSubscriptionFire — document reach", () => {
	test("a subscriber's reach through search_documents does not bump readCount", async ({ db }) => {
		const eventBus = new EventBus();
		await seedTeam(db, "team-a");
		await seedUser(db, "actor", { teamId: "team-a" });
		await seedUser(db, "agent-a", { kind: "ai", teamId: "team-a", status: "active" });
		await db.insert(documents).values({
			id: "doc-1",
			scopeKind: "team",
			scopeId: "team-a",
			title: "Doc",
			body: "Body",
			format: "markdown",
			status: "active",
			readCount: 0,
			updatedBy: "actor",
			createdAt: TS,
			updatedAt: TS,
		});
		await insertSubscription(db, {
			id: "sub-doc",
			userId: "agent-a",
			event: "document.changed",
			schedule: null,
			paused: false,
			nextRunAt: null,
			createdAt: TS,
			updatedAt: TS,
		});
		const woken: string[] = [];
		const deps = buildDeps(db, {
			agentWorkIntentRecorder: async (input) => {
				if (input.kind === "subscription_run") woken.push(input.sourceId);
				return { id: "intent-1", idempotencyKey: input.idempotencyKey };
			},
		});
		const unsub = fire(db, eventBus, deps);
		try {
			const change = await insertChangeRow(db, "c6", "document", "doc-1", "actor");
			eventBus.emit(objectEvent(change));
			await new Promise((r) => setTimeout(r, 50));
		} finally {
			unsub();
		}
		expect(woken).toContain("sub-doc:c6");
		const [row] = await db.select().from(documents).where(eq(documents.id, "doc-1"));
		expect(row?.readCount).toBe(0);
	});
});
