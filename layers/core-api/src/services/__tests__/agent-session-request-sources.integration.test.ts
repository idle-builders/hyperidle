import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	agentRunConfig,
	agentSessionRequests,
	bets,
	messages,
	routines,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { ScopedIds } from "@hyperidle/db/test-fixtures";
import type { AgentSessionRequestInput, DomainEvent } from "@hyperidle/domain-model";
import { EventBus } from "@hyperidle/event-bus";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/harness-protocol";
import { AdapterPool, createSandboxAdapter } from "@hyperidle/harness-registry";
import { createSessionRequest } from "@hyperidle/session-requests";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect } from "vitest";
import { test as fixtureTest } from "../../__testing__/test-fixtures.js";
import { buildTestRunOrchestrationComposition } from "../../__tests__/run-orchestration-test-runtime.js";

class RecordingHarnessAdapter implements HarnessAdapter {
	readonly configs: SessionConfig[] = [];

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		this.configs.push(config);
		return { sessionId: config.sessionId };
	}

	async *streamEvents(_handle: SessionHandle): AsyncIterable<HarnessEvent> {
		yield { type: "completion", text: "done" };
	}

	async stopSession(_handle: SessionHandle): Promise<SessionResult> {
		return {
			outcome: "completed",
			tokenUsage: { byTier: {} },
		};
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: ["test"],
			mcpSupport: false,
			returnEnforcement: "none",
		};
	}
}

