/**
 * `params.transcript` reaches the `## Conversation` prompt section (every
 * harness reads it from AGENTS.md/CLAUDE.md) and
 * `SessionConfig.requiredReturnActions`: a task-free session with a calling
 * thread resolves to `["send_message"]`; a subscription wake (no calling
 * thread to reply into) resolves to `["return_status"]` instead — it has no
 * work-output action and no place a forced message is guaranteed to belong,
 * and reports status with the self-check tool instead.
 *
 * Uses `deps.onBeforeHarnessStart`'s abort return to observe the fully
 * assembled `SessionConfig` without spawning a real harness process.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, tasks, teams, threads, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import type { SessionConfig } from "@hyperidle/harness-protocol";
import { afterEach, describe, vi } from "vitest";
import {
	buildRunningHarnessPorts,
	neverCalled,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	rejectingHarnessAdapter,
	type SessionLifecyclePorts,
} from "../__testing__/test-fixtures.js";
import { createProvisioner } from "../provisioner.js";

/**
 * Phase 6 calls assembleAgentContext whenever params.requestContext is set
 * (task-free durable-request path) — a no-op stub for the one scenario here
 * that sets requestContext (no-transcript regression check); every other
 * scenario omits requestContext, so the never-called guard still applies.
 */
function buildHarnessPorts(opts: { readonly allowContextAssembly?: boolean } = {}) {
	return buildRunningHarnessPorts({
		assembleAgentContext: opts.allowContextAssembly
			? vi.fn(async () => ({ itemCount: 0, durationMs: 0, manifestPath: "" }))
			: neverCalled("contextAssembly.assembleAgentContext"),
	});
}

