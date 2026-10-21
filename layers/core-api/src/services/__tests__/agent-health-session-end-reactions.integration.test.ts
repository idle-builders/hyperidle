/**
 * The degraded-agent notice is event-driven.
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
 * Behavior under test (the notification queue is gone):
 *   - `session_ended` with `outcome: "crashed"` writes the agent's `health`
 *     through `edit_user`, which lands as a `user.changed` change row — no
 *     HTTP request involved, the old producer was a side effect of
 *     `GET /teams/:teamId` and is gone.
 *   - Any other outcome writes nothing.
 *   - The note carries the crash count over the trailing 7-day window,
 *     counted from the agent's own `user` change rows — every crash now
 *     writes one, unconditionally (the old "silent below 3" queue threshold
 *     cannot be kept without a second store).
 *   - A crash for an unknown agent id is a no-op (logged, not thrown).
 */

import { listChanges } from "@hyperidle/changes";
import { agentRunConfig, type HyperIdleDb, teams, users, userTeams } from "@hyperidle/db";
import type { SessionOutcome } from "@hyperidle/domain-model";
import type { SessionEndedEvent } from "@hyperidle/event-bus";
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";
import type { EditUserRunFn } from "../../actions/action.js";
import { buildCoreActions } from "../../actions/compose.js";
import {
	AGENT_FAILURE_WINDOW_DAYS,
	registerAgentHealthSessionEndReactions,
} from "../agent-health-session-end-reactions.js";

const NOW = new Date().toISOString();

