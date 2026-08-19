/**
 * AU21 §9 Increment 2 — RED phase.
 *
 * Extends the §11 contract-test harness (`core-api-port.integration.test.ts`,
 * Increment 1) to the remaining `tool-handlers` `work`/`users` capabilities
 * named in `edge-disposition.md`'s `tool-handlers` table
 * (`work.{get, list, create, update}` / `users.{findUser, listUsers}`, both
 * `§4 seam`). `work.routeItem` (a pure local computation, no `TDb`) is no
 * longer part of this picture at all — AU21 §6 Decision L3 deleted it
 * outright as vestigial (its output was consumed by nothing), rather than
 * leaving it as ordinary same-process logic; no contract test needed here.
 *
 * Every method below does not exist yet on `CoreApiPort`/`buildCoreApiPort`
 * (Increment 1 seeded ONLY `work.createBet`) — each test fails at RUNTIME
 * (`TypeError: ... is not a function` / `Cannot read properties of
 * undefined`), not at import-resolution time, because the composition
 * function + transport already exist from Increment 1. This is RED for the
 * right reason: missing implementation, not a typo. GREEN phase adds:
 *  (a) new methods on `CoreApiWorkPort` (api-contract) + `buildCoreApiPort`'s
 *      `work` object, and a NEW `CoreApiUsersPort` family;
 *  (b) the backing core-api routes, reusing what exists and adding narrow
 *      new routes only where nothing already serves the capability.
 *
 * Backing-route plan (documented here for the GREEN-phase builder):
 *  - `work.getTaskById`      → NEW `GET /tasks/:id` (no bare detail route
 *    exists today — `tasks.ts` only has `/`, `/:id/sessions`, `/:id`
 *    (PATCH), `/:id/transition`, `/:id/handoff`).
 *  - `work.getBetById`       → REUSE existing `GET /bets/:id`.
 *  - `work.updateBetById`    → REUSE existing `PATCH /bets/:id` (the
 *    discriminated single-field `{field,value,reason}` wire shape — the seam
 *    method issues one PATCH per changed field).
 *  - `work.createTask`       → REUSE existing `POST /tasks`.
 *  - `work.appendTaskNote`   → NEW `PATCH /tasks/:id/notes` (no route exposes
 *    the atomic SQL-CASE append `work-service.ts`'s `appendTaskNote` performs).
 *  - `work.getItemById`      → NEW `GET /conversations/items/:id` (only
 *    `GET /:threadId` — items scoped by thread — and `POST /items` exist).
 *  - `work.updateItemById`   → NEW `PATCH /conversations/items/:id`.
 *  - `work.createItem`       → REUSE existing `POST /conversations/items`.
 *  - `work.findItemByReasoningMarker` → NEW `GET /conversations/items` with
 *    a `reasoningMarker` query filter (no existing route searches items by
 *    the `reasoning` column).
 *  - `work.createArtifact`   → REUSE existing `POST /artifacts`.
 *  - `users.getUserById`     → REUSE existing `GET /users/:id`.
 *  - `users.listUsersByTeam` → EXTEND existing `GET /users` with a
 *    `team_members_id` query filter (no existing route lists users scoped to
 *    a team — `GET /teams/:teamId`'s roster is a much heavier enriched read,
 *    keyed by `teams.id` not `teamMembers.id`, and returns operational
 *    health/session data this capability does not need).
 *
 * CONFUSION (flagged for review, resolved here as: DO NOT migrate,
 * DELETE instead): `ToolHandlersWorkAccessor.updateTaskById`
 * (`ports.ts:83-87`, `Partial<{notes,updatedAt}>`) has ZERO real call sites
 * in `tool-definitions.ts` (`grep` confirms only `ports.ts`'s own
 * declaration + `__tests__/stub-ports.ts`'s test double reference it) — it is
 * superseded by the atomic `appendTaskNote` (which IS called, by `log_task`)
 * and no core-api route accepts its narrow `{notes,updatedAt}` shape. Per
 * architecture.md §7 disposition rule 1 ("dead/duplicate → remove"), this is
 * a dead capability, not a seam candidate — no contract test is written for
 * it here; GREEN phase should delete it from `ports.ts` +
 * `tool-handlers-bindings.ts` alongside the real migrations.
 */

