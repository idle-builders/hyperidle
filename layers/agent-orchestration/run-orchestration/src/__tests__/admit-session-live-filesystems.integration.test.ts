/**
 * T9 (BA5 §14.2) — a session run to completion, through the real one-git-adapter
 * mount engine: the agent is told what it has (§9), a mounted git filesystem's
 * worktree is unmounted at teardown while its branch stays (§5.5), a session
 * awaiting a review verdict keeps its worktree instead, `trustedPaths` carry
 * the kept copy (§5.6), and a mounted filesystem's OWN env (e.g. `GH_TOKEN`)
 * reaches the harness even with no `serviceConnectionResolver` wired (§6.1).
 *
 * AU26 F2 (historical, still true): Phase 4.5 asks `deps.injectedFilesystems`
 * for THIS agent, live, at spawn — `SessionLifecyclePorts` declares no
 * `filesystems` field at all, so there is no core-api seam left to reach.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, describe, vi } from "vitest";
// `../../../src/git-runner.js` is the layer root's own runner — a relative,
// __tests__-only cross-package reach (Mechanism C exempts `__tests__/`), same
// precedent the deleted `git-clone-adapter.integration.test.ts` used.
import { createGitRunner } from "../../../src/git-runner.js";
import type { FilesystemMounterPort } from "../filesystem-provisioning.js";
import { RegistryFilesystemMounter } from "../index.js";
import type { MountedFilesystem } from "../mounter.js";
import { createProvisioner } from "../provisioner.js";
import { recordReviewSession } from "../review-sessions.js";

type CreateProvisioner = typeof createProvisioner;
type SessionLifecyclePorts = Parameters<CreateProvisioner>[0];
type Provisioner = ReturnType<CreateProvisioner>;
type AdmitArgs = Parameters<Provisioner["admit"]>;
type ProvisionSessionDeps = AdmitArgs[0];
type ProvisionSessionParams = AdmitArgs[1];
type FakeAdapterPoolEntry = NonNullable<ReturnType<ProvisionSessionDeps["adapterPool"]["select"]>>;
type FakeHarnessAdapter = FakeAdapterPoolEntry["adapter"];

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

function tempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ba5-t9-"));
	dirs.push(dir);
	return dir;
}

function initLocalRepo(dir: string): void {
	execFileSync("git", ["init", "--quiet", "-b", "main", dir]);
	execFileSync("git", ["-C", dir, "config", "user.email", "t9@hyperidle.test"]);
	execFileSync("git", ["-C", dir, "config", "user.name", "t9"]);
	fs.writeFileSync(path.join(dir, "README.md"), "seed\n");
	execFileSync("git", ["-C", dir, "add", "-A"]);
	execFileSync("git", ["-C", dir, "commit", "--quiet", "-m", "seed"]);
}

function worktreeList(repoDir: string): string {
	return execFileSync("git", ["-C", repoDir, "worktree", "list", "--porcelain"], { encoding: "utf8" });
}

function branchExists(repoDir: string, branch: string): boolean {
	return (
		execFileSync("git", ["-C", repoDir, "branch", "--list", branch], { encoding: "utf8" }).trim() !== ""
	);
}

interface CapturedStart {
	mcpTokenEnv?: Record<string, string>;
}

function buildFakeHarnessAdapter(opts: {
	readonly captured: CapturedStart;
	readonly toolName?: string;
	readonly onReturnAction?: (toolName: string) => Promise<void>;
}): FakeHarnessAdapter {
	return {
		startSession: async (config: { sessionId: string; mcpTokenEnv?: Record<string, string> }) => {
			opts.captured.mcpTokenEnv = config.mcpTokenEnv;
			return { sessionId: config.sessionId };
		},
		streamEvents: () => ({
			async *[Symbol.asyncIterator]() {
				if (opts.toolName) {
					await opts.onReturnAction?.(opts.toolName);
					yield { type: "tool_call", toolName: opts.toolName, args: {} };
				}
			},
		}),
		stopSession: async () => ({ outcome: "completed" as const, tokenUsage: { byTier: {} } }),
		getCapabilities: () => ({
			preCompactionTrigger: false,
			subAgents: false,
			modelProviders: [],
			mcpSupport: false,
			returnEnforcement: "none" as const,
			cliMcpDialect: "codex-toml" as const,
		}),
		getNativeSessionId: () => "native-abc",
	} as unknown as FakeHarnessAdapter;
}

function buildHarnessPorts(opts: { trustedPathsSeen: string[][] }): SessionLifecyclePorts {
	const neverCalled = (label: string) =>
		vi.fn(() => {
			throw new Error(`${label}: must not be called in this test scenario`);
		});
	return {
		sessionRequests: {
			findSessionRequest: neverCalled("sessionRequests.findSessionRequest"),
			listSessionRequests: neverCalled("sessionRequests.listSessionRequests"),
			transitionSessionRequest: neverCalled("sessionRequests.transitionSessionRequest"),
			abortSessionRun: neverCalled("sessionRequests.abortSessionRun"),
			registerSessionRun: vi.fn(),
			deregisterSessionRun: vi.fn(),
		},
		observability: { summarizeToolArgs: () => "" },
		harnessRuntime: {
			enforcementRegistry: {
				register: vi.fn(),
				get: vi.fn(() => undefined),
				incrementForce: vi.fn(),
				unregister: vi.fn(),
			},
			createReturnGate: () => ({ observe: () => undefined, returned: true }),
			evaluateReturn: () => "returned" as const,
			provisionReturnHook: async () => undefined,
			writeCliMcpConfig: async (params: { trustedPaths?: readonly string[] }) => {
				opts.trustedPathsSeen.push([...(params.trustedPaths ?? [])]);
				return {};
			},
			writePluginStdioMcpEntries: vi.fn(),
			openMcpBridge: async () => ({ token: "tok", url: "http://127.0.0.1:0/mcp" }),
			closeMcpBridge: async () => undefined,
		},
		toolProvider: {
			buildToolRegistry: () => ({ invoke: async () => ({ success: true, data: undefined }) }),
			toolsForRole: () => [],
			returnStatusToolForRegistry: () => ({ name: "return_status" }),
		},
		contextAssembly: {
			assembleAgentContext: neverCalled("contextAssembly.assembleAgentContext"),
			beginAgentWriteback: () => ({ dispose: () => undefined }),
			assemblePrompt: neverCalled("contextAssembly.assemblePrompt"),
			assembleRoutinePrompt: neverCalled("contextAssembly.assembleRoutinePrompt"),
			writeSandboxAgentsMd: (sandboxPath: string, prompt: string) => {
				fs.writeFileSync(path.join(sandboxPath, "AGENTS.md"), prompt);
			},
		},
	} as unknown as SessionLifecyclePorts;
}

async function seedAgent(db: HyperIdleDb, agentId: string): Promise<void> {
	await db.insert(users).values({
		id: agentId,
		kind: "ai",
		name: "Agent",
		role: "builder",
		status: "active",
		createdAt: new Date().toISOString(),
	});
}

function buildParams(agentId: string, workspacePath: string): ProvisionSessionParams {
	return {
		taskId: null,
		agentId,
		productId: "task-free",
		sandboxBasePath: workspacePath,
		agentConfig: { kind: "ai", status: "active", role: "builder", teamId: null },
		harnessDisabled: [],
	} as unknown as ProvisionSessionParams;
}

describe("a session run to completion, with a real mounted git filesystem", () => {
	test("writes AGENTS.md naming the mount, then unmounts the worktree while the branch stays", async ({
		db,
	}) => {
		const repoDir = tempDir();
		initLocalRepo(repoDir);
		const workspacePath = tempDir();
		const agentId = "agent-t9-1";
		await seedAgent(db as HyperIdleDb, agentId);

		const captured: CapturedStart = {};
		const trustedPathsSeen: string[][] = [];
		const deps = {
			db,
			eventBus: new EventBus(),
			injectedFilesystems: {
				listInjectedForProvisioning: async () => [
					{
						id: "fs-t9-1",
						teamId: "team-1",
						source: "local",
						kind: "code",
						connectionId: null,
						resourceRef: { kind: "code", repo: repoDir, branch: "main" },
						state: "attached",
						createdAt: new Date().toISOString(),
					},
				],
			},
			mounter: new RegistryFilesystemMounter({ gitRunnerFactory: (cwd: string) => createGitRunner(cwd) }),
			adapterPool: {
				select: () => ({
					id: "fake-adapter",
					adapter: buildFakeHarnessAdapter({ captured }),
					meta: { name: "Fake", kind: "local", type: undefined, modelProviders: [], maxConcurrent: 5 },
				}),
				release: () => undefined,
				describeSelectFailure: () => "test pool selected nothing",
			},
			workspace: {
				spawn: async () => ({ sandboxId: "sbx-1", path: workspacePath }),
				exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
				adopt: async (p: string) => ({ sandboxId: "sbx-adopted", path: p }),
				destroy: async () => undefined,
			},
		} as unknown as ProvisionSessionDeps;

		const params = buildParams(agentId, workspacePath);
		const provisioner = createProvisioner(buildHarnessPorts({ trustedPathsSeen }));

		const admitted = await provisioner.admit(deps, params);
		expect(admitted.mountedFilesystems).toHaveLength(1);
		const mountedFs = admitted.mountedFilesystems[0] as MountedFilesystem;
		expect(mountedFs.git?.remote).toBe(false);
		expect(mountedFs.git?.keptCopy).toBe(fs.realpathSync(repoDir));

		await provisioner.run(deps, params, admitted);

		const agentsMd = fs.readFileSync(path.join(workspacePath, "AGENTS.md"), "utf8");
		expect(agentsMd).toContain("## Filesystems");
		expect(agentsMd).toContain(path.basename(mountedFs.folder));
		expect(agentsMd).toContain(mountedFs.git?.branch as string);
		expect(agentsMd).toContain("main");

		const keptCopy = mountedFs.git?.keptCopy as string;
		const branch = mountedFs.git?.branch as string;
		expect(worktreeList(keptCopy)).not.toContain(mountedFs.folder);
		expect(branchExists(keptCopy, branch)).toBe(true);

		expect(trustedPathsSeen[0]).toContain(keptCopy);
	});

	test("a session that awaits a review verdict keeps its worktree instead of unmounting it", async ({
		db,
	}) => {
		const repoDir = tempDir();
		initLocalRepo(repoDir);
		const workspacePath = tempDir();
		const agentId = "agent-t9-2";
		await seedAgent(db as HyperIdleDb, agentId);

		let sessionIdForLink: string | undefined;
		const onReturnAction = async (toolName: string): Promise<void> => {
			if (!(toolName.endsWith("submit_review") && sessionIdForLink)) return;
			await recordReviewSession(
				db as HyperIdleDb,
				{ reviewMessageId: `review-${sessionIdForLink}`, sessionId: sessionIdForLink },
				new Date().toISOString(),
			);
		};

		const captured: CapturedStart = {};
		const deps = {
			db,
			eventBus: new EventBus(),
			injectedFilesystems: {
				listInjectedForProvisioning: async () => [
					{
						id: "fs-t9-2",
						teamId: "team-1",
						source: "local",
						kind: "code",
						connectionId: null,
						resourceRef: { kind: "code", repo: repoDir, branch: "main" },
						state: "attached",
						createdAt: new Date().toISOString(),
					},
				],
			},
			mounter: new RegistryFilesystemMounter({ gitRunnerFactory: (cwd: string) => createGitRunner(cwd) }),
			adapterPool: {
				select: () => ({
					id: "fake-adapter",
					adapter: buildFakeHarnessAdapter({
						captured,
						toolName: "mcp__hyperidle__submit_review",
						onReturnAction,
					}),
					meta: { name: "Fake", kind: "local", type: undefined, modelProviders: [], maxConcurrent: 5 },
				}),
				release: () => undefined,
				describeSelectFailure: () => "test pool selected nothing",
			},
			workspace: {
				spawn: async () => ({ sandboxId: "sbx-2", path: workspacePath }),
				exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
				adopt: async (p: string) => ({ sandboxId: "sbx-adopted", path: p }),
				destroy: async () => undefined,
			},
		} as unknown as ProvisionSessionDeps;

		const params = buildParams(agentId, workspacePath);
		const provisioner = createProvisioner(buildHarnessPorts({ trustedPathsSeen: [] }));

		const admitted = await provisioner.admit(deps, params);
		sessionIdForLink = admitted.sessionId;
		const mountedFs = admitted.mountedFilesystems[0] as MountedFilesystem;

		await provisioner.run(deps, params, admitted);

		const keptCopy = mountedFs.git?.keptCopy as string;
		expect(
			worktreeList(keptCopy),
			"the human has not answered yet; unmounting now loses the agent's uncommitted work in a worktree the resume expects to still be there",
		).toContain(mountedFs.folder);
		expect(fs.existsSync(workspacePath)).toBe(true);
	});
});

describe("a mounted filesystem's own env reaches the harness (BA5 §6.1)", () => {
	test("GH_TOKEN merges outside the connection-provisioning block, with no serviceConnectionResolver wired", async ({
		db,
	}) => {
		const workspacePath = tempDir();
		const agentId = "agent-t9-3";
		await seedAgent(db as HyperIdleDb, agentId);

		const fakeMounted: MountedFilesystem = {
			filesystem: {
				id: "fs-t9-3",
				teamId: "team-1",
				source: "github",
				kind: "code",
				connectionId: "conn-1",
				resourceRef: { kind: "code", repo: "https://github.com/a/repo.git", branch: "main" },
				state: "attached",
				createdAt: new Date().toISOString(),
			},
			folder: path.join(workspacePath, "repo"),
			trustedPath: "/tmp/kept/repo",
			git: { keptCopy: "/tmp/kept/repo", branch: "hyperidle/session-x", base: "origin/main", remote: true },
			agentEnv: {
				GH_TOKEN: "fs-secret-token",
				GIT_CONFIG_COUNT: "2",
				GIT_CONFIG_KEY_0: "credential.https://github.com.helper",
				GIT_CONFIG_VALUE_0: "",
				GIT_CONFIG_KEY_1: "credential.https://github.com.helper",
				GIT_CONFIG_VALUE_1: "!gh auth git-credential",
			},
			adopted: false,
		};
		const fakeMounter: FilesystemMounterPort = {
			mount: async () => ({ ok: true, mounted: fakeMounted }),
			unmount: async () => undefined,
		};

		const captured: CapturedStart = {};
		const deps = {
			db,
			eventBus: new EventBus(),
			injectedFilesystems: {
				listInjectedForProvisioning: async () => [
					{
						id: fakeMounted.filesystem.id,
						teamId: "team-1",
						source: "github",
						kind: "code",
						connectionId: "conn-1",
						resourceRef: fakeMounted.filesystem.resourceRef,
						state: "attached",
						createdAt: fakeMounted.filesystem.createdAt,
					},
				],
			},
			mounter: fakeMounter,
			// deliberately absent: serviceConnectionResolver / heldConnections.
			adapterPool: {
				select: () => ({
					id: "fake-adapter",
					adapter: buildFakeHarnessAdapter({ captured }),
					meta: { name: "Fake", kind: "local", type: undefined, modelProviders: [], maxConcurrent: 5 },
				}),
				release: () => undefined,
				describeSelectFailure: () => "test pool selected nothing",
			},
			workspace: {
				spawn: async () => ({ sandboxId: "sbx-3", path: workspacePath }),
				exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
				adopt: async (p: string) => ({ sandboxId: "sbx-adopted", path: p }),
				destroy: async () => undefined,
			},
		} as unknown as ProvisionSessionDeps;

		const params = buildParams(agentId, workspacePath);
		const provisioner = createProvisioner(buildHarnessPorts({ trustedPathsSeen: [] }));

		const admitted = await provisioner.admit(deps, params);
		await provisioner.run(deps, params, admitted);

		expect(captured.mcpTokenEnv?.GH_TOKEN).toBe("fs-secret-token");
	});
});
