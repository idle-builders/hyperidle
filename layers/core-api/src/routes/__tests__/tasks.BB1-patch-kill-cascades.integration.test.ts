/**
 * BB1 — killing through the ONE edit door kills the subtree.
 *
 * @lore BB1: found by manually driving the packaged desktop app, not by any
 * automated test. `PATCH /tasks/:id {state:"killed"}` — what the State dropdown
 * on WorkTaskPage calls — went through `transitionTask`, which kills exactly one
 * task. Killing a parent in the UI left its children alive underneath a killed
 * parent. `cascadeTaskKill` existed and was tested, but its only caller was the
 * bet overflow menu that BB1 deleted, so the cascade shipped unreachable.
 *
 * The regression this pins is the SUBTREE, at depth, through PATCH specifically.
 * A test that calls `cascadeTaskKill` directly cannot catch it — that is exactly
 * the shape of coverage that existed while the bug was live.
 */

import { tasks, teams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

const KEY = "test-key-bb1-patch-kill";
const TEAM = "team-patch-kill";

function auth(): Record<string, string> {
	return { "X-API-Key": KEY, "Content-Type": "application/json" };
}

describe("BB1 — PATCH state=killed cascades to the whole subtree", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("killing a parent through PATCH kills its children and grandchildren", async ({
		db,
		app,
	}) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: TEAM, name: "Patch Kill", phase: "build", createdAt: now });

		const mk = async (id: string, parent: string | null) => {
			const res = await app.request("/api/tasks", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify(
					parent === null ? { teamId: TEAM, title: id } : { parentTaskId: parent, title: id },
				),
			});
			expect(res.status).toBe(201);
			return ((await res.json()) as { id: string }).id;
		};

		const root = await mk("root", null);
		const child = await mk("child", root);
		const grandchild = await mk("grandchild", child);

		const res = await app.request(`/api/tasks/${root}`, {
			method: "PATCH",
			headers: auth(),
			body: JSON.stringify({ state: "killed" }),
		});
		expect(res.status).toBe(200);

		for (const [label, id] of [
			["root", root],
			["child", child],
			["grandchild", grandchild],
		] as const) {
			const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
			expect(row?.state, `${label} must be killed by the cascade`).toBe("killed");
		}
	});

	test("killing a child leaves its parent and siblings alone", async ({ db, app }) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: `${TEAM}-2`, name: "Patch Kill 2", phase: "build", createdAt: now });

		const mk = async (title: string, parent: string | null) => {
			const res = await app.request("/api/tasks", {
				method: "POST",
				headers: auth(),
				body: JSON.stringify(
					parent === null ? { teamId: `${TEAM}-2`, title } : { parentTaskId: parent, title },
				),
			});
			return ((await res.json()) as { id: string }).id;
		};

		const root = await mk("root", null);
		const a = await mk("a", root);
		const b = await mk("b", root);

		const res = await app.request(`/api/tasks/${a}`, {
			method: "PATCH",
			headers: auth(),
			body: JSON.stringify({ state: "killed" }),
		});
		expect(res.status).toBe(200);

		const state = async (id: string) => {
			const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
			return row?.state;
		};
		expect(await state(a)).toBe("killed");
		// The cascade goes DOWN only — a kill must never climb to the parent or
		// spill sideways onto a sibling.
		expect(await state(root)).not.toBe("killed");
		expect(await state(b)).not.toBe("killed");
	});
});
