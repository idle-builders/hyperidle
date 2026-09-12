/**
 * T3 (BA5 §14.2) — the one git adapter, through the public
 * `RegistryFilesystemMounter`. Local repo, public remote (no `gh`), private
 * remote through a PAT and through a `gh` login, the agent's own push,
 * distinct folders, a gone repo, unmount, and `forgetKeptCopy` — against the
 * real `git`/`gh` binaries and the real offline `github-stand-in` (§14.1), no
 * stub of any of it.
 */

import { execFile, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
	type GithubStandIn,
	startGithubStandIn,
} from "../../../src/__testing__/github-stand-in.js";
// `../../../src/*` are the layer root's own files — a relative, __tests__-only
// cross-package reach (Mechanism C exempts `__tests__/`), the same precedent
// the deleted `git-clone-adapter.integration.test.ts` used.
import { createGitRunner } from "../../../src/git-runner.js";
import { RegistryFilesystemMounter } from "../index.js";
import type { AdapterDeps, Filesystem } from "../mounter.js";
import { forgetKeptCopy } from "../mounter.js";

function tempDir(prefix: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const dirs: string[] = [];
function tracked(prefix: string): string {
	const dir = tempDir(prefix);
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function initLocalRepo(dir: string): void {
	execFileSync("git", ["init", "--quiet", "-b", "main", dir]);
	execFileSync("git", ["-C", dir, "config", "user.email", "t3@hyperidle.test"]);
	execFileSync("git", ["-C", dir, "config", "user.name", "t3"]);
	fs.writeFileSync(path.join(dir, "README.md"), "seed\n");
	execFileSync("git", ["-C", dir, "add", "-A"]);
	execFileSync("git", ["-C", dir, "commit", "--quiet", "-m", "seed"]);
}

function headSha(dir: string, ref = "HEAD"): string {
	return execFileSync("git", ["-C", dir, "rev-parse", ref], { encoding: "utf8" }).trim();
}

function worktreeList(repoDir: string): string {
	return execFileSync("git", ["-C", repoDir, "worktree", "list", "--porcelain"], {
		encoding: "utf8",
	});
}

function branchExists(repoDir: string, branch: string): boolean {
	return (
		execFileSync("git", ["-C", repoDir, "branch", "--list", branch], {
			encoding: "utf8",
		}).trim() !== ""
	);
}

function makeFilesystem(
	overrides: Partial<Filesystem> & { resourceRef: Filesystem["resourceRef"] },
): Filesystem {
	return {
		id: "fs-t3",
		teamId: "team-1",
		source: "local",
		kind: "code",
		connectionId: null,
		state: "attached",
		createdAt: "2026-09-01T00:00:00.000Z",
		...overrides,
	};
}

function deps(keptCopiesRoot?: string): AdapterDeps {
	return { gitRunnerFactory: (cwd: string) => createGitRunner(cwd), keptCopiesRoot };
}

const execFileAsync = promisify(execFile);

/**
 * A git call that reaches the stand-in over the network MUST be async.
 * `execFileSync` is `spawnSync` — it blocks this process's OWN event loop
 * until the child exits, but the stand-in's proxy/HTTP servers run ON that
 * same event loop, so a synchronous git process, the child, deadlocks
 * waiting on a CONNECT tunnel this process can never service while frozen
 * waiting on it (verified empirically: `execFileSync` reaches the stand-in's
 * proxy for `ls-remote`/`clone` inside the real runner's async `spawn` calls
 * without issue; a raw `execFileSync` clone against the exact same URL
 * ETIMEDOUTs every time). Never inherited bare either:
 * `GIT_TERMINAL_PROMPT`/`GIT_ASKPASS` guard against a stray credential lookup
 * blocking on a tty that never answers — the production runner sets both
 * unconditionally for the same reason.
 */
async function gitNet(
	args: readonly string[],
	home: string,
	extra?: Record<string, string>,
): Promise<void> {
	await execFileAsync("git", [...args], {
		env: {
			...process.env,
			HOME: home,
			GIT_TERMINAL_PROMPT: "0",
			GIT_ASKPASS: "/bin/false",
			...extra,
		},
	});
}

/** Real PATH with every directory that resolves `gh` removed. */
function pathWithoutGh(): string {
	const real = process.env.PATH ?? "";
	const kept = real.split(path.delimiter).filter((dir) => {
		if (!dir) return false;
		return !fs.existsSync(path.join(dir, "gh"));
	});
	return kept.join(path.delimiter);
}

describe("GitRepositoryAdapter — local repo (T3a)", () => {
	it("worktrees off the configured branch, not the repo's current HEAD", async () => {
		const repoDir = tracked("t3-local-");
		initLocalRepo(repoDir);
		const mainSha = headSha(repoDir);
		// Move the repo's own HEAD elsewhere — the mount must not follow it.
		execFileSync("git", ["-C", repoDir, "checkout", "-b", "feature"]);
		fs.writeFileSync(path.join(repoDir, "feature.txt"), "feature work\n");
		execFileSync("git", ["-C", repoDir, "add", "-A"]);
		execFileSync("git", ["-C", repoDir, "commit", "--quiet", "-m", "feature commit"]);
		expect(headSha(repoDir)).not.toBe(mainSha);

		const workspacePath = tracked("t3-ws-");
		const mounter = new RegistryFilesystemMounter(deps());
		const filesystem = makeFilesystem({
			id: "fs-local-1",
			resourceRef: { kind: "code", repo: repoDir, branch: "main" },
		});
		const result = await mounter.mount({
			filesystem,
			workspacePath,
			sessionId: "sess-local-1",
			folderName: "repo",
			credential: null,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("unreachable");
		expect(result.mounted.git?.remote).toBe(false);
		expect(result.mounted.git?.branch).toBe("hyperidle/sess-local-1");
		expect(headSha(result.mounted.folder)).toBe(mainSha);
		expect(
			execFileSync("git", ["-C", result.mounted.folder, "rev-parse", "--abbrev-ref", "HEAD"], {
				encoding: "utf8",
			}).trim(),
		).toBe("hyperidle/sess-local-1");
	});

	it("a second mount into the same workspace under a new session id recognises the existing worktree instead of failing (resume, §5.4/T4)", async () => {
		const repoDir = tracked("t3-local-adopt-");
		initLocalRepo(repoDir);
		const workspacePath = tracked("t3-ws-adopt-");
		const mounter = new RegistryFilesystemMounter(deps());
		const filesystem = makeFilesystem({
			id: "fs-local-adopt",
			resourceRef: { kind: "code", repo: repoDir, branch: "main" },
		});

		const first = await mounter.mount({
			filesystem,
			workspacePath,
			sessionId: "sess-adopt-1",
			folderName: "repo",
			credential: null,
		});
		expect(first.ok).toBe(true);
		if (!first.ok) throw new Error("unreachable");

		// The agent leaves uncommitted work in the worktree before the resume.
		fs.writeFileSync(path.join(first.mounted.folder, "uncommitted.txt"), "agent work\n");

		const second = await mounter.mount({
			filesystem,
			workspacePath,
			sessionId: "sess-adopt-2",
			folderName: "repo",
			credential: null,
		});

		expect(second.ok).toBe(true);
		if (!second.ok) throw new Error("unreachable");
		expect(second.mounted.adopted).toBe(true);
		expect(second.mounted.git?.branch).toBe(first.mounted.git?.branch);
		expect(second.mounted.folder).toBe(first.mounted.folder);
		expect(fs.readFileSync(path.join(second.mounted.folder, "uncommitted.txt"), "utf8")).toBe(
			"agent work\n",
		);
	});
});

describe("GitRepositoryAdapter — remote, through the offline github-stand-in (T3b-i)", () => {
	let standIn: GithubStandIn;

	beforeAll(async () => {
		standIn = await startGithubStandIn();
	});
	afterAll(async () => {
		await standIn.close();
	});

	it("(b) a public remote with no gh on PATH: clones once, fetches (not re-clones) the second mount", async () => {
		const { url } = standIn.createRepo("public-b", { branch: "main" });
		vi.stubEnv("PATH", pathWithoutGh());
		vi.stubEnv("HOME", standIn.home());

		const keptCopiesRoot = tracked("t3-kept-");
		const mounter = new RegistryFilesystemMounter(deps(keptCopiesRoot));
		const filesystem = makeFilesystem({
			id: "fs-public-b",
			source: "github",
			resourceRef: { kind: "code", repo: url, branch: "main" },
		});

		const ws1 = tracked("t3-ws1-");
		const first = await mounter.mount({
			filesystem,
			workspacePath: ws1,
			sessionId: "sess-b-1",
			folderName: "repo",
			credential: null,
		});
		expect(first.ok).toBe(true);
		if (!first.ok) throw new Error("unreachable");
		const keptCopy = first.mounted.git?.keptCopy as string;
		// A re-clone would replace `.git` wholesale and lose this — `git fetch`
		// (the second mount's real path) touches refs and pack files but never
		// this local config key.
		execFileSync("git", ["-C", keptCopy, "config", "hyperidle.test-sentinel", "kept"]);

		// A new commit lands on the server (public repo — no credential needed
		// to push) AFTER the first mount's clone.
		const pushDir = tracked("t3-push-");
		await gitNet(["clone", "--quiet", url, pushDir], standIn.home());
		fs.writeFileSync(path.join(pushDir, "late.txt"), "late commit\n");
		execFileSync("git", ["-C", pushDir, "add", "-A"]);
		execFileSync("git", [
			"-C",
			pushDir,
			"-c",
			"user.email=seed@hyperidle.test",
			"-c",
			"user.name=seed",
			"commit",
			"--quiet",
			"-m",
			"late commit",
		]);
		await gitNet(["-C", pushDir, "push", "--quiet", "origin", "HEAD:main"], standIn.home());
		const latestSha = headSha(pushDir);

		const ws2 = tracked("t3-ws2-");
		const second = await mounter.mount({
			filesystem,
			workspacePath: ws2,
			sessionId: "sess-b-2",
			folderName: "repo",
			credential: null,
		});
		expect(second.ok).toBe(true);
		if (!second.ok) throw new Error("unreachable");
		expect(second.mounted.git?.keptCopy).toBe(keptCopy);
		// Not re-cloned: the sentinel config key planted right after the first
		// clone survived — a re-clone would have replaced `.git` wholesale.
		expect(
			execFileSync("git", ["-C", keptCopy, "config", "hyperidle.test-sentinel"], {
				encoding: "utf8",
			}).trim(),
		).toBe("kept");
		// Fetched: the second mount's worktree sees the commit pushed after the
		// first mount's clone.
		expect(headSha(second.mounted.folder)).toBe(latestSha);
	});

	it("(c) a PAT authenticates a private remote; no token lands in the kept copy, the worktree, or $HOME/.gitconfig", async () => {
		standIn.createRepo("private-c", { private: true, token: "pat-secret", branch: "main" });
		vi.stubEnv("HOME", standIn.home());

		const keptCopiesRoot = tracked("t3-kept-");
		const mounter = new RegistryFilesystemMounter(deps(keptCopiesRoot));
		const filesystem = makeFilesystem({
			id: "fs-private-c",
			source: "github",
			connectionId: "conn-c",
			resourceRef: { kind: "code", repo: "https://github.com/private-c.git", branch: "main" },
		});
		const workspacePath = tracked("t3-ws-");
		const result = await mounter.mount({
			filesystem,
			workspacePath,
			sessionId: "sess-c-1",
			folderName: "repo",
			credential: "pat-secret",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("unreachable");
		const keptCopy = result.mounted.git?.keptCopy as string;
		const keptConfig = fs.readFileSync(path.join(keptCopy, ".git", "config"), "utf8");
		expect(keptConfig).not.toContain("pat-secret");
		const worktreeGitFile = fs.readFileSync(path.join(result.mounted.folder, ".git"), "utf8");
		expect(worktreeGitFile).not.toContain("pat-secret");
		const homeGitconfig = fs.readFileSync(
			path.join(process.env.HOME as string, ".gitconfig"),
			"utf8",
		);
		expect(homeGitconfig).not.toContain("pat-secret");
	});

	it("(d) the person's own gh login authenticates a private remote with no credential", async () => {
		standIn.createRepo("private-d", { private: true, token: "login-token-d", branch: "main" });
		vi.stubEnv("HOME", standIn.home({ ghLogin: { token: "login-token-d" } }));

		const keptCopiesRoot = tracked("t3-kept-");
		const mounter = new RegistryFilesystemMounter(deps(keptCopiesRoot));
		const filesystem = makeFilesystem({
			id: "fs-private-d",
			source: "github",
			resourceRef: { kind: "code", repo: "https://github.com/private-d.git", branch: "main" },
		});
		const workspacePath = tracked("t3-ws-");
		const result = await mounter.mount({
			filesystem,
			workspacePath,
			sessionId: "sess-d-1",
			folderName: "repo",
			credential: null,
		});

		expect(result.ok).toBe(true);
	});

	it("(e) the agent's own push, using the mount's agentEnv, lands the branch on the server", async () => {
		standIn.createRepo("push-e", { private: true, token: "push-token", branch: "main" });
		const home = standIn.home();
		vi.stubEnv("HOME", home);

		const keptCopiesRoot = tracked("t3-kept-");
		const mounter = new RegistryFilesystemMounter(deps(keptCopiesRoot));
		const filesystem = makeFilesystem({
			id: "fs-push-e",
			source: "github",
			connectionId: "conn-e",
			resourceRef: { kind: "code", repo: "https://github.com/push-e.git", branch: "main" },
		});
		const workspacePath = tracked("t3-ws-");
		const result = await mounter.mount({
			filesystem,
			workspacePath,
			sessionId: "sess-e-1",
			folderName: "repo",
			credential: "push-token",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("unreachable");

		fs.writeFileSync(path.join(result.mounted.folder, "agent-work.txt"), "done\n");
		execFileSync("git", ["-C", result.mounted.folder, "add", "-A"]);
		execFileSync("git", [
			"-C",
			result.mounted.folder,
			"-c",
			"user.email=agent@hyperidle.test",
			"-c",
			"user.name=agent",
			"commit",
			"--quiet",
			"-m",
			"agent work",
		]);
		await gitNet(
			["-C", result.mounted.folder, "push", "-u", "origin", "HEAD"],
			home,
			result.mounted.agentEnv as Record<string, string>,
		);

		expect(standIn.branches("push-e")).toContain(result.mounted.git?.branch);
	});

	it("(f) two distinct filesystems, same repo basename, get distinct folders and distinct kept copies", async () => {
		vi.stubEnv("HOME", standIn.home());
		standIn.createRepo("repo-namesake-1", { branch: "main" });
		standIn.createRepo("repo-namesake-2", { branch: "main" });

		const keptCopiesRoot = tracked("t3-kept-");
		const mounter = new RegistryFilesystemMounter(deps(keptCopiesRoot));
		const workspacePath = tracked("t3-ws-");
		const first = await mounter.mount({
			filesystem: makeFilesystem({
				id: "fs-namesake-1",
				source: "github",
				resourceRef: {
					kind: "code",
					repo: "https://github.com/repo-namesake-1.git",
					branch: "main",
				},
			}),
			workspacePath,
			sessionId: "sess-f-1",
			folderName: "repo",
			credential: null,
		});
		const second = await mounter.mount({
			filesystem: makeFilesystem({
				id: "fs-namesake-2",
				source: "github",
				resourceRef: {
					kind: "code",
					repo: "https://github.com/repo-namesake-2.git",
					branch: "main",
				},
			}),
			workspacePath,
			sessionId: "sess-f-2",
			folderName: "repo-fs-names",
			credential: null,
		});

		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);
		if (!(first.ok && second.ok)) throw new Error("unreachable");
		expect(first.mounted.folder).not.toBe(second.mounted.folder);
		expect(first.mounted.git?.keptCopy).not.toBe(second.mounted.git?.keptCopy);
		expect(fs.existsSync(first.mounted.folder)).toBe(true);
		expect(fs.existsSync(second.mounted.folder)).toBe(true);
	});

	it("(g) a repo that does not exist fails with a readable reason and no token in it", async () => {
		vi.stubEnv("HOME", standIn.home());
		const keptCopiesRoot = tracked("t3-kept-");
		const mounter = new RegistryFilesystemMounter(deps(keptCopiesRoot));
		const filesystem = makeFilesystem({
			id: "fs-gone",
			source: "github",
			connectionId: "conn-gone",
			resourceRef: {
				kind: "code",
				repo: "https://github.com/does-not-exist-t3.git",
				branch: "main",
			},
		});
		const workspacePath = tracked("t3-ws-");
		const result = await mounter.mount({
			filesystem,
			workspacePath,
			sessionId: "sess-g-1",
			folderName: "repo",
			credential: "some-secret-token",
		});

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("unreachable");
		expect(result.reason.length).toBeGreaterThan(0);
		expect(result.reason).not.toContain("some-secret-token");
	});

	it("(h) unmount removes the worktree from `git worktree list`; the branch stays", async () => {
		vi.stubEnv("HOME", standIn.home());
		standIn.createRepo("unmount-h", { branch: "main" });
		const keptCopiesRoot = tracked("t3-kept-");
		const mounter = new RegistryFilesystemMounter(deps(keptCopiesRoot));
		const workspacePath = tracked("t3-ws-");
		const result = await mounter.mount({
			filesystem: makeFilesystem({
				id: "fs-unmount-h",
				source: "github",
				resourceRef: { kind: "code", repo: "https://github.com/unmount-h.git", branch: "main" },
			}),
			workspacePath,
			sessionId: "sess-h-1",
			folderName: "repo",
			credential: null,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error("unreachable");
		const keptCopy = result.mounted.git?.keptCopy as string;
		const branch = result.mounted.git?.branch as string;
		expect(worktreeList(keptCopy)).toContain(result.mounted.folder);

		await mounter.unmount(result.mounted);

		expect(worktreeList(keptCopy)).not.toContain(result.mounted.folder);
		expect(branchExists(keptCopy, branch)).toBe(true);
	});

	it("(i) forgetKeptCopy removes a remote's kept copy, and never a local repo", async () => {
		vi.stubEnv("HOME", standIn.home());
		standIn.createRepo("forget-i", { branch: "main" });
		const keptCopiesRoot = tracked("t3-kept-");
		const mounter = new RegistryFilesystemMounter(deps(keptCopiesRoot));
		const remoteFs = makeFilesystem({
			id: "fs-forget-i",
			source: "github",
			resourceRef: { kind: "code", repo: "https://github.com/forget-i.git", branch: "main" },
		});
		const remoteResult = await mounter.mount({
			filesystem: remoteFs,
			workspacePath: tracked("t3-ws-"),
			sessionId: "sess-i-1",
			folderName: "repo",
			credential: null,
		});
		expect(remoteResult.ok).toBe(true);
		if (!remoteResult.ok) throw new Error("unreachable");
		const keptCopy = remoteResult.mounted.git?.keptCopy as string;
		expect(fs.existsSync(keptCopy)).toBe(true);

		await forgetKeptCopy(keptCopiesRoot, remoteFs);
		expect(fs.existsSync(keptCopy)).toBe(false);

		const localRepoDir = tracked("t3-local-forget-");
		initLocalRepo(localRepoDir);
		const localFs = makeFilesystem({
			id: "fs-forget-local",
			resourceRef: { kind: "code", repo: localRepoDir, branch: "main" },
		});
		await forgetKeptCopy(keptCopiesRoot, localFs);
		expect(fs.existsSync(localRepoDir)).toBe(true);
	});
});
