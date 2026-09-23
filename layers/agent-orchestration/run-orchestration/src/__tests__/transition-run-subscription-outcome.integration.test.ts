/**
 * `transitionRun`'s session disposition (`endSession`/`crashSession`,
 * `transition-run.ts`) carries no routine finalize payload any more — the
 * routine mechanism is gone, replaced by subscriptions, and a subscription
 * has no per-run outcome to finalize. `session_ended` carries only the
 * session's own `outcome`, for every source kind including `subscription`.
 */
import { type HyperIdleDb, sessions, teams, users } from "@hyperidle/db";
import { describe, expect, test, vi } from "@hyperidle/db/test-fixtures";
import type { SessionEndedEvent } from "@hyperidle/event-bus";
import { EventBus } from "@hyperidle/event-bus";
import { expectTypeOf } from "vitest";
import { transitionRun } from "../transition-run.js";

const NOW = new Date().toISOString();

/** `sessionRequests` is a bag of `vi.fn()` stubs — the "session" disposition path (`endSession`/`crashSession`) never touches it. */
function buildPorts() {
	return {
		sessionRequests: {
			findSessionRequest: vi.fn(),
			listSessionRequests: vi.fn(),
			transitionSessionRequest: vi.fn(),
			abortSessionRun: vi.fn(),
			registerSessionRun: vi.fn(),
			deregisterSessionRun: vi.fn(),
		},
	};
}

async function seedSubscriptionSession(
	db: HyperIdleDb,
	id: string,
): Promise<{ readonly agentId: string; readonly sessionId: string; readonly teamId: string }> {
	const teamId = `${id}-team`;
	const agentId = `${id}-agent`;
	const sessionId = `${id}-session`;

	await db.insert(teams).values({ id: teamId, name: "Team", phase: "build", createdAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		teamId,
		createdAt: NOW,
	});
	await db.insert(sessions).values({
		id: sessionId,
		agentId,
		modelTier: "fast",
		startedAt: NOW,
		state: "active",
		requestId: `${id}-request`,
		sourceKind: "subscription",
		sourceId: `${id}-subscription-fire`,
	});

	return { agentId, sessionId, teamId };
}

describe("transitionRun session disposition — no routine finalize payload", () => {
	test("crashSession for a subscription-sourced session emits session_ended with no routine outcome field", async ({
		db,
	}) => {
		const { agentId, sessionId, teamId } = await seedSubscriptionSession(db, "tso-crash");
		const eventBus = new EventBus();
		const captured: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => captured.push(event));

		await transitionRun(
			{ db, eventBus, ports: buildPorts() },
			{
				target: "session",
				context: {
					sessionId,
					agentId,
					taskId: null,
					sandboxPath: "/tmp/tso-crash",
					ingestion: { dispose: () => {} },
					traceId: "trace-tso-crash",
					requestContext: {
						requestId: "tso-crash-request",
						sourceKind: "subscription",
						sourceId: "tso-crash-subscription-fire",
						sourceCorrelation: { subscriptionId: "tso-crash-subscription", teamId },
					},
				},
				disposition: "crash",
			},
		);

		expect(captured).toHaveLength(1);
		expect(captured[0]).toMatchObject({
			sourceKind: "subscription",
			outcome: "crashed",
		});
		expect(captured[0]).not.toHaveProperty("routineRunOutcome");
	});

	test("endSession for a subscription-sourced session emits session_ended with no routine outcome field", async ({
		db,
	}) => {
		const { agentId, sessionId, teamId } = await seedSubscriptionSession(db, "tso-end");
		const eventBus = new EventBus();
		const captured: SessionEndedEvent[] = [];
		eventBus.on("session_ended", (event) => captured.push(event));

		await transitionRun(
			{ db, eventBus, ports: buildPorts() },
			{
				target: "session",
				context: {
					sessionId,
					agentId,
					taskId: null,
					sandboxPath: "/tmp/tso-end",
					ingestion: { dispose: () => {} },
					traceId: "trace-tso-end",
					requestContext: {
						requestId: "tso-end-request",
						sourceKind: "subscription",
						sourceId: "tso-end-subscription-fire",
						sourceCorrelation: { subscriptionId: "tso-end-subscription", teamId },
					},
				},
				disposition: "end",
			},
		);

		expect(captured).toHaveLength(1);
		expect(captured[0]).toMatchObject({
			sourceKind: "subscription",
			outcome: "completed",
		});
		expect(captured[0]).not.toHaveProperty("routineRunOutcome");
	});
});

describe("SessionEndedEvent carries no routine finalize field (compile-time)", () => {
	test("the type has no routineRunOutcome property", () => {
		expectTypeOf<SessionEndedEvent>().not.toHaveProperty("routineRunOutcome");
	});
});
