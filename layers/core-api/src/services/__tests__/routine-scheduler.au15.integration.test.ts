/**
 * AU15 R2/R3/R4 — fire-time no longer selects; unified run-row coalescing;
 * terminal-failure finalization of session-less running runs.
 *
 * R2 (AC-1): `fireGenericRoutine` no longer evaluates owner-WIP/delegate at
 * fire-time — an owner at WIP still fires (records a run + intent); the
 * agent-layer resolves the actual target at drain (see the sibling
 * `agent-work-intent-worker.routine-selection.integration.test.ts`).
 *
 * R3 (AC-3b, W2): both fire entry points — the poll path (`fireGenericRoutine`)
 * and the manual-trigger route — coalesce on the SAME run-row signal
 * (`routineService.findRunningRoutineRun`), closing the fired-but-unprovisioned
 * double-run window.
 *
 * R4 (AC-3c/AC-3d, W3): every terminal path finalizes the routine_run so
 * coalescing self-heals — pre-hand-off intent failure (`failOrRelease`) and
 * post-hand-off provision failure (`projectRoutine`).
 */
import {
	agentLifecycleInbox,
	agentSessionRequests,
	agentWorkIntents,
	type HyperIdleDb,
	routineRuns,
	routines,
	sessions,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import * as routineService from "@hyperidle/routine";
import { drainIntents, startLifecycleProjectionDrain } from "@hyperidle/session-requests";
import type { AgentRunLifecycleChangedEvent } from "@hyperidle/shared";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, vi } from "vitest";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";
import { fireGenericRoutine } from "../../__tests__/dispatch-test-helpers.js";
import { queueDeps } from "../durable-agent-queue.js";
import { registerRoutineRunSessionEndReactions } from "../routine-run-session-end-reactions.js";

const NOW = "2026-07-12T00:00:00.000Z";
const TEST_API_KEY = "test-key-au15-routine-scheduler";

const RUNTIME_DEPS = {
	adapterPool: {},
	workspace: {},
	sandboxBasePath: "/tmp/au15-routine-scheduler",
};

beforeEach(() => vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY));
afterEach(() => vi.unstubAllEnvs());

/**
 * AU21 §9 Increment 4, Wave B — `routine_run` is now ALSO resolved at emit
 * (`fireGenericRoutine` bakes the request in its own transaction, per
 * architecture.md §6 Decision B), so a routine deactivated AFTER a
 * successful fire no longer produces a pre-hand-off failure at drain — the
 * drain trusts the already-baked, already-validated payload (zero domain
 * reads, Decision B step 2) instead of re-reading `routines` at drain time.
 * The genuine pre-hand-off failure class that survives for an already-baked
 * intent is a real infra fault at the hand-off write itself (same idiom as
 * `agent-run-admission-failed-routine-run-migration.integration.test.ts` and
 * the sibling rewiring in `agent-run-admission-failed-emission.integration.test.ts`)
 * — a Postgres trigger rejecting the `agent_session_requests` insert.
 */
async function rejectSessionRequestWrites(db: HyperIdleDb): Promise<void> {
	await db.execute(
		sql`drop trigger if exists au21_reject_session_request_write_au15 on agent_session_requests`,
	);
	await db.execute(sql`
		create or replace function au21_reject_session_request_write_au15() returns trigger as $$
		begin raise exception 'AU21 injected agent_session_requests write failure (AU15 AC-3d)'; end;
		$$ language plpgsql
	`);
	await db.execute(sql`
		create trigger au21_reject_session_request_write_au15
		before insert on agent_session_requests
		for each row execute function au21_reject_session_request_write_au15()
	`);
}

async function seedRoutineWorld(
	db: HyperIdleDb,
	id = "au15-sched-routine",
): Promise<{ routineId: string; ownerAgentId: string }> {
	const teamId = `${id}-team`;
	const tmId = `${id}-tm`;
	const ownerAgentId = `${id}-owner`;

	await db
		.insert(teams)
		.values({ id: teamId, name: "AU15 sched team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: tmId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: ownerAgentId,
		kind: "ai",
		name: "Owner",
		role: "builder",
		status: "active",
		teamId: tmId,
		createdAt: NOW,
	});
	await db.insert(routines).values({
		id,
		name: "AU15 sched routine",
		teamId,
		state: "active",
		ownerAgentId,
		triggerType: "manual",
		active: true,
	});

	return { routineId: id, ownerAgentId };
}

