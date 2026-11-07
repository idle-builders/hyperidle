/**
 * `provisioner.ts`'s Phase 8 forwards `params.callingThreadId` straight onto
 * the session-scoped `ToolContext.threadId` the `reply` tool reads. Proven
 * by capturing the `ToolContext` the harness's tool registry is built with,
 * over a real (fake-adapter) `admit` + `run` pass — no live orchestration ->
 * core read, the value is forwarded verbatim from `params`.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import type { RunnerDb } from "@hyperidle/runner-db";
import { afterEach, describe, vi } from "vitest";
import {
	buildRunningHarnessPorts,
	completingHarnessAdapter,
	expect,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	test,
} from "../__testing__/test-fixtures.js";
import { createProvisioner } from "../provisioner.js";

/** Every port method not exercised by this scenario throws if called. */
function buildHarnessPorts(captured: { toolContext?: { readonly threadId?: string } }) {
	return buildRunningHarnessPorts({
		buildToolRegistry: (ctx) => {
			captured.toolContext = ctx;
			return { invoke: async () => ({ success: true, data: undefined }) };
		},
	});
}

function buildDeps(runnerDb: RunnerDb): ProvisionSessionDeps {
	return {
		db: runnerDb,
		eventBus: new EventBus(),
		adapterPool: {
			select: () => ({
				id: "fake-adapter",
				adapter: completingHarnessAdapter(),
				meta: {
					name: "Fake",
					type: undefined,
					modelProviders: [],
					maxConcurrent: 5,
				},
			}),
			release: () => undefined,
			describeSelectFailure: () => "test pool selected nothing",
		},
	};
}

describe("provisioner.run — ToolContext.threadId forwarded from params.callingThreadId", () => {
	const sandboxDirs: string[] = [];
	afterEach(() => {
		vi.unstubAllEnvs();
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
	test("a session with a baked callingThreadId gets a ToolContext.threadId matching it", async ({
		db,
		runnerDb,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "agent-thread-ctx-1",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		const captured: { toolContext?: { readonly threadId?: string } } = {};
		const ports = buildHarnessPorts(captured);
		const provisioner = createProvisioner(ports);
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-provisioner-thread-id-"));
		sandboxDirs.push(sandboxPath);
		vi.stubEnv("HYPERIDLE_SPACES_DIR", sandboxPath);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "agent-thread-ctx-1",
			productId: "task-free",
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
			},
			callingThreadId: "thread-provisioner-ctx-1",
		} as ProvisionSessionParams;

		const deps = buildDeps(runnerDb);
		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured.toolContext?.threadId).toBe("thread-provisioner-ctx-1");
	});

	test("a session with no baked callingThreadId gets no ToolContext.threadId (subscription_run)", async ({
		db,
		runnerDb,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "agent-thread-ctx-2",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		const captured: { toolContext?: { readonly threadId?: string } } = {};
		// Subscription routing requires assembleAgentContext (Phase 6 fires when requestContext is set).
		const ports = buildRunningHarnessPorts({
			buildToolRegistry: (ctx) => {
				captured.toolContext = ctx;
				return { invoke: async () => ({ success: true, data: undefined }) };
			},
			assembleAgentContext: vi.fn(async () => ({ itemCount: 0, durationMs: 0, manifestPath: "" })),
		});
		const provisioner = createProvisioner(ports);
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-provisioner-thread-id-"));
		sandboxDirs.push(sandboxPath);
		vi.stubEnv("HYPERIDLE_SPACES_DIR", sandboxPath);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "agent-thread-ctx-2",
			productId: "task-free",
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
			},
			// Subscription routing: no callingThreadId (proving threadId is absent), subscriptionId provides the working folder.
			requestContext: {
				requestId: "req-sub-thread-ctx-2",
				sourceKind: "subscription",
				sourceId: "sub:thread-ctx-2",
				sourceCorrelation: { subscriptionId: "sub-thread-ctx-2" },
			},
		} as ProvisionSessionParams;

		const deps = buildDeps(runnerDb);
		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured.toolContext?.threadId).toBeUndefined();
	});
});
