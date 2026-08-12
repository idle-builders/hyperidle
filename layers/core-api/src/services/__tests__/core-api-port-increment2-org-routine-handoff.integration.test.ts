/**
 * AU21 §9 Increment 2 (org/routine/handoff wave) — RED phase.
 *
 * Extends the §11 contract-test harness to the remaining `tool-handlers`
 * capabilities named in this wave's scope (`edge-disposition.md`'s
 * `org.{getTeam, getTeamMembers, createTeam, updateTeam}`,
 * `routine.{getRoutine, insertRoutine, updateRoutine}`, and `policy.handoff`
 * rows — all `§4 seam`):
 *
 *  - `ToolHandlersOrgAccessor`: getTeamById, getTeamMembersByTeamId,
 *    getTeamMembersById, createTeam, updateTeam, resolveReviewRecipientsForItem,
 *    persistScaffoldedAgents (`tool-handlers/src/ports.ts:92-132`).
 *  - `ToolHandlersRoutineAccessor`: insertRoutine, getRoutineById,
 *    updateRoutineById (`ports.ts:151-160`).
 *  - `ToolHandlersPolicyAccessor.handoff` (`ports.ts:319-326`), reached today
 *    via `handoff_to`'s raw `ports.policy.handoff(ctx.db, ctx.eventBus, params)`
 *    call (`tool-definitions.ts:340`).
 *
 * Every method below does not exist yet on `CoreApiPort`/`buildCoreApiPort` —
 * each test fails at RUNTIME (`TypeError: ... is not a function` / `Cannot
 * read properties of undefined`), not at import-resolution time, because the
 * composition function + transport already exist from Increment 1. RED for
 * the right reason: missing implementation, not a typo.
 *
 * Backing-route plan (documented here for the GREEN-phase builder — verified
 * against real route source, not assumed):
 *  - `org.getTeamById`       → NEW `GET /org/teams/:teamId` (no narrow
 *    existence/name read exists — the only detail route today, `GET
 *    /teams/:teamId` in `teams-routes.ts`, builds a full enriched `TeamDetail`
 *    (roster + health + bets) and 500s if the `teamMembers` companion is
 *    missing — wrong shape and wrong failure behavior for this narrow read).
 *  - `org.getTeamMembersByTeamId` → NEW `GET /org/teams/:teamId/membership`
 *    (no existing route resolves the `teamMembers` row keyed by `teams.id`
 *    alone, narrowly).
 *  - `org.getTeamMembersById` → NEW `GET /org/team-members/:teamMembersId`
 *    (the AK4 two-hop resolution's second hop, keyed by `teamMembers.id` —
 *    no existing route).
 *  - `org.createTeam`        → NEW `POST /org/teams` (the atomic
 *    `teams`+`teamMembers` insert ONLY). The existing `POST /teams`
 *    (`teams-routes.ts:338`) is a monolithic composite action that ALSO
 *    scaffolds the default agent roster, provisions routines, writes an org
 *    edge, and drafts a welcome message — reusing it here would DOUBLE the
 *    scaffold/provision work the `create_team` tool already performs itself
 *    immediately afterward via `agentSelection.resolveScaffoldSpecs` +
 *    `persistScaffoldedAgents` + `dispatch.provisionTeamRoutines`.
 *  - `org.updateTeam`        → REUSE existing `PATCH /teams/:teamId`,
 *    EXTENDED to accept an optional `leadAgentId` field (today only accepts
 *    `phase`) — the tool's one real call site (`create_team`'s
 *    `updateTeam(teamId, {leadAgentId})`) needs exactly this field.
 *  - `org.resolveReviewRecipientsForItem` → NEW `GET
 *    /org/review-recipients?userId=&agentRole=&teamId=` (a pure org-edge
 *    routing query — no UI action reaches it directly today).
 *  - `org.persistScaffoldedAgents` → NEW `POST /org/scaffolded-agents` (the
 *    collapsed Kernel-persist helper — even `POST /teams` calls the
 *    underlying function directly in-process, never via HTTP; no UI route
 *    exists to reuse).
 *  - `routine.insertRoutine`   → REUSE existing `POST /routines`
 *    (`routines-routes.ts:94` — field-for-field match with
 *    `create_routine`'s own validated shape).
 *  - `routine.getRoutineById`  → REUSE existing `GET /routines/:id` (a
 *    heavier enriched `RoutineDetail` response incl. run history + budget
 *    stats — narrow fields extracted, same shape-tolerance precedent as
 *    `work.getBetById` reusing `GET /bets/:id`). Already 404s a soft-deleted
 *    routine, so a found result never carries `deletedAt`.
 *  - `routine.updateRoutineById` → REUSE existing `PATCH /routines/:id`
 *    (`updateRoutineSchema` already accepts every field `update_routine`
 *    sets: name, description, state, triggerConfig — AU21 Increment 14a:
 *    `costCapPerRunMinor`/`costCapMonthlyMinor` HARD-DELETED, no replacement).
 *  - `policy.handoff`          → REUSE existing `POST /tasks/:id/handoff`
 *    (`tasks.ts:270` — the literal route `@hyperidle/policy`'s
 *    `buildHandoff` is already wired to; becomes `CoreApiWorkPort.handoffTask`
 *    since the backing route lives under `/tasks`).
 */

