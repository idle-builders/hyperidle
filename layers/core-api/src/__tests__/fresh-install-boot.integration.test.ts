/**
 * A fresh install is empty underneath the welcome screen.
 *
 * Boot writes only the hidden system actor — the row system writes are
 * attributed to — and no list of users shows it. The welcome screen then
 * goes through POST /api/start, which runs `edit_user` in-process as nobody
 * to create the person with their team, and their assistant, owned by them,
 * on the picked harness, with no identity text and one subscription per
 * object event, none with a prompt. After that the install holds the person,
 * their team and one agent: no second agent, no documents of any kind.
 *
 * Driven through the real app on a freshly migrated database: the person is
 * made in-process as nobody, as first start does, then the assistant and the
 * reads go through the HTTP door as that person.
 */
import { documents, subscriptions, teams, users, userTeams } from "@hyperidle/db";
import {
	OBJECT_EVENTS,
	PERSON_REASONS,
	type UserRow,
	type UserView,
} from "@hyperidle/domain-model";
import { getGlobalTeam } from "@hyperidle/user";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { buildCoreActions } from "../actions/compose.js";
import { applyFactoryCoreState } from "../bootstrap/factory-state.js";

interface ActionEnvelope<T> {
	readonly ok: boolean;
	readonly data: T;
	readonly problems?: unknown;
}

async function call<T>(
	app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
	name: string,
	body: Record<string, unknown>,
): Promise<T> {
	const res = await app.request(`/api/actions/${name}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const envelope = (await res.json()) as ActionEnvelope<T>;
	if (res.status !== 200 || !envelope.ok) {
		throw new Error(`${name} failed (${res.status}): ${JSON.stringify(envelope)}`);
	}
	return envelope.data;
}

describe("a fresh install", () => {
	test("a second person created with no teams lands only in the global team", async ({
		db,
		eventBus,
	}) => {
		await applyFactoryCoreState(db);
		const bootstrapActions = buildCoreActions({});
		const editUserAction = bootstrapActions.find((a) => a.declaration.name === "edit_user");
		if (!editUserAction) throw new Error("edit_user action not found");
		// First person names the company → creates the global team
		await editUserAction.run(
			{ actor: "", db, eventBus, now: new Date().toISOString() },
			{ kind: "human", name: "Ada", teams: ["Acme"] },
		);
		// Second person: lands in the global team only
		const globalTeamRow = await getGlobalTeam(db);
		const secondResult = await editUserAction.run(
			{ actor: "", db, eventBus, now: new Date().toISOString() },
			{ kind: "human", name: "Bo", teams: [globalTeamRow!.name] },
		);
		if (!secondResult.ok) throw new Error(`edit_user failed: ${JSON.stringify(secondResult)}`);
		const bo = (secondResult.data as { user?: { id: string } }).user;
		expect(bo?.id).toBeDefined();
		// Bo's memberships — should only be in the global team
		const boMemberships = await db.select().from(userTeams).where(eq(userTeams.userId, bo!.id));
		const globalTeam = (await db.select().from(teams))[0];
		expect(boMemberships).toHaveLength(1);
		expect(boMemberships[0]?.teamId).toBe(globalTeam?.id);
	});

	test("boot writes only the hidden system actor, again and again", async ({ db }) => {
		await applyFactoryCoreState(db);
		await applyFactoryCoreState(db);

		const rows = await db.select({ id: users.id, role: users.role }).from(users);
		expect(rows).toEqual([{ id: "system:propagation", role: "system" }]);

		expect(await db.select().from(documents)).toEqual([]);
	});

	test("after the welcome screen's two calls: the person, their team and one assistant with nine empty subscriptions, the person with the four reasons", async ({
		db,
		app,
		asPerson,
		eventBus,
	}) => {
		await applyFactoryCoreState(db);

		// First start makes the person in-process as nobody (`routes/start.ts`); the HTTP door refuses nobody.
		const bootstrapActions = buildCoreActions({});
		const editUserAction = bootstrapActions.find((a) => a.declaration.name === "edit_user");
		if (!editUserAction) throw new Error("edit_user action not found");
		const personResult = await editUserAction.run(
			{ actor: "", db, eventBus, now: new Date().toISOString() },
			{ kind: "human", name: "Ada", teams: ["My Team"] },
		);
		if (!personResult.ok) throw new Error(`edit_user failed: ${JSON.stringify(personResult)}`);
		const person = personResult.data as UserView;
		const personId = person.user?.id;
		expect(personId).toBeDefined();
		await asPerson(personId as string);
		const named = await call<UserRow[]>(app, "search_users", { ids: ["system:propagation"] });
		expect(named.map((u) => u.id)).toEqual(["system:propagation"]);

		await call<UserView>(app, "edit_user", {
			kind: "ai",
			name: "Ada's Assistant",
			role: "assistant",
			agentCategory: "individual",
			ownerUserId: personId,
			teams: ["My Team"],
			subscriptions: { add: OBJECT_EVENTS.map((event) => ({ event })) },
		});

		const agents = await call<UserRow[]>(app, "search_users", { kind: "ai" });
		expect(agents).toHaveLength(1);
		const [assistant] = agents;
		expect(assistant?.ownerUserId).toBe(personId);
		expect(assistant?.name).toBe("Ada's Assistant");

		const everyone = await call<UserRow[]>(app, "search_users", {});
		expect(everyone.map((u) => u.id).sort()).toEqual([personId, assistant?.id].sort());

		const opened = await call<UserView>(app, "open_user", { id: assistant?.id });
		expect(opened.subscriptions.map((s) => s.event).sort()).toEqual([...OBJECT_EVENTS].sort());
		expect(opened.subscriptions.every((s) => s.documentId === null && !s.paused)).toBe(true);
		expect(opened.documentIds).toEqual([]);

		// The person is told about the four reasons; the assistant has the nine events.
		const rows = await db.select().from(subscriptions);
		expect(rows.filter((r) => r.userId === assistant?.id)).toHaveLength(OBJECT_EVENTS.length);
		expect(
			rows
				.filter((r) => r.userId === personId)
				.map((r) => r.event)
				.sort(),
		).toEqual([...PERSON_REASONS].sort());

		expect(await db.select().from(documents)).toEqual([]);
		// "My Team" is the first team ever created → it is the global team
		const allTeams = await db.select().from(teams);
		expect(allTeams).toHaveLength(1);
		expect(allTeams[0]?.isGlobal).toBe(true);
		// The person who named the company is its default runner
		const membership = await db.select().from(userTeams);
		const personRow = membership.find((r) => r.userId === personId);
		expect(personRow?.isDefaultRunner).toBe(true);
	});
});
