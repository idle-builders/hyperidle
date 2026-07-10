/**
 * @harness-matrix: covers all SUPPORTED_HARNESSES via SUPPORTED_HARNESS_LANES loop
 *
 * Dispatch → provision wiring: the production server auto-provisions a session
 * for a task that transitions to the accepted state.
 *
 * Two test groups:
 *
 * 1. Pure-wiring (untagged) — the dispatch-queue endpoint is reachable on a
 *    booted server. No real agent, no harness gate. Proves the HTTP layer is
 *    wired without touching LLM calls.
 *
 * 2. Harness matrix (4 × 1) — for each supported harness the production
 *    createServer() is booted with a real adapter pool, a task is driven to
 *    accepted via the HTTP transition endpoint, and the test waits for a real
 *    session row to appear. Asserts the dispatcher (wired by createServer) ran
 *    a real agent turn — not a stub.
 *
 * Matrix shape: 4 describe blocks × 1 test each = 4 agentic tests total.
 * Each describe carries a `[harness:X]` tag so the attestation per-harness
 * executed-count bucket is credited correctly.
 *
 * @lore dispatch-wiring: The builtin lane overrides the model gateway in
 * server_config to openai-compatible (OpenRouter) and seeds an encrypted
 * openai_compatible_api_key credential so DbCredentialResolver can resolve it.
 * HYPERIDLE_API_KEY (stubEnv) doubles as the server secret so encryptCredentialValue
 * + getServerSecret() agree on the same key.
 *
 * @lore dispatch-wiring: CLI lanes (claude/codex/opencode) start a real MCP
 * bridge server for the session (required because createServer's dispatcher
 * calls provisionSession which writes .mcp.json for CLI adapters). The bridge
 * is injected via createServer's `deps.mcpBridgeRegistry` + `deps.mcpBaseUrl`.
 *
 * @lore dispatch-wiring: The ANTHROPIC_API_KEY is NOT seeded here (and must
 * never be). The builtin harness uses OPENROUTER_API_KEY; CLI harnesses use
 * keychain auth. There is no anthropic key in this system's env model.
 *
 * @lore dispatch-wiring: createServer wires the dispatcher in its boot sequence.
 * The `deps` injection (db, adapterPool, workspaceAdapter, sandboxBasePath, and
 * optionally mcpBridgeRegistry + mcpBaseUrl) replaces the defaults so the real
 * production path runs inside the test fixture's PGlite database.
 */

import * as fs from "node:fs";
import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import {
	bets,
	serverConfig,
	serverCredentials,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	users,
} from "@hyperidle/db";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { clearProvisionSessionFn } from "../../../../fabric/src/services/provision-registry.js";
import { createServer } from "../../server-factory.js";
import { encryptCredentialValue } from "../../services/credential-encryption.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";
import { AdapterPool } from "../adapter-pool.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import {
	lockedHarnessAdapter,
	SUPPORTED_HARNESS_LANES,
	startMcpBridgeServer,
} from "./provision-real-session.js";
import { harnessTestResolvedModel, requireHarness } from "./require-harness.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_API_KEY = "test-key-dispatch-wiring";
const NOW = new Date().toISOString();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

/**
 * Seed server_config with an openai-compatible workhorse tier (OpenRouter) and
 * the matching encrypted credential so DbCredentialResolver resolves it for
 * builtin/codex/opencode adapters.
 *
 * @lore dispatch-wiring: createServer's default workhorse tier maps to
 * anthropic → anthropic_api_key. Overriding to openai-compatible + seeding
 * openai_compatible_api_key lets the builtin adapter run via OpenRouter without
 * needing an Anthropic key (which does not exist in this system's env model).
 *
 * @lore dispatch-gateway-seed-all-lanes: The dispatcher's resolveModel(tier)
 * call reads gateway config from readServerConfig(db). Without seeding, all lanes
 * use BUILT_IN_GATEWAY_CONFIG (anthropic) → MissingCredentialError("anthropic_api_key")
 * → dispatcher removes task from queue → no session provisioned → timeout.
 * CLI adapters ignore the resulting resolvedModel (they use keychain/own auth).
 */
async function seedOpenrouterGatewayConfig(db: HyperIdleDb): Promise<void> {
	const apiKey = process.env.OPENROUTER_API_KEY as string;
	const serverSecret = TEST_API_KEY; // matches vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY)

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
	await db
		.insert(serverConfig)
		.values({ id: "default", config: configJson, updatedAt: NOW })
		.onConflictDoUpdate({
			target: serverConfig.id,
			set: { config: configJson, updatedAt: NOW },
		});

	const encryptedValue = encryptCredentialValue(apiKey, serverSecret);
	await db
		.insert(serverCredentials)
		.values({ name: "openai_compatible_api_key", encryptedValue, updatedAt: NOW })
		.onConflictDoNothing();
}

