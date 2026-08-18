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
	propagationLog,
	taskDispatchAttempts,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { enqueue, listNotifications, reap } from "@hyperidle/notifications";
import { reapTerminalPropagationLog } from "@hyperidle/policy";
import { and, lt } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
// NOT YET CREATED — this import failing to resolve is this file's primary RED
// signal for the "task-dispatch-attempt reaper — relocated home" describe block.
import { reapTerminalTaskDispatchAttempts, TERMINAL_LOG_TTL_MS } from "../service-bootstrap.js";

const now = new Date("2026-07-13T12:00:00.000Z");
const DAY = 86_400_000;

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

describe("retention reaper — individual owning-service sweeps", () => {
	test("prunes terminal notification_queue rows older than the TTL, keeps pending/recent", async ({
		db,
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
		await enqueue(db, nqRow("nq-old-sent", "sent", oldIso));
		await enqueue(db, nqRow("nq-old-pending", "pending", oldIso));
		await enqueue(db, nqRow("nq-recent-sent", "sent", now.toISOString()));

		const termCutoff = new Date(now.getTime() - TERMINAL_LOG_TTL_MS).toISOString();
		const deleted = await reap(db, termCutoff, ["sent", "failed", "dropped"]);
		expect(deleted.length).toBe(1);

		const survivors = await listNotifications(db, { kind: "all" });
		expect(new Set(survivors.map((s) => s.id))).toEqual(
			new Set(["nq-old-pending", "nq-recent-sent"]),
		);
	});

	test("prunes terminal propagation_log rows older than the TTL via the owner's reapTerminalPropagationLog", async ({
		db,
	}) => {
		await db.insert(propagationLog).values([
			{
				id: "pl-old-applied",
				sourceLevel: "session",
				sourceId: "s-1",
				sourceEvent: "session_ended",
				targetLevel: "task",
				targetId: "t-1",
				status: "applied",
				createdAt: new Date(now.getTime() - 31 * DAY).toISOString(),
			},
			{
				id: "pl-old-pending",
				sourceLevel: "session",
				sourceId: "s-2",
				sourceEvent: "session_ended",
				targetLevel: "task",
				targetId: "t-2",
				status: "pending_retry",
				createdAt: new Date(now.getTime() - 31 * DAY).toISOString(),
			},
		]);

		const termCutoff = new Date(now.getTime() - TERMINAL_LOG_TTL_MS).toISOString();
		// Call the real composition-root function — exercises the predicate directly.
		await reapTerminalPropagationLog(db, termCutoff);

		const survivors = await db
			.select()
			.from(propagationLog)
			.where(and(lt(propagationLog.createdAt, termCutoff)));
		expect(survivors.map((s) => s.id)).toEqual(["pl-old-pending"]);
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
	}) => {
		const oldTermCutoff = new Date(now.getTime() - 31 * DAY).toISOString();
		await seedTaskDispatchAttempt(db, {
			id: "tda-old-completed",
			status: "completed",
			updatedAt: oldTermCutoff,
		});
		await seedTaskDispatchAttempt(db, {
			id: "tda-recent-completed",
			status: "completed",
			updatedAt: now.toISOString(),
		});
		await seedTaskDispatchAttempt(db, {
			id: "tda-old-running",
			status: "running",
			updatedAt: oldTermCutoff,
		});

		const termCutoff = new Date(now.getTime() - TERMINAL_LOG_TTL_MS).toISOString();
		const reaped = await reapTerminalTaskDispatchAttempts(db, termCutoff, 10);
		expect(reaped).toBe(1);

		const survivors = await db.select({ id: taskDispatchAttempts.id }).from(taskDispatchAttempts);
		expect(new Set(survivors.map((s) => s.id))).toEqual(
			new Set(["tda-recent-completed", "tda-old-running"]),
		);
	});
});
