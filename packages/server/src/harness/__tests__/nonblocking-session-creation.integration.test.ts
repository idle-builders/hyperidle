/**
 * @harness-matrix: covers all SUPPORTED_HARNESSES via SUPPORTED_HARNESS_LANES loop
 *
 * Non-blocking session creation — harness matrix.
 *
 * Proves that POST /api/sessions returns 202 with an ACTIVE session row
 * immediately (the caller is not blocked), and that the detached run later
 * moves the row to a terminal state.  Runs across all four supported harnesses
 * so the non-blocking contract is proven end-to-end on every real adapter.
 *
 * Proof approach (per reviewer ruling: no controllable seam, honest proof):
 *   1. POST /api/sessions → 202 + body.state === "active" + no outcome.
 *   2. vi.waitFor polls the sessions table until state !== "active".
 *
 * Admission tests (no real agent, shared across harnesses):
 *   - cost-cap exceeded → 422 COST_CAP_EXCEEDED + NO session row.
 *   - concurrency limit  → 429 CONCURRENCY_LIMIT  + NO session row.
 *
 * @lore nonblocking-matrix: The 202 + active row part is identical across
 * harnesses — it is the same route code path.  The terminal-after-real-run
 * assertion is what makes each lane a real integration test rather than a unit
 * test: a real harness run must complete (or crash) to move the row out of
 * "active".  This is the non-blocking proof: the route returned before the
 * harness finished.
 *
 * @lore nonblocking-matrix credential path: Per lane, seedLaneConfig writes a
 * serverConfig entry whose modelGateway provider matches the lane's adapter,
 * plus the matching encrypted credential so DbCredentialResolver resolves it.
 * CLI lanes (claude/codex/opencode) use keychain / CODEX_HOME / opencode data
 * dir for real auth; the DB-stored credential is only required to satisfy the
 * resolveAgentModel pre-flight (which throws MissingCredentialError before the
 * row insert if it sees null).  For claude the stored value is a placeholder
 * ("keychain-auth-unused") — the CliHarnessAdapter envMap for claude is empty
 * so it is never injected.  For codex the stored value is OPENROUTER_API_KEY —
 * codex uses CODEX_HOME auth so the injected OPENAI_API_KEY is harmless.
 *
 * @lore nonblocking-matrix harnessType: User rows are seeded WITHOUT a
 * harnessType (null).  AdapterPool.select() then picks by modelProviders alone.
 * Each lane's pool has exactly one adapter so there is no ambiguity.  This
 * mirrors the AR2 provision-real-session pattern (provision-real-session.ts
 * seedDomain also omits harnessType).
 *
 * @lore nonblocking-matrix opencode-xdg-isolation: opencode uses a single
 * global SQLite DB at ~/.local/share/opencode/opencode.db.  Concurrent or
 * rapidly sequential opencode processes write-lock that DB causing hangs.
 * Fix: set XDG_DATA_HOME per-test (via CLI_TOOL_CONFIGS.opencode.envAllowlist)
 * so each test gets its own DB.  Save + restore across beforeEach / afterEach.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
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
	users,
} from "@hyperidle/db";
import { clearDeduplicationCache } from "@hyperidle/fabric";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { encryptCredentialValue } from "../../services/credential-encryption.js";
import { DbCredentialResolver } from "../../services/credential-resolver.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";
import { createTestApp } from "../../test-utils.js";
import { AdapterPool } from "../adapter-pool.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import {
	lockedHarnessAdapter,
	provisionCodexHome,
	provisionOpencodeHome,
	startMcpBridgeServer,
} from "./provision-real-session.js";
import { harnessTestResolvedModel, requireHarness } from "./require-harness.js";

// ─── Shared constants ─────────────────────────────────────────────────────────

const TEST_API_KEY = "test-key-nonblocking-matrix";
const NOW = "2026-06-30T00:00:00.000Z";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

function authHeaders(): Record<string, string> {
	return { "X-API-Key": TEST_API_KEY, "Content-Type": "application/json" };
}

// ─── Domain seeding ───────────────────────────────────────────────────────────

/**
 * Seed the minimal domain rows.  harnessType is intentionally omitted (null)
 * so the adapter pool selects by modelProviders, not harness type.
 */
