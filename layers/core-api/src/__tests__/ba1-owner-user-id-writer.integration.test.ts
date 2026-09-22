/**
 * BA1 D6 — the writer for `users.owner_user_id`.
 *
 * Architecture D6/T1: `AgentScaffoldSpec` gains `ownerUserId`, the
 * `user_assistant` trigger sets it from the request's `ownerUserId`, and
 * `persistScaffoldedAgents` passes it to `insertUser`. §9's own table names
 * the live case directly: "a freshly registered human's assistant returns
 * `ownerUserId` equal to that human's id" — not just the one-time backfill
 * `0059` performs for rows that already existed at migrate time.
 *
 * This exercises the real `POST /api/users` setup route (no stub of
 * `resolveAgentScaffoldSpecs` / `persistScaffoldedAgents`), because a human
 * registering for the first time is exactly the path that scaffolds their
 * `ast-<userId>` assistant.
 */

import { changes, documents, users } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

describe("BA1 D6 — a freshly registered human's assistant carries ownerUserId", () => {
	test("POST /api/users (setup) scaffolds an assistant with ownerUserId set to the new human", async ({
		db,
		app,
	}) => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Ada" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { user: { id: string } };
		const humanId = body.user.id;

		const [assistant] = await db
			.select()
			.from(users)
			.where(eq(users.id, `ast-${humanId}`))
			.limit(1);

		expect(assistant).toBeDefined();
		expect(assistant?.ownerUserId).toBe(humanId);
	});

	/**
	 * @lore BC4 follow-up (architecture.md §8.3): the setup route used to seed
	 * the assistant's identity with `@hyperidle/document`'s legacy repository
	 * writer — a raw `INSERT ... ON CONFLICT DO NOTHING`, no `changes` row.
	 * Routed through `edit_document` (via the shared `agent-identity.ts`
	 * helper) now, so this is a real behavior change, not just an internal
	 * refactor: exactly one `agent_file` document exists, and it has a
	 * `changes` row whose `actor` is the founder who just registered — a real
	 * `users.id`, not the earlier `updated_by:"scaffold"` free-text sentinel.
	 */
	test("POST /api/users (setup) seeds the assistant's identity document, authored by the founder, with a changes row", async ({
		db,
		app,
	}) => {
		const res = await app.request("/api/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "Grace" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { user: { id: string } };
		const humanId = body.user.id;
		const assistantId = `ast-${humanId}`;

		const identityDocs = await db
			.select()
			.from(documents)
			.where(and(eq(documents.parentKind, "agent"), eq(documents.parentId, assistantId)));
		expect(identityDocs).toHaveLength(1);
		const identityDoc = identityDocs[0];
		expect(identityDoc?.slot).toBe("agent_file");

		const changeRows = await db
			.select()
			.from(changes)
			.where(and(eq(changes.object, "document"), eq(changes.objectId, identityDoc?.id ?? "")));
		expect(changeRows).toHaveLength(1);
		expect(changeRows[0]?.actor).toBe(humanId);
	});
});
