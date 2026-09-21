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

import { documents, type HyperIdleDb, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
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
	await db.insert(documents).values([
		{
			id: "ki_af_agent-ba9f",
			scopeKind: "user",
			scopeId: AGENT,
			title: "Atlas — identity",
			body: "You are Atlas.",
			format: "markdown",
			status: "active",
			version: 1,
			slot: "agent_file",
			updatedBy: OTHER_HUMAN,
			createdAt: now,
			updatedAt: now,
		},
		{
			id: "ki_note_other",
			scopeKind: "user",
			scopeId: OTHER_HUMAN,
			title: "Other's private note",
			body: "Nobody else's business.",
			format: "markdown",
			status: "active",
			version: 1,
			slot: "ordinary",
			updatedBy: OTHER_HUMAN,
			createdAt: now,
			updatedAt: now,
		},
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
		const body = (await res.json()) as { body: string; slot: string; scopeId: string };
		expect(body.body).toBe("You are Atlas.");
		expect(body.slot).toBe("agent_file");
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

/**
 * The new document action mechanism (architecture.md §8.3, B11): a created
 * agent's identity is seeded through the shared `routes/agent-identity.ts`
 * helper — `edit_document` with the caller-chosen id `doc_af_<agentId>` — and
 * read through `search_documents`/`open_document`, never `/api/knowledge`.
 */
describe("agent identity through the document action mechanism", () => {
	const CREATOR = "u-founder-ba9f-actions";
	const READER = "u-other-ba9f-actions";

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function seedTwoHumans(db: HyperIdleDb): Promise<void> {
		const now = new Date().toISOString();
		await db.insert(users).values([
			{ id: CREATOR, name: "Creator", role: "founder", status: "active", kind: "human", createdAt: now },
			{ id: READER, name: "Reader", role: "founder", status: "active", kind: "human", createdAt: now },
		]);
	}

	test("a created agent's identity document gets the exact doc_af_<agentId> id, and a non-owner can open it", async ({
		db,
		app,
	}) => {
		await seedTwoHumans(db);

		const createRes = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(CREATOR),
			body: JSON.stringify({ name: "Atlas", role: "builder", systemPrompt: "You are Atlas." }),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { id: string; identityKnowledgeId: string };
		expect(created.identityKnowledgeId).toBe(`doc_af_${created.id}`);

		const openRes = await app.request("/api/actions/open_document", {
			method: "POST",
			headers: authHeaders(READER),
			body: JSON.stringify({ id: created.identityKnowledgeId }),
		});
		expect(openRes.status).toBe(200);
		const opened = (await openRes.json()) as {
			ok: true;
			data: { document: { id: string; body: string; slot: string } };
		};
		expect(opened.data.document.id).toBe(created.identityKnowledgeId);
		expect(opened.data.document.body).toBe("You are Atlas.");
		expect(opened.data.document.slot).toBe("agent_file");
	});

	test("listing and reading an identity through search never bumps its read count", async ({
		db,
		app,
	}) => {
		await seedTwoHumans(db);

		const createRes = await app.request("/api/agents", {
			method: "POST",
			headers: authHeaders(CREATOR),
			body: JSON.stringify({ name: "Ranger", role: "builder", systemPrompt: "You are Ranger." }),
		});
		const created = (await createRes.json()) as { id: string; identityKnowledgeId: string };

		await app.request("/api/agents", { headers: authHeaders(READER) });
		await app.request(`/api/agents/${created.id}/profile`, { headers: authHeaders(READER) });

		const [doc] = await db
			.select()
			.from(documents)
			.where(eq(documents.id, created.identityKnowledgeId));
		expect(doc?.readCount).toBe(0);
	});
});
