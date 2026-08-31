/**
 * `reviewPayloadSchema`'s write arm speaks the consolidated six-kind artifact
 * vocabulary (`ARTIFACT_KINDS`); the read arm (`reviewPayloadSchemaRow`) stays
 * tolerant of whatever a row already carries.
 *
 * The write arm (`messageInputSchema`, used by
 * `POST /api/threads/:id/messages`) now validates `artifactRef.kind` against
 * `ARTIFACT_KINDS` (`"text"`, `"code"`, `"image"`, `"data"`, `"html"`,
 * `"url"`) — the six consolidated values `create_artifact` actually emits —
 * refusing the five pre-consolidation values (`"text_diff"`,
 * `"content_preview"`, `"visual_comparison"`, `"action_summary"`,
 * `"data_metrics"`) that have zero overlap with them.
 *
 * The read arm (`messageRowSchema`, used by `GET /api/threads/:id`) stays
 * tolerant: a row already persisted with one of the five retired values must
 * still parse, not throw `messageRowSchema.parse()` and take out the whole
 * thread. That half is covered below, not in a separate file — there is no
 * `threads.verdict-review-resumption.integration.test.ts` on this branch or
 * on `origin/main`; it belonged to a sibling work package that was split
 * apart and never landed here.
 */

import { bets, type HyperIdleDb, messages, tasks, teams, threads, users } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

interface World {
	readonly taskId: string;
	readonly threadId: string;
	readonly agentId: string;
}

async function seedWorld(db: HyperIdleDb, idPrefix: string): Promise<World> {
	const teamId = `${idPrefix}-team`;
	const betId = `${idPrefix}-bet`;
	const taskId = `${idPrefix}-task`;
	const threadId = `${idPrefix}-thread`;
	const agentId = `${idPrefix}-agent`;
	const founderId = `${idPrefix}-founder`;

	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	// The test fixture's API-key auth resolves the sender as the sole
	// `kind:"human"` user (`middleware/auth.ts`'s `resolveApiKeyUserId`),
	// falling back to a literal "u-founder" only when none exists — a value
	// this test's own db never seeds. Without this row, every POST below
	// would attribute `senderId` to a nonexistent user and 500 on the
	// `messages` FK, for a reason that has nothing to do with the artifact
	// kind this file is actually testing.
	await db.insert(users).values({
		id: founderId,
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "d",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		ownerAgentId: agentId,
		title: "T",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: taskId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId, founderId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});

	return { taskId, threadId, agentId };
}

function authHeaders(): Record<string, string> {
	return { "Content-Type": "application/json" };
}

async function postReview(
	app: import("hono").Hono,
	threadId: string,
	artifactId: string,
	kind: string,
	clientKey: string,
): Promise<Response> {
	return app.request(`/api/threads/${threadId}/messages`, {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({
			type: "review",
			payload: {
				title: "Please approve",
				reasoning: ["r"],
				artifactRef: { id: artifactId, kind },
			},
			clientKey,
		}),
	});
}

describe("reviewPayloadSchema write arm speaks the consolidated ARTIFACT_KINDS vocabulary", () => {
	test("a review carrying a consolidated artifact kind is writable and reads back unchanged", async ({
		db,
		app,
	}) => {
		const world = await seedWorld(db, "write-new");

		// "text" is one of the six kinds `create_artifact` actually emits — the
		// write arm accepts it.
		const create = await postReview(app, world.threadId, "art-x", "text", "write-new-key");
		expect(create.status).toBe(201);
		const created = (await create.json()) as { message: { id: string } };

		const get = await app.request(`/api/threads/${world.threadId}`, {
			method: "GET",
			headers: authHeaders(),
		});
		expect(get.status).toBe(200);
		const detail = (await get.json()) as {
			messages: ReadonlyArray<{ id: string; payload: { artifactRef?: { kind?: string } } }>;
		};
		const reviewMsg = detail.messages.find((m) => m.id === created.message.id);
		expect(reviewMsg?.payload.artifactRef?.kind).toBe("text");
	});

	test("a review carrying a retired pre-consolidation artifact kind is refused on write", async ({
		db,
		app,
	}) => {
		const world = await seedWorld(db, "write-retired");

		// "text_diff" is one of the five retired ARTIFACT_VIEW_SHAPES values —
		// nothing may write it again.
		const create = await postReview(app, world.threadId, "art-y", "text_diff", "write-retired-key");
		expect(create.status).toBe(400);
	});
});

describe("reviewPayloadSchemaRow read arm stays tolerant of a retired kind an existing row carries", () => {
	test("a review row persisted before the respell, still carrying a retired artifactRef.kind, reads back on GET /threads/:id instead of taking out the thread", async ({
		db,
		app,
	}) => {
		const world = await seedWorld(db, "read-retired");
		const messageId = "read-retired-review-msg";

		// Written directly at the DB layer — bypassing `messageInputSchema`
		// entirely, exactly like a row that predates this change would already
		// sit in production. If `messageRowSchema` (which this route's
		// `rowToMessage` runs every row through) validated `artifactRef.kind`
		// with the same strict `ARTIFACT_KINDS` enum as the write arm, this
		// row's `.parse()` would throw and `GET /threads/:id` would 500 for
		// EVERY message in the thread, not just this one.
		await db.insert(messages).values({
			id: messageId,
			senderId: world.agentId,
			threadId: world.threadId,
			type: "review",
			payload: JSON.stringify({
				title: "Please approve",
				reasoning: ["r"],
				artifactRef: { id: "art-legacy", kind: "text_diff" },
			}),
			clientKey: "read-retired-key",
			createdAt: NOW,
		});

		const get = await app.request(`/api/threads/${world.threadId}`, {
			method: "GET",
			headers: authHeaders(),
		});

		expect(get.status).toBe(200);
		const detail = (await get.json()) as {
			messages: ReadonlyArray<{ id: string; payload: { artifactRef?: { kind?: string } } }>;
		};
		const reviewMsg = detail.messages.find((m) => m.id === messageId);
		expect(reviewMsg).toBeDefined();
		// The retired value survives verbatim — the read arm is tolerant, not
		// normalizing.
		expect(reviewMsg?.payload.artifactRef?.kind).toBe("text_diff");
	});
});