import {
	buildCoreApiPort,
	createInProcessCoreApiTransport,
	withActorTransport,
} from "@hyperidle/agent-orchestration";
import {
	bets,
	type HyperIdleDb,
	orgEdges,
	routines,
	sessions,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";

const NOW = "2026-07-28T00:00:00.000Z";

interface SeamTeamView {
	readonly id: string;
	readonly name: string;
}

interface SeamRoutineView {
	readonly name: string;
	readonly state: string;
	readonly deletedAt: string | null;
}

interface SeamHandoffResult {
	readonly status: "success" | "escalated";
	readonly targetAgentId?: string;
	readonly escalationItemId?: string;
}

interface SeamCoreApiPortIncrement2OrgRoutineHandoff {
	readonly org: {
		getTeamById(teamId: string): Promise<SeamTeamView | undefined>;
		getTeamMembersByTeamId(teamId: string): Promise<{ readonly id: string } | undefined>;
		getTeamMembersById(teamMembersId: string): Promise<{ readonly teamId: string } | undefined>;
		createTeam(input: {
			readonly id: string;
			readonly name: string;
			readonly phase: string;
			readonly functions: string | null;
			readonly factoryDbPath: string | null;
			readonly createdAt: string;
			readonly teamMembersId: string;
			readonly capacity?: number;
			readonly activeBets?: number;
			readonly formedAt?: string;
		}): Promise<void>;
		updateTeam(
			teamId: string,
			patch: { phase?: string; activeBets?: number; leadAgentId?: string },
		): Promise<void>;
		resolveReviewRecipientsForItem(ctx: {
			readonly userId: string;
			readonly agentRole: string | undefined;
			readonly teamId: string | undefined;
		}): Promise<readonly string[]>;
		persistScaffoldedAgents(
			teamMembersId: string | null,
			specs: readonly Record<string, unknown>[],
		): Promise<{ readonly agentIds: readonly string[]; readonly leadAgentId: string | null }>;
		provisionTeamRoutines(input: {
			readonly teamId: string;
			readonly ownerByRole: Readonly<Record<string, string | undefined>>;
			readonly leadAgentId: string;
		}): Promise<void>;
	};
	readonly routine: {
		insertRoutine(input: Record<string, unknown>): Promise<void>;
		getRoutineById(id: string): Promise<SeamRoutineView | undefined>;
		updateRoutineById(id: string, updates: Record<string, unknown>): Promise<void>;
	};
	readonly work: {
		handoffTask(
			taskId: string,
			input: {
				readonly sessionId: string;
				readonly toAgent?: string;
				readonly toRole?: string;
				readonly toHuman?: boolean;
				readonly reason: string;
				readonly artifacts?: readonly string[];
				readonly remainingWork?: readonly string[];
			},
		): Promise<SeamHandoffResult>;
	};
}

function buildSeamPort(actorId: string, app: Hono): SeamCoreApiPortIncrement2OrgRoutineHandoff {
	const transport = withActorTransport(createInProcessCoreApiTransport(app), { userId: actorId });
	return buildCoreApiPort(transport) as unknown as SeamCoreApiPortIncrement2OrgRoutineHandoff;
}

async function seedTeam(
	db: HyperIdleDb,
	ids: ScopedIds,
	prefix: string,
): Promise<{ readonly teamId: string; readonly teamMembersId: string }> {
	const teamId = ids(`${prefix}-team`);
	const teamMembersId = ids(`${prefix}-tm`);
	await db
		.insert(teams)
		.values({ id: teamId, name: "Org Inc2 Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
	return { teamId, teamMembersId };
}

async function seedAgent(
	db: HyperIdleDb,
	id: string,
	opts: { readonly teamId?: string; readonly role?: string; readonly kind?: "ai" | "human" } = {},
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: opts.kind ?? "ai",
		name: `Agent ${id}`,
		role: opts.role ?? "engineer",
		status: "active",
		teamId: opts.teamId,
		createdAt: NOW,
	});
}

describe("CoreApiPort.org — Increment 2 org/routine/handoff wave (RED)", () => {
	test("getTeamById reaches the real narrow team-detail route", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-org-key-getteam"));
		const { teamId } = await seedTeam(db, ids, "getteam1");
		const agentId = ids("agent-org-getteam1");
		await seedAgent(db, agentId);

		const port = buildSeamPort(agentId, app);
		const found = await port.org.getTeamById(teamId);

		expect(found?.id).toBe(teamId);
		expect(found?.name).toBe("Org Inc2 Team");
	});

	test("getTeamById against a nonexistent team resolves undefined (no throw)", async ({
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-org-key-getteam-404"));
		const port = buildSeamPort(ids("agent-org-missing"), app);
		const found = await port.org.getTeamById(ids("no-such-team"));
		expect(found).toBeUndefined();
	});

	test("getTeamMembersByTeamId reaches the real team-membership route (keyed by teams.id)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-org-key-getmembers"));
		const { teamId, teamMembersId } = await seedTeam(db, ids, "getmembers1");
		const agentId = ids("agent-org-getmembers1");
		await seedAgent(db, agentId);

		const port = buildSeamPort(agentId, app);
		const found = await port.org.getTeamMembersByTeamId(teamId);

		expect(found?.id).toBe(teamMembersId);
	});

	test("getTeamMembersById reaches the real second-hop route (keyed by teamMembers.id)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-org-key-membersbyid"));
		const { teamId, teamMembersId } = await seedTeam(db, ids, "membersbyid1");
		const agentId = ids("agent-org-membersbyid1");
		await seedAgent(db, agentId);

		const port = buildSeamPort(agentId, app);
		const found = await port.org.getTeamMembersById(teamMembersId);

		expect(found?.teamId).toBe(teamId);
	});

	test("createTeam reaches the real atomic team+teamMembers insert route (real rows land in the DB, no scaffolding side effects)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-org-key-createteam"));
		const agentId = ids("agent-org-createteam1");
		await seedAgent(db, agentId);
		const teamId = ids("team-org-inc2-created1");
		const teamMembersId = ids("tm-org-inc2-created1");

		const port = buildSeamPort(agentId, app);
		await port.org.createTeam({
			id: teamId,
			name: "Freshly Created",
			phase: "build",
			functions: JSON.stringify(["development"]),
			factoryDbPath: null,
			createdAt: NOW,
			teamMembersId,
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});

		const [teamRow] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
		expect(teamRow?.name).toBe("Freshly Created");
		const [memberRow] = await db
			.select()
			.from(teamMembers)
			.where(eq(teamMembers.id, teamMembersId))
			.limit(1);
		expect(memberRow?.teamId).toBe(teamId);

		// No agents should have been scaffolded — this is the ATOMIC insert only,
		// distinct from the heavier `POST /teams` UI flow.
		const scaffoldedAgents = await db.select().from(users).where(eq(users.teamId, teamMembersId));
		expect(scaffoldedAgents).toHaveLength(0);
	});

	test("updateTeam reaches the real team-patch route with leadAgentId (row lands in the DB)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-org-key-updateteam"));
		const { teamId, teamMembersId } = await seedTeam(db, ids, "updateteam1");
		const agentId = ids("agent-org-updateteam1");
		await seedAgent(db, agentId, { teamId: teamMembersId });

		const port = buildSeamPort(agentId, app);
		await port.org.updateTeam(teamId, { leadAgentId: agentId });

		const [row] = await db
			.select()
			.from(teamMembers)
			.where(eq(teamMembers.id, teamMembersId))
			.limit(1);
		expect(row?.leadAgentId).toBe(agentId);
	});

	test("resolveReviewRecipientsForItem reaches the real review-routing route (org edge match)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-org-key-reviewrecipients"));
		const targetAgentId = ids("agent-org-reviewer-target");
		const humanId = ids("human-org-reviewer");
		await seedAgent(db, targetAgentId, { role: "builder" });
		await seedAgent(db, humanId, { kind: "human", role: "founder" });
		const edgeId = ids("edge-inc2-1");
		await db.insert(orgEdges).values({
			id: edgeId,
			fromUserId: humanId,
			mechanism: "function",
			target: "builder",
			createdAt: NOW,
		});

		const port = buildSeamPort(targetAgentId, app);
		const recipients = await port.org.resolveReviewRecipientsForItem({
			userId: targetAgentId,
			agentRole: "builder",
			teamId: undefined,
		});

		expect(recipients).toContain(humanId);
	});

	test("persistScaffoldedAgents reaches the real scaffold-persist route (real user rows land in the DB)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-org-key-scaffold"));
		const { teamMembersId } = await seedTeam(db, ids, "scaffold1");
		const callerId = ids("agent-org-scaffold-caller");
		await seedAgent(db, callerId);

		const port = buildSeamPort(callerId, app);
		const result = await port.org.persistScaffoldedAgents(teamMembersId, [
			{
				role: "product_manager",
				name: "Scaffolded PM",
				agentCategory: "team",
				systemPrompt: null,
			},
		]);

		expect(result.agentIds).toHaveLength(1);
		expect(result.leadAgentId).toBe(result.agentIds[0]);

		const [row] = await db
			.select()
			.from(users)
			.where(eq(users.id, result.agentIds[0] ?? "no-such-id"))
			.limit(1);
		expect(row?.name).toBe("Scaffolded PM");
		expect(row?.teamId).toBe(teamMembersId);
	});

	// @lore AU21 §9 Increment 9 (forensic-triage wave, second pass): added when
	// `provisionTeamRoutines` moved from an opaque same-process
	// `ToolHandlersRoutineAccessor`/`dispatch` pass-through onto this seam
	// (`POST /org/team-routines`) — closes the `tool-handlers -> routine`
	// hidden composition edge the guard flagged. Same pattern as
	// `persistScaffoldedAgents` above (no 1:1 UI route, new narrow route).
	test("provisionTeamRoutines reaches the real team-routines route (real routine rows land in the DB)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-org-key-provision-routines"));
		const { teamId } = await seedTeam(db, ids, "provision1");
		const leadId = ids("agent-org-provision-lead");
		await seedAgent(db, leadId);

		const port = buildSeamPort(leadId, app);
		await port.org.provisionTeamRoutines({
			teamId,
			ownerByRole: { assistant: leadId },
			leadAgentId: leadId,
		});

		const rows = await db.select().from(routines).where(eq(routines.teamId, teamId));
		expect(rows.length).toBe(4);
		expect(rows.every((r) => r.ownerAgentId === leadId)).toBe(true);
	});

	test("a write with no credentials is rejected, not silently bypassed (auth/boundary middleware ran)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-org-key-noauth"));
		const { teamMembersId } = await seedTeam(db, ids, "noauth1");

		// No withActorTransport wrapping — no X-API-Key on the request.
		const port = buildCoreApiPort(
			createInProcessCoreApiTransport(app),
		) as unknown as SeamCoreApiPortIncrement2OrgRoutineHandoff;

		await expect(
			port.org.persistScaffoldedAgents(teamMembersId, [
				{
					role: "builder",
					name: "Should never land",
					agentCategory: "team",
					systemPrompt: null,
				},
			]),
		).rejects.toThrow();
	});
});

