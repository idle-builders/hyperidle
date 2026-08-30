/**
 * AU21 §9 Increment 4, Wave B — architecture.md §6 Decision B's placement
 * ruling: "`routine_run` → a resolver added to
 * `layers/core-api/routine/src/routine-service.ts`, co-located with the
 * scheduler once Decision B′/B″ move it core-side (Increment 4) — at that
 * point the emit site and the resolver are the same package."
 *
 * This resolver does what `resolveIntentInputInternal`'s "routine_run" case
 * used to do at drain time:
 *   1. Load the routine run; reject if it does not exist or its `outcome` is
 *      not `"running"`.
 *   2. Load the routine; reject if it is soft-deleted (`deletedAt`), not
 *      `active`, or its `state` is not `"active"`.
 *   3. Resolve the target agent: the routine's `ownerAgentId`.
 *   4. Validate the resolved target's runnability via the shared ast-`<userId>`
 *      invariant (`requireRunnableAgent`, `@hyperidle/users`).
 *   5. Bake: `defaultAgentId`, `sourceKind:"routine"`, `sourceId` (the RUN
 *      id, not the routine id — @lore AU9 correlation), `streamId:
 *      routine:<routineId>`, `teamId`, `taskId: null`, `sourceCorrelation:
 *      {routineId, routineRunId, teamId}`.
 *
 * @lore BA1 D5: scope comes from the OWNER AGENT, not `routines.team_id`
 * (the column is dropped). `seedRoutine` no longer takes `teamId`;
 * `seedAgent` does, and the resolver's `teamId` bake now tracks the agent's
 * team, not the routine's.
 */

import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeItems,
	routineRuns,
	routines,
	teams,
	users,
} from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import type { BakedContextBundle } from "@hyperidle/domain-model";
import { assembleSessionKnowledge } from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { requireRunnableAgent } from "@hyperidle/users";
import { eq } from "drizzle-orm";

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const createdAt = new Date().toISOString();
	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt });
}

async function seedAgent(
	db: HyperIdleDb,
	id: string,
	opts: { readonly status?: string; readonly kind?: string; readonly teamId?: string } = {},
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: opts.kind ?? "ai",
		name: `Agent ${id}`,
		role: "builder",
		status: opts.status ?? "active",
		teamId: opts.teamId ?? null,
		createdAt: new Date().toISOString(),
	});
}

async function seedRoutine(
	db: HyperIdleDb,
	options: {
		readonly routineId: string;
		readonly ownerAgentId: string;
		readonly active?: boolean;
		readonly state?: string;
		readonly deletedAt?: string | null;
		readonly prompt?: string | null;
	},
): Promise<void> {
	// The instruction is a knowledge document the routine points at.
	let promptKnowledgeId: string | null = null;
	if (options.prompt) {
		promptKnowledgeId = `ki-${options.routineId}-prompt`;
		const ts = new Date().toISOString();
		await db.insert(knowledgeItems).values({
			id: promptKnowledgeId,
			scopeKind: "factory",
			scopeId: null,
			topic: null,
			title: `${options.routineId} — prompt`,
			body: options.prompt,
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "test",
			createdAt: ts,
			updatedAt: ts,
		});
		// Kernel row and projection travel together, as knowledge always writes them.
		await db.insert(knowledgeAppProjection).values({
			id: `kp-${options.routineId}-prompt`,
			knowledgeItemId: promptKnowledgeId,
			layer: "L4",
			scopeId: null,
		});
	}
	await db.insert(routines).values({
		id: options.routineId,
		name: options.routineId,
		promptKnowledgeId,
		ownerAgentId: options.ownerAgentId,
		triggerType: "manual",
		active: options.active ?? true,
		state: options.state ?? "active",
		deletedAt: options.deletedAt ?? null,
	});
}

/** The resolver reads the prompt document through this port (Mechanism C). */
async function readKnowledgeBody(db: HyperIdleDb, id: string): Promise<string | null> {
	const [row] = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, id)).limit(1);
	return row?.body ?? null;
}

async function seedRun(
	db: HyperIdleDb,
	options: { readonly runId: string; readonly routineId: string; readonly outcome?: string },
): Promise<void> {
	await db.insert(routineRuns).values({
		id: options.runId,
		routineId: options.routineId,
		startedAt: new Date().toISOString(),
		outcome: options.outcome ?? "running",
	});
}

/**
 * @lore AU30: every case here except the `contextBundle` one passes its deps
 * through this helper rather than a fresh object literal — and a call
 * expression gets NO excess-property check. When `agentSelection` was dropped
 * from `RoutineRunResolverDeps`, `npm run check` flagged exactly one line in
 * this file (the `contextBundle` case's literal) while the helper-fed cases
 * compiled clean and would have failed only at runtime, in the integration
 * lane that `npm run test` excludes. If you remove a dep from that interface,
 * enumerate this file's cases by hand; the compiler will not do it for you.
 */
