/**
 * Nobody's agent is quietly assigned a harness or a model they never picked.
 *
 * A workspace runs on the harness its owner chose during setup. When no choice
 * has been made — a team created before a harness was picked, an agent created
 * through the API with no harness named — the correct stored value is **nothing**,
 * and the run resolves it: the adapter pool takes whichever harness is available,
 * and that harness runs on its own default model.
 *
 * What it must NOT be is a vendor's name compiled into the product. Writing
 * `builtin` + `claude-sonnet-4-6` + `anthropic` onto a row makes a decision on
 * someone's behalf and then presents it back to them as their configuration.
 * It also outlives its own reason: those three constants describe the model
 * gateway, so they keep naming a harness after that harness is gone.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { users } from "@hyperidle/db";
import { describe, expect, test } from "../__testing__/test-fixtures.js";

const NOW = "2026-08-28T00:00:00.000Z";

function authHeaders(): Record<string, string> {
	return { "Content-Type": "application/json", "X-API-Key": "test-key" };
}

async function seedFounder(db: HyperIdleDb): Promise<void> {
	await db.insert(users).values({
		id: "u-founder-nodefault",
		kind: "human",
		name: "Founder",
		role: "founder",
		status: "active",
		email: "founder-nodefault@hyperidle.com",
		createdAt: NOW,
	});
}

// @lore BC5 T11: `POST /api/agents` and `POST /api/teams` (with its
// `functions`-driven roster scaffold and team-level `primaryHarness`
// default) are deleted with the `agents`/`teams` route families — a team is
// just an id and a name now (migration 0090 drops every other column), so
// "a team's chosen harness propagates to its scaffolded roster" has no
// subject left to test. What survives is the principle itself, proven
// against `edit_user`: nobody's agent is quietly assigned a harness or model
// it never picked.
describe("no harness or model is chosen on someone's behalf", () => {
	test("an agent created with no harness named stores none", async ({ db, app }) => {
		await seedFounder(db);

		const res = await app.request("/api/actions/edit_user", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				kind: "ai",
				name: "Unassigned Agent",
				role: "builder",
				team: { name: "No Default Team" },
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			ok: true;
			data: {
				runConfig: {
					harnessType: string | null;
					modelId: string | null;
					modelProvider: string | null;
				} | null;
			};
		};

		expect(body.data.runConfig?.harnessType ?? null).toBeNull();
		expect(body.data.runConfig?.modelId ?? null).toBeNull();
		expect(body.data.runConfig?.modelProvider ?? null).toBeNull();
	});
});
