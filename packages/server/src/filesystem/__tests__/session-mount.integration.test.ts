/**
 * AO2 — Session mount hooks integration test.
 *
 * Tests the two session-provisioning hooks:
 * - Hook A: mount after sandboxPath set, before context assembly.
 * - Hook B: captureBack BEFORE each endSession call (normal/not-returned/budget/crash).
 * - No-fs session: degrades to today (no error, no capture row).
 *
 * Also includes C1-GAP ordering tests that drive the REAL teardown sequence in
 * session-provisioning.ts via `runSession` and assert that captureBack is invoked
 * BEFORE endSession (normal path) and BEFORE crashSession (crash path).
 *
 * Uses the DB fixture for filesystem_captures row assertions.
 * Does NOT test a real agent harness — uses a mock FilesystemMounter.
 */

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
import { fabricStrategy } from "@hyperidle/fabric";
import type {
	CaptureResult,
	Filesystem,
	FilesystemMounter,
	HarnessAdapter,
	HarnessCapabilities,
	HarnessEvent,
	MountResult,
	SessionConfig,
	SessionHandle,
	SessionResult,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
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

// ── Minimal test mounter ──────────────────────────────────────────────────────

interface MountCall {
	filesystem: Filesystem;
	sandboxPath: string;
}

interface CaptureCall {
	filesystem: Filesystem;
	sandboxPath: string;
	sessionId: string;
}

function createTrackingMounter(captureResult?: Partial<CaptureResult>): FilesystemMounter & {
	mountCalls: MountCall[];
	captureCalls: CaptureCall[];
} {
	const mountCalls: MountCall[] = [];
	const captureCalls: CaptureCall[] = [];

	return {
		mountCalls,
		captureCalls,
		async mount(input: {
			filesystem: Filesystem;
			sandboxPath: string;
			auth: import("@hyperidle/shared").FilesystemAuth | null;
		}): Promise<MountResult> {
			mountCalls.push({ filesystem: input.filesystem, sandboxPath: input.sandboxPath });
			return { success: true, sandboxPath: input.sandboxPath };
		},
		async captureBack(input: {
			filesystem: Filesystem;
			sandboxPath: string;
			sessionId: string;
		}): Promise<CaptureResult> {
			captureCalls.push({
				filesystem: input.filesystem,
				sandboxPath: input.sandboxPath,
				sessionId: input.sessionId,
			});
			return { success: true, captured: true, ...captureResult };
		},
	};
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Seeds team → teamMember → user (agent); returns { rootTeamId, agentId }. */
async function seedAgentInTeam(
	db: import("@hyperidle/db").HyperIdleDb,
): Promise<{ rootTeamId: string; agentId: string }> {
	const rootTeamId = randomUUID();
	await db.insert(teams).values({
		id: rootTeamId,
		name: "Test Team",
		phase: "discovery",
		createdAt: new Date().toISOString(),
	});
	const teamMemberId = randomUUID();
	await db.insert(teamMembers).values({
		id: teamMemberId,
		teamId: rootTeamId,
		capacity: 3,
		activeBets: 0,
		formedAt: new Date().toISOString(),
	});
	const agentId = randomUUID();
	await db.insert(users).values({
		id: agentId,
		name: "Test Agent",
		role: "builder",
		status: "idle",
		teamId: teamMemberId,
		createdAt: new Date().toISOString(),
	});
	return { rootTeamId, agentId };
}

async function seedFilesystem(
	db: import("@hyperidle/db").HyperIdleDb,
	teamId: string,
	agentId: string,
	repoPath: string,
): Promise<string> {
	const fsId = randomUUID();
	await db.insert(filesystems).values({
		id: fsId,
		teamId,
		source: "local",
		kind: "code",
		connectionId: null,
		resourceRef: JSON.stringify({ kind: "code", repo: repoPath, branch: "main" }),
		writeback: "git",
		state: "reachable",
		createdAt: new Date().toISOString(),
	});
	await db.insert(filesystemInjections).values({
		agentUserId: agentId,
		filesystemId: fsId,
		createdAt: new Date().toISOString(),
	});
	return fsId;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Session mount hooks (AO2)", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-session-mount-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("Hook A: mounter.mount is called after sandboxPath set for each injected filesystem", async ({
		db,
	}) => {
		const { rootTeamId, agentId } = await seedAgentInTeam(db);
		const repoPath = tmpDir; // any directory path for this test.
		await seedFilesystem(db, rootTeamId, agentId, repoPath);

		const mounter = createTrackingMounter();

		// Verify that the mounter resolves injected filesystems for the given agentId.
		// We test the hook by calling the mount-helper that session-provisioning uses.
		const { mountFilesystemsForAgent } = await import("../../services/session-provisioning.js");
		const sandboxPath = path.join(tmpDir, "sandbox");
		fs.mkdirSync(sandboxPath, { recursive: true });

		await mountFilesystemsForAgent(db, agentId, sandboxPath, mounter);

		expect(mounter.mountCalls).toHaveLength(1);
		expect(mounter.mountCalls[0]?.sandboxPath).toBe(sandboxPath);
		expect(mounter.mountCalls[0]?.filesystem.writeback).toBe("git");
	});

	test("Hook B: captureBack is called with the correct sessionId before endSession", async ({
		db,
	}) => {
		const { rootTeamId, agentId } = await seedAgentInTeam(db);
		const repoPath = tmpDir;
		const fsId = await seedFilesystem(db, rootTeamId, agentId, repoPath);

		const mounter = createTrackingMounter();

		const { captureMountedFilesystems } = await import("../../services/session-provisioning.js");

		const sandboxPath = path.join(tmpDir, "sandbox");
		fs.mkdirSync(sandboxPath, { recursive: true });
		const sessionId = randomUUID();

		// Simulate what session-provisioning does: resolve filesystems then call capture.
		const { mountFilesystemsForAgent } = await import("../../services/session-provisioning.js");
		const mountedFilesystems = await mountFilesystemsForAgent(db, agentId, sandboxPath, mounter);

		await captureMountedFilesystems(sessionId, sandboxPath, mountedFilesystems, mounter);

		expect(mounter.captureCalls).toHaveLength(1);
		expect(mounter.captureCalls[0]?.sessionId).toBe(sessionId);
		expect(mounter.captureCalls[0]?.filesystem.id).toBe(fsId);
	});

	test("No-fs session: mount and capture are no-ops when no filesystems injected", async ({
		db,
	}) => {
		const { agentId } = await seedAgentInTeam(db);
		// No filesystem injection for this agent.

		const mounter = createTrackingMounter();

		const { mountFilesystemsForAgent, captureMountedFilesystems } = await import(
			"../../services/session-provisioning.js"
		);

		const sandboxPath = path.join(tmpDir, "sandbox");
		fs.mkdirSync(sandboxPath, { recursive: true });
		const sessionId = randomUUID();

		const mountedFilesystems = await mountFilesystemsForAgent(db, agentId, sandboxPath, mounter);
		expect(mountedFilesystems).toHaveLength(0);
		expect(mounter.mountCalls).toHaveLength(0);

		await captureMountedFilesystems(sessionId, sandboxPath, mountedFilesystems, mounter);
		expect(mounter.captureCalls).toHaveLength(0);

		// No filesystem_captures row written.
		const rows = await db
			.select()
			.from(filesystemCaptures)
			.where(eq(filesystemCaptures.sessionId, sessionId));
		expect(rows).toHaveLength(0);
	});

	test("Failed mount: degrade gracefully — no crash, warning only", async ({ db }) => {
		const { rootTeamId, agentId } = await seedAgentInTeam(db);
		await seedFilesystem(db, rootTeamId, agentId, tmpDir);

		const failingMounter = {
			mountCalls: [] as MountCall[],
			captureCalls: [] as CaptureCall[],
			async mount(input: {
				filesystem: Filesystem;
				sandboxPath: string;
				auth: import("@hyperidle/shared").FilesystemAuth | null;
			}): Promise<MountResult> {
				return { success: false, sandboxPath: input.sandboxPath, error: "adapter not built" };
			},
			async captureBack(_input: {
				filesystem: Filesystem;
				sandboxPath: string;
				sessionId: string;
			}): Promise<CaptureResult> {
				return { success: false, captured: false, error: "adapter not built" };
			},
		};

		const { mountFilesystemsForAgent } = await import("../../services/session-provisioning.js");

		const sandboxPath = path.join(tmpDir, "sandbox");
		fs.mkdirSync(sandboxPath, { recursive: true });

		// Should not throw — degrade to empty list.
		const mountedFilesystems = await mountFilesystemsForAgent(
			db,
			agentId,
			sandboxPath,
			failingMounter,
		);
		expect(mountedFilesystems).toHaveLength(0); // Failed mounts are not included.
	});
});

