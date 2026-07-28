/**
 * AU21 §9 Increment 4, Wave B (RED) — architecture.md §6 Decision B's
 * placement ruling: "`routine_run` → a resolver added to
 * `packages/core-api/routine/src/routine-service.ts`, co-located with the
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
 *   3. Resolve the target agent: default to the routine's `ownerAgentId`.
 *      If the owner `isAtCapacity`, AND `delegationAllowed` AND a `skillId`
 *      is set, delegate via `agentSelection.selectAgent({surface:
 *      "routine_delegate", ...})` — overriding the target ONLY if a
 *      candidate was actually found (a `null` result keeps the owner).
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

import { type HyperIdleDb, routineRuns, routines, teams, users } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { requireRunnableAgent } from "@hyperidle/users";

async function seedTeam(db: HyperIdleDb, teamId: string): Promise<void> {
	await db
		.insert(teams)
		.values({ id: teamId, name: teamId, phase: "build", createdAt: new Date().toISOString() });
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

/** A controllable `agentSelection` fake — deterministic per test, not the real service. */
function fakeAgentSelection(options: {
	readonly atCapacity: boolean;
	readonly delegateAgentId?: string | null;
}) {
	return {
		isAtCapacity: async () => options.atCapacity,
		selectAgent: async () => ({ agentId: options.delegateAgentId ?? null }),
	};
}