/** team -> agent. The reactor resolves the agent's name and team for the note. */
async function seedAgent(
	db: HyperIdleDb,
	id: string,
): Promise<{ readonly agentId: string; readonly agentName: string; readonly teamName: string }> {
	const teamId = `${id}-team`;
	const agentId = `${id}-agent`;
	const teamName = `Team ${id}`;
	const agentName = `Agent ${id}`;
	await db.insert(teams).values({ id: teamId, name: teamName, createdAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: agentName,
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(userTeams).values({ userId: agentId, teamId });
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

/** The real `edit_user` runner, off the same composed action list `app.ts` builds. */
function buildEditUser(
	agentOrchestration: Parameters<typeof buildCoreActions>[0]["agentOrchestration"],
): EditUserRunFn {
	const actions = buildCoreActions({
		agentOrchestration,
		agentWorkIntentRecorder: async () => ({ id: "noop", idempotencyKey: "noop" }),
		reviewVerdictRecorder: async () => ({ status: "not_a_review_session" }),
	});
	const editUserAction = actions.find((a) => a.declaration.name === "edit_user");
	if (!editUserAction) throw new Error("edit_user action not found");
	return editUserAction.run as EditUserRunFn;
}

describe("registerAgentHealthSessionEndReactions writes health, not a queue row", () => {
	test("a crashed session writes the agent's health and a user.changed", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { agentId, agentName, teamName } = await seedAgent(db, "ahr-crash");
		const editUser = buildEditUser(agentOrchestration);
		const changeEvents: string[] = [];
		eventBus.on("user.changed", (e) => changeEvents.push(e.change.objectId));

		registerAgentHealthSessionEndReactions(db, eventBus, editUser);
		eventBus.emit(sessionEnded({ sessionId: "ahr-crash-s0", agentId, outcome: "crashed" }));

		await vi.waitFor(async () => {
			expect(changeEvents).toContain(agentId);
		});

		const thisAgent = (await db.select().from(users)).find((u) => u.id === agentId);
		expect(thisAgent?.health).toContain(agentName);
		expect(thisAgent?.health).toContain(teamName);
		expect(thisAgent?.health).toContain(`1 failures in the last ${AGENT_FAILURE_WINDOW_DAYS} days`);

		// The count is taken off the agent's own `user` change rows.
		const changes = await listChanges(db, { object: "user", objectId: agentId });
		expect(changes.length).toBeGreaterThan(0);
	});

	test("a non-crashed outcome writes nothing", async ({ db, eventBus, agentOrchestration }) => {
		const { agentId } = await seedAgent(db, "ahr-completed");
		const barrier = await seedAgent(db, "ahr-barrier");
		const editUser = buildEditUser(agentOrchestration);
		const changeEvents: string[] = [];
		eventBus.on("user.changed", (e) => changeEvents.push(e.change.objectId));

		registerAgentHealthSessionEndReactions(db, eventBus, editUser);

		for (const outcome of ["completed", "stopped", "not_returned"] as const) {
			eventBus.emit(sessionEnded({ sessionId: `ahr-completed-${outcome}`, agentId, outcome }));
		}
		// A crash for an UNRELATED agent, emitted last — once its change lands,
		// the three events above have already been handled (the subscriber is
		// serial per emit).
		eventBus.emit(
			sessionEnded({ sessionId: "ahr-barrier-s0", agentId: barrier.agentId, outcome: "crashed" }),
		);
		await vi.waitFor(async () => {
			expect(changeEvents).toContain(barrier.agentId);
		});

		expect(changeEvents).not.toContain(agentId);
		const thisAgent = (await db.select().from(users)).find((u) => u.id === agentId);
		expect(thisAgent?.health ?? null).toBeNull();
	});

	test("consecutive crashes raise the count each time", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { agentId } = await seedAgent(db, "ahr-count");
		const editUser = buildEditUser(agentOrchestration);
		const changeEvents: string[] = [];
		eventBus.on("user.changed", (e) => changeEvents.push(e.change.objectId));

		registerAgentHealthSessionEndReactions(db, eventBus, editUser);

		for (let i = 0; i < 3; i++) {
			eventBus.emit(sessionEnded({ sessionId: `ahr-count-s${i}`, agentId, outcome: "crashed" }));
			await vi.waitFor(async () => {
				expect(changeEvents.filter((id) => id === agentId).length).toBe(i + 1);
			});
		}

		const thisAgent = (await db.select().from(users)).find((u) => u.id === agentId);
		expect(thisAgent?.health).toContain(`3 failures in the last ${AGENT_FAILURE_WINDOW_DAYS} days`);
	});

	test("a crash for an unknown agent id is a no-op, not a throw", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const editUser = buildEditUser(agentOrchestration);
		registerAgentHealthSessionEndReactions(db, eventBus, editUser);
		eventBus.emit(
			sessionEnded({ sessionId: "ahr-unknown-s0", agentId: "no-such-agent", outcome: "crashed" }),
		);
		const changes = await listChanges(db, { object: "user", objectId: "no-such-agent" });
		expect(changes).toHaveLength(0);
	});

	// The crash count must count only this reaction's own crash notes, not
	// every `user` change row on the agent — an unrelated rename between two
	// crashes must not inflate it.
	test("a rename between crashes does not count toward the crash total", async ({
		db,
		eventBus,
		agentOrchestration,
	}) => {
		const { agentId } = await seedAgent(db, "ahr-rename");
		const editUser = buildEditUser(agentOrchestration);
		const changeEvents: string[] = [];
		eventBus.on("user.changed", (e) => changeEvents.push(e.change.objectId));

		registerAgentHealthSessionEndReactions(db, eventBus, editUser);

		eventBus.emit(sessionEnded({ sessionId: "ahr-rename-s0", agentId, outcome: "crashed" }));
		await vi.waitFor(async () => {
			expect(changeEvents.filter((id) => id === agentId).length).toBe(1);
		});

		// A plain rename — not a crash note — writes its own `user.changed`.
		const renameResult = await editUser(
			{ actor: agentId, db, eventBus, now: new Date().toISOString() },
			{ id: agentId, role: "renamed-role" },
		);
		expect(renameResult.ok).toBe(true);
		await vi.waitFor(async () => {
			expect(changeEvents.filter((id) => id === agentId).length).toBe(2);
		});

		eventBus.emit(sessionEnded({ sessionId: "ahr-rename-s1", agentId, outcome: "crashed" }));
		await vi.waitFor(async () => {
			expect(changeEvents.filter((id) => id === agentId).length).toBe(3);
		});

		const thisAgent = (await db.select().from(users)).find((u) => u.id === agentId);
		// 2 crashes + the rename in between = 3 `user.changed` rows, but only
		// 2 of them are crash notes.
		expect(thisAgent?.health).toContain(`2 failures in the last ${AGENT_FAILURE_WINDOW_DAYS} days`);
	});
});
