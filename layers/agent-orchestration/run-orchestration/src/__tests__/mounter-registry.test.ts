import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { RegistryFilesystemMounter } from "../index.js";
import {
	type AdapterDeps,
	ensureSandboxGitRepo,
	type Filesystem,
	localTrustedPath,
} from "../mounter.js";

const deps: AdapterDeps = {
	gitRunnerFactory: () => null as never,
};

function filesystem(overrides: Partial<Filesystem>): Filesystem {
	return {
		id: "fs-test",
		teamId: "team-1",
		source: "gdrive",
		kind: "doc_set",
		connectionId: null,
		resourceRef: { kind: "doc_set", folder: "/tmp" },
		writeback: "file",
		state: "reachable",
		createdAt: "2025-01-01T00:00:00Z",
		...overrides,
	};
}

describe("RegistryFilesystemMounter dispatch", () => {
	it("reports unsupported cloud sources explicitly through the public mount contract", async () => {
		const result = await new RegistryFilesystemMounter(deps).mount({
			filesystem: filesystem({ source: "gdrive" }),
			sandboxPath: "/tmp/sandbox",
		});
		expect(result).toMatchObject({ success: false, error: expect.stringContaining("not built") });
	});

	it("rejects remote code without a connection instead of silently selecting an adapter", async () => {
		const remote = filesystem({
			kind: "code",
			source: "github",
			resourceRef: { kind: "code", repo: "owner/repo", branch: "main" },
		});
		await expect(
			new RegistryFilesystemMounter(deps).mount({
				filesystem: remote,
				sandboxPath: "/tmp/s",
			}),
		).rejects.toThrow("MalformedFilesystem");
	});

	it("does not write excludes through a malicious worktree gitdir pointer", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "au20-gitdir-"));
		const repo = path.join(root, "repo");
		const sandbox = path.join(root, "sandbox");
		const external = path.join(root, ".git", "worktrees", "attacker");
		fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
		fs.rmSync(path.join(repo, ".git"), { recursive: true });
		execFileSync("git", ["init", repo]);
		fs.mkdirSync(external, { recursive: true });
		const maliciousDeps = {
			...deps,
			gitRunnerFactory: () => ({
				worktreeAdd: async () => {
					fs.mkdirSync(sandbox, { recursive: true });
					fs.writeFileSync(path.join(sandbox, ".git"), `gitdir: ${external}\n`);
				},
			}),
		} as unknown as AdapterDeps;
		const result = await new RegistryFilesystemMounter(maliciousDeps).mount({
			filesystem: filesystem({
				kind: "code",
				source: "local",
				resourceRef: { kind: "code", repo, branch: "main" },
			}),
			sandboxPath: sandbox,
		});
		expect(result.success).toBe(true);
		expect(fs.existsSync(path.join(external, "info", "exclude"))).toBe(false);
		fs.rmSync(root, { recursive: true, force: true });
	});
});

describe("a local folder written from home", () => {
	it("mounts a repo written as ~/repo, the way the folder dialog suggests", async () => {
		const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mount-home-")));
		const repo = path.join(home, "repo");
		execFileSync("git", ["init", "-q", repo]);
		execFileSync("git", [
			"-C",
			repo,
			"-c",
			"user.name=t",
			"-c",
			"user.email=t@t",
			"commit",
			"-q",
			"--allow-empty",
			"-m",
			"start",
		]);
		const runIn: string[] = [];
		const realGit = {
			gitRunnerFactory: (cwd: string) => ({
				worktreeAdd: async (target: string, branch: string) => {
					runIn.push(cwd);
					execFileSync("git", ["-C", cwd, "worktree", "add", "-q", "-b", branch, target]);
				},
			}),
		} as unknown as AdapterDeps;
		const homeBefore = process.env.HOME;
		process.env.HOME = home;
		const result = await new RegistryFilesystemMounter(realGit).mount({
			filesystem: filesystem({
				kind: "code",
				source: "local",
				resourceRef: { kind: "code", repo: "~/repo", branch: "main" },
			}),
			sandboxPath: path.join(home, "sandbox"),
		});
		process.env.HOME = homeBefore;
		fs.rmSync(home, { recursive: true, force: true });

		expect(result).toEqual({ success: true });
		expect(runIn).toEqual([repo]);
	});

	it("links a doc folder written as ~/notes", async () => {
		const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mount-home-")));
		fs.mkdirSync(path.join(home, "notes"));
		const sandbox = path.join(home, "sandbox");
		fs.mkdirSync(sandbox);
		const homeBefore = process.env.HOME;
		process.env.HOME = home;
		const result = await new RegistryFilesystemMounter(deps).mount({
			filesystem: filesystem({
				source: "local",
				resourceRef: { kind: "doc_set", folder: "~/notes" },
			}),
			sandboxPath: sandbox,
		});
		process.env.HOME = homeBefore;
		const linked = fs.realpathSync(path.join(sandbox, "notes"));
		fs.rmSync(home, { recursive: true, force: true });

		expect(result).toEqual({ success: true });
		expect(linked).toBe(path.join(home, "notes"));
	});
});

