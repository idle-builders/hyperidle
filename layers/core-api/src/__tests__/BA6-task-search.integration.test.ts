/**
 * BA6 RED — the dependency picker's search door.
 *
 * The maintainer rejected the paste-a-task-id field: "searching a task
 * should be possible." The door it now reaches is the EXISTING
 * `GET /api/tasks?q=<query>` route (`layers/core-api/src/routes/tasks.ts` →
 * `work.list(db, "task", { text: q })`) — a previous pass concluded no such
 * door existed; it did, and this proves it against the real `{ db, app }`
 * fixtures rather than trusting that claim again.
 *
 * Covers:
 *   - a query matching a task's title returns it.
 *   - a non-root task (nested under a parent) is findable — `text` search
 *     carries no `parentTaskId` restriction, unlike `GET /api/search`'s
 *     roots-only global search.
 *
 * Exclusion of the task being edited / already-picked tasks is a picker
 * concern, not a server one — covered by `useTaskSearch.test.tsx` in core-ui.
 */

import { type HyperIdleDb, tasks, teams } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-ba6-search";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: teamId, name: `Team ${teamId}`, phase: "build", createdAt: now });
}

async function insertTask(
	db: HyperIdleDb,
	id: string,
	teamId: string,
	title: string,
	parentTaskId: string | null = null,
	state: "proposed" | "killed" = "proposed",
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(tasks).values({
		id,
		parentTaskId,
		teamId,
		title,
		state,
		createdAt: now,
		updatedAt: now,
	});
}

describe("BA6: GET /api/tasks?q= — the dependency picker's search door", () => {
	test("a query matching a task's title returns it", async ({ db, app }) => {
		await seedTeam(db, "ba6-search-t1");
		await insertTask(db, "ba6-search-root", "ba6-search-t1", "Ship the dependency picker");

		const res = await app.request("/api/tasks?q=dependency%20picker", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<{ id: string; title: string }>;
		expect(body.map((t) => t.id)).toContain("ba6-search-root");
	});

	test("a non-root task (nested under a parent) is findable", async ({ db, app }) => {
		await seedTeam(db, "ba6-search-t2");
		await insertTask(db, "ba6-search-parent", "ba6-search-t2", "Parent umbrella task");
		await insertTask(
			db,
			"ba6-search-child",
			"ba6-search-t2",
			"Nested onboarding checklist",
			"ba6-search-parent",
		);

		const res = await app.request("/api/tasks?q=onboarding", { headers: authHeaders() });

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<{ id: string; title: string }>;
		expect(body.map((t) => t.id)).toContain("ba6-search-child");
	});

	test("a query matching no task's title returns an empty list", async ({ db, app }) => {
		await seedTeam(db, "ba6-search-t3");
		await insertTask(db, "ba6-search-noise", "ba6-search-t3", "Something unrelated entirely");

		const res = await app.request("/api/tasks?q=zzz-no-match-zzz", { headers: authHeaders() });

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<{ id: string; title: string }>;
		expect(body).toEqual([]);
	});

	// ---------------------------------------------------------------------
	// B1 (fix round) — the picker must not offer a corpse. A killed task can
	// never finish, so it is not a legitimate dependency target; excluding it
	// here is the affordance half of the write-time refusal.
	// ---------------------------------------------------------------------
	test("a killed task is not returned by search", async ({ db, app }) => {
		await seedTeam(db, "ba6-search-t4");
		await insertTask(
			db,
			"ba6-search-dead",
			"ba6-search-t4",
			"Retired onboarding rewrite",
			null,
			"killed",
		);

		const res = await app.request("/api/tasks?q=onboarding%20rewrite", { headers: authHeaders() });

		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<{ id: string; title: string }>;
		expect(body.map((t) => t.id)).not.toContain("ba6-search-dead");
	});
});
