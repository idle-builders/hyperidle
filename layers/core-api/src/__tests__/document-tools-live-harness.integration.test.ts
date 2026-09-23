/**
 * @lore The live-harness proof for the document module's three agent-facing
 * tools (`search_documents` / `open_document` / `edit_document`,
 * architecture.md §3): a real agent, given a real task session, writes
 * itself a memory, writes an artifact for that task, and reads a seeded
 * document back — proven against every installed harness, zero stubs, per
 * `.pipeline/rules/testing.md`'s harness-facing archetype.
 *
 * Same shape as `thread-turn-live-harness.integration.test.ts` (its own
 * `@lore` explains why this file builds its own minimal composition rather
 * than `createTestApp`, and why the human's/founder's own action calls go
 * through `action.run()` directly rather than an HTTP door) — this file
 * differs only in HOW the real agent gets woken: a task dispatch
 * (`edit_task` creating an already-`accepted`, agent-owned task) rather than
 * a thread `send_message`. `task-actions.ts`'s dispatch branch bakes a
 * `task_run` work intent the same `drainIntents` turns into a real
 * `agent_session_requests` row, and `RETURN_ACTION_NAMES`'s `edit_task` arm
 * (`framework/harness-protocol/src/harness/return-actions.ts`) is what lets
 * the agent end its own turn once its three document-tool steps are done.
 *
 * Per harness (claude / codex / opencode / cursor-agent), `requireHarness(...)`,
 * zero stubs, hard-fail if absent — never `skipIf` to green (CLAUDE.md,
 * testing.md).
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { serve } from "@hono/node-server";
import {
	bootAgentOrchestration,
	buildRunOrchestrationComposition,
	type RunOrchestrationHarnessRuntimeAdapter,
} from "@hyperidle/agent-orchestration";
import type { AgentOrchestrationTransport } from "@hyperidle/api-contract";
import {
	type AgentSessionRequest,
	agentRunConfig,
	agentSessionRequests,
	changes,
	type DocumentRow as DbDocumentRow,
	documents,
	type HyperIdleDb,
	teams,
	users,
} from "@hyperidle/db";
import { test as dbTest } from "@hyperidle/db/test-fixtures";
import type { ActionResult, EditTaskInput, TaskView } from "@hyperidle/domain-model";
import type { HyperIdleEnv } from "@hyperidle/domain-model/http";
import { EventBus } from "@hyperidle/event-bus";
import {
	createLocalAdapterPool,
	createReturnEnforcement,
	createSandboxAdapter,
	provisionHarnessEnvironment,
	writePluginStdioMcpEntries,
} from "@hyperidle/harness-registry";
import {
	createMcpToolBridge,
	type McpToolBridge,
	returnStatusTool,
} from "@hyperidle/harness-registry/mcp";
import {
	HARNESS_TEST_MODELS,
	requireHarness,
	type SupportedHarnessName,
} from "@hyperidle/harness-registry/test-utils";
import { drainIntents } from "@hyperidle/session-requests";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { describe, expect } from "vitest";
import { queueDeps } from "../__testing__/durable-agent-queue-test-deps.js";
import type { Action, ActionContext } from "../actions/action.js";
import { actionsAsTools } from "../actions/actions-as-tools.js";
import { buildCoreActions } from "../actions/compose.js";
import {
	buildAgentOrchestrationPort,
	buildSeamBackedReviewVerdictRecorder,
	buildSeamBackedWorkIntentRecorder,
} from "../services/agent-orchestration-port-composition.js";

const NOW = "2026-09-22T00:00:00.000Z";

/** Test-vocabulary harness name -> the exact `agent_run_config.harness_type` `createLocalAdapterPool` registers under. Same map as `thread-turn-live-harness.integration.test.ts`. */
const HARNESS_TYPE: Partial<Record<SupportedHarnessName, string>> = {
	claude: "claude-code",
	codex: "codex",
	opencode: "opencode",
	"cursor-agent": "cursor-agent",
};

