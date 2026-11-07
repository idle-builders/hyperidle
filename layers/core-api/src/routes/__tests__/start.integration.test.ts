/**
 * First start makes the person, their team, their first agent and the first
 * conversation with the agent's hello in it — once.
 */
import { messages, subscriptions, threads, users } from "@hyperidle/db";
import { describe, expect } from "vitest";
import { test } from "../../__testing__/test-fixtures.js";

describe("first start", () => {
	test("makes the person, their first agent and the first conversation with its hello, once", async ({
		db,
		app,
		asPerson,
	}) => {
		// No user yet — the first request goes as nobody; auth falls back to u-founder.
		const start = () =>
			app.request("/api/start", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Ada", team: "Product" }),
			});

		const res = await start();
		expect(res.status).toBe(200);

		const everyone = await db.select().from(users);
		const people = everyone.filter((u) => u.kind === "human");
		const agents = everyone.filter((u) => u.kind === "ai" && u.role !== "system");
		expect(people.map((p) => p.name)).toEqual(["Ada"]);
		expect(agents.map((a) => [a.name, a.ownerUserId])).toEqual([["Builder", people[0]?.id]]);
		// Builder starts work when someone asks it, not on every change anywhere.
		const reasons = await db.select().from(subscriptions);
		expect(reasons.filter((r) => r.userId === agents[0]?.id)).toEqual([]);

		const { threadId } = (await res.json()) as { threadId: string };
		const [thread] = await db.select().from(threads);
		expect(thread?.id).toBe(threadId);
		expect(thread?.title).toBe("Getting started");
		const said = await db.select().from(messages);
		expect(said.map((m) => [m.senderId, JSON.parse(m.payload).text])).toEqual([
			[agents[0]?.id, "Hi. What are you working on?"],
		]);

		// Second call returns 409 — already started.
		await asPerson(people[0]!.id);
		expect((await start()).status).toBe(409);
	});
});
