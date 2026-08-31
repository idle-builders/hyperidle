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

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { afterEach, describe, vi } from "vitest";
import { TargetAgentNotRunnableError } from "../errors.js";
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
		// no longer carries a `filesystems` seam reader at all. AU26 F2: nor does
		// the request carry a baked list — the spawn reads the injection record
		// live through `ProvisionSessionDeps.injectedFilesystems`, an in-layer
		// port (see `admit-session-live-filesystems.integration.test.ts`). There
		// is no core-api port left here to wire as `neverCalled`.
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
			writePluginStdioMcpEntries: neverCalled("harnessRuntime.writePluginStdioMcpEntries"),
			openMcpBridge: neverCalled("harnessRuntime.openMcpBridge"),
			closeMcpBridge: neverCalled("harnessRuntime.closeMcpBridge"),
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

function buildDeps(db: HyperIdleDb, sandboxPath: string): ProvisionSessionDeps {
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
			describeSelectFailure: () => "test pool selected nothing",
		},
		workspace: {
			// A real workspace adapter always materializes the directory it hands
			// back (LocalSandboxAdapter.spawn) — admitSession's post-mount
			// `ensureSandboxGitRepo` step now depends on that, so this fake must
			// honor it too.
			spawn: async () => {
				fs.mkdirSync(sandboxPath, { recursive: true });
				return { sandboxId: "sbx-1", path: sandboxPath };
			},
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			destroy: async () => undefined,
		},
	};
}

describe("admitSession — baked-snapshot defense-in-depth ONLY, zero live read (Increment 12, third/founder-final pass)", () => {
	// Each test gets its own fresh `mkdtempSync` sandbox, never a fixed path —
	// a fixed `/tmp/au21-...` path accumulates a `.git` from earlier runs, so
	// an assertion against it would still pass even with `ensureSandboxGitRepo`
	// deleted from `provisioner.ts`. See the third test's `.git` assertion
	// below, which this fresh-directory setup makes a real, fixable-red check.
	const sandboxDirs: string[] = [];
	afterEach(() => {
		for (const dir of sandboxDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

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
		const sandboxPath = fs.mkdtempSync(
			path.join(os.tmpdir(), "au21-admit-session-defense-in-depth-only-"),
		);
		sandboxDirs.push(sandboxPath);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "defense-agent-1",
			productId: "task-free",
			sandboxBasePath: sandboxPath,
			// A resolver bug baked an inconsistent snapshot — `kind`/`status`
			// disagree with what `requireRunnableAgent` would ever produce.
			agentConfig: {
				kind: "human",
				status: "archived",
				role: "builder",
				teamId: null,
			},
		};

		await expect(
			provisioner.admit(buildDeps(db as HyperIdleDb, sandboxPath), params),
		).rejects.toBeInstanceOf(TargetAgentNotRunnableError);
	});

	test("admission fails for a missing bake entirely (agentConfig absent), same defense-in-depth path, zero live read", async ({
		db,
	}) => {
		const ports = buildDefenseInDepthOnlyPorts({});
		const provisioner = createProvisioner(ports);
		const sandboxPath = fs.mkdtempSync(
			path.join(os.tmpdir(), "au21-admit-session-defense-in-depth-only-"),
		);
		sandboxDirs.push(sandboxPath);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "no-such-agent",
			productId: "task-free",
			sandboxBasePath: sandboxPath,
			// No `agentConfig` at all — every real durable path bakes it; its
			// absence is a hard provisioning failure, never a silent allow.
		};

		await expect(
			provisioner.admit(buildDeps(db as HyperIdleDb, sandboxPath), params),
		).rejects.toBeInstanceOf(TargetAgentNotRunnableError);
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
		const sandboxPath = fs.mkdtempSync(
			path.join(os.tmpdir(), "au21-admit-session-defense-in-depth-only-"),
		);
		sandboxDirs.push(sandboxPath);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "defense-agent-2",
			productId: "task-free",
			sandboxBasePath: sandboxPath,
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
			},
		};

		const admitted = await provisioner.admit(buildDeps(db as HyperIdleDb, sandboxPath), params);
		expect(admitted).toBeDefined();
		expect(admitted.sessionId).toEqual(expect.any(String));
		// `ensureSandboxGitRepo`'s only production call site (provisioner.ts's
		// admit, post-mount) — this is the one place in the suite that both
		// executes the line AND asserts on its effect. `sandboxPath` is a fresh
		// `mkdtempSync` directory (never the fixed `/tmp/au21-...` paths the
		// other admit-session integration tests used to share), so this can
		// actually go red: deleting the `ensureSandboxGitRepo` call leaves no
		// `.git` here, unlike a reused fixed path that would carry one over
		// from an earlier run regardless of whether the production line ran.
		expect(fs.existsSync(path.join(sandboxPath, ".git"))).toBe(true);
	});
});
