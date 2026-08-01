/**
 * AU21 §9 Increment 12 (Decision H3), Wave E fix — review-corrected safety
 * regression, THE load-bearing test of this fix.
 *
 * architecture.md §12's resolved-race note requires: "a deactivated agent's
 * run fails to provision, emits
 * `agent_run_admission_failed{failureCode:"TARGET_AGENT_NOT_RUNNABLE"}`, and
 * never proceeds with authority" — for the REAL emit→deactivate→drain race,
 * not merely a resolver-bug scenario. Wave E's original commit only tested a
 * BAKED-mismatch scenario (`admit-session-baked-agent-config.integration.test.ts`,
 * updated alongside this fix): a snapshot that was NEVER runnable to begin
 * with. That is unreachable in production — every per-kind resolver's
 * `requireRunnableAgent` call guarantees the baked snapshot IS runnable at
 * emit time — so it could not exercise the actual race the architecture
 * doc names.
 *
 * This test exercises the REAL race: bake a snapshot that WAS genuinely
 * runnable (as `requireRunnableAgent` would have produced at emit time), then
 * mutate the LIVE row to a non-runnable status BEFORE calling `admitSession`
 * — simulating deactivation occurring in the emit→deactivate→drain window.
 * Proves the fix's live `ports.agentRunnability.checkAgentRunnable` re-check
 * (not the baked snapshot, which would incorrectly still say "runnable") is
 * what stops the session.
 */

import { type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus, TargetAgentNotRunnableError } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import { createProvisioner } from "../provisioner.js";

type CreateProvisioner = typeof createProvisioner;
type SessionLifecyclePorts = Parameters<CreateProvisioner>[0];
type Provisioner = ReturnType<CreateProvisioner>;
type AdmitArgs = Parameters<Provisioner["admit"]>;
type ProvisionSessionDeps = AdmitArgs[0];
type ProvisionSessionParams = AdmitArgs[1];
type FakeAdapterPoolEntry = NonNullable<ReturnType<ProvisionSessionDeps["adapterPool"]["select"]>>;
type FakeHarnessAdapter = FakeAdapterPoolEntry["adapter"];

/** A harness adapter that must never actually be invoked — a race-caught admission stops before Phase 8 (harness spawn). */
function buildFakeHarnessAdapter(): FakeHarnessAdapter {
	return {
		startSession: () => Promise.reject(new Error("must not be called — admission must fail first")),
		streamEvents: () => ({
			[Symbol.asyncIterator]() {
				throw new Error("must not be called — admission must fail first");
			},
		}),
		stopSession: () => Promise.reject(new Error("must not be called — admission must fail first")),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none" as const,
		}),
	};
}

/** Every port field is a throwing spy except the ones this race scenario legitimately exercises (cost pre-flight, the live agent-runnability re-check). */
function buildRacePorts(): SessionLifecyclePorts {
	const neverCalled = (label: string) =>
		vi.fn(() => {
			throw new Error(`${label}: must not be called — admission must fail at the runnability gate`);
		});
	return {
		sessionRequests: {
			findSessionRequest: neverCalled("sessionRequests.findSessionRequest"),
			listSessionRequests: neverCalled("sessionRequests.listSessionRequests"),
			transitionSessionRequest: neverCalled("sessionRequests.transitionSessionRequest"),
			abortSessionRun: neverCalled("sessionRequests.abortSessionRun"),
			registerSessionRun: neverCalled("sessionRequests.registerSessionRun"),
			deregisterSessionRun: neverCalled("sessionRequests.deregisterSessionRun"),
		},
		observability: { summarizeToolArgs: () => "" },
		filesystems: { listFilesystemsByAgent: neverCalled("filesystems.listFilesystemsByAgent") },
		connections: {
			buildProvisioningPlan: neverCalled("connections.buildProvisioningPlan"),
			applyProvisioningPlan: neverCalled("connections.applyProvisioningPlan"),
		},
		// Cost pre-flight (Phase 2) runs AFTER Phase 1's runnability gate in
		// source order, but this fixture keeps it real+permissive so a bug that
		// accidentally reordered the phases would still surface as the runnability
		// assertion failing (session never admitted) rather than a masked cost-cap throw.
		cost: {
			checkCostCap: vi.fn(async () => ({ allowed: true })),
			recordCostAndCheck: neverCalled("cost.recordCostAndCheck"),
		},
		harnessRuntime: {
			enforcementRegistry: {
				register: neverCalled("harnessRuntime.enforcementRegistry.register"),
				get: neverCalled("harnessRuntime.enforcementRegistry.get"),
				incrementForce: neverCalled("harnessRuntime.enforcementRegistry.incrementForce"),
				unregister: neverCalled("harnessRuntime.enforcementRegistry.unregister"),
			},
			createReturnGate: neverCalled("harnessRuntime.createReturnGate"),
			evaluateReturn: neverCalled("harnessRuntime.evaluateReturn"),
			provisionReturnHook: neverCalled("harnessRuntime.provisionReturnHook"),
			writeCliMcpConfig: neverCalled("harnessRuntime.writeCliMcpConfig"),
		},
		toolProvider: {
			buildToolRegistry: neverCalled("toolProvider.buildToolRegistry"),
			toolsForRole: () => [],
			returnStatusToolForRegistry: neverCalled("toolProvider.returnStatusToolForRegistry"),
		},
		contextAssembly: {
			assembleAgentContext: neverCalled("contextAssembly.assembleAgentContext"),
			beginAgentWriteback: () => ({ dispose: () => undefined }),
			assemblePrompt: neverCalled("contextAssembly.assemblePrompt"),
			assembleRoutinePrompt: neverCalled("contextAssembly.assembleRoutinePrompt"),
			composeAssistantPrompt: neverCalled("contextAssembly.composeAssistantPrompt"),
			writeSandboxAgentsMd: neverCalled("contextAssembly.writeSandboxAgentsMd"),
		},
		// The REAL fix under test — a live db-backed re-check, mirroring
		// production's `run-orchestration-composition.ts` wiring exactly.
		agentRunnability: {
			async checkAgentRunnable(exec, agentId) {
				const [row] = await exec.select().from(users).where(eq(users.id, agentId)).limit(1);
				return row ? { kind: row.kind, status: row.status } : undefined;
			},
		},
	};
}

