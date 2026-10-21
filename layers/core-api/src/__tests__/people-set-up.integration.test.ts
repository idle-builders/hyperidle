/**
 * Setting someone up through `edit_user` and reading it back through `open_user`, over the real
 * orchestration port: a folder or service you add goes to every agent of yours until you take it
 * from one; a new person is told about the four reasons; a person's About and an agent's reasons
 * are documents.
 */

import type { AgentOrchestrationPort } from "@hyperidle/api-contract";
import { documents, type HyperIdleDb, teams, users, userTeams } from "@hyperidle/db";
import { type EditUserInput, PERSON_REASONS, type UserView } from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { test } from "../__testing__/test-fixtures.js";
import { buildCoreActions } from "../actions/compose.js";

const NOW = "2026-01-01T00:00:00.000Z";
const TEAM = "team-people";

function actionsOf(agentOrchestration: AgentOrchestrationPort) {
	const actions = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
	});
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

	test("a folder a person adds goes to every agent of theirs, and to nobody else's", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedPeople(db);
		const { edit, open } = actionsOf(agentOrchestration);
		const added = await edit(
			"finn",
			{
				id: "finn",
				folders: {
					add: [
						{
							kind: "code",
							resourceRef: { kind: "code", repo: "~/code/billing", branch: "main" },
							writeback: "git",
						},
					],
				},
			},
			db,
			eventBus,
		);
		expect(added.ok).toBe(true);
		const repos = async (id: string) =>
			(await open("finn", id, db, eventBus)).folders.map((f) =>
				f.resourceRef.kind === "code" ? f.resourceRef.repo : f.resourceRef.folder,
			);
		expect(await repos("builder")).toEqual(["~/code/billing"]);
		expect(await repos("growth")).toEqual(["~/code/billing"]);
		expect(await repos("designer")).toEqual([]);
	});

	test("a service reaches every agent of its owner until it is taken from one", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedPeople(db);
		const { edit, open } = actionsOf(agentOrchestration);
		const added = await edit(
			"finn",
			{
				id: "finn",
				connections: {
					add: [{ authSource: "mcp", service: "Linear", serverUrl: "https://mcp.linear.app/mcp" }],
				},
			},
			db,
			eventBus,
		);
		if (!added.ok) throw new Error("adding the service failed");
		const linear = added.data.connections?.connections.find((c) => c.service === "Linear");
		if (!linear) throw new Error("no Linear");
		const reach = async (id: string) =>
			(await open("finn", id, db, eventBus)).connections?.connections.map((c) => [
				c.service,
				c.withheldFrom,
			]);

		expect(await reach("growth")).toEqual([["Linear", []]]);

		const taken = await edit(
			"finn",
			{ id: "growth", connections: { take: [linear.id] } },
			db,
			eventBus,
		);
		expect(taken.ok).toBe(true);
		expect(await reach("growth")).toEqual([["Linear", ["growth"]]]);
		expect(await reach("finn")).toEqual([["Linear", ["growth"]]]);
		expect(await reach("designer")).toEqual([]);

		await edit("finn", { id: "growth", connections: { give: [linear.id] } }, db, eventBus);
		expect(await reach("growth")).toEqual([["Linear", []]]);
	});

	test("a new person is told about the four reasons", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedPeople(db);
		const { edit } = actionsOf(agentOrchestration);
		const made = await edit(
			"finn",
			{ kind: "human", name: "Sam", teams: ["Product"] },
			db,
			eventBus,
		);
		if (!made.ok) throw new Error("create failed");
		expect(made.data.subscriptions.map((s) => [s.event, s.paused]).sort()).toEqual(
			PERSON_REASONS.map((reason) => [reason, false]).sort(),
		);
	});

	test("a reason belongs to a person, not an agent", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedPeople(db);
		const { edit } = actionsOf(agentOrchestration);
		const refused = await edit(
			"finn",
			{ id: "builder", subscriptions: { add: [{ event: "mention.of_me" }] } },
			db,
			eventBus,
		);
		expect(refused.ok ? null : refused.problems[0]?.code).toBe("reason_for_people_only");
	});

	test("a person's About is made on first ask and never overwritten", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedPeople(db);
		const { edit } = actionsOf(agentOrchestration);
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

	test("a reason added with a name makes its empty what-to-do document under that name", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		await seedPeople(db);
		const { edit } = actionsOf(agentOrchestration);
		const added = await edit(
			"finn",
			{
				id: "growth",
				subscriptions: {
					add: [{ schedule: "0 8 * * 4", prompt: "", title: "Pricing page check" }],
				},
			},
			db,
			eventBus,
		);
		if (!added.ok) throw new Error("adding the reason failed");
		const documentId = added.data.subscriptions[0]?.documentId;
		if (!documentId) throw new Error("no what-to-do document");
		const [row] = await db.select().from(documents).where(eq(documents.id, documentId));
		expect([row?.title, row?.body]).toEqual(["Pricing page check", ""]);
	});
});
