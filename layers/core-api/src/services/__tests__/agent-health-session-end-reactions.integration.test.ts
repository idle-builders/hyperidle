/**
 * AU26 — degraded-agent notification, event-driven.
 *
 * Founder ruling: *"shouldn't the notification system anyhow allow to be event
 * based and then the notification system just keeps track of how many of the
 * notification events it got from the orchestration that something broke and
 * the notification system then just say 5 notification about this in the last
 * 7 days"*.
 *
 * Covers `registerAgentHealthSessionEndReactions` (layers/core-api/src/
 * services/agent-health-session-end-reactions.ts), which follows
 * `work-session-end-reactions.ts` exactly: a per-eventBus `registeredBuses`
 * WeakSet idempotency guard and the explicit `register*(db, eventBus)` wiring
 * convention.
 *
 * Behavior under test:
 *   - `session_ended` with `outcome: "crashed"` RECORDS one
 *     `agent.health.degraded` row per crash, keyed `subjectId = agentId`. No
 *     HTTP request is involved anywhere — the old producer was a side effect of
 *     `GET /teams/:teamId`, and it is gone (see `AB2-team-agents.integration.test.ts`).
 *   - Any other outcome records nothing.
 *   - The rule is a COUNT, not a ratio: the notification is SURFACED (status
 *     `"pending"`, i.e. deliverable + in the inbox) only once the agent has
 *     `AGENT_FAILURE_NOTIFY_THRESHOLD` failures inside
 *     `AGENT_FAILURE_WINDOW_DAYS`. A ratio is unexpressible here — the
 *     notification system only ever hears about failures, never successes.
 *   - Below the threshold the crash is still RECORDED, as a retired row
 *     (`status: "dropped"`, `readAt`/`seenAt` stamped) so it counts toward the
 *     window without ever reaching the user's inbox. That recording is what
 *     makes the threshold expressible at all: with insert-only-on-notify the
 *     count could never climb past zero.
 *   - The body carries the real count over the notification system's OWN rows
 *     — no new table, no tally state.
 *   - Dedupe/throttle intent is preserved verbatim: a further crash while a
 *     notification is already `pending` does not stack a second pending row.
 *   - Rows older than the window do not count.
 */

import { agentRunConfig, type HyperIdleDb, teams, users } from "@hyperidle/db";
import type { SessionEndedEvent, SessionOutcome } from "@hyperidle/domain-model";
import { enqueue, listNotifications } from "@hyperidle/notifications";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";

import {
	AGENT_FAILURE_NOTIFY_THRESHOLD,
	AGENT_FAILURE_WINDOW_DAYS,
	AGENT_HEALTH_DEGRADED_EVENT_TYPE,
	registerAgentHealthSessionEndReactions,
} from "../agent-health-session-end-reactions.js";

const NOW = new Date().toISOString();

/** team -> team_members -> agent. The reactor resolves the agent's name and team for the body. */
async function seedAgent(
	db: HyperIdleDb,
	id: string,
): Promise<{ readonly agentId: string; readonly agentName: string; readonly teamName: string }> {
	const teamId = `${id}-team`;
	const teamMembersId = `${id}-tm`;
	const agentId = `${id}-agent`;
	const teamName = `Team ${id}`;
	const agentName = `Agent ${id}`;
	await db.insert(teams).values({ id: teamId, name: teamName, phase: "build", createdAt: NOW });
		await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: agentName,
		role: "builder",
		status: "active",
		teamId: teamMembersId,
		createdAt: NOW,
	});
	await db.insert(agentRunConfig).values({ agentUserId: agentId, maxConcurrentSessions: 2 });
	return { agentId, agentName, teamName };
}

function sessionEnded(options: {
	readonly sessionId: string;
	readonly agentId: string;
	readonly outcome: SessionOutcome;
}): SessionEndedEvent {
	return {
		type: "session_ended",
		streamId: options.sessionId,
		sessionId: options.sessionId,
		agentId: options.agentId,
		taskId: null,
		timestamp: Date.now(),
		outcome: options.outcome,
	};
}

/** Every `agent.health.degraded` row this agent owns, whatever its status. */
async function degradedRows(
	db: HyperIdleDb,
	agentId: string,
): Promise<Array<{ status: string; body: string | null; readAt: string | null }>> {
	const rows = await listNotifications(db, { kind: "all" });
	return rows
		.filter((r) => r.subjectId === agentId && r.eventType === AGENT_HEALTH_DEGRADED_EVENT_TYPE)
		.map((r) => ({ status: r.status, body: r.body, readAt: r.readAt }));
}