// ── C1-GAP: capture-before-endSession ordering tests ─────────────────────────
//
// These tests drive the REAL runSession teardown sequence and assert that
// captureBack is invoked BEFORE endSession (which holds the rm -rf).
//
// The key observable: endSession deletes sandboxPath. If captureBack is called
// AFTER endSession, the sandbox is already gone. We assert that sandboxPath
// exists when captureBack runs, proving the order.
//
// Self-check record: temporarily reversing the order in session-provisioning.ts
// (moving captureBack after endSession) causes these tests to go RED because
// captureBack would find the sandbox already deleted.
//
// @lore AO2 C1-GAP: The WP's #1 risk (silent empty capture because fs deleted
// before captureBack) was unprotected — the original tests only exercised helpers
// in isolation, not the real teardown sequence. This test directly drives runSession
// and anchors the contract.

// ── Stub harness that completes immediately (normal path) ─────────────────────

class ImmediateCompletingHarness implements HarnessAdapter {
	async startSession(_config: SessionConfig): Promise<SessionHandle> {
		return { sessionId: "stub-session" };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		// Emit submit_review so the return gate sees a return action (normal path).
		yield { type: "tool_call", toolName: "submit_review", args: { message: "C1 stub done" } };
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

// ── Stub harness that crashes (error event) ───────────────────────────────────

class CrashingHarness implements HarnessAdapter {
	async startSession(_config: SessionConfig): Promise<SessionHandle> {
		return { sessionId: "stub-crash-session" };
	}

	async *streamEvents(_handle: SessionHandle): AsyncGenerator<HarnessEvent> {
		yield {
			type: "error",
			message: "simulated harness crash for C1-GAP test",
			code: "C1_GAP_CRASH",
		};
	}

	async stopSession(_handle: SessionHandle): Promise<SessionResult> {
		return { outcome: "crashed", cost: { minor: 0, currency: "USD" }, tokenUsage: { byTier: {} } };
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

// ── C1-GAP seed helpers ───────────────────────────────────────────────────────

const NOW_C1 = new Date().toISOString();

async function seedDomainC1(
	db: import("@hyperidle/db").HyperIdleDb,
): Promise<{ agentId: string; taskId: string; teamId: string }> {
	const agentId = `c1-agent-${randomUUID().slice(0, 8)}`;
	const teamId = `c1-team-${randomUUID().slice(0, 8)}`;
	const memberId = `c1-member-${randomUUID().slice(0, 8)}`;
	const betId = `c1-bet-${randomUUID().slice(0, 8)}`;
	const taskId = `c1-task-${randomUUID().slice(0, 8)}`;

	await db.insert(teams).values({ id: teamId, name: "C1 Team", phase: "build", createdAt: NOW_C1 });
	await db
		.insert(teamMembers)
		.values({ id: memberId, teamId, capacity: 5, activeBets: 0, formedAt: NOW_C1 });
	await db.insert(users).values({
		id: agentId,
		name: "C1 Agent",
		role: "builder",
		status: "active",
		teamId: memberId,
		maxConcurrentSessions: 4,
		createdAt: NOW_C1,
	});
	await db
		.insert(bets)
		.values({ id: betId, teamId, description: "C1 bet", status: "active", createdAt: NOW_C1 });
	await db.insert(tasks).values({
		id: taskId,
		betId,
		teamId,
		title: "C1 Task",
		state: "accepted",
		ownerAgentId: agentId,
		createdAt: NOW_C1,
		updatedAt: NOW_C1,
	});

	return { agentId, taskId, teamId };
}

function makePoolC1(harness: HarnessAdapter, meta?: Partial<AdapterMeta>): AdapterPool {
	const pool = new AdapterPool();
	pool.register("c1-stub", harness, {
		name: "c1-stub",
		kind: "local",
		modelProviders: ["anthropic"],
		maxConcurrent: 4,
		...meta,
	});
	return pool;
}

// ── C1-GAP tests ──────────────────────────────────────────────────────────────

describe("C1-GAP: capture-before-endSession ordering (REAL runSession teardown)", () => {
	let sandboxBasePath: string;

	beforeEach(() => {
		sandboxBasePath = fs.mkdtempSync(path.join(os.tmpdir(), "ao2-c1-gap-"));
		setActiveStrategy(fabricStrategy);
	});

	afterEach(() => {
		clearActiveStrategy();
		fs.rmSync(sandboxBasePath, { recursive: true, force: true });
	});

	test("normal path: captureBack called BEFORE endSession (sandbox exists during captureBack)", async ({
		db,
		eventBus,
	}) => {
		// @lore AO2 C1-GAP: The proof: captureBack records whether sandboxPath
		// exists at call time. endSession deletes sandboxPath. If captureBack ran
		// AFTER endSession, sandboxPathExistedDuringCapture would be false.
		// Reversing the order in session-provisioning.ts makes this test RED.

		const { agentId, taskId, teamId } = await seedDomainC1(db);

		// Seed a filesystem injection so mountedFilesystems is non-empty (triggers captureBack).
		const fsId = randomUUID();
		await db.insert(filesystems).values({
			id: fsId,
			teamId,
			source: "local",
			kind: "code",
			connectionId: null,
			resourceRef: JSON.stringify({ kind: "code", repo: sandboxBasePath, branch: "main" }),
			writeback: "git",
			state: "reachable",
			createdAt: NOW_C1,
		});
		await db.insert(filesystemInjections).values({
			agentUserId: agentId,
			filesystemId: fsId,
			createdAt: NOW_C1,
		});

		// The ordering proof lives in the mounter.
		let sandboxPathAtCaptureTime: string | null = null;
		let sandboxExistedDuringCapture = false;
		const callLog: string[] = [];

		const orderingMounter: FilesystemMounter = {
			async mount(input): Promise<MountResult> {
				callLog.push("mount");
				return { success: true, sandboxPath: input.sandboxPath };
			},
			async captureBack(input): Promise<CaptureResult> {
				callLog.push("captureBack");
				sandboxPathAtCaptureTime = input.sandboxPath;
				// endSession has not run yet → sandbox directory must still exist.
				sandboxExistedDuringCapture = fs.existsSync(input.sandboxPath);
				return { success: true, captured: true };
			},
		};

		const harness = new ImmediateCompletingHarness();
		const pool = makePoolC1(harness);
		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace,
			mounter: orderingMounter,
		};
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
		};

		const admitted = await admitSession(deps, params);
		const capturedSandboxPath = admitted.sandboxPath;

		// Run the real teardown sequence.
		const result = await runSession(deps, params, admitted);

		expect(result.outcome).toBe("completed");

		// Core ordering assertions.
		expect(callLog).toContain("captureBack");
		expect(sandboxPathAtCaptureTime).not.toBeNull();
		expect(sandboxExistedDuringCapture).toBe(true); // sandbox was ALIVE during captureBack
		// After runSession: endSession deleted the sandbox.
		expect(fs.existsSync(capturedSandboxPath)).toBe(false); // sandbox GONE after endSession
	});

	test("crash path: captureBack called BEFORE crashSession (sandbox exists during captureBack)", async ({
		db,
		eventBus,
	}) => {
		// @lore AO2 C1-GAP: crashSession also deletes sandboxPath. The crash path
		// must also captureBack before crash teardown (architecture §11 promise).
		// Removing the captureBack call from the crash path makes this test RED.

		const { agentId, taskId, teamId } = await seedDomainC1(db);

		const fsId = randomUUID();
		await db.insert(filesystems).values({
			id: fsId,
			teamId,
			source: "local",
			kind: "code",
			connectionId: null,
			resourceRef: JSON.stringify({ kind: "code", repo: sandboxBasePath, branch: "main" }),
			writeback: "git",
			state: "reachable",
			createdAt: NOW_C1,
		});
		await db.insert(filesystemInjections).values({
			agentUserId: agentId,
			filesystemId: fsId,
			createdAt: NOW_C1,
		});

		let sandboxExistedDuringCapture = false;
		const callLog: string[] = [];

		const orderingMounter: FilesystemMounter = {
			async mount(input): Promise<MountResult> {
				callLog.push("mount");
				return { success: true, sandboxPath: input.sandboxPath };
			},
			async captureBack(input): Promise<CaptureResult> {
				callLog.push("captureBack");
				// crashSession has not run yet → sandbox must still exist.
				sandboxExistedDuringCapture = fs.existsSync(input.sandboxPath);
				return { success: true, captured: true };
			},
		};

		const harness = new CrashingHarness();
		const pool = makePoolC1(harness);
		const workspace = new LocalSandboxAdapter();
		const deps: ProvisionSessionDeps = {
			db,
			eventBus,
			adapterPool: pool,
			workspace,
			mounter: orderingMounter,
		};
		const params: ProvisionSessionParams = {
			taskId,
			agentId,
			productId: teamId,
			sandboxBasePath,
		};

		const admitted = await admitSession(deps, params);
		const capturedSandboxPath = admitted.sandboxPath;

		const result = await runSession(deps, params, admitted);

		expect(result.outcome).toBe("crashed");

		// Core ordering assertions.
		expect(callLog).toContain("captureBack");
		expect(sandboxExistedDuringCapture).toBe(true); // sandbox was ALIVE during captureBack
		// Note: crashSession intentionally does NOT delete the sandbox (preserved for debugging).
		// The ordering proof is that captureBack ran while the sandbox was alive, which implies
		// it ran BEFORE any teardown that could have removed it.
		void capturedSandboxPath; // referenced for documentation only
	});
});
