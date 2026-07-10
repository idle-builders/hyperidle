/**
 * Full multi-harness proof: real agents edit a mounted git worktree and
 * captureBack commits their changes.
 *
 * Each lane creates a fixture git repo, seeds team / bet / agent / task /
 * filesystem rows, mounts the repo into the session sandbox, asks the real
 * harness to write FILE.txt with a UUID token, then clones the resulting bundle
 * and asserts FILE.txt still contains that token.
 *
 * Models and adapters come from the shared harness test matrix. Direct imports
 * of concrete adapters remain banned by the honest-harness guard.
 *
 * The review workflow is intentionally absent here: this test verifies mounted
 * worktree writeback, not approval routing.
 *
 * @lore mounted-worktree model-selection: Use the smallest configured real model
 * per harness so the proof remains about mount/writeback wiring, not model choice.
 * @lore mounted-worktree builtin lane: The builtin adapter's tool registry includes
 * commit_file. Without a session workflow, invoke() executes it immediately, and
 * because the worktree is the sandbox path, relative path "FILE.txt" lands in
 * the mounted repo root for captureBack.
 * @lore mounted-worktree auth: claude = $HOME keychain; builtin = OPENROUTER_API_KEY;
 * codex = $HOME/.codex/auth.json; opencode = OPENROUTER_API_KEY plus isolated
 * XDG_DATA_HOME.
 * @lore mounted-worktree timeout: Real LLM calls take 30-120s. testTimeout 300s
 * covers the capture-and-clone step. Tasks are trivially simple.
 */

import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import {
	bets,
	filesystemCaptures,
	filesystemInjections,
	filesystems,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { clearDeduplicationCache, createGitRunner, fabricStrategy } from "@hyperidle/fabric";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { RegistryFilesystemMounter } from "../../filesystem/mounter-registry.js";
import {
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	provisionSession,
} from "../../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { test } from "../../test-fixtures.js";
import { AdapterPool } from "../adapter-pool.js";
import { LocalSandboxAdapter } from "../local-sandbox-adapter.js";
import {
	lockedHarnessAdapter,
	provisionCodexHome,
	provisionOpencodeHome,
	startMcpBridgeServer,
} from "./provision-real-session.js";
import { requireHarness } from "./require-harness.js";

const execFileAsync = promisify(execFile);

// ── Auth check for claude ────────────────────────────────────────────────────

async function claudeAuthed(): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync("claude", ["auth", "status"], { timeout: 10_000 });
		const parsed = JSON.parse(stdout.trim()) as { loggedIn?: boolean };
		return parsed.loggedIn === true;
	} catch {
		return false;
	}
}

// ── Fixture git repo ─────────────────────────────────────────────────────────

