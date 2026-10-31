/** A task's description can be an app: the page is kept whole and read back as one. */

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

describe("a task's description as an app", () => {
	test("is kept as a page until it is written back as words", async ({ db, app }) => {
		const now = new Date().toISOString();
		await db.insert(teams).values({ id: "da-team", name: "Apps", createdAt: now });
		await db.insert(users).values({
			id: "u-founder",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		});
		const page = "<!doctype html><html><head><title>Picker</title></head><body></body></html>";
		const made = await act(app, "edit_task", {
			teamId: "da-team",
			title: "Plan picker",
			description: page,
			descriptionFormat: "html",
		});
		const id = (made.data as { task: { id: string } }).task.id;
		const read = async () =>
			(
				(await act(app, "search_tasks", { ids: [id] })).data as {
					description: string;
					descriptionFormat: string;
				}[]
			).map((t) => [t.description, t.descriptionFormat]);
		expect(await read()).toEqual([[page, "html"]]);

		await act(app, "edit_task", {
			id,
			description: "Show the plans.",
			descriptionFormat: "markdown",
		});
		expect(await read()).toEqual([["Show the plans.", "markdown"]]);
	});
});