function buildDeps() {
	return { requireRunnableAgent };
}

describe("resolveRoutineRunRequest — emit-time routine_run resolver (routine)", () => {
	test("bakes the full request for a valid running run + eligible routine + owner not at capacity", async ({
		db,
	}) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-1");
		await seedAgent(db, "owner-rrun-1", { teamId: "team-rrun-1" });
		await seedRoutine(db, {
			routineId: "routine-rrun-1",
			ownerAgentId: "owner-rrun-1",
		});
		await seedRun(db, { runId: "run-rrun-1", routineId: "routine-rrun-1" });

		const baked = await resolveRoutineRunRequest(db, "run-rrun-1", buildDeps());

		expect(baked).toMatchObject({
			defaultAgentId: "owner-rrun-1",
			sourceKind: "routine",
			sourceId: "run-rrun-1",
			streamId: "routine:routine-rrun-1",
			teamId: "team-rrun-1",
			taskId: null,
			sourceCorrelation: {
				routineId: "routine-rrun-1",
				routineRunId: "run-rrun-1",
				teamId: "team-rrun-1",
			},
		});
	});

	// BA1 D4: a team-less owner still gets the bundle baked — with no team
	// bake needed here (no `assembleSessionKnowledge` supplied), the
	// contract is just "teamId absent, nothing throws".
	test("bakes teamId as undefined when the owner agent belongs to no team", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedAgent(db, "owner-rrun-noteam");
		await seedRoutine(db, {
			routineId: "routine-rrun-noteam",
			ownerAgentId: "owner-rrun-noteam",
		});
		await seedRun(db, { runId: "run-rrun-noteam", routineId: "routine-rrun-noteam" });

		const baked = await resolveRoutineRunRequest(db, "run-rrun-noteam", buildDeps());

		expect(baked.teamId).toBeUndefined();
		expect(baked.sourceCorrelation.teamId).toBeUndefined();
	});

	test("rejects when the routine run does not exist", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await expect(resolveRoutineRunRequest(db, "run-does-not-exist", buildDeps())).rejects.toThrow();
	});

	test("rejects when the routine run's outcome is not 'running'", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-2");
		await seedAgent(db, "owner-rrun-2", { teamId: "team-rrun-2" });
		await seedRoutine(db, {
			routineId: "routine-rrun-2",
			ownerAgentId: "owner-rrun-2",
		});
		await seedRun(db, { runId: "run-rrun-2", routineId: "routine-rrun-2", outcome: "success" });

		await expect(resolveRoutineRunRequest(db, "run-rrun-2", buildDeps())).rejects.toThrow();
	});

	test("rejects when the routine is soft-deleted", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-3");
		await seedAgent(db, "owner-rrun-3", { teamId: "team-rrun-3" });
		await seedRoutine(db, {
			routineId: "routine-rrun-3",
			ownerAgentId: "owner-rrun-3",
			deletedAt: new Date().toISOString(),
		});
		await seedRun(db, { runId: "run-rrun-3", routineId: "routine-rrun-3" });

		await expect(resolveRoutineRunRequest(db, "run-rrun-3", buildDeps())).rejects.toThrow();
	});

	test("rejects when the routine is inactive (active=false)", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-4");
		await seedAgent(db, "owner-rrun-4", { teamId: "team-rrun-4" });
		await seedRoutine(db, {
			routineId: "routine-rrun-4",
			ownerAgentId: "owner-rrun-4",
			active: false,
		});
		await seedRun(db, { runId: "run-rrun-4", routineId: "routine-rrun-4" });

		await expect(resolveRoutineRunRequest(db, "run-rrun-4", buildDeps())).rejects.toThrow();
	});

	test("rejects when the routine's state is not 'active' (e.g. 'paused')", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-5");
		await seedAgent(db, "owner-rrun-5", { teamId: "team-rrun-5" });
		await seedRoutine(db, {
			routineId: "routine-rrun-5",
			ownerAgentId: "owner-rrun-5",
			state: "paused",
		});
		await seedRun(db, { runId: "run-rrun-5", routineId: "routine-rrun-5" });

		await expect(resolveRoutineRunRequest(db, "run-rrun-5", buildDeps())).rejects.toThrow();
	});

	test("rejects when the resolved owner is not a runnable AI agent", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-11");
		await seedAgent(db, "owner-rrun-11", { status: "retired", teamId: "team-rrun-11" });
		await seedRoutine(db, {
			routineId: "routine-rrun-11",
			ownerAgentId: "owner-rrun-11",
		});
		await seedRun(db, { runId: "run-rrun-11", routineId: "routine-rrun-11" });

		await expect(resolveRoutineRunRequest(db, "run-rrun-11", buildDeps())).rejects.toThrow();
	});
});

