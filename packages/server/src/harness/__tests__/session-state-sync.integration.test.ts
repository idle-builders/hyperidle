/**
 * @harness-matrix: covers all SUPPORTED_HARNESSES via SUPPORTED_HARNESS_LANES loop
 *
 * Session state-sync contract — harness matrix + service integration.
 *
 * Two sets of tests live here:
 *
 * A) UNTAGGED SERVICE TESTS (no real harness — DB + lifecycle service only)
 *    Pure CAS and PATCH-conflict invariants. These need no agent binary.
 *    - `crashSession` then `endSession` on the same row emits `session_ended` once.
 *    - `endSession` on an already-terminal row is a no-op (zero emits).
 *    - `PATCH state=crashed` on an already-terminal row → 409, no second emit.
 *
 * B) HARNESS MATRIX TESTS (four lanes — real provisionSession, real sessionRunRegistry)
 *    Proves that a real session's live-registry entry and DB state stay in sync
 *    across its lifecycle — specifically the PATCH-abort path. Runs once per
 *    supported harness (builtin / claude / codex / opencode). Equal per-lane count,
 *    `requireHarness` hard-fails on missing binary (never skipIf to green).
 *
 * @lore session-state-sync: The load-bearing invariant is the CAS terminal write:
 *   `endSession`/`crashSession` UPDATE `WHERE state='active'`, and `session_ended`
 *   fires IFF the CAS affected rowCount > 0. This prevents zombie sessions and
 *   double-emit on duplicate teardown. The PATCH route rejects moves on already-
 *   terminal rows (409) and issues an abort-in-flight ack (202) for live sessions.
 *
 * @lore session-state-sync harness-matrix: The matrix test provisions a real session
 *   through the production route (POST /api/sessions → 202 + active row), issues a
 *   PATCH-abort while the session is in the live `sessionRunRegistry`, then waits for
 *   the DB row to reach a terminal state. Both outcomes are valid race results:
 *   - 202 aborting  → session was still in the registry when we PATCH'd.
 *   - 409 conflict  → session already reached terminal state before the PATCH.
 *   Either way, the row must be terminal and `session_ended` must have fired once.
 *
 * @lore session-state-sync builtin-gateway: The builtin lane seeds its own
 *   serverConfig + serverCredential rows (OpenRouter key + model config) and builds
 *   a self-contained Hono app via `createTestApp`. CLI lanes re-use the same
 *   pattern but register a CliHarnessAdapter instead, and require the MCP bridge
 *   server because their adapter configs unconditionally pass `--mcp-config .mcp.json`.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	bets,
	type HyperIdleDb,
	serverConfig,
	serverCredentials,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { clearDeduplicationCache } from "@hyperidle/fabric";
import type { DomainEvent } from "@hyperidle/shared";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { encryptCredentialValue } from "../../services/credential-encryption.js";
import { DbCredentialResolver } from "../../services/credential-resolver.js";
import { crashSession, endSession, type SessionContext } from "../../services/session-lifecycle.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";
import { createTestApp } from "../../test-utils.js";
import { AdapterPool } from "../adapter-pool.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import {
	lockedHarnessAdapter,
	SUPPORTED_HARNESS_LANES,
	startMcpBridgeServer,
} from "./provision-real-session.js";
import { harnessTestResolvedModel, requireHarness } from "./require-harness.js";

// ─── Shared constants ────────────────────────────────────────────────────────

const SERVICE_API_KEY = "test-key-state-sync-service";
const MATRIX_API_KEY = "test-key-state-sync-matrix";
const NOW = "2026-06-11T00:00:00.000Z";

function authHeaders(apiKey: string): Record<string, string> {
	return { "X-API-Key": apiKey, "Content-Type": "application/json" };
}

// ─── Helpers for service-integration tests ────────────────────────────────────

/** Minimal SessionContext for endSession/crashSession (ingestion is a no-op). */
function makeContext(sessionId: string, agentId: string, taskId: string): SessionContext {
	return {
		sessionId,
		agentId,
		taskId,
		sandboxPath: "/tmp/state-sync-nonexistent",
		ingestion: { dispose: () => {} } as SessionContext["ingestion"],
		traceId: "trace-state-sync",
	};
}