describe("fire-time no longer evaluates owner-WIP", () => {
	test("owner at WIP still fires (records a run + intent) — selection moved to drain", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { routineId, ownerAgentId } = await seedRoutineWorld(db, "au15-r2-routine");
		await db.insert(sessions).values({
			id: "au15-r2-owner-session",
			agentId: ownerAgentId,
			modelTier: "fast",
			startedAt: NOW,
			state: "active",
		});
		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));

		const result = await fireGenericRoutine(
			db,
			eventBus,
			agentOrchestration,
			routine!,
			RUNTIME_DEPS,
		);

		expect(result.fired).toBe(true);
		const runs = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
		expect(runs).toHaveLength(1);
		expect(runs[0]?.outcome).toBe("running");
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, runs[0]?.id ?? ""));
		expect(intents).toHaveLength(1);
	});
});

describe("unified run-row coalescing across both fire paths", () => {
	test("poll path: a second fireGenericRoutine coalesces against an in-flight run", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { routineId } = await seedRoutineWorld(db, "au15-r3a-routine");
		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));

		const first = await fireGenericRoutine(
			db,
			eventBus,
			agentOrchestration,
			routine!,
			RUNTIME_DEPS,
		);
		expect(first.fired).toBe(true);

		const [reloaded] = await db.select().from(routines).where(eq(routines.id, routineId));
		const second = await fireGenericRoutine(
			db,
			eventBus,
			agentOrchestration,
			reloaded!,
			RUNTIME_DEPS,
		);

		expect(second).toMatchObject({ fired: false, reason: "previous run still in progress" });
		const runs = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
		expect(runs).toHaveLength(1);
		const intents = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, runs[0]?.id ?? ""));
		expect(intents).toHaveLength(1);
	});

	test("manual-trigger route ALSO coalesces on the same run-row signal, with no active session", async ({
		db,
		eventBus,
		app,
		agentOrchestration,
	}) => {
		const { routineId } = await seedRoutineWorld(db, "au15-r3b-routine");
		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));

		// Poll-created run: fired, but never provisioned into a session (no
		// active session exists) — exactly the window the old session-keyed
		// `shouldCoalesce` signal would have missed.
		const first = await fireGenericRoutine(
			db,
			eventBus,
			agentOrchestration,
			routine!,
			RUNTIME_DEPS,
		);
		expect(first.fired).toBe(true);
		const activeSessions = await db
			.select()
			.from(sessions)
			.where(eq(sessions.agentId, routine!.ownerAgentId));
		expect(activeSessions).toHaveLength(0);

		const res = await app.request(`/api/routines/${routineId}/trigger`, {
			method: "POST",
			headers: { "X-API-Key": TEST_API_KEY },
		});
		const body = (await res.json()) as { fired: boolean; reason?: string };
		expect(body).toMatchObject({ fired: false, reason: "coalesced" });

		const runs = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
		// The poll-created running run, plus the manual route's own "skipped" record.
		expect(runs).toHaveLength(2);
		expect(runs.filter((r) => r.outcome === "running")).toHaveLength(1);
	});
});