async function seedDomain(
	db: HyperIdleDb,
	opts: {
		agentId: string;
		taskId: string;
		taskDescription: string;
		doneCondition: string;
		costCap?: number | null;
		maxConcurrentSessions?: number;
	},
): Promise<void> {
	await db
		.insert(teams)
		.values({ id: "p1", name: "NonBlocking Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: "t1", teamId: "p1", capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: "b1",
		teamId: "p1",
		description: "Non-blocking bet",
		appetite: "small",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: "owner-1",
		name: "Owner",
		role: "founder",
		status: "active",
		teamId: "t1",
		maxConcurrentSessions: 1,
		costCap: null,
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: opts.agentId,
		name: "Agent",
		role: "builder",
		status: "active",
		teamId: "t1",
		maxConcurrentSessions: opts.maxConcurrentSessions ?? 1,
		costCap: opts.costCap === undefined ? null : opts.costCap,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: opts.taskId,
		betId: "b1",
		teamId: "p1",
		title: "Non-blocking task",
		description: opts.taskDescription,
		doneCondition: opts.doneCondition,
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

// ─── Per-lane config seeding ──────────────────────────────────────────────────

/**
 * Lane config: what to write into serverConfig + serverCredentials so the
 * sessions route resolves a valid resolvedModel for this harness.
 */
interface LaneConfig {
	readonly harnessName: string;
	/** modelGateway entry used for all three tiers (reasoning/workhorse/fast). */
	readonly modelGateway: {
		readonly provider: "anthropic" | "openrouter" | "openai-compatible";
		readonly model: string;
		readonly baseUrl?: string;
	};
	/** Credential name + raw value to encrypt and store. */
	readonly credential: {
		readonly name: "anthropic_api_key" | "openrouter_api_key" | "openai_compatible_api_key";
		readonly value: string;
	};
}

/**
 * Write serverConfig + serverCredentials for the given lane.  Uses the lane's
 * model gateway and credential so the sessions route resolves a real
 * resolvedModel before inserting the session row.
 *
 * @lore nonblocking-matrix credential path: CLI lanes (claude/codex/opencode)
 * need a non-null credential to pass the resolveAgentModel pre-flight.  The
 * actual harness auth comes from keychain / CODEX_HOME / opencode data dir,
 * not the DB-stored credential.
 */
async function seedLaneConfig(db: HyperIdleDb, lane: LaneConfig): Promise<void> {
	const gatewayEntry = {
		provider: lane.modelGateway.provider,
		model: lane.modelGateway.model,
		...(lane.modelGateway.baseUrl ? { baseUrl: lane.modelGateway.baseUrl } : {}),
	};
	const configJson = JSON.stringify({
		modelGateway: {
			reasoning: gatewayEntry,
			workhorse: gatewayEntry,
			fast: gatewayEntry,
		},
	});
	const now = new Date().toISOString();
	await db
		.insert(serverConfig)
		.values({ id: "default", config: configJson, updatedAt: now })
		.onConflictDoUpdate({ target: serverConfig.id, set: { config: configJson, updatedAt: now } });

	const encryptedValue = encryptCredentialValue(lane.credential.value, TEST_API_KEY);
	await db
		.insert(serverCredentials)
		.values({ name: lane.credential.name, encryptedValue, updatedAt: now })
		.onConflictDoNothing();
}

// ─── Per-lane adapter pool factories ─────────────────────────────────────────

/**
 * Build an AdapterPool for the builtin lane.
 * modelProviders: ["openai-compatible"] — pool selects this when the serverConfig
 * resolves to an openai-compatible model and the user harnessType is null.
 */
// @lore AR7-seam: all pool factories use lockedHarnessAdapter() rather than
// importing adapter classes directly (banned by honest-harness-guard import-ban).
function makeBuiltinPool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("builtin-local", lockedHarnessAdapter("builtin").adapter, {
		name: "builtin-local",
		kind: "local",
		modelProviders: ["openai-compatible"],
		maxConcurrent: 1,
	});
	return pool;
}

/**
 * Build an AdapterPool for the claude CLI lane.
 * modelProviders: ["anthropic"] — matches the anthropic modelGateway entry.
 */
function makeClaudePool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local-claude", lockedHarnessAdapter("claude").adapter, {
		name: "local-claude",
		kind: "local",
		modelProviders: ["anthropic"],
		maxConcurrent: 4,
	});
	return pool;
}

