/**
 * The model an agent is configured with must reach the session that runs it,
 * with no credential resolution anywhere in the path.
 *
 * This is the defect these tests exist to prevent coming back: `{{model}}` used
 * to be sourced from the gateway's `ResolvedModel`, which requires an API key
 * per provider and rejects `openai-compatible` outright on the per-agent path.
 * On a machine authenticated only by a CLI's own subscription login — the normal
 * case for claude, codex and cursor-agent — that resolution threw, the error was
 * swallowed in `start-runtime.ts`, `{{model}}` became `""`, and the adapter's
 * strip-empty-flag branch removed `--model` from the invocation entirely. The
 * person's choice was discarded in silence and the CLI ran its own default.
 *
 * `deps` here carries NO `resolveModel` and the params carry no `resolvedModel`,
 * so a regression to the credential path cannot pass these.
 *
 * Uses `onBeforeHarnessStart`'s abort return to observe the fully assembled
 * `SessionConfig` without spawning a real harness — same seam as
 * `generic-transcript-prompt-assembly.integration.test.ts`.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, tasks, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import type { SessionConfig } from "@hyperidle/harness-protocol";
import { afterEach, describe, vi } from "vitest";
import { writeAgentRunConfig } from "../agent-run-config-store.js";
import { createProvisioner } from "../provisioner.js";

type CreateProvisioner = typeof createProvisioner;
type SessionLifecyclePorts = Parameters<CreateProvisioner>[0];
type Provisioner = ReturnType<CreateProvisioner>;
type AdmitArgs = Parameters<Provisioner["admit"]>;
type ProvisionSessionDeps = AdmitArgs[0];
type ProvisionSessionParams = AdmitArgs[1];
type FakeAdapterPoolEntry = NonNullable<ReturnType<ProvisionSessionDeps["adapterPool"]["select"]>>;
type FakeHarnessAdapter = FakeAdapterPoolEntry["adapter"];

function buildFakeHarnessAdapter(): FakeHarnessAdapter {
	return {
		startSession: () =>
			Promise.reject(new Error("must not be called — onBeforeHarnessStart aborts")),
		streamEvents: () => ({
			[Symbol.asyncIterator]() {
				throw new Error("must not be called — onBeforeHarnessStart aborts");
			},
		}),
		stopSession: () =>
			Promise.reject(new Error("must not be called — onBeforeHarnessStart aborts")),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none" as const,
		}),
	};
}

function buildHarnessPorts(): SessionLifecyclePorts {
	const neverCalled = (label: string) =>
		vi.fn(() => {
			throw new Error(`${label}: must not be called in this test scenario`);
		});
	return {
		sessionRequests: {
			findSessionRequest: neverCalled("sessionRequests.findSessionRequest"),
			listSessionRequests: neverCalled("sessionRequests.listSessionRequests"),
			transitionSessionRequest: neverCalled("sessionRequests.transitionSessionRequest"),
			abortSessionRun: neverCalled("sessionRequests.abortSessionRun"),
			registerSessionRun: vi.fn(),
			deregisterSessionRun: vi.fn(),
		},
		observability: { summarizeToolArgs: () => "" },
		harnessRuntime: {
			enforcementRegistry: {
				register: vi.fn(),
				get: vi.fn(() => undefined),
				incrementForce: vi.fn(),
				unregister: vi.fn(),
			},
			createReturnGate: () => ({ observe: () => undefined, returned: false }),
			evaluateReturn: () => "returned" as const,
			provisionReturnHook: async () => undefined,
			provisionActionGate: async () => undefined,
			writeCliMcpConfig: neverCalled("harnessRuntime.writeCliMcpConfig"),
			writePluginStdioMcpEntries: neverCalled("harnessRuntime.writePluginStdioMcpEntries"),
			openMcpBridge: neverCalled("harnessRuntime.openMcpBridge"),
			closeMcpBridge: neverCalled("harnessRuntime.closeMcpBridge"),
		},
		toolProvider: {
			buildToolRegistry: () => ({ invoke: async () => ({ success: true, data: undefined }) }),
			toolsForRole: () => [],
			returnStatusToolForRegistry: () => ({ name: "return_status" }),
		},
		contextAssembly: {
			// A task-bearing session assembles context; a no-op stub keeps this test
			// about the model and nothing else.
			assembleAgentContext: vi.fn(async () => ({ itemCount: 0, durationMs: 0, manifestPath: "" })),
			beginAgentWriteback: () => ({ dispose: () => undefined }),
			assemblePrompt: neverCalled("contextAssembly.assemblePrompt"),
			assembleRoutinePrompt: neverCalled("contextAssembly.assembleRoutinePrompt"),
			writeSandboxAgentsMd: vi.fn(),
		},
	};
}

describe("the model an agent is configured with reaches its session", () => {
	const sandboxDirs: string[] = [];
	afterEach(() => {
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

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
		const rootTaskId = `${taskId}-root`;
		await db.insert(teams).values({ id: teamId, name: teamId, phase: "build", createdAt: now });
		await db.insert(tasks).values({
			id: rootTaskId,
			parentTaskId: null,
			teamId,
			title: "Model selection test root task",
			description: "Model selection test root task",
			state: "in_progress",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(tasks).values({
			id: taskId,
			parentTaskId: rootTaskId,
			teamId,
			title: "Model selection test task",
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
					adapter: buildFakeHarnessAdapter(),
					meta: {
						name: "Fake",
						kind: "local",
						type: "claude-code",
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
				destroy: async () => undefined,
			},
			onBeforeHarnessStart: (ctx) => {
				captured.sessionConfig = ctx.sessionConfig;
				return "abort";
			},
		};
	}

	function baseParams(
		agentId: string,
		taskId: string,
		sandboxPath: string,
	): ProvisionSessionParams {
		return {
			taskId,
			agentId,
			productId: `${taskId}-bet`,
			sandboxBasePath: sandboxPath,
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: `${taskId}-team`,
			},
			harnessDisabled: [],
		} as ProvisionSessionParams;
	}

	test("the configured model reaches the session with no credential resolved", async ({ db }) => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "model-selection-"));
		sandboxDirs.push(sandboxPath);
		const agentId = "agent-model-choice";
		const taskId = "task-model-choice";
		await seedAgent(db, agentId);
		await seedTask(db, taskId);
		// The person picked `haiku` for this agent — a name claude accepts, in
		// claude's own vocabulary, that no gateway provider union contains.
		await writeAgentRunConfig(db, agentId, { modelId: "haiku", modelProvider: "anthropic" });

		const captured: { sessionConfig?: SessionConfig } = {};
		const provisioner = createProvisioner(buildHarnessPorts());
		const deps = buildDeps(db, sandboxPath, captured);
		const params = baseParams(agentId, taskId, sandboxPath);
		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured.sessionConfig?.selectedModel).toBe("haiku");
	});

	test("an agent that chose no model carries none, leaving the harness its own default", async ({
		db,
	}) => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "model-selection-"));
		sandboxDirs.push(sandboxPath);
		const agentId = "agent-no-model-choice";
		const taskId = "task-no-model-choice";
		await seedAgent(db, agentId);
		await seedTask(db, taskId);

		const captured: { sessionConfig?: SessionConfig } = {};
		const provisioner = createProvisioner(buildHarnessPorts());
		const deps = buildDeps(db, sandboxPath, captured);
		const params = baseParams(agentId, taskId, sandboxPath);
		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		// Absent, not empty-string: the adapter drops the flag and the harness picks,
		// which is a stated outcome rather than the accident of a stripped argument.
		expect(captured.sessionConfig?.selectedModel).toBeUndefined();
	});

	test("a model whose provider the gateway never supported still reaches the session", async ({
		db,
	}) => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "model-selection-"));
		sandboxDirs.push(sandboxPath);
		const agentId = "agent-foreign-provider";
		const taskId = "task-foreign-provider";
		await seedAgent(db, agentId);
		await seedTask(db, taskId);
		// `resolveModel` rejects openai-compatible outright on the per-agent path.
		// An opencode model id is exactly that shape, and must survive anyway.
		await writeAgentRunConfig(db, agentId, {
			modelId: "openrouter/z-ai/glm-4.7-flash",
			modelProvider: "openai-compatible",
		});

		const captured: { sessionConfig?: SessionConfig } = {};
		const provisioner = createProvisioner(buildHarnessPorts());
		const deps = buildDeps(db, sandboxPath, captured);
		const params = baseParams(agentId, taskId, sandboxPath);
		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured.sessionConfig?.selectedModel).toBe("openrouter/z-ai/glm-4.7-flash");
	});
});
