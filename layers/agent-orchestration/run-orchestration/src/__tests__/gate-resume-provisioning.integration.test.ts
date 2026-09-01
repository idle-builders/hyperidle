/**
 * A verdict brings the agent back to its own session — through the same
 * provisioning path every other session takes.
 *
 * The only thing a resume changes is where the harness starts: it reopens the
 * harness's own session and delivers the verdict as a genuine user turn, rather
 * than composing a new prompt.
 *
 * @lore BA2: The verdict is a real user turn in a genuinely resumed session, not
 * a fabricated transcript asserting that a human approved. A real cursor-agent
 * refused exactly that and was right to — nothing authenticated the claim. The
 * authority is the cleared rule at the gate, which the agent never has to
 * believe.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
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

interface Captured {
	started: number;
	resumedWith?: { nativeSessionId: string; message: string };
	cleared: Array<{ sessionId: string; ruleId: string; toolName: string }>;
}

function buildFakeHarnessAdapter(captured: Captured): FakeHarnessAdapter {
	return {
		startSession: async (config) => {
			captured.started += 1;
			return { sessionId: config.sessionId };
		},
		resumeSession: async (nativeSessionId: string, message: string) => {
			captured.resumedWith = { nativeSessionId, message };
			return { sessionId: `resumed-${nativeSessionId}` };
		},
		streamEvents: () => ({
			async *[Symbol.asyncIterator]() {
				/* no events */
			},
		}),
		stopSession: async () => ({ outcome: "completed" as const, tokenUsage: { byTier: {} } }),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none" as const,
		}),
		getNativeSessionId: () => undefined,
	} as FakeHarnessAdapter;
}

function buildHarnessPorts(captured: Captured): SessionLifecyclePorts {
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
			pendingGateDenial: () => undefined,
			clearGateAction: (sessionId, action) => {
				captured.cleared.push({ sessionId, ...action });
			},
			releaseActionGate: () => undefined,
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
			assembleRoutinePrompt: neverCalled("contextAssembly.assembleRoutinePrompt"),
			writeSandboxAgentsMd: vi.fn(),
		},
	};
}

function buildDeps(db: HyperIdleDb, sandboxPath: string, captured: Captured): ProvisionSessionDeps {
	return {
		db,
		eventBus: new EventBus(),
		adapterPool: {
			select: () => ({
				id: "fake-adapter",
				adapter: buildFakeHarnessAdapter(captured),
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
			destroy: async () => undefined,
		},
	};
}

async function runWith(
	db: HyperIdleDb,
	agentId: string,
	sandboxPath: string,
	resume: ProvisionSessionParams["resume"],
): Promise<Captured> {
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	const captured: Captured = { started: 0, cleared: [] };
	const provisioner = createProvisioner(buildHarnessPorts(captured));
	const params = {
		taskId: null,
		agentId,
		productId: "task-free",
		sandboxBasePath: sandboxPath,
		agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
		harnessDisabled: [],
		...(resume ? { resume } : {}),
	} as ProvisionSessionParams;
	const deps = buildDeps(db, sandboxPath, captured);
	const admitted = await provisioner.admit(deps, params);
	await provisioner.run(deps, params, admitted);
	return captured;
}

const APPROVED = {
	sessionId: "sess-old",
	harnessSessionId: "native-abc",
	ruleId: "rule-push",
	toolName: "Bash",
	decision: "approve" as const,
	threadId: "thread-1",
	agentId: "agent-resume-1",
};

describe("provisioner.run — a verdict resumes the agent's own session", () => {
	const sandboxDirs: string[] = [];
	afterEach(() => {
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("an approval reopens the harness session instead of starting a new one", async ({ db }) => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba2-resume-"));
		sandboxDirs.push(sandboxPath);

		const captured = await runWith(db as HyperIdleDb, "agent-resume-1", sandboxPath, APPROVED);

		expect(captured.started, "a resume must not start a fresh harness session").toBe(0);
		expect(captured.resumedWith?.nativeSessionId).toBe("native-abc");
	});

	test("the verdict names the gate fact, not just 'approved'", async ({ db }) => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba2-resume-"));
		sandboxDirs.push(sandboxPath);

		const captured = await runWith(db as HyperIdleDb, "agent-resume-2", sandboxPath, {
			...APPROVED,
			agentId: "agent-resume-2",
		});

		// Ruling 16: a bare "Approved. Go ahead." complied 3 of 6 on cursor-agent —
		// the objection was that a chat message is not the approval mechanism the
		// policy requires. Naming the cleared rule and the retry took it to 8 of 8.
		const message = captured.resumedWith?.message ?? "";
		expect(message).toContain("cleared");
		expect(message).toContain("Bash");
		expect(message).toContain("retry");
	});

	test("the approval clears exactly the action a human cleared", async ({ db }) => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba2-resume-"));
		sandboxDirs.push(sandboxPath);

		const captured = await runWith(db as HyperIdleDb, "agent-resume-3", sandboxPath, {
			...APPROVED,
			agentId: "agent-resume-3",
		});

		expect(captured.cleared).toEqual([
			{ sessionId: expect.any(String), ruleId: "rule-push", toolName: "Bash" },
		]);
	});

	test("a decline resumes too, but clears nothing", async ({ db }) => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba2-resume-"));
		sandboxDirs.push(sandboxPath);

		const captured = await runWith(db as HyperIdleDb, "agent-resume-4", sandboxPath, {
			...APPROVED,
			agentId: "agent-resume-4",
			decision: "decline",
		});

		expect(captured.resumedWith, "the agent must learn the answer either way").toBeDefined();
		expect(captured.resumedWith?.message).toContain("still in force");
		expect(captured.cleared, "a decline grants nothing").toEqual([]);
	});

	test("a session with no resume starts normally", async ({ db }) => {
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "ba2-resume-"));
		sandboxDirs.push(sandboxPath);

		const captured = await runWith(db as HyperIdleDb, "agent-resume-5", sandboxPath, undefined);

		expect(captured.started).toBe(1);
		expect(captured.resumedWith).toBeUndefined();
		expect(captured.cleared).toEqual([]);
	});
});