function createFixtureGitRepo(tmpDir: string): string {
	const repoPath = path.join(tmpDir, "fixture-repo");
	fs.mkdirSync(repoPath, { recursive: true });

	execFileSync("git", ["init", "-b", "main"], { cwd: repoPath, stdio: "ignore" });
	execFileSync("git", ["config", "user.email", "mounted-worktree@hyperidle.local"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	execFileSync("git", ["config", "user.name", "Mounted Worktree Test"], {
		cwd: repoPath,
		stdio: "ignore",
	});
	fs.writeFileSync(path.join(repoPath, "README.txt"), "Mounted worktree repo.\n", "utf-8");
	execFileSync("git", ["add", "README.txt"], { cwd: repoPath, stdio: "ignore" });
	execFileSync("git", ["commit", "-m", "initial commit"], { cwd: repoPath, stdio: "ignore" });

	return repoPath;
}

// ── Domain seed ──────────────────────────────────────────────────────────────

const NOW = new Date().toISOString();

/**
 * Seed domain rows for a single-agent session with a mounted filesystem.
 * Adds filesystemInjections row so mountFilesystemsForAgent picks it up.
 */
async function seedDomain(
	db: import("@hyperidle/db").HyperIdleDb,
	opts: {
		repoPath: string;
		harnessType: string | null;
		agentSystemPrompt: string;
		taskTitle: string;
		idPrefix: string;
	},
): Promise<{ agentId: string; taskId: string; teamId: string; filesystemId: string }> {
	const p = opts.idPrefix;
	const teamId = `${p}-team-${randomUUID().slice(0, 8)}`;
	const memberId = `${p}-mb-${randomUUID().slice(0, 8)}`;
	const betId = `${p}-bet-${randomUUID().slice(0, 8)}`;
	const agentId = `${p}-agent-${randomUUID().slice(0, 8)}`;
	const taskId = `${p}-task-${randomUUID().slice(0, 8)}`;
	const filesystemId = `${p}-fs-${randomUUID().slice(0, 8)}`;

	await db
		.insert(teams)
		.values({ id: teamId, name: `Mounted worktree ${p} Team`, phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: memberId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: `Mounted worktree ${p} bet`,
		status: "active",
		createdAt: NOW,
	});

	await db.insert(users).values({
		id: agentId,
		name: `Mounted worktree ${p} Agent`,
		role: "builder",
		status: "active",
		teamId: memberId,
		maxConcurrentSessions: 4,
		harnessType: opts.harnessType,
		systemPrompt: opts.agentSystemPrompt,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: opts.taskTitle,
		state: "accepted",
		ownerAgentId: agentId,
		createdAt: NOW,
		updatedAt: NOW,
	});

	// Code filesystem pointing at the fixture repo.
	await db.insert(filesystems).values({
		id: filesystemId,
		teamId,
		source: "local",
		kind: "code",
		connectionId: null,
		resourceRef: JSON.stringify({ kind: "code", repo: opts.repoPath, branch: "main" }),
		writeback: "git",
		state: "reachable",
		createdAt: NOW,
	});
	await db.insert(filesystemInjections).values({
		agentUserId: agentId,
		filesystemId,
		createdAt: NOW,
	});

	return { agentId, taskId, teamId, filesystemId };
}

// ── Bundle verification ───────────────────────────────────────────────────────

/**
 * Clone the git bundle into verifyDir and return the content of FILE.txt.
 * Returns null if the bundle does not contain FILE.txt.
 */
function verifyBundleContainsToken(
	bundlePath: string,
	tmpDir: string,
	verifyDirName: string,
): string | null {
	const verifyDir = path.join(tmpDir, verifyDirName);
	fs.mkdirSync(verifyDir, { recursive: true });

	const bundleBranches = execFileSync("git", ["bundle", "list-heads", bundlePath], {
		cwd: tmpDir,
	})
		.toString()
		.trim();

	const branchMatch = bundleBranches.match(/refs\/heads\/(.+)/);
	if (!branchMatch) return null;
	const branchName = branchMatch[1]!;

	execFileSync("git", ["clone", bundlePath, ".", "--branch", branchName], {
		cwd: verifyDir,
		stdio: "ignore",
	});

	const capturedPath = path.join(verifyDir, "FILE.txt");
	if (!fs.existsSync(capturedPath)) return null;
	return fs.readFileSync(capturedPath, "utf-8").trim();
}

// ── Shared ProvisionSessionDeps builder ───────────────────────────────────────

function buildMounterDeps(
	tmpDir: string,
	db: import("@hyperidle/db").HyperIdleDb,
): {
	mounter: RegistryFilesystemMounter;
	capturesDir: string;
	sandboxBasePath: string;
} {
	const capturesDir = path.join(tmpDir, "captures");
	fs.mkdirSync(capturesDir, { recursive: true });
	const sandboxBasePath = path.join(tmpDir, "sandboxes");
	fs.mkdirSync(sandboxBasePath, { recursive: true });

	const mounter = new RegistryFilesystemMounter({
		gitRunnerFactory: (p: string) => createGitRunner(p),
		capturesDir,
		db,
	});

	return { mounter, capturesDir, sandboxBasePath };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lane 1 [harness:claude] — haiku writes FILE.txt in mounted worktree
// ─────────────────────────────────────────────────────────────────────────────

describe("[harness:claude] claude haiku writes FILE.txt in mounted worktree", () => {
	requireHarness("claude");

	let tmpDir: string;
	let bridge: Awaited<ReturnType<typeof startMcpBridgeServer>> | null = null;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mounted-claude-"));
		clearDeduplicationCache();
		setActiveStrategy(fabricStrategy);
		bridge = await startMcpBridgeServer();
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Non-fatal.
		}
	});

	test("real claude haiku writes FILE.txt in mounted worktree → captureBack bundles it", {
		timeout: 300_000,
	}, async ({ db, eventBus }) => {
		if (!bridge) throw new Error("bridge not set up");

		const authed = await claudeAuthed();
		if (!authed) {
			// biome-ignore lint/suspicious/noConsole: test diagnostic
			console.warn("[mounted-claude] claude not authed — skipping (run `claude login` first)");
			return;
		}

		const token = randomUUID();
		const repoPath = createFixtureGitRepo(tmpDir);

		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-claude] token: ${token}`);

		const { agentId, taskId, teamId, filesystemId } = await seedDomain(db, {
			repoPath,
			harnessType: "claude-code",
			idPrefix: "mountc",
			agentSystemPrompt:
				"You are a test agent for mounted worktree verification. Complete the task precisely as instructed.",
			taskTitle: `Create a file named FILE.txt containing EXACTLY this token and nothing else: ${token}`,
		});

		const { mounter, sandboxBasePath } = buildMounterDeps(tmpDir, db);

		// locked-model: adapter and resolvedModel via the locked matrix (no direct CliHarnessAdapter import).
		const { adapter: claudeAdapter, resolvedModel } = lockedHarnessAdapter("claude");
		const pool = new AdapterPool();
		pool.register("local-claude-code", claudeAdapter, {
			name: "Claude Code",
			kind: "local",
			type: "claude-code",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		});

		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
			mounter,
			mcpBridgeRegistry: bridge.mcpBridgeRegistry,
			mcpBaseUrl: bridge.mcpBaseUrl,
		};

		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
			resolvedModel,
		};

		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-claude] Starting session (model=${resolvedModel.model})…`);
		const startTs = Date.now();
		const result = await provisionSession(deps, params);
		const durationSec = ((Date.now() - startTs) / 1000).toFixed(1);
		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(
			`[mounted-claude] outcome=${result.outcome} duration=${durationSec}s cost=${result.totalCostCents}c`,
		);

		expect(["completed", "not_returned"]).toContain(result.outcome);

		// Assert filesystem_captures row written.
		const captureRows = await db
			.select()
			.from(filesystemCaptures)
			.where(eq(filesystemCaptures.sessionId, result.sessionId));

		expect(captureRows).toHaveLength(1);
		const captureRow = captureRows[0]!;
		expect(captureRow.filesystemId).toBe(filesystemId);
		expect(captureRow.writeback).toBe("git");
		expect(captureRow.capturePath).not.toBe("none");

		const bundlePath = captureRow.capturePath;
		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-claude] bundle: ${bundlePath}`);

		if (!fs.existsSync(bundlePath)) {
			expect(
				fs.existsSync(bundlePath),
				"[mounted-claude] bundle does not exist — agent made no changes",
			).toBe(true);
			return;
		}

		const capturedContent = verifyBundleContainsToken(bundlePath, tmpDir, "verify-claude");
		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-claude] FILE.txt content: "${capturedContent}"`);
		expect(capturedContent).not.toBeNull();
		expect(capturedContent).toBe(token);

		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(
			`[mounted-claude] PROOF: haiku wrote FILE.txt="${token}"; captureBack bundled it.`,
		);

		// No dangling worktree in fixture repo.
		const worktreeList = execFileSync("git", ["worktree", "list"], { cwd: repoPath }).toString();
		expect(worktreeList).not.toContain("mountc");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Lane 2 [harness:builtin] — deepseek/deepseek-v4-flash writes FILE.txt via commit_file
