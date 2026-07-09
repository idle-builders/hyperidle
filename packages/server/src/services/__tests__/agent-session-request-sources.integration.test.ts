import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
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
import {
	type AgentSessionRequestInput,
	type DomainEvent,
	EventBus,
	type HarnessAdapter,
	type HarnessCapabilities,
	type HarnessEvent,
	type SessionConfig,
	type SessionHandle,
	type SessionResult,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect } from "vitest";
import { AdapterPool } from "../../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../../harness/local-sandbox-adapter.js";
import { test as fixtureTest } from "../../test-fixtures.js";
import { createAgentSessionRequest } from "../agent-session-requests.js";
import { consumeAgentSessionRequest } from "../agent-session-runtime.js";
import type { ProvisionSessionDeps } from "../session-provisioning.js";

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
			cost: { minor: 0, currency: "USD" },
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

async function seedWork(db: Parameters<typeof createAgentSessionRequest>[0]): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "team-au3-agent", name: "AU3 Agent", phase: "build", createdAt: now });
	await db
		.insert(teamMembers)
		.values({ id: "tm-au3-agent", teamId: "team-au3-agent", capacity: 3, formedAt: now });
	await db.insert(users).values([
		{
			id: "agent-au3-agent",
			kind: "ai",
			name: "Builder",
			role: "builder",
			status: "active",
			teamId: "tm-au3-agent",
			harnessType: "recording",
			modelProvider: "test",
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
	await db.insert(bets).values({
		id: "bet-au3-agent",
		teamId: "team-au3-agent",
		description: "Agent layer execution",
		doneCondition: "Tasks exist",
		status: "active",
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: "task-au3-agent",
		betId: "bet-au3-agent",
		teamId: "team-au3-agent",
		title: "Execute through agent layer",
		state: "accepted",
		ownerAgentId: "agent-au3-agent",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(routines).values({
		id: "routine-au3-agent",
		name: "AU3 routine",
		ownerAgentId: "agent-au3-agent",
		teamId: "team-au3-agent",
		triggerType: "manual",
		createdAt: now,
	});
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
		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool,
			workspace: new LocalSandboxAdapter(),
			onBeforeTeardown: async ({ sessionId, sandboxPath }) => {
				const manifestPath = path.join(sandboxPath, ".fabric", "manifest.json");
				const contextPath = path.join(sandboxPath, "context", "session.toon");
				capturedContext.set(sessionId, {
					manifestExists: fs.existsSync(manifestPath),
					sessionContext: fs.existsSync(contextPath) ? fs.readFileSync(contextPath, "utf8") : "",
				});
			},
		};

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
			},
			{
				sourceKind: "decomposition",
				sourceId: "bet-au3-agent",
				streamId: "bet:bet-au3-agent:decomposition",
				taskId: null,
				agentId: "agent-au3-agent",
				teamId: "team-au3-agent",
				promptMode: "decomposition",
				idempotencyKey: "au3:decomposition",
				sourceCorrelation: {
					betId: "bet-au3-agent",
					teamId: "team-au3-agent",
					decomposerAgentId: "agent-au3-agent",
				},
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
					assistantAgentId: "ast-u-au3-agent",
				},
			},
		];

		for (const source of sources) {
			const request = await createAgentSessionRequest(db, source);
			await consumeAgentSessionRequest(deps, request, { sandboxBasePath });
		}

		expect(adapter.configs).toHaveLength(4);
		const decompositionConfig = adapter.configs.find((config) =>
			config.assembledPrompt.includes("## Bet decomposition"),
		);
		expect(decompositionConfig?.assembledPrompt).toContain("Agent layer execution");
		expect(decompositionConfig?.assembledPrompt).toContain("Tasks exist");
		const decompositionContext = capturedContext.get(decompositionConfig?.sessionId ?? "");
		expect(decompositionContext?.manifestExists).toBe(true);
		expect(decompositionContext?.sessionContext).toContain("source_kind: decomposition");
		expect(decompositionContext?.sessionContext).toContain('"betId":"bet-au3-agent"');
		const started = events.filter((event) => event.type === "session_started");
		const ended = events.filter((event) => event.type === "session_ended");
		expect(started).toHaveLength(4);
		expect(ended).toHaveLength(4);
		expect(started.some((event) => event.sourceKind === "decomposition")).toBe(true);
		expect(ended.some((event) => event.sourceKind === "decomposition")).toBe(true);

		const rows = await db.select().from(agentSessionRequests);
		expect(rows.map((row) => row.status).sort()).toEqual([
			"completed",
			"completed",
			"completed",
			"completed",
		]);
		for (const row of rows) {
			const [stored] = await db
				.select()
				.from(agentSessionRequests)
				.where(eq(agentSessionRequests.id, row.id));
			expect(stored?.sessionId).toBeTruthy();
		}
	});
});
