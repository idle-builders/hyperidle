/**
 * AO2 — Lane (a): CI-able real end-to-end session roundtrip (§12 Lane a).
 *
 * Drives the REAL admitSession → runSession → teardown chain with:
 * - REAL RegistryFilesystemMounter + REAL GitWorktreeAdapter wired into ProvisionSessionDeps
 * - A real temp git fixture repo (NOT this repo — keeps the test hermetic)
 * - An edit-stub harness whose startSession writes AGENT_OUTPUT.txt in its cwd
 *
 * This is the test the first AO2 ship was missing. It proves:
 * - AC1: mounted working tree was present when the harness ran (harness reads cwd)
 * - AC2: the harness's REAL on-disk edit is in the captured bundle
 * - Scaffolding excluded from the authored commit
 * - Worktree removed after capture
 *
 * Runs in test:integration (therefore CI / attested test:all). No LLM. Deterministic.
 *
 * @lore AO2 §12 Lane a: The critical difference from the old session-mount test:
 * the mounter here is the REAL RegistryFilesystemMounter (not a tracking stub),
 * and the harness edit is a REAL fs.writeFileSync in startSession's cwd
 * (not a test-written file after runSession). The chain proves AC1+AC2 end-to-end.
 *
 * @lore AO2 Lane-a fixture-repo: Uses a fresh temp git repo (git init + initial
 * commit) NOT this repo. Self-host case stays in ao2-live-proof.integration.test.ts.
 * A fresh repo avoids worktree-list pollution and is faster (no full clone history).
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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
import { createGitRunner } from "@hyperidle/fabric";
import type {
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { minimalStrategy } from "@hyperidle/strategy-minimal";
import { eq } from "drizzle-orm";
import { RegistryFilesystemMounter } from "../../filesystem/mounter-registry.js";
import type { AdapterMeta } from "../../harness/adapter-pool.js";
import { AdapterPool } from "../../harness/adapter-pool.js";
import { LocalSandboxAdapter } from "../../harness/local-sandbox-adapter.js";
import {
	admitSession,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	runSession,
} from "../../services/session-provisioning.js";
import { clearActiveStrategy, setActiveStrategy } from "../../services/strategy-registry.js";
import { afterEach, beforeEach, describe, expect, test } from "../../test-fixtures.js";

// ── Token written by the edit-stub harness ──────────────────────────────────

const AGENT_OUTPUT_FILE = "AGENT_OUTPUT.txt";

// ── Edit-stub harness: writes a REAL file in its cwd during startSession ───

/**
 * The key difference from all prior stub harnesses: startSession writes a
 * REAL file to config.sandboxPath (the mounted worktree). This simulates exactly
 * what a real agent would do — it edits a file in the directory it was given.
 * The token is unique per test run so we can verify the exact bytes were captured.
 *
 * @lore AO2 Lane-a: "real on-disk edit" means the edit is performed by the
 * harness stub, NOT by the test's assertions. It lands in sandboxPath BEFORE
 * captureBack runs, so the bundle captures what the harness left behind.
 */
class EditStubHarness implements HarnessAdapter {
	public capturedSandboxPath: string | null = null;
	public readonly token: string;

	constructor(token: string) {
		this.token = token;
	}

	async startSession(config: SessionConfig): Promise<SessionHandle> {
		// Capture sandboxPath so assertions can verify the cwd.
		this.capturedSandboxPath = config.sandboxPath;

		// THE REAL ON-DISK EDIT: write the token file in the mounted worktree cwd.
		// This is what a real agent does — edits files in its working directory.
		const outputPath = path.join(config.sandboxPath, AGENT_OUTPUT_FILE);
		fs.writeFileSync(outputPath, this.token, "utf-8");

		return { sessionId: "edit-stub-session" };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		// submit_review so the return gate sees a valid return action (normal path).
		yield { type: "tool_call", toolName: "submit_review", args: { message: "Lane-a stub done" } };
		yield { type: "completion", text: "stub done" };
	}

	async stopSession(_handle: SessionHandle): Promise<SessionResult> {
		return {
			outcome: "completed",
			cost: { minor: 0, currency: "USD" },
			tokenUsage: { byTier: {} },
		};
	}

	getCapabilities(): HarnessCapabilities {
		return {
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: ["anthropic"],
			mcpSupport: false,
			returnEnforcement: "none",
		};
	}
}

// ── Fixture git repo creation ─────────────────────────────────────────────────

/**
 * Create a fresh temp git repo with one committed file.
 * This is NOT this repo — keeps the test hermetic.
 *
 * @returns path to the created repo
 */