describe("CoreApiPort.routine — Increment 2 org/routine/handoff wave (RED)", () => {
	test("insertRoutine reaches the real POST /routines route (a real row lands in the DB)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-routine-key-insert"));
		const { teamId } = await seedTeam(db, ids, "routine1");
		const ownerId = ids("agent-routine-owner1");
		await seedAgent(db, ownerId);
		const routineId = ids("routine-inc2-1");

		const port = buildSeamPort(ownerId, app);
		await port.routine.insertRoutine({
			id: routineId,
			name: "Daily standup",
			description: null,
			teamId,
			ownerAgentId: ownerId,
			triggerType: "calendar",
			triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
			state: "active",
			active: true,
			nextRunAt: NOW,
			createdAt: NOW,
		});

		const [row] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
		expect(row).toBeDefined();
		expect(row?.name).toBe("Daily standup");
	});

	test("getRoutineById reaches the real routine-detail route", async ({ db, app, ids }) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-routine-key-get"));
		const { teamId } = await seedTeam(db, ids, "routine2");
		const ownerId = ids("agent-routine-owner2");
		await seedAgent(db, ownerId);
		const routineId = ids("routine-inc2-2");
		await db.insert(routines).values({
			id: routineId,
			name: "Weekly retro",
			teamId,
			ownerAgentId: ownerId,
			triggerType: "calendar",
			triggerConfig: JSON.stringify({ cron: "0 9 * * MON" }),
			state: "active",
			active: true,
			createdAt: NOW,
		});

		const port = buildSeamPort(ownerId, app);
		const found = await port.routine.getRoutineById(routineId);

		expect(found?.name).toBe("Weekly retro");
		expect(found?.state).toBe("active");
	});

	test("getRoutineById against a nonexistent routine resolves undefined (no throw)", async ({
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-routine-key-get-404"));
		const port = buildSeamPort(ids("agent-routine-missing"), app);
		const found = await port.routine.getRoutineById(ids("no-such-routine"));
		expect(found).toBeUndefined();
	});

	test("updateRoutineById reaches the real PATCH /routines/:id route (row lands in the DB)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-routine-key-update"));
		const { teamId } = await seedTeam(db, ids, "routine3");
		const ownerId = ids("agent-routine-owner3");
		await seedAgent(db, ownerId);
		const routineId = ids("routine-inc2-3");
		await db.insert(routines).values({
			id: routineId,
			name: "Old name",
			teamId,
			ownerAgentId: ownerId,
			triggerType: "calendar",
			triggerConfig: JSON.stringify({ cron: "0 9 * * *" }),
			state: "active",
			active: true,
			createdAt: NOW,
		});

		const port = buildSeamPort(ownerId, app);
		await port.routine.updateRoutineById(routineId, {
			name: "New name",
			state: "paused",
		});

		const [row] = await db.select().from(routines).where(eq(routines.id, routineId)).limit(1);
		expect(row?.name).toBe("New name");
		expect(row?.state).toBe("paused");
	});
});