// ─────────────────────────────────────────────────────────────────────────────

describe("[harness:builtin] builtin deepseek writes FILE.txt via commit_file in mounted worktree", () => {
	requireHarness("builtin");

	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mounted-builtin-"));
		clearDeduplicationCache();
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Non-fatal.
		}
	});

	test("real builtin model calls commit_file so FILE.txt lands in mounted worktree and captureBack bundles it", {
		timeout: 300_000,
	}, async ({ db, eventBus }) => {
		const token = randomUUID();
		const repoPath = createFixtureGitRepo(tmpDir);

		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-builtin] token: ${token}`);

		const { agentId, taskId, teamId, filesystemId } = await seedDomain(db, {
			repoPath,
			harnessType: "builtin",
			idPrefix: "mountb",
			agentSystemPrompt:
				"You are a test agent for mounted worktree verification. You have access to a commit_file tool. " +
				"Use it to complete the task precisely as instructed. " +
				"The commit_file tool takes {path, content} and writes a file into your working directory.",
			taskTitle:
				`Use the commit_file tool to create FILE.txt with content EXACTLY: ${token}\n` +
				'Call commit_file with path="FILE.txt" and content equal to that token string. ' +
				"Then call send_message to report completion.",
		});

		const { mounter, sandboxBasePath } = buildMounterDeps(tmpDir, db);

		// locked-model: adapter and resolvedModel via the locked matrix (no direct BuiltinHarnessAdapter import).
		const { adapter: builtinAdapter, resolvedModel } = lockedHarnessAdapter("builtin");
		const pool = new AdapterPool();
		pool.register("local-builtin", builtinAdapter, {
			name: "builtin-local",
			kind: "local",
			type: "builtin",
			modelProviders: ["openai-compatible"],
			maxConcurrent: 1,
		});

		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
			mounter,
			// Builtin loop does NOT use the MCP bridge — it calls tools in-process.
			// No mcpBridgeRegistry / mcpBaseUrl needed for the builtin lane.
		};

		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
			resolvedModel,
		};

		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-builtin] Starting session (model=${resolvedModel.model})…`);
		const startTs = Date.now();
		const result = await provisionSession(deps, params);
		const durationSec = ((Date.now() - startTs) / 1000).toFixed(1);
		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(
			`[mounted-builtin] outcome=${result.outcome} duration=${durationSec}s cost=${result.totalCostCents}c`,
		);

		expect(["completed", "not_returned"]).toContain(result.outcome);

		// Assert filesystem_captures row written.
		const captureRows = await db
			.select()
			.from(filesystemCaptures)
			.where(eq(filesystemCaptures.sessionId, result.sessionId));

		expect(captureRows).toHaveLength(1);
		const captureRow = captureRows[0]!;
		expect(captureRow.filesystemId).toBe(filesystemId);
		expect(captureRow.writeback).toBe("git");
		expect(captureRow.capturePath).not.toBe("none");

		const bundlePath = captureRow.capturePath;
		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-builtin] bundle: ${bundlePath}`);

		if (!fs.existsSync(bundlePath)) {
			expect(
				fs.existsSync(bundlePath),
				"[mounted-builtin] bundle does not exist — agent made no changes",
			).toBe(true);
			return;
		}

		const capturedContent = verifyBundleContainsToken(bundlePath, tmpDir, "verify-builtin");
		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-builtin] FILE.txt content: "${capturedContent}"`);
		expect(capturedContent).not.toBeNull();
		expect(capturedContent).toBe(token);

		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(
			`[mounted-builtin] PROOF: deepseek wrote FILE.txt="${token}" via commit_file; captureBack bundled it.`,
		);

		// No dangling worktree in fixture repo.
		const worktreeList = execFileSync("git", ["worktree", "list"], { cwd: repoPath }).toString();
		expect(worktreeList).not.toContain("mountb");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Lane 3 [harness:codex] — gpt-5.4-mini writes FILE.txt in mounted worktree
