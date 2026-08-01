/**
 * AU21 §9 Increment 12 (Decision H3), Wave E.
 *
 * Closes 2 of the 3 formerly still-open `run-orchestration -> core-api` live
 * reads `provisioner.ts`'s `admitSession` used to perform
 * (`ports.settings.readServerConfig` Phase 3, `ports.routine.getRoutineById`
 * the admission-time per-run cost cap read) — see `provisioner.ts`'s own
 * Wave E top-of-file note and
 * `scripts/composition-edge-anti-regrowth-guard.ts`'s `DEFERRED_FOLLOWUP`
 * (no longer carries `run-orchestration::settings`/`::routine`).
 *
 * **`ports.users.getUserById` (Phase 1) is NOT closed by this wave — REOPENED,
 * narrower, by a review-corrected fix.** This file's ORIGINAL version claimed
 * a fully-baked Phase 1 (checking only `params.agentConfig`) preserved the
 * runnability GATE with "a snapshot check, not a live one" trade-off blessed
 * by architecture.md §12. Review substantiated that reasoning was WRONG: every
 * per-kind resolver's `requireRunnableAgent` call guarantees the baked
 * snapshot is ALWAYS runnable at emit time, so a baked-only re-check can
 * never catch a REAL emit→deactivate→drain race — only a resolver bug that
 * baked a bad snapshot to begin with. No downstream mechanism naturally
 * rejects a deactivated agent either (traced, not guessed):
 * `AdapterPool.select()` (`@hyperidle/harness-registry`) is a pure in-memory
 * registry blind to the calling agent's identity/status; every CLI harness
 * (`claude`/`codex`/`opencode`) authenticates via inherited host
 * keychain/env, entirely agent-independent; the `CoreApiPort` seam's
 * actor-override header (`core-api-port-composition.ts`'s
 * `withActorTransport` / `middleware/auth.ts`'s `resolveApiKeyActorUserId`)
 * trusts the header value verbatim with ZERO re-read of the `users` row's
 * `kind`/`status`; and `GET /connections/provisioning`
 * (`core-api/src/routes/connections.ts`) resolves the single owning human's
 * held connections unconditionally, identity-blind to the requesting agent's
 * status. See `provisioner.ts`'s top-of-file Wave E `@lore` "CORRECTION" for
 * the full trace.
 *
 * The fix: Phase 1 now ALSO re-validates runnability against a minimal LIVE
 * read (`ports.agentRunnability.checkAgentRunnable` — `kind`/`status` ONLY,
 * not the old broad `getUserById`/`getFirstUserByKind` surface). Every other
 * config field (`role`/`systemPrompt`/`modelTierPreference`/`harnessType`/
 * `modelProvider`/`maxConcurrentSessions`/`teamId`) still comes from the baked
 * `agentConfig` snapshot — this wave's genuine win (avoiding a full row
 * re-fetch for pure configuration) is preserved; only the SAFETY-CRITICAL
 * `kind`/`status` re-check is live. The actual emit→deactivate→drain race
 * test lives in `admit-session-agent-runnability-race.integration.test.ts`
 * (this file's tests below cover the baked-config-consumption/consistency
 * behavior only, not the race itself).
 *
 * The two tests below are GREEN: `admitSession` now consults
 * `params.harnessDisabled`/the baked `contextBundle.routine.costCapPerRunMinor`
 * for Phase 3/the admission-time cap read (no `ports.settings`/`ports.routine`
 * field exists at all), and `params.agentConfig` for every Phase 1 CONFIG
 * field — but Phase 1's runnability GATE itself now ALSO requires
 * `ports.agentRunnability.checkAgentRunnable` to agree.
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
		// Real db-backed default (not a fixed stub) — mirrors the production
		// wiring (`run-orchestration-composition.ts`'s `agentRunnabilityReader`)
		// so these tests exercise the SAME live re-check production performs,
		// not a hand-waved always-true stub.
		agentRunnability: {
			async checkAgentRunnable(exec, agentId) {
				const [row] = await exec.select().from(users).where(eq(users.id, agentId)).limit(1);
				return row ? { kind: row.kind, status: row.status } : undefined;
			},
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