describe("generic transcript delivery", () => {
	const sandboxDirs: string[] = [];
	afterEach(() => {
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	/**
	 * The task-backed variant. A session with a task assembles agent context and a
	 * prompt, which the task-free scenarios above deliberately forbid — the two new
	 * tests below assert on `instruction`, which is composed from the task and does
	 * not depend on either.
	 */
	function buildTaskHarnessPorts(): SessionLifecyclePorts {
		const base = buildHarnessPorts();
		return {
			...base,
			contextAssembly: {
				...base.contextAssembly,
				assembleAgentContext: async () => ({
					itemCount: 0,
					durationMs: 0,
					manifestPath: "",
				}),
				assemblePrompt: async () => ({ assembledPrompt: "context", personaToolsTokens: 0 }),
			},
		};
	}

	/**
	 * The subscription-bundle variant — the real production shape
	 * (`resolveSubscriptionWakeRequest` bakes `contextBundle.kind:"subscription"`
	 * whenever an `assembleSessionDocuments` dep is wired, which production
	 * always does): `assembleSubscriptionPrompt`, not the task-free fallback
	 * `assembleTaskFreePrompt`, composes the prompt. Echoes
	 * `returnOrientation` straight into `assembledPrompt` so a test can
	 * assert on it without re-implementing the real composer.
	 */
	function buildSubscriptionHarnessPorts(): SessionLifecyclePorts {
		const base = buildHarnessPorts();
		return {
			...base,
			contextAssembly: {
				...base.contextAssembly,
				assembleAgentContext: async () => ({ itemCount: 0, durationMs: 0, manifestPath: "" }),
				assembleSubscriptionPrompt: async (input) => ({
					assembledPrompt: [
						"# Session Instructions",
						"## Subscription",
						input.returnOrientation ?? "",
					].join("\n"),
					personaToolsTokens: 0,
				}),
			},
		};
	}

	async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
		await db.insert(users).values({
			id,
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
	}

	async function seedTask(db: HyperIdleDb, taskId: string): Promise<void> {
		const now = new Date().toISOString();
		const teamId = `${taskId}-team`;
		const rootTaskId = `${taskId}-bet`;
		await db.insert(teams).values({ id: teamId, name: teamId, createdAt: now });
		await db.insert(threads).values({
			id: `thr-${rootTaskId}`,
			hostKind: "team",
			hostId: teamId,
			initiatorId: "system:propagation",
			participants: "[]",
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: rootTaskId,
			threadId: `thr-${rootTaskId}`,
			parentTaskId: null,
			teamId: teamId,
			title: "Generic transcript test bet",
			description: "Generic transcript test bet",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(threads).values({
			id: `thr-${taskId}`,
			hostKind: "team",
			hostId: teamId,
			initiatorId: "system:propagation",
			participants: "[]",
			lastActiveAt: now,
			createdAt: now,
		});
		await db.insert(tasks).values({
			id: taskId,
			threadId: `thr-${taskId}`,
			parentTaskId: rootTaskId,
			teamId,
			title: "Generic transcript test task",
			state: "accepted",
			createdAt: now,
			updatedAt: now,
		});
	}

	function buildDeps(
		db: HyperIdleDb,
		sandboxPath: string,
		captured: { sessionConfig?: SessionConfig },
	): ProvisionSessionDeps {
		return {
			db,
			eventBus: new EventBus(),
			adapterPool: {
				select: () => ({
					id: "fake-adapter",
					adapter: rejectingHarnessAdapter("must not be called — onBeforeHarnessStart aborts"),
					meta: {
						name: "Fake",
						kind: "local",
						type: undefined,
						modelProviders: [],
						maxConcurrent: 5,
					},
				}),
				release: () => undefined,
				describeSelectFailure: () => "test pool selected nothing",
			},
			workspace: {
				spawn: async () => ({ sandboxId: "sbx-1", path: sandboxPath }),
				exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
				adopt: (path: string) => Promise.resolve({ sandboxId: "sb-adopted", path }),
				destroy: async () => undefined,
			},
			onBeforeHarnessStart: (ctx) => {
				captured.sessionConfig = ctx.sessionConfig;
				return "abort";
			},
		};
	}

	function baseParams(agentId: string, sandboxPath: string): ProvisionSessionParams {
		return {
			taskId: null,
			agentId,
			productId: "task-free",
			sandboxBasePath: sandboxPath,
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
			},
		} as ProvisionSessionParams;
	}

	// @lore: the `## Conversation` prompt section is the transcript's only delivery — a CLI harness never reads `SessionConfig.messages`.
	test("a session with a baked transcript + calling thread + no task gets ## Conversation and requiredReturnActions:['send_message']", async ({
		db,
	}) => {
		await seedAgent(db, "agent-transcript-1");
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-transcript-"));
		sandboxDirs.push(sandboxPath);

		const ports = buildHarnessPorts();
		const provisioner = createProvisioner(ports);
		const captured: { sessionConfig?: SessionConfig } = {};
		const deps = buildDeps(db as HyperIdleDb, sandboxPath, captured);

		const params: ProvisionSessionParams = {
			...baseParams("agent-transcript-1", sandboxPath),
			callingThreadId: "thread-transcript-1",
			transcript: [
				{ role: "user", content: "What's the status of the launch?" },
				{ role: "assistant", content: "On track for Friday." },
			],
		} as ProvisionSessionParams;

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured.sessionConfig).toBeDefined();
		const prompt = captured.sessionConfig?.assembledPrompt ?? "";
		expect(prompt).toContain("## Conversation");
		expect(prompt).toContain("What's the status of the launch?");
		expect(prompt).toContain("On track for Friday.");
		expect(prompt).toContain("call `send_message`");
		expect(prompt).not.toContain("Correlation:");

		expect(captured.sessionConfig?.requiredReturnActions).toEqual(["send_message"]);
	});

	test("a task_run session (has a taskId) with a transcript does NOT get requiredReturnActions:['send_message'] — the full set still satisfies", async ({
		db,
	}) => {
		await seedAgent(db, "agent-transcript-2");
		await seedTask(db, "task-transcript-2");
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-transcript-"));
		sandboxDirs.push(sandboxPath);

		const ports = buildHarnessPorts({ allowContextAssembly: true });
		const provisioner = createProvisioner(ports);
		const captured: { sessionConfig?: SessionConfig } = {};
		const deps = buildDeps(db as HyperIdleDb, sandboxPath, captured);

		const params: ProvisionSessionParams = {
			...baseParams("agent-transcript-2", sandboxPath),
			taskId: "task-transcript-2",
			callingThreadId: "thread-transcript-2",
			transcript: [{ role: "user", content: "Any updates?" }],
		} as ProvisionSessionParams;

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured.sessionConfig?.requiredReturnActions).toBeUndefined();
	});

	test("a subscription wake (task-free, no calling thread) gets requiredReturnActions:['return_status'], never send_message", async ({
		db,
	}) => {
		await seedAgent(db, "agent-subscription-wake-1");
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-subscription-wake-"));
		sandboxDirs.push(sandboxPath);

		// A `requestContext` with no `taskId` runs Phase 6's task-free
		// `assembleAgentContext` call (same branch the "no transcript"
		// scenario below exercises for `sourceKind: "task"`) — allow it.
		const ports = buildHarnessPorts({ allowContextAssembly: true });
		const provisioner = createProvisioner(ports);
		const captured: { sessionConfig?: SessionConfig } = {};
		const deps = buildDeps(db as HyperIdleDb, sandboxPath, captured);

		// The real shape a subscription's wake bakes: task-free, no calling
		// thread at all (subscription-wake.ts never sets one — there is no
		// thread to reply into), sourceKind "subscription".
		const params = {
			...baseParams("agent-subscription-wake-1", sandboxPath),
			requestContext: {
				requestId: "req-subscription-wake-1",
				sourceKind: "subscription",
				sourceId: "sub-1:change-1",
				sourceCorrelation: { subscriptionId: "sub-1", changeId: "change-1" },
			},
		} as unknown as ProvisionSessionParams;

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured.sessionConfig?.requiredReturnActions).toEqual(["return_status"]);
		// The proactive prompt orientation, not just the reactive forced-return
		// message — a subscription wake gets no calling-thread transcript to
		// infer this from, so it has to be told up front. It reports status,
		// never a forced message.
		const prompt = captured.sessionConfig?.assembledPrompt ?? "";
		expect(prompt).toContain("call `return_status`");
		expect(prompt).not.toContain("call `send_message`");
	});

	test("a subscription wake WITH the real contextBundle also gets the return_status orientation (assembleSubscriptionPrompt, not the task-free fallback)", async ({
		db,
	}) => {
		await seedAgent(db, "agent-subscription-wake-2");
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-subscription-wake-"));
		sandboxDirs.push(sandboxPath);

		const provisioner = createProvisioner(buildSubscriptionHarnessPorts());
		const captured: { sessionConfig?: SessionConfig } = {};
		const deps = buildDeps(db as HyperIdleDb, sandboxPath, captured);

		const params = {
			...baseParams("agent-subscription-wake-2", sandboxPath),
			contextBundle: {
				kind: "subscription",
				subscription: { id: "sub-2", event: "task.changed", schedule: null },
				prompt: "Edit the named document.",
				change: null,
				agent: { id: "agent-subscription-wake-2", name: "Builder", role: "builder" },
				team: null,
				documents: [],
			},
			requestContext: {
				requestId: "req-subscription-wake-2",
				sourceKind: "subscription",
				sourceId: "sub-2:change-2",
				sourceCorrelation: { subscriptionId: "sub-2", changeId: "change-2" },
			},
		} as unknown as ProvisionSessionParams;

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured.sessionConfig?.requiredReturnActions).toEqual(["return_status"]);
		expect(captured.sessionConfig?.assembledPrompt ?? "").toContain("call `return_status`");
	});

	test("a session with no transcript renders the original Correlation line, unchanged (no regression)", async ({
		db,
	}) => {
		await seedAgent(db, "agent-transcript-3");
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-transcript-"));
		sandboxDirs.push(sandboxPath);

		const ports = buildHarnessPorts({ allowContextAssembly: true });
		const provisioner = createProvisioner(ports);
		const captured: { sessionConfig?: SessionConfig } = {};
		const deps = buildDeps(db as HyperIdleDb, sandboxPath, captured);

		const params: ProvisionSessionParams = {
			...baseParams("agent-transcript-3", sandboxPath),
			requestContext: {
				requestId: "req-transcript-3",
				sourceKind: "task",
				sourceId: "task-transcript-3",
				sourceCorrelation: { taskId: "task-transcript-3", teamId: "team-transcript-3" },
			},
		} as ProvisionSessionParams;

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		const prompt = captured.sessionConfig?.assembledPrompt ?? "";
		expect(prompt).toContain("Correlation:");
		expect(prompt).not.toContain("## Conversation");
	});

	/**
	 * A gated agent has to be told, once, that some actions need a person and how
	 * to ask — because the deny message deliberately will not tell it.
	 *
	 * @lore: a gate's deny message states only that a rule blocked the call — an imperative there reads as a suspected injection.
	 */
	test("every session is told in its prompt that some work needs a person", async ({ db }) => {
		await seedAgent(db, "agent-gated-1");
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba2-gate-prompt-"));
		sandboxDirs.push(sandboxPath);

		const provisioner = createProvisioner(buildHarnessPorts());
		const captured: { sessionConfig?: SessionConfig } = {};
		const deps = buildDeps(db as HyperIdleDb, sandboxPath, captured);
		const params = baseParams("agent-gated-1", sandboxPath);

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		const prompt = captured.sessionConfig?.assembledPrompt ?? "";
		expect(prompt).toContain("## When work needs a person");
		expect(prompt, "the agent must be told HOW to ask").toContain(
			"calling `send_message` with a `review`",
		);
		// Nothing intercepts, so the agent has to know the judgement is its own.
		// Text written for a gate would have it waiting for a refusal that never
		// comes.
		expect(prompt, "the agent elects to ask; nothing stops it").toContain("Nothing here stops you");
		expect(prompt, "a decline must not read as the task being refused").toContain(
			"turns down the approach you proposed, not the task",
		);
	});

	/**
	 * A task session's instruction is the task.
	 *
	 */
	test("a task session is instructed with the task itself", async ({ db }) => {
		await seedAgent(db, "agent-instruction-1");
		await seedTask(db as HyperIdleDb, "task-instruction-1");
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba10-instruction-"));
		sandboxDirs.push(sandboxPath);

		const provisioner = createProvisioner(buildTaskHarnessPorts());
		const captured: { sessionConfig?: SessionConfig } = {};
		const deps = buildDeps(db as HyperIdleDb, sandboxPath, captured);

		// The durable shape: a requestContext IS present, which is the production
		// path and precisely the case that used to fall through to a task-free prompt.
		const params = {
			...baseParams("agent-instruction-1", sandboxPath),
			taskId: "task-instruction-1",
			contextBundle: {
				kind: "task",
				task: {
					id: "task-instruction-1",
					title: "Write the proof file",
					description: "Create a file called proof.txt containing exactly OK.",
					state: "in_progress",
					doneWhen: [],
					reasons: [],
				},
				ancestors: [],
				agent: { id: "agent-instruction-1", name: "Builder", role: "builder" },
				team: { id: "team-1", name: "Team" },
				knowledge: [],
			},
			requestContext: {
				requestId: "req-1",
				sourceKind: "task",
				sourceId: "task-instruction-1",
				sourceCorrelation: { taskId: "task-instruction-1", teamId: "team-1" },
			},
		} as unknown as ProvisionSessionParams;

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		const instruction = captured.sessionConfig?.instruction ?? "";
		expect(instruction, "the agent must be told the task's title").toContain(
			"Write the proof file",
		);
		expect(instruction, "and what the task actually asks for").toContain(
			"Create a file called proof.txt containing exactly OK.",
		);
		expect(instruction, "raw correlation JSON is not an instruction").not.toContain(
			"sourceCorrelation",
		);
	});

	test("the instruction is delivered whole, not truncated", async ({ db }) => {
		await seedAgent(db, "agent-instruction-2");
		await seedTask(db as HyperIdleDb, "task-instruction-2");
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba10-instruction-"));
		sandboxDirs.push(sandboxPath);

		const longDescription = `Step one: ${"x".repeat(400)}. Step two: finish.`;

		const provisioner = createProvisioner(buildTaskHarnessPorts());
		const captured: { sessionConfig?: SessionConfig } = {};
		const deps = buildDeps(db as HyperIdleDb, sandboxPath, captured);
		const params = {
			...baseParams("agent-instruction-2", sandboxPath),
			taskId: "task-instruction-2",
			contextBundle: {
				kind: "task",
				task: {
					id: "task-instruction-2",
					title: "A task with a long description",
					description: longDescription,
					state: "in_progress",
					doneWhen: [],
					reasons: [],
				},
				ancestors: [],
				agent: { id: "agent-instruction-2", name: "Builder", role: "builder" },
				team: { id: "team-1", name: "Team" },
				knowledge: [],
			},
			requestContext: {
				requestId: "req-2",
				sourceKind: "task",
				sourceId: "task-instruction-2",
				sourceCorrelation: { taskId: "task-instruction-2", teamId: "team-1" },
			},
		} as unknown as ProvisionSessionParams;

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		const instruction = captured.sessionConfig?.instruction ?? "";
		expect(instruction, "the end of the instruction must survive").toContain("Step two: finish.");
		expect(instruction.length).toBeGreaterThan(200);
	});
});