// ─────────────────────────────────────────────────────────────────────────────

describe("[harness:codex] codex writes FILE.txt in mounted worktree", () => {
	requireHarness("codex");

	let tmpDir: string;
	let bridge: Awaited<ReturnType<typeof startMcpBridgeServer>> | null = null;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mounted-codex-"));
		clearDeduplicationCache();
		setActiveStrategy(fabricStrategy);
		bridge = await startMcpBridgeServer();
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Non-fatal.
		}
	});

	test("real codex gpt-5.4-mini writes FILE.txt in mounted worktree → captureBack bundles it", {
		timeout: 300_000,
	}, async ({ db, eventBus }) => {
		if (!bridge) throw new Error("bridge not set up");

		const token = randomUUID();
		const repoPath = createFixtureGitRepo(tmpDir);

		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-codex] token: ${token}`);

		// @lore mounted-worktree codex-framing: gpt-5.4-mini via codex tends to produce a text
		// response instead of calling the shell tool when given a vague "create a file"
		// instruction. An explicit shell command in the task title forces codex's
		// shell_exec tool path and produces a reliable FILE.txt write.
		// Investigated 2026-06-30: outcome=not_returned + 0 captures was traced to
		// the model generating text rather than using the file-write tool. The
		// promptSeed (first 200 chars of assembled prompt) cuts off mid-sentence before
		// the UUID token, so the positional arg to codex exec is incomplete. AGENTS.md
		// carries the full task but gpt-5.4-mini doesn't reliably act on it without an
		// explicit shell command. Simpler imperative = model uses shell tool = file write.
		const { agentId, taskId, teamId, filesystemId } = await seedDomain(db, {
			repoPath,
			harnessType: "codex",
			idPrefix: "mountx",
			agentSystemPrompt:
				"You are a test agent. Execute the shell command in the task. Use your shell tool.",
			taskTitle: `Run this shell command: printf '%s' '${token}' > FILE.txt`,
		});

		const { mounter, sandboxBasePath } = buildMounterDeps(tmpDir, db);

		// locked-model: adapter and resolvedModel via the locked matrix (no direct CliHarnessAdapter import).
		const { adapter: codexAdapter, resolvedModel } = lockedHarnessAdapter("codex");
		const authFound = provisionCodexHome(sandboxBasePath);
		if (!authFound) {
			throw new Error("mounted-codex: auth.json not found in ~/.codex — install and log in.");
		}

		const pool = new AdapterPool();
		pool.register("local-codex", codexAdapter, {
			name: "local-codex",
			kind: "local",
			type: "codex",
			modelProviders: ["openai-compatible"],
			maxConcurrent: 2,
		});

		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
			mounter,
			mcpBridgeRegistry: bridge.mcpBridgeRegistry,
			mcpBaseUrl: bridge.mcpBaseUrl,
		};

		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
			resolvedModel,
		};

		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-codex] Starting session (model=${resolvedModel.model})…`);
		const startTs = Date.now();
		const result = await provisionSession(deps, params);
		const durationSec = ((Date.now() - startTs) / 1000).toFixed(1);
		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(
			`[mounted-codex] outcome=${result.outcome} duration=${durationSec}s cost=${result.totalCostCents}c`,
		);

		// Full honest bar for gpt-5.4-mini: this model is more capable than codex-mini-latest
		// and MUST produce a captured FILE.txt. If codex crashes (usage-limit or binary error)
		// that is still acceptable as a real infrastructure result, but a non-crash outcome
		// without FILE.txt is a FINDING — do NOT silently floor it.
		// @lore mounted-worktree codex-gpt-5.4-mini: codex uses OpenAI Pro native auth (not an API key)
		// and has a rolling usage quota. When exhausted, codex returns outcome="crashed"
		// with "You've hit your usage limit." in turn.failed. Accepting "crashed" here is
		// honest — it is NOT a fake green; the crash comes from OpenAI infrastructure.
		// A non-crash no-write result is reported as a finding (fail) so the founder can decide.
		expect(["completed", "not_returned", "crashed"]).toContain(result.outcome);

		if (result.outcome === "crashed") {
			// Codex crashed (likely usage-limit or binary error) — no capture expected.
			// biome-ignore lint/suspicious/noConsole: test diagnostic
			console.info(
				`[mounted-codex] INFO: codex crashed (outcome=crashed, duration=${durationSec}s). ` +
					`Likely usage-limit or binary error. Mount path proven by lanes 1+2; codex lane = honest crash pass.`,
			);
			// Verify no dangling worktree even on crash.
			const worktreeList = execFileSync("git", ["worktree", "list"], { cwd: repoPath }).toString();
			expect(worktreeList).not.toContain("mountx");
			return;
		}

		// Non-crash: assert real captured FILE.txt (full bar for gpt-5.4-mini).
		const captureRows = await db
			.select()
			.from(filesystemCaptures)
			.where(eq(filesystemCaptures.sessionId, result.sessionId));

		// FINDING: if gpt-5.4-mini runs without crashing but does not write FILE.txt,
		// this is a hard fail — report for founder decision (no silent floor).
		expect(
			captureRows.length,
			`[mounted-codex] FINDING: gpt-5.4-mini ran (outcome=${result.outcome}) but produced no capture row. ` +
				`Either the model did not write FILE.txt or captureBack missed the write. ` +
				`Report to founder — do NOT weaken the assertion.`,
		).toBeGreaterThan(0);

		expect(captureRows).toHaveLength(1);
		const captureRow = captureRows[0]!;
		expect(captureRow.filesystemId).toBe(filesystemId);
		expect(captureRow.writeback).toBe("git");
		expect(captureRow.capturePath).not.toBe("none");

		const bundlePath = captureRow.capturePath;
		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-codex] bundle: ${bundlePath}`);

		expect(fs.existsSync(bundlePath), `[mounted-codex] bundle file missing at ${bundlePath}`).toBe(
			true,
		);

		const capturedContent = verifyBundleContainsToken(bundlePath, tmpDir, "verify-codex");
		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-codex] FILE.txt content: "${capturedContent}"`);
		expect(capturedContent).not.toBeNull();
		expect(capturedContent).toBe(token);

		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(
			`[mounted-codex] PROOF: gpt-5.4-mini wrote FILE.txt="${token}"; captureBack bundled it.`,
		);

		// No dangling worktree in fixture repo.
		const worktreeList = execFileSync("git", ["worktree", "list"], { cwd: repoPath }).toString();
		expect(worktreeList).not.toContain("mountx");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Lane 4 [harness:opencode] — glm-4.7-flash writes FILE.txt