describe("AU26 registerAgentHealthSessionEndReactions — the rule is a count, not a ratio", () => {
	test("the threshold and window are named constants, not magic numbers", () => {
		expect(AGENT_FAILURE_NOTIFY_THRESHOLD).toBeGreaterThan(1);
		expect(AGENT_FAILURE_WINDOW_DAYS).toBe(7);
		expect(AGENT_HEALTH_DEGRADED_EVENT_TYPE).toBe("agent.health.degraded");
	});

	test("crashed runs reaching the threshold surface a notification with NO http request", async ({
		db,
		eventBus,
	}) => {
		const { agentId, agentName, teamName } = await seedAgent(db, "ahr-threshold");
		registerAgentHealthSessionEndReactions(db, eventBus);

		for (let i = 0; i < AGENT_FAILURE_NOTIFY_THRESHOLD; i++) {
			eventBus.emit(
				sessionEnded({ sessionId: `ahr-threshold-s${i}`, agentId, outcome: "crashed" }),
			);
			// Serialise: the count is read-then-insert, so overlapping crashes would race.
			await vi.waitFor(async () => {
				expect((await degradedRows(db, agentId)).length).toBe(i + 1);
			});
		}

		const pending = await listNotifications(db, {
			kind: "pending-by-event",
			eventType: AGENT_HEALTH_DEGRADED_EVENT_TYPE,
			subjectId: agentId,
		});
		expect(pending).toHaveLength(1);
		const [surfaced] = pending;
		expect(surfaced?.severity).toBe("blocking");
		expect(surfaced?.title).toContain(agentName);
		// The body carries the REAL count over the notification system's own rows.
		expect(surfaced?.body).toContain(
			`${AGENT_FAILURE_NOTIFY_THRESHOLD} failures in the last ${AGENT_FAILURE_WINDOW_DAYS} days`,
		);
		expect(surfaced?.body).toContain(teamName);
	});

	test("below the threshold nothing is surfaced, but every crash is recorded", async ({
		db,
		eventBus,
	}) => {
		const { agentId } = await seedAgent(db, "ahr-below");
		registerAgentHealthSessionEndReactions(db, eventBus);

		const belowThreshold = AGENT_FAILURE_NOTIFY_THRESHOLD - 1;
		for (let i = 0; i < belowThreshold; i++) {
			eventBus.emit(sessionEnded({ sessionId: `ahr-below-s${i}`, agentId, outcome: "crashed" }));
			await vi.waitFor(async () => {
				expect((await degradedRows(db, agentId)).length).toBe(i + 1);
			});
		}

		const rows = await degradedRows(db, agentId);
		expect(rows).toHaveLength(belowThreshold);
		// Recorded, never surfaced: retired status + already read, so the inbox
		// (`readAt IS NULL`) and the dispatcher (`status = 'pending'`) both skip it.
		for (const row of rows) {
			expect(row.status).toBe("dropped");
			expect(row.readAt).not.toBeNull();
		}
		expect(
			await listNotifications(db, {
				kind: "pending-by-event",
				eventType: AGENT_HEALTH_DEGRADED_EVENT_TYPE,
				subjectId: agentId,
			}),
		).toHaveLength(0);
	});

	test("a non-crashed outcome records nothing", async ({ db, eventBus }) => {
		const { agentId } = await seedAgent(db, "ahr-completed");
		const barrier = await seedAgent(db, "ahr-barrier");
		registerAgentHealthSessionEndReactions(db, eventBus);

		for (const outcome of ["completed", "stopped", "not_returned"] as const) {
			eventBus.emit(sessionEnded({ sessionId: `ahr-completed-${outcome}`, agentId, outcome }));
		}
		// A crash for an UNRELATED agent, emitted last. The subscriber is
		// serial per emit, so once the barrier's row exists the three events
		// above have already been handled — asserting absence before that would
		// pass simply by racing the writes.
		eventBus.emit(
			sessionEnded({ sessionId: "ahr-barrier-s0", agentId: barrier.agentId, outcome: "crashed" }),
		);
		await vi.waitFor(async () => {
			expect((await degradedRows(db, barrier.agentId)).length).toBe(1);
		});

		expect(await degradedRows(db, agentId)).toHaveLength(0);
	});

	test("a further crash while one is pending does not stack a duplicate", async ({
		db,
		eventBus,
	}) => {
		const { agentId } = await seedAgent(db, "ahr-dedupe");
		registerAgentHealthSessionEndReactions(db, eventBus);

		const crashes = AGENT_FAILURE_NOTIFY_THRESHOLD + 2;
		for (let i = 0; i < crashes; i++) {
			eventBus.emit(sessionEnded({ sessionId: `ahr-dedupe-s${i}`, agentId, outcome: "crashed" }));
			await vi.waitFor(async () => {
				expect((await degradedRows(db, agentId)).length).toBe(i + 1);
			});
		}

		// Every crash recorded…
		expect(await degradedRows(db, agentId)).toHaveLength(crashes);
		// …but exactly ONE of them is pending. That is the preserved throttle.
		expect(
			await listNotifications(db, {
				kind: "pending-by-event",
				eventType: AGENT_HEALTH_DEGRADED_EVENT_TYPE,
				subjectId: agentId,
			}),
		).toHaveLength(1);
		const pendingCount = (await degradedRows(db, agentId)).filter(
			(r) => r.status === "pending",
		).length;
		expect(pendingCount).toBe(1);
	});

	test("failures older than the window do not count toward the threshold", async ({
		db,
		eventBus,
	}) => {
		const { agentId } = await seedAgent(db, "ahr-window");
		const outsideWindow = new Date(
			Date.now() - (AGENT_FAILURE_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000,
		).toISOString();
		for (let i = 0; i < AGENT_FAILURE_NOTIFY_THRESHOLD; i++) {
			await enqueue(db, {
				id: `ahr-window-old-${i}`,
				eventType: AGENT_HEALTH_DEGRADED_EVENT_TYPE,
				subjectId: agentId,
				severity: "blocking",
				title: "stale",
				body: "stale",
				reason: "agent_health_transition",
				channel: null,
				status: "dropped",
				attempts: 0,
				createdAt: outsideWindow,
				readAt: outsideWindow,
				seenAt: outsideWindow,
			});
		}

		registerAgentHealthSessionEndReactions(db, eventBus);
		eventBus.emit(sessionEnded({ sessionId: "ahr-window-s0", agentId, outcome: "crashed" }));

		await vi.waitFor(async () => {
			expect((await degradedRows(db, agentId)).length).toBe(AGENT_FAILURE_NOTIFY_THRESHOLD + 1);
		});
		// The stale rows are outside the window, so this is failure #1 — not the threshold.
		expect(
			await listNotifications(db, {
				kind: "pending-by-event",
				eventType: AGENT_HEALTH_DEGRADED_EVENT_TYPE,
				subjectId: agentId,
			}),
		).toHaveLength(0);
	});
});