/**
 * Build an AdapterPool for the codex CLI lane.
 * modelProviders: ["openai-compatible"] — matches the openai-compatible gateway entry.
 */
function makeCodexPool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local-codex", lockedHarnessAdapter("codex").adapter, {
		name: "local-codex",
		kind: "local",
		modelProviders: ["openai-compatible"],
		maxConcurrent: 2,
	});
	return pool;
}

/**
 * Build an AdapterPool for the opencode CLI lane.
 * modelProviders: ["openai-compatible"] — matches the openai-compatible gateway entry.
 */
function makeOpencodePool(): AdapterPool {
	const pool = new AdapterPool();
	pool.register("local-opencode", lockedHarnessAdapter("opencode").adapter, {
		name: "local-opencode",
		kind: "local",
		modelProviders: ["openai-compatible"],
		maxConcurrent: 2,
	});
	return pool;
}

// ─── Lane definitions ─────────────────────────────────────────────────────────

/**
 * HTTP-path-specific config per harness: model gateway, credential, pool factory,
 * MCP bridge requirement, task description, and per-harness sandbox provisioning.
 *
 * Keyed by harnessName so it can be looked up inside the
 * `for (const lane of SUPPORTED_HARNESS_LANES)` loop below.
 *
 * @lore nonblocking-matrix HTTP_LANE_CONFIGS vs HTTP_LANES: The loop MUST iterate
 * `SUPPORTED_HARNESS_LANES` so the honest-harness-guard's pragma-token check passes
 * (the guard requires the literal token `for (const lane of SUPPORTED_HARNESS_LANES)`
 * in non-comment code). Per-lane HTTP config lives in this lookup map instead.
 */
interface HttpLaneConfig {
	readonly laneConfig: LaneConfig;
	readonly makePool: () => AdapterPool;
	/** Whether this lane needs an MCP bridge server. */
	readonly needsBridge: boolean;
	readonly taskDescription: string;
	readonly doneCondition: string;
	/** Whether to init a git repo in the sandbox (codex requires one). */
	readonly needsGitRepo?: boolean;
	/** Provision per-harness auth files into sandbox. */
	readonly provisionSandbox?: (sandboxPath: string) => void;
	/** Env var to set per-test for XDG isolation (opencode only). */
	readonly xdgDataHomeKey?: string;
}

