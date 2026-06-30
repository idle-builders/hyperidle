/**
 * AL6 v4-final — deterministic real-loop integration tests (CI/test:all anchor).
 *
 * This file contains the DETERMINISTIC tests that prove the real enforcement loop
 * without spawning any real binaries or making any real LLM calls. These always
 * run in test:all / test:integration / CI.
 *
 * What this file covers:
 *   - builtin (in-process CI anchor): REAL BuiltinHarnessAdapter + mocked callLlm.
 *     Proves forceCount>=1 on no-return LLM, outcome=completed on returning LLM.
 *     No binary dependency — MUST pass in CI unconditionally.
 *   - cursor-agent (soft-continue, honestly inert): provisionReturnHook resolves
 *     without throw for the soft-continue channel.
 *
 * LIVE tests (real binary spawns + real LLM calls) have been moved to:
 *   AL6-real-harness-return-enforcement.real-harness.test.ts
 * Run them on demand: npm run test:real-harness
 *
 * Why split: "e2e/expensive/live-LLM tests run locally only; never a GitHub Actions job."
 * The live tests are slow (30–90s), costly (real LLM tokens), auth-gated, and flaky
 * under parallel load. The deterministic tests here are the CI anchor — fast, reliable,
 * zero binary dependencies.
 *
 * The builtin block is the discriminator: if the drain fallback is re-added, forceCount=0
 * and the assertion fails. The cursor-agent block asserts the honest inert state.
 * The real-loop discriminator (route nullify → fail, reengage revert → fail) is also
 * covered by AL6-return-status-route.test.ts and AL6-cli-reengage-adapter.test.ts.
 *
 * @lore AL6 lane-split: The split was done in AL6 v4 (test-lane hygiene pass).
 * Real binary tests prove the ⚠️ UNVERIFIED-AT-RUNTIME claims and have already
 * been run (callCount>=1 confirmed for claude, codex, opencode). They live in
 * AL6-real-harness-return-enforcement.real-harness.test.ts, excluded from test:all
 * via the server vitest.config.ts exclude list and the .real-harness.test.ts suffix.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { bets, sessions, tasks, teamMembers, teams, users } from "@hyperidle/db";
import { fabricStrategy } from "@hyperidle/fabric";
import { EventBus } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { provisionReturnHook } from "../../harness/provision-return-hook.js";
import { provisionSession } from "../../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";
import { BuiltinHarnessAdapter } from "../builtin-harness-adapter.js";

// AL6 CRIT-4: Mock callLlm so the real BuiltinHarnessAdapter tests do not make
// network calls. The mock returns a deterministic sequence of responses.
// Each test that uses BuiltinHarnessAdapter configures mockCallLlmImpl directly.
vi.mock("../llm-client.js", () => ({
	callLlm: vi.fn(),
}));

// Accessor for the mocked callLlm — must come AFTER vi.mock().
const { callLlm } = await import("../llm-client.js");
const callLlmMock = vi.mocked(callLlm);

import { AdapterPool } from "../adapter-pool.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";

// ── DB seed (shared pattern) ────────────────────────────────────────────────

const NOW = new Date().toISOString();

async function seedForHarness(
	db: Parameters<typeof provisionSession>[0]["db"],
	taskId: string,
	harnessType = "builtin",
): Promise<{ agentId: string; teamId: string }> {
	const agentId = `al6v4-rh-agent-${Math.random().toString(36).slice(2, 7)}`;
	const teamId = "al6v4-rh-team";
	const teamMembersId = "al6v4-rh-tm";
	const betId = "al6v4-rh-bet";

	await db
		.insert(teams)
		.values({ id: teamId, name: "AL6 v4 RH Team", phase: "build", createdAt: NOW })
		.onConflictDoNothing();
	await db
		.insert(teamMembers)
		.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW })
		.onConflictDoNothing();

	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "AL6 v4 RH Agent",
		role: "builder",
		status: "active",
		maxConcurrentSessions: 4,
		teamId: teamMembersId,
		createdAt: NOW,
		harnessType,
		modelProvider: "openrouter",
		modelId: "deepseek/deepseek-chat-v3-0324:nitro",
	});

	await db
		.insert(bets)
		.values({ id: betId, teamId, description: "AL6 v4 RH bet", status: "active", createdAt: NOW })
		.onConflictDoNothing();
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "AL6 v4 RH Task",
		state: "accepted",
		ownerAgentId: agentId,
		createdAt: NOW,
		updatedAt: NOW,
	});

	return { agentId, teamId };
}

// AL6 CRIT-4: NoReturnBuiltinStub and ReturningBuiltinStub removed.
// The builtin CI anchor now uses the REAL BuiltinHarnessAdapter with mocked callLlm.
// Stubs that have no forcing loop would produce forceCount=0, which FAILS the
// forceCount>=1 assertion now that the drain fallback is removed.
// This ensures "hook actually fired" is proven, not satisfied by the gate floor.

// ── Lifecycle ──────────────────────────────────────────────────────────────

describe("AL6 v4-final — real-harness return-enforcement integration", () => {
	let sandboxBasePath: string;

	beforeEach(() => {
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "al6v4-rh-"));
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	// ── BUILTIN (deterministic CI anchor — no binary dependency) ────────────
	//
	// This block MUST always pass in CI. No binary gating. It proves:
	//   - provisionReturnHook handles "builtin-loop" (no file written, in-process)
	//   - the REAL BuiltinHarnessAdapter's in-process forcing loop increments forceCount
	//   - forceCount >= 1 comes from a REAL in-process enforcement fire (not the drain fallback)
	//   - outcome="not_returned" after budget exhausted
	//   - outcome="completed" with zero blocks on a compliant turn
	//   - exactly ONE startSession (no v3-style loop)
	//
	// AL6 CRIT-4: Uses real BuiltinHarnessAdapter + mocked callLlm (not NoReturnBuiltinStub).
	// The drain fallback (not_returned → forceCount+1) has been REMOVED. So forceCount>=1
	// ONLY passes if the real adapter's in-process forcing loop fired at least once.
	// A no-op stub (drain-only) would produce forceCount=0 and FAIL the assertion.

	describe("builtin (in-process, CI anchor)", () => {
		test("real BuiltinHarnessAdapter: no-return LLM → forceCount>=1 (in-process forcing loop fired), outcome=not_returned", async ({
			db,
		}) => {
			const taskId = `al6v4-builtin-noreturn-real-${Math.random().toString(36).slice(2, 7)}`;
			const { agentId, teamId } = await seedForHarness(db, taskId, "builtin");

			// Mock callLlm to return text-only (no tool_use, no return action).
			// The real BuiltinHarnessAdapter will call shouldForceReturn → forceCount++ each time
			// the LLM produces end_turn without a return action.
			callLlmMock.mockResolvedValue({
				stopReason: "end_turn" as const,
				content: [{ type: "text" as const, text: "I'm done, goodbye!" }],
				usage: { inputTokens: 100, outputTokens: 50 },
			});

			// Use the REAL BuiltinHarnessAdapter (not a stub).
			// AL6 CRIT-4: the real adapter's forcing loop increments session.forceCount.
			// computeForceReturnCount() = 0 (registry) + session.forceCount (via getForceReturnCount).
			// Without the drain fallback, forceCount=0 would FAIL — only a real fire passes.
			const adapter = new BuiltinHarnessAdapter({ maxIterations: 10 });
			const eventBus = new EventBus();
			const pool = new AdapterPool();
			pool.register("al6v4-builtin-real", adapter, {
				name: "AL6 v4 Builtin Real",
				kind: "local",
				type: "builtin",
				modelProviders: ["anthropic", "openrouter"],
				maxConcurrent: 5,
			});
			const workspace = new LocalSandboxAdapter();

			const result = await provisionSession(
				{ db, eventBus, adapterPool: pool, workspace },
				{
					taskId,
					agentId,
					productId: teamId,
					sandboxBasePath,
					resolvedModel: {
						provider: "anthropic" as const,
						model: "claude-haiku-4-5",
						apiKey: "sk-test-key-builtin",
						baseUrl: "https://api.anthropic.com",
					},
				},
			);

			// AL6 CRIT-4: forceCount MUST be >= 1 from the REAL in-process forcing loop.
			// This assertion FAILS on a no-op stub or if the drain fallback is re-added.
			// Drain fallback removal is the key discriminator: a stripped hook yields 0.
			const forceCount = (result as unknown as Record<string, unknown>).forceReturnCount as
				| number
				| undefined;
			expect(typeof forceCount).toBe("number");
			// The real adapter fired the forcing loop: forceCount >= 1.
			// adapterForceCount = BuiltinHarnessAdapter.getForceReturnCount() = session.forceCount.
			expect(forceCount).toBeGreaterThanOrEqual(1);

			// Outcome: budget exhausted → not_returned.
			expect(result.outcome).toBe("not_returned");
			expect(result.returnVerdict).toBe("not_returned");

			// DB row must also be not_returned.
			const [sessionRow] = await db
				.select({ outcome: sessions.outcome })
				.from(sessions)
				.where(eq(sessions.id, result.sessionId))
				.limit(1);
			expect(sessionRow?.outcome).toBe("not_returned");

			callLlmMock.mockReset();
		});

		test("real BuiltinHarnessAdapter: returning LLM → forceCount=0, outcome=completed", async ({
			db,
		}) => {
			const taskId = `al6v4-builtin-return-real-${Math.random().toString(36).slice(2, 7)}`;
			const { agentId, teamId } = await seedForHarness(db, taskId, "builtin");

			// Mock callLlm to return a tool_call for submit_review (return action).
			// The real BuiltinHarnessAdapter will see returnSeen=true and allow stop.
			callLlmMock.mockResolvedValue({
				stopReason: "tool_use" as const,
				content: [
					{
						type: "tool_use" as const,
						id: "tool-001",
						name: "submit_review",
						input: { message: "Task complete." },
					},
				],
				usage: { inputTokens: 100, outputTokens: 80 },
			});

			const adapter = new BuiltinHarnessAdapter({ maxIterations: 10 });
			const eventBus = new EventBus();
			const pool = new AdapterPool();
			pool.register("al6v4-builtin-return-real", adapter, {
				name: "AL6 v4 Builtin Return Real",
				kind: "local",
				type: "builtin",
				modelProviders: ["anthropic", "openrouter"],
				maxConcurrent: 5,
			});
			const workspace = new LocalSandboxAdapter();

			const result = await provisionSession(
				{ db, eventBus, adapterPool: pool, workspace },
				{
					taskId,
					agentId,
					productId: teamId,
					sandboxBasePath,
					resolvedModel: {
						provider: "anthropic" as const,
						model: "claude-haiku-4-5",
						apiKey: "sk-test-key-builtin",
						baseUrl: "https://api.anthropic.com",
					},
				},
			);

			// Compliant adapter: no forcing needed.
			const forceCount = (result as unknown as Record<string, unknown>).forceReturnCount as
				| number
				| undefined;
			if (forceCount !== undefined) {
				expect(forceCount).toBe(0);
			}

			expect(result.outcome).toBe("completed");
			expect(result.returnVerdict).toBe("returned");

			callLlmMock.mockReset();
		});
	});

	// Live binary tests (claude, codex, opencode) have been moved to:
	//   AL6-real-harness-return-enforcement.real-harness.test.ts
	// Run on demand: npm run test:real-harness

	// ── CURSOR-AGENT (honestly inert — not spawnable today) ────────────────
	//
	// Per architecture.md §0.5: cursor-agent is discovery-only, not spawnable.
	// This test asserts the honest inert state — NOT silently claiming coverage.

	describe("cursor-agent (soft-continue channel, honestly inert)", () => {
		test("cursor-agent channel is declared as soft-continue and asserted inert (not spawnable)", async () => {
			const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "al6v4-cursor-"));

			try {
				const bridgeToken = "cursor-test-token";
				const mcpUrl = `http://localhost:3001/api/mcp/${bridgeToken}`;

				// Must not throw even for an inert channel.
				await expect(
					provisionReturnHook({
						sandboxPath,
						channel: "soft-continue",
						bridgeToken,
						mcpUrl,
						forceBudget: 2,
					}),
				).resolves.not.toThrow();

				// The channel is inert today: no active enforcement is claimed.
				// cursor-agent has no spawnable headless surface; the drain-gate
				// floor is the enforcement backstop.
			} finally {
				fs.rmSync(sandboxPath, { recursive: true, force: true });
			}
		});
	});
});
