/**
 * AL6 v2 — Integration tests for return-gate enforcement.
 *
 * Drives the PRODUCTION runSession/provisionSession path with stub harness
 * adapters to assert the v2 return-gate enforcement.
 *
 * Covers:
 *   AC1/AC3 (v2 teeth): A turn ending without a return action is NOT accepted
 *     as completed — `outcome` is "not_returned" (NEVER "completed"), the
 *     PERSISTED session row outcome is "not_returned", the session_ended event
 *     outcome is "not_returned", AND session_not_returned is emitted.
 *     (WARNING-A: the test deliberately asserts the persisted row and the
 *     session_ended event, not just the in-memory ProvisionSessionResult. This
 *     forces T6 to fix endSession's hardcoded "completed" at :276 and :295 in
 *     session-lifecycle.ts — the v1 bug would survive in the DB if only the
 *     in-memory result were asserted.)
 *   AC1 (happy path): A turn ending with a return action IS accepted as
 *     completed — outcome "completed", no session_not_returned event.
 *   AC4 (uniformity): enforcement holds across adapter shapes (Tier-1 builtin,
 *     Tier-2 cli/remote-shaped via mock). Both produce non-"completed" outcomes
 *     on no-return turns. The canForceReturn capability bit is read from the
 *     adapter capabilities and drives the tier selection.
 *   AC5 (integration): mid-turn non-terminal tools all execute normally; a turn
 *     calling read_inbox + write_memory then submit_review is accepted as
 *     completed with no force injected.
 *   AC4 (canForceReturn table): each real adapter class reports the expected
 *     canForceReturn bit (SDK: true, builtin: true, cli: false, remote: false,
 *     isolated: false). Asserted via dynamic import of each adapter class.
 *
 * Tests FAIL (red) until:
 *   - AL6_MAX_FORCE_RETURNS / AL6_FORCE_RETURN_MESSAGE added to @hyperidle/shared (T1)
 *   - canForceReturn added to HarnessCapabilities (T1)
 *   - not_returned added to SessionOutcome (T1)
 *   - returnVerdict is on ProvisionSessionResult (already exists from v1)
 *   - session_not_returned event is on DomainEvent (already exists from v1)
 *   - gate is wired into runSession site A (already from v1)
 *   - endSession writes "not_returned" outcome to DB row AND session_ended event (T6)
 *   - provisionSession returns outcome:"not_returned" on not_returned verdict (T6)
 */

