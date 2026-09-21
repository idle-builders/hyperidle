/**
 * A routine's prompt is a knowledge document.
 *
 * It was a `routines.prompt` text column — the one instruction in the system
 * with no home in knowledge, so it could not be read, edited or reused like the
 * knowledge it plainly is. A plugin that contributes a routine had nothing to
 * contribute its prompt *to*.
 *
 * The routine now points at a document. The API still takes `prompt` text
 * because that is how a person writes one; the text lands in the document, and
 * editing that document in Knowledge changes what the routine fires with.
 */

import { documents, type HyperIdleDb, users } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

/** The knowledge document parented to this routine's prompt slot, if any. */
async function findPromptDoc(
	db: HyperIdleDb,
	routineId: string,
): Promise<typeof documents.$inferSelect | undefined> {
	const [row] = await db
		.select()
		.from(documents)
		.where(
			and(
				eq(documents.parentKind, "routine"),
				eq(documents.parentId, routineId),
				eq(documents.slot, "prompt"),
			),
		);
	return row;
}

const TEST_API_KEY = "test-key-routine-prompt";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: "u-founder",
			name: "Founder",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: now,
		},
		{ id, name: "Builder", role: "builder", status: "active", kind: "ai", createdAt: now },
	]);
}

function routineBody(extra: Record<string, unknown> = {}): string {
	return JSON.stringify({
		name: "Weekly sweep",
		prompt: "Sweep the knowledge base for stale items.",
		ownerAgentId: "agent-owner",
		triggerType: "calendar",
		triggerConfig: '{"cron":"0 3 * * 0"}',
		...extra,
	});
}

describe("a routine's prompt is a knowledge document", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("writing a routine with a prompt creates the document it points at", async ({ db, app }) => {
		await seedAgent(db, "agent-owner");

		const res = await app.request("/api/routines", {
			method: "POST",
			headers: authHeaders(),
			body: routineBody(),
		});
		expect(res.status).toBe(201);
		const created = (await res.json()) as { id: string };

		const doc = await findPromptDoc(db, created.id);
		expect(doc, "the routine has a prompt document parented to it").toBeDefined();
		expect(doc?.body).toBe("Sweep the knowledge base for stale items.");
	});

	test("the create response already carries the prompt text", async ({ db, app }) => {
		await seedAgent(db, "agent-owner");

		const res = await app.request("/api/routines", {
			method: "POST",
			headers: authHeaders(),
			body: routineBody(),
		});
		const created = (await res.json()) as { prompt?: string | null };
		expect(created.prompt).toBe("Sweep the knowledge base for stale items.");
	});

	test("reading the routine still returns its prompt text", async ({ db, app }) => {
		await seedAgent(db, "agent-owner");
		const created = (await (
			await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: routineBody(),
			})
		).json()) as { id: string };

		const res = await app.request(`/api/routines/${created.id}`, { headers: authHeaders() });
		const view = (await res.json()) as { routine?: { prompt?: string | null } };
		expect(view.routine?.prompt).toBe("Sweep the knowledge base for stale items.");
	});

	test("editing the document in Knowledge changes what the routine fires with", async ({
		db,
		app,
	}) => {
		await seedAgent(db, "agent-owner");
		const created = (await (
			await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: routineBody(),
			})
		).json()) as { id: string };

		const doc = await findPromptDoc(db, created.id);
		const docId = String(doc?.id);

		// Edited as an ordinary document — the whole point of it being one.
		await app.request("/api/actions/edit_document", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				id: docId,
				version: doc?.version,
				body: "Sweep only items older than 90 days.",
			}),
		});

		const view = (await (
			await app.request(`/api/routines/${created.id}`, { headers: authHeaders() })
		).json()) as { routine?: { prompt?: string | null } };
		expect(view.routine?.prompt).toBe("Sweep only items older than 90 days.");
	});

	test("changing the prompt through the routine writes through to the document", async ({
		db,
		app,
	}) => {
		await seedAgent(db, "agent-owner");
		const created = (await (
			await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: routineBody(),
			})
		).json()) as { id: string };

		await app.request(`/api/routines/${created.id}`, {
			method: "PATCH",
			headers: authHeaders(),
			body: JSON.stringify({ prompt: "Rewritten instruction." }),
		});

		const doc = await findPromptDoc(db, created.id);
		expect(doc?.body).toBe("Rewritten instruction.");
	});

	test("a routine with no prompt points at no document", async ({ db, app }) => {
		await seedAgent(db, "agent-owner");
		const created = (await (
			await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: routineBody({ prompt: undefined }),
			})
		).json()) as { id: string };

		const doc = await findPromptDoc(db, created.id);
		expect(doc).toBeUndefined();
	});

	test("the list response carries prompt text too, same as create/get/patch", async ({
		db,
		app,
	}) => {
		await seedAgent(db, "agent-owner");
		const created = (await (
			await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: routineBody(),
			})
		).json()) as { id: string };

		const noPrompt = (await (
			await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: routineBody({ name: "No prompt routine", prompt: undefined }),
			})
		).json()) as { id: string };

		const res = await app.request("/api/routines", { headers: authHeaders() });
		const list = (await res.json()) as Array<{ id: string; prompt?: string | null }>;

		const withPrompt = list.find((r) => r.id === created.id);
		const withoutPrompt = list.find((r) => r.id === noPrompt.id);

		expect(withPrompt?.prompt).toBe("Sweep the knowledge base for stale items.");
		expect(withoutPrompt?.prompt).toBe(null);
	});

	// architecture.md §8.3 B12: the read is `search_documents({parent, slot})`
	// with no `status` filter — today's behaviour (the pre-item
	// `knowledge-repository.ts:2045-2048` read never filtered on status
	// either), pinned here. A routine paused or whose prompt someone archived
	// by hand must keep firing with the instruction it had, not go blank.
	test("a routine's prompt read returns an archived prompt too", async ({ db, app }) => {
		await seedAgent(db, "agent-owner");
		const created = (await (
			await app.request("/api/routines", {
				method: "POST",
				headers: authHeaders(),
				body: routineBody(),
			})
		).json()) as { id: string };

		const doc = await findPromptDoc(db, created.id);
		await db
			.update(documents)
			.set({ status: "archived" })
			.where(eq(documents.id, String(doc?.id)));

		const single = (await (
			await app.request(`/api/routines/${created.id}`, { headers: authHeaders() })
		).json()) as { routine?: { prompt?: string | null } };
		expect(single.routine?.prompt).toBe("Sweep the knowledge base for stale items.");

		const list = (await (
			await app.request("/api/routines", { headers: authHeaders() })
		).json()) as Array<{ id: string; prompt?: string | null }>;
		expect(list.find((r) => r.id === created.id)?.prompt).toBe(
			"Sweep the knowledge base for stale items.",
		);
	});
});
