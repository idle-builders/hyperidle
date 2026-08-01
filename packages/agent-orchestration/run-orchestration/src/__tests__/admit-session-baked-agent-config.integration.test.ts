/**
 * AU21 §9 Increment 12 (Decision H3), Wave E.
 *
 * Closes the three formerly still-open `run-orchestration -> core-api` live
 * reads `provisioner.ts`'s `admitSession` used to perform
 * (`ports.users.getUserById` Phase 1, `ports.settings.readServerConfig`
 * Phase 3, `ports.routine.getRoutineById` the admission-time per-run cost cap
 * read) — see `provisioner.ts`'s own Wave E top-of-file note and
 * `scripts/composition-edge-anti-regrowth-guard.ts`'s `DEFERRED_FOLLOWUP`
 * (no longer carries `run-orchestration::users`/`::settings`/`::routine`).
 *
 * **Part A safety investigation (see builder report for the full trace):**
 * deleting Phase 1's live `agent.kind !== "ai" || status not runnable` check
 * with NO baked replacement would be a real security regression, not a
 * cosmetic gap — traced (not guessed): `AdapterPool.select()`
 * (`@hyperidle/harness-registry`) is a pure in-memory registry keyed on
 * harnessType/modelProviders/disabledTypes, structurally blind to the calling
 * agent's identity or live status; every CLI harness (`claude`/`codex`/
 * `opencode`) authenticates via inherited host keychain/env, entirely
 * agent-independent; and the `CoreApiPort` seam's actor-override header
 * (`core-api-port-composition.ts`'s `withActorTransport` /
 * `middleware/auth.ts`'s `resolveApiKeyActorUserId`) trusts the header value
 * verbatim with ZERO re-read of the `users` row's `kind`/`status`.
 * `TargetAgentNotRunnableError` has exactly ONE throw site in the entire
 * codebase (`provisioner.ts`'s Phase 1) — there is no other live or natural
 * downstream mechanism that would reject a deactivated agent's session. The
 * safe design (this wave): bake `kind`/`status` (+ the other Phase 1/3 config
 * fields) onto each per-kind resolver's payload from the SAME already-
 * `requireRunnableAgent`-validated `agent: User` row (H2/Increment-11
 * precedent), and have Phase 1 check the BAKED snapshot instead of a live
 * read — same predicate, same throw class, same
 * `agent_run_admission_failed`/`TARGET_AGENT_NOT_RUNNABLE` reporting channel
 * (`runtime.ts`'s `reportPreAdmissionProvisioningFailure`, already covered by
 * `agent-session-runtime.integration.test.ts`'s own race test). This is a
 * snapshot check, not a live one — the emit→deactivate→drain race stays
 * open exactly as architecture.md §12's founder-resolved note accepts ("no
 * bespoke race-handling") — but the runnability GATE itself is never
 * silently dropped, only its data source changes.
 *
 * Both tests below are GREEN: `admitSession` now consults
 * `params.agentConfig`/`params.harnessDisabled`/the baked
 * `contextBundle.routine.costCapPerRunMinor` exclusively — Phase 1/3/the
 * admission-time cap read no longer carry a `ports.users`/`ports.settings`/
 * `ports.routine` field at all (`SessionLifecyclePorts` structurally has none).
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
		filesystems: {
			listFilesystemsByAgent: neverCalled("filesystems.listFilesystemsByAgent"),
		},
		connections: {
			buildProvisioningPlan: neverCalled("connections.buildProvisioningPlan"),
			applyProvisioningPlan: neverCalled("connections.applyProvisioningPlan"),
		},
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
			spawn: async () => ({ sandboxId: "sbx-1", path: "/tmp/au21-admit-session-baked-config" }),
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
			maxConcurrentSessions: 5,
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
				systemPrompt: null,
				modelTierPreference: null,
				harnessType: null,
				modelProvider: null,
				maxConcurrentSessions: 5,
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
			maxConcurrentSessions: 5,
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
				systemPrompt: null,
				modelTierPreference: null,
				harnessType: null,
				modelProvider: null,
				maxConcurrentSessions: 5,
			},
			harnessDisabled: [],
			contextBundle: {
				kind: "routine",
				routine: {
					id: "routine-1",
					name: "Nightly sweep",
					description: null,
					lastRunSummary: null,
					costCapPerRunMinor: 500,
				},
				agent: { id: "wave-e-agent-2", name: "Agent Two", role: "builder" },
				team: { id: "team-1", name: "Team" },
				knowledge: [],
			},
		};

		const admitted = await provisioner.admit(buildDeps(db as HyperIdleDb), params);

		expect(admitted).toBeDefined();
		expect(admitted.routinePerRunCap).toBe(500);
	});
});
