/**
 * `trigger-resolution` (agent-orchestration) — integration tests.
 *
 * @lore AU19 Increment 3a: converted from a package-local unit test
 * (`packages/server/src/services/__tests__/trigger-resolution.test.ts`,
 * pre-migration) to an integration test here — same shape as `notifications`'
 * Increment 1g `silence-policy.integration.test.ts` conversion. This module
 * exercises real cross-Service wiring (`@hyperidle/settings`,
 * `@hyperidle/users`, `@hyperidle/org`, plus the interim
 * `agent-session-requests.ts` functions `session-requests` will own once it
 * migrates) — `trigger-resolution`'s own package (Mechanism C: deps =
 * `@hyperidle/db` + `@hyperidle/shared` only) cannot import any of these
 * directly, so a package-local unit test with real ports is not possible;
 * this integration test IS the real-behavior proof.
 */

import {
	agentSessionRequests,
	bets,
	type HyperIdleDb,
	tasks,
	teamMembers,
	teams,
	triggerResolutionHistory,
	users,
} from "@hyperidle/db";
import {
	type CreateSessionRequestInput,
	createSessionRequest,
	type DurableAgentQueueDeps,
} from "@hyperidle/session-requests";
import { seedConfigurationDefaults, writeConfigurationOverride } from "@hyperidle/settings";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { queueDeps } from "../services/durable-agent-queue.js";
import { test } from "../test-fixtures.js";

const NOW = "2026-07-09T10:00:00.000Z";

function triggerResolutionDeps(db: HyperIdleDb): DurableAgentQueueDeps {
	return queueDeps(db);
}

async function createTriggeredRequest(
	db: HyperIdleDb,
	input: Extract<CreateSessionRequestInput, { kind: "triggered" }>["request"],
	_deps?: unknown,
) {
	const request = await createSessionRequest(
		db,
		{ kind: "triggered", request: input },
		triggerResolutionDeps(db),
	);
	const [history] = await db
		.select()
		.from(triggerResolutionHistory)
		.where(eq(triggerResolutionHistory.requestId, request.id))
		.limit(1);
	if (!history) throw new Error("Trigger resolution history was not persisted");
	return { request, resolution: JSON.parse(history.resolutionJson) };
}

async function seedTeamAndAgents(db: HyperIdleDb): Promise<void> {
	await db.insert(teams).values({ id: "team-1", name: "Team", phase: "build", createdAt: NOW });
	await db.insert(teamMembers).values({
		id: "team-members-1",
		teamId: "team-1",
		capacity: 3,
		activeBets: 0,
		formedAt: NOW,
	});
	await db.insert(users).values([
		{
			id: "agent-default",
			kind: "ai",
			name: "Default",
			teamId: "team-members-1",
			role: "builder",
			status: "active",
			createdAt: NOW,
		},
		{
			id: "agent-plugin",
			kind: "ai",
			name: "Plugin",
			teamId: "team-members-1",
			role: "builder",
			status: "active",
			createdAt: NOW,
		},
		{
			id: "agent-user",
			kind: "ai",
			name: "User",
			teamId: "team-members-1",
			role: "builder",
			status: "active",
			createdAt: NOW,
		},
		{
			id: "user-1",
			kind: "human",
			name: "Human",
			role: "founder",
			status: "active",
			createdAt: NOW,
		},
	]);
}