/** Deliberately skips the middleware stack — proves the seam route's effect, not the door's auth. Same shape as `thread-turn-live-harness.integration.test.ts`'s own copy. */
function fixtureAgentOrchestrationTransport(app: Hono<HyperIdleEnv>): AgentOrchestrationTransport {
	return async (req: Request) => {
		const url = new URL(req.url);
		const strippedPath = url.pathname.replace(/^\/api/, "");
		const target = new URL(`${strippedPath}${url.search}`, url.origin);
		const hasBody = req.method !== "GET" && req.method !== "HEAD";
		const body = hasBody ? await req.text() : undefined;
		return app.fetch(new Request(target, { method: req.method, headers: req.headers, body }));
	};
}

function runnerFor<I, O>(actions: readonly Action[], name: string) {
	const found = actions.find((a) => a.declaration.name === name);
	if (!found) throw new Error(`no "${name}" action`);
	return found.run as (ctx: ActionContext, input: I) => Promise<ActionResult<O>>;
}

/** An OS-assigned free port — same helper as `thread-turn-live-harness.integration.test.ts`. */
async function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const addr = probe.address();
			if (addr === null || typeof addr === "string") {
				probe.close(() => reject(new Error("could not determine a free port")));
				return;
			}
			const { port } = addr;
			probe.close(() => resolve(port));
		});
	});
}

type EnforcementRegistry = ReturnType<typeof createReturnEnforcement>;

/** Same hand-assembled harness-runtime port as `thread-turn-live-harness.integration.test.ts` — `layers/core-api` does not depend on `@hyperidle/agent-execution`. */
function buildLiveHarnessRuntimeAdapter(
	mcpBridgeRegistry: McpToolBridge,
	enforcementRegistry: EnforcementRegistry,
): RunOrchestrationHarnessRuntimeAdapter {
	return {
		enforcementRegistry,
		createReturnGate: (requiredReturnActions, taskId) =>
			enforcementRegistry.createGate(requiredReturnActions, taskId),
		evaluateReturn: (gate, endReason) => enforcementRegistry.evaluate(gate, endReason),
		provisionReturnHook: async (options) => {
			await provisionHarnessEnvironment({ ...options, token: options.bridgeToken });
		},
		writeCliMcpConfig: (options) => provisionHarnessEnvironment(options),
		openMcpBridge: (session) =>
			mcpBridgeRegistry.open({
				sessionId: session.sessionId,
				registry: session.toolRegistry,
				onToolCall: session.onToolCall,
			}),
		closeMcpBridge: (token) => mcpBridgeRegistry.close(token),
		writePluginStdioMcpEntries: (params) => writePluginStdioMcpEntries(params),
	};
}

