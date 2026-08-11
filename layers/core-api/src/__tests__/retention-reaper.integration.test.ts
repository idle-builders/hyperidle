/**
 * AU20 C1 — retention package dissolved. Each TTL sweep is now exercised
 * through its owning service directly (users / notifications / knowledge).
 * The propagation_log reaper calls `reapTerminalPropagationLog` from
 * `@hyperidle/policy`, the service that owns the table.
 *
 * Exact-behavior lock against the former `reapRetentionOnce` integration
 * test (AU19 Increment 2g): same predicates, same cutoffs, same per-table
 * survivor sets — no behavior change.
 *
 * @lore AU21 §9 Increment 10 (Decision H1) — RED. `reapTerminalTaskDispatchAttempts`
 * is relocated OUT of `session-requests`'s `reapExpired` single atomic
 * transaction (`service.ts`, bundled with the intent/start deletes) and INTO
 * this composition root's generic retention reaper (the same sweep that
 * already runs `reapTerminalPropagationLog`/`reapAccessLog`/`reapExpiredCredentials`
 * above), calling `taskDispatchAttemptStore.reapTerminal` directly. Exported
 * from `server-factory.ts` for the SAME reason `reapTerminalPropagationLog` is
 * exported (see that function's own doc comment) — so the predicate is
 * directly testable without waiting on the real 6h `setInterval`. Does NOT
 * yet exist — this import failing to resolve is this file's primary RED
 * signal for the new describe block below.
 */
import {
	bets,
	type HyperIdleDb,
	inviteCodes,
	knowledgeAccessLog,
	knowledgeAppProjection,
	knowledgeItems,
	loginSessions,
	propagationLog,
	taskDispatchAttempts,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { reapAccessLog } from "@hyperidle/knowledge";
import { enqueue, listNotifications, reap } from "@hyperidle/notifications";
import { reapTerminalPropagationLog } from "@hyperidle/policy";
import { reapExpiredCredentials } from "@hyperidle/users";
import { and, eq, inArray, lt } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
// NOT YET CREATED — this import failing to resolve is this file's primary RED
// signal for the "task-dispatch-attempt reaper — relocated home" describe block.
import { reapTerminalTaskDispatchAttempts, TERMINAL_LOG_TTL_MS } from "../service-bootstrap.js";

const now = new Date("2026-07-13T12:00:00.000Z");
const DAY = 86_400_000;
const CONSUMED_INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30-day audit window

async function seedTaskDispatchAttempt(
	db: HyperIdleDb,
	options: {
		readonly id: string;
		readonly status: "requested" | "running" | "completed" | "failed" | "cancelled";
		readonly updatedAt: string;
	},
): Promise<void> {
	const teamId = `${options.id}-team`;
	const betId = `${options.id}-bet`;
	const taskId = `${options.id}-task`;
	const agentId = `${options.id}-agent`;
	await db
		.insert(teams)
		.values({ id: teamId, name: "Team", phase: "build", createdAt: now.toISOString() });
	await db.insert(teamMembers).values({
		id: `${options.id}-tm`,
		teamId,
		capacity: 3,
		activeBets: 0,
		formedAt: now.toISOString(),
	});
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: now.toISOString(),
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "retention-reaper bet",
		status: "active",
		createdAt: now.toISOString(),
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "retention-reaper task",
		state: "in_progress",
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
	});
	await db.insert(taskDispatchAttempts).values({
		id: options.id,
		taskId,
		occasion: "accepted",
		agentId,
		ordinal: 1,
		status: options.status,
		createdAt: now.toISOString(),
		updatedAt: options.updatedAt,
	});
}

async function seedUser(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "human",
		name: id,
		role: "member",
		status: "active",
		createdAt: now.toISOString(),
	});
}

async function seedKnowledgeItem(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(knowledgeItems).values({
		id,
		title: id,
		body: "body",
		format: "markdown",
		status: "active",
		updatedBy: "system",
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
	});
	// The owner writes the projection row alongside the item.
	await db.insert(knowledgeAppProjection).values({ id: `${id}-projection`, knowledgeItemId: id });
}

