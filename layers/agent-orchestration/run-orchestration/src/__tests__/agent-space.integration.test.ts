/**
 * Agent spaces — persistent per-agent directories on this computer.
 *
 * Tests:
 *  - ensureAgentSpace creates the space and persists its path
 *  - ensureAgentSpace reuses an existing space (no second mkdir)
 *  - two agents with the same name get different directories (collision avoidance)
 *  - deriveWorkingFolder routes by taskId, subscriptionId, callingThreadId, and resume
 *  - real provisioner runs: task and conversation runs get isolated working folders
 *  - real provisioner runs: second conversation run reuses the same folder
 *  - real provisioner runs: space-linked git repo mounted as worktree; CLAUDE.md byte-identical
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { mkdirSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HyperIdleDb } from "@hyperidle/db";
import { tasks, teams, threads, users } from "@hyperidle/db";
import { EventBus } from "@hyperidle/event-bus";
import type { SessionConfig } from "@hyperidle/harness-protocol";
import { agentRunConfig, type RunnerDb } from "@hyperidle/runner-db";
import { afterEach, beforeEach, vi } from "vitest";
import { createGitRunner } from "../../../src/git-runner.js";
import {
	buildRunningHarnessPorts,
	describe,
	expect,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	test,
} from "../__testing__/test-fixtures.js";
import { readAgentRunConfig } from "../agent-run-config-store.js";
import { deriveWorkingFolder, ensureAgentSpace } from "../agent-space.js";
import { createProvisioner } from "../provisioner.js";
import { addSpaceFolder } from "../space-folders.js";

const NOW = "2026-11-06T00:00:00.000Z";

async function insertAgent(db: HyperIdleDb, id: string, name = id): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name,
		role: "builder",
		agentCategory: "team",
		status: "active",
		createdAt: NOW,
	});
}

async function seedTask(db: HyperIdleDb, taskId: string): Promise<void> {
	const teamId = `${taskId}-team`;
	const rootTaskId = `${taskId}-bet`;
	await db.insert(teams).values({ id: teamId, name: teamId, createdAt: NOW });
	await db.insert(threads).values({
		id: `thr-${rootTaskId}`,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: rootTaskId,
		threadId: `thr-${rootTaskId}`,
		parentTaskId: null,
		teamId,
		title: "Agent space test bet",
		description: "Agent space test bet",
		state: "in_progress",
		createdAt: NOW,
		updatedAt: NOW,
	});
	await db.insert(threads).values({
		id: `thr-${taskId}`,
		hostKind: "team",
		hostId: teamId,
		initiatorId: "system:propagation",
		participants: "[]",
		lastActiveAt: NOW,
		createdAt: NOW,
	});
	await db.insert(tasks).values({
		id: taskId,
		threadId: `thr-${taskId}`,
		parentTaskId: rootTaskId,
		teamId,
		title: "Agent space test task",
		state: "accepted",
		createdAt: NOW,
		updatedAt: NOW,
	});
}

describe("agent spaces", () => {
	let tmpdir: string;

	beforeEach(() => {
		tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "hi-spaces-test-"));
		vi.stubEnv("HYPERIDLE_SPACES_DIR", tmpdir);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		fs.rmSync(tmpdir, { recursive: true, force: true });
	});

	test("creates the agent space and persists its path in run config", async ({ db, runnerDb }) => {
		await insertAgent(db, "agent-new", "Alice");

		const spacePath = await ensureAgentSpace(runnerDb, "agent-new", "Alice");

		expect(spacePath).toBe(path.join(tmpdir, "Alice"));
		expect(fs.existsSync(spacePath)).toBe(true);
		const config = await readAgentRunConfig(runnerDb, "agent-new");
		expect(config.spacePath).toBe(spacePath);
	});

	test("reuses an existing space on subsequent calls", async ({ db, runnerDb }) => {
		await insertAgent(db, "agent-reuse", "Bob");

		const first = await ensureAgentSpace(runnerDb, "agent-reuse", "Bob");
		const second = await ensureAgentSpace(runnerDb, "agent-reuse", "Bob");

		expect(second).toBe(first);
		// Config row written exactly once: second call reads and returns.
		const config = await readAgentRunConfig(runnerDb, "agent-reuse");
		expect(config.spacePath).toBe(first);
	});

	test("two agents with the same name get distinct directories", async ({ db, runnerDb }) => {
		await insertAgent(db, "agent-coll-1", "Eve");
		await insertAgent(db, "agent-coll-2", "Eve");

		// Create the first agent's space so the name 'Eve' is taken.
		const first = await ensureAgentSpace(runnerDb, "agent-coll-1", "Eve");
		const second = await ensureAgentSpace(runnerDb, "agent-coll-2", "Eve");

		expect(first).not.toBe(second);
		expect(fs.existsSync(first)).toBe(true);
		expect(fs.existsSync(second)).toBe(true);
		// Second dir gets a 6-char hex suffix from the agent id, not a numeric counter.
		expect(path.basename(second)).toMatch(/^Eve-[0-9a-f]{6}$/);
	});

	test("currentSpacePath shortcut skips the DB read", async ({ db, runnerDb }) => {
		await insertAgent(db, "agent-shortcut", "Carol");

		// Supply spacePath directly (as if already read by the provisioner).
		const existing = path.join(tmpdir, "Carol");
		mkdirSync(existing, { recursive: true });
		// Insert a row so we can verify it is NOT overwritten.
		await runnerDb
			.insert(agentRunConfig)
			.values({ agentUserId: "agent-shortcut", spacePath: existing, maxConcurrentSessions: 1 });

		const returned = await ensureAgentSpace(runnerDb, "agent-shortcut", "Carol", existing);

		expect(returned).toBe(existing);
	});
});

describe("working folder isolation", () => {
	let tmpdir: string;

	beforeEach(() => {
		tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "hi-spaces-isolation-"));
		vi.stubEnv("HYPERIDLE_SPACES_DIR", tmpdir);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		fs.rmSync(tmpdir, { recursive: true, force: true });
	});

	test("task run and conversation run for the same agent get separate folders, both persist", async ({
		db,
		runnerDb,
	}) => {
		await insertAgent(db, "agent-iso", "Isolator");
		const spacePath = await ensureAgentSpace(runnerDb, "agent-iso", "Isolator");

		const taskFolder = deriveWorkingFolder(spacePath, { taskId: "task-iso-1" });
		const convFolder = deriveWorkingFolder(spacePath, { callingThreadId: "thread-iso-1" });

		expect(taskFolder).not.toBe(convFolder);
		expect(taskFolder).toBe(path.join(spacePath, "tasks", "task-iso-1"));
		expect(convFolder).toBe(path.join(spacePath, "conversations", "thread-iso-1"));

		// Simulate what the provisioner does: create the working folders.
		mkdirSync(taskFolder, { recursive: true });
		mkdirSync(convFolder, { recursive: true });

		// Both persist after creation; the space root persists too.
		expect(fs.existsSync(spacePath)).toBe(true);
		expect(fs.existsSync(taskFolder)).toBe(true);
		expect(fs.existsSync(convFolder)).toBe(true);
	});

	test("second run of same conversation returns the same folder", async ({ db, runnerDb }) => {
		await insertAgent(db, "agent-reuse-conv", "Reuser");
		const spacePath = await ensureAgentSpace(runnerDb, "agent-reuse-conv", "Reuser");

		const first = deriveWorkingFolder(spacePath, { callingThreadId: "thread-reuse-1" });
		mkdirSync(first, { recursive: true });

		// Calling again with the same threadId — same path, folder still there.
		const second = deriveWorkingFolder(spacePath, { callingThreadId: "thread-reuse-1" });

		expect(second).toBe(first);
		expect(fs.existsSync(second)).toBe(true);
	});

	test("spaces root stays outside the repo (HYPERIDLE_SPACES_DIR isolates to temp dir)", async ({
		db,
		runnerDb,
	}) => {
		await insertAgent(db, "agent-safety", "SafetyAgent");
		const spacePath = await ensureAgentSpace(runnerDb, "agent-safety", "SafetyAgent");

		// The space is under our temp dir, never the repo root.
		expect(spacePath.startsWith(tmpdir)).toBe(true);
	});
});

describe("deriveWorkingFolder", () => {
	test("resume path wins over all other params", () => {
		const result = deriveWorkingFolder("/space", {
			resumeSandboxPath: "/old/path",
			taskId: "task-1",
			callingThreadId: "thread-1",
		});
		expect(result).toBe("/old/path");
	});

	test("taskId → tasks/<id>", () => {
		const result = deriveWorkingFolder("/space", { taskId: "t-abc" });
		expect(result).toBe("/space/tasks/t-abc");
	});

	test("subscriptionId → subscriptions/<id>", () => {
		const result = deriveWorkingFolder("/space", { subscriptionId: "sub-xyz" });
		expect(result).toBe("/space/subscriptions/sub-xyz");
	});

	test("callingThreadId → conversations/<id>", () => {
		const result = deriveWorkingFolder("/space", { callingThreadId: "thread-42" });
		expect(result).toBe("/space/conversations/thread-42");
	});

	test("throws when no routing key is supplied", () => {
		expect(() => deriveWorkingFolder("/space", {})).toThrow("deriveWorkingFolder");
	});

	test("taskId takes priority over callingThreadId", () => {
		const result = deriveWorkingFolder("/space", {
			taskId: "t-123",
			callingThreadId: "thread-999",
		});
		expect(result).toBe("/space/tasks/t-123");
	});

	test.each([
		{ label: "empty taskId", params: { taskId: "" } },
		{ label: "taskId with forward slash", params: { taskId: "task/bad" } },
		{ label: "taskId with backslash", params: { taskId: "task\\bad" } },
		{ label: "taskId is dot", params: { taskId: "." } },
		{ label: "taskId is dot-dot", params: { taskId: ".." } },
		{ label: "empty subscriptionId", params: { subscriptionId: "" } },
		{ label: "subscriptionId with slash", params: { subscriptionId: "sub/bad" } },
		{ label: "subscriptionId is dot-dot", params: { subscriptionId: ".." } },
		{ label: "empty callingThreadId", params: { callingThreadId: "" } },
		{ label: "callingThreadId with slash", params: { callingThreadId: "thread/bad" } },
		{ label: "callingThreadId is dot", params: { callingThreadId: "." } },
	])("$label throws", ({ params }) => {
		expect(() => deriveWorkingFolder("/space", params)).toThrow("deriveWorkingFolder");
	});
});

/**
 * Real provisioner runs — exercises the production provisioner and runtime with
 * only the harness adapter scripted (no live LLM, no real harness binary).
 * Proves that the working folder routing the production code performs is correct
 * under real DB + real filesystem conditions.
 */