const HTTP_LANE_CONFIGS: Record<string, HttpLaneConfig> = {
	builtin: {
		laneConfig: {
			harnessName: "builtin",
			modelGateway: {
				provider: "openai-compatible",
				model: harnessTestResolvedModel("builtin").model,
				baseUrl: OPENROUTER_BASE_URL,
			},
			credential: {
				name: "openai_compatible_api_key",
				value: process.env.OPENROUTER_API_KEY ?? "",
			},
		},
		makePool: makeBuiltinPool,
		needsBridge: false,
		taskDescription:
			"Report the number 4 to the human owner (id 'owner-1') by calling send_message " +
			"with to='owner-1' and body='4'. Do not hand off or submit a review.",
		doneCondition: "Agent reports via send_message to owner-1.",
	},
	claude: {
		laneConfig: {
			harnessName: "claude",
			modelGateway: {
				provider: "anthropic",
				// AR7-locked: "haiku" (smallest claude tier). The sessions route passes this
				// to the CLI as --model haiku. The dummy anthropic_api_key satisfies the pre-flight.
				model: harnessTestResolvedModel("claude").model,
			},
			credential: {
				// claude uses keychain auth; the DB-stored value satisfies the pre-flight
				// check but is never injected into the subprocess (CLAUDE_CLI_CONFIG.envMap={}).
				name: "anthropic_api_key",
				value: "keychain-auth-unused",
			},
		},
		makePool: makeClaudePool,
		needsBridge: true,
		taskDescription:
			"Create a file named 'answer.txt' in the current working directory containing " +
			"exactly the number 4.  Then report to the human owner (id 'owner-1') by calling " +
			"send_message with to='owner-1' and body='Done: 4'.  Do NOT hand off or submit a review.",
		doneCondition: "Agent creates answer.txt and reports via send_message.",
		provisionSandbox: (sandboxPath: string) => {
			// .mcp.json is overwritten by startMcpBridgeServer; write a placeholder now.
			fs.writeFileSync(
				path.join(sandboxPath, ".mcp.json"),
				JSON.stringify({
					mcpServers: { hyperidle: { type: "http", url: "http://localhost:9/api/mcp/x" } },
				}),
				"utf-8",
			);
			// .claude/settings.json: empty object = no Stop hook override.
			fs.mkdirSync(path.join(sandboxPath, ".claude"), { recursive: true });
			fs.writeFileSync(
				path.join(sandboxPath, ".claude", "settings.json"),
				JSON.stringify({}),
				"utf-8",
			);
		},
	},
	codex: {
		laneConfig: {
			harnessName: "codex",
			modelGateway: {
				provider: "openai-compatible",
				// AR7-locked: "gpt-5.4-mini" (tiny baseline, ChatGPT-account codex login).
				model: harnessTestResolvedModel("codex").model,
				baseUrl: harnessTestResolvedModel("codex").baseUrl,
			},
			credential: {
				// codex uses CODEX_HOME auth; OPENROUTER_API_KEY is stored to satisfy the
				// resolveAgentModel pre-flight.  It gets injected as OPENAI_API_KEY into
				// the subprocess, but codex reads its real auth from CODEX_HOME and ignores it.
				name: "openai_compatible_api_key",
				value: process.env.OPENROUTER_API_KEY ?? "",
			},
		},
		makePool: makeCodexPool,
		needsBridge: true,
		taskDescription:
			"Create a file named 'answer.txt' in the current working directory containing exactly the number 4.",
		doneCondition: "Agent creates answer.txt with the number 4.",
		needsGitRepo: true,
		provisionSandbox: (sandboxPath: string) => {
			const authFound = provisionCodexHome(sandboxPath);
			if (!authFound) {
				throw new Error("codex lane: auth.json not found in ~/.codex — install codex and log in.");
			}
		},
	},
	opencode: {
		laneConfig: {
			harnessName: "opencode",
			modelGateway: {
				provider: "openai-compatible",
				// AR7-locked: "openrouter/z-ai/glm-4.7-flash" (tiny baseline via OpenRouter).
				// opencode requires a provider-prefixed model id (openrouter/<model>).
				model: harnessTestResolvedModel("opencode").model,
				baseUrl: OPENROUTER_BASE_URL,
			},
			credential: {
				name: "openai_compatible_api_key",
				value: process.env.OPENROUTER_API_KEY ?? "",
			},
		},
		makePool: makeOpencodePool,
		needsBridge: true,
		taskDescription:
			"Create a file named 'answer.txt' in the current working directory containing exactly the number 4.",
		doneCondition: "Agent creates answer.txt with the number 4.",
		provisionSandbox: (sandboxPath: string) => {
			provisionOpencodeHome(sandboxPath);
		},
		xdgDataHomeKey: "XDG_DATA_HOME",
	},
};

// ─── Harness matrix ───────────────────────────────────────────────────────────
//
// Four explicit describe blocks — literal requireHarness("<name>") per lane so
// the honest-harness-guard AR7 coverage check sees all four harnesses.
// Shared test body factored into runNonblockingLane() to avoid duplication.
// Per-lane HTTP config is looked up from HTTP_LANE_CONFIGS by harness name.

