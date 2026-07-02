/**
 * @harness-matrix: covers all SUPPORTED_HARNESSES via SUPPORTED_HARNESS_LANES loop
 *
 * Production session setup proof.
 *
 * This suite runs every supported real-harness lane through production
 * `provisionSession()`, observes the sandbox after production session setup and
 * before `harness.startSession`, then aborts. It spends no LLM call.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { bets, type HyperIdleDb, tasks, teamMembers, teams, users } from "@hyperidle/db";
import {
	clearDeduplicationCache,
	create as createKnowledgeItem,
	fabricStrategy,
} from "@hyperidle/fabric";
import type { SessionConfig } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";
import type { HarnessLane } from "./provision-real-session.js";
import {
	runThroughHarness,
	SUPPORTED_HARNESS_LANES,
	startMcpBridgeServer,
} from "./provision-real-session.js";
import { requireHarness } from "./require-harness.js";

const NOW = "2026-07-01T00:00:00.000Z";
const SESSION_SETUP_TOKEN = "SESSION_SETUP_TOKEN_1b7f0c";

interface SessionSetupSnapshot {
	readonly sessionId: string;
	readonly sandboxPath: string;
	readonly adapterType: string | undefined;
	readonly sessionConfig: SessionConfig;
	readonly files: ReadonlyMap<string, string>;
	readonly dirs: ReadonlyMap<string, boolean>;
}

type Bridge = NonNullable<Parameters<typeof runThroughHarness>[1]["bridge"]>;

function laneFor(name: string): HarnessLane {
	const found = SUPPORTED_HARNESS_LANES.find((lane) => lane.harnessName === name);
	if (!found) throw new Error(`laneFor: no lane for harness "${name}"`);
	return found;
}

function harnessTypeFor(lane: HarnessLane): string {
	if (lane.harnessName === "claude") return "claude-code";
	return lane.harnessName;
}

function modelProviderFor(lane: HarnessLane): string {
	return lane.harnessName === "claude" ? "anthropic" : "openai-compatible";
}

async function seedSessionSetupDomain(
	db: HyperIdleDb,
	opts: {
		lane: HarnessLane;
		taskId: string;
		agentId: string;
		teamId: string;
		tmId: string;
		betId: string;
	},
): Promise<void> {
	await db.insert(teams).values({
		id: opts.teamId,
		name: `Session setup ${opts.lane.harnessName} team`,
		phase: "build",
		createdAt: NOW,
	});
	await db
		.insert(teamMembers)
		.values({ id: opts.tmId, teamId: opts.teamId, capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: opts.betId,
		teamId: opts.teamId,
		description: `Session setup bet ${SESSION_SETUP_TOKEN}`,
		appetite: "small",
		status: "active",
		doneCondition: `Prepare instructions before harness start ${SESSION_SETUP_TOKEN}`,
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: opts.agentId,
		kind: "ai",
		name: `Session setup ${opts.lane.harnessName} builder`,
		role: "builder",
		status: "active",
		teamId: opts.tmId,
		harnessType: harnessTypeFor(opts.lane),
		modelProvider: modelProviderFor(opts.lane),
		systemPrompt: `You are the session setup persona. ${SESSION_SETUP_TOKEN}`,
		maxConcurrentSessions: 1,
		costCap: null,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: opts.taskId,
		betId: opts.betId,
		teamId: opts.teamId,
		title: `Session setup task ${opts.lane.harnessName}`,
		description: `Inspect prepared session surfaces before any LLM call. ${SESSION_SETUP_TOKEN}`,
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await createKnowledgeItem(db, {
		layer: "L4",
		kind: "principle",
		title: `Session setup knowledge ${opts.lane.harnessName}.md`,
		body: `# Session setup Knowledge\n\nKnowledge surface token: ${SESSION_SETUP_TOKEN}`,
		format: "markdown",
		status: "active",
		updatedBy: "system",
	});
}

function readTextFiles(root: string): Map<string, string> {
	const out = new Map<string, string>();
	function visit(dir: string): void {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const abs = path.join(dir, entry.name);
			const rel = path.relative(root, abs);
			if (entry.isDirectory()) {
				visit(abs);
				continue;
			}
			if (entry.isFile()) {
				try {
					out.set(rel, fs.readFileSync(abs, "utf-8"));
				} catch {
					// Binary or unreadable auth files are irrelevant to session setup assertions.
				}
			}
		}
	}
	visit(root);
	return out;
}

function captureSessionSetup(ctx: {
	readonly sessionId: string;
	readonly sandboxPath: string;
	readonly adapter: { readonly meta: { readonly type?: string } };
	readonly sessionConfig: SessionConfig;
}): SessionSetupSnapshot {
	const dirs = new Map<string, boolean>();
	for (const rel of ["context", "knowledge", "work", ".fabric"]) {
		const abs = path.join(ctx.sandboxPath, rel);
		dirs.set(rel, fs.existsSync(abs) && fs.statSync(abs).isDirectory());
	}
	return {
		sessionId: ctx.sessionId,
		sandboxPath: ctx.sandboxPath,
		adapterType: ctx.adapter.meta.type,
		sessionConfig: ctx.sessionConfig,
		files: readTextFiles(ctx.sandboxPath),
		dirs,
	};
}

async function runSessionSetupLane(
	lane: HarnessLane,
	ctx: {
		readonly db: HyperIdleDb;
		readonly eventBus: Parameters<typeof runThroughHarness>[1]["eventBus"];
		readonly tmpDir: string;
		readonly bridge?: Bridge;
	},
): Promise<{ readonly snapshot: SessionSetupSnapshot; readonly harnessStarted: boolean }> {
	const ts = Date.now();
	const taskId = `session-setup-task-${lane.harnessName}-${ts}`;
	const agentId = `session-setup-agent-${lane.harnessName}-${ts}`;
	const teamId = `session-setup-team-${lane.harnessName}-${ts}`;
	const tmId = `session-setup-tm-${lane.harnessName}-${ts}`;
	const betId = `session-setup-bet-${lane.harnessName}-${ts}`;

	await seedSessionSetupDomain(ctx.db, { lane, taskId, agentId, teamId, tmId, betId });

	const patchedLane: HarnessLane = {
		...lane,
		prepFn: (runCtx) => {
			const base = lane.prepFn(runCtx);
			return {
				...base,
				params: { ...base.params, taskId, agentId, productId: teamId },
			};
		},
	};

	let snapshot: SessionSetupSnapshot | null = null;
	let harnessStarted = false;
	const { result } = await runThroughHarness(patchedLane, {
		db: ctx.db,
		eventBus: ctx.eventBus,
		tmpDir: ctx.tmpDir,
		...(ctx.bridge ? { bridge: ctx.bridge } : {}),
		skipHarnessAuthPrep: true,
		onBeforeHarnessStart: (preStartCtx) => {
			snapshot = captureSessionSetup(preStartCtx);
			return "abort";
		},
		onHarnessStarted: () => {
			harnessStarted = true;
		},
	});

	expect(result.totalCostCents).toBe(0);
	expect(result.outcome).toBe("completed");
	expect(harnessStarted).toBe(false);
	expect(snapshot).not.toBeNull();
	return { snapshot: snapshot!, harnessStarted };
}

function textFile(snapshot: SessionSetupSnapshot, relPath: string): string {
	const content = snapshot.files.get(relPath);
	expect(content, `${relPath} should be prepared`).toBeDefined();
	return content ?? "";
}

function expectCoreSessionSetup(snapshot: SessionSetupSnapshot, lane: HarnessLane): void {
	expect(snapshot.adapterType).toBe(harnessTypeFor(lane));
	expect(snapshot.sessionConfig.sessionId).toBe(snapshot.sessionId);
	expect(snapshot.sessionConfig.sandboxPath).toBe(snapshot.sandboxPath);
	expect(snapshot.sessionConfig.assembledPrompt).toContain(SESSION_SETUP_TOKEN);
	expect(snapshot.sessionConfig.assembledPrompt).toContain("## Available Tools");
	expect(snapshot.sessionConfig.assembledPrompt).toContain("submit_review");
	expect(snapshot.sessionConfig.tools).toContain("submit_review");
	expect(snapshot.sessionConfig.tools).toContain("write_session_notes");

	expect(textFile(snapshot, "AGENTS.md")).toBe(snapshot.sessionConfig.assembledPrompt);
	expect(textFile(snapshot, "CLAUDE.md")).toBe(snapshot.sessionConfig.assembledPrompt);

	for (const rel of ["context", "knowledge", "work", ".fabric"]) {
		expect(snapshot.dirs.get(rel), `${rel} directory should exist`).toBe(true);
	}
	const manifest = JSON.parse(textFile(snapshot, ".fabric/manifest.json")) as {
		readonly session_id: string;
		readonly items: Record<string, { readonly source_path: string }>;
	};
	expect(manifest.session_id).toBe(snapshot.sessionId);
	const preparedKnowledge = Object.values(manifest.items).find((item) =>
		snapshot.files
			.get(item.source_path)
			?.includes(`Knowledge surface token: ${SESSION_SETUP_TOKEN}`),
	);
	expect(preparedKnowledge, "seeded L4 knowledge item should be in manifest").toBeDefined();
	expect(preparedKnowledge?.source_path).toMatch(/^context\/factory\//);
	expect(textFile(snapshot, preparedKnowledge?.source_path ?? "")).toContain(
		`Knowledge surface token: ${SESSION_SETUP_TOKEN}`,
	);

	for (const toolName of ["submit_review", "write_session_notes"]) {
		expect(snapshot.sessionConfig.tools).toContain(toolName);
		expect(snapshot.sessionConfig.assembledPrompt).toContain(toolName);
	}
}

function expectHarnessSpecificSessionSetup(
	snapshot: SessionSetupSnapshot,
	lane: HarnessLane,
): void {
	if (lane.harnessName === "builtin") {
		expect(snapshot.files.has(".codex-home/config.toml")).toBe(false);
		expect(snapshot.files.has(".codex-home/hooks.json")).toBe(false);
		expect(snapshot.files.has(".codex-home/return-check.sh")).toBe(false);
		expect(snapshot.files.has("opencode.json")).toBe(false);
		expect(snapshot.files.has(".opencode/plugins/return-signal.ts")).toBe(false);
		expect(snapshot.files.has(".claude/settings.json")).toBe(false);
		expect(snapshot.files.has(".claude/return-check.sh")).toBe(false);
		return;
	}

	const mcpJson = JSON.parse(textFile(snapshot, ".mcp.json")) as {
		readonly mcpServers: { readonly hyperidle?: { readonly type: string; readonly url: string } };
	};
	expect(mcpJson.mcpServers.hyperidle?.type).toBe("http");
	expect(mcpJson.mcpServers.hyperidle?.url).toContain("/api/mcp/");

	if (lane.harnessName === "claude") {
		const settings = JSON.parse(textFile(snapshot, ".claude/settings.json")) as {
			readonly enableAllProjectMcpServers?: boolean;
			readonly hooks?: Record<string, unknown>;
		};
		expect(settings.enableAllProjectMcpServers).toBe(true);
		expect(JSON.stringify(settings.hooks)).toContain("return-check.sh");
		expect(textFile(snapshot, ".claude/return-check.sh")).toContain("/return-status");
		return;
	}

	if (lane.harnessName === "codex") {
		const configToml = textFile(snapshot, ".codex-home/config.toml");
		expect(configToml).toContain("[mcp_servers.hyperidle]");
		expect(configToml).toContain('bearer_token_env_var = "HYPERIDLE_MCP_TOKEN"');
		expect(snapshot.sessionConfig.mcpTokenEnv?.HYPERIDLE_MCP_TOKEN).toBeTruthy();
		expect(textFile(snapshot, ".codex-home/hooks.json")).toContain("return-check.sh");
		expect(textFile(snapshot, ".codex-home/return-check.sh")).toContain("/return-status");
		return;
	}

	const opencode = JSON.parse(textFile(snapshot, "opencode.json")) as {
		readonly mcp: {
			readonly hyperidle?: {
				readonly type: string;
				readonly url: string;
				readonly headers?: { readonly Authorization?: string };
				readonly enabled?: boolean;
			};
		};
	};
	expect(opencode.mcp.hyperidle?.type).toBe("remote");
	expect(opencode.mcp.hyperidle?.url).toContain("/api/mcp/");
	expect(opencode.mcp.hyperidle?.headers?.Authorization).toMatch(/^Bearer [a-f0-9]+$/);
	expect(opencode.mcp.hyperidle?.enabled).toBe(true);
	expect(textFile(snapshot, ".opencode/plugins/return-signal.ts")).toContain("/return-status");
}

async function runAndAssert(
	lane: HarnessLane,
	ctx: {
		readonly db: HyperIdleDb;
		readonly eventBus: Parameters<typeof runThroughHarness>[1]["eventBus"];
		readonly tmpDir: string;
		readonly bridge?: Bridge;
	},
): Promise<void> {
	const { snapshot, harnessStarted } = await runSessionSetupLane(lane, ctx);
	expect(harnessStarted).toBe(false);
	expectCoreSessionSetup(snapshot, lane);
	expectHarnessSpecificSessionSetup(snapshot, lane);
}

describe(`${laneFor("builtin").describeTag} session setup before builtin start`, () => {
	requireHarness("builtin");

	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-setup-builtin-"));
		clearDeduplicationCache();
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("prepares production prompt, context, knowledge, and tools before start; abort prevents LLM call", async ({
		db,
		eventBus,
	}) => {
		await runAndAssert(laneFor("builtin"), { db, eventBus, tmpDir });
	}, 60_000);
});

describe(`${laneFor("claude").describeTag} session setup before claude start`, () => {
	requireHarness("claude");

	let tmpDir: string;
	let bridge: Bridge | null = null;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-setup-claude-"));
		clearDeduplicationCache();
		setActiveStrategy(fabricStrategy);
		bridge = await startMcpBridgeServer();
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (bridge) await bridge.close();
		bridge = null;
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("prepares claude MCP config and return hook before start; abort prevents CLI spawn", async ({
		db,
		eventBus,
	}) => {
		if (!bridge) throw new Error("bridge not set up");
		await runAndAssert(laneFor("claude"), { db, eventBus, tmpDir, bridge });
	}, 60_000);
});

describe(`${laneFor("codex").describeTag} session setup before codex start`, () => {
	requireHarness("codex");

	let tmpDir: string;
	let bridge: Bridge | null = null;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-setup-codex-"));
		clearDeduplicationCache();
		setActiveStrategy(fabricStrategy);
		bridge = await startMcpBridgeServer();
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (bridge) await bridge.close();
		bridge = null;
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("prepares codex MCP config and CODEX_HOME return hook before start; abort prevents CLI spawn", async ({
		db,
		eventBus,
	}) => {
		if (!bridge) throw new Error("bridge not set up");
		await runAndAssert(laneFor("codex"), { db, eventBus, tmpDir, bridge });
	}, 60_000);
});

describe(`${laneFor("opencode").describeTag} session setup before opencode start`, () => {
	requireHarness("opencode");

	let tmpDir: string;
	let bridge: Bridge | null = null;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-setup-opencode-"));
		clearDeduplicationCache();
		setActiveStrategy(fabricStrategy);
		bridge = await startMcpBridgeServer();
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (bridge) await bridge.close();
		bridge = null;
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("prepares opencode MCP config and return plugin before start; abort prevents CLI spawn", async ({
		db,
		eventBus,
	}) => {
		if (!bridge) throw new Error("bridge not set up");
		await runAndAssert(laneFor("opencode"), { db, eventBus, tmpDir, bridge });
	}, 60_000);
});