async function seedTaskGraph(
	db: HyperIdleDb,
	opts: { teamId: string; teamMemberId: string; agentId: string; betId: string; taskId: string },
): Promise<void> {
	await db
		.insert(teams)
		.values({ id: opts.teamId, name: "State Sync Team", phase: "build", createdAt: NOW })
		.onConflictDoNothing();
	await db
		.insert(teamMembers)
		.values({
			id: opts.teamMemberId,
			teamId: opts.teamId,
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		})
		.onConflictDoNothing();
	await db
		.insert(users)
		.values({
			id: opts.agentId,
			name: "State Sync Agent",
			role: "builder",
			status: "active",
			teamId: opts.teamMemberId,
			createdAt: NOW,
		})
		.onConflictDoNothing();
	await db
		.insert(bets)
		.values({
			id: opts.betId,
			teamId: opts.teamId,
			description: "State sync bet",
			status: "active",
			createdAt: NOW,
		})
		.onConflictDoNothing();
	await db
		.insert(tasks)
		.values({
			id: opts.taskId,
			betId: opts.betId,
			teamId: opts.teamId,
			title: "State sync task",
			state: "in_progress",
			createdAt: NOW,
			updatedAt: NOW,
		})
		.onConflictDoNothing();
}

// ─── A) UNTAGGED SERVICE TESTS ────────────────────────────────────────────────
// These exercise real DB + lifecycle functions only — no agent binary needed.

describe("CAS terminal write — duplicate teardown emits session_ended exactly once", () => {
	test("crashSession then endSession on the same session row fires session_ended exactly once and preserves crashed state", async ({
		db,
		eventBus,
	}) => {
		await seedTaskGraph(db, {
			teamId: "ss-cas-team",
			teamMemberId: "ss-cas-tm",
			agentId: "ss-cas-agent",
			betId: "ss-cas-bet",
			taskId: "ss-cas-task",
		});
		const sessionId = "ss-cas-session-active";
		await db.insert(sessions).values({
			id: sessionId,
			taskId: "ss-cas-task",
			agentId: "ss-cas-agent",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "active",
		});

		const ended: DomainEvent[] = [];
		eventBus.on("session_ended", (e) => ended.push(e));

		const ctx = makeContext(sessionId, "ss-cas-agent", "ss-cas-task");

		// First teardown — CAS UPDATE WHERE state='active' succeeds → emits once.
		await crashSession(db, eventBus, ctx, 0, 0);
		// Second teardown (duplicate / detached-tail) — row already terminal,
		// CAS UPDATE affects zero rows → must NOT emit a second session_ended.
		await endSession(db, eventBus, ctx, 0, 0);

		expect(ended).toHaveLength(1);

		const [row] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
		// First write wins; second is a no-op.
		expect(row?.state).toBe("crashed");
		expect(row?.outcome).toBe("crashed");
	});

	test("endSession on an already-terminal done row affects zero rows and emits zero session_ended events", async ({
		db,
		eventBus,
	}) => {
		await seedTaskGraph(db, {
			teamId: "ss-noop-team",
			teamMemberId: "ss-noop-tm",
			agentId: "ss-noop-agent",
			betId: "ss-noop-bet",
			taskId: "ss-noop-task",
		});
		const sessionId = "ss-noop-session-done";
		await db.insert(sessions).values({
			id: sessionId,
			taskId: "ss-noop-task",
			agentId: "ss-noop-agent",
			modelTier: "workhorse",
			startedAt: NOW,
			state: "done",
			outcome: "completed",
			endedAt: NOW,
		});

		const ended: DomainEvent[] = [];
		eventBus.on("session_ended", (e) => ended.push(e));

		const ctx = makeContext(sessionId, "ss-noop-agent", "ss-noop-task");

		// Row is already `done` — CAS UPDATE returns rowCount=0 → no emit.
		await endSession(db, eventBus, ctx, 0, 0);

		expect(ended).toHaveLength(0);
	});
});