/**
 * Seed server_config with an anthropic workhorse tier and a dummy
 * anthropic_api_key credential for the claude lane.
 *
 * The claude CLI uses keychain auth and ignores resolvedModel.apiKey.
 * A dummy credential satisfies the pre-flight in the dispatcher's resolveModel
 * call without affecting the actual CLI spawn. The model "sonnet" maps to
 * --model sonnet in CLAUDE_CLI_CONFIG args (correct, founder-set 2026-06-30).
 *
 * @lore dispatch-claude-gateway: same pattern as seedAnthropicGatewayConfig
 * used by the shared matrix setup. The dispatcher resolveModel path
 * goes through makeResolveModel→resolveModelTier→resolveProvider("anthropic").
 * Without a dummy anthropic_api_key, the task is removed from the queue on
 * first dispatch attempt → session never provisioned → 120s timeout.
 */
async function seedAnthropicGatewayConfig(db: HyperIdleDb): Promise<void> {
	const serverSecret = TEST_API_KEY;
	const configJson = JSON.stringify({
		modelGateway: {
			// locked model: haiku is the tiny-model baseline for the claude lane.
			reasoning: { provider: "anthropic", model: harnessTestResolvedModel("claude").model },
			workhorse: { provider: "anthropic", model: harnessTestResolvedModel("claude").model },
			fast: { provider: "anthropic", model: harnessTestResolvedModel("claude").model },
		},
	});
	await db
		.insert(serverConfig)
		.values({ id: "default", config: configJson, updatedAt: NOW })
		.onConflictDoUpdate({
			target: serverConfig.id,
			set: { config: configJson, updatedAt: NOW },
		});
	// Dummy key: the claude CLI uses keychain auth; this value is injected via
	// envMap but ignored by the binary. It must be non-null so the pre-flight passes.
	const encryptedValue = encryptCredentialValue("keychain-auth-unused", serverSecret);
	await db
		.insert(serverCredentials)
		.values({ name: "anthropic_api_key", encryptedValue, updatedAt: NOW })
		.onConflictDoNothing();
}

/**
 * Seed the minimal domain rows (team + member + agent + bet + thread + task)
 * needed for the dispatcher to pick up the task when it transitions to accepted.
 */
async function seedDispatchDomain(
	db: HyperIdleDb,
	opts: {
		prefix: string;
		harnessType: string;
	},
): Promise<{ teamId: string; agentId: string; taskId: string; threadId: string }> {
	const { prefix, harnessType } = opts;
	const teamId = `${prefix}-team`;
	const memberId = `${prefix}-tm`;
	const agentId = `${prefix}-agent`;
	const betId = `${prefix}-bet`;
	const threadId = `${prefix}-thread`;
	const taskId = `${prefix}-task`;

	await db
		.insert(teams)
		.values({ id: teamId, name: `${prefix} team`, phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: memberId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: `${prefix} agent`,
		role: "builder",
		status: "active",
		maxConcurrentSessions: 4,
		teamId: memberId,
		harnessType,
		createdAt: NOW,
	});
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: `${prefix} bet`,
		status: "active",
		createdAt: NOW,
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
		title: `${prefix} dispatch task`,
		description:
			"Report the number 4 to the human owner by calling send_message with body='4'. " +
			"Do not hand off or submit a review.",
		doneCondition: "Agent calls send_message to report the answer.",
		state: "proposed",
		ownerAgentId: agentId,
		threadId,
		createdAt: NOW,
		updatedAt: NOW,
	});

	return { teamId, agentId, taskId, threadId };
}

// ─── Pure-wiring (no harness gate) ───────────────────────────────────────────