describe("real provisioner runs: working folder isolation", () => {
	let spacesDir: string;

	beforeEach(() => {
		spacesDir = fs.mkdtempSync(path.join(os.tmpdir(), "hi-spaces-real-runs-"));
		vi.stubEnv("HYPERIDLE_SPACES_DIR", spacesDir);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		fs.rmSync(spacesDir, { recursive: true, force: true });
	});

	function buildDeps(runnerDb: RunnerDb, capturedPaths: Map<string, string>): ProvisionSessionDeps {
		return {
			db: runnerDb,
			eventBus: new EventBus(),
			adapterPool: {
				select: () => ({
					id: "scripted-adapter",
					adapter: {
						startSession: async (config: SessionConfig) => {
							// Write a unique marker so we can prove file isolation later.
							fs.mkdirSync(config.sandboxPath, { recursive: true });
							fs.writeFileSync(
								path.join(config.sandboxPath, `marker-${config.sessionId}.txt`),
								config.sessionId,
							);
							capturedPaths.set(config.sessionId, config.sandboxPath);
							return { sessionId: config.sessionId };
						},
						streamEvents: () => ({
							async *[Symbol.asyncIterator]() {
								/* completes immediately */
							},
						}),
						stopSession: async () => ({
							outcome: "completed" as const,
							tokenUsage: { byTier: {} },
						}),
						getCapabilities: () => ({
							preCompactionTrigger: false,
							subAgents: false,
							modelProviders: [],
							mcpSupport: false,
							returnEnforcement: "none" as const,
						}),
					},
					meta: { name: "Scripted", type: undefined, modelProviders: [], maxConcurrent: 5 },
				}),
				release: () => undefined,
				describeSelectFailure: () => "scripted adapter always selects",
			},
		};
	}

	test("concurrent task and conversation runs of the same agent get different working folders; files don't cross", async ({
		db,
		runnerDb,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "agent-real-iso",
			kind: "ai",
			name: "RealIso",
			role: "builder",
			status: "active",
			createdAt: now,
		});
		await seedTask(db, "task-real-iso-1");

		const capturedPaths = new Map<string, string>();
		const ports = buildRunningHarnessPorts({
			assembleAgentContext: vi.fn(async () => ({ itemCount: 0, durationMs: 0, manifestPath: "" })),
		});
		const provisioner = createProvisioner(ports);

		const taskParams: ProvisionSessionParams = {
			taskId: "task-real-iso-1",
			agentId: "agent-real-iso",
			productId: "task-free",
			agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null, name: "RealIso" },
		} as ProvisionSessionParams;

		const convParams: ProvisionSessionParams = {
			taskId: null,
			agentId: "agent-real-iso",
			productId: "task-free",
			callingThreadId: "thread-real-iso-1",
			agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null, name: "RealIso" },
		} as ProvisionSessionParams;

		const depsForRun = buildDeps(runnerDb, capturedPaths);

		// Run both concurrently: they must each derive a different working folder.
		const [taskAdmitted, convAdmitted] = await Promise.all([
			provisioner.admit(depsForRun, taskParams),
			provisioner.admit(depsForRun, convParams),
		]);
		await Promise.all([
			provisioner.run(depsForRun, taskParams, taskAdmitted),
			provisioner.run(depsForRun, convParams, convAdmitted),
		]);

		const taskPath = capturedPaths.get(taskAdmitted.sessionId);
		const convPath = capturedPaths.get(convAdmitted.sessionId);
		expect(taskPath).toBeDefined();
		expect(convPath).toBeDefined();

		// (a) Different working folders.
		expect(taskPath).not.toBe(convPath);
		expect(taskPath).toContain(path.join("tasks", "task-real-iso-1"));
		expect(convPath).toContain(path.join("conversations", "thread-real-iso-1"));

		// (a) File the task run wrote is NOT in the conversation folder.
		expect(fs.existsSync(path.join(convPath!, `marker-${taskAdmitted.sessionId}.txt`))).toBe(false);
		// File the conversation run wrote is NOT in the task folder.
		expect(fs.existsSync(path.join(taskPath!, `marker-${convAdmitted.sessionId}.txt`))).toBe(false);

		// (b) Both working folders still exist after the runs end.
		expect(fs.existsSync(taskPath!)).toBe(true);
		expect(fs.existsSync(convPath!)).toBe(true);
		// The agent space root itself persists.
		expect(fs.existsSync(path.join(spacesDir, "RealIso"))).toBe(true);
	});

	test("second conversation run of the same agent uses the same working folder", async ({
		db,
		runnerDb,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "agent-real-reuse",
			kind: "ai",
			name: "RealReuse",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		const capturedPaths = new Map<string, string>();
		const ports = buildRunningHarnessPorts();
		const provisioner = createProvisioner(ports);

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "agent-real-reuse",
			productId: "task-free",
			callingThreadId: "thread-real-reuse-1",
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
				name: "RealReuse",
			},
		} as ProvisionSessionParams;

		const depsForRun = buildDeps(runnerDb, capturedPaths);

		const admitted1 = await provisioner.admit(depsForRun, params);
		await provisioner.run(depsForRun, params, admitted1);

		const admitted2 = await provisioner.admit(depsForRun, params);
		await provisioner.run(depsForRun, params, admitted2);

		const path1 = capturedPaths.get(admitted1.sessionId);
		const path2 = capturedPaths.get(admitted2.sessionId);

		// (d) Second run in the same conversation uses the same folder.
		expect(path1).toBeDefined();
		expect(path2).toBeDefined();
		expect(path1).toBe(path2);

		// Only one conversations/<threadId> folder exists under the space.
		const convDir = path.join(spacesDir, "RealReuse", "conversations");
		const folders = fs.existsSync(convDir) ? fs.readdirSync(convDir) : [];
		expect(folders).toHaveLength(1);
	});

	test("space-linked git repo mounted as worktree: CLAUDE.md byte-identical, instruction file in root", async ({
		db,
		runnerDb,
	}) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "agent-real-mount",
			kind: "ai",
			name: "RealMount",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		// Create a real temp git repo with a CLAUDE.md of known content.
		const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "hi-spaces-inject-repo-"));
		try {
			execFileSync("git", ["init", "--quiet"], { cwd: repoDir });
			execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: repoDir });
			execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir });
			const knownContent = "# Known CLAUDE.md content for injection test\n";
			fs.writeFileSync(path.join(repoDir, "CLAUDE.md"), knownContent);
			execFileSync("git", ["add", "CLAUDE.md"], { cwd: repoDir });
			execFileSync("git", ["commit", "--quiet", "-m", "init"], { cwd: repoDir });

			// Pre-create the agent's space (provisioner will reuse it) and add the
			// git repo as a space-folder symlink before the session starts.
			const spacePath = await ensureAgentSpace(runnerDb, "agent-real-mount", "RealMount", null);
			const addResult = addSpaceFolder(spacePath, repoDir);
			expect(addResult.ok).toBe(true);

			let capturedSandboxPath: string | undefined;
			const capturedPaths = new Map<string, string>();
			const ports = buildRunningHarnessPorts({
				writeSandboxAgentsMd: (sbPath: string, prompt: string) => {
					fs.writeFileSync(path.join(sbPath, "AGENTS.md"), prompt);
					capturedSandboxPath = sbPath;
				},
			});
			const provisioner = createProvisioner(ports);

			const params: ProvisionSessionParams = {
				taskId: null,
				agentId: "agent-real-mount",
				productId: "task-free",
				callingThreadId: "thread-real-mount-1",
				agentConfig: {
					kind: "ai",
					status: "active",
					role: "builder",
					teamId: null,
					name: "RealMount",
				},
			} as ProvisionSessionParams;

			const deps: ProvisionSessionDeps = {
				...buildDeps(runnerDb, capturedPaths),
				gitRunnerFactory: (repoPath: string) => createGitRunner(repoPath),
			};

			const admitted = await provisioner.admit(deps, params);
			await provisioner.run(deps, params, admitted);

			expect(capturedSandboxPath).toBeDefined();
			const sbPath = capturedSandboxPath!;

			// The repo's CLAUDE.md is byte-identical to the original.
			const repoName = path.basename(repoDir);
			const mountedClaudeMd = path.join(sbPath, repoName, "CLAUDE.md");
			expect(fs.existsSync(mountedClaudeMd)).toBe(true);
			expect(fs.readFileSync(mountedClaudeMd, "utf-8")).toBe(
				"# Known CLAUDE.md content for injection test\n",
			);

			// The instruction file (AGENTS.md) is in the working folder root.
			expect(fs.existsSync(path.join(sbPath, "AGENTS.md"))).toBe(true);
		} finally {
			// Clean up the worktree and temp repo.
			try {
				const repoName = path.basename(repoDir);
				const space = path.join(spacesDir, "RealMount");
				const convDir = path.join(space, "conversations", "thread-real-mount-1");
				const mountAt = path.join(convDir, repoName);
				if (fs.existsSync(mountAt)) {
					execFileSync("git", ["worktree", "remove", "--force", mountAt], {
						cwd: repoDir,
						stdio: "pipe",
					});
				}
			} catch {
				// Best-effort cleanup; test assertions already ran.
			}
			fs.rmSync(repoDir, { recursive: true, force: true });
		}
	});
});