async function runNonblockingLane(
	harnessName: string,
	db: HyperIdleDb,
	eventBus: import("@hyperidle/shared").EventBus,
	tmpDir: string,
	// biome-ignore lint/suspicious/noExplicitAny: server type — only close() is used
	bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null,
): Promise<void> {
	const httpConfig = HTTP_LANE_CONFIGS[harnessName];
	if (!httpConfig) throw new Error(`runNonblockingLane: no HTTP config for harness ${harnessName}`);

	const agentId = `nb-${harnessName}-agent`;
	const taskId = `nb-${harnessName}-task`;

	const currentCredentialValue =
		httpConfig.laneConfig.credential.name === "anthropic_api_key"
			? "keychain-auth-unused"
			: (process.env.OPENROUTER_API_KEY ?? "");

	await seedLaneConfig(db, {
		...httpConfig.laneConfig,
		credential: { ...httpConfig.laneConfig.credential, value: currentCredentialValue },
	});

	await seedDomain(db, {
		agentId,
		taskId,
		taskDescription: httpConfig.taskDescription,
		doneCondition: httpConfig.doneCondition,
	});

	const credentialResolver = new DbCredentialResolver(db, TEST_API_KEY);

	const app = await createTestApp({
		db,
		eventBus,
		adapterPool: httpConfig.makePool(),
		workspaceAdapter: new LocalSandboxAdapter(),
		sandboxBasePath: tmpDir,
		credentialResolver,
		...(bridge
			? { mcpBridgeRegistry: bridge.mcpBridgeRegistry, mcpBaseUrl: bridge.mcpBaseUrl }
			: {}),
	});

	const res = await app.request("/api/sessions", {
		method: "POST",
		headers: authHeaders(),
		body: JSON.stringify({ agentId, taskId, modelTier: "workhorse" }),
	});

	expect(res.status).toBe(202);
	const body = (await res.json()) as Record<string, unknown>;
	expect(body.state).toBe("active");
	expect(body.outcome).toBeFalsy();
	expect(typeof body.id).toBe("string");

	await vi.waitFor(
		async () => {
			const [row] = await db
				.select({ state: sessions.state, outcome: sessions.outcome })
				.from(sessions)
				.where(eq(sessions.id, body.id as string))
				.limit(1);
			expect(row?.state).toBe("done");
			expect(["completed", "not_returned"]).toContain(row?.outcome);
		},
		{ timeout: 240_000 },
	);
}

describe("[harness:builtin] session creation is non-blocking", () => {
	requireHarness("builtin");
	let tmpDir: string;
	let xdgDataHomeBefore: string | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: server type — only close() is used
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null = null;
	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nonblock-builtin-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
		const cfg = HTTP_LANE_CONFIGS["builtin"]!;
		if (cfg.provisionSandbox) cfg.provisionSandbox(tmpDir);
		if (cfg.xdgDataHomeKey) { xdgDataHomeBefore = process.env[cfg.xdgDataHomeKey]; process.env[cfg.xdgDataHomeKey] = path.join(tmpDir, ".opencode-data"); }
		if (cfg.needsBridge) bridge = await startMcpBridgeServer();
	});
	afterEach(async () => {
		clearActiveStrategy(); vi.unstubAllEnvs();
		const cfg = HTTP_LANE_CONFIGS["builtin"]!;
		if (cfg.xdgDataHomeKey) { if (xdgDataHomeBefore !== undefined) { process.env[cfg.xdgDataHomeKey] = xdgDataHomeBefore; } else { delete process.env[cfg.xdgDataHomeKey]; } }
		if (bridge) { await bridge.close(); bridge = null; }
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
	});
	test("returns 202 with an active session row, which reaches a terminal state after the real run", async ({ db, eventBus }) => {
		await runNonblockingLane("builtin", db, eventBus, tmpDir, bridge);
	}, 270_000);
});

