/**
 * Setting someone up through `edit_user` and reading it back through `open_user`: what someone
 * does is kept apart from their role; a person's About is made once, never overwritten; a reason
 * belongs to a person, not an agent.
 */

import { documents, type HyperIdleDb, teams, users, userTeams } from "@hyperidle/db";
import type { EditUserInput, UserView } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { buildCoreActions } from "../actions/compose.js";

const NOW = "2026-01-01T00:00:00.000Z";
const TEAM = "team-people";

function actionsOf() {
	const actions = buildCoreActions({});
	const run = async <T>(
		name: string,
		actor: string,
		input: unknown,
		db: HyperIdleDb,
		eventBus: EventBus,
	) => {
		const action = actions.find((a) => a.declaration.name === name);
		if (!action) throw new Error(`no ${name}`);
		return (await action.run(
			{ actor, db, eventBus, now: new Date().toISOString() },
			input as never,
		)) as { ok: true; data: T } | { ok: false; problems: { code: string }[] };
	};
	return {
		edit: (actor: string, input: EditUserInput, db: HyperIdleDb, eventBus: EventBus) =>
			run<UserView>("edit_user", actor, input, db, eventBus),
		open: async (actor: string, id: string, db: HyperIdleDb, eventBus: EventBus) => {
			const result = await run<UserView>("open_user", actor, { id }, db, eventBus);
			if (!result.ok) throw new Error(`open_user ${id} failed`);
			return result.data;
		},
	};
}

/** Finn owns Builder and Growth; Maya owns Designer; all in one team. */
async function seedPeople(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: TEAM, name: "Product", createdAt: NOW });
	const person = (id: string) => ({
		id,
		kind: "human",
		name: id,
		role: "member",
		status: "active",
		createdAt: NOW,
	});
	const agent = (id: string, owner: string) => ({
		id,
		kind: "ai",
		name: id,
		role: "agent",
		status: "active",
		ownerUserId: owner,
		createdAt: NOW,
	});
	await db
		.insert(users)
		.values([
			person("finn"),
			person("maya"),
			agent("builder", "finn"),
			agent("growth", "finn"),
			agent("designer", "maya"),
		]);
	await db
		.insert(userTeams)
		.values(
			["finn", "maya", "builder", "growth", "designer"].map((userId) => ({ userId, teamId: TEAM })),
		);
}

describe("setting someone up", () => {
	beforeEach(() => vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "test-credential-encryption-key"));
	afterEach(() => vi.unstubAllEnvs());

	test("what someone does is kept apart from their role", async ({ db, eventBus }) => {
		await seedPeople(db);
		const { edit, open } = actionsOf();
		await edit("finn", { id: "builder", what: "Builds and ships." }, db, eventBus);
		const builder = (await open("finn", "builder", db, eventBus)).user;
		expect([builder?.what, builder?.role]).toEqual(["Builds and ships.", "agent"]);
	});

	test("a reason belongs to a person, not an agent", async ({ db, eventBus }) => {
		await seedPeople(db);
		const { edit } = actionsOf();
		const refused = await edit(
			"finn",
			{ id: "builder", subscriptions: { add: [{ event: "mention.of_me" }] } },
			db,
			eventBus,
		);
		expect(refused.ok ? null : refused.problems[0]?.code).toBe("reason_for_people_only");
	});

	test("a person's About is made on first ask and never overwritten", async ({ db, eventBus }) => {
		await seedPeople(db);
		const { edit } = actionsOf();
		await edit(
			"finn",
			{ id: "finn", identity: "Ask me before anything reaches customers." },
			db,
			eventBus,
		);
		const again = await edit("finn", { id: "finn", identity: "Something else." }, db, eventBus);
		if (!again.ok) throw new Error("edit failed");
		const about = again.data.documentIds.find((d) => d.slot === "agent_file");
		if (!about) throw new Error("no About");
		const [row] = await db.select().from(documents).where(eq(documents.id, about.id));
		expect([row?.title, row?.body]).toEqual([
			"About finn",
			"Ask me before anything reaches customers.",
		]);
	});
});