describe("trigger resolution", () => {
	test("falls back to the default eligible agent with no prompt override", async ({ db }) => {
		await seedTeamAndAgents(db);
		const { request, resolution } = await createTriggeredRequest(
			db,
			{
				eventType: "assistant.message",
				sourceKind: "assistant",
				sourceId: "msg-1",
				streamId: "thread:thread-1",
				defaultAgentId: "agent-default",
				userId: "user-1",
				idempotencyKey: "assistant:msg-1",
				sourceCorrelation: {
					threadId: "thread-1",
					messageId: "msg-1",
					userId: "user-1",
					assistantAgentId: "agent-default",
				},
			},
			triggerResolutionDeps,
		);

		expect(request.agentId).toBe("agent-default");
		expect(request.promptMode).toBe("conversation");
		expect(resolution).toEqual(
			expect.objectContaining({
				triggerKey: null,
				triggerSource: "fallback",
				result: "fallback",
				chosenAgentId: "agent-default",
				promptSource: null,
			}),
		);
		const [history] = await db.select().from(triggerResolutionHistory);
		expect(history).toEqual(
			expect.objectContaining({
				sourceKind: "assistant",
				sourceId: "msg-1",
				eventType: "assistant.message",
				triggerKey: null,
				triggerSource: "fallback",
				result: "fallback",
				chosenAgentId: "agent-default",
				promptSource: null,
				requestId: request.id,
			}),
		);
	});

	test("user trigger overrides plugin trigger for the same event scope", async ({ db }) => {
		await seedTeamAndAgents(db);
		await seedConfigurationDefaults(db, {
			source: { id: "plugin.routine", name: "Routine Plugin", version: "1.0.0" },
			defaults: [
				{
					kind: "trigger",
					key: "trigger.routine.daily",
					value: {
						eventType: "routine.fire",
						sourceKind: "routine",
						scope: { sourceId: "routine-1", teamId: "team-1" },
						agentId: "agent-plugin",
						prompt: "plugin prompt",
					},
				},
			],
			now: NOW,
		});
		await writeConfigurationOverride(db, {
			kind: "trigger",
			key: "trigger.routine.daily",
			value: {
				eventType: "routine.fire",
				sourceKind: "routine",
				scope: { sourceId: "routine-1", teamId: "team-1" },
				agentId: "agent-user",
				prompt: "user prompt",
			},
			createdByUserId: "user-1",
			now: "2026-07-09T10:01:00.000Z",
		});

		const { request, resolution } = await createTriggeredRequest(
			db,
			{
				eventType: "routine.fire",
				sourceKind: "routine",
				sourceId: "routine-1",
				streamId: "routine:routine-1",
				teamId: "team-1",
				defaultAgentId: "agent-default",
				idempotencyKey: "routine:run-1",
				sourceCorrelation: {
					routineId: "routine-1",
					routineRunId: "run-1",
					teamId: "team-1",
				},
			},
			triggerResolutionDeps,
		);

		expect(request.agentId).toBe("agent-user");
		expect(JSON.parse(request.payloadJson ?? "{}")).toMatchObject({
			trigger: { prompt: "user prompt", source: "user_override" },
		});
		expect(resolution).toEqual(
			expect.objectContaining({
				triggerKey: "trigger.routine.daily",
				triggerSource: "user_override",
				result: "matched",
				chosenAgentId: "agent-user",
				promptSource: "user_override:trigger.routine.daily",
			}),
		);
	});

	test("plugin trigger conflicts are deterministic and observable", async ({ db }) => {
		await seedTeamAndAgents(db);
		await seedConfigurationDefaults(db, {
			source: { id: "plugin.zeta", name: "Zeta", version: "1.0.0" },
			defaults: [
				{
					kind: "trigger",
					key: "trigger.conflict.zeta",
					value: {
						eventType: "routine.fire",
						sourceKind: "routine",
						scope: { teamId: "team-1" },
						agentId: "agent-plugin",
						prompt: "zeta prompt",
					},
				},
			],
			now: NOW,
		});
		await seedConfigurationDefaults(db, {
			source: { id: "plugin.alpha", name: "Alpha", version: "1.0.0" },
			defaults: [
				{
					kind: "trigger",
					key: "trigger.conflict.alpha",
					value: {
						eventType: "routine.fire",
						sourceKind: "routine",
						scope: { teamId: "team-1" },
						agentId: "agent-user",
						prompt: "alpha prompt",
					},
				},
			],
			now: NOW,
		});

		const { request, resolution } = await createTriggeredRequest(
			db,
			{
				eventType: "routine.fire",
				sourceKind: "routine",
				sourceId: "routine-2",
				streamId: "routine:routine-2",
				teamId: "team-1",
				defaultAgentId: "agent-default",
				idempotencyKey: "routine:run-2",
				sourceCorrelation: {
					routineId: "routine-2",
					routineRunId: "run-2",
					teamId: "team-1",
				},
			},
			triggerResolutionDeps,
		);

		expect(request.agentId).toBe("agent-user");
		expect(resolution.triggerKey).toBe("trigger.conflict.alpha");
		expect(resolution.conflicts).toEqual(["trigger.conflict.zeta"]);
		const [history] = await db
			.select()
			.from(triggerResolutionHistory)
			.where(eq(triggerResolutionHistory.requestId, request.id));
		expect(JSON.parse(history!.resolutionJson)).toMatchObject({
			conflicts: ["trigger.conflict.zeta"],
			deterministicOrder: ["trigger.conflict.alpha", "trigger.conflict.zeta"],
		});
	});

	test("more specific plugin trigger beats a broader user-owned trigger", async ({ db }) => {
		await seedTeamAndAgents(db);
		await seedConfigurationDefaults(db, {
			source: { id: "plugin.specific", name: "Specific", version: "1.0.0" },
			defaults: [
				{
					kind: "trigger",
					key: "trigger.routine.exact",
					value: {
						eventType: "routine.fire",
						sourceKind: "routine",
						scope: { sourceId: "routine-3", teamId: "team-1" },
						agentId: "agent-plugin",
						prompt: "exact prompt",
					},
				},
			],
			now: NOW,
		});
		await writeConfigurationOverride(db, {
			kind: "trigger",
			key: "trigger.routine.broad",
			value: {
				eventType: "routine.fire",
				sourceKind: "routine",
				scope: { teamId: "team-1" },
				agentId: "agent-user",
				prompt: "broad prompt",
			},
			createdByUserId: "user-1",
			now: "2026-07-09T10:02:00.000Z",
		});

		const { request, resolution } = await createTriggeredRequest(
			db,
			{
				eventType: "routine.fire",
				sourceKind: "routine",
				sourceId: "routine-3",
				streamId: "routine:routine-3",
				teamId: "team-1",
				defaultAgentId: "agent-default",
				idempotencyKey: "routine:run-3",
				sourceCorrelation: {
					routineId: "routine-3",
					routineRunId: "run-3",
					teamId: "team-1",
				},
			},
			triggerResolutionDeps,
		);

		expect(request.agentId).toBe("agent-plugin");
		expect(resolution.triggerKey).toBe("trigger.routine.exact");
		expect(resolution.conflicts).toEqual(["trigger.routine.broad"]);
	});

	test("ineligible explicit trigger records failed resolution and creates no request", async ({
		db,
	}) => {
		await seedTeamAndAgents(db);
		await db.insert(users).values({
			id: "agent-paused",
			kind: "ai",
			name: "Paused",
			teamId: "team-members-1",
			role: "builder",
			status: "paused",
			createdAt: NOW,
		});
		await seedConfigurationDefaults(db, {
			source: { id: "plugin.invalid", name: "Invalid", version: "1.0.0" },
			defaults: [
				{
					kind: "trigger",
					key: "trigger.invalid",
					value: {
						eventType: "routine.fire",
						sourceKind: "routine",
						scope: { sourceId: "routine-bad", teamId: "team-1" },
						agentId: "agent-paused",
					},
				},
			],
			now: NOW,
		});

		await expect(
			createTriggeredRequest(
				db,
				{
					eventType: "routine.fire",
					sourceKind: "routine",
					sourceId: "routine-bad",
					streamId: "routine:routine-bad",
					teamId: "team-1",
					defaultAgentId: "agent-default",
					idempotencyKey: "routine:bad",
					sourceCorrelation: {
						routineId: "routine-bad",
						routineRunId: "run-bad",
						teamId: "team-1",
					},
				},
				triggerResolutionDeps,
			),
		).rejects.toThrow(/ineligible agent/);

		expect(await db.select().from(agentSessionRequests)).toHaveLength(0);
		const [history] = await db.select().from(triggerResolutionHistory);
		expect(history).toEqual(
			expect.objectContaining({
				sourceKind: "routine",
				sourceId: "routine-bad",
				result: "failed",
				triggerSource: "failed",
				chosenAgentId: null,
				requestId: null,
			}),
		);
	});

	test("idempotent retry returns original request history even after trigger config changes", async ({
		db,
	}) => {
		await seedTeamAndAgents(db);
		await seedConfigurationDefaults(db, {
			source: { id: "plugin.original", name: "Original", version: "1.0.0" },
			defaults: [
				{
					kind: "trigger",
					key: "trigger.retry",
					value: {
						eventType: "routine.fire",
						sourceKind: "routine",
						scope: { sourceId: "routine-retry", teamId: "team-1" },
						agentId: "agent-plugin",
						prompt: "first prompt",
					},
				},
			],
			now: NOW,
		});
		const input = {
			eventType: "routine.fire" as const,
			sourceKind: "routine" as const,
			sourceId: "routine-retry",
			streamId: "routine:routine-retry",
			teamId: "team-1",
			defaultAgentId: "agent-default",
			idempotencyKey: "routine:retry",
			sourceCorrelation: {
				routineId: "routine-retry",
				routineRunId: "run-retry",
				teamId: "team-1",
			},
		};
		const first = await createTriggeredRequest(db, input, triggerResolutionDeps);
		await writeConfigurationOverride(db, {
			kind: "trigger",
			key: "trigger.retry",
			value: {
				eventType: "routine.fire",
				sourceKind: "routine",
				scope: { sourceId: "routine-retry", teamId: "team-1" },
				agentId: "agent-user",
				prompt: "changed prompt",
			},
			createdByUserId: "user-1",
			now: "2026-07-09T10:03:00.000Z",
		});

		const second = await createTriggeredRequest(db, input, triggerResolutionDeps);

		expect(second.request.id).toBe(first.request.id);
		expect(second.request.agentId).toBe("agent-plugin");
		expect(second.resolution).toEqual(first.resolution);
		const history = await db
			.select()
			.from(triggerResolutionHistory)
			.where(eq(triggerResolutionHistory.requestId, first.request.id));
		expect(history).toHaveLength(1);
	});

	test("proposed-call triggers preserve granted agent while applying prompt metadata", async ({
		db,
	}) => {
		await seedTeamAndAgents(db);
		await db.insert(bets).values({
			id: "bet-1",
			teamId: "team-1",
			description: "Bet",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(tasks).values({
			id: "task-1",
			betId: "bet-1",
			teamId: "team-1",
			title: "Task",
			state: "accepted",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await seedConfigurationDefaults(db, {
			source: { id: "plugin.proposed", name: "Proposed", version: "1.0.0" },
			defaults: [
				{
					kind: "trigger",
					key: "trigger.proposed",
					value: {
						eventType: "proposed_call.granted",
						sourceKind: "proposed_call",
						scope: { sourceId: "call-1", teamId: "team-1" },
						agentId: "agent-user",
						prompt: "keep grant context",
					},
				},
			],
			now: NOW,
		});

		const { request, resolution } = await createTriggeredRequest(
			db,
			{
				eventType: "proposed_call.granted",
				sourceKind: "proposed_call",
				sourceId: "call-1",
				streamId: "task:task-1",
				taskId: "task-1",
				teamId: "team-1",
				defaultAgentId: "agent-default",
				idempotencyKey: "proposed_call:call-1:granted",
				sourceCorrelation: {
					taskId: "task-1",
					proposedCallId: "call-1",
					grantedAgentId: "agent-default",
				},
			},
			triggerResolutionDeps,
		);

		expect(request.agentId).toBe("agent-default");
		expect(resolution).toMatchObject({
			result: "matched",
			triggerKey: "trigger.proposed",
			chosenAgentId: "agent-default",
			reason: "matched_trigger_preserved_granted_agent",
		});
		expect(JSON.parse(request.payloadJson ?? "{}")).toMatchObject({
			trigger: { prompt: "keep grant context" },
		});
	});

	test("creates a session request instead of invoking runtime internals", async ({ db }) => {
		await seedTeamAndAgents(db);
		const { request } = await createTriggeredRequest(
			db,
			{
				eventType: "work.decompose_requested",
				sourceKind: "decomposition",
				sourceId: "bet-1",
				streamId: "bet:bet-1:decomposition",
				teamId: "team-1",
				defaultAgentId: "agent-default",
				idempotencyKey: "decomposition:bet-1:start",
				sourceCorrelation: {
					betId: "bet-1",
					teamId: "team-1",
					decomposerAgentId: "agent-default",
				},
			},
			triggerResolutionDeps,
		);

		const [row] = await db
			.select()
			.from(agentSessionRequests)
			.where(eq(agentSessionRequests.id, request.id));
		expect(row).toEqual(
			expect.objectContaining({
				sourceKind: "decomposition",
				sourceId: "bet-1",
				agentId: "agent-default",
				status: "pending",
			}),
		);
	});
});