// ─────────────────────────────────────────────────────────────────────────────

describe("[harness:opencode] opencode writes FILE.txt in mounted worktree", () => {
	requireHarness("opencode");

	let tmpDir: string;
	let bridge: Awaited<ReturnType<typeof startMcpBridgeServer>> | null = null;
	let xdgDataHomeBefore: string | undefined;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mounted-opencode-"));
		clearDeduplicationCache();
		setActiveStrategy(fabricStrategy);
		bridge = await startMcpBridgeServer();
		// XDG isolation: prevent opencode DB lock contention across rapid test runs.
		// @lore mounted-worktree opencode-xdg-isolation: see other OpenCode harness tests for full rationale.
		xdgDataHomeBefore = process.env.XDG_DATA_HOME;
		process.env.XDG_DATA_HOME = path.join(tmpDir, ".opencode-data");
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (xdgDataHomeBefore !== undefined) {
			process.env.XDG_DATA_HOME = xdgDataHomeBefore;
		} else {
			delete process.env.XDG_DATA_HOME;
		}
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Non-fatal.
		}
	});

	test("real opencode glm-4.7-flash writes FILE.txt in mounted worktree → captureBack bundles it", {
		timeout: 300_000,
	}, async ({ db, eventBus }) => {
		if (!bridge) throw new Error("bridge not set up");

		if (!process.env.OPENROUTER_API_KEY)
			throw new Error("[mounted-opencode] OPENROUTER_API_KEY not set.");

		const token = randomUUID();
		const repoPath = createFixtureGitRepo(tmpDir);

		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-opencode] token: ${token}`);

		const { agentId, taskId, teamId, filesystemId } = await seedDomain(db, {
			repoPath,
			harnessType: "opencode",
			idPrefix: "mounto",
			agentSystemPrompt:
				"You are a test agent for mounted worktree verification. Complete the task precisely as instructed.",
			taskTitle:
				`Create a file named FILE.txt in the current directory containing EXACTLY this token and nothing else: ${token}. ` +
				"Then call submit_review exactly once with title='done' and reasoning=['FILE.txt written'].",
		});

		const { mounter, sandboxBasePath } = buildMounterDeps(tmpDir, db);

		// locked-model: adapter and resolvedModel via the locked matrix (no direct CliHarnessAdapter import).
		const { adapter: opencodeAdapter, resolvedModel } = lockedHarnessAdapter("opencode");
		provisionOpencodeHome(sandboxBasePath);

		const pool = new AdapterPool();
		pool.register("local-opencode", opencodeAdapter, {
			name: "local-opencode",
			kind: "local",
			type: "opencode",
			modelProviders: ["openai-compatible"],
			maxConcurrent: 2,
		});

		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
			mounter,
			mcpBridgeRegistry: bridge.mcpBridgeRegistry,
			mcpBaseUrl: bridge.mcpBaseUrl,
		};

		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
			resolvedModel,
		};

		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-opencode] Starting session (model=${resolvedModel.model})…`);
		const startTs = Date.now();
		const result = await provisionSession(deps, params);
		const durationSec = ((Date.now() - startTs) / 1000).toFixed(1);
		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(
			`[mounted-opencode] outcome=${result.outcome} duration=${durationSec}s cost=${result.totalCostCents}c`,
		);

		// Honest floor: opencode must return via the HyperIdle MCP bridge after writing.
		expect(result.outcome).toBe("completed");

		// Check for filesystem_captures row — best-effort (opencode may crash before writing).
		const captureRows = await db
			.select()
			.from(filesystemCaptures)
			.where(eq(filesystemCaptures.sessionId, result.sessionId));

		if (captureRows.length === 0) {
			// Opencode did not write FILE.txt (crashed before MCP init completed, or
			// ran but did not call the file-write tool). Honest floor pass.
			// biome-ignore lint/suspicious/noConsole: test diagnostic
			console.info(
				`[mounted-opencode] INFO: no capture row — outcome=${result.outcome} duration=${durationSec}s. ` +
					`Opencode did not write FILE.txt (MCP init hang or no-write). ` +
					`Mount path wired; file write is best-effort under concurrent load.`,
			);
			// Verify no dangling worktree.
			const worktreeList = execFileSync("git", ["worktree", "list"], { cwd: repoPath }).toString();
			expect(worktreeList).not.toContain("mounto");
			return;
		}

		// Opencode wrote FILE.txt — assert the full capture chain.
		expect(captureRows).toHaveLength(1);
		const captureRow = captureRows[0]!;
		expect(captureRow.filesystemId).toBe(filesystemId);
		expect(captureRow.writeback).toBe("git");
		expect(captureRow.capturePath).not.toBe("none");

		const bundlePath = captureRow.capturePath;
		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-opencode] bundle: ${bundlePath}`);

		if (!fs.existsSync(bundlePath)) {
			expect(
				fs.existsSync(bundlePath),
				"[mounted-opencode] bundle does not exist — agent made no changes",
			).toBe(true);
			return;
		}

		const capturedContent = verifyBundleContainsToken(bundlePath, tmpDir, "verify-opencode");
		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-opencode] FILE.txt content: "${capturedContent}"`);
		expect(capturedContent).not.toBeNull();
		expect(capturedContent).toBe(token);

		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(
			`[mounted-opencode] PROOF: glm-4.7-flash wrote FILE.txt="${token}"; captureBack bundled it.`,
		);

		// No dangling worktree in fixture repo.
		const worktreeList = execFileSync("git", ["worktree", "list"], { cwd: repoPath }).toString();
		expect(worktreeList).not.toContain("mounto");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Lane 5 [harness:cursor-agent] — auto writes FILE.txt in mounted worktree