/**
 * AU21 §9 Increment 12 (Decision H3), Wave B — `routine_run` bakes a
 * `contextBundle` (`kind:"routine"`) with routine/agent/team content + the
 * ranked+budgeted knowledge bundle (`@hyperidle/knowledge`'s
 * `assembleSessionKnowledge`, Wave A).
 *
 * @lore BA1 D4: the bake gate is now `assembleSessionKnowledge` alone (not
 * "both deps AND a team row found") — a team-less owner still gets the
 * bundle, with `team: null` and `knowledge: []`. `getTeamById` stays
 * optional Mechanism-C plumbing, now driven by the AGENT's team.
 */
describe("resolveRoutineRunRequest — contextBundle baking (Increment 12 Wave B)", () => {
	test("bakes a contextBundle (kind:'routine') with routine/agent/team content + ranked knowledge", async ({
		db,
	}) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-ctx-1");
		await seedAgent(db, "owner-rrun-ctx-1", { teamId: "team-rrun-ctx-1" });
		await seedRoutine(db, {
			routineId: "routine-rrun-ctx-1",
			ownerAgentId: "owner-rrun-ctx-1",
		});
		await seedRun(db, { runId: "run-rrun-ctx-1", routineId: "routine-rrun-ctx-1" });

		const now = new Date().toISOString();
		await db.insert(knowledgeItems).values({
			id: "item-rrun-ctx-l4",
			scopeKind: "factory",
			scopeId: null,
			title: "Factory-wide practice",
			body: "Applies everywhere.",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "owner-rrun-ctx-1",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(knowledgeAppProjection).values({
			id: "proj-rrun-ctx-l4",
			knowledgeItemId: "item-rrun-ctx-l4",
			layer: "L4",
			scopeId: null,
		});

		const baked = await resolveRoutineRunRequest(db, "run-rrun-ctx-1", {
			requireRunnableAgent,
			getKnowledgeBody: readKnowledgeBody,
			getTeamById: (d: HyperIdleDb, id: string) => getTeam(d, { id }),
			assembleSessionKnowledge,
		});

		const team = await getTeam(db, { id: "team-rrun-ctx-1" });

		expect(baked.contextBundle).toMatchObject({
			kind: "routine",
			routine: {
				id: "routine-rrun-ctx-1",
				name: "routine-rrun-ctx-1",
			},
			agent: { id: "owner-rrun-ctx-1", name: "Agent owner-rrun-ctx-1", role: "builder" },
			team: { id: "team-rrun-ctx-1", name: team?.name },
			knowledge: expect.arrayContaining([expect.objectContaining({ id: "item-rrun-ctx-l4" })]),
		});
	});

	// BA1 D4 bakes `team: null` for a team-less owner rather than omitting the
	// bundle — the prompt still has to reach the agent.
	//
	// This test used to also assert that knowledge assembly was SKIPPED for
	// such an owner, on the reasoning that nothing can be scored without a
	// team. That stopped being true once capability items (skill/rule/
	// agent_file) arrived: they are scoped factory / team / agent, and the
	// factory- and agent-scoped ones need no team. Skipping meant a plugin's
	// own agent — created `agentCategory: "individual"`, so team-less by
	// construction — could never receive the skills that same plugin
	// installed for it. The assembler is now always called; the team only
	// decides what the team-scoped layers contribute.
	test("assembles knowledge for a team-less owner and still bakes team:null", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedAgent(db, "owner-rrun-ctx-noteam");
		await seedRoutine(db, {
			routineId: "routine-rrun-ctx-noteam",
			ownerAgentId: "owner-rrun-ctx-noteam",
			prompt: "Summarize the week.",
		});
		await seedRun(db, {
			runId: "run-rrun-ctx-noteam",
			routineId: "routine-rrun-ctx-noteam",
		});

		let assembleCalled = false;
		let receivedTeamId: string | undefined = "unset";
		const baked = await resolveRoutineRunRequest(db, "run-rrun-ctx-noteam", {
			requireRunnableAgent,
			getKnowledgeBody: readKnowledgeBody,
			getTeamById: (d: HyperIdleDb, id: string) => getTeam(d, { id }),
			assembleSessionKnowledge: async (_db, input) => {
				assembleCalled = true;
				receivedTeamId = input.teamId;
				return [
					{
						id: "skill-rrun-ctx-noteam",
						title: "knowledge-decay",
						body: "# Knowledge decay sweep",
						role: "skill",
					} as never,
				];
			},
		});

		expect(assembleCalled).toBe(true);
		// No team to scope by — the assembler is told so plainly rather than
		// being handed a stand-in id.
		expect(receivedTeamId).toBeUndefined();
		expect(baked.contextBundle).toMatchObject({
			kind: "routine",
			routine: { id: "routine-rrun-ctx-noteam", prompt: "Summarize the week." },
			team: null,
			knowledge: expect.arrayContaining([
				expect.objectContaining({ id: "skill-rrun-ctx-noteam", role: "skill" }),
			]),
		});
	});
});