describe("[harness:claude] session creation is non-blocking", () => {
	requireHarness("claude");
	let tmpDir: string;
	let xdgDataHomeBefore: string | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: server type — only close() is used
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null = null;
	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nonblock-claude-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
		const cfg = HTTP_LANE_CONFIGS["claude"]!;
		if (cfg.provisionSandbox) cfg.provisionSandbox(tmpDir);
		if (cfg.xdgDataHomeKey) { xdgDataHomeBefore = process.env[cfg.xdgDataHomeKey]; process.env[cfg.xdgDataHomeKey] = path.join(tmpDir, ".opencode-data"); }
		if (cfg.needsBridge) bridge = await startMcpBridgeServer();
	});
	afterEach(async () => {
		clearActiveStrategy(); vi.unstubAllEnvs();
		const cfg = HTTP_LANE_CONFIGS["claude"]!;
		if (cfg.xdgDataHomeKey) { if (xdgDataHomeBefore !== undefined) { process.env[cfg.xdgDataHomeKey] = xdgDataHomeBefore; } else { delete process.env[cfg.xdgDataHomeKey]; } }
		if (bridge) { await bridge.close(); bridge = null; }
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
	});
	test("returns 202 with an active session row, which reaches a terminal state after the real run", async ({ db, eventBus }) => {
		await runNonblockingLane("claude", db, eventBus, tmpDir, bridge);
	}, 270_000);
});

describe("[harness:codex] session creation is non-blocking", () => {
	requireHarness("codex");
	let tmpDir: string;
	let xdgDataHomeBefore: string | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: server type — only close() is used
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null = null;
	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nonblock-codex-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
		const cfg = HTTP_LANE_CONFIGS["codex"]!;
		if (cfg.provisionSandbox) cfg.provisionSandbox(tmpDir);
		if (cfg.needsGitRepo) {
			execFileSync("git", ["init"], { cwd: tmpDir, stdio: "ignore" });
			execFileSync("git", ["commit", "--allow-empty", "-m", "init"], { cwd: tmpDir, stdio: "ignore", env: { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@test.com", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@test.com" } });
		}
		if (cfg.xdgDataHomeKey) { xdgDataHomeBefore = process.env[cfg.xdgDataHomeKey]; process.env[cfg.xdgDataHomeKey] = path.join(tmpDir, ".opencode-data"); }
		if (cfg.needsBridge) bridge = await startMcpBridgeServer();
	});
	afterEach(async () => {
		clearActiveStrategy(); vi.unstubAllEnvs();
		const cfg = HTTP_LANE_CONFIGS["codex"]!;
		if (cfg.xdgDataHomeKey) { if (xdgDataHomeBefore !== undefined) { process.env[cfg.xdgDataHomeKey] = xdgDataHomeBefore; } else { delete process.env[cfg.xdgDataHomeKey]; } }
		if (bridge) { await bridge.close(); bridge = null; }
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
	});
	test("returns 202 with an active session row, which reaches a terminal state after the real run", async ({ db, eventBus }) => {
		await runNonblockingLane("codex", db, eventBus, tmpDir, bridge);
	}, 270_000);
});

describe("[harness:opencode] session creation is non-blocking", () => {
	requireHarness("opencode");
	let tmpDir: string;
	let xdgDataHomeBefore: string | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: server type — only close() is used
	let bridge: { mcpBridgeRegistry: any; mcpBaseUrl: string; close: () => Promise<void> } | null = null;
	beforeEach(async () => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nonblock-opencode-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
		const cfg = HTTP_LANE_CONFIGS["opencode"]!;
		if (cfg.provisionSandbox) cfg.provisionSandbox(tmpDir);
		if (cfg.xdgDataHomeKey) { xdgDataHomeBefore = process.env[cfg.xdgDataHomeKey]; process.env[cfg.xdgDataHomeKey] = path.join(tmpDir, ".opencode-data"); }
		if (cfg.needsBridge) bridge = await startMcpBridgeServer();
	});
	afterEach(async () => {
		clearActiveStrategy(); vi.unstubAllEnvs();
		const cfg = HTTP_LANE_CONFIGS["opencode"]!;
		if (cfg.xdgDataHomeKey) { if (xdgDataHomeBefore !== undefined) { process.env[cfg.xdgDataHomeKey] = xdgDataHomeBefore; } else { delete process.env[cfg.xdgDataHomeKey]; } }
		if (bridge) { await bridge.close(); bridge = null; }
		if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
	});
	test("returns 202 with an active session row, which reaches a terminal state after the real run", async ({ db, eventBus }) => {
		await runNonblockingLane("opencode", db, eventBus, tmpDir, bridge);
	}, 270_000);
});

