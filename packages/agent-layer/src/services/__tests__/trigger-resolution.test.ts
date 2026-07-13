import { loadPluginConfigurationDefaults, setConfigurationOverride } from "@hyperidle/core-app";
import {
	agentSessionRequests,
	bets,
	createTestDb,
	type TestDbHandle,
	tasks,
	teamMembers,
	teams,
	triggerResolutionHistory,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createTriggeredAgentSessionRequest } from "../trigger-resolution.js";

const NOW = "2026-07-09T10:00:00.000Z";

describe("trigger resolution", () => {
	let handle: TestDbHandle;

	beforeEach(async () => {
		handle = await createTestDb();
		await handle.db
			.insert(teams)
			.values({ id: "team-1", name: "Team", phase: "build", createdAt: NOW });
		await handle.db.insert(teamMembers).values({
			id: "team-members-1",
			teamId: "team-1",
			capacity: 3,
			activeBets: 0,
			formedAt: NOW,
		});
		await handle.db.insert(users).values([
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
	});

	afterEach(async () => {
		await handle.close();
	});

	test("falls back to the default eligible agent with no prompt override", async () => {
		const { request, resolution } = await createTriggeredAgentSessionRequest(handle.db, {
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
		});

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
		const [history] = await handle.db.select().from(triggerResolutionHistory);
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

	test("user trigger overrides plugin trigger for the same event scope", async () => {
		await loadPluginConfigurationDefaults(handle.db, {
			plugin: { id: "plugin.routine", name: "Routine Plugin", version: "1.0.0" },
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
		await setConfigurationOverride(handle.db, {
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

		const { request, resolution } = await createTriggeredAgentSessionRequest(handle.db, {
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
		});

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

	test("plugin trigger conflicts are deterministic and observable", async () => {
		await loadPluginConfigurationDefaults(handle.db, {
			plugin: { id: "plugin.zeta", name: "Zeta", version: "1.0.0" },
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
		await loadPluginConfigurationDefaults(handle.db, {
			plugin: { id: "plugin.alpha", name: "Alpha", version: "1.0.0" },
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

		const { request, resolution } = await createTriggeredAgentSessionRequest(handle.db, {
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
		});

		expect(request.agentId).toBe("agent-user");
		expect(resolution.triggerKey).toBe("trigger.conflict.alpha");
		expect(resolution.conflicts).toEqual(["trigger.conflict.zeta"]);
		const [history] = await handle.db
			.select()
			.from(triggerResolutionHistory)
			.where(eq(triggerResolutionHistory.requestId, request.id));
		expect(JSON.parse(history!.resolutionJson)).toMatchObject({
			conflicts: ["trigger.conflict.zeta"],
			deterministicOrder: ["trigger.conflict.alpha", "trigger.conflict.zeta"],
		});
	});

	test("more specific plugin trigger beats a broader user-owned trigger", async () => {
		await loadPluginConfigurationDefaults(handle.db, {
			plugin: { id: "plugin.specific", name: "Specific", version: "1.0.0" },
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
		await setConfigurationOverride(handle.db, {
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

		const { request, resolution } = await createTriggeredAgentSessionRequest(handle.db, {
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
		});

		expect(request.agentId).toBe("agent-plugin");
		expect(resolution.triggerKey).toBe("trigger.routine.exact");
		expect(resolution.conflicts).toEqual(["trigger.routine.broad"]);
	});

	test("ineligible explicit trigger records failed resolution and creates no request", async () => {
		await handle.db.insert(users).values({
			id: "agent-paused",
			kind: "ai",
			name: "Paused",
			teamId: "team-members-1",
			role: "builder",
			status: "paused",
			createdAt: NOW,
		});
		await loadPluginConfigurationDefaults(handle.db, {
			plugin: { id: "plugin.invalid", name: "Invalid", version: "1.0.0" },
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
			createTriggeredAgentSessionRequest(handle.db, {
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
			}),
		).rejects.toThrow(/ineligible agent/);

		expect(await handle.db.select().from(agentSessionRequests)).toHaveLength(0);
		const [history] = await handle.db.select().from(triggerResolutionHistory);
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

	test("idempotent retry returns original request history even after trigger config changes", async () => {
		await loadPluginConfigurationDefaults(handle.db, {
			plugin: { id: "plugin.original", name: "Original", version: "1.0.0" },
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
		const first = await createTriggeredAgentSessionRequest(handle.db, input);
		await setConfigurationOverride(handle.db, {
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

		const second = await createTriggeredAgentSessionRequest(handle.db, input);

		expect(second.request.id).toBe(first.request.id);
		expect(second.request.agentId).toBe("agent-plugin");
		expect(second.resolution).toEqual(first.resolution);
		const history = await handle.db
			.select()
			.from(triggerResolutionHistory)
			.where(eq(triggerResolutionHistory.requestId, first.request.id));
		expect(history).toHaveLength(1);
	});

	test("proposed-call triggers preserve granted agent while applying prompt metadata", async () => {
		await handle.db.insert(bets).values({
			id: "bet-1",
			teamId: "team-1",
			description: "Bet",
			status: "active",
			createdAt: NOW,
		});
		await handle.db.insert(tasks).values({
			id: "task-1",
			betId: "bet-1",
			teamId: "team-1",
			title: "Task",
			state: "accepted",
			createdAt: NOW,
			updatedAt: NOW,
		});
		await loadPluginConfigurationDefaults(handle.db, {
			plugin: { id: "plugin.proposed", name: "Proposed", version: "1.0.0" },
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

		const { request, resolution } = await createTriggeredAgentSessionRequest(handle.db, {
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
		});

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

	test("creates a session request instead of invoking runtime internals", async () => {
		const { request } = await createTriggeredAgentSessionRequest(handle.db, {
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
		});

		const [row] = await handle.db
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
