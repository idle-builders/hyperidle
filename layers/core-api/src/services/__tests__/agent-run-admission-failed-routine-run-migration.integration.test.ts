/**
 * AU21 §9 Increment 4, Wave B (RED) — protected proof obligation, mirroring
 * the precedent set by every sibling family's migration test (e.g.
 * `agent-run-admission-failed-bet-decomposition-migration.integration.test.ts`):
 * "the routine_run-related subscriber (Wave 0's `routineService.updateRoutineRun(
 * ..., {outcome:'error'}, {onlyIfRunning:true})` reaction) must actually fire on
 * a real terminal admission failure for this kind now that it's migrated."
 *
 * Wave 0's own `agent-run-admission-failed-subscribers.integration.test.ts`
 * proves the REACTION exists — but its `routine_run` scenario deliberately
 * forces the failure through the STILL-PRESENT `resolveIntentInputInternal`
 * "routine_run" case (a bare, unbaked intent against a deactivated routine —
 * `InvalidAgentWorkSourceError`) — the exact mechanism THIS wave deletes.
 * That test is not proof the reaction still fires once the intent carries a
 * REAL baked payload produced by the REAL migrated emit call site
 * (`@hyperidle/routine`'s `fireGenericRoutine`).
 *
 * This file drives the real emit call site — `fireGenericRoutine` against a
 * genuinely eligible, active routine — to create a REAL `routine_run` intent,
 * then forces a genuine drain-time failure: a real Postgres trigger rejecting
 * the `agent_session_requests` insert (the same fault-injection idiom the
 * bet_decomposition/task_run migration tests already use), forced terminal on
 * the first attempt via `maxAttempts: 1`. This is a legitimate downstream
 * failure class for an ALREADY-validly-baked payload: with zero re-validation
 * at drain (Decision B step 2), the only way a baked `routine_run` intent can
 * still fail pre-handoff is a genuine infra/DB fault at the hand-off write
 * itself — exactly what this trigger simulates.
 *
 * Currently RED: `fireGenericRoutine`'s emit call does not yet bake a
 * payload (this wave's GREEN phase adds it), so the emitted intent's
 * `bakedRequestJson` is null — asserted directly below as the first, cheapest
 * RED signal — meaning the drain still runs the (still-present) per-kind
 * `resolveIntentInputInternal` "routine_run" case, not the baked hand-off
 * path this test targets.
 */

import {
	agentWorkIntents,
	type HyperIdleDb,
	routineRuns,
	routines,
	teams,
	users,
} from "@hyperidle/db";
import { getAgentIdentity, getParentedItem } from "@hyperidle/document";
import type { AgentRunAdmissionFailedEvent } from "@hyperidle/event-bus";
import type { RoutineSchedulerPorts } from "@hyperidle/routine";
import { fireGenericRoutine } from "@hyperidle/routine";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { readServerConfig } from "@hyperidle/settings";
import * as work from "@hyperidle/task";
import { findThread } from "@hyperidle/thread";
import { requireRunnableAgent } from "@hyperidle/users";
import { eq, sql } from "drizzle-orm";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

const NOW = new Date().toISOString();

async function rejectSessionRequestWrites(db: HyperIdleDb): Promise<void> {
	await db.execute(
		sql`drop trigger if exists au21_reject_session_request_write_rrun on agent_session_requests`,
	);
	await db.execute(sql`
		create or replace function au21_reject_session_request_write_rrun() returns trigger as $$
		begin raise exception 'AU21 injected agent_session_requests write failure (routine_run)'; end;
		$$ language plpgsql
	`);
	await db.execute(sql`
		create trigger au21_reject_session_request_write_rrun
		before insert on agent_session_requests
		for each row execute function au21_reject_session_request_write_rrun()
	`);
}

async function allowSessionRequestWrites(db: HyperIdleDb): Promise<void> {
	await db.execute(
		sql`drop trigger if exists au21_reject_session_request_write_rrun on agent_session_requests`,
	);
}

/** Real production-mirroring ports — same shape as this wave's baked-emit test. */
function makePorts(): RoutineSchedulerPorts & {
	readonly requireRunnableAgent: typeof requireRunnableAgent;
} {
	return {
		work: {
			getTaskById: async (db: HyperIdleDb, id: string) => {
				const row = await work.get(db, "task", id);
				if (!row) return undefined;
				return {
					id: row.id,
					title: row.title,
					description: row.description,
					state: row.state,
					parentTaskId: row.parentTaskId,
				};
			},
			// @lore BC3 architecture.md §5: getItemById/createItem/
			// findRetroItemByThreadIds DELETED — all three read/wrote the
			// `items` table, which no longer exists.
		},
		conversation: {
			findThreadById: (db, id) => findThread(db, { id }),
		},
		// @lore BC4 architecture.md §0 A1: `knowledge.getItemById` deleted with
		// the itemId → knowledge-item subject branch — see `ports.ts`.
		settings: {
			readServerConfig: async (db) => {
				const cfg = await readServerConfig(db);
				return {
					harnessDisabled: cfg.harnessDisabled,
				};
			},
		},
		workIntents: { enqueueWorkIntent },
		requireRunnableAgent,
		getAgentIdentity,
		getRoutinePrompt: async (db, routineId) =>
			(await getParentedItem(db, { parentKind: "routine", parentId: routineId, role: "prompt" }))
				?.body ?? null,
	};
}

describe("agent_run_admission_failed — routine_run reaction fires for a REAL migrated (baked) intent", () => {
	test("a real baked routine_run intent that fails terminally at drain still finalizes the real routine run to outcome=error", async ({
		db,
		eventBus,
	}) => {
		const teamId = "team-au21-rrun-mig";
		const ownerAgentId = "agent-au21-rrun-mig-owner";
		await db.insert(teams).values({ id: teamId, name: "Team", phase: "build", createdAt: NOW });
		await db.insert(users).values({
			id: ownerAgentId,
			kind: "ai",
			name: "Owner",
			role: "builder",
			status: "active",
			teamId: teamId,
			createdAt: NOW,
		});
		await db.insert(routines).values({
			id: "routine-au21-rrun-mig",
			name: "routine_run migration proof routine",
			state: "active",
			ownerAgentId,
			triggerType: "manual",
			active: true,
		});
		const [routine] = await db
			.select()
			.from(routines)
			.where(eq(routines.id, "routine-au21-rrun-mig"));

		const fireResult = await fireGenericRoutine(db, eventBus, routine!, makePorts());
		expect(fireResult.fired).toBe(true);

		const [intentBeforeDrain] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, fireResult.runId ?? ""));
		expect(intentBeforeDrain).toBeDefined();
		// RED today: the emit call site does not yet bake the request.
		expect(intentBeforeDrain?.bakedRequestJson).toBeTruthy();

		await rejectSessionRequestWrites(db);
		try {
			const emitted: AgentRunAdmissionFailedEvent[] = [];
			eventBus.on("agent_run_admission_failed", (event) => emitted.push(event));

			const queueDrainDeps = { ...queueDeps(db), eventBus };
			await drainIntents(queueDrainDeps, { maxAttempts: 1 });

			expect(emitted).toHaveLength(1);
			expect(emitted[0]).toMatchObject({
				kind: "routine_run",
				sourceId: fireResult.runId,
				terminal: true,
			});

			const [finalizedRun] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.id, fireResult.runId ?? ""));
			expect(finalizedRun?.outcome).toBe("error");
			expect(finalizedRun?.endedAt).toBeTruthy();
		} finally {
			// @lore shared-pglite-workers: TRUNCATE clears rows, not schema triggers.
			await allowSessionRequestWrites(db);
		}
	});
});