describe("PATCH /api/sessions/:id rejects moves on already-terminal sessions", () => {
	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", SERVICE_API_KEY);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	test("PATCH state=crashed on a done session returns 409 and no second session_ended", async ({
		db,
		app,
		eventBus,
	}) => {
		await seedTaskGraph(db, {
			teamId: "ss-patch-team",
			teamMemberId: "ss-patch-tm",
			agentId: "ss-patch-agent",
			betId: "ss-patch-bet",
			taskId: "ss-patch-task",
		});
		await db.insert(sessions).values({
			id: "ss-terminal-session",
			taskId: "ss-patch-task",
			agentId: "ss-patch-agent",
			modelTier: "workhorse",
			startedAt: NOW,
			endedAt: NOW,
			state: "done",
			outcome: "completed",
		});

		const ended: DomainEvent[] = [];
		eventBus.on("session_ended", (e) => ended.push(e));

		const res = await app.request("/api/sessions/ss-terminal-session", {
			method: "PATCH",
			headers: authHeaders(SERVICE_API_KEY),
			body: JSON.stringify({ state: "crashed" }),
		});

		// Already-terminal → reject (409), no second emit, DB state unchanged.
		expect(res.status).toBe(409);
		expect(ended).toHaveLength(0);

		const [row] = await db.select().from(sessions).where(eq(sessions.id, "ss-terminal-session"));
		expect(row?.state).toBe("done");
	});
});

// ─── Helpers for matrix tests ────────────────────────────────────────────────

/**
 * Seed the minimal domain rows required by POST /api/sessions via the full
 * provisionSession path. The task description instructs the agent to run briefly;
 * the PATCH-abort will fire while or after the session is active.
 */
async function seedMatrixDomain(
	db: HyperIdleDb,
	opts: { agentId: string; taskId: string; threadId: string; harnessType: string },
): Promise<void> {
	const now = new Date().toISOString();
	await db
		.insert(teams)
		.values({ id: "ss-matrix-team", name: "State Sync Matrix", phase: "build", createdAt: now })
		.onConflictDoNothing();
	await db
		.insert(teamMembers)
		.values({
			id: "ss-matrix-tm",
			teamId: "ss-matrix-team",
			capacity: 5,
			activeBets: 0,
			formedAt: now,
		})
		.onConflictDoNothing();
	await db.insert(users).values({
		id: opts.agentId,
		kind: "ai",
		name: "State Sync Matrix Agent",
		role: "builder",
		status: "active",
		teamId: "ss-matrix-tm",
		maxConcurrentSessions: 4,
		harnessType: opts.harnessType,
		createdAt: now,
	});
	await db
		.insert(bets)
		.values({
			id: "ss-matrix-bet",
			teamId: "ss-matrix-team",
			description: "State sync matrix bet",
			status: "active",
			createdAt: now,
		})
		.onConflictDoNothing();
	await db.insert(threads).values({
		id: opts.threadId,
		hostKind: "task",
		hostId: opts.taskId,
		initiatorId: opts.agentId,
		participants: JSON.stringify([opts.agentId]),
		lastActiveAt: now,
		createdAt: now,
	});
	await db.insert(tasks).values({
		id: opts.taskId,
		betId: "ss-matrix-bet",
		teamId: "ss-matrix-team",
		title: "State sync matrix task",
		// Short task so the abort fires while the session is either still active
		// or has just completed — both are valid race outcomes for the PATCH test.
		description: "Count from 1 to 3. Then call send_message with to='owner-1' and body='3'.",
		doneCondition: "Agent reports a number via send_message.",
		state: "accepted",
		ownerAgentId: opts.agentId,
		threadId: opts.threadId,
		createdAt: now,
		updatedAt: now,
	});
}