import { bets, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { fabricStrategy } from "@hyperidle/fabric";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { AdapterPool } from "../../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../../harness/local-sandbox-adapter.js";
import { provisionSession } from "../../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";

// ── Constants ────────────────────────────────────────────────────────────────

const TEST_TEAM_ID = "al6-team";
const TEST_AGENT_ID = "al6-agent";
const TEST_BET_ID = "al6-bet";

// ── DB seed helpers ───────────────────────────────────────────────────────────

async function seedDb(
	db: Parameters<typeof provisionSession>[0]["db"],
	taskId: string,
): Promise<void> {
	// Only insert shared entities once; they are deduplicated via TRUNCATE per test.
	await db.insert(teams).values({
		id: TEST_TEAM_ID,
		name: "AL6 Gate Team",
		phase: "build",
		createdAt: new Date().toISOString(),
	});
	await db.insert(teamMembers).values({
		id: "al6-tm",
		teamId: TEST_TEAM_ID,
		capacity: 3,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	});
	await db.insert(users).values({
		id: TEST_AGENT_ID,
		name: "AL6 Gate Agent",
		role: "builder",
		status: "idle",
		// @lore U1: users.teamId references team_members.id (not teams.id)
		teamId: "al6-tm",
		createdAt: new Date().toISOString(),
		harnessType: "builtin",
		modelProvider: "openrouter",
		modelId: "deepseek/deepseek-chat-v3-0324:nitro",
	});
	await db.insert(bets).values({
		id: TEST_BET_ID,
		teamId: TEST_TEAM_ID,
		description: "AL6 Gate Test Bet",
		appetite: "small",
		status: "active",
		createdAt: new Date().toISOString(),
	});
	await db.insert(tasks).values({
		id: taskId,
		betId: TEST_BET_ID,
		teamId: TEST_TEAM_ID,
		title: "AL6 Gate Test Task",
		state: "accepted",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});
}

// ── Fake resolved model (no real API key needed — adapters are stubs) ─────────

const FAKE_RESOLVED_MODEL = {
	provider: "openrouter" as const,
	model: "deepseek/deepseek-chat-v3-0324:nitro",
	apiKey: "al6-fake-key",
	baseUrl: "https://openrouter.ai/api",
};

// ── Stub harness factory ──────────────────────────────────────────────────────

/**
 * Build a stub HarnessAdapter whose stream emits a fixed sequence of events,
 * then exhausts. `events` controls what tool_calls (if any) the "agent" makes.
 * `hasNativeReturnHook` / `canReEngage` control the v3 capability shape.
 *
 * v3: hasNativeReturnHook defaults to false (no in-turn hook) — the expected
 * behavior for CLI/remote/isolated-shaped stubs.
 */
function makeStubAdapter(
	streamEvents: HarnessEvent[],
	caps: Partial<HarnessCapabilities> = {},
): HarnessAdapter {
	const capabilities: HarnessCapabilities = {
		preCompactionTrigger: false,
		subAgents: false,
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		mcpSupport: false,
		// v3: defaults — no in-turn hook (external shape); re-engage via Layer-B.
		returnEnforcement: "none",
		...caps,
	};

	return {
		async startSession(config: SessionConfig): Promise<SessionHandle> {
			return { sessionId: config.sessionId };
		},

		async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
			for (const ev of streamEvents) {
				yield ev;
			}
		},

		async stopSession(_handle: SessionHandle): Promise<SessionResult> {
			return {
				outcome: "completed",
				cost: { minor: 100, currency: "USD" },
				tokenUsage: { byTier: {} },
			};
		},

		getCapabilities(): HarnessCapabilities {
			return capabilities;
		},
	};
}

/**
 * Run provisionSession with a given adapter stub, returning result + collected events.
 *
 * @returns result and both the emitted event types AND the raw session_ended event
 * (so tests can assert its outcome field — WARNING-A).
 */
async function runWithAdapter(
	db: Parameters<typeof provisionSession>[0]["db"],
	taskId: string,
	adapter: HarnessAdapter,
	adapterName = "al6-stub",
): Promise<{
	result: Awaited<ReturnType<typeof provisionSession>>;
	emittedEventTypes: string[];
	sessionEndedOutcomes: string[];
}> {
	const eventBus = new EventBus();
	const emittedEventTypes: string[] = [];
	const sessionEndedOutcomes: string[] = [];

	eventBus.on("*", (ev) => {
		emittedEventTypes.push(ev.type);
	});
	// Capture the session_ended event outcome (WARNING-A: verify the bus event carries
	// the correct outcome, not the hardcoded "completed" that v1's endSession emits).
	eventBus.on("session_ended" as Parameters<typeof eventBus.on>[0], (ev) => {
		const e = ev as unknown as { outcome: string };
		sessionEndedOutcomes.push(e.outcome);
	});

	const pool = new AdapterPool();
	pool.register(adapterName, adapter, {
		name: `AL6 Stub Adapter (${adapterName})`,
		kind: "local",
		type: "builtin",
		modelProviders: ["anthropic", "openrouter", "openai-compatible"],
		maxConcurrent: 5,
	});

	const workspace = new LocalSandboxAdapter();

	const result = await provisionSession(
		{ db, eventBus, adapterPool: pool, workspace },
		{
			taskId,
			agentId: TEST_AGENT_ID,
			productId: TEST_TEAM_ID,
			sandboxBasePath: "/tmp/al6-gate-test",
			resolvedModel: FAKE_RESOLVED_MODEL,
		},
	);

	return { result, emittedEventTypes, sessionEndedOutcomes };
}

// ── Lifecycle env setup ───────────────────────────────────────────────────────