describe("retention reaper — individual owning-service sweeps", () => {
	test("prunes expired login_sessions, keeps unexpired + un-revoked ones", async ({ db, ids }) => {
		await seedUser(db, ids("u-ls"));
		await db.insert(loginSessions).values([
			{
				id: ids("ls-expired"),
				userId: ids("u-ls"),
				tokenHash: ids("h-expired"),
				expiresAt: new Date(now.getTime() - DAY).toISOString(),
				createdAt: now.toISOString(),
				revokedAt: null,
			},
			{
				id: ids("ls-revoked"),
				userId: ids("u-ls"),
				tokenHash: ids("h-revoked"),
				expiresAt: new Date(now.getTime() + DAY).toISOString(),
				createdAt: now.toISOString(),
				revokedAt: new Date(now.getTime() - DAY).toISOString(),
			},
			{
				id: ids("ls-live"),
				userId: ids("u-ls"),
				tokenHash: ids("h-live"),
				expiresAt: new Date(now.getTime() + DAY).toISOString(),
				createdAt: now.toISOString(),
				revokedAt: null,
			},
		]);

		// expiredGraceMs=0 → cutoff = now (prune any expiresAt < now or revokedAt non-null)
		const expiredCutoff = now.toISOString();
		const reaped = await reapExpiredCredentials(db, {
			sessionCutoff: expiredCutoff,
			inviteExpiredCutoff: expiredCutoff,
			inviteConsumedCutoff: new Date(now.getTime() - CONSUMED_INVITE_TTL_MS).toISOString(),
		});
		// @lore AU38: the sweep is global (TTL predicates over the whole table),
		// so the exact count becomes "at least mine" + per-row proof that MY
		// expired/revoked rows were the ones pruned and MY live row survived.
		expect(reaped.sessions.length).toBeGreaterThanOrEqual(2);
		expect(reaped.sessions).toEqual(expect.arrayContaining([ids("ls-expired"), ids("ls-revoked")]));

		const survivors = await db
			.select()
			.from(loginSessions)
			.where(eq(loginSessions.userId, ids("u-ls")));
		expect(survivors.map((s) => s.id)).toEqual([ids("ls-live")]);
	});

	test("prunes expired-unclaimed and consumed-past-audit-window invite_codes", async ({
		db,
		ids,
	}) => {
		await seedUser(db, ids("u-creator"));
		await seedUser(db, ids("u-claimer"));
		await db.insert(inviteCodes).values([
			{
				id: ids("ic-expired-unclaimed"),
				code: ids("code-expired"),
				createdBy: ids("u-creator"),
				claimedBy: null,
				expiresAt: new Date(now.getTime() - DAY).toISOString(),
				createdAt: new Date(now.getTime() - DAY).toISOString(),
			},
			{
				id: ids("ic-consumed-old"),
				code: ids("code-consumed-old"),
				createdBy: ids("u-creator"),
				claimedBy: ids("u-claimer"),
				expiresAt: new Date(now.getTime() + DAY).toISOString(),
				createdAt: new Date(now.getTime() - 31 * DAY).toISOString(),
			},
			{
				id: ids("ic-consumed-recent"),
				code: ids("code-consumed-recent"),
				createdBy: ids("u-creator"),
				claimedBy: ids("u-claimer"),
				expiresAt: new Date(now.getTime() + DAY).toISOString(),
				createdAt: new Date(now.getTime() - DAY).toISOString(),
			},
			{
				id: ids("ic-live"),
				code: ids("code-live"),
				createdBy: ids("u-creator"),
				claimedBy: null,
				expiresAt: new Date(now.getTime() + DAY).toISOString(),
				createdAt: now.toISOString(),
			},
		]);

		const expiredCutoff = now.toISOString();
		const consumedCutoff = new Date(now.getTime() - CONSUMED_INVITE_TTL_MS).toISOString();
		const reaped = await reapExpiredCredentials(db, {
			sessionCutoff: expiredCutoff,
			inviteExpiredCutoff: expiredCutoff,
			inviteConsumedCutoff: consumedCutoff,
		});
		// Global sweep — "at least mine" + per-row proof (see lore above).
		expect(reaped.invites.length).toBeGreaterThanOrEqual(2);
		expect(reaped.invites).toEqual(
			expect.arrayContaining([ids("ic-expired-unclaimed"), ids("ic-consumed-old")]),
		);

		const survivors = await db
			.select()
			.from(inviteCodes)
			.where(eq(inviteCodes.createdBy, ids("u-creator")));
		expect(new Set(survivors.map((s) => s.id))).toEqual(
			new Set([ids("ic-consumed-recent"), ids("ic-live")]),
		);
	});

	test("prunes terminal notification_queue rows older than the TTL, keeps pending/recent", async ({
		db,
		ids,
	}) => {
		function nqRow(id: string, status: string, createdAt: string) {
			return {
				id,
				eventType: "test",
				subjectId: null,
				severity: "digest" as const,
				title: "t",
				body: null,
				reason: "digest",
				channel: null,
				status,
				attempts: 0,
				createdAt,
			};
		}
		const oldIso = new Date(now.getTime() - 31 * DAY).toISOString();
		await enqueue(db, nqRow(ids("nq-old-sent"), "sent", oldIso));
		await enqueue(db, nqRow(ids("nq-old-pending"), "pending", oldIso));
		await enqueue(db, nqRow(ids("nq-recent-sent"), "sent", now.toISOString()));

		const termCutoff = new Date(now.getTime() - TERMINAL_LOG_TTL_MS).toISOString();
		const deleted = await reap(db, termCutoff, ["sent", "failed", "dropped"]);
		// Global sweep — "at least mine" + per-row proof (see lore above).
		expect(deleted.length).toBeGreaterThanOrEqual(1);
		expect(deleted).toContain(ids("nq-old-sent"));

		// @lore AU38: listNotifications is a global list — assert over this
		// test's own rows only: the pending + recent survive, the old sent is gone.
		const survivors = await listNotifications(db, { kind: "all" });
		const mine = survivors
			.map((s) => s.id)
			.filter((id) =>
				[ids("nq-old-sent"), ids("nq-old-pending"), ids("nq-recent-sent")].includes(id),
			);
		expect(new Set(mine)).toEqual(new Set([ids("nq-old-pending"), ids("nq-recent-sent")]));
	});

	test("prunes knowledge_access_log rows older than the TTL", async ({ db, ids }) => {
		await seedKnowledgeItem(db, ids("ki-1"));
		await db.insert(knowledgeAccessLog).values([
			{
				id: ids("kal-old"),
				itemId: ids("ki-1"),
				accessorKind: "human",
				accessorId: ids("u-1"),
				accessedAt: new Date(now.getTime() - 31 * DAY).toISOString(),
			},
			{
				id: ids("kal-recent"),
				itemId: ids("ki-1"),
				accessorKind: "human",
				accessorId: ids("u-1"),
				accessedAt: now.toISOString(),
			},
		]);

		const termCutoff = new Date(now.getTime() - TERMINAL_LOG_TTL_MS).toISOString();
		const deleted = await reapAccessLog(db, termCutoff);
		// Global sweep — "at least mine" + per-row proof (see lore above).
		expect(deleted.length).toBeGreaterThanOrEqual(1);
		expect(deleted).toContain(ids("kal-old"));

		const survivors = await db
			.select()
			.from(knowledgeAccessLog)
			.where(eq(knowledgeAccessLog.itemId, ids("ki-1")));
		expect(survivors.map((s) => s.id)).toEqual([ids("kal-recent")]);
	});

	test("prunes terminal propagation_log rows older than the TTL via the owner's reapTerminalPropagationLog", async ({
		db,
		ids,
	}) => {
		await db.insert(propagationLog).values([
			{
				id: ids("pl-old-applied"),
				sourceLevel: "session",
				sourceId: ids("s-1"),
				sourceEvent: "session_ended",
				targetLevel: "task",
				targetId: ids("t-1"),
				status: "applied",
				createdAt: new Date(now.getTime() - 31 * DAY).toISOString(),
			},
			{
				id: ids("pl-old-pending"),
				sourceLevel: "session",
				sourceId: ids("s-2"),
				sourceEvent: "session_ended",
				targetLevel: "task",
				targetId: ids("t-2"),
				status: "pending_retry",
				createdAt: new Date(now.getTime() - 31 * DAY).toISOString(),
			},
		]);

		const termCutoff = new Date(now.getTime() - TERMINAL_LOG_TTL_MS).toISOString();
		// Call the real composition-root function — exercises the predicate directly.
		await reapTerminalPropagationLog(db, termCutoff);

		// @lore AU38: scoped to this test's two rows — the applied one's absence
		// from its own scope proves the prune, the pending one's presence proves
		// the keep; other tests' old rows are not this test's claim.
		const survivors = await db
			.select()
			.from(propagationLog)
			.where(
				and(
					lt(propagationLog.createdAt, termCutoff),
					inArray(propagationLog.id, [ids("pl-old-applied"), ids("pl-old-pending")]),
				),
			);
		expect(survivors.map((s) => s.id)).toEqual([ids("pl-old-pending")]);
	});
});