async function seedOpenRouterGatewayConfig(db: HyperIdleDb, serverSecret: string): Promise<void> {
	const apiKey = process.env.OPENROUTER_API_KEY as string;
	const configJson = JSON.stringify({
		modelGateway: {
			reasoning: {
				provider: "openai-compatible",
				model: harnessTestResolvedModel("builtin").model,
				baseUrl: "https://openrouter.ai/api",
			},
			workhorse: {
				provider: "openai-compatible",
				model: harnessTestResolvedModel("builtin").model,
				baseUrl: "https://openrouter.ai/api",
			},
			fast: {
				provider: "openai-compatible",
				model: harnessTestResolvedModel("builtin").model,
				baseUrl: "https://openrouter.ai/api",
			},
		},
	});
	const now = new Date().toISOString();
	await db
		.insert(serverConfig)
		.values({ id: "default", config: configJson, updatedAt: now })
		.onConflictDoUpdate({
			target: serverConfig.id,
			set: { config: configJson, updatedAt: now },
		});
	const encryptedValue = encryptCredentialValue(apiKey, serverSecret);
	await db
		.insert(serverCredentials)
		.values({ name: "openai_compatible_api_key", encryptedValue, updatedAt: now })
		.onConflictDoNothing();
}

/**
 * Seed the gateway config for the claude lane: anthropic provider + a dummy
 * anthropic_api_key credential. The claude CLI uses keychain auth and ignores
 * resolvedModel.apiKey, so a dummy value satisfies the route pre-flight without
 * affecting the actual CLI call. The route resolves model:"sonnet" which maps
 * to --model sonnet in the CLI args (correct per founder-set 2026-06-30).
 *
 * @lore AR3 claude-gateway-seed: Sessions-routes.ts performs a credential
 * pre-flight (resolveAgentModel) before calling provisionSession. Without seeding
 * an anthropic_api_key credential, the pre-flight throws MissingCredentialError
 * → 500. The cli-harness-adapter extracts {{apiKey}} from resolvedModel.apiKey
 * but claude ignores it (uses keychain). A dummy key is harmless.
 */
async function seedAnthropicGatewayConfig(db: HyperIdleDb, serverSecret: string): Promise<void> {
	const configJson = JSON.stringify({
		modelGateway: {
			// AR7-locked: haiku is the tiny-model baseline for the claude lane.
			reasoning: { provider: "anthropic", model: harnessTestResolvedModel("claude").model },
			workhorse: { provider: "anthropic", model: harnessTestResolvedModel("claude").model },
			fast: { provider: "anthropic", model: harnessTestResolvedModel("claude").model },
		},
	});
	const now = new Date().toISOString();
	await db
		.insert(serverConfig)
		.values({ id: "default", config: configJson, updatedAt: now })
		.onConflictDoUpdate({
			target: serverConfig.id,
			set: { config: configJson, updatedAt: now },
		});
	// Dummy key: the claude CLI uses keychain auth and ignores this value.
	// The credential must exist so DbCredentialResolver.resolve("anthropic_api_key")
	// returns non-null and the pre-flight passes.
	const encryptedValue = encryptCredentialValue("keychain-auth-unused", serverSecret);
	await db
		.insert(serverCredentials)
		.values({ name: "anthropic_api_key", encryptedValue, updatedAt: now })
		.onConflictDoNothing();
}

// ─── B) HARNESS MATRIX TESTS ─────────────────────────────────────────────────
//
// Four explicit describe blocks — literal requireHarness("<name>") per lane so
// the honest-harness-guard AR7 coverage check sees all four harnesses.
// Shared test body factored into runStateSyncLane() to avoid duplication.
// Lane is looked up from SUPPORTED_HARNESS_LANES via laneFor().

/** Look up a lane from SUPPORTED_HARNESS_LANES by harness name. */
function laneFor(name: string): import("./provision-real-session.js").HarnessLane {
	const found = SUPPORTED_HARNESS_LANES.find((l) => l.harnessName === name);
	if (!found) throw new Error(`laneFor: no lane for "${name}" in SUPPORTED_HARNESS_LANES`);
	return found;
}

