import { getDailyDigest } from "@hyperidle/core-app";
import {
	type HyperIdleDb,
	items,
	messages,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "../test-fixtures.js";

describe("Daily Digest (E7)", () => {
	const now = new Date("2026-04-16T12:00:00Z");

	async function seedBase(db: HyperIdleDb): Promise<void> {
		const ts = now.toISOString();
		await db
			.insert(teams)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: ts });

		await db
			.insert(teamMembers)
			.values({ id: "team-1", teamId: "prod-1", capacity: 3, activeBets: 0, formedAt: ts });

		await db.insert(users).values({
			id: "agent-1",
			name: "Builder",
			role: "builder",
			status: "idle",
			teamId: "team-1",
			createdAt: ts,
		});

		await db.insert(threads).values({
			id: "thread-1",
			hostKind: "task",
			hostId: "task-1",
			initiatorId: "agent-1",
			participants: JSON.stringify(["agent-1"]),
			lastActiveAt: ts,
			createdAt: ts,
		});
	}

	async function createQueuedItem(db: HyperIdleDb, id: string, createdAt: Date): Promise<void> {
		await db.insert(items).values({
			id,
			sourceAgentId: "agent-1",
			kind: "approval",
			title: `Test item ${id}`,
			riskTier: "low",
			blocking: false,
			threadId: "thread-1",
			auditTrail: JSON.stringify({ action: "policy_queued" }),
			createdAt: createdAt.toISOString(),
		});
	}

	test("AC9: returns queued items from last 24h", async ({ db }) => {
		await seedBase(db);
		// Item from 6 hours ago
		const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
		await createQueuedItem(db, "item-recent", sixHoursAgo);

		const digest = await getDailyDigest(db, now);
		expect(digest.items).toHaveLength(1);
		expect(digest!.items[0]!.id).toBe("item-recent");
		expect(digest.generatedAt).toBeTruthy();
	});

	test("AC9: excludes items older than 24h", async ({ db }) => {
		await seedBase(db);
		// Item from 25 hours ago
		const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);
		await createQueuedItem(db, "item-old", twentyFiveHoursAgo);

		// Item from 6 hours ago
		const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
		await createQueuedItem(db, "item-recent", sixHoursAgo);

		const digest = await getDailyDigest(db, now);
		expect(digest.items).toHaveLength(1);
		expect(digest!.items[0]!.id).toBe("item-recent");
	});

	test("AC9: excludes items that already have responses", async ({ db }) => {
		await seedBase(db);
		const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
		await createQueuedItem(db, "item-responded", sixHoursAgo);
		await createQueuedItem(db, "item-pending", sixHoursAgo);

		// L1a: legacy `responses` rows project as verdict-typed messages whose
		// `legacy_item_id` matches the source item. The digest now joins via
		// messages.legacy_item_id (plan §10 / T8). Seed a `human` agent so
		// the message FK on sender_id is satisfied.
		await db.insert(users).values({
			id: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: now.toISOString(),
		});

		await db.insert(messages).values({
			id: "resp-1",
			senderId: "human",
			threadId: "thread-1",
			type: "verdict",
			payload: JSON.stringify({ decision: "approve" }),
			clientKey: "__l1_legacy_resp-1",
			legacyItemId: "item-responded",
			createdAt: now.toISOString(),
		});

		const digest = await getDailyDigest(db, now);
		expect(digest.items).toHaveLength(1);
		expect(digest!.items[0]!.id).toBe("item-pending");
	});

	test("returns empty array when no queued items", async ({ db }) => {
		await seedBase(db);
		const digest = await getDailyDigest(db, now);
		expect(digest.items).toHaveLength(0);
		expect(digest.generatedAt).toBeTruthy();
	});
});