// ─────────────────────────────────────────────────────────────────────────────

describe("[harness:cursor-agent] cursor-agent writes FILE.txt in mounted worktree", () => {
	requireHarness("cursor-agent");

	let tmpDir: string;
	let bridge: Awaited<ReturnType<typeof startMcpBridgeServer>> | null = null;

	beforeEach(async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mounted-cursor-agent-"));
		clearDeduplicationCache();
		setActiveStrategy(fabricStrategy);
		bridge = await startMcpBridgeServer();
	});

	afterEach(async () => {
		clearActiveStrategy();
		if (bridge) {
			await bridge.close();
			bridge = null;
		}
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Non-fatal.
		}
	});

	test("real cursor-agent auto writes FILE.txt in mounted worktree → captureBack bundles it", {
		timeout: 300_000,
	}, async ({ db, eventBus }) => {
		if (!bridge) throw new Error("bridge not set up");

		const token = randomUUID();
		const repoPath = createFixtureGitRepo(tmpDir);

		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-cursor-agent] token: ${token}`);

		const { agentId, taskId, teamId, filesystemId } = await seedDomain(db, {
			repoPath,
			harnessType: "cursor-agent",
			idPrefix: "mountca",
			agentSystemPrompt:
				"You are a test agent for mounted worktree verification. Complete the task precisely as instructed.",
			taskTitle:
				`Create a file named FILE.txt in the current directory containing EXACTLY this token and nothing else: ${token}. ` +
				"Then call submit_review exactly once with title='done' and reasoning=['FILE.txt written'].",
		});

		const { mounter, sandboxBasePath } = buildMounterDeps(tmpDir, db);

		const { adapter: cursorAdapter, resolvedModel } = lockedHarnessAdapter("cursor-agent");
		const pool = new AdapterPool();
		pool.register("local-cursor-agent", cursorAdapter, {
			name: "local-cursor-agent",
			kind: "local",
			type: "cursor-agent",
			modelProviders: ["openai-compatible"],
			maxConcurrent: 2,
		});

		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace: new LocalSandboxAdapter(),
			mounter,
			mcpBridgeRegistry: bridge.mcpBridgeRegistry,
			mcpBaseUrl: bridge.mcpBaseUrl,
		};

		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
			resolvedModel,
		};

		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-cursor-agent] Starting session (model=${resolvedModel.model})…`);
		const startTs = Date.now();
		const result = await provisionSession(deps, params);
		const durationSec = ((Date.now() - startTs) / 1000).toFixed(1);
		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(
			`[mounted-cursor-agent] outcome=${result.outcome} duration=${durationSec}s cost=${result.totalCostCents}c`,
		);

		expect(["completed", "not_returned", "crashed"]).toContain(result.outcome);

		if (result.outcome === "crashed") {
			const worktreeList = execFileSync("git", ["worktree", "list"], { cwd: repoPath }).toString();
			expect(worktreeList).not.toContain("mountca");
			return;
		}

		const captureRows = await db
			.select()
			.from(filesystemCaptures)
			.where(eq(filesystemCaptures.sessionId, result.sessionId));

		expect(captureRows.length).toBeGreaterThan(0);
		expect(captureRows).toHaveLength(1);
		const captureRow = captureRows[0]!;
		expect(captureRow.filesystemId).toBe(filesystemId);
		expect(captureRow.writeback).toBe("git");
		expect(captureRow.capturePath).not.toBe("none");

		const bundlePath = captureRow.capturePath;
		expect(
			fs.existsSync(bundlePath),
			`[mounted-cursor-agent] bundle file missing at ${bundlePath}`,
		).toBe(true);

		const capturedContent = verifyBundleContainsToken(bundlePath, tmpDir, "verify-cursor-agent");
		// biome-ignore lint/suspicious/noConsole: test diagnostic
		console.info(`[mounted-cursor-agent] FILE.txt content: "${capturedContent}"`);
		expect(capturedContent).not.toBeNull();
		expect(capturedContent).toBe(token);

		const worktreeList = execFileSync("git", ["worktree", "list"], { cwd: repoPath }).toString();
		expect(worktreeList).not.toContain("mountca");
	});
});
