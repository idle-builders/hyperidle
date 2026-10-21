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
	await db.insert(teams).values({ id: "team-src", name: "Agent Sources Team", createdAt: now });
	await db.insert(users).values([
		{
			id: "agent-src",
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			teamId: "team-src",
			createdAt: now,
		},
		{
			id: "u-src",
			kind: "human",
			name: "Founder",
			role: "founder",
			status: "active",
			createdAt: now,
		},
	]);
	await db.insert(agentRunConfig).values({
		agentUserId: "agent-src",
		harnessType: "recording",
		modelProvider: "test",
	});
	await db.insert(threads).values({
		id: `thr-${"bet-src"}`,
		hostKind: "team",
		hostId: "team-src",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"bet-src"}`,
		id: "bet-src",
		parentTaskId: null,
		teamId: "team-src",
		title: "Agent layer execution",
		description: "Agent layer execution",
		doneWhen: JSON.stringify([{ id: "dw-bet-src", what: "Tasks exist", by: "check", state: "open", how: null }]),
		state: "in_progress",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(threads).values({
		id: `thr-${"task-src"}`,
		hostKind: "team",
		hostId: "team-src",
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		threadId: `thr-${"task-src"}`,
		id: "task-src",
		parentTaskId: "bet-src",
		teamId: "team-src",
		title: "Execute through agent layer",
		state: "accepted",
		ownerAgentId: "agent-src",
		createdAt: now,
		updatedAt: now,
	});
	// Subscriptions carry no FK to a backing row, so this seed only ever
	// needed the "subscription-src" id string used below as a
	// `sourceId`, never a real backing row.
	await db.insert(threads).values({
		id: "thread-src",
		hostKind: "user",
		hostId: "u-src",
		initiatorId: "u-src",
		participants: JSON.stringify(["u-src", "ast-u-src"]),
		createdAt: now,
		lastActiveAt: now,
	});
	await db.insert(messages).values({
		id: "msg-src",
		threadId: "thread-src",
		senderId: "u-src",
		type: "plain",
		payload: JSON.stringify({ text: "Help" }),
		clientKey: "msg-src",
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
		const sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "src-layer-"));
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

		// `createSessionRequest(..., {kind:"direct"})` bypasses the emit-time
		// resolver pipeline entirely, so it must bake the `agentConfig`
		// `admitSession` requires directly onto `payloadJson`, matching exactly
		// what the real emit-time resolvers bake from the SAME seeded
		// `agent-src` row above.
		const bakedAgentConfigPayload = JSON.stringify({
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: "team-src",
				systemPrompt: null,
				harnessType: "recording",
				modelProvider: "test",
				maxConcurrentSessions: 1,
			},
		});

		const sources: AgentSessionRequestInput[] = [
			{
				sourceKind: "task",
				sourceId: "task-src",
				streamId: "task:task-src",
				taskId: "task-src",
				agentId: "agent-src",
				teamId: "team-src",
				promptMode: "task",
				idempotencyKey: "src:task",
				sourceCorrelation: { taskId: "task-src", teamId: "team-src" },
				payloadJson: bakedAgentConfigPayload,
			},
			{
				sourceKind: "subscription",
				sourceId: "subscription-fire-src",
				streamId: "subscription:subscription-src",
				taskId: null,
				agentId: "agent-src",
				teamId: "team-src",
				promptMode: "subscription",
				idempotencyKey: "src:subscription",
				sourceCorrelation: {
					subscriptionId: "subscription-src",
					teamId: "team-src",
				},
				payloadJson: bakedAgentConfigPayload,
			},
			{
				sourceKind: "assistant",
				sourceId: "msg-src",
				streamId: "thread:thread-src",
				taskId: null,
				agentId: "agent-src",
				teamId: "team-src",
				userId: "u-src",
				promptMode: "conversation",
				idempotencyKey: "src:assistant",
				sourceCorrelation: {
					threadId: "thread-src",
					messageId: "msg-src",
					userId: "u-src",
					agentId: "ast-u-src",
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
		// Sources are processed in order (task, subscription, assistant) —
		// "subscription" (index 1) is task-free (taskId: null), the same shape
		// the removed "decomposition" source used to be — its context goes
		// through the generic task-free `source_kind:` formatting `context.ts`
		// produces.
		const subscriptionConfig = adapter.configs[1];
		const subscriptionContext = capturedContext.get(subscriptionConfig?.sessionId ?? "");
		expect(subscriptionContext?.manifestExists).toBe(true);
		expect(subscriptionContext?.sessionContext).toContain("source_kind: subscription");
		const started = events.filter((event) => event.type === "session_started");
		const ended = events.filter((event) => event.type === "session_ended");
		expect(started).toHaveLength(3);
		expect(ended).toHaveLength(3);
		expect(started.some((event) => event.sourceKind === "subscription")).toBe(true);
		expect(ended.some((event) => event.sourceKind === "subscription")).toBe(true);

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
