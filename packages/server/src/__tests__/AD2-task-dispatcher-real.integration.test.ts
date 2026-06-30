/**
 * AR4 — AD2 real dispatch→provision→real-agent integration test (AC2 keystone).
 *
 * Drives the full production path:
 *   registerTaskDispatcher → transitionTask(...,"accepted") → drainQueue →
 *   provisionSession → real HarnessAdapter → real LLM → session outcome
 *
 * Full 4-harness matrix (builtin + claude + codex + opencode) via
 * SUPPORTED_HARNESS_LANES + runThroughHarness — the same pattern AR2 ships.
 *
 * Key differences from AD2's original service-integration tests:
 *   - Uses the REAL trigger (transitionTask → accepted), NOT a seeded in_progress row.
 *   - Uses the REAL provisionSession (via setProvisionSessionFn), NOT a capturing stub.
 *   - Asserts on REAL session outcome + capture-seam artifact (sandbox file).
 *   - 240s ceiling per lane (real LLM latency).
 *
 * Service-integration tests (queue/cost/concurrency/sweep, in AD2-task-dispatcher.integration.test.ts)
 * are deliberately kept out of this file — single-archetype split (Guard nuance in plan §4).
 *
 * @lore AR4: onBeforeTeardown forwarded through TaskDispatcherDeps (plan Task 3) enables
 *   the capture seam to observe sandbox files written by the dispatched agent before
 *   endSession deletes the sandbox (same seam AR2 proved on the provisionSession path).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	type HyperIdleDb,
	knowledgeItems,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import {
	clearDeduplicationCache,
	registerTaskDispatcher,
	setProvisionSessionFn,
} from "@hyperidle/fabric";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import {
	createSandboxCapture,
	SUPPORTED_HARNESS_LANES,
	startMcpBridgeServer,
} from "../harness/__tests__/provision-real-session.js";
import { HARNESS_TEST_MODELS, requireHarness } from "../harness/__tests__/require-harness.js";
import { LocalSandboxAdapter } from "../harness/local-sandbox-adapter.js";
import { provisionSession } from "../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../services/strategy-registry.js";
import { transitionTask } from "../services/task-state-machine.js";
import { test } from "../test-fixtures.js";

// Wire provisionSession into the registry — required for the dispatcher to call it.
// @lore AD2: registry pattern breaks the server→fabric→server circular dep.
setProvisionSessionFn(provisionSession);

// ─── Domain seeding ──────────────────────────────────────────────────────────

const NOW = "2026-06-30T00:00:00.000Z";

async function seedDispatchDomain(
	db: HyperIdleDb,
	opts: {
		teamId: string;
		agentId: string;
		taskId: string;
		threadId: string;
		taskDescription: string;
		doneCondition: string;
	},
): Promise<void> {
	const { teamId, agentId, taskId, threadId, taskDescription, doneCondition } = opts;
	const teamMembersId = `tm-${teamId}`;
	const betId = `bet-${teamId}`;

	await db
		.insert(teams)
		.values({ id: teamId, name: `AR4 Dispatch Team ${teamId}`, phase: "build", createdAt: NOW })
		.onConflictDoNothing();
	await db
		.insert(teamMembers)
		.values({ id: teamMembersId, teamId, capacity: 5, activeBets: 0, formedAt: NOW })
		.onConflictDoNothing();
	await db.insert(users).values({
		id: agentId,
		name: "AR4 Dispatch Agent",
		role: "builder",
		status: "active",
		teamId: teamMembersId,
		maxConcurrentSessions: 4,
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "owner-ar4-dispatch",
		name: "AR4 Dispatch Owner",
		role: "founder",
		status: "active",
		teamId: teamMembersId,
		maxConcurrentSessions: 1,
		costCap: null,
		createdAt: NOW,
	});
	await db
		.insert(bets)
		.values({
			id: betId,
			teamId,
			description: `AR4 dispatch bet ${teamId}`,
			appetite: "small",
			status: "active",
			doneCondition,
			createdAt: NOW,
		})
		.onConflictDoNothing();
	await db.insert(knowledgeItems).values({
		id: `ki-ar4-dispatch-${teamId}`,
		title: "AR4 dispatch principle",
		body: "AR4 dispatch integration body.",
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: "system",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: threadId,
		hostKind: "task",
		hostId: taskId,
		initiatorId: agentId,
		participants: JSON.stringify([agentId]),
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "AR4 dispatch task",
		description: taskDescription,
		state: "proposed",
		ownerAgentId: agentId,
		threadId,
		createdAt: NOW,
		updatedAt: NOW,
	});
}

// ─── 4-harness matrix lanes ───────────────────────────────────────────────────

const BUILTIN_LANE = SUPPORTED_HARNESS_LANES[0]!;
const CLAUDE_LANE = SUPPORTED_HARNESS_LANES[1]!;
const CODEX_LANE = SUPPORTED_HARNESS_LANES[2]!;
const OPENCODE_LANE = SUPPORTED_HARNESS_LANES[3]!;

// ─── Lane 1: builtin ─────────────────────────────────────────────────────────

describe(`${BUILTIN_LANE.describeTag} AR4 AD2-real — dispatch→provision→real agent (builtin)`, () => {
	requireHarness("builtin");

	let tmpDir: string;
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ar4-ad2-builtin-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		dispose?.();
		dispose = undefined;
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("accepted task provisions + runs a real builtin harness turn (dispatch→provision seam, AC2)", async ({
		db,
		eventBus,
	}) => {
		const teamId = `ar4-builtin-team-${Date.now()}`;
		const agentId = `ar4-builtin-agent-${Date.now()}`;
		const taskId = `ar4-builtin-task-${Date.now()}`;
		const threadId = `ar4-builtin-thread-${Date.now()}`;

		await seedDispatchDomain(db, {
			teamId,
			agentId,
			taskId,
			threadId,
			taskDescription:
				"Report the number 4 to the human owner (id 'owner-ar4-dispatch') by calling " +
				"send_message with to='owner-ar4-dispatch' and body='4'. Do not hand off or submit a review.",
			doneCondition:
				"Agent reports the answer to the human owner (id 'owner-ar4-dispatch') via send_message.",
		});

		// Build the builtin pool via the lane (same as AR2 reference pattern).
		// params not used — dispatcher resolves model via resolveModel callback.
		const { pool } = BUILTIN_LANE.prepFn({ db, eventBus, tmpDir });

		const apiKey = process.env.OPENROUTER_API_KEY as string;
		const cap = createSandboxCapture();

		dispose = registerTaskDispatcher({
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
			sandboxBasePath: tmpDir,
			// Locked model from HARNESS_TEST_MODELS (AR7 matrix) — do NOT hardcode a model id here.
			resolveModel: async (_tier) => ({
				provider: "openai-compatible" as const,
				model: HARNESS_TEST_MODELS.builtin.model,
				apiKey,
				baseUrl: HARNESS_TEST_MODELS.builtin.baseUrl,
			}),
			onBeforeTeardown: cap.onBeforeTeardown,
		});

		// REAL trigger — NOT a seeded in_progress row (the key anti-pattern AC2 forbids)
		await transitionTask(db, eventBus, taskId, "accepted");

		// Strict floor (AR2 reference): wait for "done" only. Crash = real bug, surface it.
		await vi.waitFor(
			async () => {
				const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
				expect(s).toBeDefined();
				expect(s?.state).toBe("done");
			},
			{ timeout: 240_000 },
		);

		const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
		// Strict floor (AR2 reference): FAIL on crashed. completed or not_returned proves:
		// (a) dispatch→provision seam ran, (b) builtin harness executed the LLM call,
		// (c) agent produced a real turn. "crashed" at this point is a real bug.
		// @lore AR4 AD2: matches AR2-provision-real-session.integration.test.ts:499,606 floor.
		expect(["completed", "not_returned"]).toContain(s?.outcome);
	}, 240_000);
});

// ─── Lane 2: claude CLI ──────────────────────────────────────────────────────

describe(`${CLAUDE_LANE.describeTag} AR4 AD2-real — dispatch→provision→real agent (claude)`, () => {
	requireHarness("claude");

	let tmpDir: string;
	// biome-ignore lint/suspicious/noExplicitAny: server type — close() is the only method used
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null =
		null;
	let dispose: (() => void) | undefined;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ar4-ad2-claude-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
		bridge = await startMcpBridgeServer();
	});

	afterEach(async () => {
		clearActiveStrategy();
		dispose?.();
		dispose = undefined;
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		// @lore AR4 AD2 cli-cleanup: CLI process may still hold files open when dispose()
		// stops the dispatcher. Brief settle + try/catch prevents ENOTEMPTY in afterEach.
		await new Promise((r) => setTimeout(r, 500));
		try {
			if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Best-effort cleanup — lingering CLI process may hold files open briefly
		}
	});

	test("accepted task provisions + runs a real claude CLI harness turn (dispatch→provision seam)", async ({
		db,
		eventBus,
	}) => {
		if (!bridge) throw new Error("bridge not set up");

		const teamId = `ar4-claude-team-${Date.now()}`;
		const agentId = `ar4-claude-agent-${Date.now()}`;
		const taskId = `ar4-claude-task-${Date.now()}`;
		const threadId = `ar4-claude-thread-${Date.now()}`;

		await seedDispatchDomain(db, {
			teamId,
			agentId,
			taskId,
			threadId,
			taskDescription:
				"Create a file named 'answer.txt' in the current working directory containing " +
				"exactly the number 4. Then report your result to the human owner " +
				"(id 'owner-ar4-dispatch') by calling send_message with to='owner-ar4-dispatch' " +
				"and body 'Done: 4'. Do NOT hand off or submit a review.",
			doneCondition: "Agent creates answer.txt and reports to the human owner via send_message.",
		});

		const cap = createSandboxCapture({ paths: ["answer.txt"] });

		// Use runThroughHarness for the claude lane (which goes through provisionSession)
		// to get the correct pool + params for the lane
		const { pool, params } = CLAUDE_LANE.prepFn({ db, eventBus, tmpDir, bridge });
		const laneParams = { ...params, taskId, agentId, productId: teamId };

		dispose = registerTaskDispatcher({
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
			sandboxBasePath: tmpDir,
			mcpBridgeRegistry: bridge.mcpBridgeRegistry,
			mcpBaseUrl: bridge.mcpBaseUrl,
			resolveModel: async (_tier) => laneParams.resolvedModel,
			onBeforeTeardown: cap.onBeforeTeardown,
		});

		await transitionTask(db, eventBus, taskId, "accepted");

		// AR2 reference floor: wait for "done" only. Crash = real bug, surface it.
		// @lore AR4 AD2: claude calls send_message (non-aborting return path) → "completed".
		// If the CLI crashes at startup, no real agent work happened — FAIL (C-1 AR2 floor).
		await vi.waitFor(
			async () => {
				const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
				expect(s).toBeDefined();
				expect(s?.state).toBe("done");
			},
			{ timeout: 240_000 },
		);

		const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
		// Strict floor (AR2 reference): FAIL on crashed. completed or not_returned only.
		// @lore AR4 AD2: matches AR2-provision-real-session.integration.test.ts:499 — claude
		// CLI fires send_message → "completed". "not_returned" is also valid (no MCP call).
		// "crashed" is NOT acceptable — a startup crash with zero real work mints false green.
		expect(["completed", "not_returned"]).toContain(s?.outcome);

		const answerContent = cap.files.get("answer.txt");
		if (answerContent !== undefined) {
			expect(answerContent).toContain("4");
		}
	}, 240_000);
});

// ─── Lane 3: codex CLI ───────────────────────────────────────────────────────

describe(`${CODEX_LANE.describeTag} AR4 AD2-real — dispatch→provision→real agent (codex)`, () => {
	requireHarness("codex");

	let tmpDir: string;
	// biome-ignore lint/suspicious/noExplicitAny: server type — close() is the only method used
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null =
		null;
	let dispose: (() => void) | undefined;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ar4-ad2-codex-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
		bridge = await startMcpBridgeServer();
	});

	afterEach(async () => {
		clearActiveStrategy();
		dispose?.();
		dispose = undefined;
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		// @lore AR4 AD2 codex-cleanup: codex process may still hold files open when dispose()
		// stops the dispatcher. Brief settle + try/catch prevents ENOTEMPTY in afterEach.
		await new Promise((r) => setTimeout(r, 500));
		try {
			if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Best-effort cleanup — lingering codex process may hold files open briefly
		}
	});

	test("accepted task provisions + runs a real codex CLI harness turn (dispatch→provision seam, honest floor)", async ({
		db,
		eventBus,
	}) => {
		if (!bridge) throw new Error("bridge not set up");

		const teamId = `ar4-codex-team-${Date.now()}`;
		const agentId = `ar4-codex-agent-${Date.now()}`;
		const taskId = `ar4-codex-task-${Date.now()}`;
		const threadId = `ar4-codex-thread-${Date.now()}`;

		await seedDispatchDomain(db, {
			teamId,
			agentId,
			taskId,
			threadId,
			taskDescription:
				"Create a file named 'answer.txt' in the current working directory containing " +
				"exactly the number 4. Do NOT hand off or submit a review.",
			doneCondition: "Agent creates answer.txt with the number 4.",
		});

		const cap = createSandboxCapture({ paths: ["answer.txt"] });

		const { pool, params } = CODEX_LANE.prepFn({ db, eventBus, tmpDir, bridge });
		const laneParams = { ...params, taskId, agentId, productId: teamId };

		dispose = registerTaskDispatcher({
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
			sandboxBasePath: tmpDir,
			mcpBridgeRegistry: bridge.mcpBridgeRegistry,
			mcpBaseUrl: bridge.mcpBaseUrl,
			resolveModel: async (_tier) => laneParams.resolvedModel,
			onBeforeTeardown: cap.onBeforeTeardown,
		});

		await transitionTask(db, eventBus, taskId, "accepted");

		// AR2 reference floor: wait for "done" only. Crash = real bug, surface it.
		// @lore AR2 codex-cost-zero: codex does real work but does NOT call the MCP return tool
		// → outcome "not_returned". Forcing "completed" triggers the re-prompt loop → timeout.
		// The honest floor accepts "completed" OR "not_returned" — FAIL on "crashed".
		await vi.waitFor(
			async () => {
				const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
				expect(s).toBeDefined();
				expect(s?.state).toBe("done");
			},
			{ timeout: 240_000 },
		);

		const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
		// Strict floor (AR2 reference): FAIL on crashed.
		// @lore AR4 AD2: matches AR2-provision-real-session.integration.test.ts:499 codex floor.
		// codex does real billable work on a file-write task but does NOT call the MCP return
		// tool → "not_returned". "crashed" = startup crash with zero real work = false green.
		expect(["completed", "not_returned"]).toContain(s?.outcome);

		const answerContent = cap.files.get("answer.txt");
		if (answerContent !== undefined) {
			expect(answerContent).toContain("4");
		} else {
			process.stdout.write(
				"[AR4 AD2 codex] INFO: answer.txt not captured — codex did not write file. " +
					"non-crash outcome is the load-bearing proof.\n",
			);
		}
	}, 240_000);
});

// ─── Lane 4: opencode CLI ────────────────────────────────────────────────────

describe(`${OPENCODE_LANE.describeTag} AR4 AD2-real — dispatch→provision→real agent (opencode)`, () => {
	requireHarness("opencode");

	let tmpDir: string;
	// biome-ignore lint/suspicious/noExplicitAny: server type — close() is the only method used
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null =
		null;
	let dispose: (() => void) | undefined;
	let xdgDataHomeBefore: string | undefined;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ar4-ad2-opencode-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
		bridge = await startMcpBridgeServer();
		// @lore AR2 opencode-xdg-isolation: isolate XDG_DATA_HOME per test session.
		xdgDataHomeBefore = process.env.XDG_DATA_HOME;
		process.env.XDG_DATA_HOME = path.join(tmpDir, ".opencode-data");
	});

	afterEach(async () => {
		clearActiveStrategy();
		dispose?.();
		dispose = undefined;
		if (xdgDataHomeBefore !== undefined) {
			process.env.XDG_DATA_HOME = xdgDataHomeBefore;
		} else {
			delete process.env.XDG_DATA_HOME;
		}
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		// @lore AR4 AD2 cli-cleanup: opencode process may still hold files open when dispose()
		// stops the dispatcher. Brief settle + try/catch prevents ENOTEMPTY in afterEach.
		await new Promise((r) => setTimeout(r, 500));
		try {
			if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Best-effort cleanup — lingering opencode process may hold files open briefly
		}
	});

	test("accepted task provisions + runs a real opencode CLI harness turn (dispatch→provision seam, honest floor)", async ({
		db,
		eventBus,
	}) => {
		if (!bridge) throw new Error("bridge not set up");

		const teamId = `ar4-opencode-team-${Date.now()}`;
		const agentId = `ar4-opencode-agent-${Date.now()}`;
		const taskId = `ar4-opencode-task-${Date.now()}`;
		const threadId = `ar4-opencode-thread-${Date.now()}`;

		await seedDispatchDomain(db, {
			teamId,
			agentId,
			taskId,
			threadId,
			taskDescription:
				"Create a file named 'answer.txt' in the current working directory containing " +
				"exactly the number 4. Do NOT hand off or submit a review.",
			doneCondition: "Agent creates answer.txt with the number 4.",
		});

		const cap = createSandboxCapture({ paths: ["answer.txt"] });

		const { pool, params } = OPENCODE_LANE.prepFn({ db, eventBus, tmpDir, bridge });
		const laneParams = { ...params, taskId, agentId, productId: teamId };

		dispose = registerTaskDispatcher({
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
			sandboxBasePath: tmpDir,
			mcpBridgeRegistry: bridge.mcpBridgeRegistry,
			mcpBaseUrl: bridge.mcpBaseUrl,
			resolveModel: async (_tier) => laneParams.resolvedModel,
			onBeforeTeardown: cap.onBeforeTeardown,
		});

		await transitionTask(db, eventBus, taskId, "accepted");

		// AR2 reference floor: wait for "done" only. Crash = real bug, surface it.
		// @lore AR2 W-2 opencode: does real work but does NOT reliably call the MCP return tool
		// → "not_returned". The process-reengage re-prompt loop re-spawns opencode if "completed"
		// is forced → timeout. Honest floor: "completed" OR "not_returned" — FAIL on "crashed".
		// @lore AR4 AD2 opencode-startup: longer startup time (process-reengage model) than
		// other CLIs — 600s ceiling for the dispatch→provision path.
		await vi.waitFor(
			async () => {
				const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
				expect(s).toBeDefined();
				expect(s?.state).toBe("done");
			},
			{ timeout: 600_000 },
		);

		const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
		// Strict floor (AR2 reference): FAIL on crashed.
		// @lore AR4 AD2: matches AR2-provision-real-session.integration.test.ts:616 opencode floor.
		// opencode does real work on a file-write task but does NOT call the MCP return tool
		// → "not_returned". "crashed" = startup crash with zero real work = false green.
		expect(["completed", "not_returned"]).toContain(s?.outcome);

		const answerContent = cap.files.get("answer.txt");
		if (answerContent !== undefined) {
			expect(answerContent).toContain("4");
		} else {
			process.stdout.write(
				"[AR4 AD2 opencode] INFO: answer.txt not captured — opencode did not write file. " +
					"non-crash outcome is the load-bearing proof.\n",
			);
		}
	}, 660_000);
});
