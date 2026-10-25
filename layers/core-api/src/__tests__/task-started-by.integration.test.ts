/** A task remembers who started it, so a person's page can list what they started. */

import { teams, users } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

async function act(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	name: string,
	body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: unknown }> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return (await res.json()) as { ok: boolean; data?: unknown };
}

describe("who started a task", () => {
	test("search_tasks finds the tasks a user started, and only theirs", async ({ db, app }) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "sb-team", name: "Started", createdAt: now });
		await db.insert(users).values([
			{
				id: "u-founder",
				kind: "human",
				name: "Founder",
				role: "founder",
				status: "active",
				createdAt: now,
			},
			{
				id: "u-other",
				kind: "human",
				name: "Other",
				role: "member",
				status: "active",
				createdAt: now,
			},
		]);

		const made = await act(app, "edit_task", {
			teamId: "sb-team",
			title: "Started by the founder",
		});
		expect(made.ok).toBe(true);

		const mine = await act(app, "search_tasks", { startedBy: "u-founder" });
		const theirs = await act(app, "search_tasks", { startedBy: "u-other" });
		expect(
			(mine.data as { title: string; startedBy: string }[]).map((t) => [t.title, t.startedBy]),
		).toEqual([["Started by the founder", "u-founder"]]);
		expect(theirs.data).toEqual([]);
	});
});
