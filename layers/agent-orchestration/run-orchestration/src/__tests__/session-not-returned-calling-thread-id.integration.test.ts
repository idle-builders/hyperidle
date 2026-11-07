/**
 * `provisioner.ts` forwards `params.callingThreadId` onto the
 * `session_not_returned` event it already emits on a not-returned verdict,
 * giving the never-silent net's `conversation` subscriber somewhere to post.
 * Zero new read: the value is the same already-baked field admission uses.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { users } from "@hyperidle/db";
import type { SessionNotReturnedEvent } from "@hyperidle/event-bus";
import { EventBus } from "@hyperidle/event-bus";
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

function buildHarnessPorts() {
	// Force the not_returned verdict this test observes.
	return buildRunningHarnessPorts({ evaluateReturn: () => "not_returned" as const });
}

describe("session_not_returned carries callingThreadId", () => {
	const sandboxDirs: string[] = [];
	afterEach(() => {
		vi.unstubAllEnvs();
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("a not-returned session with a baked callingThreadId emits session_not_returned carrying it", async ({
		db,
		runnerDb,
	}) => {
		await db.insert(users).values({
			id: "agent-not-returned-1",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-not-returned-"));
		sandboxDirs.push(sandboxPath);
		vi.stubEnv("HYPERIDLE_SPACES_DIR", sandboxPath);

		const eventBus = new EventBus();
		const captured: SessionNotReturnedEvent[] = [];
		eventBus.on("session_not_returned", (event) => {
			captured.push(event);
		});

		const ports = buildHarnessPorts();
		const provisioner = createProvisioner(ports);
		const deps: ProvisionSessionDeps = {
			db: runnerDb,
			eventBus,
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

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "agent-not-returned-1",
			productId: "task-free",
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
			},
			callingThreadId: "thread-not-returned-1",
		} as ProvisionSessionParams;

		const admitted = await provisioner.admit(deps, params);
		const result = await provisioner.run(deps, params, admitted);

		expect(result.outcome).toBe("not_returned");
		expect(captured).toHaveLength(1);
		expect(captured[0]?.callingThreadId).toBe("thread-not-returned-1");
	});

	test("a not-returned session with no callingThreadId omits the field (unchanged)", async ({
		db,
		runnerDb,
	}) => {
		await db.insert(users).values({
			id: "agent-not-returned-2",
			kind: "ai",
			name: "Agent",
			role: "builder",
			status: "active",
			createdAt: new Date().toISOString(),
		});
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au27-not-returned-"));
		sandboxDirs.push(sandboxPath);
		vi.stubEnv("HYPERIDLE_SPACES_DIR", sandboxPath);

		const eventBus = new EventBus();
		const captured: SessionNotReturnedEvent[] = [];
		eventBus.on("session_not_returned", (event) => {
			captured.push(event);
		});

		// Subscription routing: no callingThreadId (proving callingThreadId is absent from the
		// event), subscriptionId provides the working folder. Phase 6 fires for requestContext so
		// assembleAgentContext must be mocked rather than neverCalled.
		const ports = buildRunningHarnessPorts({
			evaluateReturn: () => "not_returned" as const,
			assembleAgentContext: vi.fn(async () => ({ itemCount: 0, durationMs: 0, manifestPath: "" })),
		});
		const provisioner = createProvisioner(ports);
		const deps: ProvisionSessionDeps = {
			db: runnerDb,
			eventBus,
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

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "agent-not-returned-2",
			productId: "task-free",
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
			},
			requestContext: {
				requestId: "req-sub-not-returned-2",
				sourceKind: "subscription",
				sourceId: "sub:not-returned-2",
				sourceCorrelation: { subscriptionId: "sub-not-returned-2" },
			},
		} as ProvisionSessionParams;

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured).toHaveLength(1);
		expect(captured[0]?.callingThreadId).toBeUndefined();
	});
});
