/**
 * AU21 Increment 3, session_start + task_run wave (RED) — protected proof
 * obligation named explicitly in this wave's brief: "the task_run-related
 * subscriber (Wave 0's taskDispatchAttempts-mark-failed reaction) must
 * actually fire on a real terminal admission failure for this kind now that
 * it's migrated."
 *
 * Wave 0's own `agent-run-admission-failed-subscribers.integration.test.ts`
 * proves the REACTION exists — but its `task_run` scenario deliberately
 * forces the failure through the STILL-PRESENT `resolveIntentInputInternal`
 * "task_run" case (an unbaked intent, requireRunnableActor rejecting a paused
 * agent) — the exact mechanism THIS wave deletes. That test is not a proof
 * the reaction still fires once the intent carries a REAL baked payload
 * produced by the REAL migrated emit call site.
 *
 * This file drives the real, already-migrated-by-this-wave emit call site
 * (`POST /api/tasks/:id/transition`, `task-state-machine.ts`) to create a
 * REAL `taskDispatchAttempts` row + a REAL baked `task_run` intent, then
 * forces a genuine drain-time failure — a real Postgres trigger rejecting the
 * `agent_session_requests` insert (the same fault-injection idiom
 * `agent-work-intent-production.integration.test.ts`'s `rejectIntentWrites`
 * already uses for `agent_work_intents`, applied to the sibling table here)
 * — forced terminal on the first attempt via `maxAttempts: 1`. This is a
 * legitimate downstream failure class for an ALREADY-validly-baked payload:
 * with zero re-validation at drain (Decision B step 2), the only way a baked
 * `task_run` intent can still fail pre-handoff is a genuine infra/DB fault at
 * the hand-off write itself — exactly what this trigger simulates.
 *
 * Currently RED: `task-state-machine.ts` does not yet bake a payload (this
 * wave's GREEN phase adds it), so the emitted intent's `bakedRequestJson` is
 * null — asserted directly below as the first, cheapest RED signal — meaning
 * the drain still runs the (still-present) per-kind `resolveIntentInputInternal`
 * "task_run" case, not the baked hand-off path this test targets.
 */

import {
	agentWorkIntents,
	bets,
	type HyperIdleDb,
	taskDispatchAttempts,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import type { AgentRunAdmissionFailedEvent } from "@hyperidle/domain-model";
import { drainIntents } from "@hyperidle/session-requests";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { test } from "../../__testing__/test-fixtures.js";

const TEST_API_KEY = "test-key-au21-task-run-migration";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

async function rejectSessionRequestWrites(db: HyperIdleDb): Promise<void> {
	await db.execute(
		sql`drop trigger if exists au21_reject_session_request_write on agent_session_requests`,
	);
	await db.execute(sql`
		create or replace function au21_reject_session_request_write() returns trigger as $$
		begin raise exception 'AU21 injected agent_session_requests write failure'; end;
		$$ language plpgsql
	`);
	await db.execute(sql`
		create trigger au21_reject_session_request_write
		before insert on agent_session_requests
		for each row execute function au21_reject_session_request_write()
	`);
}

describe("agent_run_admission_failed — task_run reaction fires for a REAL migrated (baked) intent", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("a real baked task_run intent that fails terminally at drain still marks the real taskDispatchAttempts row failed", async ({
		db,
		app,
		eventBus,
	}) => {
		const now = new Date().toISOString();
		await db
			.insert(teams)
			.values({ id: "team-au21-trun-mig", name: "Team", phase: "build", createdAt: now });
		await db.insert(teamMembers).values({
			id: "team-au21-trun-mig-members",
			teamId: "team-au21-trun-mig",
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		});
		await db.insert(users).values({
			id: "agent-au21-trun-mig",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			teamId: "team-au21-trun-mig-members",
			createdAt: now,
		});
		await db.insert(bets).values({
			id: "bet-au21-trun-mig",
			teamId: "team-au21-trun-mig",
			description: "task_run migration proof bet",
			status: "active",
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: "task-au21-trun-mig",
			betId: "bet-au21-trun-mig",
			teamId: "team-au21-trun-mig",
			ownerAgentId: "agent-au21-trun-mig",
			title: "task_run migration proof task",
			state: "proposed",
			createdAt: now,
			updatedAt: now,
		});

		const res = await app.request("/api/tasks/task-au21-trun-mig/transition", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ state: "accepted" }),
		});
		expect(res.status).toBe(200);

		const [attempt] = await db
			.select()
			.from(taskDispatchAttempts)
			.where(eq(taskDispatchAttempts.taskId, "task-au21-trun-mig"));
		expect(attempt).toBeDefined();

		const [intentBeforeDrain] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, attempt?.id ?? ""));
		// RED today: the emit call site does not yet bake the request.
		expect(intentBeforeDrain?.bakedRequestJson).toBeTruthy();

		await rejectSessionRequestWrites(db);

		const emitted: AgentRunAdmissionFailedEvent[] = [];
		eventBus.on("agent_run_admission_failed", (event) => emitted.push(event));

		const deps = { ...queueDeps(db), eventBus };
		await drainIntents(deps, { maxAttempts: 1 });

		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toMatchObject({
			kind: "task_run",
			sourceId: attempt?.id,
			terminal: true,
		});

		await vi.waitFor(async () => {
			const [finalized] = await db
				.select()
				.from(taskDispatchAttempts)
				.where(eq(taskDispatchAttempts.id, attempt?.id ?? ""));
			expect(finalized?.status).toBe("failed");
		});
	});
});