// ─── Admission tests (no real agent) ─────────────────────────────────────────
//
// These are pure HTTP-path tests; the harness is never started.  They run once
// (untagged — no [harness:X] tag) because the admission logic is identical
// across all harnesses.

describe("session creation admission — cost cap exceeded", () => {
	let tmpDir: string;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nonblock-admission-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("cost cap of zero → 422 COST_CAP_EXCEEDED with no session row inserted", async ({
		db,
		eventBus,
	}) => {
		// Seed with builtin model gateway (admission fires before the adapter is reached).
		const apiKey = process.env.OPENROUTER_API_KEY ?? "";
		await seedLaneConfig(db, {
			harnessName: "builtin",
			modelGateway: {
				provider: "openai-compatible",
				model: harnessTestResolvedModel("builtin").model,
				baseUrl: OPENROUTER_BASE_URL,
			},
			credential: { name: "openai_compatible_api_key", value: apiKey },
		});
		await seedDomain(db, {
			agentId: "admission-agent",
			taskId: "admission-task",
			taskDescription: "Admission test task.",
			doneCondition: "Admission done.",
			costCap: 0,
		});

		const credentialResolver = new DbCredentialResolver(db, TEST_API_KEY);
		const app = await createTestApp({
			db,
			eventBus,
			adapterPool: makeBuiltinPool(),
			workspaceAdapter: new LocalSandboxAdapter(),
			sandboxBasePath: tmpDir,
			credentialResolver,
		});

		const res = await app.request("/api/sessions", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				agentId: "admission-agent",
				taskId: "admission-task",
				modelTier: "workhorse",
			}),
		});

		expect(res.status).toBe(422);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("COST_CAP_EXCEEDED");

		const rows = await db.select().from(sessions);
		expect(rows).toHaveLength(0);
	});
});

describe("session creation admission — concurrency limit", () => {
	let tmpDir: string;

	beforeEach(() => {
		vi.stubEnv("HYPERIDLE_API_KEY", TEST_API_KEY);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nonblock-admission-conc-"));
		clearDeduplicationCache();
		setActiveStrategy(minimalStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		vi.unstubAllEnvs();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("concurrency limit of zero → 429 CONCURRENCY_LIMIT with no session row inserted", async ({
		db,
		eventBus,
	}) => {
		const apiKey = process.env.OPENROUTER_API_KEY ?? "";
		await seedLaneConfig(db, {
			harnessName: "builtin",
			modelGateway: {
				provider: "openai-compatible",
				model: harnessTestResolvedModel("builtin").model,
				baseUrl: OPENROUTER_BASE_URL,
			},
			credential: { name: "openai_compatible_api_key", value: apiKey },
		});
		await seedDomain(db, {
			agentId: "conc-agent",
			taskId: "conc-task",
			taskDescription: "Concurrency test task.",
			doneCondition: "Concurrency done.",
			maxConcurrentSessions: 0,
		});

		const credentialResolver = new DbCredentialResolver(db, TEST_API_KEY);
		const app = await createTestApp({
			db,
			eventBus,
			adapterPool: makeBuiltinPool(),
			workspaceAdapter: new LocalSandboxAdapter(),
			sandboxBasePath: tmpDir,
			credentialResolver,
		});

		const res = await app.request("/api/sessions", {
			method: "POST",
			headers: authHeaders(),
			body: JSON.stringify({
				agentId: "conc-agent",
				taskId: "conc-task",
				modelTier: "workhorse",
			}),
		});

		expect(res.status).toBe(429);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.code).toBe("CONCURRENCY_LIMIT");

		const rows = await db.select().from(sessions);
		expect(rows).toHaveLength(0);
	});
});
