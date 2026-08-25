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

import { users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
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
});
