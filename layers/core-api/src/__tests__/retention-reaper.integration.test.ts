/**
 * Each TTL sweep is exercised through its owning service directly (users /
 * document), not a shared retention module.
 */
import { appendChange } from "@hyperidle/changes";
import {
	type HyperIdleDb,
	inbox,
	subscriptions,
	taskDispatchAttempts,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "../__testing__/test-fixtures.js";
import { reapTerminalTaskDispatchAttempts, TERMINAL_LOG_TTL_MS } from "../service-bootstrap.js";
import { reapInbox } from "../services/inbox-reaper.js";

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
	await db.insert(teams).values({ id: teamId, name: "Team", createdAt: now.toISOString() });

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
		 * inbox carries no timestamp of its own; its age is its `changes` row's
		 * `at`. A row is reaped only once read AND past the TTL.
		 *   - ib-old-read: old change + readAt set → reaped
		 *   - ib-old-unread: old change + readAt null → kept (still in inbox)
		 *   - ib-recent-read: recent change + readAt set → kept (not old enough)
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

describe("retention reaper — task-dispatch-attempt reaper", () => {
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
