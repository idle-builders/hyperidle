/**
 * AU15 R2/R3/R4 — fire-time no longer selects; unified run-row coalescing;
 * terminal-failure finalization of session-less running runs.
 *
 * R2 (AC-1): `checkAndFireRoutine` no longer evaluates owner-WIP/delegate at
 * fire-time — an owner at WIP still fires (records a run + intent); the
 * agent-layer resolves the actual target at drain (see the sibling
 * `agent-work-intent-worker.routine-selection.integration.test.ts`).
 *
 * R3 (AC-3b, W2): both fire entry points — the poll path (`checkAndFireRoutine`)
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
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, vi } from "vitest";
import { describe, expect, test } from "../../test-fixtures.js";
import { startAgentLifecycleProjectionDrain } from "../agent-lifecycle-projectors.js";
import { drainAgentWorkIntents } from "../agent-work-intent-worker.js";
import { checkAndFireRoutine } from "../routine-scheduler.js";

const NOW = "2026-07-12T00:00:00.000Z";
const TEST_API_KEY = "test-key-au15-routine-scheduler";

const RUNTIME_DEPS = {
	adapterPool: {},
	workspace: {},
	sandboxBasePath: "/tmp/au15-routine-scheduler",
};

beforeEach(() => vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY));
afterEach(() => vi.unstubAllEnvs());

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
		maxConcurrentSessions: 1,
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

		const result = await checkAndFireRoutine(db, eventBus, routine!, RUNTIME_DEPS);

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
	test("poll path: a second checkAndFireRoutine coalesces against an in-flight run", async ({
		db,
		eventBus,
	}) => {
		const { routineId } = await seedRoutineWorld(db, "au15-r3a-routine");
		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));

		const first = await checkAndFireRoutine(db, eventBus, routine!, RUNTIME_DEPS);
		expect(first.fired).toBe(true);

		const [reloaded] = await db.select().from(routines).where(eq(routines.id, routineId));
		const second = await checkAndFireRoutine(db, eventBus, reloaded!, RUNTIME_DEPS);

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
	}) => {
		const { routineId } = await seedRoutineWorld(db, "au15-r3b-routine");
		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));

		// Poll-created run: fired, but never provisioned into a session (no
		// active session exists) — exactly the window the old session-keyed
		// `shouldCoalesce` signal would have missed.
		const first = await checkAndFireRoutine(db, eventBus, routine!, RUNTIME_DEPS);
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
	}) => {
		const { routineId } = await seedRoutineWorld(db, "au15-r4a-routine");
		const [routine] = await db.select().from(routines).where(eq(routines.id, routineId));
		const fireResult = await checkAndFireRoutine(db, eventBus, routine!, RUNTIME_DEPS);
		expect(fireResult.fired).toBe(true);
		const [run] = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routineId));
		expect(run?.outcome).toBe("running");

		// Routine deactivated between fire and drain — resolveAuthoritativeInput
		// throws InvalidAgentWorkSourceError (pre-hand-off, no session ever exists).
		await routineService.updateRoutineById(db, routineId, { active: false });

		await drainAgentWorkIntents(db);

		const [intent] = await db
			.select()
			.from(agentWorkIntents)
			.where(eq(agentWorkIntents.sourceId, run?.id ?? ""));
		expect(intent?.status).toBe("failed");

		const [finalizedRun] = await db
			.select()
			.from(routineRuns)
			.where(eq(routineRuns.id, run?.id ?? ""));
		expect(finalizedRun?.outcome).toBe("error");
		expect(finalizedRun?.endedAt).toBeTruthy();

		// Self-healed: coalescing no longer blocks a fresh fire once reactivated.
		await routineService.updateRoutineById(db, routineId, { active: true });
		const [reactivated] = await db.select().from(routines).where(eq(routines.id, routineId));
		const secondFire = await checkAndFireRoutine(db, eventBus, reactivated!, RUNTIME_DEPS);
		expect(secondFire.fired).toBe(true);
		expect(secondFire.reason).not.toBe("previous run still in progress");
	});

	test("AC-3c: terminal PROVISION failure (post-hand-off) finalizes the run via projectRoutine", async ({
		db,
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

		const stop = startAgentLifecycleProjectionDrain(db, { pollIntervalMs: 10 });
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

		const [run] = await db.select().from(routineRuns).where(eq(routineRuns.id, runId));
		expect(run?.outcome).toBe("error");
	});
});