import {
	buildCoreApiPort,
	createInProcessCoreApiTransport,
	withActorTransport,
} from "@hyperidle/agent-orchestration";
import {
	artifacts,
	bets,
	type HyperIdleDb,
	items,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import {
	afterEach,
	describe,
	expect,
	test,
	vi,
	withoutServiceTestAuth,
} from "../../__testing__/test-fixtures.js";

afterEach(() => vi.unstubAllEnvs());

const NOW = "2026-07-27T00:00:00.000Z";

interface SeamTaskView {
	readonly id: string;
	readonly betId: string;
	readonly teamId: string;
	readonly notes: string | null;
}

interface SeamBetView {
	readonly id: string;
	readonly status: string;
	readonly description?: string;
	readonly doneCondition?: string | null;
	readonly hypothesis?: string | null;
}

interface SeamItemView {
	readonly id: string;
	readonly riskTier: string | null;
	readonly kind: string | null;
	readonly verb: string | null;
}

interface SeamUserView {
	readonly id: string;
	readonly name: string;
	readonly role: string | null;
}

interface SeamCoreApiPortIncrement2 {
	readonly work: {
		getTaskById(id: string): Promise<SeamTaskView | undefined>;
		getBetById(id: string): Promise<SeamBetView | undefined>;
		updateBetById(
			id: string,
			updates: Partial<{
				description: string;
				doneCondition: string | null;
				hypothesis: string | null;
			}>,
		): Promise<void>;
		createTask(input: {
			readonly betId: string;
			readonly title: string;
			readonly description?: string | null;
			readonly doneCondition?: string | null;
			readonly ownerAgentId?: string | null;
		}): Promise<{ readonly id: string; readonly betId: string; readonly teamId: string }>;
		appendTaskNote(taskId: string, entry: string): Promise<{ readonly id: string } | undefined>;
		getItemById(id: string): Promise<SeamItemView | undefined>;
		updateItemById(
			id: string,
			updates: Partial<{ riskTier: string; kind: string; verb: string }>,
		): Promise<void>;
		createItem(input: {
			readonly threadId: string;
			readonly title: string;
			readonly kind?: string | null;
			readonly verb?: string | null;
			readonly riskTier?: string | null;
			readonly sourceAgentId?: string | null;
		}): Promise<{ readonly id: string }>;
		findItemByReasoningMarker(marker: string): Promise<{ readonly id: string } | undefined>;
		createArtifact(input: {
			readonly producingTaskId: string;
			readonly kind: string;
			readonly label?: string | null;
		}): Promise<{ readonly id: string; readonly producingTaskId: string; readonly kind: string }>;
	};
	readonly users: {
		getUserById(id: string): Promise<SeamUserView | undefined>;
		listUsersByTeam(teamMembersId: string): Promise<ReadonlyArray<SeamUserView>>;
	};
}

async function seedTeamAndBet(
	db: HyperIdleDb,
	opts: { readonly suffix: string; readonly betStatus?: string },
): Promise<{ readonly teamId: string; readonly teamMembersId: string; readonly betId: string }> {
	const teamId = `team-inc2-${opts.suffix}`;
	const teamMembersId = `tm-inc2-${opts.suffix}`;
	const betId = `bet-inc2-${opts.suffix}`;
	await db.insert(teams).values({ id: teamId, name: "Inc2 Team", phase: "build", createdAt: NOW });
		await db.insert(bets).values({
		id: betId,
		teamId,
		description: "Inc2 bet",
		appetite: "small",
		status: opts.betStatus ?? "active",
		createdAt: NOW,
	});
	return { teamId, teamMembersId, betId };
}

async function seedAgent(
	db: HyperIdleDb,
	id: string,
	opts: { readonly teamId?: string } = {},
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: `Agent ${id}`,
		role: "engineer",
		status: "active",
		teamId: opts.teamId,
		createdAt: NOW,
	});
}

function buildSeamPort(actorId: string, app: Hono): SeamCoreApiPortIncrement2 {
	const transport = withActorTransport(createInProcessCoreApiTransport(app), {
		userId: actorId,
	});
	return buildCoreApiPort(transport) as unknown as SeamCoreApiPortIncrement2;
}