async function seedWork(
	db: Parameters<typeof createSessionRequest>[0],
	ids: ScopedIds,
): Promise<{
	teamId: string;
	tmId: string;
	agentId: string;
	humanId: string;
	betId: string;
	taskId: string;
	routineId: string;
	threadId: string;
	msgId: string;
}> {
	const now = new Date().toISOString();
	const teamId = ids("team-au3-agent");
	const tmId = ids("tm-au3-agent");
	const agentId = ids("agent-au3-agent");
	const humanId = ids("u-au3-agent");
	const betId = ids("bet-au3-agent");
	const taskId = ids("task-au3-agent");
	const routineId = ids("routine-au3-agent");
	const threadId = ids("thread-au3-agent");
	const msgId = ids("msg-au3-agent");
	await db.insert(teams).values({ id: teamId, name: "AU3 Agent", phase: "build", createdAt: now });
	await db.insert(teamMembers).values({ id: tmId, teamId, capacity: 3, formedAt: now });
	await db.insert(users).values([
		{
			id: agentId,
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			teamId: tmId,
			createdAt: now,
		},
		{
			id: humanId,
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
	]);
	// @lore AU26 G1: the run config left `users` for `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: agentId,
		harnessType: "recording",
		modelProvider: "test",
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "Agent layer execution",
		doneCondition: "Tasks exist",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "Execute through agent layer",
		state: "accepted",
		ownerAgentId: agentId,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(routines).values({
		id: routineId,
		name: "AU3 routine",
		ownerAgentId: agentId,
		teamId,
		triggerType: "manual",
		createdAt: now,
	});
	await db.insert(threads).values({
		id: threadId,
		hostKind: "user",
		hostId: humanId,
		initiatorId: humanId,
		participants: JSON.stringify([humanId, `ast-${humanId}`]),
		createdAt: now,
		lastActiveAt: now,
	});
	await db.insert(messages).values({
		id: msgId,
		threadId,
		senderId: humanId,
		type: "plain",
		payload: JSON.stringify({ text: "Help" }),
		clientKey: msgId,
		createdAt: now,
	});
	return { teamId, tmId, agentId, humanId, betId, taskId, routineId, threadId, msgId };
}

describe("agent session request sources", () => {
	const tmpDirs: string[] = [];

	afterEach(() => {
		for (const dir of tmpDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	fixtureTest("all execution sources enter real session provisioning", async ({ db, ids }) => {
		// @lore AU31 §3.2/§5: the "recording" harness kind never invokes a
		// domain tool, so the composition's own default (unconfigured
		// transport, throws only if actually dialled) is honest here — each
		// test builds its own composition, so there is no ambient bleed to
		// guard against either.
		const composition = buildTestRunOrchestrationComposition();
		const seeded = await seedWork(db, ids);
		const eventBus = new EventBus();
		const events: DomainEvent[] = [];
		eventBus.on("*", (event) => {
			events.push(event);
		});
		const adapter = new RecordingHarnessAdapter();
		const adapterPool = new AdapterPool();
		const capturedContext = new Map<
			string,
			{ readonly manifestExists: boolean; readonly sessionContext: string }
		>();
		adapterPool.register("recording", adapter, {
			name: "Recording",
			kind: "local",
			type: "recording",
			modelProviders: ["test"],
			maxConcurrent: 8,
		});
		const sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "au3-agent-layer-"));
		tmpDirs.push(sandboxBasePath);
		const deps = {
			db,
			eventBus,
			adapterPool,
			workspace: createSandboxAdapter("local"),
			onBeforeTeardown: async ({
				sessionId,
				sandboxPath,
			}: {
				sessionId: string;
				sandboxPath: string;
			}) => {
				const manifestPath = path.join(sandboxPath, ".fabric", "manifest.json");
				const contextPath = path.join(sandboxPath, "context", "session.toon");
				capturedContext.set(sessionId, {
					manifestExists: fs.existsSync(manifestPath),
					sessionContext: fs.existsSync(contextPath) ? fs.readFileSync(contextPath, "utf8") : "",
				});
			},
		};

		// AU21 §9 Increment 12 (Decision H3), Wave E: `createSessionRequest(...,
		// {kind:"direct"})` bypasses the emit-time resolver pipeline entirely
		// (this `kind` has zero real production callers — see
		// `CreateSessionRequestInput`'s own doc comment on the sibling
		// `"triggered"` kind's identical fate), so it must bake the
		// `agentConfig` `admitSession`'s Phase 1 now requires directly onto
		// `payloadJson`, matching exactly what the real emit-time resolvers
		// bake from the SAME seeded `agent-au3-agent` row above.
		const bakedAgentConfigPayload = JSON.stringify({
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: seeded.tmId,
				systemPrompt: null,
				modelTierPreference: null,
				harnessType: "recording",
				modelProvider: "test",
				maxConcurrentSessions: 1,
			},
		});

		const routineRunId = ids("routine-run-au3-agent");
		const sources: AgentSessionRequestInput[] = [
			{
				sourceKind: "task",
				sourceId: seeded.taskId,
				streamId: `task:${seeded.taskId}`,
				taskId: seeded.taskId,
				agentId: seeded.agentId,
				teamId: seeded.teamId,
				promptMode: "task",
				idempotencyKey: ids("au3:task"),
				sourceCorrelation: { taskId: seeded.taskId, teamId: seeded.teamId },
				payloadJson: bakedAgentConfigPayload,
			},
			{
				sourceKind: "routine",
				sourceId: routineRunId,
				streamId: `routine:${seeded.routineId}`,
				taskId: null,
				agentId: seeded.agentId,
				teamId: seeded.teamId,
				promptMode: "routine",
				idempotencyKey: ids("au3:routine"),
				sourceCorrelation: {
					routineId: seeded.routineId,
					routineRunId,
					teamId: seeded.teamId,
				},
				payloadJson: bakedAgentConfigPayload,
			},
			{
				sourceKind: "assistant",
				sourceId: seeded.msgId,
				streamId: `thread:${seeded.threadId}`,
				taskId: null,
				agentId: seeded.agentId,
				teamId: seeded.teamId,
				userId: seeded.humanId,
				promptMode: "conversation",
				idempotencyKey: ids("au3:assistant"),
				sourceCorrelation: {
					threadId: seeded.threadId,
					messageId: seeded.msgId,
					userId: seeded.humanId,
					assistantAgentId: `ast-${seeded.humanId}`,
				},
				payloadJson: bakedAgentConfigPayload,
			},
		];

		for (const source of sources) {
			const request = await createSessionRequest(db, { kind: "direct", request: source });
			await composition.runSession(deps, {
				mode: "durable",
				request,
				completion: "await",
				sandboxBasePath,
			});
		}

		expect(adapter.configs).toHaveLength(3);
		// Sources are processed in order (task, routine, assistant) — "routine"
		// (index 1) is task-free (taskId: null), the same shape the removed
		// "decomposition" source used to be — its context goes through the
		// generic task-free `source_kind:` formatting `context.ts` produces.
		const routineConfig = adapter.configs[1];
		const routineContext = capturedContext.get(routineConfig?.sessionId ?? "");
		expect(routineContext?.manifestExists).toBe(true);
		expect(routineContext?.sessionContext).toContain("source_kind: routine");
		const started = events.filter((event) => event.type === "session_started");
		const ended = events.filter((event) => event.type === "session_ended");
		expect(started).toHaveLength(3);
		expect(ended).toHaveLength(3);
		expect(started.some((event) => event.sourceKind === "routine")).toBe(true);
		expect(ended.some((event) => event.sourceKind === "routine")).toBe(true);

		const rows = await db.select().from(agentSessionRequests);
		expect(rows.map((row) => row.status).sort()).toEqual(["completed", "completed", "completed"]);
		for (const row of rows) {
			const [stored] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, row.id));
			expect(stored?.sessionId).toBeTruthy();
		}
	});
});
