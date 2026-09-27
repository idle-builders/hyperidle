/**
 * An agent's identity document is reachable through the document actions.
 *
 * `scope_kind='user'` says a document belongs to the subject in `scope_id`, and
 * that means two different things. An `ordinary` user-scoped document is a
 * person's private note. A capability document — `agent_file`, `skill`, `rule` —
 * with the same scope is a BINDING: it names the agent it applies to.
 *
 * A refused read answers `{ ok: false, problems: [{ code: "not_found" }] }` at
 * HTTP 422 through `open_document`/`edit_document`/`search_documents` — the
 * "existence must not leak" contract, carried by the envelope instead of the
 * status code.
 */

import { documents, type HyperIdleDb, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-identity-visibility";
const FOUNDER = "u-founder-identity";
const OTHER_HUMAN = "u-other-identity";
const AGENT = "agent-identity";

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
	// parentKind/parentId mirror what `routes/agent-identity.ts` always
	// writes (`parent: { kind: "agent", id: agentId }`) — a real identity row
	// is never parentless.
	await db.insert(documents).values([
		{
			id: "ki_af_agent-identity",
			scopeKind: "user",
			scopeId: AGENT,
			parentKind: "agent",
			parentId: AGENT,
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

describe("an agent's identity document is visible to everyone, not a private note", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("a person who did not author it can still read it", async ({ db, app }) => {
		await seed(db);

		const res = await app.request("/api/actions/open_document", {
			method: "POST",
			headers: authHeaders(FOUNDER),
			body: JSON.stringify({ id: "ki_af_agent-identity" }),
		});

		expect(res.status).toBe(200);
		const body = (
			(await res.json()) as {
				data: { document: { body: string; slot: string; scopeId: string } };
			}
		).data.document;
		expect(body.body).toBe("You are Atlas.");
		expect(body.slot).toBe("agent_file");
		expect(body.scopeId).toBe(AGENT);
	});

	test("a person who did not author it can edit it — this is the only editor", async ({
		db,
		app,
	}) => {
		await seed(db);

		const res = await app.request("/api/actions/edit_document", {
			method: "POST",
			headers: authHeaders(FOUNDER),
			body: JSON.stringify({
				id: "ki_af_agent-identity",
				version: 1,
				body: "You are Atlas, rewritten.",
			}),
		});
		expect(res.status).toBe(200);

		const after = await app.request("/api/actions/open_document", {
			method: "POST",
			headers: authHeaders(FOUNDER),
			body: JSON.stringify({ id: "ki_af_agent-identity" }),
		});
		expect(
			((await after.json()) as { data: { document: { body: string } } }).data.document.body,
		).toBe("You are Atlas, rewritten.");
	});

	test("another person's private note is still private", async ({ db, app }) => {
		await seed(db);

		const res = await app.request("/api/actions/open_document", {
			method: "POST",
			headers: authHeaders(FOUNDER),
			body: JSON.stringify({ id: "ki_note_other" }),
		});

		// 422 with a `not_found` problem, not a leak of a 200/403 distinction —
		// its existence must not leak.
		expect(res.status).toBe(422);
		const body = (await res.json()) as { ok: boolean; problems: Array<{ code: string }> };
		expect(body.ok).toBe(false);
		expect(body.problems[0]?.code).toBe("not_found");
	});

	test("the identity appears in a search, the private note does not", async ({ db, app }) => {
		await seed(db);

		const res = await app.request("/api/actions/search_documents", {
			method: "POST",
			headers: authHeaders(FOUNDER),
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(200);
		const payload = (await res.json()) as { data?: Array<{ id: string }> };
		const ids = (payload.data ?? []).map((i) => i.id);

		expect(ids).toContain("ki_af_agent-identity");
		expect(ids).not.toContain("ki_note_other");
	});
});

/**
 * A created agent's identity is seeded through the shared `agent-identity.ts`
 * helper — `edit_document` with the caller-chosen id `doc_af_<agentId>` — and
 * read through `search_documents`/`open_document`, never `/api/knowledge`.
 * The agent itself is created through `edit_user`
 * and read back through `search_users`/`open_user`, never `/api/agents`.
 */
describe("agent identity through the document action mechanism", () => {
	const CREATOR = "u-founder-identity-actions";
	const READER = "u-other-identity-actions";

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	async function seedTwoHumans(db: HyperIdleDb): Promise<void> {
		const now = new Date().toISOString();
		await db.insert(users).values([
			{
				id: CREATOR,
				name: "Creator",
				role: "founder",
				status: "active",
				kind: "human",
				createdAt: now,
			},
			{
				id: READER,
				name: "Reader",
				role: "founder",
				status: "active",
				kind: "human",
				createdAt: now,
			},
		]);
	}

	test("a created agent's identity document gets the exact doc_af_<agentId> id, and a non-owner can open it", async ({
		db,
		app,
	}) => {
		await seedTwoHumans(db);

		const createRes = await app.request("/api/actions/edit_user", {
			method: "POST",
			headers: authHeaders(CREATOR),
			body: JSON.stringify({
				kind: "ai",
				name: "Atlas",
				role: "builder",
				identity: "You are Atlas.",
				ownerUserId: CREATOR,
			}),
		});
		expect(createRes.status).toBe(200);
		const created = (
			(await createRes.json()) as {
				ok: true;
				data: { user: { id: string } | null; documentIds: Array<{ slot: string; id: string }> };
			}
		).data;
		const agentId = created.user?.id as string;
		const identityDocumentId = created.documentIds.find((d) => d.slot === "agent_file")?.id;
		expect(identityDocumentId).toBe(`doc_af_${agentId}`);

		const openRes = await app.request("/api/actions/open_document", {
			method: "POST",
			headers: authHeaders(READER),
			body: JSON.stringify({ id: identityDocumentId }),
		});
		expect(openRes.status).toBe(200);
		const opened = (await openRes.json()) as {
			ok: true;
			data: { document: { id: string; body: string; slot: string } };
		};
		expect(opened.data.document.id).toBe(identityDocumentId);
		expect(opened.data.document.body).toBe("You are Atlas.");
		expect(opened.data.document.slot).toBe("agent_file");
	});

	test("listing and reading an identity through search_users/open_user never bumps its read count", async ({
		db,
		app,
	}) => {
		await seedTwoHumans(db);

		const createRes = await app.request("/api/actions/edit_user", {
			method: "POST",
			headers: authHeaders(CREATOR),
			body: JSON.stringify({
				kind: "ai",
				name: "Ranger",
				role: "builder",
				identity: "You are Ranger.",
				ownerUserId: CREATOR,
			}),
		});
		const created = (
			(await createRes.json()) as { ok: true; data: { user: { id: string } | null } }
		).data;
		const agentId = created.user?.id as string;

		await app.request("/api/actions/search_users", {
			method: "POST",
			headers: authHeaders(READER),
			body: JSON.stringify({ kind: "ai" }),
		});
		await app.request("/api/actions/open_user", {
			method: "POST",
			headers: authHeaders(READER),
			body: JSON.stringify({ id: agentId }),
		});

		const [doc] = await db
			.select()
			.from(documents)
			.where(eq(documents.id, `doc_af_${agentId}`));
		expect(doc?.readCount).toBe(0);
	});
});