function buildDeps(agentSelection: ReturnType<typeof fakeAgentSelection>) {
	return { agentSelection, requireRunnableAgent };
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

		const baked = await resolveRoutineRunRequest(
			db,
			"run-rrun-1",
			buildDeps(fakeAgentSelection({ atCapacity: false })),
		);

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
		await expect(
			resolveRoutineRunRequest(
				db,
				"run-does-not-exist",
				buildDeps(fakeAgentSelection({ atCapacity: false })),
			),
		).rejects.toThrow();
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

		await expect(
			resolveRoutineRunRequest(
				db,
				"run-rrun-2",
				buildDeps(fakeAgentSelection({ atCapacity: false })),
			),
		).rejects.toThrow();
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

		await expect(
			resolveRoutineRunRequest(
				db,
				"run-rrun-3",
				buildDeps(fakeAgentSelection({ atCapacity: false })),
			),
		).rejects.toThrow();
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

		await expect(
			resolveRoutineRunRequest(
				db,
				"run-rrun-4",
				buildDeps(fakeAgentSelection({ atCapacity: false })),
			),
		).rejects.toThrow();
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

		await expect(
			resolveRoutineRunRequest(
				db,
				"run-rrun-5",
				buildDeps(fakeAgentSelection({ atCapacity: false })),
			),
		).rejects.toThrow();
	});

	test("delegates to a fallback agent when the owner is at capacity, delegation is allowed, and a skillId is set", async ({
		db,
	}) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-6");
		await seedAgent(db, "owner-rrun-6");
		await seedAgent(db, "delegate-rrun-6");
		await seedRoutine(db, {
			routineId: "routine-rrun-6",
			teamId: "team-rrun-6",
			ownerAgentId: "owner-rrun-6",
			delegationAllowed: true,
			skillId: "skill-x",
		});
		await seedRun(db, { runId: "run-rrun-6", routineId: "routine-rrun-6" });

		const baked = await resolveRoutineRunRequest(
			db,
			"run-rrun-6",
			buildDeps(fakeAgentSelection({ atCapacity: true, delegateAgentId: "delegate-rrun-6" })),
		);

		expect(baked.defaultAgentId).toBe("delegate-rrun-6");
	});

	test("keeps the owner when at capacity but delegationAllowed is false", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-7");
		await seedAgent(db, "owner-rrun-7");
		await seedAgent(db, "delegate-rrun-7");
		await seedRoutine(db, {
			routineId: "routine-rrun-7",
			teamId: "team-rrun-7",
			ownerAgentId: "owner-rrun-7",
			delegationAllowed: false,
			skillId: "skill-x",
		});
		await seedRun(db, { runId: "run-rrun-7", routineId: "routine-rrun-7" });

		const baked = await resolveRoutineRunRequest(
			db,
			"run-rrun-7",
			buildDeps(fakeAgentSelection({ atCapacity: true, delegateAgentId: "delegate-rrun-7" })),
		);

		expect(baked.defaultAgentId).toBe("owner-rrun-7");
	});

	test("keeps the owner when at capacity but no skillId is set", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-8");
		await seedAgent(db, "owner-rrun-8");
		await seedAgent(db, "delegate-rrun-8");
		await seedRoutine(db, {
			routineId: "routine-rrun-8",
			teamId: "team-rrun-8",
			ownerAgentId: "owner-rrun-8",
			delegationAllowed: true,
			skillId: null,
		});
		await seedRun(db, { runId: "run-rrun-8", routineId: "routine-rrun-8" });

		const baked = await resolveRoutineRunRequest(
			db,
			"run-rrun-8",
			buildDeps(fakeAgentSelection({ atCapacity: true, delegateAgentId: "delegate-rrun-8" })),
		);

		expect(baked.defaultAgentId).toBe("owner-rrun-8");
	});

	test("keeps the owner when NOT at capacity, even if delegationAllowed + skillId are set", async ({
		db,
	}) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-9");
		await seedAgent(db, "owner-rrun-9");
		await seedAgent(db, "delegate-rrun-9");
		await seedRoutine(db, {
			routineId: "routine-rrun-9",
			teamId: "team-rrun-9",
			ownerAgentId: "owner-rrun-9",
			delegationAllowed: true,
			skillId: "skill-x",
		});
		await seedRun(db, { runId: "run-rrun-9", routineId: "routine-rrun-9" });

		const baked = await resolveRoutineRunRequest(
			db,
			"run-rrun-9",
			buildDeps(fakeAgentSelection({ atCapacity: false, delegateAgentId: "delegate-rrun-9" })),
		);

		expect(baked.defaultAgentId).toBe("owner-rrun-9");
	});

	test("keeps the owner when at capacity + delegation eligible but selectAgent finds no candidate", async ({
		db,
	}) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-10");
		await seedAgent(db, "owner-rrun-10");
		await seedRoutine(db, {
			routineId: "routine-rrun-10",
			teamId: "team-rrun-10",
			ownerAgentId: "owner-rrun-10",
			delegationAllowed: true,
			skillId: "skill-x",
		});
		await seedRun(db, { runId: "run-rrun-10", routineId: "routine-rrun-10" });

		const baked = await resolveRoutineRunRequest(
			db,
			"run-rrun-10",
			buildDeps(fakeAgentSelection({ atCapacity: true, delegateAgentId: null })),
		);

		expect(baked.defaultAgentId).toBe("owner-rrun-10");
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

		await expect(
			resolveRoutineRunRequest(
				db,
				"run-rrun-11",
				buildDeps(fakeAgentSelection({ atCapacity: false })),
			),
		).rejects.toThrow();
	});

	test("rejects when the delegated fallback agent is not a runnable AI agent", async ({ db }) => {
		const { resolveRoutineRunRequest } = await import("../routine-service.js");
		await seedTeam(db, "team-rrun-12");
		await seedAgent(db, "owner-rrun-12");
		await seedAgent(db, "delegate-rrun-12", { status: "paused" });
		await seedRoutine(db, {
			routineId: "routine-rrun-12",
			teamId: "team-rrun-12",
			ownerAgentId: "owner-rrun-12",
			delegationAllowed: true,
			skillId: "skill-x",
		});
		await seedRun(db, { runId: "run-rrun-12", routineId: "routine-rrun-12" });

		await expect(
			resolveRoutineRunRequest(
				db,
				"run-rrun-12",
				buildDeps(fakeAgentSelection({ atCapacity: true, delegateAgentId: "delegate-rrun-12" })),
			),
		).rejects.toThrow();
	});
});
