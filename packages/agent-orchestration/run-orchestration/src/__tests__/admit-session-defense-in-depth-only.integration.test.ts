/**
 * AU21 §9 Increment 12 (Decision H3), Wave E — THIRD, founder RE-CORRECTED
 * pass (architecture.md §12's "RE-CORRECTED (founder, 2026-08-01)" note).
 *
 * The founder ruled the emit→deactivate→drain race needs NO mechanism at
 * all — orchestration is a blind executor that never initiates anything on
 * its own; every unit of work originates from a request core already sent.
 * There is therefore no scenario where orchestration needs to independently
 * verify an agent's live runnability. `SessionLifecycleAgentRunnabilityReader`
 * / `ports.agentRunnability` (the SECOND pass's narrow live re-check) is
 * DELETED entirely, with NO replacement of any kind.
 *
 * This file replaces `admit-session-agent-runnability-race.integration.test.ts`
 * (deleted alongside this fix — it specifically proved the now-forbidden live
 * re-check catches a deactivation race, which can no longer exist). The
 * correct, narrower claim this file proves instead: `admitSession`'s Phase 1
 * baked-`kind`/`status` check is DEFENSE-IN-DEPTH ONLY — a consistency
 * assertion against a resolver bug that baked an already-invalid snapshot —
 * never a live authority gate. It:
 *
 *   1. Still throws `TargetAgentNotRunnableError` for a malformed/missing
 *      bake (a resolver-bug simulation — a snapshot that was NEVER runnable
 *      to begin with, unlike the deleted file's genuinely-runnable-then-
 *      raced snapshot).
 *   2. Admits successfully from a well-formed, runnable baked snapshot alone
 *      — `SessionLifecyclePorts` carries NO `agentRunnability` field at all
 *      to read live, structurally (not merely behaviorally) proving zero
 *      live read of any kind. An agent deactivated in the live row AFTER
 *      emit (the bounded, accepted race architecture.md §12 now names a
 *      non-issue) still admits — the already-queued, already-authorized
 *      unit of work is allowed to complete, by design.
 *
 * Currently RED: `SessionLifecyclePorts` still declares a required
 * `agentRunnability` field (`provisioner.ts`), so a ports fixture that omits
 * it fails to satisfy the type — this file will not compile until Wave E's
 * live re-check and its port are deleted.
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

/** A harness adapter that must never actually be invoked — admission (success or failure) never reaches Phase 8 (harness spawn) in this file's scenarios. */
function buildFakeHarnessAdapter(): FakeHarnessAdapter {
	return {
		startSession: () => Promise.reject(new Error("must not be called by admitSession")),
		streamEvents: () => ({
			[Symbol.asyncIterator]() {
				throw new Error("must not be called by admitSession");
			},
		}),
		stopSession: () => Promise.reject(new Error("must not be called by admitSession")),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none" as const,
		}),
	};
}

/**
 * `SessionLifecyclePorts` fixture with NO `agentRunnability` field — the
 * intended post-deletion shape. Every field admitSession's Phases 1-7 do not
 * exercise in this file's scenarios is a `vi.fn()` that throws loudly if
 * ever called.
 */
