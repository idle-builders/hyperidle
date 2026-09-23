/**
 * A subscription session's forced return is `return_status`, never a
 * message: the run ends by the agent reporting its status, and it speaks
 * only if its own subscription's instruction asks it to.
 *
 * Runs a FULL session to completion through the real provisioner (`admit` +
 * `run`, no `onBeforeHarnessStart` abort) against a scripted, in-test
 * harness adapter — this is a service-integration test of HyperIdle's own
 * gate/outcome plumbing, not a claim about what a real model does (that is
 * `subscription-wake-live-harness.integration.test.ts`'s job, across all
 * four real harnesses, zero stubs). The scripted adapter here stands in for
 * the harness process itself, exactly the way
 * `generic-transcript-prompt-assembly.integration.test.ts`'s
 * `buildFakeHarnessAdapter` already does in this same package.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { isRequiredReturnAction } from "@hyperidle/harness-protocol";
import { afterEach, describe, vi } from "vitest";
import { createProvisioner } from "../provisioner.js";

type CreateProvisioner = typeof createProvisioner;
type SessionLifecyclePorts = Parameters<CreateProvisioner>[0];
type Provisioner = ReturnType<CreateProvisioner>;
type AdmitArgs = Parameters<Provisioner["admit"]>;
type ProvisionSessionDeps = AdmitArgs[0];
type ProvisionSessionParams = AdmitArgs[1];
type FakeAdapterPoolEntry = NonNullable<ReturnType<ProvisionSessionDeps["adapterPool"]["select"]>>;
type FakeHarnessAdapter = FakeAdapterPoolEntry["adapter"];
type FakeHarnessEvent = {
	readonly type: "tool_call";
	readonly toolName: string;
	readonly args: Record<string, unknown>;
};

/** A scripted harness that reports exactly the tool calls given, then ends its turn. */
function buildScriptedHarnessAdapter(events: readonly FakeHarnessEvent[]): FakeHarnessAdapter {
	return {
		startSession: async () => ({ sessionId: "fake-harness-session" }),
		streamEvents: () => {
			async function* generate() {
				for (const event of events) yield event;
			}
			return generate();
		},
		stopSession: async () => ({ outcome: "completed", tokenUsage: { byTier: {} } }),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			// mcpSupport:false ⇒ the drain loop itself invokes the tool registry
			// for every observed tool_call (interceptToolCalls), so the scripted
			// events above actually reach `toolRegistry.invoke` the same way a
			// real MCP-routed call would.
			mcpSupport: false,
			returnEnforcement: "none" as const,
		}),
	};
}

/**
 * A minimal but REAL enforcement mechanism — mirrors
 * `harness-registry`'s `createReturnEnforcement` exactly (same
 * `isRequiredReturnAction` predicate this package cannot import the
 * concrete factory for, only the shared predicate), so this test proves the
 * actual gate semantics `provisioner.ts` relies on, not a stand-in that
 * always agrees.
 */
function buildFakeHarnessRuntime(): SessionLifecyclePorts["harnessRuntime"] {
	const registry = new Map<
		string,
		{
			readonly gate: { readonly returned: boolean };
			forceCount: number;
			readonly exempt: boolean;
			readonly requiredReturnActions?: readonly string[];
		}
	>();
	return {
		enforcementRegistry: {
			register: (sessionId, entry) => {
				registry.set(sessionId, entry);
			},
			get: (sessionId) => registry.get(sessionId),
			incrementForce: (sessionId) => {
				const entry = registry.get(sessionId);
				if (entry) entry.forceCount += 1;
			},
			unregister: (sessionId) => {
				registry.delete(sessionId);
			},
		},
		createReturnGate: (requiredReturnActions, taskId) => {
			let returned = false;
			return {
				observe(event) {
					if (
						event.type === "tool_call" &&
						isRequiredReturnAction(event.toolName, requiredReturnActions, event.args, taskId)
					) {
						returned = true;
					}
				},
				get returned() {
					return returned;
				},
			};
		},
		evaluateReturn: (gate, endReason) =>
			endReason !== "completed" || gate.returned ? "returned" : "not_returned",
		provisionReturnHook: async () => undefined,
		writeCliMcpConfig: async () => ({}),
		writePluginStdioMcpEntries: () => undefined,
		openMcpBridge: async () => {
			throw new Error("no mcp bridge wired in this scripted-harness test");
		},
		closeMcpBridge: async () => undefined,
	};
}

