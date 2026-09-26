/**
 * The harness's own session id has to outlive the run that produced it.
 *
 * A human approves a review long after the session that filed it ended, and
 * resuming that session is the whole return half. `getNativeSessionId` gives us
 * the id in memory during the run; if nothing writes it down, there is nothing
 * to resume and the agent can never be brought back.
 *
 * @lore BA2: A session whose harness reported no id genuinely cannot be resumed.
 * The column stays null in that case rather than holding a fabricated value, so
 * the verdict path can tell the human the truth instead of resuming nothing.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, sessions, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { afterEach, describe, vi } from "vitest";
import {
	buildNeverCalledPorts,
	type FakeHarnessAdapter,
	neverCalled,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
} from "../__testing__/test-fixtures.js";
import { createProvisioner } from "../provisioner.js";

/**
 * `nativeId` undefined models a harness that never reported one — an error
 * before the first stream event, or an adapter with no resume support.
 */
function buildFakeHarnessAdapter(nativeId: string | undefined): FakeHarnessAdapter {
	return {
		startSession: async (config) => ({ sessionId: config.sessionId }),
		streamEvents: () => ({
			async *[Symbol.asyncIterator]() {
				/* no events — the drain completes immediately */
			},
		}),
		stopSession: async () => ({
			outcome: "completed" as const,
			tokenUsage: { byTier: {} },
		}),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none" as const,
		}),
		getNativeSessionId: () => nativeId,
	} as FakeHarnessAdapter;
}

function buildHarnessPorts() {
	return buildNeverCalledPorts({
		sessionRequests: {
			findSessionRequest: neverCalled("sessionRequests.findSessionRequest"),
			listSessionRequests: neverCalled("sessionRequests.listSessionRequests"),
			transitionSessionRequest: neverCalled("sessionRequests.transitionSessionRequest"),
			abortSessionRun: neverCalled("sessionRequests.abortSessionRun"),
			registerSessionRun: vi.fn(),
			deregisterSessionRun: vi.fn(),
		},
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
			assembleAgentContext: neverCalled("contextAssembly.assembleAgentContext"),
			beginAgentWriteback: () => ({ dispose: () => undefined }),
			assemblePrompt: neverCalled("contextAssembly.assemblePrompt"),
			assembleSubscriptionPrompt: neverCalled("contextAssembly.assembleSubscriptionPrompt"),
			writeSandboxAgentsMd: vi.fn(),
		},
	});
}

function buildDeps(
	db: HyperIdleDb,
	sandboxPath: string,
	nativeId: string | undefined,
): ProvisionSessionDeps {
	return {
		db,
		eventBus: new EventBus(),
		adapterPool: {
			select: () => ({
				id: "fake-adapter",
				adapter: buildFakeHarnessAdapter(nativeId),
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
	};
}

async function runOnce(
	db: HyperIdleDb,
	agentId: string,
	sandboxPath: string,
	nativeId: string | undefined,
): Promise<string> {
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	const provisioner = createProvisioner(buildHarnessPorts());
	const params = {
		taskId: null,
		agentId,
		productId: "task-free",
		sandboxBasePath: sandboxPath,
		agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
		harnessDisabled: [],
	} as ProvisionSessionParams;
	const deps = buildDeps(db, sandboxPath, nativeId);
	const admitted = await provisioner.admit(deps, params);
	await provisioner.run(deps, params, admitted);
	return admitted.sessionId;
}

describe("provisioner.run — the harness session id is written down", () => {
	const sandboxDirs: string[] = [];
	afterEach(() => {
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("the id the harness reported is persisted, so the session can be resumed", async ({
		db,
	}) => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba2-native-id-"));
		sandboxDirs.push(sandboxPath);

		const sessionId = await runOnce(
			db as HyperIdleDb,
			"agent-native-id-1",
			sandboxPath,
			"claude-uuid-abc",
		);

		const [row] = await (db as HyperIdleDb)
			.select()
			.from(sessions)
			.where(eq(sessions.id, sessionId));
		expect(row?.harnessSessionId).toBe("claude-uuid-abc");
	});

	test("a harness that reported no id leaves it null rather than inventing one", async ({ db }) => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba2-native-id-"));
		sandboxDirs.push(sandboxPath);

		const sessionId = await runOnce(db as HyperIdleDb, "agent-native-id-2", sandboxPath, undefined);

		const [row] = await (db as HyperIdleDb)
			.select()
			.from(sessions)
			.where(eq(sessions.id, sessionId));
		expect(row?.harnessSessionId).toBe(null);
	});
});
