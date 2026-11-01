/**
 * Each person is themselves on a shared backend: joining with the team key makes a person and
 * hands back their own key, and every request carrying that key is that person.
 */
import { users } from "@hyperidle/db";
import type { Hono } from "hono";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";

async function join(app: Hono, body: Record<string, string>): Promise<Response> {
	return app.request("/api/join", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function joined(app: Hono, email: string, name: string): Promise<string> {
	const res = await join(app, { email, name, team: "Product" });
	expect(res.status).toBe(200);
	return ((await res.json()) as { key: string }).key;
}

type Request = (path: string, init: RequestInit) => Response | Promise<Response>;

/** As the person whose own key this is. */
async function act<T>(request: Request, key: string, name: string, input: unknown): Promise<T> {
	const res = await request(`/api/actions/${name}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-API-Key": key },
		body: JSON.stringify(input),
	});
	return (await res.json()) as T;
}

type Me = { ok: true; data: { user: { id: string; name: string; role: string } | null } };

describe("joining a shared backend", () => {
	test("each joiner gets their own key that speaks as them; the first is the founder", async ({
		app,
		requestWithoutAuth,
	}) => {
		const alex = await joined(app, "Alex@Example.com", "Alex");
		const sam = await joined(app, "sam@example.com", "Sam");

		const asAlex = await act<Me>(requestWithoutAuth, alex, "open_user", {});
		const asSam = await act<Me>(requestWithoutAuth, sam, "open_user", {});
		const asTeamKey = (await (
			await app.request("/api/actions/open_user", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			})
		).json()) as Me;

		expect(asAlex.data.user).toMatchObject({ name: "Alex", role: "founder" });
		expect(asSam.data.user).toMatchObject({ name: "Sam", role: "member" });
		expect(asTeamKey.data.user).toBeNull();
	});

	test("refused: the first joiner without a team name, and an email that has already joined", async ({
		app,
	}) => {
		const noTeam = await join(app, { email: "alex@example.com", name: "Alex" });
		await joined(app, "alex@example.com", "Alex");
		const again = await join(app, { email: "ALEX@example.com", name: "Alex two" });

		expect(noTeam.status).toBe(409);
		expect(again.status).toBe(409);
	});

	test("a key nobody holds is refused", async ({ requestWithoutAuth }) => {
		const res = await requestWithoutAuth("/api/actions/open_user", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-API-Key": "not-anyones-key" },
			body: "{}",
		});
		expect(res.status).toBe(401);
	});

	test("a direct chat with an agent opens for its member and not for another person", async ({
		app,
		db,
		requestWithoutAuth,
	}) => {
		const alex = await joined(app, "alex@example.com", "Alex");
		const sam = await joined(app, "sam@example.com", "Sam");
		await db.insert(users).values({
			id: "agent-builder",
			kind: "ai",
			name: "Builder",
			role: "agent",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		const made = await act<{ ok: true; data: { thread: { id: string } } }>(
			requestWithoutAuth,
			alex,
			"adjust_thread",
			{ title: "Alex and Builder", members: ["agent-builder"] },
		);
		const id = made.data.thread.id;

		const alexOpens = await act<{ ok: boolean }>(requestWithoutAuth, alex, "open_thread", { id });
		const samOpens = await act<{ ok: boolean }>(requestWithoutAuth, sam, "open_thread", { id });
		const samList = await act<{ data: { thread: { id: string } }[] }>(
			requestWithoutAuth,
			sam,
			"search_threads",
			{},
		);

		expect(alexOpens.ok).toBe(true);
		expect(samOpens.ok).toBe(false);
		expect(samList.data.map((r) => r.thread.id)).not.toContain(id);
	});
});
