/**
 * AF16 T16 — Retention reaper (RED).
 *
 * Integration test for reapRetentionOnce:
 * (a) login_sessions: expired → deleted; unexpired → retained.
 *     CRITICAL: expiry-based tables prune at expiresAt < now (NOT now − TTL).
 *     A just-expired session (expiresAt = now − 1ms) is pruned the same sweep.
 * (b) notification_queue: terminal past TTL → deleted; terminal within TTL → retained;
 *     non-terminal past TTL → RETAINED (terminal-only predicate).
 * (c) propagation_log: applied/skipped past TTL → deleted; pending_retry past TTL → retained.
 * (d) invite_codes: expired unclaimed → deleted; consumed past audit window → deleted;
 *     unexpired unclaimed → retained; consumed within audit window → retained.
 * (e) knowledge_access_log: old → deleted; fresh → retained.
 *
 * Z8-097.
 */

import {
	type HyperIdleDb,
	inviteCodes,
	knowledgeAccessLog,
	knowledgeItems,
	loginSessions,
	notificationQueue,
	propagationLog,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { describe, expect } from "vitest";
import { reapRetentionOnce } from "../retention-reaper.js";

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedBase(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(teams).values({ id: "rr-team", name: "RR Team", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "rr-tm", teamId: "rr-team", capacity: 5, activeBets: 0, formedAt: now });
	await db.insert(users).values({
		id: "rr-user",
		kind: "human",
		name: "RR User",
		role: "admin",
		status: "active",
		createdAt: now,
	});
}

async function seedKnowledgeItem(db: HyperIdleDb): Promise<void> {
	await db.insert(knowledgeItems).values({
		id: "rr-ki",
		title: "RR Knowledge",
		body: "body",
		format: "markdown",
		status: "active",
		scopeKind: "team",
		scopeId: "rr-team",
		updatedBy: "rr-user",
		version: 1,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
}

describe("AF16 T16 — retention reaper (Z8-097)", () => {
	// (a) login_sessions — expiry-based
	test("expired login session (expiresAt < now) is deleted; unexpired is retained", async ({
		db,
	}) => {
		await seedBase(db);
		const now = Date.now();
		const nowFn = () => now;

		// Expired 1ms ago — must be pruned (WARNING-3: NOT retained for a TTL window)
		const expiredAt = new Date(now - 1).toISOString();
		await db.insert(loginSessions).values({
			id: "ls-expired",
			userId: "rr-user",
			tokenHash: "hash-expired",
			expiresAt: expiredAt,
			createdAt: new Date(now - DAY_MS).toISOString(),
		});

		// Unexpired — must be retained
		const freshAt = new Date(now + DAY_MS).toISOString();
		await db.insert(loginSessions).values({
			id: "ls-fresh",
			userId: "rr-user",
			tokenHash: "hash-fresh",
			expiresAt: freshAt,
			createdAt: new Date(now - DAY_MS).toISOString(),
		});

		const results = await reapRetentionOnce(db, { now: nowFn });
		const lsResult = results.find((r) => r.table === "login_sessions");
		expect(lsResult?.deleted).toBe(1);

		// Verify: expired gone, fresh remains
		const remaining = await db.select().from(loginSessions);
		const ids = remaining.map((r) => r.id);
		expect(ids).not.toContain("ls-expired");
		expect(ids).toContain("ls-fresh");
	});

	// (b) notification_queue — age-based, terminal only
	test("terminal notification past TTL is deleted; within TTL is retained; non-terminal past TTL is retained", async ({
		db,
	}) => {
		await seedBase(db);
		const now = Date.now();
		const nowFn = () => now;
		const terminalLogTtlMs = 30 * DAY_MS;

		// Terminal, 31 days old → delete
		await db.insert(notificationQueue).values({
			id: "nq-old-sent",
			eventType: "test",
			severity: "low",
			title: "Old sent",
			reason: "test",
			status: "sent",
			createdAt: new Date(now - 31 * DAY_MS).toISOString(),
		});

		// Terminal, 29 days old → retain
		await db.insert(notificationQueue).values({
			id: "nq-fresh-sent",
			eventType: "test",
			severity: "low",
			title: "Fresh sent",
			reason: "test",
			status: "sent",
			createdAt: new Date(now - 29 * DAY_MS).toISOString(),
		});

		// Non-terminal (pending), 31 days old → retain (non-terminal predicate)
		await db.insert(notificationQueue).values({
			id: "nq-old-pending",
			eventType: "test",
			severity: "low",
			title: "Old pending",
			reason: "test",
			status: "pending",
			createdAt: new Date(now - 31 * DAY_MS).toISOString(),
		});

		await reapRetentionOnce(db, { now: nowFn, terminalLogTtlMs });

		const remaining = await db.select().from(notificationQueue);
		const ids = remaining.map((r) => r.id);
		expect(ids).not.toContain("nq-old-sent");
		expect(ids).toContain("nq-fresh-sent");
		expect(ids).toContain("nq-old-pending"); // non-terminal → preserved
	});

	// (c) propagation_log — age-based, terminal only
	test("propagation_log: applied past TTL deleted; pending_retry past TTL retained", async ({
		db,
	}) => {
		await seedBase(db);
		const now = Date.now();
		const nowFn = () => now;
		const terminalLogTtlMs = 30 * DAY_MS;

		await db.insert(propagationLog).values([
			{
				id: "pl-applied-old",
				sourceLevel: "bet",
				sourceId: "s1",
				sourceEvent: "bet_done",
				targetLevel: "team",
				targetId: "t1",
				status: "applied",
				attempts: 1,
				createdAt: new Date(now - 31 * DAY_MS).toISOString(),
			},
			{
				id: "pl-skipped-old",
				sourceLevel: "bet",
				sourceId: "s2",
				sourceEvent: "bet_done",
				targetLevel: "team",
				targetId: "t2",
				status: "skipped",
				attempts: 1,
				createdAt: new Date(now - 31 * DAY_MS).toISOString(),
			},
			{
				id: "pl-retry-old",
				sourceLevel: "bet",
				sourceId: "s3",
				sourceEvent: "bet_done",
				targetLevel: "team",
				targetId: "t3",
				status: "pending_retry",
				attempts: 1,
				createdAt: new Date(now - 31 * DAY_MS).toISOString(),
			},
		]);

		await reapRetentionOnce(db, { now: nowFn, terminalLogTtlMs });

		const remaining = await db.select().from(propagationLog);
		const ids = remaining.map((r) => r.id);
		expect(ids).not.toContain("pl-applied-old");
		expect(ids).not.toContain("pl-skipped-old");
		expect(ids).toContain("pl-retry-old"); // non-terminal → preserved
	});

	// (d) invite_codes — expiry-based + consumed age
	test("invite_codes: expired unclaimed deleted; consumed past window deleted; unexpired retained; consumed fresh retained", async ({
		db,
	}) => {
		await seedBase(db);
		const now = Date.now();
		const nowFn = () => now;
		const consumedInviteTtlMs = 30 * DAY_MS;

		// Expired unclaimed → delete
		await db.insert(inviteCodes).values({
			id: "ic-expired-unclaimed",
			code: "exp-unc-1",
			createdBy: "rr-user",
			expiresAt: new Date(now - DAY_MS).toISOString(),
			createdAt: new Date(now - 10 * DAY_MS).toISOString(),
		});

		// Unexpired unclaimed → retain
		await db.insert(inviteCodes).values({
			id: "ic-fresh-unclaimed",
			code: "fresh-unc-1",
			createdBy: "rr-user",
			expiresAt: new Date(now + DAY_MS).toISOString(),
			createdAt: new Date(now - DAY_MS).toISOString(),
		});

		// Create claimant user for consumed invites
		await db.insert(users).values({
			id: "rr-claimant",
			kind: "human",
			name: "Claimant",
			role: "member",
			status: "active",
			createdAt: new Date().toISOString(),
		});

		// Consumed, 31 days old → delete (audit window expired)
		await db.insert(inviteCodes).values({
			id: "ic-consumed-old",
			code: "cons-old-1",
			createdBy: "rr-user",
			claimedBy: "rr-claimant",
			expiresAt: new Date(now + DAY_MS).toISOString(), // not yet expired by expiry
			createdAt: new Date(now - 31 * DAY_MS).toISOString(),
		});

		// Consumed, 29 days old → retain (within audit window)
		await db.insert(inviteCodes).values({
			id: "ic-consumed-fresh",
			code: "cons-fresh-1",
			createdBy: "rr-user",
			claimedBy: "rr-claimant",
			expiresAt: new Date(now + DAY_MS).toISOString(),
			createdAt: new Date(now - 29 * DAY_MS).toISOString(),
		});

		await reapRetentionOnce(db, { now: nowFn, consumedInviteTtlMs });

		const remaining = await db.select().from(inviteCodes);
		const ids = remaining.map((r) => r.id);
		expect(ids).not.toContain("ic-expired-unclaimed");
		expect(ids).toContain("ic-fresh-unclaimed");
		expect(ids).not.toContain("ic-consumed-old");
		expect(ids).toContain("ic-consumed-fresh");
	});

	// (e) knowledge_access_log — age-based
	test("knowledge_access_log: old access deleted; fresh retained", async ({ db }) => {
		await seedBase(db);
		await seedKnowledgeItem(db);
		const now = Date.now();
		const nowFn = () => now;
		const terminalLogTtlMs = 30 * DAY_MS;

		await db.insert(knowledgeAccessLog).values([
			{
				id: "kal-old",
				itemId: "rr-ki",
				accessorKind: "human",
				accessorId: "rr-user",
				accessedAt: new Date(now - 31 * DAY_MS).toISOString(),
			},
			{
				id: "kal-fresh",
				itemId: "rr-ki",
				accessorKind: "human",
				accessorId: "rr-user",
				accessedAt: new Date(now - 29 * DAY_MS).toISOString(),
			},
		]);

		await reapRetentionOnce(db, { now: nowFn, terminalLogTtlMs });

		const remaining = await db.select().from(knowledgeAccessLog);
		const ids = remaining.map((r) => r.id);
		expect(ids).not.toContain("kal-old");
		expect(ids).toContain("kal-fresh");
	});

	// WARNING-3 regression guard: expiry tables must NOT add TTL to expiresAt
	test("WARNING-3: just-expired login session (expiresAt = now−1ms) is pruned immediately, NOT after a TTL delay", async ({
		db,
	}) => {
		await seedBase(db);
		const now = Date.now();
		const nowFn = () => now;

		await db.insert(loginSessions).values({
			id: "ls-just-expired",
			userId: "rr-user",
			tokenHash: "hash-just-exp",
			expiresAt: new Date(now - 1).toISOString(),
			createdAt: new Date(now - DAY_MS).toISOString(),
		});

		const results = await reapRetentionOnce(db, { now: nowFn });
		const lsResult = results.find((r) => r.table === "login_sessions");
		expect(lsResult?.deleted).toBeGreaterThan(0);

		const remaining = await db.select().from(loginSessions);
		expect(remaining.map((r) => r.id)).not.toContain("ls-just-expired");
	});
});
