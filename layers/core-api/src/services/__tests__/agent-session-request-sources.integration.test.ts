import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	agentRunConfig,
	agentSessionRequests,
	type HyperIdleDb,
	messages,
	tasks,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import type { AgentSessionRequestInput } from "@hyperidle/domain-model";
import type { DomainEvent } from "@hyperidle/event-bus";
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

async function seedWork(db: HyperIdleDb): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "team-au3-agent", name: "AU3 Agent", phase: "build", createdAt: now });
	await db.insert(users).values([
		{
			id: "agent-au3-agent",
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			teamId: "team-au3-agent",
			createdAt: now,
		},
		{
			id: "u-au3-agent",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
	]);
	// @lore AU26 G1: the run config left `users` for `agent_run_config`.
	await db.insert(agentRunConfig).values({
		agentUserId: "agent-au3-agent",
		harnessType: "recording",
		modelProvider: "test",
	});
	await db.insert(threads).values({
		id: `thr-${"bet-au3-agent"}`,
		hostKind: "team",
		hostId: "team-au3-agent",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"bet-au3-agent"}`,
		id: "bet-au3-agent",
		parentTaskId: null,
		teamId: "team-au3-agent",
		title: "Agent layer execution",
		description: "Agent layer execution",
		doneCondition: "Tasks exist",
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(threads).values({
		id: `thr-${"task-au3-agent"}`,
		hostKind: "team",
		hostId: "team-au3-agent",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"task-au3-agent"}`,
		id: "task-au3-agent",
		parentTaskId: "bet-au3-agent",
		teamId: "team-au3-agent",
		title: "Execute through agent layer",
		state: "accepted",
		ownerAgentId: "agent-au3-agent",
		createdAt: now,
		updatedAt: now,
	});
	// @lore BC5 T7b: `routines` is dropped (migration 0089) — nothing FKs to
	// it, so this seed only ever needed the "routine-au3-agent" id string used
	// below as a `sourceId`, never a real backing row.
	await db.insert(threads).values({
		id: "thread-au3-agent",
		hostKind: "user",
		hostId: "u-au3-agent",
		initiatorId: "u-au3-agent",
		participants: JSON.stringify(["u-au3-agent", "ast-u-au3-agent"]),
		createdAt: now,
		lastActiveAt: now,
	});
	await db.insert(messages).values({
		id: "msg-au3-agent",
		threadId: "thread-au3-agent",
		senderId: "u-au3-agent",
		type: "plain",
		payload: JSON.stringify({ text: "Help" }),
		clientKey: "msg-au3-agent",
		createdAt: now,
	});
}

describe("agent session request sources", () => {
	const tmpDirs: string[] = [];

	afterEach(() => {
		for (const dir of tmpDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	fixtureTest("all execution sources enter real session provisioning", async ({ db }) => {
		// @lore AU31 §3.2/§5: the "recording" harness kind never invokes a
		// domain tool, so the composition's own default (unconfigured
		// transport, throws only if actually dialled) is honest here — each
		// test builds its own composition, so there is no ambient bleed to
		// guard against either.
		const composition = buildTestRunOrchestrationComposition();
		await seedWork(db);
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
				teamId: "team-au3-agent",
				systemPrompt: null,
				harnessType: "recording",
				modelProvider: "test",
				maxConcurrentSessions: 1,
			},
		});

		const sources: AgentSessionRequestInput[] = [
			{
				sourceKind: "task",
				sourceId: "task-au3-agent",
				streamId: "task:task-au3-agent",
				taskId: "task-au3-agent",
				agentId: "agent-au3-agent",
				teamId: "team-au3-agent",
				promptMode: "task",
				idempotencyKey: "au3:task",
				sourceCorrelation: { taskId: "task-au3-agent", teamId: "team-au3-agent" },
				payloadJson: bakedAgentConfigPayload,
			},
			{
				sourceKind: "routine",
				sourceId: "routine-run-au3-agent",
				streamId: "routine:routine-au3-agent",
				taskId: null,
				agentId: "agent-au3-agent",
				teamId: "team-au3-agent",
				promptMode: "routine",
				idempotencyKey: "au3:routine",
				sourceCorrelation: {
					routineId: "routine-au3-agent",
					routineRunId: "routine-run-au3-agent",
					teamId: "team-au3-agent",
				},
				payloadJson: bakedAgentConfigPayload,
			},
			{
				sourceKind: "assistant",
				sourceId: "msg-au3-agent",
				streamId: "thread:thread-au3-agent",
				taskId: null,
				agentId: "agent-au3-agent",
				teamId: "team-au3-agent",
				userId: "u-au3-agent",
				promptMode: "conversation",
				idempotencyKey: "au3:assistant",
				sourceCorrelation: {
					threadId: "thread-au3-agent",
					messageId: "msg-au3-agent",
					userId: "u-au3-agent",
					agentId: "ast-u-au3-agent",
				},
				payloadJson: bakedAgentConfigPayload,
			},
		];

		for (const source of sources) {
			const now = new Date().toISOString();
			const sourceRecord = source as Record<string, unknown>;
			const [request] = await db
				.insert(agentSessionRequests)
				.values({
					id: `test-request-${source.idempotencyKey}`,
					sourceKind: source.sourceKind,
					sourceId: source.sourceId,
					streamId: source.streamId,
					taskId: typeof sourceRecord.taskId === "string" ? sourceRecord.taskId : null,
					agentId: source.agentId,
					teamId: typeof source.teamId === "string" ? source.teamId : null,
					userId: source.userId ?? null,
					promptMode: source.promptMode,
					payloadJson: source.payloadJson ?? null,
					idempotencyKey: source.idempotencyKey,
					sourceCorrelationJson: JSON.stringify(source.sourceCorrelation ?? {}),
					status: "pending",
					createdAt: now,
					updatedAt: now,
				})
				.returning();
			if (!request) throw new Error("Insert failed");
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