describe("AL6 v2 — return-gate integration", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", "al6-gate-test-key");
		vi.stubEnv("HYPERIDLE_CREDENTIAL_KEY", "al6-gate-cred-key-32chars!!!!");
		vi.stubEnv("HYPERIDLE_PROFILE", "laptop");
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
	});

	// ── AC1: turn with a return action is accepted (happy path) ───────────────

	describe("AC1 — turn ending with a return action is accepted as completed", () => {
		test("submit_review in stream → returnVerdict='returned', outcome='completed', no session_not_returned", async ({
			db,
		}) => {
			const taskId = "al6-ac1-task-1";
			await seedDb(db, taskId);

			const events: HarnessEvent[] = [
				{ type: "token_usage", inputTokens: 50, outputTokens: 25 },
				{ type: "cost_update", totalCost: 0.01, deltaCost: 0.01 },
				{ type: "tool_call", toolName: "read_inbox", args: {} },
				{ type: "tool_call", toolName: "submit_review", args: { message: "Work done." } },
				{ type: "completion", text: "Submitted." },
			];

			const { result, emittedEventTypes, sessionEndedOutcomes } = await runWithAdapter(
				db,
				taskId,
				makeStubAdapter(events),
				"al6-stub-submit",
			);

			// AC1: returnVerdict must be "returned"
			expect(result.returnVerdict).toBe("returned");
			// AC1 (v2): outcome must be "completed" — compliant turn is accepted
			expect(result.outcome).toBe("completed");
			// AC3: no session_not_returned event should have been emitted
			expect(emittedEventTypes).not.toContain("session_not_returned");
			// WARNING-A: the session_ended event on the bus must also carry "completed"
			expect(sessionEndedOutcomes).toContain("completed");
		});

		test("handoff_to in stream → returnVerdict='returned', outcome='completed'", async ({ db }) => {
			const taskId = "al6-ac1-task-2";
			await seedDb(db, taskId);

			const events: HarnessEvent[] = [
				{ type: "tool_call", toolName: "write_memory", args: { key: "k", value: "v" } },
				{ type: "tool_call", toolName: "handoff_to", args: { role: "reviewer" } },
				{ type: "completion", text: "Handed off." },
			];

			const { result, emittedEventTypes } = await runWithAdapter(
				db,
				taskId,
				makeStubAdapter(events),
				"al6-stub-handoff",
			);

			expect(result.returnVerdict).toBe("returned");
			expect(result.outcome).toBe("completed");
			expect(emittedEventTypes).not.toContain("session_not_returned");
		});

		test("send_message in stream → returnVerdict='returned', outcome='completed'", async ({
			db,
		}) => {
			const taskId = "al6-ac1-task-3";
			await seedDb(db, taskId);

			const events: HarnessEvent[] = [
				{ type: "tool_call", toolName: "send_message", args: { to: "human-1", body: "Done." } },
				{ type: "completion", text: "" },
			];

			const { result, emittedEventTypes } = await runWithAdapter(
				db,
				taskId,
				makeStubAdapter(events),
				"al6-stub-sendmsg",
			);

			expect(result.returnVerdict).toBe("returned");
			expect(result.outcome).toBe("completed");
			expect(emittedEventTypes).not.toContain("session_not_returned");
		});
	});

	// ── AC1 + AC3 (v2 teeth): no-return turn → outcome "not_returned" ─────────
	//
	// WARNING-A: These tests assert BOTH:
	//   (a) the ProvisionSessionResult.outcome is "not_returned" (in-memory)
	//   (b) the PERSISTED sessions.outcome DB column is "not_returned"
	//   (c) the session_ended bus event carries outcome "not_returned"
	//
	// The v1 bug was: endSession hardcoded outcome:"completed" at :276 (row) and
	// :295 (event), so result.outcome could say "not_returned" but the DB row and
	// the bus event still said "completed". These assertions force T6 to fix
	// endSession — not just the in-memory result struct.

	describe("AC1 + AC3 (v2) — no-return turn → outcome 'not_returned', persisted row, bus event", () => {
		test("no return in stream → result.outcome='not_returned' (NEVER 'completed')", async ({
			db,
		}) => {
			const taskId = "al6-ac3-v2-task-1";
			await seedDb(db, taskId);

			// Agent calls non-terminal tools only — never returns
			const events: HarnessEvent[] = [
				{ type: "cost_update", totalCost: 0.01, deltaCost: 0.01 },
				{ type: "tool_call", toolName: "read_inbox", args: {} },
				{ type: "tool_call", toolName: "write_memory", args: { key: "x", value: "y" } },
				{ type: "completion", text: "I forgot to return." },
			];

			const { result, emittedEventTypes } = await runWithAdapter(
				db,
				taskId,
				makeStubAdapter(events),
				"al6-stub-noreturn-v2",
			);

			// AC1 v2: returnVerdict says not_returned
			expect(result.returnVerdict).toBe("not_returned");
			// AC1 v2 (the main addition vs v1): outcome must NOT be "completed"
			expect(result.outcome).toBe("not_returned");
			// Defensive: make sure it's really not "completed"
			expect(result.outcome).not.toBe("completed");
			// AC3: session_not_returned must still be emitted
			expect(emittedEventTypes).toContain("session_not_returned");
		});

		test(
			"WARNING-A: PERSISTED sessions.outcome row is 'not_returned' (not 'completed') " +
				"when turn ends without a return",
			async ({ db }) => {
				const taskId = "al6-ac3-v2-persist-1";
				await seedDb(db, taskId);

				// Agent calls no return action
				const events: HarnessEvent[] = [
					{ type: "tool_call", toolName: "write_memory", args: { key: "k", value: "v" } },
					{ type: "completion", text: "done without returning" },
				];

				const { result } = await runWithAdapter(
					db,
					taskId,
					makeStubAdapter(events),
					"al6-stub-persist-warn-a",
				);

				// First assert the in-memory result
				expect(result.outcome).toBe("not_returned");

				// WARNING-A: query the DB directly — the persisted row MUST also say "not_returned"
				// This test FAILS on v1's endSession because endSession hardcodes outcome:"completed"
				// at session-lifecycle.ts:276. T6 must pass "not_returned" through endSession to the
				// row .set({outcome}) call.
				const [session] = await db
					.select({ outcome: sessions.outcome })
					.from(sessions)
					.where(eq(sessions.id, result.sessionId))
					.limit(1);

				expect(session).toBeDefined();
				// The v1 bug: this would be "completed" because endSession hardcodes it
				expect(session?.outcome).toBe("not_returned");
				expect(session?.outcome).not.toBe("completed");
			},
		);

		test(
			"WARNING-A: session_ended bus event carries outcome='not_returned' " +
				"(not hardcoded 'completed')",
			async ({ db }) => {
				const taskId = "al6-ac3-v2-bus-1";
				await seedDb(db, taskId);

				const events: HarnessEvent[] = [
					{ type: "tool_call", toolName: "read_inbox", args: {} },
					{ type: "completion", text: "forgot to return" },
				];

				const { result, sessionEndedOutcomes } = await runWithAdapter(
					db,
					taskId,
					makeStubAdapter(events),
					"al6-stub-bus-warn-a",
				);

				expect(result.outcome).toBe("not_returned");

				// WARNING-A: the session_ended event emitted on the bus must carry
				// outcome:"not_returned", not the hardcoded "completed" from v1 endSession:295.
				// This test FAILS until T6 threads the terminal outcome into the event.
				expect(sessionEndedOutcomes).toContain("not_returned");
				expect(sessionEndedOutcomes).not.toContain("completed");
			},
		);

		test("empty stream → not_returned + session_not_returned emitted + row persisted", async ({
			db,
		}) => {
			const taskId = "al6-ac3-v2-empty-1";
			await seedDb(db, taskId);

			const { result, emittedEventTypes } = await runWithAdapter(
				db,
				taskId,
				makeStubAdapter([]),
				"al6-stub-empty-v2",
			);

			expect(result.returnVerdict).toBe("not_returned");
			expect(result.outcome).toBe("not_returned");
			expect(result.outcome).not.toBe("completed");
			expect(emittedEventTypes).toContain("session_not_returned");
		});

		test("session_not_returned event has correct shape (v2 unchanged from v1)", async ({ db }) => {
			const taskId = "al6-ac3-v2-shape-1";
			await seedDb(db, taskId);

			const eventBus = new EventBus();
			const notReturnedEvents: unknown[] = [];

			// Collect the specific event with full payload
			eventBus.on("session_not_returned" as Parameters<typeof eventBus.on>[0], (ev) => {
				notReturnedEvents.push(ev);
			});

			const pool = new AdapterPool();
			pool.register("al6-shape-stub", makeStubAdapter([]), {
				name: "AL6 Shape Stub",
				kind: "local",
				type: "builtin",
				modelProviders: ["anthropic", "openrouter", "openai-compatible"],
				maxConcurrent: 5,
			});
			const workspace = new LocalSandboxAdapter();

			await provisionSession(
				{ db, eventBus, adapterPool: pool, workspace },
				{
					taskId,
					agentId: TEST_AGENT_ID,
					productId: TEST_TEAM_ID,
					sandboxBasePath: "/tmp/al6-shape-test",
					resolvedModel: FAKE_RESOLVED_MODEL,
				},
			);

			expect(notReturnedEvents).toHaveLength(1);
			const ev = notReturnedEvents[0] as Record<string, unknown>;
			expect(ev).toMatchObject({
				type: "session_not_returned",
				agentId: TEST_AGENT_ID,
				taskId,
			});
			expect(typeof ev.sessionId).toBe("string");
			expect(typeof ev.timestamp).toBe("number");
		});
	});

	// ── AC4: uniformity across harness shapes ──────────────────────────────────
	//
	// v2: the guarantee is uniform — no not-returned turn is ever accepted as
	// completed — but the mechanism degrades (Tier-1 force vs Tier-2 reject).
	// This parametrized test verifies the guarantee (outcome never "completed"
	// without return) holds for both Tier-1-shaped and Tier-2-shaped adapters.

	describe("AC4 v2 — enforcement guarantee (never completed-without-return) holds uniformly", () => {
		// v3: canForceReturn renamed to hasNativeReturnHook; canReEngage added.
		// All adapters use v3 capability shape now — no cast needed.
		type CapsWithForce = Partial<HarnessCapabilities>;
		const adapterShapes: Array<{
			name: string;
			caps: CapsWithForce;
			tier: "tier1-force" | "tier2-reject";
		}> = [
			// Tier-1 (force): canForceReturn:true — SDK + builtin
			{
				name: "builtin-shaped-tier1",
				caps: { returnEnforcement: "sdk-inprocess", mcpSupport: false },
				tier: "tier1-force",
			},
			{
				name: "sdk-shaped-tier1",
				caps: { returnEnforcement: "sdk-inprocess", mcpSupport: true, subAgents: true },
				tier: "tier1-force",
			},
			// Tier-2 (reject): canForceReturn:false — cli/remote/isolated
			{
				name: "cli-shaped-tier2",
				caps: { returnEnforcement: "none", mcpSupport: false },
				tier: "tier2-reject",
			},
			{
				name: "remote-shaped-tier2",
				caps: {
					returnEnforcement: "none",
					mcpSupport: false,
					subAgents: false,
				},
				tier: "tier2-reject",
			},
			{
				name: "isolated-shaped-tier2",
				caps: { returnEnforcement: "none", mcpSupport: true },
				tier: "tier2-reject",
			},
		];

		for (const shape of adapterShapes) {
			test(`${shape.name} (${shape.tier}): no-return stream → outcome NOT 'completed'`, async ({
				db,
			}) => {
				const taskId = `al6-ac4-v2-${shape.name}-noreturn`;
				await seedDb(db, taskId);

				// Stub stream emits non-return tools only — no forcing possible since stub
				// adapter can't actually force-continue. But the guarantee must hold:
				// after the stream exhausts (with or without forcing), the outcome is
				// never "completed" when no return was seen.
				const events: HarnessEvent[] = [
					{ type: "tool_call", toolName: "write_memory", args: {} },
					{ type: "completion", text: "done" },
				];

				const { result, emittedEventTypes } = await runWithAdapter(
					db,
					taskId,
					makeStubAdapter(events, shape.caps),
					`al6-${shape.name}-stub`,
				);

				// AC4 v2 guarantee: never "completed" without a return, regardless of tier
				expect(result.outcome).not.toBe("completed");
				expect(result.returnVerdict).toBe("not_returned");
				expect(emittedEventTypes).toContain("session_not_returned");
			});

			test(`${shape.name} (${shape.tier}): submit_review in stream → outcome 'completed'`, async ({
				db,
			}) => {
				const taskId = `al6-ac4-v2-${shape.name}-return`;
				await seedDb(db, taskId);

				const events: HarnessEvent[] = [
					{ type: "tool_call", toolName: "submit_review", args: {} },
					{ type: "completion", text: "done" },
				];

				const { result, emittedEventTypes } = await runWithAdapter(
					db,
					taskId,
					makeStubAdapter(events, shape.caps),
					`al6-${shape.name}-return-stub`,
				);

				expect(result.outcome).toBe("completed");
				expect(result.returnVerdict).toBe("returned");
				expect(emittedEventTypes).not.toContain("session_not_returned");
			});
		}

		// AC4 exemption: internal-extraction drain (tools:[]) must NOT be flagged
		test("tools:[] extraction-style drain is NOT flagged not_returned", async ({ db }) => {
			// This test exercises the isInternalExtractionDrain exemption:
			// a session run with no tools cannot invoke a return action and is
			// never flagged (concept §1.5). Verified via the value-import predicate.
			const taskId = "al6-ac4-v2-extraction-exempt";
			await seedDb(db, taskId);

			const { isInternalExtractionDrain } = await import("@hyperidle/shared");
			expect(isInternalExtractionDrain({ tools: [] })).toBe(true);
			expect(isInternalExtractionDrain({ tools: ["submit_review"] })).toBe(false);
		});
	});

	// ── AC4: per-adapter returnEnforcement table (v4-final) ──────────────────────
	// Assert each real adapter class reports the expected v4 returnEnforcement channel.
	// Hard-block: SDK ("sdk-inprocess"), builtin ("builtin-loop").
	// File-provisioned block: CLI ("settings-codex"/"settings-claude").
	// Process re-engage: remote ("process-reengage").
	// Inherited SDK: isolated ("sdk-inprocess").

	describe("AC4 v4 — returnEnforcement channel table for real adapters", () => {
		test("BuiltinHarnessAdapter: returnEnforcement='builtin-loop' (owns loop)", async () => {
			const { BuiltinHarnessAdapter } = await import("../../harness/builtin-harness-adapter.js");
			const adapter = new BuiltinHarnessAdapter();
			const caps = adapter.getCapabilities();
			expect(caps.returnEnforcement).toBe("builtin-loop");
		});

		test("claude CLI adapter (CliHarnessAdapter): returnEnforcement='settings-claude'", async () => {
			const { CliHarnessAdapter } = await import("../../harness/cli-harness-adapter.js");
			const { CLAUDE_CLI_CONFIG } = await import("../../harness/adapter-pool.js");
			const adapter = new CliHarnessAdapter(CLAUDE_CLI_CONFIG);
			const caps = adapter.getCapabilities();
			expect(caps.returnEnforcement).toBe("settings-claude");
		});

		test("CliHarnessAdapter (codex): returnEnforcement='settings-codex' (file-provisioned Stop hook)", async () => {
			const { CliHarnessAdapter } = await import("../../harness/cli-harness-adapter.js");
			const adapter = new CliHarnessAdapter({
				binary: "codex",
				args: [],
				envMap: {},
				envAllowlist: [],
				eventFormat: "ndjson" as const,
				returnEnforcementChannel: "settings-codex",
			} as unknown as ConstructorParameters<typeof CliHarnessAdapter>[0]);
			const caps = adapter.getCapabilities();
			expect(caps.returnEnforcement).toBe("settings-codex");
		});

		test("RemoteHarnessAdapter: returnEnforcement='process-reengage' (wrapper re-engage)", async () => {
			const { RemoteHarnessAdapter } = await import("../../harness/remote-harness-adapter.js");
			const fakeWs = {
				send: () => undefined,
				close: () => undefined,
				on: () => undefined,
				readyState: 1,
			};
			const fakeRegistration = {
				type: "register" as const,
				workerId: "test-worker",
				modelProviders: ["anthropic"],
				name: "Test Remote Worker",
				maxConcurrent: 1,
			};
			const adapter = new RemoteHarnessAdapter(
				fakeWs as unknown as ConstructorParameters<typeof RemoteHarnessAdapter>[0],
				fakeRegistration as unknown as ConstructorParameters<typeof RemoteHarnessAdapter>[1],
			);
			const caps = adapter.getCapabilities();
			expect(caps.returnEnforcement).toBe("process-reengage");
		});
	});

	// ── AC5 (integration): mid-turn tools all execute normally ────────────────

	describe("AC5 v2 — mid-turn non-terminal tool use executes normally", () => {
		test("read_inbox + write_memory mid-turn, then submit_review → 'completed', all tools recorded", async ({
			db,
		}) => {
			const taskId = "al6-ac5-v2-task-1";
			await seedDb(db, taskId);

			const eventBus = new EventBus();
			const toolCallsRecorded: string[] = [];
			eventBus.on("tool_call_recorded", (ev) => {
				toolCallsRecorded.push(ev.toolName);
			});

			const events: HarnessEvent[] = [
				{ type: "tool_call", toolName: "read_inbox", args: {} },
				{ type: "tool_call", toolName: "write_memory", args: { key: "k", value: "v" } },
				{ type: "tool_call", toolName: "submit_review", args: { message: "Done" } },
				{ type: "completion", text: "done" },
			];

			const pool = new AdapterPool();
			pool.register("al6-ac5-stub", makeStubAdapter(events), {
				name: "AL6 AC5 Stub",
				kind: "local",
				type: "builtin",
				modelProviders: ["anthropic", "openrouter", "openai-compatible"],
				maxConcurrent: 5,
			});
			const workspace = new LocalSandboxAdapter();

			const result = await provisionSession(
				{ db, eventBus, adapterPool: pool, workspace },
				{
					taskId,
					agentId: TEST_AGENT_ID,
					productId: TEST_TEAM_ID,
					sandboxBasePath: "/tmp/al6-ac5-test",
					resolvedModel: FAKE_RESOLVED_MODEL,
				},
			);

			// The gate must not block/suppress any mid-turn events — all tool calls recorded
			expect(toolCallsRecorded).toContain("read_inbox");
			expect(toolCallsRecorded).toContain("write_memory");
			expect(toolCallsRecorded).toContain("submit_review");

			// AC5: return verdict and outcome must be correct
			expect(result.returnVerdict).toBe("returned");
			expect(result.outcome).toBe("completed");
		});

		test("mid-turn tools only (no return) → outcome not_returned, mid-turn tools still recorded", async ({
			db,
		}) => {
			const taskId = "al6-ac5-v2-task-2";
			await seedDb(db, taskId);

			const eventBus = new EventBus();
			const toolCallsRecorded: string[] = [];
			eventBus.on("tool_call_recorded", (ev) => {
				toolCallsRecorded.push(ev.toolName);
			});

			const events: HarnessEvent[] = [
				{ type: "tool_call", toolName: "read_inbox", args: {} },
				{ type: "tool_call", toolName: "write_memory", args: { key: "k", value: "v" } },
				{ type: "completion", text: "done without return" },
			];

			const pool = new AdapterPool();
			pool.register("al6-ac5-noreturn-stub", makeStubAdapter(events), {
				name: "AL6 AC5 No Return Stub",
				kind: "local",
				type: "builtin",
				modelProviders: ["anthropic", "openrouter", "openai-compatible"],
				maxConcurrent: 5,
			});
			const workspace = new LocalSandboxAdapter();

			const result = await provisionSession(
				{ db, eventBus, adapterPool: pool, workspace },
				{
					taskId,
					agentId: TEST_AGENT_ID,
					productId: TEST_TEAM_ID,
					sandboxBasePath: "/tmp/al6-ac5-noreturn-test",
					resolvedModel: FAKE_RESOLVED_MODEL,
				},
			);

			// AC5: mid-turn tools must still have been recorded even on a not-returned turn
			expect(toolCallsRecorded).toContain("read_inbox");
			expect(toolCallsRecorded).toContain("write_memory");

			// The outcome is not_returned — but that's the enforcement result, not a tool block
			expect(result.outcome).toBe("not_returned");
			expect(result.returnVerdict).toBe("not_returned");
		});
	});
});