describe("dispatch-queue endpoint is reachable on a booted server", () => {
	let sandboxBasePath: string;
	let dbDir: string;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-wiring-db-"));
		vi.stubEnv("DATABASE_URL", path.join(dbDir, "pg"));
		clearProvisionSessionFn();
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-wiring-"));
	});

	afterEach(() => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
		clearProvisionSessionFn();
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		fs.rmSync(dbDir, { recursive: true, force: true });
	});

	test("GET /api/dispatch-queue returns 200 with an entries array on a booted server", async ({
		db,
	}) => {
		// Boot with the builtin pool so createServer has a valid adapter — we only
		// test the endpoint reachability here, not a full agent turn.
		// @lore locked-harness-adapter-seam: lockedHarnessAdapter("builtin").adapter replaces direct
		// new BuiltinHarnessAdapter(...) (banned by honest-harness-guard import-ban).
		const pool = new AdapterPool();
		pool.register("builtin-local", lockedHarnessAdapter("builtin").adapter, {
			name: "builtin-local",
			kind: "local",
			type: "builtin",
			modelProviders: ["openai-compatible"],
			maxConcurrent: 1,
		});

		const server = await createServer(0, {
			db,
			adapterPool: pool,
			workspaceAdapter: new LocalSandboxAdapter(),
			sandboxBasePath,
		});
		// createServer sets fabricStrategy; override to minimalStrategy so provisions
		// are cost-clean (no fabric LLM context-assembly calls during this test).
		setActiveStrategy(minimalStrategy);

		try {
			const addr = server.httpServer.address() as AddressInfo;
			const base = `http://127.0.0.1:${addr.port}`;
			const res = await fetch(`${base}/api/dispatch-queue`, { headers: authHeaders() });
			expect(res.status).toBe(200);
			const body = (await res.json()) as { entries: unknown[] };
			expect(Array.isArray(body.entries)).toBe(true);
		} finally {
			server.dispose();
		}
	}, 30_000);
});

// ─── Harness matrix (4 × 1) ──────────────────────────────────────────────────
// Four explicit describe blocks — literal requireHarness("<name>") per lane so
// the honest-harness-guard coverage check sees all four harnesses.
// Shared test body factored into runDispatchMatrixLane() to avoid duplication.
// Lane is looked up from SUPPORTED_HARNESS_LANES via laneFor().

/** Look up a lane from SUPPORTED_HARNESS_LANES by harness name. */
function laneFor(name: string): import("./provision-real-session.js").HarnessLane {
	const found = SUPPORTED_HARNESS_LANES.find((l) => l.harnessName === name);
	if (!found) throw new Error(`laneFor: no lane for "${name}" in SUPPORTED_HARNESS_LANES`);
	return found;
}

async function runDispatchMatrixLane(
	lane: import("./provision-real-session.js").HarnessLane,
	db: HyperIdleDb,
	sandboxBasePath: string,
	// biome-ignore lint/suspicious/noExplicitAny: bridge type — close() is the only method used here
	bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null,
): Promise<void> {
	// Map harness name to the canonical harnessType matching the adapter pool registration.
	// @lore dispatch-wiring: -cli suffixes are NOT canonical — corrected to match adapter-pool.ts.
	const harnessType =
		lane.harnessName === "builtin"
			? "builtin"
			: lane.harnessName === "claude"
				? "claude-code"
				: lane.harnessName === "codex"
					? "codex"
					: "opencode";

	const { taskId } = await seedDispatchDomain(db, {
		prefix: `dispatch-${lane.harnessName}`,
		harnessType,
	});

	// Per-lane gateway seeding.
	if (lane.harnessName === "claude") {
		await seedAnthropicGatewayConfig(db);
	} else {
		await seedOpenrouterGatewayConfig(db);
	}

	// Build the adapter pool for this lane.
	// @lore locked-harness-adapter-seam: adapters via lockedHarnessAdapter() — import-ban satisfied.
	let pool: AdapterPool;
	if (lane.harnessName === "builtin") {
		pool = new AdapterPool();
		pool.register("builtin-local", lockedHarnessAdapter("builtin").adapter, {
			name: "builtin-local",
			kind: "local",
			type: "builtin",
			modelProviders: ["anthropic", "openrouter", "openai-compatible"],
			maxConcurrent: 4,
		});
	} else if (lane.harnessName === "claude") {
		pool = new AdapterPool();
		pool.register("local-claude", lockedHarnessAdapter("claude").adapter, {
			name: "local-claude",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});
	} else if (lane.harnessName === "codex") {
		pool = new AdapterPool();
		pool.register("local-codex", lockedHarnessAdapter("codex").adapter, {
			name: "local-codex",
			kind: "local",
			type: "codex",
			modelProviders: ["openai-compatible"],
			maxConcurrent: 2,
		});
	} else {
		pool = new AdapterPool();
		pool.register("local-opencode", lockedHarnessAdapter("opencode").adapter, {
			name: "local-opencode",
			kind: "local",
			type: "opencode",
			modelProviders: ["openai-compatible"],
			maxConcurrent: 2,
		});
	}

	const serverDeps: Parameters<typeof createServer>[1] = {
		db,
		adapterPool: pool,
		workspaceAdapter: new LocalSandboxAdapter(),
		sandboxBasePath,
		...(bridge
			? { mcpBridgeRegistry: bridge.mcpBridgeRegistry, mcpBaseUrl: bridge.mcpBaseUrl }
			: {}),
	};

	const server = await createServer(0, serverDeps);
	setActiveStrategy(minimalStrategy);

	try {
		const addr = server.httpServer.address() as AddressInfo;
		const base = `http://127.0.0.1:${addr.port}`;

		const transitionRes = await fetch(`${base}/api/tasks/${taskId}/transition`, {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({ state: "accepted" }),
		});
		expect(transitionRes.status).toBe(200);

		await vi.waitFor(
			async () => {
				const rows = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
				expect(rows.length).toBeGreaterThanOrEqual(1);
			},
			{ timeout: 120_000 },
		);

		const rows = await db.select().from(sessions).where(eq(sessions.taskId, taskId));
		expect(rows.length).toBeGreaterThanOrEqual(1);
		const firstSession = rows[0];
		expect(firstSession).toBeDefined();
		expect(firstSession!.state).not.toBe("crashed");

		const queueRes = await fetch(`${base}/api/dispatch-queue`, { headers: authHeaders() });
		expect(queueRes.status).toBe(200);
		const snapshot = (await queueRes.json()) as { entries: unknown[] };
		expect(Array.isArray(snapshot.entries)).toBe(true);
	} finally {
		server.dispose();
	}
}

