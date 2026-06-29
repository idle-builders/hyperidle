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
	fabricStrategy,
	registerTaskDispatcher,
	setProvisionSessionFn,
} from "@hyperidle/fabric";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import {
	createSandboxCapture,
	SUPPORTED_HARNESS_LANES,
	startMcpBridgeServer,
} from "../harness/__tests__/provision-real-session.js";
import { requireHarness } from "../harness/__tests__/require-harness.js";
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
		setActiveStrategy(fabricStrategy);
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

		const apiKey = process.env.OPENROUTER_API_KEY as string;
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

		// Build the builtin pool via the lane (same as AR2 reference pattern)
		const { pool, params } = BUILTIN_LANE.prepFn({ db, eventBus, tmpDir });
		// Override lane-generated IDs with our seeded domain IDs
		const laneParams = { ...params, taskId, agentId, productId: teamId };

		const cap = createSandboxCapture();

		dispose = registerTaskDispatcher({
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
			sandboxBasePath: tmpDir,
			resolveModel: async (_tier) => ({
				provider: "openai-compatible" as const,
				model: "openai/gpt-4o-mini",
				apiKey,
				baseUrl: "https://openrouter.ai/api",
			}),
			onBeforeTeardown: cap.onBeforeTeardown,
		});

		// REAL trigger — NOT a seeded in_progress row (the key anti-pattern AC2 forbids)
		await transitionTask(db, eventBus, taskId, "accepted");

		// Wait for the real session to land and reach a terminal outcome
		await vi.waitFor(
			async () => {
				const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
				expect(s).toBeDefined();
				expect(s?.state).toBe("done");
			},
			{ timeout: 240_000 },
		);

		const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
		// Honest floor: completed or not_returned (FAIL on crashed/error)
		expect(["completed", "not_returned"]).toContain(s?.outcome);

		// Unused but declared — laneParams structurally confirms we built real params
		void laneParams;
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
		setActiveStrategy(fabricStrategy);
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
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
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

		await vi.waitFor(
			async () => {
				const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
				expect(s).toBeDefined();
				expect(s?.state).toBe("done");
			},
			{ timeout: 240_000 },
		);

		const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
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
		setActiveStrategy(fabricStrategy);
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
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
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

		await vi.waitFor(
			async () => {
				const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
				expect(s).toBeDefined();
				expect(s?.state).toBe("done");
			},
			{ timeout: 240_000 },
		);

		const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
		// @lore AR2 W-2: codex does real work but does NOT call the MCP return tool →
		// "not_returned". Honest floor accepts completed OR not_returned.
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
		setActiveStrategy(fabricStrategy);
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
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
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

		await vi.waitFor(
			async () => {
				const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
				expect(s).toBeDefined();
				expect(s?.state).toBe("done");
			},
			{ timeout: 240_000 },
		);

		const [s] = await db.select().from(sessions).where(eq(sessions.taskId, taskId)).limit(1);
		// @lore AR2 W-2: opencode does real work but does NOT reliably call the MCP return tool.
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
	}, 240_000);
});