describe("localTrustedPath", () => {
	it("expands a ~/ local repo path to an absolute path rather than the literal spelling", () => {
		const fsRecord = filesystem({
			kind: "code",
			resourceRef: { kind: "code", repo: "~/au20-nonexistent-repo", branch: "main" },
		});
		const result = localTrustedPath(fsRecord);
		expect(result).not.toMatch(/^~/);
		expect(result).toBe(path.join(os.homedir(), "au20-nonexistent-repo"));
	});

	it("resolves a relative ./ local repo path against the process cwd, not verbatim", () => {
		const fsRecord = filesystem({
			kind: "code",
			resourceRef: { kind: "code", repo: "./au20-nonexistent-repo", branch: "main" },
		});
		const result = localTrustedPath(fsRecord);
		expect(result).toBe(path.resolve("./au20-nonexistent-repo"));
	});

	it("converts a file:// local repo URL to a plain filesystem path", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "au20-fileurl-"));
		const fsRecord = filesystem({
			kind: "code",
			resourceRef: { kind: "code", repo: `file://${root}`, branch: "main" },
		});
		const result = localTrustedPath(fsRecord);
		expect(result).toBe(fs.realpathSync(root));
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("resolves an absolute local repo path through symlinks to its canonical real path", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "au20-symlink-"));
		const real = path.join(root, "real");
		fs.mkdirSync(real);
		const link = path.join(root, "link");
		fs.symlinkSync(real, link);
		const fsRecord = filesystem({
			kind: "code",
			resourceRef: { kind: "code", repo: link, branch: "main" },
		});
		const result = localTrustedPath(fsRecord);
		expect(result).toBe(fs.realpathSync(real));
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("resolves a relative ./ doc_set folder against the process cwd, not verbatim, same as code", () => {
		const fsRecord = filesystem({
			kind: "doc_set",
			resourceRef: { kind: "doc_set", folder: "./au20-nonexistent-docs" },
		});
		const result = localTrustedPath(fsRecord);
		expect(result).toBe(path.resolve("./au20-nonexistent-docs"));
	});
});

describe("ensureSandboxGitRepo", () => {
	it("initializes a bare sandbox that has no mounted code filesystem as a git repository", () => {
		const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "au20-ensure-git-"));
		try {
			expect(fs.existsSync(path.join(sandbox, ".git"))).toBe(false);
			ensureSandboxGitRepo(sandbox);
			expect(fs.existsSync(path.join(sandbox, ".git"))).toBe(true);
			// no commits required — codex's own precondition is satisfied by a bare repo.
			const isWorkTree = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
				cwd: sandbox,
			})
				.toString()
				.trim();
			expect(isWorkTree).toBe("true");
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});

	it("is a no-op when the sandbox is already a git repo (a mounted code filesystem got there first)", () => {
		const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "au20-ensure-git-noop-"));
		try {
			execFileSync("git", ["init", "--quiet"], { cwd: sandbox });
			execFileSync("git", ["commit", "--allow-empty", "-m", "existing"], {
				cwd: sandbox,
				// CI runners carry no global git identity — set author AND
				// committer explicitly (--author alone leaves committer unset).
				env: {
					...process.env,
					GIT_AUTHOR_NAME: "test",
					GIT_AUTHOR_EMAIL: "test@test.com",
					GIT_COMMITTER_NAME: "test",
					GIT_COMMITTER_EMAIL: "test@test.com",
				},
			});
			const before = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sandbox }).toString();
			ensureSandboxGitRepo(sandbox);
			const after = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sandbox }).toString();
			// Re-running git init on an existing repo is itself harmless, but the
			// guard must not even attempt it — confirmed by the same HEAD surviving.
			expect(after).toBe(before);
		} finally {
			fs.rmSync(sandbox, { recursive: true, force: true });
		}
	});

	it("called after a code filesystem mount is a no-op, never fighting the real worktree", async () => {
		// The regression this ordering exists to prevent: `git clone` / `git
		// worktree add` both refuse a target directory that already has a `.git`
		// (verified against the real binary). Calling ensureSandboxGitRepo BEFORE
		// the mount would break every session with a mounted code filesystem —
		// this proves the AFTER ordering leaves an already-mounted repo alone.
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "au20-order-"));
		const sandbox = path.join(root, "sandbox");
		try {
			const mountingDeps: AdapterDeps = {
				gitRunnerFactory: () => ({
					worktreeAdd: async () => {
						fs.mkdirSync(sandbox, { recursive: true });
						// mirrors what a real `git worktree add` leaves behind: a `.git`
						// file. Deliberately not a `gitdir:` pointer — that path
						// resolves against a real common gitdir the mounter reads back
						// (covered by the "malicious worktree gitdir pointer" test
						// above); this test is only about ensureSandboxGitRepo seeing
						// the file and leaving it alone.
						fs.writeFileSync(path.join(sandbox, ".git"), "not-a-gitdir-pointer\n");
					},
				}),
			} as unknown as AdapterDeps;

			const result = await new RegistryFilesystemMounter(mountingDeps).mount({
				filesystem: filesystem({
					kind: "code",
					source: "local",
					resourceRef: { kind: "code", repo: "/some/repo", branch: "main" },
				}),
				sandboxPath: sandbox,
			});
			expect(result.success).toBe(true);
			const gitEntryAfterMount = fs.readFileSync(path.join(sandbox, ".git"), "utf-8");

			// Mounting already made it a git repo — ensureSandboxGitRepo, called
			// afterwards, must be a no-op rather than overwriting the real worktree pointer.
			ensureSandboxGitRepo(sandbox);
			expect(fs.readFileSync(path.join(sandbox, ".git"), "utf-8")).toBe(gitEntryAfterMount);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