async function seedFounderAgentAndTeam(
	db: HyperIdleDb,
	opts: {
		readonly founderId: string;
		readonly agentId: string;
		readonly teamId: string;
		readonly harnessType: string;
		readonly modelId: string;
	},
): Promise<void> {
	await db.insert(users).values({
		id: opts.founderId,
		kind: "human",
		name: "Document Tools Live Harness Founder",
		role: "founder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: opts.agentId,
		kind: "ai",
		name: "Document Tools Live Harness Agent",
		role: "builder",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(teams).values({
		id: opts.teamId,
		name: "Document Tools Live Harness Team",
		createdAt: NOW,
	});
	await db.insert(agentRunConfig).values({
		agentUserId: opts.agentId,
		harnessType: opts.harnessType,
		modelId: opts.modelId,
		maxConcurrentSessions: 1,
	});
}

/**
 * Seed one plain `documents` row directly (a fixture the real agent will
 * read back through `search_documents`/`open_document`, not the subject of
 * this helper's own writeback) — same idiom as
 * `run-orchestration-test-runtime.ts`'s `seedDocument`, kept file-local
 * because this file does not otherwise depend on that runtime helper.
 */
async function seedFixtureDocument(
	db: HyperIdleDb,
	opts: { readonly title: string; readonly body: string },
): Promise<DbDocumentRow> {
	const id = randomUUID();
	const ts = new Date().toISOString();
	await db.insert(documents).values({
		id,
		scopeKind: "factory",
		scopeId: null,
		title: opts.title,
		body: opts.body,
		format: "markdown",
		status: "active",
		position: 0,
		version: 1,
		updatedBy: "seed",
		createdAt: ts,
		updatedAt: ts,
	});
	const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
	if (!row) throw new Error(`seedFixtureDocument: failed to read back ${id}`);
	return row;
}

/**
 * The human's/founder's door onto task dispatch: `edit_task`, created
 * already `accepted` and owned by the agent in one call — the same branch
 * `task-actions.ts`'s "-- the dispatch branch: an accept, or an owner
 * change to an agent --" comment names, firing on `prev === null` exactly
 * as it does on a live accept. Bakes a `task_run` work intent
 * (`sourceKind: "task_dispatch_attempt"`), which `drainIntents` — the same
 * drain the poller calls on a timer, invoked once here — turns into a real
 * `agent_session_requests` row whose `sourceId` is the task's own id
 * (`resolveTaskRunRequest`'s task_run arm).
 */
async function createAndDrainTaskDispatchRequest(
	db: HyperIdleDb,
	eventBus: EventBus,
	actions: readonly Action[],
	opts: {
		readonly founderId: string;
		readonly agentId: string;
		readonly teamId: string;
		readonly title: string;
		readonly description: string;
	},
): Promise<{ readonly request: AgentSessionRequest; readonly taskId: string }> {
	const editTask = runnerFor<EditTaskInput, TaskView>(actions, "edit_task");
	const result = await editTask(
		{ actor: opts.founderId, db, eventBus, now: new Date().toISOString() },
		{
			teamId: opts.teamId,
			title: opts.title,
			description: opts.description,
			ownerAgentId: opts.agentId,
			state: "accepted",
		},
	);
	if (!result.ok) {
		throw new Error(`edit_task (create+accept) failed: ${JSON.stringify(result.problems)}`);
	}
	const taskId = result.data.task.id;

	await drainIntents({ ...queueDeps(db), eventBus });

	const [request] = await db
		.select()
		.from(agentSessionRequests)
		.where(eq(agentSessionRequests.sourceId, taskId));
	if (!request) {
		throw new Error(
			`drainIntents did not produce an agent_session_requests row for task ${taskId}`,
		);
	}
	return { request, taskId };
}

describe("a real agent writes a memory, writes a task artifact, and reads a document back through the document tools (real harness)", () => {
	/**
	 * Shared proof body — every harness runs the identical real path, driven
	 * through a real task session (`RETURN_ACTION_NAMES`'s `edit_task` arm
	 * ends the turn — see the file header). Each caller below wraps this in
	 * its OWN `describe` with a LITERAL `requireHarness("<name>")` call, one
	 * per harness — `thread-turn-live-harness.integration.test.ts`'s own
	 * ungreppable-proof convention.
	 */
	async function runDocumentToolsProof(
		harness: SupportedHarnessName,
		db: HyperIdleDb,
	): Promise<void> {
		const founderId = `founder-doc-tools-${harness}`;
		const agentId = `agent-doc-tools-${harness}`;
		const teamId = `team-doc-tools-${harness}`;
		const harnessType = HARNESS_TYPE[harness];
		if (!harnessType) throw new Error(`no harnessType mapping for ${harness}`);

		await seedFounderAgentAndTeam(db, {
			founderId,
			agentId,
			teamId,
			harnessType,
			modelId: HARNESS_TEST_MODELS[harness].model,
		});

		const token = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
		const taskTitle = `Document tools probe ${harness} ${token}`;
		const memoryTitle = `Probe memory ${harness} ${token}`;
		const memoryBody = `A private note from the document-tools probe. MEMORY_TOKEN=${token}`;
		const artifactTitle = `Probe artifact ${harness} ${token}`;
		const artifactBody = `The output of the document-tools probe task. ARTIFACT_TOKEN=${token}`;
		const seedTargetTitle = `Probe seed target ${harness} ${token}`;
		const seedTargetBody = `Read me. SEED_TOKEN=${token}`;
		const seedDistractorTitle = `Probe seed distractor ${harness} ${token}`;
		const seedDistractorBody = `Never read me. DISTRACTOR_TOKEN=${token}`;

		const target = await seedFixtureDocument(db, { title: seedTargetTitle, body: seedTargetBody });
		const distractor = await seedFixtureDocument(db, {
			title: seedDistractorTitle,
			body: seedDistractorBody,
		});

		const taskDescription = [
			"Do these four steps, in order, using your available tools. Do not skip any step and do not do step 4 before steps 1-3 are done.",
			"",
			`1. Call edit_document with as="memory", title="${memoryTitle}", body="${memoryBody}" to save yourself a private note.`,
			"",
			`2. Call edit_document with as="artifact", title="${artifactTitle}", body="${artifactBody}" to save this task's output.`,
			"",
			`3. Call search_documents with text="${seedTargetTitle}" to find the document titled exactly "${seedTargetTitle}", then call open_document with its id to read its body.`,
			"",
			`4. Call search_tasks with text="${taskTitle}" to find this task, then call edit_task with its id and state="done" to finish.`,
		].join("\n");

		const eventBus = new EventBus();
		const orchestrationBoot = await bootAgentOrchestration({ db, eventBus });
		const agentOrchestration = buildAgentOrchestrationPort(
			fixtureAgentOrchestrationTransport(orchestrationBoot.app),
		);
		const actions = buildCoreActions({
			agentOrchestration,
			agentWorkIntentRecorder: buildSeamBackedWorkIntentRecorder(agentOrchestration),
			reviewVerdictRecorder: buildSeamBackedReviewVerdictRecorder(agentOrchestration),
		});
		const actionTools = actionsAsTools(actions);

		const port = await getFreePort();
		const mcpBaseUrl = `http://127.0.0.1:${port}`;
		const enforcementRegistry = createReturnEnforcement();
		const mcpBridgeRegistry = createMcpToolBridge({
			enforcement: enforcementRegistry,
			baseUrl: mcpBaseUrl,
		});
		const bridgeApp = new Hono();
		const bridgeApi = new Hono();
		bridgeApi.route("/", mcpBridgeRegistry.router);
		bridgeApp.route("/api", bridgeApi);
		const httpServer = await new Promise<ReturnType<typeof serve>>((resolve) => {
			const server = serve({ fetch: bridgeApp.fetch, port }, () => resolve(server));
		});

		const sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), `doc-tools-${harness}-`));

		try {
			const { request, taskId } = await createAndDrainTaskDispatchRequest(db, eventBus, actions, {
				founderId,
				agentId,
				teamId,
				title: taskTitle,
				description: taskDescription,
			});

			const adapterPool = await createLocalAdapterPool({ enforcement: enforcementRegistry });
			const workspace = createSandboxAdapter("local");
			const composition = buildRunOrchestrationComposition({
				harnessRuntime: buildLiveHarnessRuntimeAdapter(mcpBridgeRegistry, enforcementRegistry),
				returnStatusTool: { forRegistry: (registry) => returnStatusTool.forRegistry(registry) },
				// `actionTools` is a thunk now — this test's list never
				// changes mid-run, so a constant-returning closure is enough.
				actionTools: () => actionTools,
			});

			const result = await composition.runSession(
				{ db, eventBus, adapterPool, workspace },
				{ mode: "durable", request, sandboxBasePath, completion: "await" },
			);

			expect(result.mode).toBe("completed");
			if (result.mode !== "completed") return;
			if (result.outcome !== "completed") {
				const [failedRequest] = await db
					.select()
					.from(agentSessionRequests)
					.where(eq(agentSessionRequests.id, request.id));
				throw new Error(
					`session on ${harness} did not complete: outcome=${result.outcome} ` +
						`errorCode=${failedRequest?.errorCode ?? "none"} errorMessage=${failedRequest?.errorMessage ?? "none"}`,
				);
			}

			// -- (a) the memory ---------------------------------------------------
			const [memoryDoc] = await db.select().from(documents).where(eq(documents.title, memoryTitle));
			expect(memoryDoc, `no memory document titled "${memoryTitle}" on ${harness}`).toBeDefined();
			expect(memoryDoc?.scopeKind).toBe("user");
			expect(memoryDoc?.scopeId).toBe(agentId);
			expect(memoryDoc?.parentKind).toBeNull();
			expect(memoryDoc?.body).toContain(token);
			const [memoryChange] = await db
				.select()
				.from(changes)
				.where(
					and(
						eq(changes.object, "document"),
						eq(changes.objectId, memoryDoc?.id ?? ""),
						eq(changes.kind, "created"),
					),
				);
			expect(
				memoryChange,
				`no created change row for the memory document on ${harness}`,
			).toBeDefined();
			expect(memoryChange?.actor).toBe(agentId);

			// -- (b) the task artifact ---------------------------------------------
			const [artifactDoc] = await db
				.select()
				.from(documents)
				.where(eq(documents.title, artifactTitle));
			expect(
				artifactDoc,
				`no artifact document titled "${artifactTitle}" on ${harness}`,
			).toBeDefined();
			expect(artifactDoc?.parentKind).toBe("task");
			expect(artifactDoc?.parentId).toBe(taskId);
			expect(artifactDoc?.body).toContain(token);

			// -- (c) the read-back, through the tools --------------------------------
			const [targetAfter] = await db.select().from(documents).where(eq(documents.id, target.id));
			expect(
				targetAfter?.readCount,
				`seeded target document was not opened by the real agent on ${harness}`,
			).toBeGreaterThan(target.readCount);
			const [distractorAfter] = await db
				.select()
				.from(documents)
				.where(eq(documents.id, distractor.id));
			expect(
				distractorAfter?.readCount,
				`the distractor document's read_count moved on ${harness} — the agent opened the wrong document`,
			).toBe(distractor.readCount);
		} finally {
			orchestrationBoot.dispose();
			await new Promise<void>((resolve, reject) => {
				httpServer.close((err: Error | undefined) => (err ? reject(err) : resolve()));
			});
			fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		}
	}

	describe("[harness:claude]", () => {
		requireHarness("claude");
		dbTest(
			"a real agent on claude-code writes a memory, writes a task artifact, and reads a seeded document back",
			async ({ db }) => runDocumentToolsProof("claude", db),
			180_000,
		);
	});

	describe("[harness:codex]", () => {
		requireHarness("codex");
		dbTest(
			"a real agent on codex writes a memory, writes a task artifact, and reads a seeded document back",
			async ({ db }) => runDocumentToolsProof("codex", db),
			180_000,
		);
	});

	describe("[harness:opencode]", () => {
		requireHarness("opencode");
		dbTest(
			"a real agent on opencode writes a memory, writes a task artifact, and reads a seeded document back",
			async ({ db }) => runDocumentToolsProof("opencode", db),
			180_000,
		);
	});

	describe("[harness:cursor-agent]", () => {
		requireHarness("cursor-agent");
		dbTest(
			"a real agent on cursor-agent writes a memory, writes a task artifact, and reads a seeded document back",
			async ({ db }) => runDocumentToolsProof("cursor-agent", db),
			180_000,
		);
	});
});
