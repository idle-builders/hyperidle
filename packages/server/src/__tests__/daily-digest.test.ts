import {
	createTestDb,
	type HyperIdleDb,
	items,
	messages,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { getDailyDigest } from "@hyperidle/fabric";
import { beforeEach, describe, expect, it } from "vitest";

describe("Daily Digest (E7)", () => {
	let handle: TestDbHandle;
	let db: HyperIdleDb;
	const now = new Date("2026-04-16T12:00:00Z");

	async function seedBase(): Promise<void> {
		const ts = now.toISOString();
		db.insert(teams)
			.values({ id: "prod-1", name: "Test Product", phase: "build", createdAt: ts })
			.run();
		db.insert(teamMembers)
			.values({ id: "team-1", teamId: "prod-1", capacity: 3, activeBets: 0, formedAt: ts })
			.run();
		db.insert(users)
			.values({
				id: "agent-1",
				name: "Builder",
				role: "builder",
				status: "idle",
				teamId: "team-1",
				createdAt: ts,
			})
			.run();
		db.insert(threads)
			.values({
				id: "thread-1",
				hostKind: "task",
				hostId: "task-1",
				initiatorId: "agent-1",
				participants: JSON.stringify(["agent-1"]),
				lastActiveAt: ts,
				createdAt: ts,
			})
			.run();
	}

	async function createQueuedItem(id: string, createdAt: Date): Promise<void> {
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

	beforeEach(async () => {
		handle = await createTestDb();
		db = handle.db;
		await seedBase();
	});

	it("AC9: returns queued items from last 24h", async () => {
		// Item from 6 hours ago
		const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
		await createQueuedItem("item-recent", sixHoursAgo);

		const digest = await getDailyDigest(db, now);
		expect(digest.items).toHaveLength(1);
		expect(digest.items[0].id).toBe("item-recent");
		expect(digest.generatedAt).toBeTruthy();
	});

	it("AC9: excludes items older than 24h", async () => {
		// Item from 25 hours ago
		const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);
		await createQueuedItem("item-old", twentyFiveHoursAgo);

		// Item from 6 hours ago
		const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
		await createQueuedItem("item-recent", sixHoursAgo);

		const digest = await getDailyDigest(db, now);
		expect(digest.items).toHaveLength(1);
		expect(digest.items[0].id).toBe("item-recent");
	});

	it("AC9: excludes items that already have responses", async () => {
		const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
		await createQueuedItem("item-responded", sixHoursAgo);
		await createQueuedItem("item-pending", sixHoursAgo);

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
		expect(digest.items[0].id).toBe("item-pending");
	});

	it("returns empty array when no queued items", async () => {
		const digest = await getDailyDigest(db, now);
		expect(digest.items).toHaveLength(0);
		expect(digest.generatedAt).toBeTruthy();
	});
});
