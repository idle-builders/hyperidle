/**
 * A human and an agent put a knowledge item into a conversation the same way.
 *
 * This is the goal the change is measured against, not a nice-to-have. Before
 * it, an agent had no path at all: the writeback that turns its files into
 * knowledge items is session-scoped, and the (now-deleted) `create_artifact`
 * tool needed a task. A person could attach something to a conversation and
 * an agent could not.
 *
 * Both paths now go through one door — `POST /api/knowledge` with
 * `parentKind:"thread"`. That single door is what makes them indistinguishable,
 * and this test pins the properties that must not drift: same parent, same
 * status, same role, same shape on the way back out.
 *
 * **What this does not prove.** The agent payload below is the shape
 * `create_artifact` used to send (the tool is deleted with the rest of the
 * document-tool sextet; a document-module successor is the agent's new real
 * call site, tracked separately) — but this test transcribes the payload
 * rather than driving a real call site: one lives behind the agent harness
 * and the other (`AssistantOverlay`'s send path, for the human) in the
 * browser. Each side asserts its own payload in its own package. Closing the
 * gap end to end is a harness-lane job, and the harness lane has no CI
 * runner by design.
 */

import { type HyperIdleDb, teams, threads, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-parity";
const NOW = "2026-09-03T00:00:00.000Z";

function headers(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedThread(db: HyperIdleDb): Promise<string> {
	await db.insert(teams).values({ id: "pa-team", name: "T", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: "pa-user",
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "pa-agent",
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(threads).values({
		id: "pa-thread",
		hostKind: "user",
		hostId: "pa-user",
		initiatorId: "pa-user",
		participants: JSON.stringify(["pa-user", "pa-agent"]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	return "pa-thread";
}

interface CreatedItem {
	readonly id: string;
	readonly parentKind: string | null;
	readonly parentId: string | null;
	readonly status: string;
	readonly role: string;
	readonly format: string;
	readonly body: string;
}

describe("a human and an agent put an item into a conversation the same way", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("both produce a row indistinguishable in parent, status and role", async ({ db, app }) => {
		const threadId = await seedThread(db);
		const BODY = "## What was produced\n\nThe same content either way.";

		// The agent's path: the deleted `create_artifact` took the parent from
		// its own context — the thread it was answering in — and never as an
		// input. Its successor (tracked separately) is expected to keep that.
		const byAgent = await app.request("/api/knowledge", {
			method: "POST",
			headers: headers(),
			body: JSON.stringify({
				title: "Produced by the agent",
				body: BODY,
				format: "markdown",
				status: "proposed",
				updatedBy: "agent:pa-agent",
				scopeKind: "factory",
				parentKind: "thread",
				parentId: threadId,
			}),
		});

		// The human's path: "+" on a block, then send.
		const byHuman = await app.request("/api/knowledge", {
			method: "POST",
			headers: headers(),
			body: JSON.stringify({
				title: "Produced by the human",
				body: BODY,
				format: "markdown",
				updatedBy: "pa-user",
				scopeKind: "factory",
				parentKind: "thread",
				parentId: threadId,
			}),
		});

		expect(byAgent.status).toBe(201);
		expect(byHuman.status).toBe(201);

		const agentItem = (await byAgent.json()) as CreatedItem;
		const humanItem = (await byHuman.json()) as CreatedItem;

		// Same conversation.
		expect(agentItem.parentKind).toBe("thread");
		expect(humanItem.parentKind).toBe("thread");
		expect(agentItem.parentId).toBe(threadId);
		expect(humanItem.parentId).toBe(threadId);

		// Same standing. Neither is more or less vouched for than the other,
		// and neither carries a role that would change where it lands in a
		// session's context.
		expect(agentItem.status).toBe(humanItem.status);
		expect(agentItem.role).toBe(humanItem.role);
		expect(agentItem.role).toBe("ordinary");

		// Same content, rendered by the same path.
		expect(agentItem.format).toBe(humanItem.format);
		expect(agentItem.body).toBe(humanItem.body);
	});

	test("both appear in the conversation, and neither appears in the knowledge tree", async ({
		db,
		app,
	}) => {
		const threadId = await seedThread(db);

		for (const updatedBy of ["agent:pa-agent", "pa-user"]) {
			const res = await app.request("/api/knowledge", {
				method: "POST",
				headers: headers(),
				body: JSON.stringify({
					title: `From ${updatedBy}`,
					body: "b",
					format: "markdown",
					updatedBy,
					scopeKind: "factory",
					parentKind: "thread",
					parentId: threadId,
				}),
			});
			expect(res.status).toBe(201);
		}

		const inThread = await app.request(`/api/knowledge?parentKind=thread&parentId=${threadId}`, {
			headers: headers(),
		});
		expect(inThread.status).toBe(200);
		const listed = (await inThread.json()) as { items: ReadonlyArray<{ title: string }> };
		expect(listed.items.map((i) => i.title).sort()).toEqual([
			"From agent:pa-agent",
			"From pa-user",
		]);

		// The knowledge tree is for kept knowledge, not for per-conversation
		// residue. Neither of them belongs there.
		const tree = await app.request("/api/knowledge", { headers: headers() });
		expect(tree.status).toBe(200);
		const treeItems = (await tree.json()) as { items: ReadonlyArray<{ title: string }> };
		expect(treeItems.items.map((i) => i.title)).not.toContain("From agent:pa-agent");
		expect(treeItems.items.map((i) => i.title)).not.toContain("From pa-user");
	});
});
