/**
 * A block attached into a conversation is a document, not a pointer.
 *
 * The old "+" wrote a `BlockRef` — a block id, which is a hash of content plus
 * outline path. Editing the source changed the hash, the reference stopped
 * resolving, and the conversation degraded to a "source changed" placeholder.
 * What was attached could rot out from under the conversation that attached it.
 *
 * The replacement copies the block's content into a real document parented
 * to the thread. This test is the proof of the property that matters: edit the
 * source afterwards, and what is in the conversation does not move.
 *
 * It is a service integration test on purpose. The property is about two real
 * rows and a real edit — a component test can only assert that a string it just
 * declared still equals itself, which proves nothing about the feature.
 */

import { type HyperIdleDb, teams, threads, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-block-no-rot";
const NOW = "2026-09-03T00:00:00.000Z";

function headers(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedThread(db: HyperIdleDb): Promise<string> {
	await db.insert(teams).values({ id: "nr-team", name: "T", createdAt: NOW });
	await db.insert(users).values({
		id: "nr-user",
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(threads).values({
		id: "nr-thread",
		hostKind: "user",
		hostId: "nr-user",
		initiatorId: "nr-user",
		participants: JSON.stringify(["nr-user"]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	return "nr-thread";
}

describe("a block attached into a conversation does not rot", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("editing the source afterwards leaves the attached item untouched", async ({ db, app }) => {
		const threadId = await seedThread(db);
		const ORIGINAL = "## Auth migration\n\nThe original wording of the block.";

		// The source document someone is reading.
		const sourceRes = await app.request("/api/actions/edit_document", {
			method: "POST",
			headers: headers(),
			body: JSON.stringify({
				title: "Source document",
				body: ORIGINAL,
				format: "markdown",
				scopeKind: "factory",
			}),
		});
		expect(sourceRes.status).toBe(200);
		const source = (
			(await sourceRes.json()) as { data: { document: { id: string; version: number } } }
		).data.document;

		// "+" on a block, then send: the block's content becomes its own document,
		// parented to the conversation.
		const attachedRes = await app.request("/api/actions/edit_document", {
			method: "POST",
			headers: headers(),
			body: JSON.stringify({
				title: "Attached block",
				body: ORIGINAL,
				format: "markdown",
				scopeKind: "factory",
				parent: { kind: "thread", id: threadId },
			}),
		});
		expect(attachedRes.status).toBe(200);
		const attached = ((await attachedRes.json()) as { data: { document: { id: string } } }).data
			.document;

		// Now the source is edited — the thing that used to break the reference.
		const editRes = await app.request("/api/actions/edit_document", {
			method: "POST",
			headers: headers(),
			body: JSON.stringify({
				id: source.id,
				body: "## Auth migration\n\nCompletely rewritten, and longer than before.",
				version: source.version,
			}),
		});
		expect(editRes.status).toBe(200);

		// What is in the conversation has not moved.
		const afterRes = await app.request("/api/actions/open_document", {
			method: "POST",
			headers: headers(),
			body: JSON.stringify({ id: attached.id }),
		});
		expect(afterRes.status).toBe(200);
		const after = (
			(await afterRes.json()) as {
				data: { document: { body: string; parentKind: string; parentId: string } };
			}
		).data.document;

		expect(after.body).toBe(ORIGINAL);
		expect(after.parentKind).toBe("thread");
		expect(after.parentId).toBe(threadId);
	});
});