async function runStateSyncLane(
	lane: import("./provision-real-session.js").HarnessLane,
	db: Parameters<typeof createTestApp>[0]["db"],
	eventBus: Parameters<typeof createTestApp>[0]["eventBus"],
	tmpDir: string,
	// biome-ignore lint/suspicious/noExplicitAny: server handle — only close() used
	bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null,
): Promise<void> {
	const agentId = `ss-${lane.harnessName}-agent-${Date.now()}`;
	const taskId = `ss-${lane.harnessName}-task-${Date.now()}`;
	const threadId = `ss-${lane.harnessName}-thread-${Date.now()}`;

	// Canonical harnessType: "claude" lane → adapter type "claude-code".
	// @lore AR3 harnessType-canonical: "claude" is the binary name; "claude-code" is the pool type.
	const canonicalHarnessType = lane.harnessName === "claude" ? "claude-code" : lane.harnessName;

	await seedMatrixDomain(db, { agentId, taskId, threadId, harnessType: canonicalHarnessType });

	if (lane.harnessName === "claude") {
		await seedAnthropicGatewayConfig(db, MATRIX_API_KEY);
	} else {
		await seedOpenRouterGatewayConfig(db, MATRIX_API_KEY);
	}

	// Build the adapter pool for this lane.
	// @lore AR7-seam: builtin adapter via lockedHarnessAdapter (import-ban).
	const { pool } =
		lane.harnessName === "builtin"
			? (() => {
					const p = new AdapterPool();
					p.register("builtin-local", lockedHarnessAdapter("builtin").adapter, {
						name: "builtin-local", kind: "local", type: "builtin",
						modelProviders: ["anthropic", "openrouter", "openai-compatible"], maxConcurrent: 4,
					});
					return { pool: p };
				})()
			: lane.prepFn({ db, eventBus, tmpDir, bridge: bridge! });

	const credentialResolver = new DbCredentialResolver(db, MATRIX_API_KEY);
	const app = await createTestApp({
		db, eventBus,
		adapterPool: pool,
		workspaceAdapter: new LocalSandboxAdapter(),
		sandboxBasePath: tmpDir,
		credentialResolver,
	});

	const endedEvents: DomainEvent[] = [];
	eventBus.on("session_ended", (e) => endedEvents.push(e));

	const postRes = await app.request("/api/sessions", {
		method: "POST",
		headers: authHeaders(MATRIX_API_KEY),
		body: JSON.stringify({ agentId, taskId, modelTier: "workhorse" }),
	});
	expect(postRes.status).toBe(202);
	const postBody = (await postRes.json()) as Record<string, unknown>;
	const sessionId = postBody.id as string;
	expect(postBody.state).toBe("active");
	expect(typeof sessionId).toBe("string");

	const patchRes = await app.request(`/api/sessions/${sessionId}`, {
		method: "PATCH",
		headers: authHeaders(MATRIX_API_KEY),
		body: JSON.stringify({ state: "done" }),
	});
	expect([202, 409]).toContain(patchRes.status);

	await vi.waitFor(
		async () => {
			const [row] = await db.select({ state: sessions.state }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
			expect(["done", "crashed"]).toContain(row?.state);
		},
		{ timeout: 120_000 },
	);

	expect(endedEvents).toHaveLength(1);
}

describe("[harness:builtin] session state stays in sync through its lifecycle", () => {
	requireHarness("builtin");
	let tmpDir: string;
	// biome-ignore lint/suspicious/noExplicitAny: server handle — only close() used
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null = null;
	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-matrix-builtin-"));
		clearDeduplicationCache(); setActiveStrategy(minimalStrategy); vi.stubEnv("HYPERIDLE_API_KEY", MATRIX_API_KEY);
	});
	afterEach(async () => {
		clearActiveStrategy(); vi.unstubAllEnvs();
		if (bridge) { await bridge.close(); bridge = null; }
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
	});
	test("PATCH-abort on a live real session acknowledges in-flight or conflicts with completed; session reaches terminal state; session_ended emitted exactly once", async ({ db, eventBus }) => {
		await runStateSyncLane(laneFor("builtin"), db, eventBus, tmpDir, bridge);
	}, 150_000);
});

