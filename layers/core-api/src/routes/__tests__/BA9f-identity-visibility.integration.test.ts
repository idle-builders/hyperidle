/**
 * An agent's identity document is reachable through the knowledge API.
 *
 * `scope_kind='user'` says a document belongs to the subject in `scope_id`, and
 * that means two different things. An `ordinary` user-scoped document is a
 * person's private note. A capability document — `agent_file`, `skill`, `rule` —
 * with the same scope is a BINDING: it names the agent it applies to.
 *
 * Spelled as "user scope is private, full stop", every agent identity was 404
 * to everyone, through the one endpoint that is now the only place to edit one.
 * Found by driving the live API against a seeded database, not by a test.
 */

import { type HyperIdleDb, knowledgeAppProjection, knowledgeItems, users } from "@hyperidle/db";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ba9f-visibility";
const FOUNDER = "u-founder-ba9f";
const OTHER_HUMAN = "u-other-ba9f";
const AGENT = "agent-ba9f";

function authHeaders(identity: string): Record<string, string> {
	return {
		"X-API-Key": TEST_API_KEY,
		"Content-Type": "application/json",
		"X-Identity": identity,
		Authorization: `Bearer test-token-${identity}`,
	};
}

async function seed(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(users).values([
		{
			id: FOUNDER,
			name: "Founder",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: now,
		},
		{
			id: OTHER_HUMAN,
			name: "Other",
			role: "founder",
			status: "active",
			kind: "human",
			createdAt: now,
		},
		{ id: AGENT, name: "Atlas", role: "builder", status: "active", kind: "ai", createdAt: now },
	]);

	// The agent's identity — authored by somebody else entirely, so the only
	// thing that can make it visible is that it is a binding, not a note.
	await db.insert(knowledgeItems).values([
		{
			id: "ki_af_agent-ba9f",
			scopeKind: "user",
			scopeId: AGENT,
			topic: null,
			title: "Atlas — identity",
			body: "You are Atlas.",
			format: "markdown",
			status: "active",
			version: 1,
			role: "agent_file",
			updatedBy: OTHER_HUMAN,
			createdAt: now,
			updatedAt: now,
		},
		{
			id: "ki_note_other",
			scopeKind: "user",
			scopeId: OTHER_HUMAN,
			topic: null,
			title: "Other's private note",
			body: "Nobody else's business.",
			format: "markdown",
			status: "active",
			version: 1,
			role: "ordinary",
			updatedBy: OTHER_HUMAN,
			createdAt: now,
			updatedAt: now,
		},
	]);
	// Kernel row and projection travel together, as knowledge always writes them.
	await db.insert(knowledgeAppProjection).values([
		{ id: "kp_af_agent-ba9f", knowledgeItemId: "ki_af_agent-ba9f", layer: null, scopeId: AGENT },
		{ id: "kp_note_other", knowledgeItemId: "ki_note_other", layer: null, scopeId: OTHER_HUMAN },
	]);
}

describe("an agent's identity document is knowledge, not a private note", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("a person who did not author it can still read it", async ({ db, app }) => {
		await seed(db);

		const res = await app.request("/api/knowledge/ki_af_agent-ba9f", {
			headers: authHeaders(FOUNDER),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as { body: string; role: string; scopeId: string };
		expect(body.body).toBe("You are Atlas.");
		expect(body.role).toBe("agent_file");
		expect(body.scopeId).toBe(AGENT);
	});

	test("a person who did not author it can edit it — this is the only editor", async ({
		db,
		app,
	}) => {
		await seed(db);

		const res = await app.request("/api/knowledge/ki_af_agent-ba9f", {
			method: "PATCH",
			headers: authHeaders(FOUNDER),
			body: JSON.stringify({ version: 1, updatedBy: FOUNDER, body: "You are Atlas, rewritten." }),
		});
		expect(res.status).toBe(200);

		const after = await app.request("/api/knowledge/ki_af_agent-ba9f", {
			headers: authHeaders(FOUNDER),
		});
		expect(((await after.json()) as { body: string }).body).toBe("You are Atlas, rewritten.");
	});

	test("another person's private note is still private", async ({ db, app }) => {
		await seed(db);

		const res = await app.request("/api/knowledge/ki_note_other", {
			headers: authHeaders(FOUNDER),
		});

		// 404, not 403 — its existence must not leak.
		expect(res.status).toBe(404);
	});

	test("the identity appears in the knowledge list, the private note does not", async ({
		db,
		app,
	}) => {
		await seed(db);

		const res = await app.request("/api/knowledge", { headers: authHeaders(FOUNDER) });
		expect(res.status).toBe(200);
		const payload = (await res.json()) as { items?: Array<{ id: string }> };
		const ids = (payload.items ?? []).map((i) => i.id);

		expect(ids).toContain("ki_af_agent-ba9f");
		expect(ids).not.toContain("ki_note_other");
	});
});
