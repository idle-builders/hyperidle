/**
 * L18 — GET /api/bets/:id/artifact-thread-summary integration tests.
 *
 * AC coverage:
 *  - returns one row per artifact with at least one message, ordered by lastMessageAt DESC, artifactId ASC
 *  - filters out artifacts with zero thread messages
 *  - caps results at 10 rows; sets truncated=true and correct totalCount when more than 10 qualify
 *  - returns 404 when the caller cannot read the bet (IDOR check via assertBetReadable)
 *  - returns empty summaries array (200) when bet has no artifacts
 *  - includes lastMessageSnippet from the last plain message
 *
 * Schema notes:
 *  - artifacts.producingTaskId references tasks.id (not null)
 *  - artifacts are linked to bets via tasks.betId
 *  - artifacts.kind is the artifact kind, artifacts.previewJson holds the preview payload
 */

import {
	artifacts,
	bets,
	type HyperIdleDb,
	messages,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import type { ArtifactThreadSummary } from "@hyperidle/domain-model";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-bet-summary";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		...extra,
	};
}

async function seedBase(db: HyperIdleDb, ids: ScopedIds): Promise<void> {
	const now = new Date().toISOString();

	await db.insert(teams).values({ id: ids("p1"), name: "P", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: ids("t1"), teamId: ids("p1"), capacity: 5, activeBets: 0, formedAt: now });

	await db.insert(users).values({
		id: ids("u-founder"),
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: now,
	});

	await db.insert(users).values({
		id: ids("agent-1"),
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: now,
	});
}

async function insertBet(db: HyperIdleDb, betId: string, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "test pitch",
		appetite: "small",
		status: "active",
		createdAt: now,
	});
}

async function insertTask(
	db: HyperIdleDb,
	taskId: string,
	betId: string,
	teamId: string,
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: `Task ${taskId}`,
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
}

// AM5 B4: default kind changed from code_diff → code (pre-alpha purge)
async function insertArtifact(
	db: HyperIdleDb,
	artifactId: string,
	producingTaskId: string,
	kind = "code",
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(artifacts).values({
		id: artifactId,
		producingTaskId,
		kind,
		previewJson: JSON.stringify({ title: `Artifact ${artifactId}` }),
		createdAt: now,
	});
}

async function insertThreadWithMessages(
	db: HyperIdleDb,
	ids: ScopedIds,
	artifactId: string,
	threadId: string,
	messageCount: number,
	lastMessageAt?: string,
): Promise<void> {
	const now = new Date().toISOString();
	const lastAt = lastMessageAt ?? now;
	await db.insert(threads).values({
		id: threadId,
		hostKind: "artifact",
		hostId: artifactId,
		initiatorId: ids("u-founder"),
		participants: JSON.stringify([ids("u-founder"), ids("agent-1")]),
		pinned: false,
		resolvedAt: null,
		lastActiveAt: lastAt,
		createdAt: now,
	});

	for (let i = 0; i < messageCount; i++) {
		const msgAt =
			i === messageCount - 1
				? lastAt
				: new Date(Date.parse(lastAt) - (messageCount - i) * 1000).toISOString();
		await db.insert(messages).values({
			id: `${threadId}-msg-${i}`,
			threadId,
			senderId: ids("u-founder"),
			type: "plain",
			payload: JSON.stringify({ text: `Message ${i} on ${artifactId}` }),
			clientKey: `ck-${threadId}-${i}`,
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: msgAt,
		});
	}
}

