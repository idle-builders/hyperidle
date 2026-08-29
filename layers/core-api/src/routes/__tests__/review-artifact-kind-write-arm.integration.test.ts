/**
 * BA2 T4d (RED) — `reviewPayloadSchema`'s write arm speaks the consolidated
 * six-kind artifact vocabulary; the read arm stays tolerant of whatever a row
 * already carries. `.pipeline/work/BA2/architecture.md` §2.8.2 B3 (BLK-4).
 *
 * Today BOTH the write arm (`messageInputSchema`, used by
 * `POST /api/threads/:id/messages`) and the read arm
 * (`messageRowSchema`, used by `GET /api/threads/:id`) point at the SAME
 * `reviewPayloadSchema`, whose `artifactRef.kind` is
 * `z.enum(ARTIFACT_VIEW_SHAPES)` — five pre-consolidation values
 * (`"text_diff"`, `"content_preview"`, `"visual_comparison"`,
 * `"action_summary"`, `"data_metrics"`) with ZERO overlap with the six
 * consolidated `ARTIFACT_KINDS` (`"text"`, `"code"`, `"image"`, `"data"`,
 * `"html"`, `"url"`) `create_artifact` actually emits (architecture.md F51).
 *
 * The read-arm half of this split (a RETIRED kind on an existing row must not
 * throw on read-back) is already proven red by
 * `threads.verdict-review-resumption.integration.test.ts`'s
 * "a review row whose artifactRef.kind falls outside the current
 * ARTIFACT_VIEW_SHAPES enum does not throw on read-back" — not duplicated
 * here. This file covers the WRITE-arm half that test does not: a
 * consolidated kind must be WRITABLE, and a retired kind must no longer be.
 */

import { bets, type HyperIdleDb, tasks, teams, threads, users } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

interface World {
	readonly taskId: string;
	readonly threadId: string;
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

	return { taskId, threadId };
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

describe("BA2 T4d — reviewPayloadSchema write arm speaks the consolidated ARTIFACT_KINDS vocabulary (BLK-4)", () => {
	test("a review carrying a consolidated artifact kind is writable and reads back unchanged", async ({
		db,
		app,
	}) => {
		const world = await seedWorld(db, "t4d-write-new");

		// RED today: the write arm still validates against the five
		// pre-consolidation ARTIFACT_VIEW_SHAPES values, so "text" — one of the
		// six kinds `create_artifact` actually emits — is rejected with 400.
		const create = await postReview(app, world.threadId, "art-x", "text", "t4d-write-new-key");
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
		const world = await seedWorld(db, "t4d-write-retired");

		// RED today: the write arm currently ACCEPTS this (it's one of today's
		// five ARTIFACT_VIEW_SHAPES values) and returns 201. After the fix,
		// nothing pre-AM5 may be written again — the write arm must refuse it.
		const create = await postReview(
			app,
			world.threadId,
			"art-y",
			"text_diff",
			"t4d-write-retired-key",
		);
		expect(create.status).toBe(400);
	});
});