function createFixtureGitRepo(tmpDir: string): string {
	const repoPath = path.join(tmpDir, "fixture-repo");
	fs.mkdirSync(repoPath, { recursive: true });

	// Init, configure identity, add initial commit.
	execSync("git init -b main", { cwd: repoPath, stdio: "ignore" });
	execSync("git config user.email 'ao2-test@hyperidle.local'", { cwd: repoPath, stdio: "ignore" });
	execSync("git config user.name 'AO2 Test'", { cwd: repoPath, stdio: "ignore" });
	fs.writeFileSync(path.join(repoPath, "fixture.txt"), "initial content\n", "utf-8");
	execSync("git add fixture.txt", { cwd: repoPath, stdio: "ignore" });
	execSync("git commit -m 'initial commit'", { cwd: repoPath, stdio: "ignore" });

	return repoPath;
}

// ── Seed helpers ─────────────────────────────────────────────────────────────

const NOW = new Date().toISOString();

async function seedDomain(
	db: import("@hyperidle/db").HyperIdleDb,
	repoPath: string,
): Promise<{ agentId: string; taskId: string; teamId: string; filesystemId: string }> {
	const teamId = `ao2-rtr-team-${randomUUID().slice(0, 8)}`;
	const memberId = `ao2-rtr-mb-${randomUUID().slice(0, 8)}`;
	const betId = `ao2-rtr-bet-${randomUUID().slice(0, 8)}`;
	const agentId = `ao2-rtr-agent-${randomUUID().slice(0, 8)}`;
	const taskId = `ao2-rtr-task-${randomUUID().slice(0, 8)}`;
	const filesystemId = `ao2-rtr-fs-${randomUUID().slice(0, 8)}`;

	await db
		.insert(teams)
		.values({ id: teamId, name: "AO2 Roundtrip Team", phase: "build", createdAt: NOW });
	await db
		.insert(teamMembers)
		.values({ id: memberId, teamId, capacity: 5, activeBets: 0, formedAt: NOW });
	await db.insert(bets).values({
		id: betId,
		teamId,
		description: "AO2 roundtrip bet",
		status: "active",
		createdAt: NOW,
	});
	await db.insert(users).values({
		id: agentId,
		name: "AO2 Roundtrip Agent",
		role: "builder",
		status: "active",
		teamId: memberId,
		maxConcurrentSessions: 4,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "AO2 Roundtrip Task",
		state: "accepted",
		ownerAgentId: agentId,
		createdAt: NOW,
		updatedAt: NOW,
	});

	// The code filesystem pointing to our fixture repo.
	await db.insert(filesystems).values({
		id: filesystemId,
		teamId,
		source: "local",
		kind: "code",
		connectionId: null,
		resourceRef: JSON.stringify({ kind: "code", repo: repoPath, branch: "main" }),
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

// ── Lane (a) test ─────────────────────────────────────────────────────────────

describe("AO2 Lane (a) — real session roundtrip (real mounter + edit-stub harness)", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-roundtrip-"));
		setActiveStrategy(minimalStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		// Cleanup: try to remove the tmpDir but don't fail the test if it's already gone.
		try {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		} catch {
			// Non-fatal.
		}
	});

	test("admitSession → edit-stub harness writes real file → captureBack bundles it → worktree removed", {
		timeout: 60_000,
	}, async ({ db, eventBus }) => {
		// ── Arrange ────────────────────────────────────────────────────────

		// Fixture git repo (NOT this repo — hermetic).
		const repoPath = createFixtureGitRepo(tmpDir);
		const capturesDir = path.join(tmpDir, "captures");
		fs.mkdirSync(capturesDir, { recursive: true });

		const { agentId, taskId, teamId, filesystemId } = await seedDomain(db, repoPath);

		// The unique token the harness will write into the worktree.
		const token = `ao2-lane-a-token-${randomUUID()}`;
		const harness = new EditStubHarness(token);

		// REAL RegistryFilesystemMounter (not a tracking stub).
		const mounter = new RegistryFilesystemMounter({
			gitRunnerFactory: (p: string) => createGitRunner(p),
			capturesDir,
			db,
		});

		const pool = new AdapterPool();
		const poolMeta: AdapterMeta = {
			name: "edit-stub",
			kind: "local",
			modelProviders: ["anthropic"],
			maxConcurrent: 4,
		};
		pool.register("edit-stub", harness, poolMeta);

		const workspace = new LocalSandboxAdapter();
		const sandboxBasePath = path.join(tmpDir, "sandboxes");
		fs.mkdirSync(sandboxBasePath, { recursive: true });

		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace,
			mounter,
		};

		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
		};

		// ── Act: admit (mount happens here) ───────────────────────────────

		const admitted = await admitSession(deps, params);

		// ── Assert mount happened (AC1 proof) ─────────────────────────────

		// mountedFilesystems must have the filesystem we injected.
		expect(admitted.mountedFilesystems).toHaveLength(1);
		expect(admitted.mountedFilesystems[0]?.id).toBe(filesystemId);

		// The worktree must exist at sandboxPath and contain the fixture file.
		// This proves the agent would have seen the mounted working tree.
		expect(fs.existsSync(admitted.sandboxPath)).toBe(true);
		expect(fs.existsSync(path.join(admitted.sandboxPath, "fixture.txt"))).toBe(true);
		expect(fs.existsSync(path.join(admitted.sandboxPath, ".git"))).toBe(true);

		// Record the sandboxPath for post-runSession assertions.
		const { sandboxPath, sessionId } = admitted;

		// ── Act: run (harness writes AGENT_OUTPUT.txt in its cwd) ──────────

		const result = await runSession(deps, params, admitted);

		// ── Assert outcomes ───────────────────────────────────────────────

		expect(result.outcome).toBe("completed");

		// harness.capturedSandboxPath must equal the admitted sandboxPath
		// (proves the harness ran in the mounted worktree — AC1).
		expect(harness.capturedSandboxPath).toBe(sandboxPath);

		// ── Assert capture row written (AC2 proof — Part 1) ───────────────

		const captureRows = await db
			.select()
			.from(filesystemCaptures)
			.where(eq(filesystemCaptures.sessionId, sessionId));

		expect(captureRows).toHaveLength(1);
		const captureRow = captureRows[0]!;
		expect(captureRow.filesystemId).toBe(filesystemId);
		expect(captureRow.writeback).toBe("git");
		expect(captureRow.capturePath).not.toBe("none");
		expect(captureRow.capturePath).not.toBe("");

		// Bundle file must exist on disk.
		const bundlePath = captureRow.capturePath;
		expect(fs.existsSync(bundlePath)).toBe(true);

		// ── Assert harness edit is in the bundle (AC2 proof — Part 2) ─────

		// Clone the bundle into a temp verify dir.
		const verifyDir = path.join(tmpDir, "verify");
		fs.mkdirSync(verifyDir, { recursive: true });

		// Find the branch name from the bundle.
		const bundleBranches = execSync(`git bundle list-heads "${bundlePath}"`, {
			cwd: tmpDir,
		})
			.toString()
			.trim();
		// bundleBranches = "sha refs/heads/agent/<sandboxBasename>"
		const branchMatch = bundleBranches.match(/refs\/heads\/(.+)/);
		expect(branchMatch).not.toBeNull();
		const branchName = branchMatch![1]!;

		// Clone the bundle (the bundle is a valid git repo).
		const vRunner = createGitRunner(verifyDir);
		await vRunner.clone(bundlePath, branchName);

		// The harness's REAL on-disk edit must be present in the bundle.
		const capturedOutputPath = path.join(verifyDir, AGENT_OUTPUT_FILE);
		expect(fs.existsSync(capturedOutputPath)).toBe(true);
		const capturedContent = fs.readFileSync(capturedOutputPath, "utf-8");
		expect(capturedContent).toBe(token);

		// ── Assert scaffolding NOT in the bundle ──────────────────────────

		// The fixture repo doesn't track CLAUDE.md/AGENTS.md; but the session
		// context assembly would have written them as untracked scaffolding.
		// They must NOT appear in the captured commit.
		const capturedFiles = execSync("git ls-files", { cwd: verifyDir })
			.toString()
			.trim()
			.split("\n");
		const scaffoldingInCapture = capturedFiles.filter(
			(f) =>
				f === "CLAUDE.md" ||
				f === "AGENTS.md" ||
				f === ".mcp.json" ||
				f.startsWith(".fabric/") ||
				f.startsWith(".claude/"),
		);
		expect(scaffoldingInCapture).toHaveLength(0);

		// ── Assert worktree removed ───────────────────────────────────────

		// After runSession: endSession deleted the sandbox (and removed the worktree).
		expect(fs.existsSync(sandboxPath)).toBe(false);

		// No dangling worktree in the fixture repo.
		const worktreeList = execSync("git worktree list", { cwd: repoPath }).toString();
		expect(worktreeList).not.toContain(sandboxPath);
	});
});
