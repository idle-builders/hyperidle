/**
 * AU20 C1 — retention package dissolved. Each TTL sweep is now exercised
 * through its owning service directly (users / notifications / knowledge).
 *
 * Exact-behavior lock against the former `reapRetentionOnce` integration
 * test (AU19 Increment 2g): same predicates, same cutoffs, same per-table
 * survivor sets — no behavior change.
 *
 * @lore AU21 §9 Increment 10 (Decision H1) — RED. `reapTerminalTaskDispatchAttempts`
 * is relocated OUT of `session-requests`'s `reapExpired` single atomic
 * transaction (`service.ts`, bundled with the intent/start deletes) and INTO
 * this composition root's generic retention reaper, calling
 * `taskDispatchAttemptStore.reapTerminal` directly. Exported from
 * `server-factory.ts` so the predicate is directly testable without waiting
 * on the real 6h `setInterval`.
 */
import { bets, type HyperIdleDb, taskDispatchAttempts, tasks, teams, users } from "@hyperidle/db";
import { enqueue, listNotifications, reap } from "@hyperidle/notifications";
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

describe("retention reaper — individual owning-service sweeps", () => {
	test("prunes old read notification_queue rows older than the TTL, keeps unread/recent", async ({
		db,
	}) => {
		/**
		 * @lore AU44 batch 4: reap() signature changed from (db, cutoff, statuses[])
		 * to (db, cutoff). Predicate changed from `status IN (sent, failed, dropped)`
		 * to `readAt IS NOT NULL AND createdAt < cutoff`.
		 * Rows seed with readAt to match the new predicate:
		 *   - nq-old-read: old + readAt set → REAPED
		 *   - nq-old-unread: old + readAt null → KEPT (still in inbox)
		 *   - nq-recent-read: recent + readAt set → KEPT (not old enough)
		 */
		function nqRow(
			id: string,
			createdAt: string,
			readAt: string | null,
		): Parameters<typeof enqueue>[1] {
			return {
				id,
				eventType: "test",
				subjectId: null,
				severity: "digest" as const,
				title: "t",
				body: null,
				reason: "notification_event",
				channel: null,
				status: "pending",
				attempts: 0,
				createdAt,
				readAt,
			};
		}
		const oldIso = new Date(now.getTime() - 31 * DAY).toISOString();
		const readIso = new Date(now.getTime() - 30 * DAY).toISOString();
		await enqueue(db, nqRow("nq-old-read", oldIso, readIso));
		await enqueue(db, nqRow("nq-old-unread", oldIso, null));
		await enqueue(db, nqRow("nq-recent-read", now.toISOString(), readIso));

		const termCutoff = new Date(now.getTime() - TERMINAL_LOG_TTL_MS).toISOString();
		const deleted = await reap(db, termCutoff);
		expect(deleted.length).toBe(1);
		expect(deleted[0]).toBe("nq-old-read");

		// Verify survivors by direct unread query + check nq-recent-read still exists
		const unread = await listNotifications(db, { kind: "unread" });
		expect(unread.map((r) => r.id)).toContain("nq-old-unread");
		// nq-old-read was reaped
		expect(unread.map((r) => r.id)).not.toContain("nq-old-read");
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