describe("CoreApiPort.work — Increment 2 (RED)", () => {
	test("getTaskById reaches the real task detail route", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-key-task");
		const { teamId, betId } = await seedTeamAndBet(db, { suffix: "task1" });
		await seedAgent(db, "agent-inc2-task1");
		await db.insert(tasks).values({
			id: "task-inc2-1",
			betId,
			teamId,
			title: "Seam task",
			state: "proposed",
			createdAt: NOW,
			updatedAt: NOW,
		});

		const port = buildSeamPort("agent-inc2-task1", app);
		const found = await port.work.getTaskById("task-inc2-1");

		expect(found?.betId).toBe(betId);
		expect(found?.teamId).toBe(teamId);
	});

	test("getBetById reaches the real GET /bets/:id route", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-key-bet");
		const { betId } = await seedTeamAndBet(db, { suffix: "bet1" });
		await seedAgent(db, "agent-inc2-bet1");

		const port = buildSeamPort("agent-inc2-bet1", app);
		const found = await port.work.getBetById(betId);

		expect(found?.status).toBe("active");
	});

	test("updateBetById reaches the real PATCH /bets/:id route and the row lands in the DB", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-key-updatebet");
		const { betId } = await seedTeamAndBet(db, { suffix: "bet2", betStatus: "active" });
		await seedAgent(db, "agent-inc2-bet2");

		const port = buildSeamPort("agent-inc2-bet2", app);
		await port.work.updateBetById(betId, {
			doneCondition: "Ship it",
			hypothesis: "Users will love it",
		});

		const [row] = await db.select().from(bets).where(eq(bets.id, betId)).limit(1);
		expect(row?.doneCondition).toBe("Ship it");
		expect(row?.hypothesis).toBe("Users will love it");
	});

	test("createTask reaches the real POST /tasks route (a real row lands in the DB)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-key-createtask");
		const { teamId, betId } = await seedTeamAndBet(db, { suffix: "task2" });
		await seedAgent(db, "agent-inc2-task2");

		const port = buildSeamPort("agent-inc2-task2", app);
		const created = await port.work.createTask({ betId, title: "New seam task" });

		expect(created.betId).toBe(betId);
		expect(created.teamId).toBe(teamId);

		const [row] = await db.select().from(tasks).where(eq(tasks.id, created.id)).limit(1);
		expect(row).toBeDefined();
		expect(row?.title).toBe("New seam task");
	});

	test("appendTaskNote reaches the real atomic-append route (notes land in the DB)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-key-appendnote");
		const { teamId, betId } = await seedTeamAndBet(db, { suffix: "task3" });
		await seedAgent(db, "agent-inc2-task3");
		await db.insert(tasks).values({
			id: "task-inc2-3",
			betId,
			teamId,
			title: "Note target",
			state: "proposed",
			createdAt: NOW,
			updatedAt: NOW,
		});

		const port = buildSeamPort("agent-inc2-task3", app);
		const result = await port.work.appendTaskNote("task-inc2-3", "[note] discovered a thing");

		expect(result?.id).toBe("task-inc2-3");
		const [row] = await db.select().from(tasks).where(eq(tasks.id, "task-inc2-3")).limit(1);
		expect(row?.notes).toContain("discovered a thing");
	});

	test("appendTaskNote against a nonexistent task resolves undefined (task-not-found signal, no throw)", async ({
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-key-appendnote-404");
		const port = buildSeamPort("agent-inc2-missing", app);
		const result = await port.work.appendTaskNote("no-such-task", "irrelevant");
		expect(result).toBeUndefined();
	});

	test("getItemById reaches the real item detail route", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-key-getitem");
		await seedAgent(db, "agent-inc2-item1");
		const threadId = "thread-inc2-item1";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-x",
			initiatorId: "agent-inc2-item1",
			participants: JSON.stringify(["agent-inc2-item1"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(items).values({
			id: "item-inc2-1",
			sourceAgentId: "agent-inc2-item1",
			title: "Seam item",
			riskTier: "low",
			kind: "review",
			verb: "review",
			threadId,
			createdAt: NOW,
		});

		const port = buildSeamPort("agent-inc2-item1", app);
		const found = await port.work.getItemById("item-inc2-1");

		expect(found?.riskTier).toBe("low");
		expect(found?.kind).toBe("review");
	});

	test("updateItemById reaches the real item-patch route (row lands in the DB)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-key-updateitem");
		await seedAgent(db, "agent-inc2-item2");
		const threadId = "thread-inc2-item2";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-x",
			initiatorId: "agent-inc2-item2",
			participants: JSON.stringify(["agent-inc2-item2"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		await db.insert(items).values({
			id: "item-inc2-2",
			sourceAgentId: "agent-inc2-item2",
			title: "Seam item 2",
			riskTier: "low",
			kind: null,
			threadId,
			createdAt: NOW,
		});

		const port = buildSeamPort("agent-inc2-item2", app);
		await port.work.updateItemById("item-inc2-2", { riskTier: "high", kind: "escalation" });

		const [row] = await db.select().from(items).where(eq(items.id, "item-inc2-2")).limit(1);
		expect(row?.riskTier).toBe("high");
		expect(row?.kind).toBe("escalation");
	});

	test("createItem reaches the real POST /conversations/items route (a real row lands in the DB)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-key-createitem");
		await seedAgent(db, "agent-inc2-item3");
		const threadId = "thread-inc2-item3";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-x",
			initiatorId: "agent-inc2-item3",
			participants: JSON.stringify(["agent-inc2-item3"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});

		const port = buildSeamPort("agent-inc2-item3", app);
		const created = await port.work.createItem({
			threadId,
			title: "A review item",
			kind: "review",
			riskTier: "medium",
		});

		const [row] = await db.select().from(items).where(eq(items.id, created.id)).limit(1);
		expect(row).toBeDefined();
		expect(row?.title).toBe("A review item");
		expect(row?.riskTier).toBe("medium");
	});

	test("findItemByReasoningMarker reaches the real reasoning-marker search route", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-key-marker");
		await seedAgent(db, "agent-inc2-item4");
		const threadId = "thread-inc2-item4";
		await db.insert(threads).values({
			id: threadId,
			hostKind: "task",
			hostId: "task-x",
			initiatorId: "agent-inc2-item4",
			participants: JSON.stringify(["agent-inc2-item4"]),
			lastActiveAt: NOW,
			createdAt: NOW,
		});
		const marker = "au21-inc2-unique-marker";
		await db.insert(items).values({
			id: "item-inc2-marker",
			sourceAgentId: "agent-inc2-item4",
			title: "Markered item",
			reasoning: `context::${marker}::end`,
			threadId,
			createdAt: NOW,
		});

		const port = buildSeamPort("agent-inc2-item4", app);
		const found = await port.work.findItemByReasoningMarker(marker);

		expect(found?.id).toBe("item-inc2-marker");
	});

	test("createArtifact reaches the real POST /artifacts route (a real row lands in the DB)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-key-artifact");
		const { teamId, betId } = await seedTeamAndBet(db, { suffix: "art1" });
		await seedAgent(db, "agent-inc2-art1");
		await db.insert(tasks).values({
			id: "task-inc2-art1",
			betId,
			teamId,
			title: "Producing task",
			state: "in_progress",
			ownerAgentId: "agent-inc2-art1",
			createdAt: NOW,
			updatedAt: NOW,
		});

		const port = buildSeamPort("agent-inc2-art1", app);
		const created = await port.work.createArtifact({
			producingTaskId: "task-inc2-art1",
			kind: "text",
		});

		expect(created.producingTaskId).toBe("task-inc2-art1");
		const [row] = await db.select().from(artifacts).where(eq(artifacts.id, created.id)).limit(1);
		expect(row).toBeDefined();
		expect(row?.kind).toBe("text");
	});

	test("a write with no credentials is rejected, not silently bypassed (auth/boundary middleware ran)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-key-noauth");
		const { teamId, betId } = await seedTeamAndBet(db, { suffix: "noauth" });
		await seedAgent(db, "agent-inc2-noauth");
		await db.insert(tasks).values({
			id: "task-inc2-noauth",
			betId,
			teamId,
			title: "Unauthed target",
			state: "proposed",
			createdAt: NOW,
			updatedAt: NOW,
		});

		// No withActorTransport wrapping — no X-API-Key on the request. If the
		// seam bypassed the real route's auth middleware, this would succeed.
		const port = buildCoreApiPort(
			withoutServiceTestAuth(createInProcessCoreApiTransport(app)),
		) as unknown as SeamCoreApiPortIncrement2;

		await expect(
			port.work.appendTaskNote("task-inc2-noauth", "should never land"),
		).rejects.toThrow();
	});
});

describe("CoreApiPort.users — Increment 2 (RED)", () => {
	test("getUserById reaches the real GET /users/:id route", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-key-getuser");
		await seedAgent(db, "agent-inc2-user1");

		const port = buildSeamPort("agent-inc2-user1", app);
		const found = await port.users.getUserById("agent-inc2-user1");

		expect(found?.name).toBe("Agent agent-inc2-user1");
	});

	test("listUsersByTeam reaches the real team-scoped user-listing route", async ({ db, app }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-key-listusers");
		const { teamMembersId } = await seedTeamAndBet(db, { suffix: "roster1" });
		await seedAgent(db, "agent-inc2-roster1", { teamId: teamMembersId });
		await seedAgent(db, "agent-inc2-roster2", { teamId: teamMembersId });
		// A control agent NOT on this team — must not appear in the result.
		await seedAgent(db, "agent-inc2-roster-other");

		const port = buildSeamPort("agent-inc2-roster1", app);
		const roster = await port.users.listUsersByTeam(teamMembersId);

		const ids = roster.map((u) => u.id).sort();
		expect(ids).toEqual(["agent-inc2-roster1", "agent-inc2-roster2"]);
	});
});