/**
 * AU21 §9 Increment 10 (Decision H1) — RED. `reapTerminalTaskDispatchAttempts`
 * is relocated out of `session-requests`'s `reapExpired` atomic transaction
 * into this composition root's generic retention reaper — same pattern as
 * `reapTerminalPropagationLog` above (an owning-service predicate, exported from
 * `server-factory.ts` purely so the composition-root wiring is directly
 * testable without waiting on the real 6h interval).
 */
describe("retention reaper — task-dispatch-attempt reaper (relocated home, Decision H1)", () => {
	test("prunes terminal task_dispatch_attempts rows older than the TTL, keeps live/recent ones", async ({
		db,
		ids,
	}) => {
		const oldTermCutoff = new Date(now.getTime() - 31 * DAY).toISOString();
		await seedTaskDispatchAttempt(db, {
			id: ids("tda-old-completed"),
			status: "completed",
			updatedAt: oldTermCutoff,
		});
		await seedTaskDispatchAttempt(db, {
			id: ids("tda-recent-completed"),
			status: "completed",
			updatedAt: now.toISOString(),
		});
		await seedTaskDispatchAttempt(db, {
			id: ids("tda-old-running"),
			status: "running",
			updatedAt: oldTermCutoff,
		});

		const termCutoff = new Date(now.getTime() - TERMINAL_LOG_TTL_MS).toISOString();
		const reaped = await reapTerminalTaskDispatchAttempts(db, termCutoff, 10);
		// Global sweep — "at least mine" (see lore above); the scoped survivor
		// set below proves WHICH row was pruned.
		expect(reaped).toBeGreaterThanOrEqual(1);

		const survivors = await db
			.select({ id: taskDispatchAttempts.id })
			.from(taskDispatchAttempts)
			.where(
				inArray(taskDispatchAttempts.id, [
					ids("tda-old-completed"),
					ids("tda-recent-completed"),
					ids("tda-old-running"),
				]),
			);
		expect(new Set(survivors.map((s) => s.id))).toEqual(
			new Set([ids("tda-recent-completed"), ids("tda-old-running")]),
		);
	});
});
