/**
 * AU21 §9 Increment 12 (Decision H3), Wave E — updated by the THIRD,
 * founder-final pass (see `provisioner.ts`'s top-of-file Wave E `@lore`).
 *
 * Closes the formerly still-open `run-orchestration -> core-api` live reads
 * `provisioner.ts`'s `admitSession` used to perform
 * (`ports.settings.readServerConfig` Phase 3, `ports.routine.getRoutineById`
 * the admission-time per-run cost cap read (AU21 Increment 14a: this whole
 * cap is since deleted, no replacement), and — as of the third pass —
 * `ports.users`/`ports.agentRunnability` entirely) — see `provisioner.ts`'s
 * own Wave E top-of-file note and
 * `scripts/composition-edge-anti-regrowth-guard.ts`'s `DEFERRED_FOLLOWUP`
 * (no longer carries `run-orchestration::settings`/`::routine`/`::users` at
 * all).
 *
 * History (kept for context, not because it still stands as written): a
 * second pass restored a narrow live `kind`/`status` re-check
 * (`SessionLifecycleAgentRunnabilityReader.checkAgentRunnable`), reasoning
 * every per-kind resolver's `requireRunnableAgent` call guarantees the baked
 * snapshot is always runnable at emit time, so a baked-only re-check could
 * never catch a real emit→deactivate→drain race. The founder rejected that
 * pass outright ("the orchestration is a blind executer"), and a follow-up
 * event/subscriber mechanism ALSO rejected ("if it doesn't get a request to
 * do something it doesn't do something"). The resolution is a pure deletion,
 * no replacement: `SessionLifecyclePorts` carries no `users`/`agentRunnability`
 * field of any kind. Phase 1's baked `kind`/`status` check is DEFENSE-IN-DEPTH
 * ONLY (a resolver-bug consistency assertion, never a live authority gate) —
 * the emit→deactivate→drain race itself is now a named, accepted non-issue,
 * proven in `admit-session-defense-in-depth-only.integration.test.ts`.
 *
 * The two tests below are GREEN: `admitSession` consults
 * `params.harnessDisabled` for Phase 3 (no `ports.settings`/`ports.routine`
 * field exists at all — AU21 Increment 14a additionally deleted the
 * admission-time per-run cost cap this file used to also cover), and
 * `params.agentConfig` for every Phase 1 field, including the
 * defense-in-depth `kind`/`status` check — with zero live read of any kind.
 */

import * as fs from "node:fs";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { eq } from "drizzle-orm";
import { describe, vi } from "vitest";
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

/** A harness adapter that is never actually invoked by `admitSession` (Phases 1-7 stop short of harness spawn). */
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
 * Minimal, harmless `SessionLifecyclePorts` fixture — every field admitSession's
 * Phases 1-7 do not exercise in this test's scenarios (bare, task-free,
 * unmounted sessions) is a `vi.fn()` that throws if ever called, so an
 * unexpected invocation fails loudly instead of silently no-op'ing.
 */
function buildHarnessPorts(overrides: Partial<SessionLifecyclePorts>): SessionLifecyclePorts {
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
		// no longer carries a `filesystems` seam reader at all — see
		// `admit-session-baked-filesystems.integration.test.ts` for the baked-list
		// proof that replaces it. AU21 Increment 14a: the `cost` port
		// (`checkCostCap`/`recordCostAndCheck`) is deleted along with the rest
		// of the cost feature — `SessionLifecyclePorts` no longer carries it.
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
			describeSelectFailure: () => "test pool selected nothing",
		},
		workspace: {
			// A real workspace adapter always materializes the directory it hands
			// back (LocalSandboxAdapter.spawn) — admitSession's post-mount
			// `ensureSandboxGitRepo` step now depends on that, so this fake must
			// honor it too.
			spawn: async () => {
				fs.mkdirSync("/tmp/au21-admit-session-baked-config", { recursive: true });
				return { sandboxId: "sbx-1", path: "/tmp/au21-admit-session-baked-config" };
			},
			exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			destroy: async () => undefined,
		},
	};
}

describe("admitSession — baked agent-runnability config (Increment 12 Wave E)", () => {
	test("a deactivated agent's BAKED snapshot still fails provisioning, even when the agent's LIVE row is runnable", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "wave-e-agent-1",
			kind: "ai",
			name: "Agent One",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		// The LIVE row is runnable — proving Phase 1 does not (and structurally
		// cannot: `SessionLifecyclePorts` carries no `users` field at all)
		// consult it. Only the BAKED snapshot on `params.agentConfig` below
		// governs the outcome.
		const [liveRunnableAgent] = await db.select().from(users).where(eq(users.id, "wave-e-agent-1"));
		if (!liveRunnableAgent) throw new Error("fixture insert failed");

		const ports = buildHarnessPorts({});
		const provisioner = createProvisioner(ports);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "wave-e-agent-1",
			productId: "task-free",
			sandboxBasePath: "/tmp/au21-admit-session-baked-config",
			// The BAKED snapshot (what the emit-time resolver produced) says this
			// agent is NOT runnable — deliberately mismatched from the live row
			// above to isolate which source of truth Phase 1 consults.
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

	test("admitSession admits purely from a fully-baked snapshot — SessionLifecyclePorts carries no users/settings/routine field to read live at all", async ({
		db,
	}) => {
		const now = new Date().toISOString();
		// The live row exists but is never consulted — `SessionLifecyclePorts`
		// (see `buildHarnessPorts`) structurally has no `users`/`settings`/
		// `routine` field for `admitSession` to read through; the only
		// mechanism left is the baked snapshot below.
		await db.insert(users).values({
			id: "wave-e-agent-2",
			kind: "ai",
			name: "Agent Two",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		const ports = buildHarnessPorts({});
		const provisioner = createProvisioner(ports);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "wave-e-agent-2",
			productId: "team-1",
			sandboxBasePath: "/tmp/au21-admit-session-baked-config",
			routineId: "routine-1",
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: "team-1",
			},
			harnessDisabled: [],
			contextBundle: {
				kind: "routine",
				routine: {
					id: "routine-1",
					name: "Nightly sweep",
					prompt: null,
					lastRunSummary: null,
				},
				agent: { id: "wave-e-agent-2", name: "Agent Two", role: "builder" },
				team: { id: "team-1", name: "Team" },
				knowledge: [],
			},
		};

		const admitted = await provisioner.admit(buildDeps(db as HyperIdleDb), params);

		expect(admitted).toBeDefined();
	});
});
