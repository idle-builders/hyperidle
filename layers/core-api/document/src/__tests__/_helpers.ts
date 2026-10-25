/**
 * Shared setup for the document module's integration tests — one `docValues`,
 * one set of row seeders, one `writeDeps`, reused across every suite here
 * instead of each file keeping its own copy.
 */
import {
	changes,
	documents,
	type HyperIdleDb,
	subscriptions,
	tasks,
	teams,
	threads,
	type User,
	users,
	userTeams,
	type WriteExecutor,
} from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import { and, eq } from "drizzle-orm";
import type { Action, ActionContext } from "../action-types.js";
import type { DocumentActionsDeps } from "../document-actions.js";

type Insertable = typeof documents.$inferInsert;

/** Sensible defaults for a document row; every field is overridable. */
export function docValues(overrides: Partial<Insertable> & { id: string }): Insertable {
	const ts = "2026-01-01T00:00:00.000Z";
	return {
		scopeKind: "factory",
		scopeId: null,
		title: "Untitled",
		body: "body",
		format: "markdown",
		status: "active",
		slot: "ordinary",
		parentKind: null,
		parentId: null,
		position: 0,
		updatedBy: "seed",
		createdAt: ts,
		updatedAt: ts,
		...overrides,
	};
}

/** A user row; `teamId` puts them in that team. */
export async function seedUser(
	db: HyperIdleDb,
	id: string,
	{ teamId, ...overrides }: Partial<typeof users.$inferInsert> & { teamId?: string } = {},
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "human",
		name: id,
		role: "member",
		status: "active",
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	});
	if (teamId !== undefined) await db.insert(userTeams).values({ userId: id, teamId });
}

/** A user row with every team they are in, read off the real tables. */
export async function readUserWithTeams(
	exec: WriteExecutor,
	id: string,
): Promise<(User & { teamIds: string[] }) | undefined> {
	const [row] = await exec.select().from(users).where(eq(users.id, id)).limit(1);
	if (!row) return undefined;
	const memberships = await exec.select().from(userTeams).where(eq(userTeams.userId, id));
	return { ...row, teamIds: memberships.map((m) => m.teamId) };
}

export async function seedTeam(db: HyperIdleDb, id: string, name = id): Promise<void> {
	await db.insert(teams).values({
		id,
		name,
		createdAt: "2026-01-01T00:00:00.000Z",
	});
}

export async function seedThread(
	db: HyperIdleDb,
	id: string,
	overrides: Partial<typeof threads.$inferInsert> & { hostId: string; initiatorId: string },
): Promise<void> {
	const ts = "2026-01-01T00:00:00.000Z";
	await db.insert(threads).values({
		id,
		hostKind: "team",
		participants: "[]",
		lastActiveAt: ts,
		createdAt: ts,
		...overrides,
	});
}

export async function seedTask(
	db: HyperIdleDb,
	id: string,
	overrides: Partial<typeof tasks.$inferInsert> & { teamId: string; threadId: string },
): Promise<void> {
	const ts = "2026-01-01T00:00:00.000Z";
	await db.insert(tasks).values({
		id,
		title: id,
		state: "proposed",
		createdAt: ts,
		updatedAt: ts,
		...overrides,
	});
}

export function ctxFor(
	db: HyperIdleDb,
	actor: string,
	opts: { now?: string; caller?: ActionContext["caller"]; internal?: boolean } = {},
): ActionContext {
	return {
		actor,
		db,
		eventBus: new EventBus(),
		now: opts.now ?? "2026-06-01T00:00:00.000Z",
		...(opts.caller ? { caller: opts.caller } : {}),
		...(opts.internal ? { internal: true } : {}),
	};
}

export function actionFor<I, O>(actions: readonly Action[], name: string): Action<I, O> {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`no "${name}" action in the bag`);
	return found as unknown as Action<I, O>;
}

export interface DepsOptions {
	readonly openParent?: DocumentActionsDeps["openParent"];
	readonly systemParentExists?: DocumentActionsDeps["systemParentExists"];
	readonly onBodyChanged?: DocumentActionsDeps["onBodyChanged"];
	readonly wsPush?: DocumentActionsDeps["wsPush"];
}

/** Real queries against the real `users`/`teams`/`changes` tables — never a
 * stub of the visibility predicate or the change log itself. `openParent` is
 * the one genuinely external crossing (a sibling module's action) and is
 * faked per test. */
export function writeDeps(opts: DepsOptions = {}): DocumentActionsDeps {
	return {
		changes: {
			appendChange: async (exec: WriteExecutor, row) => {
				await exec.insert(changes).values(row).returning();
			},
		},
		users: {
			getUserById: readUserWithTeams,
			listOwnedBy: (exec: WriteExecutor, ownerId: string) => {
				return exec.select().from(users).where(eq(users.ownerUserId, ownerId));
			},
		},
		org: {
			getTeam: async (exec: WriteExecutor, q: { id: string }) => {
				const [row] = await exec.select().from(teams).where(eq(teams.id, q.id)).limit(1);
				return row;
			},
		},
		openParent:
			opts.openParent ??
			(() => {
				throw new Error("openParent not stubbed for this test");
			}),
		systemParentExists:
			opts.systemParentExists ??
			(() => {
				throw new Error("systemParentExists not stubbed for this test");
			}),
		onBodyChanged:
			opts.onBodyChanged ??
			(async () => {
				// no-op stub: tests that don't assert on body-changed side effects
			}),
		followersOf: async (exec: WriteExecutor, documentId: string) =>
			(
				await exec
					.select({ userId: subscriptions.userId })
					.from(subscriptions)
					.where(eq(subscriptions.objectId, documentId))
			).map((r) => r.userId),
		...(opts.wsPush ? { wsPush: opts.wsPush } : {}),
	};
}

/** A genuinely DB-querying `openParent` — real `SELECT`s against the real
 * `tasks`/`threads` tables through the `ctx.db` handle the action is given,
 * the same shape `compose.ts`'s `buildOpenParent` wires in production. Unlike
 * the canned stubs most tests use, this reproduces the outer-`ctx.db` hang if
 * `edit_document` ever calls it from inside its own open transaction again. */
export function realOpenParent(): DocumentActionsDeps["openParent"] {
	return async (ctx, kind, id) => {
		if (kind === "task") {
			const [row] = await ctx.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
			return row ? { exists: true, teamId: row.teamId } : { exists: false };
		}
		const [row] = await ctx.db.select().from(threads).where(eq(threads.id, id)).limit(1);
		return row ? { exists: true } : { exists: false };
	};
}

export async function readRow(db: HyperIdleDb, id: string) {
	const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
	return row;
}

export function readChanges(db: HyperIdleDb, objectId: string) {
	return db
		.select()
		.from(changes)
		.where(and(eq(changes.object, "document"), eq(changes.objectId, objectId)));
}