describe("L18 — GET /api/bets/:id/artifact-thread-summary", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("returns one row per artifact with at least one message, ordered by lastMessageAt desc", async ({
		db,
		app,
		ids,
	}) => {
		await seedBase(db, ids);
		await insertBet(db, ids("bet-summary-1"), ids("p1"));
		await insertTask(db, ids("task-sum-a"), ids("bet-summary-1"), ids("p1"));
		await insertTask(db, ids("task-sum-b"), ids("bet-summary-1"), ids("p1"));
		await insertTask(db, ids("task-sum-c"), ids("bet-summary-1"), ids("p1"));
		await insertArtifact(db, ids("art-a"), ids("task-sum-a"));
		await insertArtifact(db, ids("art-b"), ids("task-sum-b"));
		await insertArtifact(db, ids("art-c"), ids("task-sum-c"));

		// art-b: last message at a later time
		await insertThreadWithMessages(db, ids, ids("art-b"), ids("t-b"), 2, "2026-05-05T10:00:00Z");
		// art-a: last message at an earlier time
		await insertThreadWithMessages(db, ids, ids("art-a"), ids("t-a"), 1, "2026-05-05T09:00:00Z");
		// art-c: no messages — should be excluded

		const res = await app.request(`/api/bets/${ids("bet-summary-1")}/artifact-thread-summary`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			summaries: ArtifactThreadSummary[];
			totalCount: number;
			truncated: boolean;
		};

		// Only 2 artifacts have messages
		expect(body.summaries).toHaveLength(2);
		expect(body.totalCount).toBe(2);
		expect(body.truncated).toBe(false);

		// Ordered by lastMessageAt DESC
		expect(body!.summaries[0]!.artifactId).toBe(ids("art-b"));
		expect(body!.summaries[1]!.artifactId).toBe(ids("art-a"));

		// Each row has the expected shape
		expect(body!.summaries[0]!.messageCount).toBe(2);
		expect(body!.summaries[0]!.threadId).toBe(ids("t-b"));
		expect(body!.summaries[0]!.artifactKind).toBe("code"); // AM5 B4: code_diff → code
	});

	test("filters out artifacts with zero thread messages", async ({ db, app, ids }) => {
		await seedBase(db, ids);
		await insertBet(db, ids("bet-summary-2"), ids("p1"));
		await insertTask(db, ids("task-sum-empty"), ids("bet-summary-2"), ids("p1"));
		await insertArtifact(db, ids("art-empty"), ids("task-sum-empty"));

		// Artifact with a thread but NO messages
		const now = new Date().toISOString();
		await db.insert(threads).values({
			id: ids("t-empty"),
			hostKind: "artifact",
			hostId: ids("art-empty"),
			initiatorId: ids("u-founder"),
			participants: JSON.stringify([ids("u-founder")]),
			pinned: false,
			resolvedAt: null,
			lastActiveAt: now,
			createdAt: now,
		});

		const res = await app.request(`/api/bets/${ids("bet-summary-2")}/artifact-thread-summary`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			summaries: ArtifactThreadSummary[];
			totalCount: number;
			truncated: boolean;
		};
		expect(body.summaries).toHaveLength(0);
		expect(body.totalCount).toBe(0);
		expect(body.truncated).toBe(false);
	});

	test("caps results at 10 rows; sets truncated=true and totalCount when more than 10 qualify", async ({
		db,
		app,
		ids,
	}) => {
		await seedBase(db, ids);
		await insertBet(db, ids("bet-summary-3"), ids("p1"));

		// Create 12 artifacts (via 12 tasks), each with 1 message
		for (let i = 1; i <= 12; i++) {
			const taskId = ids(`task-cap-${String(i).padStart(2, "0")}`);
			const artId = ids(`art-cap-${String(i).padStart(2, "0")}`);
			const threadId = ids(`t-cap-${String(i).padStart(2, "0")}`);
			await insertTask(db, taskId, ids("bet-summary-3"), ids("p1"));
			await insertArtifact(db, artId, taskId);
			const msgAt = `2026-05-05T${String(i).padStart(2, "0")}:00:00Z`;
			await insertThreadWithMessages(db, ids, artId, threadId, 1, msgAt);
		}

		const res = await app.request(`/api/bets/${ids("bet-summary-3")}/artifact-thread-summary`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			summaries: ArtifactThreadSummary[];
			totalCount: number;
			truncated: boolean;
		};

		expect(body.summaries).toHaveLength(10);
		expect(body.totalCount).toBe(12);
		expect(body.truncated).toBe(true);
	});

	test("returns 404 when the caller cannot read the bet (IDOR check)", async ({ db, app, ids }) => {
		await seedBase(db, ids);
		// Request a bet that doesn't exist
		const res = await app.request(
			`/api/bets/${ids("non-existent-bet-id")}/artifact-thread-summary`,
			{
				method: "GET",
				headers: authHeaders(),
			},
		);

		expect(res.status).toBe(404);
	});

	test("returns empty summaries array (200) when bet has no artifacts", async ({
		db,
		app,
		ids,
	}) => {
		await seedBase(db, ids);
		await insertBet(db, ids("bet-no-artifacts"), ids("p1"));

		const res = await app.request(`/api/bets/${ids("bet-no-artifacts")}/artifact-thread-summary`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			summaries: ArtifactThreadSummary[];
			totalCount: number;
			truncated: boolean;
		};
		expect(body.summaries).toHaveLength(0);
		expect(body.totalCount).toBe(0);
		expect(body.truncated).toBe(false);
	});

	test("includes lastMessageSnippet from the last plain message", async ({ db, app, ids }) => {
		await seedBase(db, ids);
		await insertBet(db, ids("bet-snippet"), ids("p1"));
		await insertTask(db, ids("task-snip"), ids("bet-snippet"), ids("p1"));
		await insertArtifact(db, ids("art-snip"), ids("task-snip"));

		const now = new Date().toISOString();
		await db.insert(threads).values({
			id: ids("t-snip"),
			hostKind: "artifact",
			hostId: ids("art-snip"),
			initiatorId: ids("u-founder"),
			participants: JSON.stringify([ids("u-founder")]),
			pinned: false,
			resolvedAt: null,
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(messages).values({
			id: ids("msg-snip-1"),
			threadId: ids("t-snip"),
			senderId: ids("u-founder"),
			type: "plain",
			payload: JSON.stringify({
				text: "Looks good but the cache TTL is too long for this use case.",
			}),
			clientKey: ids("ck-snip-1"),
			deletedAt: null,
			redactedAt: null,
			resolvedAt: null,
			createdAt: now,
		});

		const res = await app.request(`/api/bets/${ids("bet-snippet")}/artifact-thread-summary`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			summaries: ArtifactThreadSummary[];
			totalCount: number;
			truncated: boolean;
		};

		expect(body.summaries).toHaveLength(1);
		expect(body!.summaries[0]!.lastMessageSnippet).toContain("Looks good but the cache TTL");
	});
});