describe("terminal-failure finalization of session-less running runs", () => {
	test("AC-3d: pre-hand-off intent failure (routine deactivated) finalizes the run, self-healing coalescing", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { routineId } = await seedRoutineWorld(db, "au15-r4a-routine");
		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));
		const fireResult = await fireGenericRoutine(
			db,
			eventBus,
			agentOrchestration,
			routine!,
			RUNTIME_DEPS,
		);
		expect(fireResult.fired).toBe(true);
		const [run] = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
		expect(run?.outcome).toBe("running");

		// A genuine downstream infra fault at the hand-off write itself — the
		// surviving pre-hand-off failure class for an already-baked intent (see
		// this file's `rejectSessionRequestWrites` @lore above).
		await rejectSessionRequestWrites(db);

		// @lore AU21 Increment 3 Wave 0 rewiring: the run's finalization no
		// longer happens as a direct write inside `failOrRelease` — it is now a
		// core-api subscriber reacting to the NEW `agent_run_admission_failed`
		// event (`registerAgentRunAdmissionReactions`, wired onto the `eventBus`
		// fixture). `drainIntents` must be given that same eventBus so
		// `failOrRelease` can actually emit it; the reaction itself is async
		// fire-and-forget (same pattern as every other EventBus reaction in this
		// codebase, e.g. `lifecycle-propagation.ts`), so the finalize assertion
		// below polls via `vi.waitFor` — the GUARANTEE (run finalizes to
		// outcome="error", coalescing self-heals) is unchanged.
		await drainIntents({ ...queueDeps(db), eventBus }, { maxAttempts: 1 });

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
		expect(intent?.status).toBe("failed");

		await vi.waitFor(async () => {
			const [finalizedRun] = await db
				.select()
				.from(routineRuns)
				.where(eq(routineRuns.id, run?.id ?? ""));
			expect(finalizedRun?.outcome).toBe("error");
			expect(finalizedRun?.endedAt).toBeTruthy();
		});

		// The trigger is schema-level (persists across the pooled PGlite
		// instance's TRUNCATE-only reset) — drop it so it doesn't leak into a
		// sibling test in this file that also writes `agent_session_requests`.
		await db.execute(
			sql`drop trigger if exists au21_reject_session_request_write_au15 on agent_session_requests`,
		);

		// Self-healed: coalescing no longer blocks a fresh fire (the failed run
		// is no longer "running").
		const [reloaded] = await db.select().from(routines).where(eq(routines.id, routineId));
		const secondFire = await fireGenericRoutine(
			db,
			eventBus,
			agentOrchestration,
			reloaded!,
			RUNTIME_DEPS,
		);
		expect(secondFire.fired).toBe(true);
		expect(secondFire.reason).not.toBe("previous run still in progress");
	});

	/**
	 * AU21 correction (post-Increment-5 verification): this scenario's
	 * finalization used to happen INSIDE the lifecycle-inbox drain, via
	 * `projectRoutine`'s direct `updateRoutineRunIfRunning` write — the THIRD
	 * raw cross-layer write path the gap report found. That projector is now
	 * `observeOnly` (matching `assistant`/`knowledge`/`proposed_call`); the
	 * drain still claims/acks the inbox fact (that mechanism is untouched) but
	 * performs no `routineRuns` write. Wave C's
	 * `registerRoutineRunSessionEndReactions`, reacting to
	 * `agent_run_lifecycle_changed` (the "request disposition" path for a
	 * routine session that never reached a live `session_ended`), is now the
	 * SOLE mechanism finalizing this post-hand-off provision failure.
	 */
	test("AC-3c: terminal PROVISION failure (post-hand-off) finalizes the run via Wave C's agent_run_lifecycle_changed reaction, not the drain", async ({
		db,
		eventBus,
	}) => {
		const { routineId, ownerAgentId } = await seedRoutineWorld(db, "au15-r4b-routine");
		const runId = "au15-r4b-run";
		await routineService.insertRoutineRun(db, {
			id: runId,
			routineId,
			startedAt: NOW,
			outcome: "running",
		});
		const requestId = "au15-r4b-request";
		await db.insert(agentSessionRequests).values({
			id: requestId,
			sourceKind: "routine",
			sourceId: runId,
			streamId: `routine:${routineId}`,
			agentId: ownerAgentId,
			promptMode: "routine",
			sourceCorrelationJson: "{}",
			idempotencyKey: `routine:${runId}`,
			status: "completed",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await db.insert(agentLifecycleInbox).values({
			requestId,
			sourceKind: "routine",
			sourceId: runId,
			state: "failed",
			failureCode: "INTERNAL_ERROR",
			occurredAt: NOW,
		});

		const stop = startLifecycleProjectionDrain(queueDeps(db), { pollIntervalMs: 10 });
		try {
			const deadline = Date.now() + 5_000;
			for (;;) {
				const [inboxRow] = await db
					.select({ projectedAt: agentLifecycleInbox.projectedAt })
					.from(agentLifecycleInbox)
					.where(eq(agentLifecycleInbox.requestId, requestId));
				if (inboxRow?.projectedAt) break;
				if (Date.now() > deadline) throw new Error("Projection timed out");
				await new Promise((resolve) => setTimeout(resolve, 15));
			}
		} finally {
			stop();
		}

		// The drain alone must NOT finalize the run — `routine`'s projector is
		// observeOnly now.
		const [afterDrain] = await db.select().from(routineRuns).where(eq(routineRuns.id, runId));
		expect(afterDrain?.outcome).toBe("running");

		// Wave C's reaction is the only thing left that finalizes it — register
		// it and emit the `agent_run_lifecycle_changed` fact production emits
		// for this exact "request disposition" failure path.
		registerRoutineRunSessionEndReactions(db, eventBus);
		const event: AgentRunLifecycleChangedEvent = {
			type: "agent_run_lifecycle_changed",
			streamId: `routine:${routineId}`,
			requestId,
			sourceKind: "routine",
			sourceId: runId,
			state: "failed",
			timestamp: Date.now(),
		};
		eventBus.emit(event);

		await vi.waitFor(async () => {
			const [run] = await db.select().from(routineRuns).where(eq(routineRuns.id, runId));
			expect(run?.outcome).toBe("error");
			expect(run?.endedAt).toBeTruthy();
		});
	});
});
