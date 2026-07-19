/**
 * AU19 Increment 2g — `@hyperidle/retention`'s `reapRetentionOnce`, wired
 * against the real db + the real owning-Service reap functions (no stubs —
 * `deps.users`/`deps.knowledge`/`deps.notifications` are the actual
 * `@hyperidle/users`/`@hyperidle/knowledge`/`@hyperidle/notifications`
 * exports, the same wiring `server-factory.ts` uses in production).
 *
 * Exact-behavior lock against the pre-migration inline deletes in
 * `packages/server/src/services/retention-reaper.ts` (removed this
 * increment) — same predicates, same cutoffs, same per-table survivor set.
 */
import {
	type HyperIdleDb,
	inviteCodes,
	knowledgeAccessLog,
	knowledgeItems,
	loginSessions,
	propagationLog,
	users,
} from "@hyperidle/db";
import { reapKnowledgeAccessLog } from "@hyperidle/knowledge";
import { enqueue, listNotifications, reap } from "@hyperidle/notifications";
import { type RetentionReaperDeps, reapRetentionOnce } from "@hyperidle/retention";
import { reapExpiredCredentials } from "@hyperidle/users";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "../test-fixtures.js";

const now = new Date("2026-07-13T12:00:00.000Z");
const DAY = 86_400_000;

const deps: RetentionReaperDeps = {
	users: { reapExpiredCredentials },
	knowledge: { reapKnowledgeAccessLog },
	notifications: { deleteReaped: reap },
};

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
}

describe("reapRetentionOnce", () => {
	test("prunes expired login_sessions, keeps unexpired + un-revoked ones", async ({ db }) => {
		await seedUser(db, "u-ls");
		await db.insert(loginSessions).values([
			{
				id: "ls-expired",
				userId: "u-ls",
				tokenHash: "h-expired",
				expiresAt: new Date(now.getTime() - DAY).toISOString(),
				createdAt: now.toISOString(),
				revokedAt: null,
			},
			{
				id: "ls-revoked",
				userId: "u-ls",
				tokenHash: "h-revoked",
				expiresAt: new Date(now.getTime() + DAY).toISOString(),
				createdAt: now.toISOString(),
				revokedAt: new Date(now.getTime() - DAY).toISOString(),
			},
			{
				id: "ls-live",
				userId: "u-ls",
				tokenHash: "h-live",
				expiresAt: new Date(now.getTime() + DAY).toISOString(),
				createdAt: now.toISOString(),
				revokedAt: null,
			},
		]);

		const results = await reapRetentionOnce(db, deps, { now: () => now.getTime() });
		const loginResult = results.find((r) => r.table === "login_sessions");
		expect(loginResult?.deleted).toBe(2);

		const survivors = await db.select().from(loginSessions);
		expect(survivors.map((s) => s.id)).toEqual(["ls-live"]);
	});

	test("prunes expired-unclaimed and consumed-past-audit-window invite_codes", async ({ db }) => {
		await seedUser(db, "u-creator");
		await seedUser(db, "u-claimer");
		await db.insert(inviteCodes).values([
			{
				id: "ic-expired-unclaimed",
				code: "code-expired",
				createdBy: "u-creator",
				claimedBy: null,
				expiresAt: new Date(now.getTime() - DAY).toISOString(),
				createdAt: new Date(now.getTime() - DAY).toISOString(),
			},
			{
				id: "ic-consumed-old",
				code: "code-consumed-old",
				createdBy: "u-creator",
				claimedBy: "u-claimer",
				expiresAt: new Date(now.getTime() + DAY).toISOString(),
				createdAt: new Date(now.getTime() - 31 * DAY).toISOString(),
			},
			{
				id: "ic-consumed-recent",
				code: "code-consumed-recent",
				createdBy: "u-creator",
				claimedBy: "u-claimer",
				expiresAt: new Date(now.getTime() + DAY).toISOString(),
				createdAt: new Date(now.getTime() - DAY).toISOString(),
			},
			{
				id: "ic-live",
				code: "code-live",
				createdBy: "u-creator",
				claimedBy: null,
				expiresAt: new Date(now.getTime() + DAY).toISOString(),
				createdAt: now.toISOString(),
			},
		]);

		const results = await reapRetentionOnce(db, deps, {
			now: () => now.getTime(),
			consumedInviteTtlMs: 30 * DAY,
		});
		const inviteResult = results.find((r) => r.table === "invite_codes");
		expect(inviteResult?.deleted).toBe(2);

		const survivors = await db.select().from(inviteCodes);
		expect(new Set(survivors.map((s) => s.id))).toEqual(new Set(["ic-consumed-recent", "ic-live"]));
	});

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

		const results = await reapRetentionOnce(db, deps, {
			now: () => now.getTime(),
			terminalLogTtlMs: 30 * DAY,
		});
		const nqResult = results.find((r) => r.table === "notification_queue");
		expect(nqResult?.deleted).toBe(1);

		const survivors = await listNotifications(db, { kind: "all" });
		expect(new Set(survivors.map((s) => s.id))).toEqual(
			new Set(["nq-old-pending", "nq-recent-sent"]),
		);
	});

	test("prunes knowledge_access_log rows older than the TTL", async ({ db }) => {
		await seedKnowledgeItem(db, "ki-1");
		await db.insert(knowledgeAccessLog).values([
			{
				id: "kal-old",
				itemId: "ki-1",
				accessorKind: "human",
				accessorId: "u-1",
				accessedAt: new Date(now.getTime() - 31 * DAY).toISOString(),
			},
			{
				id: "kal-recent",
				itemId: "ki-1",
				accessorKind: "human",
				accessorId: "u-1",
				accessedAt: now.toISOString(),
			},
		]);

		const results = await reapRetentionOnce(db, deps, {
			now: () => now.getTime(),
			terminalLogTtlMs: 30 * DAY,
		});
		const kalResult = results.find((r) => r.table === "knowledge_access_log");
		expect(kalResult?.deleted).toBe(1);

		const survivors = await db.select().from(knowledgeAccessLog);
		expect(survivors.map((s) => s.id)).toEqual(["kal-recent"]);
	});

	test("prunes terminal propagation_log rows older than the TTL (direct unowned-shared-table access)", async ({
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

		const results = await reapRetentionOnce(db, deps, {
			now: () => now.getTime(),
			terminalLogTtlMs: 30 * DAY,
		});
		const plResult = results.find((r) => r.table === "propagation_log");
		expect(plResult?.deleted).toBe(1);

		const survivors = await db
			.select()
			.from(propagationLog)
			.where(eq(propagationLog.id, "pl-old-pending"));
		expect(survivors).toHaveLength(1);
	});
});
