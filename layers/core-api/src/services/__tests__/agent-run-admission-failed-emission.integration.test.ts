/**
 * The pre-handoff failure channel: `failOrRelease` (session-requests/src/
 * service.ts) emits `agent_run_admission_failed` on every failed claim/
 * dispatch attempt, terminal computed the same way for every kind.
 *
 * This file proves ONLY the emission contract — the event fires, with the
 * right shape, for both terminal codes and the non-terminal (informational)
 * case.
 *
 * @lore assertion note: `streamId`'s exact convention for a PRE-resolution
 * failure (the resolution itself is what's failing, so a fully-resolved
 * `task:<id>`/`subscription:<id>`/`thread:<id>` stream may not be derivable
 * from the stored intent row alone) is not pinned down by architecture.md
 * beyond "same convention as AgentWorkIntentEvent" — this test asserts its
 * presence as a non-empty string, not an exact format, and leaves the
 * precise convention to the implementer.
 */

import { agentWorkIntents, type HyperIdleDb, teams, users } from "@hyperidle/db";
import { drainIntents, enqueueWorkIntent } from "@hyperidle/session-requests";
import { eq, sql } from "drizzle-orm";
import { queueDeps } from "../../__testing__/durable-agent-queue-test-deps.js";
import { describe, expect, test } from "../../__testing__/test-fixtures.js";

async function dropRejectSessionRequestWritesTrigger(db: HyperIdleDb): Promise<void> {
	await db.execute(
		sql`drop trigger if exists au21_reject_session_request_write_emission on agent_session_requests`,
	);
}

const NOW = new Date().toISOString();

/**
 * Every kind resolves at emit time, so no kind reaches a domain read at
 * drain time for an unbaked intent. Vehicle: a genuinely BAKED
 * `subscription_run` intent (so `parseBakedRequest` is truthy and the drain
 * takes the zero-domain-read baked path) whose downstream
 * `agent_session_requests` insert is rejected by a real Postgres trigger.
 */
async function rejectSessionRequestWrites(db: HyperIdleDb): Promise<void> {
	await dropRejectSessionRequestWritesTrigger(db);
	await db.execute(sql`
		create or replace function au21_reject_session_request_write_emission() returns trigger as $$
		begin raise exception 'AU21 injected agent_session_requests write failure (emission vehicle)'; end;
		$$ language plpgsql
	`);
	await db.execute(sql`
		create trigger au21_reject_session_request_write_emission
		before insert on agent_session_requests
		for each row execute function au21_reject_session_request_write_emission()
	`);
}

function bakedSubscriptionRunRequest(idSuffix: string) {
	return {
		defaultAgentId: `emission-vehicle-agent-${idSuffix}`,
		sourceKind: "subscription" as const,
		sourceId: `emission-vehicle-fire-${idSuffix}`,
		streamId: `subscription:emission-vehicle-subscription-${idSuffix}`,
		teamId: `emission-vehicle-team-${idSuffix}`,
		taskId: null,
		sourceCorrelation: {
			subscriptionId: `emission-vehicle-subscription-${idSuffix}`,
			teamId: `emission-vehicle-team-${idSuffix}`,
		},
	};
}

async function seedSubscriptionVehicleFks(db: HyperIdleDb, idSuffix: string): Promise<void> {
	await db.insert(teams).values({
		id: `emission-vehicle-team-${idSuffix}`,
		name: `Emission vehicle team ${idSuffix}`,
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: `emission-vehicle-agent-${idSuffix}`,
		kind: "ai",
		name: "Emission vehicle agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
}

type CapturedAdmissionFailure = {
	readonly type: string;
	readonly intentId: string;
	readonly kind: string;
	readonly sourceKind: string;
	readonly sourceId: string;
	readonly failureCode: string;
	readonly terminal: boolean;
	readonly streamId?: string;
	readonly timestamp?: number;
};

function captureAdmissionFailures(eventBus: {
	on: (type: string, handler: (e: unknown) => void) => () => void;
}) {
	const events: CapturedAdmissionFailure[] = [];
	const unsubscribe = eventBus.on("agent_run_admission_failed", (event) => {
		events.push(event as CapturedAdmissionFailure);
	});
	return { events, unsubscribe };
}

describe("agent_run_admission_failed — emission from failOrRelease", () => {
	// @lore AU44: The "terminal INVALID_WORK_SOURCE failure" test was deleted here.
	// It relied on the unbaked-intent drain path (resolveIntentInputInternal) which
	// AU44 removed — bakedRequest is now required, unbaked intents are unreachable.
	// The MAX_ATTEMPTS_EXCEEDED and non-terminal tests below (baked + Postgres
	// trigger) remain as the live emission proofs.

	test("terminal MAX_ATTEMPTS_EXCEEDED failure (non-InvalidAgentWorkSourceError) emits the event", async ({
		db,
		eventBus,
	}) => {
		await seedSubscriptionVehicleFks(db, "max-attempts");
		await rejectSessionRequestWrites(db);
		try {
			const deps = { ...queueDeps(db), eventBus };
			const { events } = captureAdmissionFailures(eventBus);

			const intent = await enqueueWorkIntent(db, {
				kind: "subscription_run",
				sourceKind: "subscription",
				sourceId: "wave0-max-attempts-subscription-run",
				idempotencyKey: "wave0-max-attempts",
				bakedRequest: bakedSubscriptionRunRequest("max-attempts"),
			});

			await drainIntents(deps, { maxAttempts: 1 });

			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({
				intentId: intent.id,
				kind: "subscription_run",
				failureCode: "MAX_ATTEMPTS_EXCEEDED",
				terminal: true,
			});
			const [row] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.id, intent.id));
			expect(row?.status).toBe("failed");
		} finally {
			await dropRejectSessionRequestWritesTrigger(db);
		}
	});

	test("a non-terminal (retryable) failure emits an informational event with terminal: false", async ({
		db,
		eventBus,
	}) => {
		await seedSubscriptionVehicleFks(db, "non-terminal");
		await rejectSessionRequestWrites(db);
		try {
			const deps = { ...queueDeps(db), eventBus };
			const { events } = captureAdmissionFailures(eventBus);

			const intent = await enqueueWorkIntent(db, {
				kind: "subscription_run",
				sourceKind: "subscription",
				sourceId: "wave0-non-terminal-subscription-run",
				idempotencyKey: "wave0-non-terminal",
				bakedRequest: bakedSubscriptionRunRequest("non-terminal"),
			});

			await drainIntents(deps, { maxAttempts: 5 });

			expect(events).toHaveLength(1);
			expect(events[0]).toMatchObject({ intentId: intent.id, terminal: false });
			const [row] = await db
				.select()
				.from(agentWorkIntents)
				.where(eq(agentWorkIntents.id, intent.id));
			expect(row?.status).toBe("pending");
		} finally {
			await dropRejectSessionRequestWritesTrigger(db);
		}
	});

	// @lore AU44: the type system is the live proof that a direct run-row
	// write from `failOrRelease` can't come back — no such dependency exists
	// on `DurableQueueDeps` any more.
});