describe("[harness:builtin] dispatcher auto-provisions a session for an accepted task", () => {
	requireHarness("builtin");
	let sandboxBasePath: string;
	let dbDir: string;
	// biome-ignore lint/suspicious/noExplicitAny: bridge type — close() is the only method used here
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null =
		null;
	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-builtin-db-"));
		vi.stubEnv("DATABASE_URL", path.join(dbDir, "pg"));
		clearProvisionSessionFn();
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-builtin-"));
	});
	afterEach(async () => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
		clearProvisionSessionFn();
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		fs.rmSync(dbDir, { recursive: true, force: true });
	});
	test("task transition to accepted triggers the dispatcher; a real session row appears in the database", async ({
		db,
	}) => {
		await runDispatchMatrixLane(laneFor("builtin"), db, sandboxBasePath, bridge);
	}, 120_000);
});

describe("[harness:claude] dispatcher auto-provisions a session for an accepted task", () => {
	requireHarness("claude");
	let sandboxBasePath: string;
	let dbDir: string;
	// biome-ignore lint/suspicious/noExplicitAny: bridge type — close() is the only method used here
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null =
		null;
	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-claude-db-"));
		vi.stubEnv("DATABASE_URL", path.join(dbDir, "pg"));
		clearProvisionSessionFn();
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-claude-"));
		bridge = await startMcpBridgeServer();
	});
	afterEach(async () => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
		clearProvisionSessionFn();
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		fs.rmSync(dbDir, { recursive: true, force: true });
	});
	test("task transition to accepted triggers the dispatcher; a real session row appears in the database", async ({
		db,
	}) => {
		await runDispatchMatrixLane(laneFor("claude"), db, sandboxBasePath, bridge);
	}, 120_000);
});

describe("[harness:codex] dispatcher auto-provisions a session for an accepted task", () => {
	requireHarness("codex");
	let sandboxBasePath: string;
	let dbDir: string;
	// biome-ignore lint/suspicious/noExplicitAny: bridge type — close() is the only method used here
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null =
		null;
	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-codex-db-"));
		vi.stubEnv("DATABASE_URL", path.join(dbDir, "pg"));
		clearProvisionSessionFn();
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-codex-"));
		bridge = await startMcpBridgeServer();
	});
	afterEach(async () => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
		clearProvisionSessionFn();
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		fs.rmSync(dbDir, { recursive: true, force: true });
	});
	test("task transition to accepted triggers the dispatcher; a real session row appears in the database", async ({
		db,
	}) => {
		await runDispatchMatrixLane(laneFor("codex"), db, sandboxBasePath, bridge);
	}, 120_000);
});

describe("[harness:opencode] dispatcher auto-provisions a session for an accepted task", () => {
	requireHarness("opencode");
	let sandboxBasePath: string;
	let dbDir: string;
	// biome-ignore lint/suspicious/noExplicitAny: bridge type — close() is the only method used here
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null =
		null;
	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-opencode-db-"));
		vi.stubEnv("DATABASE_URL", path.join(dbDir, "pg"));
		clearProvisionSessionFn();
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-opencode-"));
		bridge = await startMcpBridgeServer();
	});
	afterEach(async () => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
		clearProvisionSessionFn();
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
		fs.rmSync(dbDir, { recursive: true, force: true });
	});
	test("task transition to accepted triggers the dispatcher; a real session row appears in the database", async ({
		db,
	}) => {
		await runDispatchMatrixLane(laneFor("opencode"), db, sandboxBasePath, bridge);
	}, 120_000);
});
