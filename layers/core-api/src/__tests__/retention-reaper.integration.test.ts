/**
 * AU20 C1 — retention package dissolved. Each TTL sweep is now exercised
 * through its owning service directly (users / document).
 *
 * Exact-behavior lock against the former `reapRetentionOnce` integration
 * test (AU19 Increment 2g): same predicates, same cutoffs, same per-table
 * survivor sets — no behavior change.
 *
 * @lore BC5 T7b: the notification_queue sweep is replaced by `reapInbox` —
 * same rule (a read row older than the TTL is deleted), moved onto the
 * subscription mechanism's own `inbox` table (`inbox-reaper.ts`'s own
 * `@lore`).
 *
 * @lore AU21 §9 Increment 10 (Decision H1) — RED. `reapTerminalTaskDispatchAttempts`
 * is relocated OUT of `session-requests`'s `reapExpired` single atomic
 * transaction (`service.ts`, bundled with the intent/start deletes) and INTO
 * this composition root's generic retention reaper, calling
 * `taskDispatchAttemptStore.reapTerminal` directly. Exported from
 * `server-factory.ts` so the predicate is directly testable without waiting
 * on the real 6h `setInterval`.
 */
import { appendChange } from "@hyperidle/changes";
import {
	inbox,
	type HyperIdleDb,
	subscriptions,
	taskDispatchAttempts,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
import { reapInbox } from "../services/inbox-reaper.js";
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
	const rootTaskId = `${options.id}-bet`;
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
	await db.insert(threads).values({
		id: `thr-${rootTaskId}`,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now.toISOString(),
		createdAt: now.toISOString(),
	});
	await db.insert(tasks).values({
		threadId: `thr-${rootTaskId}`,
		id: rootTaskId,
		parentTaskId: null,
		teamId: teamId,
		title: "retention-reaper bet",
		description: "retention-reaper bet",
		state: "in_progress",
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
	});
	await db.insert(threads).values({
		id: `thr-${taskId}`,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now.toISOString(),
		createdAt: now.toISOString(),
	});
	await db.insert(tasks).values({
		threadId: `thr-${taskId}`,
		id: taskId,
		parentTaskId: rootTaskId,
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
	test("prunes old read inbox rows older than the TTL, keeps unread/recent", async ({ db }) => {
		/**
		 * @lore BC5 T7b: same predicate the deleted notification_queue reap used
		 * (`readAt IS NOT NULL AND <age> < cutoff`), moved onto `inbox` — whose
		 * own age is its `changes` row's `at`, since `inbox` carries no
		 * timestamp of its own (`inbox-reaper.ts`'s own `@lore`).
		 *   - ib-old-read: old change + readAt set → REAPED
		 *   - ib-old-unread: old change + readAt null → KEPT (still in inbox)
		 *   - ib-recent-read: recent change + readAt set → KEPT (not old enough)
		 */
		const agentId = "rr-agent";
		await db.insert(users).values({
			id: agentId,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now.toISOString(),
		});
		await db.insert(subscriptions).values({
			id: "rr-sub",
			userId: agentId,
			event: "task.changed",
			paused: false,
			createdAt: now.toISOString(),
			updatedAt: now.toISOString(),
		});

		const oldIso = new Date(now.getTime() - 31 * DAY).toISOString();
		const readIso = new Date(now.getTime() - 30 * DAY).toISOString();

		async function seedInboxRow(
			id: string,
			changeAt: string,
			readAt: string | null,
		): Promise<void> {
			const change = await appendChange(db, {
				id,
				object: "user",
				objectId: agentId,
				kind: "changed",
				actor: agentId,
				before: null,
				after: "{}",
				at: changeAt,
			});
			await db
				.insert(inbox)
				.values({ userId: agentId, changeId: change.id, seenAt: readAt, readAt });
		}
		await seedInboxRow("ib-old-read", oldIso, readIso);
		await seedInboxRow("ib-old-unread", oldIso, null);
		await seedInboxRow("ib-recent-read", now.toISOString(), readIso);

		const termCutoff = new Date(now.getTime() - TERMINAL_LOG_TTL_MS).toISOString();
		const deletedCount = await reapInbox(db, termCutoff);
		expect(deletedCount).toBe(1);

		const survivors = await db.select({ changeId: inbox.changeId }).from(inbox);
		expect(survivors.map((r) => r.changeId)).toContain("ib-old-unread");
		expect(survivors.map((r) => r.changeId)).toContain("ib-recent-read");
		expect(survivors.map((r) => r.changeId)).not.toContain("ib-old-read");
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