/**
 * BA9c — triggerEvent threading through resolveRoutineRunRequest.
 *
 * The resolver carries whatever triggerEvent the caller supplies into the baked
 * contextBundle. The subject assembly (loading the actual task/bet rows) happens
 * in the scheduler — tested via the scheduler test suite. This suite verifies
 * only that the threaded value is present and correct in the bundle.
 */
describe("resolveRoutineRunRequest — triggerEvent threading (BA9c)", () => {
	test("includes triggerEvent in contextBundle when a task triggerEvent is supplied", async ({
		db,
	}) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-ba9c-trig-1");
		await seedAgent(db, "owner-ba9c-trig-1", { teamId: "team-ba9c-trig-1" });
		await seedRoutine(db, {
			routineId: "routine-ba9c-trig-1",
			ownerAgentId: "owner-ba9c-trig-1",
		});
		await seedRun(db, { runId: "run-ba9c-trig-1", routineId: "routine-ba9c-trig-1" });

		const triggerEvent = {
			type: "task_state_changed",
			timestamp: 1_700_000_000_000,
			transition: { from: "in_progress", to: "done" },
			subject: {
				kind: "task" as const,
				task: { id: "tsk-x", title: "Feature Alpha", description: null, state: "done" },
				bet: { id: "bet-x", description: "Ship Alpha", appetite: "small", doneCondition: null },
			},
		};

		const baked = await resolveRoutineRunRequest(db, "run-ba9c-trig-1", {
			...buildDeps(),
			getTeamById: (d, id) => getTeam(d, { id }),
			assembleSessionKnowledge,
			triggerEvent,
		});

		const routineBundle = baked.contextBundle as
			| Extract<BakedContextBundle, { kind: "routine" }>
			| undefined;
		expect(routineBundle?.triggerEvent).toMatchObject({
			type: "task_state_changed",
			transition: { from: "in_progress", to: "done" },
			subject: {
				kind: "task",
				task: { id: "tsk-x", title: "Feature Alpha", state: "done" },
				bet: { id: "bet-x", description: "Ship Alpha", appetite: "small", doneCondition: null },
			},
		});
	});

	test("contextBundle has no triggerEvent when none supplied (clock-fired path)", async ({
		db,
	}) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedAgent(db, "owner-ba9c-clock-1");
		await seedRoutine(db, {
			routineId: "routine-ba9c-clock-1",
			ownerAgentId: "owner-ba9c-clock-1",
		});
		await seedRun(db, { runId: "run-ba9c-clock-1", routineId: "routine-ba9c-clock-1" });

		const baked = await resolveRoutineRunRequest(db, "run-ba9c-clock-1", buildDeps());

		const routineBundle2 = baked.contextBundle as
			| Extract<BakedContextBundle, { kind: "routine" }>
			| undefined;
		expect(routineBundle2?.triggerEvent).toBeUndefined();
	});

	test("team-less agent still receives triggerEvent in contextBundle", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedAgent(db, "owner-ba9c-noteam");
		await seedRoutine(db, {
			routineId: "routine-ba9c-noteam",
			ownerAgentId: "owner-ba9c-noteam",
		});
		await seedRun(db, { runId: "run-ba9c-noteam", routineId: "routine-ba9c-noteam" });

		const triggerEvent = {
			type: "bet_state_changed",
			timestamp: 1_700_000_001_000,
			transition: { from: "active", to: "completed" },
			subject: {
				kind: "bet" as const,
				bet: {
					id: "bet-y",
					description: "Ship the feature",
					state: "completed",
					appetite: "large",
					doneCondition: null,
				},
			},
		};

		const baked = await resolveRoutineRunRequest(db, "run-ba9c-noteam", {
			...buildDeps(),
			getTeamById: (d, id) => getTeam(d, { id }),
			assembleSessionKnowledge,
			triggerEvent,
		});

		// Team-less owner: team is null, knowledge is empty — but triggerEvent is present
		const routineBundle3 = baked.contextBundle as
			| Extract<BakedContextBundle, { kind: "routine" }>
			| undefined;
		expect(routineBundle3?.team).toBeNull();
		expect(routineBundle3?.triggerEvent?.type).toBe("bet_state_changed");
		expect(routineBundle3?.triggerEvent?.subject).toMatchObject({
			kind: "bet",
			bet: { id: "bet-y", description: "Ship the feature", appetite: "large", doneCondition: null },
		});
	});
});