function buildDefenseInDepthOnlyPorts(
	overrides: Partial<SessionLifecyclePorts>,
): SessionLifecyclePorts {
	const neverCalled = (label: string) =>
		vi.fn(() => {
			throw new Error(`${label}: must not be called in this test scenario`);
		});
	const base: SessionLifecyclePorts = {
		sessionRequests: {
			findSessionRequest: neverCalled("sessionRequests.findSessionRequest"),
			listSessionRequests: neverCalled("sessionRequests.listSessionRequests"),
			transitionSessionRequest: neverCalled("sessionRequests.transitionSessionRequest"),
			abortSessionRun: neverCalled("sessionRequests.abortSessionRun"),
			registerSessionRun: neverCalled("sessionRequests.registerSessionRun"),
			deregisterSessionRun: neverCalled("sessionRequests.deregisterSessionRun"),
		},
		observability: {
			summarizeToolArgs: () => "",
		},
		// AU21 §9 Increment 12 follow-up (F2 gap closure): `SessionLifecyclePorts`
		// no longer carries a `filesystems` seam reader at all — the agent's
		// injected filesystems are baked onto `params.injectedFilesystems` at
		// emit time instead (see `admit-session-baked-filesystems.integration.test.ts`
		// for that proof). There is no port left here to wire as `neverCalled`.
		// AU21 Increment 14a: `SessionLifecyclePorts` no longer carries a `cost`
		// field at all — the cap-gate port is deleted, no replacement.
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
		agentRunConfig: {
			// AU26 G1: `admitSession` reads the six run-config fields live from
			// `agent_run_config` instead of the emit-time bake. This fixture
			// returns the all-null default; tests that care override it.
			readAgentRunConfig: async () => ({
				systemPrompt: null,
				harnessType: null,
				modelTierPreference: null,
				modelId: null,
				modelProvider: null,
				maxConcurrentSessions: 1,
			}),
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
			writeSandboxAgentsMd: neverCalled("contextAssembly.writeSandboxAgentsMd"),
		},
		// NOTE: deliberately NO `agentRunnability` field — the point of this
		// fixture. `SessionLifecyclePorts` must not declare this field at all
		// post-deletion; until then, this object literal fails to satisfy the
		// type (missing required property), which is this file's RED signal —
		// no cast used, so the compiler genuinely enforces it.
	};
	return { ...base, ...overrides };
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
				sandboxId: "sbx-1",
				path: "/tmp/au21-admit-session-defense-in-depth-only",
			}),
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			destroy: async () => undefined,
		},
	};
}

describe("admitSession — baked-snapshot defense-in-depth ONLY, zero live read (Increment 12, third/founder-final pass)", () => {
	test("a malformed/missing baked config (resolver-bug simulation) still throws TargetAgentNotRunnableError, with no live read of any kind", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		// The live row IS runnable — proving the failure below comes purely
		// from the BAKED snapshot's own inconsistency (a resolver bug), never
		// a live re-check (there is none to consult: `SessionLifecyclePorts`
		// carries no `users`/`agentRunnability` field of any kind).
		await db.insert(users).values({
			id: "defense-agent-1",
			kind: "ai",
			name: "Agent One",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		const ports = buildDefenseInDepthOnlyPorts({});
		const provisioner = createProvisioner(ports);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "defense-agent-1",
			productId: "task-free",
			sandboxBasePath: "/tmp/au21-admit-session-defense-in-depth-only",
			// A resolver bug baked an inconsistent snapshot — `kind`/`status`
			// disagree with what `requireRunnableAgent` would ever produce.
			agentConfig: {
				kind: "human",
				status: "archived",
				role: "builder",
				teamId: null,
			},
		};

		await expect(provisioner.admit(buildDeps(db as HyperIdleDb), params)).rejects.toBeInstanceOf(
			TargetAgentNotRunnableError,
		);
	});

	test("admission fails for a missing bake entirely (agentConfig absent), same defense-in-depth path, zero live read", async ({
		db,
	}) => {
		const ports = buildDefenseInDepthOnlyPorts({});
		const provisioner = createProvisioner(ports);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "no-such-agent",
			productId: "task-free",
			sandboxBasePath: "/tmp/au21-admit-session-defense-in-depth-only",
			// No `agentConfig` at all — every real durable path bakes it; its
			// absence is a hard provisioning failure, never a silent allow.
		};

		await expect(provisioner.admit(buildDeps(db as HyperIdleDb), params)).rejects.toBeInstanceOf(
			TargetAgentNotRunnableError,
		);
	});

	test("a well-formed, genuinely-runnable baked snapshot admits successfully with ZERO live read — an agent deactivated in the live row after emit still admits, by design", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "defense-agent-2",
			kind: "ai",
			name: "Agent Two",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		// Simulate the bounded, accepted race architecture.md §12 now names a
		// non-issue: the agent is deactivated in the LIVE row after the
		// snapshot below was baked. There is no mechanism left to consult this
		// live row at all — admission must succeed purely from the bake.
		await db.update(users).set({ status: "archived" }).where(eq(users.id, "defense-agent-2"));

		const ports = buildDefenseInDepthOnlyPorts({});
		const provisioner = createProvisioner(ports);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "defense-agent-2",
			productId: "task-free",
			sandboxBasePath: "/tmp/au21-admit-session-defense-in-depth-only",
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
			},
		};

		const admitted = await provisioner.admit(buildDeps(db as HyperIdleDb), params);
		expect(admitted).toBeDefined();
		expect(admitted.sessionId).toEqual(expect.any(String));
	});
});
