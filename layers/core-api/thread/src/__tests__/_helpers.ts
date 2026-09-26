/**
 * Shared setup for the thread module's integration tests — row seeders,
 * `ctxFor`/`actionFor`, and `threadDeps`, reused across the suites here
 * instead of each file keeping its own copy. Mirrors
 * `document/src/__tests__/_helpers.ts`'s own shape: real queries against the
 * real tables for every port thread-actions.ts owns the shape of, fakes only
 * for the ports that reach a sibling module thread never depends on
 * directly (`searchDocuments`, the two agent-orchestration recorders, the
 * review-gate link) — those effects belong to the layer that composes
 * thread with that module, not to this one.
 */
import {
	changes,
	type HyperIdleDb,
	type NewChange,
	tasks,
	teams,
	threads,
	users,
	type WriteExecutor,
} from "@hyperidle/db";
import type { ReviewVerdictOutcome } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import { and, eq, inArray } from "drizzle-orm";
import { vi } from "vitest";
import type { Action } from "../action-types.js";
import type { ThreadActionsDeps } from "../thread-actions.js";

export function ctxFor(
	db: HyperIdleDb,
	actor: string,
	opts: {
		eventBus?: EventBus;
		now?: string;
		caller?: { sessionId: string; taskId: string | null; threadId: string | null };
	} = {},
) {
	return {
		actor,
		db,
		eventBus: opts.eventBus ?? new EventBus(),
		now: opts.now ?? new Date().toISOString(),
		...(opts.caller ? { caller: opts.caller } : {}),
	};
}

export function actionFor<I, O>(actions: readonly Action[], name: string): Action<I, O> {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`no "${name}" action in the bag`);
	return found as unknown as Action<I, O>;
}

/** `changes.actor` FKs to `users` — every seeded team gets this real row. */
export const FOUNDER_ID = "u-founder";

export async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: teamId, name: teamId, createdAt: now });
	await db
		.insert(users)
		.values([
			{
				id: FOUNDER_ID,
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: "system:propagation",
				name: "Propagation System",
				role: "system",
				status: "active",
				createdAt: now,
			},
		])
		.onConflictDoNothing();
}

export async function seedHuman(db: HyperIdleDb, id: string, teamId?: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id,
		kind: "human",
		name: id,
		role: "member",
		status: "active",
		...(teamId ? { teamId } : {}),
		createdAt: now,
	});
}

export async function seedAgent(db: HyperIdleDb, agentId: string, teamId?: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: agentId,
		role: "builder",
		status: "active",
		...(teamId ? { teamId } : {}),
		createdAt: now,
	});
}

export async function seedThreadRow(
	db: HyperIdleDb,
	id: string,
	opts: {
		hostKind: string;
		hostId: string;
		initiatorId: string;
		members: readonly string[];
		resolvedAt?: string | null;
		deletedAt?: string | null;
		title?: string | null;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(threads).values({
		id,
		hostKind: opts.hostKind,
		hostId: opts.hostId,
		initiatorId: opts.initiatorId,
		participants: JSON.stringify(opts.members),
		pinned: false,
		resolvedAt: opts.resolvedAt ?? null,
		deletedAt: opts.deletedAt ?? null,
		title: opts.title ?? null,
		lastActiveAt: now,
		createdAt: now,
	});
}

export async function seedTaskWithThread(
	db: HyperIdleDb,
	taskId: string,
	teamId: string,
	opts?: { ownerAgentId?: string },
): Promise<string> {
	const now = new Date().toISOString();
	const threadId = `thr-${taskId}`;
	await seedThreadRow(db, threadId, {
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		members: opts?.ownerAgentId ? [opts.ownerAgentId] : [],
	});
	await db.insert(tasks).values({
		id: taskId,
		parentTaskId: null,
		teamId,
		title: taskId,
		state: "in_progress",
		threadId,
		ownerAgentId: opts?.ownerAgentId ?? null,
		createdAt: now,
		updatedAt: now,
	});
	return threadId;
}

export async function readThreadMembers(db: HyperIdleDb, id: string): Promise<string[]> {
	const [row] = await db.select().from(threads).where(eq(threads.id, id));
	return row ? (JSON.parse(row.participants) as string[]) : [];
}

export async function readChanges(db: HyperIdleDb, threadId: string) {
	return db.select().from(changes).where(eq(changes.objectId, threadId));
}

/**
 * Real queries against the real `users`/`teams`/`changes` tables — never a
 * stub of the membership/ownership reads thread-actions.ts's own rules
 * branch on. `searchDocuments` is the one genuinely external crossing (the
 * ONE door onto `document`, per thread-actions.ts's own deps comment) and
 * the two recorders/the review-gate link are agent-orchestration's, not
 * thread's — all faked per test via `overrides`.
 */
export function threadDeps(overrides: Partial<ThreadActionsDeps> = {}): ThreadActionsDeps {
	return {
		changes: {
			appendChange: async (exec, row) => {
				await exec.insert(changes).values(row as NewChange);
			},
		},
		users: {
			getUserById: async (exec, id) => (await exec.select().from(users).where(eq(users.id, id)))[0],
			listByIds: async (exec, ids) =>
				ids.length
					? exec
							.select()
							.from(users)
							.where(inArray(users.id, [...ids]))
					: [],
			listByTeamIds: async (exec, teamIds) =>
				teamIds.length
					? exec
							.select()
							.from(users)
							.where(inArray(users.teamId, [...teamIds]))
					: [],
			listOwnedBy: async (exec, ownerId) =>
				exec.select().from(users).where(eq(users.ownerUserId, ownerId)),
			soleHumanForAgent: (exec, agentId) => soleHumanForAgent(exec, agentId),
		},
		searchDocuments: async () => ({ ok: true, data: [] }),
		org: {
			getTeam: async (exec, q) => (await exec.select().from(teams).where(eq(teams.id, q.id)))[0],
		},
		settings: { readServerConfig: async () => ({ harnessDisabled: [] }) },
		agents: {
			requireRunnableAgent: async (db, agentId) => {
				const [row] = await db.select().from(users).where(eq(users.id, agentId));
				if (!row || row.kind !== "ai" || !["active", "idle"].includes(row.status)) {
					throw new Error(`Agent ${agentId} is not a runnable AI agent`);
				}
				return row;
			},
			getAgentIdentity: async () => null,
		},
		agentWorkIntentRecorder: vi.fn(async (input) => ({
			id: "fake",
			idempotencyKey: input.idempotencyKey,
		})),
		reviewVerdictRecorder: vi.fn(
			async (): Promise<ReviewVerdictOutcome> => ({
				status: "not_resumable",
				reason: "fake reviewVerdictRecorder: no agent-orchestration gate in this test",
			}),
		),
		linkReviewToSession: vi.fn(async () => undefined),
		...overrides,
	};
}

/** Team-then-any-human ladder, first by `(createdAt, id)` — mirrors compose.ts's real rule. */
async function soleHumanForAgent(exec: WriteExecutor, agentId: string) {
	const byCreated = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
		a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt);
	const [agent] = await exec.select().from(users).where(eq(users.id, agentId));
	if (agent?.teamId) {
		const teamHumans = await exec
			.select()
			.from(users)
			.where(and(eq(users.kind, "human"), eq(users.teamId, agent.teamId)));
		if (teamHumans.length > 0) return [...teamHumans].sort(byCreated)[0];
	}
	const anyHumans = await exec.select().from(users).where(eq(users.kind, "human"));
	return [...anyHumans].sort(byCreated)[0];
}
