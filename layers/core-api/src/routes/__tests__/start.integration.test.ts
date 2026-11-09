/**
 * First start makes the person, their company (global team), their first agent and the first
 * conversation with the agent's hello in it — once.
 */
import { messages, subscriptions, teams, threads, users, userTeams } from "@hyperidle/db";
import { eq } from "drizzle-orm";
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
				body: JSON.stringify({ name: "Ada", company: "Product" }),
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

		// The company "Product" is the first (and global) team; Ada is its default runner.
		const allTeams = await db.select().from(teams);
		expect(allTeams).toHaveLength(1);
		expect(allTeams[0]?.isGlobal).toBe(true);
		const adaMembership = await db
			.select()
			.from(userTeams)
			.where(eq(userTeams.userId, people[0]!.id));
		expect(adaMembership[0]?.isDefaultRunner).toBe(true);

		// Second call returns 409 — already started.
		await asPerson(people[0]!.id);
		expect((await start()).status).toBe(409);
	});
});
