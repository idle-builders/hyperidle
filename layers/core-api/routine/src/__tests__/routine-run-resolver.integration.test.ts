/**
 * AU21 §9 Increment 4, Wave B (RED) — architecture.md §6 Decision B's
 * placement ruling: "`routine_run` → a resolver added to
 * `layers/core-api/routine/src/routine-service.ts`, co-located with the
 * scheduler once Decision B′/B″ move it core-side (Increment 4) — at that
 * point the emit site and the resolver are the same package."
 *
 * This resolver must do EXACTLY what `resolveIntentInputInternal`'s
 * "routine_run" case does today (`session-requests/src/service.ts:758-795`,
 * still present as of Wave A — Increment 4's own Wave B deletes it):
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
 * Currently RED: no `resolveRoutineRunRequest` export exists anywhere in
 * `routine-service.ts` (nor from its barrel, `@hyperidle/routine`) — this
 * dynamic import's destructure resolves to `undefined`, so calling it throws
 * `TypeError: ... is not a function` for every test below.
 *
 * @lore naming: the architecture doc does not pin an exact export name —
 * `resolveRoutineRunRequest` mirrors `resolveTaskRunRequest`/
 * `resolveBetDecompositionRequest`'s naming, flagged for reviewer
 * confirmation, same as every sibling resolver wave's RED-phase note.
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
import { assembleSessionKnowledge } from "@hyperidle/knowledge";
import { getTeam } from "@hyperidle/org";
import { requireRunnableAgent } from "@hyperidle/users";

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	const createdAt = new Date().toISOString();
	await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt });
	// The owner writes the membership row alongside the team.
}

async function seedAgent(
	db: HyperIdleDb,
	id: string,
	opts: { readonly status?: string; readonly kind?: string } = {},
): Promise<void> {
	await db.insert(users).values({
		id,
		kind: opts.kind ?? "ai",
		name: `Agent ${id}`,
		role: "builder",
		status: opts.status ?? "active",
		createdAt: new Date().toISOString(),
	});
}

async function seedRoutine(
	db: HyperIdleDb,
	options: {
		readonly routineId: string;
		readonly teamId: string;
		readonly ownerAgentId: string;
		readonly active?: boolean;
		readonly state?: string;
		readonly deletedAt?: string | null;
		readonly delegationAllowed?: boolean;
		readonly skillId?: string | null;
	},
): Promise<void> {
	await db.insert(routines).values({
		id: options.routineId,
		name: options.routineId,
		teamId: options.teamId,
		ownerAgentId: options.ownerAgentId,
		triggerType: "manual",
		active: options.active ?? true,
		state: options.state ?? "active",
		deletedAt: options.deletedAt ?? null,
		delegationAllowed: options.delegationAllowed ?? false,
		skillId: options.skillId ?? null,
	});
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
		await seedAgent(db, "owner-rrun-1");
		await seedRoutine(db, {
			routineId: "routine-rrun-1",
			teamId: "team-rrun-1",
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

	test("rejects when the routine run does not exist", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await expect(resolveRoutineRunRequest(db, "run-does-not-exist", buildDeps())).rejects.toThrow();
	});

	test("rejects when the routine run's outcome is not 'running'", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-2");
		await seedAgent(db, "owner-rrun-2");
		await seedRoutine(db, {
			routineId: "routine-rrun-2",
			teamId: "team-rrun-2",
			ownerAgentId: "owner-rrun-2",
		});
		await seedRun(db, { runId: "run-rrun-2", routineId: "routine-rrun-2", outcome: "success" });

		await expect(resolveRoutineRunRequest(db, "run-rrun-2", buildDeps())).rejects.toThrow();
	});

	test("rejects when the routine is soft-deleted", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-3");
		await seedAgent(db, "owner-rrun-3");
		await seedRoutine(db, {
			routineId: "routine-rrun-3",
			teamId: "team-rrun-3",
			ownerAgentId: "owner-rrun-3",
			deletedAt: new Date().toISOString(),
		});
		await seedRun(db, { runId: "run-rrun-3", routineId: "routine-rrun-3" });

		await expect(resolveRoutineRunRequest(db, "run-rrun-3", buildDeps())).rejects.toThrow();
	});

	test("rejects when the routine is inactive (active=false)", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-4");
		await seedAgent(db, "owner-rrun-4");
		await seedRoutine(db, {
			routineId: "routine-rrun-4",
			teamId: "team-rrun-4",
			ownerAgentId: "owner-rrun-4",
			active: false,
		});
		await seedRun(db, { runId: "run-rrun-4", routineId: "routine-rrun-4" });

		await expect(resolveRoutineRunRequest(db, "run-rrun-4", buildDeps())).rejects.toThrow();
	});

	test("rejects when the routine's state is not 'active' (e.g. 'paused')", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-5");
		await seedAgent(db, "owner-rrun-5");
		await seedRoutine(db, {
			routineId: "routine-rrun-5",
			teamId: "team-rrun-5",
			ownerAgentId: "owner-rrun-5",
			state: "paused",
		});
		await seedRun(db, { runId: "run-rrun-5", routineId: "routine-rrun-5" });

		await expect(resolveRoutineRunRequest(db, "run-rrun-5", buildDeps())).rejects.toThrow();
	});

	test("rejects when the resolved owner is not a runnable AI agent", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-11");
		await seedAgent(db, "owner-rrun-11", { status: "retired" });
		await seedRoutine(db, {
			routineId: "routine-rrun-11",
			teamId: "team-rrun-11",
			ownerAgentId: "owner-rrun-11",
		});
		await seedRun(db, { runId: "run-rrun-11", routineId: "routine-rrun-11" });

		await expect(resolveRoutineRunRequest(db, "run-rrun-11", buildDeps())).rejects.toThrow();
	});
});

/**
 * AU21 §9 Increment 12 (Decision H3), Wave B (RED) — `routine_run` bakes a
 * `contextBundle` (`kind:"routine"`) with routine/agent/team content + the
 * ranked+budgeted knowledge bundle (`@hyperidle/knowledge`'s
 * `assembleSessionKnowledge`, Wave A).
 *
 * @lore CONFUSION (flagged for reviewer — verified from source, not assumed):
 * TODAY, a routine session gets **zero** ranked L2/L3/L4 knowledge written
 * into its sandbox — `provisioner.ts`'s Phase-6 `assembleAgentContext` call
 * branches on `params.taskId` (null for every routine session —
 * `resolveRoutineRunRequest`'s own `BakedRoutineRunRequest.taskId` is
 * literally typed `null`, and `runtime.ts:317`'s `provisionParams.taskId:
 * claimedRequest.taskId` carries that `null` straight through), so it takes
 * the task-free branch (`context.ts:962-993`) — which writes only a minimal
 * manual `session.toon` (session/source/agent/team ids) and returns before
 * ever calling `assembleContext`/`rankAndBudget`. The ONLY routine-specific
 * context today is `buildRoutineSessionContextData` + `assembleRoutinePrompt`
 * (routine name/description/lastRunSummary baked into the AGENTS.md/CLAUDE.md
 * prompt TEXT, not the sandbox `context/` files) — genuinely no ranked
 * knowledge items, ever, for a routine session pre-Increment-12.
 *
 * So this test (and the `contextBundle`'s `kind:"routine"` variant's
 * `knowledge` field itself, grown onto `BakedContextBundle` in Wave A) encode
 * a **capability ADD**, not a preserve-only migration — H3's text ("Only
 * task_run/knowledge_action/routine_run/reengagement bake this
 * knowledge/entity bundle") reads as if `context.ts` "currently reads" ranked
 * knowledge for all four kinds at launch; that premise does NOT hold for
 * `routine_run` (verified above). Proceeding with the architecture's literal
 * design (routine_run gains real ranked knowledge for the first time, via the
 * same shared `assembleSessionKnowledge` mechanism) since Wave A's own
 * `BakedContextBundle` union already committed to a `kind:"routine"` variant
 * carrying a `knowledge` field — but this is a genuine premise mismatch the
 * architecture doc should reconcile, not an implementation-detail guess.
 * `taskDescription` has no routine analog; this test (and the proposed GREEN
 * shape) uses `routine.description ?? routine.name` as the scoring-context
 * proxy — best-guess, flagged for reviewer confirmation.
 */
describe("resolveRoutineRunRequest — contextBundle baking (Increment 12 Wave B, RED)", () => {
	test("bakes a contextBundle (kind:'routine') with routine/agent/team content + ranked knowledge", async ({
		db,
	}) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-ctx-1");
		await seedAgent(db, "owner-rrun-ctx-1");
		await seedRoutine(db, {
			routineId: "routine-rrun-ctx-1",
			teamId: "team-rrun-ctx-1",
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
			getTeamById: (d: HyperIdleDb, id: string) => getTeam(d, { id }),
			assembleSessionKnowledge,
		});

		const team = await getTeam(db, { id: "team-rrun-ctx-1" });

		// RED (npm run check): `RoutineRunResolverDeps` does not declare
		// `getTeamById`/`assembleSessionKnowledge` yet (TS2353 on the call above);
		// `BakedRoutineRunRequest` does not declare `contextBundle` yet (TS2339
		// below). Left uncast deliberately — the compile errors ARE the RED
		// signal. Vitest's transpile-only run still executes; `contextBundle` is
		// `undefined` at runtime, which `toMatchObject` fails on.
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
});