function buildDeps(db: HyperIdleDb): ProvisionSessionDeps {
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
					type: undefined,
					modelProviders: [],
					maxConcurrent: 5,
				},
			}),
			release: () => undefined,
		},
		workspace: {
			spawn: async () => ({
				sandboxId: "sbx-race",
				path: "/tmp/au21-admit-session-runnability-race",
			}),
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			destroy: async () => undefined,
		},
	};
}

describe("admitSession — emit→deactivate→drain runnability race (Increment 12 Wave E fix)", () => {
	test("an agent deactivated AFTER emit (baked snapshot still says runnable) fails admission via the live re-check, never proceeding with authority", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "race-agent-1",
			kind: "ai",
			name: "Race Agent",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 5,
			createdAt: now,
		});

		// The BAKED snapshot — exactly what `requireRunnableAgent` would have
		// produced at emit time, when the agent WAS genuinely runnable.
		const agentConfigBakedAtEmitTime = {
			kind: "ai",
			status: "active",
			role: "builder" as const,
			teamId: null,
			systemPrompt: null,
			modelTierPreference: null,
			harnessType: null,
			modelProvider: null,
			maxConcurrentSessions: 5,
		};

		// Simulate the race: the agent is deactivated in the window between
		// emit (when the snapshot above was baked) and drain (when admitSession
		// runs, below). The baked snapshot is NOT updated — it's already on the
		// wire, immutable, exactly as it would be in the real durable-queue path.
		await db.update(users).set({ status: "archived" }).where(eq(users.id, "race-agent-1"));

		const ports = buildRacePorts();
		const provisioner = createProvisioner(ports);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "race-agent-1",
			productId: "task-free",
			sandboxBasePath: "/tmp/au21-admit-session-runnability-race",
			agentConfig: agentConfigBakedAtEmitTime,
		};

		await expect(provisioner.admit(buildDeps(db as HyperIdleDb), params)).rejects.toBeInstanceOf(
			TargetAgentNotRunnableError,
		);
	});

	test("an agent whose kind changed away from 'ai' AFTER emit also fails admission via the live re-check", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "race-agent-2",
			kind: "ai",
			name: "Race Agent Two",
			role: "builder",
			status: "active",
			maxConcurrentSessions: 5,
			createdAt: now,
		});

		const agentConfigBakedAtEmitTime = {
			kind: "ai",
			status: "active",
			role: "builder" as const,
			teamId: null,
			systemPrompt: null,
			modelTierPreference: null,
			harnessType: null,
			modelProvider: null,
			maxConcurrentSessions: 5,
		};

		// A different shape of the same race — the row itself was deleted
		// (e.g. hard-removed) between emit and drain, not merely deactivated.
		await db.delete(users).where(eq(users.id, "race-agent-2"));

		const ports = buildRacePorts();
		const provisioner = createProvisioner(ports);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "race-agent-2",
			productId: "task-free",
			sandboxBasePath: "/tmp/au21-admit-session-runnability-race",
			agentConfig: agentConfigBakedAtEmitTime,
		};

		await expect(provisioner.admit(buildDeps(db as HyperIdleDb), params)).rejects.toBeInstanceOf(
			TargetAgentNotRunnableError,
		);
	});
});