describe("CoreApiPort.work.handoffTask — Increment 2 org/routine/handoff wave (RED)", () => {
	async function seedHandoffFixture(
		db: HyperIdleDb,
		ids: ScopedIds,
		prefix: string,
	): Promise<{ readonly taskId: string; readonly sessionId: string }> {
		const { teamId, teamMembersId } = await seedTeam(db, ids, `handoff-${prefix}`);
		const agentA = ids(`agent-handoff-a-${prefix}`);
		const agentB = ids(`agent-handoff-b-${prefix}`);
		await seedAgent(db, agentA, { teamId: teamMembersId });
		await seedAgent(db, agentB, { teamId: teamMembersId });
		const betId = ids(`bet-handoff-${prefix}`);
		await db.insert(bets).values({
			id: betId,
			teamId,
			description: "Handoff bet",
			appetite: "small",
			status: "active",
			createdAt: NOW,
		});
		const taskId = ids(`task-handoff-${prefix}`);
		await db.insert(tasks).values({
			id: taskId,
			betId,
			teamId,
			ownerAgentId: agentA,
			title: "Handoff task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		});
		const sessionId = ids(`session-handoff-${prefix}`);
		await db.insert(sessions).values({
			id: sessionId,
			taskId,
			agentId: agentA,
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});
		return { taskId, sessionId };
	}

	test("handoffTask reaches the real POST /tasks/:id/handoff route — task ownership transfers", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-handoff-key-1"));
		const { taskId, sessionId } = await seedHandoffFixture(db, ids, "1");
		const agentA = ids("agent-handoff-a-1");
		const agentB = ids("agent-handoff-b-1");

		const port = buildSeamPort(agentA, app);
		const result = await port.work.handoffTask(taskId, {
			sessionId,
			toAgent: agentB,
			reason: "handing off via the seam",
		});

		expect(result.status).toBe("success");
		expect(result.targetAgentId).toBe(agentB);

		const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
		expect(row?.ownerAgentId).toBe(agentB);
	});

	test("a handoff write with no credentials is rejected, not silently bypassed (auth/boundary middleware ran)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-handoff-key-noauth"));
		const { taskId, sessionId } = await seedHandoffFixture(db, ids, "noauth");
		const agentB = ids("agent-handoff-b-noauth");

		const port = buildCoreApiPort(
			createInProcessCoreApiTransport(app),
		) as unknown as SeamCoreApiPortIncrement2OrgRoutineHandoff;

		await expect(
			port.work.handoffTask(taskId, {
				sessionId,
				toAgent: agentB,
				reason: "should never land",
			}),
		).rejects.toThrow();
	});
});