describe("a subscription wake's forced return is return_status, never send_message", () => {
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
			name: "Subscribed builder",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
	}

	function buildPorts(invokedTools: string[]): SessionLifecyclePorts {
		return {
			sessionRequests: {
				findSessionRequest: vi.fn(),
				listSessionRequests: vi.fn(),
				transitionSessionRequest: vi.fn(),
				abortSessionRun: vi.fn(),
				registerSessionRun: vi.fn(),
				deregisterSessionRun: vi.fn(),
			},
			observability: { summarizeToolArgs: () => "" },
			harnessRuntime: buildFakeHarnessRuntime(),
			toolProvider: {
				buildToolRegistry: () => ({
					invoke: async (name: string) => {
						invokedTools.push(name);
						return { success: true, data: undefined };
					},
				}),
				toolsForRole: () => [],
				returnStatusToolForRegistry: () => ({ name: "return_status" }),
			},
			contextAssembly: {
				assembleAgentContext: async () => ({ itemCount: 0, durationMs: 0, manifestPath: "" }),
				beginAgentWriteback: () => ({ dispose: () => undefined }),
				assemblePrompt: async () => ({ assembledPrompt: "unused", personaToolsTokens: 0 }),
				assembleSubscriptionPrompt: async (input) => ({
					assembledPrompt: [
						"# Session Instructions",
						"## Subscription",
						input.returnOrientation ?? "",
					].join("\n"),
					personaToolsTokens: 0,
				}),
				writeSandboxAgentsMd: () => undefined,
			},
		};
	}

	function buildDeps(
		db: HyperIdleDb,
		sandboxPath: string,
		events: readonly FakeHarnessEvent[],
	): ProvisionSessionDeps {
		return {
			db,
			eventBus: new EventBus(),
			adapterPool: {
				select: () => ({
					id: "fake-adapter",
					adapter: buildScriptedHarnessAdapter(events),
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
				adopt: (p: string) => Promise.resolve({ sandboxId: "sb-adopted", path: p }),
				destroy: async () => undefined,
			},
		};
	}

	function subscriptionParams(
		agentId: string,
		sandboxPath: string,
		prompt: string,
	): ProvisionSessionParams {
		return {
			taskId: null,
			agentId,
			productId: "no-team",
			sandboxBasePath: sandboxPath,
			agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
			harnessDisabled: [],
			contextBundle: {
				kind: "subscription",
				subscription: { id: "sub-stop-1", event: "task.changed", schedule: null },
				prompt,
				change: null,
				agent: { id: agentId, name: "Subscribed builder", role: "builder" },
				team: null,
				documents: [],
			},
			requestContext: {
				requestId: `req-${agentId}`,
				sourceKind: "subscription",
				sourceId: "sub-stop-1:change-1",
				sourceCorrelation: { subscriptionId: "sub-stop-1", changeId: "change-1" },
			},
		} as unknown as ProvisionSessionParams;
	}

	test("a wake whose prompt says stop calls only return_status — no message in any thread, session ends completed", async ({
		db,
	}) => {
		const agentId = "agent-sub-return-1";
		await seedAgent(db as HyperIdleDb, agentId);
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "subscription-return-"));
		sandboxDirs.push(sandboxPath);

		const invokedTools: string[] = [];
		const events: FakeHarnessEvent[] = [{ type: "tool_call", toolName: "return_status", args: {} }];
		const ports = buildPorts(invokedTools);
		const provisioner = createProvisioner(ports);
		const deps = buildDeps(db as HyperIdleDb, sandboxPath, events);
		const params = subscriptionParams(
			agentId,
			sandboxPath,
			"If this change did not move the task to done, stop. Do not message anyone.",
		);

		const admitted = await provisioner.admit(deps, params);
		const result = await provisioner.run(deps, params, admitted);

		expect(result.outcome).toBe("completed");
		expect(result.returnVerdict).toBe("returned");
		expect(invokedTools).toContain("return_status");
		expect(invokedTools).not.toContain("send_message");
	});

	test("a wake that never returns at all ends not_returned — the gate genuinely enforces, it is not a rubber stamp", async ({
		db,
	}) => {
		const agentId = "agent-sub-return-2";
		await seedAgent(db as HyperIdleDb, agentId);
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "subscription-return-"));
		sandboxDirs.push(sandboxPath);

		const invokedTools: string[] = [];
		const events: FakeHarnessEvent[] = [];
		const ports = buildPorts(invokedTools);
		const provisioner = createProvisioner(ports);
		const deps = buildDeps(db as HyperIdleDb, sandboxPath, events);
		const params = subscriptionParams(agentId, sandboxPath, "Edit the named document.");

		const admitted = await provisioner.admit(deps, params);
		const result = await provisioner.run(deps, params, admitted);

		expect(result.outcome).toBe("not_returned");
		// Never a forced send_message, even on the enforcement path — a
		// subscription session simply ends not_returned, exactly like any
		// other required-action session that never called its one.
		expect(invokedTools).not.toContain("send_message");
	});

	test("the assembled prompt orients the agent to return_status, never to send_message", async ({
		db,
	}) => {
		const agentId = "agent-sub-return-3";
		await seedAgent(db as HyperIdleDb, agentId);
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "subscription-return-"));
		sandboxDirs.push(sandboxPath);

		const invokedTools: string[] = [];
		const events: FakeHarnessEvent[] = [{ type: "tool_call", toolName: "return_status", args: {} }];
		const ports = buildPorts(invokedTools);
		const provisioner = createProvisioner(ports);
		const captured: {
			sessionConfig?: { assembledPrompt?: string; requiredReturnActions?: readonly string[] };
		} = {};
		const deps: ProvisionSessionDeps = {
			...buildDeps(db as HyperIdleDb, sandboxPath, events),
			onBeforeHarnessStart: (ctx) => {
				captured.sessionConfig = ctx.sessionConfig;
				return "abort";
			},
		};
		const params = subscriptionParams(agentId, sandboxPath, "Edit the named document.");

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured.sessionConfig?.requiredReturnActions).toEqual(["return_status"]);
		const prompt = captured.sessionConfig?.assembledPrompt ?? "";
		expect(prompt).toContain("call `return_status`");
		expect(prompt).not.toContain("call `send_message`");
	});
});