describe("[harness:claude] session state stays in sync through its lifecycle", () => {
	requireHarness("claude");
	let tmpDir: string;
	// biome-ignore lint/suspicious/noExplicitAny: server handle — only close() used
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null = null;
	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-matrix-claude-"));
		clearDeduplicationCache(); setActiveStrategy(minimalStrategy); vi.stubEnv("HYPERIDLE_API_KEY", MATRIX_API_KEY);
		bridge = await startMcpBridgeServer();
	});
	afterEach(async () => {
		clearActiveStrategy(); vi.unstubAllEnvs();
		if (bridge) { await bridge.close(); bridge = null; }
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
	});
	test("PATCH-abort on a live real session acknowledges in-flight or conflicts with completed; session reaches terminal state; session_ended emitted exactly once", async ({ db, eventBus }) => {
		await runStateSyncLane(laneFor("claude"), db, eventBus, tmpDir, bridge);
	}, 150_000);
});

describe("[harness:codex] session state stays in sync through its lifecycle", () => {
	requireHarness("codex");
	let tmpDir: string;
	// biome-ignore lint/suspicious/noExplicitAny: server handle — only close() used
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null = null;
	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-matrix-codex-"));
		clearDeduplicationCache(); setActiveStrategy(minimalStrategy); vi.stubEnv("HYPERIDLE_API_KEY", MATRIX_API_KEY);
		bridge = await startMcpBridgeServer();
	});
	afterEach(async () => {
		clearActiveStrategy(); vi.unstubAllEnvs();
		if (bridge) { await bridge.close(); bridge = null; }
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
	});
	test("PATCH-abort on a live real session acknowledges in-flight or conflicts with completed; session reaches terminal state; session_ended emitted exactly once", async ({ db, eventBus }) => {
		await runStateSyncLane(laneFor("codex"), db, eventBus, tmpDir, bridge);
	}, 150_000);
});

describe("[harness:opencode] session state stays in sync through its lifecycle", () => {
	requireHarness("opencode");
	let tmpDir: string;
	// biome-ignore lint/suspicious/noExplicitAny: server handle — only close() used
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null = null;
	let xdgDataHomeBefore: string | undefined;
	let xdgConfigHomeBefore: string | undefined;
	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-matrix-opencode-"));
		clearDeduplicationCache(); setActiveStrategy(minimalStrategy); vi.stubEnv("HYPERIDLE_API_KEY", MATRIX_API_KEY);
		bridge = await startMcpBridgeServer();
		// opencode: isolate its global SQLite DB via XDG_DATA_HOME.
		// @lore session-state-sync opencode-xdg: opencode uses
		// ~/.local/share/opencode/opencode.db; concurrent processes hit the
		// write-lock and hang.
		xdgDataHomeBefore = process.env.XDG_DATA_HOME;
		process.env.XDG_DATA_HOME = path.join(tmpDir, ".opencode-data");
		// @lore AR3 opencode-config-isolation: isolate config dir to prevent stale global MCP entries.
		xdgConfigHomeBefore = process.env.XDG_CONFIG_HOME;
		process.env.XDG_CONFIG_HOME = path.join(tmpDir, ".opencode-config");
	});
	afterEach(async () => {
		clearActiveStrategy(); vi.unstubAllEnvs();
		if (xdgDataHomeBefore !== undefined) { process.env.XDG_DATA_HOME = xdgDataHomeBefore; } else { delete process.env.XDG_DATA_HOME; }
		if (xdgConfigHomeBefore !== undefined) { process.env.XDG_CONFIG_HOME = xdgConfigHomeBefore; } else { delete process.env.XDG_CONFIG_HOME; }
		if (bridge) { await bridge.close(); bridge = null; }
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
	});
	test("PATCH-abort on a live real session acknowledges in-flight or conflicts with completed; session reaches terminal state; session_ended emitted exactly once", async ({ db, eventBus }) => {
		await runStateSyncLane(laneFor("opencode"), db, eventBus, tmpDir, bridge);
	}, 150_000);
});
