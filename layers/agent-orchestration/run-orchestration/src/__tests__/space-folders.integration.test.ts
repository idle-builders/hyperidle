/**
 * Integration tests for space-folder mounting on a real git repository.
 *
 * Tests:
 *  - git repo in space → mounted as a git worktree at workingFolder/<name>
 *  - plain directory in space → linked at workingFolder/<name>
 *  - dangling symlink in space → skipped; other folders still mount
 *  - trustedPaths contains real paths of successfully mounted folders
 *  - second mount call reuses the existing worktree (no error)
 *  - after `git worktree remove`, next mount re-attaches the branch without -b
 *  - info/exclude gets the scaffolding exclusion marker after a git mount
 *  - reserved names are matched case-insensitively ('Tasks', '.Codex')
 *  - plain-folder mount succeeds even when a stale dangling link already exists at mountAt
 *  - two spaces linking the same repo for the same task id mount without branch collision
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createGitRunner } from "../../../src/git-runner.js";
import { addSpaceFolder, listSpaceFolders, mountSpaceFolders } from "../space-folders.js";

let tmpdir: string;
let spacePath: string;
let workingFolder: string;

const deps = { gitRunnerFactory: (repo: string) => createGitRunner(repo), workBranch: "hi/test" };

function initRepo(dir: string): void {
	execFileSync("git", ["init", "--quiet"], { cwd: dir });
	execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
	execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
	fs.writeFileSync(path.join(dir, "README.md"), "init\n");
	execFileSync("git", ["add", "README.md"], { cwd: dir });
	execFileSync("git", ["commit", "--quiet", "-m", "init"], { cwd: dir });
}

beforeEach(() => {
	tmpdir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sf-int-")));
	spacePath = path.join(tmpdir, "space");
	workingFolder = path.join(tmpdir, "work");
	fs.mkdirSync(spacePath);
	fs.mkdirSync(workingFolder);
});

afterEach(() => {
	vi.unstubAllEnvs();
	// Best-effort cleanup of any git worktrees before removing the tempdir.
	try {
		for (const entry of fs.readdirSync(workingFolder)) {
			const wtPath = path.join(workingFolder, entry);
			const gitFile = path.join(wtPath, ".git");
			if (fs.existsSync(gitFile) && !fs.statSync(gitFile).isDirectory()) {
				const content = fs.readFileSync(gitFile, "utf8").trim();
				const match = content.match(/^gitdir:\s*(.+)$/);
				if (match?.[1]) {
					const repoPath = path.resolve(wtPath, match[1]).split("/.git/")[0] ?? "";
					if (repoPath && fs.existsSync(repoPath)) {
						try {
							execFileSync("git", ["worktree", "remove", "--force", wtPath], {
								cwd: repoPath,
								stdio: "pipe",
							});
						} catch {
							// Ignore cleanup failures.
						}
					}
				}
			}
		}
	} catch {
		// Space not found or already removed.
	}
	fs.rmSync(tmpdir, { recursive: true, force: true });
});

describe("mountSpaceFolders", () => {
	test("git repo linked in space → mounted as a git worktree", async () => {
		const repoDir = path.join(tmpdir, "myrepo");
		fs.mkdirSync(repoDir);
		initRepo(repoDir);
		fs.symlinkSync(repoDir, path.join(spacePath, "myrepo"));

		const { trustedPaths } = await mountSpaceFolders(spacePath, workingFolder, deps);

		const wtPath = path.join(workingFolder, "myrepo");
		expect(fs.existsSync(wtPath)).toBe(true);
		// A worktree has a .git FILE (not directory).
		expect(fs.statSync(path.join(wtPath, ".git")).isDirectory()).toBe(false);
		expect(trustedPaths).toContain(repoDir);
	});

	test("plain directory linked in space → symlinked into working folder", async () => {
		const plainDir = path.join(tmpdir, "docs");
		fs.mkdirSync(plainDir);
		fs.symlinkSync(plainDir, path.join(spacePath, "docs"));

		const { trustedPaths } = await mountSpaceFolders(spacePath, workingFolder, deps);

		const linkAt = path.join(workingFolder, "docs");
		expect(fs.lstatSync(linkAt).isSymbolicLink()).toBe(true);
		expect(fs.readlinkSync(linkAt)).toBe(plainDir);
		expect(trustedPaths).toContain(plainDir);
	});

	test("dangling symlink is skipped; other folders still mount", async () => {
		fs.symlinkSync(path.join(tmpdir, "gone"), path.join(spacePath, "gone"));
		const plainDir = path.join(tmpdir, "real");
		fs.mkdirSync(plainDir);
		fs.symlinkSync(plainDir, path.join(spacePath, "real"));

		const { trustedPaths } = await mountSpaceFolders(spacePath, workingFolder, deps);

		expect(fs.existsSync(path.join(workingFolder, "gone"))).toBe(false);
		expect(fs.lstatSync(path.join(workingFolder, "real")).isSymbolicLink()).toBe(true);
		expect(trustedPaths).not.toContain(path.join(tmpdir, "gone"));
		expect(trustedPaths).toContain(plainDir);
	});

	test("trustedPaths contains the real target path of each successfully mounted folder", async () => {
		const dirA = path.join(tmpdir, "a");
		const dirB = path.join(tmpdir, "b");
		fs.mkdirSync(dirA);
		fs.mkdirSync(dirB);
		fs.symlinkSync(dirA, path.join(spacePath, "a"));
		fs.symlinkSync(dirB, path.join(spacePath, "b"));

		const { trustedPaths } = await mountSpaceFolders(spacePath, workingFolder, deps);

		expect(trustedPaths).toHaveLength(2);
		expect(trustedPaths).toContain(dirA);
		expect(trustedPaths).toContain(dirB);
	});

	test("second mount reuses the existing git worktree without error", async () => {
		const repoDir = path.join(tmpdir, "repo2");
		fs.mkdirSync(repoDir);
		initRepo(repoDir);
		fs.symlinkSync(repoDir, path.join(spacePath, "repo2"));

		// First mount.
		const first = await mountSpaceFolders(spacePath, workingFolder, deps);
		expect(first.trustedPaths).toContain(repoDir);
		const wtPath = path.join(workingFolder, "repo2");
		expect(fs.existsSync(path.join(wtPath, ".git"))).toBe(true);

		// Second mount — reuse path; .git file is unchanged.
		const second = await mountSpaceFolders(spacePath, workingFolder, deps);
		expect(second.trustedPaths).toContain(repoDir);
		expect(fs.existsSync(path.join(wtPath, ".git"))).toBe(true);
		// @lore: reuse — isExistingWorktree guard prevents "worktree already exists" on second mount; removing it fails here.
	});

	test("after git worktree remove, next mount re-attaches the branch without -b", async () => {
		const repoDir = path.join(tmpdir, "repo3");
		fs.mkdirSync(repoDir);
		initRepo(repoDir);
		fs.symlinkSync(repoDir, path.join(spacePath, "repo3"));

		// First mount — creates the branch and worktree.
		await mountSpaceFolders(spacePath, workingFolder, deps);
		const wtPath = path.join(workingFolder, "repo3");

		// Remove the worktree (simulates what happens when a working folder is cleaned up).
		execFileSync("git", ["worktree", "remove", "--force", wtPath], {
			cwd: repoDir,
			stdio: "pipe",
		});
		expect(fs.existsSync(wtPath)).toBe(false);

		// Second mount — branch still exists in the repo; re-attaches without -b.
		const second = await mountSpaceFolders(spacePath, workingFolder, deps);
		expect(second.trustedPaths).toContain(repoDir);
		expect(fs.existsSync(path.join(wtPath, ".git"))).toBe(true);
	});

	test("git worktree mount writes the scaffolding exclusion marker to info/exclude", async () => {
		const repoDir = path.join(tmpdir, "repo4");
		fs.mkdirSync(repoDir);
		initRepo(repoDir);
		fs.symlinkSync(repoDir, path.join(spacePath, "repo4"));

		await mountSpaceFolders(spacePath, workingFolder, deps);

		// The worktree's gitdir has an info/exclude with the scaffolding marker.
		const wtPath = path.join(workingFolder, "repo4");
		const gitFileContent = fs.readFileSync(path.join(wtPath, ".git"), "utf8").trim();
		const match = gitFileContent.match(/^gitdir:\s*(.+)$/);
		expect(match).toBeTruthy();
		const gitDir = path.resolve(wtPath, match![1]!);
		const excludePath = path.join(gitDir, "info", "exclude");
		expect(fs.existsSync(excludePath)).toBe(true);
		expect(fs.readFileSync(excludePath, "utf8")).toContain("# HyperIdle scaffolding exclusion");
	});

	test.each([
		{ name: "Tasks", desc: "mixed-case reserved" },
		{ name: ".Codex", desc: "mixed-case dot reserved" },
	])("$desc name '$name' is excluded from listSpaceFolders", ({ name }) => {
		const target = path.join(tmpdir, "some-dir");
		fs.mkdirSync(target);
		fs.symlinkSync(target, path.join(spacePath, name));

		const folders = listSpaceFolders(spacePath);
		expect(folders.map((f) => f.name)).not.toContain(name);
	});

	test.each([
		{ name: "Tasks", desc: "mixed-case reserved" },
		{ name: ".Codex", desc: "mixed-case dot reserved" },
	])("$desc name '$name' is refused by addSpaceFolder", ({ name }) => {
		const target = path.join(tmpdir, "some-dir2");
		fs.mkdirSync(target);

		const result = addSpaceFolder(spacePath, target, name);
		expect(result).toMatchObject({ ok: false, code: "RESERVED_NAME" });
	});

	test("plain-folder mount succeeds when a stale dangling link already occupies mountAt", async () => {
		const plainDir = path.join(tmpdir, "real-plain");
		fs.mkdirSync(plainDir);
		fs.symlinkSync(plainDir, path.join(spacePath, "plain"));

		// First mount — creates the symlink.
		await mountSpaceFolders(spacePath, workingFolder, deps);
		const mountAt = path.join(workingFolder, "plain");
		expect(fs.lstatSync(mountAt).isSymbolicLink()).toBe(true);

		// Replace the valid symlink with a dangling one (target never exists).
		const staleTarget = path.join(tmpdir, "stale-target");
		fs.unlinkSync(mountAt);
		fs.symlinkSync(staleTarget, mountAt);
		expect(fs.existsSync(mountAt)).toBe(false); // dangling

		// Second mount — must replace the stale link without EEXIST.
		const second = await mountSpaceFolders(spacePath, workingFolder, deps);
		expect(second.trustedPaths).toContain(plainDir);
		expect(fs.lstatSync(mountAt).isSymbolicLink()).toBe(true);
		expect(fs.readlinkSync(mountAt)).toBe(plainDir);
	});

	test("two spaces linking the same repo for the same task mount without branch collision", async () => {
		const repoDir = path.join(tmpdir, "shared-repo");
		fs.mkdirSync(repoDir);
		initRepo(repoDir);

		// Space A: agentA's space
		const spaceA = path.join(tmpdir, "space-agentA");
		const workA = path.join(tmpdir, "work-agentA");
		fs.mkdirSync(spaceA);
		fs.mkdirSync(workA);
		fs.symlinkSync(repoDir, path.join(spaceA, "myrepo"));

		// Space B: agentB's space (different basename → different branch)
		const spaceB = path.join(tmpdir, "space-agentB");
		const workB = path.join(tmpdir, "work-agentB");
		fs.mkdirSync(spaceB);
		fs.mkdirSync(workB);
		fs.symlinkSync(repoDir, path.join(spaceB, "myrepo"));

		const branchA = `agent/space-agentA/tasks/T-test`;
		const branchB = `agent/space-agentB/tasks/T-test`;
		const depsA = { gitRunnerFactory: deps.gitRunnerFactory, workBranch: branchA };
		const depsB = { gitRunnerFactory: deps.gitRunnerFactory, workBranch: branchB };

		// Both agents mounting the same repo for the same task id — no collision.
		const resultA = await mountSpaceFolders(spaceA, workA, depsA);
		const resultB = await mountSpaceFolders(spaceB, workB, depsB);

		expect(resultA.trustedPaths).toContain(repoDir);
		expect(resultB.trustedPaths).toContain(repoDir);
		expect(fs.existsSync(path.join(workA, "myrepo", ".git"))).toBe(true);
		expect(fs.existsSync(path.join(workB, "myrepo", ".git"))).toBe(true);
	});
});
